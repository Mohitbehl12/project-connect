// Ready-made, kind ways to end a conversation (no free text: nothing hurtful can be typed into a goodbye).
export const CLOSING_NOTES = {
  NOT_A_MATCH: "It was lovely chatting with you. I don't think we're the right match, and I wanted to say so rather than just disappear. Wishing you the best!",
  NO_SPARK: "I've enjoyed our chat, but I'm not feeling the connection I'm looking for. Thank you for your time, and good luck!",
  BUSY: "Life has got busy and I can't give this the attention it deserves right now. Take care!",
} as const;
export type ClosingNote = keyof typeof CLOSING_NOTES;
