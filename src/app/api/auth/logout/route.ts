import { destroySession } from "@/lib/auth";
import { ok, publicRoute } from "@/lib/http";

export const POST = publicRoute(async () => {
  await destroySession();
  return ok({ ok: true });
});
