import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { SpecBody, quoteFor } from "@/lib/style/server";

export const POST = route(async ({ req }) => ok(quoteFor((await parseBody(req, z.object({ spec: SpecBody }))).spec)));
