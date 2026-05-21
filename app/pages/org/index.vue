<script setup lang="ts">
import { Crown, Briefcase, Building2, Stethoscope, HeartPulse, Utensils, Activity, Hammer, Car, ChevronRight, Users } from "@lucide/vue";

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
const router = useRouter();
const { data, pending, error } = await useAsyncData("org-chart", () =>
  api.get<OrgPerson[]>("/v1/org/chart"),
);

// HQ vs branches
const hqPeople = computed(() => (data.value ?? []).filter((p) => !p.branch_id));
const branchGroups = computed(() => {
  const m = new Map<string, { name: string; people: OrgPerson[] }>();
  for (const p of data.value ?? []) {
    if (!p.branch_id) continue;
    if (!m.has(p.branch_id)) m.set(p.branch_id, { name: p.branch_name ?? "—", people: [] });
    m.get(p.branch_id)!.people.push(p);
  }
  return Array.from(m.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name, "ko"));
});

// Pretty grouping per branch by position bucket
function bucket(people: OrgPerson[]) {
  const groups = [
    { label: "리더십",   positions: ["branch_manager", "office_manager"] },
    { label: "의료/복지", positions: ["nurse_rn", "nurse_assistant", "social_worker", "doctor_visiting", "dietitian", "physical_therapist", "occupational_therapist"] },
    { label: "케어",     positions: ["caregiver"] },
    { label: "지원",     positions: ["cook", "cleaner", "driver", "other"] },
  ];
  return groups.map((g) => ({
    label: g.label,
    people: people.filter((p) => g.positions.includes(p.position)),
  })).filter((g) => g.people.length > 0);
}

const positionIcon: Record<string, any> = {
  ceo: Crown, coo: Briefcase, cfo: Briefcase, hr_director: Briefcase,
  quality_director: Briefcase, compliance: Briefcase, training: Briefcase, it: Briefcase,
  branch_manager: Building2, office_manager: Briefcase,
  social_worker: HeartPulse, nurse_rn: Stethoscope, nurse_assistant: Stethoscope,
  dietitian: Utensils, physical_therapist: Activity, occupational_therapist: Activity,
  doctor_visiting: Stethoscope, caregiver: HeartPulse,
  cook: Utensils, cleaner: Hammer, driver: Car, other: Briefcase,
};

const employmentTone: Record<string, string> = {
  regular:        "bg-primary/10 text-primary",
  contract:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  short_contract: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200",
  part_time:      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200",
  temporary:      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  dispatched:     "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  consultant:     "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};

// Hover popover state
const hoveredPerson = ref<OrgPerson | null>(null);
const popoverPos = ref({ x: 0, y: 0 });

function onHover(p: OrgPerson, e: MouseEvent) {
  hoveredPerson.value = p;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  popoverPos.value = { x: rect.right + 8, y: rect.top };
}
function onLeave() { hoveredPerson.value = null; }

function openBranch(branchId: string) {
  router.push(`/branches/${branchId}`);
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">조직도</h1>
      <p class="text-sm text-muted-foreground mt-1">
        본사부터 각 지점까지 트리 구조. 직원에 마우스를 올리면 상세, 지점 카드를 클릭하면 지점 상세 페이지로 이동합니다.
      </p>
    </header>

    <div v-if="pending" class="space-y-3">
      <Skeleton h="6rem" />
      <Skeleton h="6rem" />
    </div>

    <div v-else-if="error" class="text-sm text-destructive py-12 text-center">
      조직도를 불러오지 못했습니다.
    </div>

    <template v-else>
      <!-- TREE STRUCTURE -->
      <div class="relative">
        <!-- HQ root -->
        <div class="rounded-xl border-2 border-primary bg-primary/5 p-5 mb-2 max-w-xl mx-auto shadow-md">
          <div class="flex items-center gap-3 mb-3">
            <div class="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Crown class="h-5 w-5" />
            </div>
            <div>
              <div class="text-base font-bold">본사 (HQ)</div>
              <div class="text-xs text-muted-foreground">{{ hqPeople.length }}명 · 케어닥 전사 운영</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <div
              v-for="p in hqPeople"
              :key="p.id"
              class="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-card text-xs cursor-help hover:border-primary/40 transition-colors"
              @mouseenter="onHover(p, $event)"
              @mouseleave="onLeave"
            >
              <component :is="positionIcon[p.position] ?? Briefcase" class="h-3 w-3 text-muted-foreground" />
              <span class="font-medium">{{ p.full_name }}</span>
              <span class="text-muted-foreground">· {{ p.position_ko }}</span>
            </div>
          </div>
        </div>

        <!-- vertical connector -->
        <div class="h-6 w-0.5 bg-border mx-auto" />

        <!-- horizontal connector + branches -->
        <div class="relative">
          <!-- Horizontal line spanning the branches grid -->
          <div class="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 bg-border" style="width: calc(100% - 16px)" />

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-6">
            <button
              v-for="[branchId, group] in branchGroups"
              :key="branchId"
              class="text-left rounded-xl border bg-card hover:border-primary hover:shadow-md transition-all p-4 group focus:outline-none focus:ring-4 focus:ring-primary/15 relative"
              @click="openBranch(branchId)"
            >
              <!-- connector dot -->
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 h-3 w-0.5 bg-border" />
              <div class="absolute -top-3.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-primary" />

              <div class="flex items-center gap-2 mb-3">
                <Building2 class="h-4 w-4 text-primary" />
                <div class="font-semibold flex-1">{{ group.name }}</div>
                <ChevronRight class="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div class="text-xs text-muted-foreground mb-3">
                <Users class="h-3 w-3 inline-block mr-0.5" />
                총 {{ group.people.length }}명
              </div>

              <!-- Buckets -->
              <div class="space-y-2">
                <div v-for="b in bucket(group.people)" :key="b.label">
                  <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {{ b.label }} ({{ b.people.length }})
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <div
                      v-for="p in b.people"
                      :key="p.id"
                      class="px-1.5 py-0.5 rounded text-[11px] cursor-help transition-colors"
                      :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                      @mouseenter.stop="onHover(p, $event)"
                      @mouseleave="onLeave"
                      @click.stop
                    >
                      {{ p.full_name }}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- HOVER POPOVER -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition duration-100"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="hoveredPerson"
            class="fixed z-50 pointer-events-none rounded-lg border bg-card shadow-2xl shadow-foreground/20 p-3 max-w-xs"
            :style="{ left: popoverPos.x + 'px', top: popoverPos.y + 'px' }"
          >
            <div class="flex items-start gap-2.5">
              <div class="h-9 w-9 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-primary-foreground flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {{ hoveredPerson.full_name.charAt(0) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm">{{ hoveredPerson.full_name }}</div>
                <div class="text-xs text-muted-foreground">{{ hoveredPerson.position_ko }}</div>
              </div>
            </div>
            <dl class="mt-3 text-xs space-y-1.5">
              <div class="flex">
                <dt class="text-muted-foreground w-16">이메일</dt>
                <dd class="flex-1 font-mono truncate">{{ hoveredPerson.email }}</dd>
              </div>
              <div class="flex">
                <dt class="text-muted-foreground w-16">소속</dt>
                <dd class="flex-1">{{ hoveredPerson.branch_name ?? "본사" }}</dd>
              </div>
              <div class="flex">
                <dt class="text-muted-foreground w-16">고용</dt>
                <dd class="flex-1">
                  <span
                    class="inline-block px-1.5 py-0.5 rounded text-[10px]"
                    :class="employmentTone[hoveredPerson.employment_type]"
                  >{{ hoveredPerson.employment_type_ko }}</span>
                  <span v-if="hoveredPerson.agency_name" class="text-muted-foreground ml-1">· {{ hoveredPerson.agency_name }}</span>
                </dd>
              </div>
              <div v-if="hoveredPerson.hired_on" class="flex">
                <dt class="text-muted-foreground w-16">입사</dt>
                <dd class="flex-1">{{ hoveredPerson.hired_on }}</dd>
              </div>
              <div v-if="hoveredPerson.contract_end_on" class="flex">
                <dt class="text-muted-foreground w-16">계약 만료</dt>
                <dd class="flex-1">{{ hoveredPerson.contract_end_on }}</dd>
              </div>
            </dl>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>
