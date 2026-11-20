/** Backend times are local wall-clock ISO strings without an offset. */
export function hourLabel(iso: string): string {
  return iso.slice(11, 16);
}

export function fmt(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toFixed(digits);
}
