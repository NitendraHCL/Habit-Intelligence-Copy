// ── Generic Query Engine ──
// Builds parameterized SQL from chart definitions. Only whitelisted tables/columns
// are allowed. CUG filter is always injected from the session.

import { dwQuery } from "@/lib/db/data-warehouse";
import { dataSources } from "@/lib/config/data-sources";
import type {
  QueryRequest,
  QueryResponse,
  WhereCondition,
  TransformConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}

function validateTable(table: string) {
  const ds = dataSources[table];
  if (!ds) {
    throw new QueryValidationError(
      `Table "${table}" is not in the allowed data source list`
    );
  }
  return ds;
}

function validateColumn(table: string, column: string) {
  const ds = dataSources[table];
  if (!ds || !(column in ds.columns)) {
    throw new QueryValidationError(
      `Column "${column}" is not allowed on table "${table}"`
    );
  }
}

// ---------------------------------------------------------------------------
// Time function parser
// Converts "month(slotstarttime)" → SQL expression + alias
// ---------------------------------------------------------------------------

const TIME_FUNCTIONS: Record<
  string,
  { sql: (col: string) => string; alias: (col: string) => string }
> = {
  month: {
    sql: (col) => `TO_CHAR(${col}, 'YYYY-MM')`,
    alias: () => "period",
  },
  week: {
    sql: (col) => `TO_CHAR(${col}, 'IYYY-"W"IW')`,
    alias: () => "period",
  },
  year: {
    sql: (col) => `TO_CHAR(${col}, 'YYYY')`,
    alias: () => "period",
  },
  day: {
    sql: (col) => `TO_CHAR(${col}, 'YYYY-MM-DD')`,
    alias: () => "period",
  },
  dow: {
    sql: (col) => `EXTRACT(DOW FROM ${col})::int`,
    alias: () => "dow",
  },
  hour: {
    sql: (col) => `EXTRACT(HOUR FROM ${col})::int`,
    alias: () => "hour",
  },
  quarter: {
    sql: (col) => `TO_CHAR(${col}, 'YYYY-"Q"Q')`,
    alias: () => "period",
  },
};

interface ParsedGroupBy {
  sqlExpr: string;
  alias: string;
  rawColumn: string;
}

function parseGroupByExpr(
  table: string,
  expr: string
): ParsedGroupBy {
  const fnMatch = expr.match(/^(\w+)\((\w+)\)$/);
  if (fnMatch) {
    const [, fnName, colName] = fnMatch;
    const fn = TIME_FUNCTIONS[fnName];
    if (!fn) {
      throw new QueryValidationError(
        `Unknown time function "${fnName}". Supported: ${Object.keys(TIME_FUNCTIONS).join(", ")}`
      );
    }
    validateColumn(table, colName);
    return {
      sqlExpr: fn.sql(`a.${colName}`),
      alias: fn.alias(colName),
      rawColumn: colName,
    };
  }

  // Plain column reference
  validateColumn(table, expr);
  return { sqlExpr: `a.${expr}`, alias: expr, rawColumn: expr };
}

// ---------------------------------------------------------------------------
// Metric parser
// Converts "count_distinct:uhid" → SQL expression + alias
// ---------------------------------------------------------------------------

interface ParsedMetric {
  sqlExpr: string;
  alias: string;
}

function parseMetric(
  table: string,
  metric: string,
  aliasOverride?: string
): ParsedMetric {
  const alias = aliasOverride ?? "value";

  if (metric === "count") {
    return { sqlExpr: "COUNT(*)", alias };
  }

  const parts = metric.split(":");
  if (parts.length !== 2) {
    throw new QueryValidationError(
      `Invalid metric format "${metric}". Use "count", "sum:column", "avg:column", etc.`
    );
  }

  const [fn, col] = parts;
  validateColumn(table, col);

  switch (fn) {
    case "count_distinct":
      return { sqlExpr: `COUNT(DISTINCT a.${col})`, alias };
    case "sum":
      return { sqlExpr: `SUM(a.${col})`, alias };
    case "avg":
      return { sqlExpr: `AVG(a.${col})`, alias };
    case "min":
      return { sqlExpr: `MIN(a.${col})`, alias };
    case "max":
      return { sqlExpr: `MAX(a.${col})`, alias };
    default:
      throw new QueryValidationError(
        `Unknown metric function "${fn}". Supported: count, count_distinct, sum, avg, min, max`
      );
  }
}

// ---------------------------------------------------------------------------
// WHERE clause builder
// ---------------------------------------------------------------------------

interface WhereClause {
  sql: string;
  params: unknown[];
}

function buildWhereCondition(
  table: string,
  column: string,
  condition: WhereCondition,
  paramIndex: number
): { sql: string; params: unknown[]; nextIndex: number } {
  validateColumn(table, column);
  const col = `a.${column}`;

  if ("eq" in condition) {
    return {
      sql: `${col} = $${paramIndex}`,
      params: [condition.eq],
      nextIndex: paramIndex + 1,
    };
  }
  if ("neq" in condition) {
    return {
      sql: `${col} != $${paramIndex}`,
      params: [condition.neq],
      nextIndex: paramIndex + 1,
    };
  }
  if ("in" in condition) {
    const placeholders = condition.in.map((_, i) => `$${paramIndex + i}`);
    return {
      sql: `${col} IN (${placeholders.join(", ")})`,
      params: [...condition.in],
      nextIndex: paramIndex + condition.in.length,
    };
  }
  if ("not_in" in condition) {
    const placeholders = condition.not_in.map((_, i) => `$${paramIndex + i}`);
    return {
      sql: `${col} NOT IN (${placeholders.join(", ")})`,
      params: [...condition.not_in],
      nextIndex: paramIndex + condition.not_in.length,
    };
  }
  if ("gte" in condition) {
    return {
      sql: `${col} >= $${paramIndex}`,
      params: [condition.gte],
      nextIndex: paramIndex + 1,
    };
  }
  if ("lte" in condition) {
    return {
      sql: `${col} <= $${paramIndex}`,
      params: [condition.lte],
      nextIndex: paramIndex + 1,
    };
  }
  if ("gt" in condition) {
    return {
      sql: `${col} > $${paramIndex}`,
      params: [condition.gt],
      nextIndex: paramIndex + 1,
    };
  }
  if ("lt" in condition) {
    return {
      sql: `${col} < $${paramIndex}`,
      params: [condition.lt],
      nextIndex: paramIndex + 1,
    };
  }
  if ("between" in condition) {
    return {
      sql: `${col} BETWEEN $${paramIndex} AND $${paramIndex + 1}`,
      params: [condition.between[0], condition.between[1]],
      nextIndex: paramIndex + 2,
    };
  }
  if ("is_null" in condition) {
    return {
      sql: condition.is_null ? `${col} IS NULL` : `${col} IS NOT NULL`,
      params: [],
      nextIndex: paramIndex,
    };
  }
  if ("like" in condition) {
    return {
      sql: `${col} ILIKE $${paramIndex}`,
      params: [condition.like],
      nextIndex: paramIndex + 1,
    };
  }

  throw new QueryValidationError(
    `Unknown where condition on column "${column}"`
  );
}

function buildWhereClauses(
  table: string,
  where: Record<string, WhereCondition> | undefined,
  startIndex: number
): WhereClause & { nextIndex: number } {
  if (!where || Object.keys(where).length === 0) {
    return { sql: "", params: [], nextIndex: startIndex };
  }

  const fragments: string[] = [];
  const allParams: unknown[] = [];
  let idx = startIndex;

  for (const [column, condition] of Object.entries(where)) {
    const result = buildWhereCondition(table, column, condition, idx);
    fragments.push(result.sql);
    allParams.push(...result.params);
    idx = result.nextIndex;
  }

  return {
    sql: fragments.map((f) => `AND ${f}`).join("\n      "),
    params: allParams,
    nextIndex: idx,
  };
}

// ---------------------------------------------------------------------------
// Filter → WHERE clause mapping
// ---------------------------------------------------------------------------

function buildFilterClauses(
  table: string,
  filters: QueryRequest["filters"],
  startIndex: number
): WhereClause & { nextIndex: number } {
  if (!filters) return { sql: "", params: [], nextIndex: startIndex };

  const ds = dataSources[table];
  if (!ds) return { sql: "", params: [], nextIndex: startIndex };

  const fragments: string[] = [];
  const allParams: unknown[] = [];
  let idx = startIndex;

  // Date range
  const dateCol = filters.dateColumn ?? findDateColumn(table);
  if (dateCol && filters.dateFrom) {
    fragments.push(`a.${dateCol} >= $${idx}::timestamp`);
    allParams.push(filters.dateFrom);
    idx++;
  }
  if (dateCol && filters.dateTo) {
    fragments.push(`a.${dateCol} <= $${idx}::timestamp`);
    allParams.push(filters.dateTo + "T23:59:59");
    idx++;
  }

  // Location filter
  if (filters.locations?.length && "facility_name" in ds.columns) {
    const placeholders = filters.locations.map((_, i) => `$${idx + i}`);
    fragments.push(`a.facility_name IN (${placeholders.join(", ")})`);
    allParams.push(...filters.locations);
    idx += filters.locations.length;
  }

  // Gender filter
  if (filters.genders?.length && "patient_gender" in ds.columns) {
    const placeholders = filters.genders.map((_, i) => `$${idx + i}`);
    fragments.push(`a.patient_gender IN (${placeholders.join(", ")})`);
    allParams.push(...filters.genders);
    idx += filters.genders.length;
  }

  // Age group filter
  if (filters.ageGroups?.length && "age_years" in ds.columns) {
    const ageClauses = filters.ageGroups.map((group) => {
      switch (group) {
        case "<20":
          return "a.age_years < 20";
        case "20-35":
          return "(a.age_years >= 20 AND a.age_years <= 35)";
        case "36-40":
          return "(a.age_years >= 36 AND a.age_years <= 40)";
        case "41-60":
          return "(a.age_years >= 41 AND a.age_years <= 60)";
        case "61+":
          return "a.age_years > 60";
        default:
          return null;
      }
    }).filter(Boolean);
    if (ageClauses.length) {
      fragments.push(`(${ageClauses.join(" OR ")})`);
    }
  }

  // Specialty filter
  if (filters.specialties?.length && "speciality_name" in ds.columns) {
    const placeholders = filters.specialties.map((_, i) => `$${idx + i}`);
    fragments.push(`a.speciality_name IN (${placeholders.join(", ")})`);
    allParams.push(...filters.specialties);
    idx += filters.specialties.length;
  }

  // Relationship filter
  if (filters.relationships?.length && "relationship" in ds.columns) {
    const placeholders = filters.relationships.map((_, i) => `$${idx + i}`);
    fragments.push(`a.relationship IN (${placeholders.join(", ")})`);
    allParams.push(...filters.relationships);
    idx += filters.relationships.length;
  }

  return {
    sql: fragments.length
      ? fragments.map((f) => `AND ${f}`).join("\n      ")
      : "",
    params: allParams,
    nextIndex: idx,
  };
}

function findDateColumn(table: string): string | null {
  const ds = dataSources[table];
  if (!ds) return null;
  for (const [col, def] of Object.entries(ds.columns)) {
    if (def.type === "timestamp") return col;
  }
  return null;
}

// ---------------------------------------------------------------------------
// SQL Builder — assembles the full query
// ---------------------------------------------------------------------------

interface BuiltQuery {
  sql: string;
  params: unknown[];
}

function buildSQL(
  request: QueryRequest,
  cugCode: string
): BuiltQuery {
  const { dataSource, transform, filters } = request;
  const table = dataSource.table;
  const ds = validateTable(table);

  // Parameter index (starts at 1 for the CUG code)
  let paramIdx = 2;
  const allParams: unknown[] = [cugCode];

  // -- SELECT clause --
  const selectParts: string[] = [];
  const groupByParts: string[] = [];

  // Group by columns
  const groupByExprs = transform.groupBy
    ? Array.isArray(transform.groupBy)
      ? transform.groupBy
      : [transform.groupBy]
    : [];

  for (const expr of groupByExprs) {
    const parsed = parseGroupByExpr(table, expr);
    selectParts.push(`${parsed.sqlExpr} AS ${parsed.alias}`);
    groupByParts.push(parsed.sqlExpr);
  }

  // Metrics
  if (transform.metrics?.length) {
    for (const m of transform.metrics) {
      const parsed = parseMetric(table, m.metric, m.key);
      selectParts.push(`${parsed.sqlExpr} AS ${parsed.alias}`);
    }
  } else if (transform.metric) {
    const parsed = parseMetric(table, transform.metric);
    selectParts.push(`${parsed.sqlExpr} AS ${parsed.alias}`);
  } else {
    // No metric specified — select raw count
    selectParts.push("COUNT(*) AS value");
  }

  // -- WHERE clauses --
  const chartWhere = buildWhereClauses(table, dataSource.where, paramIdx);
  paramIdx = chartWhere.nextIndex;
  allParams.push(...chartWhere.params);

  const filterWhere = buildFilterClauses(table, filters, paramIdx);
  paramIdx = filterWhere.nextIndex;
  allParams.push(...filterWhere.params);

  // -- ORDER BY --
  let orderBy = "";
  if (groupByExprs.length > 0) {
    if (transform.sort === "desc") {
      const metricAlias =
        transform.metrics?.length ? transform.metrics[0].key : "value";
      orderBy = `ORDER BY ${metricAlias} DESC`;
    } else if (transform.sort === "asc") {
      // Default sort by group key ascending (useful for time series)
      orderBy = `ORDER BY ${groupByParts[0]} ASC`;
    }
  }

  // -- LIMIT — hard cap to prevent browser crashes --
  const MAX_ROWS = 500;
  const sqlLimit = `LIMIT ${transform.limit ? Math.min(transform.limit, MAX_ROWS) : MAX_ROWS}`;

  // -- Build full SQL --
  const sql = `SELECT
      ${selectParts.join(",\n      ")}
    FROM ${table} a
    WHERE a.${ds.cugColumn} = $1
      ${chartWhere.sql}
      ${filterWhere.sql}
    ${groupByParts.length ? `GROUP BY ${groupByParts.join(", ")}` : ""}
    ${orderBy}
    ${sqlLimit}`.replace(/\n\s*\n/g, "\n");

  return { sql, params: allParams };
}

// ---------------------------------------------------------------------------
// Post-processing — limit + groupRest
// ---------------------------------------------------------------------------

function applyPostProcessing(
  rows: Record<string, unknown>[],
  transform: TransformConfig
): Record<string, unknown>[] {
  if (!transform.limit || !transform.groupBy) return rows;

  const limit = transform.limit;
  if (rows.length <= limit) return rows;

  const kept = rows.slice(0, limit);
  const rest = rows.slice(limit);

  if (transform.groupRest && rest.length > 0) {
    // Aggregate overflow into an "Others" bucket
    const groupByKey = Array.isArray(transform.groupBy)
      ? transform.groupBy[0]
      : transform.groupBy;
    // Determine alias from parsed expression
    const fnMatch = groupByKey.match(/^(\w+)\((\w+)\)$/);
    const alias = fnMatch
      ? TIME_FUNCTIONS[fnMatch[1]]?.alias(fnMatch[2]) ?? groupByKey
      : groupByKey;

    const othersRow: Record<string, unknown> = { [alias]: transform.groupRest };

    // Sum numeric columns from the rest
    for (const key of Object.keys(rest[0])) {
      if (key === alias) continue;
      const numericValues = rest
        .map((r) => Number(r[key]))
        .filter((n) => !isNaN(n));
      if (numericValues.length > 0) {
        othersRow[key] = numericValues.reduce((a, b) => a + b, 0);
      }
    }
    kept.push(othersRow);
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Public API — execute a query
// ---------------------------------------------------------------------------

export async function executeQuery(
  request: QueryRequest,
  cugCode: string
): Promise<QueryResponse> {
  const start = Date.now();
  const { sql, params } = buildSQL(request, cugCode);

  const rows = await dwQuery<Record<string, unknown>>(sql, params);

  // Cast numeric strings to numbers
  const castRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
        out[k] = Number(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  const processed = applyPostProcessing(castRows, request.transform);

  return {
    data: processed,
    meta: {
      rowCount: processed.length,
      executionMs: Date.now() - start,
      cached: false,
    },
  };
}

export { QueryValidationError };
