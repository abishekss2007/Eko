import { Clock, Home, ShieldCheck, Sun } from "lucide-react";
import { pretty } from "../lib/format";
import { untokenize, type Member } from "../lib/household";
import type { PlanResponse } from "../types";
import { ReadAloudButton } from "./ReadAloudButton";

const STANCE = {
  stay_in: { label: "Stay in", className: "bg-gradient-to-br from-[#991b1b] to-[#881337] text-snow shadow-lg shadow-black/20", Icon: Home },
  limit: { label: "Limit time outside", className: "bg-gradient-to-br from-orange-100 to-amber-50 text-orange-950 ring-1 ring-orange-200", Icon: Clock },
  normal: { label: "Normal day", className: "bg-gradient-to-br from-green-100 to-emerald-50 text-green-950 ring-1 ring-green-200", Icon: Sun },
} as const;

/** The hero card: one decision for the family today, decided by code, phrased by Gemini. */
export function TodayPlan({ data, members, loading }: { data: PlanResponse | null; members: Member[]; loading: boolean }) {
  if (!data) {
    return <div aria-busy={loading} className="space-y-3">
        <p>{loading ? "Working out today's plan…" : "Choose a location to see today's plan."}</p>
        {loading && (
          <div aria-hidden="true" className="space-y-2">
            <div className="h-7 w-3/4 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          </div>
        )}
      </div>;
  }
  const { plan, narrative } = data;
  const stance = STANCE[plan.stance];
  const show = (text: string) => pretty(untokenize(text, members));
  const spoken = [narrative.headline, ...narrative.steps].map(show).join(". ");

  return (
    <div className={`rounded-3xl p-5 sm:p-6 ${stance.className}`}>
      <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-snow/95 px-3 py-1 text-sm font-bold text-ink-900">
        <stance.Icon aria-hidden="true" size={16} /> {stance.label}
      </p>
      <p className="mb-4 text-2xl font-extrabold leading-snug sm:text-3xl">{show(narrative.headline)}</p>
      <ol className="mb-5 space-y-2 text-lg">
        {narrative.steps.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span aria-hidden="true" className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ring-1 ring-current">
              {i + 1}
            </span>
            <span>{show(step)}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <ReadAloudButton text={spoken} label="Read plan aloud" />
        <p className="flex items-center gap-1 text-sm">
          <ShieldCheck aria-hidden="true" size={16} />
          {data.narrative_source === "gemini"
            ? "Decided by our rules, worded by Gemini, numbers checked."
            : "Decided and worded by our rules."}
        </p>
      </div>
    </div>
  );
}
