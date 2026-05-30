<script setup lang="ts">
/**
 * /family-notify/schedule — 정기 발송 스케쥴러.
 *
 * Two fixed rules: 매월 정기 (월 단위) + 매주 정기 (주 단위).
 * HQ can:
 *   • Change the day of the period (inline select).
 *   • Activate / deactivate.
 *   • Save the day change via the 수정 button.
 *
 * No add / no delete — both rules always exist.
 */
import {
  CalendarDays, Loader2, ArrowLeft, Check, Power, Save,
} from "@lucide/vue";

useHead({ title: "정기 스케쥴러 · 가족 알림" });

interface Schedule {
  id:              string;
  name:            string;
  period:          "monthly" | "weekly";
  day_of_period:   number;
  enabled:         boolean;
  last_run_at:     string | null;
  created_at:      string;
  updated_at:      string;
}

const api    = useApi();
const toast  = useToast();

const { data: schedules, refresh } = await useAsyncData(
  "family-schedules",
  () => api.get<Schedule[]>("/v1/schedules"),
);
onActivated(refresh);

// Local drafts keyed by id — lets user pick a new day before pressing 수정.
const drafts = reactive<Record<string, number>>({});
watch(schedules, (rows) => {
  for (const r of rows ?? []) {
    if (drafts[r.id] == null) drafts[r.id] = r.day_of_period;
  }
}, { immediate: true });

const monthly = computed(() => (schedules.value ?? []).find((s) => s.period === "monthly"));
const weekly  = computed(() => (schedules.value ?? []).find((s) => s.period === "weekly"));

const monthDayOpts = Array.from({ length: 28 }, (_, i) => i + 1);
const weekdayOpts  = [
  { v: 1, label: "월요일" },
  { v: 2, label: "화요일" },
  { v: 3, label: "수요일" },
  { v: 4, label: "목요일" },
  { v: 5, label: "금요일" },
  { v: 6, label: "토요일" },
  { v: 7, label: "일요일" },
];

const savingId   = ref<string | null>(null);
const togglingId = ref<string | null>(null);

async function save(s: Schedule) {
  if (savingId.value) return;
  const d = drafts[s.id];
  if (d === s.day_of_period) { toast.success("변경 사항 없음"); return; }
  savingId.value = s.id;
  try {
    await api.patch(`/v1/schedules/${s.id}`, { day_of_period: d });
    toast.success(`${s.name} 발송일 수정됨`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "수정 실패", "오류");
  } finally {
    savingId.value = null;
  }
}

async function toggle(s: Schedule) {
  if (togglingId.value) return;
  togglingId.value = s.id;
  try {
    await api.patch(`/v1/schedules/${s.id}`, { enabled: !s.enabled });
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "변경 실패", "오류");
  } finally {
    togglingId.value = null;
  }
}

function describe(s: Schedule, day: number): string {
  if (s.period === "monthly") {
    return `매월 ${day}일에 지난달 사진을 가족에게 자동 발송합니다.`;
  }
  const label = weekdayOpts.find((w) => w.v === day)?.label ?? "?";
  return `매주 ${label}에 지난주 사진을 가족에게 자동 발송합니다.`;
}
</script>

<template>
  <div class="px-8 py-6 max-w-4xl mx-auto">
    <NuxtLink
      to="/family-notify"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      스케쥴러
    </NuxtLink>

    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
        <CalendarDays class="h-6 w-6 text-primary" />
        정기 발송 스케쥴
      </h1>
      <p class="text-xs text-muted-foreground mt-1">
        매월/매주 자동으로 가족에게 사진을 발송하는 규칙을 설정합니다.
      </p>
    </header>

    <div class="space-y-4">
      <!-- 매월 정기 -->
      <div v-if="monthly" class="rounded-xl border bg-card p-5">
        <div class="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">{{ monthly.name }}</h2>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="monthly.enabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                  : 'bg-muted text-muted-foreground'"
              >
                <Check v-if="monthly.enabled" class="h-3 w-3" />
                {{ monthly.enabled ? '활성' : '비활성' }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground mt-1 tabular-nums">
              마지막 실행: {{ monthly.last_run_at ? new Date(monthly.last_run_at).toLocaleString('ko-KR') : '—' }}
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="h-9 px-3 rounded-md border border-input bg-background text-xs inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"
              :disabled="togglingId === monthly.id"
              @click="toggle(monthly)"
            >
              <Loader2 v-if="togglingId === monthly.id" class="h-3 w-3 animate-spin" />
              <Power v-else class="h-3 w-3" />
              {{ monthly.enabled ? '비활성화' : '활성화' }}
            </button>
          </div>
        </div>

        <div class="flex items-end gap-3 flex-wrap">
          <FieldRow label="발송일">
            <select
              v-model.number="drafts[monthly.id]"
              class="h-10 w-40 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option v-for="d in monthDayOpts" :key="d" :value="d">매월 {{ d }}일</option>
            </select>
          </FieldRow>
          <button
            type="button"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
            :disabled="savingId === monthly.id || drafts[monthly.id] === monthly.day_of_period"
            @click="save(monthly)"
          >
            <Loader2 v-if="savingId === monthly.id" class="h-4 w-4 animate-spin" />
            <Save v-else class="h-4 w-4" />
            수정
          </button>
        </div>
        <p class="text-xs text-muted-foreground mt-3">{{ describe(monthly, drafts[monthly.id] ?? monthly.day_of_period) }}</p>
      </div>

      <!-- 매주 정기 -->
      <div v-if="weekly" class="rounded-xl border bg-card p-5">
        <div class="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-semibold">{{ weekly.name }}</h2>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="weekly.enabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                  : 'bg-muted text-muted-foreground'"
              >
                <Check v-if="weekly.enabled" class="h-3 w-3" />
                {{ weekly.enabled ? '활성' : '비활성' }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground mt-1 tabular-nums">
              마지막 실행: {{ weekly.last_run_at ? new Date(weekly.last_run_at).toLocaleString('ko-KR') : '—' }}
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="h-9 px-3 rounded-md border border-input bg-background text-xs inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"
              :disabled="togglingId === weekly.id"
              @click="toggle(weekly)"
            >
              <Loader2 v-if="togglingId === weekly.id" class="h-3 w-3 animate-spin" />
              <Power v-else class="h-3 w-3" />
              {{ weekly.enabled ? '비활성화' : '활성화' }}
            </button>
          </div>
        </div>

        <div class="flex items-end gap-3 flex-wrap">
          <FieldRow label="발송 요일">
            <select
              v-model.number="drafts[weekly.id]"
              class="h-10 w-40 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option v-for="w in weekdayOpts" :key="w.v" :value="w.v">매주 {{ w.label }}</option>
            </select>
          </FieldRow>
          <button
            type="button"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
            :disabled="savingId === weekly.id || drafts[weekly.id] === weekly.day_of_period"
            @click="save(weekly)"
          >
            <Loader2 v-if="savingId === weekly.id" class="h-4 w-4 animate-spin" />
            <Save v-else class="h-4 w-4" />
            수정
          </button>
        </div>
        <p class="text-xs text-muted-foreground mt-3">{{ describe(weekly, drafts[weekly.id] ?? weekly.day_of_period) }}</p>
      </div>
    </div>
  </div>
</template>
