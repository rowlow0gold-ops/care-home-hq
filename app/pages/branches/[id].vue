<script setup lang="ts">
import { ArrowLeft, Building2, Users, UsersRound, MapPin, Phone, ImageIcon, Camera, Stethoscope, Heart, AlertTriangle, CheckCircle2, ChefHat, Search } from "@lucide/vue";

const route = useRoute();
const id = route.params.id as string;
const api = useApi();

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  capacity: number;
  resident_count: number;
  occupancy_pct: number;
  incidents_7d: number;
  staff_on_duty: number;
  services: string[];
  current_caregivers: number;
  current_nurses: number;
  current_cooks: number;
  required_caregivers: number;
  required_nurses: number;
  required_cooks: number;
}

const SERVICE_KO: Record<string, string> = {
  nursing_home: "요양원",
  day_care: "주간보호센터",
  visiting_care: "방문요양",
};
const SERVICE_TONE: Record<string, string> = {
  nursing_home: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900",
  day_care:     "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  visiting_care:"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
};
interface OrgPerson {
  id: string;
  branch_id: string | null;
  full_name: string;
  email: string;
  position: string;
  position_ko: string;
  employment_type: string;
  employment_type_ko: string;
}
interface Resident {
  id: string;
  full_name: string;
  sex: string;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string;
  status: string;
}

const [{ data: dashboard }, { data: org }, { data: residents }] = await Promise.all([
  useAsyncData(`branch-${id}-dash`, () =>
    api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
  ),
  useAsyncData(`branch-${id}-org`, () => api.get<OrgPerson[]>("/v1/org/chart")),
  useAsyncData(`branch-${id}-res`, () => api.get<Resident[]>("/v1/residents")),
]);

const branch = computed(() =>
  dashboard.value?.branches.find((b) => b.id === id) ?? null,
);
const staffAll = computed(() => (org.value ?? []).filter((p) => p.branch_id === id));
const residentsAll = computed(() =>
  (residents.value ?? []).filter((r: any) => r.branch_id === id && r.status === "active"),
);

// Inline search filters — client-side, fast (each branch only has 100-200 rows)
const staffQ = ref("");
const residentQ = ref("");
const staff = computed(() => {
  const q = staffQ.value.trim().toLowerCase();
  if (!q) return staffAll.value;
  return staffAll.value.filter((p) =>
    p.full_name.toLowerCase().includes(q)
      || p.email.toLowerCase().includes(q)
      || p.position_ko.includes(staffQ.value.trim()),
  );
});
const branchResidents = computed(() => {
  const q = residentQ.value.trim().toLowerCase();
  if (!q) return residentsAll.value;
  return residentsAll.value.filter((r: any) =>
    r.full_name.toLowerCase().includes(q)
      || (r.room_number ?? "").toLowerCase().includes(q),
  );
});

useHead({ title: () => `${branch.value?.name ?? "지점"} · 케어닥 HQ` });

const empCounts = computed(() => {
  const m: Record<string, { ko: string; n: number }> = {};
  for (const p of staff.value) {
    if (!m[p.employment_type]) m[p.employment_type] = { ko: p.employment_type_ko, n: 0 };
    m[p.employment_type].n++;
  }
  return Object.entries(m).sort(([, a], [, b]) => b.n - a.n);
});
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <NuxtLink
      to="/org"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      조직도
    </NuxtLink>

    <template v-if="branch">
      <header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Building2 class="h-6 w-6" />
          </div>
          <div>
            <h1 class="text-3xl font-bold tracking-tight">{{ branch.name }}</h1>
            <div class="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              <span v-if="branch.address" class="inline-flex items-center gap-1">
                <MapPin class="h-3.5 w-3.5" />
                {{ branch.address }}
              </span>
              <span v-if="branch.phone" class="inline-flex items-center gap-1">
                <Phone class="h-3.5 w-3.5" />
                {{ branch.phone }}
              </span>
              <span>· 정원 {{ branch.capacity }}명</span>
            </div>
            <!-- Services -->
            <div class="flex flex-wrap gap-1.5 mt-2">
              <span
                v-for="s in branch.services"
                :key="s"
                :class="['text-xs font-medium rounded-full px-2.5 py-0.5 border', SERVICE_TONE[s] ?? 'bg-muted']"
              >
                {{ SERVICE_KO[s] ?? s }}
              </span>
            </div>
          </div>
        </div>
      </header>

      <!-- Staffing requirements (Korean LTCI rule) -->
      <div class="rounded-xl border bg-card overflow-hidden mb-6">
        <div class="px-5 py-3 border-b flex items-center gap-2">
          <Stethoscope class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">인력 충원 현황</h2>
          <span class="text-xs text-muted-foreground ml-auto">
            기준: 요양보호사 어르신×2.1 · 간호(조무)사 어르신/25 · 조리원 어르신/25
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
          <!-- Caregivers -->
          <div class="p-5">
            <div class="flex items-center gap-2 mb-2">
              <Heart class="h-4 w-4 text-pink-500" />
              <span class="text-sm font-medium">요양보호사</span>
              <span class="ml-auto text-xs text-muted-foreground">
                필요 {{ branch.required_caregivers }}명
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-bold tabular-nums">{{ branch.current_caregivers }}</span>
              <span class="text-sm text-muted-foreground">/ {{ branch.required_caregivers }}</span>
              <span
                class="ml-auto inline-flex items-center gap-1 text-xs font-medium"
                :class="branch.current_caregivers >= branch.required_caregivers ? 'text-emerald-600' : 'text-amber-600'"
              >
                <component
                  :is="branch.current_caregivers >= branch.required_caregivers ? CheckCircle2 : AlertTriangle"
                  class="h-3.5 w-3.5"
                />
                {{ branch.current_caregivers >= branch.required_caregivers
                  ? "충원 완료"
                  : `${branch.required_caregivers - branch.current_caregivers}명 부족` }}
              </span>
            </div>
            <div class="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
              <div
                class="h-full bg-pink-500 transition-all"
                :style="{
                  width:
                    branch.required_caregivers > 0
                      ? Math.min(100, (branch.current_caregivers / branch.required_caregivers) * 100) + '%'
                      : '100%',
                }"
              />
            </div>
          </div>
          <!-- Nurses -->
          <div class="p-5">
            <div class="flex items-center gap-2 mb-2">
              <Stethoscope class="h-4 w-4 text-indigo-500" />
              <span class="text-sm font-medium">간호(조무)사</span>
              <span class="ml-auto text-xs text-muted-foreground">
                필요 {{ branch.required_nurses }}명
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-bold tabular-nums">{{ branch.current_nurses }}</span>
              <span class="text-sm text-muted-foreground">/ {{ branch.required_nurses }}</span>
              <span
                class="ml-auto inline-flex items-center gap-1 text-xs font-medium"
                :class="branch.current_nurses >= branch.required_nurses ? 'text-emerald-600' : 'text-amber-600'"
              >
                <component
                  :is="branch.current_nurses >= branch.required_nurses ? CheckCircle2 : AlertTriangle"
                  class="h-3.5 w-3.5"
                />
                {{ branch.current_nurses >= branch.required_nurses
                  ? "충원 완료"
                  : `${branch.required_nurses - branch.current_nurses}명 부족` }}
              </span>
            </div>
            <div class="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
              <div
                class="h-full bg-indigo-500 transition-all"
                :style="{
                  width:
                    branch.required_nurses > 0
                      ? Math.min(100, (branch.current_nurses / branch.required_nurses) * 100) + '%'
                      : '100%',
                }"
              />
            </div>
          </div>
          <!-- Cooks -->
          <div class="p-5">
            <div class="flex items-center gap-2 mb-2">
              <ChefHat class="h-4 w-4 text-amber-600" />
              <span class="text-sm font-medium">조리원</span>
              <span class="ml-auto text-xs text-muted-foreground">
                필요 {{ branch.required_cooks }}명
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-bold tabular-nums">{{ branch.current_cooks }}</span>
              <span class="text-sm text-muted-foreground">/ {{ branch.required_cooks }}</span>
              <span
                class="ml-auto inline-flex items-center gap-1 text-xs font-medium"
                :class="branch.current_cooks >= branch.required_cooks ? 'text-emerald-600' : 'text-amber-600'"
              >
                <component
                  :is="branch.current_cooks >= branch.required_cooks ? CheckCircle2 : AlertTriangle"
                  class="h-3.5 w-3.5"
                />
                {{ branch.current_cooks >= branch.required_cooks
                  ? "충원 완료"
                  : `${branch.required_cooks - branch.current_cooks}명 부족` }}
              </span>
            </div>
            <div class="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
              <div
                class="h-full bg-amber-500 transition-all"
                :style="{
                  width:
                    branch.required_cooks > 0
                      ? Math.min(100, (branch.current_cooks / branch.required_cooks) * 100) + '%'
                      : '100%',
                }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Facility section — visual identity of the center -->
      <div class="rounded-xl border bg-card overflow-hidden mb-6">
        <div class="px-5 py-3 border-b flex items-center gap-2">
          <ImageIcon class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">시설 모습</h2>
          <span class="text-xs text-muted-foreground ml-auto">사진 업로드 (다음 슬라이스)</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4">
          <div
            v-for="i in 4"
            :key="i"
            class="aspect-video rounded-lg bg-gradient-to-br from-primary/10 via-muted to-card border border-dashed border-border flex items-center justify-center text-muted-foreground"
          >
            <Camera class="h-8 w-8 opacity-40" />
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="rounded-xl border bg-card p-4">
          <div class="text-xs text-muted-foreground">어르신</div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ branch.resident_count }}</div>
        </div>
        <div class="rounded-xl border bg-card p-4">
          <div class="text-xs text-muted-foreground">입소율</div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ branch.occupancy_pct.toFixed(1) }}%</div>
        </div>
        <div class="rounded-xl border bg-card p-4">
          <div class="text-xs text-muted-foreground">사고(7일)</div>
          <div
            class="text-2xl font-bold mt-1 tabular-nums"
            :class="branch.incidents_7d > 3 ? 'text-destructive' : ''"
          >
            {{ branch.incidents_7d }}
          </div>
        </div>
        <div class="rounded-xl border bg-card p-4">
          <div class="text-xs text-muted-foreground">직원 수</div>
          <div class="text-2xl font-bold mt-1 tabular-nums">{{ staff.length }}</div>
        </div>
      </div>

      <!-- Employment breakdown -->
      <div class="flex flex-wrap gap-2 mb-6">
        <div
          v-for="[code, c] in empCounts"
          :key="code"
          class="text-xs font-medium rounded-full px-2.5 py-1 border bg-card"
        >
          {{ c.ko }} <strong class="ml-1">{{ c.n }}</strong>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Staff -->
        <div class="rounded-xl border bg-card overflow-hidden">
          <div class="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
            <UsersRound class="h-4 w-4 text-primary" />
            <h2 class="font-semibold">직원</h2>
            <span class="text-xs text-muted-foreground">
              {{ staff.length }}<span v-if="staffQ"> / {{ staffAll.length }}</span>명
            </span>
            <div class="relative ml-auto">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                v-model="staffQ"
                type="search"
                placeholder="이름/직책 검색"
                class="h-8 pl-8 pr-2 w-44 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
            </div>
          </div>
          <ul class="max-h-[460px] overflow-y-auto divide-y">
            <li
              v-for="p in staff"
              :key="p.id"
              class="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/30 cursor-pointer transition-colors"
              @click="navigateTo(`/staff/${p.id}`)"
            >
              <div class="h-8 w-8 rounded-full bg-gradient-to-br from-primary/70 to-primary/40 text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {{ p.full_name.charAt(0) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{{ p.full_name }}</div>
                <div class="text-xs text-muted-foreground">{{ p.position_ko }} · {{ p.employment_type_ko }}</div>
              </div>
            </li>
          </ul>
        </div>

        <!-- Residents -->
        <div class="rounded-xl border bg-card overflow-hidden">
          <div class="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
            <Users class="h-4 w-4 text-primary" />
            <h2 class="font-semibold">어르신</h2>
            <span class="text-xs text-muted-foreground">
              {{ branchResidents.length }}<span v-if="residentQ"> / {{ residentsAll.length }}</span>명
            </span>
            <div class="relative ml-auto">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                v-model="residentQ"
                type="search"
                placeholder="이름/호실 검색"
                class="h-8 pl-8 pr-2 w-44 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
            </div>
          </div>
          <ul class="max-h-[460px] overflow-y-auto divide-y">
            <li
              v-for="r in branchResidents"
              :key="r.id"
              class="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/30 cursor-pointer"
              @click="navigateTo(`/residents/${r.id}`)"
            >
              <div class="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {{ r.full_name.charAt(0) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{{ r.full_name }}</div>
                <div class="text-xs text-muted-foreground">
                  <template v-if="r.room_number">{{ r.room_number }}호 · </template>
                  {{ r.care_grade === "cognitive_support" ? "인지지원" : r.care_grade ? `장기요양 ${r.care_grade}등급` : "등급 미부여" }}
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <div v-else class="py-12 text-center text-sm text-muted-foreground">
      지점을 찾을 수 없습니다.
    </div>
  </div>
</template>
