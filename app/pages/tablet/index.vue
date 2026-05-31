<script setup lang="ts">
/**
 * /tablet — entry point. Caregivers land here after PIN login. We jump
 * straight to the residents list (the actual content) instead of a tile
 * picker; v1 has one path: pick a resident → record info.
 */
definePageMeta({ layout: "tablet" });
useHead({ title: "케어닥" });

onMounted(() => {
  navigateTo("/tablet/residents", { replace: true });
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center text-muted-foreground">
    이동 중…
  </div>
</template>
