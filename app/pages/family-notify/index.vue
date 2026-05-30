<script setup lang="ts">
/**
 * /family-notify — paginated resident table for the monthly batch picker.
 *
 * Matches the residents / staff / 보고서 pattern:
 *   filter bar (search + month + branch + status + Search button)
 *   → paginated table (25/page)
 *   → click row → /family-notify/[resident_id] photo picker
 * Bulk 발송 (N건) lives in the filter bar — fires every picked photo
 * matching the active filter.
 */
import {
  Send, Camera, Building2, Loader2, Search, Calendar, X,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Wand2, Eye,
} from "@lucide/vue";

useHead({ title: "가족 알림 · 케어닥 HQ" });

interface ResidentBatchRow {
  resident_id:     string;
  resident_name:   string;
  branch_id:       string;
  branch_name:     string;
  candidate_count: number;
  picked_count:    number;
  sent_count:      number;
  last_sent_month: string | null;
}
interface PickerPagedResponse {
  items:        ResidentBatchRow[];
  total:        number;
  total_picked: number;
  page:         number;
  page_size:    number;
}
interface Branch { id: string; name: string; branch_type: "hub" | "satellite" }

const api    = useApi();
const router = useRouter();
const toast  = useToast();

// ── Filter bar (draft → applied on Search click). Defaults to THIS month
// (the upcoming send batch is reserved during the prior month; default to
// what HQ would naturally be working on right now).
const now = new Date();
const yearOptions  = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

const year   = ref<number>(now.getFullYear());
const month  = ref<number>(now.getMonth() + 1);
const branch = ref<string>("");
const status = ref<string>("");
const q      = ref<string>("");

const appliedYear   = ref(year.value);
const appliedMonth  = ref(month.value);
const appliedBranch = ref(branch.value);
const appliedStatus = ref(status.value);
const appliedQ      = ref(q.value);

const appliedMonthStr = computed(() =>
  `${appliedYear.value}-${String(appliedMonth.value).padStart(2, "0")}`,
);

const page     = ref(1);
const pageSize = ref(25);

function applyFilters() {
  appliedYear.value   = year.value;
  appliedMonth.value  = month.value;
  appliedBranch.value = branch.value;
  appliedStatus.value = status.value;
  appliedQ.value      = q.value.trim();
  page.value = 1;
}

const { data: dashboard } = await useAsyncData("fam-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: paged, pending, error, refresh } = await useAsyncData(
  "family-picker-paged",
  () => api.get<PickerPagedResponse>("/v1/photos/picker/paged", {
    month:     appliedMonthStr.value,
    branch_id: appliedBranch.value || undefined,
    q:         appliedQ.value || undefined,
    status:    appliedStatus.value || undefined,
    page:      page.value,
    page_size: pageSize.value,
  }),
  { watch: [appliedYear, appliedMonth, appliedBranch, appliedStatus, appliedQ, page, pageSize] },
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

// Refresh whenever the user returns to this page (e.g. after picking on
// the detail page). Without this, total_picked stays stale and the
// 발송 button can look like it's "not activated" after a successful pick.
onActivated(refresh);
if (process.client) {
  watch(() => useRoute().fullPath, (path) => {
    if (path.startsWith("/family-notify") && !path.includes("/family-notify/")) {
      refresh();
    }
  });
}

// 자동 선택 — reserve N random photos per resident across the filter.
// Count is user-configurable (1–8 — matches the per-month cap).
const autoCount   = ref(3);
const autoPicking = ref(false);
async function autoPickAll() {
  if (autoPicking.value) return;
  autoPicking.value = true;
  try {
    const r = await api.post<{ picked: number }>("/v1/photos/auto-pick", {
      month:     appliedMonthStr.value,
      branch_id: appliedBranch.value || undefined,
      count:     autoCount.value,
    });
    toast.success(`${r.picked}장 자동 예약 완료`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "자동 선택 실패", "오류");
  } finally {
    autoPicking.value = false;
  }
}

// 체크 — modal showing every picked photo for the active filter.
interface PickedPhoto {
  id:            string;
  resident_id:   string;
  resident_name: string;
  branch_name:   string;
  taken_at:      string;
  caption:       string | null;
  data_url:      string;
}
const checkOpen   = ref(false);
const checkLoading = ref(false);
const checkPhotos = ref<PickedPhoto[]>([]);
async function openCheck() {
  checkOpen.value = true;
  checkLoading.value = true;
  try {
    checkPhotos.value = await api.get<PickedPhoto[]>("/v1/photos/picked-list", {
      month:     appliedMonthStr.value,
      branch_id: appliedBranch.value || undefined,
    });
  } catch (e: any) {
    toast.error(e?.data?.message ?? "불러오기 실패", "오류");
    checkOpen.value = false;
  } finally {
    checkLoading.value = false;
  }
}
function gotoFromCheck(rid: string) {
  checkOpen.value = false;
  router.push(`/family-notify/${rid}?month=${appliedMonthStr.value}`);
}

// 발송 all — fire every picked photo across the whole filtered set
const sending = ref(false);
async function sendBatchNow() {
  if (sending.value) return;
  const n = paged.value?.total_picked ?? 0;
  if (n === 0) {
    toast.error("선택된 사진이 없습니다", "알림");
    return;
  }
  if (!confirm(`${n}건의 사진을 가족 Telegram으로 즉시 발송합니다. 진행하시겠습니까?`)) return;
  sending.value = true;
  try {
    const r = await api.post<{ queued: number }>("/v1/photos/send-batch", {
      month:     appliedMonthStr.value,
      branch_id: appliedBranch.value || undefined,
    });
    toast.success(`${r.queued}건 발송 요청 완료`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "발송 실패", "오류");
  } finally {
    sending.value = false;
  }
}

function openResident(rid: string) {
  router.push(
    `/family-notify/${rid}?month=${appliedMonthStr.value}`,
  );
}

const pickedTone = (n: number) =>
  n === 0
    ? "bg-muted text-muted-foreground"
    : n < 3
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
      : "bg-primary/10 text-primary";
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-2">
        <Send class="h-7 w-7 text-primary" />
        가족 알림
      </h1>
    </header>

    <div class="rounded-xl border bg-card overflow-hidden">
      <!-- Filter bar -->
      <div class="px-6 py-4 border-b flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="어르신 이름 또는 지점 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            @keyup.enter="applyFilters"
          >
        </div>

        <Calendar class="h-4 w-4 text-muted-foreground" />
        <select
          v-model.number="year"
          class="h-10 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}년</option>
        </select>
        <select
          v-model.number="month"
          class="h-10 w-20 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}월</option>
        </select>

        <select
          v-model="branch"
          class="h-10 w-48 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <optgroup label="광역센터 (Hub)">
            <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'hub')"
                    :key="b.id" :value="b.id">{{ b.name }}</option>
          </optgroup>
          <optgroup label="위성센터 (Satellite)">
            <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'satellite')"
                    :key="b.id" :value="b.id">{{ b.name }}</option>
          </optgroup>
        </select>

        <select
          v-model="status"
          class="h-10 w-32 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 상태</option>
          <option value="pending">미선택</option>
          <option value="reserved">예약중</option>
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

        <div class="ml-auto flex items-center gap-2 flex-wrap">
          <span class="text-xs text-muted-foreground tabular-nums">
            {{ showingFrom }}–{{ showingTo }} / 총 {{ paged?.total ?? 0 }}명
          </span>

          <!-- Auto-pick: count select + button (split per request). -->
          <div class="inline-flex items-center rounded-lg border border-input bg-background overflow-hidden">
            <select
              v-model.number="autoCount"
              class="h-10 px-2 text-sm bg-transparent border-r border-input focus:outline-none focus:bg-muted/40"
              title="자동 선택 장수"
            >
              <option v-for="n in 8" :key="n" :value="n">{{ n }}장</option>
            </select>
            <button
              type="button"
              class="h-10 px-3 text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
              :disabled="autoPicking"
              title="이달 후보 중 무작위 자동 예약"
              @click="autoPickAll"
            >
              <Loader2 v-if="autoPicking" class="h-4 w-4 animate-spin" />
              <Wand2 v-else class="h-4 w-4" />
              자동 선택
            </button>
          </div>

          <!-- 체크 — preview every photo currently picked. -->
          <button
            type="button"
            class="h-10 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
            :disabled="(paged?.total_picked ?? 0) === 0"
            @click="openCheck"
          >
            <Eye class="h-4 w-4" />
            체크 ({{ paged?.total_picked ?? 0 }})
          </button>

          <button
            type="button"
            class="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
            :disabled="sending || (paged?.total_picked ?? 0) === 0"
            @click="sendBatchNow"
          >
            <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
            <Send v-else class="h-4 w-4" />
            발송 ({{ paged?.total_picked ?? 0 }}건)
          </button>
        </div>
      </div>

      <!-- Table -->
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">어르신</th>
            <th class="py-3 px-3 font-medium">지점</th>
            <th class="py-3 px-3 font-medium text-right">이달 후보</th>
            <th class="py-3 px-3 font-medium text-right">예약</th>
            <th class="py-3 px-3 font-medium text-right">마지막 발송</th>
            <th class="py-3 px-6 font-medium text-right">선택</th>
          </tr>
        </thead>
        <tbody v-if="pending && !paged">
          <tr v-for="i in 8" :key="`sk-${i}`" class="border-t">
            <td class="py-3 px-6"><Skeleton w="6rem" /></td>
            <td class="py-3 px-3"><Skeleton w="7rem" /></td>
            <td class="py-3 px-3 text-right"><Skeleton w="2rem" class="ml-auto" /></td>
            <td class="py-3 px-3 text-right"><Skeleton w="2rem" class="ml-auto" /></td>
            <td class="py-3 px-3 text-right"><Skeleton w="3rem" class="ml-auto" /></td>
            <td class="py-3 px-6 text-right"><Skeleton w="4rem" class="ml-auto" /></td>
          </tr>
        </tbody>
        <tbody v-else-if="error">
          <tr><td colspan="6" class="py-12 text-center text-destructive">
            <AlertCircle class="h-8 w-8 mx-auto mb-2" />
            불러오기 실패
            <button class="underline ml-2" @click="refresh()">다시 시도</button>
          </td></tr>
        </tbody>
        <tbody v-else>
          <tr
            v-for="r in paged?.items ?? []"
            :key="r.resident_id"
            class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
            @click="openResident(r.resident_id)"
          >
            <td class="py-3 px-6">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {{ r.resident_name.charAt(0) }}
                </div>
                <span class="font-medium">{{ r.resident_name }}</span>
              </div>
            </td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 class="h-3 w-3" />
                {{ r.branch_name }}
              </div>
            </td>
            <td class="py-3 px-3 text-right tabular-nums">{{ r.candidate_count }}</td>
            <td class="py-3 px-3 text-right">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                :class="pickedTone(r.picked_count)"
              >
                <CheckCircle2 v-if="r.picked_count >= 3" class="h-3 w-3" />
                {{ r.picked_count }} / 3
              </span>
            </td>
            <td class="py-3 px-3 text-right text-xs text-muted-foreground tabular-nums">
              {{ r.last_sent_month ?? "—" }}
            </td>
            <td class="py-3 px-6 text-right">
              <span class="text-xs text-primary hover:underline">사진 선택 →</span>
            </td>
          </tr>
          <tr v-if="(paged?.items?.length ?? 0) === 0">
            <td colspan="6" class="py-12 text-center text-muted-foreground">
              <Camera class="h-10 w-10 mx-auto mb-3 opacity-30" />
              조건에 맞는 어르신이 없습니다.
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 체크 modal: every picked photo across the active filter. Click a
           photo → navigate to that resident's detail page. -->
      <Teleport to="body">
        <div
          v-if="checkOpen"
          class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
          @click.self="checkOpen = false"
        >
          <div class="bg-card text-foreground rounded-xl shadow-2xl border w-full max-w-5xl max-h-[85vh] flex flex-col">
            <div class="px-5 py-4 border-b flex items-center gap-3">
              <Eye class="h-5 w-5 text-primary" />
              <div>
                <h2 class="text-base font-semibold">선택된 사진 미리보기</h2>
                <p class="text-xs text-muted-foreground">
                  {{ appliedMonthStr }} 발송 예약 · 총 {{ checkPhotos.length }}장 · 사진 클릭 → 어르신별 상세
                </p>
              </div>
              <button
                type="button"
                class="ml-auto h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
                aria-label="닫기"
                @click="checkOpen = false"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-5">
              <div v-if="checkLoading" class="grid grid-cols-3 sm:grid-cols-5 gap-3">
                <Skeleton v-for="i in 10" :key="i" h="8rem" />
              </div>
              <div v-else-if="checkPhotos.length === 0" class="py-12 text-center text-sm text-muted-foreground">
                선택된 사진이 없습니다.
              </div>
              <div v-else class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                <button
                  v-for="p in checkPhotos"
                  :key="p.id"
                  type="button"
                  class="group relative rounded-lg overflow-hidden border bg-muted aspect-[4/3] focus:outline-none focus:ring-4 focus:ring-primary/30 hover:border-primary transition-all"
                  @click="gotoFromCheck(p.resident_id)"
                >
                  <img :src="p.data_url" alt="" class="w-full h-full object-cover" loading="lazy" />
                  <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 to-transparent text-background p-2">
                    <div class="text-[11px] font-semibold truncate">{{ p.resident_name }}</div>
                    <div class="text-[9px] opacity-80 truncate">{{ p.branch_name }}</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

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
