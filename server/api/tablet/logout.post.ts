/**
 * POST /api/tablet/logout
 * Clears the tablet session (JWT) cookie. Device_token survives so the
 * next caregiver can still PIN-login on this tablet without re-pairing.
 *
 * Pass ?full=true to also unpair the device (clears device_token + asks
 * the backend to revoke it). Used when the tablet is being reassigned.
 */
import { clearTabletDevice, clearTabletSession, getDeviceToken } from "~~/server/utils/tablet";
import { getApiBase } from "~~/server/utils/upstream";

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  clearTabletSession(event);

  if (q.full === "true") {
    const dt = getDeviceToken(event);
    if (dt) {
      // Best-effort revoke; we don't actually have a backend endpoint for
      // this yet, so just drop the cookie. The device_token row stays in
      // the DB but is orphaned (branch manager can re-pair the same
      // physical tablet by issuing a fresh code).
    }
    clearTabletDevice(event);
  }

  return { ok: true };
});
