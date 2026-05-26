"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, ShieldCheck, KeyRound } from "lucide-react";
import {
  PasswordPolicyChecklist,
  isPasswordPolicyMet,
} from "@/components/auth/PasswordPolicyChecklist";

/**
 * Force-change-on-first-login (and after-admin-reset).
 *
 * The user landed here because /api/auth/login (or /verify-otp) detected
 * `mustChangePassword=true` and routed them here instead of minting a
 * session. They're identified by the hi_pending_change cookie. We POST
 * the new password to /api/auth/change-password, which validates and
 * mints the real session in one shot — the user lands directly on the
 * portal without a second sign-in.
 *
 * No "old password" prompt — they typed it less than a minute ago to
 * pass credentials. That's the design call we made.
 */
function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/portal/home";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const policyOk = isPasswordPolicyMet(password);
  const matches = password.length > 0 && password === confirm;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!policyOk) {
      setError("Please meet every password requirement.");
      return;
    }
    if (!matches) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.terminal) {
          // The pending-change cookie has been wiped server-side — send
          // the user back to the login screen to start fresh.
          router.push("/login");
          return;
        }
        setError(data.error || "Couldn't update your password.");
        return;
      }
      // Session is minted. Land directly on the portal.
      router.push(redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr]">
        <div className="relative flex flex-col px-8 py-10 lg:px-14 lg:py-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-habit-expanded.svg" alt="Habit Intelligence" className="h-9 w-auto" />

          <div className="flex-1 flex flex-col justify-center max-w-[380px] w-full">
            <div
              className="inline-flex items-center justify-center rounded-full mb-4"
              style={{ width: 44, height: 44, backgroundColor: "#EEF2FF" }}
            >
              <KeyRound className="text-[#4f46e5]" size={22} />
            </div>

            <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
              Set your password
            </h1>
            <p className="text-[14px] text-[#64748B] mt-2 leading-relaxed">
              Before you continue, choose a password only you know. Your administrator
              set a temporary one for you — pick something fresh and you&rsquo;ll be signed
              in straight away.
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
                    placeholder="Type a strong password"
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
                <PasswordPolicyChecklist password={password} className="mt-2.5" />
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
                disabled={submitting || !policyOk || !matches}
                style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)" }}
                className="w-full h-11 text-white text-[14px] font-semibold rounded-lg hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25"
              >
                {submitting ? "Setting password…" : "Set password and continue"}
              </button>
            </form>
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
                One last step before you&rsquo;re in.
              </p>
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

export default function ChangePasswordPage() {
  return (
    <Suspense>
      <ChangePasswordForm />
    </Suspense>
  );
}
