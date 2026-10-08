import { NextResponse, type NextRequest } from "next/server";

// Cheap edge gate: no session cookie → send to login. Real auth (signature, status, role) is enforced in every API route.
const PROTECTED = ["/onboarding", "/discover", "/likes", "/matches", "/notifications", "/profile", "/settings", "/plans", "/safety-center", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("pc_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
