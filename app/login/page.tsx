"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, ShieldCheck, ArrowLeft, Mail } from "lucide-react";

// Step machine for the login form. We keep this dead simple — credentials
// first, OTP second. On any terminal MFA error we bounce back to step 1 so
// the user re-enters their password (which re-issues a fresh OTP).
type Step =
  | { kind: "credentials" }
  | { kind: "otp"; maskedEmail: string; expiresAt: string };

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
    <div className="min-h-screen bg-white">
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* LEFT: form */}
        <div className="relative flex flex-col px-8 py-10 lg:px-14 lg:py-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-habit-expanded.svg"
            alt="Habit Intelligence"
            className="h-9 w-auto"
          />

          <div className="flex-1 flex flex-col justify-center max-w-[380px] w-full">
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
                onTerminalFailure={(msg) => {
                  setError(msg);
                  setStep({ kind: "credentials" });
                }}
              />
            )}
          </div>

          <div className="space-y-3 pt-6">
            <div className="flex items-center gap-2 text-[12px] text-[#64748B]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              All systems operational
            </div>
            <div className="flex items-center gap-4 text-[12px] text-[#94A3B8]">
              <a href="#" className="hover:text-[#475569] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[#475569] transition-colors">Terms</a>
              <a
                href="mailto:support.healthcare@hclhealthcare.in"
                className="hover:text-[#475569] transition-colors"
              >
                Support
              </a>
              <span className="ml-auto">© 2026 HCL Healthcare</span>
            </div>
          </div>
        </div>

        {/* RIGHT: product preview */}
        <div
          className="hidden lg:flex relative items-center justify-center px-12 py-12 overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 100% 0%, #E0E7FF 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 0% 100%, #F5F3FF 0%, transparent 55%), #FAFAFB",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.4]"
            style={{
              backgroundImage: "radial-gradient(circle, #CBD5E1 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />

          <div className="relative w-full max-w-[720px]">
            <div
              className="rounded-xl overflow-hidden bg-white ring-1 ring-black/5 transform-gpu rotate-[-0.5deg] hover:rotate-0 transition-transform duration-700 ease-out"
              style={{
                boxShadow:
                  "0 1px 2px rgba(15,23,42,0.04), 0 12px 24px rgba(15,23,42,0.08), 0 32px 64px rgba(79,70,229,0.14)",
              }}
            >
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#F1F5F9] bg-[#FAFAFB]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FCA5A5]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FCD34D]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#86EFAC]" />
                <div className="ml-3 flex-1 max-w-[280px] h-6 rounded-md bg-white border border-[#E2E8F0] flex items-center px-3">
                  <span className="text-[11px] text-[#94A3B8]">intelligence.habithealth.com</span>
                </div>
              </div>
              <Image
                src="/login-preview.png"
                alt="Habit Intelligence dashboard"
                width={1600}
                height={1000}
                className="w-full h-auto block"
                priority
              />
            </div>

            <div className="text-center mt-10">
              <p className="text-[15px] text-[#334155] font-medium">
                Real-time wellness analytics for corporate India.
              </p>
              <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-[#64748B]">
                <span>227K employees</span>
                <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
                <span>4 service categories</span>
                <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
                <span>8 sites</span>
              </div>

              <div className="mt-6 flex items-center justify-center gap-5 text-[11px] text-[#64748B]">
                <span className="flex items-center gap-1.5">
                  <Lock size={12} className="text-[#475569]" />
                  Bank-grade encryption
                </span>
                <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={12} className="text-[#475569]" />
                  HIPAA compliant
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
        Sign in to Habit Intelligence
      </h1>
      <p className="text-[14px] text-[#64748B] mt-2">
        Enter your credentials to access the analytics portal.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-[13px] font-medium text-[#334155] mb-1.5">
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
            className="w-full h-11 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="text-[13px] font-medium text-[#334155]">
              Password
            </label>
            <a
              href="mailto:support.healthcare@hclhealthcare.in?subject=Password%20reset"
              className="text-[12px] text-[#4f46e5] hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="w-full h-11 px-3.5 pr-11 rounded-lg border border-[#E2E8F0] bg-white text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
            />
            <button
              type="button"
              onClick={onToggleShowPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)" }}
          className="w-full h-11 text-white text-[14px] font-semibold rounded-lg hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25 mt-1"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
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
  onTerminalFailure,
}: {
  maskedEmail: string;
  expiresAt: string;
  onBack: () => void;
  onSuccess: () => void;
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

      <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
        Verify it&rsquo;s you
      </h1>
      <p className="text-[14px] text-[#64748B] mt-2 leading-relaxed">
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
          <label htmlFor="otp" className="block text-[13px] font-medium text-[#334155] mb-1.5">
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
            className="w-full h-12 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-[20px] font-semibold tracking-[10px] text-center text-[#0F172A] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
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
          style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)" }}
          className="w-full h-11 text-white text-[14px] font-semibold rounded-lg hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25"
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
