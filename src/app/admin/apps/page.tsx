"use client";
import { useEffect, useState } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

// Admin → Apps: iPhone, Android and the web app are released separately. Each has its own versions,
// store link and feature switches; changing one never touches the others.

type Release = { minVersion: string; latestVersion: string; storeUrl: string; message: string; features: Record<string, boolean | undefined> };
type P = { platform: "ios" | "android" | "web"; release: Release; effective: Record<string, boolean>; devices: number; openIncidents: number; versions: { version: string; devices: number }[] };
type Data = { platforms: P[]; features: Record<string, string> };
const NAME = { ios: "iPhone (App Store)", android: "Android (Google Play)", web: "Web app (/app)" } as const;

function PlatformCard({ p, features, canEdit, onSaved }: { p: P; features: Record<string, string>; canEdit: boolean; onSaved: () => void }) {
  const [r, setR] = useState<Release>(p.release);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => setR(p.release), [p.release]);
  const web = p.platform === "web";
  async function save() {
    setMsg(null);
    try { await api("/api/admin/apps", { method: "PUT", body: { platform: p.platform, release: r } }); setMsg({ tone: "success", text: "Saved. Apps pick this up the next time they open." }); onSaved(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  const field = (k: "minVersion" | "latestVersion" | "storeUrl" | "message", label: string, hint: string) => (
    <label className="block text-sm font-semibold">{label}
      <input className="input mt-1" disabled={!canEdit} value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })} />
      <span className="mt-0.5 block text-xs font-normal text-ink-soft">{hint}</span>
    </label>
  );
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{NAME[p.platform]}</h2>
        <span className="text-xs text-ink-soft">{p.devices} {p.devices === 1 ? "device" : "devices"} with notifications on · {p.openIncidents} open {p.openIncidents === 1 ? "problem" : "problems"}</span>
      </div>
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {!web ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {field("latestVersion", "Latest version", "Older versions see “update available”.")}
          {field("minVersion", "Minimum version", "Older versions must update before they can continue. Raise only for a serious fix.")}
          {field("storeUrl", p.platform === "ios" ? "App Store or TestFlight link" : "Google Play link", "Where the update button goes. Empty until the app is published.")}
          {field("message", "Update note (optional)", "Shown with the update prompt, e.g. “Fixes photo uploads”.")}
        </div>
      ) : <p className="mt-2 text-sm text-ink-soft">The web app always runs the newest version the server hosts, so it never needs an update prompt.</p>}
      <h3 className="mt-4 text-sm font-bold">Features in this app</h3>
      <p className="text-xs text-ink-soft">Turning one off hides it in this app only. It's for holding a feature back on one platform (for example during App Store review) — server rules still apply.</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {Object.entries(features).map(([k, label]) => (
          <li key={k}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={r.features[k] !== false} onChange={(e) => setR({ ...r, features: { ...r.features, [k]: e.target.checked } })} />
              {label}
            </label>
          </li>
        ))}
      </ul>
      {p.versions.length > 0 && (
        <p className="mt-3 text-xs text-ink-soft">In use: {p.versions.map((v) => `${v.version} (${v.devices})`).join(" · ")}</p>
      )}
      {canEdit && <button className="btn-primary mt-4 px-4 py-2 text-sm" onClick={save}>Save {p.platform === "ios" ? "iPhone" : p.platform === "android" ? "Android" : "web app"} settings</button>}
    </section>
  );
}

function Apps() {
  const staff = useStaff();
  const q = useApi<Data>("/api/admin/apps");
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const canEdit = staff.permissions.includes("config.edit");
  return (
    <>
      <AdminTitle title="Apps" sub="iPhone, Android and the web app share one codebase and one server, but each is released on its own: versions, store link, update prompts and feature switches." />
      <div className="space-y-5">
        {q.data.platforms.map((p) => <PlatformCard key={p.platform} p={p} features={q.data!.features} canEdit={canEdit} onSaved={q.reload} />)}
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Apps /></AdminShell>;
}
