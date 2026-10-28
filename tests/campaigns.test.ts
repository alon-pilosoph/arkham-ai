// Campaigns on PGlite in memory: changes, the XP and trauma ledgers, reverts and invites.

import { beforeAll, describe, expect, test, vi } from "vitest";
import { mayJoin } from "@/lib/access";
import { currentInvite, findInvite, join, rememberInvitedEmail, replaceInvite } from "@/lib/campaign/invites";
import {
  addSeat,
  createCampaign,
  type DeckListJson,
  loadCampaign,
  lockDeck,
  record,
  revert,
  STALE,
  updateSettings,
} from "@/lib/campaign/store";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";

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
