import pg from "pg";

const { Pool } = pg;

const globalForPool = globalThis as unknown as {
  dwPool: pg.Pool | undefined;
};

function createPool() {
  return new Pool({
    connectionString: process.env.DATA_WAREHOUSE_URL,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 60000,
    statement_timeout: 120000,
    ssl: { rejectUnauthorized: false },
  });
}

export const dwPool = globalForPool.dwPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPool.dwPool = dwPool;
}

/**
 * Execute a query against the data warehouse (fact_kx / derived schemas).
 */
export async function dwQuery<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await dwPool.query(text, params);
  return result.rows as T[];
}
