"use client";

import { useAuth } from "@/lib/contexts/auth-context";
import { T } from "@/lib/ui/theme";
import { User as UserIcon, Mail, Shield, Building2 } from "lucide-react";

/**
 * Account profile — read-only view of the signed-in user. No page-access
 * gate (usePageAccess) here: this is an account page available to every
 * authenticated user, not a client dashboard, so it must not be filtered
 * by enabledPages.
 */
export default function ProfilePage() {
  const { user, activeClient } = useAuth();

  const initials =
    user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  const roleLabel = user?.role?.replace(/_/g, " ") ?? "—";

  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <UserIcon size={15} />, label: "Name", value: user?.name || "—" },
    { icon: <Mail size={15} />, label: "Email", value: user?.email || "—" },
    { icon: <Shield size={15} />, label: "Role", value: roleLabel },
    {
      icon: <Building2 size={15} />,
      label: "Client",
      value: activeClient ? `${activeClient.cugName} (${activeClient.cugCode})` : "—",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-[22px] font-bold mb-1" style={{ color: T.textPrimary }}>
        Profile
      </h1>
      <p className="text-[13px] mb-6" style={{ color: T.textSecondary }}>
        Your account details.
      </p>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow, background: T.white }}
      >
        <div className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: `1px solid ${T.borderLight}` }}>
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full text-[18px] font-bold"
            style={{ background: T.indigoLight, color: T.blue }}
          >
            {initials}
          </div>
          <div>
            <p className="text-[16px] font-bold" style={{ color: T.textPrimary }}>{user?.name || "User"}</p>
            <p className="text-[12px] uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>{roleLabel}</p>
          </div>
        </div>

        <div className="divide-y" style={{ borderColor: T.borderLight }}>
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-6 py-3.5">
              <span style={{ color: T.textMuted }}>{r.icon}</span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] w-24 shrink-0" style={{ color: T.textMuted }}>
                {r.label}
              </span>
              <span className="text-[13.5px]" style={{ color: T.textPrimary }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[12px] mt-4" style={{ color: T.textMuted }}>
        Need to change your password? Go to{" "}
        <a href="/portal/settings" className="font-semibold" style={{ color: T.indigo }}>Settings</a>.
      </p>
    </div>
  );
}
