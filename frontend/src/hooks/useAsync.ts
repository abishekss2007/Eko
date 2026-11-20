import { useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface Settled<T> {
  key: string | null;
  data: T | null;
  error: string | null;
}

/**
 * Runs `load` whenever `key` changes, aborting the previous request.
 * Pass `null` to skip. While a new key loads, the previous data stays visible.
 */
export function useAsync<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T>>({ key: null, data: null, error: null });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => setSettled({ key, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setSettled((s) => ({ key, data: s.data, error: message }));
      });
    return () => controller.abort();
    // `load` is keyed by `key` so callers can pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { data: null, error: null, loading: false };
  const current = settled.key === key;
  return { data: settled.data, error: current ? settled.error : null, loading: !current };
}
