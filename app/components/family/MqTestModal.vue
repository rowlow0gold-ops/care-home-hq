<script setup lang="ts">
/**
 * MqTestModal — MQ pipeline test controller.
 *
 * Layout:
 *   Top:    scenario picker (4 buttons) + 실행 button
 *   Middle: unified runs list — each row has its own progress bar +
 *           status badge + retry button. Auto-refreshes every 2s while
 *           any row is still running.
 *   Bottom: DLQ panel (counts + global 재시도/비우기)
 */
import {
  X, FlaskConical, Loader2, CheckCircle2, AlertTriangle,
  CheckCheck, MinusCircle, XCircle, MessageSquare, RefreshCw,
  RotateCcw, Search, ChevronLeft, ChevronRight, Ban,
} from "@lucide/vue";

interface MqRun {
  id:                  string;
  event_id:            string | null;
  scenario:            string;
  status:              "queued" | "running" | "success" | "failed" | "dlq";
  queued_at:           string;
  consumed_at:         string | null;
  completed_at:        string | null;
  delivery_attempts:   number;
  last_error:          string | null;
  telegram_message_id: number | null;
  telegram_reply:      string | null;
  telegram_reply_at:   string | null;
  expected_count:      number;
  success_count:       number;
  failure_count:       number;
  failed_photo_ids:    string[];
}

const props = defineProps<{
  open:        boolean;
  eventId:     string | null;
  batchName:   string;
}>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const api   = useApi();
const toast = useToast();

const scenarios = [
  { id: "p100", label: "100% 성공", icon: CheckCheck,   hint: "모든 메시지를 관리자 Telegram으로 정상 전송. SVG는 자동 PNG 대체. N건 모두 성공." },
  { id: "p50",  label: "50% 성공",  icon: MinusCircle,  hint: "절반은 성공, 절반은 의도된 실패 → DLQ. 스마트 재시도 검증용." },
  { id: "p0",   label: "0% 성공",   icon: XCircle,      hint: "N건 모두 실패 → 3회 재시도 → DLQ. 재시도/복구 흐름 전체 검증." },
];

const selected = ref<string>("p100");
const firing   = ref(false);

// Master-mode event picker — populated lazily when modal opens in masterMode.
interface PickerEv { id: string; name: string; kind: string; status: string; scheduled_date?: string }
interface PickerPage { items: PickerEv[]; total: number; page: number; page_size: number }
const masterEvents      = ref<PickerEv[]>([]);
const masterEventId     = ref<string>("");
const masterEventsLoading = ref(false);
const masterEventsError = ref<string | null>(null);
async function loadMasterEvents() {
  if (masterEventsLoading.value) return;
  masterEventsLoading.value = true;
  masterEventsError.value = null;
  try {
    // /v1/events is paged. Pull a big page so the picker covers everything.
    const res = await api.get<PickerPage>("/v1/events", { page: 1, page_size: 200 });
    const items = res?.items ?? [];
    // Show every non-cancelled event; sort newest first so recent batches are on top.
    masterEvents.value = items
      .filter(e => e.status !== "cancelled")
      .sort((a, b) => (b.scheduled_date ?? "").localeCompare(a.scheduled_date ?? ""));
    if (masterEvents.value.length === 0) {
      masterEventsError.value = "표시할 이벤트가 없습니다.";
    }
  } catch (e: any) {
    masterEventsError.value = e?.data?.message ?? e?.message ?? "이벤트 목록을 불러오지 못했습니다";
  } finally {
    masterEventsLoading.value = false;
  }
}

// Paged + filtered runs list.
interface RunPage { items: MqRun[]; total: number; page: number; page_size: number }

const fScenario = ref<string>("");
const fStatus   = ref<string>("");
const fAppliedScenario = ref("");
const fAppliedStatus   = ref("");
const page      = ref(1);
const pageSize  = ref(10);
function applyFilters() {
  fAppliedScenario.value = fScenario.value;
  fAppliedStatus.value   = fStatus.value;
  page.value = 1;
}
watch(pageSize, () => { page.value = 1; });

// Unified UI: there's no longer a separate "master mode". Both the per-row
// [테스트] button and the 마스터 테스트 button open this same modal. The
// per-row button pre-fills the EVENT PICKER (대상 이벤트) so the next test
// fires against that event — but the executions list below is NEVER
// auto-filtered by the picker; it always shows every event's runs (its own
// scenario/status filters still work). This keeps the runs panel as a
// single global timeline.

const { data: paged, refresh: refreshHistory } = await useAsyncData<RunPage>(
  () => `mq-runs-${fAppliedScenario.value}-${fAppliedStatus.value}-${page.value}-${pageSize.value}`,
  () => api.get<RunPage>("/v1/mq-test/runs", {
    scenario:  fAppliedScenario.value || undefined,
    status:    fAppliedStatus.value || undefined,
    page:      page.value,
    page_size: pageSize.value,
  }),
  { watch: [fAppliedScenario, fAppliedStatus, page, pageSize], default: () => ({ items: [], total: 0, page: 1, page_size: 10 }), lazy: true },
);
const history     = computed(() => paged.value?.items ?? []);
const total       = computed(() => paged.value?.total ?? 0);
const totalPages  = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

// Poll while any row on the current page is queued/running.
let poller: ReturnType<typeof setInterval> | null = null;
function startPolling() {
  stopPolling();
  poller = setInterval(async () => {
    await refreshHistory();
    const stillRunning = (history.value ?? []).some(
      (r) => r.status === "queued" || r.status === "running",
    );
    if (!stillRunning) stopPolling();
  }, 2000);
}
function stopPolling() {
  if (poller) { clearInterval(poller); poller = null; }
}
watch(() => props.open, async (o) => {
  if (o) {
    // Per-row clicks pass an eventId — pre-fill the picker with it so the
    // executions list is auto-filtered. Master button passes null → empty
    // picker so the user sees every event's runs.
    masterEventId.value = props.eventId ?? "";
    // Always load the picker so the user can change events without closing.
    await loadMasterEvents();
    await refreshHistory();
    startPolling();
  } else {
    stopPolling();
  }
});
onUnmounted(stopPolling);

async function fire(scenario: string) {
  // Always reads from the picker (which the per-row button pre-fills).
  const targetEventId = masterEventId.value;
  if (!targetEventId) {
    toast.error("대상 이벤트를 먼저 선택하세요", "이벤트 필요");
    return;
  }
  if (firing.value) return;
  firing.value = true;
  try {
    const run = await api.post<MqRun>("/v1/mq-test/run", {
      event_id: targetEventId,
      scenario,
    });
    // Reset filters to default so the new run is visible.
    fScenario.value = ""; fAppliedScenario.value = "";
    fStatus.value   = ""; fAppliedStatus.value   = "";
    page.value = 1;
    await refreshHistory();
    startPolling();
    toast.success(
      `${scenarioLabel(scenario)} — ${run.expected_count ?? 1}건 큐에 넣음`,
      "🧪 MQ 테스트 시작",
    );
  } catch (e: any) {
    toast.error(e?.data?.message ?? "테스트 실행 실패", "오류");
  } finally {
    firing.value = false;
  }
}

const retryingId  = ref<string | null>(null);
const abortingId  = ref<string | null>(null);

// Two retry modes:
//   retryFailedRow → /retry-failed: only the photos that DIDN'T deliver
//                    (uses failed_photo_ids tracked by the worker)
//   retryAllRow    → /run: re-fire the WHOLE batch (every resident again)
// Both rewrite to p100 so retries always deliver — never inject new failures.
async function retryFailedRow(run: MqRun) {
  if (retryingId.value) return;
  if (run.failure_count === 0) {
    toast.error("실패한 항목이 없습니다", "재시도 불가");
    return;
  }
  retryingId.value = run.id;
  try {
    const newRun = await api.post<MqRun>(`/v1/mq-test/runs/${run.id}/retry-failed`, {});
    const tracked = (run.failed_photo_ids?.length ?? 0) > 0;
    toast.success(
      tracked
        ? `추적된 실패 ${run.failed_photo_ids.length}건 재전송 (${newRun.expected_count}건 큐)`
        : `legacy 폴백: 배치에서 ${newRun.expected_count}건 다시 선택`,
      "🎯 실패만 재시도",
    );
    afterRetry();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "실패만 재시도 실패", "오류");
  } finally {
    retryingId.value = null;
  }
}

async function retryAllRow(run: MqRun) {
  if (retryingId.value) return;
  if (!run.event_id) {
    toast.error("원본 이벤트가 없는 실행은 전체 재시도할 수 없습니다", "오류");
    return;
  }
  retryingId.value = run.id;
  try {
    const newRun = await api.post<MqRun>("/v1/mq-test/run", {
      event_id: run.event_id,
      scenario: "p100",
    });
    toast.success(`전체 ${newRun.expected_count}건 재실행`, "🔁 전체 재시도");
    afterRetry();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "전체 재시도 실패", "오류");
  } finally {
    retryingId.value = null;
  }
}

async function afterRetry() {
  // Jump back to page 1 with filters cleared so the freshly-created run is
  // visible (otherwise it appears at the top but the user might be paging
  // through older runs and never see the new progress bar).
  fScenario.value = ""; fAppliedScenario.value = "";
  fStatus.value   = ""; fAppliedStatus.value   = "";
  page.value = 1;
  await refreshHistory();
  startPolling();
}

// Strand-recovery — for runs stuck in queued/running (worker crash, broker
// hiccup). Marks the row failed so it stops blocking the operator's view.
async function abortRow(run: MqRun) {
  if (abortingId.value) return;
  if (!confirm(`정말 강제 종료하시겠습니까?\n진행중 ${run.expected_count - run.success_count - run.failure_count}건이 실패로 표시됩니다.`)) return;
  abortingId.value = run.id;
  try {
    await api.post<MqRun>(`/v1/mq-test/runs/${run.id}/abort`, {});
    await refreshHistory();
    toast.success("강제 종료됨", "🛑");
  } catch (e: any) {
    toast.error(e?.data?.message ?? "강제 종료 실패", "오류");
  } finally {
    abortingId.value = null;
  }
}

function scenarioLabel(id: string) {
  const hit = scenarios.find(s => s.id === id);
  if (hit) return hit.label;
  // Legacy run labels — older mq_test_runs rows still carry these.
  const legacy: Record<string, string> = {
    happy:        "100% 성공 (legacy)",
    force_fail:   "강제 실패 (legacy)",
    network_fail: "네트워크 장애 (legacy)",
    bad_image:    "잘못된 이미지 (legacy)",
  };
  return legacy[id] ?? id;
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ko-KR");
}
function statusBadge(s: string) {
  switch (s) {
    case "queued":  return { cls: "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-200",  txt: "대기" };
    case "running": return { cls: "bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-200",   txt: "진행중" };
    case "success": return { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200", txt: "성공" };
    case "failed":  return { cls: "bg-rose-100   text-rose-700   dark:bg-rose-900/30   dark:text-rose-200",   txt: "실패" };
    case "dlq":     return { cls: "bg-rose-200   text-rose-900   dark:bg-rose-900/40   dark:text-rose-100",   txt: "실패 (DLQ)" };
    default:        return { cls: "bg-muted text-muted-foreground", txt: s };
  }
}
function pct(num: number, denom: number): string {
  if (denom <= 0) return "0%";
  return `${Math.min(100, (num / denom) * 100)}%`;
}

const anyRunning = computed(() =>
  (history.value ?? []).some(r => r.status === "queued" || r.status === "running"),
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[130] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      @click.self="emit('update:open', false)"
    >
      <div class="bg-card text-foreground rounded-xl shadow-2xl border max-w-4xl w-full my-8 max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-start gap-3 p-5 border-b">
          <div class="h-10 w-10 rounded-full flex items-center justify-center bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            <FlaskConical class="h-5 w-5" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold">🧪 MQ 파이프라인 테스트</h2>
            <p class="text-sm text-muted-foreground mt-0.5">
              관리자 Telegram으로만 전송 · 이벤트별 필터 + 시나리오별 실행
              <span v-if="anyRunning" class="ml-2 inline-flex items-center gap-1 text-blue-600 dark:text-blue-300">
                <Loader2 class="h-3 w-3 animate-spin" />
                실시간 갱신중
              </span>
            </p>
          </div>
          <button type="button" class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" @click="emit('update:open', false)">
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <!-- Event picker — always visible. Per-row [테스트] pre-fills it. -->
          <div>
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center justify-between">
              <span>대상 이벤트 ({{ masterEvents.length }})</span>
              <button type="button" class="text-[10px] font-normal normal-case text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="masterEvents = []; loadMasterEvents()">
                <RefreshCw class="h-3 w-3" :class="masterEventsLoading ? 'animate-spin' : ''" />
                다시 불러오기
              </button>
            </h3>
            <div class="flex gap-2 mb-3">
              <select
                v-model="masterEventId"
                :disabled="masterEventsLoading || masterEvents.length === 0"
                class="h-10 flex-1 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">
                  <template v-if="masterEventsLoading">불러오는 중…</template>
                  <template v-else-if="masterEvents.length === 0">사용 가능한 이벤트 없음</template>
                  <template v-else>전체 이벤트 (필터 없음)</template>
                </option>
                <option v-for="e in masterEvents" :key="e.id" :value="e.id">
                  {{ e.name }} · {{ e.kind === 'regular' ? '정기' : '비정기' }}{{ e.scheduled_date ? ` · ${e.scheduled_date}` : '' }} · {{ e.status }}
                </option>
              </select>
              <button
                v-if="masterEventId"
                type="button"
                class="h-10 px-3 rounded-lg border border-input bg-background text-sm hover:bg-muted inline-flex items-center gap-1"
                title="필터 해제 — 전체 이벤트 보기"
                @click="masterEventId = ''"
              >
                <X class="h-3.5 w-3.5" />
                필터 해제
              </button>
            </div>
            <div v-if="masterEventsError" class="-mt-2 mb-3 text-[11px] text-rose-600 dark:text-rose-300">
              {{ masterEventsError }}
            </div>
          </div>

          <!-- Scenario picker — disabled until an event is chosen -->
          <div>
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
              시나리오
              <span v-if="!masterEventId" class="text-[10px] font-normal normal-case text-amber-600 dark:text-amber-300">
                먼저 위에서 대상 이벤트를 선택하세요
              </span>
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3" :class="!masterEventId ? 'opacity-50 pointer-events-none' : ''">
              <button
                v-for="s in scenarios" :key="s.id"
                type="button"
                class="text-left rounded-lg border p-3 transition-colors"
                :class="selected === s.id
                  ? 'border-primary bg-primary/5'
                  : 'border-input hover:bg-muted/40'"
                @click="selected = s.id"
              >
                <div class="flex items-center gap-2 font-semibold text-sm">
                  <component :is="s.icon" class="h-4 w-4" />
                  {{ s.label }}
                </div>
                <p class="text-[11px] text-muted-foreground mt-1.5 leading-snug">{{ s.hint }}</p>
              </button>
            </div>
            <button
              type="button"
              class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
              :disabled="firing || !masterEventId"
              @click="fire(selected)"
            >
              <Loader2 v-if="firing" class="h-4 w-4 animate-spin" />
              <FlaskConical v-else class="h-4 w-4" />
              실행 ({{ scenarioLabel(selected) }})
            </button>
          </div>

          <!-- Executed runs list (paged + filtered) -->
          <div>
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center justify-between">
              <span>실행된 시나리오</span>
              <button type="button" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 normal-case text-[10px] font-normal" @click="refreshHistory">
                <RefreshCw class="h-3 w-3" />
                새로고침
              </button>
            </h3>

            <!-- Filter bar -->
            <div class="rounded-lg border bg-muted/10 px-3 py-2 mb-2 flex flex-wrap items-center gap-2">
              <select v-model="fScenario" class="h-8 w-44 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary">
                <option value="">전체 시나리오</option>
                <option v-for="s in scenarios" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
              <select v-model="fStatus" class="h-8 w-32 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary">
                <option value="">전체 상태</option>
                <option value="queued">대기</option>
                <option value="running">진행중</option>
                <option value="success">성공</option>
                <option value="failed">실패</option>
                <option value="dlq">실패 (DLQ)</option>
              </select>
              <button
                type="button" @click="applyFilters"
                class="h-8 w-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center"
                title="필터 적용"
              >
                <Search class="h-3.5 w-3.5" />
              </button>
              <span class="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {{ total > 0 ? ((page - 1) * pageSize + 1) : 0 }}–{{ Math.min(page * pageSize, total) }} / 총 {{ total }}건
              </span>
            </div>

            <div class="rounded-lg border overflow-hidden">
              <div v-if="(history?.length ?? 0) === 0" class="py-12 text-center text-sm text-muted-foreground">
                <FlaskConical class="h-10 w-10 mx-auto mb-3 opacity-30" />
                조건에 맞는 실행 기록이 없습니다.
              </div>
              <ul v-else class="divide-y">
                <li v-for="r in history" :key="r.id" class="p-3 hover:bg-muted/30">
                  <div class="flex items-center justify-between gap-3 mb-2 flex-wrap">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <span class="text-sm font-semibold truncate">{{ scenarioLabel(r.scenario) }}</span>
                      <span
                        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0"
                        :class="statusBadge(r.status).cls"
                      >
                        <Loader2 v-if="r.status === 'running' || r.status === 'queued'" class="h-3 w-3 animate-spin" />
                        <CheckCircle2 v-else-if="r.status === 'success' && r.failure_count === 0" class="h-3 w-3" />
                        <AlertTriangle v-else-if="r.status === 'dlq' || r.failure_count > 0" class="h-3 w-3" />
                        {{ statusBadge(r.status).txt }}
                      </span>
                      <span class="text-[10px] text-muted-foreground tabular-nums shrink-0">{{ fmtTime(r.queued_at) }}</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <button
                        v-if="r.status === 'queued' || r.status === 'running'"
                        type="button"
                        class="h-7 px-2.5 rounded-md border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-200 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-950/50 disabled:opacity-50"
                        :disabled="abortingId === r.id"
                        :title="'멈춘 실행 강제 종료 (worker 다운 등)'"
                        @click="abortRow(r)"
                      >
                        <Loader2 v-if="abortingId === r.id" class="h-3 w-3 animate-spin" />
                        <Ban v-else class="h-3 w-3" />
                        강제 종료
                      </button>
                      <!-- 전체 재시도 — re-fire the whole batch from scratch -->
                      <button
                        v-if="r.event_id"
                        type="button"
                        class="h-7 px-2.5 rounded-md border border-input bg-background text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"
                        :disabled="retryingId === r.id || r.status === 'queued' || r.status === 'running'"
                        :title="`이 배치의 모든 ${r.expected_count}건을 다시 전송 (성공 여부 무관)`"
                        @click="retryAllRow(r)"
                      >
                        <Loader2 v-if="retryingId === r.id" class="h-3 w-3 animate-spin" />
                        <RotateCcw v-else class="h-3 w-3" />
                        전체 재시도
                      </button>
                      <!-- 실패만 재시도 — always rendered after 전체 재시도. Active
                           whenever failure_count > 0. If failed_photo_ids is
                           tracked the backend re-fires exactly those; for
                           legacy rows (no per-photo tracking) it falls back
                           to picking N=expected-success photos from the same
                           event batch. -->
                      <button
                        type="button"
                        class="h-7 px-2.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                        :class="r.failure_count > 0
                          ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950/50'
                          : 'border-input bg-background text-muted-foreground'"
                        :disabled="retryingId === r.id || r.status === 'queued' || r.status === 'running' || r.failure_count === 0"
                        :title="(r.failed_photo_ids?.length ?? 0) > 0
                          ? `실패한 ${r.failed_photo_ids.length}건만 다시 전송 (성공한 항목은 건너뜀)`
                          : r.failure_count > 0
                            ? `실패 ${r.failure_count}건만큼 재전송 (legacy: 같은 배치에서 N건 다시 선택)`
                            : '실패한 항목이 없습니다.'"
                        @click="retryFailedRow(r)"
                      >
                        <Loader2 v-if="retryingId === r.id" class="h-3 w-3 animate-spin" />
                        <RotateCcw v-else class="h-3 w-3" />
                        실패만 ({{ (r.failed_photo_ids?.length ?? 0) > 0 ? r.failed_photo_ids.length : r.failure_count }})
                      </button>
                    </div>
                  </div>

                  <!-- Per-row progress bar -->
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                      <div
                        class="bg-emerald-500 h-full transition-all"
                        :style="{ width: pct(r.success_count, r.expected_count) }"
                      />
                      <div
                        class="bg-rose-500 h-full transition-all"
                        :style="{ width: pct(r.failure_count, r.expected_count) }"
                      />
                    </div>
                    <span class="text-[11px] tabular-nums text-muted-foreground shrink-0 whitespace-nowrap">
                      <span class="text-emerald-700 dark:text-emerald-200">성공 <span class="font-semibold">{{ r.success_count }}</span></span>
                      <span class="opacity-50"> · </span>
                      <span class="text-rose-700 dark:text-rose-200">실패 <span class="font-semibold">{{ r.failure_count }}</span></span>
                      <span class="opacity-50"> · </span>
                      <span>전체 <span class="font-semibold">{{ r.expected_count }}</span></span>
                    </span>
                  </div>

                  <!-- Extra detail line (errors / telegram reply) -->
                  <div
                    v-if="r.last_error || r.telegram_reply"
                    class="mt-2 grid gap-1 text-[11px]"
                  >
                    <div
                      v-if="r.telegram_reply"
                      class="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 text-emerald-800 dark:text-emerald-200 inline-flex items-center gap-1"
                    >
                      <MessageSquare class="h-3 w-3 shrink-0" />
                      <span class="font-semibold">Bot 답장:</span>
                      <span class="truncate">{{ r.telegram_reply }}</span>
                    </div>
                    <div
                      v-if="r.last_error && r.failure_count > 0"
                      class="rounded bg-rose-50 dark:bg-rose-950/30 px-2 py-1 text-rose-800 dark:text-rose-200 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed"
                      :title="r.last_error"
                    >
                      {{ r.last_error }}
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Page controls (outside list so empty state doesn't show paginator) -->
            <div v-if="total > 0" class="flex items-center justify-between mt-3 text-xs">
              <div class="text-muted-foreground">페이지 {{ page }} / {{ totalPages }}</div>
              <div class="flex items-center gap-2">
                <select v-model.number="pageSize" class="h-7 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary">
                  <option :value="10">10/page</option>
                  <option :value="25">25/page</option>
                  <option :value="50">50/page</option>
                </select>
                <button class="h-7 w-7 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="page <= 1" @click="page--">
                  <ChevronLeft class="h-3.5 w-3.5" />
                </button>
                <button class="h-7 w-7 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="page >= totalPages" @click="page++">
                  <ChevronRight class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="px-5 py-3 border-t flex items-center justify-end">
          <button type="button" class="h-9 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted" @click="emit('update:open', false)">
            닫기
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
