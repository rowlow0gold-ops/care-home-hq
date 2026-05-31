<script setup lang="ts">
/**
 * /tablet/residents/[id]/care-log — record a single care event.
 *
 * Pick a category (식사·배변·낙상·활동·기타) → type a short note → save.
 * Categories are big tap targets; the note is optional but encouraged for
 * 낙상/이상행동 to capture context.
 */
import { Loader2, CheckCircle2, Utensils, Toilet, AlertOctagon, Footprints, MessageSquare, ShowerHead } from "@lucide/vue";

definePageMeta({ layout: "tablet" });

const route = useRoute();
const api   = useTabletApi();
const toast = useToast();
const id    = computed(() => String(route.params.id));

const { data: detail } = await useAsyncData(`tablet-res-cl-${id.value}`, () =>
  api.get<{ resident: { full_name: string } }>(`/v1/residents/${id.value}`),
);
useHead({ title: () => `${detail.value?.resident.full_name ?? ""} 케어 기록 · 케어닥` });

interface Category {
  id: string; label: string; icon: any; tone: string;
  /** Whether to ALWAYS flag (notify HQ via care_log.flagged event). */
  alwaysFlag?: boolean;
  /** Quick-pick body templates. */
  templates?: string[];
}
const CATEGORIES: Category[] = [
  { id: "meal",      label: "식사",     icon: Utensils,     tone: "bg-amber-500",  templates: ["식사 완료 (전량)", "식사 70%", "식사 거부"] },
  { id: "toilet",    label: "배변/배뇨", icon: Toilet,       tone: "bg-blue-500",   templates: ["대변 정상", "소변 정상", "변비", "설사"] },
  { id: "bath",      label: "목욕/위생", icon: ShowerHead,   tone: "bg-cyan-500",   templates: ["전신 목욕", "부분 세정", "구강 케어"] },
  { id: "activity",  label: "활동",     icon: Footprints,   tone: "bg-emerald-500", templates: ["가벼운 산책", "낮 활동 참여", "수면 양호"] },
  { id: "incident",  label: "낙상/이상", icon: AlertOctagon, tone: "bg-rose-500",   alwaysFlag: true, templates: ["낙상", "의식 변화", "통증 호소"] },
  { id: "note",      label: "기타 메모", icon: MessageSquare, tone: "bg-violet-500", templates: ["가족 면회", "외출", "특이사항 없음"] },
];

const selected = ref<Category>(CATEGORIES[0]!);
const body     = ref("");
const saving   = ref(false);

function setCat(c: Category) { selected.value = c; body.value = ""; }
function applyTemplate(t: string) { body.value = t; }

async function save() {
  if (saving.value) return;
  if (!body.value.trim()) { toast.error("내용을 입력해주세요", "오류"); return; }
  saving.value = true;
  try {
    await api.post("/v1/care-logs", {
      resident_id: id.value,
      category:    selected.value.id,
      body:        body.value.trim(),
      flagged:     selected.value.alwaysFlag === true,
    });
    toast.success(`${selected.value.label} 기록 저장됨`, "✅ 저장 완료");
    body.value = "";
  } catch (e: any) {
    toast.error(e?.data?.message ?? "저장 실패", "오류");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">케어 기록</h1>
    <p class="text-sm text-muted-foreground mb-5">{{ detail?.resident.full_name }} 어르신</p>

    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
      <button
        v-for="c in CATEGORIES" :key="c.id"
        type="button"
        class="rounded-xl border p-3.5 text-left transition-colors active:scale-[0.98]"
        :class="selected.id === c.id ? 'border-primary bg-primary/5' : 'border-input bg-card hover:bg-muted/40'"
        @click="setCat(c)"
      >
        <div class="h-10 w-10 rounded-xl flex items-center justify-center text-white mb-2" :class="c.tone">
          <component :is="c.icon" class="h-5 w-5" />
        </div>
        <div class="font-semibold text-sm">{{ c.label }}</div>
        <div v-if="c.alwaysFlag" class="text-[10px] text-rose-600 dark:text-rose-300 mt-0.5">HQ 자동 알림</div>
      </button>
    </div>

    <div v-if="selected.templates" class="flex flex-wrap gap-1.5 mb-2">
      <button
        v-for="t in selected.templates" :key="t"
        type="button"
        class="h-8 px-3 rounded-full border border-input bg-card text-xs hover:bg-muted"
        @click="applyTemplate(t)"
      >{{ t }}</button>
    </div>

    <textarea
      v-model="body"
      class="w-full min-h-[140px] px-4 py-3 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary mb-4"
      placeholder="구체적인 상황을 적어주세요 (예: '낙상하셨으나 의식 명료, 좌측 무릎 통증 호소')"
      :disabled="saving"
    />

    <button
      type="button"
      class="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-lg font-bold inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60"
      :disabled="saving"
      @click="save"
    >
      <Loader2 v-if="saving" class="h-5 w-5 animate-spin" />
      <CheckCircle2 v-else class="h-5 w-5" />
      저장하기
    </button>
  </div>
</template>
