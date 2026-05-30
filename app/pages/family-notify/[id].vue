<script setup lang="ts">
/**
 * /family-notify/[id]?month=YYYY-MM — photo picker for one resident.
 *
 * Shows the 8 candidate photos uploaded by the tablet for the target month.
 * Older months load further down (no toggle — natural scroll = lazy load
 * via <img loading="lazy">). No minimum-pick requirement; HQ picks freely.
 */
import {
  ArrowLeft, Send, Building2, CheckCircle2, Loader2, MessageSquare,
  AlertCircle, Calendar, Wand2,
} from "@lucide/vue";

const route  = useRoute();
const router = useRouter();
const api    = useApi();
const toast  = useToast();

const residentId = route.params.id as string;
const month      = (route.query.month as string | undefined)
                 ?? new Date().toISOString().slice(0, 7);

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
interface ResidentPickerResp {
  resident_id:   string;
  resident_name: string;
  branch_id:     string;
  branch_name:   string;
  candidates:    PhotoCandidate[];
  picked_count:  number;
}

// Always include the 3-month archive — server caps it at 30. The user gets
// "lazy loading" naturally because <img loading="lazy"> defers off-screen
// images. Removes the previous toggle + helper text.
const { data: picker, pending, error, refresh } = await useAsyncData(
  `picker-${residentId}-${month}`,
  () => api.get<ResidentPickerResp>(`/v1/photos/picker/resident/${residentId}`, {
    month, include_prior: true,
  }),
);

useHead({ title: () => `${picker.value?.resident_name ?? "어르신"} · 가족 알림` });

// Reactive pick Set — drives both the visual and the count.
const pickedIds = ref<Set<string>>(new Set());
watch(picker, (p) => {
  pickedIds.value = new Set(
    (p?.candidates ?? [])
      .filter((c) => c.picked_for_month === month)
      .map((c) => c.id),
  );
}, { immediate: true });

const pickedCount = computed(() => pickedIds.value.size);

const togglingId = ref<string | null>(null);
async function togglePick(photo: PhotoCandidate) {
  if (togglingId.value) return;
  togglingId.value = photo.id;
  const wasPicked = pickedIds.value.has(photo.id);
  const next = new Set(pickedIds.value);
  if (wasPicked) next.delete(photo.id); else next.add(photo.id);
  pickedIds.value = next;
  try {
    await api.patch(`/v1/photos/${photo.id}/pick`, {
      month: wasPicked ? null : month,
    });
  } catch (e: any) {
    const revert = new Set(pickedIds.value);
    if (wasPicked) revert.add(photo.id); else revert.delete(photo.id);
    pickedIds.value = revert;
    toast.error(e?.data?.message ?? "선택 실패", "오류");
  } finally {
    togglingId.value = null;
  }
}

const autoCount   = ref(3);
const autoPicking = ref(false);
async function autoPickThis() {
  if (autoPicking.value) return;
  autoPicking.value = true;
  try {
    const r = await api.post<{ picked: number }>("/v1/photos/auto-pick", {
      month, resident_id: residentId, count: autoCount.value,
    });
    toast.success(`${r.picked}장 새로 예약됨`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "자동 선택 실패", "오류");
  } finally {
    autoPicking.value = false;
  }
}

const sending = ref(false);
async function sendThisResident() {
  if (sending.value || pickedCount.value === 0) return;
  if (!confirm(`${picker.value?.resident_name} 어르신의 사진 ${pickedCount.value}장을 가족에게 즉시 발송합니다.`)) return;
  sending.value = true;
  try {
    const r = await api.post<{ queued: number }>("/v1/photos/send-batch", {
      month, resident_id: residentId,
    });
    toast.success(`${r.queued}건 발송 요청 완료`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "발송 실패", "오류");
  } finally {
    sending.value = false;
  }
}

// Group photos by month for the inline section headers.
const grouped = computed(() => {
  const m = new Map<string, PhotoCandidate[]>();
  for (const p of picker.value?.candidates ?? []) {
    const key = p.taken_at.slice(0, 7);
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(p);
  }
  return Array.from(m.entries()).sort(([a], [b]) => b.localeCompare(a));
});

function fmtTakenDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}
function monthLabel(m: string) {
  if (m === month) return `${m} (이달)`;
  return `${m} 이전`;
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <NuxtLink
      :to="`/family-notify/month/${month}`"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      {{ month }} 정기 발송
    </NuxtLink>

    <div v-if="error" class="text-sm text-destructive py-12 text-center">
      <AlertCircle class="h-8 w-8 mx-auto mb-2" />
      불러오기에 실패했습니다.
    </div>

    <template v-else-if="picker">
      <!-- Header -->
      <header class="rounded-2xl border bg-gradient-to-br from-primary/10 to-card p-6 mb-6 flex items-center gap-5 flex-wrap">
        <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-2xl font-bold flex-shrink-0">
          {{ picker.resident_name.charAt(0) }}
        </div>
        <div class="min-w-0 flex-1">
          <NuxtLink
            :to="`/residents/${picker.resident_id}`"
            class="inline-flex items-baseline gap-2 text-2xl font-bold tracking-tight hover:text-primary underline-offset-4 hover:underline"
            title="어르신 상세 페이지"
          >
            {{ picker.resident_name }}
            <span class="text-sm font-normal opacity-70">→ 케어 관리</span>
          </NuxtLink>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            <Building2 class="h-3.5 w-3.5" />
            <NuxtLink :to="`/branches/${picker.branch_id}`" class="hover:text-primary underline-offset-4 hover:underline">
              {{ picker.branch_name }}
            </NuxtLink>
            <span>·</span>
            <Calendar class="h-3.5 w-3.5" />
            <span>{{ month }} 발송분</span>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span
            class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums"
            :class="pickedCount > 0
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground'"
          >
            <CheckCircle2 v-if="pickedCount > 0" class="h-3.5 w-3.5" />
            예약 {{ pickedCount }}장
          </span>
          <div class="inline-flex items-center rounded-lg border border-input bg-background overflow-hidden">
            <select
              v-model.number="autoCount"
              class="h-10 px-2 text-sm bg-transparent border-r border-input focus:outline-none focus:bg-muted/40"
              title="자동 선택 장수"
            >
              <option v-for="n in 8" :key="n" :value="n">{{ n }}장</option>
            </select>
            <button
              type="button"
              class="h-10 px-3 text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
              :disabled="autoPicking"
              title="이달 후보 중 무작위로 새로 예약 (기존 예약은 교체)"
              @click="autoPickThis"
            >
              <Loader2 v-if="autoPicking" class="h-4 w-4 animate-spin" />
              <Wand2 v-else class="h-4 w-4" />
              자동 선택
            </button>
          </div>
          <button
            type="button"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
            :disabled="sending || pickedCount === 0"
            @click="sendThisResident"
          >
            <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
            <Send v-else class="h-4 w-4" />
            이 어르신 발송 ({{ pickedCount }}건)
          </button>
        </div>
      </header>

      <div v-if="pending && !picker" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <Skeleton v-for="i in 8" :key="i" h="14rem" />
      </div>

      <div
        v-else-if="(picker.candidates?.length ?? 0) === 0"
        class="rounded-2xl border bg-card p-16 text-center"
      >
        <p class="text-sm text-muted-foreground">
          {{ month }}에 업로드된 사진이 없습니다.
        </p>
      </div>

      <!-- Photo grid, grouped by month. Bigger tiles (3-col on lg) so HQ can
           see content clearly. <img loading="lazy"> defers off-screen ones. -->
      <div v-else class="space-y-8">
        <section v-for="[m, photos] in grouped" :key="m">
          <h2
            class="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2"
            :class="m === month ? 'text-foreground' : ''"
          >
            <Calendar class="h-3.5 w-3.5" />
            {{ monthLabel(m) }}
            <span class="text-xs font-normal opacity-70">· {{ photos.length }}장</span>
          </h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <button
              v-for="p in photos"
              :key="p.id"
              type="button"
              class="group relative rounded-xl overflow-hidden border-2 transition-all aspect-[4/3] focus:outline-none focus:ring-4 focus:ring-primary/30"
              :class="pickedIds.has(p.id)
                ? 'border-primary shadow-md ring-2 ring-primary/20'
                : 'border-transparent hover:border-input'"
              :disabled="togglingId === p.id"
              @click="togglePick(p)"
            >
              <img :src="p.data_url" alt="사진 후보" class="w-full h-full object-cover" loading="lazy" />
              <div
                v-if="pickedIds.has(p.id)"
                class="absolute inset-0 bg-primary/20 flex items-center justify-center"
              >
                <div class="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                  <CheckCircle2 class="h-6 w-6" />
                </div>
              </div>
              <span
                v-if="p.already_sent"
                class="absolute top-2 left-2 inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold bg-amber-500/90 text-white shadow"
              >
                {{ p.already_sent_month }} 발송됨
              </span>
              <span class="absolute bottom-2 right-2 text-[10px] font-semibold bg-foreground/60 text-background rounded px-2 py-0.5">
                {{ fmtTakenDate(p.taken_at) }}
              </span>
              <span
                v-if="p.caption"
                class="absolute bottom-2 left-2 right-16 truncate text-[10px] bg-foreground/60 text-background rounded px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MessageSquare class="h-2.5 w-2.5 inline mr-0.5" />
                {{ p.caption }}
              </span>
              <Loader2
                v-if="togglingId === p.id"
                class="absolute top-2 right-2 h-4 w-4 text-primary animate-spin"
              />
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
