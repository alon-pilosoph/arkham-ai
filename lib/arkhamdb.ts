import { currentSignal, OUT_OF_TIME } from "./deadline";
import { errorMessage } from "./format";
import { ARKHAMDB } from "./urls";

export { ARKHAMDB };

const UA = "arkham-ai/0.1 (+https://github.com/alon-pilosoph/arkham-ai)";

export type Fetched<T> = { ok: true; data: T } | { ok: false; status: "not_found" | "error"; message: string };

/** ArkhamDB answers some missing ids with 200 and an empty or HTML body. */
export function missingJson(text: string): boolean {
  const t = text.trimStart();
  return !t || t.startsWith("<");
}

export async function getJson<T>(path: string, timeoutMs = 20_000, signal = currentSignal()): Promise<Fetched<T>> {
  const url = path.startsWith("http") ? path : ARKHAMDB + path;
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });
    if (res.status === 404) return { ok: false, status: "not_found", message: `${url} returned 404` };
    if (!res.ok) return { ok: false, status: "error", message: `${url} returned ${res.status}` };
    const text = await res.text();
    if (missingJson(text)) return { ok: false, status: "not_found", message: `${url} returned no JSON` };
    return { ok: true, data: JSON.parse(text) as T };
  } catch (e) {
    const why = signal?.aborted && !timeout.aborted ? OUT_OF_TIME : errorMessage(e);
    return { ok: false, status: "error", message: `${url} failed: ${why}` };
  }
}
