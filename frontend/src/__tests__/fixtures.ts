import type { AirReport, CivicResponse, DayDetail, DaySummary, HistoryReport, CommuteResponse, IndoorResponse, PlanResponse, ShieldResponse } from "../types";

export const AIR: AirReport = {
  location: { latitude: 28.61, longitude: 77.21, timezone: "Asia/Kolkata" },
  current: {
    time: "2026-11-20T08:00:00",
    pm2_5: 273.4,
    pm10: 410,
    no2: 92,
    temperature_c: 9,
    relative_humidity: 88,
    wind_kmh: 3,
  },
  naqi: {
    value: 418,
    category: "Severe",
    color: "#c00000",
    health_impact: "May cause respiratory effects even on healthy people.",
    dominant_pollutant: "pm2_5",
    sub_indices: [{ pollutant: "pm2_5", concentration: 273.4, index: 418 }],
    is_24h_average: true,
  },
  inversion: {
    detected: true,
    checks: [
      { name: "temperature_below_c", value: 9, threshold: 15, met: true },
      { name: "wind_below_kmh", value: 3, threshold: 8, met: true },
      { name: "pm2_5_above_ug_m3", value: 273.4, threshold: 90, met: true },
    ],
  },
  best_window: {
    start: "2026-11-20T14:00:00",
    end: "2026-11-20T16:00:00",
    mean_pm2_5: 140,
    indicative_aqi: 315,
    category: "Very Poor",
  },
  forecast: Array.from({ length: 24 }, (_, h) => ({
    time: `2026-11-2${h < 16 ? 0 : 1}T${String((h + 8) % 24).padStart(2, "0")}:00:00`,
    pm2_5: h === 6 || h === 7 ? 140 : 270,
  })),
  simulated: true,
  source: "Simulated severe winter smog scenario",
};

export const SHIELD: ShieldResponse = {
  air: AIR,
  risk: {
    members: [{ member_id: "Member_1", risk_level: "emergency", reasons: ["Outdoor air is Severe"] }],
    highest_level: "emergency",
    should_alert: true,
    red_flag_symptoms: ["Chest pain, tightness or pressure"],
  },
  narrative: {
    climate_smog_summary: "Outdoor air is Severe with a NAQI of 418.",
    member_alerts: [
      {
        member_id: "Member_1",
        impact_reasoning: "With PM2.5 at 273.4, Member_1 is at emergency risk.",
        notification_title: "Member_1: Emergency smog risk",
        notification_body: "NAQI 418 (Severe). Stay indoors.",
        stay_safe_steps: ["Keep doors and windows shut.", "Wet-mop instead of sweeping."],
        care_plan_reminder: "Follow your doctor's existing advice.",
      },
    ],
    doctor_handoff_summary: "I am calling about Member_1 (senior, COPD). Outdoor air here is NAQI 418.",
  },
  narrative_source: "rules",
  emergency_numbers: { ambulance: "108", national_emergency: "112" },
  disclaimer: "Not medical advice.",
};

export const PLAN: PlanResponse = {
  air: AIR,
  plan: {
    stance: "stay_in",
    go_out_start: "14:00",
    go_out_end: "16:00",
    stay_indoors: ["Member_1"],
    use_purifier: true,
    actions: [{ id: "go_out", text: "Go out only between 14:00 and 16:00." }],
  },
  narrative: {
    headline: "Severe smog today (NAQI 418): stay indoors, especially Member_1.",
    steps: ["Go out only between 14:00 and 16:00, when PM2.5 averages 140 ug/m3.", "Keep Member_1 indoors today."],
  },
  narrative_source: "rules",
};

export const INDOOR: IndoorResponse = {
  air: AIR,
  assessment: {
    room_volume_m3: 42,
    target_ach: 5,
    required_cadr_m3h: 210,
    current_cadr_m3h: 0,
    effective_ach: 0,
    cadr_gap_m3h: 210,
    filter_overdue: false,
    pollution_sources: ["Dry sweeping stirring up dust"],
    fixes: [
      { id: "close_peak", title: "Keep windows shut", cost_tier: "zero_rupee", impact: "high", reason: "Smog leaks in." },
      { id: "wet_mop", title: "Switch to wet mopping", cost_tier: "zero_rupee", impact: "medium", reason: "Dust." },
    ],
  },
  narrative: {
    summary: "This 42 m3 room needs a purifier delivering about 210 m3/h of clean air.",
    impact_reasoning: "Fine particles seep indoors.",
    explanations: ["Smog leaks in through open windows.", "Dry sweeping throws dust back up."],
  },
  narrative_source: "rules",
};

const option = (mode: "car_petrol_solo" | "metro", label: string, departure: string, dose: number, co2: number) => ({
  mode,
  label,
  departure,
  duration_min: 30,
  ambient_pm2_5: 250,
  inhaled_dose_ug: dose,
  co2_kg: co2,
});

export const COMMUTE: CommuteResponse = {
  air: AIR,
  plan: {
    baseline: option("car_petrol_solo", "Petrol car (alone)", "09:00", 93.4, 1.56),
    recommended: option("metro", "Metro", "11:00", 37.5, 0.36),
    options: [option("metro", "Metro", "09:00", 45, 0.36), option("car_petrol_solo", "Petrol car (alone)", "09:00", 93.4, 1.56)],
    dose_saved_ug: 55.9,
    dose_saved_pct: 60,
    co2_saved_kg: 1.2,
    shifted: true,
    factors: {
      formula_dose: "inhaled_dose_ug = PM2.5 x factor x breathing x hours",
      formula_co2: "co2_kg = distance_km x emission_factor",
      sources: ["US EPA Exposure Factors Handbook (2011)"],
      modes: { metro: { label: "Metro", speed_kmh: 30, breathing_m3h: 0.72, micro_factor: 0.6, co2_kg_per_km: 0.03 } },
    },
  },
  narrative: { summary: "Switching to metro at 11:00 cuts inhaled PM2.5 by 60%.", impact_reasoning: "Less smog reaches you.", explanations: [] },
  narrative_source: "rules",
};

export const CIVIC: CivicResponse = {
  air: AIR,
  draft: { subject: "Request for clean-air measures (NAQI 418)", body: "Dear RWA Committee,\n\nPlease stop open burning." },
  narrative_source: "rules",
};

function day(date: string, high: number, low: number, naqi: number | null, category: string | null): DaySummary {
  return {
    date,
    temp_max_c: high,
    temp_max_time: `${date}T15:00`,
    temp_min_c: low,
    temp_min_time: `${date}T06:00`,
    precipitation_mm: 0,
    wind_max_kmh: 9,
    humidity_mean: 62,
    pm2_5_mean: naqi === null ? null : 120,
    pm2_5_peak: naqi === null ? null : 210,
    naqi,
    naqi_category: category,
    naqi_color: null,
  };
}

export const HISTORY: HistoryReport = {
  location: { latitude: 28.61, longitude: 77.21, timezone: "Asia/Kolkata" },
  days: 7,
  yesterday: day("2026-11-27", 26.4, 12.1, 312, "Very Poor"),
  daily: [
    day("2026-11-21", 25.0, 11.0, 250, "Poor"),
    day("2026-11-22", 25.5, 11.5, 280, "Poor"),
    day("2026-11-23", 24.0, 10.2, 180, "Moderate"),
    day("2026-11-24", 29.8, 13.0, 405, "Severe"),
    day("2026-11-25", 26.0, 12.0, 300, "Poor"),
    day("2026-11-26", 25.2, 11.8, null, null),
    day("2026-11-27", 26.4, 12.1, 312, "Very Poor"),
  ],
  records: {
    hottest: { value: 29.8, date: "2026-11-24", time: "2026-11-24T15:00", category: null },
    coldest: { value: 10.2, date: "2026-11-23", time: "2026-11-23T06:00", category: null },
    wettest: null,
    windiest: { value: 9, date: "2026-11-21", time: null, category: null },
    worst_air: { value: 405, date: "2026-11-24", time: null, category: "Severe" },
    cleanest_air: { value: 180, date: "2026-11-23", time: null, category: "Moderate" },
    pm2_5_peak: { value: 210, date: "2026-11-21", time: "2026-11-21T08:00", category: null },
    average_naqi: 288,
    days_poor_or_worse: 5,
  },
  long_term: {
    since: "1991-01-01",
    until: "2026-11-22",
    hottest_day: { value: 47.2, date: "2024-05-18" },
    coldest_day: { value: 1.9, date: "2003-01-08" },
    today: {
      month: 11,
      day: 28,
      record_high: { value: 31.0, date: "2009-11-28" },
      record_low: { value: 6.4, date: "1996-11-28" },
      average_high_c: 25.1,
      years: 35,
    },
    yesterday_vs_average_c: 1.3,
  },
  long_term_pending: false,
  air_available: true,
  sources: ["Open-Meteo weather (past days)", "Open-Meteo air quality (CAMS, past days)"],
};

export const DAY: DayDetail = {
  location: HISTORY.location,
  summary: day("2026-11-24", 29.8, 13.0, 405, "Severe"),
  hours: Array.from({ length: 24 }, (_, h) => ({
    time: `2026-11-24T${String(h).padStart(2, "0")}:00`,
    temperature_c: 13 + 16.8 * Math.max(0, 1 - Math.abs(h - 15) / 9),
    precipitation_mm: 0,
    wind_kmh: 5,
    pm2_5: h === 8 ? 410 : 200,
  })),
  sources: HISTORY.sources,
};

const ROUTES: [string, unknown][] = [
  ["/api/shield", SHIELD],
  ["/api/plan", PLAN],
  ["/api/indoor", INDOOR],
  ["/api/commute", COMMUTE],
  ["/api/civic", CIVIC],
  ["/api/geocode", []],
  ["/api/family", { members: [], doctor_phone: "", hospital_phone: "" }],
  ["/api/auth/demo", { email: "demo@saanssafe.app", password: "SaansSafe-Demo-2026" }],
  ["/api/history/day", DAY],
  ["/api/history", HISTORY],
  ["/api/air", AIR],
];

export type StubReply = { status: number; body?: unknown };

/** A fetch stub that answers every API route with a fixture. Signed out by default; pass overrides per prefix. */
export function stubFetch(overrides: Record<string, StubReply> = {}): ReturnType<typeof vi.fn> {
  const replies: [string, StubReply][] = [
    ...Object.entries(overrides),
    ["/api/auth/me", { status: 401, body: { detail: "Not signed in." } }],
    ...ROUTES.map(([prefix, body]): [string, StubReply] => [prefix, { status: 200, body }]),
  ];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const reply = replies.find(([prefix]) => url.startsWith(prefix))?.[1] ?? { status: 200, body: AIR };
    if (reply.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
