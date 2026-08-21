// @ts-nocheck
"use client";

import { T } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { useChartVisibility } from "@/lib/hooks/useChartVisibility";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import DataAuditSection from "@/components/audit/DataAuditSection";
import {
  fetcher, formatNum, AccentBar, CVCard, WarmSection, InsightBox, StatCard,
  NttFilterBar, ActiveFilterChips, ClassificationBars, MixedResponseByQuestion,
  ACTION_COLORS, OPTION_PALETTE, OHC_CATEGORICAL,
} from "@/components/ntt-wellness/kit";

const PAGE_SLUG = "/portal/ntt-wellness/workplace-wellbeing";
const ACCENT = "#4f46e5";
const EMPTY = { dateFrom: "", dateTo: "", genders: [], ageGroups: [] };

export default function NttWorkplaceWellbeingPage() {
  usePageAccess(PAGE_SLUG);
  const { activeClientId } = useAuth();

  const [pending, setPending] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [filterOptions, setFilterOptions] = useState({ genders: [], ageGroups: [] });
  const [previewConfig, setPreviewConfig] = useState(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility(PAGE_SLUG, previewConfig);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (activeClientId && activeClientId !== "all") p.set("clientId", activeClientId);
    if (applied.dateFrom) p.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) p.set("dateTo", applied.dateTo);
    if (applied.genders.length) p.set("genders", applied.genders.join(","));
    if (applied.ageGroups.length) p.set("ageGroups", applied.ageGroups.join(","));
    return `/api/ntt-wellness/workplace-wellbeing?${p.toString()}`;
  }, [activeClientId, applied]);

  const { data, isLoading, isValidating, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60000, keepPreviousData: true,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "nocache=1");
      if (!res.ok) return;
      await mutate(await res.json(), { revalidate: false });
      setShowRefreshToast(true); setTimeout(() => setShowRefreshToast(false), 3000);
    } finally { setIsRefreshing(false); }
  };

  useEffect(() => {
    const fo = data?.filterOptions;
    if (!fo) return;
    setFilterOptions((prev) => ({
      genders: fo.genders?.length ? fo.genders : prev.genders,
      ageGroups: fo.ageGroups?.length ? fo.ageGroups : prev.ageGroups,
    }));
  }, [data?.filterOptions]);

  const kpis = data?.kpis;
  const instruments = data?.charts?.instruments || [];
  const obstacles = data?.charts?.obstacles || [];

  const handleApply = () => setApplied({ ...pending });
  const handleRemoveChip = (key, value) => {
    const upd = (o) => (key === "dateFrom" || key === "dateTo") ? { ...o, [key]: "" } : { ...o, [key]: o[key].filter((v) => v !== value) };
    setApplied(upd); setPending(upd);
  };
  const handleClearAll = () => { setApplied(EMPTY); setPending(EMPTY); };
  const hasActiveFilters = !!applied.dateFrom || !!applied.dateTo || applied.genders.length > 0 || applied.ageGroups.length > 0;
  const filterLabels = { dateFrom: "From", dateTo: "To", genders: "Gender", ageGroups: "Age Group" };

  if (!data && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="h-16 bg-white rounded-2xl border animate-pulse" />
        <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-[280px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  const kpiCards = [
    { key: "psych", label: "Psychological Safety", color: OHC_CATEGORICAL[0], max: 6 },
    { key: "mgr", label: "Managerial Support", color: OHC_CATEGORICAL[2], max: 7 },
    { key: "belong", label: "Sense of Belonging", color: OHC_CATEGORICAL[3], max: 9 },
    { key: "org", label: "Org. Infrastructure", color: OHC_CATEGORICAL[4], max: 11 },
  ];

  const configureCharts = instruments.map((ins) => ({ id: ins.key, label: ins.name }));
  configureCharts.push({ id: "obstacles", label: "Open-Ended Insights: Biggest Obstacles" });

  const maxObstacle = Math.max(1, ...obstacles.map((o) => o.count));

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      <NttFilterBar
        filterOptions={filterOptions} pending={pending} setPending={setPending}
        onApply={handleApply} onRefresh={refresh} isRefreshing={isRefreshing} isValidating={isValidating} isLoading={isLoading}
        showRefreshToast={showRefreshToast}
        configureSlot={<ConfigurePanel pageSlug={PAGE_SLUG} pageTitle="Workplace Wellbeing" charts={configureCharts} filters={["dateFrom", "dateTo", "genders", "ageGroups"]} onPreview={setPreviewConfig} isPreview={isPreview} />}
      />
      {hasActiveFilters && <ActiveFilterChips filters={applied} labels={filterLabels} onRemove={handleRemoveChip} onClearAll={handleClearAll} />}

      <PageGlanceBox
        pageTitle="Workplace Wellbeing"
        pageSubtitle="NTT DATA (NDBS) - Psychological Safety · Peer Relationships · Managerial Support · Sense of Belonging · Org Infrastructure"
        kpis={kpis || {}}
        fallbackSummary={`Across NDBS, average workplace-wellbeing scores are: Psychological Safety ${(kpis?.psych ?? 0).toFixed(2)}/6, Peer Relationships ${(kpis?.peer ?? 0).toFixed(2)}/9, Managerial Support ${(kpis?.mgr ?? 0).toFixed(2)}/7, Sense of Belonging ${(kpis?.belong ?? 0).toFixed(2)}/9 and Org Infrastructure ${(kpis?.org ?? 0).toFixed(2)}/11. The most cited obstacle to wellbeing is "${obstacles[0]?.label ?? "-"}".`}
        fallbackChips={kpiCards.map((c) => ({ label: c.label, value: `${(kpis?.[c.key] ?? 0).toFixed(2)}/${c.max}` }))}
      />

      <WarmSection>
        <AccentBar color={ACCENT} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Workplace Wellbeing - Average Scores</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Mean score per instrument (each on its own scale). Higher is better across all four.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiCards.map((c) => (
            <StatCard key={c.key} label={c.label} value={kpis?.[c.key] || 0} decimals={2} color={c.color} sub={`Average · out of ${c.max}`} />
          ))}
        </div>
      </WarmSection>

      {/* Per-instrument classification + question breakdown */}
      <div className="grid grid-cols-1 gap-4">
        {instruments.map((ins) => (
          isChartVisible(ins.key) && (
            <CVCard key={ins.key} pageSlug={PAGE_SLUG} accentColor={ACCENT} title={ins.name}
              subtitle={`Average ${ins.average.toFixed(2)} / ${ins.max} · ${formatNum(ins.promoters)} Positive Responders · ${formatNum(ins.support)} Responders Needing Support`}
              chartId={ins.key} chartData={ins} chartTitle={ins.name} chartDescription="Workplace wellbeing instrument breakdown">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.06em] mb-3" style={{ color: T.textMuted }}>Classification</p>
                  <ClassificationBars bands={ins.classification} />
                  <div className="flex items-center gap-2 mt-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: `${ACTION_COLORS.promoter}18`, color: "#15803d" }}>{formatNum(ins.promoters)} Positive Responders</span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: `${ACTION_COLORS.support}18`, color: "#b45309" }}>{formatNum(ins.support)} Responders Needing Support</span>
                  </div>
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.06em] mb-3" style={{ color: T.textMuted }}>Questions</p>
                  <MixedResponseByQuestion questions={ins.byQuestion} />
                </div>
              </div>
            </CVCard>
          )
        ))}

        {/* Open-Ended Insights: Biggest Obstacles */}
        {isChartVisible("obstacles") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#f97316" title="Open-Ended Insights: Biggest Obstacles to Wellbeing"
            subtitle="Single biggest obstacle preventing employees from maintaining their wellbeing"
            chartId="obstacles" chartData={obstacles} chartTitle="Biggest Obstacles to Wellbeing" chartDescription="Obstacle distribution">
            <div className="space-y-2.5 mt-1">
              {obstacles.map((o, i) => (
                <div key={o.label} className="flex items-center gap-3">
                  <div className="w-[240px] shrink-0 text-[12px] font-medium truncate" style={{ color: T.textPrimary }} title={o.label}>{o.label}</div>
                  <div className="flex-1 h-6 rounded-md relative" style={{ backgroundColor: T.borderLight }}>
                    <div className="h-6 rounded-md flex items-center justify-end pr-2 text-[11px] font-bold text-white" style={{ width: `${Math.max((o.count / maxObstacle) * 100, o.count > 0 ? 6 : 0)}%`, backgroundColor: OPTION_PALETTE[i % OPTION_PALETTE.length] }}>
                      {o.count > 0 ? formatNum(o.count) : ""}
                    </div>
                  </div>
                </div>
              ))}
              {obstacles.length === 0 && <p className="text-[13px] py-6 text-center" style={{ color: T.textMuted }}>No data for the selected filters.</p>}
            </div>
            <InsightBox text={`The most cited obstacle is "${obstacles[0]?.label ?? "-"}" (${formatNum(obstacles[0]?.count || 0)} employees). "No Obstacles so far" responses indicate employees with no current wellbeing barriers.`} />
          </CVCard>
        )}

        <DataAuditSection provenance={data?._meta?.provenance} />
      </div>
    </div>
  );
}
