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
    // Fail fast when the pool is saturated or the warehouse is unreachable —
    // a 5s acquire ceiling prevents cascading 60s waits from blocking the UI.
    connectionTimeoutMillis: 5000,
    // Kill runaway queries fast so they release their pool slot.
    statement_timeout: 15000,
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
