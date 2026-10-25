"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ItemGroup } from "@/components/ui/item";
import type { FindDeckInput, FindDeckResult } from "@/lib/tools/find-deck";
import { DONE, FailureRow, NotFound, Pending, Tool, ToolBoundary } from "./parts";
import { DeckRow } from "./recommend-decks-ui";

export const FindDeckUI: ToolCallMessagePartComponent<Partial<FindDeckInput>, FindDeckResult> = ({ args, result, status }) => {
  const name = args.name ?? "";
  if (!result) return <Pending status={status} label={`Looking for “${name}”`} />;
  if (result.ok !== true)
    return <FailureRow failure={result} notFound={`No deck “${name}”`} error={`Couldn't look for “${name}”`} />;
  if (!result.decks.length) return <NotFound label={`No indexed deck matches “${name}”`} />;
  return (
    <ToolBoundary label={`Looking for “${name}”`}>
      <Tool status={DONE} label={`Decks matching “${name}”`} meta={`${result.decks.length} closest`}>
        <ItemGroup className="-mx-3 gap-1 max-sm:mx-0">
          {result.decks.map((d) => (
            <DeckRow key={d.deckId} d={d} />
          ))}
        </ItemGroup>
      </Tool>
    </ToolBoundary>
  );
};
