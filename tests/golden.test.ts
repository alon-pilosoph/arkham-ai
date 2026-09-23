// Prompt text the model reads on every call is pinned, so changing it must be deliberate:
//   UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { asSchema } from "ai";
import { expect, test } from "vitest";
import { GUIDANCE, SYSTEM_PROMPT } from "@/lib/prompt";
import { tools } from "@/lib/tools";

const DIR = path.join(import.meta.dirname, "golden");

function pinned(file: string, actual: string) {
  const f = path.join(DIR, file);
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(f, actual);
  expect(fs.existsSync(f), `${file} is missing; write it with UPDATE_GOLDEN=1`).toBe(true);
  expect(actual).toBe(fs.readFileSync(f, "utf8"));
}

test("tool definitions are pinned", async () => {
  const defs: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    defs[name] = {
      description: t.description,
      inputSchema: await asSchema(t.inputSchema as Parameters<typeof asSchema>[0]).jsonSchema,
    };
  }
  pinned("tools.json", `${JSON.stringify(defs, null, 2)}\n`);
});

test("the guidance is pinned byte for byte", () => {
  pinned("guidance.txt", `${GUIDANCE}\n`);
});

// By hash, since it includes data/rules.md; the guidance pin above shows readable diffs.
test("the whole system prompt is pinned by hash", () => {
  pinned("system-prompt.sha256", `${createHash("sha256").update(SYSTEM_PROMPT).digest("hex")}\n`);
});
