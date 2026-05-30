<script setup lang="ts">
/**
 * /family-notify/schedule — 정기 발송 스케쥴러 (crontab-style rules).
 *
 * HQ defines recurring rules:
 *   • "매월 N일, 지난달 사진 발송"  (period='monthly', day_of_period=N)
 *   • "매주 N요일, 지난주 사진 발송" (period='weekly',  day_of_period=N, Mon=1)
 *
 * The cron worker (TBD) ticks daily and creates family_send_events when
 * today matches an enabled rule.
 */
import {
  Calendar, CalendarDays, Plus, X, Loader2, Trash2,
  ArrowLeft, Check, Power,
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

// ─── Add/Edit modal ───────────────────────────────────────────────────────
const open = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  name:          "",
  period:        "monthly" as "monthly" | "weekly",
  day_of_period: 1,
});
const submitting = ref(false);

function openAdd() {
  editingId.value      = null;
  form.name            = "";
  form.period          = "monthly";
  form.day_of_period   = 1;
  open.value = true;
}
function openEdit(s: Schedule) {
  editingId.value      = s.id;
  form.name            = s.name;
  form.period          = s.period;
  form.day_of_period   = s.day_of_period;
  open.value = true;
}

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

watch(() => form.period, (p) => {
  // Clamp day_of_period when switching
  if (p === "weekly" && form.day_of_period > 7) form.day_of_period = 1;
  if (p === "monthly" && form.day_of_period > 28) form.day_of_period = 1;
});

async function submit() {
  if (submitting.value) return;
  const n = form.name.trim();
  if (!n) { toast.error("이름을 입력해 주세요"); return; }
  submitting.value = true;
  try {
    if (editingId.value) {
      await api.patch(`/v1/schedules/${editingId.value}`, {
        name:          n,
        period:        form.period,
        day_of_period: form.day_of_period,
      });
      toast.success("스케쥴 수정됨");
    } else {
      await api.post("/v1/schedules", {
        name:          n,
        period:        form.period,
        day_of_period: form.day_of_period,
        enabled:       true,
      });
      toast.success("스케쥴 추가됨");
    }
    open.value = false;
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "저장 실패", "오류");
  } finally {
    submitting.value = false;
  }
}

const togglingId = ref<string | null>(null);
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

async function remove(s: Schedule) {
  if (!confirm(`'${s.name}' 스케쥴을 삭제합니다. 진행할까요?`)) return;
  try {
    await api.delete(`/v1/schedules/${s.id}`);
    toast.success("삭제됨");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "삭제 실패", "오류");
  }
}

function describe(s: Schedule): string {
  if (s.period === "monthly") {
    return `매월 ${s.day_of_period}일 — 지난달 사진을 가족에게 발송`;
  }
  const label = weekdayOpts.find((w) => w.v === s.day_of_period)?.label ?? "?";
  return `매주 ${label} — 지난주 사진을 가족에게 발송`;
}
</script>

<template>
  <div class="px-8 py-6 max-w-5xl mx-auto">
    <NuxtLink
      to="/family-notify"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      스케쥴러
    </NuxtLink>

    <header class="mb-6 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays class="h-6 w-6 text-primary" />
          정기 발송 스케쥴
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          매월/매주 자동으로 가족에게 사진을 발송하는 규칙을 설정합니다.
        </p>
      </div>
      <button
        type="button"
        class="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
        @click="openAdd"
      >
        <Plus class="h-4 w-4" />
        스케쥴 추가
      </button>
    </header>

    <div class="rounded-xl border bg-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">이름</th>
            <th class="py-3 px-3 font-medium">설명</th>
            <th class="py-3 px-3 font-medium">상태</th>
            <th class="py-3 px-3 font-medium">마지막 실행</th>
            <th class="py-3 px-6 font-medium text-right">액션</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in schedules ?? []"
            :key="s.id"
            class="border-t hover:bg-muted/40 transition-colors"
          >
            <td class="py-3 px-6 font-medium">
              <button class="hover:text-primary hover:underline underline-offset-2" @click="openEdit(s)">
                {{ s.name }}
              </button>
            </td>
            <td class="py-3 px-3 text-muted-foreground">{{ describe(s) }}</td>
            <td class="py-3 px-3">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                :class="s.enabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                  : 'bg-muted text-muted-foreground'"
              >
                <Check v-if="s.enabled" class="h-3 w-3" />
                {{ s.enabled ? '활성' : '비활성' }}
              </span>
            </td>
            <td class="py-3 px-3 text-xs text-muted-foreground tabular-nums">
              {{ s.last_run_at ? new Date(s.last_run_at).toLocaleString('ko-KR') : '—' }}
            </td>
            <td class="py-3 px-6 text-right">
              <div class="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  class="h-8 px-2.5 rounded-md border border-input bg-background text-xs inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"
                  :disabled="togglingId === s.id"
                  @click="toggle(s)"
                >
                  <Loader2 v-if="togglingId === s.id" class="h-3 w-3 animate-spin" />
                  <Power v-else class="h-3 w-3" />
                  {{ s.enabled ? '비활성화' : '활성화' }}
                </button>
                <button
                  type="button"
                  class="h-8 px-2 rounded-md border border-destructive/40 text-destructive text-xs inline-flex items-center gap-1 hover:bg-destructive/10"
                  @click="remove(s)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="(schedules?.length ?? 0) === 0">
            <td colspan="5" class="py-12 text-center text-muted-foreground">
              <Calendar class="h-10 w-10 mx-auto mb-3 opacity-30" />
              등록된 스케쥴이 없습니다.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit modal -->
    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="open = false"
      >
        <div class="bg-card text-foreground rounded-xl shadow-2xl border max-w-md w-full p-5">
          <div class="flex items-start gap-3 mb-4">
            <div class="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10 text-primary">
              <CalendarDays class="h-5 w-5" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-base font-semibold">{{ editingId ? '스케쥴 수정' : '스케쥴 추가' }}</h2>
            </div>
            <button type="button" class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" @click="open = false">
              <X class="h-4 w-4" />
            </button>
          </div>
          <form class="space-y-4" @submit.prevent="submit">
            <FieldRow label="이름" required>
              <input
                v-model="form.name"
                type="text"
                placeholder="예: 매월 정기"
                class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
            </FieldRow>
            <FieldRow label="주기" required>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 h-10 rounded-lg border text-sm font-medium transition-colors"
                  :class="form.period === 'monthly'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input bg-background hover:bg-muted'"
                  @click="form.period = 'monthly'"
                >
                  매월
                </button>
                <button
                  type="button"
                  class="flex-1 h-10 rounded-lg border text-sm font-medium transition-colors"
                  :class="form.period === 'weekly'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input bg-background hover:bg-muted'"
                  @click="form.period = 'weekly'"
                >
                  매주
                </button>
              </div>
            </FieldRow>
            <FieldRow v-if="form.period === 'monthly'" label="발송일" required>
              <select
                v-model.number="form.day_of_period"
                class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option v-for="d in monthDayOpts" :key="d" :value="d">매월 {{ d }}일</option>
              </select>
            </FieldRow>
            <FieldRow v-else label="발송 요일" required>
              <select
                v-model.number="form.day_of_period"
                class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option v-for="w in weekdayOpts" :key="w.v" :value="w.v">매주 {{ w.label }}</option>
              </select>
            </FieldRow>
            <div class="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <template v-if="form.period === 'monthly'">
                매월 {{ form.day_of_period }}일에 <strong class="text-foreground">지난달</strong> 사진을 가족에게 자동 발송합니다.
              </template>
              <template v-else>
                매주 {{ weekdayOpts.find(w => w.v === form.day_of_period)?.label }}에 <strong class="text-foreground">지난주</strong> 사진을 가족에게 자동 발송합니다.
              </template>
            </div>
            <div class="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                class="h-10 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted"
                :disabled="submitting"
                @click="open = false"
              >
                취소
              </button>
              <button
                type="submit"
                class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
                :disabled="submitting"
              >
                <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" />
                {{ editingId ? '수정' : '추가' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
