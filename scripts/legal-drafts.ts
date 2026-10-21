// Legal document drafts (legal/*.md). These are full first drafts written for Kinara's real features, NOT
// lawyer-reviewed text: every public page says "Draft for review" until staff record a lawyer review.
// - seed.ts uses them as version 1 on a new database;
// - on an existing database, `applyLegalDrafts` replaces any placeholder version with the draft (as a new
//   published version, so members are asked to accept the real text). It never touches a document that
//   already has real (non-placeholder) text, so edits made in Admin → Legal are safe.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@libsql/client";

export const LEGAL_DOCS = [
  ["terms", "Terms of Service", true],
  ["privacy", "Privacy Policy", true],
  ["guidelines", "Community Guidelines", true],
  ["safety", "Safety Policy", true],
  ["payments", "Subscription & Payment Terms", false],
  ["refunds", "Cancellation & Refund Policy", false],
  ["cookies", "Cookie Policy", false],
  ["advertising", "Advertising Terms and Policy", false],
] as const;

/**
 * Revised drafts. When a draft file changes, the previous draft text is replaced only if the published version
 * is still exactly a draft we shipped (matched by its SHA-256 hash) — text edited in Admin → Legal is never touched.
 */
const PRIOR_DRAFT_HASHES: Record<string, string[]> = {
  privacy: ["b02134ce9ab977eea49c2f76880badb4fee312e84d2ac6e1ac84558923eed0fe"],
};
const REVISION_NOTES: Record<string, string> = {
  privacy: "Adds section 5A on sponsored ads: what is used to choose ads, the personalised-ads setting, and that advertisers only get totals. Not yet reviewed by a lawyer.",
};
const sha = (s: string) => createHash("sha256").update(String(s).trim()).digest("hex");

const PLACEHOLDER = "Placeholder text for testing";

export function draftBody(slug: string): string | null {
  const f = join(process.cwd(), "legal", `${slug}.md`);
  return existsSync(f) ? readFileSync(f, "utf8").trim() : null;
}

export async function applyLegalDrafts(db: Client) {
  let changed = 0;
  for (const [slug, title, required] of LEGAL_DOCS) {
    const body = draftBody(slug);
    if (!body) continue;
    let doc = (await db.execute({ sql: "select id from legal_documents where slug = ?", args: [slug] })).rows[0] as unknown as { id: string } | undefined;
    if (!doc) {
      const id = crypto.randomUUID();
      await db.execute({ sql: "insert into legal_documents (id, slug, title, required_at_signup) values (?, ?, ?, ?)", args: [id, slug, title, required ? 1 : 0] });
      doc = { id };
    } else {
      await db.execute({ sql: "update legal_documents set title = ? where id = ?", args: [title, doc.id] });
    }
    const cur = (await db.execute({ sql: "select id, version, body from legal_versions where document_id = ? and status = 'PUBLISHED' order by version desc limit 1", args: [doc.id] })).rows[0] as unknown as { id: string; version: number; body: string } | undefined;
    const revised = !!cur && (PRIOR_DRAFT_HASHES[slug] ?? []).includes(sha(String(cur.body))) && sha(String(cur.body)) !== sha(body);
    if (cur && !String(cur.body).includes(PLACEHOLDER) && !revised) continue; // real text already published
    const max = Number((await db.execute({ sql: "select coalesce(max(version), 0) as v from legal_versions where document_id = ?", args: [doc.id] })).rows[0]?.v ?? 0);
    const now = Date.now();
    if (cur) await db.execute({ sql: "update legal_versions set status = 'SUPERSEDED' where id = ?", args: [cur.id] });
    const vid = crypto.randomUUID();
    await db.execute({
      sql: "insert into legal_versions (id, document_id, version, body, status, effective_at, published_at, created_at, change_summary, material) values (?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, 1)",
      args: [vid, doc.id, max + 1, body, now, now, now, revised ? REVISION_NOTES[slug] ?? "Updated draft. Not yet reviewed by a lawyer." : "First full draft, replacing the placeholder. Not yet reviewed by a lawyer."],
    });
    changed++;
    console.log(`[legal] ${slug}: published ${revised ? "revised " : ""}draft as v${max + 1}`);
  }
  return changed;
}
