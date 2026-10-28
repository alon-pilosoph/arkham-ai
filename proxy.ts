import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { INVITE_COOKIE } from "@/lib/campaign/invite-cookie";

// An optimistic check: no session cookie means signed out, so pages go to the sign-in page and
// API calls get a 401. A cookie proves nothing; every route checks the session itself
// (lib/session.ts).
const PUBLIC = ["/sign-in", "/privacy", "/api/auth"];

const INVITE_DAYS = 7;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // an invite link: keep its token for the sign-up it allows (lib/access.ts), then sign in
  const invite = pathname.match(/^\/invite\/([A-Za-z0-9_-]{16,64})$/);
  if (invite) {
    const res = getSessionCookie(req) ? NextResponse.next() : redirectToSignIn(req, pathname);
    res.cookies.set(INVITE_COOKIE, invite[1], {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      maxAge: INVITE_DAYS * 24 * 3600,
      path: "/",
    });
    return res;
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(req)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Sign in first.", { status: 401 });
  return redirectToSignIn(req, pathname);
}

function redirectToSignIn(req: NextRequest, pathname: string) {
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
