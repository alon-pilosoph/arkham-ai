import { AsyncLocalStorage } from "node:async_hooks";

const current = new AsyncLocalStorage<AbortSignal>();

export const OUT_OF_TIME = "this answer ran out of time for tools";

export function withSignal<T>(signal: AbortSignal, fn: () => T): T {
  return current.run(signal, fn);
}

export function currentSignal(): AbortSignal | undefined {
  return current.getStore();
}

/** For shared work other requests wait on: the request that started it must not abort it. */
export function detached<T>(fn: () => T): T {
  return current.exit(fn);
}

export function untilAborted<T>(work: Promise<T>, signal = currentSignal()): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(new Error(OUT_OF_TIME));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error(OUT_OF_TIME));
    signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}
