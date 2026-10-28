import type { Metadata } from "next";
import { headers } from "next/headers";
import { SignInForm } from "@/components/account/sign-in-form";
import { findInvite, inviteToken } from "@/lib/campaign/invites";

export const metadata: Metadata = { title: "Sign in · Arkham assistant" };

/** Where a page outside the app sends someone back to after signing in: only a path in the app. */
function safeNext(next: string | string[] | undefined): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const params = await props.searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const invite = await findInvite(inviteToken(await headers()));
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <SignInForm
        google={!!process.env.GOOGLE_CLIENT_ID}
        error={error}
        next={safeNext(params.next)}
        invitedTo={invite ? `${invite.invitedBy} invited you to ${invite.campaignName}.` : undefined}
      />
    </main>
  );
}
