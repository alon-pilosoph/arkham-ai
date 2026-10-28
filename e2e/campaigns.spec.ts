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

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download for ArkhamDB" }).click();
  expect((await download).suggestedFilename()).toMatch(/ v1\.txt$/);

  // the same deck again is version 2; version 1 comes back as version 3, at no cost
  await page.getByLabel("ArkhamDB deck link for Lily").fill("https://arkhamdb.com/decklist/view/33170");
  await page.getByRole("button", { name: "Lock in a new version" }).click();
  await expect(page.getByText("version 2")).toBeVisible();
  await page.getByText("Earlier versions (1)").click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("version 3")).toBeVisible();
  await expect(page.getByText("Lily: back to version 1")).toBeVisible();
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
  // an address of its own: two runs signing one address up at once would race for its link
  const email = `friend-${info.project.name}-${Date.now() % 1_000_000}@example.test`;
  await signIn(theirs, email, { landsOn: "Join the campaign" });
  await theirs.getByRole("button", { name: "Join the campaign" }).click();
  await expect(theirs.getByRole("heading", { name })).toBeVisible();
  await expect(theirs.getByRole("listitem").filter({ hasText: email })).toBeVisible();
  await friend.close();
});

test("in a campaign's chat, a proposed change applies from its card", async ({ page }, info) => {
  const name = `Chat ${info.project.name} ${Date.now() % 100000}`;
  await page.goto("/campaigns");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Start campaign" }).click();
  await page.getByLabel("New seat").fill("Lily");
  await page.getByRole("button", { name: "Add seat" }).click();
  await page.getByLabel("ArkhamDB deck link for Lily").fill("https://arkhamdb.com/decklist/view/33170");
  await page.getByLabel("ArkhamDB deck link for Lily").press("Enter");
  await expect(page.getByRole("heading", { name: "Lily · Lily Chen" })).toBeVisible();

  // the page is server-rendered: typing before it is live loses the text; the sidebar's list of
  // chats loads only once it is
  const live = page.waitForResponse((r) => r.url().includes("/api/chats?campaign="));
  await page.getByRole("link", { name: "Open the campaign's chats" }).click();
  await live;
  await expect(page.getByRole("combobox", { name: "Campaign" })).toHaveValue(/.+/);
  const box = page.getByRole("textbox", { name: "Message input" });
  await box.fill("Lily earned 3 XP");
  await box.press("Enter");
  await expect(page.getByText("Lily: +3 XP")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Applied.")).toBeVisible();

  await box.fill("What is in seat:Lily?");
  await box.press("Enter");
  await expect(page.getByText(/Boom Chakra Lacka/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "See the campaign" }).click();
  await expect(page.getByText("Lily: +3 XP")).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: /^3$/ })).toBeVisible();
});
