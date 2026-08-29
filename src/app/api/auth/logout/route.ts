import { route, ok } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export const POST = route(async () => {
  await clearSessionCookie();
  return ok({ ok: true });
});
