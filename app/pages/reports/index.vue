<script setup lang="ts">
import { CheckCircle2, AlertCircle, Loader2, Download } from "@lucide/vue";

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

interface Branch {
  id: string;
  name: string;
}

const api = useApi();

const { data: dashboard } = await useAsyncData("rpt-dashboard", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: runs } = await useAsyncData("billing-runs", () =>
  api.get<BillingRun[]>("/v1/billing/runs"),
);

// Filters for the history list
const filterBranch = ref<string>(useDefaultBranch());
const filterStatus = ref<string>("");
const filterYearMonth = ref<string>("");

const branchById = computed(() => {
  const m = new Map<string, string>();
  for (const b of dashboard.value?.branches ?? []) m.set(b.id, b.name);
  return m;
});

const filteredRuns = computed(() => {
  let arr = runs.value ?? [];
  if (filterBranch.value) arr = arr.filter((r) => r.branch_id === filterBranch.value);
  if (filterStatus.value) arr = arr.filter((r) => r.status === filterStatus.value);
  if (filterYearMonth.value) arr = arr.filter((r) => r.year_month.startsWith(filterYearMonth.value));
  return arr;
});

function fmtKRW(n: number | null) {
  if (n === null) return "—";
  return `₩${n.toLocaleString("ko-KR")}`;
}

// Download the generated XLSX. Goes through the Nuxt proxy so the JWT cookie
// is attached automatically and the browser handles the filename / save dialog.
const downloadingId = ref<string | null>(null);
const downloadError = ref<string | null>(null);
async function downloadXlsx(run: BillingRun) {
  if (!run.has_xlsx || downloadingId.value) return;
  downloadingId.value = run.id;
  downloadError.value = null;
  try {
    const res = await fetch(`/api/v1/billing/runs/${run.id}/xlsx`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const branchName = branchById.value.get(run.branch_id) ?? "branch";
    const fallback = `LTCI_청구_${branchName}_${run.year_month}.xlsx`;
    // Prefer the filename from Content-Disposition (server already encodes 한글)
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="([^"]+)"/i.exec(cd);
    const filename = m ? decodeURIComponent(m[1]) : fallback;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
      <p class="text-sm text-muted-foreground">
        월별 장기요양보험(LTCI) 청구 이력. 청구서 생성은 데스크톱 앱에서, 완료된 XLSX는
        아래에서 다운로드 후 국민건강보험공단 포털에 직접 업로드하세요.
      </p>
    </header>

    <div v-if="downloadError" class="mb-4 text-sm text-destructive bg-destructive/10 p-2 rounded">
      {{ downloadError }}
    </div>

    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b">
        <h2 class="font-semibold">청구 이력</h2>
        <p class="text-sm text-muted-foreground mt-0.5">전체 이력 · 필터로 좁혀보기</p>
      </div>
      <div class="px-6 py-3 border-b flex flex-wrap gap-3 items-center bg-muted/20">
        <input
          v-model="filterYearMonth"
          placeholder="월 (2026-05)"
          class="h-9 px-3 rounded-lg border border-input bg-background text-sm w-36 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
        <select
          v-model="filterBranch"
          class="h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select
          v-model="filterStatus"
          class="h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 상태</option>
          <option value="completed">완료</option>
          <option value="running">처리중</option>
          <option value="queued">대기</option>
          <option value="failed">실패</option>
        </select>
        <div class="ml-auto text-xs text-muted-foreground tabular-nums">
          {{ filteredRuns.length }}건 / {{ (runs ?? []).length }}건
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
        <tbody>
          <tr v-for="r in filteredRuns" :key="r.id" class="border-t hover:bg-muted/30">
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
                v-if="r.has_xlsx"
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
          <tr v-if="filteredRuns.length === 0">
            <td colspan="7" class="py-12 text-center text-muted-foreground">
              {{ filterBranch || filterStatus || filterYearMonth ? "조건에 맞는 결과가 없습니다." : "청구 이력이 없습니다. 데스크톱 앱에서 첫 청구서를 생성하세요." }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
