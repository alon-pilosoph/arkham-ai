//   npx tsx evals/run.ts --model anthropic:claude-opus-5-5 --max-usd 3 [--cases id,id] [--tpm 180000] [--effort high]
// Writes one transcript per case to evals/results/<model>/ for a person to read; grades nothing.
// Stops before a case once spend reaches --max-usd; --tpm paces calls to a tokens-per-minute limit.

import fs from "node:fs";
import path from "node:path";
import { type LanguageModel, type LanguageModelMiddleware, type LanguageModelUsage, type UIMessage, wrapLanguageModel } from "ai";
import { BUDGET, runAgent, toModelMessages } from "@/lib/agent";
import { errorMessage } from "@/lib/format";
import { languageModel, modelSpec } from "@/lib/model";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { CASES } from "./cases";

// USD per million tokens. cacheWrite is Anthropic's 1-hour write rate, and OpenAI's full input price.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "anthropic:claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 },
  // an estimate; the transcripts keep token counts to reprice
  "anthropic:claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 6 },
  "openai:gpt-6-sol": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2 },
  "openai:gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.1 },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function cost(model: string, u: LanguageModelUsage): number {
  const p = PRICES[model];
  const d = u.inputTokenDetails;
  const cacheRead = d?.cacheReadTokens ?? 0;
  const cacheWrite = d?.cacheWriteTokens ?? 0;
  const fresh = d?.noCacheTokens ?? Math.max(0, (u.inputTokens ?? 0) - cacheRead - cacheWrite);
  return (fresh * p.input + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite + (u.outputTokens ?? 0) * p.output) / 1e6;
}

// Waits until the last minute's tokens plus this call's (estimated as the last call's input) fit under tpm.
function paced(model: LanguageModel, tpm: number): LanguageModel {
  const log: { at: number; tokens: number }[] = [];
  let last = 0;
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v4",
    wrapStream: async ({ doStream }) => {
      for (;;) {
        const now = Date.now();
        while (log.length && now - log[0].at > 60_000) log.shift();
        if (!log.length || log.reduce((n, e) => n + e.tokens, 0) + last <= tpm) break;
        await new Promise((r) => setTimeout(r, log[0].at + 60_050 - now));
      }
      const result = await doStream();
      const stream = result.stream.pipeThrough(
        new TransformStream({
          transform(chunk, c) {
            if (chunk.type === "finish") {
              last = chunk.usage.inputTokens.total ?? last;
              // the provider counts output against the limit too
              log.push({ at: Date.now(), tokens: last + (chunk.usage.outputTokens.total ?? 0) });
            }
            c.enqueue(chunk);
          },
        }),
      );
      return { ...result, stream };
    },
  };
  return wrapLanguageModel({ model: model as Exclude<LanguageModel, string>, middleware });
}

async function main(): Promise<number> {
  const model = arg("model");
  const maxUsd = Number(arg("max-usd") ?? "1");
  if (!model || !PRICES[model]) {
    console.error(`--model must be one of ${Object.keys(PRICES).join(", ")}`);
    return 1;
  }
  if (!Number.isFinite(maxUsd) || maxUsd < 0) {
    console.error(`--max-usd must be a number of dollars, got "${arg("max-usd")}"`);
    return 1;
  }
  const only = arg("cases")?.split(",");
  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  const effort = arg("effort");
  const spec = modelSpec({ ...process.env, ARKHAM_MODEL: model, ...(effort ? { ARKHAM_EFFORT: effort } : {}) });
  const tpm = Number(arg("tpm") ?? "0");
  // one pacer for the whole run, so it sees every call in the last minute
  const base = await languageModel(spec);
  const llm = tpm ? paced(base, tpm) : base;
  const outDir = path.join(
    arg("out") ?? path.join("evals", "results"),
    `${model.replace(/[:/]/g, "_")}${effort ? `@${effort}` : ""}`,
  );
  fs.mkdirSync(outDir, { recursive: true });

  let spent = 0;
  for (const c of cases) {
    if (spent >= maxUsd) {
      console.log(`budget reached ($${spent.toFixed(3)}), stopping before ${c.id}`);
      break;
    }
    const settings = { ...DEFAULT_SETTINGS, ...c.settings };
    const started = Date.now();
    const history: UIMessage[] = [];
    const turns = [];
    let usd = 0;
    for (const [i, question] of [c.question, ...(c.followUps ?? [])].entries()) {
      history.push({ id: `u${i}`, role: "user", parts: [{ type: "text", text: question }] });
      const messages = await toModelMessages(history, settings);
      let timedOut = false;
      const result = runAgent({
        model: llm,
        messages,
        settings,
        onDeadline: () => {
          timedOut = true;
        },
      });
      let error: string | undefined;
      await result.consumeStream({
        onError: (e) => {
          error = errorMessage(e);
        },
      });
      // these reject too when the stream failed; onError already recorded it
      const [steps, text, usage] = await Promise.all([result.steps, result.text, result.totalUsage]).catch(
        () => [[], "", undefined] as const,
      );
      if (timedOut) error ??= `ran out of time at the ${BUDGET.deadlineMs / 1000}s deadline`;
      if (usage) usd += cost(model, usage);
      history.push({ id: `a${i}`, role: "assistant", parts: [{ type: "text", text }] });
      turns.push({
        question,
        usage,
        steps: steps.map((s) => ({
          toolCalls: s.toolCalls.map((t) => ({ tool: t.toolName, input: t.input })),
          toolResults: s.toolResults.map((t) => ({ tool: t.toolName, output: t.output })),
          text: s.text,
          usage: s.usage,
        })),
        answer: text,
        ...(error ? { error } : {}),
      });
      if (error) break;
    }
    spent += usd;
    const record = {
      id: c.id,
      model,
      settings,
      expect: c.expect,
      seconds: (Date.now() - started) / 1000,
      usd,
      turns,
    };
    fs.writeFileSync(path.join(outDir, `${c.id}.json`), `${JSON.stringify(record, null, 1)}\n`);
    const tools = turns.map((t) => t.steps.flatMap((s) => s.toolCalls.map((x) => x.tool)).join(", ") || "none").join(" | ");
    const failed = turns.find((t) => "error" in t);
    console.log(
      `${c.id}: ${record.seconds.toFixed(1)}s, $${usd.toFixed(4)}, tools ${tools}${failed ? `, ERROR ${failed.error}` : ""}`,
    );
  }
  console.log(`total $${spent.toFixed(3)} -> ${outDir}`);
  return 0;
}

process.exitCode = await main();
