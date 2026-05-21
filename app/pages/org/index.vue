<script setup lang="ts">
import { Crown, Briefcase, Building2, Stethoscope, HeartPulse, Utensils, Activity, Hammer, Car, ChevronRight } from "@lucide/vue";

useHead({ title: "조직도 · 케어닥 HQ" });

interface OrgPerson {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  full_name: string;
  email: string;
  role: string;
  position: string;
  position_ko: string;
  employment_type: string;
  employment_type_ko: string;
  hired_on: string | null;
  contract_end_on: string | null;
  agency_name: string | null;
  is_inactive: boolean;
}

const api = useApi();
const { data, pending, error } = await useAsyncData("org-chart", () =>
  api.get<OrgPerson[]>("/v1/org/chart"),
);

// Group by branch_id (null = HQ), then by position
const grouped = computed(() => {
  const out = new Map<string, { name: string; people: OrgPerson[] }>();
  for (const p of data.value ?? []) {
    const key = p.branch_id ?? "__hq__";
    const display = p.branch_name ?? "본사 (HQ)";
    if (!out.has(key)) out.set(key, { name: display, people: [] });
    out.get(key)!.people.push(p);
  }
  // HQ first, then branches by name
  const arr = Array.from(out.entries());
  arr.sort(([a], [b]) => {
    if (a === "__hq__") return -1;
    if (b === "__hq__") return 1;
    return out.get(a)!.name.localeCompare(out.get(b)!.name, "ko");
  });
  return arr;
});

// Group people within a branch by position
function byPosition(people: OrgPerson[]) {
  const m = new Map<string, OrgPerson[]>();
  // Ordered position display
  const order = [
    "ceo", "coo", "cfo", "hr_director", "quality_director", "compliance", "training", "it",
    "branch_manager", "office_manager",
    "social_worker", "nurse_rn", "nurse_assistant", "dietitian",
    "physical_therapist", "occupational_therapist",
    "doctor_visiting",
    "caregiver",
    "cook", "cleaner", "driver",
    "other",
  ];
  for (const p of people) {
    if (!m.has(p.position)) m.set(p.position, []);
    m.get(p.position)!.push(p);
  }
  return order
    .filter((p) => m.has(p))
    .map((p) => ({ position: p, ko: m.get(p)![0].position_ko, people: m.get(p)! }));
}

// Position icon
const positionIcon: Record<string, any> = {
  ceo: Crown,
  coo: Briefcase,
  cfo: Briefcase,
  hr_director: Briefcase,
  quality_director: Briefcase,
  compliance: Briefcase,
  training: Briefcase,
  it: Briefcase,
  branch_manager: Building2,
  office_manager: Briefcase,
  social_worker: HeartPulse,
  nurse_rn: Stethoscope,
  nurse_assistant: Stethoscope,
  dietitian: Utensils,
  physical_therapist: Activity,
  occupational_therapist: Activity,
  doctor_visiting: Stethoscope,
  caregiver: HeartPulse,
  cook: Utensils,
  cleaner: Hammer,
  driver: Car,
  other: Briefcase,
};

const employmentTone: Record<string, string> = {
  regular:        "bg-primary/10 text-primary border-primary/20",
  contract:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 border-blue-200/50",
  short_contract: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200 border-cyan-200/50",
  part_time:      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200 border-violet-200/50",
  temporary:      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border-amber-200/50",
  dispatched:     "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200 border-orange-200/50",
  consultant:     "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 border-rose-200/50",
};

const total = computed(() => (data.value ?? []).length);

// Counts by employment type
const empCounts = computed(() => {
  const c: Record<string, { ko: string; n: number; tone: string }> = {};
  for (const p of data.value ?? []) {
    if (!c[p.employment_type]) {
      c[p.employment_type] = {
        ko: p.employment_type_ko,
        n: 0,
        tone: employmentTone[p.employment_type] ?? "bg-muted text-muted-foreground",
      };
    }
    c[p.employment_type].n++;
  }
  return Object.entries(c).sort(([, a], [, b]) => b.n - a.n);
});
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">조직도</h1>
      <p class="text-sm text-muted-foreground mt-1">전체 직원 직책 + 고용형태 — 본사부터 각 지점까지</p>
    </header>

    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <Skeleton v-for="i in 3" :key="i" h="8rem" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-sm text-destructive py-12 text-center">
      조직도를 불러오지 못했습니다.
    </div>

    <template v-else>
      <!-- Top summary: total + employment type pills -->
      <div class="mb-6 flex flex-wrap items-center gap-2">
        <div class="rounded-full bg-foreground/5 text-sm font-medium px-3 py-1.5">
          총 {{ total }}명
        </div>
        <div
          v-for="[code, c] in empCounts"
          :key="code"
          class="text-xs font-medium rounded-full px-2.5 py-1 border"
          :class="c.tone"
        >
          {{ c.ko }} {{ c.n }}
        </div>
      </div>

      <!-- Branch sections -->
      <div class="space-y-4">
        <details
          v-for="([key, group], idx) in grouped"
          :key="key"
          :open="idx < 2"
          class="rounded-xl border bg-card overflow-hidden group"
        >
          <summary class="flex items-center gap-3 px-6 py-4 cursor-pointer select-none hover:bg-muted/30 transition-colors">
            <ChevronRight class="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            <Building2
              v-if="key !== '__hq__'"
              class="h-4 w-4 text-primary"
            />
            <Crown v-else class="h-4 w-4 text-primary" />
            <span class="font-semibold">{{ group.name }}</span>
            <span class="text-xs text-muted-foreground">{{ group.people.length }}명</span>
          </summary>

          <div class="border-t px-6 py-4 space-y-4">
            <div v-for="pos in byPosition(group.people)" :key="pos.position">
              <div class="flex items-center gap-2 mb-2">
                <component :is="positionIcon[pos.position] ?? Briefcase" class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {{ pos.ko }} <span class="opacity-70">({{ pos.people.length }})</span>
                </span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                <div
                  v-for="p in pos.people"
                  :key="p.id"
                  class="rounded-lg border bg-background hover:border-primary/40 transition-colors p-3 flex items-center gap-2.5"
                >
                  <div class="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {{ p.full_name.charAt(0) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">{{ p.full_name }}</div>
                    <div class="flex items-center gap-1">
                      <span
                        class="text-[10px] font-medium rounded px-1.5 py-px border"
                        :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                      >
                        {{ p.employment_type_ko }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </template>
  </div>
</template>
