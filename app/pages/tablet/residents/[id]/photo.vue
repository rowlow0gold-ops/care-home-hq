<script setup lang="ts">
/**
 * /tablet/residents/[id]/photo — take or pick a photo, tag it, upload.
 *
 * Tag picker is sourced from active 가족 알림 events. Default is "regular"
 * (monthly family batch — used 90% of the time). Caregivers can switch to
 * an event tag like 추석 or 어버이날 when uploading event-specific photos.
 *
 * After upload the photo lands in HQ's pending-approval queue; HQ approval
 * → FamilyPhotoApproved event → worker sends to family Telegram contacts.
 */
import { Loader2, Camera, X, CheckCircle2, Tag } from "@lucide/vue";

definePageMeta({ layout: "tablet" });

const route = useRoute();
const toast = useToast();
const id    = computed(() => String(route.params.id));

const { data: detail } = await useAsyncData(`tablet-res-ph-${id.value}`, () =>
  $fetch<{ full_name: string }>(`/api/tablet/v1/residents/${id.value}`),
);
useHead({ title: () => `${detail.value?.full_name ?? ""} 사진 · 케어닥` });

// Event tag picker — pulls active events so caregivers can attach the
// upload to the right campaign. /v1/events is tablet-accessible.
interface EventTag { id: string; name: string; tag: string | null; kind: string; status: string }
interface EventPage { items: EventTag[] }
const { data: events } = await useAsyncData("tablet-event-tags", () =>
  $fetch<EventPage>("/api/tablet/v1/events", { query: { page: 1, page_size: 50 } }),
);
const tagOptions = computed(() => {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [
    { value: "regular", label: "정기 (월별)" },
  ];
  seen.add("regular");
  for (const e of events.value?.items ?? []) {
    if (e.status === "cancelled") continue;
    const t = e.tag?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push({ value: t, label: `${e.name} · ${t}` });
  }
  return out;
});

const file      = ref<File | null>(null);
const preview   = ref<string | null>(null);
const caption   = ref("");
const tag       = ref("regular");
const uploading = ref(false);
const lastOk    = ref(false);

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  file.value = f;
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = URL.createObjectURL(f);
  lastOk.value = false;
}
function clearPick() {
  if (preview.value) URL.revokeObjectURL(preview.value);
  file.value = null;
  preview.value = null;
  caption.value = "";
}

async function upload() {
  if (uploading.value || !file.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append("resident_id", id.value);
    form.append("tag", tag.value || "regular");
    if (caption.value.trim()) form.append("caption", caption.value.trim());
    form.append("file", file.value);
    await $fetch("/api/tablet/v1/photos", { method: "POST", body: form });
    toast.success("HQ 승인 대기열로 전송됨", "📸 업로드 완료");
    lastOk.value = true;
    clearPick();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "업로드 실패", "오류");
  } finally {
    uploading.value = false;
  }
}

onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value);
});
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">사진 업로드</h1>
    <p class="text-sm text-muted-foreground mb-5">{{ detail?.full_name }} 어르신</p>

    <!-- Tag picker -->
    <div class="mb-4">
      <label class="text-sm font-semibold flex items-center gap-1.5 mb-1.5">
        <Tag class="h-4 w-4" />
        사진 태그
      </label>
      <select
        v-model="tag"
        class="w-full h-12 px-3 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary"
        :disabled="uploading"
      >
        <option v-for="t in tagOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <p class="text-xs text-muted-foreground mt-1">
        보통 <b>정기 (월별)</b>를 선택합니다. 특별한 이벤트가 있을 때만 다른 태그를 선택하세요.
      </p>
    </div>

    <!-- Preview or capture button -->
    <div
      v-if="!preview"
      class="rounded-2xl border-2 border-dashed border-input bg-muted/20 p-10 text-center"
    >
      <Camera class="h-14 w-14 mx-auto text-muted-foreground mb-3" />
      <p class="text-sm text-muted-foreground mb-4">사진을 촬영하거나 갤러리에서 선택하세요.</p>
      <label class="inline-flex items-center justify-center h-14 px-6 rounded-xl bg-primary text-primary-foreground font-semibold cursor-pointer hover:bg-primary/90">
        <Camera class="h-5 w-5 mr-2" />
        카메라 / 갤러리 열기
        <input
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          @change="onPick"
        />
      </label>
    </div>

    <div v-else class="rounded-2xl border bg-card overflow-hidden mb-4 relative">
      <img :src="preview" class="w-full max-h-[60vh] object-contain bg-black" alt="preview" />
      <button
        type="button"
        class="absolute top-3 right-3 h-10 w-10 rounded-full bg-black/60 text-white inline-flex items-center justify-center hover:bg-black/80"
        :disabled="uploading"
        @click="clearPick"
        aria-label="취소"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <textarea
      v-if="preview"
      v-model="caption"
      class="w-full min-h-[80px] px-4 py-3 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary mb-4"
      placeholder="가족에게 보낼 메시지 (선택, 예: '오늘 활짝 웃으셨어요')"
      :disabled="uploading"
    />

    <button
      v-if="preview"
      type="button"
      class="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-lg font-bold inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60"
      :disabled="uploading"
      @click="upload"
    >
      <Loader2 v-if="uploading" class="h-5 w-5 animate-spin" />
      <CheckCircle2 v-else class="h-5 w-5" />
      업로드
    </button>

    <div v-if="lastOk" class="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 p-3 text-sm">
      업로드 완료. HQ에서 승인하면 자동으로 가족 Telegram으로 전송됩니다.
    </div>
  </div>
</template>
