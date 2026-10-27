import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { OUTBOX, OWNER, SIGNED_IN } from "../playwright.config";
import { signIn } from "./outbox";

setup("the owner signs in with an email link", async ({ page }) => {
  fs.rmSync(OUTBOX, { force: true });
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, OWNER);
  fs.mkdirSync(path.dirname(SIGNED_IN), { recursive: true });
  await page.context().storageState({ path: SIGNED_IN });
});
