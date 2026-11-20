import { CheckCircle2, TrainFront } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { fetchCommute } from "../lib/api";
import { fmt, pretty } from "../lib/format";
import type { CommuteRequest, CommuteResponse, Mode } from "../types";
import { Field, SourceNote } from "./Field";
import { HowWeCalculate } from "./HowWeCalculate";
import { ReadAloudButton } from "./ReadAloudButton";

export const MODE_LABELS: Record<Mode, string> = {
  car_petrol_solo: "Petrol car (alone)",
  two_wheeler: "Two-wheeler",
  auto_rickshaw: "Auto-rickshaw",
  bus: "Bus",
  metro: "Metro",
  carpool: "Carpool",
  walk: "Walk",
  cycle: "Cycle",
};

type Form = Pick<CommuteRequest, "distance_km" | "current_mode" | "departure" | "flexible"> & { duration_min: string };
export const DEMO_COMMUTE: Form = { distance_km: 12, current_mode: "car_petrol_solo", departure: "09:00", flexible: true, duration_min: "" };

interface Props {
  context: Pick<CommuteRequest, "latitude" | "longitude" | "simulate" | "language">;
  onLog: (entry: { label: string; dose_ug: number; co2_kg: number }) => void;
  /** Changing this number fills the demo trip and runs it (guided demo). */
  demoRun?: number;
}

export function CommutePlanner({ context, onLog, demoRun = 0 }: Props) {
  const [form, setForm] = useState<Form>({ ...DEMO_COMMUTE, current_mode: "two_wheeler", distance_km: 8 });
  const [result, setResult] = useState<CommuteResponse | null>(null);
  const [status, setStatus] = useState("");
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const request = (values: Form): CommuteRequest => {
    const duration = Number(values.duration_min);
    return {
      ...context,
      distance_km: values.distance_km,
      current_mode: values.current_mode,
      departure: values.departure,
      flexible: values.flexible,
      duration_min: duration > 0 ? duration : null,
    };
  };
  const finish = (promise: Promise<CommuteResponse>) =>
    promise.then(
      (data) => {
        setResult(data);
        setStatus("Commute comparison ready.");
      },
      (err: unknown) => setStatus(err instanceof Error ? err.message : "Could not compare commutes."),
    );

  // Guided demo: when the counter changes, show the demo trip in the form and run it.
  const [seenDemo, setSeenDemo] = useState(0);
  if (demoRun !== seenDemo) {
    setSeenDemo(demoRun);
    setForm(DEMO_COMMUTE);
  }
  useEffect(() => {
    if (demoRun > 0) void finish(fetchCommute(request(DEMO_COMMUTE)));
    // Only the demo counter should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoRun]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setStatus("Comparing ways to travel…");
    void finish(fetchCommute(request(form)));
  };

  const plan = result?.plan;
  const rec = plan?.recommended;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="distance" label="One-way distance (km)">
            <input id="distance" type="number" className="input" min={0.5} max={100} step={0.5} required value={form.distance_km} onChange={(e) => set("distance_km", Number(e.target.value))} />
          </Field>
          <Field id="mode" label="How you travel now">
            <select id="mode" className="input" value={form.current_mode} onChange={(e) => set("current_mode", e.target.value as Mode)}>
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="departure" label="Usual departure time">
            <input id="departure" type="time" className="input" required value={form.departure} onChange={(e) => set("departure", e.target.value)} />
          </Field>
          <Field id="duration" label="Trip time in minutes (optional)">
            <input id="duration" type="number" className="input" min={1} max={300} value={form.duration_min} onChange={(e) => set("duration_min", e.target.value)} />
          </Field>
        </div>
        <label className="flex min-h-[44px] items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={form.flexible} onChange={(e) => set("flexible", e.target.checked)} />
          I can leave up to 2 hours earlier or later
        </label>
        <button type="submit" className="btn-primary">
          <TrainFront aria-hidden="true" size={18} /> Find my cleaner commute
        </button>
        <p role="status" className="text-sm">
          {status}
        </p>
      </form>

      <div aria-live="polite">
        {plan && rec && result && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-emerald-800 bg-emerald-50 p-4 text-emerald-950">
              <p className="text-sm font-semibold uppercase tracking-wide">Recommended</p>
              <p className="text-2xl font-extrabold">
                {rec.label} at {rec.departure}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-sm">PM2.5 you avoid</dt>
                  <dd className="text-xl font-bold">
                    {fmt(plan.dose_saved_ug, 1)} µg ({fmt(plan.dose_saved_pct)}%)
                  </dd>
                </div>
                <div>
                  <dt className="text-sm">CO₂ saved per trip</dt>
                  <dd className="text-xl font-bold">{fmt(plan.co2_saved_kg, 2)} kg</dd>
                </div>
                <div>
                  <dt className="text-sm">Trip time</dt>
                  <dd className="text-xl font-bold">{rec.duration_min} min</dd>
                </div>
              </dl>
            </div>
            <p className="text-lg">{pretty(result.narrative.summary)}</p>
            <p>{pretty(result.narrative.impact_reasoning)}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-1 text-left font-semibold">All options leaving at {form.departure}</caption>
                <thead>
                  <tr>
                    <th scope="col">Mode</th>
                    <th scope="col">Minutes</th>
                    <th scope="col">PM2.5 inhaled (µg)</th>
                    <th scope="col">CO₂ (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.options.map((o) => (
                    <tr key={o.mode} className={`border-t border-slate-200 ${o.mode === plan.baseline.mode ? "font-semibold" : ""}`}>
                      <th scope="row" className="py-1 font-medium">
                        {o.label}
                        {o.mode === plan.baseline.mode ? " (now)" : ""}
                      </th>
                      <td>{o.duration_min}</td>
                      <td>{fmt(o.inhaled_dose_ug, 1)}</td>
                      <td>{fmt(o.co2_kg, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <HowWeCalculate factors={plan.factors} />
              <button
                type="button"
                className="btn-secondary"
                disabled={plan.dose_saved_ug <= 0 && plan.co2_saved_kg <= 0}
                onClick={() => {
                  onLog({ label: `${rec.label} at ${rec.departure}`, dose_ug: plan.dose_saved_ug, co2_kg: plan.co2_saved_kg });
                  setStatus("Added to your impact tracker.");
                }}
              >
                <CheckCircle2 aria-hidden="true" size={18} /> I did this today
              </button>
              <ReadAloudButton text={pretty(result.narrative.summary)} />
            </div>
            <SourceNote source={result.narrative_source} />
          </div>
        )}
      </div>
    </div>
  );
}
