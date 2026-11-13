# AI Governance and Moderation Policy (draft)

## Where automation is used

| System | Version tag | What it decides | Human role |
|---|---|---|---|
| Message and profile screening (rules) | `rules:moderation-v2`, `rules:child-safety-v2` | Warn the receiver; send for review; refuse risky links | A person decides any enforcement |
| Photo screening (server-side model) | photo screen | Refuse clearly explicit photos; hold borderline ones | Staff queue for held photos; appeals |
| Duplicate-photo check | `rules:photo-dhash-v1` | Send for review | A person decides whose photo it is |
| Risk score | `lib/risk.ts` | Restrict at HIGH until verified or reviewed | Risk queue; appeals |
| Selfie check | face match + pose | Recommend | Staff decide |
| Matching / recommendations | `lib/matching.ts` | Order of profiles in Discover | Members control filters and distance |

## Rules

1. **No irreversible high-impact decision by a machine.** Bans are human only. Restriction is reversible and appealable.
2. **Explain.** Every automated decision that affects a person is logged with a plain-language reason and the system version (`automated_decisions`). The person can see it in Privacy Center and appeal it.
3. **No protected characteristics.**
   - Matching and moderation never use or infer religion, caste, ethnicity, health or sexual orientation beyond what the member chose to show.
   - Gender and preferences are used only as the member set them.
4. **Measure.** Moderation quality, last 90 days, includes:
   - per-rule false-positive rate (a person dismissed the flag);
   - appeal overturn rate per system and for staff;
   - review times against targets.

   Rules with high false positives are narrowed, after human review.
5. **Change control.**
   - New rules or models go through a pull request with tests and human approval, and they get a new version tag.
   - AI may propose code changes on branches; it cannot merge, deploy, alter legal policies or change suspension rules.
6. **Privacy.**
   - Screening runs on TwoFold's servers. Message text is not sent to outside AI providers unless the Privacy Policy lists them and a DPA is signed.
   - Members are told messages are screened for safety. TwoFold does not claim end-to-end encryption.

## Labelled test set

`tests/fixtures/screening-cases.json` holds labelled messages per rule. `tests/unit/screening-cases.test.ts` fails if any rule flags a case a person marked as fine, or misses a case it should catch (apart from listed known gaps), and prints precision and recall per rule. Add every misjudged real case (anonymised) before changing a rule.

## Not done yet

- A formal bias evaluation of matching on real data (needs launch data).
