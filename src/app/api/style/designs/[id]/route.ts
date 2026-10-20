import { ok, route } from "@/lib/http";
import { deleteDesign } from "@/lib/style/server";

export const DELETE = route<{ id: string }>(async ({ user, params }) => { await deleteDesign(user.id, params.id); return ok({ deleted: true }); });
