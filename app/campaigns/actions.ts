"use server";

// The campaign pages' forms. Each checks who is asking, then hands the change to
// lib/campaign/store.ts, which checks membership and the page's version; a refusal comes back as
// ?error= on the page, in words.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { join, replaceInvite } from "@/lib/campaign/invites";
import {
  addSeat,
  createCampaign,
  DIFFICULTIES,
  type Difficulty,
  type Ledger,
  lockDeck,
  type RecordInput,
  record,
  restoreDeck,
  revert,
  type SeatStatus,
  STATUSES,
  updateSettings,
} from "@/lib/campaign/store";
import { getCards } from "@/lib/cards";
import { fetchDeck, parseRef } from "@/lib/decks";
import { currentUser } from "@/lib/session";

async function signedIn() {
  const user = await currentUser(await headers());
  if (!user) redirect("/sign-in");
  return user;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const whole = (form: FormData, key: string) => {
  const n = Number(text(form, key) || 0);
  return Number.isInteger(n) ? n : Number.NaN;
};

function back(campaignId: string, result: { ok: boolean; error?: string }): never {
  redirect(result.ok ? `/campaigns/${campaignId}` : `/campaigns/${campaignId}?error=${encodeURIComponent(result.error ?? "")}`);
}

export async function createCampaignAction(form: FormData) {
  const user = await signedIn();
  const difficulty = text(form, "difficulty") as Difficulty;
  const made = await createCampaign(user.id, {
    name: text(form, "name"),
    code: text(form, "code"),
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : "standard",
    taboo: form.get("taboo") === "on",
  });
  if (!made.ok) redirect(`/campaigns?error=${encodeURIComponent(made.error)}`);
  redirect(`/campaigns/${made.value}`);
}

export async function settingsAction(form: FormData) {
  const user = await signedIn();
  const id = text(form, "campaignId");
  const difficulty = text(form, "difficulty") as Difficulty;
  back(
    id,
    await updateSettings(user.id, id, whole(form, "version"), {
      name: text(form, "name") || undefined,
      difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : undefined,
      taboo: form.get("taboo") === "on",
      nextScenario: form.has("nextScenario") ? whole(form, "nextScenario") : undefined,
    }),
  );
}

export async function addSeatAction(form: FormData) {
  const user = await signedIn();
  const id = text(form, "campaignId");
  back(
    id,
    await addSeat(user.id, id, whole(form, "version"), { name: text(form, "name"), userId: text(form, "userId") || null }),
  );
}

export async function lockDeckAction(form: FormData) {
  const user = await signedIn();
  const id = text(form, "campaignId");
  const ref = parseRef(text(form, "deck"));
  if (!ref) back(id, { ok: false, error: "That isn't an ArkhamDB deck link." });
  const [store, fetched] = await Promise.all([getCards(), fetchDeck(ref)]);
  if (!fetched.ok) back(id, { ok: false, error: `Couldn't read that deck: ${fetched.message}` });
  const { deck, kind } = fetched.data;
  const map = (x: unknown) => (x && !Array.isArray(x) ? (x as Record<string, number>) : undefined);
  back(
    id,
    await lockDeck(user.id, id, whole(form, "version"), {
      seatId: text(form, "seatId"),
      name: deck.name || "Unnamed deck",
      list: {
        investigator_code: deck.investigator_code,
        slots: deck.slots,
        sideSlots: map(deck.sideSlots),
        ignoreDeckLimitSlots: map(deck.ignoreDeckLimitSlots),
        meta: typeof deck.meta === "string" ? deck.meta : deck.meta ? JSON.stringify(deck.meta) : undefined,
        taboo_id: deck.taboo_id ?? null,
      },
      investigatorCode: store.canonical(deck.investigator_code),
      source: `${kind}:${deck.id}`,
    }),
  );
}

/** After a scenario, or a correction: one row of fields per seat. */
export async function recordAction(form: FormData) {
  const user = await signedIn();
  const id = text(form, "campaignId");
  const seatIds = form.getAll("seatId").map(String);
  const entries: RecordInput["entries"] = [];
  const statuses: NonNullable<RecordInput["statuses"]> = [];
  for (const seatId of seatIds) {
    const fields: [string, Ledger, number][] = [
      ["earned", "xp", 1],
      ["spent", "xp", -1],
      ["physical", "physical", 1],
      ["mental", "mental", 1],
    ];
    for (const [field, kind, sign] of fields) {
      const n = whole(form, `${field}:${seatId}`);
      if (Number.isNaN(n)) back(id, { ok: false, error: "XP and trauma are whole numbers." });
      if (n) entries.push({ seatId, kind, amount: sign * n, note: text(form, `note:${seatId}`) || undefined });
    }
    const status = text(form, `status:${seatId}`) as SeatStatus;
    if (STATUSES.includes(status)) statuses.push({ seatId, status });
  }
  back(
    id,
    await record(user.id, id, whole(form, "version"), {
      entries,
      statuses,
      nextScenario: form.has("nextScenario") ? whole(form, "nextScenario") : undefined,
    }),
  );
}

export async function revertAction(form: FormData) {
  const user = await signedIn();
  const id = text(form, "campaignId");
  back(id, await revert(user.id, id, whole(form, "version"), text(form, "changeId")));
}

export async function restoreDeckAction(form: FormData) {
  const user = await signedIn();
  const id = text(form, "campaignId");
  back(id, await restoreDeck(user.id, id, whole(form, "version"), text(form, "seatId"), text(form, "deckVersionId")));
}

export async function replaceInviteAction(form: FormData) {
  const user = await signedIn();
  const id = text(form, "campaignId");
  const { isMember } = await import("@/lib/campaign/store");
  if (!(await isMember(user.id, id))) back(id, { ok: false, error: "You aren't in this campaign." });
  await replaceInvite(id, user.id);
  redirect(`/campaigns/${id}#invite`);
}

export async function joinAction(form: FormData) {
  const user = await signedIn();
  const campaignId = await join(text(form, "token"), user.id);
  redirect(
    campaignId
      ? `/campaigns/${campaignId}`
      : "/campaigns?error=That%20invite%20link%20was%20replaced.%20Ask%20for%20a%20new%20one.",
  );
}
