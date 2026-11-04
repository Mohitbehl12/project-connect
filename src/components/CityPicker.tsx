"use client";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/client";
import { CITIES, COUNTRIES } from "@/lib/constants";

type Place = { key: string; label: string; countryName: string };

/**
 * "Where are you based?" — type any town or city in the world. Popular cities show before typing.
 * `value` is what the profile holds (the city's name); `onChange` gets the key the server needs.
 */
export function CityPicker({ id, value, onChange }: { id?: string; value: string; onChange: (key: string, label: string) => void }) {
  const auto = useId();
  const inputId = id ?? auto;
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setQ(value), [value]);

  const popular: Place[] = Object.entries(CITIES).map(([k, c]) => ({ key: k, label: k, countryName: COUNTRIES[c.country]?.name ?? c.country }));
  const typed = q.trim().length >= 2 && q !== value;
  const list = typed ? results : popular;

  useEffect(() => {
    if (!typed) return;
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { setResults((await api<{ places: Place[] }>(`/api/places?q=${encodeURIComponent(q.trim())}`)).places); setActive(0); }
      catch { setResults([]); } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [q, typed]);

  const pick = (p: Place) => { onChange(p.key, p.label); setQ(p.label); setOpen(false); };
  return (
    <div className="relative">
      <input id={inputId} className="input" role="combobox" aria-expanded={open} aria-controls={`${inputId}-list`} aria-autocomplete="list" autoComplete="off"
        placeholder="Search any town or city" value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && list[active]) { e.preventDefault(); pick(list[active]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && (
        <ul id={`${inputId}-list`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-card border border-mist bg-paper-raised py-1 shadow-lg">
          {!typed && <li className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Popular — or type any town or city</li>}
          {typed && loading && !results.length && <li className="px-4 py-2 text-sm text-ink-soft">Searching…</li>}
          {typed && !loading && !results.length && <li className="px-4 py-2 text-sm text-ink-soft">No town or city found. Check the spelling, or try a nearby city.</li>}
          {list.map((p, i) => (
            <li key={p.key} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer justify-between gap-3 px-4 py-2 ${i === active ? "bg-mist" : ""}`}>
              <span className="truncate">{p.label}</span><span className="shrink-0 text-sm text-ink-faint">{p.countryName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
