import { Activity, Clock, Home, Leaf, PhoneCall, PlayCircle, ShieldCheck, Sparkles, TrainFront } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AirDashboard } from "./components/AirDashboard";
import { BestWindowChart } from "./components/BestWindowChart";
import { CivicDrafter } from "./components/CivicDrafter";
import { CommutePlanner } from "./components/CommutePlanner";
import { DemoBar } from "./components/DemoBar";
import { HouseholdEditor } from "./components/HouseholdEditor";
import { ImpactTracker } from "./components/ImpactTracker";
import { IndoorPlanner } from "./components/IndoorPlanner";
import { LocationBar, QUICK_PICKS } from "./components/LocationBar";
import { Section } from "./components/Section";
import { ShieldResults } from "./components/ShieldResults";
import { SosPanel } from "./components/SosPanel";
import { TodayPlan } from "./components/TodayPlan";
import { useAsync } from "./hooks/useAsync";
import { useDebounced } from "./hooks/useDebounced";
import { useDemo } from "./hooks/useDemo";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSmogNotification } from "./hooks/useSmogNotification";
import { fetchAir, fetchPlan, fetchShield } from "./lib/api";
import { fmt, pretty } from "./lib/format";
import { EMPTY_HOUSEHOLD, parseHousehold, tokenize, untokenize, type Household } from "./lib/household";
import { parseImpact, today, type ImpactEntry } from "./lib/impact";
import { LANGUAGES, useLanguage } from "./lib/language";
import { isAlertLevel } from "./lib/naqi";
import { speak, stopSpeaking } from "./lib/speech";
import type { AirReport, Language, Place } from "./types";

// Indian emergency lines, kept client-side so SOS works offline (source: assumptions.json).
const AMBULANCE = "108";
const EMERGENCY = "112";
const DEFAULT_PLACE = QUICK_PICKS[0] as Place;

/** Shown only during the guided demo; never saved over the family's own data. */
const DEMO_HOUSEHOLD: Household = {
  members: [
    {
      id: "demo-dadi",
      name: "Dadi",
      ageGroup: "senior",
      sensitivities: ["copd"],
      careNote: "Dr. Sharma: keep the nebulizer ready in winter and skip the morning walk.",
    },
    { id: "demo-aarav", name: "Aarav", ageGroup: "child", sensitivities: ["asthma"], careNote: "Rescue inhaler in school bag." },
  ],
  doctorPhone: "",
  hospitalPhone: "",
};

const NAV = [
  ["today", "Today"],
  ["air", "Air"],
  ["shield", "Family"],
  ["sos", "SOS"],
  ["indoor", "Home air"],
  ["commute", "Commute"],
  ["impact", "Impact"],
] as const;

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
  const { language, setLanguage } = useLanguage();
  const [place, setPlace] = useLocalStorage<Place>("saanssafe.place", parsePlace, DEFAULT_PLACE);
  const [savedHousehold, setHousehold] = useLocalStorage("saanssafe.household", parseHousehold, EMPTY_HOUSEHOLD);
  const [impact, setImpact] = useLocalStorage<ImpactEntry[]>("saanssafe.impact", parseImpact, []);
  const [simulate, setSimulate] = useState(false);
  const [demoCommute, setDemoCommute] = useState(0);
  const [demoFamily, setDemoFamily] = useState(false);

  const household = demoFamily ? DEMO_HOUSEHOLD : savedHousehold;
  const members = household.members;
  const context = { latitude: place.latitude, longitude: place.longitude, simulate, language };

  const airKey = `${place.latitude},${place.longitude},${simulate}`;
  const air = useAsync(airKey, (signal) => fetchAir(place.latitude, place.longitude, simulate, signal));

  const payload = useMemo(() => tokenize(members), [members]);
  const familyKey = useDebounced(`${airKey}|${language}|${JSON.stringify(payload)}`, 600);
  const plan = useAsync(familyKey, (signal) => fetchPlan({ ...context, members: payload }, signal));
  const shield = useAsync(payload.length ? familyKey : null, (signal) =>
    fetchShield({ ...context, members: payload }, signal),
  );

  const result = payload.length ? shield.data : null;
  const report = result?.air ?? air.data;
  const show = useCallback((text: string) => pretty(untokenize(text, members)), [members]);

  const alert = useMemo(() => {
    if (!result?.risk.should_alert) return null;
    const top = result.risk.members.find((m) => m.risk_level === result.risk.highest_level);
    const text = result.narrative.member_alerts.find((a) => a.member_id === top?.member_id);
    if (!text) return null;
    return { key: `${familyKey}|${result.risk.highest_level}`, title: show(text.notification_title), body: show(text.notification_body) };
  }, [result, familyKey, show]);
  const notifications = useSmogNotification(alert);

  const handoff = result ? show(result.narrative.doctor_handoff_summary) : basicHandoff(report);
  const urgent = result?.risk.members.some((m) => isAlertLevel(m.risk_level)) ?? false;

  const demo = useDemo(
    (action) => {
      if (action === "simulate") {
        setSimulate(true);
        setDemoFamily(true);
      } else if (action === "speak") speak(handoff);
      else if (action === "commute") {
        stopSpeaking();
        setDemoCommute((n) => n + 1);
      }
    },
    () => {
      stopSpeaking();
      setDemoFamily(false);
    },
  );

  const logCommute = (entry: { label: string; dose_ug: number; co2_kg: number }) =>
    setImpact((all) => [...all, { id: crypto.randomUUID(), date: today(), ...entry }]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header id="top" className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-2xl font-extrabold">SaansSafe</p>
            <p className="text-slate-200">Winter smog alerts and a one-tap SOS for your family</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="language" className="sr-only">
              Language for advice and read-aloud
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="min-h-[44px] rounded-lg border-2 border-slate-400 bg-slate-800 px-2 text-white"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-light" onClick={demo.active ? demo.stop : demo.start}>
              <PlayCircle aria-hidden="true" size={18} /> {demo.active ? "Stop demo" : "60-second demo"}
            </button>
            <a href="#sos" className="btn-danger">
              <PhoneCall aria-hidden="true" size={18} /> SOS
            </a>
          </div>
        </div>
        <nav aria-label="Sections" className="border-t border-slate-700">
          <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded px-3 text-slate-100 hover:bg-slate-800">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className={`mx-auto max-w-6xl space-y-6 px-4 py-6 ${demo.active ? "pb-40" : ""}`}>
        <h1 className="sr-only">SaansSafe family smog dashboard</h1>
        <Section id="location" title="Where are you?" icon={<Activity aria-hidden="true" />}>
          <LocationBar place={place} onPlace={setPlace} simulate={simulate} onSimulate={setSimulate} />
        </Section>

        <div id="today" className="scroll-mt-4">
          <Section id="today-plan" title="Today's plan" icon={<Sparkles aria-hidden="true" />}>
            <TodayPlan data={plan.data} members={members} loading={plan.loading} />
            {plan.error && !plan.data && (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-red-900">
                {plan.error}
              </p>
            )}
          </Section>
        </div>

        <div id="air" className="scroll-mt-4">
          <Section id="air-now" title={`Air right now${report?.simulated ? " (simulated)" : ""}`}>
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
        </div>

        {report && (
          <Section id="window" title="Best time to go outside" icon={<Clock aria-hidden="true" />}>
            <BestWindowChart forecast={report.forecast} window={report.best_window} />
          </Section>
        )}

        <div id="shield" className="scroll-mt-4">
          <Section id="shield-panel" title="Family Health Shield" icon={<ShieldCheck aria-hidden="true" />}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div>
                {demoFamily && (
                  <p className="mb-3 rounded-lg bg-amber-100 p-3 text-amber-950">
                    Showing a demo family. Your own family details are untouched.
                  </p>
                )}
                <HouseholdEditor household={household} onChange={demoFamily ? () => {} : setHousehold} />
              </div>
              <div aria-live="polite" aria-busy={shield.loading}>
                {!payload.length && <p>Add your family members to get personal smog alerts and stay-safe steps.</p>}
                {shield.loading && payload.length > 0 && <p>Checking your family&apos;s risk…</p>}
                {shield.error && (
                  <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
                    {shield.error}
                  </p>
                )}
                {result && (
                  <ShieldResults
                    result={result}
                    members={members}
                    notificationPermission={notifications.permission}
                    onEnableNotifications={notifications.request}
                  />
                )}
              </div>
            </div>
          </Section>
        </div>

        <div id="sos" tabIndex={-1} className={`scroll-mt-4 ${urgent ? "rounded-2xl ring-4 ring-red-800" : ""}`}>
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

        <div id="indoor" className="scroll-mt-4">
          <Section id="indoor-panel" title="Clean air at home" icon={<Home aria-hidden="true" />}>
            <IndoorPlanner context={context} />
          </Section>
        </div>

        <div id="commute" className="scroll-mt-4">
          <Section id="commute-panel" title="Cleaner, low-emission commute" icon={<TrainFront aria-hidden="true" />}>
            <CommutePlanner context={context} onLog={logCommute} demoRun={demoCommute} />
          </Section>
        </div>

        <div id="impact" className="scroll-mt-4">
          <Section id="impact-panel" title="Your clean-air impact" icon={<Leaf aria-hidden="true" />}>
            <ImpactTracker entries={impact} onChange={setImpact} />
            <h3 className="mb-3 mt-6 text-lg font-bold">Act together: draft a note for your neighbours</h3>
            <CivicDrafter context={context} />
          </Section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-slate-700">
          SaansSafe gives general air-quality guidance, not medical advice. It does not diagnose or prescribe. In an
          emergency call {AMBULANCE} or {EMERGENCY}, or your doctor. Air data: Open-Meteo (CAMS). Index: CPCB NAQI.
          Advice language: {LANGUAGES.find((l) => l.code === language)?.label}.
        </p>
      </footer>

      {demo.current && <DemoBar step={demo.step} current={demo.current} onNext={demo.next} onStop={demo.stop} />}
    </>
  );
}
