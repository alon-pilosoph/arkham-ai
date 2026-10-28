import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Arkham assistant" };

// Public, so Google's sign-in screen can link to it. Keep it true to the code: a change in what
// is stored or where it goes changes this page.
export default function PrivacyPage() {
  const owner = process.env.OWNER_EMAIL;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-medium tracking-tight">Privacy</h1>
      <p>
        The Arkham assistant is a small, invite-only app for people playing Arkham Horror: The Card Game together. It is not a
        business and shows no ads.
      </p>
      <h2 className="mt-2 text-base font-medium">What it stores</h2>
      <ul className="list-disc ps-5">
        <li>Your account: the name, email address and profile picture link Google shares, or the email you sign in with.</li>
        <li>Your sessions: when you signed in, and the IP address and browser of each session, to keep you signed in.</li>
        <li>How many questions you asked each day, for a daily limit.</li>
        <li>Your chats, so you can come back to them.</li>
        <li>
          Campaigns you start or join: their decks, XP and trauma, and who changed what. The other members of a campaign see your
          name and email address.
        </li>
      </ul>
      <h2 className="mt-2 text-base font-medium">Where it goes</h2>
      <ul className="list-disc ps-5">
        <li>
          Your questions and the chat before them are sent to the AI model that answers them (OpenAI by default, otherwise
          Anthropic), under their API terms.
        </li>
        <li>Decks you link to are read from ArkhamDB.</li>
        <li>The app runs on Vercel, its database on Neon (in Frankfurt), and sign-in emails are sent with Resend.</li>
      </ul>
      <p>Nothing is sold or shared with anyone else, and there is no tracking or analytics.</p>
      <h2 className="mt-2 text-base font-medium">Deleting your data</h2>
      <p>
        Ask{" "}
        {owner ? (
          <a href={`mailto:${owner}`} className="underline underline-offset-2">
            {owner}
          </a>
        ) : (
          "the app's owner"
        )}{" "}
        and your account, sessions and chats are deleted.
      </p>
      <p className="text-muted-foreground mt-4">
        <Link href="/" className="underline underline-offset-2">
          Back to the app
        </Link>
      </p>
    </main>
  );
}
