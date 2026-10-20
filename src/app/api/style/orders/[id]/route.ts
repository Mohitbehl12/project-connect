import { ok, route } from "@/lib/http";
import { myOrder } from "@/lib/style/server";

export const GET = route<{ id: string }>(async ({ user, params }) => ok({ order: await myOrder(user.id, params.id) }));
