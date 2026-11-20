import { Droplets, Snowflake, Thermometer, Wind } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "../lib/format";
import { bandStyle } from "../lib/naqi";
import type { AirReport } from "../types";

const CHECK_LABELS: Record<string, (t: number) => string> = {
  temperature_below_c: (t) => `Temperature below ${t} °C`,
  wind_below_kmh: (t) => `Wind below ${t} km/h`,
  pm2_5_above_ug_m3: (t) => `PM2.5 above ${t} µg/m³`,
};

function Metric({ icon, label, value, unit }: { icon: ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <dt className="flex items-center gap-1 text-sm font-medium text-slate-700">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold">
        {value} <span className="text-base font-medium text-slate-700">{unit}</span>
      </dd>
    </div>
  );
}

export function NaqiBadge({ value, category }: { value: number; category: string }) {
  const { className, Icon } = bandStyle(category);
  return (
    <div className={`inline-flex items-center gap-3 rounded-2xl px-5 py-4 ${className}`}>
      <Icon aria-hidden="true" size={40} />
      <div>
        <p className="text-5xl font-extrabold leading-none">{value}</p>
        <p className="text-lg font-bold">{category}</p>
      </div>
    </div>
  );
}

export function AirDashboard({ report, placeName }: { report: AirReport; placeName: string }) {
  const { naqi, current, inversion } = report;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        <NaqiBadge value={naqi.value} category={naqi.category} />
        <div className="max-w-prose space-y-1">
          <p className="text-lg font-semibold">
            Air quality in {placeName}: NAQI {naqi.value}, {naqi.category}
          </p>
          <p className="text-slate-800">{naqi.health_impact}</p>
          <p className="text-sm text-slate-700">
            Indian CPCB NAQI, led by {naqi.dominant_pollutant.replace("_", ".").toUpperCase()}.{" "}
            {naqi.is_24h_average ? "24-hour average." : "Indicative: fewer than 16 hours of data."} Source:{" "}
            {report.source}.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={<Droplets aria-hidden="true" size={16} />} label="PM2.5" value={fmt(current.pm2_5)} unit="µg/m³" />
        <Metric icon={<Droplets aria-hidden="true" size={16} />} label="PM10" value={fmt(current.pm10)} unit="µg/m³" />
        <Metric
          icon={<Thermometer aria-hidden="true" size={16} />}
          label="Temperature"
          value={fmt(current.temperature_c, 1)}
          unit="°C"
        />
        <Metric icon={<Wind aria-hidden="true" size={16} />} label="Wind" value={fmt(current.wind_kmh, 1)} unit="km/h" />
      </dl>

      <div
        className={`rounded-xl border-2 p-4 ${
          inversion.detected ? "border-blue-900 bg-blue-50 text-blue-950" : "border-slate-300 bg-slate-50"
        }`}
      >
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Snowflake aria-hidden="true" size={20} />
          Winter smog trap: {inversion.detected ? "Detected" : "Not detected"}
        </h3>
        <p className="mb-2 text-sm">
          {inversion.detected
            ? "Cold, still air is holding smoke and dust near the ground, where your family breathes."
            : "All three conditions must hold for smog to be trapped near the ground."}
        </p>
        <ul className="grid gap-1 text-sm sm:grid-cols-3">
          {inversion.checks.map((c) => (
            <li key={c.name} className="flex items-center gap-1">
              <span aria-hidden="true">{c.met ? "✔" : "✖"}</span>
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
