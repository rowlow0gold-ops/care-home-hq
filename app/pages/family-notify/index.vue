<script setup lang="ts">
/**
 * /family-notify — HQ photo batch picker.
 *
 *   탭 1 정기   — month-driven monthly batch (auto-pick / 체크 / 발송)
 *   탭 2 이벤트 — custom-named events (어버이날 etc.) with their own picks
 */
import {
  Send, Camera, Building2, Loader2, Search, Calendar, X,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Wand2, Eye,
  Plus, CalendarHeart, Trash2,
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
interface PickedPhoto {
  id: string; resident_id: string; resident_name: string;
  branch_name: string; taken_at: string; caption: string | null;
  data_url: string;
}
interface FamilyEvent {
  id:             string;
  name:           string;
  scheduled_date: string;
  status:         "scheduled" | "sent" | "cancelled";
  created_at:     string;
  sent_at:        string | null;
  photo_count:    number;
  picked_count:   number;
}
interface Branch { id: string; name: string; branch_type: "hub" | "satellite" }

const api    = useApi();
const router = useRouter();
const toast  = useToast();

type Tab = "regular" | "events";
const route = useRoute();
const tab = ref<Tab>(route.query.tab === "events" ? "events" : "regular");
watch(tab, (v) => {
  router.replace({ query: { ...route.query, tab: v === "regular" ? undefined : v } });
});

const { data: dashboard } = await useAsyncData("fam-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

// =============================================================================
// 정기 (월별)
// =============================================================================
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

onActivated(refresh);

const totalPages = computed(() =>
  Math.max(1, Math.ceil((paged.value?.total ?? 0) / pageSize.value)),
);
const showingFrom = computed(() =>
  paged.value && paged.value.total > 0 ? (page.value - 1) * pageSize.value + 1 : 0,
);
const showingTo = computed(() =>
  paged.value ? Math.min(page.value * pageSize.value, paged.value.total) : 0,
);

// 자동 선택 — count is HQ-configurable.
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
    if (r.picked === 0) {
      toast.info?.("이미 모두 예약되어 있습니다");
    } else {
      toast.success(`${r.picked}장 자동 예약 완료`);
    }
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "자동 선택 실패", "오류");
  } finally {
    autoPicking.value = false;
  }
}

// 체크 — modal showing every picked photo for the active filter.
const checkOpen    = ref(false);
const checkLoading = ref(false);
const checkPhotos  = ref<PickedPhoto[]>([]);
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

const sending = ref(false);
async function sendBatchNow() {
  if (sending.value) return;
  const n = paged.value?.total_picked ?? 0;
  if (n === 0) { toast.error("선택된 사진이 없습니다", "알림"); return; }
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
  router.push(`/family-notify/${rid}?month=${appliedMonthStr.value}`);
}

const pickedTone = (n: number) =>
  n === 0
    ? "bg-muted text-muted-foreground"
    : n < 3
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
      : "bg-primary/10 text-primary";

// =============================================================================
// 이벤트 (custom)
// =============================================================================
const { data: events, refresh: refreshEvents } = await useAsyncData(
  "family-events",
  () => api.get<FamilyEvent[]>("/v1/events"),
);

const newEventOpen = ref(false);
const newEvent = reactive({
  name: "",
  scheduled_date: "",
});
const creatingEvent = ref(false);
async function createEvent() {
  if (creatingEvent.value) return;
  if (!newEvent.name.trim()) { toast.error("이벤트 이름을 입력해 주세요", "알림"); return; }
  if (!newEvent.scheduled_date) { toast.error("일자를 선택해 주세요", "알림"); return; }
  creatingEvent.value = true;
  try {
    await api.post("/v1/events", {
      name: newEvent.name.trim(),
      scheduled_date: newEvent.scheduled_date,
    });
    toast.success("이벤트가 추가되었습니다");
    newEvent.name = "";
    newEvent.scheduled_date = "";
    newEventOpen.value = false;
    await refreshEvents();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "추가 실패", "오류");
  } finally {
    creatingEvent.value = false;
  }
}

async function cancelEvent(ev: FamilyEvent) {
  if (!confirm(`${ev.name} 이벤트를 취소합니다. 진행할까요?`)) return;
  try {
    await api.patch(`/v1/events/${ev.id}/cancel`, {});
    toast.success("이벤트 취소됨");
    await refreshEvents();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "취소 실패", "오류");
  }
}

function openEvent(ev: FamilyEvent) {
  router.push(`/family-notify/event/${ev.id}`);
}

const eventStatusTone: Record<FamilyEvent["status"], string> = {
  scheduled: "bg-primary/10 text-primary",
  sent:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground",
};
const eventStatusLabel: Record<FamilyEvent["status"], string> = {
  scheduled: "예정", sent: "발송됨", cancelled: "취소",
};
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-2">
        <Send class="h-7 w-7 text-primary" />
        가족 알림
      </h1>
    </header>

    <!-- Tabs -->
    <div class="border-b mb-6 flex gap-1">
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2.5 -mb-px text-sm border-b-2 transition-colors"
        :class="tab === 'regular'
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = 'regular'"
      >
        <Calendar class="h-4 w-4" />
        정기 (월별)
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2.5 -mb-px text-sm border-b-2 transition-colors"
        :class="tab === 'events'
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = 'events'"
      >
        <CalendarHeart class="h-4 w-4" />
        이벤트
        <span v-if="(events?.length ?? 0) > 0" class="text-[10px] tabular-nums opacity-70 rounded-full px-1.5 py-0.5 bg-primary/10">
          {{ events!.length }}
        </span>
      </button>
    </div>

    <!-- ============================ -->
    <!-- TAB: 정기                     -->
    <!-- ============================ -->
    <div v-if="tab === 'regular'" class="rounded-xl border bg-card overflow-hidden">
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
        <select v-model.number="year" class="h-10 w-24 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}년</option>
        </select>
        <select v-model.number="month" class="h-10 w-20 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
          <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}월</option>
        </select>

        <select v-model="branch" class="h-10 w-48 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
          <option value="">전체 지점</option>
          <optgroup label="광역센터 (Hub)">
            <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'hub')" :key="b.id" :value="b.id">{{ b.name }}</option>
          </optgroup>
          <optgroup label="위성센터 (Satellite)">
            <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'satellite')" :key="b.id" :value="b.id">{{ b.name }}</option>
          </optgroup>
        </select>

        <select v-model="status" class="h-10 w-32 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
          <option value="">전체 상태</option>
          <option value="pending">미선택</option>
          <option value="reserved">예약중</option>
        </select>

        <button
          type="button" @click="applyFilters" :disabled="pending"
          aria-label="검색" title="검색"
          class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 inline-flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Loader2 v-if="pending" class="h-4 w-4 animate-spin" />
          <Search v-else class="h-4 w-4" />
        </button>

        <div class="ml-auto flex items-center gap-2 flex-wrap">
          <span class="text-xs text-muted-foreground tabular-nums">
            {{ showingFrom }}–{{ showingTo }} / 총 {{ paged?.total ?? 0 }}명
          </span>

          <div class="inline-flex items-center rounded-lg border border-input bg-background overflow-hidden">
            <select v-model.number="autoCount" class="h-10 px-2 text-sm bg-transparent border-r border-input focus:outline-none focus:bg-muted/40" title="자동 선택 장수">
              <option v-for="n in 8" :key="n" :value="n">{{ n }}장</option>
            </select>
            <button type="button" class="h-10 px-3 text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50" :disabled="autoPicking" title="이달 후보 중 무작위 자동 예약" @click="autoPickAll">
              <Loader2 v-if="autoPicking" class="h-4 w-4 animate-spin" />
              <Wand2 v-else class="h-4 w-4" />
              자동 선택
            </button>
          </div>

          <button type="button" class="h-10 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50" :disabled="(paged?.total_picked ?? 0) === 0" @click="openCheck">
            <Eye class="h-4 w-4" />
            체크 ({{ paged?.total_picked ?? 0 }})
          </button>

          <button type="button" class="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50" :disabled="sending || (paged?.total_picked ?? 0) === 0" @click="sendBatchNow">
            <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
            <Send v-else class="h-4 w-4" />
            발송 ({{ paged?.total_picked ?? 0 }}건)
          </button>
        </div>
      </div>

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
          <tr v-for="r in paged?.items ?? []" :key="r.resident_id" class="border-t hover:bg-muted/40 cursor-pointer transition-colors" @click="openResident(r.resident_id)">
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
              <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums" :class="pickedTone(r.picked_count)">
                <CheckCircle2 v-if="r.picked_count >= 3" class="h-3 w-3" />
                {{ r.picked_count }} / 3
              </span>
            </td>
            <td class="py-3 px-3 text-right text-xs text-muted-foreground tabular-nums">{{ r.last_sent_month ?? "—" }}</td>
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

      <!-- 체크 modal — bigger thumbnails per request. -->
      <Teleport to="body">
        <div v-if="checkOpen" class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" @click.self="checkOpen = false">
          <div class="bg-card text-foreground rounded-xl shadow-2xl border w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div class="px-5 py-4 border-b flex items-center gap-3">
              <Eye class="h-5 w-5 text-primary" />
              <div>
                <h2 class="text-base font-semibold">선택된 사진 미리보기</h2>
                <p class="text-xs text-muted-foreground">
                  {{ appliedMonthStr }} 발송 예약 · 총 {{ checkPhotos.length }}장 · 사진 클릭 → 어르신별 상세
                </p>
              </div>
              <button type="button" class="ml-auto h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="닫기" @click="checkOpen = false">
                <X class="h-4 w-4" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-5">
              <div v-if="checkLoading" class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Skeleton v-for="i in 6" :key="i" h="14rem" />
              </div>
              <div v-else-if="checkPhotos.length === 0" class="py-12 text-center text-sm text-muted-foreground">
                선택된 사진이 없습니다.
              </div>
              <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <button v-for="p in checkPhotos" :key="p.id" type="button" class="group relative rounded-xl overflow-hidden border bg-muted aspect-[4/3] focus:outline-none focus:ring-4 focus:ring-primary/30 hover:border-primary hover:shadow-md transition-all" @click="gotoFromCheck(p.resident_id)">
                  <img :src="p.data_url" alt="" class="w-full h-full object-cover" loading="lazy" />
                  <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 via-foreground/40 to-transparent text-background p-3">
                    <div class="text-sm font-semibold truncate">{{ p.resident_name }}</div>
                    <div class="text-xs opacity-80 truncate">{{ p.branch_name }}</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <div v-if="(paged?.total ?? 0) > 0" class="px-6 py-3 border-t flex items-center justify-between text-sm">
        <div class="text-xs text-muted-foreground">페이지 {{ paged?.page ?? 1 }} / {{ totalPages }}</div>
        <div class="flex items-center gap-2">
          <select v-model.number="pageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary">
            <option :value="25">25/page</option>
            <option :value="50">50/page</option>
            <option :value="100">100/page</option>
          </select>
          <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed" :disabled="page <= 1" @click="page--">
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed" :disabled="page >= totalPages" @click="page++">
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- ============================ -->
    <!-- TAB: 이벤트                   -->
    <!-- ============================ -->
    <div v-else class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b flex items-center gap-3">
        <CalendarHeart class="h-4 w-4 text-primary" />
        <h2 class="font-semibold">이벤트 (특별일)</h2>
        <span class="text-xs text-muted-foreground">
          어버이날 · 추석 · 생신 등 · 태블릿이 이 목록을 받아 태그로 노출
        </span>
        <button type="button" class="ml-auto h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90" @click="newEventOpen = true">
          <Plus class="h-4 w-4" />
          이벤트 추가
        </button>
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">이벤트</th>
            <th class="py-3 px-3 font-medium">발송 예정일</th>
            <th class="py-3 px-3 font-medium">상태</th>
            <th class="py-3 px-3 font-medium text-right">사진</th>
            <th class="py-3 px-3 font-medium text-right">예약</th>
            <th class="py-3 px-6 font-medium text-right">관리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="(events?.length ?? 0) === 0">
            <td colspan="6" class="py-12 text-center text-muted-foreground">
              <CalendarHeart class="h-10 w-10 mx-auto mb-3 opacity-30" />
              등록된 이벤트가 없습니다. 우측 상단에서 추가하세요.
            </td>
          </tr>
          <tr v-for="ev in events ?? []" :key="ev.id" class="border-t hover:bg-muted/40 cursor-pointer transition-colors" @click="openEvent(ev)">
            <td class="py-3 px-6 font-medium">{{ ev.name }}</td>
            <td class="py-3 px-3 tabular-nums">{{ ev.scheduled_date }}</td>
            <td class="py-3 px-3">
              <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="eventStatusTone[ev.status]">
                {{ eventStatusLabel[ev.status] }}
              </span>
            </td>
            <td class="py-3 px-3 text-right tabular-nums">{{ ev.photo_count }}</td>
            <td class="py-3 px-3 text-right tabular-nums">{{ ev.picked_count }}</td>
            <td class="py-3 px-6 text-right">
              <button v-if="ev.status === 'scheduled'" type="button" class="text-xs text-destructive hover:underline inline-flex items-center gap-1" @click.stop="cancelEvent(ev)">
                <Trash2 class="h-3 w-3" />
                취소
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- New event modal -->
      <Teleport to="body">
        <div v-if="newEventOpen" class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" @click.self="newEventOpen = false">
          <div class="bg-card text-foreground rounded-xl shadow-2xl border max-w-md w-full p-5">
            <div class="flex items-start gap-3 mb-4">
              <div class="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10 text-primary">
                <Plus class="h-5 w-5" />
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="text-base font-semibold">이벤트 추가</h2>
              </div>
              <button type="button" class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" @click="newEventOpen = false">
                <X class="h-4 w-4" />
              </button>
            </div>

            <form class="space-y-4" @submit.prevent="createEvent">
              <FieldRow label="이벤트 이름" required>
                <input v-model="newEvent.name" type="text" placeholder="예: 어버이날 2026" class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
              </FieldRow>
              <FieldRow label="발송 예정일" required>
                <input v-model="newEvent.scheduled_date" type="date" class="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 [color-scheme:light] dark:[color-scheme:dark]">
              </FieldRow>

              <div class="flex items-center justify-end gap-2 pt-2 border-t">
                <button type="button" class="h-10 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted" :disabled="creatingEvent" @click="newEventOpen = false">취소</button>
                <button type="submit" class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60" :disabled="creatingEvent">
                  <Loader2 v-if="creatingEvent" class="h-4 w-4 animate-spin" />
                  추가
                </button>
              </div>
            </form>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>
