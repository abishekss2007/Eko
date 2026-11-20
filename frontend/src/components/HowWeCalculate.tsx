import { Calculator, X } from "lucide-react";
import { useRef } from "react";
import type { CommuteResponse } from "../types";

/** Transparency modal: exact formulas, every factor and its source. */
export function HowWeCalculate({ factors }: { factors: CommuteResponse["plan"]["factors"] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => {
    const el = dialog.current;
    if (!el) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  };
  const close = () => {
    const el = dialog.current;
    if (!el) return;
    if (typeof el.close === "function") el.close();
    else el.removeAttribute("open");
  };

  return (
    <>
      <button type="button" className="btn-secondary" onClick={open} aria-haspopup="dialog">
        <Calculator aria-hidden="true" size={18} /> How we calculate
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="calc-title"
        className="w-[min(48rem,calc(100vw-2rem))] rounded-2xl p-0 backdrop:bg-slate-900/60"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 id="calc-title" className="text-xl font-bold">
              How we calculate impact
            </h3>
            <button type="button" onClick={close} className="btn-secondary" aria-label="Close">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <ul className="space-y-1 font-mono text-sm">
            <li>{factors.formula_dose}</li>
            <li>{factors.formula_co2}</li>
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Factors used for each travel mode</caption>
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Speed (km/h)</th>
                  <th scope="col">Breathing (m³/h)</th>
                  <th scope="col">In-transit PM2.5 factor</th>
                  <th scope="col">kg CO₂ / km</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(factors.modes).map(([key, m]) => (
                  <tr key={key} className="border-t border-slate-200">
                    <th scope="row" className="py-1 font-medium">
                      {m.label}
                    </th>
                    <td>{m.speed_kmh}</td>
                    <td>{m.breathing_m3h}</td>
                    <td>{m.micro_factor}</td>
                    <td>{m.co2_kg_per_km}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4 className="font-semibold">Sources</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {factors.sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="text-sm text-slate-700">
            Air quality uses the CPCB National Air Quality Index breakpoints. Every constant is listed in
            backend/app/data/assumptions.json.
          </p>
        </div>
      </dialog>
    </>
  );
}
