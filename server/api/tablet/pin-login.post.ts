/**
 * POST /api/tablet/pin-login
 * Body: { email: string, pin: string }
 *
 * Pulls the device_token from the cookie set during /api/tablet/claim,
 * forwards to care-home-server /api/v1/auth/pin, and stores the returned
 * JWT in a separate tablet session cookie (8h shift TTL).
 */
import { z } from "zod";
import { getApiBase } from "~~/server/utils/upstream";
import { getDeviceToken, setTabletSession } from "~~/server/utils/tablet";

const Body = z.object({
  email: z.string().email(),
  pin:   z.string().regex(/^\d{4,8}$/, "PIN must be 4-8 digits"),
});

interface PinLoginResp {
  access_token: string;
  token_type:   string;
  expires_in:   number;
  user: {
    id:         string;
    email:      string;
    name:       string;
    role:       string;
    tenant_id:  string;
    branch_id:  string | null;
  };
}

export default defineEventHandler(async (event) => {
  const body = Body.parse(await readBody(event));
  // device_token is now optional; include it if we have one (lets paired
  // tablets continue to work) but missing is fine for the typical case
  // where the worker is just using the website on their tablet.
  const deviceToken = getDeviceToken(event) ?? "";

  let res: PinLoginResp;
  try {
    res = await $fetch<PinLoginResp>(`${getApiBase()}/api/v1/auth/pin`, {
      method: "POST",
      body: { device_token: deviceToken, email: body.email, pin: body.pin },
    });
  } catch (err: any) {
    // Backend uses 401 for bad creds + 403 for cross-branch attempts; map
    // both to a generic friendly message so we don't leak which one failed.
    throw createError({
      statusCode: err?.status === 403 ? 403 : 401,
      statusMessage: "이메일 또는 PIN이 올바르지 않습니다",
    });
  }

  setTabletSession(event, res.access_token, res.expires_in);
  return { ok: true, user: res.user };
});
