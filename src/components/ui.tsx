"use client";
import Link from "next/link";
import { useId, type ReactNode } from "react";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-sm text-ink-faint">{hint}</p>}
      {error && <p className="mt-1 text-sm text-rose" role="alert">{error}</p>}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const tones = {
    info: "bg-paper-sunk text-ink-soft",
    error: "bg-rose-wash text-rose",
    success: "bg-sage-wash text-sage",
    warn: "bg-marigold-wash text-ink",
  };
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="font-semibold">{label}</label>
        {description && <p className="text-sm text-ink-faint">{description}</p>}
      </div>
      <button
        id={id} role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-pill transition-colors disabled:opacity-40 ${checked ? "bg-sage" : "bg-mist"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

/** Multi-select pill group. */
export function PillPicker({ options, value, onChange, max }: { options: Record<string, string>; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(options).map(([k, label]) => {
        const on = value.includes(k);
        const full = !on && max !== undefined && value.length >= max;
        return (
          <button
            key={k} type="button" aria-pressed={on} disabled={full}
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={`rounded-pill border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-40 ${on ? "border-ink bg-ink text-paper" : "border-mist bg-paper-raised text-ink-soft hover:border-ink-faint"}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Single-select segmented pills. */
export function Segmented({ options, value, onChange }: { options: Record<string, string>; value: string | null | undefined; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {Object.entries(options).map(([k, label]) => (
        <button
          key={k} type="button" role="radio" aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`rounded-pill border px-3.5 py-1.5 text-sm transition-colors ${value === k ? "border-ink bg-ink text-paper" : "border-mist bg-paper-raised text-ink-soft hover:border-ink-faint"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const PALETTES = [
  ["#F2A93B", "#C8406A"], ["#4F8270", "#1C1B3A"], ["#C8406A", "#4A4870"], ["#F2A93B", "#4F8270"],
  ["#8C8AAE", "#1C1B3A"], ["#C9821A", "#C8406A"],
];

/** Placeholder portrait until photo upload ships: initials on a two-tone field derived from the user id. */
export function Avatar({ id, name, size = 56, className = "" }: { id: string; name: string; size?: number; className?: string }) {
  const h = [...id].reduce((s, c) => (s * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const [a, b] = PALETTES[h % PALETTES.length];
  const angle = h % 360;
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(${angle}deg, ${a}, ${b})` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Verified({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill bg-sage-wash px-2 py-0.5 text-xs font-semibold text-sage ${className}`} title="Selfie verified">
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden><path d="M8 1l1.9 1.4 2.3-.1.7 2.2 1.9 1.4-.7 2.2.7 2.2-1.9 1.4-.7 2.2-2.3-.1L8 15l-1.9-1.4-2.3.1-.7-2.2L1.2 10.1l.7-2.2-.7-2.2 1.9-1.4.7-2.2 2.3.1z" fill="currentColor"/><path d="M5.2 8.2l1.9 1.9 3.8-3.9" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Verified
    </span>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-ink-soft">{body}</p>
      {action && <Link href={action.href} className="btn-primary mt-6">{action.label}</Link>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex justify-center py-16" role="status" aria-label={label}>
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-mist border-t-ink" />
    </div>
  );
}

export function Modal({ open, onClose, title, children, dismissable = true }: { open: boolean; onClose: () => void; title: string; children: ReactNode; dismissable?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={dismissable ? onClose : undefined}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-paper-raised p-6 sm:rounded-card">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          {dismissable && <button onClick={onClose} className="btn-ghost -mr-3 -mt-1 px-3 py-1" aria-label="Close">✕</button>}
        </div>
        {children}
      </div>
    </div>
  );
}
