# Real-phone test plan (about 1 hour, two phones)

Everything below has passed in browsers and simulators. This plan is for the things only a real phone can show: touch feel, camera, microphone, sound, vibration, notifications, calls and performance. Use one iPhone and one Android if you can.

**Set-up:** Phone A signs in as `aanya@demo.local` and phone B as `rohan@demo.local` (password `Demo!2026`). On iPhone, open the site in Safari, then Share › Add to Home Screen, and open Kinara from the icon. On Android, use the Expo Go build or Chrome's "Install app".

Write ✅ or ❌ and a few words next to each line. Screenshots of anything odd help most.

## 1. First impressions (phone A)
- [ ] Welcome screen: hearts float slowly, and the text is readable
- [ ] Discover: cards swipe smoothly left and right with no stutter
- [ ] Like button: heart animation, a soft heartbeat sound, a small vibration
- [ ] Super Like ⭐ and Spark ✨ animations play; "You've sent today's Sparks" appears after 3
- [ ] Boost 🚀 shows "On" and the countdown in the notice
- [ ] Settings › Experience: turning Sound, Haptics or Animations off really stops them
- [ ] Phone's "Reduce motion" setting on: hearts and particles stop

## 2. Matching and chat (A and B)
- [ ] B likes A back from Likes → the match screen appears on B with both photos meeting
- [ ] "Send a Wink 😉" → A gets the notification; the wink pops in the chat; "Send a wink back" works
- [ ] Messages arrive within 1–2 seconds both ways; the typing indicator shows
- [ ] Long-press a message → five reactions; the burst animation plays above the message
- [ ] Chat theme Rose / Midnight / Starlight: text readable on all of them
- [ ] After a few messages each, the header glows ("You're having great chemistry 💕")
- [ ] Photo from the camera and from the gallery (iPhone HEIC photos too) sends fine
- [ ] Voice message: record, send, play on the other phone with sound
- [ ] Cupid ✨: the ideas make sense; tapping one fills the box without sending

## 3. Calls
(Needs the Cloudflare TURN keys in Render first.)
- [ ] A requests a video call → B sees "Aanya wants to have a call with you. ❤️"
- [ ] "Maybe later" hides it; Accept → "It's a yes!" on both
- [ ] The video call connects on mobile data (not only Wi-Fi); Speaker and camera flip work
- [ ] B declines a second request → A can't ask again for 7 days

## 4. Notifications
- [ ] With the app closed: a message, a match, a wink and a call request each arrive as notifications
- [ ] Tapping a notification opens the right chat or screen
- [ ] A muted chat sends no message notifications

## 5. Safety and privacy
- [ ] Report a profile → a case number is shown → the case appears in Admin › Reports
- [ ] Block → the person disappears from Discover, Likes and Matches on both phones
- [ ] Privacy Center: hide city → the other phone sees only "India"; pause profile → hidden
- [ ] Delete my account (on a spare test account) → it's signed out and can't sign back in

## 6. Feel and speed
- [ ] The app opens in under 3 seconds on mobile data
- [ ] No screen is cut off by the notch, home bar or keyboard
- [ ] Battery and heat are normal after 15 minutes of use

Send me the list with the ❌ items and I'll fix them.
