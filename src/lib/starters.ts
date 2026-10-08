// Conversation starters built only from what both people already show publicly on their profiles.
// Each starter has a short reason ("tip") and a ready-to-send opening line ("text").
import { INTERESTS } from "./constants";

export type Starter = { tip: string; text: string };

const BY_INTEREST: Record<string, Starter> = {
  travel: { tip: "You both love to travel", text: "Which trip do you still think about the most?" },
  trekking: { tip: "You're both into trekking", text: "Which trail would you happily do again tomorrow?" },
  cooking: { tip: "You both cook", text: "What's the one dish you'd make to impress someone?" },
  reading: { tip: "You're both readers", text: "What's the last book you couldn't stop recommending?" },
  films: { tip: "You both like films", text: "Which film do you rewatch without any shame?" },
  music_live: { tip: "You both go to gigs", text: "What's the best live show you've ever been to?" },
  coffee: { tip: "Coffee people, both of you", text: "Where do you go for your favourite coffee?" },
  food_trails: { tip: "You both chase good food", text: "What's the most underrated dish in your city?" },
  dogs: { tip: "You both like dogs", text: "Tell me about the best dog you've ever met." },
  cricket: { tip: "Cricket fans, both", text: "Which match would you relive if you could?" },
  running: { tip: "You both run", text: "What's the run that felt the best?" },
  board_games: { tip: "You both play board games", text: "Which board game do you always win?" },
  photography: { tip: "You both take photos", text: "What's a photo you've taken that you're proud of?" },
  standup: { tip: "You both like stand-up", text: "Who's made you laugh the hardest recently?" },
};

export function conversationStarters(
  a: { interests: string[]; city: string },
  b: { interests: string[]; city: string; prompts: { q: string; a: string }[]; firstName: string },
): Starter[] {
  const out: Starter[] = [];
  const shared = a.interests.filter((x) => b.interests.includes(x));
  for (const k of shared) {
    const name = INTERESTS[k]?.toLowerCase() ?? k;
    out.push(BY_INTEREST[k] ?? { tip: `You both enjoy ${name}`, text: `How did you get into ${name}?` });
    if (out.length >= 2) break;
  }
  if (b.prompts[0]) out.push({ tip: `${b.firstName}'s prompt: "${b.prompts[0].q}…"`, text: `"${b.prompts[0].a}" — tell me more about that!` });
  if (a.city === b.city) out.push({ tip: `You're both in ${a.city}`, text: `What's a spot in ${a.city} locals love that tourists miss?` });
  out.push({ tip: "An easy opener", text: "What made your week better than expected?" });
  return out.slice(0, 4);
}
