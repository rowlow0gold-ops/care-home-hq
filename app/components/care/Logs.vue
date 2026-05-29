<script setup lang="ts">
import { AlertTriangle, ClipboardList, Search, Loader2, ChevronLeft, ChevronRight, Building2, Download } from "@lucide/vue";

// HQ sees all branches; everyone else is pinned to their own.
const { me } = useAuth();
const isHq = computed(
  () => me.value?.role === "hq" || me.value?.role === "super_admin",
);

interface Branch { id: string; name: string }
interface CareLogRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  branch_name: string | null;
  resident_id: string;
  resident_name: string;
  resident_room: string | null;
  recorded_by: string;
  recorded_at: string;
  category: string;
  body: string;
  flagged: boolean;
}
interface PagedCareLogs {
  items: CareLogRow[];
  total: number;
  page: number;
  page_size: number;
}

const api = useApi();
const categories = ["식사", "투약", "배설", "위생", "활동", "이상징후", "기타"];

// Read initial filters from URL query (so dashboard KPI cards can deep-link).
const route = useRoute();
const initialFlagged = route.query.flagged === "true";
const initialBranch  =
  typeof route.query.branch === "string" && route.query.branch.length > 0
    ? route.query.branch
    : useDefaultBranch();

// Draft filter values (committed only on 검색 click / Enter)
const onlyFlagged = ref(initialFlagged);
const categoryFilter = ref<string>("");
const branchFilter = ref<string>(initialBranch);
const q = ref("");

// Applied filter values drive the server fetch
const appliedFlagged = ref(onlyFlagged.value);
const appliedCategory = ref(categoryFilter.value);
const appliedBranch = ref(branchFilter.value);
const appliedQ = ref("");

const page = ref(1);
const pageSize = ref(50);

function applyFilters() {
  appliedFlagged.value = onlyFlagged.value;
  appliedCategory.value = categoryFilter.value;
  appliedBranch.value = branchFilter.value;
  appliedQ.value = q.value.trim();
  page.value = 1;
}

const { data: dashboard } = await useAsyncData("care-log-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: paged, pending, error, refresh } = await useAsyncData(
  "care-logs-paged",
  () =>
    api.get<PagedCareLogs>("/v1/care-logs/paged", {
      q: appliedQ.value || undefined,
      branch_id: appliedBranch.value || undefined,
      category: appliedCategory.value || undefined,
      flagged_only: appliedFlagged.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    }),
  { watch: [appliedQ, appliedBranch, appliedCategory, appliedFlagged, page, pageSize] },
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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// 내보내기 — 현재 적용된 필터 그대로 케어기록 XLSX 다운로드
const exportingXlsx = ref(false);
const exportToast = useToast();
async function onExportXlsx() {
  if (exportingXlsx.value) return;
  exportingXlsx.value = true;
  try {
    const qs = new URLSearchParams();
    if (appliedQ.value)        qs.set("q", appliedQ.value);
    if (appliedBranch.value)   qs.set("branch_id", appliedBranch.value);
    if (appliedCategory.value) qs.set("category", appliedCategory.value);
    if (appliedFlagged.value)  qs.set("flagged_only", "true");
    const res = await fetch(`/api/v1/care-logs/export.xlsx?${qs.toString()}`, { credentials: "include" });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fallback = `케어기록_${stamp}.xlsx`;
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
</script>

<template>
  <div>
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="어르신 이름 또는 내용 검색"
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
          title="본인 소속 지점만 조회할 수 있습니다"
        >
          <Building2 class="h-3.5 w-3.5 text-primary" />
          <span class="font-medium">
            {{ dashboard?.branches?.find((b) => b.id === branchFilter)?.name ?? '내 지점' }}
          </span>
        </div>
        <select
          v-model="categoryFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 카테고리</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <label class="flex items-center gap-2 text-sm cursor-pointer px-3 h-10 rounded-lg border bg-background hover:bg-muted/40 transition-colors">
          <input v-model="onlyFlagged" type="checkbox" class="rounded border-input">
          이상징후만
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

      <div v-if="pending && !paged" class="py-12 text-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
      <div v-else-if="error" class="py-12 text-center text-sm text-destructive">
        목록을 불러오지 못했습니다.
        <button class="underline ml-2" @click="refresh()">다시 시도</button>
      </div>
      <ul v-else-if="(paged?.items?.length ?? 0) > 0" class="divide-y">
        <li
          v-for="log in paged?.items ?? []"
          :key="log.id"
          class="px-6 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
        >
          <AlertTriangle
            v-if="log.flagged"
            class="h-4 w-4 text-destructive flex-shrink-0 mt-1"
          />
          <ClipboardList v-else class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="font-medium text-sm">{{ log.resident_name }}</span>
              <span v-if="log.branch_name" class="text-xs text-muted-foreground">· {{ log.branch_name }}</span>
              <span class="text-xs font-medium uppercase text-muted-foreground">{{ log.category }}</span>
              <span class="text-xs text-muted-foreground">{{ fmtTime(log.recorded_at) }}</span>
              <span
                v-if="log.flagged"
                class="text-[10px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 rounded px-1.5 py-0.5"
              >
                이상징후
              </span>
            </div>
            <p class="text-sm mt-0.5 whitespace-pre-wrap">{{ log.body }}</p>
          </div>
        </li>
      </ul>
      <div v-else class="py-12 text-center text-sm text-muted-foreground">
        <ClipboardList class="h-10 w-10 mx-auto mb-3 opacity-30" />
        조건에 맞는 기록이 없습니다.
      </div>

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
