import "server-only";

// GitHub is the AI engineer's work queue: incidents and approved proposals become issues, and the engineer's
// pull requests (branches ai/bug-fix/<code>, ai/feature/<code>) are read back here. Needs GITHUB_TOKEN
// (fine-grained: this repository only, Issues + Pull requests + Actions read, Issues/Pull requests write) and
// GITHUB_REPO ("owner/name"). Without them everything else keeps working and the dashboard says so.

export const githubConfigured = () => !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO && /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPO));

async function gh<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "twofold-ops", ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export async function createIssue(title: string, body: string, labels: string[]) {
  const r = await gh<{ number: number; html_url: string }>("/issues", { method: "POST", body: { title: title.slice(0, 250), body: body.slice(0, 60000), labels } });
  return r;
}

export async function commentIssue(n: number, body: string) {
  await gh(`/issues/${n}/comments`, { method: "POST", body: { body: body.slice(0, 60000) } });
}

export async function closeIssue(n: number, reason: "completed" | "not_planned") {
  await gh(`/issues/${n}`, { method: "PATCH", body: { state: "closed", state_reason: reason } });
}

/** The AI engineer's diagnosis comment on an issue (marked with <!-- ai-diagnosis -->), newest first. */
export async function aiDiagnosis(n: number): Promise<string | null> {
  const list = await gh<{ body: string; created_at: string }[]>(`/issues/${n}/comments?per_page=50`);
  const c = list.filter((x) => x.body?.includes("<!-- ai-diagnosis -->")).pop();
  return c ? c.body.replace("<!-- ai-diagnosis -->", "").trim().slice(0, 4000) : null;
}

export type Pull = { number: number; html_url: string; state: "open" | "closed"; merged_at: string | null; head: { ref: string }; title: string; created_at: string; updated_at: string; draft?: boolean; labels?: { name: string }[] };
/** The AI engineer's pull requests (head branch starts with "ai/"), newest first. */
export async function aiPulls(): Promise<Pull[]> {
  const all = await gh<Pull[]>("/pulls?state=all&per_page=100&sort=updated&direction=desc");
  return all.filter((p) => p.head?.ref?.startsWith("ai/"));
}

export type Run = { id: number; name: string; event: string; status: string; conclusion: string | null; head_branch: string; head_sha: string; html_url: string; created_at: string };
export async function recentRuns(): Promise<Run[]> {
  const r = await gh<{ workflow_runs: Run[] }>("/actions/runs?per_page=30");
  return r.workflow_runs ?? [];
}
