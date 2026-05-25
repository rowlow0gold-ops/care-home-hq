<script setup lang="ts">
import {
  Users, AlertCircle, ClipboardList, UserCheck, Wallet, Building2, Filter,
  ChevronLeft, ChevronRight, ChevronRight as ChevRight,
  TrendingUp, BarChart3,
} from "@lucide/vue";
import { Line, Bar } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
);

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

// ----- Role gate --------------------------------------------------------
// Only 본부 (hq / super_admin) gets the filter row and the charts.
// Branch users see their own branch only — RLS does this server-side; the
// branch filter UI is hidden so they can't even try to pivot.
const { me } = useAuth();
const isHq = computed(
  () => me.value?.role === "hq" || me.value?.role === "super_admin",
);

// ----- Top-level filters: branch + date ---------------------------------
const initialBranch =
  me.value?.role === "branch_manager" && me.value.branch_id
    ? me.value.branch_id
    : "";
const branchFilter = ref<string>(initialBranch);

// Date filter — pick a granularity, then a specific period via plain selects.
//   월별  + selectedYear + selectedMonth (1-12) → that month only
//   연도별 + selectedYear                       → that calendar year only
//   전체 기간                                   → no upper bound
type DateScope = "month" | "year" | "all";
const dateScope = ref<DateScope>("month");

const now = new Date();
const selectedYear  = ref<number>(now.getFullYear());
const selectedMonth = ref<number>(now.getMonth() + 1);   // 1-12

// Years offered: current year and the four prior.
const yearOptions  = Array.from({ length: 5 },  (_, i) => now.getFullYear() - i);
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

function pad2(n: number) { return String(n).padStart(2, "0"); }

// Convert the picked scope into a (since, until) pair the API understands.
const dateRange = computed<{ since: string; until: string | undefined }>(() => {
  if (dateScope.value === "month") {
    const y = selectedYear.value, m = selectedMonth.value;
    const first    = `${y}-${pad2(m)}-01`;
    const lastDate = new Date(y, m, 0).getDate();    // day 0 of next month
    const last     = `${y}-${pad2(m)}-${pad2(lastDate)}`;
    return { since: first, until: last };
  }
  if (dateScope.value === "year") {
    return { since: `${selectedYear.value}-01-01`, until: `${selectedYear.value}-12-31` };
  }
  return { since: "1970-01-01", until: undefined };
});

// Human-friendly label for the KPI card and the table column header.
const sinceLabel = computed(() => {
  if (dateScope.value === "month") return `${selectedYear.value}년 ${selectedMonth.value}월`;
  if (dateScope.value === "year")  return `${selectedYear.value}년`;
  return "전체 기간";
});

const { data, pending, error } = await useAsyncData(
  "dashboard",
  () => api.get<DashboardSummary>("/v1/dashboard/summary", {
    since: dateRange.value.since,
    until: dateRange.value.until,
  }),
  // Watch the source refs directly — the computed dateRange doesn't always
  // trigger reliably across browsers.
  { watch: [dateScope, selectedMonth, selectedYear] },
);

// Historical billing runs for the HQ chart (last 12 months). Skipped for
// non-HQ users since they don't render the charts anyway.
interface RawBillingRun {
  id: string;
  branch_id: string;
  year_month: string;
  status: string;
  total_amount: number | null;
}
const { data: allRuns } = await useAsyncData(
  "dash-all-runs",
  () => isHq.value ? api.get<RawBillingRun[]>("/v1/billing/runs") : Promise.resolve([] as RawBillingRun[]),
);

// ----- 청구 매출 — derived from the (already window-scoped) summary -------
// The backend now returns per-branch last_billing_amount = SUM of completed
// runs in the active window, and money.last_month_total_krw = the across-all
// sum. So when a branch is selected we just use that branch's value;
// otherwise we use the global total.
const billingTotal = computed(() => {
  if (branchFilter.value) {
    const b = data.value?.branches?.find((x) => x.id === branchFilter.value);
    return b?.last_billing_amount ?? 0;
  }
  return data.value?.money.last_month_total_krw ?? 0;
});
const billingCount = computed(() => {
  if (branchFilter.value) {
    // 1 run per month per branch in the seed; backend doesn't return a
    // per-branch count, but it's also not interesting at the single-branch
    // level — show "—" rather than a misleading number.
    return null;
  }
  return data.value?.money.completed_runs ?? 0;
});

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

// ----- Branch table — driven by top-level branch filter only -------------
const visibleBranches = computed(() => {
  const all = data.value?.branches ?? [];
  if (!branchFilter.value) return all;
  return all.filter((b) => b.id === branchFilter.value);
});

// KPI totals reflect the branch + date filter. All values come from
// `data.value.branches[*]` which is already window-scoped server-side.
const filteredTotals = computed(() => {
  const bs = visibleBranches.value;
  return {
    residents: bs.reduce((acc, b) => acc + b.resident_count, 0),
    incidents_7d: bs.reduce((acc, b) => acc + b.incidents_7d, 0),
    staff_total: bs.reduce((acc, b) => acc + b.staff_on_duty, 0),
    // Server's totals.open_care_logs is also window-scoped; when a single
    // branch is selected we don't have a per-branch breakdown so suppress.
    open_care_logs: branchFilter.value ? null : (data.value?.totals.open_care_logs ?? 0),
  };
});

const kpis = computed(() => {
  const t = filteredTotals.value;
  return [
    {
      key: "incidents",
      label: `${sinceLabel.value} 사고/이상징후`,
      value: t.incidents_7d,
      icon: AlertCircle,
      bg: t.incidents_7d > 5 ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-900/30",
      iconColor: t.incidents_7d > 5 ? "text-destructive" : "text-amber-700 dark:text-amber-300",
      isWarning: t.incidents_7d > 5,
      href: {
        path: "/care",
        query: {
          tab: "care-logs",
          flagged: "true",
          since: dateRange.value.since,
          ...(dateRange.value.until ? { until: dateRange.value.until } : {}),
          ...(branchFilter.value ? { branch: branchFilter.value } : {}),
        },
      },
    },
    {
      key: "residents",
      label: `${sinceLabel.value} 입소 어르신`,
      value: t.residents,
      icon: Users,
      bg: "bg-primary/10",
      iconColor: "text-primary",
      href: {
        path: "/care",
        query: {
          ...(branchFilter.value ? { branch: branchFilter.value } : {}),
        },
      },
    },
    {
      key: "staff",
      label: `${sinceLabel.value} 재직 직원`,
      value: t.staff_total,
      icon: UserCheck,
      bg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-300",
      href: {
        path: "/staff",
        query: {
          ...(branchFilter.value ? { branch: branchFilter.value } : {}),
        },
      },
    },
    {
      key: "open_care_logs",
      label: `${sinceLabel.value} 확인 필요 케어 기록`,
      value: t.open_care_logs,
      icon: ClipboardList,
      bg: "bg-violet-100 dark:bg-violet-900/30",
      iconColor: "text-violet-600 dark:text-violet-300",
      href: {
        path: "/care",
        query: {
          tab: "care-logs",
          flagged: "true",
          ...(branchFilter.value ? { branch: branchFilter.value } : {}),
        },
      },
    },
  ];
});

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("ko-KR");
}

// =========================================================================
// HQ-only charts
// =========================================================================

// Monthly revenue trend — last 12 months of completed billing summed across
// branches. Respects the top-level branch filter so an HQ user inspecting a
// single branch sees that branch's trend.
const monthlyTrend = computed(() => {
  const map = new Map<string, number>();
  for (const r of allRuns.value ?? []) {
    if (r.status !== "completed" || r.total_amount === null) continue;
    if (branchFilter.value && r.branch_id !== branchFilter.value) continue;
    map.set(r.year_month, (map.get(r.year_month) ?? 0) + (r.total_amount ?? 0));
  }
  const months = [...map.keys()].sort().slice(-12);
  return {
    labels: months.map((m) => {
      const [y, mm] = m.split("-");
      return `${y}.${mm}`;
    }),
    datasets: [
      {
        label: "월별 매출",
        data: months.map((m) => map.get(m) ?? 0),
        borderColor: "hsl(158, 70%, 32%)",
        backgroundColor: "hsla(158, 70%, 32%, 0.12)",
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ],
  };
});

// Top branches by billing in the active window. Single-branch view => empty.
const topBranches = computed(() => {
  if (branchFilter.value) return { labels: [], datasets: [] };
  const items = (data.value?.branches ?? [])
    .map((b) => ({ name: b.name, amount: b.last_billing_amount ?? 0 }))
    .filter((b) => b.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
  return {
    labels: items.map((b) => b.name),
    datasets: [
      {
        label: "지점별 매출",
        data: items.map((b) => b.amount),
        backgroundColor: "hsla(158, 70%, 32%, 0.7)",
        borderRadius: 4,
      },
    ],
  };
});

// Shared chart options — KRW formatting on the y-axis tooltips.
function krwShort(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000)      return `${(v / 10_000).toFixed(0)}만`;
  return v.toLocaleString("ko-KR");
}
const lineOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `₩${(ctx.parsed.y as number).toLocaleString("ko-KR")}`,
      },
    },
  },
  scales: {
    y: {
      ticks: { callback: (v: any) => `₩${krwShort(Number(v))}` },
      grid:  { color: "hsla(0, 0%, 50%, 0.08)" },
    },
    x: { grid: { display: false } },
  },
} as const;
const barOpts = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y" as const,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `₩${(ctx.parsed.x as number).toLocaleString("ko-KR")}`,
      },
    },
  },
  scales: {
    x: {
      ticks: { callback: (v: any) => `₩${krwShort(Number(v))}` },
      grid:  { color: "hsla(0, 0%, 50%, 0.08)" },
    },
    y: { grid: { display: false } },
  },
} as const;

// ----- Pagination for 지점별 현황 ----------------------------------------
const tablePage = ref(1);
const tablePageSize = ref(10);
const tablePageSizeOptions = [10, 25, 50, 100];
const tableTotalPages = computed(() =>
  Math.max(1, Math.ceil(visibleBranches.value.length / tablePageSize.value)),
);
watch([branchFilter, tablePageSize, visibleBranches], () => {
  tablePage.value = 1;
});
const pagedBranches = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize.value;
  return visibleBranches.value.slice(start, start + tablePageSize.value);
});
const tablePageStart = computed(() =>
  visibleBranches.value.length === 0 ? 0 : (tablePage.value - 1) * tablePageSize.value + 1,
);
const tablePageEnd = computed(() =>
  Math.min(tablePage.value * tablePageSize.value, visibleBranches.value.length),
);
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
      <div v-if="isHq" class="flex items-center gap-2 flex-wrap">
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
        <select
          v-model="dateScope"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="month">월별</option>
          <option value="year">연도별</option>
          <option value="all">전체 기간</option>
        </select>
        <select
          v-if="dateScope === 'month' || dateScope === 'year'"
          v-model.number="selectedYear"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}년</option>
        </select>
        <select
          v-if="dateScope === 'month'"
          v-model.number="selectedMonth"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}월</option>
        </select>
      </div>
    </header>

    <!-- MONEY HERO -->
    <div class="rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/5 to-card p-6 mb-6 relative overflow-hidden">
      <div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div class="relative flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-[260px]">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet class="h-4 w-4 text-primary" />
            <span>청구 매출 합계 · <strong class="text-foreground">{{ sinceLabel }}</strong></span>
          </div>
          <div v-if="pending && !data" class="mt-2">
            <Skeleton w="14rem" h="2.5rem" />
          </div>
          <div v-else class="mt-2 text-4xl font-bold tabular-nums text-foreground">
            ₩{{ billingTotal.toLocaleString("ko-KR") }}
          </div>
          <div class="text-xs text-muted-foreground mt-1">
            <span v-if="branchFilter">
              {{ data?.branches?.find((b) => b.id === branchFilter)?.name ?? "—" }}
            </span>
            <span v-else-if="billingCount !== null">
              완료된 청구 {{ billingCount }}건
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- KPI cards (clickable → detail pages) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <NuxtLink
        v-for="k in kpis"
        :key="k.key"
        :to="k.href"
        class="rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/15 group block"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <p class="text-sm text-muted-foreground flex items-center gap-1">
              {{ k.label }}
              <ChevRight class="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-all" />
            </p>
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
      </NuxtLink>
    </div>

    <!-- HQ-only charts -->
    <div v-if="isHq" class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <!-- Monthly revenue trend -->
      <div class="rounded-xl border bg-card p-5">
        <div class="flex items-center gap-2 mb-3">
          <TrendingUp class="h-4 w-4 text-primary" />
          <h3 class="text-sm font-semibold">월별 매출 추이</h3>
          <span class="text-xs text-muted-foreground ml-auto">
            <template v-if="branchFilter">
              {{ data?.branches?.find((b) => b.id === branchFilter)?.name ?? '' }} · 최근 12개월
            </template>
            <template v-else>전 지점 · 최근 12개월</template>
          </span>
        </div>
        <div class="h-64 relative">
          <Line v-if="(monthlyTrend.datasets[0]?.data?.length ?? 0) > 0"
                :data="monthlyTrend" :options="lineOpts" />
          <div v-else class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            완료된 청구 데이터가 없습니다
          </div>
        </div>
      </div>

      <!-- Top branches by revenue (window-scoped, HQ-wide only) -->
      <div class="rounded-xl border bg-card p-5">
        <div class="flex items-center gap-2 mb-3">
          <BarChart3 class="h-4 w-4 text-primary" />
          <h3 class="text-sm font-semibold">{{ sinceLabel }} 지점별 매출 (상위 10)</h3>
        </div>
        <div class="h-64 relative">
          <Bar v-if="!branchFilter && (topBranches.datasets[0]?.data?.length ?? 0) > 0"
               :data="topBranches" :options="barOpts" />
          <div v-else class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            <template v-if="branchFilter">단일 지점에서는 표시되지 않습니다</template>
            <template v-else>해당 기간 청구 데이터가 없습니다</template>
          </div>
        </div>
      </div>
    </div>

    <!-- Branch table -->
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b">
        <h2 class="text-lg font-semibold">지점별 현황</h2>
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
            <th class="py-3 px-3 font-medium text-right" title="요양원 입소 (현원/정원)">요양 (현원/정원)</th>
            <th class="py-3 px-3 font-medium text-right" title="주간보호센터 정원">주간 정원</th>
            <th class="py-3 px-3 font-medium text-right" title="방문요양 이용자">방문 이용자</th>
            <th class="py-3 px-3 font-medium text-right">{{ sinceLabel }} 사고</th>
            <th class="py-3 px-6 font-medium text-right">전체 직원</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="b in pagedBranches"
            :key="b.id"
            class="border-t hover:bg-muted/30 transition-colors cursor-pointer"
            @click="navigateTo(`/branches/${b.id}`)"
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
                {{ b.resident_count }} <span class="text-muted-foreground">/ {{ b.residential_capacity }}</span>
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="py-3 px-3 text-right tabular-nums">
              <span v-if="b.services.includes('day_care')">
                {{ b.daycare_capacity }}<span class="text-muted-foreground">명</span>
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="py-3 px-3 text-right tabular-nums">
              <span v-if="b.services.includes('visiting_care')">
                {{ b.home_visit_recipients }}<span class="text-muted-foreground">명</span>
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

      <!-- Pagination -->
      <div
        v-if="visibleBranches.length > 0"
        class="px-6 py-3 border-t flex items-center justify-between text-sm"
      >
        <div class="text-xs text-muted-foreground tabular-nums">
          {{ tablePageStart }}–{{ tablePageEnd }} / 총 {{ visibleBranches.length }}개 지점
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model.number="tablePageSize"
            class="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary"
          >
            <option v-for="n in tablePageSizeOptions" :key="n" :value="n">{{ n }}/page</option>
          </select>
          <button
            type="button"
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="tablePage <= 1"
            @click="tablePage--"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <span class="text-xs text-muted-foreground tabular-nums">
            {{ tablePage }} / {{ tableTotalPages }}
          </span>
          <button
            type="button"
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="tablePage >= tableTotalPages"
            @click="tablePage++"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
