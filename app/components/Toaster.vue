<script setup lang="ts">
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-vue-next";

const { toasts, dismiss } = useToast();

const iconFor = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  default: Info,
};
const toneFor = {
  success: "bg-primary/10 text-primary border-primary/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800",
  default: "bg-card text-foreground border-border",
};
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-x-4"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto rounded-lg border shadow-lg p-3 pr-2 flex items-start gap-3 backdrop-blur-sm"
          :class="toneFor[t.kind]"
          role="status"
        >
          <component :is="iconFor[t.kind]" class="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p v-if="t.title" class="text-sm font-semibold">{{ t.title }}</p>
            <p class="text-sm leading-snug" :class="t.title ? 'mt-0.5 opacity-90' : ''">
              {{ t.message }}
            </p>
          </div>
          <button
            class="flex-shrink-0 p-1 rounded hover:bg-foreground/5 transition-colors"
            aria-label="닫기"
            @click="dismiss(t.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
