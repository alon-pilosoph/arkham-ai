import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { joinAction } from "@/app/campaigns/actions";
import { Button } from "@/components/ui/button";
import { findInvite } from "@/lib/campaign/invites";
import { isMember } from "@/lib/campaign/store";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Invite · Arkham assistant" };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const user = await currentUser(await headers());
  if (!user) redirect(`/sign-in?next=/invite/${token}`);
  const invite = await findInvite(token);
  if (invite && (await isMember(user.id, invite.campaignId))) redirect(`/campaigns/${invite.campaignId}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4 text-center">
      {invite ? (
        <>
          <h1 className="text-2xl font-medium tracking-tight">{invite.campaignName}</h1>
          <p className="text-muted-foreground text-sm">{invite.invitedBy} invited you to this campaign.</p>
          <form action={joinAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" size="lg" className="h-11 w-full">
              Join the campaign
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-medium tracking-tight">This invite has ended</h1>
          <p className="text-muted-foreground text-sm">The link was replaced. Ask the person who sent it for a new one.</p>
        </>
      )}
    </main>
  );
}
