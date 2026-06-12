"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ArrowLeft, Mail, Lightbulb, LayoutDashboard, Globe, type LucideIcon } from "lucide-react";

// Step machine for the login form. We keep this dead simple — credentials
// first, OTP second. On any terminal MFA error we bounce back to step 1 so
// the user re-enters their password (which re-issues a fresh OTP).
type Step =
  | { kind: "credentials" }
  | { kind: "otp"; maskedEmail: string; expiresAt: string };

const BTN_GRADIENT = "linear-gradient(90deg, #4f46e5 0%, #6d5ef0 45%, #9b8cf5 100%)";
const SUPPORT_EMAIL = "customerexperience@hclhealthcare.in";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/portal/home";

  const [step, setStep] = useState<Step>({ kind: "credentials" });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      // MFA path — move to the OTP step. NO session has been minted yet.
      if (data.needsMfa) {
        setStep({
          kind: "otp",
          maskedEmail: data.maskedEmail,
          expiresAt: data.expiresAt,
        });
        return;
      }

      // Force-change path (no MFA on this account, but admin set the
      // password and the user must pick their own first). No session yet
      // — they finish via /change-password.
      if (data.needsPasswordChange) {
        router.push(`/change-password?redirect=${encodeURIComponent(redirect)}`);
        return;
      }

      // No-MFA path — session is already set; go home.
      router.push(redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const backToCredentials = () => {
    setStep({ kind: "credentials" });
    setError("");
    // Keep the email pre-filled but clear the password — they have to
    // re-enter it to start a fresh challenge.
    setPassword("");
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* LEFT: brand visual */}
      <BrandPanel />

      {/* RIGHT: form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[480px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-habit-expanded.svg" alt="Habit Intelligence" className="h-9 w-auto mb-10" />

          {step.kind === "credentials" ? (
            <CredentialsStep
              email={email}
              password={password}
              showPassword={showPassword}
              error={error}
              loading={loading}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onToggleShowPassword={() => setShowPassword((v) => !v)}
              onSubmit={handleCredentialsSubmit}
            />
          ) : (
            <OtpStep
              maskedEmail={step.maskedEmail}
              expiresAt={step.expiresAt}
              onBack={backToCredentials}
              onSuccess={() => {
                router.push(redirect);
                router.refresh();
              }}
              onForceChange={() => {
                router.push(`/change-password?redirect=${encodeURIComponent(redirect)}`);
              }}
              onTerminalFailure={(msg) => {
                setError(msg);
                setStep({ kind: "credentials" });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── left brand panel (illustration + Understand / Act / Elevate) ──────────

function BrandPanel() {
  const pillars: { word: string; Icon: LucideIcon }[] = [
    { word: "Understand", Icon: Lightbulb },
    { word: "Act", Icon: LayoutDashboard },
    { word: "Elevate", Icon: Globe },
  ];

  return (
    <div
      className="hidden lg:flex lg:w-[40%] xl:w-[37%] relative overflow-hidden flex-col justify-between px-12 py-14"
      style={{ background: "linear-gradient(165deg, #09080f 0%, #1b1547 44%, #4031a0 100%)" }}
    >
      {/* soft purple glow */}
      <div className="absolute pointer-events-none" style={{ left: -30, top: 150, width: 340, height: 340, background: "radial-gradient(circle, rgba(124,92,255,0.45) 0%, transparent 70%)", filter: "blur(50px)" }} />

      {/* illustration */}
      <div className="relative self-center mt-2 mb-auto w-full max-w-[360px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login-illustration.png" alt="" className="w-full h-auto select-none" draggable={false} />
      </div>

      {/* Understand / Act / Elevate */}
      <div className="relative">
        <div className="space-y-3.5">
          {pillars.map(({ word, Icon }) => (
            <div key={word} className="flex items-center gap-4">
              <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center border border-white/15" style={{ background: "rgba(255,255,255,0.08)" }}>
                <Icon size={17} className="text-white" strokeWidth={1.7} />
              </span>
              <span className="text-white text-[34px] font-extrabold tracking-[-0.02em] leading-none">{word}</span>
            </div>
          ))}
        </div>
        <p className="text-[14px] mt-6 max-w-[360px] leading-relaxed" style={{ color: "rgba(199,191,242,0.85)" }}>
          Understand the numbers. Act with precision. Elevate the program, quarter after quarter.
        </p>
      </div>
    </div>
  );
}

// ─── shared field styles ───────────────────────────────────────────────────

const FIELD_CLASS =
  "w-full h-12 px-4 rounded-[10px] border border-[#ECECEC] bg-[#FAFAFA] text-[15px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/25 focus:border-[#6366f1] focus:bg-white transition";

// ─── credentials step ─────────────────────────────────────────────────────

function CredentialsStep({
  email,
  password,
  showPassword,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onToggleShowPassword,
  onSubmit,
}: {
  email: string;
  password: string;
  showPassword: boolean;
  error: string;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <h1 className="text-[28px] font-bold text-[#111827] tracking-[-0.01em]">Sign in for Access</h1>
      <p className="text-[15px] text-[#6B7280] mt-1.5">Enter your credentials</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-[14px] font-semibold text-[#111827] mb-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-[14px] font-semibold text-[#111827] mb-2">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className={`${FIELD_CLASS} pr-11`}
            />
            <button
              type="button"
              onClick={onToggleShowPassword}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <div className="flex justify-end mt-2.5">
            <Link href="/forgot-password" className="text-[13px] text-[#4f46e5] underline underline-offset-2 hover:opacity-80">
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ background: BTN_GRADIENT }}
          className="w-full h-12 text-white text-[15px] font-semibold rounded-[10px] hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-[13px] text-[#6B7280] mt-6">
        We&rsquo;re here to assist you at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#4f46e5] underline underline-offset-2 hover:opacity-80">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </>
  );
}

// ─── OTP step ─────────────────────────────────────────────────────────────

const OTP_RESEND_COOLDOWN_SECONDS = 30;

function OtpStep({
  maskedEmail,
  expiresAt,
  onBack,
  onSuccess,
  onForceChange,
  onTerminalFailure,
}: {
  maskedEmail: string;
  expiresAt: string;
  onBack: () => void;
  onSuccess: () => void;
  onForceChange: () => void;
  onTerminalFailure: (msg: string) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  const [minutesLeft, setMinutesLeft] = useState<number>(() =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus the OTP input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  // Minutes-left ticker (just for the helper line "Code expires in N min").
  useEffect(() => {
    const t = setInterval(() => {
      setMinutesLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000)));
    }, 30 * 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.terminal) {
          onTerminalFailure(data.error || "Verification failed.");
          return;
        }
        const remaining =
          typeof data.attemptsRemaining === "number"
            ? ` (${data.attemptsRemaining} ${data.attemptsRemaining === 1 ? "attempt" : "attempts"} left)`
            : "";
        setError(`${data.error || "Verification failed."}${remaining}`);
        return;
      }
      // OTP was fine but the user must change their password before they
      // get a real session. Route to /change-password.
      if (data.needsPasswordChange) {
        onForceChange();
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.terminal) {
          onTerminalFailure(data.error || "Verification session expired.");
          return;
        }
        setError(data.error || "Couldn't resend the code.");
        return;
      }
      setInfo("A new code has been sent to your email.");
      setCooldownSec(OTP_RESEND_COOLDOWN_SECONDS);
      setCode("");
      inputRef.current?.focus();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[12px] text-[#64748B] hover:text-[#475569] transition-colors mb-4"
      >
        <ArrowLeft size={13} /> Back to sign-in
      </button>

      <h1 className="text-[28px] font-bold text-[#111827] tracking-[-0.01em]">Verify it&rsquo;s you</h1>
      <p className="text-[15px] text-[#6B7280] mt-1.5 leading-relaxed">
        We sent a 6-digit code to{" "}
        <span className="inline-flex items-center gap-1 font-medium text-[#334155]">
          <Mail size={13} /> {maskedEmail}
        </span>
        . Enter it below to finish signing in.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] rounded-lg px-3 py-2.5">
            {info}
          </div>
        )}

        <div>
          <label htmlFor="otp" className="block text-[14px] font-semibold text-[#111827] mb-2">
            6-digit code
          </label>
          <input
            ref={inputRef}
            id="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            maxLength={6}
            className="w-full h-12 px-4 rounded-[10px] border border-[#ECECEC] bg-[#FAFAFA] text-[20px] font-semibold tracking-[10px] text-center text-[#111827] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/25 focus:border-[#6366f1] focus:bg-white transition"
          />
          <p className="text-[11.5px] text-[#94A3B8] mt-1.5">
            {minutesLeft > 0
              ? `Code expires in about ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"}.`
              : "Code is expiring soon — request a new one if you don't have it yet."}
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          style={{ background: BTN_GRADIENT }}
          className="w-full h-12 text-white text-[15px] font-semibold rounded-[10px] hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25"
        >
          {submitting ? "Verifying…" : "Verify and sign in"}
        </button>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#64748B]">Didn&rsquo;t get the email?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldownSec > 0}
            className="text-[#4f46e5] font-medium hover:underline disabled:no-underline disabled:text-[#94A3B8] disabled:cursor-not-allowed"
          >
            {cooldownSec > 0 ? `Resend in ${cooldownSec}s` : resending ? "Sending…" : "Resend code"}
          </button>
        </div>
      </form>

      <p className="text-[13px] text-[#6B7280] mt-6">
        We&rsquo;re here to assist you at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#4f46e5] underline underline-offset-2 hover:opacity-80">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
