/**
 * Catch-all proxy: /api/v1/* → care-home-server /api/v1/*
 *
 * Attaches the JWT from the httpOnly cookie. Forwards method, query, and body.
 * This means client code can call $fetch('/api/v1/residents') and the token
 * stays server-side.
 */
import { getApiBase, getSessionToken } from "~~/server/utils/upstream";

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, "path") ?? "";
  const token = getSessionToken(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "not authenticated" });
  }

  const method = (event.method ?? "GET") as
    | "GET"
    | "POST"
    | "PATCH"
    | "PUT"
    | "DELETE";
  const query = getQuery(event);
  const body =
    method === "GET" || method === "DELETE" ? undefined : await readBody(event);

  try {
    return await $fetch(`${getApiBase()}/api/v1/${path}`, {
      method,
      query,
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err: any) {
    throw createError({
      statusCode: err?.status ?? 500,
      statusMessage: err?.statusMessage ?? "upstream error",
      data: err?.data,
    });
  }
});
