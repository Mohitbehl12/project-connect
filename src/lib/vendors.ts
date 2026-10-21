import "server-only";

// Inventory of every outside service Kinara can use. `active` is worked out from the server's settings, so
// the list shows what is really switched on. DPA (data processing agreement) status is tracked by staff in
// Admin → Privacy & compliance. Keep this list and the public "Service providers" page in step.

export type Vendor = {
  id: string; name: string; purpose: string; data: string; why: string; where: string; security: string; retention: string;
  active: boolean; required: boolean;
};

const on = (...keys: string[]) => keys.every((k) => !!process.env[k]);

export function vendors(): Vendor[] {
  return [
    { id: "render", name: "Render", purpose: "Cloud hosting (web server, app API, database disk, backups)", required: true, active: true,
      data: "All data the service stores, on encrypted disks", why: "To run Kinara", where: "Render region chosen for the service (check Render → Settings)",
      security: "TLS for all traffic; messages and private fields are additionally encrypted by Kinara (AES-256-GCM)", retention: "As set by Kinara's retention policy; backups up to 30 days" },
    { id: "r2", name: "Cloudflare R2 (or other S3-compatible storage)", purpose: "Photo and chat media storage", required: false, active: process.env.STORAGE_DRIVER === "s3",
      data: "Profile photos, chat photos and voice messages (location data removed)", why: "To store and serve media", where: "Provider region set in S3_REGION",
      security: "Private bucket; files served only through Kinara after permission checks", retention: "Deleted with the photo, chat or account" },
    { id: "razorpay", name: "Razorpay", purpose: "Payments (India)", required: false, active: on("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"),
      data: "Amount, order id, your email/phone for the payment page. Card/UPI details go straight to Razorpay — Kinara never sees them", why: "To take payments",
      where: "India", security: "PCI DSS certified provider; signed webhooks", retention: "Razorpay's own legal retention; Kinara keeps payment records 8 years (tax)" },
    { id: "cloudflare-turn", name: "Cloudflare Realtime TURN", purpose: "Relay for voice and video calls", required: false, active: on("CLOUDFLARE_TURN_KEY_ID", "CLOUDFLARE_TURN_API_TOKEN") || on("TURN_URLS"),
      data: "IP addresses and the encrypted call stream (DTLS-SRTP). The relay can't see or hear the call", why: "So calls connect without revealing your IP address to the other person",
      where: "Cloudflare's global network", security: "Short-lived credentials per call", retention: "Not stored by Kinara; Cloudflare keeps connection logs per its policy" },
    { id: "webpush", name: "Apple, Google and Mozilla push services", purpose: "Notifications to browsers and the home-screen app", required: false, active: process.env.WEB_PUSH_ENABLED !== "false",
      data: "A push address for your device and an encrypted notification (they can't read it)", why: "To deliver notifications", where: "Provider's global network",
      security: "Payload encrypted end to end to your device (RFC 8291) and signed (VAPID)", retention: "Address deleted when you turn notifications off or it stops working" },
    { id: "expo", name: "Expo push service", purpose: "Notifications to the iPhone/Android app", required: false, active: process.env.PUSH_ENABLED === "true",
      data: "Device push token and the notification title/text (kept short and free of message content)", why: "To deliver app notifications", where: "United States",
      security: "TLS", retention: "Per Expo's policy" },
    { id: "resend", name: "Resend", purpose: "Email (codes, receipts, safety notices)", required: false, active: on("RESEND_API_KEY"),
      data: "Your email address and the email text", why: "To send account and safety emails", where: "United States / EU per Resend region",
      security: "TLS; API key kept on the server", retention: "Per Resend's policy (delivery logs)" },
    { id: "msg91", name: "MSG91", purpose: "SMS codes (India)", required: false, active: on("MSG91_AUTH_KEY"),
      data: "Phone number and one-time code", why: "To verify your phone number", where: "India", security: "DLT-registered templates; TLS", retention: "Per MSG91's policy" },
    { id: "sightengine", name: "Sightengine", purpose: "Automated photo safety check (nudity/violence)", required: false, active: on("SIGHTENGINE_USER", "SIGHTENGINE_SECRET"),
      data: "The photo being checked", why: "To keep explicit images out", where: "European Union", security: "TLS; images not kept by provider per its terms", retention: "Not kept after the check (per provider terms — confirm in DPA)" },
    { id: "redis", name: "Redis (hosted)", purpose: "Live chat events and rate limits across servers", required: false, active: on("REDIS_URL"),
      data: "Short-lived signals (\"chat X changed\", counters). No message text", why: "To run more than one server", where: "Provider region", security: "TLS / private network", retention: "Minutes" },
  ];
}
