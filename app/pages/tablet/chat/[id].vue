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

// ── Auto-scroll to bottom on new messages ─────────────────────────────────
const scroller = ref<HTMLElement | null>(null);
function scrollDown() {
  nextTick(() => {
    const el = scroller.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
}
watch(messages, () => scrollDown(), { flush: "post" });
onMounted(() => scrollDown());

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
    scrollDown();
  } finally {
    sending.value = false;
  }
}
function onKey(e: KeyboardEvent) {
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
  <div class="max-w-2xl mx-auto flex flex-col" style="min-height: calc(100vh - 4rem - 6rem);">
    <div class="px-5 pt-4 pb-2">
      <h1 class="text-lg font-bold truncate">{{ title }}</h1>
    </div>

    <!-- Messages -->
    <div
      ref="scroller"
      class="flex-1 overflow-y-auto px-4 py-3 space-y-2"
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

    <!-- Composer (sticks above bottom nav) -->
    <div class="sticky bottom-24 px-3 py-2 bg-card border-t" style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem);">
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
