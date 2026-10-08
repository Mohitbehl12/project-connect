import { and, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { ageFromDob } from "@/lib/matching";

export const GET = route(async ({ req }) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 100);
  const status = url.searchParams.get("status");
  const verification = url.searchParams.get("verification");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 25;

  const where: SQL[] = [];
  if (q) where.push(or(like(schema.users.email, `%${q}%`), like(schema.profiles.firstName, `%${q}%`), like(schema.profiles.city, `%${q}%`), eq(schema.users.id, q))!);
  if (status) where.push(eq(schema.users.status, status));
  if (verification) where.push(eq(schema.users.selfieStatus, verification));

  const base = db.select({ u: schema.users, p: schema.profiles }).from(schema.users)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .where(where.length ? and(...where) : undefined);
  const rows = await base.orderBy(desc(schema.users.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const [{ n }] = await db.select({ n: count() }).from(schema.users)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .where(where.length ? and(...where) : undefined);

  return ok({
    page, pageSize, total: n,
    users: rows.map(({ u, p }) => ({
      id: u.id, email: u.email, role: u.role, status: u.status, selfieStatus: u.selfieStatus, planCode: u.planCode,
      createdAt: u.createdAt, lastActiveAt: u.lastActiveAt,
      name: p?.firstName ?? null, age: p ? ageFromDob(p.dob) : null, city: p?.city ?? null, country: p?.country ?? null, completeness: p?.completeness ?? 0,
    })),
  });
}, { permission: "users.view" });
