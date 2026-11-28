import { Search } from "lucide-react";
import type { CSSProperties } from "react";
import { fmt } from "../lib/format";
import { bandStyle } from "../lib/naqi";
import { weatherLook } from "../lib/weather";
import type { AirReport } from "../types";

interface Props {
  report: AirReport | null;
  placeName: string;
  loading: boolean;
  onChangePlace: () => void;
}

/** Smog shows as a veil over the sky: clear at NAQI 0, thickest from about 400. */
function hazeFor(naqi: number | undefined): number {
  return naqi === undefined ? 0 : Math.min(0.55, Math.max(0, (naqi - 50) / 550));
}

/**
 * The weather-app top of the home screen: place, a big temperature, the sky in words, today's high and low,
 * and the air quality right under it. Everything is text first; the sky picture is decoration.
 */
export function WeatherHero({ report, placeName, loading, onChangePlace }: Props) {
  const weather = report?.weather ?? null;
  const { Icon, tone } = weatherLook(weather?.weather_code, weather?.is_day ?? true);
  const band = report ? bandStyle(report.naqi.category) : null;
  const haze = hazeFor(report?.naqi.value);

  return (
    <section aria-labelledby="hero-place" className="relative isolate overflow-hidden pb-2 pt-4 text-center sm:pt-8">
      <div aria-hidden="true" className="hero-sky absolute inset-x-0 -top-24 bottom-0 -z-10" />
      <div
        aria-hidden="true"
        className="smog-veil absolute -inset-x-10 -top-24 bottom-0 -z-10 transition-opacity duration-700"
        style={{ opacity: haze } as CSSProperties}
      />

      <h2 id="hero-place" className="mx-auto max-w-[18ch] truncate text-[34px] font-normal leading-[41px] tracking-[0.01em] text-slate-950">
        {placeName}
        {report?.simulated && <span className="sr-only"> (simulated smog)</span>}
      </h2>

      {report ? (
        <>
          <p className="mt-1 text-[96px] font-thin leading-[96px] tracking-tight text-slate-950 tabular-nums">
            <span aria-hidden="true">{fmt(report.current.temperature_c)}°</span>
            <span className="sr-only">Temperature {fmt(report.current.temperature_c)} °C</span>
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-600">{weather?.condition ?? "Weather now"}</p>
          {weather && (weather.today_max_c !== null || weather.today_min_c !== null) && (
            <p className="text-xl font-semibold text-slate-950">
              <span aria-hidden="true">H:{fmt(weather.today_max_c)}°</span>
              <span className="sr-only">High {fmt(weather.today_max_c)} °C, </span>
              <span aria-hidden="true" className="ml-4">
                L:{fmt(weather.today_min_c)}°
              </span>
              <span className="sr-only">low {fmt(weather.today_min_c)} °C</span>
            </p>
          )}
          <div className="relative mx-auto my-3 grid h-36 w-36 place-items-center sm:h-40 sm:w-40">
            <span aria-hidden="true" className="absolute inset-4 rounded-full bg-iris-light/40 blur-2xl" />
            <Icon aria-hidden="true" strokeWidth={1.4} className={`relative h-full w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)] ${tone}`} />
          </div>
          {band && (
            <p className="flex flex-wrap items-center justify-center gap-2 text-base font-semibold text-slate-900">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${band.className}`}>
                <band.Icon aria-hidden="true" size={15} />
                NAQI {report.naqi.value} · {report.naqi.category}
              </span>
              <span className="text-slate-600">PM2.5 {fmt(report.current.pm2_5)} µg/m³</span>
              {report.simulated && (
                <span className="rounded-full bg-sun px-2 py-0.5 text-xs font-bold text-ink-950">Simulated</span>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="py-16 text-lg text-slate-600" aria-busy={loading}>
          {loading ? "Loading the weather and air…" : "Weather and air are not available right now."}
        </p>
      )}

      <button type="button" onClick={onChangePlace} className="btn-ghost mx-auto mt-3 !min-h-[40px] !rounded-full !px-4 text-sm">
        <Search aria-hidden="true" size={16} /> Change place
      </button>
    </section>
  );
}
