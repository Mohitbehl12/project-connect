import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { getPrefs, setPrefs } from "@/lib/style/server";

export const GET = route(async ({ user }) => ok({ prefs: await getPrefs(user.id) }));
const Body = z.object({ fit: z.string().max(20), colors: z.array(z.string().max(30)).max(12), occasions: z.array(z.enum(["office", "wedding", "casual", "festive", "party"])).max(5) });
export const PUT = route(async ({ req, user }) => ok({ prefs: await setPrefs(user.id, await parseBody(req, Body)) }));
