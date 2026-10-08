"use client";
import { Avatar, Verified } from "./ui";
import { CompatRing } from "./CompatRing";

export type Card = {
  id: string; firstName: string; age: number; gender: string; city: string; distance: string; bio: string; intent: string;
  profession: string | null; education: string | null; heightCm: number | null; lifestyle: string[]; interests: string[];
  prompts: { q: string; a: string }[]; photos: string[]; verified: boolean; score?: number; reasons?: string[];
  likeKind?: string; likeNote?: string | null; online?: boolean;
};

/**
 * Full profile as a readable page rather than a photo-first card: name and intent lead,
 * the compatibility ring and its reasons sit right under them, then the person's own words.
 */
export function ProfileView({ card, compact = false }: { card: Card; compact?: boolean }) {
  const facts = [card.profession, card.education, card.heightCm ? `${card.heightCm} cm` : null].filter(Boolean) as string[];
  return (
    <article className="panel overflow-hidden" aria-label={`${card.firstName}'s profile`}>
      <div className="flex items-start gap-4 p-5 md:p-6">
        <Avatar id={card.id} name={card.firstName} size={compact ? 64 : 84} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-extrabold">{card.firstName}, {card.age}</h2>
            {card.verified && <Verified />}
            {card.online && <span className="text-xs font-semibold text-sage">● Active now</span>}
          </div>
          <p className="mt-1 text-ink-soft">{card.city} · {card.distance}</p>
          <p className="mt-2 inline-block rounded-pill bg-marigold-wash px-3 py-1 text-sm font-semibold text-ink">{card.intent}</p>
        </div>
      </div>

      {card.likeNote && (
        <div className="mx-5 mb-4 rounded-xl bg-marigold-wash p-4 md:mx-6">
          <p className="text-xs font-semibold text-marigold-deep">{card.likeKind === "PRIORITY" ? "Priority like with a note" : "Their note to you"}</p>
          <p className="mt-1 text-[17px]">“{card.likeNote}”</p>
        </div>
      )}

      {card.score !== undefined && (
        <div className="mx-5 mb-5 flex items-center gap-4 rounded-xl bg-paper p-4 md:mx-6">
          <CompatRing score={card.score} size={compact ? 64 : 76} />
          <ul className="space-y-1 text-[15px]">
            {(card.reasons ?? []).slice(0, compact ? 3 : 5).map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-sage">✓</span>{r}</li>)}
            {!card.reasons?.length && <li className="text-ink-faint">Different in interesting ways.</li>}
          </ul>
        </div>
      )}

      <div className="space-y-5 border-t border-mist p-5 md:p-6">
        {card.bio && <p className="text-[17px] leading-relaxed">{card.bio}</p>}
        {!compact && card.prompts.map((p) => (
          <div key={p.q} className="border-l-[3px] border-marigold pl-4">
            <p className="text-sm font-semibold text-ink-faint">{p.q}</p>
            <p className="mt-0.5 font-display text-xl font-bold">{p.a}</p>
          </div>
        ))}
        {facts.length > 0 && <p className="text-ink-soft">{facts.join(" · ")}</p>}
        {card.lifestyle.length > 0 && (
          <div className="flex flex-wrap gap-2">{card.lifestyle.map((l) => <span key={l} className="chip">{l}</span>)}</div>
        )}
        {card.interests.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-faint">Into</h3>
            <div className="flex flex-wrap gap-2">{card.interests.map((i) => <span key={i} className="chip bg-sage-wash text-sage">{i}</span>)}</div>
          </div>
        )}
      </div>
    </article>
  );
}
