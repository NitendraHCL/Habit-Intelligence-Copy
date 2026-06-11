import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * CISCO "Past Data" API — old vs new health progression for CISCO01.
 *
 * Sources (CISCO-specific, both CISCO-only tables — old/new cleanly time-split,
 * no overlap: old ends 2025-06-16, new starts 2025-08/12):
 *   • aggregated_table.cisco__lab_compilled        — lab results
 *     ("uhId", service_item_name, value (text), verification_date_time,
 *      "Source" = 'old' | 'new'). No cug_code (all CISCO).
 *   • aggregated_table.cisco_vitals_compilled_data — vitals
 *     (uhid, vital_parameter_name, vital_value (text),
 *      clinical_type_creation_time, "Source"). No cug_code (all CISCO).
 *
 * Model (user-confirmed): Then = MOST RECENT old reading, Now = most recent
 * new reading; per patient; cohort = patients with both. Values ~99.9% clean
 * numeric — kept only if they match a numeric regex, else dropped (<0.1%).
 *
 * NAMING: old and new sources use DIFFERENT lab parameter names (e.g.
 * old "Cholesterol, Total" ↔ new "Cholesterol"; old "Glucose, serum (fasting)"
 * ↔ new "Plasma Glucose - F"). Each param's `src[]` lists BOTH spellings so the
 * old→new match works. Vitals names are identical across sources.
 * ──────────────────────────────────────────────────────────────────── */

const LAB = "aggregated_table.cisco__lab_compilled";
const VIT = "aggregated_table.cisco_vitals_compilled_data";
const NUMERIC = `~ '^-?[0-9]+(\\.[0-9]+)?$'`;
const HBA1C_NAMES = ["HbA1c", "Hba 1 C (Dcct/Ngsp)", "Glycohemoglobin (HbA1c )"];
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

type Dir = "lower" | "higher" | "neutral"; // clinically-better direction

// Clinical conditions compared then→now (drives the "Conditions Monitored" KPI).
const CONDITIONS_MONITORED = ["Diabetes", "High Cholesterol", "Low HDL", "High Triglycerides", "Hypertension", "Obesity", "Hypothyroid", "Anaemia"];

// Parameter catalogue (display name, source name(s), panel, better-direction).
// src = [old-source spelling, new-source spelling] (merged where they differ).
const LAB_PARAMS: { display: string; src: string[]; panel: string; dir: Dir }[] = [
  { display: "Glucose (Fasting)", src: ["Glucose, serum (fasting)", "Plasma Glucose - F"], panel: "Glycemic", dir: "lower" },
  { display: "Glucose (PP)", src: ["Glucose, Two-Hour Postprandial", "Plasma Glucose - PP"], panel: "Glycemic", dir: "lower" },
  { display: "HbA1c", src: HBA1C_NAMES, panel: "Glycemic", dir: "lower" },
  { display: "Cholesterol (Total)", src: ["Cholesterol, Total", "Cholesterol"], panel: "Lipid Profile", dir: "lower" },
  { display: "LDL", src: ["LDL Cholesterol Calc", "LDL Cholesterol (Direct)"], panel: "Lipid Profile", dir: "lower" },
  { display: "HDL", src: ["HDL Cholesterol"], panel: "Lipid Profile", dir: "higher" },
  { display: "VLDL", src: ["VLDL Cholesterol Cal"], panel: "Lipid Profile", dir: "lower" },
  { display: "Triglycerides", src: ["Triglycerides", "Triglyceride"], panel: "Lipid Profile", dir: "lower" },
  { display: "LDL/HDL Ratio", src: ["LDL/HDL Ratio", "LDL CHOL/HDL CHOL RATIO(Direct)"], panel: "Lipid Profile", dir: "lower" },
  { display: "TSH", src: ["TSH"], panel: "Thyroid", dir: "neutral" },
  { display: "Thyroxine (T4)", src: ["Thyroxine (T4)"], panel: "Thyroid", dir: "neutral" },
  { display: "T3 Uptake", src: ["T3 Uptake"], panel: "Thyroid", dir: "neutral" },
  { display: "Albumin", src: ["Albumin"], panel: "Liver Function", dir: "higher" },
  { display: "Globulin", src: ["Globulin"], panel: "Liver Function", dir: "neutral" },
  { display: "Total Proteins", src: ["Total Proteins", "Proteins"], panel: "Liver Function", dir: "neutral" },
  { display: "Bilirubin (Total)", src: ["Bilirubin ( Total)", "Bilirubin Total"], panel: "Liver Function", dir: "lower" },
  { display: "SGPT / ALT", src: ["SGPT / ALT", "S.G.P.T. (SGPT) (ALT)"], panel: "Liver Function", dir: "lower" },
  { display: "SGOT / AST", src: ["SGOT/AST", "S.G.O.T. (SGOT) (AST)"], panel: "Liver Function", dir: "lower" },
  { display: "Alk. Phosphatase", src: ["Alkaline Phosphatase", "Alkaline Phosphatase (ALKP)"], panel: "Liver Function", dir: "lower" },
  { display: "GGTP", src: ["GGTP", "Gamma GT (GGT)"], panel: "Liver Function", dir: "lower" },
  { display: "Creatinine", src: ["serum Creatinine", "Creatinine"], panel: "Kidney Function", dir: "lower" },
  { display: "Blood Urea", src: ["Blood Urea", "Urea"], panel: "Kidney Function", dir: "lower" },
  { display: "BUN", src: ["BUN", "KA-BUN"], panel: "Kidney Function", dir: "lower" },
  { display: "Uric Acid", src: ["Uric Acid"], panel: "Kidney Function", dir: "lower" },
  { display: "Haemoglobin", src: ["Hemoglobin", "Haemoglobin"], panel: "Haematology", dir: "higher" },
  { display: "WBC", src: ["WBC", "Total WBC Count"], panel: "Haematology", dir: "neutral" },
];
// Merged src[] for a lab display name (used by transitions/prevalence/scatter/conditions).
const srcOf = (display: string) => LAB_PARAMS.find((p) => p.display === display)?.src ?? [];
const VIT_PARAMS: { display: string; src: string[]; panel: string; dir: Dir }[] = [
  { display: "BMI", src: ["BMI"], panel: "Vitals", dir: "lower" },
  { display: "BP (Systolic)", src: ["BP(Systolic)"], panel: "Vitals", dir: "lower" },
  { display: "BP (Diastolic)", src: ["BP(Diastolic)"], panel: "Vitals", dir: "lower" },
  { display: "Weight", src: ["Weight"], panel: "Vitals", dir: "lower" },
  { display: "SPO2", src: ["SPO2"], panel: "Vitals", dir: "higher" },
];

// Value-progression query: per parameter, mean of most-recent-old vs
// most-recent-new over the both-cohort. One query for the whole catalogue.
function valueProgressionSQL(opts: { table: string; uhid: string; value: string; date: string; item: string; cug?: boolean; params: { display: string; src: string[] }[] }) {
  const { table, uhid, value, date, item, cug, params } = opts;
  const allSrc = params.flatMap((p) => p.src);
  const normCase = `CASE ${params.map((p) => `WHEN ${item} IN (${p.src.map(q).join(", ")}) THEN ${q(p.display)}`).join(" ")} END`;
  const cugCond = cug ? `cug_code = 'CISCO01' AND ` : "";
  return `
    WITH base AS (
      SELECT ${normCase} AS param, ${uhid} AS uhid, "Source" AS src, TRIM(${value})::numeric AS val, ${date} AS dt
      FROM ${table}
      WHERE ${cugCond}TRIM(${value}) ${NUMERIC} AND ${item} IN (${allSrc.map(q).join(", ")})
    ),
    ranked AS (SELECT param, uhid, src, val, ROW_NUMBER() OVER (PARTITION BY param, uhid, src ORDER BY dt DESC) rn FROM base),
    latest AS (SELECT param, uhid, src, val FROM ranked WHERE rn = 1),
    pivoted AS (
      SELECT param, uhid,
        MAX(val) FILTER (WHERE src = 'old') AS old_val,
        MAX(val) FILTER (WHERE src = 'new') AS new_val
      FROM latest GROUP BY param, uhid
    )
    SELECT param,
      COUNT(*) FILTER (WHERE old_val IS NOT NULL AND new_val IS NOT NULL)::int AS cohort,
      AVG(old_val) FILTER (WHERE old_val IS NOT NULL AND new_val IS NOT NULL)::numeric(12,2) AS avg_old,
      AVG(new_val) FILTER (WHERE old_val IS NOT NULL AND new_val IS NOT NULL)::numeric(12,2) AS avg_new
    FROM pivoted GROUP BY param`;
}

// Per-patient most-recent old / new for ONE metric (used by transitions,
// prevalence, scatter). Returns oldv/newv CTE bodies.
function snap(opts: { table: string; uhid: string; value: string; date: string; item: string; src: string[]; cug?: boolean }) {
  const { table, uhid, value, date, item, src, cug } = opts;
  const cugCond = cug ? `cug_code = 'CISCO01' AND ` : "";
  const inList = `${item} IN (${src.map(q).join(", ")})`;
  const mk = (s: string) => `
    SELECT DISTINCT ON (${uhid}) ${uhid} AS uhid, TRIM(${value})::numeric AS val
    FROM ${table}
    WHERE ${cugCond}"Source" = '${s}' AND ${inList} AND TRIM(${value}) ${NUMERIC}
    ORDER BY ${uhid}, ${date} DESC`;
  return { oldCte: mk("old"), newCte: mk("new") };
}

const LAB_S = { table: LAB, uhid: `"uhId"`, value: "value", date: "verification_date_time", cug: false };
const VIT_S = { table: VIT, uhid: "uhid", value: "vital_value", date: "clinical_type_creation_time" };

// ── Quarterly progression (cohort-average per quarter, last 8 quarters) ──
// Each quarter point = average over whoever was measured that quarter (a
// cohort trend, NOT necessarily the same patients), split by cohort:
//   'tracked' = patient also has an old reading; 'new' = new-only.
const QWINDOW = `date_trunc('quarter', NOW()) - INTERVAL '21 months'`; // current + 7 prior = 8 quarters

function valueQuarterlySQL(opts: { table: string; uhid: string; value: string; date: string; item: string; cug?: boolean; params: { display: string; src: string[] }[] }) {
  const { table, uhid, value, date, item, cug, params } = opts;
  const allSrc = params.flatMap((p) => p.src);
  const normCase = `CASE ${params.map((p) => `WHEN ${item} IN (${p.src.map(q).join(", ")}) THEN ${q(p.display)}`).join(" ")} END`;
  const cugCond = cug ? `cug_code = 'CISCO01' AND ` : "";
  return `
    WITH membership AS (
      SELECT ${uhid} AS uhid, bool_or("Source" = 'old') AS has_old
      FROM ${table} WHERE ${cug ? `cug_code = 'CISCO01'` : `TRUE`} GROUP BY 1
    ),
    ppq AS (
      SELECT ${normCase} AS param, ${uhid} AS uhid, date_trunc('quarter', ${date}) AS qd,
             AVG(TRIM(${value})::numeric) AS val
      FROM ${table}
      WHERE ${cugCond}"Source" = 'new' AND TRIM(${value}) ${NUMERIC} AND ${item} IN (${allSrc.map(q).join(", ")})
        AND ${date} >= ${QWINDOW}
      GROUP BY 1, 2, 3
    )
    SELECT p.param, to_char(p.qd, 'YYYY-"Q"Q') AS quarter,
           CASE WHEN m.has_old THEN 'tracked' ELSE 'new' END AS cohort,
           ROUND(AVG(p.val)::numeric, 2) AS avg, COUNT(*)::int AS n
    FROM ppq p JOIN membership m USING (uhid)
    WHERE p.param IS NOT NULL
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;
}

// The 8 monitored conditions (single-param thresholds → % of cohort positive).
// Used for BOTH the then/now baseline (snap) and the quarterly progression.
type CondDef = { key: string; label: string; threshold: string; base: typeof LAB_S | typeof VIT_S; item: string; src: string[]; pos: string };
const CONDITIONS: CondDef[] = [
  { key: "diabetic", label: "Diabetes", threshold: "Fasting glucose ≥ 126 mg/dL", base: LAB_S, item: "service_item_name", src: srcOf("Glucose (Fasting)"), pos: "VAL >= 126" },
  { key: "highChol", label: "High Cholesterol", threshold: "Total cholesterol ≥ 240 mg/dL", base: LAB_S, item: "service_item_name", src: srcOf("Cholesterol (Total)"), pos: "VAL >= 240" },
  { key: "lowHDL", label: "Low HDL", threshold: "HDL < 40 mg/dL", base: LAB_S, item: "service_item_name", src: srcOf("HDL"), pos: "VAL < 40" },
  { key: "highTrig", label: "High Triglycerides", threshold: "Triglycerides ≥ 200 mg/dL", base: LAB_S, item: "service_item_name", src: srcOf("Triglycerides"), pos: "VAL >= 200" },
  { key: "hypertension", label: "Hypertension", threshold: "Systolic BP ≥ 140 mmHg", base: VIT_S, item: "vital_parameter_name", src: ["BP(Systolic)"], pos: "VAL >= 140" },
  { key: "obese", label: "Obesity", threshold: "BMI ≥ 30", base: VIT_S, item: "vital_parameter_name", src: ["BMI"], pos: "VAL >= 30" },
  { key: "hypothyroid", label: "Hypothyroid", threshold: "TSH > 4.5 mIU/L", base: LAB_S, item: "service_item_name", src: srcOf("TSH"), pos: "VAL > 4.5" },
  { key: "anaemia", label: "Anaemia", threshold: "Haemoglobin < 12 g/dL", base: LAB_S, item: "service_item_name", src: srcOf("Haemoglobin"), pos: "VAL < 12" },
];
function conditionQuarterlySQL(def: CondDef) {
  const { base, item, src, pos } = def;
  const { table, uhid, value, date, cug } = base as any;
  const cugCond = cug ? `cug_code = 'CISCO01' AND ` : "";
  return `
    WITH membership AS (SELECT ${uhid} AS uhid, bool_or("Source" = 'old') AS has_old FROM ${table} WHERE ${cug ? `cug_code = 'CISCO01'` : `TRUE`} GROUP BY 1),
    ppq AS (
      SELECT ${uhid} AS uhid, date_trunc('quarter', ${date}) AS qd, AVG(TRIM(${value})::numeric) AS val
      FROM ${table} WHERE ${cugCond}"Source" = 'new' AND ${item} IN (${src.map(q).join(", ")}) AND TRIM(${value}) ${NUMERIC} AND ${date} >= ${QWINDOW}
      GROUP BY 1, 2
    )
    SELECT to_char(p.qd, 'YYYY-"Q"Q') AS quarter, CASE WHEN m.has_old THEN 'tracked' ELSE 'new' END AS cohort,
           COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${pos.replace(/VAL/g, "p.val")})::int AS positive
    FROM ppq p JOIN membership m USING (uhid) GROUP BY 1, 2 ORDER BY 1, 2`;
}
const GLUCOSE_CLS = `CASE WHEN VAL < 100 THEN 'Normal' WHEN VAL < 126 THEN 'Pre-diabetic' ELSE 'Diabetic' END`;
const BMI_CLS = `CASE WHEN VAL < 18.5 THEN 'Underweight' WHEN VAL < 25 THEN 'Normal' WHEN VAL < 30 THEN 'Overweight' ELSE 'Obese' END`;

function matrixSQL(base: any, src: string[], classify: string) {
  const { oldCte, newCte } = snap({ ...base, item: base.item, src });
  return `WITH oldv AS (${oldCte}), newv AS (${newCte})
    SELECT ${classify.replace(/VAL/g, "o.val")} AS old_cat, ${classify.replace(/VAL/g, "n.val")} AS new_cat, COUNT(*)::int AS n
    FROM oldv o JOIN newv n USING (uhid) GROUP BY 1, 2`;
}

type MatrixRow = { old_cat: string; new_cat: string; n: number };
function buildMatrix(rows: MatrixRow[], order: string[]) {
  const idx = Object.fromEntries(order.map((c, i) => [c, i]));
  const matrix = order.map(() => order.map(() => 0));
  const thenTotals = order.map(() => 0);
  const nowTotals = order.map(() => 0);
  let total = 0;
  for (const r of rows) {
    const oi = idx[r.old_cat], ni = idx[r.new_cat];
    if (oi == null || ni == null) continue;
    matrix[oi][ni] += r.n; thenTotals[oi] += r.n; nowTotals[ni] += r.n; total += r.n;
  }
  return { categories: order, matrix, thenTotals, nowTotals, total };
}

async function handler(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const cugCode = await getSessionCugCode(searchParams.get("clientId") ?? undefined);
    if (cugCode !== "CISCO01") {
      return NextResponse.json({ error: "Past Data is only available for CISCO01." }, { status: 403 });
    }

    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try { return await fn(); } catch (e) { console.error(`Past Data [${tag}]:`, e); failedQueries.push(tag); return []; }
    }
    const HEAVY = { statementTimeoutMs: 90000 };

    // Value progression (labs + vitals).
    const labProgP = safeQuery(() => dwQuery<{ param: string; cohort: string; avg_old: string; avg_new: string }>(
      valueProgressionSQL({ ...LAB_S, item: "service_item_name", params: LAB_PARAMS }), [], HEAVY), "labProgression");
    const vitProgP = safeQuery(() => dwQuery<{ param: string; cohort: string; avg_old: string; avg_new: string }>(
      valueProgressionSQL({ ...VIT_S, item: "vital_parameter_name", params: VIT_PARAMS }), [], HEAVY), "vitProgression");

    // Band transitions.
    const glyP = safeQuery(() => dwQuery<MatrixRow>(matrixSQL({ ...LAB_S, item: "service_item_name" }, srcOf("Glucose (Fasting)"), GLUCOSE_CLS), [], HEAVY), "glycemicTransition");
    const bmiP = safeQuery(() => dwQuery<MatrixRow>(matrixSQL({ ...VIT_S, item: "vital_parameter_name" }, ["BMI"], BMI_CLS), [], HEAVY), "bmiTransition");

    // BP stage transition (combine systolic + diastolic, most-recent each).
    const so = snap({ ...VIT_S, item: "vital_parameter_name", src: ["BP(Systolic)"] });
    const di = snap({ ...VIT_S, item: "vital_parameter_name", src: ["BP(Diastolic)"] });
    const bpStage = (s: string, d: string) => `CASE WHEN ${s} >= 140 OR ${d} >= 90 THEN 'Hypertension' WHEN ${s} >= 130 OR ${d} >= 85 THEN 'Elevated' ELSE 'Normal' END`;
    const bpP = safeQuery(() => dwQuery<MatrixRow>(
      `WITH so AS (${so.oldCte}), sn AS (${so.newCte}), dofd AS (${di.oldCte}), dn AS (${di.newCte}),
       joined AS (SELECT so.uhid, ${bpStage("so.val", "dofd.val")} AS old_cat, ${bpStage("sn.val", "dn.val")} AS new_cat
                  FROM so JOIN dofd USING (uhid) JOIN sn USING (uhid) JOIN dn USING (uhid))
       SELECT old_cat, new_cat, COUNT(*)::int AS n FROM joined GROUP BY 1, 2`, [], HEAVY), "bpTransition");

    // Extra single-metric prevalence (the rest derived from matrices in JS).
    const prevDefs = [
      { key: "highChol", label: "High Cholesterol", base: LAB_S, item: "service_item_name", src: srcOf("Cholesterol (Total)"), pos: "VAL >= 240" },
      { key: "lowHDL", label: "Low HDL", base: LAB_S, item: "service_item_name", src: srcOf("HDL"), pos: "VAL < 40" },
      { key: "hypothyroid", label: "Hypothyroid", base: LAB_S, item: "service_item_name", src: srcOf("TSH"), pos: "VAL > 4.5" },
      { key: "anaemia", label: "Anaemia", base: LAB_S, item: "service_item_name", src: srcOf("Haemoglobin"), pos: "VAL < 12" },
    ];
    const prevP = prevDefs.map((d) => {
      const { oldCte, newCte } = snap({ ...d.base, item: d.item, src: d.src });
      return safeQuery(() => dwQuery<{ cohort: string; then_pos: string; now_pos: string }>(
        `WITH oldv AS (${oldCte}), newv AS (${newCte})
         SELECT COUNT(*)::int AS cohort, COUNT(*) FILTER (WHERE ${d.pos.replace(/VAL/g, "o.val")})::int AS then_pos,
                COUNT(*) FILTER (WHERE ${d.pos.replace(/VAL/g, "n.val")})::int AS now_pos
         FROM oldv o JOIN newv n USING (uhid)`, [], HEAVY), `prev:${d.key}`);
    });

    // Scatter (per-patient old vs new) for a curated set.
    const SCATTER = [
      { display: "HbA1c", base: LAB_S, item: "service_item_name", src: srcOf("HbA1c") },
      { display: "Glucose (Fasting)", base: LAB_S, item: "service_item_name", src: srcOf("Glucose (Fasting)") },
      { display: "Cholesterol (Total)", base: LAB_S, item: "service_item_name", src: srcOf("Cholesterol (Total)") },
      { display: "LDL", base: LAB_S, item: "service_item_name", src: srcOf("LDL") },
      { display: "BMI", base: VIT_S, item: "vital_parameter_name", src: ["BMI"] },
    ];
    const scatterP = SCATTER.map((s) => {
      const { oldCte, newCte } = snap({ ...s.base, item: s.item, src: s.src });
      return safeQuery(() => dwQuery<{ o: string; n: string }>(
        `WITH oldv AS (${oldCte}), newv AS (${newCte})
         SELECT o.val::numeric(12,2) AS o, n.val::numeric(12,2) AS n FROM oldv o JOIN newv n USING (uhid)`, [], HEAVY), `scatter:${s.display}`);
    });

    // KPIs.
    const kpiP = safeQuery(() => dwQuery<{ lab_cohort: string; vit_cohort: string; vit_new_only: string; median_years: string }>(
      `WITH lab_span AS (
         SELECT "uhId" AS uhid, EXTRACT(EPOCH FROM (MAX(verification_date_time) FILTER (WHERE "Source"='new') - MAX(verification_date_time) FILTER (WHERE "Source"='old'))) / (365.25*86400) AS years
         FROM ${LAB} GROUP BY 1 HAVING COUNT(DISTINCT "Source") = 2),
       vit_cohort AS (SELECT uhid FROM ${VIT} GROUP BY 1 HAVING COUNT(DISTINCT "Source") = 2),
       vit_new AS (SELECT uhid FROM ${VIT} WHERE "Source" = 'new' GROUP BY 1)
       SELECT (SELECT COUNT(*) FROM lab_span)::bigint AS lab_cohort, (SELECT COUNT(*) FROM vit_cohort)::bigint AS vit_cohort,
              ((SELECT COUNT(*) FROM vit_new) - (SELECT COUNT(*) FROM vit_cohort))::bigint AS vit_new_only,
              COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY years), 0)::numeric(6,1) AS median_years FROM lab_span`,
      [], HEAVY), "kpis");

    // ── Quarterly progression (value averages + condition rates) ──
    const labQP = safeQuery(() => dwQuery<{ param: string; quarter: string; cohort: string; avg: string; n: string }>(
      valueQuarterlySQL({ ...LAB_S, item: "service_item_name", params: LAB_PARAMS }), [], HEAVY), "labQuarterly");
    const vitQP = safeQuery(() => dwQuery<{ param: string; quarter: string; cohort: string; avg: string; n: string }>(
      valueQuarterlySQL({ ...VIT_S, item: "vital_parameter_name", params: VIT_PARAMS }), [], HEAVY), "vitQuarterly");
    const condQP = CONDITIONS.map((c) => safeQuery(() => dwQuery<{ quarter: string; cohort: string; total: string; positive: string }>(
      conditionQuarterlySQL(c), [], HEAVY), `cond:${c.key}`));
    // Per-condition Then/Now baseline (most-recent-old vs most-recent-new over the both-cohort).
    const condTNP = CONDITIONS.map((c) => {
      const { oldCte, newCte } = snap({ ...c.base, item: c.item, src: c.src });
      return safeQuery(() => dwQuery<{ cohort: string; then_pos: string; now_pos: string }>(
        `WITH oldv AS (${oldCte}), newv AS (${newCte})
         SELECT COUNT(*)::int AS cohort, COUNT(*) FILTER (WHERE ${c.pos.replace(/VAL/g, "o.val")})::int AS then_pos,
                COUNT(*) FILTER (WHERE ${c.pos.replace(/VAL/g, "n.val")})::int AS now_pos
         FROM oldv o JOIN newv n USING (uhid)`, [], HEAVY), `condTN:${c.key}`);
    });

    const [labProg, vitProg, glyRows, bmiRows, bpRows, kpiRows, labQ, vitQ, ...rest] = await Promise.all([labProgP, vitProgP, glyP, bmiP, bpP, kpiP, labQP, vitQP, ...condQP, ...condTNP, ...prevP, ...scatterP]);
    const NC = CONDITIONS.length;
    const condResults = rest.slice(0, NC) as { quarter: string; cohort: string; total: string; positive: string }[][];
    const condTNResults = rest.slice(NC, 2 * NC) as { cohort: string; then_pos: string; now_pos: string }[][];
    const prevResults = rest.slice(2 * NC, 2 * NC + prevDefs.length) as { cohort: string; then_pos: string; now_pos: string }[][];
    const scatterResults = rest.slice(2 * NC + prevDefs.length) as { o: string; n: string }[][];

    // ── Shape value progression rows (attach panel + direction + delta). ──
    const ALL = [...LAB_PARAMS, ...VIT_PARAMS];
    const metaOf = (display: string) => ALL.find((p) => p.display === display);
    const shapeProg = (rows: { param: string; cohort: string; avg_old: string; avg_new: string }[], catalogue: typeof LAB_PARAMS) => {
      const byParam: Record<string, { cohort: number; avgOld: number; avgNew: number }> = {};
      for (const r of rows) byParam[r.param] = { cohort: Number(r.cohort || 0), avgOld: Number(r.avg_old || 0), avgNew: Number(r.avg_new || 0) };
      return catalogue.map((p) => {
        const v = byParam[p.display] || { cohort: 0, avgOld: 0, avgNew: 0 };
        const delta = v.avgNew - v.avgOld;
        const pct = v.avgOld !== 0 ? (delta / v.avgOld) * 100 : 0;
        const improved = p.dir === "neutral" ? null : (p.dir === "lower" ? delta < 0 : delta > 0);
        return { param: p.display, panel: p.panel, direction: p.dir, cohort: v.cohort, avgOld: v.avgOld, avgNew: v.avgNew, delta: Math.round(delta * 100) / 100, pctChange: Math.round(pct * 10) / 10, improved };
      }).filter((r) => r.cohort > 0);
    };
    const labProgression = shapeProg(labProg, LAB_PARAMS);
    const vitalsProgression = shapeProg(vitProg, VIT_PARAMS);

    // ── Matrices ──
    const glycemicMatrix = buildMatrix(glyRows, ["Normal", "Pre-diabetic", "Diabetic"]);
    const bmiMatrix = buildMatrix(bmiRows, ["Underweight", "Normal", "Overweight", "Obese"]);
    const bpMatrix = buildMatrix(bpRows, ["Normal", "Elevated", "Hypertension"]);

    // ── Prevalence (derive diabetes/obesity/hypertension from matrices) ──
    const sumCats = (totals: number[], cats: string[], pick: string[]) => cats.reduce((s, c, i) => s + (pick.includes(c) ? totals[i] : 0), 0);
    const prevalence = [
      { key: "diabetes", label: "Diabetes", cohort: glycemicMatrix.total, thenPositive: sumCats(glycemicMatrix.thenTotals, glycemicMatrix.categories, ["Diabetic"]), nowPositive: sumCats(glycemicMatrix.nowTotals, glycemicMatrix.categories, ["Diabetic"]) },
      { key: "prediabetes", label: "Pre-diabetes", cohort: glycemicMatrix.total, thenPositive: sumCats(glycemicMatrix.thenTotals, glycemicMatrix.categories, ["Pre-diabetic"]), nowPositive: sumCats(glycemicMatrix.nowTotals, glycemicMatrix.categories, ["Pre-diabetic"]) },
      { key: "obesity", label: "Obesity", cohort: bmiMatrix.total, thenPositive: sumCats(bmiMatrix.thenTotals, bmiMatrix.categories, ["Obese"]), nowPositive: sumCats(bmiMatrix.nowTotals, bmiMatrix.categories, ["Obese"]) },
      { key: "overweight", label: "Overweight+", cohort: bmiMatrix.total, thenPositive: sumCats(bmiMatrix.thenTotals, bmiMatrix.categories, ["Overweight", "Obese"]), nowPositive: sumCats(bmiMatrix.nowTotals, bmiMatrix.categories, ["Overweight", "Obese"]) },
      { key: "hypertension", label: "Hypertension", cohort: bpMatrix.total, thenPositive: sumCats(bpMatrix.thenTotals, bpMatrix.categories, ["Hypertension"]), nowPositive: sumCats(bpMatrix.nowTotals, bpMatrix.categories, ["Hypertension"]) },
      ...prevDefs.map((d, i) => { const r = prevResults[i]?.[0]; return { key: d.key, label: d.label, cohort: Number(r?.cohort || 0), thenPositive: Number(r?.then_pos || 0), nowPositive: Number(r?.now_pos || 0) }; }),
    ].filter((p) => p.cohort > 0).sort((a, b) => (b.nowPositive - b.thenPositive) - (a.nowPositive - a.thenPositive));

    const scatter = SCATTER.map((s, i) => ({ param: s.display, points: (scatterResults[i] || []).map((r) => ({ o: Number(r.o), n: Number(r.n) })) })).filter((s) => s.points.length > 0);

    // ── Shape quarterly value progression (per param, per cohort series) ──
    type Coh = "tracked" | "new";
    const qSort = (a: { quarter: string }, b: { quarter: string }) => a.quarter.localeCompare(b.quarter);
    const allQuarters = new Set<string>();
    const shapeQuarterly = (rows: { param: string; quarter: string; cohort: string; avg: string; n: string }[], catalogue: typeof LAB_PARAMS, prog: typeof labProgression) =>
      catalogue.map((p) => {
        const series: Record<Coh, { quarter: string; avg: number; n: number }[]> = { tracked: [], new: [] };
        rows.filter((r) => r.param === p.display).forEach((r) => {
          allQuarters.add(r.quarter);
          (series[r.cohort as Coh] ||= []).push({ quarter: r.quarter, avg: Number(r.avg), n: Number(r.n) });
        });
        series.tracked.sort(qSort); series.new.sort(qSort);
        return { param: p.display, panel: p.panel, direction: p.dir, baselineOld: prog.find((x) => x.param === p.display)?.avgOld ?? null, series };
      }).filter((p) => p.series.tracked.length || p.series.new.length);
    const labQuarterly = shapeQuarterly(labQ, LAB_PARAMS, labProgression);
    const vitalsQuarterly = shapeQuarterly(vitQ, VIT_PARAMS, vitalsProgression);

    // ── Member Health Journey: per condition, Then → quarters → Now, per cohort ──
    const pctOf = (pos: number, tot: number) => (tot ? Math.round((pos / tot) * 1000) / 10 : 0);
    const conditionJourney = CONDITIONS.map((c, i) => {
      const tn = condTNResults[i]?.[0];
      const cohort = Number(tn?.cohort || 0), thenPos = Number(tn?.then_pos || 0), nowPos = Number(tn?.now_pos || 0);
      const trackedQ: { quarter: string; positive: number; total: number; pct: number }[] = [];
      const newQ: { quarter: string; positive: number; total: number; pct: number }[] = [];
      (condResults[i] || []).forEach((r) => {
        allQuarters.add(r.quarter);
        const total = Number(r.total), positive = Number(r.positive);
        (r.cohort === "tracked" ? trackedQ : newQ).push({ quarter: r.quarter, positive, total, pct: pctOf(positive, total) });
      });
      trackedQ.sort(qSort); newQ.sort(qSort);
      return {
        key: c.key, label: c.label, threshold: c.threshold,
        tracked: {
          cohort,
          then: { positive: thenPos, total: cohort, pct: pctOf(thenPos, cohort) },
          now: { positive: nowPos, total: cohort, pct: pctOf(nowPos, cohort) },
          quarters: trackedQ,
        },
        new: { quarters: newQ },
      };
    }).sort((a, b) => (b.tracked.then.positive - b.tracked.now.positive) - (a.tracked.then.positive - a.tracked.now.positive));
    const quarters = [...allQuarters].sort();

    const kpi = kpiRows[0];
    const improvedCount = [...labProgression, ...vitalsProgression].filter((r) => r.improved === true).length;
    const worsenedCount = [...labProgression, ...vitalsProgression].filter((r) => r.improved === false).length;

    return NextResponse.json({
      kpis: {
        labCohort: Number(kpi?.lab_cohort || 0),
        vitalsCohort: Number(kpi?.vit_cohort || 0),
        newMembers: Number(kpi?.vit_new_only || 0),
        // Distinct clinical conditions compared then→now (see CONDITIONS_MONITORED).
        conditionsMonitored: CONDITIONS_MONITORED.length,
        conditionsList: CONDITIONS_MONITORED,
        medianYears: Number(kpi?.median_years || 0),
        improvedCount, worsenedCount,
      },
      prevalence,
      labProgression,
      vitalsProgression,
      labQuarterly,
      vitalsQuarterly,
      conditionJourney,
      quarters,
      transitions: { glycemic: glycemicMatrix, bmi: bmiMatrix, bp: bpMatrix },
      scatter,
      lastUpdated: new Date().toISOString(),
      meta: { hadErrors: failedQueries.length > 0, failedQueries },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("CISCO Past Data API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "cisco/past-data" });
