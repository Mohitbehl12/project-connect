import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { schema } from "@/db";
import { getConfig } from "./config";
import { planName } from "./pricing";

const money = (minor: number, cur: string) => `${cur} ${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A simple tax invoice as a PDF. Prices are GST-inclusive; the split shown is computed from the
 * configured rate. Have a chartered accountant confirm the layout (place of supply, CGST/SGST vs IGST)
 * before launch — see docs/PAYMENTS.md.
 */
export async function invoicePdf(p: typeof schema.payments.$inferSelect, buyer: { name: string; email: string }) {
  const seller = await getConfig("billing.seller");
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${p.invoiceNo}`);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.11, 0.23), muted = rgb(0.36, 0.36, 0.51), brand = rgb(0.18, 0.16, 0.43);
  let y = 790;
  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(s, { x, y, size, font: f, color });
  const line = () => { page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 0.6, color: rgb(0.88, 0.87, 0.94) }); };

  text("Kinara", 50, 20, bold, brand); y -= 18;
  text("TAX INVOICE", 50, 11, bold, muted); y -= 30;

  text(seller.name, 50, 10, bold); text(`Invoice no.  ${p.invoiceNo}`, 340, 10, bold); y -= 14;
  text(seller.address, 50, 9, font, muted); text(`Date  ${(p.paidAt ?? p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, 340, 9, font, muted); y -= 14;
  text(seller.gstin ? `GSTIN  ${seller.gstin}` : "GSTIN  (to be added)", 50, 9, font, muted); text(`Payment ref.  ${p.providerPaymentId ?? p.id}`, 340, 9, font, muted); y -= 14;
  text(seller.email, 50, 9, font, muted); y -= 30;

  text("Billed to", 50, 9, bold, muted); y -= 14;
  text(buyer.name || "Member", 50, 10, bold); y -= 13;
  text(buyer.email, 50, 9, font, muted); y -= 34;

  text("Description", 50, 9, bold, muted); text("Amount", 480, 9, bold, muted); y -= 8; line(); y -= 14;
  const desc = p.purpose === "RENEWAL" ? `${planName(p.planCode)} — renewal` : p.purpose === "PASS" ? `${planName(p.planCode)} — one-off pass` : `${planName(p.planCode)} — first payment`;
  const gross = p.amountMinor + p.discountMinor;
  text(desc, 50, 10); text(money(gross, p.currency), 470, 10); y -= 16;
  if (p.discountMinor) { text(`Discount${p.couponCode ? ` (${p.couponCode})` : ""}`, 50, 10, font, muted); text(`- ${money(p.discountMinor, p.currency)}`, 462, 10, font, muted); y -= 16; }
  y -= 4; line(); y -= 14;
  const rate = seller.gstRatePct;
  const taxable = Math.round((p.amountMinor * 100) / (100 + rate));
  text("Taxable value", 300, 10, font, muted); text(money(taxable, p.currency), 470, 10); y -= 15;
  text(`GST @ ${rate}% (included)`, 300, 10, font, muted); text(money(p.amountMinor - taxable, p.currency), 470, 10); y -= 18;
  text("Total paid", 300, 12, bold); text(money(p.amountMinor, p.currency), 466, 12, bold); y -= 22;
  if (p.refundedMinor) { text("Refunded", 300, 10, font, muted); text(`- ${money(p.refundedMinor, p.currency)}`, 462, 10, font, muted); y -= 16; }
  text(`Paid by ${p.method ? p.method.toUpperCase() : "online payment"} via ${p.provider === "MOCK" ? "TEST MODE (no money moved)" : p.provider === "RAZORPAY" ? "Razorpay" : p.provider}.`, 50, 9, font, muted); y -= 40;

  text("Card numbers, UPI PINs and bank details are handled by the payment gateway and are never stored by Kinara.", 50, 8, font, muted); y -= 12;
  text("Questions about this invoice? Write to us from Settings > Help.", 50, 8, font, muted);
  return doc.save();
}
