/**
 * Tablet auth gate. Runs only on /tablet/* routes (returns early elsewhere).
 *
 * Flow per navigation:
 *   /tablet/pair   → always allow (device not yet paired)
 *   /tablet/login  → allow; if already logged in, jump to /tablet
 *   anything else  → require tablet session; on 401:
 *                    - if device_token cookie exists  → /tablet/login
 *                    - else                           → /tablet/pair
 *
 * The HQ auth.global middleware (auth.global.ts) ignores /tablet/* paths
 * via the early return below so they don't double-trigger redirects.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith("/tablet")) return;

  const { me, refresh } = useTablet();

  if (to.path === "/tablet/pair") return;

  if (to.path === "/tablet/login") {
    if (!me.value) await refresh();
    if (me.value) return navigateTo("/tablet");
    return;
  }

  if (!me.value) {
    const ok = await refresh();
    if (!ok) {
      // 401 could mean: no device paired OR device paired but no PIN session.
      // Try a cheap probe: hit /api/tablet/me again with credentials and
      // inspect the status. Simpler: just try the PIN page first; if device
      // isn't paired, that page will bounce to /tablet/pair.
      return navigateTo("/tablet/login");
    }
  }
});
