import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// An optimistic check: no session cookie means signed out, so pages go to the sign-in page and
// API calls get a 401. A cookie proves nothing; every route checks the session itself
// (lib/session.ts).
const PUBLIC = ["/sign-in", "/privacy", "/api/auth"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(req)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Sign in first.", { status: 401 });
  const to = new URL("/sign-in", req.url);
  if (pathname !== "/") to.searchParams.set("next", pathname);
  // a refused sign-in lands on the page it was for, saying why: keep the reason
  const error = req.nextUrl.searchParams.get("error");
  if (error) to.searchParams.set("error", error);
  return NextResponse.redirect(to);
}

export const config = {
  // everything but Next's own files and the app's icons and fonts
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|ico|woff2?)$).*)"],
};
