<script setup lang="ts">
/**
 * /tablet/schedule — 팀 스케쥴 (matches the Tauri desktop schedule design).
 *
 * Staff rows × Day columns, colored shift chips per cell. Toggle between
 * 주간 (Mon-Sun) and 월간 (full month grid). Read-only — managers do
 * writes from the HQ /schedule page or the Tauri desktop.
 *
 * Source endpoint: /v1/roster — same one the HQ web schedule and the
 * Tauri desktop use, so renders are consistent across surfaces.
 */
import { ChevronLeft, ChevronRight, Calendar, Users } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "팀 스케쥴 · 케어닥" });

const api    = useTabletApi();
const { me } = useTablet();

interface RosterEntry {
  id: string; user_id: string; staff_name: string;
  shift_date: string; shift_start: string; shift_end: string;
  shift_hours: number; notes: string | null;
}

// ─── Date helpers (mirrors the Tauri SchedulePage) ───────────────────────────
function localDateStr(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function weekMonday(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = c.getDay();
  c.setDate(c.getDate() + (dow === 0 ? -6 : 1 - dow));
  return c;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const todayStr   = computed(() => localDateStr(new Date()));
function isToday(d: Date) { return localDateStr(d) === todayStr.value; }

// ─── View toggle ──────────────────────────────────────────────────────────────
type ViewMode = "week" | "month";
const viewMode = ref<ViewMode>("week");

// ─── Week / Month navigation ──────────────────────────────────────────────────
const currentMonday = ref<Date>(weekMonday(new Date()));
const weekDates = computed<Date[]>(() =>
  Array.from({ length: 7 }, (_, i) => addDays(currentMonday.value, i)),
);
const weekStartStr = computed(() => localDateStr(weekDates.value[0]!));
const weekEndStr   = computed(() => localDateStr(weekDates.value[6]!));
function prevWeek() { currentMonday.value = addDays(currentMonday.value, -7); }
function nextWeek() { currentMonday.value = addDays(currentMonday.value,  7); }
function goToday() {
  currentMonday.value = weekMonday(new Date());
  currentMonth.value  = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
}
function weekLabel(): string {
  const s = weekDates.value[0]!, e = weekDates.value[6]!;
  const fmt = (d: Date) => d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  return `${fmt(s)} – ${fmt(e)}, ${e.getFullYear()}`;
}

const currentMonth = ref<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
function prevMonth() { currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1, 1); }
function nextMonth() { currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 1); }
function monthLabel(): string {
  return currentMonth.value.toLocaleDateString("ko-KR", { month: "long", year: "numeric" });
}
const monthStartStr = computed(() => localDateStr(currentMonth.value));
const monthEndStr   = computed(() => {
  const d = currentMonth.value;
  return localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
});
const monthGrid = computed<Date[][]>(() => {
  const year  = currentMonth.value.getFullYear();
  const month = currentMonth.value.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const gridStart = weekMonday(firstDay);
  const lastDow   = lastDay.getDay();
  const gridEnd   = addDays(lastDay, lastDow === 0 ? 0 : 7 - lastDow);
  const weeks: Date[][] = [];
  let cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
});

// ─── Data load ────────────────────────────────────────────────────────────────
const rangeStart = computed(() => viewMode.value === "week" ? weekStartStr.value  : monthStartStr.value);
const rangeEnd   = computed(() => viewMode.value === "week" ? weekEndStr.value    : monthEndStr.value);

const { data: rows, pending, refresh } = await useAsyncData<RosterEntry[]>(
  () => `tablet-roster-${viewMode.value}-${rangeStart.value}-${rangeEnd.value}`,
  () => api.get<RosterEntry[]>("/v1/roster", { start: rangeStart.value, end: rangeEnd.value }),
  { watch: [viewMode, rangeStart, rangeEnd] },
);

// Distinct staff for the week-view rows. We derive them from the roster
// itself so we don't fetch /staff just for names.
const staffRows = computed(() => {
  const seen = new Map<string, string>();
  for (const r of rows.value ?? []) seen.set(r.user_id, r.staff_name);
  return Array.from(seen.entries())
    .sort((a, b) => {
      // "Me" first.
      if (a[0] === me.value?.id) return -1;
      if (b[0] === me.value?.id) return  1;
      return a[1].localeCompare(b[1], "ko");
    })
    .map(([id, name]) => ({ id, name }));
});

// (staff_id, date) → entries
const cellMap = computed(() => {
  const m = new Map<string, RosterEntry[]>();
  for (const e of rows.value ?? []) {
    const k = `${e.user_id}-${e.shift_date}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(e);
  }
  return m;
});
function cellEntries(staffId: string, d: Date): RosterEntry[] {
  return cellMap.value.get(`${staffId}-${localDateStr(d)}`) ?? [];
}

// date → entries (for month view)
const dayMap = computed(() => {
  const m = new Map<string, RosterEntry[]>();
  for (const e of rows.value ?? []) {
    if (!m.has(e.shift_date)) m.set(e.shift_date, []);
    m.get(e.shift_date)!.push(e);
  }
  return m;
});
function dayEntries(d: Date): RosterEntry[] {
  return dayMap.value.get(localDateStr(d)) ?? [];
}

function shiftLabel(e: RosterEntry): string {
  return `${e.shift_start}–${e.shift_end} (${e.shift_hours}h)`;
}
function shiftColor(e: RosterEntry): "teal" | "blue" | "deep-orange" | "purple" {
  if (e.shift_hours >= 12) return "teal";
  if (e.shift_start === "07:00") return "blue";
  if (e.shift_start === "15:00") return "deep-orange";
  return "purple";
}
function weekHours(staffId: string): number {
  if (viewMode.value !== "week") return 0;
  return (rows.value ?? [])
    .filter(e => e.user_id === staffId)
    .reduce((sum, e) => sum + e.shift_hours, 0);
}

// Month-cell expand state (3 visible, then "더보기")
const expandedDays = ref(new Set<string>());
function toggleExpand(d: Date) {
  const k = localDateStr(d);
  const next = new Set(expandedDays.value);
  if (next.has(k)) next.delete(k); else next.add(k);
  expandedDays.value = next;
}
function isExpanded(d: Date): boolean { return expandedDays.value.has(localDateStr(d)); }
</script>

<template>
  <div class="px-4 py-5 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">팀 스케쥴</h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          내 팀 근무 일정 (읽기 전용)
        </p>
      </div>
      <div class="inline-flex rounded-lg border border-input bg-card overflow-hidden text-sm">
        <button
          type="button"
          class="px-4 h-10 font-medium"
          :class="viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          @click="viewMode = 'week'"
        >주간</button>
        <button
          type="button"
          class="px-4 h-10 font-medium border-l border-input"
          :class="viewMode === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          @click="viewMode = 'month'"
        >월간</button>
      </div>
    </div>

    <!-- Navigator -->
    <div class="flex items-center gap-2 mb-4">
      <button
        type="button"
        class="h-9 w-9 rounded-lg border border-input bg-card inline-flex items-center justify-center hover:bg-muted"
        @click="viewMode === 'week' ? prevWeek() : prevMonth()"
        :aria-label="viewMode === 'week' ? '이전 주' : '이전 달'"
      ><ChevronLeft class="h-4 w-4" /></button>
      <button
        type="button"
        class="h-9 w-9 rounded-lg border border-input bg-card inline-flex items-center justify-center hover:bg-muted"
        @click="viewMode === 'week' ? nextWeek() : nextMonth()"
        :aria-label="viewMode === 'week' ? '다음 주' : '다음 달'"
      ><ChevronRight class="h-4 w-4" /></button>
      <span class="text-base font-semibold mx-1">
        {{ viewMode === 'week' ? weekLabel() : monthLabel() }}
      </span>
      <button
        type="button"
        class="h-9 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted"
        @click="goToday"
      >오늘</button>
      <span v-if="pending" class="ml-auto text-xs text-muted-foreground">불러오는 중…</span>
    </div>

    <!-- ══ WEEK VIEW ══════════════════════════════════════════════════════════ -->
    <div v-if="viewMode === 'week'" class="overflow-x-auto rounded-xl border bg-card">
      <table class="w-full border-collapse" style="min-width: 720px;">
        <thead>
          <tr class="bg-muted/40 text-xs">
            <th class="text-left px-3 py-2 border-b border-r font-semibold w-36">직원</th>
            <th
              v-for="(d, di) in weekDates" :key="di"
              class="text-center px-2 py-2 border-b border-r last:border-r-0 font-semibold"
              :class="isToday(d) ? 'bg-blue-50 dark:bg-blue-950/30' : ''"
            >
              <div>{{ DAY_LABELS[di] }}</div>
              <div class="font-normal" :class="isToday(d) ? 'text-primary font-semibold' : 'text-muted-foreground'">
                {{ d.getMonth() + 1 }}/{{ d.getDate() }}
              </div>
            </th>
            <th class="text-center px-3 py-2 border-b border-l w-20 font-semibold">주간</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="staffRows.length === 0">
            <td :colspan="9" class="text-center py-12 text-muted-foreground text-sm">
              <Calendar class="h-8 w-8 mx-auto mb-2 opacity-40" />
              내 팀의 이번 주 근무 데이터가 없습니다.
            </td>
          </tr>
          <tr
            v-for="s in staffRows" :key="s.id"
            class="hover:bg-muted/20"
          >
            <td class="px-3 py-2 border-b border-r text-sm whitespace-nowrap">
              <Users class="h-3.5 w-3.5 inline-block mr-1 text-muted-foreground" />
              {{ s.name }}
              <span
                v-if="s.id === me?.id"
                class="ml-1 inline-block bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold"
              >나</span>
            </td>
            <td
              v-for="(d, di) in weekDates" :key="di"
              class="px-1.5 py-1.5 border-b border-r last:border-r-0 align-top"
              :class="isToday(d) ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''"
              style="min-height: 50px;"
            >
              <div
                v-for="e in cellEntries(s.id, d)" :key="e.id"
                class="shift-chip"
                :class="`shift-chip--${shiftColor(e)}`"
                :title="(e.notes ? `${shiftLabel(e)} · ${e.notes}` : shiftLabel(e))"
              >
                {{ shiftLabel(e) }}
              </div>
            </td>
            <td class="px-3 py-2 border-b border-l text-center text-sm tabular-nums">
              <span :class="weekHours(s.id) > 0 ? 'font-semibold' : 'text-muted-foreground/50'">
                {{ weekHours(s.id) > 0 ? weekHours(s.id) + 'h' : '—' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ══ MONTH VIEW ══════════════════════════════════════════════════════════ -->
    <div v-else class="rounded-xl border bg-card overflow-hidden">
      <div class="grid grid-cols-7 bg-muted/40 text-xs font-semibold text-center text-muted-foreground border-b">
        <div v-for="dl in DAY_LABELS" :key="dl" class="py-2">{{ dl }}</div>
      </div>
      <div class="grid grid-cols-7">
        <template v-for="(week, wi) in monthGrid" :key="wi">
          <div
            v-for="(d, di) in week" :key="di"
            class="border-r border-b last:border-r-0 p-1.5 min-h-[88px] bg-background"
            :class="[
              d.getMonth() !== currentMonth.getMonth() ? 'bg-muted/20' : '',
              isToday(d) ? 'bg-blue-50/60 dark:bg-blue-950/20' : '',
            ]"
          >
            <div class="text-xs font-semibold mb-1 flex items-center gap-1">
              <span
                class="inline-block px-1 min-w-[20px] text-center rounded-full"
                :class="[
                  isToday(d) ? 'bg-primary text-primary-foreground' : '',
                  d.getMonth() !== currentMonth.getMonth() ? 'text-muted-foreground/40' : '',
                ]"
              >{{ d.getDate() }}</span>
            </div>
            <template v-for="(e, ei) in dayEntries(d)" :key="e.id">
              <div
                v-if="isExpanded(d) || ei < 3"
                class="month-bar"
                :class="`shift-chip--${shiftColor(e)}`"
                :title="`${e.staff_name} · ${shiftLabel(e)}${e.notes ? ' · ' + e.notes : ''}`"
              >
                <span class="font-medium truncate flex-1">
                  {{ e.staff_name }}<span v-if="e.user_id === me?.id" class="ml-0.5">★</span>
                </span>
                <span class="opacity-70 ml-1 text-[10px]">{{ e.shift_start }}</span>
              </div>
            </template>
            <button
              v-if="dayEntries(d).length > 3"
              type="button"
              class="text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded px-1 py-0.5"
              @click="toggleExpand(d)"
            >
              {{ isExpanded(d) ? '▲ 접기' : `+${dayEntries(d).length - 3} 더보기` }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Legend -->
    <div class="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span class="inline-flex items-center gap-1">
        <span class="h-2.5 w-3 rounded shift-chip--teal" /> 12시간
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2.5 w-3 rounded shift-chip--blue" /> 오전
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2.5 w-3 rounded shift-chip--deep-orange" /> 오후
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2.5 w-3 rounded shift-chip--purple" /> 야간
      </span>
      <span class="ml-auto">★ = 나</span>
    </div>
  </div>
</template>

<style scoped>
/* Shared chip — same palette as the Tauri desktop schedule. */
.shift-chip {
  display: block;
  border-radius: 6px;
  padding: 3px 6px;
  margin-bottom: 3px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shift-chip--teal        { background: #ccfbf1; color: #0f766e; }
.shift-chip--blue        { background: #dbeafe; color: #1d4ed8; }
.shift-chip--deep-orange { background: #ffedd5; color: #c2410c; }
.shift-chip--purple      { background: #ede9fe; color: #6d28d9; }

:root.dark .shift-chip--teal        { background: rgba(20,184,166,0.18); color: #5eead4; }
:root.dark .shift-chip--blue        { background: rgba(59,130,246,0.18); color: #93c5fd; }
:root.dark .shift-chip--deep-orange { background: rgba(249,115,22,0.18); color: #fdba74; }
:root.dark .shift-chip--purple      { background: rgba(139,92,246,0.18); color: #c4b5fd; }

.month-bar {
  display: flex;
  align-items: center;
  border-radius: 4px;
  padding: 2px 5px;
  margin-bottom: 2px;
  font-size: 10px;
  line-height: 1.1;
  overflow: hidden;
}
</style>
