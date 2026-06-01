/**
 * Tablet caregiver helpers. After dropping the PIN-login flow, the tablet
 * UI runs on the SAME session as the HQ web — caregivers log in at /login
 * with email + password and are auto-redirected to /tablet by the global
 * auth middleware. This composable now just proxies useAuth() so existing
 * tablet pages keep compiling without rewriting every `useTablet()` call.
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

export function useTablet() {
  // Re-use the HQ auth state. Cast through unknown because the HQ user has
  // a few extra fields (branch_name, tenant_name) the tablet doesn't care
  // about — the shape is a structural superset.
  const { me: hqMe, logout: hqLogout } = useAuth();
  const me = computed<TabletUser | null>(() => (hqMe.value as TabletUser | null));

  return {
    me,
    logout: () => hqLogout(),
  };
}

/**
 * Tablet API wrapper — now just `useApi()` under the hood. Kept as a
 * separate composable so existing pages don't need to be rewritten.
 * `/v1/*` calls go through `/api/v1/[...path]` which attaches the HQ
 * session JWT — same cookie a caregiver gets from /login.
 */
export function useTabletApi() {
  return useApi();
}
