import { ContactsBlock } from "@/components/ContactsBlock";
import { PublicShell } from "@/components/PublicShell";
import { GRIEVANCE_CATEGORIES } from "@/lib/grievances";
import { GrievanceForm } from "./GrievanceForm";

export const metadata = { title: "File a complaint" };
export const dynamic = "force-dynamic";

export default function Grievance() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-4xl font-extrabold">File a complaint</h1>
        <p className="mt-3 text-ink-soft">This goes to our Grievance Officer. You get a reference number straight away and a reply within 15 days — within 24 hours for intimate images or impersonation. To report a profile or a message, Report in the app is fastest.</p>
        <div className="mt-8"><GrievanceForm categories={{ ...GRIEVANCE_CATEGORIES }} /></div>
        <div className="mt-12 border-t border-mist pt-8"><ContactsBlock officerOnly /></div>
      </div>
    </PublicShell>
  );
}
