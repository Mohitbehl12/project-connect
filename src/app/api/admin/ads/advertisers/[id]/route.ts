import { z } from "zod";
import { setAdvertiserStatus, setVerification } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ action: z.enum(["verify", "trust", "unverify", "suspend", "restore"]), why: z.string().trim().max(300).default("") }));
  if (b.action === "suspend" || b.action === "restore") await setAdvertiserStatus(user, params.id, b.action === "suspend" ? "SUSPENDED" : "ACTIVE", b.why);
  else await setVerification(user, params.id, b.action === "verify" ? "VERIFIED" : b.action === "trust" ? "TRUSTED" : "UNVERIFIED");
  return ok({ done: true });
}, { permission: "ads.review" });
