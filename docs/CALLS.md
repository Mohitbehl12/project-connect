# Voice and video calls

Matched members can call each other from the chat (phone and camera buttons). Code-complete and tested on
the web app between two browsers. It needs a TURN relay before it can go live, and it hasn't been tried
on real phones yet.

## How it works

- **Who can call:** only two people who are matched and have each sent at least one message
  (Admin → Settings `calls.minMessagesEach`). Blocked people, unmatched people and suspended accounts can't call.
  Blocking, reporting or unmatching during a call ends it at once.
- **Ringing:** the other phone shows the call within a second while the app is open. Unanswered calls stop
  after 40 seconds and leave a "Missed call" line in the chat and a notification. **The app can't ring a phone
  when it's closed** until push notifications are set up (Expo account), and full lock-screen ringing
  would need CallKit on iPhone and a ConnectionService on Android (not built).
- **Media:** audio and video go between the two phones over WebRTC, which encrypts media in transit (DTLS-SRTP).
  Media isn't end-to-end encrypted in the strict sense, because a TURN relay (or our server) could in principle be
  changed to intercept it. Don't describe calls as end-to-end encrypted. The server only passes along the
  connection setup and keeps a log (who, when, how long), never audio or video.
- **Privacy:** with a TURN relay configured, the apps are told to use only the relay, so neither person
  learns the other's IP address (which can reveal roughly where they are). Calls stay off without a relay;
  `CALLS_ALLOW_DIRECT=true` connects without one and is meant only for local testing (the call screen then says
  "Test mode").
- **In a call:** mute, camera on/off, flip camera (phones), end, and "End and report".

## Setting up the relay (TURN)

Choose one:

1. **A hosted TURN service** (e.g. Cloudflare Realtime TURN, Twilio Network Traversal, Metered). Put its
   URLs in `TURN_URLS` and its credentials in `TURN_USERNAME` / `TURN_CREDENTIAL`. If the provider issues
   short-lived credentials through its own API, add that call in `iceConfig()` in `src/lib/calls.ts`.
2. **Your own coturn server** (a small VM in Mumbai, roughly ₹500–1,000 a month plus bandwidth).
   Set `use-auth-secret` and `static-auth-secret=<long random>` in coturn. Then set `TURN_SECRET` to the same
   value and `TURN_URLS` to `turn:<host>:3478?transport=udp,turns:<host>:5349?transport=tcp`. The server hands
   out 2-hour credentials, and the secret never leaves it.

Relay bandwidth: video calls use about 0.5–1.5 Mbit/s per person.

## Limits to know

- One app server: ringing and signalling use the same in-process hub as chat. With several servers, move it to
  Redis pub/sub.
- Not yet tested: real iPhones and Android phones (needs a development build: `npx eas-cli build --profile development`),
  and the route between earpiece and speaker on phones. Voice calls may default to the earpiece. If testers
  want a speaker button, add `react-native-incall-manager`.
- The web app needs camera and microphone permission in the browser.

## Tests

- `tests/e2e.ts` → "Voice and video calls": 25 checks covering who can call, ringing, answering, the order of
  signals, outsiders, size limits, hang-up, decline, missed-call notices, and blocking during a call.
- Manual test here: two Chromium browsers with fake camera and microphone on the web app made a real video call.
  Both sides received 640×480 video, the timer ran, and hanging up ended it for both and logged it in the chat.
