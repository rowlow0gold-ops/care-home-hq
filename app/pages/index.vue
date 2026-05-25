<script setup lang="ts">
import {
  Users, AlertCircle, ClipboardList, UserCheck, Wallet, Building2, Filter,
  ChevronLeft, ChevronRight, ChevronRight as ChevRight,
} from "@lucide/vue";

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

// ----- Top-level filters: branch + date ----------------------------------
const { me } = useAuth();
const initialBranch =
  me.value?.role === "branch_manager" && me.value.branch_id
    ? me.value.branch_id
    : "";
const branchFilter = ref<string>(initialBranch);

// Date scope — only three presets: 이번 달 / 올해 / 전체 기간.
type DateScope = "month" | "year" | "all";
const dateScope = ref<DateScope>("month");

// Convert the scope into the YYYY-MM-DD `since` the API understands.
// "all" sends a very early date so the backend's `recorded_at >= $1` matches
// every record without needing a new SQL branch.
const sinceDate = computed<string>(() => {
  const now = new Date();
  if (dateScope.value === "month") {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (dateScope.value === "year") {
    return `${now.getFullYear()}-01-01`;
  }
  return "1970-01-01";
});

// Human-friendly window label for the KPI card and table header.
const sinceLabel = computed(() => {
  if (dateScope.value === "month") return "이번 달";
  if (dateScope.value === "year")  return "올해";
  return "전체 기간";
});

const [{ data, pending, error }, { data: runs }] = await Promise.all([
  useAsyncData(
    "dashboard",
    () => api.get<DashboardSummary>("/v1/dashboard/summary", { since: sinceDate.value }),
    { watch: [dateScope] },
  ),
  useAsyncData("billing-runs", () => api.get<BillingRun[]>("/v1/billing/runs")),
]);

// ----- 청구 매출 (respects top-level branch filter; no in-card controls) -
const completedRuns = computed(() =>
  (runs.value ?? []).filter((r) => r.status === "completed"),
);

const filteredBilling = computed(() => {
  let rows = completedRuns.value;
  if (branchFilter.value) rows = rows.filter((r) => r.branch_id === branchFilter.value);
  return rows;
});

const billingTotal = computed(() =>
  filteredBilling.value.reduce((acc, r) => acc + (r.total_amount ?? 0), 0),
);
const billingCount = computed(() => filteredBilling.value.length);

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

// KPI totals reflect the branch filter
const filteredTotals = computed(() => {
  const bs = visibleBranches.value;
  return {
    residents: bs.reduce((acc, b) => acc + b.resident_count, 0),
    incidents_7d: bs.reduce((acc, b) => acc + b.incidents_7d, 0),
    staff_total: bs.reduce((acc, b) => acc + b.staff_on_duty, 0),
    // tenant-wide value only meaningful when no branch filter
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
          since: sinceDate.value,
          ...(branchFilter.value ? { branch: branchFilter.value } : {}),
        },
      },
    },
    {
      key: "residents",
      label: "입소 어르신",
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
      label: "전체 직원",
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
      label: "확인 필요 케어 기록",
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
      <div class="flex items-center gap-2 flex-wrap">
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
          <option value="month">이번 달</option>
          <option value="year">올해</option>
          <option value="all">전체 기간</option>
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
            <span>청구 매출 합계 · <strong class="text-foreground">전체 기간</strong></span>
          </div>
          <div v-if="pending && !data" class="mt-2">
            <Skeleton w="14rem" h="2.5rem" />
          </div>
          <div v-else class="mt-2 text-4xl font-bold tabular-nums text-foreground">
            ₩{{ billingTotal.toLocaleString("ko-KR") }}
          </div>
          <div class="text-xs text-muted-foreground mt-1">
            <span v-if="branchFilter">
              {{ data?.branches?.find((b) => b.id === branchFilter)?.name ?? "—" }} ·
            </span>
            완료된 청구 {{ billingCount }}건
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
            <th class="py-3 px-3 font-medium text-right">입소</th>
            <th class="py-3 px-3 font-medium text-right">주간</th>
            <th class="py-3 px-3 font-medium text-right">방문</th>
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
