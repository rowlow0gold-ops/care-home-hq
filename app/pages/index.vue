<script setup lang="ts">
import { Users, AlertCircle, ClipboardList, UserCheck, TrendingUp, MapPin } from "lucide-vue-next";

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
    {
      label: "전체 입소 어르신",
      value: t?.residents ?? null,
      icon: Users,
      bg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "최근 7일 사고/이상징후",
      value: t?.incidents_7d ?? null,
      icon: AlertCircle,
      bg: (t?.incidents_7d ?? 0) > 5 ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-900/30",
      iconColor: (t?.incidents_7d ?? 0) > 5 ? "text-destructive" : "text-amber-700 dark:text-amber-300",
      isWarning: (t?.incidents_7d ?? 0) > 5,
    },
    {
      label: "근무 중 직원",
      value: t?.staff_on_duty ?? null,
      icon: UserCheck,
      bg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-300",
    },
    {
      label: "확인 필요 케어 기록",
      value: t?.open_care_logs ?? null,
      icon: ClipboardList,
      bg: "bg-violet-100 dark:bg-violet-900/30",
      iconColor: "text-violet-600 dark:text-violet-300",
    },
  ];
});

function fmtNum(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("ko-KR");
}

function occupancyTone(pct: number) {
  if (pct >= 80) return "text-primary";
  if (pct >= 50) return "text-amber-600 dark:text-amber-300";
  return "text-muted-foreground";
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight">대시보드</h1>
      <p class="text-sm text-muted-foreground mt-1">전 지점 운영 현황 한눈에 보기</p>
    </header>

    <!-- KPI cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div
        v-for="(k, idx) in kpis"
        :key="idx"
        class="rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <p class="text-sm text-muted-foreground">{{ k.label }}</p>
            <p
              class="text-3xl font-bold mt-2 tabular-nums"
              :class="k.isWarning ? 'text-destructive' : ''"
            >
              <Skeleton v-if="pending && !data" w="3rem" h="1.875rem" />
              <template v-else>{{ fmtNum(k.value) }}</template>
            </p>
          </div>
          <div
            class="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
            :class="k.bg"
          >
            <component :is="k.icon" class="h-5 w-5" :class="k.iconColor" />
          </div>
        </div>
      </div>
    </div>

    <!-- Branch table -->
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b">
        <h2 class="text-lg font-semibold">지점별 현황</h2>
        <p class="text-sm text-muted-foreground">입소율 · 사고 · 근무 인원 (최근 7일 기준)</p>
      </div>

      <!-- Loading -->
      <div v-if="pending && !data" class="px-6 py-4 space-y-3">
        <div v-for="i in 3" :key="i" class="flex items-center gap-4">
          <Skeleton w="8rem" h="1rem" />
          <Skeleton w="3rem" h="1rem" />
          <Skeleton w="3rem" h="1rem" />
          <Skeleton w="3rem" h="1rem" />
          <Skeleton w="3rem" h="1rem" />
        </div>
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="px-6 py-12 text-center"
      >
        <AlertCircle class="h-8 w-8 mx-auto text-destructive mb-3" />
        <p class="text-sm font-medium">대시보드 데이터를 불러오지 못했습니다.</p>
        <p class="text-xs text-muted-foreground mt-1">본부 권한이 있는지 확인하세요.</p>
      </div>

      <!-- Data -->
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">지점</th>
            <th class="py-3 px-4 font-medium text-right">어르신</th>
            <th class="py-3 px-4 font-medium text-right">입소율</th>
            <th class="py-3 px-4 font-medium text-right">사고(7d)</th>
            <th class="py-3 px-6 font-medium text-right">근무 중</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="b in data?.branches ?? []"
            :key="b.id"
            class="border-t hover:bg-muted/40 transition-colors"
          >
            <td class="py-3 px-6">
              <div class="flex items-center gap-2">
                <MapPin class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="font-medium">{{ b.name }}</span>
              </div>
            </td>
            <td class="py-3 px-4 text-right tabular-nums">{{ b.resident_count }}</td>
            <td class="py-3 px-4 text-right tabular-nums">
              <span :class="occupancyTone(b.occupancy_pct)">
                {{ b.occupancy_pct.toFixed(1) }}%
              </span>
            </td>
            <td
              class="py-3 px-4 text-right tabular-nums"
              :class="b.incidents_7d > 3 ? 'text-destructive font-medium' : 'text-muted-foreground'"
            >
              {{ b.incidents_7d }}
            </td>
            <td class="py-3 px-6 text-right tabular-nums">{{ b.staff_on_duty }}</td>
          </tr>
          <tr v-if="(data?.branches ?? []).length === 0">
            <td colspan="5" class="py-12 text-center">
              <Users class="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40" />
              <p class="text-sm text-muted-foreground">지점 데이터가 없습니다.</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer hint -->
    <div class="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
      <TrendingUp class="h-3.5 w-3.5" />
      <span>실시간 데이터 — 페이지를 새로고침하면 최신 상태로 갱신됩니다.</span>
    </div>
  </div>
</template>
