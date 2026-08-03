/**
 * Shared query helpers for the NTTDATA01 (NTT DATA) Wellness dashboards.
 *
 * Every NTT Wellness page reads a single warehouse table,
 * fact_kx.ntt_health_risk_assessment, scoped to cug_code = 'NTTDATA01'. This
 * module centralises the table name, the exact (63-char, sometimes
 * space-padded) question column names, the answer-text → point maps, the
 * per-instrument scoring + classification bands, and the global filter set so
 * all four routes behave identically.
 *
 * SCORING SOURCE OF TRUTH
 * ───────────────────────
 * Scores are computed IN-APP from the raw answer text (verified 99.5% match
 * against the client's own stored scores) — NOT read from the unreliable
 * pre-computed score columns. Unanswered questions score 0 (COALESCE), which
 * reproduces the client's own convention.
 *
 * The three clinical instruments use the PPT scoring verbatim:
 *   • GAD-7 (anxiety, "Joy")        0–21
 *   • PHQ-9 (depression, "Enthusiasm") 0–27
 *   • TISE  (self-esteem, "Motivation") 0–2
 *
 * The five workplace instruments use the PPT classification LOGIC rescaled to
 * the number of questions actually present in the data (the PPT's own maxima
 * are internally inconsistent — e.g. it calls Psych Safety a "max-9" scale but
 * only 2 questions exist, so a strict 7–9 "Promoter" band would be
 * unreachable). The rescaled bands below are exactly the ones on the client's
 * dashboard mock-up:
 *   • Psychological Safety   0–6   (2Q)
 *   • Peer Relationships     0–9   (3Q)
 *   • Managerial Support     0–7   (2Q)
 *   • Sense of Belonging     0–9   (3Q)
 *   • Org Infrastructure     0–11  (3Q)
 */

// ── Table + tenant ─────────────────────────────────────────────────────────
export const NTT_TABLE = "fact_kx.ntt_health_risk_assessment";
export const NTT_CUG = "NTTDATA01";

// ── Exact question column names (verified against the warehouse) ────────────
// NOTE: several are Postgres-truncated at 63 chars and a couple end in a
// trailing space — they must be quoted EXACTLY as written here.
export const COLS = {
  gad: [
    "1. Feeling nervous, anxious, or on edge",
    "2. Not being able to stop or control worrying",
    "3. Worrying too much about different things",
    "4. Trouble relaxing",
    "5. Being so restless that it's hard to sit still",
    "6. Becoming easily annoyed or irritable",
    "7. Feeling afraid as if something awful might happen",
  ],
  phq: [
    "1. Little interest or pleasure in doing things?",
    "2. Feeling down, depressed, or hopeless?",
    "3. Trouble falling or staying asleep, or sleeping too much?",
    "4. Feeling tired or having little energy?",
    "5. Poor appetite or overeating?",
    "6. Feeling bad about yourself - or that you are a failure or ha",
    "7. Trouble concentrating on things, such as reading newspaper o",
    "8. Moving or speaking so slowly that other people could have no",
    "9. Thoughts that you would be better off dead, or of the hurtin",
  ],
  tise: [
    "1. I feel that I have a number of good qualities",
    "2. I feel that I am a person of worth",
  ],
  psych: [
    "1. How often have you felt comfortable sharing your ideas or op",
    "2. How often have mistakes been treated as learning opportuniti",
  ],
  peer: [
    "3. How often have your colleagues supported you during challeng",
    "4. How often have informal interactions with colleagues (lunch,",
    "5. Do you feel you have at least one trusted colleague or manag",
  ],
  mgr: [
    "6. How approachable has your manager been when you wanted to di",
    "7. Do you feel supported by your manager and team in taking nec",
  ],
  belong: [
    "8. To what extent do you feel connected to the broader NDBS com",
    "9. How much have NDBS events & initiatives (sports, awareness s",
    "10. Do you feel excited to come to work?",
  ],
  org: [
    "11. How satisfied are you with the wellness facilities at your ",
    "12. Do you feel the physical set-up of your workspace (e.g., ch",
    "13. How helpful have been the NDBS provided wellness benefits a",
  ],
  obstacle: "14.What is the single biggest obstacle at work that currently p",
} as const;

// ── Short, human labels for the per-question response charts ────────────────
export const QUESTION_LABELS: Record<string, string[]> = {
  gad: [
    "Q1. Feeling nervous, anxious",
    "Q2. Can't stop worrying",
    "Q3. Worrying too much",
    "Q4. Trouble relaxing",
    "Q5. Being restless",
    "Q6. Easily annoyed/irritable",
    "Q7. Feeling afraid",
  ],
  phq: [
    "Q1. Little interest or pleasure",
    "Q2. Feeling down, depressed",
    "Q3. Sleep problems",
    "Q4. Feeling tired",
    "Q5. Poor appetite/overeating",
    "Q6. Feeling bad about yourself",
    "Q7. Trouble concentrating",
    "Q8. Moving/speaking slowly",
    "Q9. Thoughts of self-harm",
  ],
  tise: [
    "Q1. I have a number of good qualities",
    "Q2. I am a person of worth",
  ],
  psych: ["Q1. Comfortable sharing ideas", "Q2. Mistakes as learning"],
  peer: ["Q1. Colleagues support", "Q2. Informal interactions", "Q3. Trusted colleague"],
  mgr: ["Q1. Manager approachable", "Q2. Supported for time off"],
  belong: ["Q1. Connected to community", "Q2. Events contribute value", "Q3. Excited to work"],
  org: ["Q1. Wellness facilities", "Q2. Workspace health", "Q3. Wellness benefits"],
};

// ── Answer-text → point maps + display order per scale ──────────────────────
// `aliases` folds raw answer variants (e.g. data misspellings) into a display
// option so the response-distribution bars bucket them correctly and fill 100%.
type ScaleDef = { map: [string, number][]; options: string[]; aliases?: Record<string, string> };
export const SCALES: Record<string, ScaleDef> = {
  // GAD / PHQ frequency scale (0–3)
  freq4: {
    map: [
      ["not at all", 0],
      ["several days", 1],
      ["over half the days", 2],
      ["nearly everyday", 3],
      ["nearly everday", 3], // observed misspelling in the data
      ["nearly every day", 3],
    ],
    options: ["Not at all", "Several days", "Over half the days", "Nearly everyday"],
    // Fold the observed misspelling / spacing variants into the display bucket.
    aliases: { "nearly everday": "nearly everyday", "nearly every day": "nearly everyday" },
  },
  // Workplace frequency scale (0–3): psych Q1-2, peer Q1-2, mgr Q1
  workfreq: {
    map: [
      ["almost constantly", 3],
      ["frequently", 2],
      ["occasionally", 1],
      ["not at all", 0],
    ],
    options: ["Almost Constantly", "Frequently", "Occasionally", "Not at all"],
  },
  // Yes/No worth 3/0 (peer Q3, belonging Q3)
  yesno3: { map: [["yes", 3], ["no", 0]], options: ["Yes", "No"] },
  // TISE Yes/No worth 1/0
  yesno1: { map: [["yes", 1], ["no", 0]], options: ["Yes", "No"] },
  // Managerial Q2 agreement scale (0–4)
  agree5: {
    map: [
      ["strongly disagree", 0],
      ["disagree", 1],
      ["neutral", 2],
      ["agree", 3],
      ["strongly agree", 4],
    ],
    options: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"],
  },
  // Belonging Q1-2 extent scale (0–3)
  extent4: {
    map: [
      ["to a large extent", 3],
      ["to some extent", 2],
      ["to a small extent", 1],
      ["not at all", 0],
    ],
    options: ["To a large extent", "To some extent", "To a small extent", "Not at all"],
  },
  // Org Q1 satisfaction scale (0–4)
  satisfy5: {
    map: [
      ["very satisfied", 4],
      ["satisfied", 3],
      ["neutral", 2],
      ["dissatisfied", 1],
      ["very dissatisfied", 0],
    ],
    options: ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"],
  },
  // Org Q2 workspace Yes/No worth 3/0
  workspace3: { map: [["yes", 3], ["no", 0]], options: ["Yes", "No"] },
  // Org Q3 helpfulness scale (0–4); "Not Applicable" scores 0
  helpful5: {
    map: [
      ["very helpful", 4],
      ["helpful", 3],
      ["neutral", 2],
      ["unhelpful", 1],
      ["very unhelpful", 0],
      ["not applicable", 0],
    ],
    options: ["Very Helpful", "Helpful", "Neutral", "Unhelpful", "Very Unhelpful", "Not Applicable"],
  },
};

// Which scale each instrument's questions use (index-aligned with COLS).
export const INSTRUMENT_SCALES: Record<string, string[]> = {
  gad: Array(7).fill("freq4"),
  phq: Array(9).fill("freq4"),
  tise: ["yesno1", "yesno1"],
  psych: ["workfreq", "workfreq"],
  peer: ["workfreq", "workfreq", "yesno3"],
  mgr: ["workfreq", "agree5"],
  belong: ["extent4", "extent4", "yesno3"],
  org: ["satisfy5", "workspace3", "helpful5"],
};

// ── SQL helpers ─────────────────────────────────────────────────────────────
/** Double-quote a column identifier (escaping embedded quotes). */
export const qi = (col: string) => `"${col.replace(/"/g, '""')}"`;

/** CASE expression mapping one column's answer text → points for a scale. */
export function scoreCase(col: string, scale: string, alias = "a"): string {
  const s = SCALES[scale];
  const whens = s.map.map(([k, v]) => `WHEN '${k.replace(/'/g, "''")}' THEN ${v}`).join(" ");
  return `CASE lower(trim(${alias}.${qi(col)})) ${whens} ELSE 0 END`;
}

/** Per-respondent total-score SQL expression for a whole instrument. */
export function scoreExpr(instrument: keyof typeof COLS, alias = "a"): string {
  const cols = COLS[instrument] as readonly string[];
  const scales = INSTRUMENT_SCALES[instrument];
  return "(" + cols.map((c, i) => scoreCase(c, scales[i], alias)).join(" + ") + ")";
}

/** Predicate: this respondent answered at least one question of the instrument. */
export function answeredPredicate(instrument: keyof typeof COLS, alias = "a"): string {
  const cols = COLS[instrument] as readonly string[];
  return "(" + cols.map((c) => `NULLIF(TRIM(${alias}.${qi(c)}), '') IS NOT NULL`).join(" OR ") + ")";
}

// ── Classification bands (score → {label, action}) ──────────────────────────
// action ∈ 'promoter' | 'support' | 'immediate'
export type Band = { min: number; max: number; label: string; action: "promoter" | "support" | "immediate" };
export const BANDS: Record<string, { max: number; bands: Band[] }> = {
  // Clinical — verbatim PPT
  gad: {
    max: 21,
    bands: [
      { min: 0, max: 4, label: "No Anxiety", action: "promoter" },
      { min: 5, max: 9, label: "Mild Anxiety", action: "support" },
      { min: 10, max: 14, label: "Moderate Anxiety", action: "support" },
      { min: 15, max: 21, label: "Severe Anxiety", action: "immediate" },
    ],
  },
  phq: {
    max: 27,
    bands: [
      { min: 0, max: 0, label: "No Depression", action: "promoter" },
      { min: 1, max: 4, label: "Minimal", action: "support" },
      { min: 5, max: 9, label: "Mild", action: "support" },
      { min: 10, max: 14, label: "Moderate", action: "immediate" },
      { min: 15, max: 19, label: "Mod. Severe", action: "immediate" },
      { min: 20, max: 27, label: "Severe", action: "immediate" },
    ],
  },
  tise: {
    max: 2,
    bands: [
      { min: 2, max: 2, label: "High Self-Esteem", action: "promoter" },
      { min: 0, max: 1, label: "Low Self-Esteem", action: "support" },
    ],
  },
  // Workplace — PPT logic rescaled to the real question count (= mock-up bands)
  psych: {
    max: 6,
    bands: [
      { min: 5, max: 6, label: "High", action: "promoter" },
      { min: 3, max: 4, label: "Moderate", action: "support" },
      { min: 0, max: 2, label: "Low", action: "support" },
    ],
  },
  peer: {
    max: 9,
    bands: [
      { min: 7, max: 9, label: "Strong", action: "promoter" },
      { min: 4, max: 6, label: "Moderate", action: "support" },
      { min: 0, max: 3, label: "Limited", action: "support" },
    ],
  },
  mgr: {
    max: 7,
    bands: [
      { min: 6, max: 7, label: "High", action: "promoter" },
      { min: 4, max: 5, label: "Moderate", action: "support" },
      { min: 0, max: 3, label: "Low", action: "support" },
    ],
  },
  belong: {
    max: 9,
    bands: [
      { min: 7, max: 9, label: "Strong", action: "promoter" },
      { min: 4, max: 6, label: "Moderate", action: "support" },
      { min: 0, max: 3, label: "Low", action: "support" },
    ],
  },
  org: {
    max: 11,
    bands: [
      { min: 9, max: 11, label: "Supportive", action: "promoter" },
      { min: 5, max: 8, label: "Adequate", action: "support" },
      { min: 0, max: 4, label: "Limited", action: "support" },
    ],
  },
};

/** Classify a numeric score into its band for an instrument. */
export function classify(instrument: string, score: number): Band | null {
  const cfg = BANDS[instrument];
  if (!cfg) return null;
  return cfg.bands.find((b) => score >= b.min && score <= b.max) ?? null;
}

// ── Global filters (Date range, Gender, Age Group) ──────────────────────────
export interface NttFilters {
  dateFrom?: string;
  dateTo?: string;
  genders?: string[];
  ageGroups?: string[];
}

export const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"] as const;

/** SQL: leading integer years parsed from patient_age text like "26 Y,7 M,30 D". */
export const ageYearsSql = (alias = "a") =>
  `NULLIF(substring(${alias}.patient_age from '^([0-9]+)'), '')::int`;

/** SQL: patient_age → banded age group, matching AGE_ORDER. */
export function ageGroupSql(alias = "a"): string {
  const y = ageYearsSql(alias);
  return `CASE
    WHEN ${y} IS NULL THEN NULL
    WHEN ${y} < 20 THEN '<20'
    WHEN ${y} BETWEEN 20 AND 35 THEN '20-35'
    WHEN ${y} BETWEEN 36 AND 40 THEN '36-40'
    WHEN ${y} BETWEEN 41 AND 60 THEN '41-60'
    ELSE '61+' END`;
}

export function parseNttFilters(sp: URLSearchParams): NttFilters {
  const arr = (k: string) => sp.get(k)?.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    genders: arr("genders"),
    ageGroups: arr("ageGroups"),
  };
}

/**
 * Build a parameterised WHERE (always scoped to NTTDATA01) for the given
 * filters. Returns the clause, ordered params, and the next free $N index.
 */
export function buildNttWhere(
  f: NttFilters,
  startIdx = 1,
  alias = "a",
): { where: string; params: unknown[]; nextIdx: number } {
  const conds: string[] = [`${alias}.cug_code = '${NTT_CUG}'`, `${alias}.status = 'Final'`];
  const params: unknown[] = [];
  let i = startIdx;
  if (f.dateFrom) {
    conds.push(`${alias}.creation_date >= $${i}::timestamp`);
    params.push(f.dateFrom);
    i++;
  }
  if (f.dateTo) {
    conds.push(`${alias}.creation_date < ($${i}::date + interval '1 day')::timestamp`);
    params.push(f.dateTo);
    i++;
  }
  if (f.genders && f.genders.length) {
    const gc = f.genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return `LOWER(TRIM(${alias}.patient_gender)) IN ('male','m')`;
      if (l === "female") return `LOWER(TRIM(${alias}.patient_gender)) IN ('female','f')`;
      return `(LOWER(TRIM(${alias}.patient_gender)) NOT IN ('male','m','female','f') OR ${alias}.patient_gender IS NULL OR TRIM(${alias}.patient_gender) = '')`;
    });
    conds.push(`(${gc.join(" OR ")})`);
  }
  if (f.ageGroups && f.ageGroups.length) {
    conds.push(`(${ageGroupSql(alias)}) = ANY($${i})`);
    params.push(f.ageGroups);
    i++;
  }
  return { where: conds.join(" AND "), params, nextIdx: i };
}

/** Normalise a raw gender string to a display label. */
export function normGenderLabel(g: string | null | undefined): "Male" | "Female" | "Others" {
  if (!g) return "Others";
  const l = g.trim().toLowerCase();
  if (l === "male" || l === "m") return "Male";
  if (l === "female" || l === "f") return "Female";
  return "Others";
}

/** Standard filter-option dropdowns (Gender + Age Group). Date is free-form. */
export async function nttFilterOptions(
  dwQuery: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>,
): Promise<{ genders: string[]; ageGroups: string[] }> {
  const scope = `a.cug_code = '${NTT_CUG}' AND a.status = 'Final'`;
  const rows = await dwQuery<{ v: string }>(
    `SELECT DISTINCT a.patient_gender AS v FROM ${NTT_TABLE} a WHERE ${scope} AND a.patient_gender IS NOT NULL`,
  );
  const genders = [...new Set(rows.map((r) => normGenderLabel(r.v)))];
  const order = ["Male", "Female", "Others"];
  genders.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  return { genders, ageGroups: [...AGE_ORDER] };
}

/**
 * Build a UNION-ALL query returning per-question answer distribution for an
 * instrument: rows of { qidx, answer, cnt } over the scoped/filtered set.
 * `whereScoped` is the full WHERE clause (already parameterised); pass the
 * same params array the caller used to build it.
 */
export function perQuestionDistSql(
  instrument: keyof typeof COLS,
  whereScoped: string,
  alias = "a",
): string {
  const cols = COLS[instrument] as readonly string[];
  const parts = cols.map(
    (c, i) =>
      `SELECT ${i} AS qidx, TRIM(${alias}.${qi(c)}) AS answer, COUNT(*)::int AS cnt
       FROM ${NTT_TABLE} ${alias}
       WHERE ${whereScoped} AND NULLIF(TRIM(${alias}.${qi(c)}), '') IS NOT NULL
       GROUP BY 2`,
  );
  return parts.join("\nUNION ALL\n");
}

// ── Full per-instrument computation (used by every route) ───────────────────
export interface InstrumentStats {
  key: string;
  total: number;
  average: number;
  max: number;
  /** One entry per classification band, in band order. */
  bands: { label: string; action: Band["action"]; count: number }[];
  /** Action rollup across bands. */
  actions: { promoter: number; support: number; immediate: number };
  /** Per-score-value histogram (only meaningful for small scales like TISE). */
  histogram: { score: number; count: number }[];
  /** Per-question answer distribution, in question + option order. */
  byQuestion: {
    question: string;
    total: number;
    options: { label: string; count: number; pct: number }[];
  }[];
}

type LooseDwQuery = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

/**
 * Compute all dashboard stats for one instrument over a scoped/filtered set.
 * Two warehouse round-trips: (1) per-respondent score aggregate → totals,
 * average, band + action + histogram counts; (2) per-question distribution.
 */
export async function computeInstrument(
  dwQuery: LooseDwQuery,
  instrument: keyof typeof COLS & keyof typeof BANDS,
  where: string,
  params: unknown[],
  alias = "a",
): Promise<InstrumentStats> {
  const cfg = BANDS[instrument];
  const score = scoreExpr(instrument, alias);
  const answered = answeredPredicate(instrument, alias);

  // Band counts as FILTERed aggregates.
  const bandFilters = cfg.bands
    .map((b, i) => `COUNT(*) FILTER (WHERE sc BETWEEN ${b.min} AND ${b.max})::int AS band_${i}`)
    .join(", ");
  const actionFilter = (action: Band["action"]) => {
    const idxs = cfg.bands.map((b, i) => (b.action === action ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return `0::int`;
    const clause = idxs
      .map((i) => `(sc BETWEEN ${cfg.bands[i].min} AND ${cfg.bands[i].max})`)
      .join(" OR ");
    return `COUNT(*) FILTER (WHERE ${clause})::int`;
  };
  // Per-score histogram (0..max) — cheap; used by TISE, harmless elsewhere.
  const histFilters = Array.from(
    { length: cfg.max + 1 },
    (_, s) => `COUNT(*) FILTER (WHERE sc = ${s})::int AS h_${s}`,
  ).join(", ");

  const aggRows = await dwQuery<Record<string, string | number>>(
    `WITH per AS (SELECT ${score} AS sc FROM ${NTT_TABLE} ${alias} WHERE ${where} AND ${answered})
     SELECT COUNT(*)::int AS total,
            COALESCE(ROUND(AVG(sc), 2), 0)::float8 AS average,
            ${bandFilters},
            ${actionFilter("promoter")} AS act_promoter,
            ${actionFilter("support")}  AS act_support,
            ${actionFilter("immediate")} AS act_immediate,
            ${histFilters}
     FROM per`,
    params,
  );
  const r = aggRows[0] || ({} as Record<string, string | number>);
  const num = (v: unknown) => Number(v || 0);

  const bands = cfg.bands.map((b, i) => ({
    label: b.label,
    action: b.action,
    count: num(r[`band_${i}`]),
  }));
  const actions = {
    promoter: num(r.act_promoter),
    support: num(r.act_support),
    immediate: num(r.act_immediate),
  };
  const histogram = Array.from({ length: cfg.max + 1 }, (_, s) => ({
    score: s,
    count: num(r[`h_${s}`]),
  }));

  // Per-question distribution.
  const distRows = await dwQuery<{ qidx: number; answer: string; cnt: number }>(
    `SELECT qidx, answer, cnt FROM (${perQuestionDistSql(instrument, where, alias)}) t`,
    params,
  );
  const cols = COLS[instrument] as readonly string[];
  const scales = INSTRUMENT_SCALES[instrument];
  const labels = QUESTION_LABELS[instrument] || cols.map((_, i) => `Q${i + 1}`);
  const byQuestion = cols.map((_, qi2) => {
    const scaleDef = SCALES[scales[qi2]];
    const opts = scaleDef.options;
    const aliases = scaleDef.aliases || {};
    // Accumulate counts keyed by canonical (aliased) answer, so misspellings /
    // spacing variants fold into their display bucket.
    const counts = new Map<string, number>();
    for (const row of distRows) {
      if (Number(row.qidx) !== qi2) continue;
      const raw = (row.answer || "").toLowerCase();
      const canon = aliases[raw] || raw;
      counts.set(canon, num(row.cnt) + (counts.get(canon) || 0));
    }
    // Total over KNOWN options only, so the stacked bar always fills to 100%.
    const optionCounts = opts.map((label) => counts.get(label.toLowerCase()) || 0);
    const total = optionCounts.reduce((s, v) => s + v, 0);
    const options = opts.map((label, i) => ({
      label,
      count: optionCounts[i],
      pct: total > 0 ? Math.round((optionCounts[i] / total) * 1000) / 10 : 0,
    }));
    return { question: labels[qi2], total, options };
  });

  return {
    key: instrument,
    total: num(r.total),
    average: num(r.average),
    max: cfg.max,
    bands,
    actions,
    histogram,
    byQuestion,
  };
}

/** Obstacle (open-ended) distribution for the Workplace Wellbeing page. */
export async function obstacleDistribution(
  dwQuery: LooseDwQuery,
  where: string,
  params: unknown[],
  alias = "a",
): Promise<{ label: string; count: number }[]> {
  const col = qi(COLS.obstacle);
  const rows = await dwQuery<{ v: string; c: number }>(
    `SELECT TRIM(${alias}.${col}) AS v, COUNT(*)::int AS c
     FROM ${NTT_TABLE} ${alias}
     WHERE ${where} AND NULLIF(TRIM(${alias}.${col}), '') IS NOT NULL
     GROUP BY 1 ORDER BY 2 DESC`,
    params,
  );
  return rows.map((r) => ({ label: r.v, count: Number(r.c || 0) }));
}

