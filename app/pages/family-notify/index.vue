<script setup lang="ts">
/**
 * /family-notify — HQ-only review queue for caregiver-uploaded photos
 * before they ship to family Telegram chats.
 *
 * Flow:
 *   Tauri caregiver → POST /v1/photos (multipart, status=pending)
 *     ↓
 *   HQ here → reviews pending list → 승인 / 반려
 *     ↓ on 승인
 *   API publishes family.photo MQ event
 *     ↓
 *   Worker consumer → Telegram sendPhoto to every resident_contact
 *                     where receives_photos = true && telegram_chat_id IS NOT NULL
 *
 * V1: 가족별 recipient picker is NOT in scope yet — worker sends to all
 *     flagged contacts. Adding per-send picking is the v1.1 slice
 *     (needs DecideReq.recipients field + worker change).
 */
import {
  Send, Camera, CheckCircle2, XCircle, RefreshCw, Building2,
  Clock, MessageSquare, AlertCircle,
} from "@lucide/vue";

useHead({ title: "가족 알림 · 케어닥 HQ" });
// auth.global.ts already gates every route; no need for a per-page middleware.

interface PhotoSummary {
  id: string;
  resident_id: string;
  resident_name: string;
  branch_id: string;
  branch_name: string;
  taken_by_name: string;
  taken_at: string;
  caption: string | null;
  status: string;
  data_url: string;       // data:image/jpeg;base64,…
}

const api   = useApi();
const toast = useToast();

type Tab = "pending" | "approved" | "rejected";
const tab = ref<Tab>("pending");

const { data: photos, pending, error, refresh } = await useAsyncData(
  () => `family-notify-${tab.value}`,
  () => api.get<PhotoSummary[]>("/v1/photos/pending", { status: tab.value }),
  { watch: [tab] },
);

const reviewNote = reactive<Record<string, string>>({});
const decidingId = ref<string | null>(null);

async function decide(id: string, status: "approved" | "rejected") {
  if (decidingId.value) return;
  decidingId.value = id;
  try {
    await api.patch(`/v1/photos/${id}/decide`, {
      status,
      note: reviewNote[id]?.trim() || undefined,
    });
    delete reviewNote[id];
    toast.success(
      status === "approved" ? "가족 Telegram 발송이 요청되었습니다" : "반려 처리되었습니다",
    );
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "처리 실패", "오류");
  } finally {
    decidingId.value = null;
  }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: "pending",  label: "검토 대기", icon: Clock },
  { key: "approved", label: "발송됨",   icon: CheckCircle2 },
  { key: "rejected", label: "반려됨",   icon: XCircle },
];
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Send class="h-7 w-7 text-primary" />
          가족 알림
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          데스크톱 앱에서 올라온 어르신 사진을 검토하고 가족 Telegram으로 발송합니다.
          승인 즉시 자동 전송됩니다.
        </p>
      </div>
      <button
        type="button"
        class="h-9 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted"
        @click="refresh()"
      >
        <RefreshCw class="h-3.5 w-3.5" />
        새로고침
      </button>
    </header>

    <!-- Tab bar -->
    <div class="border-b mb-6 flex gap-1">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2.5 -mb-px text-sm border-b-2 transition-colors"
        :class="tab === t.key
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = t.key"
      >
        <component :is="t.icon" class="h-4 w-4" />
        {{ t.label }}
        <span v-if="tab === t.key && (photos?.length ?? 0) > 0"
              class="text-[10px] tabular-nums opacity-70 rounded-full px-1.5 py-0.5 bg-primary/10">
          {{ photos!.length }}
        </span>
      </button>
    </div>

    <div v-if="error" class="text-sm text-destructive py-12 text-center">
      <AlertCircle class="h-8 w-8 mx-auto mb-2" />
      불러오기에 실패했습니다.
    </div>

    <div v-else-if="pending && !photos" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Skeleton v-for="i in 4" :key="`sk-${i}`" h="14rem" />
    </div>

    <div
      v-else-if="(photos?.length ?? 0) === 0"
      class="rounded-2xl border bg-card p-16 text-center"
    >
      <Camera class="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
      <p class="text-sm text-muted-foreground">
        <template v-if="tab === 'pending'">검토할 사진이 없습니다.</template>
        <template v-else-if="tab === 'approved'">발송 기록이 없습니다.</template>
        <template v-else>반려 기록이 없습니다.</template>
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <article
        v-for="p in photos ?? []"
        :key="p.id"
        class="rounded-xl border bg-card overflow-hidden flex flex-col"
      >
        <!-- Photo -->
        <div class="aspect-[4/3] bg-muted/50 relative overflow-hidden">
          <img :src="p.data_url" :alt="`${p.resident_name} 사진`"
               class="w-full h-full object-cover" loading="lazy" />
          <span
            v-if="tab !== 'pending'"
            class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            :class="tab === 'approved'
              ? 'bg-primary/15 text-primary'
              : 'bg-destructive/15 text-destructive'"
          >
            <CheckCircle2 v-if="tab === 'approved'" class="h-3 w-3" />
            <XCircle v-else class="h-3 w-3" />
            {{ tab === 'approved' ? '발송됨' : '반려' }}
          </span>
        </div>

        <!-- Body -->
        <div class="p-4 flex-1 flex flex-col">
          <div class="flex items-start gap-2">
            <NuxtLink :to="`/residents/${p.resident_id}`"
                      class="font-semibold hover:text-primary hover:underline underline-offset-2">
              {{ p.resident_name }}
            </NuxtLink>
            <span class="text-xs text-muted-foreground tabular-nums ml-auto">
              {{ fmtTime(p.taken_at) }}
            </span>
          </div>
          <div class="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Building2 class="h-3 w-3" />
            {{ p.branch_name }}
            <span class="opacity-50">·</span>
            촬영: {{ p.taken_by_name }}
          </div>

          <div v-if="p.caption" class="mt-3 text-sm bg-muted/30 rounded-lg p-3 flex gap-2">
            <MessageSquare class="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <span class="flex-1 whitespace-pre-wrap">{{ p.caption }}</span>
          </div>

          <!-- Pending: caption note + action buttons -->
          <template v-if="tab === 'pending'">
            <div class="mt-3 flex-1">
              <label class="text-xs text-muted-foreground">
                메모 (선택) — 반려 시 사유, 승인 시 가족에게 전달됩니다.
              </label>
              <textarea
                v-model="reviewNote[p.id]"
                rows="2"
                placeholder="예: 오늘 아침 식사 후 산책 모습입니다."
                class="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 resize-none"
              />
            </div>
            <div class="mt-3 flex items-center gap-2">
              <button
                type="button"
                class="flex-1 h-9 rounded-lg border border-destructive/40 bg-transparent text-destructive text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-destructive/10 disabled:opacity-50"
                :disabled="decidingId === p.id"
                @click="decide(p.id, 'rejected')"
              >
                <XCircle class="h-3.5 w-3.5" />
                반려
              </button>
              <button
                type="button"
                class="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
                :disabled="decidingId === p.id"
                @click="decide(p.id, 'approved')"
              >
                <Send class="h-3.5 w-3.5" />
                승인 · 가족에게 발송
              </button>
            </div>
          </template>
        </div>
      </article>
    </div>
  </div>
</template>
