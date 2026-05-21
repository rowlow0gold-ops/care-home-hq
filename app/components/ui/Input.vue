<script setup lang="ts">
const props = defineProps<{
  modelValue?: string | number;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  autocomplete?: string;
  required?: boolean;
  id?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <input
    :id="id"
    :type="type ?? 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    :required="required"
    class="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm
           placeholder:text-muted-foreground/60 transition-all
           focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15
           disabled:cursor-not-allowed disabled:opacity-50"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  >
</template>
