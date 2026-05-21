<script setup lang="ts">
import { Sun, Sunset, Moon, MapPin, UserCheck, Loader2 } from "@lucide/vue";

useHead({ title: "근무 일정 · 케어닥 HQ" });

interface OnDuty {
  assignment_id: string;
  branch_id: string;
  branch_name: string;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  user_id: string;
  user_name: string;
  user_role: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
}

interface Branch {
  id: string;
  name: string;
  resident_count: number;
}

const api = useApi();
const date = ref(new Date().toISOString().slice(0, 10));
const branchFilter = ref<string>("");

const { data: dashboard } = await useAsyncData("schedule-dash", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: rows, pending, refresh } = await useAsyncData(
  "shifts-today",
  () =>
    api.get<OnDuty[]>("/v1/shifts/today", {
      date: date.value,
      branch_id: branchFilter.value || undefined,
    }),
  { watch: [date, branchFilter] },
);

// Group by branch then shift
const grouped = computed(() => {
  const out = new Map<string, Map<string, OnDuty[]>>();
  for (const r of rows.value ?? []) {
    if (!out.has(r.branch_id)) out.set(r.branch_id, new Map());
    const m = out.get(r.branch_id)!;
    const key = r.shift_code;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(r);
  }
  return out;
});

const shiftOrder = ["morning", "evening", "night"];
const shiftIcon: Record<string, any> = { morning: Sun, evening: Sunset, night: Moon };
const shiftTone: Record<string, string> = {
  morning: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900",
  evening: "bg-orange-50 text-orange-900 border-orange-200 dark:bg-orange-950/30 dark:text-orange-100 dark:border-orange-900",
  night:   "bg-indigo-50 text-indigo-900 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-100 dark:border-indigo-900",
};

function branchName(id: string) {
  return dashboard.value?.branches.find((b) => b.id === id)?.name ?? "—";
}

// Coverage summary
const summary = computed(() => {
  const all = rows.value ?? [];
  return {
    total: all.length,
    morning: all.filter((r) => r.shift_code === "morning").length,
    evening: all.filter((r) => r.shift_code === "evening").length,
    night: all.filter((r) => r.shift_code === "night").length,
    on_leave: all.filter((r) => r.status === "on_leave").length,
  };
});
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">근무 일정</h1>
        <p class="text-sm text-muted-foreground mt-1">24시간 3교대 · 주간 06–14 / 저녁 14–22 / 야간 22–06</p>
      </div>
      <div class="flex items-center gap-2">
        <Input v-model="date" type="date" class="w-40" />
        <select
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </div>
    </header>

    <!-- Coverage summary -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      <div class="rounded-xl border bg-card p-4">
        <div class="text-xs text-muted-foreground">총 배정</div>
        <div class="text-2xl font-bold mt-1 tabular-nums">{{ summary.total }}</div>
      </div>
      <div class="rounded-xl border bg-amber-50/40 dark:bg-amber-950/20 p-4">
        <div class="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <Sun class="h-3 w-3" /> 주간
        </div>
        <div class="text-2xl font-bold mt-1 tabular-nums">{{ summary.morning }}</div>
      </div>
      <div class="rounded-xl border bg-orange-50/40 dark:bg-orange-950/20 p-4">
        <div class="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300">
          <Sunset class="h-3 w-3" /> 저녁
        </div>
        <div class="text-2xl font-bold mt-1 tabular-nums">{{ summary.evening }}</div>
      </div>
      <div class="rounded-xl border bg-indigo-50/40 dark:bg-indigo-950/20 p-4">
        <div class="flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-300">
          <Moon class="h-3 w-3" /> 야간
        </div>
        <div class="text-2xl font-bold mt-1 tabular-nums">{{ summary.night }}</div>
      </div>
      <div class="rounded-xl border bg-card p-4">
        <div class="text-xs text-muted-foreground">휴가</div>
        <div class="text-2xl font-bold mt-1 tabular-nums">{{ summary.on_leave }}</div>
      </div>
    </div>

    <!-- Loading / empty / data -->
    <div v-if="pending" class="space-y-3">
      <Skeleton v-for="i in 4" :key="i" h="6rem" />
    </div>

    <div v-else-if="(rows ?? []).length === 0" class="rounded-xl border bg-card p-12 text-center">
      <Loader2 class="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p class="text-sm text-muted-foreground">{{ date }}에 배정된 근무가 없습니다.</p>
      <p class="text-xs text-muted-foreground mt-1">관리자 페이지에서 시프트 배정을 추가하세요.</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="[branchId, shifts] in grouped"
        :key="branchId"
        class="rounded-xl border bg-card overflow-hidden"
      >
        <div class="px-6 py-3 border-b flex items-center gap-2">
          <MapPin class="h-4 w-4 text-primary" />
          <span class="font-semibold">{{ branchName(branchId) }}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
          <div
            v-for="code in shiftOrder"
            :key="code"
            class="p-4"
          >
            <div class="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-md border text-xs font-medium" :class="shiftTone[code]">
              <component :is="shiftIcon[code]" class="h-3.5 w-3.5" />
              <span>{{ code === "morning" ? "주간 06–14" : code === "evening" ? "저녁 14–22" : "야간 22–06" }}</span>
              <span class="ml-auto opacity-70">{{ (shifts.get(code) ?? []).length }}명</span>
            </div>
            <ul class="space-y-1.5">
              <li
                v-for="a in shifts.get(code) ?? []"
                :key="a.assignment_id"
                class="flex items-center gap-2 text-sm"
              >
                <UserCheck class="h-3.5 w-3.5 text-muted-foreground" />
                <span>{{ a.user_name }}</span>
                <span class="text-[10px] text-muted-foreground ml-auto">{{ a.user_role }}</span>
              </li>
              <li v-if="(shifts.get(code) ?? []).length === 0" class="text-xs text-muted-foreground italic py-2">
                — 배정 없음 —
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
