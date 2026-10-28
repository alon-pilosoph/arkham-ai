"use client";

import { MailIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { SIGN_IN_LINK_MINUTES } from "@/lib/sign-in";

const ERRORS: Record<string, string> = {
  invite_only: "This app is invite-only. Ask someone you play with to invite you.",
};

function errorText(code: string): string {
  return ERRORS[code.toLowerCase()] ?? "That sign-in didn't work. Try again.";
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
    <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h6c-.3 1.4-1.1 2.6-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2z" />
    <path
      fill="#34A853"
      d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9C3.8 20.5 7.6 23 12 23z"
    />
    <path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.1H2C1.3 8.6.9 10.2.9 12s.4 3.4 1.1 4.9L5.7 14z" />
    <path
      fill="#EA4335"
      d="M12 5.4c1.6 0 3.1.6 4.3 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.6 1 3.8 3.5 2 7.1L5.7 10c.9-2.6 3.4-4.6 6.3-4.6z"
    />
  </svg>
);

export function SignInForm({
  google,
  error,
  next,
  invitedTo,
}: {
  google: boolean;
  error?: string;
  next: string;
  invitedTo?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const { error: failed } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: next,
      errorCallbackURL: "/sign-in",
    });
    setState(failed ? "failed" : "sent");
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-medium tracking-tight">Arkham assistant</h1>
        <p className="text-muted-foreground text-sm">
          {invitedTo ? `${invitedTo} Sign in to join.` : "Sign in to ask about rules, cards and decks."}
        </p>
      </div>
      {error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {errorText(error)}
        </p>
      ) : null}
      {google ? (
        <>
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/sign-in" })}
          >
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            or
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      ) : null}
      {state === "sent" ? (
        <p className="bg-muted rounded-lg p-3 text-sm" role="status">
          If <span className="font-medium">{email.trim()}</span> can sign in, a link is on its way. It works once, for the next{" "}
          {SIGN_IN_LINK_MINUTES} minutes.
        </p>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
          <Button type="submit" size="lg" className="h-11" disabled={state === "sending"}>
            <MailIcon />
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </Button>
          {state === "failed" ? (
            <p className="text-destructive text-sm" role="alert">
              Couldn't send the link. Try again in a minute.
            </p>
          ) : null}
        </form>
      )}
      <p className="text-muted-foreground text-center text-xs">
        Invite-only.{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
      </p>
    </div>
  );
}
