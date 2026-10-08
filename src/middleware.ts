import { NextResponse, type NextRequest } from "next/server";

// Cheap edge gate: no session cookie → send to login. Real auth (signature, status, role) is enforced in every API route.
const PROTECTED = ["/onboarding", "/discover", "/likes", "/matches", "/notifications", "/profile", "/settings", "/plans", "/safety-center", "/admin"];

// Browser origins allowed to call the API with bearer tokens (the Expo web preview, for example).
// Native apps don't send an Origin header and are unaffected. Comma-separated; empty = none.
const ALLOWED = (process.env.CORS_ORIGINS ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8081"))
  .split(",").map((s) => s.trim()).filter(Boolean);

function cors(res: NextResponse, origin: string) {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "authorization,content-type");
  res.headers.set("Access-Control-Max-Age", "600");
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin") ?? "";
    const allowed = origin && ALLOWED.includes(origin);
    if (req.method === "OPTIONS") return allowed ? cors(new NextResponse(null, { status: 204 }), origin) : new NextResponse(null, { status: 403 });
    return allowed ? cors(NextResponse.next(), origin) : NextResponse.next();
  }
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("pc_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
