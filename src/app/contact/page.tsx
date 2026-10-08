import { PublicShell } from "@/components/PublicShell";

export const metadata = { title: "Contact" };

export default function Contact() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-12 md:px-8">
        <h1 className="text-5xl font-extrabold">Contact us</h1>
        <dl className="mt-10 space-y-6 text-lg">
          <div><dt className="font-semibold">Account and billing help</dt><dd className="text-ink-soft">support@projectconnect.example</dd></div>
          <div><dt className="font-semibold">Safety concerns</dt><dd className="text-ink-soft">Use Report on the person's profile or in chat — it reaches our safety team fastest. You can also write to safety@projectconnect.example.</dd></div>
          <div><dt className="font-semibold">Privacy and data requests</dt><dd className="text-ink-soft">privacy@projectconnect.example (Grievance Officer for India; Data Protection contact for the EU/UK)</dd></div>
        </dl>
        <p className="mt-10 text-sm text-ink-faint">These addresses are placeholders until launch.</p>
      </div>
    </PublicShell>
  );
}
