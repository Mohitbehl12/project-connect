# Age Verification Policy (draft)

**Kinara is for adults only.** The minimum age is 18, or higher where a launch country's law sets it
(Admin → Privacy & compliance → Country rules). We do not knowingly allow anyone under that age to use Kinara.

## Layers of age assurance

We do not rely on a date-of-birth box alone. Each layer is proportionate: we do not collect identity documents.

1. **Date of birth at sign-up.** Under the minimum age is refused, with no hint about which date would pass. The date of birth can't be changed by the member afterwards.
2. **Country check.** The country's minimum age is checked again when the city is saved.
3. **Selfie check.**
   - The member copies a random pose, and the selfie is compared with their profile photos. Staff make the decision, and the selfie is deleted afterwards.
   - In countries set to `SELFIE_REQUIRED` (Japan today), the check must be passed before liking anyone.
   - Anyone flagged as higher risk is asked for it.
4. **What people write.** Bios, prompt answers and chat messages are screened for someone saying they are under 18. This covers:
   - present-tense statements ("I'm 16", "I'm in class 11");
   - Hindi ("main 16 saal ki hoon");
   - "not 18 yet".

   Each match opens a **critical** child-safety report for a person. The member's message is still delivered, and the adult receiving it sees: "Kinara is only for adults…".
5. **What members report.** "May be under 18" is a critical report category.
6. **Two signals → hidden while we check.** Two independent signals restrict the account:
   - two different members; or
   - one member plus our screening.

   Restriction means hidden from Discover and no new contact. It is reversible and appealable, and it is not a ban.

## Review

- Child-safety reports have a 12-hour review target and go first in the queue.
- The reviewer looks at the profile, photos and reported messages.
- **Confirmed under 18:** ban, legal hold on the evidence, and end every chat.
- **Adult contacted the minor sexually:** escalate under [Content moderation](content-moderation.md) §Child safety.
- **Not confirmed:** lift the restriction and tell the member.

## Not used

We do not use:
- face-based age estimation;
- ID document upload;
- third-party age databases.

These need a lawyer's sign-off, a privacy impact assessment and a vendor contract first.

## Open decisions (owner + lawyer)

- Whether India (or any country) should move from `SELF_DECLARED` to `SELFIE_REQUIRED`.
- Whether to add an optional ID-based check through a licensed provider for a "ID checked" badge.
