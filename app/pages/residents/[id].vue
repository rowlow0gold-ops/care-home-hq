<script setup lang="ts">
import {
  ArrowLeft, AlertTriangle, HeartPulse, ClipboardList, Pill, User, Phone, Send,
  Download, Loader2, Search, ChevronLeft, ChevronRight, AlertCircle, Camera, X,
} from "@lucide/vue";
import { Line as LineChart } from "vue-chartjs";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const route = useRoute();
const id = route.params.id as string;
const api = useApi();
const toast = useToast();

interface ResidentContact {
  id: string;
  relation: string;
  full_name: string;
  phone: string | null;
  telegram_chat_id: string | null;
  receives_photos: boolean;
}
interface ResidentDetail {
  id: string;
  full_name: string;
  sex: "male" | "female" | "other";
  birth_date: string;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string;
  status: string;
  contacts: ResidentContact[];
}
interface Vital { id: string; recorded_at: string; kind: string; value: number; note: string | null }

type Tab = "summary" | "vitals" | "care-logs" | "medications" | "photos";
const tab = ref<Tab>("summary");

const { data: detail, pending: residentPending } = await useAsyncData(
  `resident-${id}`,
  () => api.get<ResidentDetail>(`/v1/residents/${id}`),
);
const resident = computed(() => detail.value);
useHead({ title: () => `${resident.value?.full_name ?? "어르신"} · 케어닥 HQ` });

// ── Vitals chart (summary tab) — keep small recent set ───────────────────
const { data: vitalsRecent } = await useAsyncData(`vitals-recent-${id}`, () =>
  api.get<Vital[]>(`/v1/residents/${id}/vitals`),
);
const vitalsByKind = computed(() => {
  const grouped: Record<string, Vital[]> = {};
  for (const v of vitalsRecent.value ?? []) (grouped[v.kind] ??= []).push(v);
  for (const k of Object.keys(grouped)) grouped[k].reverse();
  return grouped;
});
const hrSeries = computed(() => vitalsByKind.value.heart_rate ?? []);
const spo2Series = computed(() => vitalsByKind.value.spo2 ?? []);
const labels = computed(() =>
  hrSeries.value.map((v) =>
    new Date(v.recorded_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
  ),
);
const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: "심박수 (HR)", data: hrSeries.value.map((v) => v.value),
      borderColor: "rgb(20, 161, 122)", backgroundColor: "rgba(20, 161, 122, 0.1)",
      tension: 0.3, fill: true },
    { label: "SpO₂", data: spo2Series.value.map((v) => v.value),
      borderColor: "rgb(99, 102, 241)", backgroundColor: "rgba(99, 102, 241, 0.05)",
      tension: 0.3, yAxisID: "y1" },
  ],
}));
const chartOptions = {
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  scales: {
    y:  { type: "linear" as const, position: "left" as const, title: { display: true, text: "BPM" } },
    y1: { type: "linear" as const, position: "right" as const, grid: { drawOnChartArea: false },
          title: { display: true, text: "%" }, min: 80, max: 100 },
  },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function gradeLabel(g: string | null) {
  if (!g) return "등급 미부여";
  if (g === "cognitive_support") return "인지지원";
  return `장기요양 ${g}등급`;
}

// ── Paged tab state ──────────────────────────────────────────────────────
interface PagedResp<T> { items: T[]; total: number; page: number; page_size: number }

// 활력징후
interface VitalRow {
  id: string; resident_name: string; branch_name: string | null;
  recorded_at: string; kind: string; value: number; note: string | null;
}
const vQ = ref(""); const vKind = ref(""); const vAppliedQ = ref(""); const vAppliedKind = ref("");
const vPage = ref(1); const vPageSize = ref(25);
watch(vPageSize, () => { vPage.value = 1; });
function vApply() { vAppliedQ.value = vQ.value.trim(); vAppliedKind.value = vKind.value; vPage.value = 1; }
const { data: vPaged, pending: vPending, refresh: vRefresh } = await useAsyncData(
  () => `v-${id}-${vAppliedQ.value}-${vAppliedKind.value}-${vPage.value}-${vPageSize.value}`,
  () => api.get<PagedResp<VitalRow>>("/v1/vitals/paged", {
    resident_id: id,
    q:    vAppliedQ.value || undefined,
    kind: vAppliedKind.value || undefined,
    page: vPage.value, page_size: vPageSize.value,
  }),
  { watch: [vAppliedQ, vAppliedKind, vPage, vPageSize], lazy: true },
);
const vTotalPages = computed(() => Math.max(1, Math.ceil((vPaged.value?.total ?? 0) / vPageSize.value)));

// 케어 기록
interface CareLogRow {
  id: string; resident_name: string; recorded_at: string;
  category: string; body: string; flagged: boolean;
}
const lQ = ref(""); const lFlagged = ref(false); const lAppliedQ = ref(""); const lAppliedFlagged = ref(false);
const lPage = ref(1); const lPageSize = ref(25);
watch(lPageSize, () => { lPage.value = 1; });
function lApply() { lAppliedQ.value = lQ.value.trim(); lAppliedFlagged.value = lFlagged.value; lPage.value = 1; }
const { data: lPaged, pending: lPending, refresh: lRefresh } = await useAsyncData(
  () => `l-${id}-${lAppliedQ.value}-${lAppliedFlagged.value}-${lPage.value}-${lPageSize.value}`,
  () => api.get<PagedResp<CareLogRow>>("/v1/care-logs/paged", {
    resident_id: id,
    q: lAppliedQ.value || undefined,
    flagged_only: lAppliedFlagged.value || undefined,
    page: lPage.value, page_size: lPageSize.value,
  }),
  { watch: [lAppliedQ, lAppliedFlagged, lPage, lPageSize], lazy: true },
);
const lTotalPages = computed(() => Math.max(1, Math.ceil((lPaged.value?.total ?? 0) / lPageSize.value)));

// 투약
interface MedRow {
  id: string; name: string; dosage: string; frequency: string; route: string | null;
  start_date: string; end_date: string | null; prescriber: string | null;
  is_active: boolean;
}
const mQ = ref(""); const mIncludeStopped = ref(false); const mAppliedQ = ref(""); const mAppliedStopped = ref(false);
const mPage = ref(1); const mPageSize = ref(25);
watch(mPageSize, () => { mPage.value = 1; });
function mApply() { mAppliedQ.value = mQ.value.trim(); mAppliedStopped.value = mIncludeStopped.value; mPage.value = 1; }
const { data: mPaged, pending: mPending, refresh: mRefresh } = await useAsyncData(
  () => `m-${id}-${mAppliedQ.value}-${mAppliedStopped.value}-${mPage.value}-${mPageSize.value}`,
  () => api.get<PagedResp<MedRow>>("/v1/medications/paged", {
    resident_id: id,
    q: mAppliedQ.value || undefined,
    include_stopped: mAppliedStopped.value || undefined,
    page: mPage.value, page_size: mPageSize.value,
  }),
  { watch: [mAppliedQ, mAppliedStopped, mPage, mPageSize], lazy: true },
);
const mTotalPages = computed(() => Math.max(1, Math.ceil((mPaged.value?.total ?? 0) / mPageSize.value)));

// 사진 — paged photo grid for this resident (any tag).
interface PhotoRow {
  id: string; resident_id: string; taken_at: string;
  caption: string | null; status: string; tag: string | null;
  picked_for_month: string | null; data_url: string;
}
const phPage     = ref(1);
const phPageSize = ref(24);
const phTag      = ref("");
const phStatus   = ref("");
const phAppliedTag    = ref("");
const phAppliedStatus = ref("");
watch(phPageSize, () => { phPage.value = 1; });
function phApply() { phAppliedTag.value = phTag.value; phAppliedStatus.value = phStatus.value; phPage.value = 1; }
const { data: phPaged, pending: phPending } = await useAsyncData(
  () => `ph-${id}-${phAppliedTag.value}-${phAppliedStatus.value}-${phPage.value}-${phPageSize.value}`,
  () => api.get<PagedResp<PhotoRow>>(`/v1/residents/${id}/photos`, {
    tag:    phAppliedTag.value || undefined,
    status: phAppliedStatus.value || undefined,
    page:   phPage.value, page_size: phPageSize.value,
  }),
  { watch: [phAppliedTag, phAppliedStatus, phPage, phPageSize], lazy: true },
);
const phTotalPages = computed(() => Math.max(1, Math.ceil((phPaged.value?.total ?? 0) / phPageSize.value)));

// Lightbox state — clicking a thumb opens a fullscreen modal with prev/next
// (within the current page). ESC + click-outside + buttons all close.
const lightboxIndex = ref<number | null>(null);
const lightboxPhoto = computed<PhotoRow | null>(() =>
  lightboxIndex.value === null ? null : (phPaged.value?.items?.[lightboxIndex.value] ?? null),
);
function openLightbox(idx: number) { lightboxIndex.value = idx; }
function closeLightbox() { lightboxIndex.value = null; }
function lightboxPrev() {
  if (lightboxIndex.value === null) return;
  const len = phPaged.value?.items?.length ?? 0;
  if (len === 0) return;
  lightboxIndex.value = (lightboxIndex.value - 1 + len) % len;
}
function lightboxNext() {
  if (lightboxIndex.value === null) return;
  const len = phPaged.value?.items?.length ?? 0;
  if (len === 0) return;
  lightboxIndex.value = (lightboxIndex.value + 1) % len;
}
// Keyboard nav while open
onMounted(() => {
  window.addEventListener("keydown", (e) => {
    if (lightboxIndex.value === null) return;
    if (e.key === "Escape")      closeLightbox();
    else if (e.key === "ArrowLeft")  lightboxPrev();
    else if (e.key === "ArrowRight") lightboxNext();
  });
});

// ── Download everything as xlsx (same fetch pattern as Residents.vue) ───
const downloading = ref(false);
async function downloadAll() {
  if (downloading.value) return;
  downloading.value = true;
  try {
    const res = await fetch(`/api/v1/residents/${id}/export.xlsx`, { credentials: "include" });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const fallback = `${resident.value?.full_name ?? "resident"}_전체.xlsx`;
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m  = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="([^"]+)"/i.exec(cd);
    const filename = m ? decodeURIComponent(m[1]) : fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    toast.error(e?.message ?? "다운로드 실패", "오류");
  } finally {
    downloading.value = false;
  }
}

const tabs: { id: Tab; label: string; icon: any; count?: () => number }[] = [
  { id: "summary",     label: "요약",      icon: User },
  { id: "vitals",      label: "활력징후",  icon: HeartPulse,    count: () => vPaged.value?.total ?? 0 },
  { id: "care-logs",   label: "케어 기록", icon: ClipboardList, count: () => lPaged.value?.total ?? 0 },
  { id: "medications", label: "투약",      icon: Pill,          count: () => mPaged.value?.total ?? 0 },
  { id: "photos",      label: "사진",      icon: Camera,        count: () => phPaged.value?.total ?? 0 },
];
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <NuxtLink to="/residents" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
      <ArrowLeft class="h-4 w-4" />
      어르신 목록
    </NuxtLink>

    <div v-if="residentPending" class="text-sm text-muted-foreground">불러오는 중…</div>

    <template v-else-if="resident">
      <header class="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div class="flex items-center gap-4">
          <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-2xl font-bold">
            {{ resident.full_name.charAt(0) }}
          </div>
          <div>
            <h1 class="text-3xl font-bold tracking-tight">{{ resident.full_name }}</h1>
            <p class="text-sm text-muted-foreground mt-1">
              <template v-if="resident.room_number">{{ resident.room_number }}호 · </template>
              {{ resident.sex === "male" ? "남" : resident.sex === "female" ? "여" : "기타" }} ·
              {{ gradeLabel(resident.care_grade) }}
              · 입소 {{ resident.admitted_on }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="h-10 px-4 rounded-lg border border-input bg-background text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-60"
          :disabled="downloading"
          @click="downloadAll"
        >
          <Loader2 v-if="downloading" class="h-4 w-4 animate-spin" />
          <Download v-else class="h-4 w-4" />
          전체 다운로드
        </button>
      </header>

      <div class="border-b mb-6 flex gap-1 overflow-x-auto">
        <button
          v-for="t in tabs" :key="t.id"
          class="px-4 py-2 -mb-px border-b-2 text-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          :class="tab === t.id ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="tab = t.id"
        >
          <component :is="t.icon" class="h-4 w-4" />
          {{ t.label }}
          <span v-if="t.count" class="text-[10px] tabular-nums opacity-70">({{ t.count() }})</span>
        </button>
      </div>

      <!-- TAB: 요약 -->
      <div v-if="tab === 'summary'" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 rounded-xl border bg-card p-5">
          <h3 class="font-semibold mb-3">활력징후 추이</h3>
          <div class="h-64">
            <LineChart v-if="hrSeries.length > 0 || spo2Series.length > 0" :data="chartData" :options="chartOptions" />
            <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">측정 기록이 없습니다.</div>
          </div>
        </div>
        <div class="rounded-xl border bg-card p-5">
          <h3 class="font-semibold mb-3">입소 정보</h3>
          <dl class="grid grid-cols-2 gap-y-2 text-sm">
            <dt class="text-muted-foreground">생년월일</dt><dd>{{ resident.birth_date }}</dd>
            <dt class="text-muted-foreground">입소일</dt><dd>{{ resident.admitted_on }}</dd>
            <dt class="text-muted-foreground">상태</dt><dd>{{ resident.status }}</dd>
            <dt class="text-muted-foreground">등급</dt><dd>{{ gradeLabel(resident.care_grade) }}</dd>
          </dl>

          <div class="mt-5 pt-4 border-t">
            <h4 class="text-xs font-semibold text-muted-foreground uppercase mb-2.5 flex items-center gap-1.5">
              <Send class="h-3 w-3" /> 가족 연락처
            </h4>
            <div v-if="(resident.contacts?.length ?? 0) === 0" class="text-xs text-muted-foreground">
              등록된 가족 연락처가 없습니다.
            </div>
            <ul v-else class="space-y-2.5">
              <li v-for="c in resident.contacts" :key="c.id" class="text-sm">
                <div class="flex items-baseline gap-1.5">
                  <span class="font-medium">{{ c.full_name }}</span>
                  <span class="text-[11px] text-muted-foreground">{{ c.relation }}</span>
                  <span v-if="c.receives_photos" class="text-[10px] uppercase tracking-wide rounded bg-primary/10 text-primary px-1 py-0.5">사진 수신</span>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                  <div v-if="c.phone" class="inline-flex items-center gap-1"><Phone class="h-3 w-3" />{{ c.phone }}</div>
                  <div v-if="c.telegram_chat_id" class="inline-flex items-center gap-1 ml-2">
                    <Send class="h-3 w-3" />
                    Telegram: <code class="font-mono text-[11px]">{{ c.telegram_chat_id }}</code>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- TAB: 활력징후 -->
      <div v-else-if="tab === 'vitals'" class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-3 border-b flex flex-wrap items-center gap-2 bg-muted/10">
          <div class="relative flex-1 min-w-[200px] max-w-sm">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input v-model="vQ" placeholder="메모 검색" class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" @keyup.enter="vApply">
          </div>
          <select v-model="vKind" class="h-10 w-36 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary">
            <option value="">전체 항목</option>
            <option value="heart_rate">심박수</option>
            <option value="spo2">SpO₂</option>
            <option value="systolic">수축기</option>
            <option value="diastolic">이완기</option>
            <option value="temperature">체온</option>
            <option value="glucose">혈당</option>
          </select>
          <button type="button" @click="vApply" :disabled="vPending" class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-60">
            <Loader2 v-if="vPending" class="h-4 w-4 animate-spin" />
            <Search v-else class="h-4 w-4" />
          </button>
          <span class="ml-auto text-xs text-muted-foreground tabular-nums">총 {{ vPaged?.total ?? 0 }}건</span>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground bg-muted/30">
              <th class="py-3 px-6 font-medium">측정 시각</th>
              <th class="py-3 px-3 font-medium">항목</th>
              <th class="py-3 px-3 font-medium text-right">값</th>
              <th class="py-3 px-6 font-medium">메모</th>
            </tr>
          </thead>
          <tbody v-if="vPending && !vPaged">
            <tr v-for="i in 6" :key="`vsk-${i}`" class="border-t">
              <td class="py-3 px-6"><Skeleton w="8rem" /></td>
              <td class="py-3 px-3"><Skeleton w="4rem" /></td>
              <td class="py-3 px-3 text-right"><Skeleton w="2rem" class="ml-auto" /></td>
              <td class="py-3 px-6"><Skeleton w="12rem" /></td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr v-for="v in vPaged?.items ?? []" :key="v.id" class="border-t hover:bg-muted/30">
              <td class="py-2 px-6 text-xs tabular-nums">{{ fmtTime(v.recorded_at) }}</td>
              <td class="py-2 px-3">{{ v.kind }}</td>
              <td class="py-2 px-3 text-right tabular-nums font-medium">{{ v.value }}</td>
              <td class="py-2 px-6 text-muted-foreground text-xs">{{ v.note ?? "—" }}</td>
            </tr>
            <tr v-if="(vPaged?.items?.length ?? 0) === 0">
              <td colspan="4" class="py-12 text-center text-sm text-muted-foreground">
                <HeartPulse class="h-10 w-10 mx-auto mb-3 opacity-30" />
                측정 기록이 없습니다.
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="(vPaged?.total ?? 0) > 0" class="px-6 py-3 border-t flex items-center justify-between text-sm">
          <div class="text-xs text-muted-foreground">페이지 {{ vPaged?.page ?? 1 }} / {{ vTotalPages }}</div>
          <div class="flex items-center gap-2">
            <select v-model.number="vPageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs">
              <option :value="25">25/page</option><option :value="50">50/page</option><option :value="100">100/page</option>
            </select>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="vPage <= 1" @click="vPage--"><ChevronLeft class="h-4 w-4" /></button>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="vPage >= vTotalPages" @click="vPage++"><ChevronRight class="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <!-- TAB: 케어 기록 -->
      <div v-else-if="tab === 'care-logs'" class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-3 border-b flex flex-wrap items-center gap-2 bg-muted/10">
          <div class="relative flex-1 min-w-[200px] max-w-sm">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input v-model="lQ" placeholder="내용 검색" class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" @keyup.enter="lApply">
          </div>
          <label class="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="lFlagged" type="checkbox" class="h-4 w-4 rounded border-input">
            <span>이상징후만</span>
          </label>
          <button type="button" @click="lApply" :disabled="lPending" class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-60">
            <Loader2 v-if="lPending" class="h-4 w-4 animate-spin" />
            <Search v-else class="h-4 w-4" />
          </button>
          <span class="ml-auto text-xs text-muted-foreground tabular-nums">총 {{ lPaged?.total ?? 0 }}건</span>
        </div>
        <ul v-if="lPending && !lPaged" class="divide-y">
          <li v-for="i in 5" :key="`lsk-${i}`" class="px-6 py-3"><Skeleton w="60%" /></li>
        </ul>
        <ul v-else-if="(lPaged?.items?.length ?? 0) > 0" class="divide-y">
          <li v-for="log in lPaged?.items" :key="log.id" class="px-6 py-3 flex items-start gap-3 hover:bg-muted/30">
            <AlertTriangle v-if="log.flagged" class="h-4 w-4 text-destructive mt-1" />
            <ClipboardList v-else class="h-4 w-4 text-muted-foreground mt-1" />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="text-xs font-medium uppercase text-muted-foreground">{{ log.category }}</span>
                <span class="text-xs text-muted-foreground">{{ fmtTime(log.recorded_at) }}</span>
                <span v-if="log.flagged" class="text-[10px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 rounded px-1.5 py-0.5">이상징후</span>
              </div>
              <p class="text-sm mt-0.5 whitespace-pre-wrap">{{ log.body }}</p>
            </div>
          </li>
        </ul>
        <div v-else class="py-12 text-center text-sm text-muted-foreground">
          <ClipboardList class="h-10 w-10 mx-auto mb-3 opacity-30" />
          케어 기록이 없습니다.
        </div>
        <div v-if="(lPaged?.total ?? 0) > 0" class="px-6 py-3 border-t flex items-center justify-between text-sm">
          <div class="text-xs text-muted-foreground">페이지 {{ lPaged?.page ?? 1 }} / {{ lTotalPages }}</div>
          <div class="flex items-center gap-2">
            <select v-model.number="lPageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs">
              <option :value="25">25/page</option><option :value="50">50/page</option><option :value="100">100/page</option>
            </select>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="lPage <= 1" @click="lPage--"><ChevronLeft class="h-4 w-4" /></button>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="lPage >= lTotalPages" @click="lPage++"><ChevronRight class="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <!-- TAB: 투약 -->
      <div v-else-if="tab === 'medications'" class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-3 border-b flex flex-wrap items-center gap-2 bg-muted/10">
          <div class="relative flex-1 min-w-[200px] max-w-sm">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input v-model="mQ" placeholder="약품명 / 처방의 검색" class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" @keyup.enter="mApply">
          </div>
          <label class="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="mIncludeStopped" type="checkbox" class="h-4 w-4 rounded border-input">
            <span>중단된 처방 포함</span>
          </label>
          <button type="button" @click="mApply" :disabled="mPending" class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-60">
            <Loader2 v-if="mPending" class="h-4 w-4 animate-spin" />
            <Search v-else class="h-4 w-4" />
          </button>
          <span class="ml-auto text-xs text-muted-foreground tabular-nums">총 {{ mPaged?.total ?? 0 }}건</span>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground bg-muted/30">
              <th class="py-3 px-6 font-medium">약품명</th>
              <th class="py-3 px-3 font-medium">용량</th>
              <th class="py-3 px-3 font-medium">횟수</th>
              <th class="py-3 px-3 font-medium">처방의</th>
              <th class="py-3 px-3 font-medium">기간</th>
              <th class="py-3 px-6 font-medium">상태</th>
            </tr>
          </thead>
          <tbody v-if="mPending && !mPaged">
            <tr v-for="i in 5" :key="`msk-${i}`" class="border-t">
              <td class="py-3 px-6"><Skeleton w="6rem" /></td>
              <td class="py-3 px-3"><Skeleton w="3rem" /></td>
              <td class="py-3 px-3"><Skeleton w="3rem" /></td>
              <td class="py-3 px-3"><Skeleton w="4rem" /></td>
              <td class="py-3 px-3"><Skeleton w="8rem" /></td>
              <td class="py-3 px-6"><Skeleton w="3rem" /></td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr v-for="m in mPaged?.items ?? []" :key="m.id" class="border-t" :class="!m.is_active && 'text-muted-foreground line-through'">
              <td class="py-2 px-6 font-medium">{{ m.name }}</td>
              <td class="py-2 px-3">{{ m.dosage }}</td>
              <td class="py-2 px-3">{{ m.frequency }}</td>
              <td class="py-2 px-3">{{ m.prescriber ?? "—" }}</td>
              <td class="py-2 px-3 text-xs">{{ m.start_date }}<template v-if="m.end_date"> ~ {{ m.end_date }}</template></td>
              <td class="py-2 px-6">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium" :class="m.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-muted text-muted-foreground'">
                  {{ m.is_active ? "처방중" : "중단" }}
                </span>
              </td>
            </tr>
            <tr v-if="(mPaged?.items?.length ?? 0) === 0">
              <td colspan="6" class="py-12 text-center text-sm text-muted-foreground">
                <Pill class="h-10 w-10 mx-auto mb-3 opacity-30" />
                처방 기록이 없습니다.
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="(mPaged?.total ?? 0) > 0" class="px-6 py-3 border-t flex items-center justify-between text-sm">
          <div class="text-xs text-muted-foreground">페이지 {{ mPaged?.page ?? 1 }} / {{ mTotalPages }}</div>
          <div class="flex items-center gap-2">
            <select v-model.number="mPageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs">
              <option :value="25">25/page</option><option :value="50">50/page</option><option :value="100">100/page</option>
            </select>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="mPage <= 1" @click="mPage--"><ChevronLeft class="h-4 w-4" /></button>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="mPage >= mTotalPages" @click="mPage++"><ChevronRight class="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <!-- TAB: 사진 -->
      <div v-else-if="tab === 'photos'" class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-3 border-b flex flex-wrap items-center gap-2 bg-muted/10">
          <select v-model="phTag" class="h-9 px-2 rounded-md border border-input bg-background text-sm">
            <option value="">전체 태그</option>
            <option value="regular">정기 (월별)</option>
            <option value="custom">비정기</option>
          </select>
          <select v-model="phStatus" class="h-9 px-2 rounded-md border border-input bg-background text-sm">
            <option value="">전체 상태</option>
            <option value="pending">대기중</option>
            <option value="approved">승인됨</option>
            <option value="rejected">반려됨</option>
          </select>
          <button type="button" class="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium" @click="phApply">
            필터 적용
          </button>
          <span class="ml-auto text-xs text-muted-foreground tabular-nums">총 {{ phPaged?.total ?? 0 }}장</span>
        </div>
        <div class="p-4">
          <div v-if="phPending" class="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
          <div v-else-if="(phPaged?.items?.length ?? 0) === 0" class="py-12 text-center text-sm text-muted-foreground">
            등록된 사진이 없습니다.
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <figure
              v-for="(p, idx) in phPaged!.items"
              :key="p.id"
              class="rounded-lg border bg-background overflow-hidden hover:border-primary transition-colors group cursor-zoom-in"
              @click="openLightbox(idx)"
            >
              <img :src="p.data_url" :alt="p.caption ?? ''" class="w-full aspect-square object-cover bg-muted group-hover:scale-[1.02] transition-transform" loading="lazy" />
              <figcaption class="p-2 text-[11px] space-y-0.5">
                <div class="flex items-center justify-between gap-1">
                  <span
                    class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    :class="p.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                      : p.status === 'rejected'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'"
                  >{{ p.status === 'approved' ? '승인' : p.status === 'rejected' ? '반려' : '대기' }}</span>
                  <span v-if="p.tag" class="text-muted-foreground truncate">{{ p.tag }}</span>
                </div>
                <div class="text-muted-foreground text-[10px] tabular-nums">
                  {{ new Date(p.taken_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) }}
                </div>
                <div v-if="p.caption" class="truncate" :title="p.caption">{{ p.caption }}</div>
              </figcaption>
            </figure>
          </div>
        </div>
        <div v-if="(phPaged?.total ?? 0) > 0" class="px-6 py-3 border-t flex items-center justify-between text-sm">
          <div class="text-xs text-muted-foreground">페이지 {{ phPaged?.page ?? 1 }} / {{ phTotalPages }}</div>
          <div class="flex items-center gap-2">
            <select v-model.number="phPageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs">
              <option :value="24">24/page</option><option :value="48">48/page</option><option :value="96">96/page</option>
            </select>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="phPage <= 1" @click="phPage--"><ChevronLeft class="h-4 w-4" /></button>
            <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="phPage >= phTotalPages" @click="phPage++"><ChevronRight class="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </template>

    <!-- Lightbox: click-to-zoom on the 사진 tab thumbs. ESC / click backdrop /
         arrow keys to navigate (within current page). -->
    <Teleport to="body">
      <div
        v-if="lightboxPhoto"
        class="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6"
        @click.self="closeLightbox"
      >
        <button
          type="button"
          class="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
          aria-label="닫기"
          @click="closeLightbox"
        >
          <X class="h-5 w-5" />
        </button>
        <button
          v-if="(phPaged?.items?.length ?? 0) > 1"
          type="button"
          class="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
          aria-label="이전"
          @click.stop="lightboxPrev"
        >
          <ChevronLeft class="h-6 w-6" />
        </button>
        <button
          v-if="(phPaged?.items?.length ?? 0) > 1"
          type="button"
          class="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
          aria-label="다음"
          @click.stop="lightboxNext"
        >
          <ChevronRight class="h-6 w-6" />
        </button>
        <img
          :src="lightboxPhoto.data_url"
          :alt="lightboxPhoto.caption ?? ''"
          class="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          @click.stop
        />
        <div class="mt-4 max-w-2xl text-center text-white/90 text-sm space-y-1" @click.stop>
          <div class="text-xs text-white/60 tabular-nums">
            {{ new Date(lightboxPhoto.taken_at).toLocaleString("ko-KR", { dateStyle: "full", timeStyle: "short" }) }}
            <span v-if="lightboxPhoto.tag"> · {{ lightboxPhoto.tag }}</span>
            <span v-if="lightboxPhoto.status"> · {{ lightboxPhoto.status === 'approved' ? '승인됨' : lightboxPhoto.status === 'rejected' ? '반려됨' : '대기중' }}</span>
            <span class="ml-2 opacity-70">({{ (lightboxIndex ?? 0) + 1 }} / {{ phPaged?.items?.length ?? 0 }})</span>
          </div>
          <div v-if="lightboxPhoto.caption">{{ lightboxPhoto.caption }}</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
