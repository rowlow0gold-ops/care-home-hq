<script setup lang="ts">
import {
  Crown, Briefcase, Building2, Stethoscope, HeartPulse, Hammer,
  ChevronRight, ChevronDown, Users, Layers, Plus, Loader2,
} from "@lucide/vue";

useHead({ title: "조직도 · 케어닥 HQ" });

interface OrgPerson {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  full_name: string;
  email: string;
  position: string;
  position_ko: string;
  employment_type: string;
  employment_type_ko: string;
  hired_on: string | null;
  contract_end_on: string | null;
}
interface BucketCounts { leaders: number; medical: number; care: number; support: number }
interface BranchSummary {
  branch_id: string | null;
  total: number;
  counts: BucketCounts;
  leaders: OrgPerson[];
}
interface BranchInfo {
  id: string;
  name: string;
  branch_type: "hub" | "satellite";
  parent_branch_id: string | null;
  resident_count: number;
  services: string[];
}

const api = useApi();
const router = useRouter();
const { me } = useAuth();
const isHq = computed(() => me.value?.role === "hq" || me.value?.role === "super_admin");

// =============================================================================
// Single round-trip: per-branch counts + leadership names.
// Replaces the previous "fetch all 3,200 staff" pattern.
// =============================================================================
const [{ data: summaries, pending: summariesPending, refresh: refreshSummaries }, { data: dashboard, pending: branchesPending }] =
  await Promise.all([
    useAsyncData("org-branch-summary", () => api.get<BranchSummary[]>("/v1/org/branch-summary")),
    useAsyncData("org-branches", () => api.get<{ branches: BranchInfo[] }>("/v1/dashboard/summary")),
  ]);

// HQ-add dialog state — only HQ users see the trigger.
const showHqAdd = ref(false);
function openHqAdd() { showHqAdd.value = true; }
async function onHqCreated() { await refreshSummaries(); }
const pending = computed(() => summariesPending.value || branchesPending.value);

const summaryByBranch = computed(() => {
  const m = new Map<string | null, BranchSummary>();
  for (const s of summaries.value ?? []) m.set(s.branch_id, s);
  return m;
});
const hqSummary = computed(() => summaryByBranch.value.get(null) ?? null);

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

const positionIcon: Record<string, any> = {
  ceo: Crown, coo: Briefcase, cfo: Briefcase, hr_director: Briefcase,
  quality_director: Briefcase, compliance: Briefcase, training: Briefcase, it: Briefcase,
  branch_manager: Building2, office_manager: Briefcase,
};
const employmentTone: Record<string, string> = {
  regular:        "bg-primary/10 text-primary",
  contract:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  part_time:      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200",
  temporary:      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  consultant:     "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};

// Hover popover state — appears on hovered leader pill
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

// =============================================================================
// Fold / unfold per branch — lazy-load full roster via /v1/org/paged.
// "HQ" expand uses { hq_only: true }; everyone else uses { branch_id }.
// Cache by branch_id key (or "_hq_" for HQ) so we only fetch once per branch.
// =============================================================================
const ROSTER_PAGE_SIZE = 200; // enough to cover any single branch in one shot
const expanded   = reactive<Record<string, boolean>>({});
const rosters    = reactive<Record<string, OrgPerson[]>>({});
const rosterLoad = reactive<Record<string, boolean>>({});

interface PagedOrg { items: OrgPerson[]; total: number; page: number; page_size: number }

async function ensureRoster(key: string, branchId: string | null) {
  if (rosters[key] || rosterLoad[key]) return;
  rosterLoad[key] = true;
  try {
    const params: Record<string, any> = { page: 1, page_size: ROSTER_PAGE_SIZE };
    if (branchId === null) params.hq_only = true;
    else                   params.branch_id = branchId;
    const res = await api.get<PagedOrg>("/v1/org/paged", params);
    rosters[key] = res.items ?? [];
  } catch {
    rosters[key] = [];
  } finally {
    rosterLoad[key] = false;
  }
}

async function toggleBranch(key: string, branchId: string | null, e: MouseEvent) {
  e.stopPropagation();
  expanded[key] = !expanded[key];
  if (expanded[key]) await ensureRoster(key, branchId);
}

// Position-bucket helpers — mirrors the backend's branch_summary buckets.
const LEADER_POSITIONS = new Set([
  "branch_manager", "office_manager",
  "ceo", "coo", "cfo", "hr_director", "quality_director", "compliance", "training", "it",
]);
const MEDICAL_POSITIONS = new Set([
  "nurse_rn", "nurse_assistant", "social_worker", "doctor_visiting",
  "dietitian", "physical_therapist", "occupational_therapist",
]);
const CARE_POSITIONS = new Set(["caregiver"]);

interface BucketedRoster {
  leaders:  OrgPerson[];
  medical:  OrgPerson[];
  care:     OrgPerson[];
  support:  OrgPerson[];
}
function bucket(list: OrgPerson[]): BucketedRoster {
  const out: BucketedRoster = { leaders: [], medical: [], care: [], support: [] };
  for (const p of list) {
    if      (LEADER_POSITIONS.has(p.position))  out.leaders.push(p);
    else if (MEDICAL_POSITIONS.has(p.position)) out.medical.push(p);
    else if (CARE_POSITIONS.has(p.position))    out.care.push(p);
    else                                         out.support.push(p);
  }
  return out;
}
function rosterFor(key: string): BucketedRoster | null {
  const list = rosters[key];
  if (!list) return null;
  return bucket(list);
}

interface BucketMeta { label: string; icon: any; tone: string; list: OrgPerson[] }
function bucketsOf(key: string): BucketMeta[] {
  const b = rosterFor(key);
  if (!b) return [];
  return [
    { label: "리더십",    icon: Crown,       tone: "text-primary",          list: b.leaders },
    { label: "의료/복지", icon: Stethoscope, tone: "text-blue-600",         list: b.medical },
    { label: "케어",      icon: HeartPulse,  tone: "text-primary",          list: b.care    },
    { label: "지원/행정", icon: Hammer,      tone: "text-muted-foreground", list: b.support },
  ].filter(g => g.list.length > 0);
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">조직도</h1>
    </header>

    <div v-if="pending" class="space-y-3">
      <Skeleton h="6rem" />
      <Skeleton h="8rem" />
      <Skeleton h="8rem" />
    </div>

    <template v-else>
      <!-- HQ -->
      <div class="rounded-xl border-2 border-primary bg-primary/5 p-5 mb-2 max-w-xl mx-auto shadow-md">
        <div class="flex items-center gap-3 mb-3">
          <div class="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Crown class="h-5 w-5" />
          </div>
          <div class="flex-1">
            <div class="text-base font-bold">본사 (HQ)</div>
            <div class="text-xs text-muted-foreground">
              {{ hqSummary?.total ?? 0 }}명 · 케어닥 전사 운영
            </div>
          </div>
          <button
            type="button"
            class="h-8 px-2 rounded-md border border-primary/30 bg-card text-primary text-xs font-medium inline-flex items-center gap-1 hover:bg-primary/10 transition-colors"
            :title="expanded['_hq_'] ? '접기' : '본사 전체 직원 보기'"
            @click="toggleBranch('_hq_', null, $event)"
          >
            <Loader2 v-if="rosterLoad['_hq_']" class="h-3.5 w-3.5 animate-spin" />
            <ChevronDown v-else-if="expanded['_hq_']" class="h-3.5 w-3.5" />
            <ChevronRight v-else class="h-3.5 w-3.5" />
            전체보기
          </button>
          <button
            v-if="isHq"
            type="button"
            class="h-8 px-2.5 rounded-md border border-primary/30 bg-card text-primary text-xs font-medium inline-flex items-center gap-1 hover:bg-primary/10 transition-colors"
            @click="openHqAdd"
          >
            <Plus class="h-3.5 w-3.5" />
            본사 직원 추가
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="p in hqSummary?.leaders ?? []"
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

        <!-- HQ full roster, lazy -->
        <div v-if="expanded['_hq_']" class="mt-3 pt-3 border-t border-primary/15 space-y-2.5">
          <div v-if="rosterLoad['_hq_'] && !rosters['_hq_']" class="py-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Loader2 class="h-3 w-3 animate-spin" /> 직원 목록을 불러오는 중…
          </div>
          <template v-else>
            <div v-for="grp in bucketsOf('_hq_')" :key="grp.label">
              <div class="text-[10px] font-semibold uppercase tracking-wider mb-1 inline-flex items-center gap-1" :class="grp.tone">
                <component :is="grp.icon" class="h-3 w-3" />
                {{ grp.label }} · {{ grp.list.length }}명
              </div>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="p in grp.list" :key="p.id"
                  class="px-1.5 py-0.5 rounded text-[11px] transition-colors hover:ring-1 hover:ring-primary/40"
                  :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                  @mouseenter="onHover(p, $event)"
                  @mouseleave="onLeave"
                  @click="openPerson(p, $event)"
                >
                  {{ p.full_name }}<span class="opacity-70"> · {{ p.position_ko }}</span>
                </button>
              </div>
            </div>
          </template>
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
          <div class="rounded-xl border-2 border-primary/40 bg-card hover:border-primary hover:shadow-md transition-all p-4 group relative">
            <div class="flex items-center gap-2 mb-3">
              <div class="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center cursor-pointer" @click="openBranch(g.hub.id)">
                <Building2 class="h-4 w-4" />
              </div>
              <div class="flex-1 cursor-pointer" @click="openBranch(g.hub.id)">
                <div class="font-semibold flex items-center gap-2">
                  {{ g.hub.name }}
                  <span class="text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/15 text-primary">
                    거점 Hub
                  </span>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">
                  <Users class="h-3 w-3 inline-block mr-0.5" />
                  총 {{ summaryByBranch.get(g.hub.id)?.total ?? 0 }}명
                  · 어르신 {{ g.hub.resident_count }}명
                  · 산하 위성 {{ g.satellites.length }}곳
                </div>
              </div>
              <button
                type="button"
                class="h-7 px-2 rounded-md border border-input bg-background text-[11px] font-medium inline-flex items-center gap-1 hover:bg-muted"
                :title="expanded[g.hub.id] ? '직원 목록 접기' : '직원 전체 목록 보기'"
                @click="toggleBranch(g.hub.id, g.hub.id, $event)"
              >
                <Loader2 v-if="rosterLoad[g.hub.id]" class="h-3 w-3 animate-spin" />
                <ChevronDown v-else-if="expanded[g.hub.id]" class="h-3 w-3" />
                <ChevronRight v-else class="h-3 w-3" />
                {{ expanded[g.hub.id] ? '접기' : '전체보기' }}
              </button>
            </div>

            <!-- Leaders (real names) -->
            <div class="mb-3 flex flex-wrap gap-1.5" @click.stop>
              <button
                v-for="p in summaryByBranch.get(g.hub.id)?.leaders ?? []"
                :key="p.id"
                class="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors hover:ring-1 hover:ring-primary/40"
                :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                @mouseenter="onHover(p, $event)"
                @mouseleave="onLeave"
                @click="openPerson(p, $event)"
              >
                <Building2 class="h-3 w-3 opacity-70" />
                {{ p.full_name }}
                <span class="opacity-70">· {{ p.position_ko }}</span>
              </button>
            </div>

            <!-- Other-position counts (compact) -->
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div class="rounded-md border bg-background/50 px-2.5 py-1.5 flex items-center gap-1.5">
                <Stethoscope class="h-3 w-3 text-blue-600" />
                <span class="text-muted-foreground">의료/복지</span>
                <span class="ml-auto font-semibold tabular-nums">{{ summaryByBranch.get(g.hub.id)?.counts.medical ?? 0 }}명</span>
              </div>
              <div class="rounded-md border bg-background/50 px-2.5 py-1.5 flex items-center gap-1.5">
                <HeartPulse class="h-3 w-3 text-primary" />
                <span class="text-muted-foreground">케어</span>
                <span class="ml-auto font-semibold tabular-nums">{{ summaryByBranch.get(g.hub.id)?.counts.care ?? 0 }}명</span>
              </div>
              <div class="rounded-md border bg-background/50 px-2.5 py-1.5 flex items-center gap-1.5">
                <Hammer class="h-3 w-3 text-muted-foreground" />
                <span class="text-muted-foreground">지원</span>
                <span class="ml-auto font-semibold tabular-nums">{{ summaryByBranch.get(g.hub.id)?.counts.support ?? 0 }}명</span>
              </div>
            </div>

            <!-- Expanded full roster (lazy-loaded) -->
            <div v-if="expanded[g.hub.id]" class="mt-3 pt-3 border-t border-primary/15 space-y-2.5">
              <div v-if="rosterLoad[g.hub.id] && !rosters[g.hub.id]" class="py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 class="h-3 w-3 animate-spin" /> 직원 목록을 불러오는 중…
              </div>
              <template v-else>
                <div v-for="grp in bucketsOf(g.hub.id)" :key="grp.label">
                  <div class="text-[10px] font-semibold uppercase tracking-wider mb-1 inline-flex items-center gap-1" :class="grp.tone">
                    <component :is="grp.icon" class="h-3 w-3" />
                    {{ grp.label }} · {{ grp.list.length }}명
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="p in grp.list" :key="p.id"
                      class="px-1.5 py-0.5 rounded text-[11px] transition-colors hover:ring-1 hover:ring-primary/40"
                      :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                      @mouseenter="onHover(p, $event)"
                      @mouseleave="onLeave"
                      @click="openPerson(p, $event)"
                    >
                      {{ p.full_name }}<span class="opacity-70"> · {{ p.position_ko }}</span>
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Satellites under this hub -->
          <div v-if="g.satellites.length > 0" class="mt-3 ml-6 pl-4 border-l-2 border-primary/20 space-y-3">
            <div class="text-xs text-muted-foreground flex items-center gap-1 -ml-7 mt-1">
              <Layers class="h-3.5 w-3.5 text-primary/60" />
              <span class="font-medium">{{ g.satellites.length }}개 위성센터</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="sat in g.satellites"
                :key="sat.id"
                class="text-left rounded-xl border bg-card hover:border-primary hover:shadow-sm transition-all p-3 group"
              >
                <div class="flex items-center gap-2 mb-2">
                  <Building2 class="h-3.5 w-3.5 text-muted-foreground cursor-pointer" @click="openBranch(sat.id)" />
                  <div class="font-medium text-sm flex-1 cursor-pointer" @click="openBranch(sat.id)">{{ sat.name }}</div>
                  <span class="text-[9px] font-semibold uppercase tracking-wider rounded px-1 py-0.5 bg-muted text-muted-foreground">Sat</span>
                  <button
                    type="button"
                    class="h-6 w-6 rounded border border-input bg-background inline-flex items-center justify-center hover:bg-muted"
                    :title="expanded[sat.id] ? '직원 목록 접기' : '직원 전체 목록 보기'"
                    @click="toggleBranch(sat.id, sat.id, $event)"
                  >
                    <Loader2 v-if="rosterLoad[sat.id]" class="h-3 w-3 animate-spin" />
                    <ChevronDown v-else-if="expanded[sat.id]" class="h-3 w-3" />
                    <ChevronRight v-else class="h-3 w-3" />
                  </button>
                </div>
                <div class="text-[11px] text-muted-foreground mb-1.5 cursor-pointer" @click="openBranch(sat.id)">
                  <Users class="h-3 w-3 inline-block mr-0.5" />
                  {{ summaryByBranch.get(sat.id)?.total ?? 0 }}명
                </div>
                <!-- Satellite leader names (usually 1: 센터장) -->
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="p in summaryByBranch.get(sat.id)?.leaders ?? []"
                    :key="p.id"
                    class="px-1.5 py-0.5 rounded text-[10px] transition-colors hover:ring-1 hover:ring-primary/40"
                    :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                    @mouseenter="onHover(p, $event)"
                    @mouseleave="onLeave"
                    @click="openPerson(p, $event)"
                  >
                    {{ p.full_name }} · {{ p.position_ko }}
                  </button>
                </div>

                <!-- Expanded satellite roster -->
                <div v-if="expanded[sat.id]" class="mt-2 pt-2 border-t border-border/60 space-y-2">
                  <div v-if="rosterLoad[sat.id] && !rosters[sat.id]" class="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 class="h-3 w-3 animate-spin" /> 불러오는 중…
                  </div>
                  <template v-else>
                    <div v-for="grp in bucketsOf(sat.id)" :key="grp.label">
                      <div class="text-[9px] font-semibold uppercase tracking-wider mb-0.5 inline-flex items-center gap-1" :class="grp.tone">
                        <component :is="grp.icon" class="h-2.5 w-2.5" />
                        {{ grp.label }} · {{ grp.list.length }}
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <button
                          v-for="p in grp.list" :key="p.id"
                          class="px-1.5 py-0.5 rounded text-[10px] transition-colors hover:ring-1 hover:ring-primary/40"
                          :class="employmentTone[p.employment_type] ?? 'bg-muted'"
                          @mouseenter="onHover(p, $event)"
                          @mouseleave="onLeave"
                          @click="openPerson(p, $event)"
                        >
                          {{ p.full_name }}
                        </button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
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
                {{ summaryByBranch.get(sat.id)?.total ?? 0 }}명
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- 본사 직원 추가 dialog (HQ-only) -->
      <HqAddDialog v-model:open="showHqAdd" @created="onHqCreated" />

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
            </dl>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>
