import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { SpecBody, listDesigns, saveDesign } from "@/lib/style/server";

export const GET = route(async ({ user }) => ok({ designs: await listDesigns(user.id) }));
const Body = z.object({ spec: SpecBody, name: z.string().max(60).optional(), prompt: z.string().max(500).optional() });
export const POST = route(async ({ req, user }) => { const b = await parseBody(req, Body); return ok({ design: await saveDesign(user.id, b.spec, b.name, b.prompt) }, 201); });
