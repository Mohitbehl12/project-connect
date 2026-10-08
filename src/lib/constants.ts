// Single source of truth for enum-like values, option labels and the personality question bank.
// Everything here is product copy written for Project Connect — not copied from any other app.

export const ROLES = ["USER", "MODERATOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const GENDERS = { WOMAN: "Woman", MAN: "Man", NONBINARY: "Non-binary" } as const;
export type Gender = keyof typeof GENDERS;

export const INTENTS = {
  MARRIAGE: "Marriage-minded",
  LONG_TERM: "A long-term relationship",
  LONG_TERM_OPEN: "Long-term, open to short",
  FIGURING_OUT: "Still figuring it out",
  CASUAL: "Something casual",
  FRIENDS: "New friends",
} as const;
export type Intent = keyof typeof INTENTS;

// Which intents sit comfortably together (symmetric). Same intent = full credit.
export const INTENT_AFFINITY: Record<Intent, Partial<Record<Intent, number>>> = {
  MARRIAGE: { LONG_TERM: 0.8, LONG_TERM_OPEN: 0.5, FIGURING_OUT: 0.2 },
  LONG_TERM: { MARRIAGE: 0.8, LONG_TERM_OPEN: 0.8, FIGURING_OUT: 0.4 },
  LONG_TERM_OPEN: { MARRIAGE: 0.5, LONG_TERM: 0.8, FIGURING_OUT: 0.6, CASUAL: 0.4 },
  FIGURING_OUT: { MARRIAGE: 0.2, LONG_TERM: 0.4, LONG_TERM_OPEN: 0.6, CASUAL: 0.5, FRIENDS: 0.4 },
  CASUAL: { LONG_TERM_OPEN: 0.4, FIGURING_OUT: 0.5 },
  FRIENDS: { FIGURING_OUT: 0.4 },
};

export const LIFESTYLE = {
  drinking: { NEVER: "Doesn't drink", SOCIAL: "Drinks socially", REGULAR: "Drinks regularly" },
  smoking: { NEVER: "Doesn't smoke", SOCIAL: "Smokes occasionally", REGULAR: "Smokes" },
  food: { VEG: "Vegetarian", EGGETARIAN: "Eggetarian", VEGAN: "Vegan", JAIN: "Jain food", NONVEG: "Eats non-veg", ANY: "Eats anything" },
  exercise: { RARELY: "Rarely works out", SOMETIMES: "Works out sometimes", OFTEN: "Active most days" },
  pets: { HAS: "Has a pet", WANTS: "Wants a pet", NONE: "No pets", ALLERGIC: "Allergic to pets" },
} as const;
export type LifestyleKey = keyof typeof LIFESTYLE;

export const INTERESTS: Record<string, string> = {
  travel: "Travel", trekking: "Trekking", cooking: "Cooking", reading: "Reading", films: "Films",
  music_live: "Live music", indie_music: "Indie music", classical: "Classical music", dance: "Dance",
  cricket: "Cricket", football: "Football", running: "Running", yoga: "Yoga", gym: "Gym",
  photography: "Photography", art: "Art & museums", theatre: "Theatre", standup: "Stand-up comedy",
  gaming: "Gaming", board_games: "Board games", coffee: "Coffee", food_trails: "Food trails",
  startups: "Startups", tech: "Tech", writing: "Writing", poetry: "Poetry", volunteering: "Volunteering",
  dogs: "Dogs", cats: "Cats", gardening: "Gardening", cycling: "Cycling", swimming: "Swimming",
  podcasts: "Podcasts", fashion: "Fashion", spirituality: "Spirituality", anime: "Anime",
};

// Original personality bank. Each question is a 1–5 scale between two poles.
export const PERSONALITY_QUESTIONS = [
  { key: "energy", prompt: "A free Saturday evening, ideally:", left: "Quiet night in", right: "Out with a crowd" },
  { key: "planning", prompt: "Trips are better when they're:", left: "Planned to the hour", right: "Decided on the way" },
  { key: "sharing", prompt: "When something's on my mind I:", left: "Process it alone first", right: "Talk it out right away" },
  { key: "conflict", prompt: "In a disagreement I tend to:", left: "Take space, revisit later", right: "Resolve it right then" },
  { key: "pace", prompt: "Getting to know someone, I prefer:", left: "Slow and steady", right: "Fast and all-in" },
  { key: "texting", prompt: "Between dates, my texting style is:", left: "Occasional check-ins", right: "Talking all day" },
  { key: "ambition", prompt: "Right now my focus leans toward:", left: "Life outside work", right: "Building my career" },
  { key: "novelty", prompt: "Weekend plans should be:", left: "Familiar favourites", right: "Something new every time" },
  { key: "family", prompt: "Family involvement in my relationship:", left: "Keep it between us", right: "Family is part of it" },
  { key: "affection", prompt: "I show I care mostly through:", left: "Doing things for them", right: "Saying it out loud" },
] as const;

export const REPORT_CATEGORIES = {
  FAKE: "Fake profile or catfishing",
  SCAM: "Scam or asking for money",
  HARASSMENT: "Harassment or threats",
  INAPPROPRIATE: "Inappropriate content",
  SPAM: "Spam or promotion",
  UNDERAGE: "May be under 18",
  SAFETY: "I feel unsafe",
  OTHER: "Something else",
} as const;
export type ReportCategory = keyof typeof REPORT_CATEGORIES;

export const REPORT_PRIORITY: Record<ReportCategory, string> = {
  UNDERAGE: "CRITICAL", SAFETY: "CRITICAL", HARASSMENT: "HIGH", SCAM: "HIGH",
  FAKE: "MEDIUM", INAPPROPRIATE: "MEDIUM", SPAM: "LOW", OTHER: "LOW",
};

export const DATE_KINDS = { COFFEE: "Coffee", MEAL: "A meal", WALK: "A walk", ACTIVITY: "An activity", OTHER: "Something else" } as const;

// Countries supported at launch. Add rows here (or move to DB) to expand.
export const COUNTRIES: Record<string, { name: string; currency: string; tz: string }> = {
  IN: { name: "India", currency: "INR", tz: "Asia/Kolkata" },
  US: { name: "United States", currency: "USD", tz: "America/New_York" },
  GB: { name: "United Kingdom", currency: "GBP", tz: "Europe/London" },
  CA: { name: "Canada", currency: "CAD", tz: "America/Toronto" },
  AU: { name: "Australia", currency: "AUD", tz: "Australia/Sydney" },
  AE: { name: "United Arab Emirates", currency: "AED", tz: "Asia/Dubai" },
  SG: { name: "Singapore", currency: "SGD", tz: "Asia/Singapore" },
  JP: { name: "Japan", currency: "JPY", tz: "Asia/Tokyo" },
  DE: { name: "Germany", currency: "EUR", tz: "Europe/Berlin" },
  FR: { name: "France", currency: "EUR", tz: "Europe/Paris" },
  NL: { name: "Netherlands", currency: "EUR", tz: "Europe/Amsterdam" },
};

// Approximate city centres. Users pick a city; we store its centre plus a small random jitter,
// so we never need (or store) a device GPS fix for discovery.
export const CITIES: Record<string, { country: string; lat: number; lng: number }> = {
  Delhi: { country: "IN", lat: 28.6139, lng: 77.209 },
  Gurugram: { country: "IN", lat: 28.4595, lng: 77.0266 },
  Noida: { country: "IN", lat: 28.5355, lng: 77.391 },
  Mumbai: { country: "IN", lat: 19.076, lng: 72.8777 },
  Pune: { country: "IN", lat: 18.5204, lng: 73.8567 },
  Bengaluru: { country: "IN", lat: 12.9716, lng: 77.5946 },
  Hyderabad: { country: "IN", lat: 17.385, lng: 78.4867 },
  Chennai: { country: "IN", lat: 13.0827, lng: 80.2707 },
  Kolkata: { country: "IN", lat: 22.5726, lng: 88.3639 },
  Jaipur: { country: "IN", lat: 26.9124, lng: 75.7873 },
  "New York": { country: "US", lat: 40.7128, lng: -74.006 },
  "San Francisco": { country: "US", lat: 37.7749, lng: -122.4194 },
  London: { country: "GB", lat: 51.5072, lng: -0.1276 },
  Toronto: { country: "CA", lat: 43.6532, lng: -79.3832 },
  Sydney: { country: "AU", lat: -33.8688, lng: 151.2093 },
  Dubai: { country: "AE", lat: 25.2048, lng: 55.2708 },
  Singapore: { country: "SG", lat: 1.3521, lng: 103.8198 },
  Tokyo: { country: "JP", lat: 35.6762, lng: 139.6503 },
  Berlin: { country: "DE", lat: 52.52, lng: 13.405 },
  Paris: { country: "FR", lat: 48.8566, lng: 2.3522 },
  Amsterdam: { country: "NL", lat: 52.3676, lng: 4.9041 },
};

export const MIN_AGE = 18;
