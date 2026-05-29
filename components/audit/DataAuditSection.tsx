"use client";

/* ────────────────────────────────────────────────────────────────────
 * DataAuditSection — superadmin-only "Data Audit" panel pinned to the
 * bottom of a dashboard. For each chart it lists the source warehouse
 * table(s) and the plain-English extraction logic.
 *
 * The provenance object is supplied by the dashboard's API response
 * (`data._meta.provenance`), which the server only ships to SUPER_ADMIN
 * callers. We additionally gate on the client role so the section never
 * renders for anyone else even if the field were somehow present.
 * ──────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { Database, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/contexts/auth-context";
import { T } from "@/lib/ui/theme";
import type { DashboardProvenance } from "@/lib/audit/provenance";

export default function DataAuditSection({
  provenance,
}: {
  provenance?: DashboardProvenance;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expandedSql, setExpandedSql] = useState<Record<string, boolean>>({});

  // Double gate: client role AND server-supplied payload.
  if (user?.role !== "SUPER_ADMIN") return null;
  if (!provenance || Object.keys(provenance).length === 0) return null;

  const entries = Object.entries(provenance);

  return (
    <div
      className="mt-6 rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow, background: T.white }}
      data-audit-section
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <span className="flex items-center gap-2.5">
          <span
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ background: T.indigoLight, color: T.indigo }}
          >
            <Database size={15} />
          </span>
          <span>
            <span className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
                Data Audit — Source & Extraction Logic
              </h3>
              <span
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
                style={{ background: T.amberLight, color: T.amber }}
              >
                <ShieldCheck size={11} /> Superadmin
              </span>
            </span>
            <p className="text-[12px] mt-0.5" style={{ color: T.textSecondary }}>
              {entries.length} chart{entries.length === 1 ? "" : "s"} · source table(s) and per-chart aggregation rule
            </p>
          </span>
        </span>
        {open ? (
          <ChevronDown size={18} style={{ color: T.textMuted }} />
        ) : (
          <ChevronRight size={18} style={{ color: T.textMuted }} />
        )}
      </button>

      {open && (
        <div className="px-6 pb-5" style={{ borderTop: `1px solid ${T.borderLight}` }}>
          <div className="divide-y" style={{ borderColor: T.borderLight }}>
            {entries.map(([key, p]) => {
              const sqlOpen = !!expandedSql[key];
              return (
                <div key={key} className="py-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h4 className="text-[13.5px] font-bold" style={{ color: T.textPrimary }}>
                      {p.chart}
                    </h4>
                    <code className="text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: T.borderLight, color: T.textMuted }}>
                      {key}
                    </code>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] mr-1" style={{ color: T.textMuted }}>
                      Source
                    </span>
                    {p.sources.map((s) => (
                      <span
                        key={s}
                        className="text-[11.5px] font-mono px-2 py-0.5 rounded"
                        style={{ background: T.indigoLight, color: T.blue }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: T.textSecondary }}>
                    {p.logic}
                  </p>

                  {p.sql && (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedSql((m) => ({ ...m, [key]: !sqlOpen }))}
                        className="flex items-center gap-1 text-[11px] font-semibold"
                        style={{ color: T.indigo }}
                      >
                        {sqlOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {sqlOpen ? "Hide" : "Show"} aggregation snippet
                      </button>
                      {sqlOpen && (
                        <pre
                          className="mt-1.5 text-[11px] font-mono whitespace-pre-wrap rounded-lg p-3 overflow-x-auto"
                          style={{ background: "#0f172a", color: "#e2e8f0" }}
                        >
                          {p.sql}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
