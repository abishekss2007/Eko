import { Eye, EyeOff, LogIn, PlayCircle, UserPlus, Wind } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchDemoAccount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { LOGO_MARK, NightSky } from "../components/NightSky";
import { Link, navigate } from "../lib/router";
import { ThemeToggle } from "../lib/theme";

interface Props {
  mode: "login" | "signup";
}

/** Where to go after signing in. Only known in-app targets are allowed (no open redirect). */
function afterAuth(): string {
  return new URLSearchParams(window.location.search).get("next") === "family" ? "/app#family" : "/app";
}

/** Sign-up and log-in share one accessible form. Errors are announced and focus moves to them. */
export function AuthPage({ mode }: Props) {
  const { login, signup } = useAuth();
  const signingUp = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<{ email: string; password: string } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (signingUp) return;
    let live = true;
    fetchDemoAccount().then(
      (account) => live && setDemo(account),
      () => undefined, // no demo account on this server
    );
    return () => {
      live = false;
    };
  }, [signingUp]);

  useEffect(() => {
    document.title = signingUp ? "Sign up · SaansSafe" : "Log in · SaansSafe";
  }, [signingUp]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (signingUp && password.length < 8) {
      setError("Use a password of at least 8 characters.");
      errorRef.current?.focus();
      return;
    }
    await run(() => (signingUp ? signup(name, email, password) : login(email, password)));
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      navigate(afterAuth());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      errorRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const logInDemo = async () => {
    if (!demo) return;
    setError("");
    setEmail(demo.email);
    setPassword(demo.password);
    await run(() => login(demo.email, demo.password));
  };

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
      <NightSky />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2 text-2xl font-black text-snow">
          <span aria-hidden="true" className={LOGO_MARK}>
            <Wind size={20} />
          </span>
          SaansSafe
        </Link>
        <ThemeToggle className="btn text-snow hover:bg-snow/10" />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 pt-4">
        <div className="view-enter w-full max-w-md rounded-[2rem] bg-white p-6 shadow-glow ring-1 ring-snow/30 sm:p-8">
          <h1 className="mb-1 text-3xl font-black text-slate-900">{signingUp ? "Create your account" : "Welcome back"}</h1>
          <p className="mb-6 text-slate-700">
            {signingUp
              ? "Free. Save your family once and get smog alerts for each of them."
              : "Log in to see today's plan for your family."}
          </p>

          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className={error ? "mb-4 rounded-xl bg-red-50 p-3 font-medium text-red-900" : "sr-only"}
          >
            {error}
          </p>

          <form onSubmit={submit} className="space-y-4" noValidate={false}>
            {signingUp && (
              <div>
                <label htmlFor="name" className="mb-1 block text-sm font-semibold">
                  Your name
                </label>
                <input
                  id="name"
                  className="input"
                  autoComplete="name"
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-semibold">
                Password
              </label>
              <div className="flex gap-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input"
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  required
                  minLength={signingUp ? 8 : 1}
                  maxLength={128}
                  aria-describedby={signingUp ? "password-hint" : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0 px-3"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </div>
              {signingUp && (
                <p id="password-hint" className="mt-1 text-sm text-slate-700">
                  At least 8 characters, with a mix of letters, numbers or symbols.
                </p>
              )}
            </div>
            <button type="submit" className="btn-primary w-full text-lg" disabled={busy}>
              {signingUp ? <UserPlus aria-hidden="true" size={20} /> : <LogIn aria-hidden="true" size={20} />}
              {busy ? "Please wait…" : signingUp ? "Create account" : "Log in"}
            </button>
          </form>

          {demo && (
            <section aria-labelledby="demo-title" className="mt-6 rounded-2xl bg-brand-50 p-4 text-slate-800">
              <h2 id="demo-title" className="font-bold text-slate-900">
                Try the demo account
              </h2>
              <p className="mb-3 text-sm">
                A sample family is already added. E-mail <strong className="break-all">{demo.email}</strong>, password{" "}
                <strong>{demo.password}</strong>
              </p>
              <button type="button" className="btn-secondary w-full" disabled={busy} onClick={logInDemo}>
                <PlayCircle aria-hidden="true" size={18} /> Log in to the demo account
              </button>
            </section>
          )}

          <p className="mt-6 text-center">
            {signingUp ? "Already have an account? " : "New to SaansSafe? "}
            <Link href={`${signingUp ? "/login" : "/signup"}${window.location.search}`} className="font-semibold text-brand-800 underline underline-offset-4">
              {signingUp ? "Log in" : "Create an account"}
            </Link>
          </p>
          <p className="mt-2 text-center">
            <Link href="/app" className="text-slate-700 underline underline-offset-4">
              Continue as a guest
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
