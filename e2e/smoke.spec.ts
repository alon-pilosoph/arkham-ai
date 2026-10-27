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

test("the taboo switch is remembered across a reload", async ({ page }) => {
  const taboo = page.getByRole("switch", { name: /taboo/i });
  await expect(taboo).not.toBeChecked();
  await taboo.click();
  await expect(taboo).toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: /taboo/i })).toBeChecked();
});
