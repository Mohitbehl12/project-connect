import { getConfig } from "@/lib/config";

/** Published contacts from Admin → Settings. Server component. Missing values are said plainly, never invented. */
export async function ContactsBlock({ officerOnly = false }: { officerOnly?: boolean }) {
  const c = await getConfig("legal.contacts");
  const o = c.grievanceOfficer;
  const mail = (e: string) => e ? <a className="underline" href={`mailto:${e}`}>{e}</a> : <span className="text-ink-faint">to be published before launch</span>;
  return (
    <dl className="space-y-6 text-lg">
      {!officerOnly && <>
        <div><dt className="font-semibold">Account and billing help</dt><dd className="text-ink-soft">{mail(c.supportEmail)}</dd></div>
        <div><dt className="font-semibold">Safety concerns</dt><dd className="text-ink-soft">Use Report on the person&apos;s profile or in chat — it reaches our safety team fastest. You can also write to {mail(c.safetyEmail)}.</dd></div>
        <div><dt className="font-semibold">Privacy and data requests</dt><dd className="text-ink-soft">{mail(c.privacyEmail)}</dd></div>
      </>}
      <div>
        <dt className="font-semibold">Grievance Officer (India)</dt>
        <dd className="text-ink-soft">
          {o.name ? <>{o.name}, {o.designation || "Grievance Officer"}{c.companyName ? `, ${c.companyName}` : ""}</> : <span className="text-ink-faint">Being appointed before public launch</span>}
          {o.email && <><br />Email: {mail(o.email)}</>}
          {o.phone && <><br />Phone: {o.phone}</>}
          {o.address && <><br />Address: {o.address}</>}
          <br /><a className="underline" href="/grievance">File a complaint online</a> — acknowledged straight away, answered within 15 days.
        </dd>
      </div>
    </dl>
  );
}
