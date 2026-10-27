import { expect, type Page, test } from "@playwright/test";

const ANSWERED = "This is the local stand-in";

async function ask(page: Page, question: string) {
  const box = page.getByRole("textbox", { name: "Message input" });
  await box.fill(question);
  await box.press("Enter");
  await expect(page.getByText(ANSWERED)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the welcome screen offers example questions", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "What are you playing tonight?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /A rules question/ })).toBeVisible();
});

test("a card lookup shows every level of the card", async ({ page }) => {
  await ask(page, "What does Ward of Protection do?");
  const card = page.locator("[data-slot=tool-fallback-trigger]").filter({ hasText: "Ward of Protection" });
  await expect(card).toContainText("3 versions");
  await card.click();
  await expect(page.getByRole("link", { name: "Ward of Protection (5)" })).toBeVisible();
});

test("a card link opens the card in a dialog, not a new tab", async ({ page }) => {
  await ask(page, "What does Shrivelling do?");
  await page.locator("[data-slot=tool-fallback-trigger]").filter({ hasText: "Shrivelling" }).click();
  await page.getByRole("link", { name: "Shrivelling (3)" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Shrivelling/ })).toBeVisible();
  await expect(dialog).toContainText("Uses (4 charges)");
  await dialog.getByRole("link", { name: "Level 5" }).click();
  await expect(dialog).toContainText("Uses (4 charges)");
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByRole("link", { name: "Level 3" })).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(page.context().pages()).toHaveLength(1);
});

test("a deck search shortlists indexed decks that link to ArkhamDB", async ({ page }) => {
  await ask(page, "Suggest a mystic cluever deck.");
  await expect(page.locator("[data-slot=tool-fallback-trigger]").filter({ hasText: "Deck shortlist" })).toBeVisible();
  const decks = page.locator('a[href*="arkhamdb.com/decklist/view/"]');
  await expect(decks.first()).toBeVisible();
  expect(await decks.count()).toBeGreaterThan(1);
});

test("a deck named instead of linked is looked up by name", async ({ page }) => {
  await ask(page, "How do I play the Boom Chakra Lacka deck?");
  const found = page.locator("[data-slot=tool-fallback-trigger]").filter({ hasText: "Boom Chakra Lacka" });
  await found.click();
  await expect(page.getByText("Lily - Boom Chakra Lacka (Deck Guide)")).toBeVisible();
});

test("a deck slot says so when what was pasted isn't a deck link", async ({ page }) => {
  await page.getByRole("button", { name: "Your decks" }).click();
  await page.getByLabel("Your deck", { exact: true }).fill("my lily deck");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("That isn't an ArkhamDB deck link.")).toBeVisible();
});

test("campaign prep sizes up a campaign without naming its cards", async ({ page }) => {
  await ask(page, "How should we prepare for The Path to Carcosa?");
  const prep = page.locator("[data-slot=tool-fallback-trigger]").filter({ hasText: "What The Path to Carcosa asks of you" });
  await expect(prep).toContainText("Spoiler-light");
  await prep.click();
  await expect(page.getByText("By scenario")).toBeVisible();
});

test("a deck saved in a slot shows by investigator and name, and is remembered", async ({ page }) => {
  await page.getByRole("button", { name: "Your decks" }).click();
  await page.getByLabel("Your deck", { exact: true }).fill("https://arkhamdb.com/decklist/view/33170/lily");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Lily - Boom Chakra Lacka (Deck Guide)")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Your decks" }).click();
  await expect(page.getByText("Lily - Boom Chakra Lacka (Deck Guide)")).toBeVisible();
});

test("the XP advisor prices what a deck can buy", async ({ page }) => {
  await ask(page, "I have 5 XP for https://arkhamdb.com/decklist/view/33170. What should I buy?");
  await page.getByText("Spending 5 XP on Lily Chen's deck").click();
  await expect(page.getByText("Upgrades", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Safeguard (2)" })).toBeVisible();
});

test("the taboo switch is remembered across a reload", async ({ page }) => {
  const taboo = page.getByRole("switch", { name: /taboo/i });
  await expect(taboo).not.toBeChecked();
  await taboo.click();
  await expect(taboo).toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: /taboo/i })).toBeChecked();
});
