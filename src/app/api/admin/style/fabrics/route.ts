import { db, schema } from "@/db";
import { ok, parseBody, route } from "@/lib/http";
import { FabricBody, listFabrics } from "@/lib/style/server";
export const GET = route(async () => ok({ fabrics: await listFabrics() }), { permission: "style.view" });
export const POST = route(async ({ req }) => { const b = await parseBody(req, FabricBody); const [f] = await db.insert(schema.styleFabrics).values(b).returning(); return ok({ fabric: f }, 201); }, { permission: "style.manage" });
