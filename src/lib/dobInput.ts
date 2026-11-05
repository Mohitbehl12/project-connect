// Typing a birthday as Day → Month → Year: the cursor moves on by itself once a part is complete, so people
// type "04 11 1995" without tapping each box. Pure functions shared by the website and the app (unit tested).

export type DobPart = "day" | "month" | "year";

/** Keeps digits only, at most `max` of them. */
export const digits = (t: string, max: number) => t.replace(/\D/g, "").slice(0, max);

/**
 * Cleans what was typed in one box and says whether to move to the next box.
 * Day is complete at 2 digits, or at 1 digit that can't start a two-digit day (4–9 → "04"… "09").
 * Month is complete at 2 digits, or at 1 digit that can't start a two-digit month (2–9 → "02"… "09").
 */
export function typePart(part: DobPart, raw: string): { value: string; advance: boolean } {
  if (part === "year") { const v = digits(raw, 4); return { value: v, advance: false }; }
  const v = digits(raw, 2);
  const lone = part === "day" ? /^[4-9]$/ : /^[2-9]$/;
  if (lone.test(v)) return { value: `0${v}`, advance: true };
  return { value: v, advance: v.length === 2 };
}

/** A whole date pasted or autofilled into one box: "04/11/1995", "4-11-1995", "04.11.1995", "1995-11-04", "04111995". */
export function parseWholeDate(raw: string): { day: string; month: string; year: string } | null {
  const t = raw.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return { year: m[1], month: m[2].padStart(2, "0"), day: m[3].padStart(2, "0") };
  m = t.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/) ?? t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return { day: m[1].padStart(2, "0"), month: m[2].padStart(2, "0"), year: m[3] };
  return null;
}

/** ISO date if the three parts make a real date, else null. */
export function toIso(day: string, month: string, year: string): string | null {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || year.length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
