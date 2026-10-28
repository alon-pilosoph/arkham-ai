import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { currentInvite } from "@/lib/campaign/invites";
import { DIFFICULTIES, loadCampaign, type SeatView, STATUSES } from "@/lib/campaign/store";
import { type CardStore, getCards } from "@/lib/cards";
import { deckCards, deckMeta, xpInList } from "@/lib/decks";
import { currentUser } from "@/lib/session";
import { type DeckKind, deckUrl } from "@/lib/urls";
import { addSeatAction, lockDeckAction, recordAction, replaceInviteAction, revertAction, settingsAction } from "../actions";
import { ErrorNote, field, Section, smallField } from "../ui";

export const metadata: Metadata = { title: "Campaign · Arkham assistant" };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function deckLink(source: string | null): string | null {
  const m = source?.match(/^(decklist|deck):(\d+)$/);
  return m ? deckUrl(Number(m[2]), m[1] as DeckKind) : null;
}

function SeatCard({ s, store, campaignId, version }: { s: SeatView; store: CardStore; campaignId: string; version: number }) {
  const investigator = s.investigatorCode ? store.get(s.investigatorCode)?.name : undefined;
  const list = s.deck?.list;
  const cards = list ? deckCards(store, list.slots, deckMeta(list)) : [];
  const link = deckLink(s.deck?.source ?? null);
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">
          {s.name}
          {investigator ? <span className="text-muted-foreground font-normal"> · {investigator}</span> : null}
        </h3>
        {s.status !== "active" ? <span className="text-destructive text-sm">{cap(s.status)}</span> : null}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
        <div>
          <dt className="text-muted-foreground text-xs">Unspent XP</dt>
          <dd className="text-lg font-medium">{s.xp.unspent}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Earned / spent</dt>
          <dd>
            {s.xp.earned} / {s.xp.spent}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Trauma</dt>
          <dd>
            {s.trauma.physical} physical, {s.trauma.mental} mental
          </dd>
        </div>
      </dl>
      {s.deck ? (
        <p className="text-sm">
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
              {s.deck.name}
            </a>
          ) : (
            <span className="font-medium">{s.deck.name}</span>
          )}
          <span className="text-muted-foreground">
            {" "}
            · version {s.deck.number} · {cards.reduce((n, c) => n + c.qty, 0)} cards · {xpInList(cards)} XP in the list
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">No deck locked in yet.</p>
      )}
      <form action={lockDeckAction} className="flex gap-2">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="seatId" value={s.id} />
        <input
          name="deck"
          required
          placeholder="ArkhamDB deck link"
          aria-label={`ArkhamDB deck link for ${s.name}`}
          className={`${field} min-w-0 flex-1`}
        />
        <Button type="submit" variant="outline">
          {s.deck ? "Lock in a new version" : "Lock in"}
        </Button>
      </form>
    </div>
  );
}

export default async function CampaignPage(props: PageProps<"/campaigns/[id]">) {
  const { id } = await props.params;
  const h = await headers();
  const user = await currentUser(h);
  if (!user) redirect(`/sign-in?next=/campaigns/${id}`);
  const [c, params, store] = await Promise.all([loadCampaign(user.id, id), props.searchParams, getCards()]);
  if (!c) notFound();
  const invite = await currentInvite(c.id, user.id);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const next = c.scenarios[c.nextScenario];
  const hidden = (
    <>
      <input type="hidden" name="campaignId" value={c.id} />
      <input type="hidden" name="version" value={c.version} />
    </>
  );
  const scenarioSelect = (name: string, value: number, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select name={name} defaultValue={value} className={field}>
        {c.scenarios.map((s, i) => (
          <option key={s} value={i}>
            {s}
          </option>
        ))}
        <option value={c.scenarios.length}>Campaign finished</option>
      </select>
    </label>
  );

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight">{c.name}</h1>
        <p className="text-muted-foreground text-sm">
          {c.campaignName} · {cap(c.difficulty)} · taboo list {c.taboo ? "on" : "off"} · {next ? `next: ${next}` : "finished"}
        </p>
      </header>
      <ErrorNote error={params.error} />

      <Section title="Seats">
        {c.seats.map((s) => (
          <SeatCard key={s.id} s={s} store={store} campaignId={c.id} version={c.version} />
        ))}
        <form action={addSeatAction} className="flex flex-wrap items-end gap-2">
          {hidden}
          <label className="flex flex-col gap-1 text-sm">
            New seat
            <input name="name" required maxLength={60} placeholder="Player or investigator" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Played by
            <select name="userId" defaultValue="" className={field}>
              <option value="">Nobody signed in</option>
              {c.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline">
            Add seat
          </Button>
        </form>
      </Section>

      {c.seats.length ? (
        <Section title="After a scenario">
          <form action={recordAction} className="flex flex-col gap-3">
            {hidden}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr>
                    <th className="py-1 text-start font-normal">Seat</th>
                    <th className="font-normal">XP earned</th>
                    <th className="font-normal">XP spent</th>
                    <th className="font-normal">Physical</th>
                    <th className="font-normal">Mental</th>
                    <th className="font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.seats.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-1.5 pe-2">
                        <input type="hidden" name="seatId" value={s.id} />
                        {s.name}
                      </td>
                      {(["earned", "spent", "physical", "mental"] as const).map((f) => (
                        <td key={f} className="px-1 text-center">
                          <input
                            name={`${f}:${s.id}`}
                            type="number"
                            min={0}
                            max={100}
                            inputMode="numeric"
                            aria-label={`${s.name} ${f}`}
                            className={smallField}
                          />
                        </td>
                      ))}
                      <td className="ps-1">
                        <select name={`status:${s.id}`} defaultValue={s.status} aria-label={`${s.name} status`} className={field}>
                          {STATUSES.map((x) => (
                            <option key={x} value={x}>
                              {cap(x)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.scenarios.length > 1
              ? scenarioSelect("nextScenario", Math.min(c.nextScenario + 1, c.scenarios.length), "Next scenario")
              : null}
            <Button type="submit" className="self-start">
              Record
            </Button>
          </form>
        </Section>
      ) : null}

      <Section title="Players" id="invite">
        <ul className="text-sm">
          {c.members.map((m) => (
            <li key={m.userId}>
              {m.name}
              {m.name !== m.email ? <span className="text-muted-foreground"> {m.email}</span> : null}
              {m.role === "owner" ? <span className="text-muted-foreground"> · started the campaign</span> : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 text-sm">
          Invite link: anyone who opens it can sign in and join.
          <input readOnly value={`${origin}/invite/${invite}`} aria-label="Invite link" className={field} />
        </div>
        <form action={replaceInviteAction}>
          {hidden}
          <Button type="submit" variant="outline" size="sm">
            Replace the link (the old one stops working)
          </Button>
        </form>
      </Section>

      <Section title="Settings">
        <form action={settingsAction} className="flex flex-col gap-3">
          {hidden}
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input name="name" defaultValue={c.name} maxLength={80} className={field} />
          </label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Difficulty
              <select name="difficulty" defaultValue={c.difficulty} className={field}>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {cap(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="taboo" defaultChecked={c.taboo} /> Taboo list
            </label>
            {c.scenarios.length > 1 ? scenarioSelect("nextScenario", c.nextScenario, "Next scenario") : null}
          </div>
          <Button type="submit" variant="outline" className="self-start">
            Save settings
          </Button>
        </form>
      </Section>

      <Section title="History">
        {c.changes.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {c.changes.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-3 border-t pt-2">
                <div className={x.revertedBy ? "text-muted-foreground line-through" : ""}>
                  {x.summary}
                  <div className="text-muted-foreground text-xs">
                    {x.by ?? "Someone"} · {new Date(x.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                {x.kind !== "revert" && !x.revertedBy ? (
                  <form action={revertAction}>
                    {hidden}
                    <input type="hidden" name="changeId" value={x.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Revert
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing yet.</p>
        )}
      </Section>
    </main>
  );
}
