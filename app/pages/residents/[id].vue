<script setup lang="ts">
import { ArrowLeft, AlertTriangle, Plus } from "lucide-vue-next";
import { Line as LineChart } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const route = useRoute();
const id = route.params.id as string;
const api = useApi();

interface ResidentDetail {
  id: string;
  name: string;
  birth_date: string;
  sex: "M" | "F";
  branch_name: string;
  ltci_grade: number | null;
  admitted_at: string | null;
  status: string;
  primary_caregiver_name: string | null;
  conditions: string[];
}
interface Vital {
  id: string;
  measured_at: string;
  hr: number | null;
  bp_sys: number | null;
  bp_dia: number | null;
  spo2: number | null;
  temp_c: number | null;
  note: string | null;
  measured_by_name: string | null;
}
interface CareLog {
  id: string;
  logged_at: string;
  category: string;
  body: string;
  flagged: boolean;
  logged_by_name: string;
}

const { data: resident, pending: residentPending } = await useAsyncData(
  `resident-${id}`,
  () => api.get<ResidentDetail>(`/v1/residents/${id}`),
);
const { data: vitalsData } = await useAsyncData(
  `vitals-${id}`,
  () => api.get<{ items: Vital[] }>(`/v1/residents/${id}/vitals`, { limit: 30 }),
);
const { data: logsData } = await useAsyncData(
  `carelogs-${id}`,
  () => api.get<{ items: CareLog[] }>(`/v1/residents/${id}/care-logs`, { limit: 10 }),
);

const vitals = computed(() => [...(vitalsData.value?.items ?? [])].reverse());
const labels = computed(() =>
  vitals.value.map((v) =>
    new Date(v.measured_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
  ),
);

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      label: "심박수 (HR)",
      data: vitals.value.map((v) => v.hr),
      borderColor: "rgb(20, 161, 122)",
      backgroundColor: "rgba(20, 161, 122, 0.1)",
      tension: 0.3,
      fill: true,
    },
    {
      label: "SpO₂",
      data: vitals.value.map((v) => v.spo2),
      borderColor: "rgb(99, 102, 241)",
      backgroundColor: "rgba(99, 102, 241, 0.05)",
      tension: 0.3,
      yAxisID: "y1",
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  scales: {
    y: {
      type: "linear" as const,
      position: "left" as const,
      title: { display: true, text: "BPM" },
    },
    y1: {
      type: "linear" as const,
      position: "right" as const,
      grid: { drawOnChartArea: false },
      title: { display: true, text: "%" },
      min: 80,
      max: 100,
    },
  },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="px-8 py-6">
    <NuxtLink
      to="/residents"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      어르신 목록
    </NuxtLink>

    <div v-if="residentPending" class="text-sm text-muted-foreground">불러오는 중…</div>

    <template v-else-if="resident">
      <header class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-2xl font-bold">{{ resident.name }}</h1>
          <p class="text-sm text-muted-foreground">
            {{ resident.branch_name }} ·
            {{ resident.sex === "M" ? "남" : "여" }} ·
            {{ resident.ltci_grade ? `장기요양 ${resident.ltci_grade}등급` : "등급 미부여" }}
            <template v-if="resident.primary_caregiver_name">
              · 담당: {{ resident.primary_caregiver_name }}
            </template>
          </p>
        </div>
        <NuxtLink :to="`/residents/${id}/new-vital`">
          <Button>
            <Plus class="h-4 w-4" />
            활력 기록
          </Button>
        </NuxtLink>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card class="lg:col-span-2" title="활력징후 추이" description="최근 30회 측정">
          <div class="h-64">
            <LineChart
              v-if="vitals.length > 0"
              :data="chartData"
              :options="chartOptions"
            />
            <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">
              측정 기록이 없습니다.
            </div>
          </div>
        </Card>

        <Card title="기저질환">
          <div v-if="resident.conditions?.length" class="flex flex-wrap gap-2">
            <span
              v-for="c in resident.conditions"
              :key="c"
              class="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs"
            >
              {{ c }}
            </span>
          </div>
          <p v-else class="text-sm text-muted-foreground">등록된 질환 없음</p>
        </Card>
      </div>

      <Card title="최근 케어 기록" description="최근 10건">
        <div v-if="(logsData?.items ?? []).length === 0" class="text-sm text-muted-foreground py-4">
          케어 기록이 없습니다.
        </div>
        <ul v-else class="divide-y">
          <li
            v-for="log in logsData?.items"
            :key="log.id"
            class="py-3 flex items-start gap-3"
          >
            <AlertTriangle
              v-if="log.flagged"
              class="h-4 w-4 text-destructive flex-shrink-0 mt-0.5"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="text-xs font-medium uppercase text-muted-foreground">
                  {{ log.category }}
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ fmtTime(log.logged_at) }} · {{ log.logged_by_name }}
                </span>
              </div>
              <p class="text-sm mt-0.5">{{ log.body }}</p>
            </div>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>
