<script setup lang="ts">
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, Calendar, FileText, Tag,
  Wallet, Clock, CalendarOff, Pencil, UserX, Save, X,
} from "@lucide/vue";

const route  = useRoute();
const router = useRouter();
const id = route.params.id as string;
const api = useApi();

interface Person {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  position: string;
  position_ko: string;
  employment_type: string;
  employment_type_ko: string;
  hired_on: string | null;
  contract_end_on: string | null;
  monthly_salary_krw: number | null;
  hourly_rate_est_krw: number | null;
  updated_at: string;
}

interface StaffBalance {
  user_id: string;
  annual_allocated: number;
  annual_used: number;
  annual_remaining: number;
}

// Web-side CRUD scope:
//   · 본사 (HQ) staff   → HQ users can 수정 / 퇴직 처리 right here.
//   · 지점 (center) 직원 → read-only (Tauri 데스크톱 앱이 mutation 담당).
const { data: p, error, refresh } = await useAsyncData(`staff-${id}`, () =>
  api.get<Person>(`/v1/staff/${id}`),
);

const { data: balances } = await useAsyncData(`staff-${id}-balances`, () =>
  api.get<StaffBalance[]>("/v1/leave-requests/balances")
       .then((r) => r ?? [])
       .catch(() => [] as StaffBalance[]),
);
const myBalance = computed(() =>
  (balances.value ?? []).find((b) => b.user_id === id) ?? null,
);

const PAYOUT_PER_DAY_KRW = 130_000;
const estimatedPayoutKRW = computed(() =>
  myBalance.value
    ? Math.round(myBalance.value.annual_remaining * PAYOUT_PER_DAY_KRW)
    : 0,
);

useHead({ title: () => `${p.value?.full_name ?? "직원"} · 케어닥 HQ` });

function fmtKRW(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₩${n.toLocaleString("ko-KR")}`;
}

const tone: Record<string, string> = {
  regular: "bg-primary/10 text-primary",
  contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  part_time: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200",
  temporary: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  consultant: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};

// =============================================================================
// CRUD permissions — HQ-on-HQ only on the web
// =============================================================================
const { me } = useAuth();
const isHq    = computed(() => me.value?.role === "hq" || me.value?.role === "super_admin");
const isSelf  = computed(() => me.value?.id === id);
const isHqTarget = computed(() => p.value !== null && p.value?.branch_id === null);
const canManage  = computed(() => isHq.value && isHqTarget.value && !isSelf.value);

// =============================================================================
// Edit mode
// =============================================================================
const editing = ref(false);

interface EditForm {
  full_name: string;
  email: string;
  phone: string;
  position: string;
}
const form = reactive<EditForm>({
  full_name: "",
  email: "",
  phone: "",
  position: "",
});
const fieldErrors = reactive<Record<string, string | null>>({});

function fillFormFromPerson() {
  if (!p.value) return;
  form.full_name = p.value.full_name;
  form.email     = p.value.email;
  form.phone     = p.value.phone ?? "";
  form.position  = p.value.position;
  for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
}

function startEdit() {
  fillFormFromPerson();
  editing.value = true;
}
function cancelEdit() {
  editing.value = false;
}

// HQ-staff position options — 본사 직책만 노출 (센터/현장 직책 제외).
const positionOptions: { value: string; label: string }[] = [
  { value: "ceo",              label: "대표" },
  { value: "coo",              label: "운영총괄" },
  { value: "cfo",              label: "재무이사" },
  { value: "hr_director",      label: "인사이사" },
  { value: "quality_director", label: "품질관리이사" },
  { value: "compliance",       label: "컴플라이언스" },
  { value: "training",         label: "교육연수" },
  { value: "it",               label: "IT/마케팅" },
  { value: "administrative",   label: "행정직" },
];

// Mutations
const update = useApiMutation<Record<string, unknown>, Person>(
  (body) => api.patch<Person>(`/v1/staff/${id}`, body),
  {
    successMessage: "본사 직원 정보가 수정되었습니다",
    onSuccess: async () => {
      editing.value = false;
      await refresh();
    },
  },
);

function diffPayload(): Record<string, unknown> {
  if (!p.value) return {};
  const out: Record<string, unknown> = { expected_updated_at: p.value.updated_at };
  if (form.full_name !== p.value.full_name) out.full_name = form.full_name.trim();
  if (form.email !== p.value.email)         out.email = form.email.trim();
  const phoneNorm = form.phone.trim() || null;
  const phoneOld  = p.value.phone ?? null;
  if (phoneNorm !== phoneOld)               out.phone = phoneNorm ?? "";
  if (form.position !== p.value.position)   out.position = form.position;
  return out;
}

async function onSave() {
  for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
  if (!form.full_name.trim()) { fieldErrors.full_name = "이름을 입력해 주세요."; return; }
  if (!form.email.trim())     { fieldErrors.email     = "이메일을 입력해 주세요.";  return; }
  const payload = diffPayload();
  if (Object.keys(payload).length === 1) {        // only expected_updated_at
    editing.value = false;
    return;
  }
  await update.run(payload);
}

// 목록에서 제거 — HQ entries are directory labels, not employment records.
// Backend uses deactivated_at column; UX-wise it's a "remove from 조직도".
const deactivate = useApiMutation<void, Person>(
  () => api.patch<Person>(`/v1/staff/${id}/deactivate`, {}),
  {
    successMessage: "조직도에서 제거되었습니다",
    onSuccess: async () => { await router.push("/staff"); },
  },
);
const showDeactivateConfirm = ref(false);
function onDeactivateClick() {
  if (!p.value) return;
  showDeactivateConfirm.value = true;
}
async function onConfirmDeactivate() {
  await deactivate.run();
}
</script>

<template>
  <div class="px-8 py-6 max-w-4xl mx-auto">
    <NuxtLink
      to="/org"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      조직도
    </NuxtLink>

    <div v-if="error" class="text-sm text-destructive py-12 text-center">
      직원 정보를 불러오지 못했습니다.
    </div>

    <template v-else-if="p">
      <header class="rounded-2xl border bg-gradient-to-br from-primary/10 to-card p-6 mb-6 flex items-center gap-5">
        <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-3xl font-bold flex-shrink-0">
          {{ p.full_name.charAt(0) }}
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-bold tracking-tight">{{ p.full_name }}</h1>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            <Briefcase class="h-3.5 w-3.5" />
            <span>{{ p.position_ko }}</span>
            <span>·</span>
            <span
              class="px-1.5 py-0.5 rounded text-xs font-medium"
              :class="tone[p.employment_type] ?? 'bg-muted'"
            >{{ p.employment_type_ko }}</span>
            <template v-if="p.branch_name">
              <span>·</span>
              <Building2 class="h-3.5 w-3.5" />
              <NuxtLink :to="`/branches/${p.branch_id}`" class="hover:text-primary underline-offset-4 hover:underline">
                {{ p.branch_name }}
              </NuxtLink>
            </template>
            <template v-else>
              <span>·</span>
              <Building2 class="h-3.5 w-3.5" />
              <span class="font-medium">본사</span>
            </template>
          </div>
        </div>

        <!-- HQ-on-HQ actions only. Center staff editing lives in the Tauri desktop app. -->
        <div v-if="canManage && !editing" class="flex items-center gap-2">
          <button
            type="button"
            class="h-9 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted"
            @click="startEdit"
          >
            <Pencil class="h-3.5 w-3.5" />
            수정
          </button>
          <button
            type="button"
            class="h-9 px-3 rounded-lg border border-destructive/40 bg-transparent text-destructive text-sm inline-flex items-center gap-1.5 hover:bg-destructive/10 disabled:opacity-50"
            :disabled="deactivate.pending.value"
            @click="onDeactivateClick"
          >
            <UserX class="h-3.5 w-3.5" />
            목록에서 제거
          </button>
        </div>
      </header>

      <!-- READ VIEW -->
      <template v-if="!editing">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="rounded-xl border bg-card p-5">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">연락처</h2>
            <dl class="text-sm space-y-2.5">
              <div class="flex items-start gap-3">
                <Mail class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div class="min-w-0">
                  <dt class="text-xs text-muted-foreground">이메일</dt>
                  <dd class="font-mono text-xs break-all">{{ p.email }}</dd>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <Phone class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <dt class="text-xs text-muted-foreground">전화</dt>
                  <dd>{{ p.phone ?? "—" }}</dd>
                </div>
              </div>
            </dl>
          </div>

          <div class="rounded-xl border bg-card p-5">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">고용 정보</h2>
            <dl class="text-sm space-y-2.5">
              <div class="flex items-start gap-3">
                <Tag class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <dt class="text-xs text-muted-foreground">고용 형태</dt>
                  <dd>{{ p.employment_type_ko }}</dd>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <Calendar class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <dt class="text-xs text-muted-foreground">입사일</dt>
                  <dd>{{ p.hired_on ?? "—" }}</dd>
                </div>
              </div>
              <div v-if="p.contract_end_on" class="flex items-start gap-3">
                <FileText class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <dt class="text-xs text-muted-foreground">계약 만료</dt>
                  <dd>{{ p.contract_end_on }}</dd>
                </div>
              </div>
            </dl>
          </div>
        </div>

        <!-- 본사 (HQ) entries: salary / 연차 cards intentionally hidden.
             HQ records are 조직도 directory labels, not HR employee
             records. Center staff payroll/leave lives in the Tauri app. -->
        <div v-if="!isHqTarget" class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="rounded-xl border bg-card p-5">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Wallet class="h-3.5 w-3.5 text-primary" />
              급여
            </h2>
            <dl class="text-sm space-y-2.5">
              <div class="flex items-start gap-3">
                <Wallet class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div class="flex-1">
                  <dt class="text-xs text-muted-foreground">월 기본급</dt>
                  <dd class="text-2xl font-bold tabular-nums text-foreground mt-0.5">
                    {{ fmtKRW(p.monthly_salary_krw) }}
                  </dd>
                </div>
              </div>
              <div v-if="p.employment_type === 'part_time' || p.hourly_rate_est_krw" class="flex items-start gap-3">
                <Clock class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div class="flex-1">
                  <dt class="text-xs text-muted-foreground">
                    {{ p.employment_type === 'part_time' ? '시급' : '시급 환산' }}
                    <span class="text-[10px] opacity-70">(월급 ÷ 209h)</span>
                  </dt>
                  <dd class="font-medium tabular-nums text-foreground">
                    {{ fmtKRW(p.hourly_rate_est_krw) }}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div class="rounded-xl border bg-card p-5">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <CalendarOff class="h-3.5 w-3.5 text-primary" />
              잔여 연차
            </h2>
            <div v-if="myBalance" class="text-sm space-y-2.5">
              <div class="flex items-start gap-3">
                <Calendar class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div class="flex-1">
                  <dt class="text-xs text-muted-foreground">잔여 (부여 {{ myBalance.annual_allocated.toFixed(1) }}일 − 사용 {{ myBalance.annual_used.toFixed(1) }}일)</dt>
                  <dd class="text-2xl font-bold tabular-nums text-primary mt-0.5">
                    {{ myBalance.annual_remaining.toFixed(1) }}일
                  </dd>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <Wallet class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div class="flex-1">
                  <dt class="text-xs text-muted-foreground">미사용 시 연차수당 (추정)</dt>
                  <dd class="font-medium tabular-nums text-foreground">
                    ≈ {{ fmtKRW(estimatedPayoutKRW) }}
                  </dd>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground">
              잔여 연차 정보를 불러올 수 없습니다.
            </p>
          </div>
        </div>
      </template>

      <!-- EDIT FORM (HQ-on-HQ only) -->
      <form
        v-else
        class="rounded-xl border bg-card p-5 space-y-5"
        @submit.prevent="onSave"
      >
        <h2 class="text-base font-semibold mb-2 flex items-center gap-2">
          <Pencil class="h-4 w-4 text-primary" />
          본사 직원 정보 수정
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="이름" required :error="fieldErrors.full_name">
            <input
              v-model="form.full_name"
              type="text"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
          </FieldRow>

          <FieldRow label="이메일" required :error="fieldErrors.email">
            <input
              v-model="form.email"
              type="email"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
          </FieldRow>

          <FieldRow label="전화" hint="010-XXXX-XXXX 형식">
            <input
              v-model="form.phone"
              type="tel"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
          </FieldRow>

          <FieldRow label="직책" class="sm:col-span-2">
            <select
              v-model="form.position"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option v-for="o in positionOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FieldRow>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t">
          <button
            type="button"
            class="h-10 px-4 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted"
            :disabled="update.pending.value"
            @click="cancelEdit"
          >
            <X class="h-4 w-4" />
            취소
          </button>
          <button
            type="submit"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
            :disabled="update.pending.value"
          >
            <Save class="h-4 w-4" />
            {{ update.pending.value ? "저장 중…" : "저장" }}
          </button>
        </div>
      </form>

      <!-- 목록에서 제거 확인 dialog (HQ-on-HQ only) -->
      <ConfirmDialog
        v-model:open="showDeactivateConfirm"
        :title="`${p.full_name} · 조직도에서 제거`"
        description="조직도와 직원 목록에서 사라집니다.&#10;실제 퇴직 처리가 아니라 디렉터리에서 숨기는 작업이며, 기록은 데이터베이스에 보존됩니다."
        confirm-label="제거"
        tone="destructive"
        @confirm="onConfirmDeactivate"
      />
    </template>
  </div>
</template>
