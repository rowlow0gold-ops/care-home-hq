<script setup lang="ts">
/**
 * /tablet/schedule — 팀 스케쥴 (gantt-style day timeline).
 *
 *  ┌── Day pills (this week + next, swipe-friendly) ────┐
 *  ├── Hour grid 06 ─ 08 ─ 10 ─ 12 ─ 14 ─ 16 ─ 18 ─ 20 ─ 22
 *  │   each staff member = one horizontal row
 *  │   each shift        = an absolutely-positioned colored block
 *  └────────────────────────────────────────────────────┘
 *
 * Data comes from /v1/roster (same endpoint the HQ /schedule page and the
 * future Tauri desktop app consume — single source of truth).
 */
import { Users } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "팀 스케쥴 · 케어닥" });

const api = useTabletApi();
const { me } = useTablet();

interface RosterEntry {
  id: string; user_id: string; staff_name: string;
  shift_date: string; shift_start: string; shift_end: string;
  shift_hours: number; notes: string | null;
}

// 2 weeks: this Mon..Sun + next Mon..Sun
function toMonday(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const weekStart = toMonday(today);
const rangeEnd  = new Date(weekStart); rangeEnd.setDate(weekStart.getDate() + 13);
const startStr  = weekStart.toISOString().slice(0, 10);
const endStr    = rangeEnd.toISOString().slice(0, 10);

const { data: rows, pending } = await useAsyncData("tablet-roster", () =>
  api.get<RosterEntry[]>("/v1/roster", { start: startStr, end: endStr }),
);

// Day picker — 14 dates
interface DayPill { date: string; label: string; weekday: string; isToday: boolean; isWeekend: boolean }
const days = computed<DayPill[]>(() => {
  const out: DayPill[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: d.toLocaleDateString("ko-KR", { weekday: "short" }),
      isToday: key === todayStr,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return out;
});

const selectedDate = ref<string>(todayStr);
const dayEntries = computed(() =>
  (rows.value ?? []).filter(r => r.shift_date === selectedDate.value),
);

// Time axis: 06:00 → 22:00 (16h). Outside of this, clamp to the edges.
const HOUR_START = 6;
const HOUR_END   = 22;
const HOUR_SPAN  = HOUR_END - HOUR_START;

const hourTicks = [6, 8, 10, 12, 14, 16, 18, 20, 22];

function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) + ((m ?? 0) / 60);
}

interface PositionedShift extends RosterEntry {
  leftPct: number;
  widthPct: number;
  startH:  number;
  endH:    number;
  isMine:  boolean;
  isNight: boolean;
}

const positioned = computed<PositionedShift[]>(() =>
  dayEntries.value.map(r => {
    let s = parseHM(r.shift_start);
    let e = parseHM(r.shift_end);
    // Night shifts often end "next day" (e.g. 22:00 → 06:00). For the visual
    // grid we just clamp into the 06–22 window so something always shows.
    const wraps = e <= s;
    if (wraps) e = HOUR_END; // treat the visible portion as ending at 22
    const startC = Math.max(s, HOUR_START);
    const endC   = Math.min(e, HOUR_END);
    return {
      ...r,
      leftPct:  ((startC - HOUR_START) / HOUR_SPAN) * 100,
      widthPct: Math.max(2, ((endC - startC) / HOUR_SPAN) * 100),
      startH:  s, endH: e,
      isMine:  r.user_id === me.value?.id,
      isNight: wraps || s >= 18,
    };
  })
);

// Sort: mine first, then chronologically by start time, then name.
const sortedShifts = computed(() =>
  [...positioned.value].sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    if (a.startH !== b.startH) return a.startH - b.startH;
    return a.staff_name.localeCompare(b.staff_name, "ko");
  }),
);

// Position of the "now" line on the timeline (only when viewing today)
const nowOffset = computed<number | null>(() => {
  if (selectedDate.value !== todayStr) return null;
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < HOUR_START || h > HOUR_END) return null;
  return ((h - HOUR_START) / HOUR_SPAN) * 100;
});
</script>

<template>
  <div class="max-w-4xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">팀 스케쥴</h1>
    <p class="text-sm text-muted-foreground mb-4">
      <span v-if="selectedDate === todayStr">오늘</span>
      <span v-else>{{ new Date(selectedDate).toLocaleDateString("ko-KR", { dateStyle: "full" }) }}</span>
      ·
      {{ dayEntries.length }}명 근무
    </p>

    <!-- Day picker — horizontal scroll on mobile, wrapping on tablet -->
    <div class="-mx-5 px-5 mb-4 overflow-x-auto">
      <div class="flex gap-1.5 min-w-max pb-1">
        <button
          v-for="d in days" :key="d.date"
          type="button"
          class="h-14 w-14 rounded-xl border flex flex-col items-center justify-center shrink-0 transition-colors"
          :class="d.date === selectedDate
            ? 'bg-primary text-primary-foreground border-primary'
            : d.isToday
              ? 'border-primary text-primary bg-primary/5'
              : d.isWeekend
                ? 'border-input bg-muted/30 text-muted-foreground'
                : 'border-input bg-card hover:bg-muted/30'"
          @click="selectedDate = d.date"
        >
          <span class="text-[10px] font-medium opacity-80">{{ d.weekday }}</span>
          <span class="text-base font-bold tabular-nums">{{ d.label }}</span>
        </button>
      </div>
    </div>

    <!-- Gantt timeline -->
    <div v-if="pending" class="py-12 text-center text-muted-foreground">불러오는 중…</div>
    <div v-else-if="sortedShifts.length === 0" class="py-12 text-center text-sm text-muted-foreground">
      이 날 예정된 근무가 없습니다.
    </div>
    <div v-else class="rounded-2xl border bg-card overflow-hidden">
      <!-- Hour axis -->
      <div class="relative h-8 border-b bg-muted/20 px-3">
        <div class="relative w-full h-full">
          <span
            v-for="h in hourTicks" :key="h"
            class="absolute -translate-x-1/2 top-1.5 text-[10px] font-medium text-muted-foreground tabular-nums"
            :style="{ left: `${((h - HOUR_START) / HOUR_SPAN) * 100}%` }"
          >{{ String(h).padStart(2, '0') }}</span>
        </div>
      </div>

      <!-- Rows -->
      <div class="relative px-3 py-2">
        <!-- Background gridlines -->
        <div class="absolute inset-y-0 left-3 right-3 flex pointer-events-none">
          <div
            v-for="h in hourTicks" :key="h"
            class="absolute top-0 bottom-0 w-px bg-border/40"
            :style="{ left: `${((h - HOUR_START) / HOUR_SPAN) * 100}%` }"
          />
        </div>

        <!-- 'Now' line (only on today) -->
        <div
          v-if="nowOffset !== null"
          class="absolute inset-y-0 w-0.5 bg-rose-500 z-10 pointer-events-none"
          :style="{ left: `calc(${nowOffset}% + 0.75rem)` }"
        >
          <span class="absolute -top-1 -left-2 text-[9px] font-bold text-rose-600 bg-card px-1 rounded">지금</span>
        </div>

        <ul class="relative space-y-1.5">
          <li
            v-for="s in sortedShifts" :key="s.id"
            class="relative h-9 rounded-md bg-muted/20"
          >
            <!-- Shift block -->
            <div
              class="absolute inset-y-0 rounded-md flex items-center px-2 text-white text-xs font-semibold overflow-hidden shadow-sm"
              :class="s.isMine
                ? 'bg-primary'
                : s.isNight
                  ? 'bg-indigo-500'
                  : 'bg-emerald-500'"
              :style="{ left: `${s.leftPct}%`, width: `${s.widthPct}%` }"
            >
              <span class="truncate">
                {{ s.staff_name }}
                <span class="opacity-80 ml-1 hidden sm:inline">{{ s.shift_start }}–{{ s.shift_end }}</span>
              </span>
            </div>
            <!-- Mine badge when off-screen -->
            <span
              v-if="s.isMine"
              class="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary ring-2 ring-card pointer-events-none"
            />
          </li>
        </ul>
      </div>

      <!-- Legend -->
      <div class="px-4 py-2 border-t bg-muted/10 flex items-center gap-3 text-[11px]">
        <span class="inline-flex items-center gap-1">
          <span class="h-2.5 w-2.5 rounded-sm bg-primary"></span>
          나
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>
          주간
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="h-2.5 w-2.5 rounded-sm bg-indigo-500"></span>
          야간
        </span>
        <span class="ml-auto text-muted-foreground inline-flex items-center gap-1">
          <Users class="h-3 w-3" /> 총 {{ sortedShifts.length }}명
        </span>
      </div>
    </div>

    <!-- Optional: list-style detail under the chart for fine grain -->
    <ul v-if="sortedShifts.length > 0" class="mt-4 space-y-1.5">
      <li
        v-for="s in sortedShifts" :key="`d-${s.id}`"
        class="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
        :class="s.isMine ? 'border-primary/40 bg-primary/5' : ''"
      >
        <span
          class="h-7 w-7 rounded-md inline-flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
          :class="s.isMine ? 'bg-primary' : s.isNight ? 'bg-indigo-500' : 'bg-emerald-500'"
        >{{ s.staff_name.charAt(0) }}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">{{ s.staff_name }}<span v-if="s.isMine" class="ml-1 text-primary text-xs">(나)</span></div>
          <div v-if="s.notes" class="text-[11px] text-muted-foreground truncate">{{ s.notes }}</div>
        </div>
        <div class="text-xs tabular-nums text-muted-foreground shrink-0">
          {{ s.shift_start }} ~ {{ s.shift_end }} ({{ s.shift_hours }}h)
        </div>
      </li>
    </ul>
  </div>
</template>
