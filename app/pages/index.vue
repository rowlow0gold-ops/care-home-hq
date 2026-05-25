<script setup lang="ts">
import { Users, AlertCircle, ClipboardList, UserCheck, Wallet, Building2, Filter, Search } from "@lucide/vue";

useHead({ title: "대시보드 · 케어닥 HQ" });

interface DashboardSummary {
  branches: Array<{
    id: string;
    name: string;
    branch_type: "hub" | "satellite";
    resident_count: number;
    occupancy_pct: number;
    incidents_7d: number;
    staff_on_duty: number;
    last_billing_amount: number | null;
    services: string[];
    residential_capacity: number;
    daycare_capacity: number;
    home_visit_recipients: number;
    current_caregivers: number;
    current_nurses: number;
    required_caregivers: number;
    required_nurses: number;
  }>;
  totals: {
    residents: number;
    incidents_7d: number;
    staff_on_duty: number;
    open_care_logs: number;
  };
  money: {
    last_month_total_krw: number;
    completed_runs: number;
    last_month: string | null;
  };
}

const api = useApi();

interface BillingRun {
  id: string;
  branch_id: string;
  year_month: string;
  status: string;
  total_amount: number | null;
}

const [{ data, pending, error }, { data: runs }] = await Promise.all([
  useAsyncData("dashboard", () => api.get<DashboardSummary>("/v1/dashboard/summary")),
  useAsyncData("billing-runs", () => api.get<BillingRun[]>("/v1/billing/runs")),
]);

// ----- 청구 매출 (no in-card filters; respects top-level branch filter) ----
const completedRuns = computed(() =>
  (runs.value ?? []).filter((r) => r.status === "completed"),
);

// Default: 센터장 → own branch, HQ/super_admin → 전체 지점 ("")
const { me } = useAuth();
const initialBranch =
  me.value?.role === "branch_manager" && me.value.branch_id
    ? me.value.branch_id
    : "";
const billingBranch = ref<string>(initialBranch);

const filteredBilling = computed(() => {
  let rows = completedRuns.value;
  // Month filter removed per UX request — total spans the full history.
  if (billingBranch.value) rows = rows.filter((r) => r.branch_id === billingBranch.value);
  return rows;
});

const billingTotal = computed(() =>
  filteredBilling.value.reduce((acc, r) => acc + (r.total_amount ?? 0), 0),
);
const billingCount = computed(() => filteredBilling.value.length);

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000)      return `₩${(n / 10_000).toFixed(0)}만`;
  return `₩${n.toLocaleString("ko-KR")}`;
}
function fmtKRWFull(n: number | null) {
  if (n === null || n === undefined) return "—";
  return `₩${n.toLocaleString("ko-KR")}`;
}

const SERVICE_LABEL: Record<string, string> = {
  nursing_home: "요양원",
  day_care: "주간보호센터",
  visiting_care: "방문요양",
};
const SERVICE_SHORT: Record<string, string> = {
  nursing_home: "요양",
  day_care: "주간",
  visiting_care: "방문",
};
function serviceLabel(s: string) { return SERVICE_LABEL[s] ?? s; }
function serviceShort(s: string) { return SERVICE_SHORT[s] ?? s; }

// ----- Top-level center filter --------------------------------------------
// Empty string = "전체 지점" (all centers). Filter affects KPIs + table + the
// money hero's branch dropdown (which uses its own state, but we mirror here).
const branchFilter = ref<string>(initialBranch);

// Draft + applied for the table search (committed on 검색)
const branchSearch = ref<string>("");
const appliedBranchSearch = ref<string>("");
function applyBranchSearch() {
  appliedBranchSearch.value = branchSearch.value.trim().toLowerCase();
}

const visibleBranches = computed(() => {
  let all = data.value?.branches ?? [];
  if (branchFilter.value) all = all.filter((b) => b.id === branchFilter.value);
  if (appliedBranchSearch.value) {
    all = all.filter((b) => b.name.toLowerCase().includes(appliedBranchSearch.value));
  }
  return all;
});

// KPI totals reflect the current filter
const filteredTotals = computed(() => {
  const bs = visibleBranches.value;
  return {
    residents: bs.reduce((acc, b) => acc + b.resident_count, 0),
    incidents_7d: bs.reduce((acc, b) => acc + b.incidents_7d, 0),
    staff_total: bs.reduce((acc, b) => acc + b.staff_on_duty, 0),
    // open_care_logs is tenant-wide from server; only meaningful when no filter
    open_care_logs: branchFilter.value ? null : (data.value?.totals.open_care_logs ?? 0),
  };
});

const kpis = computed(() => {
  const t = filteredTotals.value;
  return [
    {
      label: "최근 7일 사고/이상징후",
      value: t.incidents_7d,
      icon: AlertCircle,
      bg: t.incidents_7d > 5 ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-900/30",
      iconColor: t.incidents_7d > 5 ? "text-destructive" : "text-amber-700 dark:text-amber-300",
      isWarning: t.incidents_7d > 5,
    },
    {
      label: "입소 어르신",
      value: t.residents,
      icon: Users,
      bg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "전체 직원",
      value: t.staff_total,
      icon: UserCheck,
      bg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-300",
    },
    {
      label: "확인 필요 케어 기록",
      value: t.open_care_logs,
      icon: ClipboardList,
      bg: "bg-violet-100 dark:bg-violet-900/30",
      iconColor: "text-violet-600 dark:text-violet-300",
    },
  ];
});

// Keep the money-hero branch filter in sync with the top-level one
watch(branchFilter, (v) => { billingBranch.value = v; });

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("ko-KR");
}

function occupancyTone(pct: number) {
  if (pct >= 80) return "text-primary";
  if (pct >= 50) return "text-amber-600 dark:text-amber-300";
  return "text-muted-foreground";
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">대시보드</h1>
        <p class="text-sm text-muted-foreground mt-1">
          {{ branchFilter
            ? (data?.branches?.find((b) => b.id === branchFilter)?.name ?? "지점") + " 운영 현황"
            : "전 지점 운영 현황 한눈에 보기" }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Filter class="h-4 w-4 text-muted-foreground" />
        <select
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 min-w-[180px]"
        >
          <option value="">전체 지점</option>
          <option v-for="b in data?.branches ?? []" :key="b.id" :value="b.id">
            {{ b.name }} {{ b.branch_type === 'hub' ? '· Hub' : '· Sat' }}
          </option>
        </select>
      </div>
    </header>

    <!-- MONEY HERO — main HQ metric -->
    <div class="rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/5 to-card p-6 mb-6 relative overflow-hidden">
      <div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div class="relative flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-[260px]">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet class="h-4 w-4 text-primary" />
            <span>청구 매출 합계 · <strong class="text-foreground">전체 기간</strong></span>
          </div>
          <div v-if="pending && !data" class="mt-2">
            <Skeleton w="14rem" h="2.5rem" />
          </div>
          <div v-else class="mt-2 text-4xl font-bold tabular-nums text-foreground">
            ₩{{ billingTotal.toLocaleString("ko-KR") }}
          </div>
          <div class="text-xs text-muted-foreground mt-1">
            <span v-if="billingBranch">
              {{ data?.branches?.find((b) => b.id === billingBranch)?.name ?? "—" }} ·
            </span>
            완료된 청구 {{ billingCount }}건
          </div>
        </div>

      </div>
    </div>

    <!-- KPI cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div
        v-for="(k, idx) in kpis"
        :key="idx"
        class="rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <p class="text-sm text-muted-foreground">{{ k.label }}</p>
            <p
              class="text-3xl font-bold mt-2 tabular-nums"
              :class="k.isWarning ? 'text-destructive' : ''"
            >
              <Skeleton v-if="pending && !data" w="3rem" h="1.875rem" />
              <template v-else>{{ fmtNum(k.value) }}</template>
            </p>
          </div>
          <div
            class="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
            :class="k.bg"
          >
            <component :is="k.icon" class="h-5 w-5" :class="k.iconColor" />
          </div>
        </div>
      </div>
    </div>

    <!-- Branch table — now includes last billing per branch -->
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold">지점별 현황</h2>
          <p class="text-sm text-muted-foreground">매출 · 입소율 · 사고 · 근무 인원 (최근 7일 기준)</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="relative">
            <Search class="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              v-model="branchSearch"
              type="text"
              placeholder="지점명 검색"
              class="h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 min-w-[200px]"
              @keyup.enter="applyBranchSearch"
            />
          </div>
          <button
            type="button"
            @click="applyBranchSearch"
            aria-label="검색"
            title="검색"
            class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 inline-flex items-center justify-center"
          >
            <Search class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div v-if="pending && !data" class="px-6 py-4 space-y-3">
        <div v-for="i in 3" :key="i" class="flex items-center gap-4">
          <Skeleton w="8rem" h="1rem" />
          <Skeleton w="6rem" h="1rem" />
          <Skeleton w="3rem" h="1rem" />
          <Skeleton w="3rem" h="1rem" />
        </div>
      </div>

      <div v-else-if="error" class="px-6 py-12 text-center">
        <AlertCircle class="h-8 w-8 mx-auto text-destructive mb-3" />
        <p class="text-sm font-medium">대시보드 데이터를 불러오지 못했습니다.</p>
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">지점</th>
            <th class="py-3 px-3 font-medium text-right">최근 청구</th>
            <th class="py-3 px-3 font-medium text-right">입소</th>
            <th class="py-3 px-3 font-medium text-right">주간</th>
            <th class="py-3 px-3 font-medium text-right">방문</th>
            <th class="py-3 px-3 font-medium text-right">사고(7d)</th>
            <th class="py-3 px-6 font-medium text-right">전체 직원</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="b in visibleBranches"
            :key="b.id"
            class="border-t hover:bg-muted/30 transition-colors"
          >
            <td class="py-3 px-6">
              <div class="flex items-center gap-2 flex-wrap">
                <Building2 class="h-3.5 w-3.5 text-primary" />
                <span class="font-medium">{{ b.name }}</span>
                <span
                  class="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5"
                  :class="b.branch_type === 'hub'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground'"
                >
                  {{ b.branch_type === 'hub' ? '거점 Hub' : '위성 Sat' }}
                </span>
                <span
                  v-for="s in b.services"
                  :key="s"
                  class="text-[10px] font-medium rounded px-1.5 py-0.5 border bg-muted/50 text-muted-foreground"
                  :title="serviceLabel(s)"
                >
                  {{ serviceShort(s) }}
                </span>
              </div>
            </td>
            <td class="py-3 px-3 text-right tabular-nums font-medium">{{ fmtKRWFull(b.last_billing_amount) }}</td>
            <td class="py-3 px-3 text-right tabular-nums">
              <span v-if="b.services.includes('nursing_home')">
                {{ b.resident_count }}
                <span class="text-xs text-muted-foreground">/ {{ b.residential_capacity }}</span>
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="py-3 px-3 text-right tabular-nums">
              <span v-if="b.services.includes('day_care')" class="text-muted-foreground">
                정원 {{ b.daycare_capacity }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="py-3 px-3 text-right tabular-nums">
              <span v-if="b.services.includes('visiting_care')" class="text-muted-foreground">
                {{ b.home_visit_recipients }}명
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td
              class="py-3 px-3 text-right tabular-nums"
              :class="b.incidents_7d > 3 ? 'text-destructive font-medium' : 'text-muted-foreground'"
            >
              {{ b.incidents_7d }}
            </td>
            <td class="py-3 px-6 text-right tabular-nums">{{ b.staff_on_duty }}</td>
          </tr>
          <tr v-if="visibleBranches.length === 0">
            <td colspan="7" class="py-12 text-center">
              <Users class="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40" />
              <p class="text-sm text-muted-foreground">지점 데이터가 없습니다.</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>
