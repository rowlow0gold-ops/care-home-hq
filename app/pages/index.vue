<script setup lang="ts">
import { Users, AlertCircle, ClipboardList, UserCheck } from "lucide-vue-next";

useHead({ title: "대시보드 · 케어닥 HQ" });

interface DashboardSummary {
  branches: Array<{
    id: string;
    name: string;
    resident_count: number;
    occupancy_pct: number;
    incidents_7d: number;
    staff_on_duty: number;
  }>;
  totals: {
    residents: number;
    incidents_7d: number;
    staff_on_duty: number;
    open_care_logs: number;
  };
}

const api = useApi();
const { data, pending, error } = await useAsyncData("dashboard", () =>
  api.get<DashboardSummary>("/v1/dashboard/summary"),
);

const kpis = computed(() => {
  const t = data.value?.totals;
  return [
    { label: "전체 입소 어르신", value: t?.residents ?? "—", icon: Users, tone: "default" },
    {
      label: "최근 7일 사고/이상징후",
      value: t?.incidents_7d ?? "—",
      icon: AlertCircle,
      tone: (t?.incidents_7d ?? 0) > 5 ? "warning" : "default",
    },
    { label: "근무 중 직원", value: t?.staff_on_duty ?? "—", icon: UserCheck, tone: "default" },
    { label: "확인 필요 케어 기록", value: t?.open_care_logs ?? "—", icon: ClipboardList, tone: "default" },
  ];
});
</script>

<template>
  <div class="px-8 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold">대시보드</h1>
      <p class="text-sm text-muted-foreground">전 지점 운영 현황 한눈에 보기</p>
    </header>

    <div v-if="pending" class="text-sm text-muted-foreground">불러오는 중…</div>
    <div v-else-if="error" class="text-sm text-destructive">
      대시보드 데이터를 불러오지 못했습니다. 본부 권한이 있는지 확인하세요.
    </div>

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card v-for="(k, idx) in kpis" :key="idx">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-muted-foreground">{{ k.label }}</p>
              <p
                class="text-3xl font-bold mt-2"
                :class="k.tone === 'warning' ? 'text-destructive' : ''"
              >
                {{ k.value }}
              </p>
            </div>
            <component
              :is="k.icon"
              class="h-5 w-5 text-muted-foreground"
              :class="k.tone === 'warning' ? 'text-destructive' : ''"
            />
          </div>
        </Card>
      </div>

      <Card title="지점별 현황" description="입소율·사고·근무 인원 (최근 7일 기준)">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground border-b">
              <th class="py-2 pr-4 font-medium">지점</th>
              <th class="py-2 pr-4 font-medium text-right">어르신</th>
              <th class="py-2 pr-4 font-medium text-right">입소율</th>
              <th class="py-2 pr-4 font-medium text-right">사고(7d)</th>
              <th class="py-2 font-medium text-right">근무 중</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in data?.branches ?? []" :key="b.id" class="border-b last:border-0">
              <td class="py-3 pr-4 font-medium">{{ b.name }}</td>
              <td class="py-3 pr-4 text-right">{{ b.resident_count }}</td>
              <td class="py-3 pr-4 text-right">{{ b.occupancy_pct.toFixed(1) }}%</td>
              <td
                class="py-3 pr-4 text-right"
                :class="b.incidents_7d > 3 ? 'text-destructive font-medium' : ''"
              >
                {{ b.incidents_7d }}
              </td>
              <td class="py-3 text-right">{{ b.staff_on_duty }}</td>
            </tr>
            <tr v-if="(data?.branches ?? []).length === 0">
              <td colspan="5" class="py-6 text-center text-muted-foreground">
                지점 데이터가 없습니다.
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </template>
  </div>
</template>
