import { Clock, Home, ShieldCheck, Sun } from "lucide-react";
import { pretty } from "../lib/format";
import { untokenize, type Member } from "../lib/household";
import type { PlanResponse } from "../types";
import { ReadAloudButton } from "./ReadAloudButton";

const STANCE = {
  stay_in: { label: "Stay in", className: "border-red-900 bg-red-900 text-white", Icon: Home },
  limit: { label: "Limit time outside", className: "border-orange-800 bg-orange-100 text-orange-950", Icon: Clock },
  normal: { label: "Normal day", className: "border-green-800 bg-green-100 text-green-950", Icon: Sun },
} as const;

/** The hero card: one decision for the family today, decided by code, phrased by Gemini. */
export function TodayPlan({ data, members, loading }: { data: PlanResponse | null; members: Member[]; loading: boolean }) {
  if (!data) {
    return <p aria-busy={loading}>{loading ? "Working out today's plan…" : "Choose a location to see today's plan."}</p>;
  }
  const { plan, narrative } = data;
  const stance = STANCE[plan.stance];
  const show = (text: string) => pretty(untokenize(text, members));
  const spoken = [narrative.headline, ...narrative.steps].map(show).join(". ");

  return (
    <div className={`rounded-2xl border-2 p-5 ${stance.className}`}>
      <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-slate-900">
        <stance.Icon aria-hidden="true" size={16} /> {stance.label}
      </p>
      <p className="mb-3 text-2xl font-extrabold leading-snug">{show(narrative.headline)}</p>
      <ol className="mb-4 list-decimal space-y-1 pl-6 text-lg">
        {narrative.steps.map((step) => (
          <li key={step}>{show(step)}</li>
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
