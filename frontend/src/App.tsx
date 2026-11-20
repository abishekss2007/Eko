import { Activity, Clock, PhoneCall, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { AirDashboard } from "./components/AirDashboard";
import { BestWindowChart } from "./components/BestWindowChart";
import { HouseholdEditor } from "./components/HouseholdEditor";
import { LocationBar, QUICK_PICKS } from "./components/LocationBar";
import { Section } from "./components/Section";
import { ShieldResults } from "./components/ShieldResults";
import { SosPanel } from "./components/SosPanel";
import { useAsync } from "./hooks/useAsync";
import { useDebounced } from "./hooks/useDebounced";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSmogNotification } from "./hooks/useSmogNotification";
import { fetchAir, fetchShield } from "./lib/api";
import { fmt } from "./lib/format";
import { EMPTY_HOUSEHOLD, parseHousehold, tokenize, untokenize } from "./lib/household";
import { isAlertLevel } from "./lib/naqi";
import type { AirReport, Place } from "./types";

// Indian emergency lines, kept client-side so SOS works offline (source: assumptions.json).
const AMBULANCE = "108";
const EMERGENCY = "112";
const DEFAULT_PLACE = QUICK_PICKS[0] as Place;

function parsePlace(raw: unknown): Place {
  const p = raw as Partial<Place> | null;
  return p &&
    typeof p.name === "string" &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number" &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
    ? { name: p.name.slice(0, 80), latitude: p.latitude, longitude: p.longitude }
    : DEFAULT_PLACE;
}

function basicHandoff(air: AirReport | null): string {
  if (!air) return "I am calling about a family member who is having trouble breathing. Please tell us what to do now.";
  return (
    `I am calling about a family member who is having trouble breathing. Outdoor air here is NAQI ${air.naqi.value} ` +
    `(${air.naqi.category}), PM2.5 ${fmt(air.current.pm2_5)} µg/m³, temperature ${fmt(air.current.temperature_c)} °C. ` +
    "Please tell us what to do right now."
  );
}

export default function App() {
  const [place, setPlace] = useLocalStorage<Place>("saanssafe.place", parsePlace, DEFAULT_PLACE);
  const [household, setHousehold] = useLocalStorage("saanssafe.household", parseHousehold, EMPTY_HOUSEHOLD);
  const [simulate, setSimulate] = useState(false);

  const airKey = `${place.latitude},${place.longitude},${simulate}`;
  const air = useAsync(airKey, (signal) => fetchAir(place.latitude, place.longitude, simulate, signal));

  const payload = useMemo(() => tokenize(household.members), [household.members]);
  const shieldKey = useDebounced(payload.length ? `${airKey}|${JSON.stringify(payload)}` : null, 700);
  const shield = useAsync(shieldKey, (signal) =>
    fetchShield(
      { latitude: place.latitude, longitude: place.longitude, simulate, language: "en", members: payload },
      signal,
    ),
  );

  const result = shield.data;
  const report = result?.air ?? air.data;
  const alert = useMemo(() => {
    if (!result?.risk.should_alert) return null;
    const top = result.risk.members.find((m) => m.risk_level === result.risk.highest_level);
    const text = result.narrative.member_alerts.find((a) => a.member_id === top?.member_id);
    if (!text) return null;
    return {
      key: `${shieldKey}|${result.risk.highest_level}`,
      title: untokenize(text.notification_title, household.members),
      body: untokenize(text.notification_body, household.members),
    };
  }, [result, shieldKey, household.members]);
  const notifications = useSmogNotification(alert);

  const handoff = result
    ? untokenize(result.narrative.doctor_handoff_summary, household.members)
    : basicHandoff(report);
  const urgent = result?.risk.members.some((m) => isAlertLevel(m.risk_level)) ?? false;

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-2xl font-extrabold">SaansSafe</h1>
            <p className="text-slate-200">Winter smog alerts and a one-tap SOS for your family</p>
          </div>
          <a href="#sos" className="btn-danger">
            <PhoneCall aria-hidden="true" size={18} /> Emergency SOS
          </a>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Section id="location" title="Where are you?" icon={<Activity aria-hidden="true" />}>
          <LocationBar place={place} onPlace={setPlace} simulate={simulate} onSimulate={setSimulate} />
        </Section>

        <Section id="air" title={`Air right now${report?.simulated ? " (simulated)" : ""}`}>
          <div aria-live="polite" aria-busy={air.loading}>
            {air.error && !report && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
                {air.error}
              </p>
            )}
            {!report && air.loading && <p>Loading air quality…</p>}
            {report && <AirDashboard report={report} placeName={place.name} />}
          </div>
        </Section>

        {report && (
          <Section id="window" title="Best time to go outside" icon={<Clock aria-hidden="true" />}>
            <BestWindowChart forecast={report.forecast} window={report.best_window} />
          </Section>
        )}

        <Section id="shield" title="Family Health Shield" icon={<ShieldCheck aria-hidden="true" />}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <HouseholdEditor household={household} onChange={setHousehold} />
            <div aria-live="polite" aria-busy={shield.loading}>
              {!payload.length && <p>Add your family members to get personal smog alerts and stay-safe steps.</p>}
              {shield.loading && <p>Checking your family&apos;s risk…</p>}
              {shield.error && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
                  {shield.error}
                </p>
              )}
              {result && payload.length > 0 && (
                <ShieldResults
                  result={result}
                  members={household.members}
                  notificationPermission={notifications.permission}
                  onEnableNotifications={notifications.request}
                />
              )}
            </div>
          </div>
        </Section>

        <div id="sos" tabIndex={-1} className={urgent ? "rounded-2xl ring-4 ring-red-800" : undefined}>
          <Section id="sos-panel" title="Emergency SOS" icon={<PhoneCall aria-hidden="true" />}>
            <SosPanel
              doctorPhone={household.doctorPhone}
              hospitalPhone={household.hospitalPhone}
              ambulance={result?.emergency_numbers.ambulance ?? AMBULANCE}
              emergency={result?.emergency_numbers.national_emergency ?? EMERGENCY}
              handoff={handoff}
              redFlags={result?.risk.red_flag_symptoms ?? []}
            />
          </Section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-slate-700">
          SaansSafe gives general air-quality guidance, not medical advice. It does not diagnose or prescribe. In an
          emergency call {AMBULANCE} or {EMERGENCY}, or your doctor. Air data: Open-Meteo (CAMS). Index: CPCB NAQI.
        </p>
      </footer>
    </>
  );
}
