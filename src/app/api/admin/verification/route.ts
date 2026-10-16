import { ok, route } from "@/lib/http";
import { verificationQueue } from "@/lib/verification";

export const GET = route(async () => ok({ queue: await verificationQueue() }), { permission: "users.verify" });
