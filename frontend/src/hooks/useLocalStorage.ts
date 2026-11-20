import { useEffect, useState } from "react";

/** State mirrored to localStorage. `parse` validates whatever was stored (it is untrusted). */
export function useLocalStorage<T>(key: string, parse: (raw: unknown) => T, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : parse(JSON.parse(raw));
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or disabled (private mode): keep working in memory.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
