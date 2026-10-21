# Kinara: App Store and Google Play submission pack

Version **1.0.0**. Everything here is ready to paste. Before you submit, read "Things to confirm", because the stores check these closely for dating apps.

## Basics

| Field | Value |
|---|---|
| App name | Kinara: Dating & Chemistry |
| Subtitle (iOS, 30 chars) | Meet, flirt, find chemistry |
| Short description (Play, 80 chars) | Flirt, match and chat with verified people — calls only after you say yes. |
| Category | Lifestyle (iOS: primary Lifestyle, secondary Social Networking) · Play: Dating |
| Age rating | 17+ (iOS: Frequent/Intense "Mature/Suggestive Themes" = None; "Dating" = Yes) · Play: Mature 17+ / PEGI 18. The app itself is 18+ |
| Price | Free with in-app subscriptions (women free for life in India) |
| Bundle / package id | `com.projectconnect.app` (internal id, never shown to people; keep it) |
| Support URL | https://project-connect-yok2.onrender.com/contact |
| Privacy policy URL | https://project-connect-yok2.onrender.com/legal/privacy |
| Account deletion URL (Play) | In-app: Profile › Privacy Center › Delete my account. Web: sign in, then Settings › Delete account |

Use your own domain before launch. The onrender.com address is fine for testing.

## Full description

> Meet someone who makes your heart skip a beat. ❤️
>
> Kinara is dating with chemistry, and with safety built in. See what you really have in common before you say hello, then break the ice your way.
>
> ❤️ **Like, Super Like ⭐ or send a Spark ✨.** Every profile shows a compatibility score and the reasons behind it: shared goals, interests and how you both handle life.
> 💕 **It's a match!** Say hello, send a wink 😉 or a heart, or let Cupid suggest an opener.
> 💬 **Chat that feels alive.** Reactions, voice messages, photos, and themes like Midnight 🌙, Rose 🌹 and Starlight ⭐.
> 📞 **Calls only when you say yes.** Nobody can call you without your OK, and your number is never shared.
> ✈️ **Travel mode and boosts 🚀** on Premium Plus.
>
> **Safe by design**
> • Selfie verification badge
> • Report or block in two taps, with a case number for every report
> • Scam and risky-link warnings in chat
> • No GPS. Others see your city and a rounded distance, never your location
> • You control who sees your profile and photos, and you can pause or delete your account any time
>
> For adults 18+. Women in India get every feature free, for life.

## Keywords (iOS, 100 chars)

`dating,date,match,flirt,chat,relationship,singles,love,india,meet,verified,romance,chemistry`

## Screenshots

Use 6.7" iPhone and phone-size Android shots of: Discover with the Love Moment card · a Super Like moment · the match screen · a chat in the Rose theme · Cupid suggestions · Safety Center. Take them from a **real phone** with fictional sample people, never real members.

## App Review notes (Apple) / test instructions (Google)

> Kinara is an 18+ dating app. Demo login: `appreview@yourdomain` / `<set a strong password>`. It has two sample matches with existing chats, so you can see chat, reactions, winks and call requests.
> User-generated content safeguards (Guideline 1.2): report and block on every profile, chat and call; automated screening of messages and photos; human review of reports; appeal process; Terms and Community Guidelines accepted at sign-up.
> Account deletion: Profile › Privacy Center › Delete my account.
> Calls: voice and video between matches only, after the recipient accepts a call request.
> Subscriptions use StoreKit / Play Billing on mobile.

Create a dedicated review account with fictional sample matches. **Don't send the demo accounts you test with.**

## App Privacy (Apple "nutrition label")

Tracking: **No**. Kinara doesn't track people across other companies' apps or websites, and has no ad SDKs.

| Data type | Collected | Linked to the person | Purpose |
|---|---|---|---|
| Name (first name) | Yes | Yes | App functionality |
| Email address | Yes | Yes | App functionality, account |
| Phone number | Yes (optional verification) | Yes | App functionality, fraud prevention |
| Coarse location (city) | Yes | Yes | App functionality. No precise location |
| Photos | Yes | Yes | App functionality |
| Audio data (voice messages) | Yes | Yes | App functionality |
| Other user content (messages, prompts, bio) | Yes | Yes | App functionality |
| Sexual orientation / gender (who you want to meet, your gender) | Yes | Yes | App functionality |
| Purchase history | Yes | Yes | App functionality |
| User ID, device ID | Yes | Yes | App functionality, fraud prevention, security |
| Product interaction | Yes | Yes | App functionality |
| Crash data | No (until a crash reporter is added) | — | — |
| Advertising data | No | — | — |

## Google Play Data safety

- Data shared with third parties: **No** (service providers acting for us don't count as sharing under Google's definition).
- Data collected: the same types as above. Processing is ephemeral where applicable. Data is encrypted in transit.
- Users can request deletion: **Yes**, in the app and on the web.
- Committed to the Play Families Policy: not applicable (18+).

## Things to confirm before submitting

1. **Gender-based pricing**: Apple may question different prices by gender. The fallback is in docs/STORES.md: offer the same products to everyone on iPhone.
2. **Age gate**: both stores expect a clear 18+ gate (built: date of birth plus confirmation).
3. **Legal pages**: the Terms and Privacy Policy show "Draft for review" until a lawyer's review is recorded. Get that done first.
4. **Sample people**: remove them (Admin › Launch readiness › Remove sample people) and set `SEED_SAMPLE_USERS=false`.
5. **Push notifications**: run `eas init` so the app has an Expo project id (needs your Expo account).
