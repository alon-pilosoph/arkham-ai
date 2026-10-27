import fs from "node:fs";
import { expect, type Page } from "@playwright/test";
import { OUTBOX } from "../playwright.config";

/** The newest sign-in link the server wrote to the outbox for this address. */
export function linkFor(email: string): string | undefined {
  if (!fs.existsSync(OUTBOX)) return undefined;
  const mails = fs
    .readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { to: string; text: string })
    .filter((m) => m.to === email);
  return mails.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
}

/** Signs in through the sign-in page and the emailed link, in a fresh session of its own. */
export async function signIn(page: Page, email: string): Promise<void> {
  const before = linkFor(email);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("a link is on its way");
  await expect.poll(() => linkFor(email)).not.toBe(before);
  await page.goto(linkFor(email) ?? "");
  await expect(page.getByRole("heading", { name: "What are you playing tonight?" })).toBeVisible();
}
