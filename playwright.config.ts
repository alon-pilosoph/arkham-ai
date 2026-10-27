import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// The production build on the mock model (ARKHAM_MODEL=mock:local), reading the fixture
// card set: no API key and no network needed.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    // locally the installed Chrome; CI installs Playwright's Chromium
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" } },
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
      NEXT_PUBLIC_ASSISTANT_BASE_URL: "",
    },
  },
});
