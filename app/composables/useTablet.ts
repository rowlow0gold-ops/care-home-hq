/**
 * Tablet (caregiver) auth + helpers. Mirrors useAuth but uses the
 * tablet session cookie under /api/tablet/* so it doesn't collide with
 * the HQ session — a single browser could in theory be logged into both.
 *
 * UX assumption: one caregiver per tablet (BYOD-style). Email is
 * remembered in localStorage so the daily login is PIN only.
 */
interface TabletUser {
  id:         string;
  email:      string;
  name:       string;
  role:       string;
  tenant_id:  string;
  branch_id:  string | null;
  branch_name?: string | null;
}

const LAST_EMAIL_KEY = "care_tablet_last_email";

export function useTablet() {
  const me = useState<TabletUser | null>("tablet.me", () => null);
  const router = useRouter();

  async function refresh(): Promise<boolean> {
    try {
      const res = await $fetch<{ user: TabletUser }>("/api/tablet/me");
      me.value = res.user;
      if (res.user?.email && import.meta.client) {
        localStorage.setItem(LAST_EMAIL_KEY, res.user.email);
      }
      return true;
    } catch {
      me.value = null;
      return false;
    }
  }

  async function pinLogin(email: string, pin: string) {
    const res = await $fetch<{ ok: true; user: TabletUser }>("/api/tablet/pin-login", {
      method: "POST",
      body: { email, pin },
    });
    me.value = res.user;
    if (import.meta.client) {
      localStorage.setItem(LAST_EMAIL_KEY, email);
    }
    await router.push("/tablet");
  }

  async function logout(opts: { unpair?: boolean } = {}) {
    await $fetch("/api/tablet/logout", {
      method: "POST",
      query: opts.unpair ? { full: "true" } : {},
    });
    me.value = null;
    await router.push(opts.unpair ? "/tablet/pair" : "/tablet/login");
  }

  async function claim(code: string, label: string) {
    return await $fetch<{ device_id: string; branch_id: string; branch_name: string }>(
      "/api/tablet/claim",
      { method: "POST", body: { code, label } },
    );
  }

  function rememberedEmail(): string {
    if (!import.meta.client) return "";
    return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  }

  function forgetEmail() {
    if (import.meta.client) localStorage.removeItem(LAST_EMAIL_KEY);
  }

  return { me, refresh, pinLogin, logout, claim, rememberedEmail, forgetEmail };
}

/**
 * Tablet-specific API wrapper. Routes through /api/tablet/v1/* so the
 * tablet's JWT cookie is attached instead of the HQ one.
 */
export function useTabletApi() {
  const { logout } = useTablet();
  const router = useRouter();

  async function request<T>(path: string, opts: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    try {
      return await $fetch<T>(`/api/tablet${path}`, opts);
    } catch (err: any) {
      if (err?.status === 401) {
        await router.push("/tablet/login");
      }
      throw err;
    }
  }

  return {
    get:    <T = unknown>(path: string, query?: Record<string, unknown>) => request<T>(path, { method: "GET", query }),
    post:   <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
    patch:  <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
    delete: <T = unknown>(path: string)                 => request<T>(path, { method: "DELETE" }),
  };
}
