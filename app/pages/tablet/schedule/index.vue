<script setup lang="ts">
/**
 * /tablet/schedule — 팀 스케쥴.
 * Read-only view of this branch's roster for the current week + the
 * 2 weeks following. HQ-side managers do the writes; tablet just shows.
 */
import { Users } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "팀 스케쥴 · 케어닥" });

const api = useTabletApi();

interface RosterEntry {
  id: string; user_id: string; staff_name: string;
  shift_date: string; shift_start: string; shift_end: string;
  shift_hours: number; notes: string | null;
}

// Show this Mon → 21 days
function toMonday(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
const today    = new Date();
const start    = toMonday(today);
const end      = new Date(start); end.setDate(start.getDate() + 20);
const startStr = start.toISOString().slice(0, 10);
const endStr   = end.toISOString().slice(0, 10);

const { data: rows, pending } = await useAsyncData("tablet-roster", () =>
  api.get<RosterEntry[]>("/v1/roster", { start: startStr, end: endStr }),
);

// Group by date
const byDate = computed(() => {
  const map = new Map<string, RosterEntry[]>();
  for (const r of rows.value ?? []) {
    if (!map.has(r.shift_date)) map.set(r.shift_date, []);
    map.get(r.shift_date)!.push(r);
  }
  return map;
});

const days = computed(() => {
  const out: { date: string; label: string; weekday: string; isToday: boolean; entries: RosterEntry[] }[] = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      date: key,
      label: d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
      weekday: d.toLocaleDateString("ko-KR", { weekday: "short" }),
      isToday: key === today.toISOString().slice(0, 10),
      entries: byDate.value.get(key) ?? [],
    });
  }
  return out;
});
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">팀 스케쥴</h1>
    <p class="text-sm text-muted-foreground mb-5">이번 주 부터 3주간 · 우리 센터</p>

    <div v-if="pending" class="py-12 text-center text-muted-foreground">불러오는 중…</div>
    <div v-else class="space-y-3">
      <div
        v-for="d in days" :key="d.date"
        class="rounded-xl border bg-card overflow-hidden"
        :class="d.isToday ? 'border-primary' : ''"
      >
        <div
          class="px-4 py-2 flex items-center justify-between"
          :class="d.isToday ? 'bg-primary text-primary-foreground' : 'bg-muted/30'"
        >
          <div class="font-semibold text-sm">
            {{ d.label }} ({{ d.weekday }})
            <span v-if="d.isToday" class="ml-1 text-[10px] font-medium opacity-90">오늘</span>
          </div>
          <span class="text-xs tabular-nums opacity-90">
            {{ d.entries.length }}명
          </span>
        </div>
        <ul v-if="d.entries.length > 0" class="divide-y">
          <li v-for="r in d.entries" :key="r.id" class="px-4 py-2 flex items-center gap-3">
            <Users class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="text-sm font-medium flex-1 truncate">{{ r.staff_name }}</span>
            <span class="text-xs tabular-nums text-muted-foreground shrink-0">
              {{ r.shift_start }} ~ {{ r.shift_end }} ({{ r.shift_hours }}h)
            </span>
          </li>
        </ul>
        <div v-else class="px-4 py-3 text-xs text-muted-foreground italic">
          예정된 근무가 없습니다.
        </div>
      </div>
    </div>
  </div>
</template>
