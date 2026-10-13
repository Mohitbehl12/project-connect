/** Money from minor units (paise/cents). ₹1, ₹100, ₹49.50. */
export function money(minor: number, currency = "INR") {
  const v = minor / 100;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", { style: "currency", currency, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
}

export function niceDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const per = (days?: number) => (days === 30 || days === 31 ? "month" : days === 7 ? "week" : days === 365 ? "year" : `${days} days`);
