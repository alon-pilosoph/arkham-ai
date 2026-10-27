// Chats through their routes, on PGlite in memory: what each account can see and change.

import { beforeAll, describe, expect, test, vi } from "vitest";
import { titleFrom } from "@/hooks/use-chat-runtime";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { currentUser } from "@/lib/session";

const list = await import("@/app/api/chats/route");
const one = await import("@/app/api/chats/[id]/route");
const messages = await import("@/app/api/chats/[id]/messages/route");
const message = await import("@/app/api/chats/[id]/messages/[messageId]/route");

const ALICE = { id: "alice", email: "alice@example.com", name: "Alice" };
const BOB = { id: "bob", email: "bob@example.com", name: "Bob" };

beforeAll(async () => {
  const db = await getDb();
  await db.insert(user).values([ALICE, BOB]);
});

const as = (who: typeof ALICE) => vi.mocked(currentUser).mockResolvedValue(who);
const req = (method = "GET", body?: unknown) =>
  new Request("http://localhost/api/chats", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;

async function newChat(): Promise<string> {
  const res = await list.POST(req("POST"));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const userMessage = (text: string) => ({
  parentId: null,
  format: "ai-sdk/v6",
  content: { role: "user", parts: [{ type: "text", text }] },
});

describe("chats", () => {
  test("a message is stored, rewritten in place, listed with its parent, and the chat titled", async () => {
    as(ALICE);
    const id = await newChat();
    expect((await message.PUT(req("PUT", userMessage("first")), params({ id, messageId: "m1" }))).status).toBe(204);
    expect((await message.PUT(req("PUT", userMessage("edited")), params({ id, messageId: "m1" }))).status).toBe(204);
    const answer = { parentId: "m1", format: "ai-sdk/v6", content: { role: "assistant", parts: [] } };
    await message.PUT(req("PUT", answer), params({ id, messageId: "m2" }));
    const stored = await (await messages.GET(req(), params({ id }))).json();
    expect(stored).toEqual([
      { id: "m1", ...userMessage("edited") },
      { id: "m2", ...answer },
    ]);
    expect((await one.PATCH(req("PATCH", { title: "  Doom on enemies  " }), params({ id }))).status).toBe(204);
    expect(await (await one.GET(req(), params({ id }))).json()).toMatchObject({ id, title: "Doom on enemies", archived: false });
  });

  test("one account never sees, changes or deletes another's chat", async () => {
    as(ALICE);
    const id = await newChat();
    await message.PUT(req("PUT", userMessage("mine")), params({ id, messageId: "m1" }));
    as(BOB);
    expect(((await (await list.GET(req())).json()) as { id: string }[]).map((c) => c.id)).not.toContain(id);
    expect((await one.GET(req(), params({ id }))).status).toBe(404);
    expect((await messages.GET(req(), params({ id }))).status).toBe(404);
    expect((await message.PUT(req("PUT", userMessage("theirs")), params({ id, messageId: "m9" }))).status).toBe(404);
    expect((await one.PATCH(req("PATCH", { title: "hijacked" }), params({ id }))).status).toBe(404);
    expect((await one.DELETE(req("DELETE"), params({ id }))).status).toBe(404);
    as(ALICE);
    const stored = (await (await messages.GET(req(), params({ id }))).json()) as { id: string }[];
    expect(stored.map((m) => m.id)).toEqual(["m1"]);
  });

  test("archiving hides nothing from the list but marks it; deleting removes the chat and its messages", async () => {
    as(ALICE);
    const id = await newChat();
    await message.PUT(req("PUT", userMessage("bye")), params({ id, messageId: "m1" }));
    await one.PATCH(req("PATCH", { archived: true }), params({ id }));
    const listed = (await (await list.GET(req())).json()) as { id: string; archived: boolean }[];
    expect(listed.find((c) => c.id === id)?.archived).toBe(true);
    expect((await one.DELETE(req("DELETE"), params({ id }))).status).toBe(204);
    expect((await messages.GET(req(), params({ id }))).status).toBe(404);
  });

  test("refuses a malformed or oversized message, and a signed-out request", async () => {
    as(ALICE);
    const id = await newChat();
    expect((await message.PUT(req("PUT", { format: "x" }), params({ id, messageId: "m1" }))).status).toBe(400);
    const huge = { ...userMessage("x".repeat(600_000)) };
    expect((await message.PUT(req("PUT", huge), params({ id, messageId: "m1" }))).status).toBe(413);
    vi.mocked(currentUser).mockResolvedValue(null);
    expect((await list.GET(req())).status).toBe(401);
    expect((await messages.GET(req(), params({ id }))).status).toBe(401);
  });
});

describe("titleFrom", () => {
  const ask = (text: string) => [{ role: "user", content: [{ type: "text", text }] }] as never;

  test("titles a chat with its first question, cut at a word past 60 characters", () => {
    expect(titleFrom(ask("Does doom on an enemy count toward the agenda?"))).toBe(
      "Does doom on an enemy count toward the agenda?",
    );
    const long = titleFrom(
      ask("In the Carolyn Fern Destroys Carcosa deck, what could replace Archive of Conduits with something cheaper?"),
    );
    expect(long).toBe("In the Carolyn Fern Destroys Carcosa deck, what could…");
    expect(titleFrom([] as never)).toBe("New chat");
  });
});
