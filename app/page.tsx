import { headers } from "next/headers";
import { currentInvite } from "@/lib/campaign/invites";
import { listCampaigns, loadCampaign } from "@/lib/campaign/store";
import { currentUser } from "@/lib/session";
import { Assistant } from "./assistant";

/** The chat: personal chats, or a campaign's (?campaign=<id>), for a member. */
export default async function Home(props: PageProps<"/">) {
  const h = await headers();
  const user = await currentUser(h);
  const [params, campaigns] = await Promise.all([props.searchParams, user ? listCampaigns(user.id) : []]);
  const wanted = typeof params.campaign === "string" ? params.campaign : undefined;
  const open = wanted && user ? await loadCampaign(user.id, wanted) : null;
  const list = campaigns.map((c) => ({ id: c.id, name: c.name }));
  const campaign =
    open && user
      ? {
          id: open.id,
          name: open.name,
          next: open.scenarios[open.nextScenario] ?? null,
          invite: `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/invite/${await currentInvite(open.id, user.id)}`,
        }
      : null;
  return <Assistant key={campaign?.id ?? "personal"} campaign={campaign} campaigns={list} />;
}
