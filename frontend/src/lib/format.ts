/** Backend times are local wall-clock ISO strings without an offset. */
export function hourLabel(iso: string): string {
  return iso.slice(11, 16);
}

/** "2026-11-25" as "Wed, 25 Nov"; with `year`, "25 Nov 2026". Parsed as a local date, so no day shift. */
export function dayLabel(isoDate: string, year = false): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-IN", year ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" });
}

export function fmt(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toFixed(digits);
}

/** Typeset the ASCII units the backend uses (ug/m3, m3/h, CO2) for display. */
export function pretty(text: string): string {
  return text
    .replace(/\bug\/m3\b/g, "µg/m³")
    .replace(/\bm3\/h\b/g, "m³/h")
    .replace(/\bm3\b/g, "m³")
    .replace(/(\d) ug\b/g, "$1 µg")
    .replace(/\bCO2\b/g, "CO₂")
    .replace(/(\d) C\b/g, "$1 °C");
}

export const RUPEE_TIERS: Record<string, string> = {
  zero_rupee: "₹0",
  under_1000: "Under ₹1,000",
  under_5000: "Under ₹5,000",
};
