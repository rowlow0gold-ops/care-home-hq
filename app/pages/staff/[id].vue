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

// 연차수당 rough estimate (matches /휴가 summary)
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
// CRUD permissions
// =============================================================================
// Staff CRUD is HQ-only. 센터장 / 간호사 / 요양보호사 hit this page in
// read-only mode. The backend enforces the same restriction.
const { me } = useAuth();
const isHq = computed(() => me.value?.role === "hq" || me.value?.role === "super_admin");
const isSelf = computed(() => me.value?.id === id);
const canManage = computed(() => isHq.value && !isSelf.value);

// =============================================================================
// Edit mode
// =============================================================================
const editing = ref(false);

interface EditForm {
  full_name: string;
  email: string;
  phone: string;
  position: string;
  employment_type: string;
  hired_on: string;
  contract_end_on: string;
  monthly_salary_krw: number | null;
  branch_id: string;
}
const form = reactive<EditForm>({
  full_name: "",
  email: "",
  phone: "",
  position: "",
  employment_type: "",
  hired_on: "",
  contract_end_on: "",
  monthly_salary_krw: null,
  branch_id: "",
});
const fieldErrors = reactive<Record<string, string | null>>({});

function fillFormFromPerson() {
  if (!p.value) return;
  form.full_name          = p.value.full_name;
  form.email              = p.value.email;
  form.phone              = p.value.phone ?? "";
  form.position           = p.value.position;
  form.employment_type    = p.value.employment_type;
  form.hired_on           = p.value.hired_on ?? "";
  form.contract_end_on    = p.value.contract_end_on ?? "";
  form.monthly_salary_krw = p.value.monthly_salary_krw;
  form.branch_id          = p.value.branch_id ?? "";
  for (const k of Object.keys(fieldErrors)) delete fieldErrors[k];
}

function startEdit() {
  fillFormFromPerson();
  editing.value = true;
}
function cancelEdit() {
  editing.value = false;
}

// Position + employment_type options must match the enum the API expects.
const positionOptions: { value: string; label: string }[] = [
  { value: "branch_manager",   label: "센터장" },
  { value: "office_manager",   label: "사무국장" },
  { value: "nurse_rn",         label: "간호사" },
  { value: "nurse_assistant",  label: "간호조무사" },
  { value: "social_worker",    label: "사회복지사" },
  { value: "dietitian",        label: "영양사" },
  { value: "physical_therapist",     label: "물리치료사" },
  { value: "occupational_therapist", label: "작업치료사" },
  { value: "caregiver",        label: "요양보호사" },
  { value: "doctor_visiting",  label: "촉탁의" },
  { value: "cook",             label: "조리원" },
  { value: "cleaner",          label: "환경미화원" },
  { value: "driver",           label: "운전기사" },
  { value: "receptionist",     label: "접수안내" },
  { value: "administrative",   label: "행정직" },
  { value: "facility_manager", label: "시설관리자" },
];
const employmentOptions: { value: string; label: string }[] = [
  { value: "regular",    label: "정규직" },
  { value: "contract",   label: "계약직" },
  { value: "part_time",  label: "아르바이트" },
  { value: "temporary",  label: "단기" },
  { value: "consultant", label: "위촉직" },
];

// HQ-only: list of branches to move staff between
interface Branch { id: string; name: string }
const { data: dashboard } = await useAsyncData(
  "staff-edit-branches",
  () => isHq.value
    ? api.get<{ branches: Branch[] }>("/v1/dashboard/summary").then((r) => r ?? { branches: [] })
    : Promise.resolve({ branches: [] as Branch[] }),
);

// =============================================================================
// Mutations
// =============================================================================
const update = useApiMutation<Record<string, unknown>, Person>(
  (body) => api.patch<Person>(`/v1/staff/${id}`, body),
  {
    successMessage: "직원 정보가 수정되었습니다",
    onSuccess: async () => {
      editing.value = false;
      await refresh();
    },
  },
);

function diffPayload(): Record<string, unknown> {
  if (!p.value) return {};
  const out: Record<string, unknown> = {
    expected_updated_at: p.value.updated_at,
  };
  if (form.full_name !== p.value.full_name)             out.full_name = form.full_name.trim();
  if (form.email !== p.value.email)                     out.email = form.email.trim();
  const phoneNorm  = form.phone.trim() || null;
  const phoneOld   = p.value.phone ?? null;
  if (phoneNorm !== phoneOld)                           out.phone = phoneNorm ?? "";
  if (form.position !== p.value.position)               out.position = form.position;
  if (form.employment_type !== p.value.employment_type) out.employment_type = form.employment_type;
  if ((form.hired_on || null) !== p.value.hired_on)     out.hired_on = form.hired_on || null;
  if ((form.contract_end_on || null) !== p.value.contract_end_on) {
    // Option<Option<NaiveDate>> on the backend: send null to clear, date to set.
    out.contract_end_on = form.contract_end_on || null;
  }
  if (form.monthly_salary_krw !== p.value.monthly_salary_krw) {
    out.monthly_salary_krw = form.monthly_salary_krw;
  }
  if (isHq.value && (form.branch_id || null) !== p.value.branch_id) {
    out.branch_id = form.branch_id || null;
  }
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

// Deactivation
const deactivate = useApiMutation<void, Person>(
  () => api.patch<Person>(`/v1/staff/${id}/deactivate`, {}),
  {
    successMessage: "퇴직 처리가 완료되었습니다",
    onSuccess: async () => {
      // Sent them off the staff list — bounce back to /staff
      await router.push("/staff");
    },
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
          </div>
        </div>

        <!-- Manager actions -->
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
            퇴직 처리
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

        <!-- 급여 + 잔여 연차 -->
        <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <!-- EDIT FORM -->
      <form
        v-else
        class="rounded-xl border bg-card p-5 space-y-5"
        @submit.prevent="onSave"
      >
        <h2 class="text-base font-semibold mb-2 flex items-center gap-2">
          <Pencil class="h-4 w-4 text-primary" />
          직원 정보 수정
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

          <FieldRow label="직책">
            <select
              v-model="form.position"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option v-for="o in positionOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FieldRow>

          <FieldRow label="고용 형태">
            <select
              v-model="form.employment_type"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option v-for="o in employmentOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FieldRow>

          <FieldRow label="월 기본급 (KRW)">
            <input
              v-model.number="form.monthly_salary_krw"
              type="number"
              min="0"
              step="10000"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm tabular-nums focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
          </FieldRow>

          <FieldRow label="입사일">
            <input
              v-model="form.hired_on"
              type="date"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 [color-scheme:light] dark:[color-scheme:dark]"
            >
          </FieldRow>

          <FieldRow label="계약 만료일" hint="정규직은 비워두세요">
            <input
              v-model="form.contract_end_on"
              type="date"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 [color-scheme:light] dark:[color-scheme:dark]"
            >
          </FieldRow>

          <FieldRow
            v-if="isHq"
            label="소속 지점"
            hint="비우면 본사 인력으로 이동합니다"
            class="sm:col-span-2"
          >
            <select
              v-model="form.branch_id"
              class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option value="">본사</option>
              <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
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

      <!-- Destructive confirm dialog (퇴직 처리) -->
      <ConfirmDialog
        v-model:open="showDeactivateConfirm"
        :title="`${p.full_name} 직원 퇴직 처리`"
        description="퇴직 처리하면 시스템 로그인이 즉시 차단되고 명단·근무표에서 제외됩니다.&#10;퇴직 기록은 보존되며, 필요시 데이터 복구는 별도 절차로 가능합니다."
        confirm-label="퇴직 처리"
        tone="destructive"
        @confirm="onConfirmDeactivate"
      />
    </template>
  </div>
</template>
