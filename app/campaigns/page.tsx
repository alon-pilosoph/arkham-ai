import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DIFFICULTIES, listCampaigns } from "@/lib/campaign/store";
import { CAMPAIGNS } from "@/lib/campaigns";
import { currentUser } from "@/lib/session";
import { createCampaignAction } from "./actions";
import { ErrorNote, field, Section } from "./ui";

export const metadata: Metadata = { title: "Campaigns · Arkham assistant" };

export default async function CampaignsPage(props: PageProps<"/campaigns">) {
  const user = await currentUser(await headers());
  if (!user) redirect("/sign-in?next=/campaigns");
  const [mine, params] = await Promise.all([listCampaigns(user.id), props.searchParams]);
  const kinds = [
    ["Campaigns", "campaign"],
    ["Return to", "return"],
    ["Standalone scenarios", "standalone"],
  ] as const;
  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-medium tracking-tight">Campaigns</h1>
      <ErrorNote error={params.error} />
      <Section title="Yours">
        {mine.length ? (
          <ul className="flex flex-col gap-1">
            {mine.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="hover:bg-muted flex justify-between rounded-md px-3 py-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-sm">{CAMPAIGNS.find((x) => x.code === c.code)?.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">None yet. Start one below, or open an invite link someone sent you.</p>
        )}
      </Section>
      <Section title="Start a campaign">
        <form action={createCampaignAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input name="name" required maxLength={80} placeholder="Thursday Carcosa" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Campaign
            <select name="code" required className={field}>
              {kinds.map(([label, kind]) => (
                <optgroup key={kind} label={label}>
                  {CAMPAIGNS.filter((c) => c.kind === kind).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Difficulty
              <select name="difficulty" defaultValue="standard" className={field}>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="taboo" /> Taboo list
            </label>
          </div>
          <Button type="submit" className="self-start">
            Start campaign
          </Button>
        </form>
      </Section>
    </main>
  );
}
