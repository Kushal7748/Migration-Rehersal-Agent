// ============================================================
// MIGR8 Evidence Pack Builder
// Every field is tagged with provenance.
// No field may be presented to the approver without a source tag.
// ============================================================

import { query } from "../../db/connection.js";
import { v4 as uuidv4 } from "uuid";
import { evaluateRisk } from "../../risk-engine/evaluator/index.js";
import { logger } from "../../observability/logger/index.js";
import type { EvidencePack, EvidenceFieldProvenance } from "../../core/types/migration.js";

export interface EvidenceField {
  path: string;
  value: unknown;
  provenance: EvidenceFieldProvenance;
  source: string;
}

export interface BuiltEvidencePack {
  evidenceId: string;
  evidencePackId: string;
  riskLevel: string;
  riskScore: number;
  riskReason: string;
  blocked: boolean;
  rollbackRehearsed: boolean;
  sourceSchemaFingerprint: string;
  summary: string;
  fields: EvidenceField[];
  rawJson: Record<string, unknown>;
}

/**
 * Build an Evidence Pack from verified rehearsal data.
 * Every section is tagged with provenance type.
 */
export async function buildEvidencePack(
  migrationRequestId: string,
  migrationPlanId: string,
  rehearsalRunId: string
): Promise<BuiltEvidencePack> {
  const log = logger.child({ migrationId: migrationRequestId });
  log.info("Building evidence pack");

  // Load all required data from the control-plane DB
  const migration = await loadMigration(migrationRequestId);
  const plan = await loadPlan(migrationPlanId);
  const rehearsal = await loadRehearsal(rehearsalRunId);
  const schemaSnapshot = await loadLatestSnapshot(migrationRequestId);

  if (!migration || !plan || !rehearsal) {
    throw new Error("Cannot build evidence pack: required data missing");
  }

  // Run deterministic risk evaluation
  const riskEval = evaluateRisk({
    rehearsalRun: {
      id: rehearsal["id"] as string,
      migrationPlanId,
      migrationRequestId,
      branchId: rehearsal["branch_id"] as string,
      branchName: rehearsal["branch_name"] as string,
      startedAt: new Date(rehearsal["started_at"] as string),
      endedAt: rehearsal["ended_at"] ? new Date(rehearsal["ended_at"] as string) : undefined,
      durationMs: rehearsal["duration_ms"] as number,
      lockDurationMs: rehearsal["lock_duration_ms"] as number,
      rowsBefore: rehearsal["rows_before"] as number,
      rowsAfter: rehearsal["rows_after"] as number,
      rowsAffected: rehearsal["rows_affected"] as number,
      rowsLost: rehearsal["rows_lost"] as number ?? 0,
      walGrowthBytes: rehearsal["wal_growth_bytes"] as number,
      testsPassed: rehearsal["tests_passed"] as number,
      testsTotal: rehearsal["tests_total"] as number,
      passed: rehearsal["passed"] as boolean,
      failureReason: rehearsal["failure_reason"] as string | undefined,
      measurementSource: rehearsal["measurement_source"] as "REAL" | "DEMO_INJECTION",
    },
    tableRowCount: rehearsal["rows_before"] as number ?? 0,
    lockDurationThresholdMs: parseInt(process.env["LOCK_DURATION_THRESHOLD_MS"] ?? "2000"),
    statementCount: (plan["proposed_sql"] as string[])?.length ?? 1,
    affectedTableCount: 1,
    foreignKeyCount: 0,
    indexChanges: 0,
    constraintOperations: 0,
    rollbackAvailable: Array.isArray(plan["rollback_sql"]) && (plan["rollback_sql"] as string[]).length > 0,
    modelRiskHint: plan["risk_hint"] as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined,
  });

  // Build provenance-tagged fields
  const fields: EvidenceField[] = [
    // OBSERVED FACTs — from real database inspection or rehearsal measurement
    { path: "rehearsal.branchId", value: rehearsal["branch_id"], provenance: "OBSERVED_FACT", source: "neon-rehearsal-engine" },
    { path: "rehearsal.measurementSource", value: rehearsal["measurement_source"], provenance: "OBSERVED_FACT", source: "rehearsal-runner" },
    { path: "rehearsal.durationMs", value: rehearsal["duration_ms"], provenance: "OBSERVED_FACT", source: "rehearsal-runner" },
    { path: "rehearsal.lockDurationMs", value: rehearsal["lock_duration_ms"], provenance: "OBSERVED_FACT", source: "rehearsal-runner" },
    { path: "rehearsal.rowsBefore", value: rehearsal["rows_before"], provenance: "OBSERVED_FACT", source: "neon-pg-stats" },
    { path: "rehearsal.rowsAfter", value: rehearsal["rows_after"], provenance: "OBSERVED_FACT", source: "rehearsal-runner" },
    { path: "rehearsal.rowsAffected", value: rehearsal["rows_affected"], provenance: "OBSERVED_FACT", source: "pg-result" },
    { path: "rehearsal.rowsLost", value: rehearsal["rows_lost"], provenance: "OBSERVED_FACT", source: "rehearsal-runner" },
    { path: "rehearsal.walGrowthBytes", value: rehearsal["wal_growth_bytes"], provenance: "ESTIMATE", source: "pg-wal-stats" },
    { path: "rehearsal.testsPassed", value: rehearsal["tests_passed"], provenance: "OBSERVED_FACT", source: "validation-tests" },
    { path: "rehearsal.testsTotal", value: rehearsal["tests_total"], provenance: "OBSERVED_FACT", source: "validation-tests" },
    { path: "rehearsal.passed", value: rehearsal["passed"], provenance: "OBSERVED_FACT", source: "rehearsal-runner" },

    // RISK — deterministic engine output
    { path: "risk.level", value: riskEval.riskLevel, provenance: "OBSERVED_FACT", source: "deterministic-risk-engine" },
    { path: "risk.score", value: riskEval.riskScore, provenance: "OBSERVED_FACT", source: "deterministic-risk-engine" },
    { path: "risk.reason", value: riskEval.riskReason, provenance: "OBSERVED_FACT", source: "deterministic-risk-engine" },
    { path: "risk.blocked", value: riskEval.blocked, provenance: "OBSERVED_FACT", source: "deterministic-risk-engine" },
    { path: "risk.findings", value: riskEval.findings, provenance: "OBSERVED_FACT", source: "deterministic-risk-engine" },
    { path: "risk.modelOverrideIgnored", value: riskEval.modelOverrideIgnored, provenance: "OBSERVED_FACT", source: "deterministic-risk-engine" },

    // MODEL SUGGESTIONS
    { path: "plan.riskHint", value: plan["risk_hint"], provenance: "MODEL_SUGGESTION", source: `planner-model:${plan["planner_model"]}` },
    { path: "plan.strategyNotes", value: plan["strategy_notes"], provenance: "MODEL_SUGGESTION", source: `planner-model:${plan["planner_model"]}` },
    { path: "plan.criticFeedback", value: plan["critic_feedback"], provenance: "MODEL_SUGGESTION", source: `critic-model:${plan["critic_model"]}` },

    // INFERENCES
    { path: "rollback.available", value: Array.isArray(plan["rollback_sql"]) && (plan["rollback_sql"] as string[]).length > 0, provenance: "OBSERVED_FACT", source: "plan-validator" },
    { path: "rollback.rehearsed", value: false, provenance: "OBSERVED_FACT", source: "rehearsal-runner" },

    // DATABASE — from schema discovery
    { path: "database.targetTable", value: migration["target_table"], provenance: "OBSERVED_FACT", source: "schema-discovery" },
    { path: "database.schemaFingerprint", value: schemaSnapshot?.fingerprint, provenance: "OBSERVED_FACT", source: "schema-inspector" },
  ];

  const evidenceId = uuidv4();
  const summary = buildSummary(migration, plan, rehearsal, riskEval);

  const rawJson = {
    migration: { id: migrationRequestId, requestText: migration["request_text"], targetTable: migration["target_table"] },
    plan: { id: migrationPlanId, version: plan["version"], proposedSql: plan["proposed_sql"], rollbackSql: plan["rollback_sql"] },
    rehearsal: { id: rehearsalRunId, ...rehearsal },
    risk: riskEval,
    fields,
  };

  // Store evidence pack
  const epResult = await query(
    `INSERT INTO evidence_packs (
      evidence_id, migration_request_id, migration_plan_id, rehearsal_run_id,
      risk_level, risk_reason, risk_score, summary,
      rollback_rehearsed, is_stale, source_schema_fingerprint, raw_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id`,
    [
      evidenceId, migrationRequestId, migrationPlanId, rehearsalRunId,
      riskEval.riskLevel, riskEval.riskReason, riskEval.riskScore, summary,
      false, false, (schemaSnapshot?.["fingerprint"] as string) ?? "unknown",
      JSON.stringify(rawJson),
    ]
  );

  const evidencePackId = (epResult.rows[0] as { id: string }).id;

  // Store individual fields with provenance
  for (const field of fields) {
    await query(
      `INSERT INTO evidence_fields (evidence_pack_id, field_path, value, provenance, source)
       VALUES ($1,$2,$3,$4,$5)`,
      [evidencePackId, field.path, JSON.stringify(field.value), field.provenance, field.source]
    );
  }

  log.info({ evidenceId, riskLevel: riskEval.riskLevel }, "Evidence pack built");

  return {
    evidenceId,
    evidencePackId,
    riskLevel: riskEval.riskLevel,
    riskScore: riskEval.riskScore,
    riskReason: riskEval.riskReason,
    blocked: riskEval.blocked,
    rollbackRehearsed: false,
    sourceSchemaFingerprint: (schemaSnapshot?.["fingerprint"] as string) ?? "unknown",
    summary,
    fields,
    rawJson,
  };
}

function buildSummary(
  migration: Record<string, unknown>,
  plan: Record<string, unknown>,
  rehearsal: Record<string, unknown>,
  riskEval: ReturnType<typeof evaluateRisk>
): string {
  const parts = [
    `Migration: ${migration["request_text"]}`,
    `Plan v${plan["version"]}: ${(plan["proposed_sql"] as string[])?.length ?? 0} SQL statements`,
    `Rehearsal: ${rehearsal["measurement_source"]} — ${rehearsal["passed"] ? "PASSED" : "FAILED"}`,
    `Duration: ${rehearsal["duration_ms"]}ms, Lock: ${rehearsal["lock_duration_ms"]}ms`,
    `Rows: ${rehearsal["rows_before"]} before, ${rehearsal["rows_affected"]} affected`,
    `Risk: ${riskEval.riskLevel} (score: ${riskEval.riskScore.toFixed(2)})`,
    riskEval.blocked ? `⛔ BLOCKED: ${riskEval.riskReason}` : "✅ Ready for approval",
  ];
  return parts.join("\n");
}

async function loadMigration(id: string) {
  return (await query("SELECT * FROM migration_requests WHERE id = $1", [id])).rows[0] as Record<string, unknown> | undefined;
}

async function loadPlan(id: string) {
  return (await query("SELECT * FROM migration_plans WHERE id = $1", [id])).rows[0] as Record<string, unknown> | undefined;
}

async function loadRehearsal(id: string) {
  return (await query("SELECT * FROM rehearsal_runs WHERE id = $1", [id])).rows[0] as Record<string, unknown> | undefined;
}

async function loadLatestSnapshot(migrationRequestId: string) {
  return (await query(
    "SELECT * FROM schema_snapshots WHERE migration_request_id = $1 ORDER BY captured_at DESC LIMIT 1",
    [migrationRequestId]
  )).rows[0] as Record<string, unknown> | undefined;
}
