import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PublicShell } from "@/components/PublicShell";

export const dynamic = "force-dynamic";

/** Minimal, safe Markdown subset renderer (headings, bold, paragraphs, lists). No raw HTML is ever injected. */
function render(md: string) {
  const blocks = md.split(/\n{2,}/);
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return blocks.map((b, i) => {
    if (b.startsWith("# ")) return <h1 key={i} className="text-4xl font-extrabold">{b.slice(2)}</h1>;
    if (b.startsWith("## ")) return <h2 key={i} className="mt-8 text-2xl font-bold">{b.slice(3)}</h2>;
    if (/^[-*] /m.test(b)) return <ul key={i} className="list-disc space-y-1 pl-6">{b.split("\n").map((l, j) => <li key={j}>{inline(l.replace(/^[-*] /, ""))}</li>)}</ul>;
    return <p key={i} className="leading-relaxed text-ink-soft">{inline(b)}</p>;
  });
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await db.query.legalDocuments.findFirst({ where: eq(schema.legalDocuments.slug, slug) });
  if (!doc) notFound();
  const v = await db.query.legalVersions.findFirst({
    where: and(eq(schema.legalVersions.documentId, doc.id), eq(schema.legalVersions.status, "PUBLISHED")),
    orderBy: desc(schema.legalVersions.version),
  });
  if (!v) notFound();
  return (
    <PublicShell>
      <article className="mx-auto max-w-2xl space-y-4 px-4 py-12 md:px-8">
        <p className="text-sm text-ink-faint">Version {v.version} · effective {v.effectiveAt?.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        {render(v.body)}
      </article>
    </PublicShell>
  );
}
