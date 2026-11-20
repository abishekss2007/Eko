/** Impact log, stored only in this browser. Numbers come from the commute engine. */
export interface ImpactEntry {
  id: string;
  date: string;
  label: string;
  dose_ug: number;
  co2_kg: number;
}

export const HABITS = [
  "Skipped incense or mosquito coils",
  "Wet-mopped instead of sweeping",
  "Aired the home only in the clean window",
  "Wore an N95 outside",
  "Reported or stopped open burning",
] as const;

export function parseImpact(raw: unknown): ImpactEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is ImpactEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.id === "string" &&
        typeof e.date === "string" &&
        typeof e.label === "string" &&
        Number.isFinite(e.dose_ug) &&
        Number.isFinite(e.co2_kg),
    )
    .slice(-500);
}

export function totals(entries: ImpactEntry[]) {
  return {
    dose_ug: entries.reduce((s, e) => s + Math.max(0, e.dose_ug), 0),
    co2_kg: entries.reduce((s, e) => s + Math.max(0, e.co2_kg), 0),
    actions: entries.length,
    days: new Set(entries.map((e) => e.date)).size,
  };
}

export function today(): string {
  return new Date().toLocaleDateString("en-CA");
}
