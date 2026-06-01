/**
 * Tablet routes use the HQ session (caregivers log in at /login). The
 * global HQ auth.global.ts middleware already gates the session AND
 * redirects caregivers/nurses to /tablet, so this middleware is now a
 * no-op. Kept as an empty stub so we can re-introduce tablet-specific
 * guards later without re-registering the middleware.
 */
export default defineNuxtRouteMiddleware(() => {});
