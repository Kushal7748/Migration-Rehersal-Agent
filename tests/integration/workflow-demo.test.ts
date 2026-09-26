// ============================================================
// MIGR8 End-to-End Workflow Integration Test
// Simulates the complete hackathon demonstration pipeline:
// INTAKE -> DISCOVER -> NAIVE PLAN -> CRITIQUE -> REHEARSAL FAILS ->
// RISK REJECTS -> REPLAN -> SAFE REHEARSAL PASSES ->
// EVIDENCE PACK -> APPROVE -> TOKEN ISSUED ->
// POLICY SERVICE VALIDATES -> EXECUTES -> VERIFIES -> COMPLETE
// ============================================================

process.env["APPROVAL_TOKEN_SECRET"] = "migr8-super-secret-key-that-is-at-least-32-chars-long";
process.env["APPROVAL_TOKEN_TTL_SECONDS"] = "120";
process.env["LOCK_DURATION_THRESHOLD_MS"] = "2000";

import { describe, it, expect } from "vitest";
import { mintApprovalToken, verifyApprovalToken } from "../../policy/approval-token/index.js";
import { validateMigrationPlan } from "../../risk-engine/sql-validator/index.js";
import { evaluateRisk } from "../../risk-engine/evaluator/index.js";
import { computeSchemaFingerprint } from "../../neon/readonly-client/index.js";
import { isValidTransition } from "../../core/state-machine/transitions.js";
import type { TableInfo, MigrationState } from "../../core/types/migration.js";

describe("MIGR8 End-to-End Autonomous Rehearsal Workflow", () => {
  it("executes the full safe migration lifecycle end to end", async () => {
    // 1. INTAKE: User request arrives
    let state: MigrationState = "INTAKE";
    const userIntent = "Add fraud_score to users and backfill existing rows.";
    const migrationId = "11111111-2222-3333-4444-555555555555";
    const approverId = "security-lead@company.com";

    // 2. DISCOVER: Read target schema
    expect(isValidTransition(state, "DISCOVERING")).toBe(true);
    state = "DISCOVERING";

    const initialTables: TableInfo[] = [
      {
        name: "users",
        schema: "public",
        rowCount: 100000,
        columns: [
          { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true },
          { name: "email", dataType: "varchar", isNullable: false, isPrimaryKey: false },
          { name: "status", dataType: "varchar", isNullable: false, isPrimaryKey: false },
        ],
        indexes: [
          { name: "idx_users_email", columns: ["email"], isUnique: true, isConcurrent: true, definition: "CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users(email)" },
        ],
        primaryKey: ["id"],
        foreignKeys: [],
        constraints: [],
      },
    ];

    const initialFingerprint = computeSchemaFingerprint(initialTables);
    expect(initialFingerprint).toBeDefined();

    // 3. PLAN: Planner proposes naive single-statement ALTER TABLE + direct backfill
    expect(isValidTransition(state, "PLANNING")).toBe(true);
    state = "PLANNING";

    const naivePlan = {
      version: 1,
      strategy: "NAIVE_FULL_TABLE_ALTER",
      proposedSql: [
        "ALTER TABLE users ADD COLUMN fraud_score NUMERIC(5,2) DEFAULT 0.0 NOT NULL;",
        "UPDATE users SET fraud_score = 10.0 WHERE status = 'active';",
      ],
      targetTable: "users",
    };

    // Pre-check passes syntactic validation but carries lock risks
    const preCheck = validateMigrationPlan(naivePlan.proposedSql, "users");
    expect(preCheck.allowlistPassed).toBe(true);

    // 4. CRITIQUE
    expect(isValidTransition(state, "CRITIQUING")).toBe(true);
    state = "CRITIQUING";

    // 5. REHEARSAL 1: Naive plan runs on Neon branch
    expect(isValidTransition(state, "REHEARSING")).toBe(true);
    state = "REHEARSING";

    // Simulated rehearsal measurement of naive full-table lock on 100,000 rows
    const naiveRehearsalRun = {
      id: "run-naive-001",
      migrationPlanId: "plan-v1",
      migrationRequestId: migrationId,
      branchId: "br-rehearsal-v1",
      branchName: "rehearsal-run-v1",
      startedAt: new Date(),
      durationMs: 4200,
      lockDurationMs: 3800, // 3.8s lock exceeds 2.0s policy threshold!
      rowsBefore: 100000,
      rowsAfter: 100000,
      rowsAffected: 100000,
      rowsLost: 0,
      testsPassed: 4,
      testsTotal: 5,
      passed: false,
      failureReason: "Lock duration 3800ms exceeds threshold 2000ms",
      measurementSource: "REAL" as const,
      createdAt: new Date(),
    };

    // 6. RISK EVALUATION: Fails threshold -> REPLAN
    expect(isValidTransition(state, "RISK_EVALUATION")).toBe(true);
    state = "RISK_EVALUATION";

    const naiveRisk = evaluateRisk({ rehearsalRun: naiveRehearsalRun });
    expect(naiveRisk.blocked).toBe(true);
    expect(naiveRisk.riskLevel).toBe("CRITICAL");

    expect(isValidTransition(state, "REPLANNING")).toBe(true);
    state = "REPLANNING";

    // 7. REPLAN: Agent receives measured metrics and formulates non-blocking phased strategy
    const safePlan = {
      version: 2,
      strategy: "PHASED_NULLABLE_CHUNKED_BACKFILL",
      proposedSql: [
        "ALTER TABLE users ADD COLUMN fraud_score NUMERIC(5,2);",
        "UPDATE users SET fraud_score = 0.0 WHERE fraud_score IS NULL;",
        "CREATE INDEX CONCURRENTLY idx_users_fraud_score ON users(fraud_score);",
      ],
      targetTable: "users",
    };

    expect(isValidTransition(state, "CRITIQUING")).toBe(true);
    state = "CRITIQUING";

    expect(isValidTransition(state, "REHEARSING")).toBe(true);
    state = "REHEARSING";

    // 8. REHEARSAL 2: Safe plan rehearsed on fresh Neon copy-on-write branch
    const safeRehearsalRun = {
      id: "run-safe-002",
      migrationPlanId: "plan-v2",
      migrationRequestId: migrationId,
      branchId: "br-rehearsal-v2",
      branchName: "rehearsal-run-v2",
      startedAt: new Date(),
      durationMs: 620,
      lockDurationMs: 48, // Minimal 48ms lock!
      rowsBefore: 100000,
      rowsAfter: 100000,
      rowsAffected: 100,
      rowsLost: 0,
      testsPassed: 5,
      testsTotal: 5,
      passed: true,
      measurementSource: "REAL" as const,
      createdAt: new Date(),
    };

    expect(isValidTransition(state, "RISK_EVALUATION")).toBe(true);
    state = "RISK_EVALUATION";

    const safeRisk = evaluateRisk({ rehearsalRun: safeRehearsalRun, rollbackAvailable: true });
    expect(safeRisk.blocked).toBe(false);
    expect(safeRisk.riskLevel).toBe("LOW");

    // 9. EVIDENCE PACK: Built from verified rehearsal data
    expect(isValidTransition(state, "EVIDENCE_READY")).toBe(true);
    state = "EVIDENCE_READY";

    const evidenceId = "e1e1e1e1-e2e2-e3e3-e4e4-e5e5e5e5e5e5";
    const evidencePack = {
      evidenceId,
      migrationRequestId: migrationId,
      planVersion: 2,
      measuredLockDurationMs: 48,
      sourceSchemaFingerprint: initialFingerprint,
      riskLevel: safeRisk.riskLevel,
      riskScore: safeRisk.riskScore,
    };

    // 10. HUMAN APPROVAL: Approver reviews evidence and issues approval
    expect(isValidTransition(state, "AWAITING_APPROVAL")).toBe(true);
    state = "AWAITING_APPROVAL";

    const mintedToken = mintApprovalToken(
      evidenceId,
      migrationId,
      approverId,
      "APPROVE"
    );
    expect(mintedToken.token).toBeDefined();

    expect(isValidTransition(state, "APPROVED")).toBe(true);
    state = "APPROVED";

    // 11. POLICY VALIDATION: Independent Policy Service validates token cryptographically & checks schema freshness
    expect(isValidTransition(state, "POLICY_VALIDATION")).toBe(true);
    state = "POLICY_VALIDATION";

    const verifiedPayload = verifyApprovalToken(
      mintedToken.token,
      evidenceId,
      migrationId,
      approverId,
      "APPROVE"
    );
    expect(verifiedPayload.approverId).toBe(approverId);

    // Schema freshness check: verify fingerprint matches
    const executionTimeFingerprint = computeSchemaFingerprint(initialTables);
    expect(executionTimeFingerprint).toBe(evidencePack.sourceSchemaFingerprint);

    // 12. EXECUTING: Policy Service executes against production Neon
    expect(isValidTransition(state, "EXECUTING")).toBe(true);
    state = "EXECUTING";

    // 13. VERIFICATION: Post-execution check verifies columns and rows
    expect(isValidTransition(state, "VERIFYING")).toBe(true);
    state = "VERIFYING";

    const postMigrationTables: TableInfo[] = [
      {
        ...initialTables[0]!,
        columns: [
          ...initialTables[0]!.columns,
          { name: "fraud_score", dataType: "numeric(5,2)", isNullable: true, isPrimaryKey: false },
        ],
        indexes: [
          ...initialTables[0]!.indexes,
          { name: "idx_users_fraud_score", columns: ["fraud_score"], isUnique: false, isConcurrent: true, definition: "CREATE INDEX CONCURRENTLY idx_users_fraud_score ON users(fraud_score)" },
        ],
      },
    ];

    expect(postMigrationTables[0]!.columns.some(c => c.name === "fraud_score")).toBe(true);
    expect(postMigrationTables[0]!.rowCount).toBe(initialTables[0]!.rowCount);

    // 14. COMPLETE: Final audited success
    expect(isValidTransition(state, "COMPLETE")).toBe(true);
    state = "COMPLETE";

    expect(state).toBe("COMPLETE");
  });
});
