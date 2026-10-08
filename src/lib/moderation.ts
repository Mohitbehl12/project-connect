// Rule-based first-line message screening. Pure function — unit tested.
// An ML/LLM classifier can be layered on top later; rules stay as a fast, explainable baseline.

export type Flag = "SCAM" | "OFF_PLATFORM" | "LINK" | "ABUSE" | "CONTACT_INFO";

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
export const REPORTABLE_FLAGS: Flag[] = ["SCAM", "ABUSE"];

/** Friendly warning shown to the recipient next to a flagged message. */
export function warningFor(flags: Flag[]): string | null {
  if (flags.includes("SCAM")) return "This message mentions money or investments. People on Project Connect will never need you to send money.";
  if (flags.includes("ABUSE")) return "This message may be abusive. You can report or block this person from the menu.";
  if (flags.includes("OFF_PLATFORM")) return "Moving to another app early is a common scam tactic. Take your time.";
  if (flags.includes("LINK")) return "Be careful opening links from people you haven't met.";
  if (flags.includes("CONTACT_INFO")) return "Only share your number when you're comfortable.";
  return null;
}
