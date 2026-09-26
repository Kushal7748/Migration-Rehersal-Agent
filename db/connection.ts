// ============================================================
// MIGR8 Database Connection — Control Plane PostgreSQL
// ============================================================

import pg from "pg";
import { logger } from "../observability/logger/index.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for control-plane database");
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err: Error) => {
      logger.error({ err }, "Unexpected error on idle client");
    });

    pool.on("connect", () => {
      logger.debug("New database connection established");
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const client = getPool();
  try {
    return await client.query<T>(sql, params);
  } catch (err) {
    logger.error({ err, sql: sql.substring(0, 100) }, "Database query error");
    throw err;
  }
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("Database pool closed");
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
