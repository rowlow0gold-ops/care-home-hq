<script setup lang="ts">
import { Search, MapPin, ChevronLeft, ChevronRight, ArrowUpDown, Loader2, Building2, Download } from "@lucide/vue";

// HQ sees all branches; everyone else is pinned to their own.
const { me } = useAuth();
const isHq = computed(
  () => me.value?.role === "hq" || me.value?.role === "super_admin",
);

interface Resident {
  id: string;
  tenant_id: string;
  branch_id: string;
  full_name: string;
  sex: "male" | "female" | "other";
  birth_date: string;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string;
  status: "active" | "discharged" | "deceased";
}
interface PagedResidents { items: Resident[]; total: number; page: number; page_size: number }
interface Branch { id: string; name: string }

const api = useApi();

// Allow dashboard KPI cards (or any other deep link) to pre-select a branch
// via ?branch=ID.
const route = useRoute();
const initialBranch =
  typeof route.query.branch === "string" && route.query.branch.length > 0
    ? route.query.branch
    : useDefaultBranch();

// Draft filters (what the user is editing). Committed to `applied*` only when
// 검색 is clicked (or Enter is pressed in the search input).
const q = ref("");
const branchFilter = ref<string>(initialBranch);
const gradeFilter = ref<string>("");
const statusFilter = ref<string>("active");
// Applied filters — these drive the server-side fetch.
const appliedQ = ref(q.value);
const appliedBranch = ref(branchFilter.value);
const appliedGrade = ref(gradeFilter.value);
const appliedStatus = ref(statusFilter.value);

const page = ref(1);
const pageSize = ref(25);
const sortBy = ref<"full_name" | "admitted_on" | "care_grade" | "room_number">("full_name");
const sortDesc = ref(false);

function applyFilters() {
  appliedQ.value = q.value.trim();
  appliedBranch.value = branchFilter.value;
  appliedGrade.value = gradeFilter.value;
  appliedStatus.value = statusFilter.value;
  page.value = 1;
}

// Sort changes still reset to page 1 (they re-fetch immediately).
watch([sortBy, sortDesc], () => { page.value = 1; });

const { data: dashboard } = await useAsyncData("res-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: paged, pending, error, refresh } = await useAsyncData(
  "residents-paged",
  () => api.get<PagedResidents>("/v1/residents/paged", {
    q: appliedQ.value || undefined,
    branch_id: appliedBranch.value || undefined,
    care_grade: appliedGrade.value || undefined,
    status: appliedStatus.value || undefined,
    page: page.value,
    page_size: pageSize.value,
    sort_by: sortBy.value,
    sort_desc: sortDesc.value,
  }),
  { watch: [appliedQ, appliedBranch, appliedGrade, appliedStatus, page, pageSize, sortBy, sortDesc] },
);

const branchById = computed(() => {
  const m = new Map<string, string>();
  for (const b of dashboard.value?.branches ?? []) m.set(b.id, b.name);
  return m;
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil((paged.value?.total ?? 0) / pageSize.value)),
);
const showingFrom = computed(() => paged.value && paged.value.total > 0 ? (page.value - 1) * pageSize.value + 1 : 0);
const showingTo = computed(() => paged.value
  ? Math.min(page.value * pageSize.value, paged.value.total)
  : 0,
);

function setSort(col: typeof sortBy.value) {
  if (sortBy.value === col) sortDesc.value = !sortDesc.value;
  else { sortBy.value = col; sortDesc.value = false; }
}

const sexLabel: Record<Resident["sex"], string> = { male: "남", female: "여", other: "기타" };
const statusLabel: Record<Resident["status"], string> = {
  active: "재원", discharged: "퇴소", deceased: "사망",
};
const statusTone: Record<Resident["status"], string> = {
  active: "bg-primary/10 text-primary",
  discharged: "bg-muted text-muted-foreground",
  deceased: "bg-destructive/10 text-destructive",
};

function gradeLabel(g: string | null) {
  if (!g) return "—";
  if (g === "cognitive_support") return "인지지원";
  return g + "등급";
}

function age(birth: string) {
  const b = new Date(birth);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

// 내보내기 — 현재 활성 어르신 명단을 XLSX로 다운로드 (Nuxt proxy → care-home-server)
//
// 일괄 등록 (가져오기) 은 데스크톱 (Tauri) 앱에서 처리합니다 — 본 웹은
// 본사가 빠르게 조회/소량 수정하는 용도. 시설 운영자는 데스크톱에서 명단 업로드.
const exportingXlsx = ref(false);
const toast = useToast();
async function onExportXlsx() {
  if (exportingXlsx.value) return;
  exportingXlsx.value = true;
  try {
    const res = await fetch("/api/v1/residents/export.xlsx", { credentials: "include" });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fallback = `어르신_명단_${stamp}.xlsx`;
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
    toast.error(e?.message ?? "다운로드 실패", "다운로드 실패");
  } finally {
    exportingXlsx.value = false;
  }
}
</script>

<template>
  <div>
    <div class="rounded-xl border bg-card overflow-hidden">
      <!-- Filter bar -->
      <div class="px-6 py-4 border-b flex flex-wrap gap-3 items-center">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="이름 또는 호실 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            @keyup.enter="applyFilters"
          >
        </div>
        <select
          v-if="isHq"
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <div
          v-else
          class="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border bg-muted/30 text-sm"
          title="본인 소속 지점 어르신만 조회할 수 있습니다"
        >
          <Building2 class="h-3.5 w-3.5 text-primary" />
          <span class="font-medium">
            {{ dashboard?.branches?.find((b) => b.id === branchFilter)?.name ?? '내 지점' }}
          </span>
        </div>
        <select
          v-model="gradeFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 등급</option>
          <option value="1">1등급</option>
          <option value="2">2등급</option>
          <option value="3">3등급</option>
          <option value="4">4등급</option>
          <option value="5">5등급</option>
          <option value="cognitive_support">인지지원</option>
        </select>
        <select
          v-model="statusFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="active">재원중</option>
          <option value="discharged">퇴소</option>
          <option value="deceased">사망</option>
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
        <div class="ml-auto flex items-center gap-2">
          <span class="text-xs text-muted-foreground tabular-nums mr-2">
            {{ showingFrom }}–{{ showingTo }} / {{ paged?.total ?? 0 }}명
          </span>
          <!-- HQ-only: 엑셀 내보내기 / 가져오기 (single-add form는 의도적으로 제거) -->
          <button
            type="button"
            class="h-10 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-60"
            :disabled="exportingXlsx"
            @click="onExportXlsx"
          >
            <Loader2 v-if="exportingXlsx" class="h-4 w-4 animate-spin" />
            <Download v-else class="h-4 w-4" />
            다운로드
          </button>
        </div>
      </div>

      <div v-if="error" class="py-12 text-center text-sm text-destructive">
        목록을 불러오지 못했습니다.
        <button class="underline ml-2" @click="refresh()">다시 시도</button>
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30 select-none">
            <th class="py-3 px-6 font-medium cursor-pointer hover:text-foreground" @click="setSort('full_name')">
              <span class="inline-flex items-center gap-1">이름 <ArrowUpDown class="h-3 w-3 opacity-50" /></span>
            </th>
            <th class="py-3 px-3 font-medium">지점</th>
            <th class="py-3 px-3 font-medium cursor-pointer hover:text-foreground" @click="setSort('room_number')">
              <span class="inline-flex items-center gap-1">호실 <ArrowUpDown class="h-3 w-3 opacity-50" /></span>
            </th>
            <th class="py-3 px-3 font-medium">성별</th>
            <th class="py-3 px-3 font-medium text-right">나이</th>
            <th class="py-3 px-3 font-medium text-right cursor-pointer hover:text-foreground" @click="setSort('care_grade')">
              <span class="inline-flex items-center gap-1 justify-end">장기요양 <ArrowUpDown class="h-3 w-3 opacity-50" /></span>
            </th>
            <th class="py-3 px-3 font-medium cursor-pointer hover:text-foreground" @click="setSort('admitted_on')">
              <span class="inline-flex items-center gap-1">입소일 <ArrowUpDown class="h-3 w-3 opacity-50" /></span>
            </th>
            <th class="py-3 px-6 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          <!-- Skeleton rows on initial load (no data yet) -->
          <template v-if="pending && !paged">
            <tr v-for="i in 8" :key="`sk-${i}`" class="border-t">
              <td class="py-3 px-6"><Skeleton w="6rem" /></td>
              <td class="py-3 px-3"><Skeleton w="5rem" /></td>
              <td class="py-3 px-3"><Skeleton w="3rem" /></td>
              <td class="py-3 px-3"><Skeleton w="1.5rem" /></td>
              <td class="py-3 px-3 text-right"><Skeleton w="2rem" class="ml-auto" /></td>
              <td class="py-3 px-3 text-right"><Skeleton w="3rem" class="ml-auto" /></td>
              <td class="py-3 px-3"><Skeleton w="5rem" /></td>
              <td class="py-3 px-6"><Skeleton w="3rem" /></td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="r in paged?.items ?? []"
              :key="r.id"
              class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
              @click="navigateTo(`/residents/${r.id}`)"
            >
              <td class="py-3 px-6 font-medium">{{ r.full_name }}</td>
              <td class="py-3 px-3">
                <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin class="h-3 w-3" />
                  {{ branchById.get(r.branch_id) ?? "—" }}
                </div>
              </td>
              <td class="py-3 px-3 text-muted-foreground tabular-nums">{{ r.room_number ?? "—" }}</td>
              <td class="py-3 px-3">{{ sexLabel[r.sex] }}</td>
              <td class="py-3 px-3 text-right tabular-nums">{{ age(r.birth_date) }}세</td>
              <td class="py-3 px-3 text-right">{{ gradeLabel(r.care_grade) }}</td>
              <td class="py-3 px-3 text-muted-foreground text-xs tabular-nums">{{ r.admitted_on }}</td>
              <td class="py-3 px-6">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="statusTone[r.status]">
                  {{ statusLabel[r.status] }}
                </span>
              </td>
            </tr>
            <tr v-if="(paged?.items ?? []).length === 0">
              <td colspan="8" class="py-12 text-center text-muted-foreground">
                조건에 맞는 결과가 없습니다.
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="px-6 py-3 border-t flex items-center justify-between text-sm">
        <div class="text-xs text-muted-foreground">
          페이지 {{ paged?.page ?? 1 }} / {{ totalPages }}
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model.number="pageSize"
            class="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary"
          >
            <option :value="10">10/page</option>
            <option :value="25">25/page</option>
            <option :value="50">50/page</option>
            <option :value="100">100/page</option>
          </select>
          <button
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page <= 1"
            @click="page--"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page >= totalPages"
            @click="page++"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
