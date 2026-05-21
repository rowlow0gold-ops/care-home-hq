<script setup lang="ts">
defineProps<{ class?: string; w?: string; h?: string }>();
</script>

<template>
  <div
    class="skeleton"
    :class="$attrs.class as string"
    :style="{ width: w, height: h ?? '1em' }"
  />
</template>
