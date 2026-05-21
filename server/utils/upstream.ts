/**
 * Helpers for proxying to care-home-server with the JWT pulled from
 * an httpOnly cookie. Centralises base URL, cookie name, and error mapping.
 */
import type { H3Event } from "h3";

export const COOKIE_NAME = "care_hq_session";

export function getApiBase(): string {
  const config = useRuntimeConfig();
  return config.apiBase.replace(/\/$/, "");
}

export function getSessionToken(event: H3Event): string | null {
  return getCookie(event, COOKIE_NAME) ?? null;
}

export function setSessionCookie(event: H3Event, token: string, ttlSeconds: number) {
  const config = useRuntimeConfig();
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
  });
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: "/" });
}

/**
 * Authenticated $fetch to care-home-server. Throws 401 if no session cookie.
 */
export async function upstream<T = unknown>(
  event: H3Event,
  path: string,
  opts: Parameters<typeof $fetch>[1] = {},
): Promise<T> {
  const token = getSessionToken(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "not authenticated" });
  }
  return await $fetch<T>(`${getApiBase()}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
