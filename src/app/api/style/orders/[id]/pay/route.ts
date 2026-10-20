import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody } from "@/lib/http";
import { verifyScoped } from "@/lib/paytoken";
import { payInfo, testPay, verifyClientPayment } from "@/lib/style/server";

// Used by the hosted pay page (/style/pay/[id]) with its short-lived token, like subscription payments.
async function who(req: Request, id: string) {
  const t = new URL(req.url).searchParams.get("t") ?? req.headers.get("x-pay-token");
  const uid = await verifyScoped(t, "pay", `style:${id}`);
  if (!uid) throw new ApiError(401, "This payment link has expired. Open your order again to pay.", "expired_link");
  return uid;
}
const wrap = (fn: (req: Request, id: string) => Promise<unknown>) => async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  try { const { id } = await ctx.params; return NextResponse.json(await fn(req, id)); }
  catch (e) { const err = e instanceof ApiError ? e : null; return NextResponse.json({ error: err?.message ?? "Something went wrong.", code: err?.code ?? "internal" }, { status: err?.status ?? 500 }); }
};
export const GET = wrap(async (req, id) => payInfo(await who(req, id), id));
const Body = z.object({ action: z.enum(["verify", "test"]), paymentId: z.string().max(80).optional(), signature: z.string().max(200).optional() });
export const POST = wrap(async (req, id) => {
  const uid = await who(req, id);
  const b = await parseBody(req, Body);
  return { result: b.action === "test" ? await testPay(uid, id) : await verifyClientPayment(uid, id, b.paymentId ?? "", b.signature ?? "") };
});
