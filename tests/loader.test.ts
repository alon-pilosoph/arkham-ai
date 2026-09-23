import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OUT_OF_TIME, withSignal } from "@/lib/deadline";
import { cachedLoader, RETRY_MS, TTL_MS } from "@/lib/loader";

let dir: string;
let calls: number;
let up: boolean;
let warn: ReturnType<typeof vi.spyOn>;

function loader() {
  return cachedLoader<{ v: number }, number>({
    what: "the test set",
    envVar: "ARKHAM_TEST_UNSET_FILE",
    file: path.join(dir, "set.json"),
    path: "/api/public/test/",
    parse: (raw) => raw.v,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "arkham-loader-"));
  calls = 0;
  up = true;
  // the clock starts now, so the disk copy's real mtime lines up with it
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
  vi.stubGlobal("fetch", async () => {
    calls++;
    if (!up) return new Response("down", { status: 503 });
    return new Response(JSON.stringify({ v: calls }), { status: 200 });
  });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
const settle = () => new Promise((r) => setImmediate(r));

describe("the cached loader", () => {
  test("concurrent first loads share one fetch, and the copy is kept on disk", async () => {
    const get = loader();
    expect(await Promise.all([get(), get(), get()])).toEqual([1, 1, 1]);
    expect(calls).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "set.json"), "utf8"))).toEqual({ v: 1 });
  });

  test("a failed refresh serves the last copy, logs once, and waits a minute to retry", async () => {
    const get = loader();
    expect(await get()).toBe(1);
    up = false;
    later(TTL_MS + 1_000);
    // stale: served at once, refreshed behind it
    expect(await get()).toBe(1);
    await settle();
    expect(calls).toBe(2);
    expect(await get()).toBe(1);
    await settle();
    expect(calls).toBe(2);
    later(RETRY_MS);
    expect(await get()).toBe(1);
    await settle();
    expect(calls).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/could not load the test set.*503.*serving the last copy/);
    up = true;
    later(RETRY_MS);
    await get();
    await settle();
    expect(await get()).toBe(4);
  });

  test("after a restart with ArkhamDB down, a stale disk copy is served", async () => {
    fs.writeFileSync(path.join(dir, "set.json"), JSON.stringify({ v: 7 }));
    later(TTL_MS + 1_000);
    up = false;
    expect(await loader()()).toBe(7);
    expect(calls).toBe(1);
  });

  test("with nothing to serve, a failure is an error, and it is not retried for a minute", async () => {
    up = false;
    const get = loader();
    await expect(get()).rejects.toThrow(/could not load the test set/);
    await expect(get()).rejects.toThrow(/could not load the test set/);
    expect(calls).toBe(1);
    later(RETRY_MS);
    up = true;
    expect(await get()).toBe(2);
  });

  test("a first load is waited for no longer than the request's time for tools", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const out = new AbortController();
    const waiting = withSignal(out.signal, () => loader()());
    out.abort();
    await expect(waiting).rejects.toThrow(OUT_OF_TIME);
  });
});
