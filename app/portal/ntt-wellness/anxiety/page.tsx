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
        <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}</div>
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

  // Share-of-respondents helper — every headline number is shown as a count + %.
  const total = kpis?.totalRespondents || 0;
  const pct = (n) => (total > 0 ? `${Math.round(((n || 0) / total) * 1000) / 10}%` : "0%");
  const topAction = actions.reduce((a, b) => (b.count > (a?.count ?? -1) ? b : a), null);

  // Relabelled for the AI page summary so it speaks the Joy Index vocabulary
  // rather than the raw promoter / support / immediate KPI keys.
  const glanceKpis = kpis ? {
    "Total Respondents": kpis.totalRespondents,
    "Good (0-4)": `${kpis.promoters} (${pct(kpis.promoters)})`,
    "Mild Concerns, Need Support (5-14)": `${kpis.supportNeed} (${pct(kpis.supportNeed)})`,
    "High Concern, Needs priority support (15+)": `${kpis.immediateSupport} (${pct(kpis.immediateSupport)})`,
  } : {};

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
        configureSlot={<ConfigurePanel pageSlug={PAGE_SLUG} pageTitle="Joy Index" charts={configureCharts} filters={["dateFrom", "dateTo", "genders", "ageGroups"]} onPreview={setPreviewConfig} isPreview={isPreview} />}
      />
      {hasActiveFilters && <ActiveFilterChips filters={applied} labels={filterLabels} onRemove={handleRemoveChip} onClearAll={handleClearAll} />}

      <PageGlanceBox
        pageTitle="Joy Index"
        pageSubtitle="NTT DATA (NDBS)"
        kpis={glanceKpis}
        fallbackSummary={`${formatNum(total)} employees completed this screening (GAD-7). ${formatNum(kpis?.promoters || 0)} (${pct(kpis?.promoters)}) are Good, ${formatNum(kpis?.supportNeed || 0)} (${pct(kpis?.supportNeed)}) have Mild Concerns (Need Support) and ${formatNum(kpis?.immediateSupport || 0)} (${pct(kpis?.immediateSupport)}) are High Concern (Needs priority support).`}
        fallbackChips={[
          { label: "Respondents", value: formatNum(total) },
          { label: "Good", value: `${formatNum(kpis?.promoters || 0)} (${pct(kpis?.promoters)})` },
          { label: "Mild Concerns", value: `${formatNum(kpis?.supportNeed || 0)} (${pct(kpis?.supportNeed)})` },
          { label: "High Concern", value: `${formatNum(kpis?.immediateSupport || 0)} (${pct(kpis?.immediateSupport)})` },
        ]}
      />

      <WarmSection>
        <AccentBar color={ACCENT} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Joy Index</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>0–4 Good · 5–9 Concern · 10–14 Mild Concerns (Need Support) · ≥15 High Concern (Needs priority support)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Respondents" value={kpis?.totalRespondents || 0} color={OHC_CATEGORICAL[0]} sub="Completed this screening (GAD-7)" />
          <StatCard label="Good" value={kpis?.promoters || 0} pill={pct(kpis?.promoters)} color={OHC_CATEGORICAL[2]} sub="Score 0–4" />
          <StatCard label="Mild Concerns (Need Support)" value={kpis?.supportNeed || 0} pill={pct(kpis?.supportNeed)} color={OHC_CATEGORICAL[3]} sub="Score 5–14" />
          <StatCard label="High Concern (Needs priority support)" value={kpis?.immediateSupport || 0} pill={pct(kpis?.immediateSupport)} color={OHC_CATEGORICAL[4]} sub="Score ≥15" />
        </div>
      </WarmSection>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {isChartVisible("classificationDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Classification Distribution" subtitle="Respondents by Joy Index band"
            tooltipText="Per-respondent Joy Index score bucketed into Good / Mild Concern / Moderate Concern / High Concern." chartId="classificationDistribution"
            chartData={bands} chartTitle="Classification Distribution" chartDescription="Joy Index bands">
            <Donut data={classDonut} />
            <InsightBox text={`${formatNum(kpis?.promoters || 0)} of ${formatNum(total)} respondents (${pct(kpis?.promoters)}) fall in the Good band; ${formatNum(kpis?.immediateSupport || 0)} (${pct(kpis?.immediateSupport)}) are High Concern and need priority support.`} />
          </CVCard>
        )}
        {isChartVisible("scoreDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#4f46e5" title="Score Distribution" subtitle="Respondents grouped by action band"
            tooltipText="Good 0–4 · Mild Concerns (Need Support) 5–14 · High Concern (Needs priority support) ≥15." chartId="scoreDistribution"
            chartData={scoreBars} chartTitle="Score Distribution" chartDescription="Joy Index action bands">
            <VerticalBars data={scoreBars} showPct />
            <InsightBox text={topAction
              ? `The largest group is ${topAction.label} — ${formatNum(topAction.count)} respondents (${pct(topAction.count)}). Each bar shows the count and its share of all ${formatNum(total)} respondents.`
              : "No respondents match the current filters."} />
          </CVCard>
        )}
        {isChartVisible("actionDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#0d9488" title="Action Distribution" subtitle="Recommended action split"
            tooltipText="Good / Mild Concerns (Need Support) / High Concern (Needs priority support), rolled up from the classification bands." chartId="actionDistribution"
            chartData={actions} chartTitle="Action Distribution" chartDescription="Joy Index recommended actions">
            <Donut data={actionDonut} />
            <InsightBox text={`${formatNum(kpis?.supportNeed || 0)} respondents (${pct(kpis?.supportNeed)}) have Mild Concerns and need support, while ${formatNum(kpis?.immediateSupport || 0)} (${pct(kpis?.immediateSupport)}) are High Concern and need priority support.`} />
          </CVCard>
        )}

        {isChartVisible("responseByQuestion") && (
          <CVCard className="lg:col-span-3" pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Response Distribution by Question"
            subtitle="How respondents answered each of the 7 Joy Index items" chartId="responseByQuestion"
            chartData={byQuestion} chartTitle="Response Distribution by Question" chartDescription="Per-question Joy Index answer split">
            <ResponseByQuestion questions={byQuestion} colors={FREQ_COLORS} />
            <InsightBox text="Each bar is one Joy Index question, split by response frequency (see legend: 'Not at all' → 'Nearly everyday'). Items with a larger 'Over half the days' / 'Nearly everyday' share are the ones driving the concern." />
          </CVCard>
        )}

        <div className="lg:col-span-3">
          <DataAuditSection provenance={data?._meta?.provenance} />
        </div>
      </div>
    </div>
  );
}
