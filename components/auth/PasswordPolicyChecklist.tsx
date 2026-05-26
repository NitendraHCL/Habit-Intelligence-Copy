"use client";

import { Check, X } from "lucide-react";
import { evaluatePolicy, type PolicyRuleStatus } from "@/lib/auth/password-policy";

/**
 * Live per-rule policy checklist with a strength meter on top.
 *
 * Renders the result of `evaluatePolicy(password)` as a vertical list of
 * rules with ✓/✗ markers, plus a 4-segment strength bar that fills as
 * more rules pass. Used by both /forgot-password (new password step) and
 * /portal/admin/user-management (create/edit form).
 *
 * Strength bar isn't a real cryptographic strength estimator — it's a
 * rule-coverage indicator. That's the right thing here because the
 * policy IS the strength bar: a user who clears every rule is at the
 * level we accept; one who doesn't, isn't.
 */
export function PasswordPolicyChecklist({
  password,
  className = "",
}: {
  password: string;
  className?: string;
}) {
  const rules = evaluatePolicy(password);
  const passed = rules.filter((r) => r.ok).length;
  const total = rules.length;
  const pct = password.length === 0 ? 0 : Math.round((passed / total) * 100);
  const meterColour =
    password.length === 0
      ? "#E5E7EB"
      : pct < 50
        ? "#EF4444"
        : pct < 100
          ? "#F59E0B"
          : "#10B981";
  const meterLabel =
    password.length === 0
      ? "Start typing your new password"
      : pct < 50
        ? "Weak"
        : pct < 100
          ? "Almost there"
          : "Meets all requirements";

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Strength meter */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11.5px] text-[#64748B]">Password strength</span>
          <span className="text-[11.5px] font-medium" style={{ color: meterColour }}>
            {meterLabel}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{ width: `${pct}%`, backgroundColor: meterColour }}
          />
        </div>
      </div>

      {/* Rule list */}
      <ul className="space-y-1">
        {rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} dim={password.length === 0} />
        ))}
      </ul>
    </div>
  );
}

function RuleRow({ rule, dim }: { rule: PolicyRuleStatus; dim: boolean }) {
  // Until the user types anything, show every rule as a neutral grey
  // placeholder — surfacing red ✗ on an empty field is hostile UX.
  const colour = dim
    ? "#94A3B8"
    : rule.ok
      ? "#10B981"
      : "#DC2626";
  const Icon = rule.ok && !dim ? Check : X;
  return (
    <li className="flex items-center gap-1.5 text-[12px]" style={{ color: colour }}>
      <Icon size={12.5} strokeWidth={2.5} aria-hidden="true" />
      <span>{rule.label}</span>
    </li>
  );
}

/**
 * Returns true only if every policy rule is currently satisfied. The UI
 * uses this to gate the submit button — server still re-validates.
 */
export function isPasswordPolicyMet(password: string): boolean {
  return evaluatePolicy(password).every((r) => r.ok);
}
