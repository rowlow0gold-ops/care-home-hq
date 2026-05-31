/**
 * Tablet (caregiver) session helpers.
 *
 * Separate from the HQ session — different cookie, different lifetime, and
 * the device_token is stored as a long-lived cookie too so daily PIN login
 * only requires the worker to tap their PIN, not re-pair the tablet.
 *
 * Cookies set on tablet pair + PIN login:
 *   care_tablet_device  — device_token from /devices/claim (1 year)
 *   care_tablet_session — JWT from /auth/pin (8h shift)
 *
 * All /api/tablet/* server routes attach the JWT cookie when proxying
 * to care-home-server. All other /api/v1/* requests from a tablet are
 * served by the catch-all proxy ([...path].ts), so the tablet's JWT
 * cookie must take precedence over the HQ cookie when both are present.
 * That logic lives in upstream.ts (HQ-side) and tablet-upstream below.
 */
import type { H3Event } from "h3";
import { getApiBase } from "./upstream";

export const DEVICE_COOKIE  = "care_tablet_device";
export const SESSION_COOKIE = "care_tablet_session";

const DEVICE_TTL  = 60 * 60 * 24 * 365; // 1 year — survives reboots
const SESSION_TTL = 60 * 60 * 8;        // 8 hour shift cap

export function getDeviceToken(event: H3Event): string | null {
  return getCookie(event, DEVICE_COOKIE) ?? null;
}

export function getTabletSession(event: H3Event): string | null {
  return getCookie(event, SESSION_COOKIE) ?? null;
}

export function setDeviceToken(event: H3Event, token: string) {
  const config = useRuntimeConfig();
  setCookie(event, DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_TTL,
  });
}

export function setTabletSession(event: H3Event, token: string, ttlSeconds?: number) {
  const config = useRuntimeConfig();
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds ?? SESSION_TTL,
  });
}

export function clearTabletSession(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: "/" });
}

export function clearTabletDevice(event: H3Event) {
  deleteCookie(event, DEVICE_COOKIE, { path: "/" });
}

/**
 * Authenticated upstream call using the TABLET session cookie. Throws 401
 * if no tablet session present.
 */
export async function tabletUpstream<T = unknown>(
  event: H3Event,
  path: string,
  opts: Parameters<typeof $fetch>[1] = {},
): Promise<T> {
  const token = getTabletSession(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "tablet not authenticated" });
  }
  return await $fetch<T>(`${getApiBase()}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
