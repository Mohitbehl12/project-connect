# Project Connect — iOS & Android app

Expo (React Native, SDK 57) app for iPhone and Android, using the same API as the web app in the folder above.

## Try it on your phone (about 10 minutes)

You need: Node 20+, the **Expo Go** app on your phone (App Store / Play Store), and your phone and computer on the **same Wi-Fi**.

1. **Start the backend** (from the project root, one folder up):
   ```bash
   npm install
   cp .env.example .env          # set AUTH_SECRET
   npm run db:reset              # database + 200 test users with placeholder photos
   npm run dev -- -H 0.0.0.0     # listen on your network, not just localhost
   ```
2. **Find your computer's local IP** — macOS: `ipconfig getifaddr en0`; Windows: `ipconfig` (IPv4 Address). Example: `192.168.1.20`.
3. **Point the app at it**:
   ```bash
   cd mobile
   npm install
   cp .env.example .env
   # edit .env → EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
   ```
4. **Run it**:
   ```bash
   npx expo start
   ```
   Scan the QR code with your iPhone Camera (or with Expo Go on Android). The app opens in Expo Go.
5. Sign in with `aanya@demo.local` / `Demo!2026`, or create a new account to see onboarding.

If the app can't reach the server: check both devices are on the same Wi-Fi, the IP in `mobile/.env` is right, and your firewall allows port 3000.

## Commands

| Command | What it does |
|---|---|
| `npx expo start` | Dev server (scan the QR with Expo Go) |
| `npm run typecheck` | TypeScript check |
| `npm run export:web` | Web build for previews (`dist/`) — not the main target |

## Structure

```
src/app/            screens (Expo Router — every file is a route)
  (tabs)/           Discover, Likes, Matches, Messages, Profile
  onboarding.tsx    one question per screen, 17 steps, resumable
  profile/[id]      immersive profile sheet
  compatibility/[id]  per-factor breakdown
  match.tsx         the match moment
  chat/[id]         conversation
  date/[matchId], report, premium, safety, settings, preferences, edit-profile, photos, notifications
src/components/     design system: Arc, Button, Icon set, CardDeck, DiscoveryCard, PhotoGrid, PoleSlider, BottomSheet…
src/theme/          tokens (light + dark), ThemeProvider (System / Light / Dark)
src/lib/            API client with token refresh, auth, haptics, push registration
```

Constants (interests, intents, personality questions, report reasons) are imported from `../src/lib/constants.ts`, so the app and server never drift.

## Building for the stores

Uses EAS (Expo's build service; no Mac needed for iOS builds):

```bash
npx eas-cli@latest login
npx eas-cli@latest init            # links the project; also enables push tokens
npx eas-cli@latest build --profile preview --platform all   # installable test builds
```

You'll need an Apple Developer Program membership and a Google Play Console account. Before store submission see the checklist in `../docs/STATUS.md`.

## What's real and what isn't yet

Working against the real API: sign-up and sign-in (with secure token storage and refresh), onboarding, photo upload with crop and quality hints, discovery with gestures and haptics, profile sheet, compatibility breakdown, likes, mutual matching with the match moment, chat (polling every 4 s), date planner, report, block, unmatch, Safety Center, preferences, privacy and notification settings, appearance (System/Light/Dark), Premium (mock checkout), account deletion.

Not yet: realtime chat and typing indicators, photos/voice/GIFs in chat, store billing, selfie liveness capture, profile boost and travel mode, Google/Apple sign-in. See `../docs/STATUS.md`.
