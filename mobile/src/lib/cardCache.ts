import type { Card } from "./types";

// Cards already fetched for Discover or Likes, so opening a profile is instant (no second request).
const cache = new Map<string, Card>();
export const cardCache = {
  put(cards: Card[]) { for (const c of cards) cache.set(c.id, c); },
  get(id: string) { return cache.get(id); },
};
