<script setup lang="ts">
/**
 * Themed two-step confirmation modal. Uses v-model:open for visibility
 * (controllable from parent) and emits 'confirm' / 'cancel'.
 *
 * Usage:
 *   const showConfirm = ref(false);
 *   <ConfirmDialog
 *     v-model:open="showConfirm"
 *     title="퇴직 처리"
 *     description="정말 처리합니까?"
 *     confirm-label="퇴직 처리"
 *     tone="destructive"
 *     @confirm="doIt"
 *   />
 *   then: showConfirm.value = true
 */
import { AlertTriangle, X } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "primary" | "destructive";
  }>(),
  {
    description: undefined,
    confirmLabel: "확인",
    cancelLabel: "취소",
    tone: "primary",
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();

function close(via: "confirm" | "cancel") {
  emit("update:open", false);
  emit(via);
}
function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) close("cancel");
}
function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === "Escape") { e.preventDefault(); close("cancel"); }
  else if (e.key === "Enter") { e.preventDefault(); close("confirm"); }
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
      role="presentation"
      @click="onBackdrop"
    >
      <div
        class="bg-card text-foreground rounded-xl shadow-2xl border max-w-md w-full p-5"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-start gap-3 mb-3">
          <div
            class="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
            :class="tone === 'destructive'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary'"
          >
            <AlertTriangle class="h-5 w-5" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold">{{ title }}</h2>
            <p
              v-if="description"
              class="text-sm text-muted-foreground mt-1 whitespace-pre-line"
            >{{ description }}</p>
          </div>
          <button
            type="button"
            class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="닫기"
            @click="close('cancel')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            class="h-10 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted"
            @click="close('cancel')"
          >{{ cancelLabel }}</button>
          <button
            type="button"
            class="h-10 px-4 rounded-lg text-sm font-semibold focus:outline-none focus:ring-4"
            :class="tone === 'destructive'
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive/30'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary/30'"
            @click="close('confirm')"
          >{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
