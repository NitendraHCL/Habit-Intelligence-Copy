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

export function getAllDataSourceOptions() {
  return Object.entries(dataSources).map(([table, ds]) => ({
    value: table,
    label: ds.label,
  }));
}
