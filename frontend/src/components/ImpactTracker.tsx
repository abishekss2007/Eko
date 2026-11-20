import { Leaf, Plus, Trash2 } from "lucide-react";
import { fmt } from "../lib/format";
import { HABITS, totals, today, type ImpactEntry } from "../lib/impact";

interface Props {
  entries: ImpactEntry[];
  onChange: (entries: ImpactEntry[]) => void;
}

export function ImpactTracker({ entries, onChange }: Props) {
  const sum = totals(entries);
  const add = (label: string) =>
    onChange([...entries, { id: crypto.randomUUID(), date: today(), label, dose_ug: 0, co2_kg: 0 }]);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["PM2.5 avoided", `${fmt(sum.dose_ug, 1)} µg`],
          ["CO₂ saved", `${fmt(sum.co2_kg, 2)} kg`],
          ["Clean-air actions", String(sum.actions)],
          ["Active days", String(sum.days)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-emerald-700 bg-emerald-50 p-3 text-emerald-950">
            <dt className="text-sm">{label}</dt>
            <dd className="text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-slate-700">
        µg and kg come from commutes you log in the commute planner. Habits are counted, not converted into numbers we
        can&apos;t measure. Saved only in this browser.
      </p>
      <div role="group" aria-label="Log a clean-air habit for today" className="flex flex-wrap gap-2">
        {HABITS.map((h) => (
          <button key={h} type="button" className="chip" onClick={() => add(h)}>
            <Plus aria-hidden="true" size={16} /> {h}
          </button>
        ))}
      </div>
      {entries.length > 0 && (
        <>
          <h3 className="flex items-center gap-2 font-bold">
            <Leaf aria-hidden="true" size={18} /> Recent actions
          </h3>
          <ul className="divide-y divide-slate-200">
            {entries
              .slice(-8)
              .reverse()
              .map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="text-sm text-slate-700">{e.date}</span> · {e.label}
                    {e.dose_ug > 0 && ` · ${fmt(e.dose_ug, 1)} µg avoided, ${fmt(e.co2_kg, 2)} kg CO₂ saved`}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label={`Remove ${e.label} on ${e.date}`}
                    onClick={() => onChange(entries.filter((x) => x.id !== e.id))}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
