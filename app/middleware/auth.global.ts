/**
 * Global auth gate. Runs on every navigation.
 *
 * - "/" is the public marketing landing page — anyone can view it. Logged-in
 *   managers visiting "/" get bounced to "/dashboard" so they don't see the
 *   marketing site after signing in.
 * - "/login" is also public.
 * - "/tablet/*" has its own session handling; skip the HQ gate entirely.
 * - Everything else requires a manager-level HQ session.
 */
const PUBLIC_ROUTES = new Set(["/", "/login"]);

export default defineNuxtRouteMiddleware(async (to) => {
  const { me, refresh } = useAuth();

  if (to.path.startsWith("/tablet")) {
    return;
  }

  if (PUBLIC_ROUTES.has(to.path)) {
    // Logged-in managers landing on the public homepage should jump
    // straight to the dashboard. We still hydrate so we know who they are.
    if (to.path === "/") {
      if (!me.value) await refresh().catch(() => {});
      if (me.value && me.value.role !== "caregiver" && me.value.role !== "nurse") {
        return navigateTo("/dashboard");
      }
      if (me.value && (me.value.role === "caregiver" || me.value.role === "nurse")) {
        return navigateTo("/tablet");
      }
    }
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

  // Hard rule: caregivers + nurses use the TABLET program inside the HQ
  // site. They never see Dashboard / 케어 관리 / etc. If one lands here
  // (bookmark, deep link, etc.), bounce them straight to /tablet.
  if (me.value.role === "caregiver" || me.value.role === "nurse") {
    return navigateTo("/tablet");
  }
});
