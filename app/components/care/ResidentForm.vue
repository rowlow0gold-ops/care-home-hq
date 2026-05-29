<script setup lang="ts">
/**
 * Inline form for create / edit of a Resident. Used by:
 *   · /residents/[id]  (mode='edit') — 수정 button in the header
 *   · /care?tab=residents (mode='create') — 어르신 추가 button
 *
 * Wires to POST /v1/residents (create) and PATCH /v1/residents/:id (edit).
 * Emits 'saved' (with the saved resident) and 'cancel'.
 */
import { Save, X, Plus } from "@lucide/vue";

interface ResidentDetail {
  id: string;
  full_name: string;
  sex: "male" | "female" | "other";
  birth_date: string;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string;
  status?: string;
}

const props = defineProps<{
  mode: "create" | "edit";
  initial?: ResidentDetail | null;
}>();
const emit = defineEmits<{
  saved:  [resident: ResidentDetail];
  cancel: [];
}>();

const api = useApi();

const form = reactive({
  full_name:   props.initial?.full_name ?? "",
  sex:         props.initial?.sex ?? "female" as "male" | "female" | "other",
  birth_date:  props.initial?.birth_date ?? "",
  care_grade:  props.initial?.care_grade ?? "",
  room_number: props.initial?.room_number ?? "",
  admitted_on: props.initial?.admitted_on ?? new Date().toISOString().slice(0, 10),
});
const fieldErrors = reactive<Record<string, string | null>>({});

const create = useApiMutation<typeof form, ResidentDetail>(
  (body) => api.post<ResidentDetail>("/v1/residents", body),
  {
    successMessage: "어르신이 등록되었습니다",
    onSuccess: (r) => emit("saved", r),
  },
);
const update = useApiMutation<typeof form, ResidentDetail>(
  (body) => api.patch<ResidentDetail>(`/v1/residents/${props.initial?.id}`, body),
  {
    successMessage: "어르신 정보가 수정되었습니다",
    onSuccess: (r) => emit("saved", r),
  },
);

const submitting = computed(() => create.pending.value || update.pending.value);

function validate(): boolean {
  for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
  let ok = true;
  if (!form.full_name.trim())  { fieldErrors.full_name  = "이름을 입력해 주세요."; ok = false; }
  if (!form.birth_date)        { fieldErrors.birth_date = "생년월일을 입력해 주세요."; ok = false; }
  if (!form.admitted_on)       { fieldErrors.admitted_on = "입소일을 입력해 주세요."; ok = false; }
  return ok;
}

async function onSubmit() {
  if (!validate()) return;
  const payload = {
    full_name:   form.full_name.trim(),
    sex:         form.sex,
    birth_date:  form.birth_date,
    care_grade:  form.care_grade || null,
    room_number: form.room_number.trim() || null,
    admitted_on: form.admitted_on,
  };
  if (props.mode === "create") await create.run(payload as any);
  else                          await update.run(payload as any);
}
</script>

<template>
  <form
    class="rounded-xl border bg-card p-5 space-y-5"
    @submit.prevent="onSubmit"
  >
    <h2 class="text-base font-semibold mb-2 flex items-center gap-2">
      <component :is="props.mode === 'create' ? Plus : Save" class="h-4 w-4 text-primary" />
      {{ props.mode === "create" ? "어르신 등록" : "어르신 정보 수정" }}
    </h2>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FieldRow label="이름" required :error="fieldErrors.full_name">
        <input
          v-model="form.full_name"
          type="text"
          class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
      </FieldRow>

      <FieldRow label="성별" required>
        <select
          v-model="form.sex"
          class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="female">여</option>
          <option value="male">남</option>
          <option value="other">기타</option>
        </select>
      </FieldRow>

      <FieldRow label="생년월일" required :error="fieldErrors.birth_date">
        <input
          v-model="form.birth_date"
          type="date"
          class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 [color-scheme:light] dark:[color-scheme:dark]"
        >
      </FieldRow>

      <FieldRow label="장기요양 등급">
        <select
          v-model="form.care_grade"
          class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">미부여</option>
          <option value="1">1등급</option>
          <option value="2">2등급</option>
          <option value="3">3등급</option>
          <option value="4">4등급</option>
          <option value="5">5등급</option>
          <option value="cognitive_support">인지지원</option>
        </select>
      </FieldRow>

      <FieldRow label="호실" hint="예: 101">
        <input
          v-model="form.room_number"
          type="text"
          class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
      </FieldRow>

      <FieldRow label="입소일" required :error="fieldErrors.admitted_on">
        <input
          v-model="form.admitted_on"
          type="date"
          class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 [color-scheme:light] dark:[color-scheme:dark]"
        >
      </FieldRow>
    </div>

    <div class="flex items-center justify-end gap-2 pt-3 border-t">
      <button
        type="button"
        class="h-10 px-4 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted"
        :disabled="submitting"
        @click="emit('cancel')"
      >
        <X class="h-4 w-4" />
        취소
      </button>
      <button
        type="submit"
        class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
        :disabled="submitting"
      >
        <Save class="h-4 w-4" />
        {{ submitting ? "저장 중…" : (props.mode === "create" ? "등록" : "저장") }}
      </button>
    </div>
  </form>
</template>
