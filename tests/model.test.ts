import { describe, expect, test } from "vitest";
import { modelSpec } from "@/lib/model";

function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...vars };
}

describe("modelSpec", () => {
  test("picks OpenAI when both keys are set", () => {
    expect(modelSpec(env({ OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "y" }))).toEqual({ provider: "openai", id: "gpt-6-sol" });
  });

  test("picks Anthropic when only its key is set", () => {
    expect(modelSpec(env({ ANTHROPIC_API_KEY: "y" }))).toEqual({ provider: "anthropic", id: "claude-opus-5-5" });
  });

  test("lets ARKHAM_MODEL override both keys", () => {
    expect(modelSpec(env({ ARKHAM_MODEL: "anthropic:claude-sonnet-5", OPENAI_API_KEY: "x" }))).toEqual({
      provider: "anthropic",
      id: "claude-sonnet-5",
    });
  });

  test("throws when there is no key and no override", () => {
    expect(() => modelSpec(env({}))).toThrow(/No model configured/);
  });

  test("takes ARKHAM_EFFORT when it is a known effort, and throws otherwise", () => {
    expect(modelSpec(env({ OPENAI_API_KEY: "x", ARKHAM_EFFORT: "max" })).effort).toBe("max");
    expect(() => modelSpec(env({ OPENAI_API_KEY: "x", ARKHAM_EFFORT: "extreme" }))).toThrow(/ARKHAM_EFFORT must be one of/);
  });
});
