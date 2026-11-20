import type { ReactNode } from "react";

/** Label + control + optional hint, wired with ids for screen readers. */
export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-slate-700">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SourceNote({ source }: { source: "gemini" | "rules" }) {
  return (
    <p className="text-sm text-slate-700">
      {source === "gemini"
        ? "Calculated by our engines, explained by Gemini. Every number was checked."
        : "Calculated and explained by our rule-based engine."}
    </p>
  );
}
