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
 * Optionally override `statement_timeout` per-query (milliseconds). The
 * override is scoped to the checked-out connection, not the whole pool.
 */
export async function dwQuery<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
  opts?: { statementTimeoutMs?: number }
): Promise<T[]> {
  if (!opts?.statementTimeoutMs) {
    const result = await dwPool.query(text, params);
    return result.rows as T[];
  }

  // Acquire a dedicated client so SET is local to this request and
  // doesn't leak to other queries sharing the pool.
  const client = await dwPool.connect();
  try {
    await client.query(`SET statement_timeout = ${Number(opts.statementTimeoutMs)}`);
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    try {
      // Restore the default on the connection before returning it to the pool.
      await client.query(`RESET statement_timeout`);
    } catch {
      // noop — if RESET fails, the pool will still work; idle sessions are
      // recycled periodically.
    }
    client.release();
  }
}
