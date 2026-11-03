# Known problems and fixes

The AI engineer reads this before diagnosing and adds an entry in every fix PR. One entry per root cause:
**symptom → cause → fix → regression test.** Newest first. No personal data.

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
