import { DECKS_PER_INVESTIGATOR, type InvestigatorSelection, type Skip } from "./selection";

export type SelectionReport = {
  decks: number;
  investigators: number;
  short: { investigator: string; decks: number }[];
  skipped: Record<Skip["reason"], number>;
  summary: string;
};

export function selectionReport(selection: InvestigatorSelection[]): SelectionReport {
  const skipped: Record<Skip["reason"], number> = { "not owned": 0, illegal: 0, "same list": 0, unavailable: 0 };
  for (const inv of selection) for (const s of inv.skipped) skipped[s.skip.reason]++;
  const decks = selection.reduce((n, inv) => n + inv.decks.length, 0);
  const short = selection
    .filter((inv) => inv.decks.length < DECKS_PER_INVESTIGATOR)
    .map((inv) => ({ investigator: inv.name, decks: inv.decks.length }));
  const lines = [
    `${decks} decks for ${selection.length} investigators`,
    `passed over: ${Object.entries(skipped)
      .map(([reason, n]) => `${n} ${reason}`)
      .join(", ")}`,
    ...(short.length
      ? [`fewer than ${DECKS_PER_INVESTIGATOR} liked decks: ${short.map((s) => `${s.investigator} ${s.decks}`).join(", ")}`]
      : []),
  ];
  return { decks, investigators: selection.length, short, skipped, summary: lines.join("\n") };
}
