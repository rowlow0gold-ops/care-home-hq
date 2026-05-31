/**
 * GET /api/tablet/me
 * Returns the currently logged-in caregiver (via tablet session cookie).
 * 401 if not logged in (frontend bounces to /tablet/login).
 * Used by tablet.global middleware to hydrate state on every navigation.
 */
import { tabletUpstream } from "~~/server/utils/tablet";

export default defineEventHandler(async (event) => {
  return await tabletUpstream<{ user: unknown }>(event, "/api/v1/auth/me");
});
