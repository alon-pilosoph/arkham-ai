import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // the card data the index was built from, written by npm run data:index
    env: {
      ARKHAM_CARDS_FILE: path.resolve(import.meta.dirname, "tests/fixtures/cards.json.gz"),
      ARKHAM_TABOOS_FILE: path.resolve(import.meta.dirname, "tests/fixtures/taboos.json"),
    },
    testTimeout: 30_000,
  },
});
