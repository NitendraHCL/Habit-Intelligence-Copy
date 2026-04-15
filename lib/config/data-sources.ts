// ── Data Source Whitelist ──
// The registry is mutable at runtime: both server-side (Prisma loader) and
// client-side (SWR-fetched via <DataSourceRegistryProvider>) can replace the
// entire map by calling `replaceRegistry()`. The hardcoded entries below are
// a bootstrap default used until the DB-backed loader runs.

import type { DataSourceEntry } from "@/lib/dashboard/types";

const DEFAULTS: Record<string, DataSourceEntry> = {
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

// ── Runtime registry ──
// Mutable because both the server-side DB loader and the client-side SWR
// provider can swap the entire map at runtime. All helpers read from this.
let registry: Record<string, DataSourceEntry> = { ...DEFAULTS };

/** Replace the entire in-memory registry. Called by the DB loader on the
 * server and by <DataSourceRegistryProvider> on the client. */
export function replaceRegistry(next: Record<string, DataSourceEntry>) {
  registry = next;
}

/** Get a snapshot of the current registry. Used by the admin API to serve
 * it to the client. */
export function getRegistrySnapshot(): Record<string, DataSourceEntry> {
  return { ...registry };
}

/** `dataSources` is exposed as a proxy so existing synchronous callers
 * (getDataSource, isTableAllowed, getGroupableColumns, ...) continue to
 * work unchanged after a registry swap. */
export const dataSources = new Proxy({} as Record<string, DataSourceEntry>, {
  get(_t, key) {
    return typeof key === "string" ? registry[key] : undefined;
  },
  has(_t, key) {
    return typeof key === "string" && key in registry;
  },
  ownKeys() {
    return Object.keys(registry);
  },
  getOwnPropertyDescriptor(_t, key) {
    if (typeof key !== "string") return undefined;
    const desc = Object.getOwnPropertyDescriptor(registry, key);
    if (desc) desc.enumerable = true;
    return desc;
  },
});

// ── Helpers ──

export function getDataSource(table: string): DataSourceEntry | undefined {
  return registry[table];
}

export function isTableAllowed(table: string): boolean {
  return table in registry;
}

export function isColumnAllowed(table: string, column: string): boolean {
  const ds = registry[table];
  return ds != null && column in ds.columns;
}

export function getGroupableColumns(table: string) {
  const ds = registry[table];
  if (!ds) return [];
  return Object.entries(ds.columns)
    .filter(([, col]) => col.groupable)
    .map(([key, col]) => ({ key, ...col }));
}

export function getAggregatableColumns(table: string) {
  const ds = registry[table];
  if (!ds) return [];
  return Object.entries(ds.columns)
    .filter(([, col]) => col.aggregatable)
    .map(([key, col]) => ({ key, ...col }));
}

export function getFilterableColumns(table: string) {
  const ds = registry[table];
  if (!ds) return [];
  return Object.entries(ds.columns)
    .filter(([, col]) => col.filterable)
    .map(([key, col]) => ({ key, ...col }));
}

export function getJoinableTablesFor(table: string) {
  const ds = registry[table];
  if (!ds?.joins) return [];
  return Object.entries(ds.joins).map(([foreignTable, rel]) => ({
    table: foreignTable,
    label: registry[foreignTable]?.label ?? foreignTable,
    localColumn: rel.localColumn,
    foreignColumn: rel.foreignColumn,
    type: rel.type,
  }));
}

export function getColumnsForJoinedTable(table: string) {
  const ds = registry[table];
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
  return Object.entries(registry).map(([table, ds]) => ({
    value: table,
    label: ds.label,
  }));
}
