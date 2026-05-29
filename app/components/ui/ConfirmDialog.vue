<script setup lang="ts">
/**
 * Two-step destructive confirmation. Used everywhere we don't want native
 * confirm() (ugly + can't theme + can't show a description / colored CTA).
 *
 * Usage:
 *   const confirmRef = ref<InstanceType<typeof ConfirmDialog> | null>(null);
 *   ...
 *   const ok = await confirmRef.value?.open({
 *     title: "퇴직 처리",
 *     description: "정말 김XX 직원을 퇴직 처리하시겠습니까?",
 *     confirmLabel: "퇴직 처리",
 *     tone: "destructive",
 *   });
 *   if (ok) await doIt();
 *
 *   <ConfirmDialog ref="confirmRef" />
 */
import { AlertTriangle, X } from "@lucide/vue";

interface OpenArgs {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual tone of the confirm button. Default 'primary'. */
  tone?: "primary" | "destructive";
}

const visible = ref(false);
const args = ref<OpenArgs>({ title: "" });
let resolver: ((v: boolean) => void) | null = null;

function open(a: OpenArgs): Promise<boolean> {
  args.value = { confirmLabel: "확인", cancelLabel: "취소", tone: "primary", ...a };
  visible.value = true;
  return new Promise((res) => { resolver = res; });
}
function close(result: boolean) {
  visible.value = false;
  resolver?.(result);
  resolver = null;
}
function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) close(false);
}
function onKey(e: KeyboardEvent) {
  if (!visible.value) return;
  if (e.key === "Escape") close(false);
  else if (e.key === "Enter") close(true);
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));

defineExpose({ open });
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
        @click="onBackdrop"
      >
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-95 translate-y-1"
          leave-active-class="transition duration-100 ease-in"
          leave-to-class="opacity-0 scale-95"
          appear
        >
          <div
            v-if="visible"
            class="bg-card text-foreground rounded-xl shadow-2xl border max-w-md w-full p-5"
            role="dialog"
            aria-modal="true"
          >
            <div class="flex items-start gap-3 mb-3">
              <div
                class="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
                :class="args.tone === 'destructive'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary'"
              >
                <AlertTriangle class="h-5 w-5" />
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="text-base font-semibold">{{ args.title }}</h2>
                <p
                  v-if="args.description"
                  class="text-sm text-muted-foreground mt-1 whitespace-pre-line"
                >
                  {{ args.description }}
                </p>
              </div>
              <button
                type="button"
                class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
                aria-label="닫기"
                @click="close(false)"
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <div class="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                class="h-10 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted"
                @click="close(false)"
              >{{ args.cancelLabel }}</button>
              <button
                type="button"
                class="h-10 px-4 rounded-lg text-sm font-semibold focus:outline-none focus:ring-4"
                :class="args.tone === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive/30'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary/30'"
                @click="close(true)"
              >{{ args.confirmLabel }}</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
