/**
 * Tiny toast notification system. No third-party dep — just a useState
 * queue that the <Toaster /> root renders. Auto-dismiss after 3s.
 */
export interface Toast {
  id: number;
  kind: "default" | "success" | "error" | "warning";
  title?: string;
  message: string;
}

let _seq = 0;

export function useToast() {
  const toasts = useState<Toast[]>("toasts", () => []);

  function push(t: Omit<Toast, "id">) {
    const id = ++_seq;
    toasts.value = [...toasts.value, { id, ...t }];
    setTimeout(() => {
      toasts.value = toasts.value.filter((x) => x.id !== id);
    }, 3500);
  }

  return {
    toasts,
    dismiss: (id: number) => {
      toasts.value = toasts.value.filter((x) => x.id !== id);
    },
    info:    (message: string, title?: string) => push({ kind: "default", message, title }),
    success: (message: string, title?: string) => push({ kind: "success", message, title }),
    error:   (message: string, title?: string) => push({ kind: "error",   message, title }),
    warning: (message: string, title?: string) => push({ kind: "warning", message, title }),
  };
}
