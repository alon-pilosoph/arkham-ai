import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { getJson } from "./arkhamdb";
import { detached, untilAborted } from "./deadline";

// A stale copy is served while it refreshes, and a failed refresh keeps serving the last copy
// (memory, or a stale disk copy) and waits RETRY_MS before asking ArkhamDB again.
export const TTL_MS = 24 * 3600 * 1000;
export const RETRY_MS = 60_000;

export type LoaderOptions<Raw, T> = {
  what: string;
  envVar: string;
  file: string;
  path: string;
  timeoutMs?: number;
  parse: (raw: Raw) => T;
};

type Loaded<T> = { value: T; at: number; error?: Error };

function readJson<Raw>(file: string): Raw {
  const bytes = fs.readFileSync(file);
  return JSON.parse((file.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8"));
}

function mtime(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

export function cachedLoader<Raw, T>(o: LoaderOptions<Raw, T>): () => Promise<T> {
  let loaded: Loaded<T> | null = null;
  let inflight: Promise<T> | null = null;
  let failedAt = Number.NEGATIVE_INFINITY;
  let lastError: Error | null = null;

  async function load(): Promise<Loaded<T>> {
    const pinned = process.env[o.envVar];
    if (pinned) return { value: o.parse(readJson<Raw>(pinned)), at: Date.now() };
    const diskAt = mtime(o.file);
    if (diskAt !== undefined && Date.now() - diskAt < TTL_MS) return { value: o.parse(readJson<Raw>(o.file)), at: diskAt };
    const res = await detached(() => getJson<Raw>(o.path, o.timeoutMs));
    if (res.ok) {
      try {
        fs.mkdirSync(path.dirname(o.file), { recursive: true });
        // Renamed into place, so a process killed mid-write never leaves half a file to read as fresh.
        fs.writeFileSync(`${o.file}.tmp`, JSON.stringify(res.data));
        fs.renameSync(`${o.file}.tmp`, o.file);
      } catch {
        // Read-only filesystem on serverless: keep it in memory only.
      }
      return { value: o.parse(res.data), at: Date.now() };
    }
    const error = new Error(`could not load ${o.what}: ${res.message}`);
    // Keeps the stale timestamp, so the next call retries once RETRY_MS has passed.
    if (!loaded && diskAt !== undefined) return { value: o.parse(readJson<Raw>(o.file)), at: diskAt, error };
    throw error;
  }

  function failed(error: Error) {
    if (!lastError)
      console.warn(`${error.message} (${loaded ? "serving the last copy; " : ""}retrying after ${RETRY_MS / 1000}s)`);
    lastError = error;
    failedAt = Date.now();
  }

  return function get(): Promise<T> {
    if (loaded && Date.now() - loaded.at < TTL_MS) return Promise.resolve(loaded.value);
    if (!inflight && Date.now() - failedAt >= RETRY_MS) {
      const run = load().then(
        (l) => {
          loaded = l;
          if (l.error) failed(l.error);
          else lastError = null;
          return l.value;
        },
        (e: Error) => {
          failed(e);
          throw e;
        },
      );
      inflight = run.finally(() => {
        inflight = null;
      });
    }
    if (loaded) {
      inflight?.catch(() => {});
      return Promise.resolve(loaded.value);
    }
    if (inflight) return untilAborted(inflight);
    return Promise.reject(lastError);
  };
}
