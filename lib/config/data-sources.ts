// ── Data Source Whitelist ──
// Only tables and columns listed here can be queried by the no-code system.
// When a new aggregated table is added to the data warehouse, add it here.

import type { DataSourceEntry } from "@/lib/dashboard/types";

export const dataSources: Record<string, DataSourceEntry> = {
  "aggregated_table.agg_appointment": {
    label: "OHC Appointments",
    cugColumn: "cug_code_mapped",
    columns: {
      slotstarttime: {
        label: "Appointment Date",
        type: "timestamp",
        groupable: true,
        filterable: true,
      },
      uhid: {
        label: "Patient ID",
        type: "text",
        groupable: true,
        aggregatable: true,
        filterable: true,
      },
      facility_name: {
        label: "Location",
        type: "text",
        groupable: true,
        filterable: true,
      },
      speciality_name: {
        label: "Specialty",
        type: "text",
        groupable: true,
        filterable: true,
      },
      patient_gender: {
        label: "Gender",
        type: "text",
        groupable: true,
        filterable: true,
      },
      age_years: {
        label: "Age (Years)",
        type: "number",
        groupable: true,
        aggregatable: true,
        filterable: true,
      },
      relationship: {
        label: "Relationship",
        type: "text",
        groupable: true,
        filterable: true,
      },
      stage: {
        label: "Stage",
        type: "text",
        groupable: true,
        filterable: true,
      },
    },
    joins: {
      "aggregated_table.agg_referral": {
        foreignTable: "aggregated_table.agg_referral",
        localColumn: "uhid",
        foreignColumn: "uhid",
        type: "left",
      },
      "aggregated_table.stage_master": {
        foreignTable: "aggregated_table.stage_master",
        localColumn: "uhid",
        foreignColumn: "uhid",
        type: "left",
      },
    },
  },

  "aggregated_table.stage_master": {
    label: "Stage Trends",
    cugColumn: "cug_code_reg",
    columns: {
      slotstarttime: {
        label: "Appointment Date",
        type: "timestamp",
        groupable: true,
        filterable: true,
      },
      uhid: {
        label: "Patient ID",
        type: "text",
        groupable: true,
        aggregatable: true,
        filterable: true,
      },
      stage: {
        label: "Stage",
        type: "text",
        groupable: true,
        filterable: true,
      },
      facility_name: {
        label: "Location",
        type: "text",
        groupable: true,
        filterable: true,
      },
    },
    joins: {
      "aggregated_table.agg_appointment": {
        foreignTable: "aggregated_table.agg_appointment",
        localColumn: "uhid",
        foreignColumn: "uhid",
        type: "left",
      },
    },
  },

  "aggregated_table.agg_referral_kpi": {
    label: "OHC Referral KPIs (Pre-aggregated)",
    cugColumn: "cug_code_mapped",
    columns: {
      consult_month: {
        label: "Consult Month",
        type: "timestamp",
        groupable: true,
        filterable: true,
      },
      relationship: {
        label: "Relationship",
        type: "text",
        groupable: true,
        filterable: true,
      },
      facility_name: {
        label: "Location",
        type: "text",
        groupable: true,
        filterable: true,
      },
      referring_speciality: {
        label: "From Specialty",
        type: "text",
        groupable: true,
        filterable: true,
      },
      speciality_referred_to: {
        label: "To Specialty",
        type: "text",
        groupable: true,
        filterable: true,
      },
      patient_gender: {
        label: "Gender",
        type: "text",
        groupable: true,
        filterable: true,
      },
      age_group: {
        label: "Age Group",
        type: "text",
        groupable: true,
        filterable: true,
      },
      converted: {
        label: "Conversion Status",
        type: "text",
        groupable: true,
        filterable: true,
      },
      conversion_bucket: {
        label: "Conversion Bucket",
        type: "text",
        groupable: true,
        filterable: true,
      },
      referral_count: {
        label: "Referral Count",
        type: "number",
        aggregatable: true,
      },
      unique_patients: {
        label: "Unique Patients",
        type: "number",
        aggregatable: true,
      },
    },
  },

  "aggregated_table.agg_referral": {
    label: "OHC Referrals",
    cugColumn: "cug_code_mapped",
    columns: {
      referral_date: {
        label: "Referral Date",
        type: "timestamp",
        groupable: true,
        filterable: true,
      },
      uhid: {
        label: "Patient ID",
        type: "text",
        groupable: true,
        aggregatable: true,
        filterable: true,
      },
      from_specialty: {
        label: "From Specialty",
        type: "text",
        groupable: true,
        filterable: true,
      },
      to_specialty: {
        label: "To Specialty",
        type: "text",
        groupable: true,
        filterable: true,
      },
      facility_name: {
        label: "Location",
        type: "text",
        groupable: true,
        filterable: true,
      },
      patient_gender: {
        label: "Gender",
        type: "text",
        groupable: true,
        filterable: true,
      },
      age_years: {
        label: "Age (Years)",
        type: "number",
        groupable: true,
        aggregatable: true,
        filterable: true,
      },
      referral_status: {
        label: "Referral Status",
        type: "text",
        groupable: true,
        filterable: true,
      },
    },
    joins: {
      "aggregated_table.agg_appointment": {
        foreignTable: "aggregated_table.agg_appointment",
        localColumn: "uhid",
        foreignColumn: "uhid",
        type: "left",
      },
    },
  },
};

// ── Helpers ──

export function getDataSource(table: string): DataSourceEntry | undefined {
  return dataSources[table];
}

export function isTableAllowed(table: string): boolean {
  return table in dataSources;
}

export function isColumnAllowed(table: string, column: string): boolean {
  const ds = dataSources[table];
  return ds != null && column in ds.columns;
}

export function getGroupableColumns(table: string) {
  const ds = dataSources[table];
  if (!ds) return [];
  return Object.entries(ds.columns)
    .filter(([, col]) => col.groupable)
    .map(([key, col]) => ({ key, ...col }));
}

export function getAggregatableColumns(table: string) {
  const ds = dataSources[table];
  if (!ds) return [];
  return Object.entries(ds.columns)
    .filter(([, col]) => col.aggregatable)
    .map(([key, col]) => ({ key, ...col }));
}

export function getFilterableColumns(table: string) {
  const ds = dataSources[table];
  if (!ds) return [];
  return Object.entries(ds.columns)
    .filter(([, col]) => col.filterable)
    .map(([key, col]) => ({ key, ...col }));
}

export function getJoinableTablesFor(table: string) {
  const ds = dataSources[table];
  if (!ds?.joins) return [];
  return Object.entries(ds.joins).map(([foreignTable, rel]) => ({
    table: foreignTable,
    label: dataSources[foreignTable]?.label ?? foreignTable,
    localColumn: rel.localColumn,
    foreignColumn: rel.foreignColumn,
    type: rel.type,
  }));
}

export function getColumnsForJoinedTable(table: string) {
  const ds = dataSources[table];
  if (!ds) return [];
  const shortName = table.split(".").pop() ?? table;
  return Object.entries(ds.columns)
    .map(([key, col]) => ({
      ...col,
      key: `${shortName}.${key}`,
      rawKey: key,
      table,
      label: `${ds.label} > ${col.label}`,
    }));
}

export function getMergedColumns(primaryTable: string, joinedTables: string[]) {
  const primaryCols = getColumnsForJoinedTable(primaryTable);
  const joinedCols = joinedTables.flatMap((t) => getColumnsForJoinedTable(t));
  return [...primaryCols, ...joinedCols];
}

export function getAllDataSourceOptions() {
  return Object.entries(dataSources).map(([table, ds]) => ({
    value: table,
    label: ds.label,
  }));
}
