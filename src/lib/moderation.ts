// Rule-based first-line message screening. Pure function — unit tested.
// An ML/LLM classifier can be layered on top later; rules stay as a fast, explainable baseline.

export type Flag = "SCAM" | "OFF_PLATFORM" | "LINK" | "RISKY_LINK" | "ABUSE" | "THREAT" | "FINANCIAL_INFO" | "CONTACT_INFO" | "MINOR" | "SLOW_BURN";

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
      /\bfind (out )?where (you|u) (live|work|stay)\b/i,
      /\b(i('| a)?ll|i will|gonna|going to)\b.{0,60}\b(kill|hurt|beat|rape) (you|u)\b/i,
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
  {
    // The writer says, in the present tense, that they are under 18 ("I'm 16", "I am in class 11", "main 16 saal ki hoon").
    // A signal for a person to check — never a decision. Distances, durations and other people's ages don't count.
    flag: "MINOR",
    patterns: [
      /\b(i'?m|i am|im)\s+(only\s+|just\s+)?(1[0-7])(\s*(years?|yrs?|y\.?o\.?|y\/o)(\s*old)?)?\b(?!\s*(years?\s+|yrs?\s+)?(into|of|in|since|ago|away|km|kms|kg|cm|mins?|minutes?|hours?|hrs?|days?|weeks?|months?|times?|%|th\b|st\b|nd\b|rd\b))/i,
      /\b(i'?m|i am|im)\s+(not\s+18\s+yet|under\s*-?\s*18|a\s+minor|underage|still\s+in\s+school)\b/i,
      /\b(i'?m|i am|im)\s+(in|studying in)\s+((class|std\.?|standard|grade)\s*(6|7|8|9|10|11|12)(th)?|(6|7|8|9|10|11|12)th)\b(?!\s*(year|sem|semester))/i,
      /\b(i'?m|i am|im|i)\s+(turning|will turn|will be|turn)\s+18\b/i,
      /\bmy age is\s+(1[0-7])\b/i,
      /\b(main|mai|mein)\s+(1[0-7])\s+(saal|sal)\s+(ki|ka)\b/i,
      /\b(meri|mera)\s+(umar|umra|umr|age)\s+(1[0-7])\b/i,
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
  // Spacing tricks ("send  money", zero-width characters, line breaks) must not slip past the rules.
  const t = text.normalize("NFKC").replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "").replace(/\s+/g, " ");
  for (const r of RULES) if (r.patterns.some((p) => p.test(t))) flags.add(r.flag);
  return [...flags];
}

/**
 * Gentler money talk than the SCAM rule: loans, bills, emergencies, investing, payment apps. Ordinary in a new chat
 * ("let's split the bill"), but in a chat that has run for weeks without the two meeting it is the classic turn of a
 * romance scam ("pig butchering"). Used only together with the chat's age and length — see slowBurn().
 */
const MONEY_TALK = [
  /\b(loan|lend|borrow|owe|debt|emi|rent|bills?|fees?|fine|deposit|advance)\b/i,
  /\b(emergency|hospital|surgery|medical|accident|stuck|urgent(ly)?)\b.{0,40}\b(money|pay|cash|rs\.?|₹|\$|help)\b/i,
  /\b(invest(ing|ment)?|trading|stocks?|crypto|bitcoin|usdt|returns?|profit|platform|portfolio)\b/i,
  /\b(upi|gpay|google pay|phonepe|paytm|paypal|venmo|bank transfer|account number|qr code)\b/i,
  /\b(send|transfer|pay|help)\b.{0,20}\b(me|us)\b.{0,20}\b(money|cash|rs\.?|₹|\$|amount|\d{3,})\b/i,
  /(₹|rs\.?\s?|inr\s?|\$|usd\s?)\s?\d[\d,]{2,}/i,
];
export const SLOW_BURN = { minDays: 7, minMessages: 30 };

/** Money talk in a long-running chat whose two people haven't planned to meet: warn the person receiving it. */
export function slowBurn(text: string, chat: { ageDays: number; messages: number; datePlanned: boolean }): boolean {
  if (chat.datePlanned || chat.ageDays < SLOW_BURN.minDays || chat.messages < SLOW_BURN.minMessages) return false;
  const t = text.normalize("NFKC").replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "").replace(/\s+/g, " ");
  return MONEY_TALK.some((p) => p.test(t));
}

/** Flags that should open an automated report for moderator review. */
export const REPORTABLE_FLAGS: Flag[] = ["SCAM", "ABUSE", "THREAT", "FINANCIAL_INFO", "MINOR"];

/** Flags that stop the message being sent at all. */
export const BLOCKING_FLAGS: Flag[] = ["RISKY_LINK"];

/** Friendly warning shown to the recipient next to a flagged message. */
export function warningFor(flags: Flag[]): string | null {
  if (flags.includes("MINOR")) return "Kinara is only for adults. If you think this person may be under 18, stop the conversation and report them — our team checks every report like this first.";
  if (flags.includes("THREAT")) return "This message may contain a threat. Your safety comes first: you can block and report, and our team reviews threats urgently.";
  if (flags.includes("FINANCIAL_INFO")) return "Never share one-time codes, PINs, card, bank or ID details — not even with a match. Kinara staff will never ask for them.";
  if (flags.includes("SLOW_BURN")) return "This chat has gone on for a while and now mentions money. Romance scams often build trust for weeks before asking for money, a loan or an \"investment\". Never send money to someone you haven't met — and talk to someone you trust first.";
  if (flags.includes("SCAM")) return "This message mentions money or investments. People on Kinara will never need you to send money.";
  if (flags.includes("ABUSE")) return "This message may be abusive. You can report or block this person from the menu.";
  if (flags.includes("OFF_PLATFORM")) return "Moving to another app early is a common scam tactic. Take your time.";
  if (flags.includes("LINK")) return "Be careful opening links from people you haven't met.";
  if (flags.includes("CONTACT_INFO")) return "Only share your number when you're comfortable.";
  return null;
}
