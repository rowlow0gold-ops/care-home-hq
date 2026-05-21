/**
 * Tiny typed wrapper over $fetch that talks to our internal Nuxt server routes
 * under /api/*. Those routes proxy to care-home-server and attach the JWT
 * from an httpOnly cookie, so the browser never sees the token.
 */
export function useApi() {
  const router = useRouter();

  async function request<T>(
    path: string,
    opts: Parameters<typeof $fetch>[1] = {},
  ): Promise<T> {
    try {
      return await $fetch<T>(`/api${path}`, opts);
    } catch (err: any) {
      if (err?.status === 401) {
        // session expired — bounce to login
        await router.push("/login");
      }
      throw err;
    }
  }

  return {
    get: <T = unknown>(path: string, query?: Record<string, unknown>) =>
      request<T>(path, { method: "GET", query }),
    post: <T = unknown>(path: string, body?: unknown) =>
      request<T>(path, { method: "POST", body }),
    patch: <T = unknown>(path: string, body?: unknown) =>
      request<T>(path, { method: "PATCH", body }),
    delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}
