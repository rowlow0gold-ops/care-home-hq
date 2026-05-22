<script setup lang="ts">
import { Sun, Moon, User, Mail, Briefcase, Building2 } from "@lucide/vue";

useHead({ title: "설정 · 케어닥 HQ" });

interface Branch {
  id: string;
  name: string;
  resident_count: number;
  occupancy_pct: number;
}

const { me } = useAuth();
const { isDark, toggle } = useDarkMode();
const api = useApi();

const { data: dashboard } = await useAsyncData("settings-dashboard", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const roleLabel: Record<string, string> = {
  caregiver: "요양보호사",
  nurse: "간호사",
  branch_manager: "센터장",
  hq: "본부",
  super_admin: "시스템 관리자",
};
</script>

<template>
  <div class="px-8 py-6 max-w-4xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">설정</h1>
      <p class="text-sm text-muted-foreground mt-1">
        개인 계정 정보 확인 및 화면 테마 전환.
      </p>
    </header>

    <div class="space-y-4">
      <!-- 내 정보 -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <User class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">내 정보</h2>
        </div>
        <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-lg font-semibold">
              {{ me?.name?.charAt(0) }}
            </div>
            <div class="min-w-0">
              <div class="font-medium">{{ me?.name }}</div>
              <div class="text-xs text-muted-foreground">{{ roleLabel[me?.role ?? ""] ?? me?.role }}</div>
            </div>
          </div>
          <dl class="text-sm space-y-2">
            <div class="flex items-center gap-2">
              <Mail class="h-3.5 w-3.5 text-muted-foreground" />
              <span class="font-mono text-xs">{{ me?.email }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Briefcase class="h-3.5 w-3.5 text-muted-foreground" />
              <span>{{ me?.tenant_name }}</span>
              <template v-if="me?.branch_name">
                <span class="text-muted-foreground">·</span>
                <span>{{ me.branch_name }}</span>
              </template>
            </div>
          </dl>
        </div>
      </div>

      <!-- 화면 테마 -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <component :is="isDark ? Moon : Sun" class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">화면 테마</h2>
        </div>
        <div class="p-6 flex items-center justify-between">
          <div class="text-sm font-medium">{{ isDark ? "다크 모드" : "라이트 모드" }}</div>
          <button
            class="h-10 px-4 rounded-lg border bg-card hover:bg-muted text-sm font-medium flex items-center gap-2 transition-colors"
            @click="toggle"
          >
            <component :is="isDark ? Sun : Moon" class="h-4 w-4" />
            {{ isDark ? "라이트로 전환" : "다크로 전환" }}
          </button>
        </div>
      </div>

      <!-- 지점 현황 -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <Building2 class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">지점 현황</h2>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground bg-muted/30">
              <th class="py-2 px-6 font-medium">지점명</th>
              <th class="py-2 px-3 font-medium text-right">어르신</th>
              <th class="py-2 px-6 font-medium text-right">입소율</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in dashboard?.branches ?? []" :key="b.id" class="border-t">
              <td class="py-2 px-6 font-medium">{{ b.name }}</td>
              <td class="py-2 px-3 text-right tabular-nums">{{ b.resident_count }}</td>
              <td class="py-2 px-6 text-right tabular-nums">{{ b.occupancy_pct.toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
