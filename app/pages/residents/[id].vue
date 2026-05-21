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
  full_name: string;
  sex: "male" | "female" | "other";
  birth_date: string;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string;
  status: string;
}
interface Vital {
  id: string;
  recorded_at: string;
  kind: string;   // heart_rate | blood_pressure_systolic | spo2 | ...
  value: number;
  note: string | null;
}
interface CareLog {
  id: string;
  recorded_at: string;
  category: string;
  body: string;
  flagged: boolean;
}

const { data: resident, pending: residentPending } = await useAsyncData(
  `resident-${id}`,
  () => api.get<ResidentDetail>(`/v1/residents/${id}`),
);
const { data: vitalsData } = await useAsyncData(
  `vitals-${id}`,
  () => api.get<Vital[]>(`/v1/residents/${id}/vitals`),
);
const { data: logsData } = await useAsyncData(
  `carelogs-${id}`,
  () => api.get<CareLog[]>(`/v1/residents/${id}/care-logs`),
);

// Group vitals by kind and reverse so chronological left→right.
const vitalsByKind = computed(() => {
  const grouped: Record<string, Vital[]> = {};
  for (const v of vitalsData.value ?? []) {
    (grouped[v.kind] ??= []).push(v);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k].reverse();
  }
  return grouped;
});

const hrSeries = computed(() => vitalsByKind.value.heart_rate ?? []);
const spo2Series = computed(() => vitalsByKind.value.spo2 ?? []);

// Use HR timeline as the x-axis (most frequently recorded vital).
const labels = computed(() =>
  hrSeries.value.map((v) =>
    new Date(v.recorded_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
  ),
);

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      label: "심박수 (HR)",
      data: hrSeries.value.map((v) => v.value),
      borderColor: "rgb(20, 161, 122)",
      backgroundColor: "rgba(20, 161, 122, 0.1)",
      tension: 0.3,
      fill: true,
    },
    {
      label: "SpO₂",
      data: spo2Series.value.map((v) => v.value),
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
          <h1 class="text-2xl font-bold">{{ resident.full_name }}</h1>
          <p class="text-sm text-muted-foreground">
            <template v-if="resident.room_number">{{ resident.room_number }}호 ·</template>
            {{ resident.sex === "male" ? "남" : resident.sex === "female" ? "여" : "기타" }} ·
            {{
              resident.care_grade
                ? `장기요양 ${resident.care_grade.replace("grade_", "")}등급`
                : "등급 미부여"
            }}
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
        <Card class="lg:col-span-2" title="활력징후 추이" description="최근 측정 (HR + SpO₂)">
          <div class="h-64">
            <LineChart
              v-if="hrSeries.length > 0 || spo2Series.length > 0"
              :data="chartData"
              :options="chartOptions"
            />
            <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">
              측정 기록이 없습니다.
            </div>
          </div>
        </Card>

        <Card title="입소 정보">
          <dl class="grid grid-cols-2 gap-y-2 text-sm">
            <dt class="text-muted-foreground">생년월일</dt>
            <dd>{{ resident.birth_date }}</dd>
            <dt class="text-muted-foreground">입소일</dt>
            <dd>{{ resident.admitted_on }}</dd>
            <dt class="text-muted-foreground">상태</dt>
            <dd>{{ resident.status }}</dd>
          </dl>
        </Card>
      </div>

      <Card title="최근 케어 기록" description="최근 10건">
        <div v-if="(logsData ?? []).length === 0" class="text-sm text-muted-foreground py-4">
          케어 기록이 없습니다.
        </div>
        <ul v-else class="divide-y">
          <li
            v-for="log in (logsData ?? []).slice(0, 10)"
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
                  {{ fmtTime(log.recorded_at) }}
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
