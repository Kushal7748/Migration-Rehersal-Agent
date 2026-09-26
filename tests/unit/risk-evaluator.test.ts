// ============================================================
// MIGR8 Risk Evaluator Unit Tests
// Tests lock duration thresholds, data loss detection, scoring
// ============================================================

import { describe, it, expect } from "vitest";
import { evaluateRisk } from "../../risk-engine/evaluator/index.js";

describe("MIGR8 Risk Evaluator", () => {
  const baseRehearsal = {
    id: "run-test",
    migrationPlanId: "plan-test",
    migrationRequestId: "mig-test",
    branchId: "branch-test",
    branchName: "rehearsal-test",
    startedAt: new Date(),
    durationMs: 500,
    lockDurationMs: 80,
    rowsBefore: 50000,
    rowsAfter: 50000,
    rowsAffected: 100, // Minimal affected rows
    rowsLost: 0,
    testsPassed: 5,
    testsTotal: 5,
    passed: true,
    measurementSource: "REAL" as const,
    createdAt: new Date(),
  };

  it("marks low risk when lock duration is minimal and no data loss", () => {
    const result = evaluateRisk({ rehearsalRun: baseRehearsal, rollbackAvailable: true });
    expect(result.blocked).toBe(false);
    expect(result.riskLevel).toBe("LOW");
    expect(result.riskScore).toBeLessThan(0.4);
  });

  it("blocks and marks CRITICAL when lock duration exceeds threshold", () => {
    const result = evaluateRisk({
      rehearsalRun: {
        ...baseRehearsal,
        lockDurationMs: 2500, // Exceeds default 2000ms threshold
        passed: false,
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.riskLevel).toBe("CRITICAL");
    expect(result.riskReason).toContain("Measured lock duration 2500ms exceeds policy threshold");
  });

  it("blocks and marks CRITICAL when row loss is detected", () => {
    const result = evaluateRisk({
      rehearsalRun: {
        ...baseRehearsal,
        rowsBefore: 50000,
        rowsAfter: 48000,
        rowsLost: 2000, // 2000 rows lost!
        passed: false,
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.riskLevel).toBe("CRITICAL");
    expect(result.riskReason).toContain("2000 rows were lost during rehearsal");
  });
});
