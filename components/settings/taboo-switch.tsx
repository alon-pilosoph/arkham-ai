"use client";

import type { FC } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const TabooSwitch: FC<{ on: boolean; onChange: (on: boolean) => void }> = ({ on, onChange }) => (
  <Tooltip>
    <TooltipTrigger closeOnClick={false} render={<div className="flex items-center gap-2" />}>
      <Label htmlFor="taboo-switch">
        <span className="max-sm:hidden">Taboo list</span>
        <span className="sm:hidden">Taboo</span>
      </Label>
      <Switch
        id="taboo-switch"
        checked={on}
        onCheckedChange={onChange}
        aria-label="Play with the taboo list"
        className="data-unchecked:bg-muted-foreground/40 relative pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
      />
    </TooltipTrigger>
    <TooltipContent align="end">
      {on ? "The current taboo list applies to card text, XP and deckbuilding" : "Cards play as printed"}
    </TooltipContent>
  </Tooltip>
);
