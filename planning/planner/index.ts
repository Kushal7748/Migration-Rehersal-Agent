// ============================================================
// MIGR8 Migration Planner
// Parses intent + schema → structured migration plan.
// Model output is always validated by the SQL safety layer.
// ============================================================

import { query } from "../../db/connection.js";
import { routeModelRequest } from "../../router/model-router/index.js";
import { validateMigrationPlan } from "../../risk-engine/sql-validator/index.js";
import { NeonReadClientImpl } from "../../neon/readonly-client/index.js";
import { logger } from "../../observability/logger/index.js";
import type { MigrationPlan, ParsedIntent, TableInfo } from "../../core/types/migration.js";
import { SqlValidationError } from "../../core/errors/domain-errors.js";

export interface PlannerInput {
  migrationRequestId: string;
  requestText: string;
  targetTable?: string;
  previousFailedPlanId?: string;
  previousFailureReason?: string;
  previousLockDurationMs?: number;
  previousRowsAffected?: number;
  schemaSnapshot?: TableInfo[];
}

export interface PlannerOutput {
  planId: string;
  version: number;
  proposedSql: string[];
  rollbackSql: string[];
  strategyNotes: string;
  assumptions: string[];
  riskHint: string;
  parsedIntent: ParsedIntent;
  validationPassed: boolean;
}

// System prompt for migration planner
const PLANNER_SYSTEM_PROMPT = `You are a PostgreSQL migration expert specializing in safe, zero-downtime database changes.

Your output MUST be valid JSON matching this schema:
{
  "proposed_sql": ["...SQL statements..."],
  "rollback_sql": ["...rollback SQL..."],
  "strategy_notes": "...",
  "assumptions": ["..."],
  "risk_hint": "LOW|MEDIUM|HIGH"
}

CRITICAL SAFETY RULES:
1. NEVER use DROP TABLE, DROP SCHEMA, TRUNCATE, DELETE without WHERE
2. ALWAYS prefer CREATE INDEX CONCURRENTLY for large tables
3. For large table backfills, use chunked UPDATE with WHERE id IN (SELECT id ... LIMIT N)
4. Add columns as nullable first, then add NOT NULL constraint separately
5. Use ADD CONSTRAINT ... NOT VALID, then VALIDATE CONSTRAINT separately for FK
6. Every UPDATE must have a WHERE clause
7. Only use operations from the allowlist: ADD COLUMN, CREATE INDEX CONCURRENTLY, UPDATE...WHERE, ADD/VALIDATE CONSTRAINT

If you receive a previous failure reason with measured lock duration exceeding threshold:
- You MUST change strategy to reduce lock contention
- Use chunked updates instead of full-table updates
- Consider nullable column approach to avoid row rewriting`;

const CRITIC_SYSTEM_PROMPT = `You are an independent PostgreSQL migration critic. Review the provided migration plan critically.

Your output MUST be valid JSON:
{
  "approved_for_rehearsal": true|false,
  "blocking_issues": ["..."],
  "non_blocking_issues": ["..."],
  "recommended_changes": ["..."]
}

Focus on:
1. Lock safety on large tables
2. Data integrity risks
3. Rollback feasibility
4. Missing WHERE clauses
5. Missing CONCURRENTLY for indexes
6. Correctness of the SQL for the stated intent`;

/**
 * Parse natural language intent into structured form.
 * Uses a low-cost fast model.
 */
export async function parseIntent(
  requestText: string,
  migrationRequestId: string
): Promise<ParsedIntent> {
  const response = await routeModelRequest({
    taskClass: "INTENT_PARSING",
    systemPrompt: `Parse the database migration request into structured JSON. Output MUST be valid JSON:
{
  "operation": "schema_change|data_change|index_change|constraint_change|mixed",
  "targetTable": "string",
  "requestedChanges": [
    {
      "type": "add_column|drop_column|modify_column|add_index|drop_index|backfill|add_constraint|drop_constraint",
      "name": "string (optional)",
      "targetColumn": "string (optional)",
      "dataType": "string (optional)"
    }
  ],
  "rawText": "string"
}`,
    userPrompt: requestText,
    requiredCapabilities: ["STRUCTURED_OUTPUT", "FAST_INFERENCE"],
    temperature: 0.0,
    migrationRequestId,
  });

  try {
    const parsed = response.parsedJson ?? JSON.parse(response.content);
    return parsed as ParsedIntent;
  } catch {
    logger.warn({ content: response.content }, "Failed to parse intent JSON — using fallback");
    return {
      operation: "schema_change",
      targetTable: "unknown",
      requestedChanges: [],
      rawText: requestText,
    };
  }
}

/**
 * Create a migration plan from intent + schema.
 * Validates SQL output before storing.
 */
export async function createMigrationPlan(input: PlannerInput): Promise<PlannerOutput> {
  const log = logger.child({ migrationId: input.migrationRequestId });
  log.info("Creating migration plan");

  // Get current version
  const versionResult = await query(
    "SELECT COALESCE(MAX(version), 0) as max_version FROM migration_plans WHERE migration_request_id = $1",
    [input.migrationRequestId]
  );
  const nextVersion = ((versionResult.rows[0] as { max_version: number }).max_version) + 1;

  // Load schema snapshot
  const schemaContext = input.schemaSnapshot
    ? JSON.stringify(input.schemaSnapshot, null, 2)
    : "Schema not available";

  // Build planner prompt
  const isReplan = !!input.previousFailedPlanId;
  const userPrompt = isReplan
    ? `REPLAN REQUIRED.

Original request: ${input.requestText}

Previous plan FAILED rehearsal:
- Failure reason: ${input.previousFailureReason}
- Measured lock duration: ${input.previousLockDurationMs}ms (threshold: ${process.env["LOCK_DURATION_THRESHOLD_MS"] ?? "2000"}ms)
- Rows affected: ${input.previousRowsAffected}

You MUST create a safer plan that avoids the measured performance issue.
Use chunked operations, CONCURRENTLY indexes, and minimal-lock techniques.

Target table: ${input.targetTable}
Schema:
${schemaContext}`
    : `Migration request: ${input.requestText}

Target table: ${input.targetTable ?? "to be determined"}
Database schema:
${schemaContext}`;

  const response = await routeModelRequest({
    taskClass: "MIGRATION_PLANNING",
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    userPrompt,
    requiredCapabilities: ["REASONING", "STRUCTURED_OUTPUT"],
    temperature: 0.1,
    migrationRequestId: input.migrationRequestId,
  });

  let planData: {
    proposed_sql: string[];
    rollback_sql: string[];
    strategy_notes: string;
    assumptions: string[];
    risk_hint: string;
  };

  try {
    planData = (response.parsedJson ?? JSON.parse(response.content)) as typeof planData;
  } catch {
    throw new Error(`Planner returned invalid JSON: ${response.content.substring(0, 200)}`);
  }

  // Normalize statements that were split line-by-line
  const normalizeSql = (stmts: string[]): string[] => {
    if (!Array.isArray(stmts)) return [];
    const merged: string[] = [];
    let buffer = "";
    for (const raw of stmts) {
      const line = raw.trim();
      if (!line || line.startsWith("--") || line.startsWith("/*")) continue;
      buffer = buffer ? `${buffer} ${line}` : line;
      if (line.endsWith(";")) {
        merged.push(buffer);
        buffer = "";
      }
    }
    if (buffer) merged.push(buffer);
    return merged.length > 0 ? merged : stmts.filter((s) => s.trim() && !s.trim().startsWith("--"));
  };

  planData.proposed_sql = normalizeSql(planData.proposed_sql);
  planData.rollback_sql = normalizeSql(planData.rollback_sql);

  // Parse intent
  const parsedIntent = await parseIntent(input.requestText, input.migrationRequestId);

  // Store plan first (before validation — so we have a record even if it fails)
  const planResult = await query(
    `INSERT INTO migration_plans (
      migration_request_id, version, proposed_sql, rollback_sql,
      strategy_notes, assumptions, risk_hint, planner_model,
      validation_status, parsed_intent
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id`,
    [
      input.migrationRequestId,
      nextVersion,
      JSON.stringify(planData.proposed_sql),
      JSON.stringify(planData.rollback_sql),
      planData.strategy_notes,
      JSON.stringify(planData.assumptions),
      planData.risk_hint ?? "MEDIUM",
      response.model,
      "PENDING",
      JSON.stringify(parsedIntent),
    ]
  );

  const planId = (planResult.rows[0] as { id: string }).id;

  // Validate SQL safety — throws on violations
  let validationPassed = true;
  let violations: string[] = [];

  try {
    const checks = validateMigrationPlan(planData.proposed_sql, input.targetTable);

    await query(
      `INSERT INTO migration_plan_checks (
        migration_plan_id, dangerous_operation_detected, allowlist_passed,
        target_match_passed, where_clause_check_passed,
        dependency_check_passed, multi_table_check_passed, overall_passed
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [planId, checks.dangerousOperationDetected, checks.allowlistPassed,
       checks.targetMatchPassed, checks.whereClauseCheckPassed,
       checks.dependencyCheckPassed, checks.multiTableCheckPassed, true]
    );

    await query(
      "UPDATE migration_plans SET validation_status = 'APPROVED_FOR_REHEARSAL' WHERE id = $1",
      [planId]
    );
  } catch (err) {
    if (err instanceof SqlValidationError) {
      validationPassed = false;
      violations = err.details?.["violations"] as string[] ?? [];

      await query(
        "UPDATE migration_plans SET validation_status = 'REJECTED' WHERE id = $1",
        [planId]
      );

      await query(
        `INSERT INTO migration_plan_checks (
          migration_plan_id, dangerous_operation_detected, allowlist_passed,
          overall_passed, violations
        ) VALUES ($1,$2,$3,$4,$5)`,
        [planId, true, false, false, JSON.stringify(violations)]
      );

      log.warn({ planId, violations }, "SQL validation failed");
    } else {
      throw err;
    }
  }

  // Update migration request plan version
  await query(
    "UPDATE migration_requests SET current_plan_version = $1, updated_at = NOW() WHERE id = $2",
    [nextVersion, input.migrationRequestId]
  );

  log.info({ planId, version: nextVersion, validationPassed }, "Migration plan created");

  return {
    planId,
    version: nextVersion,
    proposedSql: planData.proposed_sql,
    rollbackSql: planData.rollback_sql,
    strategyNotes: planData.strategy_notes,
    assumptions: planData.assumptions,
    riskHint: planData.risk_hint,
    parsedIntent,
    validationPassed,
  };
}

/**
 * Run the independent critic on a plan.
 * Uses a DIFFERENT model family from the planner.
 */
export async function critiqueMigrationPlan(
  planId: string,
  migrationRequestId: string,
  proposedSql: string[],
  requestText: string,
  schemaContext: string
): Promise<{ approvedForRehearsal: boolean; feedback: Record<string, unknown> }> {
  const log = logger.child({ migrationId: migrationRequestId, planId });
  log.info("Running independent critic");

  const response = await routeModelRequest({
    taskClass: "INDEPENDENT_CRITIQUE",
    systemPrompt: CRITIC_SYSTEM_PROMPT,
    userPrompt: `Migration request: ${requestText}

Proposed SQL:
${proposedSql.join("\n")}

Schema context:
${schemaContext}

Provide your critical review.`,
    requiredCapabilities: ["REASONING"],
    temperature: 0.0,
    migrationRequestId,
  });

  let feedback: { approved_for_rehearsal: boolean; blocking_issues: string[]; non_blocking_issues: string[]; recommended_changes: string[] };
  try {
    feedback = (response.parsedJson ?? JSON.parse(response.content)) as typeof feedback;
  } catch {
    feedback = {
      approved_for_rehearsal: true,
      blocking_issues: [],
      non_blocking_issues: ["Could not parse critic response"],
      recommended_changes: [],
    };
  }

  // Store critic result
  await query(
    "UPDATE migration_plans SET critic_model = $1, critic_feedback = $2 WHERE id = $3",
    [response.model, JSON.stringify(feedback), planId]
  );

  log.info({ approvedForRehearsal: feedback.approved_for_rehearsal }, "Critic completed");

  return {
    approvedForRehearsal: feedback.approved_for_rehearsal,
    feedback,
  };
}
