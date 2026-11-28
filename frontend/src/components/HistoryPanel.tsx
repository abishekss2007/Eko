import { CalendarDays, CloudRain, Droplets, Flame, History, Snowflake, Sparkles, Thermometer, Trophy, Wind } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAsync } from "../hooks/useAsync";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { fetchHistory } from "../lib/api";
import { dayLabel, fmt, hourLabel } from "../lib/format";
import { bandStyle } from "../lib/naqi";
import type { DaySummary, HistoryReport, PeriodRecord, Place } from "../types";

const ARCHIVE_POLL_MS = 6000;
const ARCHIVE_POLLS = 20;

export const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

function parsePeriod(raw: unknown): Period {
  return PERIODS.find((p) => p === raw) ?? 30;
}

function when(record: { date: string; time?: string | null }): string {
  return `${dayLabel(record.date)}${record.time ? ` at ${hourLabel(record.time)}` : ""}`;
}

function NaqiBadge({ value, category }: { value: number | null; category: string | null }) {
  if (value === null || !category) return <span className="text-slate-700">No air data</span>;
  const { className, Icon } = bandStyle(category);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold ${className}`}>
      <Icon aria-hidden="true" size={14} />
      NAQI {value}, {category}
    </span>
  );
}

function Stat({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}

/** One day's weather and air at a glance. Used for yesterday here and for any picked day on the home page. */
export function DayCard({
  day,
  title,
  anomaly = null,
}: {
  day: DaySummary;
  title: string;
  anomaly?: number | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-slate-900">
          {title} <span className="font-medium text-slate-700">({dayLabel(day.date)})</span>
        </h3>
        <NaqiBadge value={day.naqi} category={day.naqi_category} />
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<Flame aria-hidden="true" size={14} />} label="High">
          <span className="text-2xl font-bold tabular-nums">{fmt(day.temp_max_c, 1)}</span> °C
          {day.temp_max_time && <span className="block text-sm text-slate-700">at {hourLabel(day.temp_max_time)}</span>}
        </Stat>
        <Stat icon={<Snowflake aria-hidden="true" size={14} />} label="Low">
          <span className="text-2xl font-bold tabular-nums">{fmt(day.temp_min_c, 1)}</span> °C
          {day.temp_min_time && <span className="block text-sm text-slate-700">at {hourLabel(day.temp_min_time)}</span>}
        </Stat>
        <Stat icon={<CloudRain aria-hidden="true" size={14} />} label="Rain">
          <span className="text-2xl font-bold tabular-nums">{fmt(day.precipitation_mm, 1)}</span> mm
        </Stat>
        <Stat icon={<Wind aria-hidden="true" size={14} />} label="Top wind">
          <span className="text-2xl font-bold tabular-nums">{fmt(day.wind_max_kmh)}</span> km/h
        </Stat>
      </dl>
      <p className="text-sm text-slate-700">
        {day.pm2_5_mean !== null && (
          <>
            Average PM2.5 {fmt(day.pm2_5_mean)} µg/m³, peak {fmt(day.pm2_5_peak)} µg/m³. Humidity {fmt(day.humidity_mean)}%.{" "}
          </>
        )}
        {anomaly !== null &&
          (Math.abs(anomaly) < 0.5
            ? "The high was about normal for this date."
            : `The high was ${fmt(Math.abs(anomaly), 1)} °C ${anomaly > 0 ? "warmer" : "cooler"} than usual for this date.`)}
      </p>
    </div>
  );
}

function RecordCard({ icon, label, value, record, extra }: { icon: ReactNode; label: string; value: string; record: PeriodRecord; extra?: ReactNode }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      <p className="text-sm text-slate-700">{when(record)}</p>
      {extra}
    </li>
  );
}

function Records({ report }: { report: HistoryReport }) {
  const r = report.records;
  return (
    <ul aria-label="Records for this period" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {r.hottest && <RecordCard icon={<Flame aria-hidden="true" size={14} />} label="Hottest" value={`${fmt(r.hottest.value, 1)} °C`} record={r.hottest} />}
      {r.coldest && <RecordCard icon={<Snowflake aria-hidden="true" size={14} />} label="Coldest" value={`${fmt(r.coldest.value, 1)} °C`} record={r.coldest} />}
      {r.worst_air && (
        <RecordCard
          icon={<Wind aria-hidden="true" size={14} />}
          label="Worst air day"
          value={`NAQI ${r.worst_air.value}`}
          record={r.worst_air}
          extra={<p className="text-sm font-semibold text-slate-900">{r.worst_air.category}</p>}
        />
      )}
      {r.pm2_5_peak && (
        <RecordCard icon={<Droplets aria-hidden="true" size={14} />} label="Peak PM2.5" value={`${fmt(r.pm2_5_peak.value)} µg/m³`} record={r.pm2_5_peak} />
      )}
      {r.cleanest_air && (
        <RecordCard
          icon={<Sparkles aria-hidden="true" size={14} />}
          label="Cleanest air day"
          value={`NAQI ${r.cleanest_air.value}`}
          record={r.cleanest_air}
          extra={<p className="text-sm font-semibold text-slate-900">{r.cleanest_air.category}</p>}
        />
      )}
      {r.wettest && <RecordCard icon={<CloudRain aria-hidden="true" size={14} />} label="Wettest day" value={`${fmt(r.wettest.value, 1)} mm`} record={r.wettest} />}
      {r.windiest && <RecordCard icon={<Wind aria-hidden="true" size={14} />} label="Windiest day" value={`${fmt(r.windiest.value)} km/h`} record={r.windiest} />}
    </ul>
  );
}

/** Daily high/low as floating bars and daily NAQI as coloured bars, with a full table for screen readers. */
function TrendChart({ days, hottest }: { days: DaySummary[]; hottest: string | null }) {
  const highs = days.flatMap((d) => (d.temp_max_c === null ? [] : [d.temp_max_c]));
  const lows = days.flatMap((d) => (d.temp_min_c === null ? [] : [d.temp_min_c]));
  const top = Math.ceil(Math.max(...highs, 1));
  const bottom = Math.floor(Math.min(...lows, top - 1));
  const span = Math.max(1, top - bottom);
  const naqiMax = Math.max(100, ...days.map((d) => d.naqi ?? 0));
  const rated = days.some((d) => d.naqi !== null);
  const first = days[0];
  const last = days.at(-1);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-900">Daily high and low (°C)</p>
        <div className="flex gap-2">
          <div className="flex h-40 flex-col justify-between text-xs tabular-nums text-slate-700" aria-hidden="true">
            <span>{top}°</span>
            <span>{bottom}°</span>
          </div>
          <div
            role="img"
            aria-label={`Daily temperature range for ${days.length} days, from ${fmt(Math.min(...lows), 1)} to ${fmt(Math.max(...highs), 1)} °C.`}
            className="flex h-40 flex-1 items-stretch gap-[2px] border-b border-l border-slate-400 px-1"
          >
            {days.map((d) => {
              const hi = d.temp_max_c ?? bottom;
              const lo = d.temp_min_c ?? hi;
              const isHottest = d.date === hottest;
              return (
                <div key={d.date} className="relative flex-1" title={`${dayLabel(d.date)}: ${fmt(lo, 1)}–${fmt(hi, 1)} °C`}>
                  <div
                    className={`absolute inset-x-0 rounded ${isHottest ? "bg-orange-600" : "bg-sky-500"}`}
                    style={{ bottom: `${((lo - bottom) / span) * 100}%`, height: `${Math.max(2, ((hi - lo) / span) * 100)}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {rated && (
        <div>
          <p className="mb-1 text-sm font-semibold text-slate-900">Daily NAQI</p>
          <div
            role="img"
            aria-label={`Daily NAQI for ${days.length} days, highest ${Math.max(...days.map((d) => d.naqi ?? 0))}.`}
            className="ml-8 flex h-24 items-end gap-[2px] border-b border-l border-slate-400 px-1"
          >
            {days.map((d) => (
              <div
                key={d.date}
                className={`flex-1 rounded-t ${d.naqi_category ? bandStyle(d.naqi_category).className : "bg-slate-200"}`}
                style={{ height: `${Math.max(2, ((d.naqi ?? 0) / naqiMax) * 100)}%` }}
                title={`${dayLabel(d.date)}: ${d.naqi === null ? "no data" : `NAQI ${d.naqi}, ${d.naqi_category}`}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="ml-8 flex justify-between text-xs text-slate-700" aria-hidden="true">
        <span>{first ? dayLabel(first.date) : ""}</span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-orange-600" />
          Hottest day
        </span>
        <span>{last ? dayLabel(last.date) : ""}</span>
      </div>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold">Show daily data table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Daily weather and air quality</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1">Date</th>
                <th scope="col" className="py-1">High °C</th>
                <th scope="col" className="py-1">Low °C</th>
                <th scope="col" className="py-1">Rain mm</th>
                <th scope="col" className="py-1">Wind km/h</th>
                <th scope="col" className="py-1">PM2.5 µg/m³</th>
                <th scope="col" className="py-1">NAQI</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.date} className="border-t border-slate-100">
                  <th scope="row" className="py-1 font-medium">{dayLabel(d.date)}</th>
                  <td className="py-1 tabular-nums">
                    {fmt(d.temp_max_c, 1)}
                    {d.temp_max_time && <span className="text-slate-700"> ({hourLabel(d.temp_max_time)})</span>}
                  </td>
                  <td className="py-1 tabular-nums">{fmt(d.temp_min_c, 1)}</td>
                  <td className="py-1 tabular-nums">{fmt(d.precipitation_mm, 1)}</td>
                  <td className="py-1 tabular-nums">{fmt(d.wind_max_kmh)}</td>
                  <td className="py-1 tabular-nums">{fmt(d.pm2_5_mean)}</td>
                  <td className="py-1">{d.naqi === null ? "–" : `${d.naqi} (${d.naqi_category})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function LongTerm({ report }: { report: HistoryReport }) {
  const lt = report.long_term;
  if (!lt) return null;
  const sinceYear = lt.since.slice(0, 4);
  const today = lt.today;
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <Trophy aria-hidden="true" size={18} /> All-time records since {sinceYear}
      </h3>
      <ul className="mt-2 space-y-1">
        {lt.hottest_day && (
          <li>
            Hottest day: <strong>{fmt(lt.hottest_day.value, 1)} °C</strong> on {dayLabel(lt.hottest_day.date, true)}
          </li>
        )}
        {lt.coldest_day && (
          <li>
            Coldest night: <strong>{fmt(lt.coldest_day.value, 1)} °C</strong> on {dayLabel(lt.coldest_day.date, true)}
          </li>
        )}
        {today && (
          <li>
            On {new Date(2000, today.month - 1, today.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}:
            {today.record_high && (
              <>
                {" "}record high <strong>{fmt(today.record_high.value, 1)} °C</strong> in {today.record_high.date.slice(0, 4)}
              </>
            )}
            {today.record_low && (
              <>
                , record low <strong>{fmt(today.record_low.value, 1)} °C</strong> in {today.record_low.date.slice(0, 4)}
              </>
            )}
            {today.average_high_c !== null && <>, usual high {fmt(today.average_high_c, 1)} °C</>} ({today.years} years).
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs">
        Daily highs and lows from the ERA5 reanalysis (about a 9 km grid), {sinceYear} to {dayLabel(lt.until, true)}. A local
        weather station may read a little differently.
      </p>
    </div>
  );
}

/** Past weather and air for the chosen place: yesterday, a 7/30/90-day trend, and records with dates. */
export function HistoryPanel({ place }: { place: Place }) {
  const [period, setPeriod] = useLocalStorage<Period>("saanssafe.historyDays", parsePeriod, 30);
  // The all-time records load in the background on the server; ask again until they arrive.
  const key = `${place.latitude},${place.longitude},${period}`;
  const [poll, setPoll] = useState({ key, n: 0 });
  const refresh = poll.key === key ? poll.n : 0;
  const history = useAsync(`${key}#${refresh}`, (signal) => fetchHistory(place.latitude, place.longitude, period, signal));
  const report = history.data;
  const pending = Boolean(report?.long_term_pending) && !history.loading;
  useEffect(() => {
    if (!pending || refresh >= ARCHIVE_POLLS) return;
    const timer = window.setTimeout(() => setPoll({ key, n: refresh + 1 }), ARCHIVE_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [pending, refresh, key]);

  return (
    <div className="space-y-6">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Period to look back over</legend>
        <span className="mr-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900" aria-hidden="true">
          <CalendarDays size={16} /> Look back
        </span>
        {PERIODS.map((p) => (
          <label
            key={p}
            className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600 ${
              p === period ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
            }`}
          >
            <input type="radio" name="history-period" value={p} checked={p === period} onChange={() => setPeriod(p)} className="sr-only" />
            {p} days
          </label>
        ))}
      </fieldset>

      <div aria-live="polite" aria-busy={history.loading} className="space-y-6">
        {history.error && !report && (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-red-900">
            {history.error}
          </p>
        )}
        {!report && history.loading && <p className="text-slate-700">Loading past weather and air…</p>}
        {report && (
          <>
            {report.yesterday ? (
              <DayCard day={report.yesterday} title={`Yesterday in ${place.name}`} anomaly={report.long_term?.yesterday_vs_average_c ?? null} />
            ) : (
              <p className="text-slate-700">Yesterday&apos;s readings are not available yet.</p>
            )}

            <div>
              <h3 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
                <Thermometer aria-hidden="true" size={18} /> Highs and lows of the last {report.days} days
              </h3>
              <p className="mb-3 text-sm text-slate-700">
                {report.records.average_naqi !== null
                  ? `Average NAQI ${report.records.average_naqi}. ${report.records.days_poor_or_worse} of ${report.daily.length} days were Poor or worse.`
                  : "Air-quality history is not available for this place right now; weather is shown."}
              </p>
              <Records report={report} />
            </div>

            {report.daily.length > 1 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <History aria-hidden="true" size={18} /> Day by day
                </h3>
                <TrendChart days={report.daily} hottest={report.records.hottest?.date ?? null} />
              </div>
            )}

            <LongTerm report={report} />
            {report.long_term_pending && (
              <p role="status" className="rounded-2xl border border-dashed border-amber-400 p-4 text-amber-950">
                {refresh >= ARCHIVE_POLLS
                  ? "All-time records are taking longer than usual. Open this tab again in a minute."
                  : "Loading all-time records since 1991… this can take up to a minute the first time for a place."}
              </p>
            )}

            <p className="text-xs text-slate-700">
              Times are local to {place.name}. Daily NAQI is the CPCB index of 24-hour averages and needs at least 16 hourly
              readings. Sources: {report.sources.join("; ")}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
