import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import { proxy } from "@/proxy";

const get = (path: string, cookie?: string) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }));

describe("proxy", () => {
  test("sends a signed-out page visit to the sign-in page, remembering where it was going", () => {
    expect(get("/").headers.get("location")).toBe("http://localhost:3000/sign-in");
    expect(get("/campaigns/x").headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fcampaigns%2Fx");
  });

  test("keeps the reason a sign-in was refused", () => {
    expect(get("/?error=invite_only").headers.get("location")).toBe("http://localhost:3000/sign-in?error=invite_only");
  });

  test("answers a signed-out API call with a 401", () => {
    expect(get("/api/chat").status).toBe(401);
  });

  test("lets through the public pages, sign-in itself, and anyone with a session cookie", () => {
    for (const path of ["/sign-in", "/privacy", "/api/auth/sign-in/magic-link"])
      expect(get(path).headers.get("x-middleware-next"), path).toBe("1");
    expect(get("/", "better-auth.session_token=abc").headers.get("x-middleware-next")).toBe("1");
  });
});
