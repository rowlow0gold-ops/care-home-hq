<script setup lang="ts">
/**
 * /tablet/residents/[id]/vitals — record a single vital sign.
 *
 * One reading at a time (a typical 활력측정 run captures 4 readings: BP-sys,
 * BP-dia, pulse, temp). UI shows huge numeric input + saves immediately,
 * then resets to the next vital kind so the caregiver can chain readings.
 * Out-of-range entries surface a 비정상 warning AFTER save (worker emits
 * a vitals.alert event automatically, but we show local guidance too).
 */
import { Loader2, CheckCircle2, AlertTriangle, HeartPulse, Thermometer, Activity, Droplet } from "@lucide/vue";

definePageMeta({ layout: "tablet" });

const route   = useRoute();
const api     = useTabletApi();
const toast   = useToast();

interface Resident { id: string; full_name: string }
const id = computed(() => String(route.params.id));

const { data: detail } = await useAsyncData(`tablet-res-vitals-${id.value}`, () =>
  api.get<{ resident: Resident }>(`/v1/residents/${id.value}`),
);
useHead({ title: () => `${detail.value?.resident.full_name ?? ""} 활력 · 케어닥` });

interface VitalKind {
  id: string; label: string; unit: string; icon: any;
  low: number; high: number;    // normal range for adults — for local warning only
  step: number;                  // input step for the +/- buttons
}

const KINDS: VitalKind[] = [
  { id: "blood_pressure_systolic",  label: "혈압 (수축기)", unit: "mmHg", icon: HeartPulse, low: 90,  high: 140, step: 1   },
  { id: "blood_pressure_diastolic", label: "혈압 (이완기)", unit: "mmHg", icon: HeartPulse, low: 60,  high: 90,  step: 1   },
  { id: "pulse",                    label: "맥박",          unit: "회/분", icon: Activity,   low: 60,  high: 100, step: 1   },
  { id: "body_temperature",         label: "체온",          unit: "℃",    icon: Thermometer, low: 36.0, high: 37.5, step: 0.1 },
  { id: "spo2",                     label: "산소포화도",    unit: "%",    icon: Droplet,    low: 95,  high: 100, step: 1   },
  { id: "blood_sugar",              label: "혈당",          unit: "mg/dL", icon: Droplet,   low: 70,  high: 140, step: 1   },
];

const selectedKind = ref<VitalKind>(KINDS[0]!);
const value        = ref<number | null>(null);
const note         = ref("");
const saving       = ref(false);
const lastSaved    = ref<{ kind: string; value: number; outOfRange: boolean } | null>(null);

function setKind(k: VitalKind) {
  selectedKind.value = k;
  value.value = null;
  note.value = "";
  lastSaved.value = null;
}

function bump(delta: number) {
  const cur = value.value ?? (selectedKind.value.low + selectedKind.value.high) / 2;
  const next = Math.round((cur + delta) * 10) / 10;
  value.value = next;
}

async function save() {
  if (saving.value) return;
  if (value.value == null || isNaN(value.value)) {
    toast.error("측정값을 입력해주세요", "오류");
    return;
  }
  saving.value = true;
  try {
    await api.post("/v1/vitals", {
      resident_id: id.value,
      kind:        selectedKind.value.id,
      value:       value.value,
      note:        note.value.trim() || undefined,
    });
    const out = value.value < selectedKind.value.low || value.value > selectedKind.value.high;
    lastSaved.value = { kind: selectedKind.value.label, value: value.value, outOfRange: out };
    toast.success(
      `${selectedKind.value.label} ${value.value}${selectedKind.value.unit} 저장됨`,
      out ? "⚠️ 정상 범위 밖" : "✅ 저장 완료",
    );
    value.value = null;
    note.value = "";
  } catch (e: any) {
    toast.error(e?.data?.message ?? "저장 실패", "오류");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">활력 측정</h1>
    <p class="text-sm text-muted-foreground mb-5">{{ detail?.resident.full_name }} 어르신</p>

    <!-- Kind picker -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
      <button
        v-for="k in KINDS" :key="k.id"
        type="button"
        class="rounded-xl border p-3 text-left transition-colors active:scale-[0.98]"
        :class="selectedKind.id === k.id
          ? 'border-primary bg-primary/5'
          : 'border-input bg-card hover:bg-muted/40'"
        @click="setKind(k)"
      >
        <div class="flex items-center gap-2 font-semibold text-sm">
          <component :is="k.icon" class="h-4 w-4" />
          {{ k.label }}
        </div>
        <div class="text-[11px] text-muted-foreground mt-0.5">정상 {{ k.low }} ~ {{ k.high }} {{ k.unit }}</div>
      </button>
    </div>

    <!-- Value entry — big -->
    <div class="rounded-2xl border bg-card p-5 mb-4">
      <div class="text-sm font-semibold text-muted-foreground mb-2">측정값</div>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="h-16 w-16 rounded-2xl bg-muted hover:bg-muted/80 text-2xl font-bold active:scale-95 transition"
          :disabled="saving"
          @click="bump(-selectedKind.step)"
        >−</button>
        <input
          v-model.number="value"
          type="number"
          :step="selectedKind.step"
          inputmode="decimal"
          class="flex-1 h-20 px-4 rounded-2xl border border-input bg-background text-4xl font-bold text-center focus:outline-none focus:border-primary"
          :placeholder="String((selectedKind.low + selectedKind.high) / 2)"
          :disabled="saving"
        />
        <button
          type="button"
          class="h-16 w-16 rounded-2xl bg-muted hover:bg-muted/80 text-2xl font-bold active:scale-95 transition"
          :disabled="saving"
          @click="bump(selectedKind.step)"
        >+</button>
      </div>
      <div class="text-center mt-2 text-sm text-muted-foreground">{{ selectedKind.unit }}</div>
    </div>

    <textarea
      v-model="note"
      class="w-full min-h-[80px] px-4 py-3 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary mb-4"
      placeholder="메모 (선택, 예: '식후 1시간 측정')"
      :disabled="saving"
    />

    <button
      type="button"
      class="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-lg font-bold inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60"
      :disabled="saving"
      @click="save"
    >
      <Loader2 v-if="saving" class="h-5 w-5 animate-spin" />
      <CheckCircle2 v-else class="h-5 w-5" />
      저장하기
    </button>

    <!-- Last saved confirmation -->
    <div
      v-if="lastSaved"
      class="mt-4 rounded-xl p-3 text-sm flex items-start gap-2"
      :class="lastSaved.outOfRange
        ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
        : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'"
    >
      <component :is="lastSaved.outOfRange ? AlertTriangle : CheckCircle2" class="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <b>{{ lastSaved.kind }}</b> {{ lastSaved.value }} 저장 완료.
        <span v-if="lastSaved.outOfRange"> 정상 범위를 벗어나 자동 알림이 발송됩니다.</span>
      </div>
    </div>
  </div>
</template>
