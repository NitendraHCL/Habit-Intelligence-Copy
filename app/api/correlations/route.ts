import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * Correlations API — Emotional Wellbeing → Chronic Care Insights
 *
 * Builds a tenant-scoped comparison between two cohorts:
 *   • Emotional Wellbeing — Engaged: any uhid that has a row in
 *     aggregated_table.emotional_wellbeing
 *   • Not Yet Engaged: every other uhid that appears in
 *     aggregated_table.agg_kpi for the same tenant
 *
 * For each cohort we compute headline counts, gender / age splits,
 * chronic share, and the top chronic conditions ranked by patient
 * count. We also rank the conditions whose prevalence differs most
 * between the two cohorts.
 *
 * Insights and the action plan are generated rule-based from the
 * computed numbers (see buildInsights / buildActionPlan below), so
 * the card stays self-consistent without a live LLM call. Available
 * specialties for each tenant are looked up from agg_kpi so the
 * action plan only ever proposes camps the clinic can actually run.
 *
 * All-time scope on purpose — date filters from the page header are
 * ignored here; the EWB cohorts at most tenants are too small to
 * slice further without driving the numbers to noise.
 * ──────────────────────────────────────────────────────────────────── */

const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"] as const;

type Cohort = "engaged" | "notEngaged";

interface ConditionRate {
  disease: string;
  patients: number;
  share: number; // % of cohort
}

interface CohortStats {
  patients: number;
  shareOfBase: number; // % of total OHC users
  gender: { male: number; female: number; other: number; malePct: number; femalePct: number };
  ageGroup: Array<{ label: string; count: number; pct: number }>;
  chronicShare: number;       // % with any chronic dx
  topConditions: ConditionRate[];
}

interface BiggestDiff {
  disease: string;
  engagedPct: number;
  notEngagedPct: number;
  gap: number; // engagedPct - notEngagedPct
}

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try { return await fn(); } catch (e) {
        console.error(`Correlations query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // ── 1. Cohort split (engaged vs not_engaged) with gender + age ──
    // Latest age_group / gender per uhid (most recent visit row in agg_kpi).
    const cohortRows = await safeQuery(
      () => dwQuery<{
        cohort: Cohort; patients: string;
        male: string; female: string; other: string;
        age_group: string | null; age_count: string;
      }>(
        `WITH ewb AS (
          SELECT DISTINCT uhid
          FROM aggregated_table.emotional_wellbeing
          WHERE cug_code_mapped = $1
        ),
        latest_demo AS (
          SELECT DISTINCT ON (a.uhid)
            a.uhid,
            a.patient_gender,
            a.age_group
          FROM aggregated_table.agg_kpi a
          WHERE a.cug_code_mapped = $1
          ORDER BY a.uhid, a.consult_date DESC NULLS LAST
        ),
        tagged AS (
          SELECT
            d.uhid,
            LOWER(TRIM(COALESCE(d.patient_gender, ''))) AS gnorm,
            d.age_group,
            CASE WHEN ewb.uhid IS NOT NULL THEN 'engaged' ELSE 'notEngaged' END AS cohort
          FROM latest_demo d
          LEFT JOIN ewb USING (uhid)
        )
        SELECT
          cohort,
          (SELECT COUNT(*) FROM tagged t2 WHERE t2.cohort = t.cohort)::bigint AS patients,
          (SELECT COUNT(*) FROM tagged t2 WHERE t2.cohort = t.cohort AND t2.gnorm IN ('male','m'))::bigint AS male,
          (SELECT COUNT(*) FROM tagged t2 WHERE t2.cohort = t.cohort AND t2.gnorm IN ('female','f'))::bigint AS female,
          (SELECT COUNT(*) FROM tagged t2 WHERE t2.cohort = t.cohort AND t2.gnorm NOT IN ('male','m','female','f'))::bigint AS other,
          t.age_group,
          COUNT(*)::bigint AS age_count
        FROM tagged t
        GROUP BY t.cohort, t.age_group`,
        [cugCode]
      ),
      "cohorts"
    );

    // ── 2. Chronic share per cohort ──
    const chronicRows = await safeQuery(
      () => dwQuery<{ cohort: Cohort; total: string; with_chronic: string }>(
        `WITH ewb AS (
          SELECT DISTINCT uhid
          FROM aggregated_table.emotional_wellbeing
          WHERE cug_code_mapped = $1
        ),
        pts AS (
          SELECT DISTINCT a.uhid,
            CASE WHEN ewb.uhid IS NOT NULL THEN 'engaged' ELSE 'notEngaged' END AS cohort
          FROM aggregated_table.agg_kpi a
          LEFT JOIN ewb USING (uhid)
          WHERE a.cug_code_mapped = $1
        ),
        chronic AS (
          SELECT DISTINCT uhid
          FROM aggregated_table.agg_diagnosis
          WHERE cug_code_mapped = $1
            AND status IN ('Chronic','Acute or Chronic')
        )
        SELECT cohort,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE chronic.uhid IS NOT NULL)::bigint AS with_chronic
        FROM pts
        LEFT JOIN chronic USING (uhid)
        GROUP BY cohort`,
        [cugCode]
      ),
      "chronic"
    );

    // ── 3. Top conditions per cohort + biggest gap ──
    const diseaseRows = await safeQuery(
      () => dwQuery<{ cohort: Cohort; disease: string; patients: string }>(
        `WITH ewb AS (
          SELECT DISTINCT uhid
          FROM aggregated_table.emotional_wellbeing
          WHERE cug_code_mapped = $1
        ),
        dx AS (
          SELECT DISTINCT a.uhid, a.disease
          FROM aggregated_table.agg_diagnosis a
          WHERE a.cug_code_mapped = $1
            AND a.status IN ('Chronic','Acute or Chronic')
            AND a.disease IS NOT NULL
            AND TRIM(a.disease) <> ''
        )
        SELECT
          CASE WHEN ewb.uhid IS NOT NULL THEN 'engaged' ELSE 'notEngaged' END AS cohort,
          dx.disease,
          COUNT(DISTINCT dx.uhid)::bigint AS patients
        FROM dx
        LEFT JOIN ewb USING (uhid)
        GROUP BY cohort, dx.disease`,
        [cugCode]
      ),
      "diseases"
    );

    // ── 4. Available specialties at this clinic (drives action plan) ──
    const specRows = await safeQuery(
      () => dwQuery<{ specialty: string }>(
        `SELECT DISTINCT speciality_name AS specialty
         FROM aggregated_table.agg_kpi
         WHERE cug_code_mapped = $1
           AND speciality_name IS NOT NULL
           AND TRIM(speciality_name) <> ''`,
        [cugCode]
      ),
      "specialties"
    );

    // ── Assemble cohort stats ──
    const cohorts: Record<Cohort, CohortStats> = {
      engaged: emptyCohortStats(),
      notEngaged: emptyCohortStats(),
    };

    // Cohort totals + gender from cohortRows (subquery returns the same total
    // on every row for a cohort — pick once per cohort).
    const seenTotals = new Set<Cohort>();
    for (const r of cohortRows) {
      if (!seenTotals.has(r.cohort)) {
        cohorts[r.cohort].patients = Number(r.patients);
        cohorts[r.cohort].gender = {
          male: Number(r.male),
          female: Number(r.female),
          other: Number(r.other),
          malePct: 0,
          femalePct: 0,
        };
        seenTotals.add(r.cohort);
      }
    }
    // Age buckets
    const ageMap: Record<Cohort, Record<string, number>> = { engaged: {}, notEngaged: {} };
    for (const r of cohortRows) {
      if (!r.age_group) continue;
      ageMap[r.cohort][r.age_group] = (ageMap[r.cohort][r.age_group] || 0) + Number(r.age_count);
    }
    for (const c of ["engaged", "notEngaged"] as Cohort[]) {
      const total = cohorts[c].patients;
      const g = cohorts[c].gender;
      const sumG = g.male + g.female + g.other;
      g.malePct = sumG > 0 ? Math.round((g.male / sumG) * 100) : 0;
      g.femalePct = sumG > 0 ? Math.round((g.female / sumG) * 100) : 0;
      cohorts[c].ageGroup = AGE_ORDER.filter((ag) => ageMap[c][ag])
        .map((ag) => ({
          label: ag,
          count: ageMap[c][ag],
          pct: total > 0 ? Math.round((ageMap[c][ag] / total) * 100) : 0,
        }));
    }

    // Chronic share
    for (const r of chronicRows) {
      const total = Number(r.total);
      const withC = Number(r.with_chronic);
      cohorts[r.cohort].chronicShare = total > 0 ? Math.round((withC / total) * 100) : 0;
    }

    // Top conditions + biggest-gap ranking
    const conditionPatients: Record<string, { engaged: number; notEngaged: number }> = {};
    for (const r of diseaseRows) {
      if (!conditionPatients[r.disease]) conditionPatients[r.disease] = { engaged: 0, notEngaged: 0 };
      conditionPatients[r.disease][r.cohort] = Number(r.patients);
    }

    const buildTop = (c: Cohort, n: number): ConditionRate[] => {
      const total = cohorts[c].patients;
      return Object.entries(conditionPatients)
        .map(([disease, counts]) => ({
          disease,
          patients: counts[c],
          share: total > 0 ? Math.round((counts[c] / total) * 1000) / 10 : 0,
        }))
        .filter((d) => d.patients > 0)
        .sort((a, b) => b.patients - a.patients)
        .slice(0, n);
    };
    cohorts.engaged.topConditions = buildTop("engaged", 4);
    cohorts.notEngaged.topConditions = buildTop("notEngaged", 4);

    // Share of base — engaged vs. total OHC users (engaged + notEngaged).
    const totalUsers = cohorts.engaged.patients + cohorts.notEngaged.patients;
    cohorts.engaged.shareOfBase = totalUsers > 0 ? Math.round((cohorts.engaged.patients / totalUsers) * 100) : 0;
    cohorts.notEngaged.shareOfBase = totalUsers > 0 ? 100 - cohorts.engaged.shareOfBase : 0;

    // Biggest-gap conditions — engaged-share minus not-engaged-share, ranked
    // by absolute gap. Require ≥5 engaged patients so we don't surface noise.
    const engagedTotal = cohorts.engaged.patients;
    const notEngagedTotal = cohorts.notEngaged.patients;
    const biggestDiffs: BiggestDiff[] = Object.entries(conditionPatients)
      .filter(([, counts]) => counts.engaged >= 5)
      .map(([disease, counts]) => {
        const ePct = engagedTotal > 0 ? Math.round((counts.engaged / engagedTotal) * 1000) / 10 : 0;
        const nPct = notEngagedTotal > 0 ? Math.round((counts.notEngaged / notEngagedTotal) * 1000) / 10 : 0;
        return { disease, engagedPct: ePct, notEngagedPct: nPct, gap: Math.round((ePct - nPct) * 10) / 10 };
      })
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, 6);

    // Available specialties (lower-cased lookup set for the action-plan engine)
    const availableSpecialties = new Set(
      specRows.map((r) => r.specialty.toLowerCase().trim())
    );

    const insights = buildInsights(cohorts, biggestDiffs, totalUsers);
    const actionPlan = buildActionPlan(cohorts, biggestDiffs, availableSpecialties);

    // ── Chronic Conditions → OHC Care Advantage ──
    // Per-disease comparison of workforce chronic patients vs the share actively
    // seen at OHC in the last 12 months — used to quantify externally-avoided
    // visits and to surface specialty-matched outreach programmes.
    const careAdvantage = await buildCareAdvantage(cugCode, availableSpecialties, safeQuery);

    return NextResponse.json({
      // Stubbed-out legacy fields kept for backward compat with existing card grid.
      kpis: {},
      charts: { bmiVsBp: [], riskDistribution: [] },
      engagementMix: {
        engaged: cohorts.engaged,
        notEngaged: cohorts.notEngaged,
        biggestDifferences: biggestDiffs,
        insights,
        actionPlan,
        availableSpecialtyCount: availableSpecialties.size,
      },
      careAdvantage,
      lastUpdated: new Date().toISOString(),
      meta: { hadErrors: failedQueries.length > 0, failedQueries },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Correlations API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

function emptyCohortStats(): CohortStats {
  return {
    patients: 0,
    shareOfBase: 0,
    gender: { male: 0, female: 0, other: 0, malePct: 0, femalePct: 0 },
    ageGroup: [],
    chronicShare: 0,
    topConditions: [],
  };
}

// ─── Insights: deterministic, derived from the cohort numbers ───
function buildInsights(
  cohorts: Record<Cohort, CohortStats>,
  diffs: BiggestDiff[],
  totalUsers: number,
): { clinical: string[]; operational: string[] } {
  const clinical: string[] = [];
  const operational: string[] = [];

  if (cohorts.engaged.patients === 0) {
    return {
      clinical: ["No Emotional Wellbeing assessments recorded for this client yet."],
      operational: ["Programme has not launched at this tenant — no engagement to analyse."],
    };
  }

  // Clinical lines — tight one-line bullets.
  const sorted = diffs.length > 0 ? [...diffs].sort((a, b) => b.gap - a.gap) : [];
  const top = sorted[0];
  if (top && top.notEngagedPct > 0) {
    const factor = (top.engagedPct / top.notEngagedPct).toFixed(1);
    clinical.push(`${stripParens(top.disease)} runs ${factor}× higher in engaged group (${top.engagedPct}% vs ${top.notEngagedPct}%).`);
  } else if (top) {
    clinical.push(`${stripParens(top.disease)} is over-indexed in engaged group (${top.engagedPct}% vs ${top.notEngagedPct}%).`);
  }
  const chronicGap = cohorts.engaged.chronicShare - cohorts.notEngaged.chronicShare;
  if (chronicGap >= 5) {
    clinical.push(`${cohorts.engaged.chronicShare}% have a chronic condition vs ${cohorts.notEngaged.chronicShare}% baseline (+${chronicGap}%).`);
  }
  // If we have a second strong condition gap, surface it too.
  if (sorted[1] && sorted[1].gap > 0) {
    clinical.push(`${stripParens(sorted[1].disease)} also higher in engaged group (${sorted[1].engagedPct}% vs ${sorted[1].notEngagedPct}%).`);
  }

  // Operational lines — tight one-line bullets.
  if (totalUsers > 0) {
    operational.push(`Reach is ${cohorts.engaged.shareOfBase}% of the OHC user base (${cohorts.engaged.patients.toLocaleString("en-IN")} of ${totalUsers.toLocaleString("en-IN")}).`);
  }
  const femaleGap = cohorts.engaged.gender.femalePct - cohorts.notEngaged.gender.femalePct;
  if (femaleGap >= 10) {
    operational.push(`Engaged group is ${femaleGap}% more female (${cohorts.engaged.gender.femalePct}% vs ${cohorts.notEngaged.gender.femalePct}%) — outreach to men is the bigger gap.`);
  } else if (femaleGap <= -10) {
    operational.push(`Engaged group is ${Math.abs(femaleGap)}% more male (${cohorts.engaged.gender.malePct}% vs ${cohorts.notEngaged.gender.malePct}%) — outreach to women is the bigger gap.`);
  }
  const engagedAge = cohorts.engaged.ageGroup.find((a) => a.label === "20-35");
  const notEngagedAge = cohorts.notEngaged.ageGroup.find((a) => a.label === "20-35");
  if (engagedAge && notEngagedAge && engagedAge.pct - notEngagedAge.pct >= 5) {
    operational.push(`Engaged cohort skews younger — ${engagedAge.pct}% are 20–35 vs ${notEngagedAge.pct}% baseline.`);
  }

  // Cap each side to 2 — keeps the AI block compact and scannable.
  return { clinical: clinical.slice(0, 2), operational: operational.slice(0, 2) };
}

// ─── Action plan: rule-based template library; only emit templates whose
// required specialties are present in agg_kpi for this tenant. Each item
// renders as a bold title + one short rationale line — no separate
// description field, which keeps the action-plan column scannable. ───
interface ActionTemplate {
  id: string;
  title: string;
  triggerDisease: string[]; // disease names (case-insensitive substring match)
  requires: string[];       // specialty names (case-insensitive)
  rationale: (diffs: BiggestDiff[]) => string;
}

const CLINICAL_TEMPLATES: ActionTemplate[] = [
  {
    id: "lipid-drive",
    title: "Lipid Health Drive",
    triggerDisease: ["dyslipidemia"],
    requires: ["internal medicine", "dietetics"],
    rationale: (d) => `Targets Dyslipidemia at ${pctOf(d, "dyslipidemia")}% in engaged group`,
  },
  {
    id: "womens-wellness",
    title: "Women's Wellness Day",
    triggerDisease: ["polycystic ovarian syndrome", "pcos"],
    requires: ["obstetrics and gynecology"],
    rationale: (d) => `Addresses PCOS at ${pctOf(d, "polycystic")}% and the female skew`,
  },
  {
    id: "joint-pain",
    title: "Joint Pain Clinic",
    triggerDisease: ["arthritis"],
    requires: ["physiotherapy", "general physician"],
    rationale: (d) => `Addresses Arthritis at ${pctOf(d, "arthritis")}% in engaged group`,
  },
  {
    id: "anaemia-screen",
    title: "Anaemia Quick-Screen",
    triggerDisease: ["anaemia", "anemia"],
    requires: ["general physician", "dietetics"],
    rationale: (d) => `Addresses Anaemia at ${pctOf(d, "anaemia")}% in engaged group`,
  },
  {
    id: "diabetes-prevention",
    title: "Diabetes Prevention Day",
    triggerDisease: ["prediabetes", "pre-dm", "diabetes mellitus", "diabetes"],
    requires: ["internal medicine", "dietetics"],
    rationale: (d) => `Targets Prediabetes / Diabetes at ${pctOf(d, "diabetes") || pctOf(d, "prediabetes")}% in engaged group`,
  },
  {
    id: "liver-care",
    title: "Liver Health Clinic",
    triggerDisease: ["liver"],
    requires: ["internal medicine"],
    rationale: (d) => `Targets Chronic Liver Disease at ${pctOf(d, "liver")}% in engaged group`,
  },
];

interface OperationalTemplate {
  id: string;
  title: string;
  requires: string[];
  shouldFire: (cohorts: Record<Cohort, CohortStats>) => boolean;
  rationale: (cohorts: Record<Cohort, CohortStats>) => string;
}

const OPERATIONAL_TEMPLATES: OperationalTemplate[] = [
  {
    id: "men-outreach",
    title: "Men 36+ Outreach",
    requires: ["family medicine"],
    shouldFire: (c) => c.engaged.gender.femalePct - c.notEngaged.gender.femalePct >= 10,
    rationale: () => "Family-Medicine-anchored sessions for the under-engaged male majority",
  },
  {
    id: "women-outreach",
    title: "Women's Emotional Wellbeing Drive",
    requires: ["psychologist"],
    shouldFire: (c) => c.notEngaged.gender.femalePct - c.engaged.gender.femalePct >= 10,
    rationale: () => "Psychologist-anchored sessions for the under-engaged female majority",
  },
  {
    id: "senior-outreach",
    title: "Senior Employee Programme",
    requires: ["family medicine"],
    shouldFire: (c) => {
      const eng = c.engaged.ageGroup.find((a) => a.label === "41-60")?.pct ?? 0;
      const nen = c.notEngaged.ageGroup.find((a) => a.label === "41-60")?.pct ?? 0;
      return nen - eng >= 5;
    },
    rationale: (c) => {
      const eng = c.engaged.ageGroup.find((a) => a.label === "41-60")?.pct ?? 0;
      const nen = c.notEngaged.ageGroup.find((a) => a.label === "41-60")?.pct ?? 0;
      return `Family-Medicine sessions for 41–60 age band — under-represented in engaged group (${eng}% vs ${nen}%)`;
    },
  },
];

function buildActionPlan(
  cohorts: Record<Cohort, CohortStats>,
  diffs: BiggestDiff[],
  availableSpecialties: Set<string>,
): {
  clinical: { title: string; rationale: string; specialties: string[] }[];
  operational: { title: string; rationale: string; specialties: string[] }[];
} {
  const hasAll = (req: string[]) => req.every((s) => availableSpecialties.has(s.toLowerCase()));
  // Title-case the specialty names back from the lower-case match keys.
  const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  // Clinical: only fire templates whose disease appears among the biggest-gap
  // conditions (engaged-side over-index) AND whose required specialties exist.
  const overIndexed = diffs.filter((d) => d.gap > 0);
  const clinical = CLINICAL_TEMPLATES
    .filter((t) => overIndexed.some((d) => t.triggerDisease.some((td) => d.disease.toLowerCase().includes(td))))
    .filter((t) => hasAll(t.requires))
    .slice(0, 5)
    .map((t) => ({ title: t.title, rationale: t.rationale(diffs), specialties: t.requires.map(titleCase) }));

  // Priority recommendation: when Emotional Wellbeing reach is very low
  // (<5% of the OHC user base), prepend a free-consult drive at the top of
  // the action plan so it's the first thing the clinical team sees. Only
  // surfaces when the Psychologist specialty is actually running.
  const LOW_REACH_THRESHOLD = 5;
  if (
    cohorts.engaged.shareOfBase < LOW_REACH_THRESHOLD &&
    cohorts.engaged.patients > 0 &&
    availableSpecialties.has("psychologist")
  ) {
    clinical.unshift({
      title: "Free Psychology Consult Day",
      rationale: `Reach is only ${cohorts.engaged.shareOfBase}% — offer a free workplace-wide consult to drive baseline engagement.`,
      specialties: ["Psychologist"],
    });
  }

  // Operational: fire any template whose precondition matches.
  const operational = OPERATIONAL_TEMPLATES
    .filter((t) => t.shouldFire(cohorts))
    .filter((t) => hasAll(t.requires))
    .slice(0, 2)
    .map((t) => ({ title: t.title, rationale: t.rationale(cohorts), specialties: t.requires.map(titleCase) }));

  return { clinical: clinical.slice(0, 6), operational };
}

// Helper — strip parenthetical detail off long disease names for prose
function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

// Helper — look up the engaged-side share of a condition by substring match,
// formatted as an integer percent. Returns 0 if not found.
function pctOf(diffs: BiggestDiff[], needle: string): number {
  const hit = diffs.find((d) => d.disease.toLowerCase().includes(needle.toLowerCase()));
  return hit ? Math.round(hit.engagedPct) : 0;
}

// ─── Chronic Conditions → OHC Care Advantage ───
// Default benchmark cost per external OPD visit (₹). Configurable per tenant
// later — kept here as a single constant for now.
const VISIT_COST_INR = 800;
// Share of targeted unengaged employees expected to actually onboard a drive.
// Conservative industry estimate.
const ENGAGEMENT_RATE = 0.6;
// Maximum chronic-disease rows to surface on the card.
const CARE_ADVANTAGE_DISEASE_LIMIT = 8;

interface CareAdvantageRow {
  disease: string;                  // raw disease name (UI strips parenthetical)
  workforcePatients: number;        // distinct uhid with this chronic dx ever
  activePatients: number;           // of those, uhid with ≥1 OHC visit in last 12 months
  activeRatePct: number;            // active / workforce × 100
  avgSpecialties: number;           // avg distinct specialties per active patient (12 mo)
  visitsAvoided: number;            // total OHC visits by active patients (12 mo)
  costAvoidedInr: number;           // visitsAvoided × VISIT_COST_INR
}

interface CareProgrammeOpportunity {
  programme: string;                // human-readable programme title
  disease: string;                  // disease this programme targets
  unengagedHeadcount: number;       // workforcePatients − activePatients
  specialties: string[];            // specialties used by the programme
  capturedValueInr: number;         // unengaged × ENGAGEMENT_RATE × avg visits × cost
  description: string;              // soft-consultative one-liner
}

interface CareAdvantageResponse {
  rows: CareAdvantageRow[];
  totals: {
    workforcePatients: number;
    activePatients: number;
    activeRatePct: number;
    visitsAvoided: number;
    costAvoidedInr: number;
  };
  programmeOpportunities: CareProgrammeOpportunity[];
  totalOpportunityHeadcount: number;
  totalOpportunityValueInr: number;
  benchmark: { visitCostInr: number; engagementRate: number };
}

// Disease → outreach programme template library. Each template names its
// required specialties; we only emit programmes whose specialties actually
// run at the tenant's clinic.
const CARE_PROGRAMMES: ReadonlyArray<{
  programme: string;
  match: string[];          // case-insensitive substrings against disease name
  requires: string[];        // case-insensitive specialty names
}> = [
  { programme: "Lipid Wellness Drive", match: ["dyslipidemia"], requires: ["internal medicine", "dietetics"] },
  { programme: "Diabetes Quarterly Review", match: ["diabetes", "prediabetes", "pre-dm"], requires: ["internal medicine", "dietetics"] },
  { programme: "Heart-Health Check-Up", match: ["hypertension", "cvd", "cardiovascular"], requires: ["general physician"] },
  { programme: "Nutrition + GP Follow-up", match: ["anaemia", "anemia"], requires: ["general physician", "dietetics"] },
  { programme: "Joint Care Programme", match: ["arthritis"], requires: ["physiotherapy"] },
  { programme: "Thyroid Wellness Programme", match: ["thyroid"], requires: ["internal medicine"] },
  { programme: "Weight Management Drive", match: ["obesity"], requires: ["dietetics"] },
  { programme: "Liver Health Programme", match: ["liver"], requires: ["internal medicine"] },
  { programme: "Workplace Wellness Programme", match: ["stress", "mental health"], requires: ["psychologist"] },
  { programme: "Women's Wellness Day", match: ["pcos"], requires: ["obstetrics and gynecology"] },
];

async function buildCareAdvantage(
  cugCode: string,
  availableSpecialties: Set<string>,
  safeQuery: <T>(fn: () => Promise<T[]>, tag: string) => Promise<T[]>,
): Promise<CareAdvantageResponse> {
  // ── Per-disease query: workforce + active + visits + avg specialties ──
  const rowsRaw = await safeQuery(
    () => dwQuery<{
      disease: string;
      workforce: string;
      active: string;
      visits_12mo: string;
      avg_specs: string;
    }>(
      `WITH chronic AS (
         SELECT DISTINCT uhid, disease
         FROM aggregated_table.agg_diagnosis
         WHERE cug_code_mapped = $1
           AND status IN ('Chronic','Acute or Chronic')
           AND disease IS NOT NULL AND TRIM(disease) <> ''
       ),
       activity AS (
         -- "Active" = at least 2 completed OHC visits in the last 12 months,
         -- the minimum clinically meaningful follow-up cadence for a chronic
         -- patient. Patients with 0 or 1 visits drop out and become the
         -- re-engagement opportunity.
         SELECT
           uhid,
           SUM(total_consult_count)::int AS visits_12mo,
           COUNT(DISTINCT speciality_name)::int AS specs_12mo
         FROM aggregated_table.agg_kpi
         WHERE cug_code_mapped = $1
           AND stage = 'Completed'
           AND consult_date >= (CURRENT_DATE - INTERVAL '12 months')
         GROUP BY uhid
         HAVING SUM(total_consult_count) >= 2
       )
       SELECT
         c.disease,
         COUNT(DISTINCT c.uhid)::bigint AS workforce,
         COUNT(DISTINCT c.uhid) FILTER (WHERE a.uhid IS NOT NULL)::bigint AS active,
         COALESCE(SUM(a.visits_12mo) FILTER (WHERE a.uhid IS NOT NULL), 0)::bigint AS visits_12mo,
         COALESCE(AVG(a.specs_12mo) FILTER (WHERE a.uhid IS NOT NULL), 0)::float AS avg_specs
       FROM chronic c
       LEFT JOIN activity a ON a.uhid = c.uhid
       GROUP BY c.disease
       ORDER BY workforce DESC
       LIMIT ${CARE_ADVANTAGE_DISEASE_LIMIT}`,
      [cugCode]
    ),
    "careAdvantageRows"
  );

  // ── Totals query (distinct patients across all chronic dx) ──
  const totalsRaw = await safeQuery(
    () => dwQuery<{ total_workforce: string; total_active: string; total_visits: string }>(
      `WITH chronic_uhids AS (
         SELECT DISTINCT uhid
         FROM aggregated_table.agg_diagnosis
         WHERE cug_code_mapped = $1
           AND status IN ('Chronic','Acute or Chronic')
       ),
       activity AS (
         SELECT uhid, SUM(total_consult_count)::int AS visits_12mo
         FROM aggregated_table.agg_kpi
         WHERE cug_code_mapped = $1
           AND stage = 'Completed'
           AND consult_date >= (CURRENT_DATE - INTERVAL '12 months')
         GROUP BY uhid
         HAVING SUM(total_consult_count) >= 2
       )
       SELECT
         COUNT(DISTINCT c.uhid)::bigint AS total_workforce,
         COUNT(DISTINCT c.uhid) FILTER (WHERE a.uhid IS NOT NULL)::bigint AS total_active,
         COALESCE(SUM(a.visits_12mo) FILTER (WHERE a.uhid IS NOT NULL), 0)::bigint AS total_visits
       FROM chronic_uhids c
       LEFT JOIN activity a ON a.uhid = c.uhid`,
      [cugCode]
    ),
    "careAdvantageTotals"
  );

  // ── Build per-disease rows ──
  const rows: CareAdvantageRow[] = rowsRaw.map((r) => {
    const workforce = Number(r.workforce);
    const active = Number(r.active);
    const visits = Number(r.visits_12mo);
    const avgSpecs = Math.round(Number(r.avg_specs) * 10) / 10;
    return {
      disease: r.disease,
      workforcePatients: workforce,
      activePatients: active,
      activeRatePct: workforce > 0 ? Math.round((active / workforce) * 100) : 0,
      avgSpecialties: avgSpecs,
      visitsAvoided: visits,
      costAvoidedInr: visits * VISIT_COST_INR,
    };
  });

  const totalsRow = totalsRaw[0] || { total_workforce: "0", total_active: "0", total_visits: "0" };
  const tWorkforce = Number(totalsRow.total_workforce);
  const tActive = Number(totalsRow.total_active);
  const tVisits = Number(totalsRow.total_visits);

  // ── Programme opportunities ──
  // For each disease row, find a matching programme whose required specialties
  // exist at the clinic. Headcount = workforce − active; captured value uses
  // the per-disease avg visits if we have it, else falls back to 4 visits / yr.
  const hasAll = (req: string[]) => req.every((s) => availableSpecialties.has(s.toLowerCase()));
  const programmes: CareProgrammeOpportunity[] = [];
  for (const row of rows) {
    const tmpl = CARE_PROGRAMMES.find((p) => p.match.some((m) => row.disease.toLowerCase().includes(m)));
    if (!tmpl) continue;
    if (!hasAll(tmpl.requires)) continue;
    const unengaged = row.workforcePatients - row.activePatients;
    if (unengaged <= 0) continue;
    const avgVisits = row.activePatients > 0 ? row.visitsAvoided / row.activePatients : 4;
    const captured = Math.round(unengaged * ENGAGEMENT_RATE * avgVisits * VISIT_COST_INR);
    // Title-case specialty names back from the lower-case match keys.
    const tc = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
    const cleanDisease = row.disease.replace(/\s*\([^)]*\)\s*/g, "").replace(/\s*\[[^\]]*\]\s*/g, "").trim();
    programmes.push({
      programme: tmpl.programme,
      disease: cleanDisease,
      unengagedHeadcount: unengaged,
      specialties: tmpl.requires.map(tc),
      capturedValueInr: captured,
      description: `Could engage ${unengaged} employees with ${cleanDisease} who aren't on regular follow-up.`,
    });
  }
  // Sort opportunities by unengaged headcount desc so the biggest reach gap
  // surfaces first.
  programmes.sort((a, b) => b.unengagedHeadcount - a.unengagedHeadcount);

  const totalOpportunityHeadcount = programmes.reduce((s, p) => s + p.unengagedHeadcount, 0);
  const totalOpportunityValueInr = programmes.reduce((s, p) => s + p.capturedValueInr, 0);

  return {
    rows,
    totals: {
      workforcePatients: tWorkforce,
      activePatients: tActive,
      activeRatePct: tWorkforce > 0 ? Math.round((tActive / tWorkforce) * 100) : 0,
      visitsAvoided: tVisits,
      costAvoidedInr: tVisits * VISIT_COST_INR,
    },
    programmeOpportunities: programmes,
    totalOpportunityHeadcount,
    totalOpportunityValueInr,
    benchmark: { visitCostInr: VISIT_COST_INR, engagementRate: ENGAGEMENT_RATE },
  };
}

export const GET = withCache(handler, { endpoint: "correlations" });
