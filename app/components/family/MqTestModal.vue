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
  X, FlaskConical, Loader2, CheckCircle2, AlertTriangle, Skull,
  Send, Network, Image as ImageIcon, MessageSquare, RefreshCw,
  Trash2, RotateCcw, Archive,
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
  { id: "happy",        label: "정상 발송 (전체)",      icon: Send,      hint: "배치 내 모든 어르신 사진을 관리자 Telegram으로 전송. SVG는 자동 PNG 대체. N건 동시 전송." },
  { id: "force_fail",   label: "강제 실패 → DLQ",       icon: Skull,     hint: "Worker가 Telegram 호출 전 Err 반환. 3회 재시도 후 DLQ. 1건만 실행." },
  { id: "network_fail", label: "네트워크 장애",         icon: Network,   hint: "네트워크 장애 시뮬레이션. 재시도 + DLQ 동작 검증. 1건만 실행." },
  { id: "bad_image",    label: "잘못된 이미지 (전체)",  icon: ImageIcon, hint: "원본 SVG를 그대로 전송 → Telegram IMAGE_PROCESS_FAILED. N건 모두 실패 + DLQ." },
];

const selected = ref<string>("happy");
const firing   = ref(false);

const { data: history, refresh: refreshHistory } = await useAsyncData<MqRun[]>(
  "mq-runs-list",
  () => api.get<MqRun[]>("/v1/mq-test/runs"),
  { default: () => [], lazy: true },
);

interface DlqStatus { queues: { queue: string; count: number }[]; total: number }
const { data: dlq, refresh: refreshDlq } = await useAsyncData<DlqStatus | null>(
  "mq-dlq-status",
  () => api.get<DlqStatus>("/v1/mq-test/dlq"),
  { default: () => null, lazy: true },
);
const dlqBusy = ref(false);

// Poll while any row is queued/running.
let poller: ReturnType<typeof setInterval> | null = null;
function startPolling() {
  stopPolling();
  poller = setInterval(async () => {
    await Promise.all([refreshHistory(), refreshDlq()]);
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
    await Promise.all([refreshHistory(), refreshDlq()]);
    startPolling();
  } else {
    stopPolling();
  }
});
onUnmounted(stopPolling);

async function fire(scenario: string) {
  if (!props.eventId || firing.value) return;
  firing.value = true;
  try {
    const run = await api.post<MqRun>("/v1/mq-test/run", {
      event_id: props.eventId,
      scenario,
    });
    await Promise.all([refreshHistory(), refreshDlq()]);
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

const retryingId = ref<string | null>(null);
async function retryRow(run: MqRun) {
  if (retryingId.value) return;
  retryingId.value = run.id;
  try {
    const newRun = await api.post<MqRun>("/v1/mq-test/run", {
      event_id: run.event_id,
      scenario: run.scenario === "force_fail" || run.scenario === "network_fail" || run.scenario === "bad_image"
        ? "happy"  // retrying a deliberate-fail scenario actually delivers
        : run.scenario,
    });
    await Promise.all([refreshHistory(), refreshDlq()]);
    startPolling();
    toast.success(`재시도 시작 (${newRun.expected_count ?? 1}건)`, "🔁 재시도");
  } catch (e: any) {
    toast.error(e?.data?.message ?? "재시도 실패", "오류");
  } finally {
    retryingId.value = null;
  }
}

async function replayDlq() {
  if (dlqBusy.value) return;
  if (!confirm("DLQ에 있는 모든 실패 메시지를 메인 큐로 다시 보냅니다. 진행할까요?")) return;
  dlqBusy.value = true;
  try {
    const r = await api.post<{ moved: number; test_rewrites?: number }>("/v1/mq-test/dlq/replay", {});
    const note = (r.test_rewrites ?? 0) > 0 ? ` (${r.test_rewrites}건은 happy로 변환)` : "";
    toast.success(`${r.moved}건 재시도 큐에 넣음${note}`, "🔁 DLQ 재시도");
    await Promise.all([refreshDlq(), refreshHistory()]);
    startPolling();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "재시도 실패", "오류");
  } finally {
    dlqBusy.value = false;
  }
}
async function purgeDlq() {
  if (dlqBusy.value) return;
  if (!confirm("⚠️ DLQ에 있는 모든 실패 메시지를 영구 삭제합니다. 복구 불가. 진행할까요?")) return;
  dlqBusy.value = true;
  try {
    const r = await api.post<{ deleted: number }>("/v1/mq-test/dlq/purge", {});
    toast.success(`${r.deleted}건 삭제됨`, "🗑️ DLQ 비움");
    await refreshDlq();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "삭제 실패", "오류");
  } finally {
    dlqBusy.value = false;
  }
}

function scenarioLabel(id: string) {
  return scenarios.find(s => s.id === id)?.label ?? id;
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
              배치: <span class="font-medium text-foreground">{{ batchName }}</span>
              · 관리자 Telegram으로만 전송 · 실제 가족에게 영향 없음
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
          <!-- Scenario picker + execute -->
          <div>
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2">시나리오</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
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
              :disabled="firing || !eventId"
              @click="fire(selected)"
            >
              <Loader2 v-if="firing" class="h-4 w-4 animate-spin" />
              <FlaskConical v-else class="h-4 w-4" />
              실행 ({{ scenarioLabel(selected) }})
            </button>
          </div>

          <!-- Executed runs list (each row has its own progress bar + retry) -->
          <div>
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center justify-between">
              <span>실행된 시나리오 (최근 20)</span>
              <button type="button" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 normal-case text-[10px] font-normal" @click="refreshHistory">
                <RefreshCw class="h-3 w-3" />
                새로고침
              </button>
            </h3>
            <div class="rounded-lg border overflow-hidden">
              <div v-if="(history?.length ?? 0) === 0" class="py-12 text-center text-sm text-muted-foreground">
                <FlaskConical class="h-10 w-10 mx-auto mb-3 opacity-30" />
                아직 실행한 시나리오가 없습니다.
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
                    <button
                      type="button"
                      class="h-7 px-2.5 rounded-md border border-input bg-background text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50 shrink-0"
                      :disabled="retryingId === r.id || r.status === 'queued' || r.status === 'running'"
                      @click="retryRow(r)"
                    >
                      <Loader2 v-if="retryingId === r.id" class="h-3 w-3 animate-spin" />
                      <RotateCcw v-else class="h-3 w-3" />
                      재시도
                    </button>
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
                      <span class="text-emerald-700 dark:text-emerald-200 font-semibold">{{ r.success_count }}</span>
                      <span> / </span>
                      <span class="text-rose-700 dark:text-rose-200 font-semibold">{{ r.failure_count }}</span>
                      <span> / {{ r.expected_count }}</span>
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
                      class="rounded bg-rose-50 dark:bg-rose-950/30 px-2 py-1 text-rose-800 dark:text-rose-200 font-mono truncate"
                    >
                      {{ r.last_error }}
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- DLQ summary -->
          <div class="rounded-lg border bg-card">
            <div class="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
              <h3 class="text-sm font-semibold flex items-center gap-2">
                <Archive class="h-4 w-4 text-rose-600" />
                실패 격리함 (DLQ)
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                  :class="(dlq?.total ?? 0) > 0
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'"
                >
                  {{ dlq?.total ?? 0 }}건
                </span>
              </h3>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="h-8 px-2.5 rounded-md border border-input bg-background text-xs font-semibold inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"
                  :disabled="dlqBusy || (dlq?.total ?? 0) === 0"
                  @click="replayDlq"
                >
                  <Loader2 v-if="dlqBusy" class="h-3 w-3 animate-spin" />
                  <RotateCcw v-else class="h-3 w-3" />
                  전체 재시도 ({{ dlq?.total ?? 0 }})
                </button>
                <button
                  type="button"
                  class="h-8 px-2.5 rounded-md border border-destructive/40 text-destructive text-xs font-semibold inline-flex items-center gap-1 hover:bg-destructive/10 disabled:opacity-50"
                  :disabled="dlqBusy || (dlq?.total ?? 0) === 0"
                  @click="purgeDlq"
                >
                  <Trash2 class="h-3 w-3" />
                  비우기
                </button>
              </div>
            </div>
            <p class="px-4 py-2 text-[11px] text-muted-foreground">
              자동 격리됨. 원인을 고친 후 <strong>전체 재시도</strong>로 일괄 재처리.
              (force_fail / bad_image 등 실패 시나리오는 재시도 시 자동으로 happy로 변환)
            </p>
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
