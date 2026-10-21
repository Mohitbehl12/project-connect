// Cupid ❤️ — Kinara's suggestion helper. It is RULE-BASED (no AI model, nothing sent to an outside service):
// it only uses what is already on the two public profiles and, for reply ideas, the last message in the chat
// the member is looking at. Suggestions are respectful and never explicit, and nothing is ever sent for the
// member — they tap a suggestion to put it in the message box, then edit or send it themselves.
// An AI model can replace these rules later behind the same functions (with its own privacy review).
import { INTENTS, INTEREST_EMOJI, INTERESTS } from "./constants";
import { conversationStarters } from "./starters";

export type Idea = { text: string; why: string };
type P = { firstName: string; interests: string[]; city: string; prompts: { q: string; a: string }[]; drinking?: string | null; intent?: string };

const pick = <T,>(arr: T[], n: number, seed: number) => arr.map((x, i) => ({ x, k: (i * 9301 + seed * 49297) % 233280 })).sort((a, b) => a.k - b.k).slice(0, n).map((y) => y.x);
const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100003, 7);

export function openers(me: P, them: P, seed = 0): Idea[] {
  const out: Idea[] = conversationStarters(me, them).map((s) => ({ text: s.text, why: s.tip }));
  const fav = them.interests[0];
  if (fav) out.push({ text: `Hey, I noticed you love ${INTERESTS[fav]?.toLowerCase() ?? fav} ${INTEREST_EMOJI[fav] ?? ""}. What got you into it?`.replace(/\s+\./, "."), why: `${them.firstName}'s interests` });
  out.push({ text: "Okay, your profile caught my attention 👀 What's the story behind your first photo?", why: "Playful and easy to answer" });
  out.push({ text: them.drinking === "NEVER" || me.drinking === "NEVER" ? "Coffee or chai? ☕" : "Coffee or cocktails? ☕🍸", why: "A light this-or-that" });
  const seen = new Set<string>();
  return pick(out.filter((o) => !seen.has(o.text) && seen.add(o.text)), 5, seed);
}

const TOPICS: [RegExp, string[]][] = [
  [/\b(travel|trip|holiday|vacation|goa|manali|beach|mountains?)\b/i, ["That sounds amazing ✈️ Where's next on your list?", "Okay, now I want to go. Window seat or aisle?"]],
  [/\b(food|eat|dinner|biryani|pizza|dosa|cook|recipe|restaurant)\b/i, ["Now I'm hungry 😄 What's your go-to comfort food?", "You clearly have taste. Best place in town for it?"]],
  [/\b(music|song|concert|gig|playlist|band)\b/i, ["Good taste 🎵 What's been on repeat for you lately?", "Okay, one song you'd put on a road-trip playlist?"]],
  [/\b(work|office|job|meeting|deadline)\b/i, ["Sounds like a full day — what do you do to switch off after work?", "Hope it's lighter tomorrow! What's the best part of your job?"]],
  [/\b(weekend|saturday|sunday)\b/i, ["Nice! Ideal Sunday: lazy morning or out early?", "Any plans you're excited about this weekend?"]],
  [/\b(movie|film|series|show|netflix)\b/i, ["Ooh, recommend me one I haven't seen 🎬", "Comfort rewatch or something new?"]],
  [/\b(dog|cat|pet|puppy)\b/i, ["Okay, I need to know their name 🐶", "Pets make everything better. Do you have one?"]],
];

export function replies(lastFromThem: string | null, them: P, seed = 0): Idea[] {
  const t = (lastFromThem ?? "").trim();
  const out: Idea[] = [];
  if (!t) return openers({ firstName: "", interests: [], city: "", prompts: [] }, them, seed).slice(0, 3);
  for (const [re, ideas] of TOPICS) if (re.test(t)) for (const i of ideas) out.push({ text: i, why: "Picks up on what they said" });
  if (/\?\s*$/.test(t)) out.push({ text: "Good question! Honestly… [your answer]. What about you?", why: "Answer, then ask back" });
  if (/^(hi|hey|hello|hii+|heyy+)\b/i.test(t)) out.push({ text: `Hey ${them.firstName}! 😊 How's your week going?`, why: "A warm hello back" });
  if (/(haha|lol|😂|🤣)/i.test(t)) out.push({ text: "You're funny 😄 Okay, tell me something that made you laugh today.", why: "Keeps the mood light" });
  out.push({ text: "Tell me more — I'm curious 👀", why: "Shows interest" });
  out.push({ text: `So ${them.firstName}, what's something people are always surprised to learn about you?`, why: "Opens up a new topic" });
  return pick(out, 4, seed);
}

const DATE_BY_INTEREST: Record<string, string> = {
  coffee: "A slow coffee at a café you both like ☕", food_trails: "A street-food walk — you pick one stall, they pick the next 🍜",
  trekking: "An easy morning trail, then breakfast 🥾", board_games: "A board-game café — loser buys dessert 🎲", films: "An early film, then a walk to talk about it 🎬",
  music_live: "A small live gig 🎵", art: "A gallery or museum visit, then chai 🖼️", reading: "A bookshop wander — pick a book for each other 📚",
  cooking: "A cooking class for two 🍳", running: "A park run, then coffee 🏃", photography: "A golden-hour photo walk 📸", standup: "A stand-up comedy night 🎤",
  dogs: "A walk in a dog-friendly park 🐶", dance: "A beginners' dance class 💃", yoga: "A weekend yoga class, then smoothies 🧘",
};

export function dateIdeas(me: P, them: P, seed = 0): Idea[] {
  const shared = me.interests.filter((x) => them.interests.includes(x));
  const out: Idea[] = shared.filter((k) => DATE_BY_INTEREST[k]).map((k) => ({ text: DATE_BY_INTEREST[k], why: `You both like ${INTERESTS[k]?.toLowerCase() ?? k}` }));
  for (const k of them.interests) if (DATE_BY_INTEREST[k] && !shared.includes(k)) out.push({ text: DATE_BY_INTEREST[k], why: `${them.firstName} likes ${INTERESTS[k]?.toLowerCase() ?? k}` });
  out.push({ text: "A walk somewhere scenic, then something sweet 🍦", why: "Easy and relaxed" }, { text: "Coffee at a busy café — short, simple, no pressure ☕", why: "A good first meet" });
  return pick(out, 4, seed).map((i) => ({ ...i, why: `${i.why} · meet somewhere public` }));
}

export function bios(me: P & { intent?: string }, seed = 0): Idea[] {
  const names = me.interests.slice(0, 3).map((k) => `${INTEREST_EMOJI[k] ?? ""} ${INTERESTS[k]?.toLowerCase() ?? k}`.trim());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "good conversations";
  const intent = me.intent ? INTENTS[me.intent as keyof typeof INTENTS]?.toLowerCase() : null;
  const out: Idea[] = [
    { text: `Happiest with ${list}. Looking for someone to share the small moments with${intent ? ` — ${intent}` : ""}. Bonus points if you can recommend a good café.`, why: "Warm and simple" },
    { text: `${me.city ? `${me.city} local. ` : ""}Into ${list}. I'll ask you a hundred questions on the first date — fair warning 😄`, why: "Playful" },
    { text: `Part-time ${names[0]?.replace(/^\S+\s/, "") ?? "explorer"}, full-time optimist. Let's swap recommendations and see where it goes ✨`, why: "Light and confident" },
  ];
  return pick(out, 3, seed);
}
