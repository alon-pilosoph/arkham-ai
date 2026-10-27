// ArkhamDB is volunteer-run: requests are spaced (one every two seconds by default), slow answers
// slow the crawl down further, a Retry-After is honored, only transient failures are retried, and
// a run stops at its request budget rather than run on.

import { ARKHAMDB, type Fetched, missingJson } from "@/lib/arkhamdb";

const USER_AGENT = "arkham-ai/0.1 (+https://github.com/alon-pilosoph/arkham-ai; offline pipeline, one request every two seconds)";

export type HttpConfig = {
  base: string;
  intervalMs: number;
  timeoutMs: number;
  /** A crawl runs for minutes to hours: ride out a network blip rather than lose the run to it. */
  retryDelaysMs: number[];
  /** A slow answer means ArkhamDB is busy: the next request waits slowFactor times as long as that
   *  answer took, up to maxBackoffMs, on top of the usual interval. */
  slowMs: number;
  slowFactor: number;
  maxBackoffMs: number;
  /** A Retry-After longer than this gives up on the request instead of waiting. */
  maxRetryAfterMs: number;
  /** Requests a run may make, retries included; the next one throws BudgetExceeded. */
  budget: number;
};

const DEFAULTS: HttpConfig = {
  base: ARKHAMDB,
  intervalMs: 2_000,
  timeoutMs: 60_000,
  retryDelaysMs: [3_000, 10_000, 30_000, 60_000],
  slowMs: 3_000,
  slowFactor: 10,
  maxBackoffMs: 120_000,
  maxRetryAfterMs: 600_000,
  budget: Number.POSITIVE_INFINITY,
};

export type HttpStats = { requests: number; retries: number; slowAnswers: number; retryAfterWaits: number };

let config: HttpConfig = DEFAULTS;
let stats: HttpStats = { requests: 0, retries: 0, slowAnswers: 0, retryAfterWaits: 0 };
let nextSlot = 0;

export function configureHttp(changes: Partial<HttpConfig>): void {
  config = { ...config, ...changes };
}

/** Back to the defaults, with the counters at zero: for tests. */
export function resetHttp(): void {
  config = DEFAULTS;
  stats = { requests: 0, retries: 0, slowAnswers: 0, retryAfterWaits: 0 };
  nextSlot = 0;
}

export function httpStats(): HttpStats {
  return { ...stats };
}

export class BudgetExceeded extends Error {
  override name = "BudgetExceeded";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function backOff(tookMs: number): void {
  if (tookMs <= config.slowMs) return;
  stats.slowAnswers++;
  nextSlot = Math.max(nextSlot, Date.now() + Math.min(config.maxBackoffMs, tookMs * config.slowFactor));
}

async function waitTurn(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + config.intervalMs;
  if (at > now) await sleep(at - now);
}

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Retry-After in seconds or as an HTTP date, in milliseconds; null when absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export async function getText(pathOrUrl: string): Promise<Fetched<string>> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : config.base + pathOrUrl;
  let failure = "";
  let wait = 0;
  for (let attempt = 0; attempt <= config.retryDelaysMs.length; attempt++) {
    if (attempt > 0) {
      stats.retries++;
      await sleep(Math.max(wait, config.retryDelaysMs[attempt - 1]));
    }
    if (stats.requests >= config.budget) throw new BudgetExceeded(`the run's budget of ${config.budget} requests is spent`);
    await waitTurn();
    stats.requests++;
    wait = 0;
    try {
      const started = Date.now();
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(config.timeoutMs) });
      const body = await res.text();
      backOff(Date.now() - started);
      if (res.status === 404) return { ok: false, status: "not_found", message: `${url} returned 404` };
      if (res.ok) return { ok: true, data: body };
      failure = `${url} returned ${res.status}`;
      if (!isTransient(res.status)) break;
      const asked = retryAfterMs(res.headers.get("retry-after"));
      if (asked !== null) {
        if (asked > config.maxRetryAfterMs) {
          failure += ` and asked to wait ${Math.round(asked / 1000)} s`;
          break;
        }
        stats.retryAfterWaits++;
        wait = asked;
      }
    } catch (e) {
      failure = `${url} failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { ok: false, status: "error", message: failure };
}

// ArkhamDB answers some missing ids with 200 and an HTML page, so a non-JSON body is not_found.
export async function getJsonText<T>(pathOrUrl: string): Promise<Fetched<T>> {
  const res = await getText(pathOrUrl);
  if (!res.ok) return res;
  if (missingJson(res.data)) return { ok: false, status: "not_found", message: `${pathOrUrl} returned no JSON` };
  return { ok: true, data: JSON.parse(res.data) as T };
}
