"use client";
import { useRef, useState } from "react";
import { parseWholeDate, toIso, typePart, type DobPart } from "@/lib/dobInput";

/**
 * Date of birth as Day → Month → Year boxes. Focus moves on by itself once a part is complete, Backspace in an
 * empty box goes back, and a whole pasted or autofilled date fills all three. `onChange` gets an ISO date
 * (YYYY-MM-DD) once the date is real, otherwise "".
 */
export function DobInput({ id, onChange }: { id?: string; onChange: (iso: string) => void }) {
  const [v, setV] = useState({ day: "", month: "", year: "" });
  const refs = { day: useRef<HTMLInputElement>(null), month: useRef<HTMLInputElement>(null), year: useRef<HTMLInputElement>(null) };
  const next: Record<DobPart, DobPart | null> = { day: "month", month: "year", year: null };
  const prev: Record<DobPart, DobPart | null> = { day: null, month: "day", year: "month" };

  const set = (nv: typeof v) => { setV(nv); onChange(toIso(nv.day, nv.month, nv.year) ?? ""); };
  const change = (part: DobPart, raw: string) => {
    const whole = raw.length > 4 ? parseWholeDate(raw) : null;
    if (whole) { set(whole); refs.year.current?.focus(); return; }
    const { value, advance } = typePart(part, raw);
    set({ ...v, [part]: value });
    const to = next[part];
    if (advance && to) { refs[to].current?.focus(); refs[to].current?.select(); }
  };
  const full = v.day && v.month && v.year.length === 4;
  const invalid = full && !toIso(v.day, v.month, v.year);

  const box = (part: DobPart, label: string, placeholder: string, cls: string) => (
    <label className={`flex flex-col gap-1 ${cls}`}>
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <input ref={refs[part]} id={part === "day" ? id : undefined} className="input text-center tabular-nums" inputMode="numeric" placeholder={placeholder}
        autoComplete={part === "day" ? "bday-day" : part === "month" ? "bday-month" : "bday-year"} aria-label={`Birthday ${label.toLowerCase()}`}
        maxLength={part === "year" ? 4 : 10} value={v[part]} required
        onChange={(e) => change(part, e.target.value)}
        onPaste={(e) => { const whole = parseWholeDate(e.clipboardData.getData("text")); if (whole) { e.preventDefault(); set(whole); refs.year.current?.focus(); } }}
        onKeyDown={(e) => {
          const to = prev[part];
          if (e.key === "Backspace" && !v[part] && to) { e.preventDefault(); refs[to].current?.focus(); }
          if ((e.key === "/" || e.key === "-" || e.key === ".") && next[part] && v[part]) {
            e.preventDefault();
            if (v[part].length === 1) set({ ...v, [part]: `0${v[part]}` });
            refs[next[part]!].current?.focus();
          }
        }} />
    </label>
  );
  return (
    <div>
      <div className="flex gap-3">
        {box("day", "Day", "DD", "w-20")}
        {box("month", "Month", "MM", "w-20")}
        {box("year", "Year", "YYYY", "w-28")}
      </div>
      {invalid && <p className="mt-2 text-sm text-rose">That date doesn't exist. Check the day and month.</p>}
    </div>
  );
}
