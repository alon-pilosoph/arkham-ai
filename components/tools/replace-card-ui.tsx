"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { FC } from "react";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import type { Candidate, Goal, ReplaceInput, ReplaceResult } from "@/lib/tools/replace-card";
import { cardUrl } from "@/lib/urls";
import {
  CardMeta,
  capital,
  DONE,
  Dots,
  FailureRow,
  GameText,
  Info,
  ListItem,
  NotFound,
  Pending,
  TabooNote,
  Tool,
  ToolBoundary,
} from "./parts";

const GOAL_LABEL: Record<Goal, string> = {
  cheaper: "cheaper",
  same_job: "same job",
  different_job: "a different job",
  collection: "owned stand-in",
};

const CandidateRow: FC<{ c: Candidate; investigator: string; sameReason: boolean }> = ({ c, investigator, sameReason }) => {
  const played = c.playedBy.investigator;
  return (
    <ListItem>
      <Item
        size="sm"
        className="items-start max-sm:px-0"
        render={<a href={cardUrl(c.code)} target="_blank" rel="noopener noreferrer" />}
      >
        <Dots classes={c.classes} />
        <ItemContent>
          <ItemTitle className="line-clamp-none">{c.label}</ItemTitle>
          <CardMeta card={c}>
            {played.share > 0 ? `, in ${Math.round(100 * played.share)}% of liked ${investigator} decks` : ""}
          </CardMeta>
          <GameText text={c.text} className="line-clamp-3 text-sm" />
          {c.taboo ? <TabooNote taboo={c.taboo} /> : null}
          {sameReason ? null : <p className="text-muted-foreground text-xs">Legal as {c.legalBecause}</p>}
        </ItemContent>
      </Item>
    </ListItem>
  );
};

const ReplaceResultUI: FC<{ result: Extract<ReplaceResult, { kind: "replacements" }> }> = ({ result }) => {
  const t = result.replacing;
  const sameReason =
    result.candidates.length > 1 && result.candidates.every((c) => c.legalBecause === result.candidates[0].legalBecause);
  return (
    <Tool
      status={DONE}
      label={`Instead of ${t.qty}x ${t.label}`}
      meta={`${capital(GOAL_LABEL[result.goal])}, ${result.candidates.length} of ${result.considered} legal options${sameReason ? `, all ${result.candidates[0].legalBecause}` : ""}`}
    >
      <ItemGroup className="-mx-3 gap-1 max-sm:mx-0">
        {result.candidates.map((c) => (
          <CandidateRow key={c.code} c={c} investigator={result.deck.investigator} sameReason={sameReason} />
        ))}
      </ItemGroup>
    </Tool>
  );
};

export const ReplaceUI: ToolCallMessagePartComponent<Partial<ReplaceInput>, ReplaceResult> = ({ args, result, status }) => {
  const card = args.card ?? "the card";
  if (!result) return <Pending status={status} label={`Finding replacements for ${card}`} />;
  if (result.ok !== true) {
    if (result.deckList)
      return (
        <NotFound label={`${card} isn't in deck ${args.deck ?? ""}`}>
          <p className="text-muted-foreground text-sm">The deck runs {result.deckList.join(", ")}.</p>
        </NotFound>
      );
    return (
      <FailureRow
        failure={result}
        notFound={`Deck ${args.deck ?? ""} not found`}
        error={`Couldn't find replacements for ${card}`}
      />
    );
  }
  if (result.kind === "ambiguous")
    return (
      <Info label={`Which ${card}? The deck runs more than one`}>
        <p className="text-muted-foreground text-sm">{result.versions.map((v) => v.label).join(", ")}</p>
      </Info>
    );
  return (
    <ToolBoundary label={`Replacements for ${card}`}>
      <ReplaceResultUI result={result} />
    </ToolBoundary>
  );
};
