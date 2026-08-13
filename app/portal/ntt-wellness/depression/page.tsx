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

const PAGE_SLUG = "/portal/ntt-wellness/depression";
const ACCENT = "#0d9488";

const EMPTY = { dateFrom: "", dateTo: "", genders: [], ageGroups: [] };

export default function NttDepressionPage() {
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
    return `/api/ntt-wellness/depression?${p.toString()}`;
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
        configureSlot={<ConfigurePanel pageSlug={PAGE_SLUG} pageTitle="Mood and Energy Index" charts={configureCharts} filters={["dateFrom", "dateTo", "genders", "ageGroups"]} onPreview={setPreviewConfig} isPreview={isPreview} />}
      />
      {hasActiveFilters && <ActiveFilterChips filters={applied} labels={filterLabels} onRemove={handleRemoveChip} onClearAll={handleClearAll} />}

      <PageGlanceBox
        pageTitle="Mood and Energy Index"
        pageSubtitle="NTT DATA (NDBS) - Patient Health Questionnaire 9-item scale · Score range 0–27 · higher Enthusiasm means lower depression"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalRespondents || 0)} employees completed the PHQ-9 depression screen, averaging ${(kpis?.averageScore ?? 0).toFixed(2)} out of 27. ${formatNum(kpis?.promoters || 0)} are Positive Responders, ${formatNum(kpis?.supportNeed || 0)} are Responders Needing Support and ${formatNum(kpis?.immediateSupport || 0)} are Responders Needing Priority Support.`}
        fallbackChips={[
          { label: "Respondents", value: formatNum(kpis?.totalRespondents || 0) },
          { label: "Avg Score", value: (kpis?.averageScore ?? 0).toFixed(2) },
          { label: "Positive Responders", value: formatNum(kpis?.promoters || 0) },
          { label: "Priority Support", value: formatNum(kpis?.immediateSupport || 0) },
        ]}
      />

      <WarmSection>
        <AccentBar color={ACCENT} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Mood and Energy Index</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>0 No Mood and Energy Concerns (Positive Responders) · 1–4 Minimal · 5–9 Mild (Responders Needing Support) · 10+ Moderate–Severe (Responders Needing Priority Support)</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Respondents" value={kpis?.totalRespondents || 0} color={OHC_CATEGORICAL[0]} sub="Completed the PHQ-9 screen" />
          <StatCard label="Average Score" value={kpis?.averageScore || 0} decimals={2} color={OHC_CATEGORICAL[1]} sub="Out of 27" />
          <StatCard label="Positive Responders" value={kpis?.promoters || 0} color={OHC_CATEGORICAL[2]} sub="No mood and energy concerns (0)" />
          <StatCard label="Responders Needing Support" value={kpis?.supportNeed || 0} color={OHC_CATEGORICAL[3]} sub="Minimal–mild (1–9)" />
          <StatCard label="Responders Needing Priority Support" value={kpis?.immediateSupport || 0} color={OHC_CATEGORICAL[4]} sub="Moderate+ (≥10)" />
        </div>
      </WarmSection>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {isChartVisible("classificationDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Classification Distribution" subtitle="Respondents by depression severity band"
            tooltipText="Per-respondent PHQ-9 score bucketed into No / Minimal / Mild / Moderate / Mod. severe / Severe." chartId="classificationDistribution"
            chartData={bands} chartTitle="Classification Distribution" chartDescription="PHQ-9 severity bands">
            <Donut data={classDonut} />
            <InsightBox text={`${formatNum(kpis?.promoters || 0)} are Positive Responders (no mood and energy concerns); ${formatNum(kpis?.immediateSupport || 0)} are Responders Needing Priority Support.`} />
          </CVCard>
        )}
        {isChartVisible("scoreDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#4f46e5" title="Score Distribution" subtitle="Respondents grouped by action band"
            tooltipText="Positive Responders 0 · Responders Needing Support 1–9 · Responders Needing Priority Support ≥10." chartId="scoreDistribution"
            chartData={scoreBars} chartTitle="Score Distribution" chartDescription="PHQ-9 action bands">
            <VerticalBars data={scoreBars} />
            <InsightBox text={`${formatNum(kpis?.supportNeed || 0)} respondents are Responders Needing Support (1–9).`} />
          </CVCard>
        )}
        {isChartVisible("actionDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#0d9488" title="Action Distribution" subtitle="Recommended action split"
            tooltipText="Positive Responders / Responders Needing Support / Responders Needing Priority Support rolled up from the classification bands." chartId="actionDistribution"
            chartData={actions} chartTitle="Action Distribution" chartDescription="PHQ-9 recommended actions">
            <Donut data={actionDonut} />
            <InsightBox text={`${formatNum(kpis?.supportNeed || 0)} are Responders Needing Support and ${formatNum(kpis?.immediateSupport || 0)} are Responders Needing Priority Support.`} />
          </CVCard>
        )}

        {isChartVisible("responseByQuestion") && (
          <CVCard className="lg:col-span-3" pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Response Distribution by Question"
            subtitle="How respondents answered each of the 9 PHQ-9 items" chartId="responseByQuestion"
            chartData={byQuestion} chartTitle="Response Distribution by Question" chartDescription="Per-question PHQ-9 answer split">
            <ResponseByQuestion questions={byQuestion} colors={FREQ_COLORS} />
            <InsightBox text="Each bar is one PHQ-9 question, split by response frequency (see legend: 'Not at all' → 'Nearly everyday'). Q9 (self-harm) warrants particular attention wherever 'Over half the days' / 'Nearly everyday' responses appear." />
          </CVCard>
        )}

        <div className="lg:col-span-3">
          <DataAuditSection provenance={data?._meta?.provenance} />
        </div>
      </div>
    </div>
  );
}
