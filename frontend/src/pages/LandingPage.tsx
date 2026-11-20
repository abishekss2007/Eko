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
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "../lib/router";

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
      <header className="bg-slate-950 text-white">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="text-2xl font-extrabold">
            SaansSafe
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/login" className="btn border-2 border-white text-white hover:bg-slate-800">
              Log in
            </Link>
            <Link href="/signup" className="btn bg-sky-300 text-slate-950 hover:bg-sky-200">
              Sign up free
            </Link>
          </div>
        </nav>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="bg-gradient-to-b from-slate-950 via-slate-900 to-sky-950 text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm">
                <ShieldCheck aria-hidden="true" size={16} /> Built for Indian winters
              </p>
              <h1 id="hero-title" ref={heading} className="mb-4 text-4xl font-extrabold leading-tight sm:text-5xl">
                Breathe safer through winter smog.
              </h1>
              <p className="mb-8 max-w-xl text-lg text-slate-200">
                SaansSafe tells your family when it is safe to step out, who should stay in, what to do at home,
                and who to call when breathing gets hard. One plan, every morning.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup" className="btn bg-sky-300 px-6 text-lg text-slate-950 hover:bg-sky-200">
                  Create free account <ArrowRight aria-hidden="true" size={20} />
                </Link>
                <Link href="/app?demo=1" className="btn border-2 border-white px-6 text-lg text-white hover:bg-slate-800">
                  <PlayCircle aria-hidden="true" size={20} /> Watch the 60-second demo
                </Link>
              </div>
              <p className="mt-4 text-slate-300">
                Just looking?{" "}
                <Link href="/app" className="font-semibold text-white underline underline-offset-4">
                  Continue as a guest
                </Link>
                . No account needed.
              </p>
            </div>

            <figure className="rounded-3xl bg-white p-5 text-slate-900 shadow-2xl">
              <figcaption className="mb-3 text-sm font-semibold text-slate-600">Example: a severe smog morning in Delhi</figcaption>
              <div className="mb-4 flex items-center gap-4">
                <div className="rounded-2xl bg-naqi-severe px-5 py-3 text-white">
                  <p className="text-4xl font-extrabold leading-none">418</p>
                  <p className="font-bold">Severe</p>
                </div>
                <p className="font-semibold">Cold, still air is trapping smog near the ground.</p>
              </div>
              <div className="rounded-2xl bg-red-900 p-4 text-white">
                <p className="mb-2 text-lg font-bold">Today: keep Dadi indoors. Go out only 2–4 PM.</p>
                <ul className="list-disc space-y-1 pl-5">
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
              <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon aria-hidden="true" size={28} className="mb-3 text-sky-800" />
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
                <li key={step.title} className="rounded-2xl bg-slate-100 p-5">
                  <p className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white" aria-hidden="true">
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
          <div className="flex flex-col justify-center gap-3 rounded-2xl bg-emerald-50 p-6">
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
