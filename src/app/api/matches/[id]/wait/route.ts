import { ok, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { waitForChat } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Long poll: returns as soon as this conversation changes or the other person starts/stops typing
 * (at most ~25 s). The app then fetches new messages. ?v=<last version>&typing=<0|1>
 */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const { match, otherId } = await requireMatch(params.id, user.id, { allowEnded: true });
  const u = new URL(req.url);
  const since = Number(u.searchParams.get("v") ?? -1);
  const typingWas = u.searchParams.get("typing") === "1";
  const wait = Math.min(25_000, Math.max(0, Number(u.searchParams.get("wait") ?? 25_000)));
  return ok(await waitForChat(match.id, otherId, since, typingWas, wait, req.signal));
}, { allowSuspended: true });
