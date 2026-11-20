// Mirrors backend/app/schemas. Every number here was computed by the backend engines.

export type RiskLevel = "low" | "moderate" | "high" | "very_high" | "emergency";
export type AgeGroup = "infant" | "child" | "adult" | "senior";
export type Sensitivity = "asthma" | "copd" | "heart_disease" | "pregnancy" | "diabetes";
export type Pollutant = "pm2_5" | "pm10" | "no2";

export interface CurrentConditions {
  time: string;
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  temperature_c: number | null;
  relative_humidity: number | null;
  wind_kmh: number | null;
}

export interface NaqiResult {
  value: number;
  category: string;
  color: string;
  health_impact: string;
  dominant_pollutant: Pollutant;
  sub_indices: { pollutant: Pollutant; concentration: number; index: number }[];
  is_24h_average: boolean;
}

export interface InversionResult {
  detected: boolean;
  checks: { name: string; value: number | null; threshold: number; met: boolean }[];
}

export interface HourlyPoint {
  time: string;
  pm2_5: number | null;
}

export interface BestWindow {
  start: string;
  end: string;
  mean_pm2_5: number;
  indicative_aqi: number;
  category: string;
}

export interface AirReport {
  location: { latitude: number; longitude: number; timezone: string | null };
  current: CurrentConditions;
  naqi: NaqiResult;
  inversion: InversionResult;
  best_window: BestWindow | null;
  forecast: HourlyPoint[];
  simulated: boolean;
  source: string;
}

export interface GeocodeResult {
  name: string;
  admin1: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

export interface MemberPayload {
  member_id: string;
  age_group: AgeGroup;
  sensitivities: Sensitivity[];
  care_note: string;
}

export interface ShieldRequest {
  latitude: number;
  longitude: number;
  simulate: boolean;
  language: "en" | "hi" | "ta" | "bn" | "mr";
  members: MemberPayload[];
}

export interface MemberRisk {
  member_id: string;
  risk_level: RiskLevel;
  reasons: string[];
}

export interface MemberShieldText {
  member_id: string;
  impact_reasoning: string;
  notification_title: string;
  notification_body: string;
  stay_safe_steps: string[];
  care_plan_reminder: string;
}

export interface ShieldResponse {
  air: AirReport;
  risk: {
    members: MemberRisk[];
    highest_level: RiskLevel;
    should_alert: boolean;
    red_flag_symptoms: string[];
  };
  narrative: {
    climate_smog_summary: string;
    member_alerts: MemberShieldText[];
    doctor_handoff_summary: string;
  };
  narrative_source: "gemini" | "rules";
  emergency_numbers: { ambulance: string; national_emergency: string };
  disclaimer: string;
}

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}
