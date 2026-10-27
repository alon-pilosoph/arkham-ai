// Accounts end to end against PGlite in memory: Better Auth's real endpoints, sign-in links read
// from a file outbox, and the real session check and question cap (setup.ts mocks both for every
// other test).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Email } from "@/lib/email";

const OWNER = "owner@example.com";
const STRANGER = "stranger@example.com";
const BASE = "http://localhost:3000";
const outbox = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "arkham-outbox-")), "mail.jsonl");

const { currentUser } = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
const { takeQuestion } = await vi.importActual<typeof import("@/lib/question-cap")>("@/lib/question-cap");
const { getAuth } = await import("@/lib/auth");

beforeAll(() => {
  vi.stubEnv("OWNER_EMAIL", OWNER);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-0123");
  vi.stubEnv("BETTER_AUTH_URL", BASE);
  vi.stubEnv("ARKHAM_OUTBOX", outbox);
});

beforeEach(() => fs.rmSync(outbox, { force: true }));

function sent(): Email[] {
  return fs.existsSync(outbox)
    ? fs
        .readFileSync(outbox, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as Email)
    : [];
}

async function askForLink(email: string): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, callbackURL: "/", errorCallbackURL: "/sign-in" }),
    }),
  );
}

/** Opens a sign-in link the way a browser would; returns where it sent us and the session cookie. */
async function openLink(url: string): Promise<{ location: string; cookie: string }> {
  const res = await (await getAuth()).handler(new Request(url));
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("session_token"))
    .join("; ");
  return { location: res.headers.get("location") ?? "", cookie };
}

const linkIn = (mail: Email) => mail.text.match(/https?:\/\/\S+/)?.[0] ?? "";

describe("sign-in links", () => {
  test("the owner gets a link, and opening it signs them in", async () => {
    expect((await askForLink(OWNER)).status).toBe(200);
    const [mail] = sent();
    expect(mail.to).toBe(OWNER);
    expect(mail.subject).toMatch(/Sign in/);
    const { location, cookie } = await openLink(linkIn(mail));
    expect(new URL(location, BASE).pathname).toBe("/");
    expect(cookie).not.toBe("");
    expect(await currentUser(new Headers({ cookie }))).toMatchObject({ email: OWNER });
  });

  test("a stranger is told the same, and is sent nothing", async () => {
    expect((await askForLink(STRANGER)).status).toBe(200);
    expect(sent()).toEqual([]);
  });

  test("a stranger holding a link still gets no account: the app is invite-only", async () => {
    // a link sent while the stranger was allowed, used after they no longer are
    vi.stubEnv("OWNER_EMAIL", STRANGER);
    await askForLink(STRANGER);
    vi.stubEnv("OWNER_EMAIL", OWNER);
    const { location, cookie } = await openLink(linkIn(sent()[0]));
    expect(location).toMatch(/\/sign-in\?error=invite_only/);
    expect(cookie).toBe("");
  });

  test("a link works once", async () => {
    await askForLink(OWNER);
    const link = linkIn(sent()[0]);
    expect((await openLink(link)).cookie).not.toBe("");
    const again = await openLink(link);
    expect(again.cookie).toBe("");
    expect(again.location).toMatch(/\/sign-in\?error=/);
  });

  test("no cookie, or a made-up one, is nobody", async () => {
    expect(await currentUser(new Headers())).toBeNull();
    expect(await currentUser(new Headers({ cookie: "better-auth.session_token=forged.value" }))).toBeNull();
  });
});

describe("the daily question cap", () => {
  test("allows DAILY_QUESTIONS a day per account, and starts again the next day", async () => {
    vi.stubEnv("DAILY_QUESTIONS", "3");
    await askForLink(OWNER);
    const { cookie } = await openLink(linkIn(sent()[0]));
    const owner = await currentUser(new Headers({ cookie }));
    if (!owner) throw new Error("not signed in");
    const day = new Date("2026-10-27T10:00:00Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await takeQuestion(owner.id, day));
    expect(results).toEqual([true, true, true, false]);
    expect(await takeQuestion(owner.id, new Date("2026-10-28T00:00:01Z"))).toBe(true);
  });
});
