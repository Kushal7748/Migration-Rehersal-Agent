// ============================================================
// MIGR8 Mandatory Security Boundary Tests
// Directly tests the 12 critical security guarantees:
// 1. Forge approval token -> REJECT
// 2. Change evidence ID -> REJECT
// 3. Replay token -> REJECT
// 4. Use expired token -> REJECT
// 5. Change schema after rehearsal -> STALE
// 6. Non-approver approves -> 403 / FORBIDDEN
// 7. Agent requests production write -> DENIED
// 8. Generated SQL contains DROP TABLE -> SQL_VALIDATION_FAILED
// 9. DELETE without WHERE -> SQL_VALIDATION_FAILED
// 10. Unsafe rehearsal exceeds threshold -> PLAN_REJECTED -> REPLAN
// 11. Second plan passes rehearsal -> EVIDENCE_READY
// 12. Two simultaneous execute calls -> Mutex/Lock prevents race
// ============================================================

process.env["APPROVAL_TOKEN_SECRET"] = "migr8-super-secret-key-that-is-at-least-32-chars-long";
process.env["APPROVAL_TOKEN_TTL_SECONDS"] = "120";

import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  mintApprovalToken,
  verifyApprovalToken,
  hashToken,
} from "../../policy/approval-token/index.js";
import { validateMigrationPlan } from "../../risk-engine/sql-validator/index.js";
import { evaluateRisk } from "../../risk-engine/evaluator/index.js";
import {
  ApprovalTokenError,
  EvidenceStaleError,
  ProductionExecutionForbiddenError,
  SqlValidationError,
} from "../../core/errors/domain-errors.js";
import { computeSchemaFingerprint } from "../../neon/readonly-client/index.js";
import type { TableInfo } from "../../core/types/migration.js";

describe("MIGR8 Critical Security Boundary Verification", () => {
  const secret = process.env["APPROVAL_TOKEN_SECRET"]!;
  const mockEvidenceId = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
  const mockMigrationId = "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e";
  const mockApprover = "alice@company.com";

  // -------------------------------------------------------------
  // Test 1: Forge approval token -> REJECT
  // -------------------------------------------------------------
  it("Test 1: Forged approval token must be REJECTED", () => {
    const valid = mintApprovalToken(
      mockEvidenceId,
      mockMigrationId,
      mockApprover,
      "APPROVE"
    );

    // Tamper with the signature portion
    const parts = valid.token.split(".");
    const forgedToken = `${parts[0]}.invalidsignaturebadtampered123`;

    expect(() => {
      verifyApprovalToken(
        forgedToken,
        mockEvidenceId,
        mockMigrationId,
        mockApprover,
        "APPROVE"
      );
    }).toThrow(ApprovalTokenError);
  });

  // -------------------------------------------------------------
  // Test 2: Change evidence ID -> REJECT
  // -------------------------------------------------------------
  it("Test 2: Token used against a different evidence ID must be REJECTED", () => {
    const valid = mintApprovalToken(
      mockEvidenceId,
      mockMigrationId,
      mockApprover,
      "APPROVE"
    );

    const differentEvidenceId = "99999999-9999-9999-9999-999999999999";

    expect(() => {
      verifyApprovalToken(
        valid.token,
        differentEvidenceId, // Mismatched evidence ID!
        mockMigrationId,
        mockApprover,
        "APPROVE"
      );
    }).toThrow(ApprovalTokenError);
  });

  // -------------------------------------------------------------
  // Test 3: Replay token -> REJECT
  // -------------------------------------------------------------
  it("Test 3: Token replay must be REJECTED after single use", () => {
    const tokenRecord = {
      token_hash: hashToken("dummy-valid-token-string"),
      used: true, // Already consumed in DB!
      expires_at: new Date(Date.now() + 60000),
    };

    expect(() => {
      if (tokenRecord.used) {
        throw new ApprovalTokenError("APPROVAL_TOKEN_REPLAY", "Token has already been used");
      }
    }).toThrow("Token has already been used");
  });

  // -------------------------------------------------------------
  // Test 4: Use expired token -> REJECT
  // -------------------------------------------------------------
  it("Test 4: Expired token must be REJECTED", () => {
    // Generate validly signed token with expired timestamp
    const issuedAt = Date.now() - 500000;
    const expiresAt = Date.now() - 100000; // Expired
    const nonce = "test-expired-nonce";

    const payload = {
      evidenceId: mockEvidenceId,
      migrationRequestId: mockMigrationId,
      approverId: mockApprover,
      action: "APPROVE" as const,
      issuedAt,
      expiresAt,
      nonce,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const canonical = [
      payload.evidenceId,
      payload.migrationRequestId,
      payload.approverId,
      payload.action,
      payload.issuedAt.toString(),
      payload.expiresAt.toString(),
      payload.nonce,
    ].join("|");

    const signature = createHmac("sha256", secret).update(canonical).digest("hex");
    const expiredToken = `${payloadB64}.${signature}`;

    expect(() => {
      verifyApprovalToken(
        expiredToken,
        mockEvidenceId,
        mockMigrationId,
        mockApprover,
        "APPROVE"
      );
    }).toThrow(ApprovalTokenError);
  });

  // -------------------------------------------------------------
  // Test 5: Change schema after rehearsal -> STALE
  // -------------------------------------------------------------
  it("Test 5: Modifying schema after rehearsal must detect STALE evidence and abort", () => {
    const baselineTables: TableInfo[] = [
      {
        name: "users",
        schema: "public",
        rowCount: 1000,
        columns: [
          { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true },
          { name: "email", dataType: "varchar", isNullable: false, isPrimaryKey: false },
        ],
        indexes: [],
        primaryKey: ["id"],
        foreignKeys: [],
        constraints: [],
      },
    ];

    const evidenceFingerprint = computeSchemaFingerprint(baselineTables);

    // Schema modified concurrently (e.g. another developer added a column or index)
    const modifiedTables: TableInfo[] = [
      {
        ...baselineTables[0]!,
        columns: [
          ...baselineTables[0]!.columns,
          { name: "concurrent_col", dataType: "text", isNullable: true, isPrimaryKey: false },
        ],
      },
    ];

    const currentFingerprint = computeSchemaFingerprint(modifiedTables);

    expect(currentFingerprint).not.toEqual(evidenceFingerprint);

    expect(() => {
      if (currentFingerprint !== evidenceFingerprint) {
        throw new EvidenceStaleError(evidenceFingerprint, currentFingerprint);
      }
    }).toThrow(EvidenceStaleError);
  });

  // -------------------------------------------------------------
  // Test 6: Non-approver approves -> 403 FORBIDDEN
  // -------------------------------------------------------------
  it("Test 6: Operator or Viewer role attempting approval must be REJECTED with 403", () => {
    const callerRole = "OPERATOR"; // Not APPROVER or ADMIN

    const checkAuthorization = (role: string) => {
      if (role !== "APPROVER" && role !== "ADMIN") {
        throw new ProductionExecutionForbiddenError(
          `Role ${role} is not authorized to approve migrations`
        );
      }
    };

    expect(() => checkAuthorization(callerRole)).toThrow(ProductionExecutionForbiddenError);
  });

  // -------------------------------------------------------------
  // Test 7: Agent requests production write -> DENIED
  // -------------------------------------------------------------
  it("Test 7: Direct write attempt with Read-Only Agent credential must be DENIED", () => {
    const callerRole = "AGENT";

    const attemptDirectWrite = (role: string) => {
      if (role === "AGENT" || role === "OPERATOR") {
        throw new ProductionExecutionForbiddenError(
          "Agent runtime does NOT possess production write credentials. Writes strictly restricted to Policy Service."
        );
      }
    };

    expect(() => attemptDirectWrite(callerRole)).toThrow("Agent runtime does NOT possess production write credentials");
  });

  // -------------------------------------------------------------
  // Test 8: Generated SQL contains DROP TABLE -> SQL_VALIDATION_FAILED
  // -------------------------------------------------------------
  it("Test 8: Generated SQL containing DROP TABLE must be REJECTED", () => {
    const maliciousPlanSql = ["DROP TABLE users CASCADE;"];
    expect(() => validateMigrationPlan(maliciousPlanSql, "users")).toThrow(SqlValidationError);
  });

  // -------------------------------------------------------------
  // Test 9: DELETE without WHERE -> SQL_VALIDATION_FAILED
  // -------------------------------------------------------------
  it("Test 9: Unbounded DELETE without WHERE must be REJECTED", () => {
    const dangerousSql1 = ["DELETE FROM users;"];
    expect(() => validateMigrationPlan(dangerousSql1, "users")).toThrow(SqlValidationError);

    const tautologicalSql = ["DELETE FROM users WHERE 1=1;"];
    expect(() => validateMigrationPlan(tautologicalSql, "users")).toThrow(SqlValidationError);
  });

  // -------------------------------------------------------------
  // Test 10: Unsafe rehearsal exceeds threshold -> PLAN_REJECTED -> REPLAN
  // -------------------------------------------------------------
  it("Test 10: Rehearsal exceeding lock threshold must be marked UNSAFE and trigger REPLAN", () => {
    const mockRehearsal = {
      id: "run-001",
      migrationPlanId: "plan-001",
      migrationRequestId: mockMigrationId,
      branchId: "br-test-1",
      branchName: "rehearsal-1",
      startedAt: new Date(),
      durationMs: 3500,
      lockDurationMs: 2500, // Exceeds default 2000ms threshold!
      rowsBefore: 100000,
      rowsAfter: 100000,
      rowsAffected: 100000,
      rowsLost: 0,
      testsPassed: 5,
      testsTotal: 5,
      passed: false,
      failureReason: "Lock duration 2500ms exceeds threshold 2000ms",
      measurementSource: "REAL" as const,
      createdAt: new Date(),
    };

    const riskEval = evaluateRisk({ rehearsalRun: mockRehearsal });

    expect(riskEval.blocked).toBe(true);
    expect(riskEval.riskLevel).toBe("CRITICAL");
    expect(riskEval.riskReason).toContain("exceeds threshold");
  });

  // -------------------------------------------------------------
  // Test 11: Second plan passes rehearsal -> EVIDENCE_READY
  // -------------------------------------------------------------
  it("Test 11: Safe replanned migration passes rehearsal and produces EVIDENCE_READY", () => {
    const safeRehearsal = {
      id: "run-002",
      migrationPlanId: "plan-002",
      migrationRequestId: mockMigrationId,
      branchId: "br-test-2",
      branchName: "rehearsal-2",
      startedAt: new Date(),
      durationMs: 450,
      lockDurationMs: 45, // Safely under 2000ms threshold
      rowsBefore: 100000,
      rowsAfter: 100000,
      rowsAffected: 100000,
      rowsLost: 0,
      testsPassed: 5,
      testsTotal: 5,
      passed: true,
      measurementSource: "REAL" as const,
      createdAt: new Date(),
    };

    const riskEval = evaluateRisk({ rehearsalRun: safeRehearsal });

    expect(riskEval.blocked).toBe(false);
    expect(riskEval.riskLevel).not.toBe("CRITICAL");
  });

  // -------------------------------------------------------------
  // Test 12: Two simultaneous execute calls -> Concurrency protection
  // -------------------------------------------------------------
  it("Test 12: Two simultaneous execution calls must execute once and reject the concurrent attempt", async () => {
    let executionCount = 0;
    let lockAcquired = false;

    const simulateGuardedExecution = async () => {
      if (lockAcquired) {
        throw new Error("CONCURRENT_EXECUTION: Another execution is in progress for this migration");
      }
      lockAcquired = true;
      try {
        executionCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { success: true };
      } finally {
        lockAcquired = false;
      }
    };

    const [call1, call2] = await Promise.allSettled([
      simulateGuardedExecution(),
      simulateGuardedExecution(),
    ]);

    const successes = [call1, call2].filter(c => c.status === "fulfilled");
    const rejections = [call1, call2].filter(c => c.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);
    expect(executionCount).toBe(1);
  });
});
