<script setup lang="ts">
/**
 * /family-notify — monthly batch picker for HQ.
 *
 * Workflow:
 *   Tablet → uploads ~5 photos / resident / week throughout the month.
 *   HQ here (before the 1st):
 *     · pick month + hub filter
 *     · per resident, tick ≥3 photos for the next send batch
 *     · can also pick photos from the prior 5 months — "이미 발송됨" badge
 *       marks ones that already went out that month so HQ doesn't re-send
 *   "발송 (N건)" button = fire all picked photos now (manual override).
 *   On the 1st of the target month, a worker cron auto-fires the rest.
 */
import {
  Send, Camera, Building2, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, AlertCircle, MessageSquare, Calendar,
} from "@lucide/vue";

useHead({ title: "가족 알림 · 케어닥 HQ" });

interface ResidentBatch {
  resident_id:   string;
  resident_name: string;
  branch_id:     string;
  branch_name:   string;
  photo_count:   number;
  picked_count:  number;
}
interface PhotoCandidate {
  id:                 string;
  resident_id:        string;
  taken_at:           string;
  caption:            string | null;
  status:             string;
  picked_for_month:   string | null;
  already_sent:       boolean;
  already_sent_month: string | null;
  data_url:           string;
}
interface PickerResponse {
  residents:    ResidentBatch[];
  candidates:   PhotoCandidate[];
  total_photos: number;
  picked_count: number;
}
interface Branch { id: string; name: string; branch_type: "hub" | "satellite" }

const api   = useApi();
const toast = useToast();

// ── Month picker: defaults to NEXT month (the upcoming send batch).
const now = new Date();
const nextMonthAnchor = new Date(now.getFullYear(), now.getMonth() + 1, 1);

const yearOptions  = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
const selectedYear  = ref<number>(nextMonthAnchor.getFullYear());
const selectedMonth = ref<number>(nextMonthAnchor.getMonth() + 1);
const targetMonth   = computed(() =>
  `${selectedYear.value}-${String(selectedMonth.value).padStart(2, "0")}`,
);

const branchFilter = ref<string>("");
const { data: dashboard } = await useAsyncData("fam-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: picker, pending, error, refresh } = await useAsyncData(
  () => `family-picker-${targetMonth.value}-${branchFilter.value}`,
  () => api.get<PickerResponse>("/v1/photos/picker", {
    month: targetMonth.value,
    branch_id: branchFilter.value || undefined,
  }),
  { watch: [targetMonth, branchFilter] },
);

// Group candidates by resident for easy rendering.
const photosByResident = computed(() => {
  const m = new Map<string, PhotoCandidate[]>();
  for (const p of picker.value?.candidates ?? []) {
    if (!m.has(p.resident_id)) m.set(p.resident_id, []);
    m.get(p.resident_id)!.push(p);
  }
  return m;
});

// "Total picked for this month" — drives the 발송 all (N건) button.
const pickedThisMonth = computed(() =>
  (picker.value?.candidates ?? []).filter(
    (c) => c.picked_for_month === targetMonth.value,
  ),
);

// Track per-resident expand/collapse — start with anyone < min collapsed
const MIN_PICK = 3;
const expanded = ref<Record<string, boolean>>({});

function toggle(rid: string) {
  expanded.value[rid] = !expanded.value[rid];
}
function pickedCountFor(rid: string) {
  return (photosByResident.value.get(rid) ?? [])
    .filter((p) => p.picked_for_month === targetMonth.value).length;
}

const togglingId = ref<string | null>(null);
async function togglePick(photo: PhotoCandidate) {
  if (togglingId.value) return;
  togglingId.value = photo.id;
  try {
    const isPicked = photo.picked_for_month === targetMonth.value;
    await api.patch(`/v1/photos/${photo.id}/pick`, {
      month: isPicked ? null : targetMonth.value,
    });
    // Optimistic local mutation so toggling stays instant.
    photo.picked_for_month = isPicked ? null : targetMonth.value;
  } catch (e: any) {
    toast.error(e?.data?.message ?? "선택 실패", "오류");
  } finally {
    togglingId.value = null;
  }
}

// 발송 all — fire every picked photo right now (manual override).
const sending = ref(false);
async function sendBatchNow() {
  if (sending.value) return;
  if (pickedThisMonth.value.length === 0) {
    toast.error("선택된 사진이 없습니다", "알림");
    return;
  }
  sending.value = true;
  try {
    const r = await api.post<{ queued: number }>("/v1/photos/send-batch", {
      month:     targetMonth.value,
      branch_id: branchFilter.value || undefined,
    });
    toast.success(`${r.queued}건 가족 Telegram 발송 요청 완료`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "발송 실패", "오류");
  } finally {
    sending.value = false;
  }
}

function fmtTakenDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit", day: "2-digit",
  });
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-2">
        <Send class="h-7 w-7 text-primary" />
        가족 알림
      </h1>
    </header>

    <!-- Filter bar + KPIs -->
    <div class="rounded-xl border bg-card p-4 mb-6 flex flex-wrap items-center gap-3">
      <Calendar class="h-4 w-4 text-muted-foreground" />
      <select
        v-model.number="selectedYear"
        class="h-9 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      >
        <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}년</option>
      </select>
      <select
        v-model.number="selectedMonth"
        class="h-9 w-20 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      >
        <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}월</option>
      </select>
      <span class="text-xs text-muted-foreground">발송분</span>

      <Building2 class="h-4 w-4 text-muted-foreground ml-3" />
      <select
        v-model="branchFilter"
        class="h-9 w-48 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      >
        <option value="">전체 지점</option>
        <optgroup label="광역센터 (Hub)">
          <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'hub')"
                  :key="b.id" :value="b.id">{{ b.name }}</option>
        </optgroup>
        <optgroup label="위성센터 (Satellite)">
          <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'satellite')"
                  :key="b.id" :value="b.id">{{ b.name }}</option>
        </optgroup>
      </select>

      <div class="ml-auto flex items-center gap-3">
        <div class="text-xs text-muted-foreground tabular-nums">
          후보 <span class="font-semibold text-foreground">{{ picker?.total_photos ?? 0 }}</span>장
          · 선택 <span class="font-semibold text-primary">{{ pickedThisMonth.length }}</span>장
        </div>
        <button
          type="button"
          class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
          :disabled="sending || pickedThisMonth.length === 0"
          @click="sendBatchNow"
        >
          <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
          <Send v-else class="h-4 w-4" />
          발송 ({{ pickedThisMonth.length }}건)
        </button>
      </div>
    </div>

    <div v-if="error" class="text-sm text-destructive py-12 text-center">
      <AlertCircle class="h-8 w-8 mx-auto mb-2" />
      불러오기에 실패했습니다.
    </div>

    <div v-else-if="pending && !picker" class="space-y-3">
      <Skeleton h="6rem" />
      <Skeleton h="6rem" />
      <Skeleton h="6rem" />
    </div>

    <div
      v-else-if="(picker?.residents?.length ?? 0) === 0"
      class="rounded-2xl border bg-card p-16 text-center"
    >
      <Camera class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
      <p class="text-sm text-muted-foreground">
        선택한 지점에 후보 사진이 없습니다. 태블릿이 사진을 업로드하면 여기에 표시됩니다.
      </p>
    </div>

    <!-- Resident gallery list -->
    <div v-else class="space-y-3">
      <article
        v-for="r in picker?.residents ?? []"
        :key="r.resident_id"
        class="rounded-xl border bg-card overflow-hidden"
      >
        <!-- Header row -->
        <button
          type="button"
          class="w-full px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
          @click="toggle(r.resident_id)"
        >
          <div class="h-9 w-9 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-primary-foreground flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {{ r.resident_name.charAt(0) }}
          </div>
          <div class="text-left flex-1 min-w-0">
            <div class="font-semibold">{{ r.resident_name }}</div>
            <div class="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 class="h-3 w-3" />
              {{ r.branch_name }}
            </div>
          </div>
          <div class="text-xs tabular-nums text-muted-foreground">
            후보 {{ r.photo_count }}장
          </div>
          <div
            class="text-xs font-semibold tabular-nums rounded-full px-2 py-0.5"
            :class="pickedCountFor(r.resident_id) >= MIN_PICK
              ? 'bg-primary/15 text-primary'
              : (pickedCountFor(r.resident_id) > 0
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-muted text-muted-foreground')"
            :title="`선택 ${pickedCountFor(r.resident_id)} / 최소 ${MIN_PICK}`"
          >
            선택 {{ pickedCountFor(r.resident_id) }} / 최소 {{ MIN_PICK }}
          </div>
          <component
            :is="expanded[r.resident_id] ? ChevronUp : ChevronDown"
            class="h-4 w-4 text-muted-foreground"
          />
        </button>

        <!-- Expanded photo grid -->
        <div v-if="expanded[r.resident_id]" class="px-5 pb-5 border-t bg-muted/10">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-4">
            <button
              v-for="p in photosByResident.get(r.resident_id) ?? []"
              :key="p.id"
              type="button"
              class="group relative rounded-lg overflow-hidden border-2 transition-all aspect-[4/3] focus:outline-none focus:ring-4 focus:ring-primary/30"
              :class="p.picked_for_month === targetMonth
                ? 'border-primary shadow-md ring-2 ring-primary/20'
                : 'border-transparent hover:border-input'"
              :disabled="togglingId === p.id"
              @click="togglePick(p)"
            >
              <img :src="p.data_url" :alt="`${r.resident_name} 사진`"
                   class="w-full h-full object-cover" loading="lazy" />

              <!-- Pick state overlay -->
              <div
                v-if="p.picked_for_month === targetMonth"
                class="absolute inset-0 bg-primary/20 flex items-center justify-center"
              >
                <div class="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                  <CheckCircle2 class="h-5 w-5" />
                </div>
              </div>

              <!-- Already-sent prior-month badge -->
              <span
                v-if="p.already_sent"
                class="absolute top-1.5 left-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/90 text-white shadow"
                :title="`${p.already_sent_month} 발송분으로 이미 전달됨`"
              >
                {{ p.already_sent_month }} 발송됨
              </span>

              <!-- Taken-on date in the corner -->
              <span class="absolute bottom-1.5 right-1.5 text-[10px] font-semibold bg-foreground/60 text-background rounded px-1.5 py-0.5">
                {{ fmtTakenDate(p.taken_at) }}
              </span>

              <!-- Optional caption tooltip on hover (truncated) -->
              <span
                v-if="p.caption"
                class="absolute bottom-1.5 left-1.5 right-12 truncate text-[10px] bg-foreground/60 text-background rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MessageSquare class="h-2.5 w-2.5 inline mr-0.5" />
                {{ p.caption }}
              </span>

              <Loader2
                v-if="togglingId === p.id"
                class="absolute top-1.5 right-1.5 h-4 w-4 text-primary animate-spin"
              />
            </button>
          </div>

          <p
            v-if="pickedCountFor(r.resident_id) > 0 && pickedCountFor(r.resident_id) < MIN_PICK"
            class="mt-3 text-[11px] text-amber-700 dark:text-amber-300"
          >
            ⚠ 가족 발송 최소 {{ MIN_PICK }}장이 필요합니다. 현재 {{ pickedCountFor(r.resident_id) }}장 선택됨.
          </p>
        </div>
      </article>
    </div>
  </div>
</template>
