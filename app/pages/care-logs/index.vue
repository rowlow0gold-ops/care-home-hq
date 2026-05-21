<script setup lang="ts">
import { AlertTriangle, ClipboardList, Search } from "@lucide/vue";

useHead({ title: "케어 기록 · 케어닥 HQ" });

interface Resident { id: string; full_name: string; status: string; branch_id: string }
interface Branch { id: string; name: string }
interface CareLog {
  id: string;
  resident_id: string;
  recorded_by: string;
  recorded_at: string;
  category: string;
  body: string;
  flagged: boolean;
}

const api = useApi();
const onlyFlagged = ref(false);
const categoryFilter = ref<string>("");
const branchFilter = ref<string>("");
const q = ref("");
const debouncedQ = refDebounced(q, 250);
const categories = ["식사", "투약", "배설", "위생", "활동", "이상징후", "기타"];

const [{ data: residents }, { data: dashboard }] = await Promise.all([
  useAsyncData("care-log-residents", () => api.get<Resident[]>("/v1/residents")),
  useAsyncData("care-log-branches", () => api.get<{ branches: Branch[] }>("/v1/dashboard/summary")),
]);

const { data: rawLogs, pending } = await useAsyncData("care-logs-all", async () => {
  const rs = residents.value ?? [];
  const results = await Promise.all(
    rs.slice(0, 80).map((r) =>
      api
        .get<CareLog[]>(`/v1/residents/${r.id}/care-logs`)
        .then((logs) => logs.map((l) => ({ ...l, _residentName: r.full_name, _branchId: r.branch_id })))
        .catch(() => []),
    ),
  );
  return results.flat();
});

const branchById = computed(() => {
  const m = new Map<string, string>();
  for (const b of dashboard.value?.branches ?? []) m.set(b.id, b.name);
  return m;
});

const filtered = computed(() => {
  let rows = (rawLogs.value ?? []) as Array<CareLog & { _residentName: string; _branchId: string }>;
  if (onlyFlagged.value) rows = rows.filter((l) => l.flagged);
  if (categoryFilter.value) rows = rows.filter((l) => l.category === categoryFilter.value);
  if (branchFilter.value) rows = rows.filter((l) => l._branchId === branchFilter.value);
  if (debouncedQ.value) {
    const n = debouncedQ.value.toLowerCase();
    rows = rows.filter(
      (l) => l._residentName.toLowerCase().includes(n) || (l.body ?? "").toLowerCase().includes(n),
    );
  }
  return rows.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
});

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">케어 기록</h1>
      <p class="text-sm text-muted-foreground mt-1">
        전 지점 케어 기록 통합 피드. 이상징후로 표시된 항목은 자동으로 텔레그램이 전송됩니다.
      </p>
    </header>

    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="어르신 이름 또는 내용 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
        </div>
        <select
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select
          v-model="categoryFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 카테고리</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <label class="flex items-center gap-2 text-sm cursor-pointer px-3 h-10 rounded-lg border bg-background hover:bg-muted/40 transition-colors">
          <input v-model="onlyFlagged" type="checkbox" class="rounded border-input">
          이상징후만
        </label>
        <div class="ml-auto text-xs text-muted-foreground tabular-nums">
          {{ filtered.length }}건
        </div>
      </div>

      <div v-if="pending" class="py-12 text-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
      <ul v-else-if="filtered.length" class="divide-y">
        <li v-for="log in filtered.slice(0, 200)" :key="log.id" class="px-6 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
          <AlertTriangle
            v-if="log.flagged"
            class="h-4 w-4 text-destructive flex-shrink-0 mt-1"
          />
          <ClipboardList v-else class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="font-medium text-sm">{{ log._residentName }}</span>
              <span class="text-xs text-muted-foreground">· {{ branchById.get(log._branchId) }}</span>
              <span class="text-xs font-medium uppercase text-muted-foreground">{{ log.category }}</span>
              <span class="text-xs text-muted-foreground">{{ fmtTime(log.recorded_at) }}</span>
              <span
                v-if="log.flagged"
                class="text-[10px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 rounded px-1.5 py-0.5"
              >
                이상징후
              </span>
            </div>
            <p class="text-sm mt-0.5 whitespace-pre-wrap">{{ log.body }}</p>
          </div>
        </li>
      </ul>
      <div v-else class="py-12 text-center text-sm text-muted-foreground">
        <ClipboardList class="h-10 w-10 mx-auto mb-3 opacity-30" />
        조건에 맞는 기록이 없습니다.
      </div>
    </div>
  </div>
</template>
