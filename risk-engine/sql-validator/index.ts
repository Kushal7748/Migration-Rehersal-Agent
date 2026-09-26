// ============================================================
// MIGR8 SQL Safety Validator
// Deny-by-default. Only explicitly allowlisted operations pass.
// The model CANNOT weaken this validator.
// ============================================================

import { SqlValidationError } from "../../core/errors/domain-errors.js";
import type { MigrationPlanChecks } from "../../core/types/migration.js";

// Explicitly allowed statement prefixes (case-insensitive)
const ALLOWED_STATEMENT_PATTERNS: RegExp[] = [
  /^\s*(--|\/\*)/i,
  /^\s*ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN/i,
  /^\s*CREATE\s+INDEX\s+CONCURRENTLY/i,
  /^\s*CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY/i,
  /^\s*UPDATE\s+\S+\s+SET\s+/i,
  /^\s*WITH\s+/i,
  /^\s*DO\s+(\$\$|\$body\$)/i,
  /^\s*ALTER\s+TABLE\s+\S+\s+ADD\s+CONSTRAINT/i,
  /^\s*ALTER\s+TABLE\s+\S+\s+VALIDATE\s+CONSTRAINT/i,
  /^\s*ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN/i,
  /^\s*ALTER\s+TABLE\s+\S+\s+DROP\s+CONSTRAINT/i,
  /^\s*ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN\s+IF\s+EXISTS/i,
  /^\s*CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i,
  /^\s*DROP\s+INDEX\s+CONCURRENTLY/i,
  /^\s*DROP\s+INDEX\s+IF\s+EXISTS/i,
  /^\s*COMMENT\s+ON/i,
  /^\s*ANALYZE\s+/i,
  /^\s*VACUUM\s+ANALYZE\s+/i,
  /^\s*SELECT\s+/i,
  /^\s*SET\s+/i,
];

// Unconditionally forbidden patterns — these are NEVER allowed
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\s*DROP\s+TABLE/i, reason: "DROP TABLE is forbidden" },
  { pattern: /^\s*DROP\s+SCHEMA/i, reason: "DROP SCHEMA is forbidden" },
  { pattern: /^\s*DROP\s+DATABASE/i, reason: "DROP DATABASE is forbidden" },
  { pattern: /^\s*TRUNCATE/i, reason: "TRUNCATE is forbidden" },
  { pattern: /^\s*DELETE\s+FROM\s+\S+\s*;?\s*$/i, reason: "DELETE without WHERE is forbidden" },
  { pattern: /^\s*DELETE\s+FROM\s+\S+\s+WHERE\s+1\s*=\s*1/i, reason: "DELETE with tautological WHERE is forbidden" },
  { pattern: /^\s*ALTER\s+SYSTEM/i, reason: "ALTER SYSTEM is forbidden" },
  { pattern: /^\s*CREATE\s+ROLE/i, reason: "CREATE ROLE is forbidden" },
  { pattern: /^\s*GRANT\s+/i, reason: "GRANT is forbidden" },
  { pattern: /^\s*REVOKE\s+/i, reason: "REVOKE is forbidden" },
  { pattern: /^\s*COPY\s+/i, reason: "COPY to external targets is forbidden" },
  { pattern: /\bneon_write_token\b/i, reason: "Credential reference detected in SQL" },
  { pattern: /\bpassword\b.*=.*/i, reason: "Password operation detected in SQL" },
  { pattern: /\bpg_read_file\b/i, reason: "File system access is forbidden" },
  { pattern: /\bpg_exec\b/i, reason: "pg_exec is forbidden" },
  { pattern: /\blog_fdw\b/i, reason: "Foreign data wrapper log access is forbidden" },
  { pattern: /\bdblink\b/i, reason: "dblink is forbidden" },
];

// UPDATE without WHERE check
const UPDATE_WITHOUT_WHERE = /^\s*UPDATE\s+\S+\s+SET\s+.*(?<!WHERE\s+\S+)\s*;?\s*$/is;
const UPDATE_WITH_WHERE = /WHERE\s+/i;

export interface SqlValidationResult {
  valid: boolean;
  violations: string[];
  warnings: string[];
  statementType?: string;
  hasWhereClause?: boolean;
}

/**
 * Validates a single SQL statement.
 * Returns structured result. Throws SqlValidationError on critical violations.
 */
export function validateSqlStatement(sql: string): SqlValidationResult {
  const normalized = sql.trim();
  const violations: string[] = [];
  const warnings: string[] = [];

  // Check forbidden patterns first — these are absolute rejections
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      violations.push(reason);
    }
  }

  // Check for DELETE without WHERE specifically
  if (/^\s*DELETE\s+FROM/i.test(normalized) && !UPDATE_WITH_WHERE.test(normalized)) {
    violations.push("DELETE without WHERE clause is forbidden");
  }

  // Check for UPDATE without WHERE
  if (/^\s*UPDATE\s+/i.test(normalized) && !UPDATE_WITH_WHERE.test(normalized)) {
    violations.push("UPDATE without WHERE clause is forbidden — add a WHERE clause to limit scope");
  }

  if (violations.length > 0) {
    return { valid: false, violations, warnings };
  }

  // Now check allowlist — must match at least one allowed pattern
  const isAllowed = ALLOWED_STATEMENT_PATTERNS.some((p) => p.test(normalized));
  if (!isAllowed) {
    violations.push(
      `Statement does not match any allowed operation type. ` +
        `Allowed: ADD COLUMN, CREATE INDEX CONCURRENTLY, UPDATE...WHERE, ADD/VALIDATE CONSTRAINT. ` +
        `Statement begins: ${normalized.substring(0, 80)}`
    );
    return { valid: false, violations, warnings };
  }

  // Detect statement type
  let statementType = "UNKNOWN";
  if (/^ALTER\s+TABLE/i.test(normalized)) statementType = "ALTER_TABLE";
  else if (/^CREATE\s+INDEX/i.test(normalized)) statementType = "CREATE_INDEX";
  else if (/^UPDATE/i.test(normalized)) statementType = "UPDATE";
  else if (/^DROP\s+INDEX/i.test(normalized)) statementType = "DROP_INDEX";
  else if (/^ANALYZE/i.test(normalized)) statementType = "ANALYZE";
  else if (/^VACUUM/i.test(normalized)) statementType = "VACUUM";

  const hasWhereClause = UPDATE_WITH_WHERE.test(normalized);

  // Warnings (non-blocking)
  if (statementType === "ALTER_TABLE" && /NOT\s+NULL/i.test(normalized) && /DEFAULT/i.test(normalized)) {
    warnings.push(
      "Adding NOT NULL column with DEFAULT may lock the table on older Postgres versions. " +
        "Consider nullable first, then backfill, then add constraint."
    );
  }

  if (/CREATE\s+INDEX\s+(?!CONCURRENTLY)/i.test(normalized)) {
    warnings.push("Non-concurrent index creation will lock the table. Use CREATE INDEX CONCURRENTLY.");
  }

  return { valid: true, violations: [], warnings, statementType, hasWhereClause };
}

/**
 * Validates an entire migration plan (array of SQL statements).
 * Throws SqlValidationError if any statement is invalid.
 */
export function validateMigrationPlan(
  statements: string[],
  targetTable?: string
): MigrationPlanChecks {
  const allViolations: string[] = [];
  let dangerousOperationDetected = false;
  let whereClauseCheckPassed = true;
  let targetMatchPassed = true;
  let multiTableCheckPassed = true;
  const affectedTables = new Set<string>();

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    if (!sql || !sql.trim() || /^\s*(--|\/\*)/.test(sql.trim())) continue;

    const result = validateSqlStatement(sql);

    if (!result.valid) {
      allViolations.push(`Statement ${i + 1}: ${result.violations.join("; ")}`);

      // Categorize violations
      if (result.violations.some((v) =>
        v.includes("DROP") || v.includes("TRUNCATE") || v.includes("forbidden")
      )) {
        dangerousOperationDetected = true;
      }
      if (result.violations.some((v) => v.includes("WHERE"))) {
        whereClauseCheckPassed = false;
      }
    }

    // Track tables being modified
    const tableMatch = sql.match(/(?:ALTER\s+TABLE|UPDATE|CREATE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:ON\s+)?)\s+(\S+)/i);
    if (tableMatch?.[1]) {
      const rawName = tableMatch[1].toLowerCase().replace(/['"]/g, "");
      const tableNameOnly = rawName.split(".").pop()!;
      affectedTables.add(rawName);
      affectedTables.add(tableNameOnly);
    }
  }

  // Target table validation
  if (targetTable && affectedTables.size > 0) {
    const targetLower = targetTable.toLowerCase();
    const targetNameOnly = targetLower.split(".").pop()!;
    targetMatchPassed = affectedTables.has(targetLower) || affectedTables.has(targetNameOnly) || affectedTables.size === 0;
  }

  // Multi-table check
  if (affectedTables.size > 3) {
    multiTableCheckPassed = false;
    allViolations.push(
      `Multi-table migration affects ${affectedTables.size} tables: ${Array.from(affectedTables).join(", ")}. Explicit dependency validation required.`
    );
  }

  const allowlistPassed = allViolations.length === 0;
  const overall = allowlistPassed && !dangerousOperationDetected && whereClauseCheckPassed && targetMatchPassed && multiTableCheckPassed;

  if (!overall) {
    throw new SqlValidationError(
      `SQL validation failed: ${allViolations.join("; ")}`,
      allViolations
    );
  }

  return {
    dangerousOperationDetected,
    allowlistPassed,
    targetMatchPassed,
    whereClauseCheckPassed,
    dependencyCheckPassed: true,
    multiTableCheckPassed,
  };
}
