"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { FC } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Customization } from "@/lib/card-text";
import type { DeckCard } from "@/lib/decks";
import type { DeckInput, DeckResult } from "@/lib/tools/deck";
import { cardUrl } from "@/lib/urls";
import { useDeckLabel } from "./deck-label";
import {
  BadgePopover,
  CardMeta,
  capital,
  DONE,
  Dot,
  FailureRow,
  GameText,
  Link,
  NotOwned,
  Pending,
  TabooNote,
  TabooWarning,
  Tool,
  ToolBoundary,
} from "./parts";

const Upgrade: FC<{ u: Customization }> = ({ u }) => {
  const marks = [u.total ? `${u.boxes} of ${u.total}` : "", u.choice ? `chose ${u.choice}` : ""].filter(Boolean);
  return (
    <>
      <GameText className="inline" text={u.text} />
      {marks.length ? <span className="text-muted-foreground"> ({marks.join(", ")})</span> : null}
    </>
  );
};

const CardRow: FC<{ c: DeckCard }> = ({ c }) => (
  <li className="flex items-start gap-1.5 leading-5 pointer-coarse:py-1.5">
    <span className="text-muted-foreground w-5 shrink-0 text-end tabular-nums">{c.qty}x</span>
    <span className="flex h-5 items-center">
      <Dot classes={c.classes} />
    </span>
    <span className="min-w-0">
      <Popover>
        <PopoverTrigger className="text-foreground hover:bg-muted relative -mx-0.5 cursor-pointer rounded-sm px-0.5 text-start pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5">
          {c.label}
        </PopoverTrigger>
        <PopoverContent className="flex w-80 flex-col gap-1.5 text-sm">
          <div>
            <p className="font-medium">
              <Link href={cardUrl(c.code)}>{c.label}</Link>
            </p>
            <CardMeta card={c} />
          </div>
          <GameText text={c.text} />
          {c.taboo ? <TabooNote taboo={c.taboo} /> : null}
        </PopoverContent>
      </Popover>
      {!c.owned ? (
        <span className="ms-1.5 inline-block align-middle">
          <NotOwned />
        </span>
      ) : null}
      {c.customizations.length ? (
        <span className="ms-1.5 inline-block align-middle">
          <BadgePopover label={`${c.customizations.length} upgrade${c.customizations.length === 1 ? "" : "s"}`}>
            <p className="mb-1.5 font-medium">{c.label}: upgrades taken</p>
            <ul className="flex list-disc flex-col gap-1 ps-4">
              {c.customizations.map((u) => (
                <li key={u.text}>
                  <Upgrade u={u} />
                </li>
              ))}
            </ul>
          </BadgePopover>
        </span>
      ) : null}
    </span>
  </li>
);

const CardTypeList: FC<{ type: string; cards: DeckCard[] }> = ({ type, cards }) => (
  <section>
    <h3 className="text-muted-foreground text-xs font-medium uppercase">
      {type} ({cards.reduce((n, c) => n + c.qty, 0)})
    </h3>
    <ul>
      {cards.map((c) => (
        <CardRow key={c.code} c={c} />
      ))}
    </ul>
  </section>
);

const DeckResultUI: FC<{ result: Extract<DeckResult, { ok: true }> }> = ({ result }) => {
  const byType = new Map<string, DeckCard[]>();
  for (const c of result.cards) {
    const k = c.weakness ? "weakness" : c.type;
    byType.set(k, [...(byType.get(k) ?? []), c]);
  }
  const types = [...byType.entries()];
  const stacks = [types.filter(([t]) => t === "asset"), types.filter(([t]) => t !== "asset")].filter((s) => s.length);
  return (
    <Tool status={DONE} label={result.name} meta={`${result.investigator.name}, ${result.xp} XP, ${result.cardCount} cards`}>
      <p className="text-xs">
        <Link href={result.url} className="text-muted-foreground hover:text-foreground">
          {result.guideWords ? "The list and its guide on ArkhamDB" : "The list on ArkhamDB"}
        </Link>
      </p>
      <TabooWarning error={result.tabooError} />
      <div className="grid gap-x-10 gap-y-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {stacks.map((stack) => (
          <div key={stack[0][0]} className="flex min-w-0 flex-col gap-2">
            {stack.map(([type, cards]) => (
              <CardTypeList key={type} type={type} cards={cards} />
            ))}
          </div>
        ))}
      </div>
    </Tool>
  );
};

export const DeckUI: ToolCallMessagePartComponent<Partial<DeckInput>, DeckResult> = ({ args, result, status }) => {
  const deck = useDeckLabel(args.ref);
  if (!result) return <Pending status={status} label={`Reading ${deck}`} />;
  if (result.ok !== true)
    return <FailureRow failure={result} notFound={`${capital(deck)} wasn't found`} error={`Couldn't read ${deck}`} />;
  return (
    <ToolBoundary label={`Reading ${deck}`}>
      <DeckResultUI result={result} />
    </ToolBoundary>
  );
};
