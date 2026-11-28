import { Clock, History, Home, Leaf, MapPin, PhoneCall, PlayCircle, ShieldCheck, Sparkles, TrainFront, Wind } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AirDashboard } from "./components/AirDashboard";
import { BestWindowChart } from "./components/BestWindowChart";
import { CivicDrafter } from "./components/CivicDrafter";
import { CommutePlanner } from "./components/CommutePlanner";
import { AccountMenu } from "./components/AccountMenu";
import { DateStrip, DayView } from "./components/DayPicker";
import { DemoBar } from "./components/DemoBar";
import { FamilySignInPrompt } from "./components/FamilySignInPrompt";
import { HistoryPanel } from "./components/HistoryPanel";
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
import { useFamily } from "./hooks/useFamily";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSmogNotification } from "./hooks/useSmogNotification";
import { fetchAir, fetchDemoShield, fetchPlan, fetchShield } from "./lib/api";
import { useAuth } from "./lib/auth";
import { fmt, pretty } from "./lib/format";
import { tokenize, untokenize, type Household } from "./lib/household";
import { parseImpact, today, type ImpactEntry } from "./lib/impact";
import { LANGUAGES, useLanguage } from "./lib/language";
import { isAlertLevel } from "./lib/naqi";
import { Link } from "./lib/router";
import { ThemeToggle } from "./lib/theme";
import { speak, stopSpeaking } from "./lib/speech";
import type { AirReport, Language, Place } from "./types";

// Indian emergency lines, kept client-side so SOS works offline (source: assumptions.json).
const AMBULANCE = "108";
const EMERGENCY = "112";
const DEFAULT_PLACE = QUICK_PICKS[0] as Place;

/**
 * Shown only during the guided demo; never saved over the family's own data.
 * Same people, in the same order, as the server's demo family (Member_1 = Dadi...).
 */
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
    { id: "demo-meera", name: "Meera", ageGroup: "adult", sensitivities: ["pregnancy"], careNote: "" },
    { id: "demo-raj", name: "Raj", ageGroup: "adult", sensitivities: [], careNote: "" },
  ],
  doctorPhone: "",
  hospitalPhone: "",
};

const SAVE_STATUS = {
  idle: "",
  loading: "Loading your family…",
  saving: "Saving to your account…",
  saved: "Saved to your account.",
  error: "",
} as const;

const VIEWS = [
  { id: "today", label: "Today", title: "Today", Icon: Sparkles },
  { id: "family", label: "Family", title: "Family & SOS", Icon: ShieldCheck },
  { id: "home", label: "Home air", title: "Clean air at home", Icon: Home },
  { id: "history", label: "History", title: "Weather and air history", Icon: History },
  { id: "commute", label: "Commute", title: "Cleaner commute", Icon: TrainFront },
  { id: "impact", label: "Impact", title: "Your impact", Icon: Leaf },
] as const;
type View = (typeof VIEWS)[number]["id"];

// Old in-page anchors and demo targets map onto the view that holds them.
const VIEW_FOR: Record<string, View> = {
  today: "today",
  air: "today",
  top: "today",
  family: "family",
  shield: "family",
  sos: "family",
  home: "home",
  indoor: "home",
  commute: "commute",
  history: "history",
  records: "history",
  impact: "impact",
};

function viewFromHash(): View {
  return VIEW_FOR[window.location.hash.slice(1)] ?? "today";
}

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

export default function Dashboard({ startDemo = false }: { startDemo?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const [place, setPlace] = useLocalStorage<Place>("saanssafe.place", parsePlace, DEFAULT_PLACE);
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const family = useFamily(user ? user.id : null);
  const [impact, setImpact] = useLocalStorage<ImpactEntry[]>("saanssafe.impact", parseImpact, []);
  const [simulate, setSimulate] = useState(false);
  const [demoCommute, setDemoCommute] = useState(0);
  const [demoFamily, setDemoFamily] = useState(false);
  // A past day picked on the home page; it belongs to one place, so a new place starts on today.
  const placeKey = `${place.latitude},${place.longitude}`;
  const [picked, setPicked] = useState<{ place: string; day: string | null }>({ place: placeKey, day: null });

  const household = demoFamily ? DEMO_HOUSEHOLD : family.household;
  const members = household.members;
  // Guests can watch the demo family but never send a family of their own; the server enforces this.
  const guestDemo = demoFamily && !signedIn;
  const context = { latitude: place.latitude, longitude: place.longitude, simulate, language };

  const airKey = `${place.latitude},${place.longitude},${simulate}`;
  const air = useAsync(airKey, (signal) => fetchAir(place.latitude, place.longitude, simulate, signal));

  const payload = useMemo(() => tokenize(members), [members]);
  const familyKey = useDebounced(`${airKey}|${language}|${JSON.stringify(payload)}`, 600);
  const plan = useAsync(`${familyKey}|${guestDemo}`, (signal) =>
    fetchPlan({ ...context, members: guestDemo ? [] : payload }, signal),
  );
  const shield = useAsync(payload.length ? `${familyKey}|${guestDemo}` : null, (signal) =>
    guestDemo ? fetchDemoShield(context, signal) : fetchShield({ ...context, members: payload }, signal),
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
    startDemo,
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
      setDemoCommute(0);
    },
  );

  const [chosenView, setChosenView] = useState<View>(viewFromHash);
  // During the guided demo the view follows the demo step; afterwards it returns to the user's choice.
  const view: View = demo.current ? (VIEW_FOR[demo.current.target] ?? "today") : chosenView;
  const viewRefs = useRef<Partial<Record<View, HTMLDivElement | null>>>({});

  const openView = (next: View, focusId?: string) => {
    setChosenView(next);
    window.history.replaceState(null, "", `#${next}`);
    window.setTimeout(() => {
      const target = (focusId && document.getElementById(focusId)) || viewRefs.current[next];
      target?.focus({ preventScroll: true });
      if (focusId) target?.scrollIntoView({ block: "start" });
      else window.scrollTo?.({ top: 0 });
    }, 0);
  };
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const pickedDay = picked.place === placeKey && !demo.active ? picked.day : null;
  const pickDay = (day: string | null) => setPicked({ place: placeKey, day });

  const logCommute = (entry: { label: string; dose_ug: number; co2_kg: number }) =>
    setImpact((all) => [...all, { id: crypto.randomUUID(), date: today(), ...entry }]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <nav
        aria-label="App sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur-lg lg:inset-y-0 lg:left-0 lg:right-auto lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-t-0 lg:bg-white lg:px-4 lg:py-6"
      >
        <Link href="/" className="mb-8 hidden items-center gap-2 px-3 text-xl font-black text-slate-900 lg:flex" aria-label="SaansSafe home">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-sky-600 text-snow">
            <Wind size={20} />
          </span>
          SaansSafe
        </Link>
        <ul className="mx-auto grid max-w-xl grid-cols-6 lg:mx-0 lg:max-w-none lg:grid-cols-1 lg:gap-1">
          {VIEWS.map(({ id, label, Icon }) => {
            const active = view === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => openView(id)}
                  className={`group flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold transition lg:min-h-[44px] lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-base ${
                    active ? "text-teal-800 lg:bg-teal-50" : "text-slate-700 hover:text-slate-900 lg:hover:bg-slate-100"
                  }`}
                >
                  <span
                    className={`grid h-8 w-12 place-items-center rounded-full transition lg:h-auto lg:w-auto ${active ? "bg-teal-100 lg:bg-transparent" : ""}`}
                  >
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto hidden rounded-2xl bg-slate-100 p-4 text-sm text-slate-700 lg:block">
          <p className="mb-1 font-bold text-slate-900">Private by design</p>
          Your family is saved to your account. The AI only ever sees codes like Member_1, never names.
        </div>
      </nav>

      <div className="lg:pl-64">
        <header id="top" className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/85 backdrop-blur-lg">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-black text-slate-900 lg:hidden" aria-label="SaansSafe home">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-500 to-sky-600 text-snow">
                <Wind size={18} />
              </span>
              <span className="hidden sm:inline">SaansSafe</span>
            </Link>
            <p className="hidden text-2xl font-bold text-slate-900 lg:block" aria-hidden="true">
              {current.title}
            </p>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <label htmlFor="language" className="sr-only">
                Language for advice and read-aloud
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="min-h-[44px] max-w-[6.5rem] rounded-xl border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 sm:max-w-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary !px-3"
                onClick={demo.active ? demo.stop : demo.start}
              >
                <PlayCircle aria-hidden="true" size={18} />
                <span className="sr-only sm:not-sr-only">{demo.active ? "Stop demo" : "60-second demo"}</span>
              </button>
              <ThemeToggle />
              <a
                href="#sos"
                className="btn-danger !px-3 sm:!px-4"
                onClick={(e) => {
                  e.preventDefault();
                  openView("family", "sos");
                }}
              >
                <PhoneCall aria-hidden="true" size={18} /> SOS
              </a>
              <AccountMenu />
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className={`mx-auto max-w-6xl px-4 pb-32 pt-6 lg:pb-12 ${demo.active ? "!pb-56" : ""}`}>
          <h1 className="sr-only">SaansSafe family smog dashboard</h1>

          <div
            hidden={view !== "today"}
            ref={(el) => {
              viewRefs.current.today = el;
            }}
            role="region"
            tabIndex={-1}
            aria-label="Today"
            className="view-enter space-y-6"
          >
            <section aria-labelledby="location-title" className="card p-4 sm:p-5">
              <h2 id="location-title" className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                <MapPin aria-hidden="true" size={16} /> Where are you?
              </h2>
              <LocationBar place={place} onPlace={setPlace} simulate={simulate} onSimulate={setSimulate} />
            </section>

            <DateStrip place={place} report={report} selected={pickedDay} onSelect={pickDay} />

            {pickedDay && <DayView place={place} day={pickedDay} onBack={() => pickDay(null)} />}

            <div hidden={pickedDay !== null} className={`${pickedDay ? "hidden" : "grid"} gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`}>
              <div id="air" className="scroll-mt-24">
                <section aria-labelledby="air-now-title">
                  <h2 id="air-now-title" className="sr-only">
                    Air right now{report?.simulated ? " (simulated)" : ""}
                  </h2>
                  <div aria-live="polite" aria-busy={air.loading}>
                    {air.error && !report && (
                      <p role="alert" className="rounded-2xl bg-red-50 p-4 text-red-900">
                        {air.error}
                      </p>
                    )}
                    {!report && air.loading && (
                      <div className="grid h-72 place-items-center rounded-3xl bg-gradient-to-br from-ink-950 to-ink-800 text-ink-200">
                        <p>Loading air quality…</p>
                      </div>
                    )}
                    {report && <AirDashboard report={report} placeName={place.name} />}
                  </div>
                </section>
              </div>

              <div id="today" className="scroll-mt-24 space-y-6">
                <Section id="today-plan" title="Today's plan" icon={<Sparkles aria-hidden="true" />}>
                  <TodayPlan data={plan.data} members={members} loading={plan.loading} />
                  {plan.error && !plan.data && (
                    <p role="alert" className="mt-2 rounded-2xl bg-red-50 p-3 text-red-900">
                      {plan.error}
                    </p>
                  )}
                </Section>
                {report && (
                  <Section id="window" title="Best time to go outside" icon={<Clock aria-hidden="true" />}>
                    <BestWindowChart forecast={report.forecast} window={report.best_window} />
                  </Section>
                )}
              </div>
            </div>
          </div>

          <div
            hidden={view !== "family"}
            ref={(el) => {
              viewRefs.current.family = el;
            }}
            role="region"
            tabIndex={-1}
            aria-label="Family and SOS"
            className="view-enter space-y-6"
          >
            <div id="shield" className="scroll-mt-24">
              <Section
                id="shield-panel"
                title="Family Health Shield"
                description="Personal smog risk and stay-safe steps for each person at home."
                icon={<ShieldCheck aria-hidden="true" />}
              >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <div>
                    {demoFamily && (
                      <p className="mb-3 rounded-2xl bg-amber-100 p-3 text-amber-950">
                        Showing a demo family. Your own family details are untouched.
                      </p>
                    )}
                    {demoFamily || signedIn ? (
                      <HouseholdEditor household={household} onChange={family.update} readOnly={demoFamily} />
                    ) : (
                      <FamilySignInPrompt />
                    )}
                    {signedIn && !demoFamily && (
                      <p role="status" className="mt-3 text-sm text-slate-700">
                        {SAVE_STATUS[family.status]}
                      </p>
                    )}
                    {family.error && !demoFamily && (
                      <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-red-900">
                        {family.error}
                      </p>
                    )}
                  </div>
                  <div aria-live="polite" aria-busy={shield.loading}>
                    {!payload.length && (
                      <div className="grid h-full min-h-[10rem] place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-slate-700">
                        <p>
                          {signedIn
                            ? "Add your family members to get personal smog alerts and stay-safe steps."
                            : "Personal smog alerts for each family member appear here once you sign in and add them."}
                        </p>
                      </div>
                    )}
                    {shield.loading && payload.length > 0 && <p>Checking your family&apos;s risk…</p>}
                    {shield.error && (
                      <p role="alert" className="rounded-2xl bg-red-50 p-3 text-red-900">
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

            <div id="sos" tabIndex={-1} className={`scroll-mt-24 rounded-3xl ${urgent ? "ring-4 ring-red-600 ring-offset-2 ring-offset-slate-50" : ""}`}>
              <Section
                id="sos-panel"
                title="Emergency SOS"
                description="Works offline. Tap to call, then read the script to the doctor."
                icon={<PhoneCall aria-hidden="true" />}
              >
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
          </div>

          <div
            hidden={view !== "home"}
            ref={(el) => {
              viewRefs.current.home = el;
            }}
            role="region"
            tabIndex={-1}
            aria-label="Home air"
            id="indoor"
            className="view-enter"
          >
            <Section
              id="indoor-panel"
              title="Clean air at home"
              description="Size a purifier for your room and find the cheapest fixes first."
              icon={<Home aria-hidden="true" />}
            >
              <IndoorPlanner context={context} />
            </Section>
          </div>

          <div
            hidden={view !== "history"}
            ref={(el) => {
              viewRefs.current.history = el;
            }}
            role="region"
            tabIndex={-1}
            aria-label="Weather and air history"
            id="history"
            className="view-enter"
          >
            <Section
              id="history-panel"
              title={`Weather and air history: ${place.name}`}
              description="Yesterday's weather and air, the last few weeks day by day, and when the records were set."
              icon={<History aria-hidden="true" />}
            >
              {/* Loaded only once the view is opened, so the dashboard's first load stays light. */}
              {view === "history" && <HistoryPanel place={place} />}
            </Section>
          </div>

          <div
            hidden={view !== "commute"}
            ref={(el) => {
              viewRefs.current.commute = el;
            }}
            role="region"
            tabIndex={-1}
            aria-label="Cleaner commute"
            id="commute"
            className="view-enter"
          >
            <Section
              id="commute-panel"
              title="Cleaner, low-emission commute"
              description="Breathe less PM2.5 and emit less CO₂ on the same trip."
              icon={<TrainFront aria-hidden="true" />}
            >
              <CommutePlanner context={context} onLog={logCommute} demoRun={demoCommute} />
            </Section>
          </div>

          <div
            hidden={view !== "impact"}
            ref={(el) => {
              viewRefs.current.impact = el;
            }}
            role="region"
            tabIndex={-1}
            aria-label="Your impact"
            id="impact"
            className="view-enter space-y-6"
          >
            <Section id="impact-panel" title="Your clean-air impact" icon={<Leaf aria-hidden="true" />}>
              <ImpactTracker entries={impact} onChange={setImpact} />
            </Section>
            <Section
              id="civic-panel"
              title="Act together"
              description="Draft a note for your neighbours or your ward office."
              icon={<Leaf aria-hidden="true" />}
            >
              <CivicDrafter context={context} />
            </Section>
          </div>

          <footer className="mt-10 border-t border-slate-200 pt-6">
            <p className="text-sm text-slate-700">
              SaansSafe gives general air-quality guidance, not medical advice. It does not diagnose or prescribe. In an
              emergency call {AMBULANCE} or {EMERGENCY}, or your doctor. Air data: Open-Meteo (CAMS). Index: CPCB NAQI.
              Advice language: {LANGUAGES.find((l) => l.code === language)?.label}.
            </p>
          </footer>
        </main>
      </div>

      {demo.current && <DemoBar step={demo.step} current={demo.current} onNext={demo.next} onStop={demo.stop} />}
    </>
  );
}
