# Account Suspension and Appeals Policy (draft)

## Actions, mildest first

| Action | What it does | Who can do it |
|---|---|---|
| Warning | A message explaining which rule was broken | Moderator |
| Content removal | Photo, bio or message hidden | Moderator, photo screening (explicit photos refused at upload) |
| Restriction | Hidden from Discover; no new likes, calls or chats; existing chats still work | Automated risk/child-safety rules, or staff. Reversible |
| Suspension | Account paused pending review | Staff; or automatically when several different people report the same account (threshold in settings) |
| Ban | Account closed | Staff (`users.ban`) only |

- No model or rule bans anyone.
- Every automated decision is logged with a plain reason, shown to the member and appealable.

## Telling the member

The member is told:
- what happened;
- which rule it relates to;
- what they can still do;
- how to appeal.

We do not tell them who reported them.

## Appeals

- Members appeal from Safety. Banned members who can't sign in appeal at `/appeal` with an email address.
- Each appeal gets a case number (KN-A-…), and there is one open appeal per decision.
- **Four-eyes rule:** the person who made the original decision cannot decide the appeal (enforced in `lib/appeals.ts`).
- Outcomes are *upheld* or *overturned*, with a written reason. Overturning automatically restores the account, lifts the restriction, or marks the automated decision as overturned.
- Target: decide appeals within 7 days.
- Overturn rates per rule and for staff decisions are shown in Moderation quality. A high rate triggers a review of the rule or the reviewer's training.

## Changes to this policy

Changes to suspension rules or thresholds need owner approval. They are recorded in the audit log, because they change how members are treated.
