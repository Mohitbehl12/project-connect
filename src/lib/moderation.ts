// Rule-based first-line message screening. Pure function — unit tested.
// An ML/LLM classifier can be layered on top later; rules stay as a fast, explainable baseline.

export type Flag = "SCAM" | "OFF_PLATFORM" | "LINK" | "RISKY_LINK" | "ABUSE" | "THREAT" | "FINANCIAL_INFO" | "CONTACT_INFO";

const RULES: { flag: Flag; patterns: RegExp[] }[] = [
  {
    flag: "SCAM",
    patterns: [
      /\b(crypto|bitcoin|usdt|forex|trading (platform|app|signals?))\b/i,
      /\b(invest(ment)?s?)\b.{0,40}\b(return|profit|guarantee|double)/i,
      /\b(gift ?cards?|western union|moneygram|wire (me|transfer))\b/i,
      /\b(send|lend|transfer|need)\b.{0,25}\b(money|rs\.?|₹|\$|inr|usd|funds?)\b/i,
      /\b(customs|stuck at (the )?airport|hospital bill|visa fee)\b/i,
    ],
  },
  {
    // Asking for things nobody on a dating app needs: one-time codes, PINs, card or bank details, ID numbers.
    flag: "FINANCIAL_INFO",
    patterns: [
      /\b(otp|one[- ]time (code|password)|verification code)\b.{0,30}\b(send|share|tell|give|forward)\b/i,
      /\b(send|share|tell|give|forward)\b.{0,30}\b(otp|one[- ]time (code|password)|verification code)\b/i,
      /\b(upi ?pin|atm pin|cvv|card number|card details|net ?banking|bank (account|details)|account number|ifsc)\b/i,
      /\b(aadhaa?r|pan card|passport) (number|no\.?|copy|photo)\b/i,
    ],
  },
  {
    flag: "THREAT",
    patterns: [
      /\b(i('| a)?ll|i will|gonna|going to)\b.{0,20}\b(kill|hurt|beat|rape|destroy) (you|u)\b/i,
      /\b(i('| a)?ll|i will|gonna|going to)\b.{0,20}\bfind (you|u)\s*([.!]|and\b|$)/i,
      /\b(i know where you (live|work|stay))\b/i,
      /\b(leak|post|share|send)\b.{0,25}\b(your|ur) (photos?|pics?|pictures?|videos?|nudes?)\b/i,
      /\b(pay (me|up)|send money)\b.{0,30}\b(or (else|i('| wi)ll))\b/i,
    ],
  },
  {
    // Links we refuse outright: shorteners hide the destination; raw IPs, punycode and app files are common in scams.
    flag: "RISKY_LINK",
    patterns: [
      /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc|ow\.ly|rebrand\.ly)\/\S*/i,
      /https?:\/\/\d{1,3}(\.\d{1,3}){3}/i,
      /https?:\/\/[^\s/]*xn--/i,
      /\S+\.(apk|exe|msi|scr|bat|ipa)(\b|$)/i,
    ],
  },
  { flag: "OFF_PLATFORM", patterns: [/\b(whats ?app|telegram|signal app|snap(chat)?|kik|wechat)\b/i] },
  { flag: "LINK", patterns: [/https?:\/\/\S+/i, /\bwww\.\S+\.\S+/i, /\b\S+\.(ly|link|xyz|top|click)\/\S*/i] },
  { flag: "CONTACT_INFO", patterns: [/(\+?\d[\d\s-]{8,}\d)/, /[\w.+-]+@[\w-]+\.[\w.]+/] },
  {
    flag: "ABUSE",
    // Deliberately small illustrative list; production should load a maintained multilingual lexicon.
    patterns: [/\b(idiot|stupid|ugly|slut|whore|bitch|kill yourself|kys)\b/i, /\b(chutiya|randi|kutti|harami)\b/i],
  },
];

export function screenMessage(text: string): Flag[] {
  const flags = new Set<Flag>();
  for (const r of RULES) if (r.patterns.some((p) => p.test(text))) flags.add(r.flag);
  return [...flags];
}

/** Flags that should open an automated report for moderator review. */
export const REPORTABLE_FLAGS: Flag[] = ["SCAM", "ABUSE", "THREAT", "FINANCIAL_INFO"];

/** Flags that stop the message being sent at all. */
export const BLOCKING_FLAGS: Flag[] = ["RISKY_LINK"];

/** Friendly warning shown to the recipient next to a flagged message. */
export function warningFor(flags: Flag[]): string | null {
  if (flags.includes("THREAT")) return "This message may contain a threat. Your safety comes first: you can block and report, and our team reviews threats urgently.";
  if (flags.includes("FINANCIAL_INFO")) return "Never share one-time codes, PINs, card, bank or ID details — not even with a match. Kinara staff will never ask for them.";
  if (flags.includes("SCAM")) return "This message mentions money or investments. People on Kinara will never need you to send money.";
  if (flags.includes("ABUSE")) return "This message may be abusive. You can report or block this person from the menu.";
  if (flags.includes("OFF_PLATFORM")) return "Moving to another app early is a common scam tactic. Take your time.";
  if (flags.includes("LINK")) return "Be careful opening links from people you haven't met.";
  if (flags.includes("CONTACT_INFO")) return "Only share your number when you're comfortable.";
  return null;
}
