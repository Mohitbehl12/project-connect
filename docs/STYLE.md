# Kinara Style (custom clothing)

The clothing experience from the Darzi project, merged into the Kinara app as its own section.
It has a warm gold accent, its own tabs and a "Dating" switch in the header, so it never mixes with dating.
To enter, use the "Kinara Style" card on Profile or Explore.

**Flow:** Choose clothing → Design (catalogue, or described in words) → Measurements → Review → Preview (front and back) → Order → Pay → Track.

| Part | Where |
| --- | --- |
| Catalogue, design rules, prices, measurements, Fit Lock, garment drawings | `src/lib/style/darzi.js`, ported from Darzi and shared by the server and the app |
| Server logic (profiles, designs, orders, payment, workshop) | `src/lib/style/server.ts`, API under `/api/style/*` and `/api/admin/style/*` |
| App screens | `mobile/src/app/style/*` |
| Pay page | `/style/pay/[orderId]` (Razorpay, or a labelled test mode) |
| Workshop | Admin → Style workshop: orders and statuses, customers, AI designs, measurements, fabric stock, reports |

## What's in it

- **16 garment types and 40+ ready styles**, including 2026 trends, fabrics, colours and patterns. The price is always recalculated on the server.
- **"AI design":** a description such as "slim white linen shirt, mandarin collar, hidden buttons" becomes a design, and the app shows what it understood.
  It's rule-based and runs on our server, so nothing is sent to an outside AI. There are also outfit ideas per occasion, using your measurements.
- **Measurements:** 18 per profile, each with a confidence level. There are two ways to start:
  - a quick estimate from height, weight, shape and usual size;
  - tape-measure entry, with tips for each measurement.
- **Fit Lock / 100% Fit Guarantee:** four checks: measurements captured, uncertain ones confirmed with a tape, consistency checks, and a cross-check against a shirt that fits.
  At 100%, a poor fit gets a free alteration or remake. A Fit Locked order that's reported as not fitting gets a "We'll make it right" message automatically.
- **Orders:** delivery address (stored encrypted, visible only to the workshop), tailor instructions, one-off payment, 7 tracked steps with notifications, and fit feedback after delivery.
- **Privacy:** body measurements are visible only to their owner and to staff with `style.measurements` (the new **TAILOR** role, plus admins).
  Every staff view is logged. Finance and support staff can't see measurements.

## Not built yet

- **Measuring from two phone photos**, which Darzi does in the browser with MediaPipe. The app says it's coming next.
  It needs the pose model running in the app or a web view.
- **Fabric stock** isn't deducted automatically when an order is made. The workshop updates it.
- **Darzi's phone-OTP accounts** aren't migrated. Kinara Style uses the Kinara account.
- **Real payments** need Razorpay keys (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`). Until then orders use clearly labelled test payments.
- On iPhone, Apple allows physical goods to be paid outside in-app purchase, so Razorpay is fine here. That's different from the subscriptions.

## Tests

`tests/e2e.ts` → "Kinara Style": 35 checks. They cover the catalogue, preferences, describe-to-design, invalid input, measurement validation, Fit Lock reaching 100%,
server-side pricing, order rules, the pay link, test payment, notifications, workshop permissions (members and finance refused), status updates,
fit feedback and reports. There was also a full click-through in a phone-sized browser, from Shop to a paid order.
