<script setup lang="ts">
/**
 * /tablet/residents/[id]/vitals — record all 6 vitals in one form.
 *
 * Previously caregivers had to pick one vital → save → repeat 6 times,
 * which is a lot of taps for a routine that always captures the same set.
 * Now the page shows all six inputs side-by-side; the caregiver fills the
 * ones they took, taps save once, and we POST every non-empty reading in
 * parallel. Out-of-range readings are flagged in the save summary.
 */
import { Loader2, CheckCircle2, AlertTriangle, HeartPulse, Thermometer, Activity, Droplet } from "@lucide/vue";

definePageMeta({ layout: "tablet" });

const route = useRoute();
const api   = useTabletApi();
const toast = useToast();

interface Resident { id: string; full_name: string }
const id = computed(() => String(route.params.id));

const { data: detail } = await useAsyncData(`tablet-res-vitals-${id.value}`, () =>
  api.get<Resident>(`/v1/residents/${id.value}`),
);
useHead({ title: () => `${detail.value?.full_name ?? ""} 활력 · 케어닥` });

interface VitalKind {
  id: string; label: string; unit: string; icon: any;
  low: number; high: number;
  step: number;
}

const KINDS: VitalKind[] = [
  { id: "blood_pressure_systolic",  label: "혈압 (수축기)", unit: "mmHg", icon: HeartPulse,  low: 90,   high: 140, step: 1   },
  { id: "blood_pressure_diastolic", label: "혈압 (이완기)", unit: "mmHg", icon: HeartPulse,  low: 60,   high: 90,  step: 1   },
  { id: "pulse",                    label: "맥박",          unit: "회/분", icon: Activity,    low: 60,   high: 100, step: 1   },
  { id: "body_temperature",         label: "체온",          unit: "℃",    icon: Thermometer, low: 36.0, high: 37.5, step: 0.1 },
  { id: "spo2",                     label: "산소포화도",    unit: "%",    icon: Droplet,     low: 95,   high: 100, step: 1   },
  { id: "blood_sugar",              label: "혈당",          unit: "mg/dL", icon: Droplet,    low: 70,   high: 140, step: 1   },
];

// One reactive value per kind, keyed by kind id. null = not captured.
const values = reactive<Record<string, number | null>>(
  Object.fromEntries(KINDS.map(k => [k.id, null])),
);
const note   = ref("");
const saving = ref(false);

interface SavedSummary { label: string; value: number; unit: string; outOfRange: boolean }
const lastSummary = ref<SavedSummary[] | null>(null);

function bump(k: VitalKind, delta: number) {
  const cur = values[k.id] ?? (k.low + k.high) / 2;
  const next = Math.round((cur + delta) * 10) / 10;
  values[k.id] = next;
}
function clearOne(k: VitalKind) { values[k.id] = null; }

const filledKinds = computed(() =>
  KINDS.filter(k => values[k.id] != null && !isNaN(values[k.id] as number)),
);

async function save() {
  if (saving.value) return;
  if (filledKinds.value.length === 0) {
    toast.error("최소 1개 측정값을 입력해주세요", "오류");
    return;
  }
  saving.value = true;
  try {
    const results = await Promise.allSettled(
      filledKinds.value.map(k => api.post("/v1/vitals", {
        resident_id: id.value,
        kind:        k.id,
        value:       values[k.id],
        note:        note.value.trim() || undefined,
      })),
    );
    const ok = results.filter(r => r.status === "fulfilled").length;
    const fail = results.length - ok;
    const summary: SavedSummary[] = filledKinds.value.map(k => {
      const v = values[k.id] as number;
      return {
        label: k.label, value: v, unit: k.unit,
        outOfRange: v < k.low || v > k.high,
      };
    });
    lastSummary.value = summary;
    if (fail === 0) {
      const abnormal = summary.filter(s => s.outOfRange).length;
      toast.success(
        `${ok}개 측정값 저장됨`,
        abnormal ? `⚠️ ${abnormal}개 정상 범위 밖` : "✅ 저장 완료",
      );
      // Clear inputs so the next round starts fresh.
      for (const k of KINDS) values[k.id] = null;
      note.value = "";
    } else {
      toast.error(`${fail}개 저장 실패 (${ok}개 저장됨)`, "오류");
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">활력 측정</h1>
    <p class="text-sm text-muted-foreground mb-5">
      {{ detail?.full_name }} 어르신 ·
      <span class="text-foreground/70">측정한 항목만 입력하면 한 번에 저장돼요</span>
    </p>

    <!-- 6 vital inputs, all visible at once -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <div
        v-for="k in KINDS" :key="k.id"
        class="rounded-2xl border bg-card p-4"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 font-semibold text-sm">
            <component :is="k.icon" class="h-4 w-4 text-primary" />
            {{ k.label }}
          </div>
          <button
            v-if="values[k.id] != null"
            type="button"
            class="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-md hover:bg-muted"
            @click="clearOne(k)"
          >지우기</button>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="h-12 w-12 rounded-xl bg-muted hover:bg-muted/80 text-xl font-bold active:scale-95 transition shrink-0"
            :disabled="saving"
            @click="bump(k, -k.step)"
          >−</button>
          <input
            v-model.number="values[k.id]"
            type="number"
            :step="k.step"
            inputmode="decimal"
            class="flex-1 min-w-0 h-14 px-2 rounded-xl border border-input bg-background text-2xl font-bold text-center focus:outline-none focus:border-primary"
            :placeholder="String((k.low + k.high) / 2)"
            :disabled="saving"
          />
          <button
            type="button"
            class="h-12 w-12 rounded-xl bg-muted hover:bg-muted/80 text-xl font-bold active:scale-95 transition shrink-0"
            :disabled="saving"
            @click="bump(k, k.step)"
          >+</button>
        </div>
        <div class="text-[11px] text-muted-foreground mt-1.5 text-center">
          {{ k.unit }} · 정상 {{ k.low }} ~ {{ k.high }}
        </div>
      </div>
    </div>

    <textarea
      v-model="note"
      class="w-full min-h-[72px] px-4 py-3 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary mb-4"
      placeholder="공통 메모 (선택, 예: '식후 1시간 측정')"
      :disabled="saving"
    />

    <button
      type="button"
      class="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-lg font-bold inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60"
      :disabled="saving || filledKinds.length === 0"
      @click="save"
    >
      <Loader2 v-if="saving" class="h-5 w-5 animate-spin" />
      <CheckCircle2 v-else class="h-5 w-5" />
      {{ filledKinds.length > 0 ? `${filledKinds.length}개 항목 저장` : "측정값을 입력하세요" }}
    </button>

    <!-- Save summary -->
    <div v-if="lastSummary" class="mt-4 space-y-1.5">
      <div
        v-for="s in lastSummary" :key="s.label"
        class="rounded-lg p-2.5 text-sm flex items-center gap-2"
        :class="s.outOfRange
          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'"
      >
        <component :is="s.outOfRange ? AlertTriangle : CheckCircle2" class="h-4 w-4 shrink-0" />
        <span><b>{{ s.label }}</b> {{ s.value }} {{ s.unit }}</span>
        <span v-if="s.outOfRange" class="ml-auto text-xs">정상 범위 밖 · 자동 알림</span>
      </div>
    </div>
  </div>
</template>
