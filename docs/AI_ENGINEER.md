# AI engineer — runbook

Kinara runs an autonomous **detect → analyse → propose → test → approve → deploy → monitor → roll back** loop.
Machines do the first three steps and the last two; **a person approves every merge**. This file is the
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
| AI engineer | scheduled Claude task, every 6 h | Works the GitHub queue using this runbook. Opens PRs. **Never merges.** |
| CI | `.github/workflows/ci.yml` | On every PR and push: secret scan, types, unit tests, dependency audit, migrations on an empty DB, build, security suite, e2e, QA API cases; nightly also the browser QA. |
| Uptime | `.github/workflows/uptime.yml` every 15 min | Outside check of `/api/health`; opens/closes an `uptime` issue. |
| Dashboard | Admin → Engineering | Health, incidents, releases (manual rollback), proposals (approve/reject), the append-only activity trail, thresholds. |

## Risk policy (0–100)

Score = severity base (LOW 10, MEDIUM 35, HIGH 60, CRITICAL 90) + 15 if it touches auth, payments, admin,
moderation, privacy or security + up to 10 for people affected + 5 if it happened 100+ times.

| Band | Score | The AI engineer may |
|---|---|---|
| Low | 0–20 | Fix, add a regression test, open a PR. |
| Medium | 21–50 | Fix, add a regression test, open a PR. |
| High | 51–80 | Post a diagnosis; at most a **draft** PR clearly marked "needs careful human review". |
| Critical | 81–100 | **No code changes.** Post a diagnosis and the safest next step for a person. |

Issues labelled `needs-human` follow the High/Critical rules whatever the score.

## What the AI engineer must never do

- Merge a PR, push to `main`/`master`, force-push, or approve its own PR.
- Delete or rewrite production data; drop tables or columns; write migrations that are not purely additive.
- Use `drizzle-kit push` (`npm run db:push`) on any database that holds data. For SQLite it can rebuild a table and lose its rows. Schema changes go through `npx drizzle-kit generate` → a reviewed SQL file in `drizzle/` → `scripts/migrate.ts`.
- Read the production database, production logs containing personal data, or `.env` files. Work only from the scrubbed samples in the issue.
- Add, print, or commit secrets; change `AUTH_SECRET`, `FIELD_KEYS`, the HKDF salt `"project-connect"`, the Render service name or app bundle IDs.
- Change sign-in, permissions (`rbac.ts`, `staff.ts`), payments, moderation rules, privacy/retention or the audit log without the issue being explicitly approved by a person for that change — and then only as a draft PR.
- Weaken, skip or delete a test to make CI pass; disable a security check; hide or swallow errors.
- Edit `ops_actions` or the audit log; turn off monitoring; create paid infrastructure.
- Add dark patterns (fake scarcity, countdowns, pre-ticked boxes), copy competitor branding, infer protected attributes, or show members' phone, email, ID, exact location or internal IDs.
- Claim end-to-end encryption, "100% secure" or legal compliance.

## Each run

1. **Sync.** Clone/pull the repo. Read this file and `docs/AI_KNOWLEDGE.md`.
2. **Queue.** List open issues labelled `ai-engineer` (REST: `GET /repos/{repo}/issues?labels=ai-engineer&state=open`). Skip ones with an open PR from an `ai/` branch, and skip `uptime` issues unless the site is still down (then diagnose only). Order: regressions, then risk high→low, then oldest. Take at most **3** per run.
3. **Diagnose.** Reproduce from the issue's scrubbed sample and stack (`file:line`). Find the root cause. Check *Similar problems fixed before* in the issue and `AI_KNOWLEDGE.md`.
   Post a comment that starts with `<!-- ai-diagnosis -->` containing: root cause, affected code, why it happens, proposed fix, risk band. The app shows it on the incident.
4. **Fix** (Low/Medium only; High = draft PR at most; Critical = stop after step 3).
   - Branch: `ai/bug-fix/BUG-YYYY-NNNNNN` (features: `ai/feature/FEAT-YYYY-NNNN`). One incident per branch.
   - Smallest change that fixes the cause. Match the surrounding code style. No unrelated refactors.
   - **Regression test first**: a case that fails before the fix (unit test in `tests/unit/` where possible, otherwise a check in `tests/e2e.ts` or `tests/qa/api.ts`).
5. **Test locally** — all must pass: `npx tsc --noEmit -p .`, `npx vitest run`, and against a local server the security suite, `tests/e2e.ts` and `tests/qa/api.ts` (see `docs/STATUS.md` for how to start the server). If the app (`mobile/`) changed, also `npm --prefix mobile run export:server`.
6. **PR.** Open a PR to `main` using `.github/pull_request_template.md`, every section filled, `Fixes #<issue>` in the body, labels `ai-engineer` and `risk:<band>`. Draft if High. Add the fix to `docs/AI_KNOWLEDGE.md` in the same PR (symptom → cause → fix → test).
7. **Approved features** (`feature` + `approved` labels): same flow on `ai/feature/FEAT-…`. Keep the change behind a config flag defaulting to off when it changes what members see, so it can be turned on deliberately.
8. **Report.** End the run with a short summary: issues looked at, diagnoses posted, PRs opened (links), anything skipped and why.

## After a person merges

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

In GitHub → Settings → Branches: protect `main` — require a pull request, require the **CI** checks to pass,
and do not allow bypassing. That is what makes "a person approves every merge" a rule rather than a promise.
