<script setup lang="ts">
/**
 * /tablet/schedule — 2주(Biweekly) 근무표 · 데스크톱 SchedulePage 와 같은 디자인.
 *
 * 14일을 7×2 그리드로 보여준다. 셀에는 날짜 + 총 인원 칩 + 근무 블록 배지
 * (12D / 12N / 8주 / 8오 / 8야). 셀 탭 → 모달에서 블록별 이름 칩을 본다.
 *
 * 읽기 전용. 발행/수정은 HQ 웹 또는 데스크톱에서.
 */
import { ChevronLeft, ChevronRight, Users, X, Loader2 } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "근무표 · 케어닥" });

const api = useTabletApi();

interface RosterEntry {
  id: string; user_id: string; staff_name: string;
  shift_date: string; shift_start: string; shift_end: string;
  shift_hours: number; notes: string | null;
}

// ─── Date helpers ───────────────────────────────────────────────────────────
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}
const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// 2-week window anchored on Sunday 2026-01-04, same as Tauri desktop so dates
// always line up across surfaces.
const EPOCH = new Date(2026, 0, 4);
function periodStartOf(d: Date): Date {
  const days = Math.floor(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - EPOCH.getTime()) / 86400000,
  );
  const idx = Math.floor(days / 14);
  return addDays(EPOCH, idx * 14);
}

// ─── Shift blocks (verbatim copy of desktop's BLOCKS so colors match) ───────
interface Block {
  key: string; group: string; shift: string; label: string; short: string;
  start: string; end: string; hours: number;
  bg: string; fg: string;
}
const BLOCKS: Block[] = [
  { key: "d12", group: "h12", shift: "day",     label: "12시간 Day 07:00–19:30",   short: "12D", start: "07:00", end: "19:30", hours: 12.5, bg: "bg-amber-100 dark:bg-amber-900/40",   fg: "text-amber-900 dark:text-amber-200"  },
  { key: "n12", group: "h12", shift: "night",   label: "12시간 Night 19:00–07:30", short: "12N", start: "19:00", end: "07:30", hours: 12.5, bg: "bg-indigo-100 dark:bg-indigo-900/40", fg: "text-indigo-900 dark:text-indigo-200"},
  { key: "d8",  group: "h8",  shift: "day",     label: "8시간 주간 07:00–15:00",   short: "8주", start: "07:00", end: "15:00", hours: 8,    bg: "bg-emerald-100 dark:bg-emerald-900/40", fg: "text-emerald-900 dark:text-emerald-200" },
  { key: "e8",  group: "h8",  shift: "evening", label: "8시간 오후 15:00–23:00",   short: "8오", start: "15:00", end: "23:00", hours: 8,    bg: "bg-orange-100 dark:bg-orange-900/40", fg: "text-orange-900 dark:text-orange-200" },
  { key: "n8",  group: "h8",  shift: "night",   label: "8시간 야간 23:00–07:00",   short: "8야", start: "23:00", end: "07:00", hours: 8,    bg: "bg-sky-100 dark:bg-sky-900/40",       fg: "text-sky-900 dark:text-sky-200" },
];
function classify(e: RosterEntry): Block {
  const b = BLOCKS.find(x => x.start === e.shift_start && x.end === e.shift_end);
  if (b) return b;
  const sh = Number(e.shift_start.slice(0, 2));
  if (e.shift_hours >= 12) return sh < 12 ? BLOCKS[0]! : BLOCKS[1]!;
  return sh < 12 ? BLOCKS[2]! : sh < 20 ? BLOCKS[3]! : BLOCKS[4]!;
}

// ─── State ──────────────────────────────────────────────────────────────────
const periodStart = ref<Date>(periodStartOf(new Date()));
const periodDays = computed(() => Array.from({ length: 14 }, (_, i) => addDays(periodStart.value, i)));
const periodEnd  = computed(() => addDays(periodStart.value, 13));
const weeks      = computed(() => [periodDays.value.slice(0, 7), periodDays.value.slice(7, 14)]);
const periodLabel = computed(() => {
  const a = periodStart.value, b = periodEnd.value;
  return `${a.getFullYear()}.${a.getMonth() + 1}.${a.getDate()} ~ ${b.getMonth() + 1}.${b.getDate()}`;
});
const todayStr = computed(() => localDateStr(new Date()));

const loading = ref(false);
const entries = ref<RosterEntry[]>([]);

async function loadEntries() {
  loading.value = true;
  try {
    entries.value = await api.get<RosterEntry[]>("/v1/roster", {
      start: localDateStr(periodStart.value),
      end:   localDateStr(periodEnd.value),
    });
  } catch {
    entries.value = [];
  } finally {
    loading.value = false;
  }
}
onMounted(() => loadEntries());
watch(periodStart, () => loadEntries());

function prev()    { periodStart.value = addDays(periodStart.value, -14); }
function next()    { periodStart.value = addDays(periodStart.value,  14); }
function goToday() { periodStart.value = periodStartOf(new Date()); }

// ─── Display indexes ────────────────────────────────────────────────────────
const byDate = computed<Map<string, Map<string, RosterEntry[]>>>(() => {
  const m = new Map<string, Map<string, RosterEntry[]>>();
  for (const e of entries.value) {
    const b = classify(e);
    if (!m.has(e.shift_date)) m.set(e.shift_date, new Map());
    const dm = m.get(e.shift_date)!;
    if (!dm.has(b.key)) dm.set(b.key, []);
    dm.get(b.key)!.push(e);
  }
  return m;
});
function blockCount(ds: string, key: string): number {
  return byDate.value.get(ds)?.get(key)?.length ?? 0;
}
function dayTotal(ds: string): number {
  let n = 0;
  byDate.value.get(ds)?.forEach(v => { n += v.length; });
  return n;
}
function dayBlocks(ds: string): Array<{ block: Block; list: RosterEntry[] }> {
  const dm = byDate.value.get(ds);
  if (!dm) return [];
  return BLOCKS.filter(b => dm.has(b.key)).map(b => ({
    block: b,
    list: [...dm.get(b.key)!].sort((a, c) => a.staff_name.localeCompare(c.staff_name, "ko")),
  }));
}

// Period totals — caregiver headcount + total shift count (small header chip).
const totalShifts = computed(() => entries.value.length);
const uniquePeople = computed(() => new Set(entries.value.map(e => e.user_id)).size);

// ─── Day modal ──────────────────────────────────────────────────────────────
const dayDialog = ref(false);
const dayDs     = ref<string>("");
const dayLabelFor = (ds: string) => {
  if (!ds) return "";
  const d = new Date(ds + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_KO[d.getDay()]})`;
};
const dayLabel = computed(() => dayLabelFor(dayDs.value));
function openDay(d: Date) {
  dayDs.value = localDateStr(d);
  dayDialog.value = true;
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-3 sm:px-5 py-5">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <h1 class="text-xl sm:text-2xl font-bold flex-1 min-w-0">근무표 <span class="text-xs font-normal text-muted-foreground ml-1">2주</span></h1>
      <button
        type="button"
        class="h-9 px-3 rounded-md border border-input bg-card text-xs font-medium hover:bg-muted"
        @click="goToday"
      >이번 기간</button>
      <button class="h-9 w-9 rounded-md hover:bg-muted inline-flex items-center justify-center" @click="prev">
        <ChevronLeft class="h-4 w-4" />
      </button>
      <div class="text-sm font-semibold tabular-nums px-1 min-w-[10.5rem] text-center">{{ periodLabel }}</div>
      <button class="h-9 w-9 rounded-md hover:bg-muted inline-flex items-center justify-center" @click="next">
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>

    <!-- Tiny summary line (read-only on tablet, no publish action) -->
    <div class="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
      <span class="inline-flex items-center gap-1"><Users class="h-3.5 w-3.5" /> {{ uniquePeople }}명 · 근무 {{ totalShifts }}건</span>
      <span v-if="loading" class="inline-flex items-center gap-1"><Loader2 class="h-3 w-3 animate-spin" /> 불러오는 중…</span>
    </div>

    <!-- Day-of-week header -->
    <div class="grid grid-cols-7 border border-b-0 rounded-t-xl overflow-hidden bg-card">
      <div
        v-for="(d, i) in DAY_KO" :key="d"
        class="text-center text-[11px] sm:text-xs font-semibold py-1.5"
        :class="i === 0 ? 'text-rose-600 dark:text-rose-300'
               : i === 6 ? 'text-sky-600 dark:text-sky-300'
                         : 'text-muted-foreground'"
      >{{ d }}</div>
    </div>

    <!-- 2-week grid -->
    <div class="border border-t-0 rounded-b-xl overflow-hidden bg-card">
      <div v-for="(week, wi) in weeks" :key="wi" class="grid grid-cols-7">
        <button
          v-for="d in week" :key="localDateStr(d)"
          type="button"
          class="day-cell text-left p-1.5 sm:p-2 border-t border-l first:border-l-0 hover:bg-muted/40 transition-colors"
          :class="{
            'today-ring': localDateStr(d) === todayStr,
          }"
          @click="openDay(d)"
        >
          <div class="flex items-center justify-between mb-1">
            <span
              class="text-[11px] sm:text-xs font-bold tabular-nums"
              :class="d.getDay() === 0 ? 'text-rose-600 dark:text-rose-300'
                    : d.getDay() === 6 ? 'text-sky-600 dark:text-sky-300'
                                       : 'text-foreground'"
            >{{ d.getMonth() + 1 }}/{{ d.getDate() }}</span>
            <span
              v-if="dayTotal(localDateStr(d))"
              class="text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground"
            >{{ dayTotal(localDateStr(d)) }}</span>
          </div>
          <template v-if="dayTotal(localDateStr(d))">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="b in BLOCKS" :key="b.key"
                v-show="blockCount(localDateStr(d), b.key)"
                class="text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded"
                :class="[b.bg, b.fg]"
              >{{ b.short }} {{ blockCount(localDateStr(d), b.key) }}</span>
            </div>
          </template>
          <div v-else class="text-[10px] text-muted-foreground/60 mt-2 text-center">발행 전</div>
        </button>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-1.5 mt-3">
      <span
        v-for="b in BLOCKS" :key="b.key"
        class="text-[10px] font-semibold px-2 py-0.5 rounded"
        :class="[b.bg, b.fg]"
      >{{ b.short }} = {{ b.label }}</span>
    </div>

    <!-- Day modal -->
    <div
      v-if="dayDialog"
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="dayDialog = false"
    >
      <div class="bg-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border shadow-xl max-h-[80vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between gap-2">
          <div class="text-base font-bold truncate">
            {{ dayLabel }}
            <span class="text-xs font-normal text-muted-foreground ml-1">근무 {{ dayTotal(dayDs) }}명</span>
          </div>
          <button class="h-9 w-9 rounded-md hover:bg-muted inline-flex items-center justify-center" @click="dayDialog = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div v-if="!dayBlocks(dayDs).length" class="py-10 text-center text-sm text-muted-foreground">
            발행된 근무가 없습니다.
          </div>
          <div v-for="{ block, list } in dayBlocks(dayDs)" :key="block.key">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="[block.bg, block.fg]">{{ block.label }}</span>
              <span class="text-[11px] text-muted-foreground">{{ list.length }}명</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="e in list" :key="e.id"
                class="text-xs px-2 py-1 rounded-full bg-muted text-foreground"
              >{{ e.staff_name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.day-cell {
  min-height: 72px;
  background: transparent;
}
@media (min-width: 640px) {
  .day-cell { min-height: 104px; }
}
.today-ring {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
  border-radius: 2px;
}
</style>
