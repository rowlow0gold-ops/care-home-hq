<script setup lang="ts">
import {
  Pill, Search, Loader2, ChevronLeft, ChevronRight,
  Building2, MapPin, AlertCircle, Download,
} from "@lucide/vue";

// HQ sees all branches; everyone else is pinned to their own.
const { me } = useAuth();
const isHq = computed(
  () => me.value?.role === "hq" || me.value?.role === "super_admin",
);

interface Branch { id: string; name: string }
interface MedicationRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  branch_name: string | null;
  resident_id: string;
  resident_name: string;
  resident_room: string | null;
  name: string;
  dosage: string;
  frequency: string;
  route: string | null;
  start_date: string;
  end_date: string | null;
  prescriber: string | null;
  instructions: string | null;
  is_active: boolean;
}
interface PagedMedications {
  items: MedicationRow[];
  total: number;
  page: number;
  page_size: number;
}

const api = useApi();

// Draft filters (committed only on 검색)
const showStopped = ref(false);
const branchFilter = ref<string>(useDefaultBranch());
const search = ref("");
// Applied
const appliedShowStopped = ref(showStopped.value);
const appliedBranch = ref(branchFilter.value);
const appliedSearch = ref("");

const page = ref(1);
const pageSize = ref(50);

function applyFilters() {
  appliedShowStopped.value = showStopped.value;
  appliedBranch.value = branchFilter.value;
  appliedSearch.value = search.value.trim();
  page.value = 1;
}

const { data: dashboard } = await useAsyncData("med-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: paged, pending, error, refresh } = await useAsyncData(
  "medications-paged",
  () =>
    api.get<PagedMedications>("/v1/medications/paged", {
      q: appliedSearch.value || undefined,
      branch_id: appliedBranch.value || undefined,
      include_stopped: appliedShowStopped.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    }),
  { watch: [appliedSearch, appliedBranch, appliedShowStopped, page, pageSize] },
);

const totalPages = computed(() =>
  Math.max(1, Math.ceil((paged.value?.total ?? 0) / pageSize.value)),
);
const showingFrom = computed(() =>
  paged.value && paged.value.total > 0 ? (page.value - 1) * pageSize.value + 1 : 0,
);
const showingTo = computed(() =>
  paged.value ? Math.min(page.value * pageSize.value, paged.value.total) : 0,
);

// Frequency label — qd/bid/tid/qid/prn → 하루 N회 / 필요시
const FREQ_KO: Record<string, string> = {
  qd:  "하루 1회",
  bid: "하루 2회",
  tid: "하루 3회",
  qid: "하루 4회",
  prn: "필요시",
};
function freqLabel(f: string) {
  return FREQ_KO[f.toLowerCase()] ?? f;
}
// 내보내기 — 현재 적용된 필터로 투약목록 XLSX 다운로드
const exportingXlsx = ref(false);
const exportToast = useToast();
async function onExportXlsx() {
  if (exportingXlsx.value) return;
  exportingXlsx.value = true;
  try {
    const qs = new URLSearchParams();
    if (appliedSearch.value)      qs.set("q", appliedSearch.value);
    if (appliedBranch.value)      qs.set("branch_id", appliedBranch.value);
    if (appliedShowStopped.value) qs.set("include_stopped", "true");
    const res = await fetch(`/api/v1/medications/export.xlsx?${qs.toString()}`, { credentials: "include" });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fallback = `투약목록_${stamp}.xlsx`;
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m  = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="([^"]+)"/i.exec(cd);
    const filename = m ? decodeURIComponent(m[1]) : fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    exportToast.error(e?.message ?? "다운로드 실패", "내보내기 실패");
  } finally {
    exportingXlsx.value = false;
  }
}

const ROUTE_KO: Record<string, string> = {
  oral:        "경구",
  injection:   "주사",
  topical:     "외용",
  inhalation:  "흡입",
  sublingual:  "설하",
  rectal:      "직장",
};
function routeLabel(r: string | null) {
  if (!r) return "—";
  return ROUTE_KO[r.toLowerCase()] ?? r;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return s.length >= 10 ? s.slice(0, 10) : s;
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <div class="relative flex-1 min-w-[220px] max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="어르신 / 약품명 / 처방의 검색"
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
        title="본인 소속 지점 투약만 조회할 수 있습니다"
      >
        <Building2 class="h-3.5 w-3.5 text-primary" />
        <span class="font-medium">
          {{ dashboard?.branches?.find((b) => b.id === branchFilter)?.name ?? '내 지점' }}
        </span>
      </div>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input v-model="showStopped" type="checkbox" class="rounded border-input">
        중단된 처방 포함
      </label>
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
        <span class="text-xs text-muted-foreground tabular-nums">
          {{ showingFrom }}–{{ showingTo }} / {{ paged?.total ?? 0 }}건
        </span>
        <button
          type="button"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-60"
          :disabled="exportingXlsx"
          @click="onExportXlsx"
        >
          <Loader2 v-if="exportingXlsx" class="h-4 w-4 animate-spin" />
          <Download v-else class="h-4 w-4" />
          내보내기
        </button>
      </div>
    </div>

    <div class="rounded-xl border bg-card overflow-hidden">
      <div v-if="pending && !paged" class="py-12 text-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
      <div v-else-if="error" class="py-12 text-center text-sm text-destructive">
        <AlertCircle class="h-8 w-8 mx-auto mb-2" />
        목록을 불러오지 못했습니다.
        <button class="underline ml-2" @click="refresh()">다시 시도</button>
      </div>
      <div v-else-if="(paged?.items?.length ?? 0) === 0" class="py-12 text-center text-sm text-muted-foreground">
        <Pill class="h-10 w-10 mx-auto mb-3 opacity-30" />
        조건에 맞는 처방이 없습니다.
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">어르신</th>
            <th class="py-3 px-3 font-medium">약품</th>
            <th class="py-3 px-3 font-medium">용량</th>
            <th class="py-3 px-3 font-medium">횟수</th>
            <th class="py-3 px-3 font-medium">경로</th>
            <th class="py-3 px-3 font-medium">처방의</th>
            <th class="py-3 px-3 font-medium">시작일</th>
            <th class="py-3 px-6 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in paged?.items ?? []"
            :key="m.id"
            class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
            :class="!m.is_active ? 'opacity-60' : ''"
            @click="navigateTo(`/residents/${m.resident_id}`)"
          >
            <td class="py-3 px-6">
              <div class="font-medium">{{ m.resident_name }}</div>
              <div class="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin class="h-3 w-3" />
                <template v-if="m.resident_room">{{ m.resident_room }}호 ·</template>
                {{ m.branch_name ?? '—' }}
              </div>
            </td>
            <td class="py-3 px-3">
              <div class="font-medium" :class="!m.is_active ? 'line-through' : ''">{{ m.name }}</div>
              <div v-if="m.instructions" class="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[14rem]" :title="m.instructions">
                {{ m.instructions }}
              </div>
            </td>
            <td class="py-3 px-3 tabular-nums">{{ m.dosage }}</td>
            <td class="py-3 px-3 text-xs">{{ freqLabel(m.frequency) }}</td>
            <td class="py-3 px-3 text-xs">{{ routeLabel(m.route) }}</td>
            <td class="py-3 px-3 text-xs text-muted-foreground">{{ m.prescriber ?? '—' }}</td>
            <td class="py-3 px-3 text-xs text-muted-foreground tabular-nums">{{ fmtDate(m.start_date) }}</td>
            <td class="py-3 px-6">
              <span
                v-if="m.is_active"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary"
              >
                투약 중
              </span>
              <span
                v-else
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground"
              >
                중단됨
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div
        v-if="(paged?.total ?? 0) > 0"
        class="px-6 py-3 border-t flex items-center justify-between text-sm"
      >
        <div class="text-xs text-muted-foreground">
          페이지 {{ paged?.page ?? 1 }} / {{ totalPages }}
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model.number="pageSize"
            class="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary"
          >
            <option :value="25">25/page</option>
            <option :value="50">50/page</option>
            <option :value="100">100/page</option>
            <option :value="200">200/page</option>
          </select>
          <button
            type="button"
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page <= 1"
            @click="page--"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button
            type="button"
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
