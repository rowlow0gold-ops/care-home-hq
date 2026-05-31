<script setup lang="ts">
/**
 * MqTestModal — pre-flight MQ test controller.
 *
 * Opens when the user clicks 테스트 on a scheduler row. Lets HQ pick one of
 * four scenarios, fire it through the real MQ pipeline, and see live status:
 *   API → MQ → Worker → Telegram → (bot reply via webhook)
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
  expected_count?:     number;
  success_count?:      number;
  failure_count?:      number;
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
  { id: "happy",        label: "정상 발송 (전체)",  icon: Send,       hint: "배치 내 모든 어르신(N명)의 사진을 각각 관리자 Telegram으로 전송. SVG는 자동 PNG로 대체. 실제 발송과 동일한 N건의 MQ 메시지를 발생시킵니다." },
  { id: "force_fail",   label: "강제 실패 → DLQ",   icon: Skull,      hint: "Worker가 Telegram 호출 전에 Err 반환. 3회 재시도 후 DLQ. 1건만 실행." },
  { id: "network_fail", label: "네트워크 장애",     icon: Network,    hint: "네트워크 장애 시뮬레이션. 재시도 + DLQ 동작 확인. 1건만 실행." },
  { id: "bad_image",    label: "잘못된 이미지 (전체)", icon: ImageIcon, hint: "원본 SVG를 그대로 전송 → Telegram IMAGE_PROCESS_FAILED. 재시도 후 DLQ. N건 모두 실행." },
];

const selected = ref<string>("happy");
const firing   = ref(false);
const currentRunId = ref<string | null>(null);

const { data: current, refresh: refreshCurrent } = await useAsyncData<MqRun | null>(
  () => `mq-run-${currentRunId.value ?? "none"}`,
  () => currentRunId.value ? api.get<MqRun>(`/v1/mq-test/runs/${currentRunId.value}`) : Promise.resolve(null),
  { watch: [currentRunId], lazy: true, default: () => null },
);

const { data: history, refresh: refreshHistory } = await useAsyncData<MqRun[]>(
  "mq-runs-list",
  () => api.get<MqRun[]>("/v1/mq-test/runs"),
  { default: () => [], lazy: true },
);

// DLQ panel — counts per queue + replay/purge controls.
interface DlqStatus {
  queues: { queue: string; count: number }[];
  total:  number;
}
const { data: dlq, refresh: refreshDlq } = await useAsyncData<DlqStatus | null>(
  "mq-dlq-status",
  () => api.get<DlqStatus>("/v1/mq-test/dlq"),
  { default: () => null, lazy: true },
);
const dlqBusy = ref(false);
async function replayDlq() {
  if (dlqBusy.value) return;
  if (!confirm("DLQ에 있는 모든 실패 메시지를 메인 큐로 다시 보냅니다. 진행할까요?")) return;
  dlqBusy.value = true;
  try {
    const r = await api.post<{ moved: number }>("/v1/mq-test/dlq/replay", {});
    toast.success(`${r.moved}건 재시도 큐에 넣음`, "🔁 DLQ 재시도");
    await refreshDlq();
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

// Poll the current run every 2s while it's in flight or waiting for a reply.
let poller: ReturnType<typeof setInterval> | null = null;
function startPolling() {
  stopPolling();
  poller = setInterval(async () => {
    await refreshCurrent();
    const s = current.value?.status;
    if (s === "success" || s === "dlq" || s === "failed") {
      // Stop polling for status but keep polling for the reply if still missing.
      if (s !== "success" || current.value?.telegram_reply) stopPolling();
    }
  }, 2000);
}
function stopPolling() {
  if (poller) { clearInterval(poller); poller = null; }
}
watch(() => props.open, (o) => { if (!o) { stopPolling(); currentRunId.value = null; } });
onUnmounted(stopPolling);

async function fire() {
  if (!props.eventId || firing.value) return;
  firing.value = true;
  currentRunId.value = null;
  try {
    const run = await api.post<MqRun>("/v1/mq-test/run", {
      event_id: props.eventId,
      scenario: selected.value,
    });
    currentRunId.value = run.id;
    await refreshHistory();
    startPolling();
    toast.success(`${scenarios.find(s => s.id === selected.value)?.label ?? selected.value} 테스트 시작`, "🧪 MQ 테스트");
  } catch (e: any) {
    toast.error(e?.data?.message ?? "테스트 실행 실패", "오류");
  } finally {
    firing.value = false;
  }
}

function statusBadge(s: string) {
  switch (s) {
    case "queued":  return { cls: "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-200",  txt: "대기" };
    case "running": return { cls: "bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-200",   txt: "진행중" };
    case "success": return { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200", txt: "성공" };
    case "failed":  return { cls: "bg-rose-100   text-rose-700   dark:bg-rose-900/30   dark:text-rose-200",   txt: "실패" };
    case "dlq":     return { cls: "bg-rose-200   text-rose-900   dark:bg-rose-900/40   dark:text-rose-100",   txt: "DLQ" };
    default:        return { cls: "bg-muted text-muted-foreground", txt: s };
  }
}
function scenarioLabel(id: string) {
  return scenarios.find(s => s.id === id)?.label ?? id;
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ko-KR");
}

const pipelineStages = computed(() => {
  const s = current.value?.status;
  return [
    { label: "API",      ok: !!current.value,                                                                          err: false },
    { label: "MQ",       ok: !!current.value,                                                                          err: false },
    { label: "Worker",   ok: !!current.value?.consumed_at,                                                              err: false },
    { label: "Telegram", ok: s === "success",                                                                           err: s === "dlq" || s === "failed" },
    { label: "Bot 답장", ok: !!current.value?.telegram_reply,                                                           err: false },
  ];
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[130] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      @click.self="emit('update:open', false)"
    >
      <div class="bg-card text-foreground rounded-xl shadow-2xl border max-w-3xl w-full my-8 max-h-[90vh] flex flex-col">
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
            </p>
          </div>
          <button type="button" class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" @click="emit('update:open', false)">
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <!-- Scenario picker -->
          <div>
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2">시나리오 선택</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              class="mt-3 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
              :disabled="firing || !eventId"
              @click="fire"
            >
              <Loader2 v-if="firing" class="h-4 w-4 animate-spin" />
              <FlaskConical v-else class="h-4 w-4" />
              테스트 실행
            </button>
          </div>

          <!-- Live status -->
          <div v-if="current" class="rounded-lg border bg-muted/20 p-4">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 class="text-sm font-semibold flex items-center gap-2">
                현재 테스트
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="statusBadge(current.status).cls"
                >
                  {{ statusBadge(current.status).txt }}
                </span>
              </h3>
              <button type="button" class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="refreshCurrent">
                <RefreshCw class="h-3 w-3" />
                새로고침
              </button>
            </div>

            <!-- Pipeline stages -->
            <div class="flex items-center gap-1 mb-4 overflow-x-auto">
              <template v-for="(st, i) in pipelineStages" :key="st.label">
                <div
                  class="px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap inline-flex items-center gap-1"
                  :class="st.err
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
                    : st.ok
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                      : 'bg-muted text-muted-foreground'"
                >
                  <CheckCircle2  v-if="st.ok && !st.err" class="h-3 w-3" />
                  <AlertTriangle v-else-if="st.err"      class="h-3 w-3" />
                  {{ st.label }}
                </div>
                <span v-if="i < pipelineStages.length - 1" class="text-muted-foreground text-xs">→</span>
              </template>
            </div>

            <!-- Fan-out progress bar (only when expected_count > 1) -->
            <div v-if="(current.expected_count ?? 1) > 1" class="mb-3">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-semibold">전송 진행률</span>
                <span class="tabular-nums">
                  성공 {{ current.success_count ?? 0 }} · 실패 {{ current.failure_count ?? 0 }} / 총 {{ current.expected_count }}건
                </span>
              </div>
              <div class="h-2 rounded-full bg-muted overflow-hidden flex">
                <div
                  class="bg-emerald-500 h-full transition-all"
                  :style="{ width: ((current.success_count ?? 0) / (current.expected_count ?? 1) * 100) + '%' }"
                />
                <div
                  class="bg-rose-500 h-full transition-all"
                  :style="{ width: ((current.failure_count ?? 0) / (current.expected_count ?? 1) * 100) + '%' }"
                />
              </div>
              <p class="text-[10px] text-muted-foreground mt-1">
                참고: Telegram 동일 채팅 rate limit이 ~1msg/sec이라 N건이 N초 정도 걸립니다.
              </p>
            </div>

            <dl class="grid grid-cols-2 gap-y-1.5 text-xs">
              <dt class="text-muted-foreground">시나리오</dt><dd>{{ scenarioLabel(current.scenario) }}</dd>
              <dt class="text-muted-foreground">큐 등록</dt><dd class="tabular-nums">{{ fmtTime(current.queued_at) }}</dd>
              <dt class="text-muted-foreground">Worker 소비</dt><dd class="tabular-nums">{{ fmtTime(current.consumed_at) }}</dd>
              <dt class="text-muted-foreground">완료</dt><dd class="tabular-nums">{{ fmtTime(current.completed_at) }}</dd>
              <dt class="text-muted-foreground">최대 시도</dt><dd class="tabular-nums">{{ current.delivery_attempts }} / 3</dd>
              <dt v-if="current.telegram_message_id" class="text-muted-foreground">첫 Telegram MSG ID</dt>
              <dd v-if="current.telegram_message_id" class="tabular-nums font-mono">{{ current.telegram_message_id }}</dd>
            </dl>

            <div v-if="current.last_error" class="mt-3 rounded-md bg-rose-50 dark:bg-rose-950/30 p-2 text-[11px] text-rose-700 dark:text-rose-200 font-mono whitespace-pre-wrap">
              {{ current.last_error }}
            </div>

            <div
              v-if="current.telegram_reply"
              class="mt-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm"
            >
              <div class="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-200 font-semibold mb-1">
                <MessageSquare class="h-3 w-3" />
                Bot 답장 ({{ fmtTime(current.telegram_reply_at) }})
              </div>
              <div class="whitespace-pre-wrap">{{ current.telegram_reply }}</div>
            </div>
            <div v-else-if="current.status === 'success'" class="mt-3 text-[11px] text-muted-foreground italic">
              Telegram에서 메시지에 답장하시면 여기에 표시됩니다.
            </div>
          </div>

          <!-- DLQ — failure quarantine -->
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
                <button type="button" class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="refreshDlq">
                  <RefreshCw class="h-3 w-3" />
                  새로고침
                </button>
                <button
                  type="button"
                  class="h-8 px-2.5 rounded-md border border-input bg-background text-xs font-semibold inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"
                  :disabled="dlqBusy || (dlq?.total ?? 0) === 0"
                  @click="replayDlq"
                >
                  <Loader2 v-if="dlqBusy" class="h-3 w-3 animate-spin" />
                  <RotateCcw v-else class="h-3 w-3" />
                  재시도 ({{ dlq?.total ?? 0 }})
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
            <table class="w-full text-xs">
              <tbody>
                <tr v-for="q in dlq?.queues ?? []" :key="q.queue" class="border-t">
                  <td class="py-2 px-4 font-mono">{{ q.queue }}</td>
                  <td class="py-2 px-4 text-right tabular-nums"
                      :class="q.count > 0 ? 'text-rose-700 dark:text-rose-200 font-semibold' : 'text-muted-foreground'">
                    {{ q.count }}건
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="px-4 py-2 text-[11px] text-muted-foreground border-t">
              실패한 메시지는 자동으로 여기에 격리됩니다. 원인을 고친 후
              <strong>재시도</strong>를 누르면 다시 처리됩니다. <strong>비우기</strong>는
              완전히 삭제하므로 신중히 사용하세요.
            </p>
          </div>

          <!-- Recent history -->
          <div>
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center justify-between">
              <span>최근 테스트 (최근 20건)</span>
              <button type="button" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 normal-case text-[10px] font-normal" @click="refreshHistory">
                <RefreshCw class="h-3 w-3" />
                새로고침
              </button>
            </h3>
            <div class="rounded-lg border overflow-hidden">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-muted-foreground bg-muted/30">
                    <th class="py-2 px-3 font-medium">시각</th>
                    <th class="py-2 px-3 font-medium">시나리오</th>
                    <th class="py-2 px-3 font-medium">상태</th>
                    <th class="py-2 px-3 font-medium">시도</th>
                    <th class="py-2 px-3 font-medium">답장</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in history" :key="r.id" class="border-t hover:bg-muted/30">
                    <td class="py-1.5 px-3 tabular-nums">{{ fmtTime(r.queued_at) }}</td>
                    <td class="py-1.5 px-3">{{ scenarioLabel(r.scenario) }}</td>
                    <td class="py-1.5 px-3">
                      <span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium" :class="statusBadge(r.status).cls">
                        {{ statusBadge(r.status).txt }}
                      </span>
                    </td>
                    <td class="py-1.5 px-3 tabular-nums">{{ r.delivery_attempts }}</td>
                    <td class="py-1.5 px-3 truncate max-w-[12rem]">{{ r.telegram_reply ?? "—" }}</td>
                  </tr>
                  <tr v-if="(history?.length ?? 0) === 0">
                    <td colspan="5" class="py-6 text-center text-muted-foreground">아직 테스트 기록이 없습니다.</td>
                  </tr>
                </tbody>
              </table>
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
