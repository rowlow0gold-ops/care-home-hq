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

// Native date / month / time pickers don't open from a single click on the
// field body — only from the tiny calendar icon. Browsers that support
// showPicker() (Chrome 99+, Edge, Safari 16+) let us trigger it manually, so
// clicking anywhere in the input opens the popup.
const pickerTypes = new Set(["date", "month", "week", "time", "datetime-local"]);
function maybeOpenPicker(e: MouseEvent) {
  const t = props.type ?? "text";
  if (!pickerTypes.has(t)) return;
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof el.showPicker === "function") {
    try { el.showPicker(); } catch { /* user gesture required — ignore */ }
  }
}
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
    @click="maybeOpenPicker"
  >
</template>
