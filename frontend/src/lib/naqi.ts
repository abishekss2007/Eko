import { AlertTriangle, Frown, Meh, Siren, Smile, ThumbsUp, type LucideIcon } from "lucide-react";
import type { RiskLevel } from "../types";

interface BandStyle {
  className: string;
  Icon: LucideIcon;
}

// Colour is never the only cue: every badge also has an icon and a text label.
const BANDS: Record<string, BandStyle> = {
  Good: { className: "bg-naqi-good text-black", Icon: Smile },
  Satisfactory: { className: "bg-naqi-satisfactory text-black", Icon: ThumbsUp },
  Moderate: { className: "bg-naqi-moderate text-black", Icon: Meh },
  Poor: { className: "bg-naqi-poor text-black", Icon: Frown },
  "Very Poor": { className: "bg-naqi-verypoor text-black", Icon: AlertTriangle },
  Severe: { className: "bg-naqi-severe text-snow", Icon: Siren },
};

export function bandStyle(category: string): BandStyle {
  return BANDS[category] ?? { className: "bg-slate-200 text-black", Icon: Meh };
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very high",
  emergency: "Emergency",
};

export const RISK_CLASSES: Record<RiskLevel, string> = {
  low: "border-green-700 bg-green-50 text-green-900",
  moderate: "border-yellow-700 bg-yellow-50 text-yellow-900",
  high: "border-orange-700 bg-orange-50 text-orange-900",
  very_high: "border-red-700 bg-red-50 text-red-900",
  emergency: "border-red-900 bg-red-900 text-white",
};

export function isAlertLevel(level: RiskLevel): boolean {
  return level === "high" || level === "very_high" || level === "emergency";
}
