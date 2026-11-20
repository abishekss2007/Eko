import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "saanssafe.theme";

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** The saved choice, else the system setting. */
export function initialTheme(): Theme {
  return stored() ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

const listeners = new Set<() => void>();

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#020617" : "#f8fafc");
  listeners.forEach((notify) => notify());
}

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function toggleTheme(): void {
  const next: Theme = current() === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/** Every toggle on the page shares one theme, kept on <html data-theme>. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "light");
}

/** A switch-style button; the label says what it is, aria-pressed says whether dark mode is on. */
export function ThemeToggle({ className = "btn-ghost" }: { className?: string }) {
  const dark = useTheme() === "dark";
  return (
    <button type="button" className={`${className} !px-3`} aria-pressed={dark} onClick={toggleTheme} title="Dark mode">
      {dark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
      <span className="sr-only">Dark mode</span>
    </button>
  );
}
