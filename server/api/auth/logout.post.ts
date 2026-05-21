import { clearSessionCookie } from "~~/server/utils/upstream";

export default defineEventHandler((event) => {
  clearSessionCookie(event);
  return { ok: true };
});
