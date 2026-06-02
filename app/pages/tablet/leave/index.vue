<script setup lang="ts">
/**
 * /tablet/leave — 휴가신청 / 잔여 연차.
 *
 * Top: balance summary + 새 휴가 신청 button (opens inline composer).
 * Below: my requests list with status pill (대기/승인/반려/취소).
 * Pending requests can be cancelled by the requester (DELETE).
 */
import { Loader2, Plus, CheckCircle2, X, Calendar, Trash2, MessageSquare } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "휴가 신청 · 케어닥" });

const api    = useTabletApi();
const toast  = useToast();
const router = useRouter();
const chat   = useChat();

interface Balance { annual_total: number; annual_used: number; annual_remaining: number; monthly_remaining?: number }
const { data: balance } = await useAsyncData("tablet-leave-bal", () =>
  api.get<Balance>("/v1/leave-requests/balance").catch(() => null),
);

interface LeaveRow {
  id: string; user_id: string; user_name: string;
  leave_type: string; start_date: string; end_date: string; days: number;
  reason: string | null; status: string;
  requested_at: string; decided_at: string | null;
  decided_by: string | null;
  decided_by_name: string | null; decision_note: string | null;
}
const { data: rows, refresh } = await useAsyncData("tablet-leave-list", () =>
  api.get<LeaveRow[]>("/v1/leave-requests"),
);

// Composer
const composing  = ref(false);
const newType    = ref("annual");
const newStart   = ref<string>(new Date().toISOString().slice(0, 10));
const newEnd     = ref<string>(new Date().toISOString().slice(0, 10));
const newReason  = ref("");
const submitting = ref(false);

const types = [
  { id: "annual",    label: "연차" },
  { id: "monthly",   label: "월차" },
  { id: "sick",      label: "병가" },
  { id: "personal",  label: "개인" },
  { id: "public",    label: "경조" },
];

const computedDays = computed(() => {
  if (!newStart.value || !newEnd.value) return 0;
  const s = new Date(newStart.value); const e = new Date(newEnd.value);
  const d = Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return d > 0 ? d : 0;
});

async function submit() {
  if (submitting.value) return;
  if (computedDays.value <= 0) { toast.error("날짜를 확인해주세요", "오류"); return; }
  submitting.value = true;
  try {
    await api.post("/v1/leave-requests", {
      leave_type: newType.value,
      start_date: newStart.value,
      end_date:   newEnd.value,
      days:       computedDays.value,
      reason:     newReason.value.trim() || undefined,
    });
    toast.success("휴가 신청 등록됨", "📅");
    composing.value = false;
    newReason.value = "";
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "신청 실패", "오류");
  } finally {
    submitting.value = false;
  }
}

const cancellingId = ref<string | null>(null);
async function cancelOne(r: LeaveRow) {
  if (cancellingId.value) return;
  if (!confirm("이 휴가 신청을 취소하시겠습니까?")) return;
  cancellingId.value = r.id;
  try {
    await api.delete(`/v1/leave-requests/${r.id}`);
    toast.success("취소됨", "🗑️");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "취소 실패", "오류");
  } finally {
    cancellingId.value = null;
  }
}

// 반려된 휴가의 결정자와 대화 시작 (또는 기존 대화로 이동).
const chatStartingId = ref<string | null>(null);
async function chatWithDecider(r: LeaveRow) {
  if (!r.decided_by) {
    toast.error("결정자 정보가 없습니다", "오류");
    return;
  }
  if (chatStartingId.value) return;
  chatStartingId.value = r.id;
  try {
    const conv = await chat.startConversation(r.decided_by);
    if (!conv) {
      toast.error("대화 시작 실패", "오류");
      return;
    }
    router.push(`/tablet/chat/${conv.id}`);
  } finally {
    chatStartingId.value = null;
  }
}

function statusPill(s: string) {
  switch (s) {
    case "approved":  return { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200", txt: "승인" };
    case "rejected":  return { cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",             txt: "반려" };
    case "cancelled": return { cls: "bg-muted text-muted-foreground",                                                txt: "취소" };
    default:          return { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",          txt: "대기" };
  }
}
function typeLabel(t: string) { return types.find(x => x.id === t)?.label ?? t; }
</script>

<template>
  <div class="max-w-2xl mx-auto px-5 py-6">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">휴가 신청</h1>
      <button
        v-if="!composing"
        type="button"
        class="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
        @click="composing = true"
      >
        <Plus class="h-4 w-4" />
        새 신청
      </button>
    </div>

    <!-- Balance -->
    <div v-if="balance" class="rounded-2xl border bg-card p-4 mb-4 grid grid-cols-3 gap-2 text-center">
      <div>
        <div class="text-xs text-muted-foreground">연차 총합</div>
        <div class="text-xl font-bold tabular-nums">{{ balance.annual_total ?? 0 }}일</div>
      </div>
      <div>
        <div class="text-xs text-muted-foreground">사용</div>
        <div class="text-xl font-bold tabular-nums">{{ balance.annual_used ?? 0 }}일</div>
      </div>
      <div>
        <div class="text-xs text-muted-foreground">잔여</div>
        <div class="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-200">{{ balance.annual_remaining ?? 0 }}일</div>
      </div>
    </div>

    <!-- Composer -->
    <div v-if="composing" class="rounded-2xl border bg-card p-4 mb-4 space-y-3">
      <div>
        <label class="text-sm font-semibold block mb-1.5">휴가 종류</label>
        <select v-model="newType" class="w-full h-12 px-3 rounded-lg border border-input bg-background text-base">
          <option v-for="t in types" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-sm font-semibold block mb-1.5">시작일</label>
          <input v-model="newStart" type="date" class="w-full h-12 px-3 rounded-lg border border-input bg-background text-base" />
        </div>
        <div>
          <label class="text-sm font-semibold block mb-1.5">종료일</label>
          <input v-model="newEnd" type="date" class="w-full h-12 px-3 rounded-lg border border-input bg-background text-base" />
        </div>
      </div>
      <p class="text-xs text-muted-foreground">총 {{ computedDays }}일</p>
      <textarea
        v-model="newReason"
        rows="3"
        class="w-full px-3 py-2 rounded-lg border border-input bg-background text-base focus:outline-none focus:border-primary"
        placeholder="사유 (선택)"
        :disabled="submitting"
      />
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 h-12 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted"
          :disabled="submitting"
          @click="composing = false"
        >취소</button>
        <button
          type="button"
          class="flex-1 h-12 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
          :disabled="submitting || computedDays <= 0"
          @click="submit"
        >
          <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" />
          <CheckCircle2 v-else class="h-4 w-4" />
          신청
        </button>
      </div>
    </div>

    <!-- List -->
    <div v-if="(rows?.length ?? 0) === 0" class="py-16 text-center text-sm text-muted-foreground">
      신청 내역이 없습니다.
    </div>
    <ul v-else class="space-y-3">
      <li v-for="r in rows!" :key="r.id" class="rounded-xl border bg-card p-4">
        <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="h-8 w-8 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
              <Calendar class="h-4 w-4" />
            </span>
            <div class="min-w-0">
              <div class="text-sm font-semibold">{{ typeLabel(r.leave_type) }} · {{ r.days }}일</div>
              <div class="text-[11px] text-muted-foreground">{{ r.start_date }} ~ {{ r.end_date }}</div>
            </div>
          </div>
          <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium" :class="statusPill(r.status).cls">
            {{ statusPill(r.status).txt }}
          </span>
        </div>
        <p v-if="r.reason" class="text-sm whitespace-pre-wrap mb-1">{{ r.reason }}</p>

        <!-- 반려: 사유를 두드러지게 표시 + 결정자와 채팅 시작 버튼 -->
        <div
          v-if="r.status === 'rejected'"
          class="mt-2 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 p-3"
        >
          <div class="text-[11px] font-semibold text-rose-700 dark:text-rose-200 mb-1">
            반려 사유 · 결정: {{ r.decided_by_name ?? '관리자' }}
          </div>
          <p class="text-sm whitespace-pre-wrap text-rose-900 dark:text-rose-100">
            {{ r.decision_note || '(사유 미기재)' }}
          </p>
          <div v-if="r.decided_by" class="mt-2 flex justify-end">
            <button
              type="button"
              class="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              :disabled="chatStartingId === r.id"
              @click="chatWithDecider(r)"
            >
              <Loader2 v-if="chatStartingId === r.id" class="h-3.5 w-3.5 animate-spin" />
              <MessageSquare v-else class="h-3.5 w-3.5" />
              결정자와 대화
            </button>
          </div>
        </div>

        <!-- 승인 등 기타 결정: 한 줄로 -->
        <p v-else-if="r.decided_by_name" class="text-[11px] text-muted-foreground">
          결정: {{ r.decided_by_name }}
          <span v-if="r.decision_note">· {{ r.decision_note }}</span>
        </p>

        <div class="mt-2 flex justify-end">
          <button
            v-if="r.status === 'pending'"
            type="button"
            class="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium inline-flex items-center gap-1 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
            :disabled="cancellingId === r.id"
            @click="cancelOne(r)"
          >
            <Loader2 v-if="cancellingId === r.id" class="h-3.5 w-3.5 animate-spin" />
            <Trash2 v-else class="h-3.5 w-3.5" />
            신청 취소
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
