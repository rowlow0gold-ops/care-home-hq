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
