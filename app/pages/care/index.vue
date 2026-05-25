<script setup lang="ts">
import { Users, ClipboardList, Pill } from "@lucide/vue";

useHead({ title: "케어 관리 · 케어닥 HQ" });

type Tab = "residents" | "care-logs" | "medications";

const route  = useRoute();
const router = useRouter();

const tab = ref<Tab>(
  route.query.tab === "care-logs"   ? "care-logs"
  : route.query.tab === "medications" ? "medications"
  : "residents",
);

// Keep ?tab= in sync (mirrors the /staff page pattern)
watch(tab, (v) => {
  router.replace({
    query: { ...route.query, tab: v === "residents" ? undefined : v },
  });
});

const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: "residents",   label: "어르신",    icon: Users },
  { key: "care-logs",   label: "케어 기록", icon: ClipboardList },
  { key: "medications", label: "투약",      icon: Pill },
];
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">케어 관리</h1>
      <p class="text-sm text-muted-foreground mt-1">
        어르신 · 케어 기록 · 투약을 한 화면에서 관리합니다.
      </p>
    </header>

    <!-- Tab bar -->
    <div class="border-b mb-6 flex flex-wrap gap-1">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2.5 -mb-px text-sm border-b-2 transition-colors"
        :class="tab === t.key
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="tab = t.key"
      >
        <component :is="t.icon" class="h-4 w-4" />
        {{ t.label }}
      </button>
    </div>

    <!-- Tab content -->
    <CareResidents    v-if="tab === 'residents'" />
    <CareLogs         v-else-if="tab === 'care-logs'" />
    <CareMedications  v-else-if="tab === 'medications'" />
  </div>
</template>
