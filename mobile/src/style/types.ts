import type { Measurements, Spec } from "@shared/style/darzi.js";
export type StyleProfile = {
  id: string; name: string; rel: string; fit: string; m: Measurements | null; ref: Record<string, string> | null; method: string | null;
  updatedAt: string; fitScore: number; fitLocked: boolean; gates: [string, number, string][];
};
export type StyleOrder = {
  id: string; spec: Spec; description: string; garment: string; profileName: string; priceMinor: number; currency: string; status: number; statusLabel: string;
  statuses: string[]; paymentStatus: string; fitLocked: boolean; notes: string; eta: string | null; createdAt: string; feedback: { fit: string; rating: number; note: string } | null;
  events?: { status: number; label: string; note: string | null; at: string }[]; payUrl?: string | null; finished?: [string, number][];
};
export type StyleDesign = { id: string; name: string; spec: Spec; prompt: string | null; price: number; description: string; createdAt: string };
