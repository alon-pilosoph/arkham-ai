import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const OWNER = "owner@example.test";
export const OUTBOX = path.resolve("test-results/outbox.jsonl");
export const SIGNED_IN = path.resolve("test-results/.auth/owner.json");

// The production build on the mock model (ARKHAM_MODEL=mock:local), reading the fixture
// card set, with a fresh in-memory database and sign-in links written to a file: no API key and
// no network needed. The setup project signs the owner in once; the others reuse the session.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /sign-in\.setup\.ts/, use: { channel: process.env.CI ? undefined : "chrome" } },
    // locally the installed Chrome; CI installs Playwright's Chromium
    {
      name: "desktop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome", storageState: SIGNED_IN },
    },
    {
      name: "phone",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome", storageState: SIGNED_IN },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      ARKHAM_MODEL: "mock:local",
      ARKHAM_CARDS_FILE: "tests/fixtures/cards.json.gz",
      ARKHAM_DECKS_DIR: "tests/fixtures",
      ARKHAM_TABOOS_FILE: "tests/fixtures/taboos.json",
      ARKHAM_DB_DIR: "memory://",
      ARKHAM_OUTBOX: OUTBOX,
      OWNER_EMAIL: OWNER,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-012345",
    },
  },
});
