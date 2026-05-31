/**
 * Catch-all proxy for tablet API calls: /api/tablet/v1/* → care-home-server /api/v1/*
 *
 * Uses the TABLET session cookie (separate from the HQ session). Lets the
 * tablet frontend hit /api/tablet/v1/residents, /api/tablet/v1/vitals, etc
 * without worrying about which JWT to attach.
 */
import { getApiBase } from "~~/server/utils/upstream";
import { getTabletSession } from "~~/server/utils/tablet";

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, "path") ?? "";
  const token = getTabletSession(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "tablet not authenticated" });
  }

  const search = getRequestURL(event).search;
  const target = `${getApiBase()}/api/v1/${path}${search}`;

  return await proxyRequest(event, target, {
    headers: { Authorization: `Bearer ${token}` },
  });
});
