import { PublicShell } from "@/components/PublicShell";
import { vendors } from "@/lib/vendors";

export const metadata = { title: "Service providers" };
export const dynamic = "force-dynamic";

/** Public list of the outside services that process members' data, generated from what is actually switched on. */
export default function ServiceProviders() {
  const list = vendors();
  const active = list.filter((v) => v.active);
  const off = list.filter((v) => !v.active);
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-12 md:px-8">
        <h1 className="text-4xl font-extrabold">Service providers</h1>
        <p className="text-ink-soft">These companies process data for Kinara, only to provide their service to us. This list is generated from our live settings.</p>
        <div className="space-y-4">
          {active.map((v) => (
            <section key={v.id} className="panel p-5 text-sm">
              <h2 className="text-lg font-bold">{v.name}</h2>
              <p className="mt-1 text-ink-soft">{v.purpose}</p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold">Data shared</dt><dd>{v.data}</dd>
                <dt className="font-semibold">Why</dt><dd>{v.why}</dd>
                <dt className="font-semibold">Where</dt><dd>{v.where}</dd>
                <dt className="font-semibold">Protection</dt><dd>{v.security}</dd>
                <dt className="font-semibold">Kept for</dt><dd>{v.retention}</dd>
              </dl>
            </section>
          ))}
        </div>
        {off.length > 0 && (
          <p className="text-sm text-ink-faint">Not in use yet (listed here before we switch them on): {off.map((v) => v.name).join(", ")}.</p>
        )}
      </article>
    </PublicShell>
  );
}
