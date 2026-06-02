<script setup lang="ts">
/**
 * /tablet/more — overflow menu. The bottom nav has the 4 most-used
 * sections; this page links to the rest (휴가 신청, 팀 스케쥴, 로그아웃).
 */
import { Calendar, CalendarDays, Clock, LogOut } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "더보기 · 케어닥" });

const { logout, me } = useTablet();

const items = [
  { to: "/tablet/clock",    icon: Clock,        label: "출퇴근",         hint: "출/퇴근 도장 · 이번 달 근태" },
  { to: "/tablet/leave",    icon: Calendar,     label: "휴가 신청",     hint: "연차 잔여 확인 · 새 휴가 신청" },
  { to: "/tablet/schedule", icon: CalendarDays, label: "팀 스케쥴",     hint: "이번 주 우리 센터 근무표" },
];

async function onLogout() {
  if (!confirm("로그아웃 하시겠습니까?")) return;
  await logout();
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-1">더보기</h1>
    <p class="text-sm text-muted-foreground mb-5">{{ me?.name ?? "" }} · {{ me?.branch_name ?? "" }}</p>

    <ul class="space-y-2.5">
      <li v-for="it in items" :key="it.to">
        <NuxtLink :to="it.to" class="block rounded-xl border bg-card hover:bg-muted/30 p-4 flex items-center gap-3">
          <div class="h-12 w-12 rounded-xl bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
            <component :is="it.icon" class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-base font-semibold">{{ it.label }}</div>
            <div class="text-xs text-muted-foreground mt-0.5 truncate">{{ it.hint }}</div>
          </div>
        </NuxtLink>
      </li>
      <li>
        <button
          type="button"
          class="w-full text-left rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 p-4 flex items-center gap-3 text-rose-700 dark:text-rose-200"
          @click="onLogout"
        >
          <div class="h-12 w-12 rounded-xl bg-rose-500/15 inline-flex items-center justify-center shrink-0">
            <LogOut class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-base font-semibold">로그아웃</div>
            <div class="text-xs opacity-80 mt-0.5">PIN 화면으로 돌아갑니다</div>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
