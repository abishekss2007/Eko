import { hourLabel, fmt } from "../lib/format";
import type { BestWindow, HourlyPoint } from "../types";

interface Props {
  forecast: HourlyPoint[];
  window: BestWindow | null;
}

function inWindow(time: string, window: BestWindow | null): boolean {
  return window !== null && time >= window.start && time < window.end;
}

/** Visual PM2.5 bars plus a full data table for screen readers and keyboard users. */
export function BestWindowChart({ forecast, window }: Props) {
  const first = forecast[0];
  const last = forecast.at(-1);
  const max = Math.max(1, ...forecast.map((p) => p.pm2_5 ?? 0));
  const summary = window
    ? `Cleanest time outside: ${hourLabel(window.start)} to ${hourLabel(window.end)}, average PM2.5 ${fmt(
        window.mean_pm2_5,
      )} µg/m³ (${window.category}).`
    : "No clean daytime window in the next 24 hours. Keep outdoor time short.";

  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold" aria-live="polite">
        {summary}
      </p>
      <div
        role="img"
        aria-label={`Bar chart of PM2.5 for the next ${forecast.length} hours. ${summary}`}
        className="flex h-40 items-end gap-[2px] border-b border-l border-slate-400 px-1"
      >
        {forecast.map((p) => {
          const best = inWindow(p.time, window);
          return (
            <div
              key={p.time}
              className={`flex-1 rounded-t ${best ? "bg-emerald-600" : "bg-slate-400"}`}
              style={{ height: `${Math.max(2, ((p.pm2_5 ?? 0) / max) * 100)}%` }}
              title={`${hourLabel(p.time)}: ${fmt(p.pm2_5)} µg/m³`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-slate-700" aria-hidden="true">
        <span>{first ? hourLabel(first.time) : ""}</span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-emerald-600" />
          Best window
        </span>
        <span>{last ? hourLabel(last.time) : ""}</span>
      </div>
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">Show hourly data table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Hourly PM2.5 forecast</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1">Time</th>
              <th scope="col" className="py-1">PM2.5 (µg/m³)</th>
              <th scope="col" className="py-1">Best window</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((p) => (
              <tr key={p.time} className="border-t border-slate-100">
                <td className="py-1">{hourLabel(p.time)}</td>
                <td className="py-1">{fmt(p.pm2_5)}</td>
                <td className="py-1">{inWindow(p.time, window) ? "Yes" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
