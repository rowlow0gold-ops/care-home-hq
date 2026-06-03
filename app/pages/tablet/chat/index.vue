<script setup lang="ts">
/**
 * /tablet/chat — 대화 목록 + 검색.
 *
 * 검색 박스 한 곳이 두 가지 역할:
 *   - 이름/메시지로 기존 대화를 필터.
 *   - 같은 검색어로 직원 목록에서 누구든 골라 새 대화 시작.
 *
 * 폴링은 useChat 가 글로벌 싱글톤으로 4초→1초 (대화방 열려 있으면) 사이로
 * 자동 조정. 들어온 초대는 매 폴링마다 조용히 자동 수락.
 */
import { Loader2, MessageSquare, Search, Trash2, UserPlus, Trash } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "채팅 · 케어닥" });

const router = useRouter();
const api    = useTabletApi();
const toast  = useToast();
const { me } = useTablet();

const chat = useChat();
const { conversations, convTitle } = chat;
onMounted(() => chat.startPolling());

// ── 검색 ─────────────────────────────────────────────────────────────────
const query = ref("");
const q = computed(() => query.value.trim());

// 검색어로 기존 대화 필터 (title/other_names/last_body).
const filteredConvs = computed(() => {
  if (!q.value) return conversations.value;
  const lq = q.value.toLowerCase();
  return conversations.value.filter(c => {
    const t = (chat.convTitle(c) || "").toLowerCase();
    const b = (c.last_body || "").toLowerCase();
    return t.includes(lq) || b.includes(lq);
  });
});

// 검색어가 있을 때만 직원 목록 로드 (lazy).
interface ChatContact {
  id: string; full_name: string; role: string; position: string;
  branch_id: string | null; branch_name: string | null;
}
const contactsLoaded = ref(false);
const contactsLoading = ref(false);
const contacts = ref<ChatContact[]>([]);

async function ensureContacts() {
  if (contactsLoaded.value || contactsLoading.value) return;
  contactsLoading.value = true;
  try {
    contacts.value = await api.get<ChatContact[]>("/v1/chat/contacts");
    contactsLoaded.value = true;
  } catch (e: any) {
    toast.error(e?.data?.message ?? "직원 목록 조회 실패", "오류");
  } finally {
    contactsLoading.value = false;
  }
}
// 검색을 시작하면 직원 목록도 함께 준비.
watch(q, (v) => { if (v) ensureContacts(); });

const matchedContacts = computed(() => {
  if (!q.value) return [];
  const lq = q.value.toLowerCase();
  return contacts.value
    .filter(c => c.full_name.toLowerCase().includes(lq))
    .slice(0, 20);
});

// ── 새 대화 시작 ───────────────────────────────────────────────────────────
const startingId = ref<string | null>(null);
async function startWith(c: ChatContact) {
  if (startingId.value) return;
  startingId.value = c.id;
  try {
    const conv = await chat.startConversation(c.id);
    if (!conv) { toast.error("대화 시작 실패", "오류"); return; }
    query.value = "";
    router.push(`/tablet/chat/${conv.id}`);
  } finally {
    startingId.value = null;
  }
}

// ── 단건 / 전체 삭제 ──────────────────────────────────────────────────────
const deletingId = ref<string | null>(null);
async function removeConv(id: string) {
  if (deletingId.value) return;
  if (!confirm("이 대화를 삭제하시겠습니까? 메시지가 모두 사라집니다.")) return;
  deletingId.value = id;
  try { await chat.deleteConversation(id); }
  finally { deletingId.value = null; }
}

const purging = ref(false);
async function deleteAll() {
  if (purging.value) return;
  const n = conversations.value.length;
  if (n === 0) return;
  if (!confirm(`내 대화 ${n}개를 모두 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
  purging.value = true;
  try {
    const ok = await chat.deleteAllConversations();
    toast.success(`${ok}개의 대화를 삭제했습니다.`, "🗑️");
  } catch (e: any) {
    toast.error(e?.data?.message ?? "전체삭제 실패", "오류");
  } finally {
    purging.value = false;
  }
}

// ── 표시 헬퍼 ─────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 60) return "방금 전";
  if (sec < 3600) return `${Math.floor(sec/60)}분 전`;
  if (sec < 86_400) return `${Math.floor(sec/3600)}시간 전`;
  return `${Math.floor(sec/86_400)}일 전`;
}
function roleLabel(r: string): string {
  switch (r) {
    case "hq":              return "본사";
    case "branch_manager":  return "센터장";
    case "office_manager":  return "사무국장";
    case "nurse":           return "간호";
    case "caregiver":       return "요양보호";
    default:                return r;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-5 py-6">
    <div class="flex items-center justify-between gap-3 mb-3">
      <h1 class="text-2xl font-bold">채팅</h1>
      <button
        v-if="conversations.length > 0"
        type="button"
        class="h-10 px-3 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-card text-xs font-semibold text-rose-600 dark:text-rose-300 inline-flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
        :disabled="purging"
        @click="deleteAll"
      >
        <Loader2 v-if="purging" class="h-3.5 w-3.5 animate-spin" />
        <Trash v-else class="h-3.5 w-3.5" />
        전체삭제
      </button>
    </div>

    <!-- Search bar (replaces 새 채팅 button — start typing to filter chats AND
         to pick anyone from the directory for a new chat) -->
    <div class="relative mb-4">
      <Search class="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        v-model="query"
        type="search"
        placeholder="이름이나 메시지 검색 — 결과 없으면 새 대화 시작"
        class="w-full h-12 pl-9 pr-3 rounded-xl border border-input bg-background text-base"
      />
    </div>

    <!-- Conversation list (filtered by query) -->
    <div
      v-if="conversations.length === 0 && !q"
      class="rounded-2xl border bg-card py-16 text-center text-sm text-muted-foreground"
    >
      <MessageSquare class="h-6 w-6 mx-auto mb-2 opacity-50" />
      대화가 없습니다. 위 검색창에 이름을 입력하면 새 대화를 시작할 수 있어요.
    </div>
    <ul v-else-if="filteredConvs.length > 0" class="space-y-2">
      <li
        v-for="c in filteredConvs" :key="c.id"
        class="rounded-xl border bg-card hover:bg-muted/30 transition-colors flex items-center"
      >
        <NuxtLink :to="`/tablet/chat/${c.id}`" class="flex-1 min-w-0 p-4 flex items-center gap-3">
          <div class="h-11 w-11 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center font-semibold shrink-0">
            {{ convTitle(c).slice(0, 1) }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold truncate">{{ convTitle(c) }}</div>
              <div class="text-[10px] text-muted-foreground shrink-0">{{ timeAgo(c.last_message_at) }}</div>
            </div>
            <div class="flex items-center justify-between gap-2 mt-0.5">
              <div class="text-xs text-muted-foreground truncate">
                {{ c.last_body || "메시지 없음" }}
              </div>
              <span
                v-if="c.unread_count > 0"
                class="shrink-0 min-w-[1.25rem] px-1.5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-semibold inline-flex items-center justify-center"
              >
                {{ c.unread_count }}
              </span>
            </div>
          </div>
        </NuxtLink>
        <button
          type="button"
          class="h-11 w-11 mr-2 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 inline-flex items-center justify-center disabled:opacity-50"
          :disabled="deletingId === c.id"
          @click.stop="removeConv(c.id)"
          aria-label="삭제"
        >
          <Loader2 v-if="deletingId === c.id" class="h-4 w-4 animate-spin" />
          <Trash2 v-else class="h-4 w-4" />
        </button>
      </li>
    </ul>
    <div v-else-if="q" class="rounded-xl border border-dashed bg-card py-6 text-center text-xs text-muted-foreground">
      검색 결과에 해당하는 대화가 없습니다. 아래에서 새 대화를 시작해보세요.
    </div>

    <!-- New-chat suggestions (only appears while typing) -->
    <div v-if="q" class="mt-5">
      <div class="text-xs font-semibold text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
        <UserPlus class="h-3.5 w-3.5" />
        새 대화 상대 ({{ matchedContacts.length }})
      </div>
      <div v-if="contactsLoading" class="py-6 text-center text-xs text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin inline" />
      </div>
      <ul v-else-if="matchedContacts.length > 0" class="rounded-xl border bg-card divide-y overflow-hidden">
        <li v-for="s in matchedContacts" :key="s.id">
          <button
            type="button"
            class="w-full text-left px-4 py-3 hover:bg-muted/30 flex items-center gap-3 disabled:opacity-60"
            :disabled="startingId === s.id"
            @click="startWith(s)"
          >
            <div class="h-9 w-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center font-semibold">
              {{ s.full_name.slice(0, 1) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold">{{ s.full_name }}</div>
              <div class="text-[11px] text-muted-foreground">
                {{ roleLabel(s.role) }}<span v-if="s.branch_name"> · {{ s.branch_name }}</span>
              </div>
            </div>
            <Loader2 v-if="startingId === s.id" class="h-4 w-4 animate-spin" />
            <UserPlus v-else class="h-4 w-4 text-muted-foreground" />
          </button>
        </li>
      </ul>
      <div v-else-if="contactsLoaded" class="rounded-xl border border-dashed bg-card py-4 text-center text-xs text-muted-foreground">
        직원 검색 결과 없음.
      </div>
    </div>
  </div>
</template>
