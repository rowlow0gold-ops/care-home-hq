<script setup lang="ts">
import { ArrowLeft, Building2, Users, UsersRound, MapPin, Phone } from "@lucide/vue";

const route = useRoute();
const id = route.params.id as string;
const api = useApi();

interface Branch {
  id: string;
  name: string;
  resident_count: number;
  occupancy_pct: number;
  incidents_7d: number;
  staff_on_duty: number;
}
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
const staff = computed(() => (org.value ?? []).filter((p) => p.branch_id === id));
const branchResidents = computed(() =>
  (residents.value ?? []).filter((r: any) => r.branch_id === id && r.status === "active"),
);

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
      <header class="mb-6">
        <div class="flex items-center gap-3">
          <div class="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Building2 class="h-6 w-6" />
          </div>
          <div>
            <h1 class="text-3xl font-bold tracking-tight">{{ branch.name }}</h1>
            <p class="text-sm text-muted-foreground mt-0.5">지점 운영 현황 + 직원 구성</p>
          </div>
        </div>
      </header>

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
          <div class="px-5 py-3 border-b flex items-center gap-2">
            <UsersRound class="h-4 w-4 text-primary" />
            <h2 class="font-semibold">직원</h2>
            <span class="ml-auto text-xs text-muted-foreground">{{ staff.length }}명</span>
          </div>
          <ul class="max-h-[460px] overflow-y-auto divide-y">
            <li v-for="p in staff" :key="p.id" class="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/30">
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
          <div class="px-5 py-3 border-b flex items-center gap-2">
            <Users class="h-4 w-4 text-primary" />
            <h2 class="font-semibold">어르신</h2>
            <span class="ml-auto text-xs text-muted-foreground">{{ branchResidents.length }}명</span>
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
