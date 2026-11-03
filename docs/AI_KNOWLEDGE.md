# Known problems and fixes

The AI engineer reads this before diagnosing and adds an entry in every fix PR. One entry per root cause:
**symptom → cause → fix → regression test.** Newest first. No personal data.

## `db:push` wiped a table's rows in development
- **Symptom:** after adding three columns to `preferences`, the dev database had 3 preference rows instead of ~700; discovery showed nobody.
- **Cause:** `drizzle-kit push --force` on SQLite rebuilt the table instead of altering it.
- **Fix:** never use `db:push` on a database with data. Generate a migration (`drizzle-kit generate`), check it is `ALTER TABLE … ADD`, apply with `scripts/migrate.ts` (what production runs). Dev reset: delete the file, `migrate.ts`, `db:seed`, `sample-data.ts`, `seed-photos.ts`, `rotate-keys.ts`, `bootstrap.ts` — the same order CI uses.
- **Test:** CI builds a fresh database from migrations on every PR.

## A fresh install offered the retired ₹1 intro offer
- **Symptom:** on a brand-new database, men saw "Try Premium for ₹1" although membership v3 replaced it with a free trial.
- **Cause:** migration 0009 turned the offer off, but on a fresh install migrations run before the seed, and the seed still created it active.
- **Fix:** the seed creates it switched off. **Pattern:** when a migration changes data, change the seed to match.
- **Test:** CI's e2e runs on a fresh database ("no ₹1 intro offer any more").

## Partial profile saves wiped interests and prompts
- **Symptom:** saving one field of the profile cleared interests and prompts.
- **Cause:** Zod 4 `.partial()` still applies `.default()` values, so fields the client didn't send were filled with defaults (empty lists) and saved.
- **Fix:** unwrap defaults before `.partial()` in update schemas; only write keys present in the request.
- **Test:** e2e "…and keeps interests and prompts (a bio-only save used to clear them)".

## Matches tab crashed when nobody had liked you yet
- **Symptom:** app crash on the Matches tab for new members.
- **Cause:** the likes API omitted `locked` when the list was empty; the screen read `locked.length`.
- **Fix:** always return `locked` (empty array). Prefer stable response shapes: every documented field, every time.
- **Test:** QA API "response shapes" cases.

## New members bounced back to onboarding step 1
- **Symptom:** after "Start discovering", the app returned to the first sign-up step.
- **Cause:** navigation ran before the account context reflected `onboardingStep = 3`, so the route guard redirected.
- **Fix:** await the context refresh before navigating.
- **Test:** QA sign-up journey "Start discovering opens Discover".

## Web Plans page crashed on the Free plan
- **Cause:** the Free plan has no feature list; the page mapped over `undefined`.
- **Fix:** default to an empty list. **Test:** QA screens, Plans with a Free account.

## Ad receipt numbers could collide
- **Cause:** next number computed with `count + 1` outside a transaction.
- **Fix:** atomic per-year counter and a unique index (migration 0017). **Pattern:** any human-readable sequence needs a unique index.
- **Test:** QA race-condition cases.

## Session refresh rate-limited whole mobile networks
- **Cause:** refresh limited per IP; many phones share carrier addresses.
- **Fix:** limit per session, generous per address.
- **Test:** QA API rate-limit cases.

## Message screening missed obfuscated threats
- **Cause:** spacing and zero-width characters split keywords.
- **Fix:** normalise (strip zero-width, collapse spacing) before matching. **Test:** `tests/unit/qa-properties` screening cases.
