import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { Link, navigate } from "../lib/router";

interface Props {
  mode: "login" | "signup";
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
  const errorRef = useRef<HTMLParagraphElement>(null);

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
    setBusy(true);
    try {
      if (signingUp) await signup(name, email, password);
      else await login(email, password);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      errorRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-950 to-sky-950">
      <header className="mx-auto w-full max-w-6xl px-4 py-4">
        <Link href="/" className="text-2xl font-extrabold text-white">
          SaansSafe
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 pt-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="mb-1 text-3xl font-extrabold">{signingUp ? "Create your account" : "Welcome back"}</h1>
          <p className="mb-6 text-slate-700">
            {signingUp
              ? "Free. Your family's health details stay on your device."
              : "Log in to see today's plan for your family."}
          </p>

          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className={error ? "mb-4 rounded-lg bg-red-50 p-3 font-medium text-red-900" : "sr-only"}
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

          <p className="mt-6 text-center">
            {signingUp ? "Already have an account? " : "New to SaansSafe? "}
            <Link href={signingUp ? "/login" : "/signup"} className="font-semibold text-blue-800 underline underline-offset-4">
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
