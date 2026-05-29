<script setup lang="ts">
/**
 * Reusable form-row label/control/error wrapper. Default slot = the input.
 *
 * Usage:
 *   <FieldRow label="이름" :error="errors.full_name">
 *     <input v-model="form.full_name" class="..." />
 *   </FieldRow>
 */
withDefaults(
  defineProps<{
    label: string;
    error?: string | null;
    hint?: string;
    required?: boolean;
  }>(),
  { error: null, hint: undefined, required: false },
);
</script>

<template>
  <label class="block space-y-1">
    <span class="text-xs font-medium text-foreground/80 flex items-center gap-1">
      {{ label }}
      <span v-if="required" class="text-destructive">*</span>
    </span>
    <slot />
    <span
      v-if="error"
      class="block text-xs text-destructive"
    >{{ error }}</span>
    <span
      v-else-if="hint"
      class="block text-xs text-muted-foreground"
    >{{ hint }}</span>
  </label>
</template>
