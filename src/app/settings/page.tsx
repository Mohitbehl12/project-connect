"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, PageHeader, useMe } from "@/components/AppShell";
import { Alert, Modal, Toggle } from "@/components/ui";
import { api, useApi } from "@/lib/client";

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel p-5 md:p-6">
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Settings() {
  const { me, reload } = useMe();
  const router = useRouter();
  const prefs = me.preferences ?? {};
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const blocked = useApi<{ blocked: { id: string; firstName: string }[] }>("/api/blocks");
  const [phone, setPhone] = useState(me.user.phone ?? "");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pw, setPw] = useState("");

  async function setPref(k: string, v: boolean) {
    setMsg(null);
    try { await api("/api/preferences", { method: "PUT", body: { [k]: v } }); await reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function sendPhone() {
    try {
      const r = await api("/api/auth/otp", { body: { action: "send", channel: "PHONE", phone } });
      setCodeSent(true);
      setMsg({ tone: "info", text: r.devOtp ? `Code sent. Test mode code: ${r.devOtp}` : "We've texted you a code." });
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function verifyPhone() {
    try { await api("/api/auth/otp", { body: { action: "verify", channel: "PHONE", code } }); setMsg({ tone: "success", text: "Phone number verified." }); await reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function selfie() {
    try { await api("/api/verification", { method: "POST" }); setMsg({ tone: "success", text: "Verification requested. A moderator will review it." }); await reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function unblock(id: string) { await api(`/api/blocks?userId=${id}`, { method: "DELETE" }); blocked.reload(); }
  async function logout() { await api("/api/auth/logout", { method: "POST" }); router.push("/"); }
  async function deleteAccount() {
    try { await api("/api/me", { method: "DELETE", body: { password: pw } }); router.push("/"); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); setDeleteOpen(false); }
  }

  const selfieLabel = { NONE: "Not verified", PENDING: "Under review", VERIFIED: "Verified", REJECTED: "Not approved — try again" }[me.user.selfieStatus];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      <div className="space-y-5 px-4 md:px-8">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <Section id="verification" title="Verification">
          <dl className="divide-y divide-mist">
            <div className="flex items-center justify-between py-3"><dt>Email · {me.user.email}</dt><dd className={me.user.emailVerified ? "text-sage font-semibold" : "text-ink-faint"}>{me.user.emailVerified ? "Verified" : "Not verified"}</dd></div>
            <div className="py-3">
              <div className="flex items-center justify-between"><dt>Mobile number</dt><dd className={me.user.phoneVerified ? "text-sage font-semibold" : "text-ink-faint"}>{me.user.phoneVerified ? "Verified" : "Not verified"}</dd></div>
              {!me.user.phoneVerified && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input className="input max-w-52" placeholder="+919876543210" aria-label="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <button className="btn-outline" onClick={sendPhone}>Send code</button>
                  {codeSent && <>
                    <input className="input max-w-32" inputMode="numeric" maxLength={6} aria-label="SMS code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                    <button className="btn-primary" onClick={verifyPhone}>Verify</button>
                  </>}
                </div>
              )}
              <p className="mt-2 text-xs text-ink-faint">Your number is never shown to other people.</p>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt>Selfie verification <span className="block text-sm text-ink-faint">Earns a badge on your profile. Your selfie is only used for the check.</span></dt>
              <dd>{["NONE", "REJECTED"].includes(me.user.selfieStatus) ? <button className="btn-primary" onClick={selfie}>Verify me</button> : <span className={me.user.selfieStatus === "VERIFIED" ? "font-semibold text-sage" : "text-ink-faint"}>{selfieLabel}</span>}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-faint">Selfie checks are reviewed by a moderator in this test build; production uses an automated liveness provider.</p>
        </Section>

        <Section title="Privacy">
          <div className="divide-y divide-mist">
            <Toggle label="Show me in Discover" description="Turn off to pause. Your matches can still message you." checked={prefs.discoverable !== false} onChange={(v) => setPref("discoverable", v)} />
            <Toggle label="Show when I'm active" checked={prefs.showOnline !== false} onChange={(v) => setPref("showOnline", v)} />
            <Toggle label="Send read receipts" checked={prefs.readReceipts !== false} onChange={(v) => setPref("readReceipts", v)} />
            <AdsToggle />
            <Toggle label="Incognito" description={me.features.incognito ? "Only people you've liked can see you." : "Only people you've liked can see you. Part of Premium Plus."} checked={!!prefs.incognito} disabled={!me.features.incognito} onChange={(v) => setPref("incognito", v)} />
          </div>
        </Section>

        <Section title="Notifications">
          <div className="divide-y divide-mist">
            <Toggle label="New matches" checked={prefs.notifyMatches !== false} onChange={(v) => setPref("notifyMatches", v)} />
            <Toggle label="New messages" checked={prefs.notifyMessages !== false} onChange={(v) => setPref("notifyMessages", v)} />
            <Toggle label="New likes" checked={prefs.notifyLikes !== false} onChange={(v) => setPref("notifyLikes", v)} />
            <Toggle label="Email summaries" description="Email delivery activates once an email provider is connected." checked={!!prefs.notifyEmail} onChange={(v) => setPref("notifyEmail", v)} />
          </div>
        </Section>

        <Section title="Plan">
          <p className="text-ink-soft">You're on <strong className="text-ink">{me.user.planCode.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</strong>{me.user.planEndsAt && me.user.planCode !== "FREE" ? ` until ${new Date(me.user.planEndsAt).toLocaleDateString()}` : ""}.</p>
          <Link href="/plans" className="btn-outline mt-3">See plans</Link>
        </Section>

        <Section title="Blocked people">
          {!blocked.data?.blocked.length ? <p className="text-ink-soft">You haven't blocked anyone.</p> : (
            <ul className="divide-y divide-mist">
              {blocked.data.blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2.5"><span>{b.firstName}</span><button className="btn-ghost px-3 py-1 text-sm" onClick={() => unblock(b.id)}>Unblock</button></li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Account">
          <div className="flex flex-wrap gap-3">
            <button className="btn-outline" onClick={logout}>Log out</button>
            <button className="btn-ghost text-rose" onClick={() => setDeleteOpen(true)}>Delete account</button>
          </div>
          <p className="mt-3 text-sm text-ink-faint"><Link href="/legal/terms" className="underline">Terms</Link> · <Link href="/legal/privacy" className="underline">Privacy</Link> · <Link href="/legal/guidelines" className="underline">Guidelines</Link></p>
        </Section>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <p className="text-ink-soft">This permanently deletes your profile, matches and messages. It can't be undone.</p>
        <input type="password" className="input mt-4" placeholder="Enter your password to confirm" aria-label="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn-danger mt-4 w-full" disabled={!pw} onClick={deleteAccount}>Delete permanently</button>
      </Modal>
    </div>
  );
}

export default function Page() {
  return <AppShell><Settings /></AppShell>;
}

/** Personalised ads (consent-backed). Ads still show either way; this only decides whether gender and interests are used. */
function AdsToggle() {
  const q = useApi<{ current: { kind: string; granted: boolean }[] }>("/api/consents");
  const on = q.data?.current.find((c) => c.kind === "PERSONALISED_ADS")?.granted ?? false;
  if (!q.data) return null;
  return (
    <Toggle label="Personalised ads" description="Use my gender and interests to choose the few Sponsored ads I see. Advertisers never see who I am. With this off, ads are less relevant, not fewer."
      checked={on} onChange={async (v) => { await api("/api/consents", { body: { kind: "PERSONALISED_ADS", granted: v, source: "web" } }); q.reload(); }} />
  );
}
