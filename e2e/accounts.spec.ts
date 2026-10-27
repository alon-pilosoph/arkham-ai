import { expect, test } from "@playwright/test";
import { OWNER } from "../playwright.config";
import { signIn } from "./outbox";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the app sends a visitor to the sign-in page, which links the privacy page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByRole("link", { name: "Privacy" }).click();
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  });

  test("a stranger is told a link is coming, and the app stays closed to them", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("stranger@example.test");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("status")).toContainText("If stranger@example.test can sign in");
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a refused sign-in says the app is invite-only", async ({ page }) => {
    await page.goto("/sign-in?error=invite_only");
    await expect(page.getByRole("alert").filter({ hasText: "invite-only" })).toBeVisible();
  });
});

test.describe("a session of its own", () => {
  // signing out ends the session for every tab holding it, so not the shared one
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signing out ends the session", async ({ page }, info) => {
    // one project only: two runs signing the same account in at once would race for its link
    test.skip(info.project.name !== "desktop", "runs on desktop only");
    await signIn(page, OWNER);
    const signOut = page.getByRole("button", { name: /Sign out/ });
    await signOut.click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
