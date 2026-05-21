<script setup lang="ts">
import { Play, CheckCircle2, AlertCircle, Loader2 } from "@lucide/vue";

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
}

interface Branch {
  id: string;
  name: string;
}

const api = useApi();
const { me } = useAuth();

const { data: dashboard } = await useAsyncData("rpt-dashboard", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: runs, refresh } = await useAsyncData("billing-runs", () =>
  api.get<BillingRun[]>("/v1/billing/runs"),
);

// Default the year-month to last full month
function defaultYearMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const yearMonth = ref(defaultYearMonth());
const branchId = ref<string>("");
const submitting = ref(false);
const submitError = ref<string | null>(null);

// Branch managers can only trigger their own branch — preselect + lock
const isHq = computed(() => ["hq", "super_admin"].includes(me.value?.role ?? ""));
if (!isHq.value && me.value?.branch_id) {
  branchId.value = me.value.branch_id;
}

const branchById = computed(() => {
  const m = new Map<string, string>();
  for (const b of dashboard.value?.branches ?? []) m.set(b.id, b.name);
  return m;
});

async function triggerRun() {
  if (submitting.value) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const body: any = { year_month: yearMonth.value };
    if (isHq.value && branchId.value) body.branch_id = branchId.value;
    await api.post("/v1/billing/run", body);
    // Poll for ~10s for completion
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
      const latest = (runs.value ?? []).find(
        (r) => r.year_month === yearMonth.value,
      );
      if (latest?.status === "completed" || latest?.status === "failed") break;
    }
  } catch (err: any) {
    submitError.value =
      err?.data?.message ?? err?.statusMessage ?? "Failed to trigger run";
  } finally {
    submitting.value = false;
  }
}

function fmtKRW(n: number | null) {
  if (n === null) return "—";
  return `₩${n.toLocaleString("ko-KR")}`;
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
        월별 장기요양보험(LTCI) 청구서 생성. 완료된 XLSX는 텔레그램으로 전송됩니다.
      </p>
    </header>

    <Card title="월간 청구서 생성" class="mb-6">
      <div class="flex flex-wrap items-end gap-3">
        <div class="space-y-1">
          <Label for="ym">청구 월</Label>
          <Input id="ym" v-model="yearMonth" placeholder="2026-05" class="w-32" />
        </div>
        <div v-if="isHq" class="space-y-1">
          <Label for="branch">지점</Label>
          <select
            id="branch"
            v-model="branchId"
            class="h-10 px-3 rounded-md border border-input bg-background text-sm w-48"
          >
            <option value="">선택…</option>
            <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">
              {{ b.name }}
            </option>
          </select>
        </div>
        <Button :disabled="submitting" @click="triggerRun">
          <Play v-if="!submitting" class="h-4 w-4" />
          <Loader2 v-else class="h-4 w-4 animate-spin" />
          {{ submitting ? "처리 중..." : "청구서 생성" }}
        </Button>
      </div>
      <div v-if="submitError" class="mt-3 text-sm text-destructive bg-destructive/10 p-2 rounded">
        {{ submitError }}
      </div>
    </Card>

    <Card title="최근 청구 이력" description="최근 60건">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground border-b">
            <th class="py-2 pr-3 font-medium">월</th>
            <th class="py-2 pr-3 font-medium">지점</th>
            <th class="py-2 pr-3 font-medium">상태</th>
            <th class="py-2 pr-3 font-medium text-right">어르신</th>
            <th class="py-2 pr-3 font-medium text-right">합계</th>
            <th class="py-2 font-medium">시작 → 완료</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in runs ?? []" :key="r.id" class="border-b last:border-0">
            <td class="py-3 pr-3 font-medium">{{ r.year_month }}</td>
            <td class="py-3 pr-3">{{ branchById.get(r.branch_id) ?? "—" }}</td>
            <td class="py-3 pr-3">
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
            <td class="py-3 pr-3 text-right">{{ r.resident_count ?? "—" }}</td>
            <td class="py-3 pr-3 text-right">{{ fmtKRW(r.total_amount) }}</td>
            <td class="py-3 text-xs text-muted-foreground">
              {{ fmtTime(r.triggered_at) }} → {{ fmtTime(r.completed_at) }}
            </td>
          </tr>
          <tr v-if="(runs ?? []).length === 0">
            <td colspan="6" class="py-8 text-center text-muted-foreground">
              청구 이력이 없습니다. 위에서 첫 청구서를 생성하세요.
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>
