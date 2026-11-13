# AI engineer — runbook

Discover runs an autonomous **detect → analyse → propose → test → approve → deploy → monitor → roll back** loop.
Since 2026-11-12, at the owner's instruction, the AI engineer also **merges its own pull requests once every
CI check has passed** (see "Automatic merging"). Since 2026-11-13, anything touching payments, sign-in,
privacy, legal, moderation rules, migrations or deployment also waits for the owner's `owner-approved` label. No person reviews them first; CI, the independent
`qa-reviewer` check, the release watchdog and the `needs-human` label are the safeguards. This file is the
instruction set the AI engineer (a scheduled Claude task, every 6 hours) follows, and the reference for people
reviewing its work.

## How the pieces fit

| Piece | Where | What it does |
|---|---|---|
| Capture | `src/lib/http.ts`, `src/lib/ops.ts`, `/api/ops/client-error`, `ErrorReporter`, app `crashReporter` | Every API request is timed; every server error, website crash and app crash becomes an **incident** (`BUG-YYYY-NNNNNN`), grouped by fingerprint, scrubbed of personal data. Email, push, payment-webhook and search outcomes are counted as signals. |
| Monitor | `src/lib/monitor.ts`, `/api/cron/monitor` every 5 min (`scripts/start.sh`) | Probes database, storage, memory, disk, backups; error-rate, slow-route and integration-failure thresholds; sign-in attack detection; hourly data-quality checks and audit-chain verification; alerts (in-app to staff, email, Slack/Teams). |
| Release watchdog | `monitor.ts → watchdog()` | Watches each release for its first hour against the previous 24 h. If it made things worse it opens a CRITICAL `DEPLOY` incident and, when `RENDER_API_KEY` is set and auto-rollback is on, rolls back to the last healthy release. |
| GitHub sync | `monitor.ts → githubSync()` every 15 min | Opens an issue per incident at or above *Settings → send to the AI engineer from* (default MEDIUM) and per **approved** proposal; reads the engineer's PRs and diagnosis comments back into the incident. |
| Feature scout | `src/lib/scout.ts`, daily | Turns usage totals (onboarding drop-off, empty searches, checkout abandonment, slow screens, report categories, unused features) into proposals (`FEAT-YYYY-NNNN`). Never one person's activity. |
| AI engineer | scheduled Claude task, every 6 h | Works the GitHub queue using this runbook. Opens PRs and merges its own `ai/` PRs when CI is green. Never merges anything else. |
| Master agent and sub-agents | `.claude/agents/` | How the AI engineer organises a run: `master-agent` diagnoses and orchestrates, `developer` writes the fix, `qa-reviewer` checks it independently before a PR is opened. They work under this runbook and change none of its rules. |
| CI | `.github/workflows/ci.yml` | On every PR and push: secret scan, types, unit tests, dependency audit, migrations on an empty DB, build, security suite, e2e, QA API cases; nightly also the browser QA. |
| Uptime | `.github/workflows/uptime.yml` every 15 min | Outside check of `/api/health`; opens/closes an `uptime` issue. |
| Dashboard | Admin → Engineering | Health, incidents, releases (manual rollback), proposals (approve/reject), the append-only activity trail, thresholds. |

## Risk policy (0–100)

Score = severity base (LOW 10, MEDIUM 35, HIGH 60, CRITICAL 90) + 15 if it touches auth, payments, admin,
moderation, privacy or security + up to 10 for people affected + 5 if it happened 100+ times.

| Band | Score | The AI engineer may |
|---|---|---|
| Low | 0–20 | Fix, add a regression test, open a PR. Merges automatically when CI is green. |
| Medium | 21–50 | Fix, add a regression test, open a PR. Merges automatically when CI is green. |
| High | 51–80 | Fix, add a regression test, open a PR labelled `risk:high`. Merges automatically only when CI is green **and** `qa-reviewer` returned the verdict "ready" (recorded in the PR description). Otherwise it stays open for a person. |
| Critical | 81–100 | **No code changes.** Post a diagnosis and the safest next step for a person. |

`needs-human` is the brake. An issue with that label gets a diagnosis only, whatever the score. A pull request
with that label is never merged automatically. Anyone can add it at any time.

## What the AI engineer must never do

- Push directly to `main`/`master`, force-push, or approve a PR.
- Merge anything except its own pull requests from `ai/` branches, and those only under "Automatic merging". Never merge a Dependabot PR or a PR opened by a person, never merge with a check failing, pending, skipped or missing, and never merge a draft.
- Delete or rewrite production data; drop tables or columns; write migrations that are not purely additive.
- Use `drizzle-kit push` (`npm run db:push`) on any database that holds data. For SQLite it can rebuild a table and lose its rows. Schema changes go through `npx drizzle-kit generate` → a reviewed SQL file in `drizzle/` → `scripts/migrate.ts`.
- Read the production database, production logs containing personal data, or `.env` files. Work only from the scrubbed samples in the issue.
- Add, print, or commit secrets; change `AUTH_SECRET`, `FIELD_KEYS`, the HKDF salt `"project-connect"`, the Render service name or app bundle IDs.
- Change sign-in, permissions (`rbac.ts`, `staff.ts`), payments, moderation rules, privacy/retention or the audit log unless the incident's root cause is in that code. Then: the smallest fix only, no behaviour change beyond the bug, the PR labelled `sensitive`, a `qa-reviewer` verdict of "ready" in the description, and **no merge until the owner adds `owner-approved`** (see "Automatic merging", rule 7).
- Add the `owner-approved` label, or remove `sensitive` or `needs-human`, on any PR. Never loosen a permission, a price, a moderation rule or a retention period as part of a fix.
- Weaken, skip or delete a test to make CI pass; disable a security check; hide or swallow errors.
- Edit `ops_actions` or the audit log; turn off monitoring; create paid infrastructure.
- Add dark patterns (fake scarcity, countdowns, pre-ticked boxes), copy competitor branding, infer protected attributes, or show members' phone, email, ID, exact location or internal IDs.
- Claim end-to-end encryption, "100% secure" or legal compliance.

## Each run

1. **Sync.** Clone/pull the repo. Read this file and `docs/AI_KNOWLEDGE.md`. Then apply "Automatic merging" to pull requests left open by earlier runs.
2. **Queue.** List open issues labelled `ai-engineer` (REST: `GET /repos/{repo}/issues?labels=ai-engineer&state=open`). Skip ones with an open PR from an `ai/` branch, and skip `uptime` issues unless the site is still down (then diagnose only). Order: regressions, then risk high→low, then oldest. Take at most **3** per run.
3. **Diagnose.** Reproduce from the issue's scrubbed sample and stack (`file:line`). Find the root cause. Check *Similar problems fixed before* in the issue and `AI_KNOWLEDGE.md`.
   Post a comment that starts with `<!-- ai-diagnosis -->` containing: root cause, affected code, why it happens, proposed fix, risk band. The app shows it on the incident.
4. **Fix** (Low/Medium only; High = draft PR at most; Critical = stop after step 3).
   - Branch: `ai/bug-fix/BUG-YYYY-NNNNNN` (features: `ai/feature/FEAT-YYYY-NNNN`). One incident per branch.
   - Smallest change that fixes the cause. Match the surrounding code style. No unrelated refactors.
   - **Regression test first**: a case that fails before the fix (unit test in `tests/unit/` where possible, otherwise a check in `tests/e2e.ts` or `tests/qa/api.ts`).
5. **Test locally** — all must pass: `npx tsc --noEmit -p .`, `npx vitest run`, and against a local server the security suite, `tests/e2e.ts` and `tests/qa/api.ts` (see `docs/STATUS.md` for how to start the server). If the app (`mobile/`) changed, also `npm --prefix mobile run export:server`.
6. **PR.** Open a PR to `main` using `.github/pull_request_template.md`, every section filled, `Fixes #<issue>` in the body, labels `ai-engineer` and `risk:<band>` (plus `sensitive` where it applies). Record the `qa-reviewer` verdict in the description. Add the fix to `docs/AI_KNOWLEDGE.md` in the same PR (symptom → cause → fix → test).
7. **Approved features** (`feature` + `approved` labels): same flow on `ai/feature/FEAT-…`. Keep the change behind a config flag defaulting to off when it changes what members see, so it can be turned on deliberately.
8. **Merge.** Apply "Automatic merging" to the PRs opened in this run once their checks finish (wait up to 30 minutes; anything still running is picked up by the next run).
9. **Report.** End the run with a short summary: issues looked at, diagnoses posted, PRs opened (links), PRs merged (links), PRs left open and why, anything skipped and why.

## Automatic merging

Added 2026-11-12 at the owner's instruction. It applies only to pull requests the AI engineer opened itself.

A pull request is merged only when **all** of these hold:

1. Its head branch starts with `ai/`, it carries the `ai-engineer` label, and it is not a draft.
2. Neither the PR nor its issue carries `needs-human`.
3. Every check run on the PR's current head commit is `completed` with conclusion `success`, and both CI jobs
   are present ("Types, unit tests, audit, secret scan" and "Build, end-to-end, security and QA"). Pending,
   failed, cancelled, skipped or missing means no merge.
   (`GET /repos/{repo}/commits/{head_sha}/check-runs`)
4. GitHub reports it mergeable with no conflicts. If `main` has moved, update the branch
   (`PUT /repos/{repo}/pulls/{n}/update-branch`), let CI run again, and leave it for the next run.
5. For `risk:high` or `sensitive`: the PR description records a `qa-reviewer` verdict of "ready".
6. The site is healthy: there is no open `uptime` issue and no open incident issue for a failed release
   (`DEPLOY`). If either exists, merge nothing in this run.
7. If the PR changes any path listed in `scripts/sensitive-paths.txt` (payments and pricing, sign-in and
   permissions, privacy, consent, legal text, audit, moderation and safety rules, database migrations and the
   schema, deployment and CI settings, these rules), it also carries `owner-approved`, added by the owner after
   reviewing the latest commit. The "Owner approval for sensitive changes" check enforces this: it stays red
   without the label, and new commits remove the label. Added 2026-11-13 at the owner's instruction.
   **The AI engineer never adds, re-adds or asks anyone else to add `owner-approved`**, and never edits
   `scripts/sensitive-paths.txt` or the check to get around it. A `qa-reviewer` verdict does not replace it.

How to merge: squash (`PUT /repos/{repo}/pulls/{n}/merge` with `merge_method: squash`), one PR at a time,
oldest first, **at most 3 per run**. After each merge, wait for CI on `main` for that commit. If it fails,
stop merging, label the PR's issue `needs-human`, comment with the failing check, and report it. Do not
attempt an automatic revert.

Never merged automatically: Dependabot PRs, PRs opened by a person, drafts, anything touching
`.github/workflows/`, `render.yaml`, `scripts/start.sh`, `.claude/` or this file. Those wait for a person.

**To stop automatic merging:** add `needs-human` to a PR to hold that one; pause the scheduled task
"Discover AI engineer (every 6 hours)" to hold everything; or restore the previous wording of this section's
rules by reverting the commit that added it.

## Master agent and sub-agents

The agent definitions in `.claude/agents/` are instructions, not extra permissions. Each one states that this
runbook outranks it.

| Agent | Role in a run | Can change code |
|---|---|---|
| `master-agent` | Reads the queue, diagnoses, briefs the others, runs the full test set, opens the PR, merges it under "Automatic merging", reports | Yes |
| `developer` | Writes the smallest fix and its regression test from the master agent's brief | Yes |
| `qa-reviewer` | Checks the fix against the issue without seeing the developer's summary: test fails before and passes after, nothing on the never-list touched, no test weakened | No (read and run only) |
| `researcher`, `doc-writer`, `business-analyst`, `automation-builder` | Used when a task needs outside facts, documentation, requirements or tooling | `researcher` and `business-analyst` no; the others yes |

If a session does not offer these agents, the AI engineer follows `.claude/agents/master-agent.md` as written
instructions and does the fix and the review as two separate passes itself.

To call the master agent by hand, open Claude Code in this repository and run `claude --agent master-agent`, or
write `@master-agent <objective>` in a running session. Work still arrives as a pull request; a session a
person started by hand does not merge unless that person asks it to.

## After a merge

Render deploys `main`. GitHub sync marks the incident **Fixed**. The release watchdog watches the new release
for an hour and rolls back if it made things worse. If the same incident appears again more than 10 minutes
after the fix, it is marked **Came back** and the issue gets a comment; the engineer picks it up again.

## Setup (one-time, by a person)

In Render → Environment:

| Variable | Needed for |
|---|---|
| `CRON_SECRET` | the monitor schedule (already set) |
| `GITHUB_TOKEN` | issues/PR sync. Fine-grained token, this repository only: Issues read/write, Pull requests read, Actions read, Metadata read. |
| `GITHUB_REPO` | `Mohitbehl12/project-connect` |
| `RENDER_API_KEY` | automatic and one-click rollback (Render → Account settings → API keys) |
| `RENDER_SERVICE_ID` | set automatically by Render |
| `OPS_ALERT_EMAIL` | alert emails (comma-separated; needs Resend configured) |
| `OPS_SLACK_WEBHOOK_URL` / `OPS_TEAMS_WEBHOOK_URL` | optional chat alerts |
| `MEMORY_LIMIT_MB` | optional; the plan's memory (default 512) for the memory alarm |

In GitHub → Settings → Branches: protect `main` — require a pull request and require the **CI** checks to
pass, and do not allow bypassing. With automatic merging on, this is what makes "nothing merges with CI red" a
rule GitHub enforces rather than a promise the AI engineer keeps. As of 2026-11-12 `main` is **not** protected.
