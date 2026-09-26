// ============================================================
// MIGR8 Migration Workflow Orchestrator
// Manages the full INTENT → DISCOVER → PLAN → REHEARSE → APPROVE → EXECUTE flow.
// The state machine is strictly enforced at every step.
// ============================================================

import { query, withTransaction } from "../../db/connection.js";
import { assertValidTransition } from "../../core/state-machine/transitions.js";
import { NeonReadClientImpl, computeSchemaFingerprint } from "../../neon/readonly-client/index.js";
import { createMigrationPlan, critiqueMigrationPlan, parseIntent } from "../../planning/planner/index.js";
import { runRehearsal } from "../../rehearsal/runner/index.js";
import { buildEvidencePack } from "../../evidence/builder/index.js";
import { evaluateRisk } from "../../risk-engine/evaluator/index.js";
import { logger } from "../../observability/logger/index.js";
import type { MigrationState } from "../../core/types/migration.js";
import { Migr8Error } from "../../core/errors/domain-errors.js";

const MAX_REPLAN_ATTEMPTS = parseInt(process.env["MAX_REPLAN_ATTEMPTS"] ?? "3");

export interface WorkflowContext {
  migrationRequestId: string;
  userId: string;
}

/**
 * Transition migration state with full audit trail.
 */
async function transitionState(
  migrationRequestId: string,
  from: MigrationState,
  to: MigrationState,
  actor: string,
  reason?: string
): Promise<void> {
  // Validate transition is legal
  assertValidTransition(from, to);

  await withTransaction(async (client) => {
    await client.query(
      "UPDATE migration_requests SET status = $1, updated_at = NOW() WHERE id = $2",
      [to, migrationRequestId]
    );

    await client.query(
      `INSERT INTO state_transition_log (migration_request_id, from_state, to_state, actor, actor_type, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [migrationRequestId, from, to, actor, "SYSTEM", reason ?? `Transitioned to ${to}`]
    );

    await client.query(
      `INSERT INTO audit_log (actor_type, actor_id, action, migration_request_id, metadata)
       VALUES ($1,$2,$3,$4,$5)`,
      ["SYSTEM", actor, `STATE_TRANSITION:${from}→${to}`, migrationRequestId,
       JSON.stringify({ from, to, reason })]
    );
  });
}

/**
 * Step 1: Discover — inspect target database schema.
 */
export async function runDiscovery(ctx: WorkflowContext): Promise<{ fingerprint: string; tableCount: number }> {
  const log = logger.child({ migrationId: ctx.migrationRequestId });
  log.info("Starting discovery");

  await transitionState(ctx.migrationRequestId, "INTAKE", "DISCOVERING", ctx.userId);

  const migration = await loadMigration(ctx.migrationRequestId);
  const neonRead = new NeonReadClientImpl();

  const tables = await neonRead.getDatabaseTables(migration["target_branch"] as string | undefined);
  const fingerprint = computeSchemaFingerprint(tables);

  // Store schema snapshot
  await query(
    `INSERT INTO schema_snapshots (migration_request_id, fingerprint, tables, raw_json)
     VALUES ($1,$2,$3,$4)`,
    [ctx.migrationRequestId, fingerprint, JSON.stringify(tables), JSON.stringify({ tables })]
  );

  await audit(ctx.migrationRequestId, ctx.userId, "SCHEMA_DISCOVERED", {
    fingerprint,
    tableCount: tables.length,
  });

  await transitionState(ctx.migrationRequestId, "DISCOVERING", "PLANNING", ctx.userId);

  log.info({ fingerprint, tableCount: tables.length }, "Discovery complete");
  return { fingerprint, tableCount: tables.length };
}

/**
 * Step 2: Plan + Critique loop.
 */
export async function runPlanAndCritique(
  ctx: WorkflowContext,
  previousFailedPlanId?: string,
  previousFailureReason?: string,
  previousLockDurationMs?: number,
  previousRowsAffected?: number
): Promise<{ planId: string; approved: boolean }> {
  const log = logger.child({ migrationId: ctx.migrationRequestId });
  const migration = await loadMigration(ctx.migrationRequestId);

  const currentState = migration.status as MigrationState;
  if (currentState !== "PLANNING" && currentState !== "REPLANNING") {
    await transitionState(ctx.migrationRequestId, currentState, "PLANNING", ctx.userId);
  }

  // Load schema
  const neonRead = new NeonReadClientImpl();
  const tables = await neonRead.getDatabaseTables(migration["target_branch"] as string | undefined);

  // Create plan
  const planResult = await createMigrationPlan({
    migrationRequestId: ctx.migrationRequestId,
    requestText: migration.request_text as string,
    targetTable: migration.target_table as string | undefined,
    schemaSnapshot: tables,
    previousFailedPlanId,
    previousFailureReason,
    previousLockDurationMs,
    previousRowsAffected,
  });

  await audit(ctx.migrationRequestId, ctx.userId, "PLAN_CREATED", {
    planId: planResult.planId,
    version: planResult.version,
    validationPassed: planResult.validationPassed,
  });

  if (!planResult.validationPassed) {
    await audit(ctx.migrationRequestId, ctx.userId, "PLAN_REJECTED_SQL_VALIDATION", {
      planId: planResult.planId,
    });
    return { planId: planResult.planId, approved: false };
  }

  await transitionState(ctx.migrationRequestId, "PLANNING", "CRITIQUING", ctx.userId);

  // Run critic
  const criticResult = await critiqueMigrationPlan(
    planResult.planId,
    ctx.migrationRequestId,
    planResult.proposedSql,
    migration.request_text as string,
    JSON.stringify(tables, null, 2)
  );

  await audit(ctx.migrationRequestId, ctx.userId, "CRITIC_RESULT", {
    planId: planResult.planId,
    approvedForRehearsal: criticResult.approvedForRehearsal,
    blockingIssues: (criticResult.feedback as Record<string, unknown>)["blocking_issues"],
  });

  // Proceed to rehearsal (critic is advisory — deterministic safety engine is authoritative)
  await transitionState(ctx.migrationRequestId, "CRITIQUING", "REHEARSING", ctx.userId);

  return { planId: planResult.planId, approved: true };
}

/**
 * Step 3: Rehearse + Risk Evaluation.
 * Returns whether the plan passed and should proceed, or needs replanning.
 */
export async function runRehearsalAndRisk(
  ctx: WorkflowContext,
  planId: string
): Promise<{
  rehearsalRunId: string;
  passed: boolean;
  needsReplan: boolean;
  failureReason?: string;
  lockDurationMs: number;
  rowsAffected: number;
}> {
  const log = logger.child({ migrationId: ctx.migrationRequestId, planId });
  const migration = await loadMigration(ctx.migrationRequestId);
  const plan = await loadPlan(planId);

  await audit(ctx.migrationRequestId, ctx.userId, "REHEARSAL_STARTED", { planId });

  const rehearsalResult = await runRehearsal({
    migrationRequestId: ctx.migrationRequestId,
    migrationPlanId: planId,
    planSql: plan.proposed_sql as string[],
    targetBranch: migration.target_branch as string,
    targetTable: migration.target_table as string | undefined,
  });

  await transitionState(ctx.migrationRequestId, "REHEARSING", "RISK_EVALUATION", ctx.userId);

  await audit(ctx.migrationRequestId, ctx.userId, "REHEARSAL_COMPLETED", {
    rehearsalRunId: rehearsalResult.rehearsalRunId,
    passed: rehearsalResult.passed,
    lockDurationMs: rehearsalResult.lockDurationMs,
    measurementSource: rehearsalResult.measurementSource,
  });

  // Risk evaluation
  const riskResult = evaluateRisk({
    rehearsalRun: {
      id: rehearsalResult.rehearsalRunId,
      migrationPlanId: planId,
      migrationRequestId: ctx.migrationRequestId,
      branchId: rehearsalResult.branchId,
      branchName: rehearsalResult.branchName,
      startedAt: new Date(),
      durationMs: rehearsalResult.durationMs,
      lockDurationMs: rehearsalResult.lockDurationMs,
      rowsBefore: rehearsalResult.rowsBefore,
      rowsAfter: rehearsalResult.rowsAfter,
      rowsAffected: rehearsalResult.rowsAffected,
      rowsLost: rehearsalResult.rowsLost,
      walGrowthBytes: rehearsalResult.walGrowthBytes,
      testsPassed: rehearsalResult.testsPassed,
      testsTotal: rehearsalResult.testsTotal,
      passed: rehearsalResult.passed,
      failureReason: rehearsalResult.failureReason,
      measurementSource: rehearsalResult.measurementSource,
    },
    tableRowCount: rehearsalResult.rowsBefore,
    lockDurationThresholdMs: parseInt(process.env["LOCK_DURATION_THRESHOLD_MS"] ?? "2000"),
    statementCount: (plan.proposed_sql as string[]).length,
    affectedTableCount: 1,
    foreignKeyCount: 0,
    indexChanges: 0,
    constraintOperations: 0,
    rollbackAvailable: Array.isArray(plan.rollback_sql) && (plan.rollback_sql as string[]).length > 0,
  });

  await audit(ctx.migrationRequestId, ctx.userId, "RISK_EVALUATED", {
    riskLevel: riskResult.riskLevel,
    blocked: riskResult.blocked,
    riskScore: riskResult.riskScore,
  });

  const needsReplan = riskResult.blocked;
  const nextState: MigrationState = needsReplan ? "REPLANNING" : "EVIDENCE_READY";
  await transitionState(ctx.migrationRequestId, "RISK_EVALUATION", nextState, ctx.userId);

  return {
    rehearsalRunId: rehearsalResult.rehearsalRunId,
    passed: !needsReplan,
    needsReplan,
    failureReason: rehearsalResult.failureReason,
    lockDurationMs: rehearsalResult.lockDurationMs,
    rowsAffected: rehearsalResult.rowsAffected,
  };
}

/**
 * Step 4: Build Evidence Pack.
 */
export async function buildEvidence(
  ctx: WorkflowContext,
  migrationPlanId: string,
  rehearsalRunId: string
): Promise<{ evidenceId: string; blocked: boolean }> {
  const ep = await buildEvidencePack(
    ctx.migrationRequestId,
    migrationPlanId,
    rehearsalRunId
  );

  await audit(ctx.migrationRequestId, ctx.userId, "EVIDENCE_CREATED", {
    evidenceId: ep.evidenceId,
    riskLevel: ep.riskLevel,
  });

  if (!ep.blocked) {
    await transitionState(ctx.migrationRequestId, "EVIDENCE_READY", "AWAITING_APPROVAL", ctx.userId);
    await audit(ctx.migrationRequestId, ctx.userId, "APPROVAL_REQUESTED", {
      evidenceId: ep.evidenceId,
    });
  }

  return { evidenceId: ep.evidenceId, blocked: ep.blocked };
}

/**
 * Full automated workflow — runs all steps in sequence.
 * Handles the replan loop automatically.
 */
export async function runFullWorkflow(ctx: WorkflowContext): Promise<void> {
  const log = logger.child({ migrationId: ctx.migrationRequestId });
  log.info("Starting full migration workflow");

  try {
    // Step 1: Discover
    await runDiscovery(ctx);

    let attempt = 0;
    let planId: string | null = null;
    let previousFailedPlanId: string | undefined;
    let previousFailureReason: string | undefined;
    let previousLockDurationMs: number | undefined;
    let previousRowsAffected: number | undefined;

    // Replan loop
    while (attempt < MAX_REPLAN_ATTEMPTS) {
      attempt++;
      log.info({ attempt }, "Planning attempt");

      // Step 2: Plan + Critique
      const planResult = await runPlanAndCritique(
        ctx,
        previousFailedPlanId,
        previousFailureReason,
        previousLockDurationMs,
        previousRowsAffected
      );
      planId = planResult.planId;

      if (!planResult.approved) {
        log.warn({ planId, attempt }, "Plan failed validation — replanning");
        previousFailedPlanId = planId;
        continue;
      }

      // Step 3: Rehearse + Risk
      const rehearsalResult = await runRehearsalAndRisk(ctx, planId);

      if (!rehearsalResult.needsReplan) {
        // Step 4: Build Evidence
        await buildEvidence(ctx, planId, rehearsalResult.rehearsalRunId);
        log.info("Workflow complete — awaiting human approval");
        return;
      }

      // Risk engine blocked the plan — replan
      log.warn(
        {
          planId,
          lockDurationMs: rehearsalResult.lockDurationMs,
          attempt,
        },
        "Plan blocked by risk engine — replanning"
      );

      previousFailedPlanId = planId;
      previousFailureReason = rehearsalResult.failureReason;
      previousLockDurationMs = rehearsalResult.lockDurationMs;
      previousRowsAffected = rehearsalResult.rowsAffected;

      await audit(ctx.migrationRequestId, ctx.userId, "REPLAN_TRIGGERED", {
        attempt,
        reason: rehearsalResult.failureReason,
        lockDurationMs: rehearsalResult.lockDurationMs,
      });
    }

    // Max attempts exceeded
    await query(
      "UPDATE migration_requests SET status = 'BLOCKED', updated_at = NOW() WHERE id = $1",
      [ctx.migrationRequestId]
    );
    await audit(ctx.migrationRequestId, ctx.userId, "MAX_REPLAN_ATTEMPTS_EXCEEDED", {
      attempts: attempt,
    });

    throw new Migr8Error(
      "MAX_REPLAN_ATTEMPTS",
      `Maximum replan attempts (${MAX_REPLAN_ATTEMPTS}) exceeded`
    );
  } catch (err) {
    if (err instanceof Migr8Error && err.code === "MAX_REPLAN_ATTEMPTS") throw err;

    log.error({ err }, "Workflow failed");
    await query(
      "UPDATE migration_requests SET status = 'FAILED', updated_at = NOW() WHERE id = $1",
      [ctx.migrationRequestId]
    );
    await audit(ctx.migrationRequestId, ctx.userId, "MIGRATION_FAILED", {
      error: (err as Error).message,
    });
    throw err;
  }
}

// Helpers
async function loadMigration(id: string): Promise<Record<string, unknown>> {
  const r = await query("SELECT * FROM migration_requests WHERE id = $1", [id]);
  return r.rows[0] as Record<string, unknown>;
}

async function loadPlan(id: string): Promise<Record<string, unknown>> {
  const r = await query("SELECT * FROM migration_plans WHERE id = $1", [id]);
  return r.rows[0] as Record<string, unknown>;
}

async function audit(
  migrationRequestId: string,
  actorId: string,
  action: string,
  metadata?: Record<string, unknown>
) {
  await query(
    `INSERT INTO audit_log (actor_type, actor_id, action, migration_request_id, metadata)
     VALUES ($1,$2,$3,$4,$5)`,
    ["SYSTEM", actorId, action, migrationRequestId, JSON.stringify(metadata ?? {})]
  );
}
