/**
 * Catch-all proxy: /api/v1/* → care-home-server /api/v1/*
 *
 * Attaches the JWT from the httpOnly cookie. Forwards method, query, and body.
 * Uses h3's proxyRequest so binary responses (XLSX downloads) stream through
 * verbatim with their Content-Type and Content-Disposition headers intact.
 */
import { getApiBase, getSessionToken } from "~~/server/utils/upstream";

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, "path") ?? "";
  const token = getSessionToken(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "not authenticated" });
  }

  const search = getRequestURL(event).search; // includes leading "?" if any
  const target = `${getApiBase()}/api/v1/${path}${search}`;

  return await proxyRequest(event, target, {
    headers: { Authorization: `Bearer ${token}` },
  });
});
