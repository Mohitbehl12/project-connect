import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { leaveFeedback } from "@/lib/style/server";

const Body = z.object({ fit: z.enum(["PERFECT", "TIGHT", "LOOSE"]), rating: z.number().int().min(1).max(5), note: z.string().max(600).default("") });
export const POST = route<{ id: string }>(async ({ req, user, params }) => ok(await leaveFeedback(user.id, params.id, await parseBody(req, Body))));
