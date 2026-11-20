import type { CSSProperties } from "react";
import { bandStyle } from "../lib/naqi";

// CPCB NAQI bands (upper bound, colour). Same values as tailwind.config.js and assumptions.json.
const BANDS: [number, string][] = [
  [50, "#00b050"],
  [100, "#92d050"],
  [200, "#ffff00"],
  [300, "#ff9900"],
  [400, "#ff0000"],
  [500, "#c00000"],
];
const MAX = 500;
const SEGMENTS = BANDS.map(([top, fill], i) => ({ top, fill, from: BANDS[i - 1]?.[0] ?? 0 }));
const R = 96;
const ARC = `M ${120 - R} 120 A ${R} ${R} 0 0 1 ${120 + R} 120`;

function colourFor(value: number): string {
  return BANDS.find(([top]) => value <= top)?.[1] ?? "#c00000";
}

interface Props {
  value: number;
  category: string;
  /** "lg" for the dashboard, "md" for the landing example. */
  size?: "md" | "lg";
}

/**
 * Half-dial NAQI gauge. The arc sweeps in on load and takes the band colour; the number, the band name and an
 * icon are always shown as text too, so colour is never the only cue. Screen readers get one summary label.
 */
export function NaqiGauge({ value, category, size = "lg" }: Props) {
  const pct = Math.min(100, Math.max(0, (value / MAX) * 100));
  const colour = colourFor(value);
  const { Icon } = bandStyle(category);
  const severe = value > 300;

  return (
    <div
      role="img"
      aria-label={`NAQI gauge: ${value} out of ${MAX}, ${category}`}
      className={`relative mx-auto ${size === "lg" ? "w-full max-w-[320px]" : "w-full max-w-[240px]"}`}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-x-6 top-6 h-2/3 rounded-full blur-3xl ${severe ? "animate-[glow_3s_ease-in-out_infinite]" : ""}`}
        style={{ backgroundColor: colour, opacity: 0.25 }}
      />
      <svg viewBox="0 0 240 128" className="relative w-full" aria-hidden="true">
        {SEGMENTS.map(({ top, fill, from }) => (
            <path
              key={top}
              d={ARC}
              pathLength={MAX}
              fill="none"
              stroke={fill}
              strokeOpacity={0.28}
              strokeWidth={18}
              strokeDasharray={`${top - from - 3} ${MAX}`}
              strokeDashoffset={-from}
            />
        ))}
        <path
          d={ARC}
          pathLength={100}
          fill="none"
          stroke={colour}
          strokeWidth={18}
          strokeLinecap="round"
          strokeDasharray="100 100"
          strokeDashoffset={100 - pct}
          style={{ "--gauge-len": 100, animation: "gauge-sweep 1.1s cubic-bezier(.2,.8,.2,1) both", transition: "stroke-dashoffset .8s ease, stroke .8s ease" } as CSSProperties}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <Icon aria-hidden="true" size={size === "lg" ? 22 : 18} className="mb-0.5 opacity-80" />
        <p className={`font-black leading-none tabular-nums ${size === "lg" ? "text-5xl sm:text-6xl" : "text-4xl"}`}>{value}</p>
        <p className="mt-1 text-sm font-bold uppercase tracking-[0.14em]">{category}</p>
      </div>
    </div>
  );
}
