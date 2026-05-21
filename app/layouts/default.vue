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
  Heart,
  Network,
  CalendarOff,
} from "@lucide/vue";

const { me, logout } = useAuth();
const route = useRoute();

const nav = computed(() => [
  { to: "/", label: "대시보드", icon: LayoutDashboard, minRole: 1 },
  { to: "/residents", label: "어르신", icon: Users, minRole: 1 },
  { to: "/care-logs", label: "케어 기록", icon: ClipboardList, minRole: 1 },
  { to: "/medications", label: "투약", icon: Pill, minRole: 2 },
  { to: "/schedule", label: "근무 일정", icon: Calendar, minRole: 3 },
  { to: "/leave", label: "휴가", icon: CalendarOff, minRole: 1 },
  { to: "/staff", label: "직원 관리", icon: UsersRound, minRole: 3 },
  { to: "/org", label: "조직도", icon: Network, minRole: 2 },
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

function isActive(to: string) {
  if (to === "/") return route.path === "/";
  return route.path === to || route.path.startsWith(to + "/");
}

const initials = computed(() => {
  const n = me.value?.name ?? "";
  return n.slice(0, 1);
});
</script>

<template>
  <div class="min-h-screen flex bg-muted/30">
    <aside class="w-64 border-r bg-card flex flex-col">
      <!-- Brand — click to go home -->
      <NuxtLink to="/" class="h-16 flex items-center px-5 border-b hover:bg-muted/40 transition-colors">
        <div class="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center mr-3">
          <Heart class="h-5 w-5" />
        </div>
        <div>
          <div class="text-base font-bold leading-tight">케어닥</div>
          <div class="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">HQ</div>
        </div>
      </NuxtLink>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <NuxtLink
          v-for="item in visibleNav"
          :key="item.to"
          :to="item.to"
          class="group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all"
          :class="
            isActive(item.to)
              ? 'text-primary font-medium bg-primary/8'
              : 'text-foreground/70 hover:bg-muted hover:text-foreground'
          "
        >
          <!-- left-bar active indicator -->
          <span
            class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-sm transition-all"
            :class="isActive(item.to) ? 'bg-primary' : 'bg-transparent'"
          />
          <component :is="item.icon" class="h-4 w-4 flex-shrink-0" :class="isActive(item.to) ? 'text-primary' : ''" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <!-- Footer: user (click→settings) + logout -->
      <div class="border-t p-3 space-y-2">
        <NuxtLink
          v-if="me"
          to="/settings"
          class="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors group"
          title="내 정보 / 설정"
        >
          <div class="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {{ initials }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate group-hover:text-primary transition-colors">{{ me.name }}</div>
            <div class="text-xs text-muted-foreground truncate">
              {{ roleLabel[me.role] ?? me.role }}<template v-if="me.branch_name"> · {{ me.branch_name }}</template>
            </div>
          </div>
        </NuxtLink>

        <button
          class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-md text-foreground/70 hover:bg-muted hover:text-destructive transition-colors"
          @click="logout"
        >
          <LogOut class="h-3.5 w-3.5" />
          로그아웃
        </button>
      </div>
    </aside>

    <main class="flex-1 min-w-0 overflow-x-hidden">
      <slot />
    </main>
  </div>
</template>
