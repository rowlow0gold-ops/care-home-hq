<script setup lang="ts">
import { ArrowLeft, AlertTriangle, Plus, HeartPulse, ClipboardList, Pill, User, Pencil, LogOut, Skull } from "@lucide/vue";
import { Line as LineChart } from "vue-chartjs";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const route = useRoute();
const id = route.params.id as string;
const api = useApi();

interface ResidentDetail {
  id: string;
  full_name: string;
  sex: "male" | "female" | "other";
  birth_date: string;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string;
  status: string;
}
interface Vital { id: string; recorded_at: string; kind: string; value: number; note: string | null }
interface CareLog { id: string; recorded_at: string; category: string; body: string; flagged: boolean }
interface Medication {
  id: string; name: string; dosage: string; frequency: string;
  route: string | null; start_date: string; end_date: string | null;
  prescriber: string | null; instructions: string | null; stopped_at: string | null;
}

type Tab = "summary" | "vitals" | "care-logs" | "medications";
const tab = ref<Tab>("summary");

const router = useRouter();
const { data: resident, pending: residentPending, refresh: refreshResident } = await useAsyncData(
  `resident-${id}`,
  () => api.get<ResidentDetail>(`/v1/residents/${id}`),
);

// HQ-only CRUD (centralized at 본사 like staff)
const { me } = useAuth();
const isHq = computed(() => me.value?.role === "hq" || me.value?.role === "super_admin");

// Edit mode
const editing = ref(false);
function onEditClick()   { editing.value = true; }
function onCancelEdit()  { editing.value = false; }
async function onSaved() {
  editing.value = false;
  await refreshResident();
}

// 퇴소 처리 + 사망 처리 dialogs
const showDischargeConfirm = ref(false);
const showDeceaseConfirm   = ref(false);

const discharge = useApiMutation<void, ResidentDetail>(
  () => api.post<ResidentDetail>(`/v1/residents/${id}/discharge`, {
    discharged_on: new Date().toISOString().slice(0, 10),
  }),
  {
    successMessage: "퇴소 처리되었습니다",
    onSuccess: async () => { await router.push("/residents"); },
  },
);
const decease = useApiMutation<void, ResidentDetail>(
  () => api.post<ResidentDetail>(`/v1/residents/${id}/decease`, {}),
  {
    successMessage: "사망 처리되었습니다",
    onSuccess: async () => { await router.push("/residents"); },
  },
);
const { data: vitalsData } = await useAsyncData(`vitals-${id}`, () =>
  api.get<Vital[]>(`/v1/residents/${id}/vitals`),
);
const { data: logsData } = await useAsyncData(`carelogs-${id}`, () =>
  api.get<CareLog[]>(`/v1/residents/${id}/care-logs`),
);
const { data: medsData } = await useAsyncData(`meds-${id}`, () =>
  api.get<Medication[]>(`/v1/residents/${id}/medications`).catch(() => [] as Medication[]),
);

useHead({ title: () => `${resident.value?.full_name ?? "어르신"} · 케어닥 HQ` });

// ── Vitals chart ────────────────────────────────────────────────────────────
const vitalsByKind = computed(() => {
  const grouped: Record<string, Vital[]> = {};
  for (const v of vitalsData.value ?? []) (grouped[v.kind] ??= []).push(v);
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
    {
      label: "심박수 (HR)", data: hrSeries.value.map((v) => v.value),
      borderColor: "rgb(20, 161, 122)", backgroundColor: "rgba(20, 161, 122, 0.1)",
      tension: 0.3, fill: true,
    },
    {
      label: "SpO₂", data: spo2Series.value.map((v) => v.value),
      borderColor: "rgb(99, 102, 241)", backgroundColor: "rgba(99, 102, 241, 0.05)",
      tension: 0.3, yAxisID: "y1",
    },
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

const activeMeds = computed(() => (medsData.value ?? []).filter((m) => !m.stopped_at));
const stoppedMeds = computed(() => (medsData.value ?? []).filter((m) => m.stopped_at));
const sortedLogs = computed(() =>
  [...(logsData.value ?? [])].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)),
);

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

const tabs: { id: Tab; label: string; icon: any; count?: () => number }[] = [
  { id: "summary",     label: "요약",      icon: User },
  { id: "vitals",      label: "활력징후",  icon: HeartPulse, count: () => vitalsData.value?.length ?? 0 },
  { id: "care-logs",   label: "케어 기록", icon: ClipboardList, count: () => logsData.value?.length ?? 0 },
  { id: "medications", label: "투약",      icon: Pill, count: () => medsData.value?.length ?? 0 },
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
      <!-- Header -->
      <header class="flex items-start justify-between gap-4 mb-6">
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
        <div class="flex items-center gap-2 flex-wrap">
          <NuxtLink :to="`/residents/${id}/new-vital`">
            <Button>
              <Plus class="h-4 w-4" />
              활력 기록
            </Button>
          </NuxtLink>
          <template v-if="isHq && resident.status === 'active'">
            <button
              type="button"
              class="h-9 px-3 rounded-lg border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted"
              :disabled="editing"
              @click="onEditClick"
            >
              <Pencil class="h-3.5 w-3.5" />
              수정
            </button>
            <button
              type="button"
              class="h-9 px-3 rounded-lg border border-amber-500/40 bg-transparent text-amber-700 dark:text-amber-300 text-sm inline-flex items-center gap-1.5 hover:bg-amber-500/10 disabled:opacity-50"
              :disabled="discharge.pending.value"
              @click="showDischargeConfirm = true"
            >
              <LogOut class="h-3.5 w-3.5" />
              퇴소 처리
            </button>
            <button
              type="button"
              class="h-9 px-3 rounded-lg border border-destructive/40 bg-transparent text-destructive text-sm inline-flex items-center gap-1.5 hover:bg-destructive/10 disabled:opacity-50"
              :disabled="decease.pending.value"
              @click="showDeceaseConfirm = true"
            >
              <Skull class="h-3.5 w-3.5" />
              사망 처리
            </button>
          </template>
        </div>
      </header>

      <!-- Edit form (HQ + active resident only) -->
      <ResidentForm
        v-if="editing"
        mode="edit"
        :initial="resident"
        class="mb-6"
        @saved="onSaved"
        @cancel="onCancelEdit"
      />

      <!-- TABS -->
      <div class="border-b mb-6 flex gap-1 overflow-x-auto">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="px-4 py-2 -mb-px border-b-2 text-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          :class="tab === t.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
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
            <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">
              측정 기록이 없습니다.
            </div>
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
        </div>

        <div class="lg:col-span-3 rounded-xl border bg-card p-5">
          <h3 class="font-semibold mb-3">최근 케어 기록</h3>
          <div v-if="sortedLogs.length === 0" class="text-sm text-muted-foreground py-4">없음</div>
          <ul v-else class="divide-y">
            <li v-for="log in sortedLogs.slice(0, 5)" :key="log.id" class="py-3 flex items-start gap-3">
              <AlertTriangle v-if="log.flagged" class="h-4 w-4 text-destructive mt-0.5" />
              <ClipboardList v-else class="h-4 w-4 text-muted-foreground mt-0.5" />
              <div class="flex-1 min-w-0">
                <div class="text-xs uppercase text-muted-foreground">{{ log.category }} · {{ fmtTime(log.recorded_at) }}</div>
                <p class="text-sm mt-0.5">{{ log.body }}</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- TAB: 활력징후 -->
      <div v-else-if="tab === 'vitals'" class="rounded-xl border bg-card overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground bg-muted/30">
              <th class="py-3 px-6 font-medium">측정 시각</th>
              <th class="py-3 px-3 font-medium">항목</th>
              <th class="py-3 px-3 font-medium text-right">값</th>
              <th class="py-3 px-6 font-medium">메모</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in (vitalsData ?? []).slice().reverse()" :key="v.id" class="border-t">
              <td class="py-2 px-6 text-xs tabular-nums">{{ fmtTime(v.recorded_at) }}</td>
              <td class="py-2 px-3">{{ v.kind }}</td>
              <td class="py-2 px-3 text-right tabular-nums font-medium">{{ v.value }}</td>
              <td class="py-2 px-6 text-muted-foreground text-xs">{{ v.note ?? "—" }}</td>
            </tr>
            <tr v-if="(vitalsData ?? []).length === 0">
              <td colspan="4" class="py-12 text-center text-sm text-muted-foreground">
                측정 기록이 없습니다.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- TAB: 케어 기록 -->
      <div v-else-if="tab === 'care-logs'" class="rounded-xl border bg-card overflow-hidden">
        <ul v-if="sortedLogs.length > 0" class="divide-y">
          <li v-for="log in sortedLogs" :key="log.id" class="px-6 py-3 flex items-start gap-3 hover:bg-muted/30">
            <AlertTriangle v-if="log.flagged" class="h-4 w-4 text-destructive mt-1" />
            <ClipboardList v-else class="h-4 w-4 text-muted-foreground mt-1" />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="text-xs font-medium uppercase text-muted-foreground">{{ log.category }}</span>
                <span class="text-xs text-muted-foreground">{{ fmtTime(log.recorded_at) }}</span>
                <span v-if="log.flagged" class="text-[10px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
                  이상징후
                </span>
              </div>
              <p class="text-sm mt-0.5 whitespace-pre-wrap">{{ log.body }}</p>
            </div>
          </li>
        </ul>
        <div v-else class="py-12 text-center text-sm text-muted-foreground">
          <ClipboardList class="h-10 w-10 mx-auto mb-3 opacity-30" />
          케어 기록이 없습니다.
        </div>
      </div>

      <!-- TAB: 투약 -->
      <div v-else-if="tab === 'medications'" class="space-y-4">
        <div class="rounded-xl border bg-card overflow-hidden">
          <div class="px-6 py-3 border-b flex items-center gap-2">
            <Pill class="h-4 w-4 text-primary" />
            <h3 class="font-semibold">처방 중</h3>
            <span class="text-xs text-muted-foreground ml-auto">{{ activeMeds.length }}건</span>
          </div>
          <table v-if="activeMeds.length > 0" class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-muted-foreground bg-muted/30">
                <th class="py-3 px-6 font-medium">약품명</th>
                <th class="py-3 px-3 font-medium">용량</th>
                <th class="py-3 px-3 font-medium">횟수</th>
                <th class="py-3 px-3 font-medium">경로</th>
                <th class="py-3 px-3 font-medium">처방의</th>
                <th class="py-3 px-6 font-medium">기간</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in activeMeds" :key="m.id" class="border-t">
                <td class="py-2 px-6 font-medium">{{ m.name }}</td>
                <td class="py-2 px-3">{{ m.dosage }}</td>
                <td class="py-2 px-3">{{ m.frequency }}</td>
                <td class="py-2 px-3">{{ m.route ?? "—" }}</td>
                <td class="py-2 px-3">{{ m.prescriber ?? "—" }}</td>
                <td class="py-2 px-6 text-xs">
                  {{ m.start_date }}<template v-if="m.end_date"> ~ {{ m.end_date }}</template>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="py-8 text-center text-sm text-muted-foreground">처방 중인 약물이 없습니다.</div>
        </div>

        <details v-if="stoppedMeds.length > 0" class="rounded-xl border bg-card overflow-hidden">
          <summary class="px-6 py-3 cursor-pointer flex items-center gap-2 hover:bg-muted/30">
            <Pill class="h-4 w-4 text-muted-foreground" />
            <span class="font-semibold text-muted-foreground">중단된 처방</span>
            <span class="text-xs text-muted-foreground ml-auto">{{ stoppedMeds.length }}건</span>
          </summary>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="m in stoppedMeds" :key="m.id" class="border-t text-muted-foreground line-through">
                <td class="py-2 px-6">{{ m.name }} ({{ m.dosage }})</td>
                <td class="py-2 px-3 text-xs">{{ m.start_date }} ~ {{ m.end_date ?? "—" }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
      <!-- Status change confirmations -->
      <ConfirmDialog
        v-model:open="showDischargeConfirm"
        :title="`${resident.full_name} 어르신 퇴소 처리`"
        description="오늘 날짜로 퇴소 처리됩니다. 입소 기록 및 활력/케어 기록은 그대로 보존됩니다."
        confirm-label="퇴소 처리"
        tone="primary"
        @confirm="discharge.run()"
      />
      <ConfirmDialog
        v-model:open="showDeceaseConfirm"
        :title="`${resident.full_name} 어르신 사망 처리`"
        description="오늘 날짜로 사망 처리됩니다. 기록은 보존되며, 처리 후 되돌릴 수 없습니다."
        confirm-label="사망 처리"
        tone="destructive"
        @confirm="decease.run()"
      />
    </template>
  </div>
</template>
