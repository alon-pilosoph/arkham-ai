import { beforeEach, vi } from "vitest";
import { mockArkhamDB } from "./helpers";

// Every route test runs signed in, with questions to spare; tests/accounts.test.ts tests the real
// session check and the cap through vi.importActual.
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  currentUser: vi.fn(async () => ({ id: "test-user", email: "player@example.com", name: "Player" })),
}));
vi.mock("@/lib/question-cap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/question-cap")>()),
  takeQuestion: vi.fn(async () => true),
}));

beforeEach(() => {
  vi.unstubAllGlobals();
  mockArkhamDB();
});
