<script setup lang="ts">
/**
 * PhotoPreviewModal — shows the actual Telegram message preview for one
 * resident in a family-notify batch.
 *
 * Two query modes:
 *   • monthSend = 'YYYY-MM' → tag='regular' AND taken_at in (monthSend-1)
 *   • tag       = string    → all photos with that tag (event mode)
 *
 * Renders the resident header + a grid of photos with captions. This
 * mirrors what the family receives via Telegram.
 */
import { X, Loader2, AlertCircle, Camera, Calendar, MessageSquare } from "@lucide/vue";

interface PhotoCandidate {
  id:           string;
  taken_at:     string;
  caption:      string | null;
  data_url:     string;
  already_sent: boolean;
}
interface ResidentPickerResp {
  resident_id:   string;
  resident_name: string;
  branch_id:     string;
  branch_name:   string;
  candidates:    PhotoCandidate[];
  picked_count:  number;
}

const props = defineProps<{
  open:        boolean;
  residentId:  string | null;
  /** Either monthSend (2026-06) for 정기 OR tag for 비정기. */
  monthSend?:  string;
  tag?:        string;
  /** Batch label shown in the header (e.g., "2026년 6월 정기"). */
  batchLabel?: string;
}>();
const emit = defineEmits<{
  "update:open": [boolean];
}>();

const api = useApi();

const data    = ref<ResidentPickerResp | null>(null);
const loading = ref(false);
const error   = ref<string | null>(null);

async function load() {
  if (!props.residentId) return;
  loading.value = true; error.value = null; data.value = null;
  try {
    const params: Record<string, any> = {};
    if (props.tag) params.tag = props.tag;
    else if (props.monthSend) params.month = props.monthSend;
    data.value = await api.get<ResidentPickerResp>(
      `/v1/photos/picker/resident/${props.residentId}`,
      params,
    );
  } catch (e: any) {
    error.value = e?.data?.message ?? "사진을 불러오지 못했습니다";
  } finally {
    loading.value = false;
  }
}

watch(() => [props.open, props.residentId, props.monthSend, props.tag], ([o]) => {
  if (o) load();
});

function close() { emit("update:open", false); }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      @click.self="close"
    >
      <div class="bg-card text-foreground rounded-xl shadow-2xl border max-w-4xl w-full my-8 max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-start gap-3 p-5 border-b">
          <div class="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10 text-primary">
            <MessageSquare class="h-5 w-5" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold">가족 알림 미리보기</h2>
            <p v-if="data" class="text-sm text-muted-foreground mt-0.5">
              <span class="font-medium text-foreground">{{ data.resident_name }}</span>
              <span class="mx-1">·</span>{{ data.branch_name }}
              <span v-if="batchLabel" class="mx-1">·</span>
              <span v-if="batchLabel" class="text-primary">{{ batchLabel }}</span>
            </p>
          </div>
          <button type="button" class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" @click="close">
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-5">
          <div v-if="loading" class="py-20 text-center text-muted-foreground">
            <Loader2 class="h-8 w-8 mx-auto mb-3 animate-spin" />
            사진을 불러오는 중…
          </div>
          <div v-else-if="error" class="py-20 text-center text-destructive">
            <AlertCircle class="h-8 w-8 mx-auto mb-3" />
            {{ error }}
          </div>
          <div v-else-if="!data || data.candidates.length === 0" class="py-20 text-center text-muted-foreground">
            <Camera class="h-10 w-10 mx-auto mb-3 opacity-30" />
            발송할 사진이 없습니다.
          </div>
          <div v-else>
            <!-- Telegram-style message preview header -->
            <div class="mb-5 rounded-lg border bg-muted/30 p-4">
              <p class="text-xs text-muted-foreground mb-1">Telegram 메시지 미리보기:</p>
              <p class="text-sm leading-relaxed">
                안녕하세요. <span class="font-semibold">{{ data.resident_name }}</span> 어르신의 최근 사진 {{ data.candidates.length }}장을 보내드립니다.
                <br><span class="text-muted-foreground text-xs">— 케어닥 ({{ data.branch_name }})</span>
              </p>
            </div>

            <!-- Photo grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div v-for="(p, idx) in data.candidates" :key="p.id" class="rounded-lg border overflow-hidden bg-background">
                <div class="aspect-[4/3] bg-muted overflow-hidden">
                  <img :src="p.data_url" :alt="`${data.resident_name} ${idx + 1}`" class="w-full h-full object-cover">
                </div>
                <div class="p-3">
                  <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
                    <Calendar class="h-3 w-3" />
                    <span class="tabular-nums">{{ new Date(p.taken_at).toLocaleString('ko-KR') }}</span>
                    <span
                      v-if="p.already_sent"
                      class="ml-auto inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-200 px-1.5 py-0.5 text-[10px] font-medium"
                    >발송됨</span>
                  </div>
                  <p class="text-xs leading-relaxed">{{ p.caption ?? "—" }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 border-t flex items-center justify-end gap-2">
          <button type="button" class="h-9 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted" @click="close">
            닫기
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
