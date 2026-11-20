import type { AirReport, ShieldResponse } from "../types";

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

/** A fetch stub that answers the three API routes. */
export function stubFetch(): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.startsWith("/api/shield") ? SHIELD : url.startsWith("/api/geocode") ? [] : AIR;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
