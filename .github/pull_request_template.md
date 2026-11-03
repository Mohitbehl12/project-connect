<!-- The AI engineer fills every section. People: fill what applies. A person merges every PR. -->

## What and why
**Incident / proposal:** <!-- BUG-2026-000123 or FEAT-2026-0001, with the GitHub issue: Fixes #… -->
**Problem:** <!-- what was going wrong, for whom (no personal data) -->
**Root cause:** <!-- file:line and why it happened -->
**Fix:** <!-- what changed and why this is the smallest safe change -->

## Risk
**Risk score:** <!-- 0–100 --> · **Band:** <!-- Low / Medium / High / Critical -->
**Areas touched:** <!-- e.g. discovery, billing, auth, moderation, database -->
- [ ] No change to sign-in, permissions, payments, moderation rules or privacy — or it is called out here and needs a careful review
- [ ] No destructive database change (no dropped tables/columns, no deleting data); migrations are additive
- [ ] No secrets, personal data or internal IDs in code, logs, tests or this description

## Tests
- [ ] A test that failed before this change and passes now (regression test): <!-- file / case name -->
- [ ] `npx tsc --noEmit` · `npx vitest run` · e2e · security · QA API all pass (CI shows the results)
**Results:** <!-- counts from the runs -->

## After merging
**How to check it worked:** <!-- what to watch in Admin → Engineering -->
**How to undo:** <!-- revert this PR; Admin → Engineering → Releases → Roll back -->
