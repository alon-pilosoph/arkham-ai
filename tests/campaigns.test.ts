// Campaigns on PGlite in memory: changes, the XP and trauma ledgers, reverts and invites.

import { beforeAll, describe, expect, test, vi } from "vitest";
import { mayJoin } from "@/lib/access";
import { currentInvite, findInvite, join, rememberInvitedEmail, replaceInvite } from "@/lib/campaign/invites";
import {
  addSeat,
  changeDeck,
  createCampaign,
  type DeckListJson,
  loadCampaign,
  lockDeck,
  proposalChange,
  record,
  revert,
  STALE,
  updateSettings,
} from "@/lib/campaign/store";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { propose } from "@/lib/tools/propose-change";

const OWNER = { id: "owner", email: "owner@example.com", name: "Alon" };
const FRIEND = { id: "friend", email: "friend@example.com", name: "Dana" };
const STRANGER = { id: "stranger", email: "stranger@example.com", name: "Eve" };
const LIST: DeckListJson = { investigator_code: "01001", slots: { "01006": 1, "01007": 1 } };

beforeAll(async () => {
  vi.stubEnv("OWNER_EMAIL", OWNER.email);
  const db = await getDb();
  await db.insert(user).values([OWNER, FRIEND, STRANGER]);
});

function value<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** A Carcosa campaign with one seat, and a way to read its current version. */
async function setUp() {
  const id = value(await createCampaign(OWNER.id, { name: "Carcosa", code: "ptc", difficulty: "standard", taboo: false }));
  const v = async () => (await loadCampaign(OWNER.id, id))?.version ?? -1;
  const seatId = value(await addSeat(OWNER.id, id, await v(), { name: "Roland", userId: OWNER.id })) as string;
  return { id, v, seatId };
}

describe("campaigns", () => {
  test("a campaign lists its scenarios, and only its members can see it", async () => {
    const { id } = await setUp();
    const view = await loadCampaign(OWNER.id, id);
    expect(view?.scenarios.slice(0, 2)).toEqual(["Curtain Call", "The Last King"]);
    expect(view?.members.map((m) => m.role)).toEqual(["owner"]);
    expect(await loadCampaign(STRANGER.id, id)).toBeNull();
    expect((await record(STRANGER.id, id, view?.version ?? 0, { entries: [] })).ok).toBe(false);
  });

  test("a change from a stale page is refused, not applied over another", async () => {
    const { id, v, seatId } = await setUp();
    const seen = await v();
    value(await record(OWNER.id, id, seen, { entries: [{ seatId, kind: "xp", amount: 3 }] }));
    expect(await record(OWNER.id, id, seen, { entries: [{ seatId, kind: "xp", amount: 5 }] })).toEqual({
      ok: false,
      error: STALE,
    });
    expect((await loadCampaign(OWNER.id, id))?.seats[0].xp).toEqual({ earned: 3, spent: 0, unspent: 3 });
  });

  test("XP and trauma are ledgers: earned, spent and unspent add up, and XP never goes below 0", async () => {
    const { id, v, seatId } = await setUp();
    value(
      await record(OWNER.id, id, await v(), {
        entries: [
          { seatId, kind: "xp", amount: 5 },
          { seatId, kind: "mental", amount: 1 },
        ],
        statuses: [],
        nextScenario: 1,
      }),
    );
    value(await record(OWNER.id, id, await v(), { entries: [{ seatId, kind: "xp", amount: -2, note: "Lightning Gun" }] }));
    const view = await loadCampaign(OWNER.id, id);
    expect(view?.seats[0].xp).toEqual({ earned: 5, spent: 2, unspent: 3 });
    expect(view?.seats[0].trauma).toEqual({ physical: 0, mental: 1 });
    expect(view?.nextScenario).toBe(1);
    const tooMuch = await record(OWNER.id, id, await v(), { entries: [{ seatId, kind: "xp", amount: -4 }] });
    expect(tooMuch).toEqual({ ok: false, error: "Roland doesn't have that much unspent XP." });
  });

  test("reverting XP that was since spent is refused until the purchase is reverted", async () => {
    const { id, v, seatId } = await setUp();
    value(await record(OWNER.id, id, await v(), { entries: [{ seatId, kind: "xp", amount: 3 }] }));
    value(await record(OWNER.id, id, await v(), { entries: [{ seatId, kind: "xp", amount: -3 }] }));
    const [spend, earn] = (await loadCampaign(OWNER.id, id))?.changes ?? [];
    const refused = await revert(FRIEND.id, id, await v(), earn.id);
    expect(refused.ok).toBe(false); // not a member yet
    const blocked = await revert(OWNER.id, id, await v(), earn.id);
    expect(blocked).toEqual({ ok: false, error: "Roland has already spent this XP; revert the purchase first." });
    value(await revert(OWNER.id, id, await v(), spend.id));
    value(await revert(OWNER.id, id, await v(), earn.id));
    const view = await loadCampaign(OWNER.id, id);
    // both undone: neither the earning nor the spending counts any more
    expect(view?.seats[0].xp).toEqual({ earned: 0, spent: 0, unspent: 0 });
    expect(view?.changes.filter((c) => c.kind === "revert")).toHaveLength(2);
    expect(view?.changes.find((c) => c.id === earn.id)?.revertedBy).toBeTruthy();
    expect((await revert(OWNER.id, id, await v(), earn.id)).ok).toBe(false);
  });

  test("a deck lock-in reverts to the previous deck, but not under a later one", async () => {
    const { id, v, seatId } = await setUp();
    const first = value(
      await lockDeck(OWNER.id, id, await v(), { seatId, name: "Roland v1", list: LIST, investigatorCode: "01001", source: null }),
    );
    const second = value(
      await lockDeck(OWNER.id, id, await v(), { seatId, name: "Roland v2", list: LIST, investigatorCode: "01001", source: null }),
    );
    const changes = (await loadCampaign(OWNER.id, id))?.changes ?? [];
    const lockFirst = changes.find((c) => c.summary.includes("Roland v1"));
    const lockSecond = changes.find((c) => c.summary.includes("Roland v2"));
    expect((await revert(OWNER.id, id, await v(), lockFirst?.id ?? "")).ok).toBe(false);
    value(await revert(OWNER.id, id, await v(), lockSecond?.id ?? ""));
    expect((await loadCampaign(OWNER.id, id))?.seats[0].deck?.id).toBe(first);
    expect(second).not.toBe(first);
  });

  test("a settings change reverts, unless a later change replaced the same setting", async () => {
    const { id, v } = await setUp();
    value(await updateSettings(OWNER.id, id, await v(), { difficulty: "hard" }));
    value(await updateSettings(OWNER.id, id, await v(), { difficulty: "expert" }));
    const [later, earlier] = (await loadCampaign(OWNER.id, id))?.changes ?? [];
    expect((await revert(OWNER.id, id, await v(), earlier.id)).ok).toBe(false);
    value(await revert(OWNER.id, id, await v(), later.id));
    expect((await loadCampaign(OWNER.id, id))?.difficulty).toBe("hard");
  });

  test("a seat in use can't be reverted away", async () => {
    const { id, v, seatId } = await setUp();
    value(await record(OWNER.id, id, await v(), { entries: [{ seatId, kind: "physical", amount: 1 }] }));
    const addedSeat = (await loadCampaign(OWNER.id, id))?.changes.find((c) => c.kind === "seat");
    expect(await revert(OWNER.id, id, await v(), addedSeat?.id ?? "")).toEqual({
      ok: false,
      error: "Later changes use this seat; revert them first.",
    });
  });

  test("a killed investigator is recorded, and reverting brings them back", async () => {
    const { id, v, seatId } = await setUp();
    value(await record(OWNER.id, id, await v(), { entries: [], statuses: [{ seatId, status: "killed" }] }));
    expect((await loadCampaign(OWNER.id, id))?.seats[0].status).toBe("killed");
    const [killed] = (await loadCampaign(OWNER.id, id))?.changes ?? [];
    value(await revert(OWNER.id, id, await v(), killed.id));
    expect((await loadCampaign(OWNER.id, id))?.seats[0].status).toBe("active");
  });
});

describe("invites", () => {
  test("a link lets a new account in and joins its campaign; replacing it ends the old one", async () => {
    const { id } = await setUp();
    const token = await currentInvite(id, OWNER.id);
    expect(await currentInvite(id, OWNER.id)).toBe(token);
    const cookie = new Headers({ cookie: `arkham_invite=${token}` });
    expect(await mayJoin("new@example.com", cookie)).toBe(true);
    expect(await mayJoin("new@example.com")).toBe(false);
    expect(await findInvite(token)).toMatchObject({ campaignId: id, campaignName: "Carcosa", invitedBy: "Alon" });

    expect(await join(token, FRIEND.id)).toBe(id);
    expect((await loadCampaign(FRIEND.id, id))?.members.map((m) => m.name)).toEqual(["Alon", "Dana"]);

    const fresh = await replaceInvite(id, OWNER.id);
    expect(fresh).not.toBe(token);
    expect(await findInvite(token)).toBeNull();
    expect(await mayJoin("new@example.com", cookie)).toBe(false);
    expect(await join(token, STRANGER.id)).toBeNull();
  });

  test("an address that asked for a sign-in link while holding an invite may join from any browser", async () => {
    const { id } = await setUp();
    const token = await currentInvite(id, OWNER.id);
    await rememberInvitedEmail("Phone@Example.com", token);
    expect(await mayJoin("phone@example.com")).toBe(true);
    await replaceInvite(id, OWNER.id);
    expect(await mayJoin("phone@example.com")).toBe(false);
  });
});

describe("deck changes", () => {
  const SHRIVELLING_0 = "01060";
  const SHRIVELLING_3 = "02154";
  const list: DeckListJson = { investigator_code: "01004", slots: { [SHRIVELLING_0]: 2, "01061": 2 } }; // Agnes

  async function withDeck(xp: number) {
    const { id, v, seatId } = await setUp();
    value(await lockDeck(OWNER.id, id, await v(), { seatId, name: "Agnes", list, investigatorCode: "01004", source: null }));
    if (xp) value(await record(OWNER.id, id, await v(), { entries: [{ seatId, kind: "xp", amount: xp }] }));
    return { id, v, seatId };
  }

  test("an upgrade makes a new deck version and spends its XP; reverting refunds it", async () => {
    const { id, v, seatId } = await withDeck(7);
    const swap = { seatId, add: { [SHRIVELLING_3]: 2 }, remove: { [SHRIVELLING_0]: 2 }, proposalId: "p1" };
    value(await changeDeck(OWNER.id, id, await v(), swap));
    let view = await loadCampaign(OWNER.id, id);
    expect(view?.seats[0].deck?.list.slots).toEqual({ [SHRIVELLING_3]: 2, "01061": 2 });
    expect(view?.seats[0].deck?.number).toBe(2);
    expect(view?.seats[0].xp).toEqual({ earned: 7, spent: 6, unspent: 1 });
    expect(view?.changes[0].summary).toBe("Roland: out 2× Shrivelling; in 2× Shrivelling (6 XP)");
    expect(await proposalChange(OWNER.id, id, "p1")).toBe(view?.changes[0].id);
    value(await revert(OWNER.id, id, await v(), view?.changes[0].id ?? ""));
    view = await loadCampaign(OWNER.id, id);
    expect(view?.seats[0].deck?.list.slots).toEqual(list.slots);
    expect(view?.seats[0].xp.unspent).toBe(7);
  });

  test("refuses a change the seat can't afford, a card not in the deck, and an illegal deck", async () => {
    const { id, v, seatId } = await withDeck(3);
    expect(
      await changeDeck(OWNER.id, id, await v(), { seatId, add: { [SHRIVELLING_3]: 2 }, remove: { [SHRIVELLING_0]: 2 } }),
    ).toEqual({
      ok: false,
      error: "That costs 6 XP, and Roland has 3 unspent.",
    });
    expect((await changeDeck(OWNER.id, id, await v(), { seatId, add: {}, remove: { "01020": 1 } })).ok).toBe(false);
    const guardian = await changeDeck(OWNER.id, id, await v(), { seatId, add: { "01020": 1 }, remove: { "01061": 1 } });
    expect(guardian.ok).toBe(false);
    if (!guardian.ok) expect(guardian.error).toMatch(/deckbuilding rule/);
  });

  test("a card the campaign adds costs nothing and skips the deck's rules", async () => {
    const { id, v, seatId } = await withDeck(0);
    value(await changeDeck(OWNER.id, id, await v(), { seatId, add: {}, remove: {}, campaignAdd: { "01020": 1 } }));
    const seatView = (await loadCampaign(OWNER.id, id))?.seats[0];
    expect(seatView?.deck?.campaignCards).toEqual({ "01020": 1 });
    expect(seatView?.xp.spent).toBe(0);
  });
});

describe("proposeChange", () => {
  async function context() {
    const { id, v, seatId } = await setUp();
    const list: DeckListJson = { investigator_code: "01004", slots: { "01060": 2, "01061": 2 } };
    value(await lockDeck(OWNER.id, id, await v(), { seatId, name: "Agnes", list, investigatorCode: "01004", source: null }));
    value(await record(OWNER.id, id, await v(), { entries: [{ seatId, kind: "xp", amount: 4 }] }));
    const view = await loadCampaign(OWNER.id, id);
    if (!view) throw new Error("no campaign");
    return { id, v, ctx: { ...view, askerId: OWNER.id } };
  }

  test("proposes what a scenario did, by seat name, and writes nothing", async () => {
    const { id, v, ctx } = await context();
    const before = await v();
    const p = await propose(
      { kind: "scenario", seats: [{ seat: "roland", xpEarned: 2, mentalTrauma: 1 }], nextScenario: "The Last King" },
      ctx,
    );
    expect(p).toMatchObject({ ok: true, campaignId: id, version: before });
    if (p.ok) expect(p.summary).toEqual(["Roland: +2 XP, +1 mental trauma", "Next scenario: The Last King"]);
    expect(await v()).toBe(before);
  });

  test("prices a deck change, and refuses one the seat can't afford", async () => {
    const { ctx } = await context();
    const one = await propose(
      { kind: "deck", seat: "Roland", add: [{ code: "02154", qty: 1 }], remove: [{ code: "01060", qty: 1 }] },
      ctx,
    );
    expect(one.ok).toBe(true);
    if (one.ok) expect(one.summary).toEqual(["Roland: 3 XP of 4 unspent", "1× Shrivelling (3), upgraded from Shrivelling: 3 XP"]);
    const two = await propose(
      { kind: "deck", seat: "Roland", add: [{ code: "02154", qty: 2 }], remove: [{ code: "01060", qty: 2 }] },
      ctx,
    );
    expect(two).toMatchObject({ ok: false, message: "That costs 6 XP, and Roland has 4 unspent." });
  });

  test("names the seats when one isn't found, and needs a campaign", async () => {
    const { ctx } = await context();
    expect(await propose({ kind: "scenario", seats: [{ seat: "Zoey", xpEarned: 1 }] }, ctx)).toMatchObject({
      ok: false,
      message: 'No seat named "Zoey". The seats: Roland.',
    });
    expect((await propose({ kind: "scenario", seats: [] }, null)).ok).toBe(false);
  });
});
