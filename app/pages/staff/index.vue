<script setup lang="ts">
import {
  Search,
  Building2,
  ChevronLeft,
  ChevronRight,
  UsersRound,
  CalendarOff,
  Check,
  Trash2,
} from "@lucide/vue";

useHead({ title: "직원 관리 · 케어닥 HQ" });

const route = useRoute();
const router = useRouter();
const api = useApi();
const toast = useToast();
const { me } = useAuth();

// Tab — synced with ?tab=leave query string so the URL is shareable
const tab = ref<"list" | "leave">(route.query.tab === "leave" ? "leave" : "list");
watch(tab, (v) => {
  router.replace({ query: { ...route.query, tab: v === "leave" ? "leave" : undefined } });
});

interface Person {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  position: string;
  position_ko: string;
  employment_type: string;
  employment_type_ko: string;
  is_inactive: boolean;
}
interface Branch { id: string; name: string }

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

// =============================================================================
// 직원 목록
// =============================================================================
const q = ref("");
const debouncedQ = refDebounced(q, 250);
const branchFilter = ref<string>("");
const empFilter = ref<string>("");

const [{ data: people, pending, error }, { data: dashboard }] = await Promise.all([
  useAsyncData("staff-list", () => api.get<Person[]>("/v1/org/chart")),
  useAsyncData("staff-branches", () => api.get<{ branches: Branch[] }>("/v1/dashboard/summary")),
]);

const filtered = computed(() => {
  let rows = people.value ?? [];
  if (branchFilter.value === "__hq__") rows = rows.filter((p) => !p.branch_id);
  else if (branchFilter.value) rows = rows.filter((p) => p.branch_id === branchFilter.value);
  if (empFilter.value) rows = rows.filter((p) => p.employment_type === empFilter.value);
  if (debouncedQ.value) {
    const n = debouncedQ.value.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.full_name.toLowerCase().includes(n) ||
        p.email.toLowerCase().includes(n) ||
        p.position_ko.includes(debouncedQ.value),
    );
  }
  return rows;
});

// pagination
const pageSize = ref(25);
const page = ref(1);
const pageSizeOptions = [10, 25, 50, 100];

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / pageSize.value)),
);
watch([debouncedQ, branchFilter, empFilter, pageSize], () => { page.value = 1; });
watch(totalPages, (n) => { if (page.value > n) page.value = n; });

const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});
const pageStart = computed(() =>
  filtered.value.length === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
);
const pageEnd = computed(() =>
  Math.min(page.value * pageSize.value, filtered.value.length),
);

const tone: Record<string, string> = {
  regular: "bg-primary/10 text-primary",
  contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  part_time: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200",
  temporary: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  arbeit: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200",
  consultant: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};

// =============================================================================
// 휴가 관리
// =============================================================================
const leaveStatus = ref<string>("pending");
const leaveBranch = ref<string>("");
const leaveQ = ref("");
const debouncedLeaveQ = refDebounced(leaveQ, 250);

const { data: leaveRows, refresh: refreshLeave } = await useAsyncData(
  "staff-leave-requests",
  () =>
    api.get<LeaveRequest[]>("/v1/leave-requests", {
      status: leaveStatus.value || undefined,
    }),
  { watch: [leaveStatus] },
);

const leaveFiltered = computed(() => {
  let r = leaveRows.value ?? [];
  if (leaveBranch.value === "__hq__") r = r.filter((x) => !x.branch_id);
  else if (leaveBranch.value) r = r.filter((x) => x.branch_id === leaveBranch.value);
  if (debouncedLeaveQ.value) {
    const n = debouncedLeaveQ.value.toLowerCase();
    r = r.filter(
      (x) => x.user_name.toLowerCase().includes(n) || (x.reason ?? "").toLowerCase().includes(n),
    );
  }
  return r;
});

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

async function approveLeave(req: LeaveRequest) {
  try {
    await api.patch(`/v1/leave-requests/${req.id}/decide`, { status: "approved" });
    toast.success("승인되었습니다", req.user_name);
    await refreshLeave();
  } catch (err: any) {
    toast.error(err?.statusMessage ?? "처리 실패");
  }
}
async function deleteLeave(req: LeaveRequest) {
  if (!confirm(`${req.user_name}님의 ${leaveTypeKo[req.leave_type] ?? req.leave_type} 신청을 삭제하시겠습니까?`)) return;
  try {
    await api.delete(`/v1/leave-requests/${req.id}`);
    toast.success("삭제되었습니다", req.user_name);
    await refreshLeave();
  } catch (err: any) {
    toast.error(err?.statusMessage ?? "삭제 실패");
  }
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-4">
      <h1 class="text-3xl font-bold tracking-tight">직원 관리</h1>
      <p class="text-sm text-muted-foreground mt-1">
        전 지점 직원 + 본사 인력 · 휴가 승인. 이름 클릭 → 상세 페이지.
      </p>
    </header>

    <!-- Tabs -->
    <div class="flex items-center gap-1 mb-4 border-b">
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5"
        :class="tab === 'list'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = 'list'"
      >
        <UsersRound class="h-4 w-4" />
        직원 목록
        <span class="ml-1 text-[10px] tabular-nums opacity-70">{{ (people ?? []).length }}</span>
      </button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5"
        :class="tab === 'leave'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = 'leave'"
      >
        <CalendarOff class="h-4 w-4" />
        휴가
        <span
          v-if="(leaveRows ?? []).filter((x) => x.status === 'pending').length > 0"
          class="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-medium w-4 h-4 tabular-nums"
        >
          {{ (leaveRows ?? []).filter((x) => x.status === "pending").length }}
        </span>
      </button>
    </div>

    <!-- ================================================================ -->
    <!-- 직원 목록                                                        -->
    <!-- ================================================================ -->
    <div v-if="tab === 'list'" class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="이름 / 이메일 / 직책 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
        </div>
        <select
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 (본사 + 지점)</option>
          <option value="__hq__">본사만</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select
          v-model="empFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 고용형태</option>
          <option value="regular">정규직</option>
          <option value="contract">계약직</option>
          <option value="part_time">시간제</option>
          <option value="arbeit">아르바이트</option>
          <option value="consultant">위촉직</option>
        </select>
        <div class="ml-auto text-xs text-muted-foreground tabular-nums">
          {{ filtered.length }} / {{ (people ?? []).length }}명
        </div>
      </div>

      <div v-if="pending" class="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
      <div v-else-if="error" class="py-12 text-center text-sm text-destructive">불러오기 실패</div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">이름</th>
            <th class="py-3 px-3 font-medium">소속</th>
            <th class="py-3 px-3 font-medium">직책</th>
            <th class="py-3 px-3 font-medium">고용</th>
            <th class="py-3 px-3 font-medium">이메일</th>
            <th class="py-3 px-6 font-medium">전화</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in paged"
            :key="p.id"
            class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
            @click="navigateTo(`/staff/${p.id}`)"
          >
            <td class="py-3 px-6 font-medium">{{ p.full_name }}</td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-1.5 text-xs">
                <Building2 class="h-3 w-3 text-muted-foreground" />
                {{ p.branch_name ?? "본사" }}
              </div>
            </td>
            <td class="py-3 px-3">{{ p.position_ko }}</td>
            <td class="py-3 px-3">
              <span
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="tone[p.employment_type] ?? 'bg-muted'"
              >
                {{ p.employment_type_ko }}
              </span>
            </td>
            <td class="py-3 px-3 text-muted-foreground font-mono text-xs truncate max-w-[14rem]">{{ p.email }}</td>
            <td class="py-3 px-6 text-muted-foreground">{{ p.phone ?? "—" }}</td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="py-12 text-center text-muted-foreground">조건에 맞는 직원이 없습니다.</td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div
        v-if="filtered.length > 0"
        class="px-6 py-3 border-t flex flex-wrap items-center gap-3 text-xs"
      >
        <div class="text-muted-foreground tabular-nums">
          {{ pageStart }}–{{ pageEnd }} / 총 {{ filtered.length }}명
        </div>
        <div class="ml-auto flex items-center gap-2">
          <label class="text-muted-foreground">페이지당</label>
          <select v-model.number="pageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="h-8 w-8 rounded-md border flex items-center justify-center disabled:opacity-30 hover:bg-muted"
            :disabled="page <= 1"
            @click="page = page - 1"
            title="이전"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <span class="px-2 tabular-nums">
            <strong>{{ page }}</strong> / {{ totalPages }}
          </span>
          <button
            class="h-8 w-8 rounded-md border flex items-center justify-center disabled:opacity-30 hover:bg-muted"
            :disabled="page >= totalPages"
            @click="page = page + 1"
            title="다음"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- 휴가 관리                                                         -->
    <!-- ================================================================ -->
    <div v-else>
      <p class="text-sm text-muted-foreground mb-4">
        직원이 데스크톱 앱에서 신청한 휴가를 검토합니다. 승인하지 않을 항목은 삭제하세요.
      </p>

      <!-- Filters -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="flex gap-1 border-b -mb-px">
          <button
            v-for="s in ['pending', 'approved', 'rejected', '']"
            :key="s || 'all'"
            class="px-4 py-2 text-sm border-b-2 transition-colors"
            :class="leaveStatus === s
              ? 'border-primary text-primary font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'"
            @click="leaveStatus = s"
          >
            {{ s === "" ? "전체" : statusKo[s as LeaveRequest['status']] }}
          </button>
        </div>
        <select
          v-model="leaveBranch"
          class="h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <option value="__hq__">본사만</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <input
          v-model="leaveQ"
          placeholder="이름 / 사유 검색"
          class="h-9 px-3 rounded-lg border border-input bg-background text-sm w-48 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
        <div class="ml-auto text-xs text-muted-foreground tabular-nums">{{ leaveFiltered.length }}건</div>
      </div>

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
            <tr
              v-for="r in leaveFiltered"
              :key="r.id"
              class="border-t hover:bg-muted/30 transition-colors"
            >
              <td class="py-3 px-6">
                <div class="font-medium">{{ r.user_name }}</div>
                <div class="text-xs text-muted-foreground">{{ r.branch_name ?? "본사" }}</div>
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
                <div class="flex justify-end gap-1">
                  <button
                    v-if="r.status === 'pending'"
                    class="h-7 w-7 rounded-md flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                    title="승인"
                    @click="approveLeave(r)"
                  >
                    <Check class="h-4 w-4" />
                  </button>
                  <button
                    class="h-7 w-7 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                    title="삭제"
                    @click="deleteLeave(r)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="leaveFiltered.length === 0">
              <td :colspan="isManager ? 7 : 6" class="py-12 text-center text-sm text-muted-foreground">
                <CalendarOff class="h-10 w-10 mx-auto mb-3 opacity-30" />
                조건에 맞는 휴가 신청이 없습니다.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
