// ArkhamDB is volunteer-run: requests are spaced (one a second by default) and only transient
// failures are retried.

import { ARKHAMDB, type Fetched, missingJson } from "@/lib/arkhamdb";

const USER_AGENT = "arkham-ai/0.1 (+https://github.com/alon-pilosoph/arkham-ai; offline pipeline, one request a second)";
const TIMEOUT_MS = 60_000;
// a crawl runs for hours: ride out a network blip rather than lose the run to it
const RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000];

let nextSlot = 0;

async function waitTurn(intervalMs: number): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + intervalMs;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

export type GetOptions = { intervalMs?: number };

export async function getText(pathOrUrl: string, { intervalMs = 1_000 }: GetOptions = {}): Promise<Fetched<string>> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : ARKHAMDB + pathOrUrl;
  let failure = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    await waitTurn(intervalMs);
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 404) return { ok: false, status: "not_found", message: `${url} returned 404` };
      if (res.ok) return { ok: true, data: await res.text() };
      failure = `${url} returned ${res.status}`;
      if (!isTransient(res.status)) break;
    } catch (e) {
      failure = `${url} failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { ok: false, status: "error", message: failure };
}

// ArkhamDB answers some missing ids with 200 and an HTML page, so a non-JSON body is not_found.
export async function getJsonText<T>(pathOrUrl: string, options?: GetOptions): Promise<Fetched<T>> {
  const res = await getText(pathOrUrl, options);
  if (!res.ok) return res;
  if (missingJson(res.data)) return { ok: false, status: "not_found", message: `${pathOrUrl} returned no JSON` };
  return { ok: true, data: JSON.parse(res.data) as T };
}
