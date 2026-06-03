<script setup lang="ts">
/**
 * /tablet/chat/[id] — 대화방.
 *
 * - 폴링은 useChat 의 글로벌 싱글톤이 4초마다 since-cursor 로 증분 로드.
 * - GET /chat/conversations/:id/messages 가 서버측에서 자동 읽음 처리해 주므로
 *   별도 read API 호출 없음.
 * - Enter 로 전송, Shift+Enter 줄바꿈.
 */
import { Loader2, Send, MessageSquare } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "채팅 · 케어닥" });

const route  = useRoute();
const router = useRouter();
const chat   = useChat();
const { me } = useTablet();
const toast  = useToast();

const convId = computed(() => String(route.params.id ?? ""));
const messages = computed(() => chat.messagesByConv.value[convId.value] ?? []);
const conv = computed(() =>
  chat.conversations.value.find(c => c.id === convId.value) ?? null,
);
const title = computed(() => (conv.value ? chat.convTitle(conv.value) : "대화"));

// Mark this conversation as the polling target while mounted; clear on unmount.
onMounted(() => {
  chat.startPolling();
  chat.setOpenConversation(convId.value);
});
onBeforeUnmount(() => {
  chat.setOpenConversation(null);
});
watch(convId, (id) => chat.setOpenConversation(id));

// ── Smart auto-scroll ─────────────────────────────────────────────────────
// 카카오톡식 동작:
//   1. 내가 보낸 메시지 → 항상 바닥으로.
//   2. 상대 메시지가 들어왔을 때 내가 이미 바닥 근처면 → 따라 내려감.
//   3. 위로 스크롤해서 과거 메시지를 읽고 있으면 → 점프하지 않음
//      (대신 "새 메시지" 알림 점이 떠야 이상적이지만 일단 안 잡아끄는 것만).
const scroller = ref<HTMLElement | null>(null);
const STICK_THRESHOLD_PX = 60;
const stickToBottom = ref(true);

function isAtBottom(): boolean {
  const el = scroller.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
}

function onScroll() {
  stickToBottom.value = isAtBottom();
}

function scrollDown(force = false) {
  nextTick(() => {
    const el = scroller.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (force) stickToBottom.value = true;
  });
}

watch(messages, (next, prev) => {
  const last  = next?.[next.length - 1];
  const lastP = prev?.[prev.length - 1];
  // 메시지 배열이 아예 새로 로드된 경우(대화 전환 등) → 첫 진입처럼 무조건 내려감.
  if (!prev || prev.length === 0) { scrollDown(true); return; }
  if (!last || last.id === lastP?.id) return; // 새 메시지 없음
  // 내가 보낸 메시지면 항상 끝까지. 그 외엔 stick 상태일 때만.
  if (last.sender_id === me.value?.id || stickToBottom.value) {
    scrollDown(true);
  }
}, { flush: "post" });

onMounted(() => scrollDown(true));

// ── Composer ──────────────────────────────────────────────────────────────
const draft = ref("");
const sending = ref(false);
async function onSend() {
  const body = draft.value.trim();
  if (!body || sending.value) return;
  sending.value = true;
  try {
    const row = await chat.sendMessage(convId.value, body);
    if (!row) {
      toast.error("전송 실패", "오류");
      return;
    }
    draft.value = "";
    scrollDown(true);
  } finally {
    sending.value = false;
  }
}
function onKey(e: KeyboardEvent) {
  // Korean IME bug: pressing Enter while a syllable is still being composed
  // ("오이" was being submitted as "오" because the second jamo was still in
  // the composer) fires keydown with the composition active. `isComposing`
  // covers Chrome/FF; `keyCode === 229` covers Safari's pre-spec behaviour.
  if (e.isComposing || (e as any).keyCode === 229) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void onSend();
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isMine(senderId: string) {
  return senderId === me.value?.id;
}
</script>

<template>
  <!-- height (not min-height) so the inner flex column has a bounded canvas;
       the messages list then actually overflows and gets its own scrollbar.
       4rem = top header, 5rem = bottom nav (matches the layout's pb-24). -->
  <div class="max-w-2xl mx-auto flex flex-col" style="height: calc(100dvh - 4rem - 5rem);">
    <div class="px-5 pt-4 pb-2 shrink-0">
      <h1 class="text-lg font-bold truncate">{{ title }}</h1>
    </div>

    <!-- Messages -->
    <div
      ref="scroller"
      class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2"
      @scroll.passive="onScroll"
    >
      <div
        v-if="messages.length === 0"
        class="py-16 text-center text-sm text-muted-foreground"
      >
        <MessageSquare class="h-6 w-6 mx-auto mb-2 opacity-50" />
        첫 메시지를 보내보세요.
      </div>
      <template v-for="m in messages" :key="m.id">
        <div
          class="flex gap-2"
          :class="isMine(m.sender_id) ? 'justify-end' : 'justify-start'"
        >
          <div
            v-if="!isMine(m.sender_id)"
            class="h-8 w-8 mt-4 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center text-xs font-semibold shrink-0"
          >
            {{ m.sender_name.slice(0, 1) }}
          </div>
          <div class="max-w-[78%] flex flex-col" :class="isMine(m.sender_id) ? 'items-end' : 'items-start'">
            <div v-if="!isMine(m.sender_id)" class="text-[10px] text-muted-foreground mb-0.5 px-2">
              {{ m.sender_name }}
            </div>
            <div
              class="px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
              :class="isMine(m.sender_id)
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'"
            >{{ m.body }}</div>
            <div class="text-[10px] text-muted-foreground mt-0.5 px-2">{{ fmtTime(m.sent_at) }}</div>
          </div>
        </div>
      </template>
    </div>

    <!-- Composer — bottom of the flex column. Doesn't need sticky because the
         parent has a fixed height and the messages div takes the rest. -->
    <div class="shrink-0 px-3 py-2 bg-card border-t">

      <div class="flex items-end gap-2 max-w-2xl mx-auto">
        <textarea
          v-model="draft"
          rows="1"
          placeholder="메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)"
          class="flex-1 min-h-[44px] max-h-32 px-3 py-2.5 rounded-xl border border-input bg-background text-base resize-none focus:outline-none focus:border-primary"
          :disabled="sending"
          @keydown="onKey"
        />
        <button
          type="button"
          class="h-11 w-11 rounded-xl bg-primary text-primary-foreground inline-flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 shrink-0"
          :disabled="sending || !draft.trim()"
          @click="onSend"
          aria-label="전송"
        >
          <Loader2 v-if="sending" class="h-5 w-5 animate-spin" />
          <Send v-else class="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
</template>
