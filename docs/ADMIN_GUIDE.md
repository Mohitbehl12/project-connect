# Admin guide

Log in at `/login` with a staff account; you land on `/admin`. The menu only shows sections your role can use.

## Daily routine

1. **Dashboard** — check the red banner for critical reports (safety or possible minor). These come first.
2. **Reports** — sorted critical → high → medium → low. Open one to see the reported member, prior reports and, when the report came from a chat, the full conversation with the reported message outlined. Opening evidence is logged.
   - Take action from the report page (warn, suspend, ban). Link the action to the report so it appears in the member's history.
   - Close the report as **Actioned** or **Dismissed** with a note. The reporter is told it was reviewed, never what happened.
   - *Automated* reports come from message screening (scam or abuse language). Treat them as leads, not verdicts.
3. **Verification** — approve or reject pending selfie checks. Rejections send your reason to the member.

## Actions and what they do

| Action | Effect |
|---|---|
| Warn | Sends the member your reason as a notification |
| Suspend | Member can log in and read, but can't like, message or appear in discovery |
| Ban | Logs the member out everywhere, ends all matches, blocks login |
| Restore | Returns a suspended or banned account to active |
| Log out everywhere | Revokes all sessions (use after a suspected account takeover) |
| Change role | Super admin only; also revokes the member's sessions |

Accounts reported by 5 different people within 30 days are suspended automatically pending review (threshold configurable).

## Settings & plans

- **Matching weights** — relative importance of each compatibility factor. Small changes matter; adjust one at a time and watch match rates.
- **Messages allowed before a reply** — default 4.
- **Plans** — set entitlements and per-country prices in minor units (₹499 = `49900`). Country `*` is the fallback price.

## Legal

1. **New version** copies the current text into a draft.
2. Edit → **Send for review**.
3. A *different* super admin publishes it. Publishing supersedes the old version, and every member is asked to accept the new one on their next visit.
Published versions can't be edited; acceptance counts show per version.

## Audit log

Every sign-in, moderation action, report closure, config change, evidence view and subscription event, with actor, time and IP. Filter by area at the top right.
