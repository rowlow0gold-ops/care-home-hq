/**
 * POST /api/tablet/claim
 * Body: { code: string, label: string }
 *
 * Proxies to care-home-server /api/v1/devices/claim (public, no JWT).
 * On success, stores the returned device_token in an httpOnly cookie that
 * lasts 1 year — caregiver only needs to PIN-login from that point.
 */
import { z } from "zod";
import { getApiBase } from "~~/server/utils/upstream";
import { setDeviceToken } from "~~/server/utils/tablet";

const Body = z.object({
  code:  z.string().min(4).max(16),
  label: z.string().min(1).max(80),
});

interface ClaimResp {
  device_token: string;
  device_id:    string;
  branch_id:    string;
  branch_name:  string;
}

export default defineEventHandler(async (event) => {
  const body = Body.parse(await readBody(event));

  let res: ClaimResp;
  try {
    res = await $fetch<ClaimResp>(`${getApiBase()}/api/v1/devices/claim`, {
      method: "POST",
      body,
    });
  } catch (err: any) {
    throw createError({
      statusCode: err?.status ?? 400,
      statusMessage: err?.data?.message ?? err?.statusMessage ?? "pair failed",
    });
  }

  setDeviceToken(event, res.device_token);
  // Return everything except the token — frontend doesn't need to see it.
  return {
    device_id:   res.device_id,
    branch_id:   res.branch_id,
    branch_name: res.branch_name,
  };
});
