import { dwQuery } from "./data-warehouse";
import type { DashboardFilters } from "@/lib/types";

// ── Filter Builder ──

interface QueryParts {
  conditions: string[];
  params: unknown[];
}

function buildFilters(filters: DashboardFilters, startIndex = 1): QueryParts {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  conditions.push(`cug_code = $${idx}`);
  params.push(filters.cugCode);
  idx++;

  if (filters.dateFrom) {
    conditions.push(`month >= $${idx}::date`);
    params.push(filters.dateFrom);
    idx++;
  }
  if (filters.dateTo) {
    conditions.push(`month <= $${idx}::date`);
    params.push(filters.dateTo);
    idx++;
  }
  if (filters.facility) {
    conditions.push(`facility_name = $${idx}`);
    params.push(filters.facility);
    idx++;
  }
  if (filters.specialty) {
    conditions.push(`specialty = $${idx}`);
    params.push(filters.specialty);
    idx++;
  }
  if (filters.gender) {
    conditions.push(`gender = $${idx}`);
    params.push(filters.gender);
    idx++;
  }
  if (filters.ageGroup) {
    conditions.push(`age_group = $${idx}`);
    params.push(filters.ageGroup);
    idx++;
  }

  return { conditions, params };
}

// ── Monthly Consult Summary Queries ──

export async function getConsultSummary(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  const rows = await dwQuery<{
    total_consults: string;
    unique_patients: string;
    walkins: string;
    followups: string;
  }>(
    `SELECT
       SUM(total_consults) as total_consults,
       SUM(unique_patients) as unique_patients,
       SUM(walkins) as walkins,
       SUM(followups) as followups
     FROM habit_intelligence.dv_monthly_consult_summary
     WHERE ${where}`,
    params
  );

  return rows[0] || { total_consults: "0", unique_patients: "0", walkins: "0", followups: "0" };
}

export async function getConsultTrends(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       TO_CHAR(month, 'YYYY-MM') as month,
       SUM(total_consults) as total_consults,
       SUM(unique_patients) as unique_patients,
       SUM(walkins) as walkins,
       SUM(followups) as followups
     FROM habit_intelligence.dv_monthly_consult_summary
     WHERE ${where}
     GROUP BY month
     ORDER BY month`,
    params
  );
}

export async function getSpecialtyBreakdown(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       specialty as name,
       SUM(total_consults) as value
     FROM habit_intelligence.dv_monthly_consult_summary
     WHERE ${where} AND specialty IS NOT NULL
     GROUP BY specialty
     ORDER BY value DESC`,
    params
  );
}

export async function getFacilityBreakdown(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       facility_name as facility,
       specialty,
       SUM(total_consults) as total_consults
     FROM habit_intelligence.dv_monthly_consult_summary
     WHERE ${where} AND facility_name IS NOT NULL
     GROUP BY facility_name, specialty
     ORDER BY total_consults DESC`,
    params
  );
}

export async function getStatusBreakdown(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       status,
       SUM(total_consults) as total_consults
     FROM habit_intelligence.dv_monthly_consult_summary
     WHERE ${where} AND status IS NOT NULL
     GROUP BY status
     ORDER BY total_consults DESC`,
    params
  );
}

// ── Demographic Queries ──

export async function getDemographicBreakdown(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       gender,
       age_group,
       SUM(total_consults) as total_consults,
       SUM(unique_patients) as unique_patients
     FROM habit_intelligence.dv_demographic_consult
     WHERE ${where}
     GROUP BY gender, age_group
     ORDER BY gender, age_group`,
    params
  );
}

// ── Referral Queries ──

export async function getReferralSummary(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  const rows = await dwQuery<{
    total_referrals: string;
    unique_patients: string;
  }>(
    `SELECT
       SUM(total_referrals) as total_referrals,
       SUM(unique_patients) as unique_patients
     FROM habit_intelligence.dv_referral_summary
     WHERE ${where}`,
    params
  );

  return rows[0] || { total_referrals: "0", unique_patients: "0" };
}

export async function getReferralTrends(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       TO_CHAR(month, 'YYYY-MM') as month,
       SUM(total_referrals) as total_referrals,
       SUM(unique_patients) as unique_patients
     FROM habit_intelligence.dv_referral_summary
     WHERE ${where}
     GROUP BY month
     ORDER BY month`,
    params
  );
}

export async function getReferralSpecialties(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       referring_specialty,
       referred_to_specialty,
       SUM(total_referrals) as total_referrals
     FROM habit_intelligence.dv_referral_summary
     WHERE ${where} AND referring_specialty IS NOT NULL
     GROUP BY referring_specialty, referred_to_specialty
     ORDER BY total_referrals DESC
     LIMIT 20`,
    params
  );
}

// ── Diagnosis Queries ──

export async function getDiagnosisSummary(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       diagnosis_text as name,
       SUM(total_diagnoses) as value,
       SUM(unique_patients) as unique_patients
     FROM habit_intelligence.dv_diagnosis_summary
     WHERE ${where} AND diagnosis_text IS NOT NULL
     GROUP BY diagnosis_text
     ORDER BY value DESC
     LIMIT 30`,
    params
  );
}

export async function getDiagnosisTrends(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       TO_CHAR(month, 'YYYY-MM') as month,
       diagnosis_text,
       SUM(total_diagnoses) as total_diagnoses
     FROM habit_intelligence.dv_diagnosis_summary
     WHERE ${where} AND diagnosis_text IS NOT NULL
     GROUP BY month, diagnosis_text
     ORDER BY month`,
    params
  );
}

// ── Vitals Queries ──

export async function getVitalsSummary(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       vital_parameter_name,
       range_category,
       SUM(total_readings) as total_readings,
       ROUND(AVG(avg_value)::numeric, 2) as avg_value
     FROM habit_intelligence.dv_vitals_summary
     WHERE ${where} AND vital_parameter_name IS NOT NULL
     GROUP BY vital_parameter_name, range_category
     ORDER BY vital_parameter_name, range_category`,
    params
  );
}

// ── Repeat Visit Queries ──

export async function getRepeatVisitAnalysis(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       TO_CHAR(month, 'YYYY-MM') as month,
       total_patients,
       repeat_patients,
       ROUND((repeat_patients::numeric / NULLIF(total_patients, 0) * 100), 1) as repeat_rate
     FROM habit_intelligence.dv_repeat_visit_analysis
     WHERE ${where}
     ORDER BY month`,
    params
  );
}

// ── Peak Hours (Daily Consult Summary) ──

export async function getPeakHours(filters: DashboardFilters) {
  const { conditions, params } = buildFilters(filters);
  const where = conditions.join(" AND ");

  return dwQuery(
    `SELECT
       hour_of_day,
       day_of_week,
       SUM(total_consults) as total_consults
     FROM habit_intelligence.dv_daily_consult_summary
     WHERE ${where}
     GROUP BY hour_of_day, day_of_week
     ORDER BY day_of_week, hour_of_day`,
    params
  );
}

// ── Generic Metric Query Router ──

export async function queryMetric(metricKey: string, filters: DashboardFilters) {
  switch (metricKey) {
    // KPI metrics
    case "ohc_total_consults":
    case "ohc_unique_patients":
    case "ohc_repeat_rate": {
      const summary = await getConsultSummary(filters);
      const repeatData = await getRepeatVisitAnalysis(filters);
      const lastMonth = repeatData[repeatData.length - 1];
      return {
        totalConsults: Number(summary.total_consults),
        uniquePatients: Number(summary.unique_patients),
        walkins: Number(summary.walkins),
        followups: Number(summary.followups),
        repeatRate: lastMonth ? Number(lastMonth.repeat_rate) : 0,
      };
    }

    // Trend charts
    case "ohc_visit_trends":
      return getConsultTrends(filters);

    case "ohc_specialty_treemap":
      return getSpecialtyBreakdown(filters);

    case "ohc_location_bar":
      return getFacilityBreakdown(filters);

    case "ohc_demographic_sunburst":
      return getDemographicBreakdown(filters);

    case "ohc_peak_hours":
      return getPeakHours(filters);

    case "ohc_status_pie":
      return getStatusBreakdown(filters);

    case "ohc_repeat_trends":
      return getRepeatVisitAnalysis(filters);

    // Referral metrics
    case "ref_total_referrals": {
      return getReferralSummary(filters);
    }
    case "ref_referral_trends":
      return getReferralTrends(filters);
    case "ref_specialty_flow":
      return getReferralSpecialties(filters);

    // Health insights
    case "hi_disease_treemap":
      return getDiagnosisSummary(filters);
    case "hi_disease_trends":
      return getDiagnosisTrends(filters);
    case "hi_vitals_distribution":
      return getVitalsSummary(filters);

    default:
      throw new Error(`Unknown metric: ${metricKey}`);
  }
}
