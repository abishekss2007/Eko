import {
  ArrowRight,
  BellRing,
  Clock,
  Home,
  Languages,
  Leaf,
  Lock,
  PhoneCall,
  PlayCircle,
  ShieldCheck,
  Siren,
  TrainFront,
  Wind,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { NaqiGauge } from "../components/NaqiGauge";
import { Link } from "../lib/router";
import { ThemeToggle } from "../lib/theme";

const FEATURES = [
  { Icon: Siren, title: "Live smog + winter trap alert", text: "Indian CPCB NAQI with a detector for cold, still air that traps smog where your family breathes." },
  { Icon: BellRing, title: "Family Health Shield", text: "Personal risk for grandparents, kids and anyone with asthma, COPD or heart disease, with alerts and stay-safe steps." },
  { Icon: PhoneCall, title: "One-tap SOS", text: "Call your doctor, 108 or 112 in one tap, with a 30-second script that tells the doctor exactly what is happening." },
  { Icon: Home, title: "Clean air at home", text: "How much purifier your room needs, and the free fixes that cut indoor smoke first." },
  { Icon: TrainFront, title: "Cleaner commute", text: "Which way and when to travel to breathe less PM2.5 and emit less CO₂, with the maths shown." },
  { Icon: Languages, title: "Your language, read aloud", text: "Advice in English, Hindi, Tamil, Bengali or Marathi, read aloud for elders." },
];

const STEPS = [
  { title: "Measure", text: "Live PM2.5, PM10, NO₂, temperature and wind for your street from Open-Meteo." },
  { title: "Calculate", text: "Tested code computes the NAQI, risk tiers, purifier size and commute dose. Every constant has a cited source." },
  { title: "Explain", text: "Gemini turns the verified numbers into calm advice. If it writes a number we didn't calculate, we don't show it." },
];

/** Public front door: the pitch, then sign up, log in, or go straight in as a guest. */
export function LandingPage() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = "SaansSafe: breathe safer through winter smog";
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="absolute inset-x-0 top-0 z-10 text-snow">
          <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
            <Link href="/" className="flex items-center gap-2 text-2xl font-black text-snow">
              <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#14b8a6] to-[#0284c7]">
                <Wind size={20} />
              </span>
              SaansSafe
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle className="btn text-snow hover:bg-snow/10" />
              <Link href="/login" className="btn text-snow ring-1 ring-snow/30 hover:bg-snow/10">
                Log in
              </Link>
              <Link href="/signup" className="btn bg-snow text-ink-950 hover:bg-ink-100">
                Sign up free
              </Link>
            </div>
          </nav>
      </header>

      <main id="main">
          <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ink-950 text-snow">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#14b8a6] opacity-25 blur-[120px]" />
              <div className="absolute -right-32 top-24 h-[28rem] w-[28rem] rounded-full bg-[#c00000] opacity-25 blur-[120px]" />
              <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#0284c7] opacity-20 blur-[100px]" />
            </div>
            <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-32 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pt-36">
              <div className="view-enter">
                <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-snow/10 px-3 py-1 text-sm text-ink-100 ring-1 ring-snow/15">
                  <ShieldCheck aria-hidden="true" size={16} /> Built for Indian winters · CPCB NAQI
                </p>
                <h1 id="hero-title" ref={heading} className="mb-5 text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">
                  Breathe safer through{" "}
                  <span className="bg-gradient-to-r from-[#5eead4] via-[#7dd3fc] to-[#fca5a5] bg-clip-text text-transparent">
                    winter smog.
                  </span>
                </h1>
                <p className="mb-9 max-w-xl text-lg leading-relaxed text-ink-200 sm:text-xl">
                  SaansSafe tells your family when it is safe to step out, who should stay in, what to do at home,
                  and who to call when breathing gets hard. One plan, every morning.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/signup"
                    className="btn bg-[#5eead4] px-6 text-lg text-ink-950 shadow-lg shadow-[#14b8a6]/30 hover:-translate-y-0.5 hover:bg-[#99f6e4]"
                  >
                    Create free account <ArrowRight aria-hidden="true" size={20} />
                  </Link>
                  <Link href="/app?demo=1" className="btn px-6 text-lg text-snow ring-1 ring-snow/30 hover:bg-snow/10">
                    <PlayCircle aria-hidden="true" size={20} /> Watch the 60-second demo
                  </Link>
                </div>
                <p className="mt-5 text-ink-300">
                  Just looking?{" "}
                  <Link href="/app" className="font-semibold text-snow underline decoration-[#5eead4] decoration-2 underline-offset-4">
                    Continue as a guest
                  </Link>
                  . No account needed.
                </p>
              </div>

              <figure className="view-enter rounded-[2rem] bg-snow/[0.06] p-5 shadow-glow ring-1 ring-snow/10 backdrop-blur sm:p-6">
                <figcaption className="mb-4 flex items-center justify-between text-sm text-ink-300">
                  <span>Example: a severe smog morning in Delhi</span>
                  <span className="rounded-full bg-sun px-2 py-0.5 text-xs font-bold text-ink-950">Live demo</span>
                </figcaption>
                <NaqiGauge value={418} category="Severe" size="md" />
                <p className="mb-4 mt-3 text-center font-semibold text-ink-100">Cold, still air is trapping smog near the ground.</p>
                <div className="rounded-2xl bg-gradient-to-br from-[#991b1b] to-[#881337] p-4 text-snow">
                  <p className="mb-2 text-lg font-bold">Today: keep Dadi indoors. Go out only 2–4 PM.</p>
                  <ul className="list-disc space-y-1 pl-5 text-ink-100">
                    <li>Run the purifier in Dadi&apos;s room, doors closed.</li>
                    <li>Wet-mop today, no incense.</li>
                    <li>Take the metro at 11:00 to cut PM2.5 by 60%.</li>
                  </ul>
                </div>
              </figure>
            </div>
          </section>

        <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-14">
          <h2 id="features-title" className="mb-8 text-3xl font-extrabold">
            Everything a family needs on a smog day
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title} className="card group p-6 transition hover:-translate-y-1 hover:shadow-lg">
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-800 transition group-hover:bg-iris group-hover:text-snow">
                  <Icon aria-hidden="true" size={24} />
                </span>
                <h3 className="mb-1 text-lg font-bold">{title}</h3>
                <p className="text-slate-700">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-title" className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 id="how-title" className="mb-2 text-3xl font-extrabold">
              Code calculates. Gemini explains.
            </h2>
            <p className="mb-8 max-w-2xl text-slate-700">
              Medical decisions are never left to AI. Risk levels and emergencies come from tested rules, so SOS works
              even offline.
            </p>
            <ol className="grid gap-5 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-3xl bg-slate-100 p-6">
                  <p className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-iris text-lg font-bold text-snow" aria-hidden="true">
                    {i + 1}
                  </p>
                  <h3 className="mb-1 text-lg font-bold">{step.title}</h3>
                  <p className="text-slate-700">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="privacy-title" className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
          <div>
            <h2 id="privacy-title" className="mb-3 flex items-center gap-2 text-3xl font-extrabold">
              <Lock aria-hidden="true" size={28} /> Your family stays private
            </h2>
            <p className="text-lg text-slate-700">
              Names, health conditions, doctor&apos;s notes and phone numbers are saved only on your phone. Your account
              holds just your name and e-mail. The server sees family members only as codes like Member_1.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3 rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
            <p className="flex items-center gap-2 text-lg font-bold text-emerald-950">
              <Leaf aria-hidden="true" size={22} /> Ready when the smog is.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary">
                Create free account
              </Link>
              <Link href="/app" className="btn-secondary">
                <Clock aria-hidden="true" size={18} /> Continue as guest
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-700">
          SaansSafe gives general air-quality guidance, not medical advice. In an emergency call 108 or 112. Air data:
          Open-Meteo (CAMS). Index: CPCB NAQI.
        </p>
      </footer>
    </>
  );
}
