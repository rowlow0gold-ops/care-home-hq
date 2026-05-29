/**
 * Wraps a single-shot API mutation with pending / error / success state,
 * automatic toast, and a refresh callback that fires after success.
 *
 * Usage:
 *   const update = useApiMutation(
 *     (body) => api.patch(`/v1/staff/${id}`, body),
 *     {
 *       successMessage: "직원 정보가 수정되었습니다",
 *       onSuccess: () => refresh(),  // re-fetch the detail
 *     },
 *   );
 *   ...
 *   await update.run({ full_name: "...", ... });
 *   update.pending.value
 *   update.error.value
 *
 * Errors are auto-toasted with the server's message when available.
 * Mirrors React-Query's mutation shape but minimal — we don't have RQ.
 */
export interface UseApiMutationOpts<Result> {
  /** Toast to fire on success. Falsy = no toast. */
  successMessage?: string | ((r: Result) => string);
  /** Toast to fire on error. Defaults to the server message. Falsy = no toast. */
  errorMessage?: string | ((e: any) => string);
  /** Called once the mutation resolves. */
  onSuccess?: (r: Result) => void | Promise<void>;
  /** Called when the mutation throws (after the toast). */
  onError?: (e: any) => void | Promise<void>;
}

export function useApiMutation<Input, Result>(
  fn: (input: Input) => Promise<Result>,
  opts: UseApiMutationOpts<Result> = {},
) {
  const toast = useToast();
  const pending = ref(false);
  const error = ref<string | null>(null);
  const data = ref<Result | null>(null) as Ref<Result | null>;

  async function run(input: Input): Promise<Result | null> {
    pending.value = true;
    error.value = null;
    try {
      const r = await fn(input);
      data.value = r;
      pending.value = false;
      if (opts.successMessage) {
        const msg = typeof opts.successMessage === "function"
          ? opts.successMessage(r)
          : opts.successMessage;
        toast.success(msg);
      }
      await opts.onSuccess?.(r);
      return r;
    } catch (e: any) {
      pending.value = false;
      // ofetch puts the server JSON error body on .data
      const serverMsg =
        e?.data?.message ??
        e?.statusMessage ??
        e?.message ??
        "요청 처리 중 오류가 발생했습니다";
      error.value = serverMsg;
      if (opts.errorMessage !== "") {
        const msg = typeof opts.errorMessage === "function"
          ? opts.errorMessage(e)
          : (opts.errorMessage ?? serverMsg);
        // useToast.error(message, title?) — server message body, "실패" as title.
        toast.error(msg, "실패");
      }
      await opts.onError?.(e);
      return null;
    }
  }

  return { run, pending, error, data };
}
