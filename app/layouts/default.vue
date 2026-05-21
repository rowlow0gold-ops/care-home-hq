<script setup lang="ts">
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Pill,
  Calendar,
  FileBarChart,
  UsersRound,
  Settings,
  LogOut,
} from "lucide-vue-next";

const { me, logout } = useAuth();
const route = useRoute();

const nav = computed(() => [
  { to: "/", label: "대시보드", icon: LayoutDashboard, minRole: 1 },
  { to: "/residents", label: "어르신", icon: Users, minRole: 1 },
  { to: "/care-logs", label: "케어 기록", icon: ClipboardList, minRole: 1 },
  { to: "/medications", label: "투약", icon: Pill, minRole: 2 },
  { to: "/schedule", label: "근무 일정", icon: Calendar, minRole: 3 },
  { to: "/staff", label: "직원 관리", icon: UsersRound, minRole: 3 },
  { to: "/reports", label: "보고서", icon: FileBarChart, minRole: 3 },
  { to: "/settings", label: "설정", icon: Settings, minRole: 3 },
]);

const ROLE_RANK = {
  caregiver: 1,
  nurse: 2,
  branch_manager: 3,
  hq: 4,
  super_admin: 5,
} as const;

const visibleNav = computed(() => {
  const rank = me.value ? ROLE_RANK[me.value.role] : 0;
  return nav.value.filter((n) => rank >= n.minRole);
});

const roleLabel: Record<string, string> = {
  caregiver: "요양보호사",
  nurse: "간호사",
  branch_manager: "지점장",
  hq: "본부",
  super_admin: "시스템 관리자",
};
</script>

<template>
  <div class="min-h-screen flex bg-muted/40">
    <aside class="w-60 border-r bg-background flex flex-col">
      <div class="h-16 flex items-center px-5 border-b">
        <div class="text-lg font-bold text-primary">케어닥</div>
        <div class="ml-2 text-xs text-muted-foreground">HQ</div>
      </div>

      <nav class="flex-1 px-2 py-4 space-y-1">
        <NuxtLink
          v-for="item in visibleNav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted"
          :class="
            route.path === item.to || route.path.startsWith(item.to + '/')
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-foreground/70'
          "
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="border-t p-3">
        <div v-if="me" class="text-sm">
          <div class="font-medium truncate">{{ me.name }}</div>
          <div class="text-xs text-muted-foreground">
            {{ roleLabel[me.role] ?? me.role }}
          </div>
        </div>
        <button
          class="mt-3 w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-foreground/70 hover:bg-muted"
          @click="logout"
        >
          <LogOut class="h-4 w-4" />
          로그아웃
        </button>
      </div>
    </aside>

    <main class="flex-1 min-w-0">
      <slot />
    </main>
  </div>
</template>
