import { beforeEach, vi } from "vitest";
import { mockArkhamDB } from "./helpers";

beforeEach(() => {
  vi.unstubAllGlobals();
  mockArkhamDB();
});
