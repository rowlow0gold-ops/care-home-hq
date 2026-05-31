<script setup lang="ts">
/**
 * /tablet — caregiver home dashboard.
 *
 * Four giant tiles, each one task at a time. Picked for the daily floor
 * routine in a Korean 요양 center; sized 56dp+ throughout for older
 * caregivers wearing gloves.
 */
import { Users } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "오늘의 할 일 · 케어닥" });

const { me } = useTablet();

// V1: every action starts from picking the resident. Future versions may
// add "최근 측정한 어르신" shortcuts; for now keep it simple.
const tiles = [
  { to: "/tablet/residents",            icon: Users,           label: "어르신 목록", hint: "어르신을 선택해 케어를 시작하세요",  tone: "bg-emerald-500" },
];

const today = new Date().toLocaleDateString("ko-KR", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
});
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-7">
    <div class="mb-6">
      <p class="text-sm text-muted-foreground">{{ today }}</p>
      <h1 class="text-3xl font-bold mt-1">
        {{ me?.name ?? "" }}님, 안녕하세요
      </h1>
      <p class="text-base text-muted-foreground mt-1">오늘 무엇을 도와드릴까요?</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <NuxtLink
        v-for="t in tiles" :key="t.to"
        :to="t.to"
        class="block rounded-2xl border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all p-6 group"
      >
        <div class="flex items-start gap-4">
          <div
            class="h-16 w-16 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            :class="t.tone"
          >
            <component :is="t.icon" class="h-8 w-8" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xl font-bold">{{ t.label }}</div>
            <p class="text-sm text-muted-foreground mt-1.5 leading-snug">{{ t.hint }}</p>
          </div>
        </div>
      </NuxtLink>
    </div>

    <div class="mt-8 rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
      <b>안내</b> · 일정 시간 동안 사용하지 않으면 자동으로 로그아웃됩니다. 사용 중에는 화면이 꺼지지 않도록 태블릿 절전 설정을 길게 해주세요.
    </div>
  </div>
</template>
