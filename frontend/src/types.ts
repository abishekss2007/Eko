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

export interface WeatherHour {
  time: string;
  temperature_c: number | null;
  /** WMO weather interpretation code. */
  weather_code: number | null;
  precipitation_probability: number | null;
  is_day: boolean;
}

export interface WeatherDay {
  date: string;
  weather_code: number | null;
  temp_max_c: number | null;
  temp_min_c: number | null;
  precipitation_probability: number | null;
}

export interface WeatherOutlook {
  weather_code: number | null;
  condition: string | null;
  is_day: boolean;
  today_max_c: number | null;
  today_min_c: number | null;
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

export interface AirReport {
  location: { latitude: number; longitude: number; timezone: string | null };
  current: CurrentConditions;
  naqi: NaqiResult;
  inversion: InversionResult;
  best_window: BestWindow | null;
  forecast: HourlyPoint[];
  /** Missing from older servers and when the weather forecast is unavailable. */
  weather?: WeatherOutlook | null;
  simulated: boolean;
  source: string;
}

export interface GeocodeResult {
  name: string;
  /** City or district a locality belongs to. */
  area?: string | null;
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

export interface DemoShieldRequest {
  latitude: number;
  longitude: number;
  simulate: boolean;
  language: "en" | "hi" | "ta" | "bn" | "mr";
}

export interface ShieldRequest extends DemoShieldRequest {
  members: MemberPayload[];
}

/** A family as the server stores it for a signed-in account. */
export interface FamilyMemberDto {
  id: string;
  name: string;
  age_group: AgeGroup;
  sensitivities: Sensitivity[];
  care_note: string;
}

export interface HouseholdDto {
  members: FamilyMemberDto[];
  doctor_phone: string;
  hospital_phone: string;
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

export type Language = ShieldRequest["language"];
export type NarrativeSource = "gemini" | "rules";
export type CostTier = "zero_rupee" | "under_1000" | "under_5000";
export type Mode =
  | "car_petrol_solo"
  | "two_wheeler"
  | "auto_rickshaw"
  | "bus"
  | "metro"
  | "carpool"
  | "walk"
  | "cycle";

interface Located {
  latitude: number;
  longitude: number;
  simulate: boolean;
  language: Language;
}

export interface PlanRequest extends Located {
  members: MemberPayload[];
}

export interface PlanResponse {
  air: AirReport;
  plan: {
    stance: "stay_in" | "limit" | "normal";
    go_out_start: string | null;
    go_out_end: string | null;
    stay_indoors: string[];
    use_purifier: boolean;
    actions: { id: string; text: string }[];
  };
  narrative: { headline: string; steps: string[] };
  narrative_source: NarrativeSource;
}

export interface ActionNarrative {
  summary: string;
  impact_reasoning: string;
  explanations: string[];
}

export interface IndoorRequest extends Located {
  room: { length_m: number; width_m: number; height_m: number };
  cooking_fuel: "lpg" | "induction" | "solid_fuel";
  ventilation: "windows_open_daytime" | "mostly_closed" | "exhaust_fan";
  incense_or_coil: boolean;
  sweeping: "dry" | "wet";
  purifier_cadr_m3h: number;
  filter_age_months: number;
  budget_tier: CostTier;
}

export interface IndoorResponse {
  air: AirReport;
  assessment: {
    room_volume_m3: number;
    target_ach: number;
    required_cadr_m3h: number;
    current_cadr_m3h: number;
    effective_ach: number;
    cadr_gap_m3h: number;
    filter_overdue: boolean;
    pollution_sources: string[];
    fixes: { id: string; title: string; cost_tier: CostTier; impact: "high" | "medium" | "low"; reason: string }[];
  };
  narrative: ActionNarrative;
  narrative_source: NarrativeSource;
}

export interface CommuteRequest extends Located {
  distance_km: number;
  current_mode: Mode;
  departure: string;
  duration_min?: number | null;
  flexible: boolean;
}

export interface ModeOption {
  mode: Mode;
  label: string;
  departure: string;
  duration_min: number;
  ambient_pm2_5: number;
  inhaled_dose_ug: number;
  co2_kg: number;
}

export interface CommuteResponse {
  air: AirReport;
  plan: {
    baseline: ModeOption;
    recommended: ModeOption;
    options: ModeOption[];
    dose_saved_ug: number;
    dose_saved_pct: number;
    co2_saved_kg: number;
    shifted: boolean;
    factors: {
      formula_dose: string;
      formula_co2: string;
      sources: string[];
      modes: Record<string, { label: string; speed_kmh: number; breathing_m3h: number; micro_factor: number; co2_kg_per_km: number }>;
    };
  };
  narrative: ActionNarrative;
  narrative_source: NarrativeSource;
}

export interface CivicRequest extends Located {
  kind: "rwa_advisory" | "burning_report";
  locality: string;
  observation: string;
}

export interface CivicResponse {
  air: AirReport;
  draft: { subject: string; body: string };
  narrative_source: NarrativeSource;
}

export interface DaySummary {
  date: string;
  temp_max_c: number | null;
  temp_max_time: string | null;
  temp_min_c: number | null;
  temp_min_time: string | null;
  precipitation_mm: number | null;
  wind_max_kmh: number | null;
  humidity_mean: number | null;
  pm2_5_mean: number | null;
  pm2_5_peak: number | null;
  naqi: number | null;
  naqi_category: string | null;
  naqi_color: string | null;
}

export interface PeriodRecord {
  value: number;
  date: string;
  time: string | null;
  category: string | null;
}

export interface PeriodRecords {
  hottest: PeriodRecord | null;
  coldest: PeriodRecord | null;
  wettest: PeriodRecord | null;
  windiest: PeriodRecord | null;
  worst_air: PeriodRecord | null;
  cleanest_air: PeriodRecord | null;
  pm2_5_peak: PeriodRecord | null;
  average_naqi: number | null;
  days_poor_or_worse: number;
}

export interface YearRecord {
  value: number;
  date: string;
}

export interface LongTermRecords {
  since: string;
  until: string;
  hottest_day: YearRecord | null;
  coldest_day: YearRecord | null;
  today: {
    month: number;
    day: number;
    record_high: YearRecord | null;
    record_low: YearRecord | null;
    average_high_c: number | null;
    years: number;
  } | null;
  yesterday_vs_average_c: number | null;
}

export interface HistoryReport {
  location: { latitude: number; longitude: number; timezone: string | null };
  days: number;
  yesterday: DaySummary | null;
  daily: DaySummary[];
  records: PeriodRecords;
  long_term: LongTermRecords | null;
  long_term_pending: boolean;
  air_available: boolean;
  sources: string[];
}

export interface HourPoint {
  time: string;
  temperature_c: number | null;
  precipitation_mm: number | null;
  wind_kmh: number | null;
  pm2_5: number | null;
}

export interface DayDetail {
  location: { latitude: number; longitude: number; timezone: string | null };
  summary: DaySummary;
  hours: HourPoint[];
  sources: string[];
}
