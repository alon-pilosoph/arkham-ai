import { headers } from "next/headers";
import { isMember, listCampaigns } from "@/lib/campaign/store";
import { currentUser } from "@/lib/session";
import { Assistant } from "./assistant";

/** The chat: personal chats, or a campaign's (?campaign=<id>), for a member. */
export default async function Home(props: PageProps<"/">) {
  const user = await currentUser(await headers());
  const [params, campaigns] = await Promise.all([props.searchParams, user ? listCampaigns(user.id) : []]);
  const wanted = typeof params.campaign === "string" ? params.campaign : undefined;
  const open = wanted && user && (await isMember(user.id, wanted)) ? campaigns.find((c) => c.id === wanted) : undefined;
  const list = campaigns.map((c) => ({ id: c.id, name: c.name }));
  const campaign = open ? { id: open.id, name: open.name } : null;
  return <Assistant key={campaign?.id ?? "personal"} campaign={campaign} campaigns={list} />;
}
