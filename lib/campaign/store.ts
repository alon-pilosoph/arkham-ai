// Campaigns: reading them, and every change to them. A change runs in one transaction that first
// claims the campaign's next version, so a change made from a stale page fails instead of
// overwriting someone else's; it is recorded with what it did, so the history can show it and a
// revert can undo it. A revert never erases: it is a change of its own, refused when a later
// change depends on what it would undo.

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { CAMPAIGNS, scenarios } from "../campaigns";
import { getCards } from "../cards";
import { getDb } from "../db";
import { campaign, campaignChange, campaignMember, deckVersion, seat, seatEntry, user } from "../db/schema";
import { deckViolation } from "../legality";
import { tabooInForce } from "../taboo";
import { swapCost } from "../xp";

export const DIFFICULTIES = ["easy", "standard", "hard", "expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const STATUSES = ["active", "killed", "insane"] as const;
export type SeatStatus = (typeof STATUSES)[number];
export const LEDGERS = ["xp", "physical", "mental"] as const;
export type Ledger = (typeof LEDGERS)[number];

/** The list of a deck version, as ArkhamDB shapes it. */
export type DeckListJson = {
  investigator_code: string;
  slots: Record<string, number>;
  sideSlots?: Record<string, number>;
  ignoreDeckLimitSlots?: Record<string, number>;
  meta?: string;
  taboo_id?: number | null;
};

export type SeatView = {
  id: string;
  name: string;
  userId: string | null;
  investigatorCode: string | null;
  status: SeatStatus;
  deck: {
    id: string;
    number: number;
    name: string;
    list: DeckListJson;
    campaignCards: Record<string, number>;
    source: string | null;
  } | null;
  /** Every version of the seat's deck, newest first, the current one included. */
  versions: DeckVersionView[];
  xp: { earned: number; spent: number; unspent: number };
  trauma: { physical: number; mental: number };
};

export type DeckVersionView = {
  id: string;
  number: number;
  name: string;
  at: string;
  list: DeckListJson;
  campaignCards: Record<string, number>;
};

export type ChangeView = {
  id: string;
  kind: string;
  summary: string;
  by: string | null;
  at: string;
  revertOf: string | null;
  revertedBy: string | null;
};

export type CampaignView = {
  id: string;
  name: string;
  code: string;
  campaignName: string;
  difficulty: Difficulty;
  taboo: boolean;
  ownerId: string;
  version: number;
  scenarios: string[];
  nextScenario: number;
  members: { userId: string; name: string; email: string; role: string }[];
  seats: SeatView[];
  changes: ChangeView[];
};

/** An account's name, or its email address when sign-in gave it none (an emailed link). */
export const displayName = sql<string>`coalesce(nullif(${user.name}, ''), ${user.email})`;

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
export const STALE = "Someone changed this campaign since you loaded it. Refresh and try again.";

export async function isMember(userId: string, campaignId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ role: campaignMember.role })
    .from(campaignMember)
    .where(and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function listCampaigns(userId: string) {
  const db = await getDb();
  return db
    .select({ id: campaign.id, name: campaign.name, code: campaign.code, updatedAt: campaign.updatedAt })
    .from(campaign)
    .innerJoin(campaignMember, eq(campaignMember.campaignId, campaign.id))
    .where(eq(campaignMember.userId, userId))
    .orderBy(desc(campaign.updatedAt));
}

export async function createCampaign(
  userId: string,
  input: { name: string; code: string; difficulty: Difficulty; taboo: boolean },
): Promise<Result<string>> {
  if (!CAMPAIGNS.some((c) => c.code === input.code)) return fail("That isn't a Chapter 1 campaign.");
  const name = input.name.trim().slice(0, 80);
  if (!name) return fail("Give the campaign a name.");
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(campaign)
      .values({ id, name, code: input.code, difficulty: input.difficulty, taboo: input.taboo, ownerId: userId });
    await tx.insert(campaignMember).values({ campaignId: id, userId, role: "owner" });
  });
  return { ok: true, value: id };
}

/** Everything a member sees on the campaign page; null for anyone else. */
export async function loadCampaign(userId: string, campaignId: string): Promise<CampaignView | null> {
  if (!(await isMember(userId, campaignId))) return null;
  const db = await getDb();
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!c) return null;
  const members = await db
    .select({ userId: user.id, name: displayName, email: user.email, role: campaignMember.role })
    .from(campaignMember)
    .innerJoin(user, eq(user.id, campaignMember.userId))
    .where(eq(campaignMember.campaignId, campaignId))
    .orderBy(asc(campaignMember.joinedAt));
  const seats = await db
    .select()
    .from(seat)
    .where(eq(seat.campaignId, campaignId))
    .orderBy(asc(seat.position), asc(seat.createdAt));
  const seatIds = seats.map((s) => s.id);
  // a reverted change and its revert cancel out, so neither counts toward earned or spent
  const entries = seatIds.length
    ? await db
        .select({ seatId: seatEntry.seatId, kind: seatEntry.kind, amount: seatEntry.amount })
        .from(seatEntry)
        .innerJoin(campaignChange, eq(campaignChange.id, seatEntry.changeId))
        .where(and(inArray(seatEntry.seatId, seatIds), isNull(campaignChange.revertedBy), isNull(campaignChange.revertOf)))
    : [];
  const decks = seatIds.length
    ? await db.select().from(deckVersion).where(inArray(deckVersion.seatId, seatIds)).orderBy(desc(deckVersion.number))
    : [];
  const changes = await db
    .select({
      id: campaignChange.id,
      kind: campaignChange.kind,
      summary: campaignChange.summary,
      by: displayName,
      at: campaignChange.createdAt,
      revertOf: campaignChange.revertOf,
      revertedBy: campaignChange.revertedBy,
    })
    .from(campaignChange)
    .leftJoin(user, eq(user.id, campaignChange.userId))
    .where(eq(campaignChange.campaignId, campaignId))
    .orderBy(desc(campaignChange.createdAt));
  const store = await getCards();
  const def = CAMPAIGNS.find((x) => x.code === c.code);
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    campaignName: def?.name ?? c.code,
    difficulty: c.difficulty as Difficulty,
    taboo: c.taboo,
    ownerId: c.ownerId,
    version: c.version,
    scenarios: def ? scenarios(store, def).map((s) => s.name) : [],
    nextScenario: c.nextScenario,
    members,
    seats: seats.map((s) => {
      const mine = entries.filter((e) => e.seatId === s.id);
      const sum = (kind: Ledger, sign?: 1 | -1) =>
        mine.filter((e) => e.kind === kind && (!sign || Math.sign(e.amount) === sign)).reduce((n, e) => n + e.amount, 0);
      const d = decks.find((x) => x.id === s.deckId);
      return {
        id: s.id,
        name: s.name,
        userId: s.userId,
        investigatorCode: s.investigatorCode,
        status: s.status as SeatStatus,
        deck: d
          ? {
              id: d.id,
              number: d.number,
              name: d.name,
              list: d.list as DeckListJson,
              campaignCards: d.campaignCards as Record<string, number>,
              source: d.source,
            }
          : null,
        versions: decks
          .filter((x) => x.seatId === s.id)
          .map((x) => ({
            id: x.id,
            number: x.number,
            name: x.name,
            at: x.createdAt.toISOString(),
            list: x.list as DeckListJson,
            campaignCards: x.campaignCards as Record<string, number>,
          })),
        xp: { earned: sum("xp", 1), spent: Math.abs(sum("xp", -1)), unspent: sum("xp") },
        trauma: { physical: sum("physical"), mental: sum("mental") },
      };
    }),
    changes: changes.map((x) => ({ ...x, at: x.at.toISOString() })),
  };
}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];

/** Runs a change: claims the next version, applies `apply`, and records it. */
async function change<T>(
  userId: string,
  campaignId: string,
  version: number,
  apply: (tx: Tx, changeId: string) => Promise<Result<{ kind: string; summary: string; payload: unknown; value?: T }>>,
  extra: { revertOf?: string; chatId?: string } = {},
): Promise<Result<T | undefined>> {
  if (!(await isMember(userId, campaignId))) return fail("You aren't in this campaign.");
  const db = await getDb();
  class Refused extends Error {}
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx
        .update(campaign)
        .set({ version: sql`${campaign.version} + 1`, updatedAt: new Date() })
        .where(and(eq(campaign.id, campaignId), eq(campaign.version, version)))
        .returning({ id: campaign.id });
      if (!claimed.length) throw new Refused(STALE);
      const changeId = crypto.randomUUID();
      const done = await apply(tx, changeId);
      if (!done.ok) throw new Refused(done.error);
      await tx.insert(campaignChange).values({
        id: changeId,
        campaignId,
        userId,
        kind: done.value.kind,
        summary: done.value.summary,
        payload: done.value.payload,
        revertOf: extra.revertOf ?? null,
        chatId: extra.chatId ?? null,
      });
      if (extra.revertOf)
        await tx.update(campaignChange).set({ revertedBy: changeId }).where(eq(campaignChange.id, extra.revertOf));
      return { ok: true as const, value: done.value.value };
    });
  } catch (e) {
    if (e instanceof Refused) return fail(e.message);
    throw e;
  }
}

const ok = <T>(kind: string, summary: string, payload: unknown, value?: T) =>
  ({ ok: true, value: { kind, summary, payload, value } }) as const;

type Settings = { name: string; difficulty: Difficulty; taboo: boolean; nextScenario: number };

export async function updateSettings(userId: string, campaignId: string, version: number, next: Partial<Settings>) {
  return change(userId, campaignId, version, async (tx) => {
    const [c] = await tx.select().from(campaign).where(eq(campaign.id, campaignId));
    const before: Partial<Settings> = {};
    const after: Partial<Settings> = {};
    for (const k of ["name", "difficulty", "taboo", "nextScenario"] as const) {
      const v = next[k];
      if (v === undefined || v === c[k]) continue;
      (before as Record<string, unknown>)[k] = c[k];
      (after as Record<string, unknown>)[k] = v;
    }
    if (!Object.keys(after).length) return fail("Nothing changed.");
    if (after.name !== undefined && !after.name.trim()) return fail("Give the campaign a name.");
    await tx.update(campaign).set(after).where(eq(campaign.id, campaignId));
    return ok("settings", settingsSummary(after), { before, after });
  });
}

function settingsSummary(after: Partial<Settings>): string {
  const parts = [
    after.name !== undefined ? `renamed to ${after.name}` : "",
    after.difficulty !== undefined ? `difficulty ${after.difficulty}` : "",
    after.taboo !== undefined ? `taboo list ${after.taboo ? "on" : "off"}` : "",
    after.nextScenario !== undefined ? "next scenario changed" : "",
  ].filter(Boolean);
  return `Campaign: ${parts.join(", ")}`;
}

export async function addSeat(
  userId: string,
  campaignId: string,
  version: number,
  input: { name: string; userId?: string | null },
) {
  return change<string>(userId, campaignId, version, async (tx, changeId) => {
    const name = input.name.trim().slice(0, 60);
    if (!name) return fail("Give the seat a name.");
    if (input.userId) {
      const member = await tx
        .select({ id: campaignMember.userId })
        .from(campaignMember)
        .where(and(eq(campaignMember.campaignId, campaignId), eq(campaignMember.userId, input.userId)));
      if (!member.length) return fail("That account isn't in this campaign.");
    }
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(seat).where(eq(seat.campaignId, campaignId));
    const id = crypto.randomUUID();
    await tx.insert(seat).values({ id, campaignId, name, userId: input.userId ?? null, position: n });
    return ok("seat", `Added ${name}'s seat`, { seatId: id, changeId }, id);
  });
}

/** Locks in a deck for a seat: a new version, which becomes the seat's deck. */
export async function lockDeck(
  userId: string,
  campaignId: string,
  version: number,
  input: { seatId: string; name: string; list: DeckListJson; investigatorCode: string; source: string | null },
) {
  return change<string>(userId, campaignId, version, async (tx, changeId) => {
    const [s] = await tx
      .select()
      .from(seat)
      .where(and(eq(seat.id, input.seatId), eq(seat.campaignId, campaignId)));
    if (!s) return fail("No such seat.");
    const [{ n }] = await tx
      .select({ n: sql<number>`coalesce(max(${deckVersion.number}), 0)::int` })
      .from(deckVersion)
      .where(eq(deckVersion.seatId, s.id));
    const id = crypto.randomUUID();
    await tx.insert(deckVersion).values({
      id,
      seatId: s.id,
      number: n + 1,
      name: input.name.slice(0, 200),
      list: input.list,
      source: input.source,
      changeId,
    });
    await tx.update(seat).set({ deckId: id, investigatorCode: input.investigatorCode }).where(eq(seat.id, s.id));
    return ok(
      "deck",
      `${s.name}: locked in ${input.name}`,
      {
        seatId: s.id,
        before: s.deckId,
        after: id,
        investigatorBefore: s.investigatorCode,
        investigatorAfter: input.investigatorCode,
      },
      id,
    );
  });
}

export type RecordInput = {
  entries: { seatId: string; kind: Ledger; amount: number; note?: string }[];
  statuses?: { seatId: string; status: SeatStatus }[];
  nextScenario?: number;
  /** The chat proposal this applies, so its card can tell it was applied. */
  proposalId?: string;
};

/** What a scenario (or a correction) did to the seats: XP earned or spent, trauma, a seat's
 *  investigator killed or driven insane, and which scenario is next. */
export async function record(userId: string, campaignId: string, version: number, input: RecordInput, chatId?: string) {
  return change(
    userId,
    campaignId,
    version,
    async (tx, changeId) => {
      const seats = await tx.select().from(seat).where(eq(seat.campaignId, campaignId));
      const byId = new Map(seats.map((s) => [s.id, s]));
      const entries = input.entries.filter((e) => e.amount !== 0);
      for (const e of entries) {
        if (!byId.has(e.seatId)) return fail("No such seat.");
        if (!Number.isInteger(e.amount) || Math.abs(e.amount) > 100) return fail("That isn't an amount of XP or trauma.");
      }
      const statuses = (input.statuses ?? []).filter((x) => byId.get(x.seatId)?.status !== x.status);
      for (const x of statuses) if (!byId.has(x.seatId)) return fail("No such seat.");
      const [c] = await tx.select().from(campaign).where(eq(campaign.id, campaignId));
      const next =
        input.nextScenario !== undefined && input.nextScenario !== c.nextScenario
          ? { before: c.nextScenario, after: input.nextScenario }
          : undefined;
      if (!entries.length && !statuses.length && !next) return fail("Nothing to record.");
      const totals = await ledgerTotals(tx, [...byId.keys()]);
      for (const e of entries) {
        const key = `${e.seatId}:${e.kind}`;
        totals.set(key, (totals.get(key) ?? 0) + e.amount);
        if ((totals.get(key) ?? 0) < 0)
          return fail(
            e.kind === "xp" ? `${byId.get(e.seatId)?.name} doesn't have that much unspent XP.` : "Trauma can't go below 0.",
          );
      }
      if (entries.length)
        await tx
          .insert(seatEntry)
          .values(entries.map((e) => ({ id: crypto.randomUUID(), ...e, note: e.note ?? null, changeId })));
      for (const x of statuses) await tx.update(seat).set({ status: x.status }).where(eq(seat.id, x.seatId));
      if (next) await tx.update(campaign).set({ nextScenario: next.after }).where(eq(campaign.id, campaignId));
      const payload = {
        entries,
        statuses: statuses.map((x) => ({ seatId: x.seatId, before: byId.get(x.seatId)?.status, after: x.status })),
        next,
        proposalId: input.proposalId,
      };
      return ok("record", recordSummary(byId, payload), payload);
    },
    { chatId },
  );
}

function recordSummary(
  seats: Map<string, { name: string }>,
  p: { entries: RecordInput["entries"]; statuses: { seatId: string; after: string }[]; next?: { after: number } },
): string {
  const lines: string[] = [];
  for (const [id, s] of seats) {
    const mine = p.entries.filter((e) => e.seatId === id);
    const parts = mine.map((e) =>
      e.kind === "xp"
        ? e.amount > 0
          ? `+${e.amount} XP`
          : `${-e.amount} XP spent`
        : `${e.amount > 0 ? "+" : ""}${e.amount} ${e.kind} trauma`,
    );
    const status = p.statuses.find((x) => x.seatId === id);
    if (status) parts.push(status.after === "active" ? "back in play" : status.after);
    if (parts.length) lines.push(`${s.name}: ${parts.join(", ")}`);
  }
  if (p.next) lines.push("next scenario changed");
  return lines.join("; ");
}

async function ledgerTotals(tx: Tx, seatIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!seatIds.length) return out;
  const rows = await tx
    .select({ seatId: seatEntry.seatId, kind: seatEntry.kind, total: sql<number>`sum(${seatEntry.amount})::int` })
    .from(seatEntry)
    .where(inArray(seatEntry.seatId, seatIds))
    .groupBy(seatEntry.seatId, seatEntry.kind);
  for (const r of rows) out.set(`${r.seatId}:${r.kind}`, r.total);
  return out;
}

/** Cancels a change's ledger entries with entries of the revert's own; refused when that would
 *  take a total below 0 (XP spent since, trauma removed since). */
async function negateEntries(tx: Tx, changeId: string, revertId: string): Promise<Result> {
  const entries = await tx.select().from(seatEntry).where(eq(seatEntry.changeId, changeId));
  if (!entries.length) return { ok: true, value: undefined };
  const seatIds = [...new Set(entries.map((e) => e.seatId))];
  const totals = await ledgerTotals(tx, seatIds);
  const names = new Map((await tx.select().from(seat).where(inArray(seat.id, seatIds))).map((s) => [s.id, s.name]));
  for (const e of entries) {
    const key = `${e.seatId}:${e.kind}`;
    totals.set(key, (totals.get(key) ?? 0) - e.amount);
    if ((totals.get(key) ?? 0) < 0)
      return fail(
        e.kind === "xp"
          ? `${names.get(e.seatId) ?? "That seat"} has already spent this XP; revert the purchase first.`
          : "A later change already removed this trauma.",
      );
  }
  await tx.insert(seatEntry).values(
    entries.map((e) => ({
      id: crypto.randomUUID(),
      seatId: e.seatId,
      kind: e.kind,
      amount: -e.amount,
      note: "revert",
      changeId: revertId,
    })),
  );
  return { ok: true, value: undefined };
}

/** Undoes a change with a change of its own, or says why it can't. */
export async function revert(userId: string, campaignId: string, version: number, changeId: string) {
  return change(
    userId,
    campaignId,
    version,
    async (tx, revertId) => {
      const [old] = await tx
        .select()
        .from(campaignChange)
        .where(and(eq(campaignChange.id, changeId), eq(campaignChange.campaignId, campaignId)));
      if (!old) return fail("No such change.");
      if (old.revertedBy) return fail("That change was already reverted.");
      if (old.kind === "revert") return fail("A revert can't be reverted; make the change again instead.");
      const p = old.payload as Record<string, unknown>;
      const undone = `Reverted: ${old.summary}`;
      switch (old.kind) {
        case "settings": {
          const { before, after } = p as { before: Partial<Settings>; after: Partial<Settings> };
          const [c] = await tx.select().from(campaign).where(eq(campaign.id, campaignId));
          for (const [k, v] of Object.entries(after))
            if (c[k as keyof Settings] !== v) return fail("A later change replaced these settings; revert it first.");
          await tx.update(campaign).set(before).where(eq(campaign.id, campaignId));
          return ok("revert", undone, { of: changeId });
        }
        case "seat": {
          const { seatId } = p as { seatId: string };
          const [s] = await tx.select().from(seat).where(eq(seat.id, seatId));
          if (!s) return fail("That seat is already gone.");
          const used = await tx.select({ id: seatEntry.id }).from(seatEntry).where(eq(seatEntry.seatId, seatId)).limit(1);
          if (s.deckId || used.length) return fail("Later changes use this seat; revert them first.");
          await tx.delete(seat).where(eq(seat.id, seatId));
          return ok("revert", undone, { of: changeId });
        }
        case "deck": {
          const d = p as { seatId: string; before: string | null; after: string; investigatorBefore: string | null };
          const [s] = await tx.select().from(seat).where(eq(seat.id, d.seatId));
          if (!s || s.deckId !== d.after) return fail("A later change replaced this deck; revert it first.");
          const refunded = await negateEntries(tx, changeId, revertId);
          if (!refunded.ok) return refunded;
          await tx.update(seat).set({ deckId: d.before, investigatorCode: d.investigatorBefore }).where(eq(seat.id, d.seatId));
          return ok("revert", undone, { of: changeId });
        }
        case "record": {
          const r = p as {
            entries: RecordInput["entries"];
            statuses: { seatId: string; before: SeatStatus; after: SeatStatus }[];
            next?: { before: number; after: number };
          };
          for (const x of r.statuses) {
            const [s] = await tx.select().from(seat).where(eq(seat.id, x.seatId));
            if (s && s.status !== x.after) return fail("A later change replaced this status; revert it first.");
          }
          if (r.next) {
            const [c] = await tx.select().from(campaign).where(eq(campaign.id, campaignId));
            if (c.nextScenario !== r.next.after) return fail("A later change moved the next scenario; revert it first.");
            await tx.update(campaign).set({ nextScenario: r.next.before }).where(eq(campaign.id, campaignId));
          }
          const negated = await negateEntries(tx, changeId, revertId);
          if (!negated.ok) return negated;
          for (const x of r.statuses) await tx.update(seat).set({ status: x.before }).where(eq(seat.id, x.seatId));
          return ok("revert", undone, { of: changeId });
        }
        default:
          return fail("That change can't be reverted.");
      }
    },
    { revertOf: changeId },
  );
}

/** The scenario names a campaign's next-scenario index can take. */
export async function scenarioNames(code: string): Promise<string[]> {
  const def = CAMPAIGNS.find((c) => c.code === code);
  return def ? scenarios(await getCards(), def).map((s) => s.name) : [];
}

export type DeckSwap = {
  seatId: string;
  /** Cards bought or upgraded into, and cards taken out, by code. */
  add: Record<string, number>;
  remove: Record<string, number>;
  /** Cards the campaign put in or took out (story assets, weaknesses): no XP, no deck rules. */
  campaignAdd?: Record<string, number>;
  campaignRemove?: Record<string, number>;
  /** The chat proposal this applies, so its card can tell it was applied. */
  proposalId?: string;
};

/** What a swap would do to a seat's deck: the new list, its cost, and why it can't be, if it can't.
 *  Shared by the chat's proposals and their applying, so both see the same answer. */
export async function priceSwap(
  view: Pick<CampaignView, "taboo" | "seats">,
  swap: DeckSwap,
): Promise<
  Result<{
    slots: Record<string, number>;
    campaignCards: Record<string, number>;
    cost: number;
    lines: { code: string; qty: number; xp: number; upgradedFrom?: string }[];
  }>
> {
  const s = view.seats.find((x) => x.id === swap.seatId);
  if (!s) return fail("No such seat.");
  if (!s.deck) return fail(`${s.name} has no deck locked in yet.`);
  const store = await getCards();
  const { list: taboo, error } = await tabooInForce({ taboo: view.taboo });
  if (error) return fail(`The taboo list could not be loaded (${error}), so the change can't be priced.`);
  const take = (from: Record<string, number>, out: Record<string, number> = {}) => {
    const next = { ...from };
    for (const [code, qty] of Object.entries(out)) {
      if ((next[code] ?? 0) < qty)
        return { error: `${store.get(code)?.name ?? code} isn't in the deck ${qty > 1 ? `${qty} times` : ""}`.trim() };
      next[code] -= qty;
      if (!next[code]) delete next[code];
    }
    return { next };
  };
  const put = (into: Record<string, number>, add: Record<string, number> = {}) => {
    const next = { ...into };
    for (const [code, qty] of Object.entries(add)) if (qty > 0) next[code] = (next[code] ?? 0) + qty;
    return next;
  };
  for (const code of [...Object.keys(swap.add), ...Object.keys(swap.campaignAdd ?? {})])
    if (!store.get(code)) return fail(`No card has code ${code}.`);
  for (const code of Object.keys(swap.add))
    if (!store.inCollection(code)) return fail(`${store.get(code)?.name} isn't in the collection.`);
  const removed = take(s.deck.list.slots, swap.remove);
  if (removed.error) return fail(`${removed.error}.`);
  const slots = put(removed.next ?? {}, swap.add);
  const campaignTaken = take(s.deck.campaignCards, swap.campaignRemove);
  if (campaignTaken.error) return fail(`${campaignTaken.error} among the campaign's cards.`);
  const campaignCards = put(campaignTaken.next ?? {}, swap.campaignAdd);
  const violation = deckViolation(store, { id: 0, ...s.deck.list, slots }, taboo);
  if (violation) return fail(`That deck would break a deckbuilding rule: ${violation.card}, ${violation.reason}.`);
  const { total, lines } = swapCost(store, swap.add, swap.remove, taboo);
  if (total > s.xp.unspent) return fail(`That costs ${total} XP, and ${s.name} has ${s.xp.unspent} unspent.`);
  return { ok: true, value: { slots, campaignCards, cost: total, lines } };
}

/** A swap in words; `swap` holds card names here, not codes. */
function swapSummary(name: string, swap: DeckSwap, cost: number, restored?: number): string {
  const list = (m: Record<string, number> = {}) =>
    Object.entries(m)
      .map(([card, qty]) => `${qty > 1 ? `${qty}× ` : ""}${card}`)
      .join(", ");
  const parts = [
    Object.keys(swap.remove).length ? `out ${list(swap.remove)}` : "",
    Object.keys(swap.add).length ? `in ${list(swap.add)}` : "",
    Object.keys(swap.campaignAdd ?? {}).length ? `campaign added ${list(swap.campaignAdd)}` : "",
    Object.keys(swap.campaignRemove ?? {}).length ? `campaign removed ${list(swap.campaignRemove)}` : "",
  ].filter(Boolean);
  const what = [restored ? `back to version ${restored}` : "", parts.join("; ")].filter(Boolean).join(", ");
  return `${name}: ${what}${cost ? ` (${cost} XP)` : ""}`;
}

/** Applies a swap: a new deck version and the XP it cost, checked again against the campaign as
 *  it is now. */
export async function changeDeck(
  userId: string,
  campaignId: string,
  version: number,
  swap: DeckSwap,
  chatId?: string,
  restored?: number,
) {
  const view = await loadCampaign(userId, campaignId);
  if (!view) return fail("You aren't in this campaign.");
  if (view.version !== version) return fail(STALE);
  const priced = await priceSwap(view, swap);
  if (!priced.ok) return priced;
  const store = await getCards();
  const named = (m: Record<string, number> = {}) =>
    Object.fromEntries(Object.entries(m).map(([code, qty]) => [store.get(code)?.name ?? code, qty]));
  return change<string>(
    userId,
    campaignId,
    version,
    async (tx, changeId) => {
      const [s] = await tx
        .select()
        .from(seat)
        .where(and(eq(seat.id, swap.seatId), eq(seat.campaignId, campaignId)));
      const [current] = s?.deckId ? await tx.select().from(deckVersion).where(eq(deckVersion.id, s.deckId)) : [];
      if (!s || !current) return fail("That seat has no deck.");
      const [{ n }] = await tx
        .select({ n: sql<number>`coalesce(max(${deckVersion.number}), 0)::int` })
        .from(deckVersion)
        .where(eq(deckVersion.seatId, s.id));
      const id = crypto.randomUUID();
      await tx.insert(deckVersion).values({
        id,
        seatId: s.id,
        number: n + 1,
        name: current.name,
        list: { ...(current.list as DeckListJson), slots: priced.value.slots },
        campaignCards: priced.value.campaignCards,
        source: current.source,
        changeId,
      });
      await tx.update(seat).set({ deckId: id }).where(eq(seat.id, s.id));
      if (priced.value.cost)
        await tx.insert(seatEntry).values({
          id: crypto.randomUUID(),
          seatId: s.id,
          kind: "xp",
          amount: -priced.value.cost,
          note: "deck change",
          changeId,
        });
      const summary = swapSummary(
        s.name,
        {
          ...swap,
          add: named(swap.add),
          remove: named(swap.remove),
          campaignAdd: named(swap.campaignAdd),
          campaignRemove: named(swap.campaignRemove),
        },
        priced.value.cost,
        restored,
      );
      return ok(
        "deck",
        summary,
        {
          seatId: s.id,
          before: s.deckId,
          after: id,
          investigatorBefore: s.investigatorCode,
          investigatorAfter: s.investigatorCode,
          proposalId: swap.proposalId,
        },
        id,
      );
    },
    { chatId },
  );
}

/** The swap that turns `from` into `to`: what each list has that the other hasn't. */
export function swapBetween(
  seatId: string,
  from: Pick<DeckVersionView, "list" | "campaignCards">,
  to: Pick<DeckVersionView, "list" | "campaignCards">,
): DeckSwap {
  const more = (a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(a)
        .map(([code, qty]) => [code, qty - (b[code] ?? 0)] as const)
        .filter(([, qty]) => qty > 0),
    );
  return {
    seatId,
    add: more(to.list.slots, from.list.slots),
    remove: more(from.list.slots, to.list.slots),
    campaignAdd: more(to.campaignCards, from.campaignCards),
    campaignRemove: more(from.campaignCards, to.campaignCards),
  };
}

/** Why a seat's deck can't go back to one of its versions, or the swap that takes it there. */
export function restoreSwap(s: SeatView, versionId: string): Result<{ swap: DeckSwap; number: number }> {
  const to = s.versions.find((v) => v.id === versionId);
  if (!to) return fail("No such deck version.");
  if (!s.deck) return fail(`${s.name} has no deck locked in.`);
  if (to.id === s.deck.id) return fail(`That is ${s.name}'s deck now.`);
  if (to.list.investigator_code !== s.deck.list.investigator_code)
    return fail("That version is for another investigator; lock it in again instead.");
  return { ok: true, value: { swap: swapBetween(s.id, s.deck, to), number: to.number } };
}

/** Puts a seat's deck back to an earlier version, as a new version: cards it brings back are
 *  paid for again, like any other swap, and cards it takes out refund nothing. */
export async function restoreDeck(userId: string, campaignId: string, version: number, seatId: string, versionId: string) {
  const view = await loadCampaign(userId, campaignId);
  if (!view) return fail("You aren't in this campaign.");
  const s = view.seats.find((x) => x.id === seatId);
  if (!s) return fail("No such seat.");
  const r = restoreSwap(s, versionId);
  if (!r.ok) return r;
  return changeDeck(userId, campaignId, version, r.value.swap, undefined, r.value.number);
}

/** Whether a chat proposal was applied, and by which change. */
export async function proposalChange(userId: string, campaignId: string, proposalId: string): Promise<string | null> {
  if (!(await isMember(userId, campaignId))) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: campaignChange.id })
    .from(campaignChange)
    .where(and(eq(campaignChange.campaignId, campaignId), sql`${campaignChange.payload}->>'proposalId' = ${proposalId}`))
    .limit(1);
  return row?.id ?? null;
}
