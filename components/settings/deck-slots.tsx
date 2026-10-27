"use client";

import { LayersIcon, XIcon } from "lucide-react";
import { type FC, type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettings } from "@/hooks/use-settings";
import { type SavedDeck, SavedDeckSchema, type Settings } from "@/lib/settings";
import { deckUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";

type Slot = "myDeck" | "partnerDeck";

const SLOTS: { slot: Slot; label: string }[] = [
  { slot: "myDeck", label: "Your deck" },
  { slot: "partnerDeck", label: "Your partner's deck" },
];

async function resolve(link: string): Promise<{ ok: true; deck: SavedDeck } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/deck?ref=${encodeURIComponent(link)}`);
    if (!res.ok) return { ok: false, message: (await res.text()) || "The deck couldn't be read." };
    const deck = SavedDeckSchema.safeParse(await res.json());
    return deck.success ? { ok: true, deck: deck.data } : { ok: false, message: "The deck couldn't be read." };
  } catch {
    return { ok: false, message: "The deck couldn't be read. Check the connection and try again." };
  }
}

const SlotEditor: FC<{ slot: Slot; label: string; settings: Settings; update: (p: Partial<Settings>) => void }> = ({
  slot,
  label,
  settings,
  update,
}) => {
  const saved = settings[slot];
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `deck-slot-${slot}`;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    setError(null);
    const r = await resolve(link.trim());
    setBusy(false);
    if (!r.ok) return setError(r.message);
    update({ [slot]: r.deck });
    setLink("");
    setEditing(false);
  };

  return (
    <section className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs font-medium">
        {label}
      </Label>
      {saved && !editing ? (
        <div className="flex items-start gap-2">
          <a
            href={deckUrl(saved.id, saved.kind)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 text-sm underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            <span className="font-medium">{saved.investigator}</span>
            <span className="text-muted-foreground block truncate">{saved.name || "Untitled deck"}</span>
          </a>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => update({ [slot]: null })}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="flex gap-2">
          <Input
            id={id}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste an ArkhamDB deck link"
            inputMode="url"
            autoComplete="off"
            className="h-8 text-sm"
            aria-invalid={!!error}
          />
          <Button size="sm" type="submit" disabled={busy || !link.trim()}>
            {busy ? "Reading…" : "Save"}
          </Button>
        </form>
      )}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </section>
  );
};

export const DeckSlots: FC = () => {
  const { settings, update } = useSettings();
  const count = (settings.myDeck ? 1 : 0) + (settings.partnerDeck ? 1 : 0);
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="gap-1.5 max-md:size-10 max-md:px-0" aria-label="Your decks" />}
      >
        <LayersIcon />
        <span className="max-md:hidden">Decks</span>
        {count ? (
          <span
            className={cn("bg-primary text-primary-foreground rounded-full px-1.5 text-[0.65rem] tabular-nums", "max-md:sr-only")}
          >
            {count}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-4">
        <p className="text-muted-foreground text-xs">
          Save your decks once, then just ask about “my deck” or “my partner’s deck”. They’re kept in this browser.
        </p>
        {SLOTS.map((s) => (
          <SlotEditor key={s.slot} {...s} settings={settings} update={update} />
        ))}
      </PopoverContent>
    </Popover>
  );
};
