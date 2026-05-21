<script setup lang="ts">
import { AlertTriangle, ClipboardList } from "lucide-vue-next";

useHead({ title: "케어 기록 · 케어닥 HQ" });

interface Resident {
  id: string;
  full_name: string;
  status: string;
  branch_id: string;
}
interface CareLog {
  id: string;
  resident_id: string;
  recorded_by: string;
  recorded_at: string;
  category: string;
  body: string;
  flagged: boolean;
  branch_id?: string;
}

const api = useApi();
const onlyFlagged = ref(false);
const categoryFilter = ref<string>("");
const categories = ["식사", "투약", "배설", "위생", "활동", "이상징후", "기타"];

// 1) fetch all residents (server doesn't have a tenant-wide /care-logs endpoint yet)
const { data: residents } = await useAsyncData("care-log-residents", () =>
  api.get<Resident[]>("/v1/residents"),
);

// 2) fan out per-resident care log fetches in parallel
const { data: rawLogs, pending } = await useAsyncData(
  "care-logs-all",
  async () => {
    const rs = residents.value ?? [];
    const results = await Promise.all(
      rs.slice(0, 50).map((r) =>
        api
          .get<CareLog[]>(`/v1/residents/${r.id}/care-logs`)
          .then((logs) => logs.map((l) => ({ ...l, _residentName: r.full_name })))
          .catch(() => []),
      ),
    );
    return results.flat();
  },
);

const filtered = computed(() => {
  let rows = (rawLogs.value ?? []) as Array<CareLog & { _residentName: string }>;
  if (onlyFlagged.value) rows = rows.filter((l) => l.flagged);
  if (categoryFilter.value) rows = rows.filter((l) => l.category === categoryFilter.value);
  return rows.sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  );
});

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="px-8 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold">케어 기록</h1>
      <p class="text-sm text-muted-foreground">
        전 지점 케어 기록 통합 피드. 이상징후로 표시된 항목은 자동으로 텔레그램이 전송됩니다.
      </p>
    </header>

    <Card>
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input v-model="onlyFlagged" type="checkbox" class="rounded border-input">
          이상징후만 보기
        </label>
        <select
          v-model="categoryFilter"
          class="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">전체 카테고리</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <div class="ml-auto text-xs text-muted-foreground">
          {{ filtered.length }}건 (최근 50명 어르신 기준)
        </div>
      </div>

      <div v-if="pending" class="py-8 text-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
      <ul v-else-if="filtered.length" class="divide-y">
        <li v-for="log in filtered.slice(0, 200)" :key="log.id" class="py-3 flex items-start gap-3">
          <AlertTriangle
            v-if="log.flagged"
            class="h-4 w-4 text-destructive flex-shrink-0 mt-1"
          />
          <ClipboardList v-else class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="font-medium text-sm">{{ log._residentName }}</span>
              <span class="text-xs font-medium uppercase text-muted-foreground">
                {{ log.category }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ fmtTime(log.recorded_at) }}
              </span>
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
        조건에 맞는 기록이 없습니다.
      </div>
    </Card>
  </div>
</template>
