import { upstream } from "~~/server/utils/upstream";

export default defineEventHandler(async (event) => {
  return await upstream(event, "/api/v1/auth/me");
});
