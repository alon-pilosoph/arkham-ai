import type { Fetched } from "./arkhamdb";

const MAX_TOOL_CHARS = 80_000;

export type Failure = { ok: false; kind: "not_found" | "error"; message: string };

export function notFound(message: string): Failure {
  return { ok: false, kind: "not_found", message };
}

export function toolError(message: string): Failure {
  return { ok: false, kind: "error", message };
}

export function fromFetched(f: Extract<Fetched<unknown>, { ok: false }>): Failure {
  return { ok: false, kind: f.status, message: f.message };
}

export function failureText(f: Failure): string {
  return `${f.kind === "not_found" ? "NOT FOUND" : "ERROR"}: ${f.message}`;
}

export async function safely<T>(work: () => Promise<T>): Promise<T | Failure> {
  try {
    return await work();
  } catch (e) {
    return toolError(errorMessage(e));
  }
}

export function toolText(text: string): { type: "text"; value: string } {
  if (text.length <= MAX_TOOL_CHARS) return { type: "text", value: text };
  return {
    type: "text",
    value: `${text.slice(0, MAX_TOOL_CHARS)}\n[CUT: this result hit the ${MAX_TOOL_CHARS}-character budget. Say that it was incomplete.]`,
  };
}

/** Escapes "<" rather than stripping tags: stripping "</untrusted_</untrusted_data>data>"
 *  would leave a working closing tag. */
export function untrusted(source: string, text: string): string {
  const safe = text.replaceAll("<", "‹");
  if (!safe.includes("\n")) return `<untrusted_data source="${source}">${safe}</untrusted_data>`;
  return `<untrusted_data source="${source}">\n${safe}\n</untrusted_data>`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
