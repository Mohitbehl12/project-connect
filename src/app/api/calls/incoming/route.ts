import { waitForIncoming } from "@/lib/calls";
import { ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Long poll while the app is open: returns as soon as someone calls (at most ~25 s). ?wait=<ms> */
export const GET = route(async ({ req, user }) => {
  const wait = Math.min(25_000, Math.max(0, Number(new URL(req.url).searchParams.get("wait") ?? 25_000)));
  return ok(await waitForIncoming(user, wait, req.signal));
});
