<script setup lang="ts">
/**
 * /family-notify/event/[id] — picker for a 비정기 event.
 *
 * Same toolbar as the 정기 picker (count + 자동 선택 + 체크 + 발송) so HQ
 * can manipulate the send count the same way. Photos are those the tablet
 * tagged with this event_id at upload time.
 */
import {
  ArrowLeft, Send, Building2, CheckCircle2, Loader2, AlertCircle,
  CalendarHeart, Wand2, Eye, X,
} from "@lucide/vue";

const route   = useRoute();
const router  = useRouter();
const api     = useApi();
const toast   = useToast();
const eventId = route.params.id as string;

interface PhotoCandidate {
  id:               string;
  resident_id:      string;
  taken_at:         string;
  caption:          string | null;
  status:           string;
  picked_for_month: string | null;
  already_sent:     boolean;
  data_url:         string;
}
interface ResidentRow {
  resident_id:    string;
  resident_name:  string;
  branch_id:      string;
  branch_name:    string;
  photo_count:    number;
  picked_count:   number;
}
interface EventPickerResp {
  residents:    ResidentRow[];
  candidates:   PhotoCandidate[];
  total_photos: number;
  picked_count: number;
}
interface FamilyEvent {
  id: string; name: string; kind: string; year_month: string | null;
  scheduled_date: string;
  status: "scheduled" | "sent" | "cancelled";
  created_at: string; sent_at: string | null;
  photo_count: number; picked_count: number;
}

const { data: events } = await useAsyncData(`event-meta-${eventId}`, () =>
  api.get<FamilyEvent[]>("/v1/events"),
);
const meta = computed(() => (events.value ?? []).find((e) => e.id === eventId) ?? null);
useHead({ title: () => `${meta.value?.name ?? "이벤트"} · 가족 알림` });

const { data: picker, pending, error, refresh } = await useAsyncData(
  `event-picker-${eventId}`,
  () => api.get<EventPickerResp>(`/v1/photos/picker/event/${eventId}`),
);

// Server-side picked count drives the badges so they don't jump when the
// candidate list grows. Local pickedIds Set handles per-photo visual.
const eventTag = computed(() => `event-${eventId.slice(0, 8)}`);
const pickedIds = ref<Set<string>>(new Set());
watch(picker, (p) => {
  pickedIds.value = new Set(
    (p?.candidates ?? [])
      .filter((c) => c.picked_for_month !== null || c.already_sent)
      .map((c) => c.id),
  );
}, { immediate: true });
const pickedCount = computed(() => pickedIds.value.size);

const grouped = computed(() => {
  const byRes = new Map<string, { resident: ResidentRow; photos: PhotoCandidate[] }>();
  for (const r of picker.value?.residents ?? []) {
    byRes.set(r.resident_id, { resident: r, photos: [] });
  }
  for (const p of picker.value?.candidates ?? []) {
    byRes.get(p.resident_id)?.photos.push(p);
  }
  return Array.from(byRes.values());
});

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
      month: wasPicked ? null : eventTag.value,
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

// 자동 선택 — picks N random per resident from this event's tagged photos.
const autoCount   = ref(3);
const autoPicking = ref(false);
async function autoPickAll() {
  if (autoPicking.value) return;
  autoPicking.value = true;
  try {
    // Server's auto-pick currently scopes by month. For events we replicate
    // its semantics client-side: clear current picks for this event, then
    // pick N random per resident.
    const allPhotos = picker.value?.candidates ?? [];
    const byResident = new Map<string, PhotoCandidate[]>();
    for (const p of allPhotos) {
      if (p.already_sent) continue;
      (byResident.get(p.resident_id) ?? byResident.set(p.resident_id, []).get(p.resident_id)!)
        .push(p);
    }

    // Unpick everything first (parallel).
    const currentlyPicked = allPhotos.filter((p) => pickedIds.value.has(p.id) && !p.already_sent);
    await Promise.all(currentlyPicked.map((p) =>
      api.patch(`/v1/photos/${p.id}/pick`, { month: null }),
    ));

    // Then pick N random per resident.
    let total = 0;
    for (const [, photos] of byResident) {
      const shuffled = [...photos].sort(() => Math.random() - 0.5);
      const picks = shuffled.slice(0, autoCount.value);
      total += picks.length;
      await Promise.all(picks.map((p) =>
        api.patch(`/v1/photos/${p.id}/pick`, { month: eventTag.value }),
      ));
    }
    toast.success(`${total}장 새로 예약됨`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "자동 선택 실패", "오류");
  } finally {
    autoPicking.value = false;
  }
}

// 체크 — modal of every currently-picked photo (event-scoped).
const checkOpen = ref(false);
const checkPhotos = computed(() =>
  (picker.value?.candidates ?? []).filter((p) => pickedIds.value.has(p.id)),
);
const residentNameById = computed(() => {
  const m = new Map<string, string>();
  for (const r of picker.value?.residents ?? []) m.set(r.resident_id, r.resident_name);
  return m;
});

const sending = ref(false);
async function sendEvent() {
  if (sending.value) return;
  if (pickedCount.value === 0) { toast.error("선택된 사진이 없습니다", "알림"); return; }
  if (!confirm(`'${meta.value?.name}' 이벤트로 ${pickedCount.value}장을 가족 Telegram에 발송합니다.`)) return;
  sending.value = true;
  try {
    const r = await api.post<{ queued: number }>(`/v1/photos/send-event/${eventId}`, {});
    toast.success(`${r.queued}건 발송 요청 완료`);
    router.push("/family-notify");
  } catch (e: any) {
    toast.error(e?.data?.message ?? "발송 실패", "오류");
  } finally {
    sending.value = false;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <NuxtLink to="/family-notify" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
      <ArrowLeft class="h-4 w-4" />
      스케쥴러
    </NuxtLink>

    <div v-if="error" class="text-sm text-destructive py-12 text-center">
      <AlertCircle class="h-8 w-8 mx-auto mb-2" />
      불러오기에 실패했습니다.
    </div>

    <template v-else-if="meta">
      <header class="rounded-2xl border bg-gradient-to-br from-primary/10 to-card p-6 mb-6 flex items-center gap-5 flex-wrap">
        <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center flex-shrink-0">
          <CalendarHeart class="h-8 w-8" />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-bold tracking-tight">{{ meta.name }}</h1>
          <p class="text-sm text-muted-foreground mt-1">
            발송 예정일 <span class="font-medium tabular-nums">{{ meta.scheduled_date }}</span>
            · 후보 {{ picker?.total_photos ?? 0 }}장 · 예약 {{ pickedCount }}장
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <div class="inline-flex items-center rounded-lg border border-input bg-background overflow-hidden">
            <select v-model.number="autoCount" class="h-10 px-2 text-sm bg-transparent border-r border-input focus:outline-none focus:bg-muted/40" title="어르신당 자동 선택 장수">
              <option v-for="n in 8" :key="n" :value="n">{{ n }}장</option>
            </select>
            <button type="button" class="h-10 px-3 text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50" :disabled="autoPicking" @click="autoPickAll">
              <Loader2 v-if="autoPicking" class="h-4 w-4 animate-spin" />
              <Wand2 v-else class="h-4 w-4" />
              자동 선택
            </button>
          </div>
          <button type="button" class="h-10 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50" :disabled="pickedCount === 0" @click="checkOpen = true">
            <Eye class="h-4 w-4" />
            체크 ({{ pickedCount }})
          </button>
          <button type="button" class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50" :disabled="sending || pickedCount === 0 || meta.status !== 'scheduled'" @click="sendEvent">
            <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
            <Send v-else class="h-4 w-4" />
            발송 ({{ pickedCount }}건)
          </button>
        </div>
      </header>

      <div v-if="pending && !picker" class="space-y-6">
        <Skeleton h="6rem" />
        <Skeleton h="6rem" />
      </div>

      <div v-else-if="grouped.length === 0" class="rounded-2xl border bg-card p-16 text-center">
        <CalendarHeart class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
        <p class="text-sm text-muted-foreground">
          이 이벤트로 태블릿에서 올라온 사진이 없습니다.
        </p>
      </div>

      <div v-else class="space-y-8">
        <section v-for="g in grouped" :key="g.resident.resident_id">
          <div class="flex items-center gap-3 mb-3">
            <NuxtLink :to="`/residents/${g.resident.resident_id}`" class="text-base font-semibold hover:text-primary hover:underline underline-offset-2">
              {{ g.resident.resident_name }}
            </NuxtLink>
            <div class="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 class="h-3 w-3" />
              {{ g.resident.branch_name }}
            </div>
            <span class="ml-auto text-xs text-muted-foreground tabular-nums">
              {{ g.photos.length }}장 후보
            </span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <button v-for="p in g.photos" :key="p.id" type="button" class="group relative rounded-xl overflow-hidden border-2 transition-all aspect-[4/3] focus:outline-none focus:ring-4 focus:ring-primary/30" :class="pickedIds.has(p.id) ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-transparent hover:border-input'" :disabled="togglingId === p.id" @click="togglePick(p)">
              <img :src="p.data_url" alt="" class="w-full h-full object-cover" loading="lazy" />
              <div v-if="pickedIds.has(p.id)" class="absolute inset-0 bg-primary/20 flex items-center justify-center">
                <div class="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                  <CheckCircle2 class="h-6 w-6" />
                </div>
              </div>
              <span class="absolute bottom-2 right-2 text-[10px] font-semibold bg-foreground/60 text-background rounded px-2 py-0.5">
                {{ fmtDate(p.taken_at) }}
              </span>
              <Loader2 v-if="togglingId === p.id" class="absolute top-2 right-2 h-4 w-4 text-primary animate-spin" />
            </button>
          </div>
        </section>
      </div>

      <!-- 체크 modal -->
      <Teleport to="body">
        <div v-if="checkOpen" class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" @click.self="checkOpen = false">
          <div class="bg-card text-foreground rounded-xl shadow-2xl border w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div class="px-5 py-4 border-b flex items-center gap-3">
              <Eye class="h-5 w-5 text-primary" />
              <h2 class="text-base font-semibold">{{ meta.name }} 선택된 사진 ({{ checkPhotos.length }}장)</h2>
              <button type="button" class="ml-auto h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" @click="checkOpen = false">
                <X class="h-4 w-4" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-5">
              <div v-if="checkPhotos.length === 0" class="py-12 text-center text-sm text-muted-foreground">
                선택된 사진이 없습니다.
              </div>
              <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div v-for="p in checkPhotos" :key="p.id" class="relative rounded-xl overflow-hidden border bg-muted aspect-[4/3]">
                  <img :src="p.data_url" alt="" class="w-full h-full object-cover" loading="lazy" />
                  <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 via-foreground/40 to-transparent text-background p-3">
                    <div class="text-sm font-semibold truncate">{{ residentNameById.get(p.resident_id) ?? '' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>
