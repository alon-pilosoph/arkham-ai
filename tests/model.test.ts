import { describe, expect, test } from "vitest";
import { modelSpec } from "@/lib/model";

function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...vars };
}

describe("modelSpec", () => {
  test("openai wins when both keys are set", () => {
    expect(modelSpec(env({ OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "y" }))).toEqual({ provider: "openai", id: "gpt-6-sol" });
  });

  test("falls back to anthropic when only its key is set", () => {
    expect(modelSpec(env({ ANTHROPIC_API_KEY: "y" }))).toEqual({ provider: "anthropic", id: "claude-opus-5-5" });
  });

  test("ARKHAM_MODEL overrides both keys", () => {
    expect(modelSpec(env({ ARKHAM_MODEL: "anthropic:claude-sonnet-5", OPENAI_API_KEY: "x" }))).toEqual({
      provider: "anthropic",
      id: "claude-sonnet-5",
    });
  });

  test("no key and no override is an error", () => {
    expect(() => modelSpec(env({}))).toThrow(/No model configured/);
  });

  test("ARKHAM_EFFORT is validated", () => {
    expect(modelSpec(env({ OPENAI_API_KEY: "x", ARKHAM_EFFORT: "max" })).effort).toBe("max");
    expect(() => modelSpec(env({ OPENAI_API_KEY: "x", ARKHAM_EFFORT: "extreme" }))).toThrow(/ARKHAM_EFFORT must be one of/);
  });
});
