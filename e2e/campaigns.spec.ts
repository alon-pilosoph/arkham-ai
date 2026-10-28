import { expect, test } from "@playwright/test";
import { signIn } from "./outbox";

test("a campaign: a seat, a deck locked in, a scenario recorded and reverted", async ({ page }, info) => {
  const name = `Carcosa ${info.project.name} ${Date.now() % 100000}`;
  await page.goto("/campaigns");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Campaign").selectOption({ label: "The Path to Carcosa" });
  await page.getByRole("button", { name: "Start campaign" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("next: Curtain Call")).toBeVisible();

  await page.getByLabel("New seat").fill("Lily");
  await page.getByRole("button", { name: "Add seat" }).click();
  await page.getByLabel("ArkhamDB deck link for Lily").fill("https://arkhamdb.com/decklist/view/33170");
  await page.getByRole("button", { name: "Lock in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Lily · Lily Chen/ })).toBeVisible();
  await expect(page.getByText("version 1")).toBeVisible();

  await page.getByLabel("Lily earned").fill("3");
  await page.getByLabel("Lily mental").fill("1");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("next: The Last King")).toBeVisible();
  await expect(page.getByText("0 physical, 1 mental")).toBeVisible();
  const history = page.getByRole("listitem").filter({ hasText: "Lily: +3 XP" });
  await expect(history).toBeVisible();

  await history.getByRole("button", { name: "Revert" }).click();
  await expect(page.getByText("0 physical, 0 mental")).toBeVisible();
  await expect(page.getByText("next: Curtain Call")).toBeVisible();
  await expect(page.getByText("Reverted: Lily: +3 XP")).toBeVisible();
});

test("an invite link lets someone new sign up and join", async ({ page, browser }, info) => {
  const name = `Invite ${info.project.name} ${Date.now() % 100000}`;
  await page.goto("/campaigns");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Start campaign" }).click();
  const link = await page.getByLabel("Invite link").inputValue();

  const friend = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const theirs = await friend.newPage();
  await theirs.goto(link);
  await expect(theirs.getByText(`invited you to ${name}`)).toBeVisible();
  await signIn(theirs, `friend-${info.project.name}@example.test`, { landsOn: "Join the campaign" });
  await theirs.getByRole("button", { name: "Join the campaign" }).click();
  await expect(theirs.getByRole("heading", { name })).toBeVisible();
  await expect(theirs.getByRole("listitem").filter({ hasText: `friend-${info.project.name}@example.test` })).toBeVisible();
  await friend.close();
});
