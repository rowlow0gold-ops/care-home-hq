<script setup lang="ts">
/**
 * /tablet/residents/[id]/medications — list active meds for this resident,
 * tap one to record administration (gave / refused / missed) with one tap.
 */
import { Loader2, Pill, CheckCircle2, XCircle, MinusCircle } from "@lucide/vue";

definePageMeta({ layout: "tablet" });

const route = useRoute();
const api   = useTabletApi();
const toast = useToast();
const id    = computed(() => String(route.params.id));

const { data: detail } = await useAsyncData(`tablet-res-med-hdr-${id.value}`, () =>
  api.get<{ resident: { full_name: string } }>(`/v1/residents/${id.value}`),
);
useHead({ title: () => `${detail.value?.resident.full_name ?? ""} 투약 · 케어닥` });

interface Med {
  id: string;
  drug_name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  notes: string | null;
  active: boolean;
}

const { data: meds, pending, refresh } = await useAsyncData(`tablet-res-meds-${id.value}`, () =>
  api.get<Med[]>(`/v1/residents/${id.value}/medications`),
);

const recording = ref<string | null>(null);

async function record(med: Med, status: "given" | "refused" | "missed", notes?: string) {
  if (recording.value) return;
  recording.value = med.id;
  try {
    await api.post(`/v1/medications/${med.id}/administer`, { status, notes });
    const label = status === "given" ? "투약 완료" : status === "refused" ? "거부" : "누락";
    toast.success(`${med.drug_name} · ${label} 기록됨`, "✅");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "기록 실패", "오류");
  } finally {
    recording.value = null;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">투약 기록</h1>
    <p class="text-sm text-muted-foreground mb-5">{{ detail?.resident.full_name }} 어르신</p>

    <div v-if="pending" class="py-12 text-center text-muted-foreground">불러오는 중…</div>
    <div v-else-if="(meds?.length ?? 0) === 0" class="py-12 text-center text-muted-foreground">
      처방된 약이 없습니다.
    </div>

    <ul v-else class="space-y-3">
      <li v-for="m in meds!.filter(x => x.active)" :key="m.id" class="rounded-xl border bg-card p-4">
        <div class="flex items-start gap-3 mb-3">
          <div class="h-12 w-12 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200 flex items-center justify-center shrink-0">
            <Pill class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-lg font-bold">{{ m.drug_name }}</div>
            <div class="text-sm text-muted-foreground mt-0.5">
              <span v-if="m.dosage">{{ m.dosage }}</span>
              <span v-if="m.frequency"> · {{ m.frequency }}</span>
              <span v-if="m.route"> · {{ m.route }}</span>
            </div>
            <p v-if="m.notes" class="text-xs text-muted-foreground mt-1">{{ m.notes }}</p>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            type="button"
            class="h-12 rounded-lg bg-emerald-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-1 hover:bg-emerald-600 active:scale-95 transition disabled:opacity-60"
            :disabled="recording === m.id"
            @click="record(m, 'given')"
          >
            <Loader2 v-if="recording === m.id" class="h-4 w-4 animate-spin" />
            <CheckCircle2 v-else class="h-4 w-4" />
            투약
          </button>
          <button
            type="button"
            class="h-12 rounded-lg bg-rose-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-1 hover:bg-rose-600 active:scale-95 transition disabled:opacity-60"
            :disabled="recording === m.id"
            @click="record(m, 'refused')"
          >
            <XCircle class="h-4 w-4" />
            거부
          </button>
          <button
            type="button"
            class="h-12 rounded-lg bg-amber-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-1 hover:bg-amber-600 active:scale-95 transition disabled:opacity-60"
            :disabled="recording === m.id"
            @click="record(m, 'missed')"
          >
            <MinusCircle class="h-4 w-4" />
            누락
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
