import { ArrowLeft, CalendarDays } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAsync } from "../hooks/useAsync";
import { fetchDay, fetchHistory } from "../lib/api";
import { dayLabel, fmt, hourLabel } from "../lib/format";
import { bandStyle } from "../lib/naqi";
import type { AirReport, DaySummary, HourPoint, Place } from "../types";
import { DayCard } from "./HistoryPanel";

/** How far back the calendar goes; matches the server's 90 days of hourly history. */
export const MAX_DAYS_BACK = 90;
const STRIP_DAYS = 7;

/** Whole-day arithmetic on "YYYY-MM-DD" strings, in UTC so no time zone can shift the date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function browserToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function weekday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("en-IN", { weekday: "short" });
}

function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function NaqiDot({ value, category }: { value: number | null | undefined; category: string | null | undefined }) {
  if (value === null || value === undefined || !category) return <span className="text-xs text-slate-700">No air data</span>;
  const { className, Icon } = bandStyle(category);
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold ${className}`}>
      <Icon aria-hidden="true" size={11} />
      {value}
      <span className="sr-only">, {category}</span>
    </span>
  );
}

interface StripProps {
  place: Place;
  report: AirReport | null;
  /** The picked past day, or null for today. */
  selected: string | null;
  onSelect: (day: string | null) => void;
}

/** A weather-app style row of days (the last week and today) plus a calendar for any day in the last 90. */
export function DateStrip({ place, report, selected, onSelect }: StripProps) {
  const week = useAsync(`${place.latitude},${place.longitude}`, (signal) =>
    fetchHistory(place.latitude, place.longitude, STRIP_DAYS, signal),
  );
  const last = week.data?.daily.at(-1)?.date;
  // "Today" is the place's own date: the day after its last completed day.
  const today = last ? addDays(last, 1) : browserToday();
  const byDate = new Map<string, DaySummary>((week.data?.daily ?? []).map((d) => [d.date, d]));
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i - STRIP_DAYS));
  const current = selected ?? today;
  const todayRef = useRef<HTMLButtonElement>(null);

  // Keep today in view on narrow screens, where the strip scrolls sideways.
  useEffect(() => {
    todayRef.current?.scrollIntoView?.({ block: "nearest", inline: "end" });
  }, [today]);

  const chip = (active: boolean) =>
    `flex min-h-[44px] w-full min-w-[5.25rem] snap-end flex-col items-center gap-0.5 rounded-2xl border px-2 py-2 text-center transition ${
      active ? "border-teal-700 bg-teal-50 text-teal-950 ring-2 ring-teal-600" : "border-slate-200 bg-white text-slate-900 hover:bg-slate-100"
    }`;

  return (
    <section aria-labelledby="days-title" className="card p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="days-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
          <CalendarDays aria-hidden="true" size={16} /> Pick a day
        </h2>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          Calendar
          <input
            type="date"
            value={current}
            min={addDays(today, -MAX_DAYS_BACK)}
            max={today}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              onSelect(value >= today ? null : value < addDays(today, -MAX_DAYS_BACK) ? addDays(today, -MAX_DAYS_BACK) : value);
            }}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-2 text-slate-900"
          />
        </label>
      </div>
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" aria-label="Recent days">
        {days.map((d) => {
          const s = byDate.get(d);
          const active = current === d;
          return (
            <li key={d} className="shrink-0 grow basis-[5.25rem]">
              <button type="button" aria-pressed={active} onClick={() => onSelect(d)} className={chip(active)}>
                <span className="text-xs font-semibold uppercase">{d === addDays(today, -1) ? "Yest." : weekday(d)}</span>
                <span className="text-sm font-bold">{shortDate(d)}</span>
                <span className="text-xs tabular-nums text-slate-700">
                  {s ? `${fmt(s.temp_max_c)}° / ${fmt(s.temp_min_c)}°` : week.loading ? "…" : "–"}
                </span>
                {s && <NaqiDot value={s.naqi} category={s.naqi_category} />}
              </button>
            </li>
          );
        })}
        <li className="shrink-0 grow basis-[5.25rem]">
          <button ref={todayRef} type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={chip(selected === null)}>
            <span className="text-xs font-semibold uppercase">Today</span>
            <span className="text-sm font-bold">{shortDate(today)}</span>
            <span className="text-xs tabular-nums text-slate-700">
              {report ? `Now ${fmt(report.current.temperature_c)}°` : "Live"}
            </span>
            {report && <NaqiDot value={report.naqi.value} category={report.naqi.category} />}
          </button>
        </li>
      </ul>
      {week.error && !week.data && <p className="mt-1 text-sm text-slate-700">Past days could not be loaded right now.</p>}
    </section>
  );
}

/** Hour-by-hour temperature (line) and PM2.5 (bars), with a table for screen readers. */
function HourlyChart({ hours }: { hours: HourPoint[] }) {
  const temps = hours.flatMap((h) => (h.temperature_c === null ? [] : [h.temperature_c]));
  const hi = Math.ceil(Math.max(...temps, 1));
  const lo = Math.floor(Math.min(...temps, hi - 1));
  const span = Math.max(1, hi - lo);
  const width = Math.max(1, hours.length - 1);
  const points = hours
    .map((h, i) => (h.temperature_c === null ? null : `${(i / width) * 100},${100 - ((h.temperature_c - lo) / span) * 100}`))
    .filter(Boolean)
    .join(" ");
  const pmMax = Math.max(1, ...hours.map((h) => h.pm2_5 ?? 0));
  const peak = hours.reduce<HourPoint | null>((best, h) => (h.pm2_5 !== null && (best === null || h.pm2_5 > (best.pm2_5 ?? 0)) ? h : best), null);
  const hasPm = hours.some((h) => h.pm2_5 !== null);
  const lastHour = hours.at(-1);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-900">Temperature through the day (°C)</p>
        <div className="flex gap-2">
          <div className="flex h-32 flex-col justify-between text-xs tabular-nums text-slate-700" aria-hidden="true">
            <span>{hi}°</span>
            <span>{lo}°</span>
          </div>
          <svg
            role="img"
            aria-label={`Temperature from ${fmt(Math.min(...temps), 1)} to ${fmt(Math.max(...temps), 1)} °C over ${hours.length} hours.`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-32 flex-1 border-b border-l border-slate-400 text-orange-600"
          >
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
      {hasPm && (
        <div>
          <p className="mb-1 text-sm font-semibold text-slate-900">PM2.5 each hour (µg/m³)</p>
          <div
            role="img"
            aria-label={`Hourly PM2.5, highest ${fmt(peak?.pm2_5)} µg/m³${peak ? ` at ${hourLabel(peak.time)}` : ""}.`}
            className="ml-8 flex h-24 items-end gap-[2px] border-b border-l border-slate-400 px-1"
          >
            {hours.map((h) => (
              <div
                key={h.time}
                className={`flex-1 rounded-t ${h === peak ? "bg-red-600" : "bg-slate-400"}`}
                style={{ height: `${Math.max(2, ((h.pm2_5 ?? 0) / pmMax) * 100)}%` }}
                title={`${hourLabel(h.time)}: ${fmt(h.pm2_5)} µg/m³`}
              />
            ))}
          </div>
        </div>
      )}
      <div className="ml-8 flex justify-between text-xs text-slate-700" aria-hidden="true">
        <span>{hours[0] ? hourLabel(hours[0].time) : ""}</span>
        {hasPm && (
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-red-600" />
            Worst hour
          </span>
        )}
        <span>{lastHour ? hourLabel(lastHour.time) : ""}</span>
      </div>
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">Show hourly data table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-sm">
            <caption className="sr-only">Hourly weather and PM2.5</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1">Time</th>
                <th scope="col" className="py-1">Temp °C</th>
                <th scope="col" className="py-1">Rain mm</th>
                <th scope="col" className="py-1">Wind km/h</th>
                <th scope="col" className="py-1">PM2.5 µg/m³</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.time} className="border-t border-slate-100">
                  <th scope="row" className="py-1 font-medium">{hourLabel(h.time)}</th>
                  <td className="py-1 tabular-nums">{fmt(h.temperature_c, 1)}</td>
                  <td className="py-1 tabular-nums">{fmt(h.precipitation_mm, 1)}</td>
                  <td className="py-1 tabular-nums">{fmt(h.wind_kmh)}</td>
                  <td className="py-1 tabular-nums">{fmt(h.pm2_5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** A past day picked on the home page: its summary and every hour. */
export function DayView({ place, day, onBack }: { place: Place; day: string; onBack: () => void }) {
  const detail = useAsync(`${place.latitude},${place.longitude},${day}`, (signal) =>
    fetchDay(place.latitude, place.longitude, day, signal),
  );
  const data = detail.data?.summary.date === day ? detail.data : null;

  return (
    <section aria-labelledby="day-view-title" className="card space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="day-view-title" className="text-xl font-bold text-slate-900">
          {dayLabel(day, true)} in {place.name}
        </h2>
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={18} /> Back to today
        </button>
      </div>
      <div aria-live="polite" aria-busy={detail.loading} className="space-y-5">
        {detail.error && !data && (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-red-900">
            {detail.error}
          </p>
        )}
        {!data && detail.loading && <p className="text-slate-700">Loading that day…</p>}
        {data && (
          <>
            <DayCard day={data.summary} title="Weather and air" />
            <HourlyChart hours={data.hours} />
            <p className="text-xs text-slate-700">
              Times are local to {place.name}. Sources: {data.sources.join("; ")}.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
