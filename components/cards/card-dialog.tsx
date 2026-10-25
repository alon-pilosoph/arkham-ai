"use client";

import { ArrowLeftIcon, BrainIcon, ChevronDownIcon, ExternalLinkIcon, HeartIcon, PaintbrushIcon } from "lucide-react";
import { type CSSProperties, type FC, type ReactNode, useCallback, useEffect, useState } from "react";
import { BadgePopover, capital, NotOwned, RulingsText, TabooNote } from "@/components/tools/parts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSettings } from "@/hooks/use-settings";
import type { CardDetail } from "@/lib/card-detail";
import { rulingsMarkdown, statGroups } from "@/lib/card-text";
import { cardUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { OpenCardContext, useCardClick } from "./card-link";
import { classColor, GameIcon } from "./icons";
import { RichText } from "./rich-text";

type Loaded = { ok: true; card: CardDetail } | { ok: false; message: string };

// One request per card and taboo setting for the life of the page; a failure is not kept.
const loaded = new Map<string, Promise<Loaded>>();

function loadCard(code: string, taboo: boolean): Promise<Loaded> {
  const key = `${code}:${taboo ? 1 : 0}`;
  let p = loaded.get(key);
  if (!p) {
    p = fetch(`/api/card/${encodeURIComponent(code)}?taboo=${taboo ? 1 : 0}`)
      .then(async (res): Promise<Loaded> => {
        if (res.ok) return { ok: true, card: (await res.json()) as CardDetail };
        return { ok: false, message: (await res.text()) || `The card couldn't be loaded (${res.status}).` };
      })
      .catch(() => ({ ok: false, message: "The card couldn't be loaded. Check the connection and try again." }));
    p.then((r) => {
      if (!r.ok) loaded.delete(key);
    });
    loaded.set(key, p);
  }
  return p;
}

/** Card links inside it open the card in a dialog on desktop and a bottom sheet on a phone.
 *  A link inside the dialog (a ruling naming another card, another level) opens on top, with a
 *  back button. */
export const CardDialogProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [stack, setStack] = useState<string[]>([]);
  const open = useCallback((code: string) => setStack((s) => (s.at(-1) === code ? s : [...s, code])), []);
  const close = () => setStack([]);
  const back = () => setStack((s) => s.slice(0, -1));
  const isMobile = useIsMobile();
  const code = stack.at(-1);
  const body = code ? <CardBody key={code} code={code} onBack={stack.length > 1 ? back : undefined} /> : null;
  return (
    <OpenCardContext.Provider value={open}>
      {children}
      {isMobile ? (
        <Sheet open={!!code} onOpenChange={(o) => (o ? null : close())}>
          <SheetContent
            side="bottom"
            className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
          >
            {body}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={!!code} onOpenChange={(o) => (o ? null : close())}>
          <DialogContent className="max-h-[88dvh] gap-0 overflow-y-auto p-0 sm:max-w-xl">{body}</DialogContent>
        </Dialog>
      )}
    </OpenCardContext.Provider>
  );
};

const CardBody: FC<{ code: string; onBack?: () => void }> = ({ code, onBack }) => {
  const { settings } = useSettings();
  const [state, setState] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    loadCard(code, settings.taboo).then((r) => live && setState(r));
    return () => {
      live = false;
    };
  }, [code, settings.taboo]);
  const retry = () => {
    setState(null);
    loadCard(code, settings.taboo).then(setState);
  };
  const isMobile = useIsMobile();
  const Title = isMobile ? SheetTitle : DialogTitle;
  const Description = isMobile ? SheetDescription : DialogDescription;

  if (!state)
    return (
      <div className="flex flex-col gap-3 p-5" aria-busy>
        <Title className="sr-only">Loading card {code}</Title>
        <Description className="sr-only">The card's text, icons and rulings.</Description>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  if (!state.ok)
    return (
      <div className="flex flex-col gap-3 p-5">
        <Title>This card couldn't be shown</Title>
        <Description>{state.message}</Description>
        <div className="flex gap-4 text-sm">
          <button type="button" className="underline underline-offset-2" onClick={retry}>
            Try again
          </button>
          <a className="underline underline-offset-2" href={cardUrl(code)} target="_blank" rel="noopener noreferrer">
            Open on ArkhamDB
          </a>
        </div>
      </div>
    );
  return (
    <CardFaceView
      card={state.card}
      onBack={onBack}
      title={(t) => <Title className="text-[1.35rem] leading-tight font-medium text-white">{t}</Title>}
      description={<Description className="sr-only">The card's text, icons and rulings.</Description>}
    />
  );
};

// Where the art sits on ArkhamDB's scan, by card type: investigators are landscape with the art
// on the left, player cards have it above the text box, enemies and treacheries below it.
function artStyle(card: CardDetail): CSSProperties {
  const at: Record<string, [string, string]> = {
    investigator: ["230%", "0% 75%"],
    asset: ["140%", "50% 15%"],
    event: ["140%", "50% 15%"],
    skill: ["140%", "70% 15%"],
    location: ["140%", "50% 15%"],
    enemy: ["140%", "50% 100%"],
    treachery: ["140%", "50% 100%"],
  };
  const [size, position] = at[card.type] ?? ["cover", "50% 50%"];
  return { backgroundImage: `url(${card.image})`, backgroundSize: size, backgroundPosition: position };
}

const Section: FC<{ label: string; children: ReactNode; defaultOpen?: boolean }> = ({ label, children, defaultOpen }) => (
  <Collapsible defaultOpen={defaultOpen} className="border-t">
    <CollapsibleTrigger className="group/more hover:bg-muted/60 flex w-full items-center gap-2 px-5 py-3 text-sm font-medium">
      <ChevronDownIcon className="size-4 -rotate-90 transition-transform group-data-panel-open/more:rotate-0" />
      {label}
    </CollapsibleTrigger>
    <CollapsibleContent className="px-5 pb-4">{children}</CollapsibleContent>
  </Collapsible>
);

const StatBox: FC<{ icon: string; n?: number }> = ({ icon, n }) => (
  <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-lg tabular-nums">
    {n ?? "–"}
    <GameIcon token={icon} className="text-base" />
  </span>
);

const Soak: FC<{ kind: "health" | "sanity" | "damage" | "horror"; n?: number }> = ({ kind, n }) => {
  const red = kind === "health" || kind === "damage";
  const Icon = red ? HeartIcon : BrainIcon;
  return (
    <span
      title={capital(kind)}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-base font-semibold tabular-nums text-white",
        red ? "bg-[#b3262e]" : "bg-[#2a4f8f]",
      )}
    >
      <Icon className="size-3.5" aria-label={capital(kind)} />
      {n ?? "–"}
    </span>
  );
};

const SKILLS = new Set(["willpower", "intellect", "combat", "agility"]);

const Stats: FC<{ card: CardDetail }> = ({ card }) => {
  if (!card.stats) return null;
  const [first, second] = statGroups(card.stats);
  if (card.stats.kind === "investigator")
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {first.map(([k, n]) => (
            <StatBox key={k} icon={k} n={n} />
          ))}
        </div>
        <div className="flex gap-1.5">
          {second.map(([k, n]) => (
            <Soak key={k} kind={k as "health" | "sanity"} n={n} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {[...first, ...(second ?? [])]
        .filter(([k, n]) => n !== undefined || k === "health" || SKILLS.has(k))
        .map(([k, n]) =>
          k === "health" || k === "sanity" || k === "damage" || k === "horror" ? (
            <Soak key={k} kind={k} n={n} />
          ) : (
            <span key={k} className="bg-muted rounded-md px-2 py-0.5">
              {capital(k)} <b className="tabular-nums">{n ?? "–"}</b>
            </span>
          ),
        )}
    </div>
  );
};

export const CardFaceView: FC<{
  card: CardDetail;
  onBack?: () => void;
  title: (text: ReactNode) => ReactNode;
  description: ReactNode;
}> = ({ card, onBack, title, description }) => {
  const [scan, setScan] = useState(false);
  const color = classColor(card.classes, !!card.encounter);
  const typeLine = [capital(card.type), card.slot].filter(Boolean).join(" · ");
  // an investigator's icons are its skills, shown as stats
  const icons = card.type === "investigator" ? [] : card.icons;
  const level = card.level;
  // versions at one level are told apart by subname (Enchanted Blade), and same-named ones
  // (a parallel investigator) by pack
  const chip = (v: CardDetail["versions"][number]) => {
    const same = card.versions.filter((o) => o.level === v.level);
    if (same.length === 1) return `Level ${v.level}`;
    return same.filter((o) => o.label === v.label).length > 1 ? v.pack : v.label;
  };
  return (
    <article className="font-card text-[1.05rem]">
      <header className="flex items-center gap-3 px-5 py-3 pe-12 text-white" style={{ backgroundColor: color }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className="-ms-1 rounded-full p-1 hover:bg-white/15">
            <ArrowLeftIcon className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          {title(
            <>
              {card.unique ? <GameIcon token="unique" className="me-1 text-base align-[0.1em]" /> : null}
              {card.name}
              {level ? (
                <span className="ms-2 align-middle text-base tracking-[0.15em]" title={`Level ${level}`}>
                  {"•".repeat(level)}
                </span>
              ) : null}
            </>,
          )}
          {card.subname ? <p className="italic opacity-90">{card.subname}</p> : null}
        </div>
        {card.cost != null ? (
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-white text-xl"
            title="Cost"
          >
            {card.cost}
          </span>
        ) : card.classes.length && !card.encounter ? (
          <span className="flex gap-1 text-3xl">
            {card.classes.map((c) => (c === "neutral" ? null : <GameIcon key={c} token={c} />))}
          </span>
        ) : null}
      </header>
      {description}

      {scan && card.image ? (
        <button type="button" className="flex w-full flex-col items-center gap-2 p-4" onClick={() => setScan(false)}>
          {/* biome-ignore lint/performance/noImgElement: ArkhamDB's own scans, at their own size */}
          <img src={card.image} alt={`The printed card: ${card.label}`} className="max-h-[70dvh] max-w-full rounded-lg" />
          {card.backImage ? (
            // biome-ignore lint/performance/noImgElement: as above
            <img src={card.backImage} alt={`The back of ${card.label}`} className="max-h-[70dvh] max-w-full rounded-lg" />
          ) : null}
          <span className="text-muted-foreground font-sans text-xs">Tap to go back to the text</span>
        </button>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="font-semibold">{typeLine}</p>
              {card.traits ? <p className="font-semibold italic">{card.traits}</p> : null}
              {icons.length ? (
                <div className="flex flex-wrap gap-1">
                  {icons.map((icon, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: icons repeat, in a fixed order
                      key={i}
                      className="bg-muted flex size-8 items-center justify-center rounded-md text-xl"
                    >
                      <GameIcon token={icon} />
                    </span>
                  ))}
                </div>
              ) : null}
              <Stats card={card} />
              <div className="flex flex-wrap gap-1.5 font-sans">
                {card.errata ? (
                  <BadgePopover label="Errata">The text below includes an official erratum ({card.errata}).</BadgePopover>
                ) : null}
                {!card.owned ? <NotOwned /> : null}
              </div>
            </div>
            {card.image ? (
              <button
                type="button"
                onClick={() => setScan(true)}
                aria-label="Show the printed card"
                className="size-28 shrink-0 rounded-lg bg-no-repeat shadow-sm ring-1 ring-black/10 sm:size-32"
                style={artStyle(card)}
              />
            ) : null}
          </div>

          {card.rich.text ? <RichText text={card.rich.text} className="border-s-2 border-current/25 ps-3" /> : null}
          {card.taboo ? (
            <div className="font-sans">
              <TabooNote taboo={card.taboo} />
            </div>
          ) : null}
          {card.rich.flavor ? <RichText text={card.rich.flavor} className="text-muted-foreground italic" /> : null}

          {card.versions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 font-sans text-xs">
              <span className="text-muted-foreground">Versions</span>
              {card.versions.map((v) => (
                <VersionChip
                  key={v.code}
                  code={v.code}
                  label={v.label}
                  text={chip(v)}
                  current={v.code === card.code}
                  owned={v.owned}
                />
              ))}
            </div>
          ) : null}

          <footer className="text-muted-foreground flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-3 text-sm">
            <span className="flex items-center gap-1.5">
              {card.illustrator ? (
                <>
                  <PaintbrushIcon className="size-3.5" aria-label="Illustrated by" />
                  {card.illustrator}
                </>
              ) : null}
            </span>
            <span className="flex flex-col items-end">
              {card.prints.length ? (
                card.prints.map((p) => (
                  <span key={p.code}>
                    {p.pack}
                    {p.position != null ? ` #${p.position}` : ""}
                    {p.quantity ? ` ×${p.quantity}` : ""}
                  </span>
                ))
              ) : (
                <span>{card.pack}</span>
              )}
            </span>
          </footer>
        </div>
      )}

      {card.rich.back ? (
        <Section
          label={card.type === "investigator" ? "Deckbuilding and back" : `Back${card.backName ? `: ${card.backName}` : ""}`}
        >
          <RichText text={card.rich.back} />
          {card.rich.backFlavor ? <RichText text={card.rich.backFlavor} className="text-muted-foreground mt-3 italic" /> : null}
        </Section>
      ) : null}
      {card.rich.customization ? (
        <Section label="Customization options">
          <RichText text={card.rich.customization} />
        </Section>
      ) : null}
      <Section label={card.rulings ? `FAQ (${card.rulings.items.length})` : "FAQ"}>
        <div className="font-sans">
          {card.rulings ? (
            <RulingsText text={rulingsMarkdown(card.rulings)} />
          ) : (
            <p className="text-muted-foreground text-sm">The official FAQ has no rulings on this card.</p>
          )}
        </div>
      </Section>
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 border-t px-5 py-3 font-sans text-sm"
      >
        <ExternalLinkIcon className="size-3.5" />
        Open on ArkhamDB
      </a>
    </article>
  );
};

const VersionChip: FC<{ code: string; label: string; text: string; current: boolean; owned: boolean }> = ({
  code,
  label,
  text,
  current,
  owned,
}) => {
  const href = cardUrl(code);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={useCardClick(href)}
      aria-current={current || undefined}
      title={`${label}${owned ? "" : " (not owned)"}`}
      className={cn(
        "rounded-full border px-2 py-0.5 tabular-nums",
        current ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
        !owned && "opacity-50",
      )}
    >
      {text}
    </a>
  );
};
