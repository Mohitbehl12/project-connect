import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ZodError, type ZodType } from "zod";
import { currentUser } from "./auth";
import { can, type Permission } from "./rbac";
import type { User } from "@/db/schema";

import { ApiError } from "./http-error";
export { ApiError };

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.", "bad_json");
  }
  return schema.parse(raw);
}

type Ctx<P> = { params: Promise<P> };

const ADVERTISER_PATHS = /^\/api\/(ads|auth|me|notifications|security|consents|legal)(\/|$)/;

/** Wraps a route handler with auth, optional permission check, and uniform error handling. */
export function route<P = Record<string, string>>(
  handler: (args: { req: Request; user: User; params: P }) => Promise<Response>,
  opts: { permission?: Permission; allowSuspended?: boolean; allowOnboarding?: boolean } = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const user = await currentUser();
      if (!user) throw new ApiError(401, "Please log in to continue.", "unauthenticated");
      if (user.status === "SUSPENDED" && !opts.allowSuspended)
        throw new ApiError(403, "Your account is suspended. Check your notifications for details.", "suspended");
      // Business (advertiser) logins only reach the advertiser pages and their own account — never member data.
      if (user.role === "ADVERTISER" && !ADVERTISER_PATHS.test(new URL(req.url).pathname))
        throw new ApiError(403, "This is a business account. It can only use the advertiser pages.", "advertiser_only");
      if (opts.permission && !can(user.role, opts.permission))
        throw new ApiError(403, "You don't have permission to do that.", "forbidden");
      if (opts.permission && user.role !== "USER") await (await import("./staff")).staffGate(user);
      return await handler({ req, user, params: (await ctx?.params) as P });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Same as route() but without requiring a session (public endpoints). */
export function publicRoute<P = Record<string, string>>(handler: (args: { req: Request; params: P }) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      return await handler({ req, params: (await ctx?.params) as P });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const field = first?.path.join(".");
    return NextResponse.json(
      { error: field ? `${field}: ${first.message}` : "Some fields are invalid.", code: "validation", issues: e.issues },
      { status: 422 },
    );
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: "Something went wrong on our side. Try again in a moment.", code: "internal" }, { status: 500 });
}
