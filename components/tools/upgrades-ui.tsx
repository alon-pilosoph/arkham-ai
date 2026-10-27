"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { FC, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import type { Purchase, Upgrade, UpgradesInput, UpgradesResult } from "@/lib/tools/upgrades";
import { cardUrl } from "@/lib/urls";
import { useDeckLabel } from "./deck-label";
import {
  CardMeta,
  capital,
  DONE,
  Dots,
  FailureRow,
  GameText,
  Link,
  ListItem,
  Pending,
  TabooNote,
  Tool,
  ToolBoundary,
} from "./parts";

const Xp: FC<{ n: number; each?: boolean }> = ({ n, each }) => (
  <Badge variant="outline" className="shrink-0 tabular-nums">
    {n} XP{each ? " each" : ""}
  </Badge>
);

const Section: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-1">
    <h3 className="text-muted-foreground text-xs font-medium uppercase">{title}</h3>
    <ItemGroup className="gap-0">{children}</ItemGroup>
  </section>
);

const CardRow: FC<{ c: Upgrade | Purchase; title: ReactNode; xp: ReactNode }> = ({ c, title, xp }) => (
  <ListItem>
    <Item size="sm" className="items-start px-0">
      <Dots classes={c.classes} />
      <ItemContent className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <ItemTitle className="line-clamp-none">{title}</ItemTitle>
          {xp}
        </div>
        <CardMeta card={c}>
          {c.played.investigator.decks ? `, in ${Math.round(100 * c.played.investigator.share)}% of liked decks` : ""}
        </CardMeta>
        <GameText text={c.text} className="line-clamp-3 text-sm" />
        {c.taboo ? <TabooNote taboo={c.taboo} /> : null}
      </ItemContent>
    </Item>
  </ListItem>
);

const Purchases: FC<{ title: string; list: Purchase[] }> = ({ title, list }) =>
  list.length ? (
    <Section title={title}>
      {list.map((p) => (
        <CardRow key={p.code} c={p} title={<Link href={cardUrl(p.code)}>{p.label}</Link>} xp={<Xp n={p.xpEach} each />} />
      ))}
    </Section>
  ) : null;

const Result: FC<{ r: Extract<UpgradesResult, { ok: true }> }> = ({ r }) => {
  const count = r.upgrades.length + r.purchases.length + r.levelZero.length;
  return (
    <Tool
      status={DONE}
      label={`Spending ${r.xp} XP on ${r.deck.investigator}'s deck`}
      meta={`${count} option${count === 1 ? "" : "s"}${r.options.length ? `, ${r.options.length} customization${r.options.length === 1 ? "" : "s"}` : ""}`}
    >
      <div className="flex flex-col gap-3">
        {r.upgrades.length ? (
          <Section title="Upgrades">
            {r.upgrades.map((u) => (
              <CardRow
                key={u.code}
                c={u}
                title={
                  <>
                    {u.from.label} → <Link href={cardUrl(u.code)}>{u.label}</Link>
                  </>
                }
                xp={<Xp n={u.xpAll} />}
              />
            ))}
          </Section>
        ) : null}
        {r.options.length ? (
          <Section title="Customization">
            {r.options.map((o) => (
              <ListItem key={`${o.code}:${o.text}`}>
                <Item size="sm" className="items-start px-0">
                  <ItemContent className="gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <ItemTitle className="line-clamp-none">
                        <Link href={cardUrl(o.code)}>{o.card}</Link>
                      </ItemTitle>
                      <Xp n={o.boxesLeft} />
                    </div>
                    <GameText text={o.text} className="text-sm" />
                  </ItemContent>
                </Item>
              </ListItem>
            ))}
          </Section>
        ) : null}
        <Purchases title="New cards" list={r.purchases} />
        <Purchases title="Level 0 cards it lacks" list={r.levelZero} />
      </div>
    </Tool>
  );
};

export const UpgradesUI: ToolCallMessagePartComponent<Partial<UpgradesInput>, UpgradesResult> = ({ args, result, status }) => {
  const deck = useDeckLabel(args.deck);
  const label = `Pricing ${args.xp ?? ""} XP of upgrades for ${deck}`;
  if (!result) return <Pending status={status} label={label} />;
  if (result.ok !== true)
    return (
      <FailureRow failure={result} notFound={`${capital(deck)} wasn't found`} error={`Couldn't price upgrades for ${deck}`} />
    );
  return (
    <ToolBoundary label={label}>
      <Result r={result} />
    </ToolBoundary>
  );
};
