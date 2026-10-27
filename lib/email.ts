// Sends the app's email: sign-in links, and later invites. Through Resend when RESEND_API_KEY is
// set; to a file when ARKHAM_OUTBOX names one (end-to-end tests read their sign-in links there),
// which wins so a test never sends real mail; otherwise to the server log, for local runs.

import fs from "node:fs";
import { Resend } from "resend";
import { SIGN_IN_LINK_MINUTES } from "./sign-in";

export type Email = { to: string; subject: string; text: string; html: string };

const FROM = process.env.EMAIL_FROM ?? "Arkham assistant <signin@mail.alonp.dev>";

export async function sendEmail(email: Email): Promise<void> {
  const outbox = process.env.ARKHAM_OUTBOX;
  if (outbox) {
    fs.appendFileSync(outbox, `${JSON.stringify(email)}\n`);
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`email to ${email.to}: ${email.subject}\n${email.text}`);
    return;
  }
  const { error } = await new Resend(key).emails.send({ from: FROM, ...email });
  if (error) throw new Error(`email to ${email.to} failed: ${error.message}`);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function signInEmail(to: string, url: string): Email {
  return {
    to,
    subject: "Sign in to the Arkham assistant",
    text: `Open this link to sign in. It works once, for the next ${SIGN_IN_LINK_MINUTES} minutes.\n\n${url}\n\nIf you didn't ask for it, ignore this email.`,
    html: `<p>Open this link to sign in. It works once, for the next ${SIGN_IN_LINK_MINUTES} minutes.</p><p><a href="${escapeHtml(url)}">Sign in to the Arkham assistant</a></p><p>If you didn't ask for it, ignore this email.</p>`,
  };
}
