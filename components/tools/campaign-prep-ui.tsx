"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { FC } from "react";
import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/lib/campaigns";
import type { CampaignPrepInput, CampaignPrepResult } from "@/lib/tools/campaign-prep";
import { capital, DONE, FailureRow, GameText, Pending, Tool, ToolBoundary } from "./parts";

const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);

const Chips: FC<{ items: [string, number][]; unit?: string }> = ({ items, unit = "" }) => (
  <div className="flex flex-wrap gap-1">
    {items
      .filter(([, n]) => n)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => (
        <Badge key={k} variant="outline" className="font-normal tabular-nums">
          {capital(k)}{" "}
          <span className="font-semibold">
            {n}
            {unit}
          </span>
        </Badge>
      ))}
  </div>
);

const ProfileView: FC<{ p: Profile }> = ({ p }) => {
  const t = p.treacheries;
  const e = p.enemies;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Treacheries test ({t.copies} copies)</span>
        <Chips items={Object.entries(t.tests).map(([k, n]) => [k, pct(n, t.copies)])} unit="%" />
        <span className="text-muted-foreground text-xs">
          {pct(t.horror, t.copies)}% horror, {pct(t.damage, t.copies)}% damage, {pct(t.doom, t.copies)}% doom
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">
          Enemies ({e.copies} copies): fight {e.fight ?? "–"}, evade {e.evade ?? "–"}, health {e.health ?? "–"}; attacks{" "}
          {e.attackDamage} damage, {e.attackHorror} horror in total
        </span>
        <Chips items={Object.entries(e.keywords)} />
      </div>
      <span className="text-muted-foreground text-xs">
        {p.locations.count} locations, average shroud {p.locations.shroud ?? "–"}
        {p.tokens.frost ? `; frost on ${p.tokens.frost} cards` : ""}
      </span>
    </div>
  );
};

export const CampaignPrepUI: ToolCallMessagePartComponent<Partial<CampaignPrepInput>, CampaignPrepResult> = ({
  args,
  result,
  status,
}) => {
  const name = args.campaign ?? "the campaign";
  if (!result) return <Pending status={status} label={`Sizing up ${name}`} />;
  if (result.ok !== true)
    return <FailureRow failure={result} notFound={`No campaign “${name}”`} error={`Couldn't size up ${name}`} />;
  return (
    <ToolBoundary label={`Sizing up ${name}`}>
      <Tool status={DONE} label={`What ${result.campaign.name} asks of you`} meta="Spoiler-light">
        <div className="flex flex-col gap-3">
          {result.campaign.note ? <GameText text={result.campaign.note} className="text-sm" /> : null}
          <ProfileView p={result.profile} />
          {result.scenarios.length ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium uppercase">By scenario</span>
              <table className="text-xs tabular-nums">
                <thead className="text-muted-foreground text-start">
                  <tr>
                    <th className="py-0.5 text-start font-normal">Scenario</th>
                    <th className="text-end font-normal">Horror</th>
                    <th className="text-end font-normal">Damage</th>
                    <th className="text-end font-normal">Enemies</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.scenarios, ...(result.shared ? [{ name: "Shared sets", profile: result.shared }] : [])].map((s) => (
                    <tr key={s.name} className="border-t">
                      <td className="py-0.5">{s.name}</td>
                      <td className="text-end">{pct(s.profile.treacheries.horror, s.profile.treacheries.copies)}%</td>
                      <td className="text-end">{pct(s.profile.treacheries.damage, s.profile.treacheries.copies)}%</td>
                      <td className="text-end">{s.profile.enemies.copies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <span className="text-muted-foreground text-xs">
                Each scenario counts only the set made for it; the sets several scenarios share are counted apart.
              </span>
            </div>
          ) : null}
        </div>
      </Tool>
    </ToolBoundary>
  );
};
