// Shapes returned by the Kinara API (see apps' server routes under src/app/api).

export type Photo = { id: string; url: string; blurhash: string; width: number; height: number };
export type MyPhoto = Photo & { position: number; status: string; quality: "GOOD" | "DARK" | "BLURRY" | "SMALL"; hint: string };

export type Card = {
  id: string;
  firstName: string;
  age: number;
  gender: string;
  city: string;
  distance: string;
  bio: string;
  intent: string;
  profession: string | null;
  education: string | null;
  heightCm: number | null;
  lifestyle: string[];
  interests: string[];
  shared: { key: string; label: string; emoji: string }[];
  prompts: { q: string; a: string }[];
  photos: Photo[];
  morePhotosForMatches?: boolean;
  verified: boolean;
  score?: number;
  reasons?: string[];
  trait?: string | null;
  chemistry?: string | null; // "✨ Strong Chemistry" — an estimate, never a certainty
  languages?: string[];
  interestKeys?: string[];
  likeKind?: string;
  likeNote?: string | null;
};

export type Membership = { state: "FREE_FOREVER" | "FREE_TRIAL" | "ACTIVE" | "PAYMENT_PENDING" | "CANCELLED" | "EXPIRED" | "NONE"; label: string; planCode: string | null; endsAt: string | null; note: string | null; price?: string | null };
export type Me = {
  membership?: Membership;
  user: {
    id: string; email: string; phone: string | null; dob: string | null; role: string; status: string;
    emailVerified: boolean; phoneVerified: boolean; selfieStatus: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
    planCode: string; planEndsAt: string | null; onboardingStep: number; permissions: string[];
    paused?: boolean; restricted?: boolean;
  };
  profile: null | {
    firstName: string; gender: string; city: string; country: string; bio: string; intent: string; interests: string; languages?: string;
    prompts: string; education: string | null; profession: string | null; heightCm: number | null; completeness: number;
    drinking: string | null; smoking: string | null; food: string | null; exercise: string | null; pets: string | null;
  };
  preferences: null | {
    interestedIn: string; ageMin: number; ageMax: number; maxDistanceKm: number; intents: string; longDistance: boolean; callRequests?: string;
    discoverable: boolean; showOnline: boolean; readReceipts: boolean; incognito: boolean;
    notifyMatches: boolean; notifyMessages: boolean; notifyLikes: boolean; theme: "SYSTEM" | "LIGHT" | "DARK";
    showDistance: boolean; likesFrom: "EVERYONE" | "VERIFIED";
    profileVisibility?: "EVERYONE" | "VERIFIED"; photosVisibility?: "EVERYONE" | "MATCHES"; showCity?: boolean; marketing?: boolean; travelCity?: string | null; travelUntil?: string | null;
  };
  answers: Record<string, number>;
  features: { dailyLikes: number; dailyPriorityLikes: number; seeWhoLiked: boolean; advancedFilters: boolean; incognito: boolean; travelMode: boolean; monthlyBoosts: number };
  unreadNotifications: number;
  moment?: { newLikes24h: number; newMatches24h: number };
};

export type Compatibility = {
  overall: number;
  bars: { key: string; label: string; value: number }[];
  reasons: string[];
  connect: string[];
};

export type MatchRow = {
  id: string; score: number; createdAt: string; unread: number;
  other: { id: string; firstName: string; age: number; city: string; verified: boolean; photo: Photo | null };
  lastMessage: { body: string; mine: boolean; at: string } | null;
};

export type Message = {
  id: string; mine: boolean; kind: string; body: string | null; deleted: boolean; createdAt: string; read?: boolean; warning: string | null;
  media?: { url: string; w?: number; h?: number; blurhash?: string; checked?: boolean; ms?: number; type?: string } | null;
  hearts?: { mine: boolean; theirs: boolean };
  reactions?: { mine: string | null; theirs: string | null };
};

// --- Billing -----------------------------------------------------------------
export type Quote = {
  planCode: string; kind: "RECURRING" | "PASS"; currency: string; priceId: string; regularMinor: number; periodDays: number;
  todayMinor: number; discountMinor: number;
  offer: { id: string; kind: string; headline: string; badge: string | null; endsAt: string | null } | null;
  coupon: { code: string; discountMinor: number } | null; couponError: string | null;
  introDays: number | null; accessUntil: string; nextChargeAt: string | null; nextChargeMinor: number | null; terms: string[];
};
export type SubSummary = {
  status: "NONE" | "REWARD" | "PENDING" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  id?: string; kind?: string; provider?: string; planCode?: string; planName?: string; endsAt?: string; renews?: boolean; inIntro?: boolean;
  nextChargeAt?: string | null; nextChargeMinor?: number | null; currency?: string; regularMinor?: number; periodDays?: number;
  pendingPlanCode?: string | null; pendingPlanName?: string | null; bankedDays: number;
};
export type Catalogue = {
  plans: {
    code: string; name: string; features: Me["features"]; quote: Quote;
    /** Billing periods on offer (monthly, 3, 6, 12 months…), each with its own quote. */
    options?: { durationDays: number; label: string; perMonthMinor: number; quote: Quote; store?: { apple: string | null; google: string | null } | null }[];
  }[];
  passes: Quote[];
  membership?: Membership;
  freeForever?: boolean;
  subscription: SubSummary;
  provider: "MOCK" | "RAZORPAY" | "NONE";
  appleIap: { enabled: boolean };
  /** In-app purchase through the App Store / Google Play, and the ids that tie a purchase to this account. */
  store?: { enabled: boolean; appleAccountToken?: string; googleAccountId?: string };
};
export type PaymentRow = {
  id: string; status: string; purpose: string; planName: string; amountMinor: number; currency: string; discountMinor: number; couponCode: string | null;
  method: string | null; failureReason: string | null; refundedMinor: number; invoiceNo: string | null; createdAt: string; paidAt: string | null;
};
