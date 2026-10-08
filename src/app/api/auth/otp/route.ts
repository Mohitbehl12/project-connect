import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { issueOtp, verifyOtp } from "@/lib/otp";
import { audit } from "@/lib/audit";

const Send = z.object({
  action: z.literal("send"),
  channel: z.enum(["EMAIL", "PHONE"]),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +919876543210").optional(),
});
const Verify = z.object({ action: z.literal("verify"), channel: z.enum(["EMAIL", "PHONE"]), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });
const Body = z.discriminatedUnion("action", [Send, Verify]);

export const POST = route(async ({ req, user }) => {
  const body = await parseBody(req, Body);

  if (body.action === "send") {
    rateLimit(`otp:${user.id}`, 5, 60 * 60_000);
    let destination = user.email;
    if (body.channel === "PHONE") {
      if (!body.phone) throw new ApiError(422, "phone: Enter your mobile number.", "validation");
      const taken = await db.query.users.findFirst({ where: and(eq(schema.users.phone, body.phone), ne(schema.users.id, user.id)) });
      if (taken) throw new ApiError(409, "This number is linked to another account.", "phone_taken");
      await db.update(schema.users).set({ phone: body.phone, phoneVerified: false }).where(eq(schema.users.id, user.id));
      destination = body.phone;
    }
    const devOtp = await issueOtp(user.id, body.channel, destination);
    return ok({ sent: true, devOtp });
  }

  await verifyOtp(user.id, body.channel, body.code);
  await db.update(schema.users)
    .set(body.channel === "EMAIL" ? { emailVerified: true } : { phoneVerified: true })
    .where(eq(schema.users.id, user.id));
  await audit(user.id, `verify.${body.channel.toLowerCase()}`, "user", user.id);
  return ok({ verified: true });
}, { allowSuspended: true });
