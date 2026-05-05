"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/portal/home";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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

      router.push(redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* LEFT: form */}
        <div className="relative flex flex-col px-8 py-10 lg:px-14 lg:py-12">
          {/* Logo top-left */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-habit-expanded.svg"
            alt="Habit Intelligence"
            className="h-9 w-auto"
          />

          <div className="flex-1 flex flex-col justify-center max-w-[380px] w-full">
            <h1 className="text-[26px] font-semibold text-[#0F172A] tracking-[-0.01em]">
              Sign in to Habit Intelligence
            </h1>
            <p className="text-[14px] text-[#64748B] mt-2">
              Enter your credentials to access the analytics portal.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg px-3 py-2.5">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-[13px] font-medium text-[#334155] mb-1.5"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="w-full h-11 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="text-[13px] font-medium text-[#334155]"
                  >
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
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full h-11 px-3.5 pr-11 rounded-lg border border-[#E2E8F0] bg-white text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
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
                style={{
                  background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)",
                }}
                className="w-full h-11 text-white text-[14px] font-semibold rounded-lg hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#4f46e5]/25 mt-1"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="space-y-3 pt-6">
            <div className="flex items-center gap-2 text-[12px] text-[#64748B]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              All systems operational
            </div>
            <div className="flex items-center gap-4 text-[12px] text-[#94A3B8]">
              <a href="#" className="hover:text-[#475569] transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-[#475569] transition-colors">
                Terms
              </a>
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
          {/* Subtle dot grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.4]"
            style={{
              backgroundImage:
                "radial-gradient(circle, #CBD5E1 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              maskImage:
                "radial-gradient(ellipse at center, black 30%, transparent 75%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />

          <div className="relative w-full max-w-[720px]">
            {/* Browser frame */}
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
                  <span className="text-[11px] text-[#94A3B8]">
                    intelligence.habithealth.com
                  </span>
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

            {/* Caption */}
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

              {/* Trust strip */}
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
