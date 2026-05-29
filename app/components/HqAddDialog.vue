<script setup lang="ts">
/**
 * 본사 직원 추가 — 조직도 디렉터리 등록만 담당.
 *
 * - 입력 필수: 이름 + 직책.
 * - 이메일/전화/비밀번호는 자동 생성됨 (사용자가 수정 가능).
 * - 급여 / 입사일 / 연차 같은 HR 정보는 받지 않음 — 본사 entry는
 *   조직도 표시용 디렉터리 라벨이지 실제 HR 레코드가 아님.
 */
import { Plus, X, RefreshCw } from "@lucide/vue";

const open = defineModel<boolean>("open", { required: true });
const emit  = defineEmits<{ created: [] }>();

const api    = useApi();
const toast  = useToast();

const HQ_POSITIONS = [
  { value: "ceo",              label: "대표" },
  { value: "coo",              label: "운영총괄" },
  { value: "cfo",              label: "재무이사" },
  { value: "hr_director",      label: "인사이사" },
  { value: "quality_director", label: "품질관리이사" },
  { value: "compliance",       label: "컴플라이언스" },
  { value: "training",         label: "교육연수" },
  { value: "it",               label: "IT/마케팅" },
  { value: "administrative",   label: "행정직" },
] as const;

const form = reactive({
  full_name: "",
  position:  "administrative" as (typeof HQ_POSITIONS)[number]["value"],
  email:     "",
  phone:     "",
});
const fieldErrors = reactive<Record<string, string | null>>({});

// Auto-generate harmless placeholder contact info. Hub managers can
// reach out if needed; HQ entries are directory labels.
function randomToken(len = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function regenContact() {
  const slug = randomToken();
  form.email = `${form.position}+${slug}@caredoc.demo`;
  form.phone = "010-" +
    String(Math.floor(1000 + Math.random() * 9000)) + "-" +
    String(Math.floor(1000 + Math.random() * 9000));
}

// Pre-fill the auto-generated bits whenever the modal opens.
watch(open, (v) => {
  if (v) {
    form.full_name = "";
    form.position  = "administrative";
    regenContact();
    for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
  }
});

// Regenerate contact info when position changes (keeps the email prefix
// in sync with the role).
watch(() => form.position, () => {
  if (open.value) regenContact();
});

const submit = useApiMutation<Record<string, unknown>, { id: string }>(
  (body) => api.post<{ id: string }>("/v1/staff", body),
  {
    successMessage: "본사 직원이 조직도에 추가되었습니다",
    onSuccess: () => {
      open.value = false;
      emit("created");
    },
  },
);

function genPassword(): string {
  // Random 16-char password — HQ entries created via web aren't expected
  // to log in (Tauri 데스크톱 사용). Anyone who needs to log in can have
  // their password reset by another HQ admin.
  let s = "";
  for (let i = 0; i < 16; i++) s += randomToken(1);
  return s;
}

async function onSubmit() {
  for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
  if (!form.full_name.trim()) {
    fieldErrors.full_name = "이름을 입력해 주세요.";
    return;
  }
  if (!form.email.includes("@")) {
    fieldErrors.email = "이메일 형식이 올바르지 않습니다.";
    return;
  }
  await submit.run({
    full_name:       form.full_name.trim(),
    email:           form.email.trim(),
    phone:           form.phone.trim() || undefined,
    role:            "hq",
    position:        form.position,
    employment_type: "regular",
    password:        genPassword(),
    branch_id:       null,
  });
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="open = false"
    >
      <div
        class="bg-card text-foreground rounded-xl shadow-2xl border max-w-lg w-full p-5"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-start gap-3 mb-4">
          <div class="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10 text-primary">
            <Plus class="h-5 w-5" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold">본사 직원 추가</h2>
          </div>
          <button
            type="button"
            class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
            @click="open = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <form class="space-y-4" @submit.prevent="onSubmit">
          <FieldRow label="이름" required :error="fieldErrors.full_name">
            <input
              v-model="form.full_name"
              type="text"
              placeholder="예: 김본부"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
          </FieldRow>

          <FieldRow label="직책">
            <select
              v-model="form.position"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option v-for="o in HQ_POSITIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FieldRow>

          <div class="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-muted-foreground tracking-wider uppercase">
                자동 생성된 연락처
              </span>
              <button
                type="button"
                class="text-xs text-primary hover:underline inline-flex items-center gap-1"
                @click="regenContact"
              >
                <RefreshCw class="h-3 w-3" />
                다시 생성
              </button>
            </div>
            <FieldRow label="이메일" :error="fieldErrors.email">
              <input
                v-model="form.email"
                type="email"
                class="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
            </FieldRow>
            <FieldRow label="전화">
              <input
                v-model="form.phone"
                type="tel"
                class="w-full h-9 px-3 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
            </FieldRow>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              class="h-10 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted"
              :disabled="submit.pending.value"
              @click="open = false"
            >
              취소
            </button>
            <button
              type="submit"
              class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
              :disabled="submit.pending.value"
            >
              {{ submit.pending.value ? "추가 중…" : "추가" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
