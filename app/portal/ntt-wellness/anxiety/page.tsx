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
  NttFilterBar, ActiveFilterChips, Donut, VerticalBars, ResponseByQuestion,
  FREQ_COLORS, OHC_CATEGORICAL,
} from "@/components/ntt-wellness/kit";

const PAGE_SLUG = "/portal/ntt-wellness/anxiety";
const ACCENT = "#6366f1";

const EMPTY = { dateFrom: "", dateTo: "", genders: [], ageGroups: [] };

export default function NttAnxietyPage() {
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
    return `/api/ntt-wellness/anxiety?${p.toString()}`;
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
  const charts = data?.charts;

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
        <div className="grid grid-cols-5 gap-4">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-[320px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  const bands = charts?.classificationDistribution || [];
  const actions = charts?.actionDistribution || [];
  const byQuestion = charts?.responseByQuestion || [];

  const classDonut = bands.map((b, i) => ({ name: b.label, value: b.count, color: OHC_CATEGORICAL[i % OHC_CATEGORICAL.length] }));
  const actionDonut = actions.map((a, i) => ({ name: a.label, value: a.count, color: OHC_CATEGORICAL[i % OHC_CATEGORICAL.length] }));
  const scoreBars = actions.map((a, i) => ({ name: a.label, value: a.count, color: OHC_CATEGORICAL[i % OHC_CATEGORICAL.length] }));

  const configureCharts = [
    { id: "classificationDistribution", label: "Classification Distribution" },
    { id: "scoreDistribution", label: "Score Distribution" },
    { id: "actionDistribution", label: "Action Distribution" },
    { id: "responseByQuestion", label: "Response Distribution by Question" },
  ];

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      <NttFilterBar
        filterOptions={filterOptions} pending={pending} setPending={setPending}
        onApply={handleApply} onRefresh={refresh} isRefreshing={isRefreshing} isValidating={isValidating} isLoading={isLoading}
        showRefreshToast={showRefreshToast}
        configureSlot={<ConfigurePanel pageSlug={PAGE_SLUG} pageTitle="Stress and Calmness Index" charts={configureCharts} filters={["dateFrom", "dateTo", "genders", "ageGroups"]} onPreview={setPreviewConfig} isPreview={isPreview} />}
      />
      {hasActiveFilters && <ActiveFilterChips filters={applied} labels={filterLabels} onRemove={handleRemoveChip} onClearAll={handleClearAll} />}

      <PageGlanceBox
        pageTitle="Stress and Calmness Index"
        pageSubtitle="NTT DATA (NDBS) - Generalized Anxiety Disorder 7-item scale · Score range 0–21 · higher Joy means lower anxiety"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalRespondents || 0)} employees completed the GAD-7 anxiety screen, with an average score of ${(kpis?.averageScore ?? 0).toFixed(2)} out of 21. ${formatNum(kpis?.promoters || 0)} are promoters (no anxiety), ${formatNum(kpis?.supportNeed || 0)} need support (mild–moderate) and ${formatNum(kpis?.immediateSupport || 0)} show severe anxiety needing immediate support.`}
        fallbackChips={[
          { label: "Respondents", value: formatNum(kpis?.totalRespondents || 0) },
          { label: "Avg Score", value: (kpis?.averageScore ?? 0).toFixed(2) },
          { label: "Promoters", value: formatNum(kpis?.promoters || 0) },
          { label: "Immediate", value: formatNum(kpis?.immediateSupport || 0) },
        ]}
      />

      <WarmSection>
        <AccentBar color={ACCENT} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Stress and Calmness Index</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>0–4 No Anxiety (Promoter) · 5–9 Mild · 10–14 Moderate (Support) · ≥15 Severe (Immediate)</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Respondents" value={kpis?.totalRespondents || 0} color={OHC_CATEGORICAL[0]} sub="Completed the GAD-7 screen" />
          <StatCard label="Average Score" value={kpis?.averageScore || 0} decimals={2} color={OHC_CATEGORICAL[1]} sub="Out of 21" />
          <StatCard label="Promoters" value={kpis?.promoters || 0} color={OHC_CATEGORICAL[2]} sub="No anxiety (0–4)" />
          <StatCard label="Support Need" value={kpis?.supportNeed || 0} color={OHC_CATEGORICAL[3]} sub="Mild–moderate (5–14)" />
          <StatCard label="Immediate Support" value={kpis?.immediateSupport || 0} color={OHC_CATEGORICAL[4]} sub="Severe (≥15)" />
        </div>
      </WarmSection>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {isChartVisible("classificationDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Classification Distribution" subtitle="Respondents by anxiety severity band"
            tooltipText="Per-respondent GAD-7 score bucketed into No / Mild / Moderate / Severe anxiety." chartId="classificationDistribution"
            chartData={bands} chartTitle="Classification Distribution" chartDescription="GAD-7 severity bands">
            <Donut data={classDonut} />
            <InsightBox text={`${formatNum(kpis?.promoters || 0)} of ${formatNum(kpis?.totalRespondents || 0)} respondents show no anxiety; ${formatNum(kpis?.immediateSupport || 0)} are in the severe band.`} />
          </CVCard>
        )}
        {isChartVisible("scoreDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#4f46e5" title="Score Distribution" subtitle="Respondents grouped by action band"
            tooltipText="Promoter 0–4 · Support 5–14 · Immediate ≥15." chartId="scoreDistribution"
            chartData={scoreBars} chartTitle="Score Distribution" chartDescription="GAD-7 action bands">
            <VerticalBars data={scoreBars} />
            <InsightBox text={`Most respondents (${formatNum(kpis?.supportNeed || 0)}) fall in the support band (5–14).`} />
          </CVCard>
        )}
        {isChartVisible("actionDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#0d9488" title="Action Distribution" subtitle="Recommended action split"
            tooltipText="Promoter / Support Needed / Immediate support rolled up from the classification bands." chartId="actionDistribution"
            chartData={actions} chartTitle="Action Distribution" chartDescription="GAD-7 recommended actions">
            <Donut data={actionDonut} />
            <InsightBox text={`${formatNum(kpis?.supportNeed || 0)} need support and ${formatNum(kpis?.immediateSupport || 0)} need immediate support.`} />
          </CVCard>
        )}

        {isChartVisible("responseByQuestion") && (
          <CVCard className="lg:col-span-3" pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Response Distribution by Question"
            subtitle="How respondents answered each of the 7 GAD-7 items" chartId="responseByQuestion"
            chartData={byQuestion} chartTitle="Response Distribution by Question" chartDescription="Per-question GAD-7 answer split">
            <ResponseByQuestion questions={byQuestion} colors={FREQ_COLORS} />
            <InsightBox text="Each bar is one GAD-7 question, split by response frequency (see legend: 'Not at all' → 'Nearly everyday'). Items with a larger 'Over half the days' / 'Nearly everyday' share are the ones driving anxiety." />
          </CVCard>
        )}

        <div className="lg:col-span-3">
          <DataAuditSection provenance={data?._meta?.provenance} />
        </div>
      </div>
    </div>
  );
}
