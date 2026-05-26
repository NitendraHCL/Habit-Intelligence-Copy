"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Lock, ShieldCheck, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

/**
 * Three-step state machine for forgot-password:
 *   1. email      → user types their email, we email an OTP
 *   2. otp        → user enters the 6-digit code
 *   3. newPassword → user sets a new password (+ confirm)
 *   4. done       → success card with a link back to /login
 *
 * The flow never auto-signs the user in. After reset, they go to /login
 * and use the new password (and pass MFA if it's enabled for them).
 *
 * On reload at step 2 or 3, the user gets bounced back to step 1 — we
 * don't try to resume mid-flow. It's a one-shot path.
 */
type Step =
  | { kind: "email" }
  | { kind: "otp"; maskedEmail: string; expiresAt: string }
  | { kind: "newPassword"; maskedEmail: string }
  | { kind: "done" };

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>({ kind: "email" });

  return (
    <div className="min-h-screen bg-white">
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr]">
        <div className="relative flex flex-col px-8 py-10 lg:px-14 lg:py-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-habit-expanded.svg" alt="Habit Intelligence" className="h-9 w-auto" />

          <div className="flex-1 flex flex-col justify-center max-w-[380px] w-full">
            {step.kind === "email" && (
              <EmailStep
                onNext={(maskedEmail, expiresAt) =>
                  setStep({ kind: "otp", maskedEmail, expiresAt })
                }
              />
            )}
            {step.kind === "otp" && (
              <OtpStep
                maskedEmail={step.maskedEmail}
                expiresAt={step.expiresAt}
                onBack={() => setStep({ kind: "email" })}
                onSuccess={() =>
                  setStep({ kind: "newPassword", maskedEmail: step.maskedEmail })
                }
                onTerminal={() => setStep({ kind: "email" })}
              />
            )}
            {step.kind === "newPassword" && (
              <NewPasswordStep
                onSuccess={() => setStep({ kind: "done" })}
                onTerminal={() => setStep({ kind: "email" })}
              />
            )}
            {step.kind === "done" && <DoneStep />}
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

// ─── step 1: email ────────────────────────────────────────────────────────

function EmailStep({
  onNext,
}: {
  onNext: (maskedEmail: string, expiresAt: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't start the reset.");
        return;
      }
      onNext(data.maskedEmail, data.expiresAt);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-[12px] text-[#64748B] hover:text-[#475569] transition-colors mb-4"
      >
        <ArrowLeft size={13} /> Back to sign-in
      </Link>

      <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
        Reset your password
      </h1>
      <p className="text-[14px] text-[#64748B] mt-2 leading-relaxed">
        Enter the email tied to your Habit Intelligence account. We&rsquo;ll send you a
        6-digit code to verify it&rsquo;s really you.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5">
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
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoFocus
            autoComplete="email"
            className="w-full h-11 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)" }}
          className="w-full h-11 text-white text-[14px] font-semibold rounded-lg hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25"
        >
          {loading ? "Sending code…" : "Send verification code"}
        </button>
      </form>
    </>
  );
}

// ─── step 2: OTP ──────────────────────────────────────────────────────────

const OTP_RESEND_COOLDOWN_SECONDS = 30;

function OtpStep({
  maskedEmail,
  expiresAt,
  onBack,
  onSuccess,
  onTerminal,
}: {
  maskedEmail: string;
  expiresAt: string;
  onBack: () => void;
  onSuccess: () => void;
  onTerminal: () => void;
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  useEffect(() => {
    const t = setInterval(() => {
      setMinutesLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000)));
    }, 30 * 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.terminal) {
          onTerminal();
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

  const onResend = async () => {
    setError("");
    setInfo("");
    setResending(true);
    try {
      const res = await fetch("/api/auth/reset-password/resend-otp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.terminal) {
          onTerminal();
          return;
        }
        setError(data.error || "Couldn't resend the code.");
        return;
      }
      setInfo("A new code has been sent.");
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
        <ArrowLeft size={13} /> Use a different email
      </button>

      <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
        Check your email
      </h1>
      <p className="text-[14px] text-[#64748B] mt-2 leading-relaxed">
        If <span className="font-medium text-[#334155]">{maskedEmail}</span> is registered with us,
        we just sent a 6-digit code there.{" "}
        <span className="inline-flex items-center gap-1 text-[#475569]">
          <Mail size={13} /> Check your inbox.
        </span>
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5">
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
          {submitting ? "Verifying…" : "Verify code"}
        </button>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#64748B]">Didn&rsquo;t get the email?</span>
          <button
            type="button"
            onClick={onResend}
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

// ─── step 3: new password ─────────────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 8;

function NewPasswordStep({
  onSuccess,
  onTerminal,
}: {
  onSuccess: () => void;
  onTerminal: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const lengthOk = password.length >= MIN_PASSWORD_LENGTH;
  const matches = password.length > 0 && password === confirm;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!lengthOk) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (!matches) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.terminal) {
          onTerminal();
          return;
        }
        setError(data.error || "Couldn't update your password.");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
        Set a new password
      </h1>
      <p className="text-[14px] text-[#64748B] mt-2 leading-relaxed">
        Choose something you haven&rsquo;t used elsewhere. After this, you&rsquo;ll be signed
        out of all devices and need to sign in again.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="new-password" className="block text-[13px] font-medium text-[#334155] mb-1.5">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              required
              autoFocus
              autoComplete="new-password"
              className="w-full h-11 px-3.5 pr-11 rounded-lg border border-[#E2E8F0] bg-white text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] transition-colors"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p className={`text-[11.5px] mt-1.5 ${lengthOk ? "text-emerald-600" : "text-[#94A3B8]"}`}>
            {lengthOk ? "✓ Looks good." : `Minimum ${MIN_PASSWORD_LENGTH} characters.`}
          </p>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-[13px] font-medium text-[#334155] mb-1.5">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type={showPw ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
            required
            autoComplete="new-password"
            className="w-full h-11 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
          />
          {confirm.length > 0 && (
            <p className={`text-[11.5px] mt-1.5 ${matches ? "text-emerald-600" : "text-red-600"}`}>
              {matches ? "✓ Passwords match." : "Passwords don't match."}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !lengthOk || !matches}
          style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)" }}
          className="w-full h-11 text-white text-[14px] font-semibold rounded-lg hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25"
        >
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}

// ─── step 4: done ─────────────────────────────────────────────────────────

function DoneStep() {
  return (
    <div className="flex flex-col items-start">
      <div className="flex items-center justify-center rounded-full bg-emerald-100 mb-4" style={{ width: 44, height: 44 }}>
        <CheckCircle2 className="text-emerald-600" size={26} />
      </div>
      <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
        Password updated
      </h1>
      <p className="text-[14px] text-[#64748B] mt-2 leading-relaxed">
        You&rsquo;ve been signed out of all devices for security. Use your new password to
        sign in again.
      </p>
      <Link
        href="/login"
        className="mt-7 inline-flex items-center justify-center w-full h-11 text-white text-[14px] font-semibold rounded-lg hover:opacity-95 transition-all shadow-sm shadow-[#4f46e5]/25"
        style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)" }}
      >
        Go to sign-in
      </Link>
    </div>
  );
}
