<script setup lang="ts">
/**
 * /tablet/chat — 대화 목록 + 새 채팅 시작.
 *
 * - 4초마다 폴링 (useChat 가 관리, 글로벌 싱글톤).
 * - 폴링마다 들어온 초대를 조용히 자동 수락 — 데스크톱(행정)이 시작한
 *   대화가 별도 액션 없이 그냥 나타나도록.
 * - 새 채팅: 같은 지점 안 행정/접수(office_manager·branch_manager)와
 *   1:1 대화 시작 → 그 즉시 thread 화면으로 이동.
 *
 * 제목은 conv.title || conv.other_names || '대화' 순으로 표시.
 */
import { Loader2, MessageSquare, Plus, X, Search, Trash2 } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "채팅 · 케어닥" });

const router = useRouter();
const api    = useTabletApi();
const toast  = useToast();
const { me } = useTablet();

const chat = useChat();
const { conversations, convTitle } = chat;
onMounted(() => chat.startPolling());

// ── New conversation picker ───────────────────────────────────────────────
const picking = ref(false);
const query   = ref("");

interface StaffRow {
  id: string; full_name: string; role: string;
  team_id: string | null; team_name: string | null;
  branch_id: string | null;
}
const staffLoading = ref(false);
const staff = ref<StaffRow[]>([]);

// Position-based filter mirrors the desktop UX: caregivers chat with admins.
// In schema terms we don't ship `position` on /v1/staff, but `role` carries
// the broad category — branch_manager (센터장) and hq (행정) are the targets.
const ADMIN_ROLES = ["hq", "branch_manager", "office_manager"];
async function openPicker() {
  picking.value = true;
  query.value = "";
  if (staff.value.length) return;
  staffLoading.value = true;
  try {
    const rows = await api.get<StaffRow[]>("/v1/staff");
    // Same branch as me, an admin role, and not myself.
    staff.value = rows.filter(s =>
      s.id !== me.value?.id
      && (!me.value?.branch_id || !s.branch_id || s.branch_id === me.value.branch_id || s.branch_id === null)
      && ADMIN_ROLES.includes(s.role),
    );
  } catch {
    toast.error("직원 목록 조회 실패", "오류");
  } finally {
    staffLoading.value = false;
  }
}

const filteredStaff = computed(() => {
  const q = query.value.trim();
  if (!q) return staff.value;
  return staff.value.filter(s => s.full_name.includes(q));
});

const startingId = ref<string | null>(null);
async function startWith(s: StaffRow) {
  if (startingId.value) return;
  startingId.value = s.id;
  try {
    const conv = await chat.startConversation(s.id);
    if (!conv) {
      toast.error("대화 시작 실패", "오류");
      return;
    }
    picking.value = false;
    router.push(`/tablet/chat/${conv.id}`);
  } finally {
    startingId.value = null;
  }
}

// ── Delete from list ──────────────────────────────────────────────────────
const deletingId = ref<string | null>(null);
async function removeConv(id: string) {
  if (deletingId.value) return;
  if (!confirm("이 대화를 삭제하시겠습니까? 메시지가 모두 사라집니다.")) return;
  deletingId.value = id;
  try { await chat.deleteConversation(id); }
  finally { deletingId.value = null; }
}

// ── Display helpers ───────────────────────────────────────────────────────
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
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">채팅</h1>
      <button
        type="button"
        class="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
        @click="openPicker"
      >
        <Plus class="h-4 w-4" />
        새 채팅
      </button>
    </div>

    <!-- Picker overlay -->
    <div
      v-if="picking"
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="picking = false"
    >
      <div class="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border shadow-xl max-h-[80vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between">
          <h2 class="text-base font-semibold">대화 상대 선택 (행정/센터장)</h2>
          <button class="h-9 w-9 rounded-md hover:bg-muted inline-flex items-center justify-center" @click="picking = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="p-3 border-b">
          <div class="relative">
            <Search class="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="query" type="search" placeholder="이름 검색"
              class="w-full h-11 pl-9 pr-3 rounded-lg border border-input bg-background text-base"
            />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div v-if="staffLoading" class="py-10 text-center text-sm text-muted-foreground">
            <Loader2 class="h-5 w-5 animate-spin inline" />
          </div>
          <ul v-else-if="filteredStaff.length" class="divide-y">
            <li v-for="s in filteredStaff" :key="s.id">
              <button
                type="button"
                class="w-full text-left px-4 py-3 hover:bg-muted/30 flex items-center gap-3 disabled:opacity-60"
                :disabled="startingId === s.id"
                @click="startWith(s)"
              >
                <div class="h-10 w-10 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center font-semibold">
                  {{ s.full_name.slice(0, 1) }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold">{{ s.full_name }}</div>
                  <div class="text-[11px] text-muted-foreground">
                    {{ roleLabel(s.role) }}<span v-if="s.team_name"> · {{ s.team_name }}</span>
                  </div>
                </div>
                <Loader2 v-if="startingId === s.id" class="h-4 w-4 animate-spin" />
              </button>
            </li>
          </ul>
          <div v-else class="py-12 text-center text-sm text-muted-foreground">
            결과가 없습니다.
          </div>
        </div>
      </div>
    </div>

    <!-- Conversation list -->
    <div v-if="conversations.length === 0" class="rounded-2xl border bg-card py-16 text-center text-sm text-muted-foreground">
      <MessageSquare class="h-6 w-6 mx-auto mb-2 opacity-50" />
      대화가 없습니다. 우측 상단의 <span class="font-medium">새 채팅</span> 으로 시작하세요.
    </div>
    <ul v-else class="space-y-2">
      <li
        v-for="c in conversations" :key="c.id"
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
  </div>
</template>
