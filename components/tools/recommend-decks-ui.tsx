"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { HeartIcon } from "lucide-react";
import type { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { roleText } from "@/lib/index/schema";
import type { Filter, RecommendInput, RecommendResult, Shortlisted } from "@/lib/tools/recommend-decks";
import { useDeckLabel } from "./deck-label";
import { capital, DONE, Dots, FailureRow, Info, ListItem, NotFound, Pending, Tool, ToolBoundary } from "./parts";

function filterLabel(f: Exclude<Filter, { kind: "partner" }>): string {
  switch (f.kind) {
    case "taboo":
      return `Legal under taboo list ${f.value}`;
    case "maxXp":
      return `Up to ${f.value} XP`;
    case "keyCard":
      return `Runs ${f.value}`;
    default:
      return capital(f.value);
  }
}

const Filters: FC<{ filters: Filter[] }> = ({ filters }) => {
  // the header already names the partner
  const shown = filters.filter((f): f is Exclude<Filter, { kind: "partner" }> => f.kind !== "partner");
  return shown.length ? (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((f) => (
        <Badge key={f.kind} variant="outline">
          {filterLabel(f)}
        </Badge>
      ))}
    </div>
  ) : null;
};

export const DeckRow: FC<{ d: Omit<Shortlisted, "xp" | "published" | "tags" | "investigatorCode"> & { xp?: number } }> = ({
  d,
}) => (
  <ListItem>
    <Item size="sm" className="items-start max-sm:px-0" render={<a href={d.url} target="_blank" rel="noopener noreferrer" />}>
      <Dots classes={[d.class]} />
      <ItemContent>
        <ItemTitle className="line-clamp-2">{d.name || "Untitled deck"}</ItemTitle>
        <ItemDescription className="text-xs">
          {[d.investigator, roleText(d), ...d.archetypes].join(", ")}
          <span className="sm:hidden">
            , {d.likes} likes, {d.xp} XP
          </span>
        </ItemDescription>
        <p className="text-sm">{d.summary}</p>
      </ItemContent>
      <ItemActions className="text-muted-foreground flex-col items-end gap-0.5 text-xs tabular-nums max-sm:hidden">
        <span className="flex items-center gap-1">
          <HeartIcon aria-hidden className="size-3" />
          {d.likes}
          <span className="sr-only">likes</span>
        </span>
        {d.xp !== undefined ? <span className="whitespace-nowrap">{d.xp} XP</span> : null}
      </ItemActions>
    </Item>
  </ListItem>
);

const RecommendResultUI: FC<{ result: Extract<RecommendResult, { kind: "shortlist" }> }> = ({ result }) => {
  const sought = result.pairWith?.rolesSought ?? [];
  const label = result.pairWith ? `Partners for ${result.pairWith.investigator}` : "Deck shortlist";
  if (!result.decks.length)
    return (
      <NotFound label={result.pairWith ? `No partner for ${result.pairWith.investigator} fits` : "No indexed deck fits"}>
        <Filters filters={result.filters} />
      </NotFound>
    );
  return (
    <Tool status={DONE} label={label} meta={`Top ${result.decks.length} of ${result.matched} matches`} defaultOpen>
      <Filters filters={result.filters} />
      {sought.length > 1 ? (
        <p className="text-muted-foreground text-xs">
          {capital(sought[0])} decks first, then {sought.slice(1).join(" and ")}; most liked first within each.
        </p>
      ) : null}
      <ItemGroup className="-mx-3 gap-1 max-sm:mx-0">
        {result.decks.map((d) => (
          <DeckRow key={d.deckId} d={d} />
        ))}
      </ItemGroup>
    </Tool>
  );
};

export const RecommendUI: ToolCallMessagePartComponent<Partial<RecommendInput>, RecommendResult> = ({ args, result, status }) => {
  const partnerOf = args.pairWith;
  const deck = useDeckLabel(partnerOf);
  if (!result) return <Pending status={status} label={partnerOf ? `Finding partners for ${deck}` : "Searching the deck index"} />;
  if (result.ok !== true)
    return (
      <FailureRow
        failure={result}
        notFound={partnerOf ? `${capital(deck)} wasn't found` : "Nothing found"}
        error="Couldn't search the deck index"
      />
    );
  if (result.kind === "needs_role")
    return <Info label={`${result.deck.investigator}'s deck isn't in the index: reading it first to see what it lacks`} />;
  return (
    <ToolBoundary label="Deck shortlist">
      <RecommendResultUI result={result} />
    </ToolBoundary>
  );
};
