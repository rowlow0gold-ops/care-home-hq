<script setup lang="ts">
import {
  Search,
  Building2,
  ChevronLeft,
  ChevronRight,
  UsersRound,
  Calendar,
  Sun,
  Sunset,
  Moon,
  MapPin,
  UserCheck,
  Loader2,
  Download,
} from "@lucide/vue";

useHead({ title: "직원 관리 · 케어닥 HQ" });

const route = useRoute();
const router = useRouter();
const api = useApi();

// Tab — synced with ?tab=
// 휴가 used to live here but has been moved out — branches manage their own
// leave per-center now. Legacy ?tab=leave URLs fall through to 직원 목록.
type Tab = "list" | "schedule";
const tab = ref<Tab>(
  route.query.tab === "schedule" ? "schedule" : "list",
);
watch(tab, (v) => {
  router.replace({
    query: { ...route.query, tab: v === "list" ? undefined : v },
  });
});

// =============================================================================
// SHARED — branches list (used by all three tabs for filters)
// =============================================================================
interface Branch { id: string; name: string }
const { data: dashboard } = await useAsyncData(
  "staff-branches",
  () => api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

// =============================================================================
// 직원 목록
// =============================================================================
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
  is_inactive: boolean;
}

// Allow dashboard / org-chart deep links to pre-select a branch via ?branch=ID.
const initialBranch =
  typeof route.query.branch === "string" && route.query.branch.length > 0
    ? route.query.branch
    : useDefaultBranch();

// Draft filters
const q = ref("");
const branchFilter = ref<string>(initialBranch);
const empFilter = ref<string>("");
// Applied filters — drive `filtered` / `branchScoped`
const appliedQ = ref("");
const appliedBranch = ref(branchFilter.value);
const appliedEmp = ref("");

function applyFilters() {
  appliedQ.value = q.value.trim();
  appliedBranch.value = branchFilter.value;
  appliedEmp.value = empFilter.value;
  page.value = 1;
}

const { data: people, pending, error } = await useAsyncData(
  "staff-list",
  () => api.get<Person[]>("/v1/org/chart"),
);

// Scoped to branch only — used as the "total" denominator so that when a
// center is selected the counter reflects just that center, not the whole org.
const branchScoped = computed(() => {
  const rows = people.value ?? [];
  if (appliedBranch.value === "__hq__") return rows.filter((p) => !p.branch_id);
  if (appliedBranch.value) return rows.filter((p) => p.branch_id === appliedBranch.value);
  return rows;
});

const filtered = computed(() => {
  let rows = branchScoped.value;
  if (appliedEmp.value) rows = rows.filter((p) => p.employment_type === appliedEmp.value);
  if (appliedQ.value) {
    const n = appliedQ.value.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.full_name.toLowerCase().includes(n) ||
        p.email.toLowerCase().includes(n) ||
        p.position_ko.includes(appliedQ.value),
    );
  }
  return rows;
});

const pageSize = ref(25);
const page = ref(1);
const pageSizeOptions = [10, 25, 50, 100];
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / pageSize.value)),
);
watch([pageSize], () => { page.value = 1; });
watch(totalPages, (n) => { if (page.value > n) page.value = n; });
const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});
const pageStart = computed(() =>
  filtered.value.length === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
);
const pageEnd = computed(() =>
  Math.min(page.value * pageSize.value, filtered.value.length),
);

// 내보내기 — 직원 명단 XLSX 다운로드. HQ + 센터장 모두 사용.
// (일괄 등록 = 데스크톱 앱에서)
const exportingXlsx = ref(false);
const exportToast = useToast();
async function onExportStaffXlsx() {
  if (exportingXlsx.value) return;
  exportingXlsx.value = true;
  try {
    const res = await fetch("/api/v1/staff/export.xlsx", { credentials: "include" });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fallback = `직원_명단_${stamp}.xlsx`;
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m  = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="([^"]+)"/i.exec(cd);
    const filename = m ? decodeURIComponent(m[1]) : fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    exportToast.error(e?.message ?? "다운로드 실패", "내보내기 실패");
  } finally {
    exportingXlsx.value = false;
  }
}

const tone: Record<string, string> = {
  regular: "bg-primary/10 text-primary",
  contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  // 아르바이트 (was 시간제) — pink so it visually pops vs 정규직/계약직
  part_time: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200",
  temporary: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",
  consultant: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};

// 경력 — years+months since hired_on. e.g. "2년 3개월" / "8개월" / "신입"
function tenureLabel(hired: string | null): string {
  if (!hired) return "—";
  const start = new Date(hired);
  if (isNaN(start.getTime())) return "—";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) return "—";
  if (months < 1) return "신입";
  const yrs = Math.floor(months / 12);
  const mos = months % 12;
  if (yrs === 0) return `${mos}개월`;
  if (mos === 0) return `${yrs}년`;
  return `${yrs}년 ${mos}개월`;
}

// =============================================================================
// 근무 일정
// =============================================================================
interface OnDuty {
  assignment_id: string;
  branch_id: string;
  branch_name: string;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  user_id: string;
  user_name: string;
  user_role: string;
  user_position: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
}

const POSITION_KO: Record<string, string> = {
  caregiver: "요양보호사", nurse_rn: "간호사", nurse_assistant: "간호조무사",
  social_worker: "사회복지사", dietitian: "영양사", physical_therapist: "물리치료사",
  occupational_therapist: "작업치료사", branch_manager: "센터장", office_manager: "사무국장",
  cook: "조리원", cleaner: "환경미화원", driver: "운전기사", doctor_visiting: "촉탁의",
  receptionist: "접수안내", administrative: "행정직", facility_manager: "시설관리자",
};
const ROLE_KO: Record<string, string> = {
  caregiver: "요양보호사", nurse: "간호조무사", branch_manager: "센터장",
  hq: "본사", super_admin: "시스템",
};
function roleLabel(r: OnDuty): string {
  if (r.user_position && POSITION_KO[r.user_position]) return POSITION_KO[r.user_position];
  return ROLE_KO[r.user_role] ?? r.user_role;
}

// =============================================================================
// 근무 일정 date filter — matches the dashboard's year/month idiom plus a 일
// select so the user keeps daily resolution. Branch selector is HQ-only;
// branch managers see only their own branch (RLS also enforces this).
// =============================================================================
const { me: meSchedule } = useAuth();
const isHqSchedule = computed(
  () => meSchedule.value?.role === "hq" || meSchedule.value?.role === "super_admin",
);

const _today = new Date();
const scheduleYear  = ref<number>(_today.getFullYear());
const scheduleMonth = ref<number>(_today.getMonth() + 1);   // 1-12
const scheduleDay   = ref<number>(_today.getDate());

const scheduleYearOptions  = Array.from({ length: 5 },  (_, i) => _today.getFullYear() - i);
const scheduleMonthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
// Day options depend on the selected year/month
const scheduleDayOptions = computed(() => {
  const last = new Date(scheduleYear.value, scheduleMonth.value, 0).getDate();
  return Array.from({ length: last }, (_, i) => i + 1);
});
// Keep `day` valid after switching to a shorter month (e.g. Jan 31 → Feb)
watch([scheduleYear, scheduleMonth], () => {
  const last = scheduleDayOptions.value[scheduleDayOptions.value.length - 1] ?? 28;
  if (scheduleDay.value > last) scheduleDay.value = last;
});

const scheduleDate = computed(() => {
  const yyyy = scheduleYear.value;
  const mm   = String(scheduleMonth.value).padStart(2, "0");
  const dd   = String(scheduleDay.value).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
});

// HQ can pivot across branches; non-HQ is pinned to their own.
const scheduleBranch = ref<string>(useDefaultBranch());

const { data: shifts, pending: shiftsPending } = await useAsyncData(
  "shifts-today",
  () =>
    api.get<OnDuty[]>("/v1/shifts/today", {
      date: scheduleDate.value,
      branch_id: scheduleBranch.value || undefined,
    }),
  { watch: [scheduleYear, scheduleMonth, scheduleDay, scheduleBranch] },
);

const grouped = computed(() => {
  const out = new Map<string, Map<string, OnDuty[]>>();
  for (const r of shifts.value ?? []) {
    if (!out.has(r.branch_id)) out.set(r.branch_id, new Map());
    const m = out.get(r.branch_id)!;
    if (!m.has(r.shift_code)) m.set(r.shift_code, []);
    m.get(r.shift_code)!.push(r);
  }
  return out;
});

const shiftOrder = ["morning", "evening", "night"];
const shiftIcon: Record<string, any> = { morning: Sun, evening: Sunset, night: Moon };
const shiftTone: Record<string, string> = {
  morning: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900",
  evening: "bg-orange-50 text-orange-900 border-orange-200 dark:bg-orange-950/30 dark:text-orange-100 dark:border-orange-900",
  night:   "bg-indigo-50 text-indigo-900 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-100 dark:border-indigo-900",
};
function branchNameById(id: string) {
  return dashboard.value?.branches.find((b) => b.id === id)?.name ?? "—";
}
const scheduleHeaderDate = computed(() => {
  const [y, m, d] = scheduleDate.value.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
});
const scheduleSummary = computed(() => {
  const all = shifts.value ?? [];
  return {
    total: all.length,
    morning: all.filter((r) => r.shift_code === "morning").length,
    evening: all.filter((r) => r.shift_code === "evening").length,
    night: all.filter((r) => r.shift_code === "night").length,
    on_leave: all.filter((r) => r.status === "on_leave").length,
  };
});

</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-4">
      <h1 class="text-3xl font-bold tracking-tight">직원 관리</h1>
    </header>

    <!-- Tabs -->
    <div class="flex items-center gap-1 mb-4 border-b">
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5"
        :class="tab === 'list'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = 'list'"
      >
        <UsersRound class="h-4 w-4" />
        직원 목록
      </button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5"
        :class="tab === 'schedule'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = 'schedule'"
      >
        <Calendar class="h-4 w-4" />
        근무 일정
      </button>
    </div>

    <!-- ================================================================ -->
    <!-- TAB: 직원 목록                                                    -->
    <!-- ================================================================ -->
    <div v-if="tab === 'list'" class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="이름 / 이메일 / 직책 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            @keyup.enter="applyFilters"
          >
        </div>
        <!-- HQ: branch dropdown · BM: locked badge -->
        <select
          v-if="isHqSchedule"
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 (본사 + 지점)</option>
          <option value="__hq__">본사만</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <div
          v-else
          class="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border bg-muted/30 text-sm"
          title="본인 소속 지점 직원만 조회할 수 있습니다"
        >
          <Building2 class="h-3.5 w-3.5 text-primary" />
          <span class="font-medium">
            {{ dashboard?.branches?.find((b) => b.id === branchFilter)?.name ?? '내 지점' }}
          </span>
        </div>
        <select
          v-model="empFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 고용형태</option>
          <option value="regular">정규직</option>
          <option value="contract">계약직</option>
          <option value="part_time">아르바이트</option>
          <option value="consultant">위촉직</option>
        </select>
        <button
          type="button"
          @click="applyFilters"
          :disabled="pending"
          aria-label="검색"
          title="검색"
          class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 inline-flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Loader2 v-if="pending" class="h-4 w-4 animate-spin" />
          <Search v-else class="h-4 w-4" />
        </button>
        <div class="ml-auto flex items-center gap-3">
          <span class="text-xs text-muted-foreground tabular-nums">{{ filtered.length }}명</span>
          <!-- 내보내기 — HQ + 센터장 모두 사용 가능. 일괄 등록은 데스크톱 앱에서. -->
          <button
            type="button"
            class="h-10 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-60"
            :disabled="exportingXlsx"
            @click="onExportStaffXlsx"
          >
            <Loader2 v-if="exportingXlsx" class="h-4 w-4 animate-spin" />
            <Download v-else class="h-4 w-4" />
            내보내기
          </button>
        </div>
      </div>

      <div v-if="pending" class="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
      <div v-else-if="error" class="py-12 text-center text-sm text-destructive">불러오기 실패</div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">이름</th>
            <th class="py-3 px-3 font-medium">소속</th>
            <th class="py-3 px-3 font-medium">직책</th>
            <th class="py-3 px-3 font-medium">고용</th>
            <th class="py-3 px-3 font-medium">경력</th>
            <th class="py-3 px-3 font-medium">이메일</th>
            <th class="py-3 px-6 font-medium">전화</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in paged"
            :key="p.id"
            class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
            @click="navigateTo(`/staff/${p.id}`)"
          >
            <td class="py-3 px-6 font-medium">{{ p.full_name }}</td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-1.5 text-xs">
                <Building2 class="h-3 w-3 text-muted-foreground" />
                {{ p.branch_name ?? "본사" }}
              </div>
            </td>
            <td class="py-3 px-3">{{ p.position_ko }}</td>
            <td class="py-3 px-3">
              <span
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="tone[p.employment_type] ?? 'bg-muted'"
              >
                {{ p.employment_type_ko }}
              </span>
            </td>
            <td class="py-3 px-3 text-muted-foreground tabular-nums text-xs" :title="p.hired_on ?? ''">
              {{ tenureLabel(p.hired_on) }}
            </td>
            <td class="py-3 px-3 text-muted-foreground font-mono text-xs truncate max-w-[14rem]">{{ p.email }}</td>
            <td class="py-3 px-6 text-muted-foreground">{{ p.phone ?? "—" }}</td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="7" class="py-12 text-center text-muted-foreground">조건에 맞는 직원이 없습니다.</td>
          </tr>
        </tbody>
      </table>

      <div
        v-if="filtered.length > 0"
        class="px-6 py-3 border-t flex flex-wrap items-center gap-3 text-xs"
      >
        <div class="text-muted-foreground tabular-nums">
          {{ pageStart }}–{{ pageEnd }} / 총 {{ filtered.length }}명
        </div>
        <div class="ml-auto flex items-center gap-2">
          <label class="text-muted-foreground">페이지당</label>
          <select v-model.number="pageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="h-8 w-8 rounded-md border flex items-center justify-center disabled:opacity-30 hover:bg-muted"
            :disabled="page <= 1"
            @click="page = page - 1"
            title="이전"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <span class="px-2 tabular-nums">
            <strong>{{ page }}</strong> / {{ totalPages }}
          </span>
          <button
            class="h-8 w-8 rounded-md border flex items-center justify-center disabled:opacity-30 hover:bg-muted"
            :disabled="page >= totalPages"
            @click="page = page + 1"
            title="다음"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- TAB: 근무 일정                                                    -->
    <!-- ================================================================ -->
    <div v-else-if="tab === 'schedule'">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          <span class="font-medium text-foreground">{{ scheduleHeaderDate }}</span>
          · 24시간 3교대 · 주간 06–14 / 저녁 14–22 / 야간 22–06
        </p>
        <div class="flex items-center gap-2 flex-wrap">
          <!-- HQ: branch dropdown · BM: locked badge — both fixed-width
               so the row never reflows. -->
          <select
            v-if="isHqSchedule"
            v-model="scheduleBranch"
            class="h-10 w-48 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            <option value="">전체 지점</option>
            <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <div
            v-else
            class="inline-flex items-center gap-1.5 h-10 w-48 px-3 rounded-lg border bg-muted/30 text-sm"
            title="본인 소속 지점만 조회할 수 있습니다"
          >
            <Building2 class="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span class="font-medium truncate">
              {{ dashboard?.branches?.find((b) => b.id === scheduleBranch)?.name ?? '내 지점' }}
            </span>
          </div>

          <!-- Year / Month / Day — fixed-width selects matching dashboard -->
          <select
            v-model.number="scheduleYear"
            class="h-10 w-28 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            <option v-for="y in scheduleYearOptions" :key="y" :value="y">{{ y }}년</option>
          </select>
          <select
            v-model.number="scheduleMonth"
            class="h-10 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            <option v-for="m in scheduleMonthOptions" :key="m" :value="m">{{ m }}월</option>
          </select>
          <select
            v-model.number="scheduleDay"
            class="h-10 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            <option v-for="d in scheduleDayOptions" :key="d" :value="d">{{ d }}일</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div class="rounded-xl border bg-card p-4">
          <div class="text-xs text-muted-foreground">총 배정</div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ scheduleSummary.total }}</div>
        </div>
        <div class="rounded-xl border bg-amber-50/40 dark:bg-amber-950/20 p-4">
          <div class="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
            <Sun class="h-3 w-3" /> 주간
          </div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ scheduleSummary.morning }}</div>
        </div>
        <div class="rounded-xl border bg-orange-50/40 dark:bg-orange-950/20 p-4">
          <div class="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300">
            <Sunset class="h-3 w-3" /> 저녁
          </div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ scheduleSummary.evening }}</div>
        </div>
        <div class="rounded-xl border bg-indigo-50/40 dark:bg-indigo-950/20 p-4">
          <div class="flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-300">
            <Moon class="h-3 w-3" /> 야간
          </div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ scheduleSummary.night }}</div>
        </div>
        <div class="rounded-xl border bg-card p-4">
          <div class="text-xs text-muted-foreground">휴가</div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ scheduleSummary.on_leave }}</div>
        </div>
      </div>

      <div v-if="shiftsPending" class="space-y-3">
        <Skeleton v-for="i in 4" :key="i" h="6rem" />
      </div>
      <div
        v-else-if="(shifts ?? []).length === 0"
        class="rounded-xl border bg-card p-12 text-center"
      >
        <Loader2 class="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p class="text-sm text-muted-foreground">{{ scheduleDate }}에 배정된 근무가 없습니다.</p>
      </div>
      <div v-else class="space-y-4">
        <div
          v-for="[branchId, branchShifts] in grouped"
          :key="branchId"
          class="rounded-xl border bg-card overflow-hidden"
        >
          <div class="px-6 py-3 border-b flex items-center gap-2">
            <MapPin class="h-4 w-4 text-primary" />
            <span class="font-semibold">{{ branchNameById(branchId) }}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
            <div
              v-for="code in shiftOrder"
              :key="code"
              class="p-4"
            >
              <div
                class="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-md border text-xs font-medium"
                :class="shiftTone[code]"
              >
                <component :is="shiftIcon[code]" class="h-3.5 w-3.5" />
                <span>{{ code === "morning" ? "주간 06–14" : code === "evening" ? "저녁 14–22" : "야간 22–06" }}</span>
                <span class="ml-auto opacity-70">{{ (branchShifts.get(code) ?? []).length }}명</span>
              </div>
              <ul class="space-y-1.5">
                <li
                  v-for="a in branchShifts.get(code) ?? []"
                  :key="a.assignment_id"
                  class="flex items-center gap-2 text-sm"
                >
                  <UserCheck class="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{{ a.user_name }}</span>
                  <span class="text-[10px] text-muted-foreground ml-auto">{{ roleLabel(a) }}</span>
                </li>
                <li
                  v-if="(branchShifts.get(code) ?? []).length === 0"
                  class="text-xs text-muted-foreground italic py-2"
                >
                  — 배정 없음 —
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
