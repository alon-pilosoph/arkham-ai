"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ChevronDownIcon } from "lucide-react";
import type { FC, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { rulingsMarkdown, statGroups } from "@/lib/card-text";
import type { CardsInput, CardsResult, CardView } from "@/lib/tools/cards";
import {
  BadgePopover,
  CardMeta,
  capital,
  DONE,
  Dots,
  FailureRow,
  GameText,
  Link,
  NotFound,
  NotOwned,
  Pending,
  RulingsText,
  TabooNote,
  TabooWarning,
  Tool,
  ToolBoundary,
} from "./parts";

const More: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <Collapsible>
    <CollapsibleTrigger className="group/more text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs pointer-coarse:py-2">
      <ChevronDownIcon className="size-3.5 -rotate-90 transition-transform group-data-panel-open/more:rotate-0" />
      {label}
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-1 ps-4.5">{children}</CollapsibleContent>
  </Collapsible>
);

const CardBlock: FC<{ v: CardView }> = ({ v }) => {
  const rulings = v.rulings?.items.length ?? 0;
  // an investigator's icons are its skill stats, not commit icons
  const icons = v.type === "investigator" ? [] : v.icons;
  return (
    <Item size="sm" className="items-start px-0">
      <Dots classes={v.classes} />
      <ItemContent className="gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ItemTitle className="line-clamp-none">
            <Link href={v.url}>{v.label}</Link>
          </ItemTitle>
          {v.errata ? (
            <BadgePopover label="Errata">The text below includes an official erratum ({v.errata}).</BadgePopover>
          ) : null}
          {!v.owned ? <NotOwned /> : null}
        </div>
        <CardMeta card={v}>
          {v.traits ? (
            <>
              . <i>{v.traits}</i>
            </>
          ) : null}
          <br />
          {v.pack}, card {v.code}
        </CardMeta>
        {v.stats ? (
          <div className="flex flex-wrap gap-1">
            {statGroups(v.stats)
              .flat()
              .filter(([, n]) => n !== undefined)
              .map(([k, n]) => (
                <Badge key={k} variant="outline" className="font-normal tabular-nums">
                  {capital(k)} <span className="font-semibold">{n}</span>
                </Badge>
              ))}
          </div>
        ) : null}
        <GameText text={v.text} />
        {icons.length ? (
          <GameText className="text-muted-foreground text-xs" text={`Icons: ${icons.map((i) => `[${i}]`).join(" ")}`} />
        ) : null}
        {v.taboo ? <TabooNote taboo={v.taboo} /> : null}
        {v.back ? (
          <More label="Back of the card">
            <GameText className="text-foreground/80 text-sm" text={v.back} />
          </More>
        ) : null}
        {v.customization ? (
          <More label="Customization options">
            <GameText className="text-foreground/80 text-sm" text={v.customization} />
          </More>
        ) : null}
        {v.rulings ? (
          <More label={rulings === 1 ? "1 official ruling" : `${rulings} official rulings`}>
            <RulingsText text={rulingsMarkdown(v.rulings)} />
          </More>
        ) : null}
      </ItemContent>
    </Item>
  );
};

const CardsResultUI: FC<{ q: string; result: Extract<CardsResult, { ok: true }> }> = ({ q, result }) => {
  if (!result.total) return <NotFound label={`No card matches “${q}”`} />;
  const versions = result.groups.reduce((n, g) => n + g.versions.length, 0);
  // groups can be empty when paged past the end, so not `> 1`
  const several = result.groups.length !== 1;
  return (
    <Tool
      status={DONE}
      label={several ? `${result.total} cards match “${q}”` : result.groups[0].name}
      meta={`${versions} version${versions === 1 ? "" : "s"}`}
    >
      <TabooWarning error={result.tabooError} />
      {result.groups.map((g, i) => (
        <section key={g.name} className="flex flex-col">
          {i ? <Separator className="my-2" /> : null}
          {several && g.versions.length > 1 ? (
            <h3 className="text-muted-foreground text-xs font-medium uppercase">{g.name}</h3>
          ) : null}
          <ItemGroup className="gap-0">
            {g.versions.map((v) => (
              <CardBlock key={v.code} v={v} />
            ))}
          </ItemGroup>
        </section>
      ))}
    </Tool>
  );
};

export const CardsUI: ToolCallMessagePartComponent<Partial<CardsInput>, CardsResult> = ({ args, result, status }) => {
  const q = args.code ?? args.query ?? "";
  if (!result) return <Pending status={status} label={`Looking up ${q}`} />;
  if (result.ok !== true) return <FailureRow failure={result} notFound={`No card ${q}`} error={`Couldn't look up ${q}`} />;
  return (
    <ToolBoundary label={`Looking up ${q}`}>
      <CardsResultUI q={q} result={result} />
    </ToolBoundary>
  );
};
