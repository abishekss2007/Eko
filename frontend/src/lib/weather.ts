import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudMoonRain,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface WeatherLook {
  Icon: LucideIcon;
  /** Text colour for the icon; the forecast pills and hero share these tones. */
  tone: string;
}

const SUN = "text-[#e8930c] dark:text-[#ffd25e]";
const MOON = "text-[#6d4fd6] dark:text-[#d9ccff]";
const CLOUD = "text-[#7d70c9] dark:text-[#f2f0ff]";
const RAIN = "text-[#0b7f8a] dark:text-rain";
const STORM = "text-[#c98a00] dark:text-[#ffe16b]";

/**
 * A lucide icon and colour for a WMO weather code (https://open-meteo.com/en/docs), day or night.
 * Unknown or missing codes get a plain cloud.
 */
export function weatherLook(code: number | null | undefined, isDay = true): WeatherLook {
  if (code === null || code === undefined) return { Icon: Cloud, tone: CLOUD };
  if (code === 0) return isDay ? { Icon: Sun, tone: SUN } : { Icon: Moon, tone: MOON };
  if (code <= 2) return isDay ? { Icon: CloudSun, tone: SUN } : { Icon: CloudMoon, tone: MOON };
  if (code === 3) return { Icon: Cloud, tone: CLOUD };
  if (code === 45 || code === 48) return { Icon: CloudFog, tone: CLOUD };
  if (code >= 51 && code <= 57) return { Icon: CloudDrizzle, tone: RAIN };
  if ((code >= 61 && code <= 67) || code === 81 || code === 82) return { Icon: CloudRain, tone: RAIN };
  if (code === 80) return isDay ? { Icon: CloudSunRain, tone: RAIN } : { Icon: CloudMoonRain, tone: RAIN };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { Icon: CloudSnow, tone: CLOUD };
  if (code === 95) return { Icon: CloudLightning, tone: STORM };
  if (code === 96 || code === 99) return { Icon: CloudHail, tone: STORM };
  return { Icon: Cloud, tone: CLOUD };
}

/** "13:00" -> "1 PM"; the current hour reads "Now". */
export function shortHour(iso: string, now = false): string {
  if (now) return "Now";
  const h = Number(iso.slice(11, 13));
  if (Number.isNaN(h)) return iso.slice(11, 16);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

/** "2026-11-28" -> "SAT"; the first day reads "Today". */
export function shortDay(isoDate: string, first = false): string {
  if (first) return "Today";
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase();
}
