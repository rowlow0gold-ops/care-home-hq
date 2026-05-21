<script setup lang="ts">
import { CalendarOff, Check, X } from "@lucide/vue";

useHead({ title: "휴가 · 케어닥 HQ" });

interface LeaveRequest {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  user_id: string;
  user_name: string;
  user_role: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
}

interface Balance {
  year: number;
  annual_allocated: number;
  annual_used: number;
  annual_remaining: number;
  sick_used: number;
}

const api = useApi();
const toast = useToast();
const { me } = useAuth();

const statusFilter = ref<string>("pending");
const branchFilter = ref<string>("");
const q = ref("");
const debouncedQ = refDebounced(q, 250);

const { data: rows, refresh } = await useAsyncData(
  "leave-requests",
  () => api.get<LeaveRequest[]>("/v1/leave-requests", { status: statusFilter.value || undefined }),
  { watch: [statusFilter] },
);

interface Branch { id: string; name: string }
const { data: dashboard } = await useAsyncData("leave-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const filtered = computed(() => {
  let r = rows.value ?? [];
  if (branchFilter.value === "__hq__") r = r.filter((x) => !x.branch_id);
  else if (branchFilter.value) r = r.filter((x) => x.branch_id === branchFilter.value);
  if (debouncedQ.value) {
    const n = debouncedQ.value.toLowerCase();
    r = r.filter(
      (x) => x.user_name.toLowerCase().includes(n) || (x.reason ?? "").toLowerCase().includes(n),
    );
  }
  return r;
});

const { data: balance } = await useAsyncData("leave-balance", () =>
  api.get<Balance>("/v1/leave-requests/balance"),
);

const leaveTypeKo: Record<string, string> = {
  annual: "연차",
  monthly: "월차",
  sick: "병가",
  personal: "경조사",
  maternity: "출산휴가",
  public: "공가",
};
const statusKo: Record<LeaveRequest["status"], string> = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  cancelled: "취소됨",
};
const statusTone: Record<LeaveRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  approved: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const isManager = computed(() =>
  ["branch_manager", "hq", "super_admin"].includes(me.value?.role ?? ""),
);

async function decide(req: LeaveRequest, status: "approved" | "rejected") {
  try {
    await api.patch(`/v1/leave-requests/${req.id}/decide`, { status });
    toast.success(status === "approved" ? "승인되었습니다" : "반려되었습니다", req.user_name);
    await refresh();
  } catch (err: any) {
    toast.error(err?.statusMessage ?? "처리 실패");
  }
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">휴가 관리</h1>
      <p class="text-sm text-muted-foreground mt-1">
        연차 · 병가 · 경조사 검토 및 승인. 신청은 데스크톱 앱에서 받습니다.
      </p>
    </header>

    <!-- Balance card (caregiver/nurse only — managers see branch-wide instead) -->
    <div v-if="balance" class="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-xl border bg-card p-4">
        <div class="text-xs text-muted-foreground">{{ balance.year }} 연차 잔여</div>
        <div class="text-2xl font-bold mt-1 text-primary">{{ balance.annual_remaining.toFixed(1) }}일</div>
      </div>
      <div class="rounded-xl border bg-card p-4">
        <div class="text-xs text-muted-foreground">연차 사용</div>
        <div class="text-2xl font-bold mt-1">{{ balance.annual_used.toFixed(1) }}일</div>
      </div>
      <div class="rounded-xl border bg-card p-4">
        <div class="text-xs text-muted-foreground">연차 총량</div>
        <div class="text-2xl font-bold mt-1">{{ balance.annual_allocated.toFixed(1) }}일</div>
      </div>
      <div class="rounded-xl border bg-card p-4">
        <div class="text-xs text-muted-foreground">병가 사용</div>
        <div class="text-2xl font-bold mt-1">{{ balance.sick_used.toFixed(1) }}일</div>
      </div>
    </div>

    <!-- Filters: status tabs + branch + search -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="flex gap-1 border-b -mb-px">
        <button
          v-for="s in ['pending','approved','rejected','']"
          :key="s || 'all'"
          class="px-4 py-2 text-sm border-b-2 transition-colors"
          :class="statusFilter === s
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="statusFilter = s"
        >
          {{ s === "" ? "전체" : statusKo[s as LeaveRequest['status']] }}
        </button>
      </div>
      <select
        v-model="branchFilter"
        class="h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      >
        <option value="">전체 지점</option>
        <option value="__hq__">본사만</option>
        <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select>
      <input
        v-model="q"
        placeholder="이름 / 사유 검색"
        class="h-9 px-3 rounded-lg border border-input bg-background text-sm w-48 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      >
      <div class="ml-auto text-xs text-muted-foreground tabular-nums">{{ filtered.length }}건</div>
    </div>

    <!-- Requests list -->
    <div class="rounded-xl border bg-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">신청자</th>
            <th class="py-3 px-3 font-medium">종류</th>
            <th class="py-3 px-3 font-medium">기간</th>
            <th class="py-3 px-3 font-medium text-right">일수</th>
            <th class="py-3 px-3 font-medium">사유</th>
            <th class="py-3 px-3 font-medium">상태</th>
            <th v-if="isManager" class="py-3 px-6 font-medium text-right">처리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.id" class="border-t hover:bg-muted/30 transition-colors">
            <td class="py-3 px-6">
              <div class="font-medium">{{ r.user_name }}</div>
              <div class="text-xs text-muted-foreground">
                {{ r.branch_name ?? "본사" }}
              </div>
            </td>
            <td class="py-3 px-3">{{ leaveTypeKo[r.leave_type] ?? r.leave_type }}</td>
            <td class="py-3 px-3 text-xs text-muted-foreground tabular-nums">
              {{ fmtDate(r.start_date) }}<br>~ {{ fmtDate(r.end_date) }}
            </td>
            <td class="py-3 px-3 text-right tabular-nums font-medium">{{ r.days.toFixed(1) }}일</td>
            <td class="py-3 px-3 text-xs text-muted-foreground max-w-xs truncate">{{ r.reason ?? "—" }}</td>
            <td class="py-3 px-3">
              <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="statusTone[r.status]">
                {{ statusKo[r.status] }}
              </span>
            </td>
            <td v-if="isManager" class="py-3 px-6 text-right">
              <div v-if="r.status === 'pending'" class="flex justify-end gap-1">
                <button
                  class="h-7 w-7 rounded-md flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                  title="승인"
                  @click="decide(r, 'approved')"
                >
                  <Check class="h-4 w-4" />
                </button>
                <button
                  class="h-7 w-7 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                  title="반려"
                  @click="decide(r, 'rejected')"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
              <span v-else class="text-xs text-muted-foreground">
                {{ r.decided_by_name ?? "—" }}
              </span>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td :colspan="isManager ? 7 : 6" class="py-12 text-center text-sm text-muted-foreground">
              <CalendarOff class="h-10 w-10 mx-auto mb-3 opacity-30" />
              조건에 맞는 휴가 신청이 없습니다.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
