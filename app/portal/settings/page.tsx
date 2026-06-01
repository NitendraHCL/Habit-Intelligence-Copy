"use client";

import { useState } from "react";
import { T } from "@/lib/ui/theme";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";

/**
 * Account settings — currently the self-service password change. No
 * page-access gate (this is an account page for every authenticated user,
 * not a client dashboard). Posts to /api/auth/account/change-password,
 * which verifies the current password and applies the policy + history
 * checks server-side.
 */
export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not change password. Please try again.");
        return;
      }
      setDone(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch {
      setError("Could not change password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = "w-full h-10 px-3 pr-10 rounded-lg text-[13px] outline-none";

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-[22px] font-bold mb-1" style={{ color: T.textPrimary }}>Settings</h1>
      <p className="text-[13px] mb-6" style={{ color: T.textSecondary }}>Manage your account security.</p>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow, background: T.white }}
      >
        <div className="flex items-center gap-2.5 px-6 py-4" style={{ borderBottom: `1px solid ${T.borderLight}` }}>
          <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: T.indigoLight, color: T.indigo }}>
            <Lock size={15} />
          </span>
          <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>Change Password</h2>
        </div>

        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          {done && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]" style={{ background: T.greenLight, color: "#15803d" }}>
              <CheckCircle2 size={16} /> Your password has been changed.
            </div>
          )}
          {error && (
            <div className="rounded-lg px-3 py-2.5 text-[13px]" style={{ background: T.coralLight, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {[
            { label: "Current password", value: current, set: setCurrent, auto: "current-password" },
            { label: "New password", value: next, set: setNext, auto: "new-password" },
            { label: "Confirm new password", value: confirm, set: setConfirm, auto: "new-password" },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: T.textSecondary }}>{f.label}</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={f.value}
                  onChange={(e) => { f.set(e.target.value); setDone(false); }}
                  autoComplete={f.auto}
                  className={inputStyle}
                  style={{ border: `1px solid ${T.border}`, color: T.textPrimary }}
                  required
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: T.textMuted }}
          >
            {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? "Hide" : "Show"} passwords
          </button>

          <button
            type="submit"
            disabled={loading || !current || !next || !confirm}
            className="h-10 px-5 rounded-lg text-[13px] font-bold w-full sm:w-auto"
            style={{
              background: loading || !current || !next || !confirm ? "#9CA3AF" : "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff",
            }}
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
