import { Check, Droplets, MapPin, Snowflake, Thermometer, Wind, X } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "../lib/format";
import type { AirReport } from "../types";
import { NaqiGauge } from "./NaqiGauge";

const CHECK_LABELS: Record<string, (t: number) => string> = {
  temperature_below_c: (t) => `Temperature below ${t} °C`,
  wind_below_kmh: (t) => `Wind below ${t} km/h`,
  pm2_5_above_ug_m3: (t) => `PM2.5 above ${t} µg/m³`,
};

function Metric({ icon, label, value, unit }: { icon: ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="pill !w-auto !items-start !gap-1 !rounded-3xl !p-3">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
        {icon}
        {label}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums text-slate-950">
        {value} <span className="text-sm font-medium text-slate-600">{unit}</span>
      </dd>
    </div>
  );
}

export function AirDashboard({ report, placeName }: { report: AirReport; placeName: string }) {
  const { naqi, current, inversion } = report;
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden p-5 text-slate-950 sm:p-7">
        <div className="grid items-center gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <NaqiGauge value={naqi.value} category={naqi.category} />
          <div className="space-y-4">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <MapPin aria-hidden="true" size={16} /> {placeName}
                {report.simulated && (
                  <span className="ml-1 rounded-full bg-sun px-2 py-0.5 text-xs font-bold text-ink-950">Simulated</span>
                )}
              </p>
              <p className="mt-1 text-2xl font-bold leading-snug">
                Air quality in {placeName}: NAQI {naqi.value}, {naqi.category}
              </p>
              <p className="mt-2 text-slate-700">{naqi.health_impact}</p>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric icon={<Droplets aria-hidden="true" size={14} />} label="PM2.5" value={fmt(current.pm2_5)} unit="µg/m³" />
              <Metric icon={<Droplets aria-hidden="true" size={14} />} label="PM10" value={fmt(current.pm10)} unit="µg/m³" />
              <Metric
                icon={<Thermometer aria-hidden="true" size={14} />}
                label="Temp"
                value={fmt(current.temperature_c, 1)}
                unit="°C"
              />
              <Metric icon={<Wind aria-hidden="true" size={14} />} label="Wind" value={fmt(current.wind_kmh, 1)} unit="km/h" />
            </dl>
            <p className="text-xs text-slate-600">
              Indian CPCB NAQI, led by {naqi.dominant_pollutant.replace("_", ".").toUpperCase()}.{" "}
              {naqi.is_24h_average ? "24-hour average." : "Indicative: fewer than 16 hours of data."} Source:{" "}
              {report.source}.
            </p>
          </div>
        </div>
      </div>

      <div
        className={`rounded-3xl border p-5 ${
          inversion.detected ? "border-blue-300 bg-blue-50 text-blue-950" : "card text-slate-900"
        }`}
      >
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <span
            className={`grid h-9 w-9 place-items-center rounded-xl ${inversion.detected ? "bg-blue-700 text-white" : "bg-iris text-snow"}`}
          >
            <Snowflake aria-hidden="true" size={18} />
          </span>
          Winter smog trap: {inversion.detected ? "Detected" : "Not detected"}
        </h3>
        <p className="mb-3 mt-2 text-sm">
          {inversion.detected
            ? "Cold, still air is holding smoke and dust near the ground, where your family breathes."
            : "All three conditions must hold for smog to be trapped near the ground."}
        </p>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          {inversion.checks.map((c) => (
            <li key={c.name} className="flex items-start gap-2 rounded-2xl bg-slate-900/5 p-2">
              {c.met ? (
                <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-green-700" />
              ) : (
                <X aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-slate-600" />
              )}
              <span>
                {CHECK_LABELS[c.name]?.(c.threshold) ?? c.name}: {c.met ? "yes" : "no"} (now {fmt(c.value, 1)})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
