"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminShell, AdminTitle, StatusPill } from "@/components/AdminShell";
import { ModerationActions } from "@/components/ModerationActions";
import { Alert, Avatar, Spinner } from "@/components/ui";
import { timeAgo, useApi } from "@/lib/client";
import { INTENTS, REPORT_CATEGORIES } from "@/lib/constants";

function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<any>(`/api/admin/users/${id}`);
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return <Spinner />;
  const { user: u, profile: p } = data;

  return (
    <>
      <Link href="/admin/users" className="text-sm text-ink-soft hover:underline">← Users</Link>
      <AdminTitle title={p?.firstName ?? u.email} sub={`${u.email}${u.phone ? ` · ${u.phone}` : ""} · joined ${new Date(u.createdAt).toLocaleDateString()}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusPill value={u.status} /> <StatusPill value={u.selfieStatus} /> <span className="chip">{u.role}</span> <span className="chip">{u.planCode}</span>
        <span className="chip">email {u.emailVerified ? "✓" : "✗"}</span><span className="chip">phone {u.phoneVerified ? "✓" : "✗"}</span>
        <span className="text-sm text-ink-faint">Last active {timeAgo(u.lastActiveAt)}</span>
      </div>
      <div className="mb-8"><ModerationActions userId={u.id} status={u.status} selfieStatus={u.selfieStatus} onDone={reload} /></div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-3 text-lg font-bold">Profile</h2>
          {!p ? <p className="text-ink-soft">No profile yet (onboarding step {u.onboardingStep}).</p> : (
            <div className="space-y-3">
              <div className="flex items-center gap-3"><Avatar id={u.id} name={p.firstName} size={48} /><div><p className="font-semibold">{p.firstName}, {p.age} · {p.gender}</p><p className="text-sm text-ink-soft">{p.city}, {p.country} · {INTENTS[p.intent as keyof typeof INTENTS]}</p></div></div>
              <p>{p.bio || <span className="text-ink-faint">No bio</span>}</p>
              {p.prompts.map((x: any) => <p key={x.q} className="text-sm"><span className="text-ink-faint">{x.q}:</span> {x.a}</p>)}
              <p className="text-sm text-ink-soft">Interests: {p.interests.join(", ") || "—"}</p>
              <p className="text-sm text-ink-soft">Completeness {p.completeness}% · {data.stats.likesSent} likes sent · {data.stats.matches} matches</p>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-lg font-bold">Reports against this member ({data.reportsAgainst.length})</h2>
          {!data.reportsAgainst.length ? <p className="text-ink-soft">None.</p> : (
            <ul className="divide-y divide-mist">
              {data.reportsAgainst.map((r: any) => (
                <li key={r.id} className="py-2.5">
                  <Link href={`/admin/reports/${r.id}`} className="flex items-center gap-2 hover:underline">
                    <StatusPill value={r.priority} /> {REPORT_CATEGORIES[r.category as keyof typeof REPORT_CATEGORIES]} {r.automated && <span className="chip text-xs">automated</span>}
                    <span className="ml-auto"><StatusPill value={r.status} /></span>
                  </Link>
                  <p className="text-sm text-ink-faint">{timeAgo(r.createdAt)} · {r.details.slice(0, 120)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-lg font-bold">Moderation history</h2>
          {!data.actions.length ? <p className="text-ink-soft">No actions taken.</p> : (
            <ul className="space-y-2 text-sm">{data.actions.map((a: any) => <li key={a.id}><strong>{a.action}</strong> · {a.reason} <span className="text-ink-faint">· {timeAgo(a.createdAt)}</span></li>)}</ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-lg font-bold">Account history</h2>
          <ul className="space-y-1.5 text-sm">{data.audits.map((a: any) => <li key={a.id}><code className="text-xs">{a.action}</code> <span className="text-ink-faint">· {timeAgo(a.createdAt)}{a.ip ? ` · ${a.ip}` : ""}</span></li>)}</ul>
          {data.subscriptions.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 font-bold">Subscriptions</h3>
              <ul className="space-y-1 text-sm">{data.subscriptions.map((s: any) => <li key={s.id}>{s.planCode} · {s.status} · {s.provider} · until {new Date(s.endsAt).toLocaleDateString()}</li>)}</ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><UserDetail /></AdminShell>;
}
