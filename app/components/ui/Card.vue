<script setup lang="ts">
defineProps<{ title?: string; description?: string }>();
</script>

<template>
  <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
    <div v-if="title || description || $slots.header" class="flex flex-col space-y-1.5 p-6">
      <slot name="header">
        <h3 v-if="title" class="text-lg font-semibold leading-none tracking-tight">
          {{ title }}
        </h3>
        <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
      </slot>
    </div>
    <div :class="title || description || $slots.header ? 'p-6 pt-0' : 'p-6'">
      <slot />
    </div>
    <div v-if="$slots.footer" class="flex items-center p-6 pt-0">
      <slot name="footer" />
    </div>
  </div>
</template>
