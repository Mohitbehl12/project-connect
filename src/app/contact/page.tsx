import { ContactsBlock } from "@/components/ContactsBlock";
import { PublicShell } from "@/components/PublicShell";

export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

export default function Contact() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-12 md:px-8">
        <h1 className="text-5xl font-extrabold">Contact us</h1>
        <div className="mt-10"><ContactsBlock /></div>
      </div>
    </PublicShell>
  );
}
