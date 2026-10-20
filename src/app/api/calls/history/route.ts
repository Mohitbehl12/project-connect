import { callHistory } from "@/lib/callRequests";
import { ok, route } from "@/lib/http";

/** Calls and call requests, newest first. */
export const GET = route(async ({ user }) => ok({ items: await callHistory(user) }));
