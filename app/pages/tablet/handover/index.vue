<script setup lang="ts">
/**
 * /tablet/handover — 인수인계서 list + write.
 *
 * Top: a 새 인수인계 작성 button opening an inline editor.
 * Below: chronological list (newest first), tap to mark as 확인.
 */
import { Loader2, Plus, CheckCircle2, ClipboardCheck, AlertTriangle, Pill, MessageSquare } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "인수인계 · 케어닥" });

const api    = useTabletApi();
const toast  = useToast();
const { me } = useTablet();

interface HandoverNote {
  id: string; posted_by: string; posted_by_name: string; posted_by_role: string;
  resident_id: string | null; resident_name: string | null;
  category: string; body: string; posted_at: string;
  acked_by_me: boolean; ack_count: number;
}
interface HandoverPage { items: HandoverNote[]; total: number; page: number; page_size: number }

const { data: paged, refresh } = await useAsyncData("tablet-handovers", () =>
  api.get<HandoverPage>("/v1/handovers", { page: 1, page_size: 50 }),
);

// ── Composer ──
const composing = ref(false);
const newCategory = ref<"general" | "urgent" | "medication" | "incident">("general");
const newBody     = ref("");
const saving      = ref(false);

const categories: { id: typeof newCategory.value; label: string; icon: any; tone: string }[] = [
  { id: "general",    label: "일반",       icon: MessageSquare, tone: "bg-slate-500" },
  { id: "urgent",     label: "긴급",       icon: AlertTriangle, tone: "bg-rose-500"  },
  { id: "medication", label: "투약",       icon: Pill,          tone: "bg-violet-500"},
  { id: "incident",   label: "사고/이상",  icon: AlertTriangle, tone: "bg-amber-500" },
];

async function submit() {
  if (saving.value) return;
  if (!newBody.value.trim()) { toast.error("내용을 입력해주세요", "오류"); return; }
  saving.value = true;
  try {
    await api.post("/v1/handovers", {
      category: newCategory.value,
      body:     newBody.value.trim(),
    });
    toast.success("인수인계 등록됨", "✅");
    newBody.value = "";
    composing.value = false;
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "저장 실패", "오류");
  } finally {
    saving.value = false;
  }
}

const acking = ref<string | null>(null);
async function ack(h: HandoverNote) {
  if (acking.value || h.acked_by_me) return;
  acking.value = h.id;
  try {
    await api.post(`/v1/handovers/${h.id}/ack`, {});
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "확인 실패", "오류");
  } finally {
    acking.value = null;
  }
}

function catMeta(id: string) {
  return categories.find(c => c.id === id) ?? categories[0];
}
function fmt(dt: string) {
  return new Date(dt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">인수인계서</h1>
      <button
        v-if="!composing"
        type="button"
        class="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
        @click="composing = true"
      >
        <Plus class="h-4 w-4" />
        새 인수인계
      </button>
    </div>

    <!-- Composer -->
    <div v-if="composing" class="rounded-2xl border bg-card p-4 mb-4 space-y-3">
      <div class="text-sm font-semibold">분류</div>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="c in categories" :key="c.id"
          type="button"
          class="rounded-lg border p-2 text-center"
          :class="newCategory === c.id
            ? 'border-primary bg-primary/5'
            : 'border-input hover:bg-muted/40'"
          @click="newCategory = c.id"
        >
          <div class="h-9 w-9 mx-auto rounded-lg flex items-center justify-center text-white mb-1" :class="c.tone">
            <component :is="c.icon" class="h-4 w-4" />
          </div>
          <div class="text-[11px] font-medium">{{ c.label }}</div>
        </button>
      </div>
      <textarea
        v-model="newBody"
        rows="4"
        class="w-full px-3 py-2 rounded-lg border border-input bg-background text-base focus:outline-none focus:border-primary"
        placeholder="예: 305호 김할머니 어제 새벽에 잠 못 주무심. 오늘 오후에 컨디션 확인 부탁드려요."
        :disabled="saving"
      />
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 h-12 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted"
          :disabled="saving"
          @click="composing = false; newBody = ''"
        >취소</button>
        <button
          type="button"
          class="flex-1 h-12 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
          :disabled="saving || !newBody.trim()"
          @click="submit"
        >
          <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
          <ClipboardCheck v-else class="h-4 w-4" />
          저장
        </button>
      </div>
    </div>

    <!-- List -->
    <div v-if="(paged?.items?.length ?? 0) === 0" class="py-16 text-center text-sm text-muted-foreground">
      등록된 인수인계가 없습니다.
    </div>
    <ul v-else class="space-y-3">
      <li v-for="h in paged!.items" :key="h.id" :id="h.id" class="rounded-xl border bg-card p-4">
        <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span
              class="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0"
              :class="catMeta(h.category).tone"
            >
              <component :is="catMeta(h.category).icon" class="h-4 w-4" />
            </span>
            <div class="min-w-0">
              <div class="text-sm font-semibold truncate">
                {{ h.posted_by_name }}
                <span v-if="h.resident_name" class="text-muted-foreground">· {{ h.resident_name }}</span>
              </div>
              <div class="text-[11px] text-muted-foreground">{{ fmt(h.posted_at) }}</div>
            </div>
          </div>
          <button
            v-if="!h.acked_by_me && h.posted_by !== me?.id"
            type="button"
            class="h-9 px-3 rounded-md bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-600 disabled:opacity-60"
            :disabled="acking === h.id"
            @click="ack(h)"
          >
            <Loader2 v-if="acking === h.id" class="h-3.5 w-3.5 animate-spin" />
            <CheckCircle2 v-else class="h-3.5 w-3.5" />
            확인
          </button>
          <span v-else-if="h.acked_by_me" class="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            <CheckCircle2 class="h-4 w-4" /> 확인됨
          </span>
        </div>
        <p class="text-sm whitespace-pre-wrap leading-relaxed">{{ h.body }}</p>
        <div class="text-[11px] text-muted-foreground mt-2">확인 {{ h.ack_count }}명</div>
      </li>
    </ul>
  </div>
</template>
