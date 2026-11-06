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

test("a deck that links a starting version asks which to play, and keeps the finished one as a target", async ({
  page,
}, info) => {
  await page.goto("/campaigns");
  await page.getByLabel("Name").fill(`Target ${info.project.name} ${Date.now() % 100000}`);
  await page.getByLabel("Campaign").selectOption({ label: "The Path to Carcosa" });
  await page.getByRole("button", { name: "Start campaign" }).click();
  await page.getByLabel("New seat").fill("Lily");
  await page.getByRole("button", { name: "Add seat" }).click();
  await page.getByLabel("ArkhamDB deck link for Lily").fill("https://arkhamdb.com/decklist/view/900001");
  await page.getByRole("button", { name: "Lock in", exact: true }).click();
  await page.getByRole("button", { name: /Start from Lily - Starter \(0 XP\)/ }).click();
  await expect(page.getByText("Building toward", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lily - Starter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lily - Finished" })).toBeVisible();
});

test("starting a campaign in chat: a card with two ways, then a campaign that opens its own chat", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("textbox", { name: "Message input" });
  await box.fill("I'm starting a new campaign");
  await box.press("Enter");
  await expect(page.getByRole("link", { name: "Set it up myself" })).toHaveAttribute("href", "/campaigns");
  await page.getByRole("button", { name: "Set it up in chat" }).click();
  await expect(page.getByText("Let's set it up here in the chat.").last()).toBeVisible();
  // the next message can't send until this answer is finished
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({ timeout: 15_000 });

  await box.fill("set up carcosa with Lily");
  await box.press("Enter");
  await expect(page.getByText("Starting at Curtain Call")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("heading", { name: "Carcosa" })).toBeVisible();
  await expect(page.getByText("Next up: Curtain Call.")).toBeVisible();
  await expect(page.getByLabel("Invite link")).toHaveValue(/\/invite\//);
});

test("a campaign joined partway through starts at its scenario and goes straight to advice", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("textbox", { name: "Message input" });
  await box.fill("set up carcosa with Lily at The Last King");
  await box.press("Enter");
  await expect(page.getByText("Starting at The Last King")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByText("We're about to play The Last King.").last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("combobox", { name: "Campaign" })).toHaveValue(/.+/);
});

test("the rest of a campaign from chat: a seat, a deck, an undo, and a card that goes there", async ({ page }, info) => {
  await page.goto("/campaigns");
  await page.getByLabel("Name").fill(`Cards ${info.project.name} ${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Start campaign" }).click();
  const live = page.waitForResponse((r) => r.url().includes("/api/chats?campaign="));
  await page.getByRole("link", { name: "Open the campaign's chats" }).click();
  await live;
  const box = page.getByRole("textbox", { name: "Message input" });
  const say = async (text: string, shown: string) => {
    await box.fill(text);
    await box.press("Enter");
    await expect(page.getByText(shown).last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({ timeout: 15_000 });
  };
  await say("add a seat for Lily", "Add Lily's seat");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Applied.")).toBeVisible();

  await say("undo that", "Undo: Added Lily's seat");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Applied.").last()).toBeVisible();

  await say("open the campaign", "Invite link");
  await expect(page.getByRole("link", { name: "New chat in it" })).toBeVisible();
  await page.getByRole("link", { name: "Campaign page" }).last().click();
  await expect(page.getByText("Reverted: Added Lily's seat")).toBeVisible();
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

  await page.getByRole("button", { name: "Look at upgrades" }).click();
  await expect(page.getByText("Let's look at upgrades for Lily.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Look at upgrades" })).toBeHidden();
  await expect(page.getByText(/Spending 3 XP on/)).toBeVisible({ timeout: 15_000 });

  await box.fill("take seat:Lily toward a flex mystic");
  await box.press("Enter");
  await expect(page.getByText("Lily's deck: a flex mystic")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Apply" }).last().click();
  await expect(page.getByText("Applied.").last()).toBeVisible();

  await box.fill("What is in seat:Lily?");
  await box.press("Enter");
  await expect(page.getByText(/Boom Chakra Lacka/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "See the campaign" }).first().click();
  await expect(page.getByText("Lily: +3 XP")).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: /^3$/ })).toBeVisible();
  await expect(page.getByLabel("Where Lily's deck is going")).toHaveValue("a flex mystic");
});
