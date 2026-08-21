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
  NttFilterBar, ActiveFilterChips, Donut, VerticalBars, Gauge, ResponseByQuestion,
  OHC_CATEGORICAL,
} from "@/components/ntt-wellness/kit";

const PAGE_SLUG = "/portal/ntt-wellness/self-esteem";
const ACCENT = "#8b5cf6";
// Neutral per-question palette - OHC indigo/teal (this is a distribution chart,
// not a severity chart, so it follows the OHC scheme rather than good/bad).
const YESNO_COLORS = ["#4f46e5", "#818cf8"];

const EMPTY = { dateFrom: "", dateTo: "", genders: [], ageGroups: [] };

export default function NttSelfEsteemPage() {
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
    return `/api/ntt-wellness/self-esteem?${p.toString()}`;
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
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-[320px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  const bands = charts?.classificationDistribution || [];
  const breakdown = charts?.scoreBreakdown || [];
  const byQuestion = charts?.responseByQuestion || [];

  const classDonut = bands.map((b, i) => ({ name: b.label, value: b.count, color: OHC_CATEGORICAL[i % OHC_CATEGORICAL.length] }));
  const breakdownBars = breakdown.map((h, i) => ({
    name: h.score === 0 ? "Score 0 (Both No)" : h.score === 1 ? "Score 1 (One Yes)" : "Score 2 (Both Yes)",
    value: h.count,
    color: OHC_CATEGORICAL[i % OHC_CATEGORICAL.length],
  }));

  const configureCharts = [
    { id: "gauge", label: "Overall Self-Esteem Level" },
    { id: "classificationDistribution", label: "Classification Distribution" },
    { id: "scoreBreakdown", label: "Score Breakdown" },
    { id: "responseByQuestion", label: "Question-wise Response Analysis" },
  ];

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      <NttFilterBar
        filterOptions={filterOptions} pending={pending} setPending={setPending}
        onApply={handleApply} onRefresh={refresh} isRefreshing={isRefreshing} isValidating={isValidating} isLoading={isLoading}
        showRefreshToast={showRefreshToast}
        configureSlot={<ConfigurePanel pageSlug={PAGE_SLUG} pageTitle="Confidence and Self-Worth Index" charts={configureCharts} filters={["dateFrom", "dateTo", "genders", "ageGroups"]} onPreview={setPreviewConfig} isPreview={isPreview} />}
      />
      {hasActiveFilters && <ActiveFilterChips filters={applied} labels={filterLabels} onRemove={handleRemoveChip} onClearAll={handleClearAll} />}

      <PageGlanceBox
        pageTitle="Confidence and Self-Worth Index"
        pageSubtitle="NTT DATA (NDBS) - Two-Item Self-Esteem scale · Score range 0–2 · higher Motivation means higher self-esteem"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalRespondents || 0)} employees completed the self-esteem screen, averaging ${(kpis?.averageScore ?? 0).toFixed(2)} out of 2. ${formatNum(kpis?.promoters || 0)} are Positive Responders and ${formatNum(kpis?.supportNeed || 0)} are Responders Needing Support.`}
        fallbackChips={[
          { label: "Respondents", value: formatNum(kpis?.totalRespondents || 0) },
          { label: "Avg Score", value: (kpis?.averageScore ?? 0).toFixed(2) },
          { label: "Positive Responders", value: formatNum(kpis?.promoters || 0) },
          { label: "Needing Support", value: formatNum(kpis?.supportNeed || 0) },
        ]}
      />

      <WarmSection>
        <AccentBar color={ACCENT} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Confidence and Self-Worth Index</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Score 2 → Confidence and Self Worth (Positive Responders) · Score &lt; 2 → Confidence and Self Worth Needing Support (Responders Needing Support)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Total Respondents" value={kpis?.totalRespondents || 0} color={OHC_CATEGORICAL[0]} sub="Completed the TISE screen" />
          <StatCard label="Positive Responders" value={kpis?.promoters || 0} color={OHC_CATEGORICAL[2]} sub="Confidence and self worth (score 2)" />
          <StatCard label="Responders Needing Support" value={kpis?.supportNeed || 0} color={OHC_CATEGORICAL[3]} sub="Needing support (< 2)" />
        </div>
      </WarmSection>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {isChartVisible("gauge") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#0d9488" title="Overall Self-Esteem Level" subtitle="Average TISE score (0–2)"
            tooltipText="Mean of every respondent's TISE score, on a 0–2 scale." chartId="gauge"
            chartData={{ averageScore: kpis?.averageScore }} chartTitle="Overall Self-Esteem Level" chartDescription="Average TISE score">
            <Gauge value={kpis?.averageScore || 0} max={2} />
            <InsightBox text={`The average self-esteem score is ${(kpis?.averageScore ?? 0).toFixed(2)} of 2 - ${(kpis?.averageScore ?? 0) >= 1.5 ? "broadly healthy" : "an area to watch"}.`} />
          </CVCard>
        )}
        {isChartVisible("classificationDistribution") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Classification Distribution" subtitle="Confidence and self worth vs needing support"
            tooltipText="Score 2 → Confidence and Self Worth; score < 2 → Confidence and Self Worth Needing Support." chartId="classificationDistribution"
            chartData={bands} chartTitle="Classification Distribution" chartDescription="TISE classification">
            <Donut data={classDonut} />
            <InsightBox text={`${formatNum(kpis?.promoters || 0)} of ${formatNum(kpis?.totalRespondents || 0)} respondents are Positive Responders (confidence and self worth).`} />
          </CVCard>
        )}
        {isChartVisible("scoreBreakdown") && (
          <CVCard pageSlug={PAGE_SLUG} accentColor="#4f46e5" title="Score Breakdown" subtitle="Respondents at each score (0 / 1 / 2)"
            tooltipText="0 = both items No · 1 = one Yes · 2 = both Yes." chartId="scoreBreakdown"
            chartData={breakdownBars} chartTitle="Score Breakdown" chartDescription="TISE score histogram">
            <VerticalBars data={breakdownBars} />
            <InsightBox text="Most respondents answer Yes to both items (score 2)." />
          </CVCard>
        )}

        {isChartVisible("responseByQuestion") && (
          <CVCard className="lg:col-span-3" pageSlug={PAGE_SLUG} accentColor={ACCENT} title="Question-wise Response Analysis"
            subtitle="Yes / No split for each of the 2 self-esteem items" chartId="responseByQuestion"
            chartData={byQuestion} chartTitle="Question-wise Response Analysis" chartDescription="Per-question TISE answer split">
            <ResponseByQuestion questions={byQuestion} colors={YESNO_COLORS} />
            <InsightBox text="Each bar shows the Yes / No split per item (see legend). A larger 'No' share flags employees who may benefit from support." />
          </CVCard>
        )}

        <div className="lg:col-span-3">
          <DataAuditSection provenance={data?._meta?.provenance} />
        </div>
      </div>
    </div>
  );
}
