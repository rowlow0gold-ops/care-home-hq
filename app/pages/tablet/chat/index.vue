<script setup lang="ts">
/**
 * /tablet/chat — 2-pane chat that mirrors the Tauri desktop ChatPage:
 *   left  : 대화 + 전체 삭제, 이름 검색(초성 + 점수 정렬), 대화 목록
 *   right : 헤더 + 메시지 스레드 + 입력창
 *
 * 좁은 화면(sm 미만)에서는 자동으로 한쪽씩 보이는 mobile 모드.
 * 대화 ID 는 ?conv=<uuid> 로 URL 에 박혀서 새로고침/딥링크에도 안정.
 */
import { Trash2, Search as SearchIcon, Send, MessageSquare,
         ChevronLeft, Loader2, Trash } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "채팅 · 케어닥" });

const route  = useRoute();
const router = useRouter();
const api    = useTabletApi();
const toast  = useToast();
const { me } = useTablet();

const chat = useChat();
const { conversations, convTitle, messagesByConv, openConvId } = chat;

// ── selected conversation, driven by ?conv= ──────────────────────────────
const activeId = computed(() => (route.query.conv as string | undefined) ?? null);
const active   = computed(() => conversations.value.find(c => c.id === activeId.value) ?? null);
const messages = computed(() => (activeId.value ? messagesByConv.value[activeId.value] ?? [] : []));

watch(activeId, (id) => chat.setOpenConversation(id), { immediate: true });
onMounted(() => chat.startPolling());
onBeforeUnmount(() => chat.setOpenConversation(null));

async function openConv(id: string) {
  await router.push({ path: "/tablet/chat", query: { conv: id } });
}
function closeConv() { router.push({ path: "/tablet/chat" }); }

// ── search & start new conversation ───────────────────────────────────────
const query = ref("");
const q     = computed(() => query.value.trim().toLowerCase());

interface ChatContact { id: string; full_name: string; role: string; position: string; branch_id: string|null; branch_name: string|null }
const people = ref<ChatContact[]>([]);
const peopleLoaded = ref(false);
async function loadPeople() {
  if (peopleLoaded.value) return;
  try { people.value = await api.get<ChatContact[]>("/v1/chat/contacts"); peopleLoaded.value = true; }
  catch (e: any) { toast.error(e?.data?.message ?? "직원 목록 조회 실패", "오류"); }
}

const POS_KO: Record<string,string> = {
  ceo:"대표", coo:"운영총괄", cfo:"재무이사", hr_director:"인사이사", quality_director:"품질이사",
  branch_manager:"시설장", office_manager:"행정", receptionist:"접수", social_worker:"사회복지사",
  nurse_rn:"간호사", nurse_assistant:"간호조무사", dietitian:"영양사",
  physical_therapist:"물리치료사", occupational_therapist:"작업치료사", caregiver:"요양보호사",
  cook:"조리원", cleaner:"환경미화원", driver:"운전기사", doctor_visiting:"촉탁의", it:"IT", other:"기타",
};
function posKo(p: string) { return POS_KO[p] ?? p; }

const peopleResults = computed<ChatContact[]>(() => {
  if (!q.value) return [];
  return people.value
    .filter(p => p.id !== me.value?.id)
    .map(p => ({ p, s: matchScore(p.full_name, posKo(p.position), q.value) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.full_name.localeCompare(b.p.full_name, "ko"))
    .slice(0, 50)
    .map(x => x.p);
});

const startingId = ref<string | null>(null);
async function startChatWith(p: ChatContact) {
  if (startingId.value) return;
  startingId.value = p.id;
  try {
    const conv = await chat.startConversation(p.id);
    if (!conv) { toast.error("대화 시작 실패", "오류"); return; }
    query.value = "";
    await openConv(conv.id);
  } finally { startingId.value = null; }
}

// ── delete single / all ───────────────────────────────────────────────────
const deletingId = ref<string | null>(null);
async function removeConv(id: string) {
  if (deletingId.value) return;
  if (!confirm("이 대화를 삭제하시겠습니까? 메시지가 모두 사라집니다.")) return;
  deletingId.value = id;
  try {
    await chat.deleteConversation(id);
    if (activeId.value === id) closeConv();
  } finally { deletingId.value = null; }
}
const purging = ref(false);
async function deleteAll() {
  if (purging.value) return;
  const n = conversations.value.length;
  if (n === 0) return;
  if (!confirm(`내 대화 ${n}개를 모두 삭제하시겠습니까?`)) return;
  purging.value = true;
  try {
    const ok = await chat.deleteAllConversations();
    closeConv();
    toast.success(`${ok}개 삭제됨`, "🗑️");
  } finally { purging.value = false; }
}

// ── thread composer ───────────────────────────────────────────────────────
const draft     = ref("");
const sending   = ref(false);
const composer  = ref<HTMLTextAreaElement | null>(null);
const scroller  = ref<HTMLElement | null>(null);

const STICK_THRESHOLD_PX = 60;
const stickToBottom = ref(true);
function isAtBottom(): boolean {
  const el = scroller.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
}
function onScroll() { stickToBottom.value = isAtBottom(); newBelow.value = stickToBottom.value ? false : newBelow.value; }
function scrollDown(force = false) {
  nextTick(() => { const el = scroller.value; if (!el) return; el.scrollTop = el.scrollHeight; if (force) stickToBottom.value = true; });
}
const newBelow = ref(false);
function scrollToNew() { scrollDown(true); newBelow.value = false; }

watch(messages, (next, prev) => {
  const last  = next?.[next.length - 1];
  const lastP = prev?.[prev.length - 1];
  if (!prev || prev.length === 0) { scrollDown(true); return; }
  if (!last || last.id === lastP?.id) return;
  if (last.sender_id === me.value?.id || stickToBottom.value) scrollDown(true);
  else newBelow.value = true;
}, { flush: "post" });

watch(activeId, async (id) => {
  if (!id) return;
  await nextTick();
  scrollDown(true);
  composer.value?.focus();
});

async function send() {
  const body = draft.value.trim();
  if (!body || !activeId.value || sending.value) return;
  sending.value = true;
  try {
    const row = await chat.sendMessage(activeId.value, body);
    if (!row) { toast.error("전송 실패", "오류"); return; }
    draft.value = "";
    scrollDown(true);
  } finally {
    sending.value = false;
    await nextTick();
    composer.value?.focus();
  }
}
function onKey(e: KeyboardEvent) {
  if (e.isComposing || (e as any).keyCode === 229) return; // Korean IME
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
}

// ── display helpers ───────────────────────────────────────────────────────
function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
function isMine(senderId: string) { return senderId === me.value?.id; }
</script>

<template>
  <div class="chat-shell">
    <!-- ── Sidebar ────────────────────────────────────────────────── -->
    <aside class="chat-sidebar" :class="{ 'mobile-hidden': activeId }">
      <div class="px-4 pt-4 pb-2 flex items-center gap-2">
        <h1 class="text-xl font-bold flex-1">대화</h1>
        <button
          v-if="conversations.length > 0"
          type="button"
          class="h-9 px-2.5 rounded-md text-xs font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 inline-flex items-center gap-1 disabled:opacity-50"
          :disabled="purging"
          @click="deleteAll"
        >
          <Loader2 v-if="purging" class="h-3.5 w-3.5 animate-spin" />
          <Trash v-else class="h-3.5 w-3.5" />
          전체 삭제
        </button>
      </div>

      <div class="px-3 pb-2">
        <div class="relative">
          <SearchIcon class="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="query"
            type="search"
            placeholder="이름으로 검색해 대화 시작"
            class="w-full h-11 pl-9 pr-3 rounded-lg border border-input bg-background text-base"
            @focus="loadPeople"
          />
        </div>
      </div>

      <div class="chat-sidebar-list">
        <!-- search → people picker -->
        <ul v-if="query.trim()" class="divide-y">
          <li v-for="p in peopleResults" :key="p.id">
            <button
              type="button"
              class="w-full text-left px-3 py-2.5 hover:bg-muted/30 flex items-center gap-3 disabled:opacity-60"
              :disabled="startingId === p.id"
              @click="startChatWith(p)"
            >
              <div class="h-9 w-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center font-semibold shrink-0">
                {{ p.full_name.slice(0, 1) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold truncate">{{ p.full_name }}</div>
                <div class="text-[11px] text-muted-foreground truncate">
                  {{ posKo(p.position) }}<span v-if="p.branch_name"> · {{ p.branch_name }}</span>
                </div>
              </div>
              <Loader2 v-if="startingId === p.id" class="h-4 w-4 animate-spin" />
            </button>
          </li>
          <li v-if="peopleResults.length === 0" class="px-3 py-6 text-center text-xs text-muted-foreground">검색 결과 없음</li>
        </ul>

        <!-- normal: conversation list -->
        <ul v-else class="divide-y">
          <li
            v-for="c in conversations" :key="c.id"
            class="flex items-stretch"
            :class="activeId === c.id ? 'bg-primary/5' : 'hover:bg-muted/30'"
          >
            <button
              type="button"
              class="flex-1 min-w-0 text-left p-3 flex items-center gap-3"
              @click="openConv(c.id)"
            >
              <div class="h-10 w-10 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center font-semibold shrink-0">
                {{ convTitle(c).slice(0, 1) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-sm font-semibold truncate">{{ convTitle(c) }}</div>
                  <div class="text-[10px] text-muted-foreground shrink-0">{{ fmtTime(c.last_message_at) }}</div>
                </div>
                <div class="flex items-center justify-between gap-2 mt-0.5">
                  <div class="text-xs text-muted-foreground truncate">{{ c.last_body || "메시지 없음" }}</div>
                  <span v-if="c.unread_count > 0"
                        class="shrink-0 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold inline-flex items-center justify-center">
                    {{ c.unread_count > 99 ? "99+" : c.unread_count }}
                  </span>
                </div>
              </div>
            </button>
            <button
              type="button"
              class="w-10 mr-1 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-300 inline-flex items-center justify-center disabled:opacity-50"
              :disabled="deletingId === c.id"
              @click.stop="removeConv(c.id)"
              aria-label="삭제"
            >
              <Loader2 v-if="deletingId === c.id" class="h-4 w-4 animate-spin" />
              <Trash2 v-else class="h-4 w-4" />
            </button>
          </li>
          <li v-if="conversations.length === 0" class="px-3 py-10 text-center text-xs text-muted-foreground">
            <MessageSquare class="h-5 w-5 mx-auto mb-1 opacity-50" />
            대화가 없습니다.
          </li>
        </ul>
      </div>
    </aside>

    <!-- ── Thread ─────────────────────────────────────────────────── -->
    <section class="chat-thread" :class="{ 'mobile-hidden': !activeId }">
      <template v-if="active">
        <header class="px-4 py-3 border-b bg-card flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="sm:hidden h-9 w-9 -ml-1 rounded-md hover:bg-muted inline-flex items-center justify-center"
            @click="closeConv"
            aria-label="목록으로"
          >
            <ChevronLeft class="h-5 w-5" />
          </button>
          <div class="flex-1 min-w-0">
            <div class="text-base font-bold truncate">{{ convTitle(active) }}</div>
            <div v-if="active.other_names" class="text-xs text-muted-foreground truncate">{{ active.other_names }}</div>
          </div>
        </header>

        <div ref="scroller" class="flex-1 min-h-0 overflow-y-auto px-4 py-3 bg-muted/20 relative" @scroll.passive="onScroll">
          <div v-if="messages.length === 0" class="py-16 text-center text-sm text-muted-foreground">
            <MessageSquare class="h-6 w-6 mx-auto mb-2 opacity-50" />
            첫 메시지를 보내보세요.
          </div>
          <template v-for="m in messages" :key="m.id">
            <div class="flex gap-2 mb-2" :class="isMine(m.sender_id) ? 'justify-end' : 'justify-start'">
              <div v-if="!isMine(m.sender_id)" class="h-8 w-8 mt-4 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center text-xs font-semibold shrink-0">
                {{ m.sender_name.slice(0, 1) }}
              </div>
              <div class="max-w-[78%] flex flex-col" :class="isMine(m.sender_id) ? 'items-end' : 'items-start'">
                <div v-if="!isMine(m.sender_id)" class="text-[10px] text-muted-foreground mb-0.5 px-2">{{ m.sender_name }}</div>
                <div class="px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
                     :class="isMine(m.sender_id) ? 'bg-primary text-primary-foreground rounded-br-sm'
                                                : 'bg-card border text-foreground rounded-bl-sm'">{{ m.body }}</div>
                <div class="text-[10px] text-muted-foreground mt-0.5 px-2">{{ fmtTime(m.sent_at) }}</div>
              </div>
            </div>
          </template>

          <button
            v-if="newBelow"
            type="button"
            class="absolute left-1/2 -translate-x-1/2 bottom-3 h-9 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg inline-flex items-center gap-1.5 hover:bg-primary/90"
            @click="scrollToNew"
          >
            ↓ 새 메시지
          </button>
        </div>

        <div class="shrink-0 px-3 py-2 bg-card border-t">
          <div class="flex items-end gap-2">
            <textarea
              ref="composer"
              v-model="draft"
              rows="1"
              placeholder="메시지를 입력하세요"
              class="flex-1 min-h-[44px] max-h-32 px-3 py-2.5 rounded-xl border border-input bg-background text-base resize-none focus:outline-none focus:border-primary"
              :disabled="sending"
              @keydown="onKey"
            />
            <button
              type="button"
              class="h-11 w-11 rounded-xl bg-primary text-primary-foreground inline-flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 shrink-0"
              :disabled="sending || !draft.trim()"
              @click="send"
              aria-label="전송"
            >
              <Loader2 v-if="sending" class="h-5 w-5 animate-spin" />
              <Send v-else class="h-5 w-5" />
            </button>
          </div>
        </div>
      </template>
      <div v-else class="hidden sm:flex h-full items-center justify-center flex-col gap-2 text-muted-foreground">
        <MessageSquare class="h-12 w-12 opacity-30" />
        <div class="text-sm">왼쪽에서 대화를 고르거나, 이름으로 검색해 새 대화를 시작하세요.</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Take the full tablet content area: viewport - top header (4rem) - bottom nav (5rem). */
.chat-shell {
  display: flex;
  height: calc(100dvh - 4rem - 5rem);
  width: 100%;
  max-width: 80rem;
  margin-left: auto;
  margin-right: auto;
  background: hsl(var(--background));
}
.chat-sidebar {
  width: 340px;
  border-right: 1px solid hsl(var(--border));
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.chat-sidebar-list {
  flex: 1;
  overflow-y: auto;
}
.chat-thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
@media (max-width: 639px) {
  .chat-sidebar { width: 100%; border-right: 0; }
  .mobile-hidden { display: none; }
}
</style>
