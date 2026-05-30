<script setup lang="ts">
/**
 * /family-notify/event/[id] — read-only summary for a 비정기 event.
 *
 * Photos are collected by tag (set by caregivers at tablet upload time).
 * HQ doesn't curate — they just see who has photos in this batch and
 * fire 발송 when ready.
 */
import {
  ArrowLeft, Send, Building2, Loader2, AlertCircle,
  CalendarHeart, Camera,
} from "@lucide/vue";

const route   = useRoute();
const router  = useRouter();
const api     = useApi();
const toast   = useToast();
const eventId = route.params.id as string;

interface PhotoCandidate {
  id: string;
  resident_id: string;
  taken_at: string;
  caption: string | null;
  status: string;
  picked_for_month: string | null;
  already_sent: boolean;
  data_url: string;
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
  id: string; name: string; kind: string;
  year_month: string | null; tag: string | null;
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

const sending = ref(false);
async function sendEvent() {
  if (sending.value) return;
  const n = picker.value?.total_photos ?? 0;
  if (n === 0) { toast.error("발송할 사진이 없습니다", "알림"); return; }
  if (!confirm(`'${meta.value?.name}' 이벤트로 ${n}장을 가족 Telegram에 즉시 발송합니다.`)) return;
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
      <header class="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ meta.name }}</h1>
          <p class="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span class="inline-flex items-center gap-1">
              <CalendarHeart class="h-3.5 w-3.5" />
              {{ meta.scheduled_date }} 발송 예정
            </span>
            <span class="inline-flex items-center gap-1 font-mono text-xs bg-muted px-2 py-0.5 rounded">
              태그: {{ meta.tag }}
            </span>
            <span>· 후보 사진 {{ picker?.total_photos ?? 0 }}장</span>
          </p>
        </div>
        <button
          type="button"
          class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
          :disabled="sending || (picker?.total_photos ?? 0) === 0 || meta.status !== 'scheduled'"
          @click="sendEvent"
        >
          <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
          <Send v-else class="h-4 w-4" />
          발송 ({{ picker?.total_photos ?? 0 }}건)
        </button>
      </header>

      <div class="rounded-xl border bg-card overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground bg-muted/30">
              <th class="py-3 px-6 font-medium">어르신</th>
              <th class="py-3 px-3 font-medium">지점</th>
              <th class="py-3 px-3 font-medium text-right">발송 예정</th>
            </tr>
          </thead>
          <tbody v-if="pending && !picker">
            <tr v-for="i in 6" :key="`sk-${i}`" class="border-t">
              <td class="py-3 px-6"><Skeleton w="6rem" /></td>
              <td class="py-3 px-3"><Skeleton w="7rem" /></td>
              <td class="py-3 px-3 text-right"><Skeleton w="2rem" class="ml-auto" /></td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr v-for="r in picker?.residents ?? []" :key="r.resident_id" class="border-t">
              <td class="py-3 px-6">
                <div class="flex items-center gap-3">
                  <div class="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {{ r.resident_name.charAt(0) }}
                  </div>
                  <NuxtLink
                    :to="`/residents/${r.resident_id}`"
                    class="font-medium hover:text-primary hover:underline underline-offset-2"
                  >
                    {{ r.resident_name }}
                  </NuxtLink>
                </div>
              </td>
              <td class="py-3 px-3">
                <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 class="h-3 w-3" />
                  {{ r.branch_name }}
                </div>
              </td>
              <td class="py-3 px-3 text-right">
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                  :class="r.photo_count === 0
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/10 text-primary'"
                >
                  {{ r.photo_count }}장
                </span>
              </td>
            </tr>
            <tr v-if="(picker?.residents?.length ?? 0) === 0">
              <td colspan="3" class="py-12 text-center text-muted-foreground">
                <Camera class="h-10 w-10 mx-auto mb-3 opacity-30" />
                이 태그(<span class="font-mono">{{ meta.tag }}</span>)로 태블릿에서 올라온 사진이 없습니다.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
