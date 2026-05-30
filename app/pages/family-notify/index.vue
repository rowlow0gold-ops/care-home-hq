<script setup lang="ts">
/**
 * /family-notify — Scheduler landing.
 *
 * Single unified view of upcoming sends, both 정기 (auto monthly) and
 * 비정기 (custom event). Click any row → picker page for that batch.
 *
 * 정기 batches are synthesized client-side (this month + next 5 months);
 * 비정기 batches come from family_send_events.
 */
import {
  Send, Calendar, CalendarHeart, Plus, X, Loader2, AlertCircle,
  ChevronRight, Trash2, CheckCircle2,
} from "@lucide/vue";

useHead({ title: "가족 알림 · 케어닥 HQ" });

interface FamilyEvent {
  id:             string;
  name:           string;
  kind:           "regular" | "custom";
  year_month:     string | null;
  tag:            string | null;
  scheduled_date: string;
  status:         "scheduled" | "sent" | "cancelled";
  created_at:     string;
  sent_at:        string | null;
  photo_count:    number;
  picked_count:   number;
}

const api    = useApi();
const router = useRouter();
const toast  = useToast();

// ─── Filter: 종류 (kind) ───────────────────────────────────────────────────
type Kind = "all" | "regular" | "custom";
const kindFilter = ref<Kind>("all");

// ─── All batches (정기 + 비정기) come from family_send_events ───────────────
const { data: events, refresh: refreshEvents } = await useAsyncData(
  "scheduler-events",
  () => api.get<FamilyEvent[]>("/v1/events"),
);
onActivated(refreshEvents);

interface ScheduleRow {
  kind:           Kind;
  id:             string;
  name:           string;
  scheduled_date: string;
  status:         "scheduled" | "sent" | "cancelled";
  photo_count:    number;
  picked_count:   number;
  goto:           string;
  sendable:       boolean;
  send_endpoint:  () => Promise<{ queued: number }>;
}

const allRows = computed<ScheduleRow[]>(() =>
  (events.value ?? []).map<ScheduleRow>((e) => ({
    kind:           e.kind,
    id:             e.id,
    name:           e.name,
    scheduled_date: e.scheduled_date,
    status:         e.status,
    photo_count:    e.photo_count,
    picked_count:   e.picked_count,
    goto: e.kind === "regular" && e.year_month
      ? `/family-notify/month/${e.year_month}`
      : `/family-notify/event/${e.id}`,
    // 정기 fires automatically on its scheduled date — no manual send.
    // 비정기 needs HQ to push 발송 (cron auto-fire is a follow-up).
    sendable: e.kind === "custom" && e.status === "scheduled" && e.picked_count > 0,
    send_endpoint: () => api.post(`/v1/photos/send-event/${e.id}`, {}),
  })),
);

const filteredRows = computed(() =>
  allRows.value
    .filter((r) => kindFilter.value === "all" || r.kind === kindFilter.value)
    // Sort by 발송 예정일 DESC — most recent / upcoming on top
    .slice()
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)),
);

const sendingId = ref<string | null>(null);
async function sendNow(row: ScheduleRow) {
  if (sendingId.value) return;
  if (!confirm(`'${row.name}'의 ${row.picked_count}장을 가족 Telegram으로 즉시 발송합니다.`)) return;
  sendingId.value = row.id;
  try {
    const r = await row.send_endpoint();
    toast.success(`${r.queued}건 발송 요청 완료`);
    await refreshEvents();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "발송 실패", "오류");
  } finally {
    sendingId.value = null;
  }
}

// ─── 비정기 추가 ───────────────────────────────────────────────────────────
// 비정기 events have a tag — caregivers see this tag in the tablet upload
// list, and photos tagged with it become part of this event's batch.
// Defaults to "next month, day 1". Inline the date math (avoid TDZ).
const _customNext = (() => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
})();
const yearOpts  = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2];
})();
const monthOpts = Array.from({ length: 12 }, (_, i) => i + 1);
const newOpen = ref(false);
const newEvent = reactive({
  name: "",
  tag:  "",
  year:  _customNext.getFullYear(),
  month: _customNext.getMonth() + 1,
  day:   1,
});
const customDayOpts = computed(() => {
  const max = new Date(newEvent.year, newEvent.month, 0).getDate();
  return Array.from({ length: max }, (_, i) => i + 1);
});
watch(customDayOpts, (opts) => {
  if (newEvent.day > opts.length) newEvent.day = opts.length;
});

const creating = ref(false);
async function createEvent() {
  if (creating.value) return;
  if (!newEvent.name.trim()) { toast.error("이벤트 이름을 입력해 주세요"); return; }
  const tagTrimmed = newEvent.tag.trim();
  if (!tagTrimmed) { toast.error("이벤트 태그를 입력해 주세요"); return; }
  if (tagTrimmed === "regular") { toast.error("'regular'은 사용할 수 없는 태그입니다"); return; }
  const d = `${newEvent.year}-${String(newEvent.month).padStart(2, "0")}-${String(newEvent.day).padStart(2, "0")}`;
  creating.value = true;
  try {
    await api.post("/v1/events", {
      kind: "custom",
      name: newEvent.name.trim(),
      tag:  tagTrimmed,
      scheduled_date: d,
    });
    toast.success("이벤트가 추가되었습니다");
    newEvent.name = "";
    newEvent.tag  = "";
    newOpen.value = false;
    await refreshEvents();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "추가 실패", "오류");
  } finally {
    creating.value = false;
  }
}

// 정기 batches are auto-created on the 1st of each month (worker cron, TBD).
// HQ doesn't add them manually anymore.
async function cancelEvent(row: ScheduleRow) {
  if (!confirm(`'${row.name}' 이벤트를 취소합니다. 진행할까요?`)) return;
  try {
    await api.patch(`/v1/events/${row.id}/cancel`, {});
    toast.success("이벤트 취소됨");
    await refreshEvents();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "취소 실패", "오류");
  }
}

// Visual tones
const kindTone: Record<Kind, string> = {
  all:     "",
  regular: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  custom:  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};
const kindLabel: Record<Kind, string> = {
  all: "전체", regular: "정기", custom: "비정기",
};
const statusTone: Record<ScheduleRow["status"], string> = {
  scheduled: "bg-primary/10 text-primary",
  ongoing:   "bg-primary/10 text-primary",
  sent:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground",
};
const statusLabel: Record<ScheduleRow["status"], string> = {
  scheduled: "예정",
  ongoing:   "예약중",
  sent:      "발송됨",
  cancelled: "취소",
};
</script>

<template>
  <div class="px-8 py-6 max-w-6xl mx-auto">
    <header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-2">
        <Send class="h-7 w-7 text-primary" />
        가족 알림 스케쥴러
      </h1>
      <button
        type="button"
        class="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
        @click="newOpen = true"
      >
        <Plus class="h-4 w-4" />
        비정기 추가
      </button>
    </header>

    <!-- Kind filter pills -->
    <div class="flex items-center gap-2 mb-4">
      <button
        v-for="k in (['all','regular','custom'] as Kind[])"
        :key="k"
        type="button"
        class="h-8 px-3 rounded-full text-xs font-medium transition-colors"
        :class="kindFilter === k
          ? 'bg-primary text-primary-foreground'
          : 'bg-card border border-input text-muted-foreground hover:bg-muted'"
        @click="kindFilter = k"
      >
        {{ kindLabel[k] }}
      </button>
      <span class="text-xs text-muted-foreground ml-2 tabular-nums">
        총 {{ filteredRows.length }}개 일정
      </span>
    </div>

    <div v-if="loadingBatches && monthBatches.length === 0" class="space-y-3">
      <Skeleton h="4rem" />
      <Skeleton h="4rem" />
      <Skeleton h="4rem" />
    </div>

    <div
      v-else-if="filteredRows.length === 0"
      class="rounded-2xl border bg-card p-16 text-center"
    >
      <Calendar class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
      <p class="text-sm text-muted-foreground">조건에 맞는 일정이 없습니다.</p>
    </div>

    <div v-else class="rounded-xl border bg-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">종류</th>
            <th class="py-3 px-3 font-medium">이름</th>
            <th class="py-3 px-3 font-medium">발송 예정일</th>
            <th class="py-3 px-3 font-medium">상태</th>
            <th class="py-3 px-3 font-medium text-right">예약/대상</th>
            <th class="py-3 px-6 font-medium text-right">액션</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredRows"
            :key="row.id"
            class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
            @click="router.push(row.goto)"
          >
            <td class="py-3 px-6">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="kindTone[row.kind]"
              >
                <Calendar v-if="row.kind === 'regular'" class="h-3 w-3" />
                <CalendarHeart v-else class="h-3 w-3" />
                {{ kindLabel[row.kind] }}
              </span>
            </td>
            <td class="py-3 px-3 font-medium">{{ row.name }}</td>
            <td class="py-3 px-3 tabular-nums text-muted-foreground">{{ row.scheduled_date }}</td>
            <td class="py-3 px-3">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                :class="statusTone[row.status]"
              >
                <CheckCircle2 v-if="row.status === 'sent'" class="h-3 w-3" />
                {{ statusLabel[row.status] }}
              </span>
            </td>
            <td class="py-3 px-3 text-right tabular-nums text-sm">
              <span class="font-semibold text-primary">{{ row.picked_count }}</span>
              <span class="text-muted-foreground"> 장 / {{ row.photo_count }}{{ row.kind === 'regular' ? '명' : '장' }}</span>
            </td>
            <td class="py-3 px-6 text-right">
              <div class="inline-flex items-center gap-1.5" @click.stop>
                <button
                  v-if="row.sendable"
                  type="button"
                  class="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1 hover:bg-primary/90 disabled:opacity-50"
                  :disabled="sendingId === row.id"
                  @click="sendNow(row)"
                >
                  <Loader2 v-if="sendingId === row.id" class="h-3 w-3 animate-spin" />
                  <Send v-else class="h-3 w-3" />
                  발송
                </button>
                <button
                  v-if="row.kind === 'custom' && row.status === 'scheduled'"
                  type="button"
                  class="h-8 px-2 rounded-md border border-destructive/40 text-destructive text-xs inline-flex items-center gap-1 hover:bg-destructive/10"
                  @click="cancelEvent(row)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
                <NuxtLink
                  :to="row.goto"
                  class="h-8 px-2.5 rounded-md border border-input bg-background text-xs inline-flex items-center gap-1 hover:bg-muted"
                  @click.stop
                >
                  관리
                  <ChevronRight class="h-3 w-3" />
                </NuxtLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 비정기 추가 modal -->
    <Teleport to="body">
      <div
        v-if="newOpen"
        class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="newOpen = false"
      >
        <div class="bg-card text-foreground rounded-xl shadow-2xl border max-w-md w-full p-5">
          <div class="flex items-start gap-3 mb-4">
            <div class="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10 text-primary">
              <CalendarHeart class="h-5 w-5" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-base font-semibold">비정기 이벤트 추가</h2>
            </div>
            <button
              type="button"
              class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
              @click="newOpen = false"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <form class="space-y-4" @submit.prevent="createEvent">
            <FieldRow label="이벤트 이름" required>
              <input
                v-model="newEvent.name"
                type="text"
                placeholder="예: 어버이날 2026"
                class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
            </FieldRow>
            <FieldRow label="이벤트 태그" required hint="태블릿 캐어워커가 사진 업로드 시 선택하는 태그 (영문/숫자, 공백없이 — 예: parents_day_2026)">
              <input
                v-model="newEvent.tag"
                type="text"
                placeholder="예: parents_day_2026"
                class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
            </FieldRow>
            <FieldRow label="발송 예정일" required>
              <div class="flex items-center gap-2">
                <select
                  v-model.number="newEvent.year"
                  class="h-10 w-28 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                >
                  <option v-for="y in yearOpts" :key="y" :value="y">{{ y }}년</option>
                </select>
                <select
                  v-model.number="newEvent.month"
                  class="h-10 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                >
                  <option v-for="m in monthOpts" :key="m" :value="m">{{ m }}월</option>
                </select>
                <select
                  v-model.number="newEvent.day"
                  class="h-10 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                >
                  <option v-for="d in customDayOpts" :key="d" :value="d">{{ d }}일</option>
                </select>
              </div>
            </FieldRow>
            <div class="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                class="h-10 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted"
                :disabled="creating"
                @click="newOpen = false"
              >
                취소
              </button>
              <button
                type="submit"
                class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
                :disabled="creating"
              >
                <Loader2 v-if="creating" class="h-4 w-4 animate-spin" />
                추가
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
