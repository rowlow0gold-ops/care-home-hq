/**
 * Global auth gate. Runs on every navigation.
 *
 * - If route is public (login), let it through.
 * - Otherwise hydrate `me` from /api/auth/me on first navigation.
 *   If it fails, bounce to /login with a redirect query.
 */
const PUBLIC_ROUTES = new Set(["/login"]);

export default defineNuxtRouteMiddleware(async (to) => {
  const { me, refresh } = useAuth();

  // /tablet/* has its own auth gate (tablet.global) with a separate session
  // cookie. Skip the HQ auth check entirely so it doesn't bounce caregivers
  // to /login (which would fail because they have no HQ password).
  if (to.path.startsWith("/tablet")) {
    return;
  }

  if (PUBLIC_ROUTES.has(to.path)) {
    return;
  }

  // First nav after a hard reload: try to hydrate the user
  if (!me.value) {
    await refresh();
  }

  if (!me.value) {
    return navigateTo({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }
});
