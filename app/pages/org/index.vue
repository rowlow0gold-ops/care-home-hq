<script setup lang="ts">
import {
  Crown, Briefcase, Building2, Stethoscope, HeartPulse, Utensils, Activity,
  Hammer, Car, ChevronRight, Users, Layers,
} from "@lucide/vue";

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
  is_inactive: boolean;
}
interface PagedOrg {
  items: OrgPerson[];
  total: number;
  page: number;
  page_size: number;
}
interface BranchInfo {
  id: string;
  name: string;
  branch_type: "hub" | "satellite";
  parent_branch_id: string | null;
  resident_count: number;
  staff_on_duty: number;
  services: string[];
}

const api = useApi();
const router = useRouter();

// =============================================================================
// HQ: paged (default 25). The HQ pool is small (~5-10 admins) so it almost
// always fits in one page. Branch lists are paged per-branch below.
// =============================================================================
const { data: hqPaged, pending: hqPending } = await useAsyncData(
  "org-hq",
  () => api.get<PagedOrg>("/v1/org/paged", { hq_only: true, page: 1, page_size: 25 }),
);
const hqPeople = computed<OrgPerson[]>(() => hqPaged.value?.items ?? []);

// =============================================================================
// Branch list comes from dashboard summary — gives us hub/satellite parentage
// =============================================================================
const { data: dashboard, pending: branchesPending } = await useAsyncData(
  "org-branches",
  () => api.get<{ branches: BranchInfo[] }>("/v1/dashboard/summary"),
);
const pending = computed(() => hqPending.value || branchesPending.value);

// =============================================================================
// Per-branch staff (paged, 25 per page). Each branch fetches lazily on
// expand; state is keyed by branch id.
// =============================================================================
const branchStaffState = reactive<Record<string, {
  items: OrgPerson[];
  total: number;
  page: number;
  loading: boolean;
  loaded:  boolean;
}>>({});

async function loadBranchStaff(branchId: string, page = 1) {
  const st = branchStaffState[branchId] ?? {
    items: [], total: 0, page: 1, loading: false, loaded: false,
  };
  if (st.loading) return;
  st.loading = true;
  branchStaffState[branchId] = st;
  try {
    const r = await api.get<PagedOrg>("/v1/org/paged", {
      branch_id: branchId, page, page_size: 25,
    });
    st.items = r.items;
    st.total = r.total;
    st.page  = r.page;
    st.loaded = true;
  } finally {
    st.loading = false;
  }
}

// Hubs (sorted by name) + their child satellites
interface HubGroup { hub: BranchInfo; satellites: BranchInfo[] }
const hubs = computed<HubGroup[]>(() => {
  const all = dashboard.value?.branches ?? [];
  const huburned = all.filter((b) => b.branch_type === "hub")
                      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return huburned.map((hub) => ({
    hub,
    satellites: all
      .filter((b) => b.branch_type === "satellite" && b.parent_branch_id === hub.id)
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  }));
});

const orphans = computed<BranchInfo[]>(() =>
  (dashboard.value?.branches ?? [])
    .filter((b) => b.branch_type === "satellite" && !b.parent_branch_id)
    .sort((a, b) => a.name.localeCompare(b.name, "ko")),
);

// Auto-load page 1 for every visible branch as soon as the dashboard is ready
watchEffect(() => {
  for (const b of dashboard.value?.branches ?? []) {
    if (!branchStaffState[b.id]?.loaded && !branchStaffState[b.id]?.loading) {
      loadBranchStaff(b.id, 1);
    }
  }
});

// Position grouping helper for the inline branch card
function bucket(persons: OrgPerson[]) {
  const groups = [
    { label: "센터장",   positions: ["branch_manager", "office_manager"] },
    { label: "의료/복지", positions: ["nurse_rn", "nurse_assistant", "social_worker", "doctor_visiting", "dietitian", "physical_therapist", "occupational_therapist"] },
    { label: "케어",     positions: ["caregiver"] },
    { label: "지원",     positions: ["cook", "cleaner", "driver", "receptionist", "other"] },
  ];
  return groups.map((g) => ({
    label: g.label,
    people: persons.filter((p) => g.positions.includes(p.position)),
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
  part_time:      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200",
  temporary:      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  consultant:     "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};

// Hover popover state
const hoveredPerson = ref<OrgPerson | null>(null);
const popoverPos = ref({ x: 0, y: 0 });

function onHover(p: OrgPerson, e: MouseEvent) {
  hoveredPerson.value = p;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const W = 280, H = 220;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = rect.right + 8;
  let y = rect.top;
  if (x + W > vw - 8) x = Math.max(8, rect.left - W - 8);
  if (y + H > vh - 8) y = Math.max(8, rect.bottom - H);
  popoverPos.value = { x, y };
}
function onLeave() { hoveredPerson.value = null; }

function openBranch(branchId: string) {
  router.push(`/branches/${branchId}`);
}
function openPerson(p: OrgPerson, e: MouseEvent) {
  e.stopPropagation();
  router.push(`/staff/${p.id}`);
}

function pageCountFor(branchId: string): number {
  const st = branchStaffState[branchId];
  if (!st) return 1;
  return Math.max(1, Math.ceil(st.total / 25));
}
async function changePage(branchId: string, delta: number) {
  const st = branchStaffState[branchId];
  if (!st) return;
  const next = Math.max(1, Math.min(pageCountFor(branchId), st.page + delta));
  if (next === st.page) return;
  await loadBranchStaff(branchId, next);
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">조직도</h1>
    </header>

    <div v-if="pending" class="space-y-3">
      <Skeleton h="6rem" />
      <Skeleton h="6rem" />
    </div>

    <template v-else>
      <!-- HQ -->
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
          <button
            v-for="p in hqPeople"
            :key="p.id"
            class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors hover:ring-1 hover:ring-primary/40"
            :class="employmentTone[p.employment_type] ?? 'bg-muted'"
            @mouseenter="onHover(p, $event)"
            @mouseleave="onLeave"
            @click="openPerson(p, $event)"
          >
            <component :is="positionIcon[p.position] ?? Briefcase" class="h-3 w-3 opacity-70" />
            <span class="font-medium">{{ p.full_name }}</span>
            <span class="opacity-70">· {{ p.position_ko }}</span>
          </button>
        </div>
      </div>

      <div class="h-6 w-0.5 bg-border mx-auto" />

      <!-- One row per HUB with its satellites nested below -->
      <div class="space-y-5">
        <div
          v-for="g in hubs"
          :key="g.hub.id"
          class="rounded-2xl border bg-muted/30 p-4"
        >
          <!-- Hub card -->
          <button
            class="block w-full text-left rounded-xl border-2 border-primary/40 bg-card hover:border-primary hover:shadow-md transition-all p-4 focus:outline-none focus:ring-4 focus:ring-primary/15 group relative"
            @click="openBranch(g.hub.id)"
          >
            <div class="flex items-center gap-2 mb-3">
              <div class="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <Building2 class="h-4 w-4" />
              </div>
              <div class="flex-1">
                <div class="font-semibold flex items-center gap-2">
                  {{ g.hub.name }}
                  <span class="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/15 text-primary">
                    거점 Hub
                  </span>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">
                  <Users class="h-3 w-3 inline-block mr-0.5" />
                  총 {{ branchStaffState[g.hub.id]?.total ?? 0 }}명
                  · 어르신 {{ g.hub.resident_count }}명
                  · 산하 위성 {{ g.satellites.length }}곳
                </div>
              </div>
              <ChevronRight class="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <!-- Hub's own staff (current page, 25 at a time) -->
            <div v-if="branchStaffState[g.hub.id]?.loading && !branchStaffState[g.hub.id]?.loaded" class="space-y-2">
              <Skeleton h="1.25rem" w="80%" />
              <Skeleton h="1.25rem" w="60%" />
            </div>
            <div v-else class="space-y-2">
              <div v-for="b in bucket(branchStaffState[g.hub.id]?.items ?? [])" :key="b.label">
                <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {{ b.label }} ({{ b.people.length }})
                </div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="p in b.people"
                    :key="p.id"
                    class="px-1.5 py-0.5 rounded text-[11px] transition-colors hover:ring-1 hover:ring-primary/40"
                    :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                    @mouseenter.stop="onHover(p, $event)"
                    @mouseleave="onLeave"
                    @click="openPerson(p, $event)"
                  >
                    {{ p.full_name }}
                  </button>
                </div>
              </div>

              <!-- Pagination row — only if branch has more than one page -->
              <div
                v-if="pageCountFor(g.hub.id) > 1"
                class="flex items-center gap-2 pt-2 mt-1 border-t text-[11px] text-muted-foreground"
                @click.stop
              >
                <span class="tabular-nums">
                  페이지 {{ branchStaffState[g.hub.id]?.page ?? 1 }} / {{ pageCountFor(g.hub.id) }}
                  · 총 {{ branchStaffState[g.hub.id]?.total ?? 0 }}명
                </span>
                <div class="ml-auto flex items-center gap-1">
                  <button
                    class="h-6 w-6 rounded border bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40"
                    :disabled="(branchStaffState[g.hub.id]?.page ?? 1) <= 1 || branchStaffState[g.hub.id]?.loading"
                    @click.stop="changePage(g.hub.id, -1)"
                  >‹</button>
                  <button
                    class="h-6 w-6 rounded border bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40"
                    :disabled="(branchStaffState[g.hub.id]?.page ?? 1) >= pageCountFor(g.hub.id) || branchStaffState[g.hub.id]?.loading"
                    @click.stop="changePage(g.hub.id, 1)"
                  >›</button>
                </div>
              </div>
            </div>
          </button>

          <!-- Satellites under this hub -->
          <div v-if="g.satellites.length > 0" class="mt-3 ml-6 pl-4 border-l-2 border-primary/20 space-y-3">
            <div class="text-xs text-muted-foreground flex items-center gap-1 -ml-7 mt-1">
              <Layers class="h-3.5 w-3.5 text-primary/60" />
              <span class="font-medium">{{ g.satellites.length }}개 위성센터</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                v-for="sat in g.satellites"
                :key="sat.id"
                class="text-left rounded-xl border bg-card hover:border-primary hover:shadow-sm transition-all p-3 focus:outline-none focus:ring-4 focus:ring-primary/15 group"
                @click="openBranch(sat.id)"
              >
                <div class="flex items-center gap-2 mb-2">
                  <Building2 class="h-3.5 w-3.5 text-muted-foreground" />
                  <div class="font-medium text-sm flex-1">{{ sat.name }}</div>
                  <span class="text-[9px] font-semibold uppercase tracking-wider rounded px-1 py-0.5 bg-muted text-muted-foreground">
                    Sat
                  </span>
                  <ChevronRight class="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div class="text-[11px] text-muted-foreground mb-2">
                  <Users class="h-3 w-3 inline-block mr-0.5" />
                  {{ branchStaffState[sat.id]?.total ?? 0 }}명
                </div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="p in (branchStaffState[sat.id]?.items ?? []).slice(0, 6)"
                    :key="p.id"
                    class="px-1.5 py-0.5 rounded text-[10px] transition-colors hover:ring-1 hover:ring-primary/40"
                    :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                    @mouseenter.stop="onHover(p, $event)"
                    @mouseleave="onLeave"
                    @click="openPerson(p, $event)"
                  >
                    {{ p.full_name }}
                  </button>
                  <span
                    v-if="(branchStaffState[sat.id]?.total ?? 0) > 6"
                    class="text-[10px] text-muted-foreground self-center"
                  >
                    +{{ (branchStaffState[sat.id]?.total ?? 0) - 6 }} 더보기 →
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Orphan satellites -->
        <div v-if="orphans.length > 0" class="rounded-2xl border bg-muted/30 p-4">
          <div class="text-xs font-medium text-amber-600 mb-3 flex items-center gap-1">
            <Layers class="h-3.5 w-3.5" /> 미배정 위성센터 ({{ orphans.length }})
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              v-for="sat in orphans"
              :key="sat.id"
              class="text-left rounded-xl border bg-card hover:border-primary p-3"
              @click="openBranch(sat.id)"
            >
              <div class="font-medium text-sm">{{ sat.name }}</div>
              <div class="text-[11px] text-muted-foreground mt-1">
                {{ branchStaffState[sat.id]?.total ?? 0 }}명
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
