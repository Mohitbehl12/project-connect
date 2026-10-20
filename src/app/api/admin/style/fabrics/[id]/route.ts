import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, parseBody, route } from "@/lib/http";
import { FabricBody } from "@/lib/style/server";
export const PUT = route<{ id: string }>(async ({ req, params }) => { const b = await parseBody(req, FabricBody); await db.update(schema.styleFabrics).set({ ...b, updatedAt: new Date() }).where(eq(schema.styleFabrics.id, params.id)); return ok({ saved: true }); }, { permission: "style.manage" });
export const DELETE = route<{ id: string }>(async ({ params }) => { await db.delete(schema.styleFabrics).where(eq(schema.styleFabrics.id, params.id)); return ok({ deleted: true }); }, { permission: "style.manage" });
