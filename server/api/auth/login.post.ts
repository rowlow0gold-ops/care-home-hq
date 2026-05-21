/**
 * POST /api/auth/login
 * Proxies to care-home-server /api/v1/auth/login and stores the JWT in
 * an httpOnly cookie. The browser never sees the token.
 */
import { z } from "zod";
import { getApiBase, setSessionCookie } from "~~/server/utils/upstream";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

interface LoginResponse {
  token: string;
  expires_in: number;
}

export default defineEventHandler(async (event) => {
  const body = Body.parse(await readBody(event));

  let res: LoginResponse;
  try {
    res = await $fetch<LoginResponse>(`${getApiBase()}/api/v1/auth/login`, {
      method: "POST",
      body,
    });
  } catch (err: any) {
    throw createError({
      statusCode: err?.status ?? 401,
      statusMessage: err?.statusMessage ?? "login failed",
    });
  }

  setSessionCookie(event, res.token, res.expires_in);
  return { ok: true };
});
