import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { fmt } from "../lib/format";
import { shortDay, shortHour, weatherLook } from "../lib/weather";
import type { AirReport } from "../types";

type Tab = "hourly" | "weekly";
const TABS: { id: Tab; label: string }[] = [
  { id: "hourly", label: "Hourly Forecast" },
  { id: "weekly", label: "Weekly Forecast" },
];
/** Rain chances below this are left off the pills, as weather apps do. */
const SHOW_RAIN_FROM = 10;

function Rain({ chance, active }: { chance: number | null; active: boolean }) {
  return chance !== null && chance >= SHOW_RAIN_FROM ? (
    <span className={`text-[13px] font-semibold leading-[18px] ${active ? "text-rain" : "text-[#0b7f8a] dark:text-rain"}`}>{fmt(chance)}%</span>
  ) : (
    <span aria-hidden="true" className="h-[18px]" />
  );
}

/**
 * The bottom sheet of the home screen: hour-by-hour and day-by-day forecast pills with a two-tab control.
 * Each hourly pill also carries that hour's forecast PM2.5, because this is an air app first.
 */
export function ForecastSheet({ report }: { report: AirReport }) {
  const [tab, setTab] = useState<Tab>("hourly");
  const baseId = useId();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ hourly: null, weekly: null });
  const weather = report.weather ?? null;
  const pmByHour = new Map(report.forecast.map((p) => [p.time.slice(0, 13), p.pm2_5]));
  const hours = weather?.hourly.length
    ? weather.hourly.map((h, i) => ({
        ...h,
        // "Now" shows the sky right now, as the big card does; the hourly value is for the start of the hour
        // and can still say night just before sunrise, or day just before sunset.
        ...(i === 0 && weather.weather_code !== null ? { weather_code: weather.weather_code, is_day: weather.is_day } : {}),
        pm2_5: pmByHour.get(h.time.slice(0, 13)) ?? null,
      }))
    : report.forecast.map((p) => ({
        time: p.time,
        temperature_c: null,
        weather_code: null,
        precipitation_probability: null,
        is_day: true,
        pm2_5: p.pm2_5,
      }));

  const panels = useRef<Record<Tab, HTMLDivElement | null>>({ hourly: null, weekly: null });
  // Mouse users on PC cannot swipe the pill strip, so it gets back/forward buttons.
  const scroll = (direction: 1 | -1) =>
    panels.current[tab]?.scrollBy({ left: direction * (panels.current[tab]?.clientWidth ?? 300) * 0.8, behavior: "smooth" });

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "hourly" ? "weekly" : "hourly";
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section aria-labelledby={`${baseId}-title`} className="card relative overflow-hidden !rounded-[44px] pb-5 pt-2">
      <h2 id={`${baseId}-title`} className="sr-only">
        Forecast
      </h2>
      <span aria-hidden="true" className="mx-auto mb-1 block h-[5px] w-12 rounded-full bg-slate-900/30 lg:invisible" />
      <div role="tablist" aria-label="Forecast" className="relative flex justify-between border-b border-slate-900/15 px-8">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-${id}-tab`}
              aria-selected={active}
              aria-controls={`${baseId}-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={onKey}
              className={`relative min-h-[44px] text-[15px] font-semibold tracking-[-0.02em] transition ${
                active ? "text-slate-950" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-transparent via-iris-light to-transparent transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-3 hidden justify-end gap-2 px-5 [@media(hover:hover)]:flex">
        <button type="button" className="btn-secondary !min-h-[36px] !rounded-full !px-2" onClick={() => scroll(-1)}>
          <ChevronLeft aria-hidden="true" size={18} />
          <span className="sr-only">Earlier</span>
        </button>
        <button type="button" className="btn-secondary !min-h-[36px] !rounded-full !px-2" onClick={() => scroll(1)}>
          <ChevronRight aria-hidden="true" size={18} />
          <span className="sr-only">Later</span>
        </button>
      </div>

      <div
        ref={(el) => {
          panels.current.hourly = el;
        }}
        role="tabpanel"
        id={`${baseId}-hourly`}
        aria-labelledby={`${baseId}-hourly-tab`}
        hidden={tab !== "hourly"}
        className="no-scrollbar mt-4 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [&[hidden]]:hidden"
      >
        <ul className="flex items-start gap-3" aria-label="Next 24 hours">
          {hours.map((h, i) => {
            const { Icon, tone } = weatherLook(h.weather_code, h.is_day);
            return (
              <li key={h.time} className={`pill ${i === 0 ? "pill-active" : ""}`}>
                <span className="whitespace-nowrap text-[14px] font-semibold leading-5 tracking-[-0.04em]">{shortHour(h.time, i === 0)}</span>
                <span className="flex flex-col items-center">
                  {h.weather_code !== null ? (
                    <Icon aria-hidden="true" size={28} strokeWidth={1.6} className={i === 0 ? "text-snow" : tone} />
                  ) : (
                    <span aria-hidden="true" className="h-7" />
                  )}
                  <Rain chance={h.precipitation_probability} active={i === 0} />
                </span>
                <span className="text-xl leading-6 tabular-nums">{h.temperature_c === null ? "–" : `${fmt(h.temperature_c)}°`}</span>
                <span className="text-[11px] font-semibold leading-tight tabular-nums opacity-80">
                  <span aria-hidden="true">PM</span>
                  <span className="sr-only">PM2.5</span> {fmt(h.pm2_5)}
                  <span className="sr-only"> µg/m³</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        ref={(el) => {
          panels.current.weekly = el;
        }}
        role="tabpanel"
        id={`${baseId}-weekly`}
        aria-labelledby={`${baseId}-weekly-tab`}
        hidden={tab !== "weekly"}
        className="no-scrollbar mt-4 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [&[hidden]]:hidden"
      >
        {weather?.daily.length ? (
          <ul className="flex items-start gap-3" aria-label="Next 7 days">
            {weather.daily.map((d, i) => {
              const { Icon, tone } = weatherLook(d.weather_code, true);
              return (
                <li key={d.date} className={`pill ${i === 0 ? "pill-active" : ""}`}>
                  <span className="whitespace-nowrap text-[14px] font-semibold leading-5 tracking-[-0.04em]">{shortDay(d.date, i === 0)}</span>
                  <span className="flex flex-col items-center">
                    <Icon aria-hidden="true" size={28} strokeWidth={1.6} className={i === 0 ? "text-snow" : tone} />
                    <Rain chance={d.precipitation_probability} active={i === 0} />
                  </span>
                  <span className="text-xl leading-6 tabular-nums">
                    <span className="sr-only">High </span>
                    {fmt(d.temp_max_c)}°
                  </span>
                  <span className="text-[13px] font-semibold leading-tight tabular-nums opacity-70">
                    <span className="sr-only">Low </span>
                    {fmt(d.temp_min_c)}°
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 py-6 text-slate-700">The 7-day forecast is not available right now.</p>
        )}
      </div>
    </section>
  );
}
