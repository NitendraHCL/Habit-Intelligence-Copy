"use client";

import { useState } from "react";
import {
  Info,
  Maximize2,
  Minimize2,
  Bell,
  Download,
  Mail,
  ClipboardList,
  Users,
  Filter,
  Send,
  FileText,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { T } from "@/lib/ui/theme";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

/* ═══════════════════════════════════════════════════════════════════
   Sub-components — matching OHC Utilisation design theme
   ═══════════════════════════════════════════════════════════════════ */

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card (matching OHC Utilisation CVCard with hover lift) ───
function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true,
  chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean;
  chartData?: unknown; chartTitle?: string; chartDescription?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px ${expanded ? "col-span-full" : ""} ${className}`}
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      {(title || accentColor) && (
        <div className="px-6 pt-5 pb-1">
          {accentColor && <AccentBar color={accentColor} />}
          {title && (
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{title}</h3>
                  {tooltipText && (
                    <Tooltip>
                      <TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{tooltipText}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {subtitle && <p className="text-[13px] mt-0.5" style={{ color: T.textSecondary }}>{subtitle}</p>}
              </div>
              {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
              {expandable && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-2" style={{ color: T.textMuted }} onClick={() => setExpanded(!expanded)}>
                  {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="px-6 pb-5">{children}</div>
    </div>
  );
}

// ─── Warm Section (matching OHC Utilisation) ───
function WarmSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-6 sm:p-7 ${className}`} style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>
      {children}
    </div>
  );
}

// ─── Insight Box (matching OHC Utilisation) ───
function InsightBox({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] px-4 py-3.5 mt-4 text-[12px] leading-[1.7] font-medium" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
      {text}
    </div>
  );
}

// ─── Stat Card (matching OHC Utilisation) ───
function StatCard({ label, value, color, sub, badge }: {
  label: string; value: string; color: string; sub?: string; badge?: { text: string; color: string };
}) {
  return (
    <div
      className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-1"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>{label}</p>
      <p className="text-[20px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{value}</p>
      {sub && <p className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>{sub}</p>}
      {badge && (
        <span className="inline-flex items-center self-start mt-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={{ backgroundColor: badge.color + "18", color: badge.color }}>
          {badge.text}
        </span>
      )}
    </div>
  );
}

// ─── Coming Soon Badge (small, for inline use) ───
function ComingSoonBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: "#6366f115", color: "#6366f1", border: "1px solid #6366f130" }}
    >
      <Clock size={11} />
      Coming Soon
    </span>
  );
}

// ─── Survey Template Card ───
function SurveyTemplateCard({ title, description, questions, color, respondents }: {
  title: string; description: string; questions: number; color: string; respondents: string;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{title}</p>
            <p className="text-[11px]" style={{ color: T.textMuted }}>{questions} questions</p>
          </div>
        </div>
        <ComingSoonBadge />
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>{description}</p>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>{respondents}</span>
        <button className="inline-flex items-center gap-1 text-[12px] font-bold opacity-50 cursor-not-allowed" style={{ color: "#4f46e5" }}>
          Preview <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Workflow Step ───
function WorkflowStep({ step, title, description, color }: {
  step: number; title: string; description: string; color: string;
}) {
  return (
    <div className="flex gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        {step}
      </div>
      <div>
        <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{title}</p>
        <p className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>{description}</p>
      </div>
    </div>
  );
}

// TODO: All alert data will come from real dashboard metrics via API

// ─── Main Page ───
export default function AlertsSurveysPage() {
  // TODO: Alerts and rules will be derived from real dashboard data via API
  const exampleAlertsData: Array<{ severity: string; title: string; description: string; dataRef: string; email: boolean }> = [];

  const alertRulesData: Array<{ metric: string; threshold: string; severity: string; source: string }> = [];

  return (
    <div className="animate-fade-in animate-stagger space-y-6">
      {/* ── Filter Bar ── */}
      <div
        className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
      >
        <div className="flex-1" />
        <button className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors" style={{ borderColor: T.border, color: T.textMuted }}>
          <Download size={15} />
        </button>
        <button className="relative h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors" style={{ borderColor: T.border, color: T.textMuted }}>
          <Bell size={15} />
          <span className="absolute -right-1 -top-1 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#DC2626] text-[8px] font-bold text-white">3</span>
        </button>
        <ConfigurePanel
          pageSlug="/portal/employee-experience/alerts-surveys"
          pageTitle="Alerts & Surveys"
          charts={[
            { id: "alertsSurveys", label: "Alerts & Surveys" },
          ]}
          filters={["location"]}
        />
        <Button
          className="h-9 px-5 rounded-lg text-[13px] font-bold min-w-[90px]"
          style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", boxShadow: "0 2px 8px rgba(79,70,229,0.25)" }}
        >
          Apply
        </Button>
      </div>

      {/* ── Coming Soon Highlight Banner ── */}
      <div
        className="rounded-2xl px-6 py-5 flex items-center gap-4"
        style={{
          background: "linear-gradient(135deg, #EEF2FF 0%, #E8E0FF 50%, #F0EBFF 100%)",
          border: "2px solid #818cf8",
          boxShadow: "0 4px 20px rgba(99, 102, 241, 0.12)",
        }}
      >
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          <Clock size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-[15px] font-extrabold font-[var(--font-inter)]" style={{ color: "#3730a3" }}>
            This module is currently under development
          </h3>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "#4338ca" }}>
            The sections below are a <strong>preview of upcoming capabilities</strong> — showing how alerts, emails, and surveys will work once live.
            All example data references real metrics from your existing dashboard pages. No actions can be taken on this page yet.
          </p>
        </div>
      </div>

      {/* ── PageGlanceBox ── */}
      <PageGlanceBox
        pageTitle="Alerts & Surveys"
        pageSubtitle="Smart health alerts and survey management for your workforce"
        kpis={{}}
        fallbackSummary="This module will enable automatic health alerts triggered by patterns in your dashboard data, along with targeted email communication and survey distribution. Alert examples below are based on actual metrics from your OHC, NPS, Engagement, and LSMP dashboards."
        fallbackChips={[
          { label: "Alerts", value: "Data-driven" },
          { label: "Emails", value: "Cohort-targeted" },
          { label: "Surveys", value: "Template-based" },
          { label: "Status", value: "Coming Soon" },
        ]}
      />

      {/* ── Feature Overview KPIs (StatCard style matching OHC) ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Smart Alerts"
          value="Auto-triggered"
          color={T.coral}
          sub="Based on patterns detected in dashboard data"
          badge={{ text: "Coming Soon", color: "#6366f1" }}
        />
        <StatCard
          label="Email Notifications"
          value="Direct Delivery"
          color="#4f46e5"
          sub="Critical alerts sent to registered inbox"
          badge={{ text: "Coming Soon", color: "#6366f1" }}
        />
        <StatCard
          label="Survey Builder"
          value="Pre-built Templates"
          color="#6366f1"
          sub="NPS, feedback, program interest surveys"
          badge={{ text: "Coming Soon", color: "#6366f1" }}
        />
        <StatCard
          label="Cohort Targeting"
          value="Filter-based"
          color={T.teal}
          sub="Same filters as your dashboard charts"
          badge={{ text: "Coming Soon", color: "#6366f1" }}
        />
      </div>

      {/* ── Section 1: Health Alerts + Alert Configuration (WarmSection) ── */}
      <WarmSection>
        <AccentBar color={T.coral} />
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)]" style={{ color: T.textPrimary }}>
            Health Data Alerts
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff" }}>
            Preview
          </span>
        </div>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>
          Example alerts based on actual metrics from your dashboard pages
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Health Alerts */}
          <CVCard
            accentColor={T.coral}
            title="Alert Examples"
            subtitle="What alerts would look like based on your current data"
            tooltipText="These examples show how alerts will surface important patterns from your dashboard data — NPS trends, engagement drop-offs, health condition volumes, and repeat visit patterns. Repeat patients are defined as employees who availed any OHC service at least twice in the selected date range."
            chartData={exampleAlertsData}
            chartTitle="Alert Examples"
            chartDescription="Example alerts based on actual metrics from dashboard pages"
          >
            <div className="mt-2">
              <p className="text-[13px] py-6 text-center" style={{ color: T.textMuted }}>
                Alert examples will appear here once this module is live, driven by real-time metrics from your dashboard pages.
              </p>
            </div>
          </CVCard>

          {/* Alert Configuration */}
          <CVCard
            accentColor={"#4f46e5"}
            title="Alert Configuration"
            subtitle="Define thresholds and notification rules based on dashboard metrics"
            tooltipText="Configure which dashboard metrics trigger alerts, set severity thresholds, and choose notification channels (in-app, email, or both)."
            chartData={alertRulesData}
            chartTitle="Alert Configuration"
            chartDescription="Threshold and notification rules based on dashboard metrics"
          >
            <div className="mt-2">
              <p className="text-[13px] py-6 text-center" style={{ color: T.textMuted }}>
                Alert rules will be configurable here once the module is live.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button className="h-8 px-4 rounded-lg text-[12px] font-bold opacity-50 cursor-not-allowed" style={{ backgroundColor: "#4f46e5", color: "#fff" }}>
                Edit Rules
              </Button>
              <ComingSoonBadge />
            </div>
          </CVCard>
        </div>
      </WarmSection>

      {/* ── Section 2: Email Communication + Survey Builder ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Email Communication */}
        <CVCard
          accentColor={T.teal}
          title="Email Communication"
          subtitle="Send targeted emails to specific user cohorts"
          tooltipText="Compose and send emails to employees. Target specific groups using the same filters available across your dashboard — age group, gender, location, care plan, and more."
        >
          <div className="space-y-4 mt-2">
            <div className="rounded-xl p-4" style={{ backgroundColor: T.pageBg, border: `1px solid ${T.borderLight}` }}>
              <p className="text-[12px] font-bold mb-3" style={{ color: T.textPrimary }}>How it works</p>
              <div className="space-y-3">
                <WorkflowStep step={1} title="Select Cohort" description="Use filters (age, gender, location, care plan) to define your audience — the same filters available across OHC, NPS, and LSMP dashboards." color={"#4f46e5"} />
                <WorkflowStep step={2} title="Choose Template or Compose" description="Pick from pre-built templates (Annual Health Check reminder, wellness tips, program invite) or write a custom email." color={"#6366f1"} />
                <WorkflowStep step={3} title="Preview & Send" description="Review the audience size, preview the email, and send. Track open rates and responses." color={T.teal} />
              </div>
            </div>

            {/* Example cohort — will use real data when module is live */}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button className="h-8 px-4 rounded-lg text-[12px] font-bold opacity-50 cursor-not-allowed" style={{ backgroundColor: T.teal, color: "#fff" }}>
              Compose Email
            </Button>
            <ComingSoonBadge />
          </div>
        </CVCard>

        {/* Survey Builder */}
        <CVCard
          accentColor={"#6366f1"}
          title="Survey Builder"
          subtitle="Create and distribute surveys to collect employee feedback"
          tooltipText="Build surveys from pre-defined templates or create custom ones. Distribute to targeted cohorts using dashboard filters. Responses link to employee health profiles."
        >
          <div className="space-y-4 mt-2">
            <div className="rounded-xl p-4" style={{ backgroundColor: T.pageBg, border: `1px solid ${T.borderLight}` }}>
              <p className="text-[12px] font-bold mb-3" style={{ color: T.textPrimary }}>How it works</p>
              <div className="space-y-3">
                <WorkflowStep step={1} title="Pick a Survey Template" description="Choose from pre-built templates: NPS feedback, program interest, care plan satisfaction, or create custom surveys." color={"#6366f1"} />
                <WorkflowStep step={2} title="Select Target Cohort" description="Apply the same filters from your dashboard to build your audience — age, gender, location, care plan type, compliance status." color={"#4f46e5"} />
                <WorkflowStep step={3} title="Distribute & Track" description="Send via email with one click. Track completion rates, view responses, and export data for analysis." color={T.green} />
              </div>
            </div>

            <p className="text-[12px] font-bold" style={{ color: T.textPrimary }}>Pre-built Survey Templates</p>
            <div className="grid grid-cols-1 gap-3">
              <SurveyTemplateCard
                title="Service Experience Feedback"
                description="Post-visit feedback form covering OHC consultation quality, wait times, facility experience, and overall satisfaction. Feeds into NPS calculation."
                questions={12}
                color={T.teal}
                respondents="Recommended: Post OHC/Annual Health Check visit"
              />
              <SurveyTemplateCard
                title="Program Interest Survey"
                description="Gauge employee interest in upcoming wellness programs — yoga, meditation, fitness challenges, nutrition counseling, mental health workshops."
                questions={8}
                color={"#6366f1"}
                respondents="Recommended: Quarterly, all employees"
              />
              <SurveyTemplateCard
                title="Care Plan Satisfaction"
                description="Evaluate satisfaction with current LSMP care plan — dietitian support, goal tracking, improvement visibility, and recommendations for enhancement."
                questions={15}
                color={"#4f46e5"}
                respondents="Recommended: Active care plan members"
              />
              <SurveyTemplateCard
                title="App Engagement Feedback"
                description="Understand why users stopped engaging after login. Collect feedback on app features, content relevance, and improvement suggestions."
                questions={10}
                color={T.amber}
                respondents="Recommended: Inactive post-login users"
              />
            </div>
          </div>
        </CVCard>
      </div>

      {/* ── Section 3: Cohort Selection (WarmSection) ── */}
      <WarmSection>
        <AccentBar color={T.green} />
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)]" style={{ color: T.textPrimary }}>
            Cohort Selection & Distribution
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff" }}>
            Preview
          </span>
        </div>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>
          How filter-based targeting works across alerts, emails, and surveys
        </p>

        <CVCard
          title="Filter-Based Cohort Builder"
          subtitle="Reuse the same filters available across your OHC, NPS, LSMP, and Engagement dashboards"
          tooltipText="Select any combination of demographic, location, health status, and engagement filters to precisely target your audience for alerts, emails, or surveys."
          expandable={false}
        >
          <div className="mt-2">
            <div className="rounded-xl p-5" style={{ backgroundColor: T.pageBg, border: `1px solid ${T.borderLight}` }}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Available Filters */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Filter size={14} style={{ color: "#4f46e5" }} />
                    <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>Available Filters</p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { group: "Demographics", filters: ["Age Group", "Gender"] },
                      { group: "Location", filters: ["City", "Facility"] },
                      { group: "Health Data", filters: ["Disease Category", "Visit Frequency", "Condition Type"] },
                      { group: "Program", filters: ["Care Plan Type", "Compliance Status"] },
                      { group: "Engagement", filters: ["App Status", "NPS Category", "Service Usage"] },
                    ].map((g) => (
                      <div key={g.group}>
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: T.textMuted }}>{g.group}</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {g.filters.map((f) => (
                            <span key={f} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: T.white, color: T.textSecondary, border: `1px solid ${T.border}` }}>{f}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Example Cohort — will use real data when module is live */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={14} style={{ color: "#6366f1" }} />
                    <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>Example Cohort</p>
                  </div>
                  <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
                    <p className="text-[11px] font-bold" style={{ color: T.textMuted }}>Selected Filters:</p>
                    <div className="flex flex-wrap gap-1">
                      {["Visit Frequency: 5+", "LSMP: Not Enrolled"].map((f) => (
                        <span key={f} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "#6366f112", color: "#6366f1", border: "1px solid #6366f122" }}>{f}</span>
                      ))}
                    </div>
                    <div className="pt-2 mt-2" style={{ borderTop: `1px solid ${T.borderLight}` }}>
                      <p className="text-[13px] py-3 text-center" style={{ color: T.textMuted }}>
                        Cohort size will be calculated from real dashboard data once this module is live.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Send size={14} style={{ color: T.teal }} />
                    <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>Available Actions</p>
                  </div>
                  <div className="space-y-2">
                    {[
                      { icon: Mail, label: "Send Email", description: "Custom or template email to this cohort", color: T.teal },
                      { icon: ClipboardList, label: "Send Survey", description: "Distribute any survey template", color: "#6366f1" },
                      { icon: Bell, label: "Set Alert Rule", description: "Monitor this cohort for metric changes", color: T.coral },
                      { icon: FileText, label: "Export List", description: "Download cohort details as CSV/Excel", color: "#4f46e5" },
                    ].map((action) => {
                      const Icon = action.icon;
                      return (
                        <div key={action.label} className="flex items-center gap-3 p-2.5 rounded-lg opacity-60 cursor-not-allowed" style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}>
                          <div className="rounded-md p-1.5" style={{ backgroundColor: action.color + "12" }}>
                            <Icon size={14} style={{ color: action.color }} />
                          </div>
                          <div>
                            <p className="text-[12px] font-bold" style={{ color: T.textPrimary }}>{action.label}</p>
                            <p className="text-[10px]" style={{ color: T.textMuted }}>{action.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <InsightBox text="All cohort selections will use the same filter engine powering your OHC, Annual Health Check, NPS, and LSMP dashboards. The filters shown here — age group, gender, location, disease category, care plan type — are the same ones you already use to slice data across all dashboard charts." />
          </div>
        </CVCard>
      </WarmSection>

      {/* ── Module Summary Cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          {
            icon: Bell, color: T.coral, title: "Alerts Module",
            features: [
              "Automatic alerts from dashboard metric thresholds",
              "Critical & warning severity levels",
              "In-app + email notification delivery",
              "Configurable thresholds per dashboard metric",
              "Cohort-level monitoring (location, department)",
            ],
          },
          {
            icon: Mail, color: T.teal, title: "Email Module",
            features: [
              "Filter-based cohort targeting from dashboard data",
              "Pre-built & custom email templates",
              "Annual Health Check reminders, wellness tips, program invites",
              "Open rate & response tracking",
              "Scheduled send capability",
            ],
          },
          {
            icon: ClipboardList, color: "#6366f1", title: "Survey Module",
            features: [
              "NPS, feedback, program interest templates",
              "Custom survey builder",
              "Targeted distribution via dashboard filters",
              "Auto-linked to employee health profiles",
              "Completion tracking & response analytics",
            ],
          },
        ].map((module) => {
          const Icon = module.icon;
          return (
            <div
              key={module.title}
              className="bg-white rounded-2xl px-5 py-5 hover:-translate-y-px transition-all"
              style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-lg p-2" style={{ backgroundColor: module.color + "12" }}>
                  <Icon size={16} style={{ color: module.color }} />
                </div>
                <p className="text-[14px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{module.title}</p>
              </div>
              <div className="space-y-2">
                {module.features.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: module.color }} />
                    <p className="text-[12px]" style={{ color: T.textSecondary }}>{f}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.borderLight}` }}>
                <ComingSoonBadge />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
