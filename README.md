# SaansSafe

**Winter smog alerts, safe outdoor windows and a one-tap family SOS, for Indian cities.**

Every winter, cold, still air traps smoke and dust over North Indian cities. NAQI goes past 400, and the people most at risk (grandparents with COPD, children with asthma, pregnant mothers) are the least likely to read an AQI chart. SaansSafe turns live air and weather data into three plain answers for a family:

1. **How bad is it, and is smog being trapped right now?** (CPCB NAQI + winter inversion detector)
2. **When is it safest to step out today?** (best 2-hour outdoor window)
3. **What should each of us do, and who do we call if it goes wrong?** (Family Health Shield + SOS)

> **Design principle: code calculates, Gemini explains.** Every number comes from deterministic, tested Python. Gemini 2.5 Flash only turns those verified numbers into calm, personal language, and the app checks its output before showing it.

---

## Features

| | Feature | What it does |
|---|---|---|
| F1 | **Live smog dashboard** | **Any place on Earth**: type-ahead search for cities, towns, villages, neighbourhoods and landmarks (Open-Meteo/GeoNames plus Photon/OpenStreetMap, merged and de-duplicated, add a state or country after a comma to narrow), 15 Indian quick picks, recent places, or geolocation. CPCB NAQI with colour + icon + text, PM2.5, PM10, temperature, wind and a **winter smog trap indicator** (temp < 15 °C, wind < 8 km/h, PM2.5 > 90 µg/m³). |
| F1 | **Simulate severe winter smog** | One switch loads a fixed scenario (NAQI 418, 9 °C, 3 km/h) so alerts and SOS can be tested on any day, with no network call. |
| F2 | **Best outdoor window** | Scans the next 24 h (06:00–21:00) for the cleanest contiguous 2-hour slot. Bar chart plus an accessible data table. |
| F1 | **Weather and air history** | A **History** tab for the selected place: yesterday's high and low (with the hour each was reached), rain, wind and daily NAQI; a 7, 30 or 90-day trend chart with a data table; period records (hottest hour, coldest hour, wettest day, windiest hour, worst and cleanest air day, peak PM2.5 hour) each with its date; and long-term records since 1991 from the ERA5 archive (hottest and coldest day on record, the record high and low for today's date, and how yesterday compared with the usual high). The archive can take a minute, so the server loads it in the background and caches it for a day; the page shows the rest at once and fills the records in when they arrive. Daily NAQI uses CPCB 24-hour means and needs 16 hourly readings. |
| F1 | **Pick a day (home page)** | A weather-app style date strip on the Today page: the last 7 days with high/low and a daily NAQI badge, plus Today (live). A calendar picks any day in the last 90. A picked day shows its high and low (with times), rain, wind, NAQI and an hour-by-hour temperature line and PM2.5 bars, with a data table (`/api/history/day`). |
| F3 | **Family Health Shield** | Household members (age group, conditions, doctor's care note) stored only in the browser. Per-member risk tier, browser notification + `role="alert"` banner at High and above, personal stay-safe checklist and a safe care-plan reminder. |
| F3 | **One-tap SOS** | `tel:` links for family doctor, hospital, **108** and **112**, a 30-second doctor handoff script (copy or read aloud) and red-flag symptoms. Works without AI and offline. |
| ★ | **Today's plan** | The hero card: one decision for the family (stay in / limit / normal), when to go out, who stays indoors, purifier and window actions. Decided by `engines/plan.py`, worded by Gemini. |
| F4 | **Budget-aware indoor planner** | Room size, cooking fuel, ventilation, incense, sweeping, purifier CADR and filter age. Required CADR = volume × 5 ACH; fixes filtered to ₹0 / under ₹1,000 / under ₹5,000, cheapest first (incl. a DIY Corsi-Rosenthal box; never houseplants). |
| F5 | **Low-emission commute optimizer** | 8 modes, departure shift of up to ±2 h. Inhaled PM2.5 dose (µg) and CO₂ (kg) per trip, recommendation that never raises CO₂, and a **How we calculate** dialog with every formula, factor and source. |
| F6 | **Impact tracker + civic drafter** | Logs commutes (real µg / kg from the engine) and clean-air habits in the browser. Drafts an RWA clean-air request or an open-burning complaint to the ward office. |
| F7 | **5 languages + read aloud** | English, Hindi, Tamil, Bengali, Marathi for every Gemini explanation; `<html lang>` and Web Speech voice follow the choice. Rule-based fallback text is English. |
| 🔑 | **Landing page, sign-up and log-in** | `/` explains the app with a clear **Create free account**, **Watch the 60-second demo** and **Continue as a guest** (no account needed). `/signup` and `/login` create a session; the app header shows who is signed in and a Log out button. |
| 👪 | **Family members need an account** | Guests can use every air, planner and SOS feature, but adding family members needs a free account. Guests see a "Sign in to add your family" prompt, and the server refuses family reads, saves and Family Shield checks without a session (401), so hiding the UI is not the only guard. The guided demo still works for guests with a fixed sample family chosen by the server. |
| 🧪 | **Demo account** | `demo@saanssafe.app` / `SaansSafe-Demo-2026`, already holding a four-person sample family (Dadi with COPD, Aarav with asthma, Meera pregnant, Raj). The log-in page shows it with a one-tap **Log in to the demo account** button. It is re-created and its family reset on every start; set `DEMO_ACCOUNT=false` to turn it off. |
| ▶ | **60-second guided demo** | One button: smog spike → today's plan → family alert → SOS script read aloud → commute savings. Uses a demo family without touching saved data. |
| 📱 | **Mobile app look and install** | A night-sky weather-app design built for phones first: the place, a big temperature, the sky in words and today's high and low on top, a smog haze that thickens with NAQI, and a frosted forecast sheet with **Hourly** and **Weekly** tabs (temperature, sky icon, chance of rain, and forecast PM2.5 per hour from Open-Meteo's forecast). A curved bottom tab bar with a round **+** button that jumps to place search. Dark is the default; light is a lavender variant. Installable as an app (manifest, PNG and maskable icons, install button, iPhone home-screen tags, safe-area insets), and an Android APK through Capacitor (`mobile/`, built by the *Android app* GitHub workflow). |

---

## Architecture

```
frontend/  React 18 + Vite + TypeScript + Tailwind (served as static files)
backend/
  app/
    data/assumptions.json   every constant, each with its source
    engines/                pure, deterministic calculations
      aqi.py                CPCB NAQI sub-indices, 24h averaging (16-hour rule)
      climate.py            winter inversion detector
      window.py             best outdoor window
      risk.py               per-member risk tiers and red-flag symptoms
      plan.py               today's family decision
      indoor.py             CADR sizing and budget-ranked home fixes
      exposure.py           commute dose (ug) and CO2 (kg) by mode and hour
    prompts/                Gemini prompts (system + Family Health Shield)
    services/
      air_service.py        Open-Meteo client, rounded-coordinate TTL cache, simulation
      gemini_service.py     google-genai wrapper, schema-locked JSON
      narrator.py           one Gemini path for every feature: cache, timeout, number check
      shield_service.py     Family Health Shield + rule-based fallback
      planner_service.py    plan, indoor, commute and civic + rule-based fallbacks
      grounding.py          "no invented numbers" checker
      sanitize.py           strips delimiters, phone numbers and e-mails from user text
    routers/                /api/air, /api/geocode, /api/shield, /api/plan,
                            /api/indoor, /api/commute, /api/civic, /api/health
    security.py             CSP + security headers, body size cap, rate limiter
```

**Request flow for the Family Health Shield**

1. The browser replaces names with `Member_1`, `Member_2`…, removes phone numbers from care notes, and sends only age group, conditions and the cleaned note. Names and phone numbers never reach the Shield or Gemini.
2. The server fetches air data itself (it never trusts client numbers), runs the engines, and decides each member's **risk tier and red flags in code**.
3. Gemini receives the verified JSON and the care notes inside XML tags and returns schema-locked JSON.
4. The server **validates** the reply: every member present, every number in the text matches the verified data (±0.5, any script's digits), no dosing language. If anything fails, or there is no key, or it times out, the rule-based explanation is used instead.
5. The browser maps `Member_1` back to real names.

---

## Prompt engineering and guardrails

Files: `backend/app/prompts/system_base.py`, `backend/app/prompts/health_shield.py`.

- **Role and boundary conditioning:** SaansSafe persona with strict non-diagnostic limits.
- **Deterministic grounding:** "Use ONLY the numbers inside `<verified_data>`." Risk tiers are fixed inputs the model must explain, never change.
- **XML delimiters for injection defence:** care notes sit in `<user_care_notes>` and are declared untrusted. The sanitizer also removes `< > { } \`` so a note cannot close the tag.
- **Chain of thought through the schema:** `impact_reasoning` makes the model link cause (PM2.5, cold still air) to effect (this member's lungs) before writing advice.
- **Few-shot example** showing the tone and structure for an emergency COPD case.
- **Schema-locked output:** `response_schema` = Pydantic `ShieldNarrative`, `response_mime_type="application/json"`, `temperature=0.3`.
- **Medical safety:** no prescribing, dosing or diagnosis (also checked in code); emergency escalation to 108/112; persistent disclaimer in the UI footer.
- **Post-generation verification:** `grounding.py` rejects any reply with a number not found in the verified data. This is unit-tested, including Devanagari digits.
- **Model chosen at deploy time:** `GEMINI_MODEL` (default `gemini-2.5-flash`).

---

## Formulas and assumptions

All constants live in [`backend/app/data/assumptions.json`](backend/app/data/assumptions.json), each with its source.

- **NAQI (CPCB, 2014):** `I = Ilo + (C − Blo) × (Ihi − Ilo) / (Bhi − Blo)` per pollutant; the NAQI is the highest sub-index. PM2.5, PM10 and NO2 use 24-hour means when at least 16 of the last 24 hours are available, as CPCB requires; otherwise the result is labelled indicative.
- **Winter smog trap:** temperature < 15 °C **and** wind < 8 km/h **and** PM2.5 > 90 µg/m³ (the CPCB "Poor" threshold).
- **Risk tiers:** general public by NAQI band (Good/Satisfactory → low, Moderate → moderate, Poor → high, Very Poor/Severe → very high). Children, infants, seniors and anyone with a condition move one tier earlier (CPCB health statements). Lung or heart conditions during an inversion move one more. *Emergency* is reserved for members with a medical condition.
- **Best window:** lowest mean forecast PM2.5 over 2 consecutive hours starting 06:00 or later and ending by 21:00.
- **Purifier sizing:** `required_cadr_m3h = L × W × H × 5` (5 air changes per hour).
- **Commute dose:** `inhaled_dose_ug = PM2.5 at departure hour × microenvironment factor × breathing rate (m³/h) × hours` (US EPA Exposure Factors Handbook; Goel et al. 2015, Delhi).
- **Commute CO₂:** `co2_kg = km × per-passenger emission factor` (India GHG Program 2015). The recommendation is the lowest-dose option whose CO₂ is no higher than today's.
- **Today's plan:** "stay in" from Very Poor upward or during a smog trap; members at High or above stay indoors; purifier from Poor upward.

---

## Security

- `GEMINI_API_KEY` read only from the environment (`.env.example` provided, `.env` git-ignored); stored as `SecretStr`.
- Strict Pydantic bounds: latitude −90..90, longitude −180..180, `Literal` enums, care note ≤ 200 chars, ≤ 10 members, `member_id` must match `Member_N`, and **unknown fields are rejected** (a stray `name` or `phone` gets a 422).
- `slowapi` rate limits: 20/min on the AI endpoint, 60/min on data endpoints.
- Headers on every response: `Content-Security-Policy` (`default-src 'self'`, no inline scripts), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS; `Cache-Control: no-store` on API responses.
- 16 KB request body cap; upstream errors return a generic 502 without stack traces.
- AI text is rendered only as React text nodes (no `dangerouslySetInnerHTML`); `tel:` links accept digits and a leading `+` only.
- **Accounts:** passwords hashed with scrypt (n=2¹⁴, r=8, p=1, 16-byte random salt) and compared in constant time; unknown e-mails still run a dummy hash so timing doesn't reveal who has an account. Sessions are 256-bit random tokens in an `HttpOnly`, `SameSite=Strict`, `Secure` cookie scoped to `/api`; the database stores only their SHA-256, so a leaked database can't be replayed. Sign-up, log-in and log-out reject cross-site `Origin` headers and are limited to 10/min per IP. Wrong e-mail and wrong password give the same message.
- **What an account holds:** name, e-mail, password hash and the family you add (names, age groups, conditions, care notes, doctor and hospital phone). Family endpoints need a session, are scoped to the signed-in account, validate every field and reject cross-site writes. The Family Shield and Gemini still receive members only as `Member_N` codes with phone numbers removed.
- Container runs as a non-root user.

## Efficiency

- Open-Meteo air and weather are fetched concurrently (`asyncio.gather`) and cached for 20 minutes per ~1 km square (coordinates rounded to 2 decimals).
- Gemini replies are cached for 15 minutes by SHA-256 of model + prompt, so identical households don't trigger repeat calls.
- Gemini Flash "thinking" is off by default for low latency; 12-second timeout with an instant rule-based fallback.
- Frontend: ~60 KB gzipped JS, debounced Shield requests, aborted stale requests, and a service worker that caches the app shell and the last air reading.

## Accessibility (WCAG 2.1 AA)

- NAQI shown with colour **and** icon **and** text on an animated half-dial gauge (one summary label for screen readers); the sweep and glow are off under `prefers-reduced-motion`.
- Light and dark themes (follows the system, with a toggle). Every colour is a CSS variable and the dark scale mirrors the light one, so each text/background pair keeps its contrast; axe-core in a real browser reports no issues in either theme at desktop and phone widths.
- App views (Today, Family & SOS, Home air, Commute, Impact): a bottom bar on phones and a sidebar on desktop, with the current view marked `aria-current` and focus moved to the new view. SOS stays one tap away in the header.
- Skip link, landmark regions with headings, visible focus rings, 44 px touch targets.
- Labelled form fields, grouped checkboxes in `fieldset`/`legend`, character counter tied with `aria-describedby`.
- `aria-live` for loading and results, `role="alert"` for smog alerts, `role="switch"` for the simulation.
- Chart has a text summary and a full `<table>` alternative.
- Read Aloud (Web Speech API) on the smog summary and the doctor handoff.
- Automated axe checks in the Vitest suite and `eslint-plugin-jsx-a11y` (strict) in CI.

## Testing

- **Backend:** 163 pytest tests, about 97% coverage; the account tests also run against Postgres in CI. Engines (NAQI breakpoints including 273.4 → 418, inversion, window, risk tiers, CADR sizing, budget ranking, commute dose/CO₂ and departure shift, daily plan), grounding checker, sanitizer, cache, Gemini wrapper, and API tests with a mocked Open-Meteo transport: 422 validation, 413 body cap, 429 rate limit, 502 upstream failure, fallback without a key, rejection of invented numbers and dosing, cache hits, and a check that phone numbers never reach the prompt.
- **Frontend:** Vitest + Testing Library + vitest-axe: tokenization and PII stripping, `tel:` sanitising, every planner component, the How-we-calculate dialog, impact totals, language switching, the guided demo (fake timers), landing, sign-up, log-in, wrong-password and log-out flows, and full-app flows, with axe accessibility checks (29 tests).
- **CI:** `.github/workflows/ci.yml` runs ruff, mypy (strict), pytest with coverage, ESLint, TypeScript, Vitest, a production build, and a Docker build with a smoke test.

---

## Run with Docker (easiest on Windows)

```bash
docker build -t saanssafe .
docker run -p 8080:8080 --env-file backend/.env saanssafe
```

Open http://localhost:8080 for the landing page, or http://localhost:8080/app?demo=1 to jump straight into the guided demo.

Accounts live in hosted Postgres when `DATABASE_URL` is set (see [Accounts database](#accounts-database)); otherwise in SQLite at `/app/data/saanssafe.db`, and to keep those when the container is rebuilt add a volume: `docker run -p 8080:8080 --env-file backend/.env -v saanssafe-data:/app/data saanssafe`. If you open the app over plain HTTP from another machine (not `localhost`), set `COOKIE_SECURE=false` so the browser accepts the session cookie.

## Accounts database

SaansSafe stores accounts, sessions and family members in **Postgres when `DATABASE_URL` is set** (we use a free Supabase project) and falls back to a local SQLite file when it isn't, so local development and tests need nothing extra. The backend creates its three tables (`users`, `sessions`, `households`) on start if they're missing, and turns on row level security with no policies so Supabase's public Data API can't read them; only the backend, connecting as the table owner, can.

1. In Supabase, open the project → **Connect** → **Session pooler** and copy the URI (it works over IPv4, which Render needs).
2. Replace `[YOUR-PASSWORD]` with the database password (Project Settings → Database → *Reset database password* if you don't have it).
3. Put it in `backend/.env` as `DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-…pooler.supabase.com:5432/postgres` (never commit it).

On start the log shows `Accounts database: postgres`. The demo account is re-seeded there on every start as before. To run the account tests against a throwaway Postgres: `TEST_DATABASE_URL=postgresql://… pytest tests/test_auth.py tests/test_family.py tests/test_database.py` (it empties the tables, so never point it at the real database).

## Deploy to Render

`render.yaml` describes one free Docker web service in Singapore (next to the Supabase project). Render → **New** → **Blueprint** → pick this repository, then paste `DATABASE_URL` and, optionally, `GEMINI_API_KEY` when asked. Render serves it over HTTPS, so `COOKIE_SECURE=true` stays on. Free instances sleep after 15 minutes idle and take about a minute to wake.

## Phone app

* **Install from the browser:** open SaansSafe on the phone and tap **Install** on the Today page (Chrome/Edge on Android) or Safari → Share → *Add to Home Screen* on iPhone. Installing needs the server on **https** (or `localhost`).
* **Android APK:** `mobile/` holds a Capacitor shell that opens your server full screen, with an offline page that can still call 108/112. GitHub → Actions → *Android app* → *Run workflow* with your server address produces a downloadable `app-debug.apk`. Details in [mobile/README.md](mobile/README.md).

## Run locally

Requirements: Python 3.12+, Node 22+.

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
cp ../.env.example .env            # optional: add GEMINI_API_KEY (Windows: copy ..\.env.example .env)
python -m uvicorn app.main:app --reload --port 8000

# Frontend (second terminal)
cd frontend
npm ci
npm run dev               # http://localhost:5173, /api proxied to :8000
```

Tests: `cd backend && pytest --cov` and `cd frontend && npm test`.

## Deploy to Google Cloud Run

```bash
gcloud run deploy saanssafe --source . --region asia-south1 --allow-unauthenticated \
  --set-env-vars GEMINI_MODEL=gemini-2.5-flash \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

The multi-stage `Dockerfile` builds the frontend, installs the API and serves both on `$PORT`. Cloud Run's disk is temporary, so for lasting accounts mount a Cloud Storage or Filestore volume at `/app/data`; guests and the demo need nothing.

---

## Gen AI usage (for the submission form)

**Service:** Google Gemini 2.5 Flash via the `google-genai` SDK, called from the FastAPI backend.
**Architecture:** "Deterministic code calculates, Gemini explains." Python engines compute CPCB NAQI, the winter inversion flag, the best outdoor window and each member's risk tier. Gemini receives verified JSON inside XML delimiters, returns schema-locked JSON, and its output is checked so every number matches the verified data before it is shown.
**Where:** (1) Family Health Shield: personalised smog alerts, stay-safe checklists, care-plan reminders and the 30-second emergency doctor handoff script; (2) Today's plan headline and steps; (3) indoor air planner explanations; (4) commute trade-off explanations; (5) RWA / ward-office civic notes; all in English, Hindi, Tamil, Bengali or Marathi.

*SaansSafe gives general air-quality guidance, not medical advice.*
