<script setup lang="ts">
import {
  CheckCircle2, AlertCircle, Loader2, Download, Search,
  Building2, ChevronLeft, ChevronRight,
} from "@lucide/vue";

// HQ can pivot across branches; 센터장 is locked to their own.
const { me } = useAuth();
const isHq = computed(
  () => me.value?.role === "hq" || me.value?.role === "super_admin",
);

useHead({ title: "보고서 · 케어닥 HQ" });

interface BillingRun {
  id: string;
  branch_id: string;
  year_month: string;
  triggered_at: string;
  completed_at: string | null;
  status: "queued" | "running" | "completed" | "failed";
  resident_count: number | null;
  total_amount: number | null;
  failure_reason: string | null;
  has_xlsx: boolean;
}
interface PagedRuns {
  items: BillingRun[];
  total: number;
  page: number;
  page_size: number;
}
interface Branch { id: string; name: string }

const api = useApi();

const { data: dashboard } = await useAsyncData("rpt-dashboard", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

// Draft filters (committed only when 검색 is clicked).
const filterBranch = ref<string>(useDefaultBranch());
const filterStatus = ref<string>("");
const now          = new Date();
const yearOptions  = Array.from({ length: 5 },  (_, i) => String(now.getFullYear() - i));
const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const filterYear   = ref<string>("");
const filterMonth  = ref<string>("");

const filterYearMonth = computed(() => {
  if (!filterYear.value)  return "";
  if (!filterMonth.value) return filterYear.value;
  return `${filterYear.value}-${filterMonth.value}`;
});

// Applied filters drive the server-side query.
const appliedBranch    = ref(filterBranch.value);
const appliedStatus    = ref(filterStatus.value);
const appliedYearMonth = ref<string>("");

const page     = ref(1);
const pageSize = ref(25);   // 페이지 기본값 25 (전사 공통)

function applyFilters() {
  appliedBranch.value    = filterBranch.value;
  appliedStatus.value    = filterStatus.value;
  appliedYearMonth.value = filterYearMonth.value;
  page.value = 1;
}

const { data: paged, pending, error, refresh } = await useAsyncData(
  "billing-runs-paged",
  () => api.get<PagedRuns>("/v1/billing/runs/paged", {
    year_month: appliedYearMonth.value || undefined,
    branch_id:  appliedBranch.value || undefined,
    status:     appliedStatus.value || undefined,
    page:       page.value,
    page_size:  pageSize.value,
  }),
  { watch: [appliedYearMonth, appliedBranch, appliedStatus, page, pageSize] },
);

const totalPages = computed(() =>
  Math.max(1, Math.ceil((paged.value?.total ?? 0) / pageSize.value)),
);
const showingFrom = computed(() =>
  paged.value && paged.value.total > 0 ? (page.value - 1) * pageSize.value + 1 : 0,
);
const showingTo = computed(() =>
  paged.value ? Math.min(page.value * pageSize.value, paged.value.total) : 0,
);

const branchById = computed(() => {
  const m = new Map<string, string>();
  for (const b of dashboard.value?.branches ?? []) m.set(b.id, b.name);
  return m;
});

function fmtKRW(n: number | null) {
  if (n === null) return "—";
  return `₩${n.toLocaleString("ko-KR")}`;
}

// XLSX download (generate-on-demand pattern matching cost-management)
const downloadingId = ref<string | null>(null);
const downloadError = ref<string | null>(null);
async function downloadXlsx(run: BillingRun) {
  if (downloadingId.value) return;
  downloadingId.value = run.id;
  downloadError.value = null;
  try {
    const res = await fetch(`/api/v1/billing/runs/${run.id}/xlsx`, { credentials: "include" });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const branchName = branchById.value.get(run.branch_id) ?? "branch";
    const fallback = `LTCI_청구_${branchName}_${run.year_month}.xlsx`;
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="([^"]+)"/i.exec(cd);
    const filename = m ? decodeURIComponent(m[1]) : fallback;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    downloadError.value = (e as Error).message;
  } finally {
    downloadingId.value = null;
  }
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const statusTone: Record<BillingRun["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-primary/10 text-primary",
  failed: "bg-destructive/10 text-destructive",
};
const statusLabel: Record<BillingRun["status"], string> = {
  queued: "대기",
  running: "처리중",
  completed: "완료",
  failed: "실패",
};
</script>

<template>
  <div class="px-8 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold">보고서</h1>
    </header>

    <div v-if="downloadError" class="mb-4 text-sm text-destructive bg-destructive/10 p-2 rounded">
      {{ downloadError }}
    </div>

    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b">
        <h2 class="font-semibold">청구 이력</h2>
      </div>
      <div class="px-6 py-3 border-b flex flex-wrap gap-2 items-center bg-muted/20">
        <select
          v-model="filterYear"
          class="h-9 w-28 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 연도</option>
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}년</option>
        </select>
        <select
          v-model="filterMonth"
          :disabled="!filterYear"
          class="h-9 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">전체 월</option>
          <option v-for="m in monthOptions" :key="m" :value="m">{{ parseInt(m, 10) }}월</option>
        </select>
        <select
          v-if="isHq"
          v-model="filterBranch"
          class="h-9 w-48 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <div
          v-else
          class="inline-flex items-center gap-1.5 h-9 w-48 px-3 rounded-lg border bg-muted/30 text-sm"
          title="본인 소속 지점 청구 이력만 조회할 수 있습니다"
        >
          <Building2 class="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span class="font-medium truncate">
            {{ dashboard?.branches?.find((b) => b.id === filterBranch)?.name ?? '내 지점' }}
          </span>
        </div>
        <select
          v-model="filterStatus"
          class="h-9 w-28 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 상태</option>
          <option value="completed">완료</option>
          <option value="running">처리중</option>
          <option value="queued">대기</option>
          <option value="failed">실패</option>
        </select>
        <button
          type="button"
          @click="applyFilters"
          :disabled="pending"
          aria-label="검색"
          title="검색"
          class="h-9 w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 inline-flex items-center justify-center disabled:opacity-60"
        >
          <Loader2 v-if="pending" class="h-3.5 w-3.5 animate-spin" />
          <Search v-else class="h-3.5 w-3.5" />
        </button>
        <div class="ml-auto text-xs text-muted-foreground tabular-nums">
          {{ showingFrom }}–{{ showingTo }} / {{ paged?.total ?? 0 }}건
        </div>
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">월</th>
            <th class="py-3 px-3 font-medium">지점</th>
            <th class="py-3 px-3 font-medium">상태</th>
            <th class="py-3 px-3 font-medium text-right">어르신</th>
            <th class="py-3 px-3 font-medium text-right">합계</th>
            <th class="py-3 px-3 font-medium">시작 → 완료</th>
            <th class="py-3 px-6 font-medium text-right">XLSX</th>
          </tr>
        </thead>
        <tbody v-if="pending && !paged">
          <!-- Skeleton rows on initial load -->
          <tr v-for="i in 8" :key="`sk-${i}`" class="border-t">
            <td class="py-3 px-6"><Skeleton w="4rem" /></td>
            <td class="py-3 px-3"><Skeleton w="6rem" /></td>
            <td class="py-3 px-3"><Skeleton w="3rem" /></td>
            <td class="py-3 px-3 text-right"><Skeleton w="2rem" class="ml-auto" /></td>
            <td class="py-3 px-3 text-right"><Skeleton w="5rem" class="ml-auto" /></td>
            <td class="py-3 px-3"><Skeleton w="8rem" /></td>
            <td class="py-3 px-6 text-right"><Skeleton w="4rem" class="ml-auto" /></td>
          </tr>
        </tbody>
        <tbody v-else-if="error">
          <tr><td colspan="7" class="py-12 text-center text-destructive">
            목록을 불러오지 못했습니다.
            <button class="underline ml-2" @click="refresh()">다시 시도</button>
          </td></tr>
        </tbody>
        <tbody v-else>
          <tr v-for="r in paged?.items ?? []" :key="r.id" class="border-t hover:bg-muted/30">
            <td class="py-3 px-6 font-medium tabular-nums">{{ r.year_month }}</td>
            <td class="py-3 px-3">{{ branchById.get(r.branch_id) ?? "—" }}</td>
            <td class="py-3 px-3">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                :class="statusTone[r.status]"
              >
                <CheckCircle2 v-if="r.status === 'completed'" class="h-3 w-3" />
                <AlertCircle v-else-if="r.status === 'failed'" class="h-3 w-3" />
                <Loader2 v-else class="h-3 w-3 animate-spin" />
                {{ statusLabel[r.status] }}
              </span>
            </td>
            <td class="py-3 px-3 text-right tabular-nums">{{ r.resident_count ?? "—" }}</td>
            <td class="py-3 px-3 text-right tabular-nums">{{ fmtKRW(r.total_amount) }}</td>
            <td class="py-3 px-3 text-xs text-muted-foreground">
              {{ fmtTime(r.triggered_at) }} → {{ fmtTime(r.completed_at) }}
            </td>
            <td class="py-3 px-6 text-right">
              <button
                v-if="r.status !== 'failed'"
                class="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-primary/40 bg-transparent text-primary text-xs font-semibold uppercase tracking-wide hover:bg-primary/10 hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="downloadingId === r.id"
                @click="downloadXlsx(r)"
              >
                <Loader2 v-if="downloadingId === r.id" class="h-3.5 w-3.5 animate-spin" />
                <Download v-else class="h-3.5 w-3.5" />
                다운로드
              </button>
              <span v-else class="text-xs text-muted-foreground">—</span>
            </td>
          </tr>
          <tr v-if="(paged?.items?.length ?? 0) === 0">
            <td colspan="7" class="py-12 text-center text-muted-foreground">
              조건에 맞는 결과가 없습니다.
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div
        v-if="(paged?.total ?? 0) > 0"
        class="px-6 py-3 border-t flex items-center justify-between text-sm"
      >
        <div class="text-xs text-muted-foreground">
          페이지 {{ paged?.page ?? 1 }} / {{ totalPages }}
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model.number="pageSize"
            class="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary"
          >
            <option :value="25">25/page</option>
            <option :value="50">50/page</option>
            <option :value="100">100/page</option>
          </select>
          <button
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page <= 1"
            @click="page--"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page >= totalPages"
            @click="page++"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
