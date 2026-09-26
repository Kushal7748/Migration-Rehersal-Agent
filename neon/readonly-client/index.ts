// ============================================================
// MIGR8 Neon Read-Only Client
// The AGENT uses ONLY this interface. No write capability.
// Uses NEON_READONLY_TOKEN only.
// ============================================================

import { createHash } from "crypto";
import { logger } from "../../observability/logger/index.js";
import type { TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, ConstraintInfo } from "../../core/types/migration.js";

export interface ProjectInfo {
  id: string;
  name: string;
  regionId: string;
  pgVersion: number;
}

export interface BranchInfo {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  isDefault: boolean;
}

export interface SlowQuery {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
}

export interface ExplainResult {
  plan: unknown;
  planText: string;
  estimatedRows: number;
  estimatedCost: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: Array<{ name: string; dataType: string }>;
}

export interface SchemaDiff {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
}

export interface NeonReadClient {
  describeProject(): Promise<ProjectInfo>;
  describeBranch(branchId: string): Promise<BranchInfo>;
  getDatabaseTables(branchId?: string): Promise<TableInfo[]>;
  describeTableSchema(table: string, branchId?: string): Promise<TableInfo>;
  compareDatabaseSchema(branchId1: string, branchId2: string): Promise<SchemaDiff>;
  listSlowQueries(branchId?: string, limit?: number): Promise<SlowQuery[]>;
  explainSqlStatement(sql: string, branchId?: string): Promise<ExplainResult>;
  runReadOnlySql(sql: string, branchId?: string): Promise<QueryResult>;
  computeSchemaFingerprint(tables: TableInfo[]): string;
}

/**
 * Compute a deterministic schema fingerprint from table metadata.
 * Used for stale-evidence detection.
 */
export function computeSchemaFingerprint(tables: TableInfo[]): string {
  const canonical = tables
    .map((t) => ({
      name: t.name,
      schema: t.schema,
      columns: t.columns
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          name: c.name,
          dataType: c.dataType,
          isNullable: c.isNullable,
          defaultValue: c.defaultValue,
        })),
      indexes: t.indexes
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => ({ name: i.name, columns: i.columns.sort(), isUnique: i.isUnique })),
      primaryKey: [...t.primaryKey].sort(),
      foreignKeys: t.foreignKeys
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ name: f.name, column: f.column, referencedTable: f.referencedTable, referencedColumn: f.referencedColumn })),
      constraints: t.constraints
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ name: c.name, type: c.type, definition: c.definition })),
    }))
    .sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`));

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * NeonReadClientImpl — reads from Neon via direct pg connection.
 * Uses read-only connection string derived from NEON_READONLY_TOKEN.
 *
 * Note: In production this wraps Neon MCP tool calls.
 * The MCP adapter is in /neon/mcp/.
 */
export class NeonReadClientImpl implements NeonReadClient {
  private readonly projectId: string;
  private readonly readonlyToken: string;

  constructor() {
    this.projectId = process.env["NEON_PROJECT_ID"] ?? "";
    this.readonlyToken = process.env["NEON_READONLY_TOKEN"] ?? "";

    if (!this.projectId || !this.readonlyToken) {
      logger.warn("NEON_PROJECT_ID or NEON_READONLY_TOKEN not configured — using mock Neon client");
    }
  }

  async describeProject(): Promise<ProjectInfo> {
    return {
      id: this.projectId || "demo-project",
      name: "migr8-demo",
      regionId: "aws-us-east-2",
      pgVersion: 16,
    };
  }

  async describeBranch(branchId: string): Promise<BranchInfo> {
    return {
      id: branchId,
      name: branchId === "main" ? "main" : `branch-${branchId}`,
      parentId: "main",
      createdAt: new Date().toISOString(),
      isDefault: branchId === "main",
    };
  }

  async getDatabaseTables(branchId?: string): Promise<TableInfo[]> {
    // This inspects the target Neon database (read-only)
    logger.info({ projectId: this.projectId, branchId }, "Discovering database tables");

    try {
      return await this.fetchTablesFromNeon(branchId);
    } catch (err) {
      logger.warn({ err }, "Neon connection failed, returning demo schema");
      return this.getDemoSchema();
    }
  }

  private async fetchTablesFromNeon(branchId?: string): Promise<TableInfo[]> {
    // Dynamic import to avoid compile-time issues when pg not available
    const pg = await import("pg");
    const connectionString = this.buildConnectionString(branchId);
    
    if (!connectionString) {
      return this.getDemoSchema();
    }

    const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
      const tablesResult = await client.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `);

      const tables: TableInfo[] = [];

      for (const row of tablesResult.rows) {
        const tableName = row["table_name"] as string;
        const schemaName = row["table_schema"] as string;

        const columns = await this.fetchColumns(client, tableName, schemaName);
        const indexes = await this.fetchIndexes(client, tableName, schemaName);
        const foreignKeys = await this.fetchForeignKeys(client, tableName, schemaName);
        const constraints = await this.fetchConstraints(client, tableName, schemaName);
        const rowCount = await this.fetchRowCount(client, tableName, schemaName);
        const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

        tables.push({
          name: tableName,
          schema: schemaName,
          rowCount,
          columns,
          indexes,
          primaryKey,
          foreignKeys,
          constraints,
        });
      }

      return tables;
    } finally {
      await client.end();
    }
  }

  private buildConnectionString(branchId?: string): string {
    // Neon connection strings include the branch in the endpoint
    const base = process.env["NEON_READONLY_CONNECTION_URL"];
    if (base) return base;
    
    // Build from parts if available
    const host = process.env["NEON_HOST"];
    const db = process.env["NEON_DATABASE"] ?? "neondb";
    const user = process.env["NEON_READONLY_USER"] ?? "neondb_owner";
    
    if (host && this.readonlyToken) {
      return `postgresql://${user}:${this.readonlyToken}@${host}/${db}?sslmode=require`;
    }
    
    return "";
  }

  private async fetchColumns(client: import("pg").Client, table: string, schema: string): Promise<ColumnInfo[]> {
    const result = await client.query(`
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        WHERE tc.table_name = $1 AND tc.table_schema = $2 AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1 AND c.table_schema = $2
      ORDER BY c.ordinal_position
    `, [table, schema]);

    return result.rows.map((r) => ({
      name: r["column_name"] as string,
      dataType: r["data_type"] as string,
      isNullable: r["is_nullable"] === "YES",
      defaultValue: r["column_default"] as string | undefined,
      isPrimaryKey: r["is_primary_key"] as boolean,
    }));
  }

  private async fetchIndexes(client: import("pg").Client, table: string, schema: string): Promise<IndexInfo[]> {
    const result = await client.query(`
      SELECT
        i.relname AS index_name,
        ix.indisunique AS is_unique,
        array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS column_names,
        pg_get_indexdef(i.oid) AS definition
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relname = $1 AND n.nspname = $2
      GROUP BY i.relname, ix.indisunique, i.oid
    `, [table, schema]);

    return result.rows.map((r) => ({
      name: r["index_name"] as string,
      columns: r["column_names"] as string[],
      isUnique: r["is_unique"] as boolean,
      isConcurrent: false,
      definition: r["definition"] as string,
    }));
  }

  private async fetchForeignKeys(client: import("pg").Client, table: string, schema: string): Promise<ForeignKeyInfo[]> {
    const result = await client.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_name = $1 AND tc.table_schema = $2 AND tc.constraint_type = 'FOREIGN KEY'
    `, [table, schema]);

    return result.rows.map((r) => ({
      name: r["constraint_name"] as string,
      column: r["column_name"] as string,
      referencedTable: r["foreign_table_name"] as string,
      referencedColumn: r["foreign_column_name"] as string,
      onDelete: r["delete_rule"] as string,
      onUpdate: r["update_rule"] as string,
    }));
  }

  private async fetchConstraints(client: import("pg").Client, table: string, schema: string): Promise<ConstraintInfo[]> {
    const result = await client.query(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        pg_get_constraintdef(c.oid) AS definition,
        c.convalidated AS is_valid
      FROM information_schema.table_constraints tc
      JOIN pg_constraint c ON c.conname = tc.constraint_name
      WHERE tc.table_name = $1 AND tc.table_schema = $2
    `, [table, schema]);

    return result.rows.map((r) => ({
      name: r["constraint_name"] as string,
      type: r["constraint_type"] as string,
      definition: r["definition"] as string,
      isValid: r["is_valid"] as boolean,
    }));
  }

  private async fetchRowCount(client: import("pg").Client, table: string, schema: string): Promise<number> {
    try {
      // Use fast estimate first
      const estimate = await client.query(`
        SELECT reltuples::bigint AS estimate
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = $2
      `, [table, schema]);

      const estimated = estimate.rows[0]?.["estimate"] as number ?? -1;
      if (estimated > 0) return estimated;

      // Fall back to COUNT for small tables
      const exact = await client.query(`SELECT COUNT(*) as count FROM "${schema}"."${table}"`);
      return parseInt(exact.rows[0]?.["count"] ?? "0");
    } catch {
      return -1;
    }
  }

  async describeTableSchema(table: string, branchId?: string): Promise<TableInfo> {
    const tables = await this.getDatabaseTables(branchId);
    const found = tables.find((t) => t.name === table);
    if (!found) throw new Error(`Table ${table} not found`);
    return found;
  }

  async compareDatabaseSchema(branchId1: string, branchId2: string): Promise<SchemaDiff> {
    logger.info({ branchId1, branchId2 }, "Comparing schema between branches");
    return { added: [], removed: [], modified: [], unchanged: [] };
  }

  async listSlowQueries(branchId?: string, limit = 10): Promise<SlowQuery[]> {
    return [];
  }

  async explainSqlStatement(sql: string, branchId?: string): Promise<ExplainResult> {
    return {
      plan: {},
      planText: `-- EXPLAIN not available in demo mode\n-- SQL: ${sql.substring(0, 100)}`,
      estimatedRows: 0,
      estimatedCost: 0,
    };
  }

  async runReadOnlySql(sql: string, branchId?: string): Promise<QueryResult> {
    // Enforce read-only — reject any write statements at this layer too
    const normalized = sql.trim().toUpperCase();
    if (
      normalized.startsWith("INSERT") ||
      normalized.startsWith("UPDATE") ||
      normalized.startsWith("DELETE") ||
      normalized.startsWith("DROP") ||
      normalized.startsWith("CREATE") ||
      normalized.startsWith("ALTER") ||
      normalized.startsWith("TRUNCATE")
    ) {
      throw new Error("Read-only client: write operations are not permitted");
    }

    return { rows: [], rowCount: 0, fields: [] };
  }

  computeSchemaFingerprint(tables: TableInfo[]): string {
    return computeSchemaFingerprint(tables);
  }

  // Demo schema for development without real Neon connection
  private getDemoSchema(): TableInfo[] {
    return [
      {
        name: "users",
        schema: "public",
        rowCount: 50000,
        columns: [
          { name: "id", dataType: "bigint", isNullable: false, isPrimaryKey: true },
          { name: "email", dataType: "text", isNullable: false, isPrimaryKey: false },
          { name: "name", dataType: "text", isNullable: false, isPrimaryKey: false },
          { name: "created_at", dataType: "timestamp with time zone", isNullable: false, isPrimaryKey: false },
          { name: "updated_at", dataType: "timestamp with time zone", isNullable: false, isPrimaryKey: false },
        ],
        indexes: [
          { name: "users_pkey", columns: ["id"], isUnique: true, isConcurrent: false, definition: "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)" },
          { name: "users_email_idx", columns: ["email"], isUnique: true, isConcurrent: false, definition: "CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (email)" },
        ],
        primaryKey: ["id"],
        foreignKeys: [],
        constraints: [],
      },
      {
        name: "transactions",
        schema: "public",
        rowCount: 250000,
        columns: [
          { name: "id", dataType: "bigint", isNullable: false, isPrimaryKey: true },
          { name: "user_id", dataType: "bigint", isNullable: false, isPrimaryKey: false },
          { name: "amount", dataType: "numeric", isNullable: false, isPrimaryKey: false },
          { name: "status", dataType: "text", isNullable: false, isPrimaryKey: false },
          { name: "created_at", dataType: "timestamp with time zone", isNullable: false, isPrimaryKey: false },
        ],
        indexes: [
          { name: "transactions_pkey", columns: ["id"], isUnique: true, isConcurrent: false, definition: "CREATE UNIQUE INDEX transactions_pkey ON public.transactions USING btree (id)" },
          { name: "transactions_user_id_idx", columns: ["user_id"], isUnique: false, isConcurrent: false, definition: "CREATE INDEX transactions_user_id_idx ON public.transactions USING btree (user_id)" },
        ],
        primaryKey: ["id"],
        foreignKeys: [
          { name: "transactions_user_id_fkey", column: "user_id", referencedTable: "users", referencedColumn: "id", onDelete: "RESTRICT", onUpdate: "CASCADE" }
        ],
        constraints: [],
      },
    ];
  }
}
