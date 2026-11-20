import { Wind } from "lucide-react";
import { useState, type FormEvent } from "react";
import { fetchIndoor } from "../lib/api";
import { RUPEE_TIERS, fmt, pretty } from "../lib/format";
import type { CostTier, IndoorRequest, IndoorResponse } from "../types";
import { Field, SourceNote } from "./Field";
import { ReadAloudButton } from "./ReadAloudButton";

type Form = Omit<IndoorRequest, "latitude" | "longitude" | "simulate" | "language">;

const DEFAULT_FORM: Form = {
  room: { length_m: 4, width_m: 3.5, height_m: 3 },
  cooking_fuel: "lpg",
  ventilation: "windows_open_daytime",
  incense_or_coil: false,
  sweeping: "dry",
  purifier_cadr_m3h: 0,
  filter_age_months: 0,
  budget_tier: "zero_rupee",
};

const IMPACT_CLASS = { high: "bg-emerald-800 text-white", medium: "bg-emerald-100 text-emerald-950", low: "bg-slate-200" };

interface Props {
  context: Pick<IndoorRequest, "latitude" | "longitude" | "simulate" | "language">;
}

export function IndoorPlanner({ context }: Props) {
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [result, setResult] = useState<IndoorResponse | null>(null);
  const [status, setStatus] = useState("");
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setRoom = (key: keyof Form["room"], value: number) => setForm((f) => ({ ...f, room: { ...f.room, [key]: value } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("Working out your indoor plan…");
    try {
      setResult(await fetchIndoor({ ...context, ...form }));
      setStatus("Indoor plan ready.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not build the plan.");
    }
  };

  const a = result?.assessment;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <form onSubmit={submit} className="space-y-3" aria-describedby="indoor-help">
        <p id="indoor-help" className="text-sm text-slate-700">
          Describe the room where the most vulnerable person spends the night.
        </p>
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="mb-1 text-sm font-semibold">Room size (metres)</legend>
          {(["length_m", "width_m", "height_m"] as const).map((key) => (
            <Field key={key} id={`room-${key}`} label={{ length_m: "Length", width_m: "Width", height_m: "Height" }[key]}>
              <input
                id={`room-${key}`}
                type="number"
                className="input"
                min={0.5}
                max={key === "height_m" ? 6 : 30}
                step={0.1}
                required
                value={form.room[key]}
                onChange={(e) => setRoom(key, Number(e.target.value))}
              />
            </Field>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="fuel" label="Cooking fuel">
            <select id="fuel" className="input" value={form.cooking_fuel} onChange={(e) => set("cooking_fuel", e.target.value as Form["cooking_fuel"])}>
              <option value="lpg">LPG gas</option>
              <option value="induction">Induction / electric</option>
              <option value="solid_fuel">Wood, dung or coal</option>
            </select>
          </Field>
          <Field id="ventilation" label="Usual ventilation">
            <select id="ventilation" className="input" value={form.ventilation} onChange={(e) => set("ventilation", e.target.value as Form["ventilation"])}>
              <option value="windows_open_daytime">Windows open in the day</option>
              <option value="mostly_closed">Mostly closed</option>
              <option value="exhaust_fan">Exhaust fan</option>
            </select>
          </Field>
          <Field id="cadr" label="Purifier CADR (m³/h, 0 if none)">
            <input id="cadr" type="number" className="input" min={0} max={2000} value={form.purifier_cadr_m3h} onChange={(e) => set("purifier_cadr_m3h", Number(e.target.value))} />
          </Field>
          <Field id="filter-age" label="Filter age (months)">
            <input id="filter-age" type="number" className="input" min={0} max={60} value={form.filter_age_months} onChange={(e) => set("filter_age_months", Number(e.target.value))} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Cleaning</legend>
          <div className="flex flex-wrap gap-4">
            {(["dry", "wet"] as const).map((v) => (
              <label key={v} className="flex min-h-[44px] items-center gap-2">
                <input type="radio" name="sweeping" className="h-5 w-5" checked={form.sweeping === v} onChange={() => set("sweeping", v)} />
                {v === "dry" ? "Dry sweeping" : "Wet mopping"}
              </label>
            ))}
            <label className="flex min-h-[44px] items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={form.incense_or_coil} onChange={(e) => set("incense_or_coil", e.target.checked)} />
              Incense or mosquito coils
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Budget</legend>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(RUPEE_TIERS) as CostTier[]).map((tier) => (
              <label key={tier} className="flex min-h-[44px] items-center gap-2">
                <input type="radio" name="budget" className="h-5 w-5" checked={form.budget_tier === tier} onChange={() => set("budget_tier", tier)} />
                {RUPEE_TIERS[tier]}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn-primary">
          <Wind aria-hidden="true" size={18} /> Plan my clean room
        </button>
        <p role="status" className="text-sm">
          {status}
        </p>
      </form>

      <div aria-live="polite">
        {a && result && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Room volume", `${fmt(a.room_volume_m3, 1)} m³`],
                ["Clean air needed", `${fmt(a.required_cadr_m3h)} m³/h`],
                ["You have", `${fmt(a.current_cadr_m3h)} m³/h`],
                ["Air changes/hour", `${fmt(a.effective_ach, 1)} of ${fmt(a.target_ach)}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3">
                  <dt className="text-sm text-slate-700">{label}</dt>
                  <dd className="text-xl font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-lg">{pretty(result.narrative.summary)}</p>
            <p>{pretty(result.narrative.impact_reasoning)}</p>
            {a.pollution_sources.length > 0 && (
              <p className="rounded-lg bg-orange-50 p-3 text-orange-950">
                <strong>Indoor sources found:</strong> {a.pollution_sources.join(", ")}.
              </p>
            )}
            <ol className="space-y-3">
              {a.fixes.map((fix, i) => (
                <li key={fix.id} className="rounded-xl border border-slate-300 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-bold">
                      {i + 1}. {fix.title}
                    </span>
                    <span className="rounded-full border border-slate-500 px-2 text-sm">{RUPEE_TIERS[fix.cost_tier]}</span>
                    <span className={`rounded-full px-2 text-sm ${IMPACT_CLASS[fix.impact]}`}>{fix.impact} impact</span>
                  </div>
                  <p>{pretty(result.narrative.explanations[i] ?? fix.reason)}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <ReadAloudButton text={pretty([result.narrative.summary, ...a.fixes.map((f) => f.title)].join(". "))} />
              <SourceNote source={result.narrative_source} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
