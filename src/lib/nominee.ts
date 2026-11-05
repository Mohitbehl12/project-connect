import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSafe, seal } from "./crypto";

// DPDP Act 2023 s.14: a member may name someone to exercise their privacy rights (access, correction, erasure,
// complaints) if they die or can no longer act. Kinara never contacts the nominee; the nominee contacts the
// Grievance Officer with proof, and a person handles the request.

export const RELATIONSHIPS = ["Partner or spouse", "Parent", "Child", "Sibling", "Friend", "Other"] as const;
const aad = (userId: string) => `nominee:${userId}`;

export async function myNominee(userId: string) {
  const n = await db.query.nominees.findFirst({ where: eq(schema.nominees.userId, userId) });
  return n ? { name: n.name, relationship: n.relationship, contact: openSafe(n.contact, aad(userId)), updatedAt: n.updatedAt } : null;
}

export async function setNominee(userId: string, v: { name: string; relationship: string; contact: string }) {
  const row = { name: v.name, relationship: v.relationship, contact: seal(v.contact, aad(userId)), updatedAt: new Date() };
  await db.insert(schema.nominees).values({ userId, ...row }).onConflictDoUpdate({ target: schema.nominees.userId, set: row });
  return myNominee(userId);
}

export async function removeNominee(userId: string) {
  const r = await db.delete(schema.nominees).where(eq(schema.nominees.userId, userId)).returning({ u: schema.nominees.userId });
  return r.length > 0;
}
