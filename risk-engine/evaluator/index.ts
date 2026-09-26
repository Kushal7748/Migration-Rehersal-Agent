// ============================================================
// MIGR8 Deterministic Risk Engine
// The LLM cannot override this. Risk decisions are based on
// measured rehearsal data, not model confidence.
// ============================================================

import type { RiskLevel, RehearsalRun } from "../../core/types/migration.js";

export interface RiskEvaluationInput {
  rehearsalRun: RehearsalRun;
  tableRowCount: number;
  lockDurationThresholdMs: number;
  statementCount: number;
  affectedTableCount: number;
  foreignKeyCount: number;
  indexChanges: number;
  constraintOperations: number;
  rollbackAvailable: boolean;
  modelRiskHint?: RiskLevel;
  enableDemoInjection?: boolean;
}

export interface RiskEvaluationResult {
  riskLevel: RiskLevel;
  riskScore: number; // 0.0 - 1.0
  riskReason: string;
  findings: RiskFinding[];
  blocked: boolean; // If true, must replan. Cannot proceed to approval.
  modelOverrideIgnored: boolean; // If model said lower risk, was it overridden?
}

export interface RiskFinding {
  rule: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  description: string;
  measuredValue?: number;
  threshold?: number;
}

// Threshold configuration (all configurable via environment)
export function getThresholds() {
  return {
    lockDurationMs: parseInt(process.env["LOCK_DURATION_THRESHOLD_MS"] ?? "2000"),
    largeTableRows: parseInt(process.env["LARGE_TABLE_ROW_THRESHOLD"] ?? "100000"),
    hugeTableRows: parseInt(process.env["HUGE_TABLE_ROW_THRESHOLD"] ?? "1000000"),
    maxLockHighRisk: parseInt(process.env["MAX_LOCK_HIGH_RISK_MS"] ?? "5000"),
    rowsAffectedHighPct: parseFloat(process.env["ROWS_AFFECTED_HIGH_PCT"] ?? "0.8"),
  };
}

/**
 * Evaluate risk from MEASURED rehearsal evidence.
 * This is deterministic — the LLM suggestion is recorded but cannot override blocking rules.
 */
export function evaluateRisk(input: RiskEvaluationInput): RiskEvaluationResult {
  const thresholds = getThresholds();
  const findings: RiskFinding[] = [];
  let blocked = false;
  let riskScore = 0;

  const lockMs = input.rehearsalRun.lockDurationMs ?? 0;
  const rowsAffected = input.rehearsalRun.rowsAffected ?? 0;
  const rowsBefore = input.rehearsalRun.rowsBefore ?? 0;
  const rowsLost = input.rehearsalRun.rowsLost ?? 0;
  const rehearsalPassed = input.rehearsalRun.passed;
  const measurementSource = input.rehearsalRun.measurementSource;

  // ─── BLOCKING Rules ──────────────────────────────────────────────────────
  
  // Rule 1: Lock duration exceeds policy threshold
  if (lockMs > thresholds.lockDurationMs) {
    blocked = true;
    riskScore = Math.max(riskScore, 0.85);
    findings.push({
      rule: "LOCK_DURATION_THRESHOLD",
      severity: "BLOCKING",
      description: `Measured lock duration ${lockMs}ms exceeds policy threshold ${thresholds.lockDurationMs}ms`,
      measuredValue: lockMs,
      threshold: thresholds.lockDurationMs,
    });
  }

  // Rule 2: Rehearsal explicitly failed
  if (!rehearsalPassed && input.rehearsalRun.failureReason) {
    blocked = true;
    riskScore = Math.max(riskScore, 0.9);
    findings.push({
      rule: "REHEARSAL_FAILED",
      severity: "BLOCKING",
      description: `Rehearsal failed: ${input.rehearsalRun.failureReason}`,
    });
  }

  // Rule 3: Data loss detected
  if (rowsLost > 0) {
    blocked = true;
    riskScore = Math.max(riskScore, 0.95);
    findings.push({
      rule: "DATA_LOSS_DETECTED",
      severity: "BLOCKING",
      description: `${rowsLost} rows were lost during rehearsal. Data loss is not acceptable.`,
      measuredValue: rowsLost,
    });
  }

  // ─── WARNING Rules ────────────────────────────────────────────────────────

  // Rule 4: Large table affected
  if (rowsBefore > thresholds.largeTableRows) {
    const severity = rowsBefore > thresholds.hugeTableRows ? "BLOCKING" : "WARNING";
    if (severity === "BLOCKING") {
      blocked = true;
      riskScore = Math.max(riskScore, 0.75);
    } else {
      riskScore = Math.max(riskScore, 0.5);
    }
    findings.push({
      rule: "LARGE_TABLE_OPERATION",
      severity,
      description: `Operation affects table with ${rowsBefore.toLocaleString()} rows`,
      measuredValue: rowsBefore,
      threshold: thresholds.largeTableRows,
    });
  }

  // Rule 5: High percentage of rows affected
  if (rowsBefore > 0) {
    const pct = rowsAffected / rowsBefore;
    if (pct > thresholds.rowsAffectedHighPct && rowsBefore > 1000) {
      riskScore = Math.max(riskScore, 0.6);
      findings.push({
        rule: "HIGH_ROW_PERCENTAGE",
        severity: "WARNING",
        description: `${(pct * 100).toFixed(1)}% of rows affected (${rowsAffected.toLocaleString()} of ${rowsBefore.toLocaleString()})`,
        measuredValue: pct,
        threshold: thresholds.rowsAffectedHighPct,
      });
    }
  }

  // Rule 6: Foreign key changes
  if (input.foreignKeyCount > 0) {
    riskScore = Math.max(riskScore, 0.3);
    findings.push({
      rule: "FOREIGN_KEY_CHANGES",
      severity: "WARNING",
      description: `${input.foreignKeyCount} foreign key operations detected`,
      measuredValue: input.foreignKeyCount,
    });
  }

  // Rule 7: No rollback available
  if (!input.rollbackAvailable) {
    riskScore = Math.max(riskScore, 0.4);
    findings.push({
      rule: "NO_ROLLBACK_STRATEGY",
      severity: "WARNING",
      description: "No rollback strategy available. Reversal would require manual intervention.",
    });
  }

  // Rule 8: Demo injection mode — mark clearly but keep real risk logic
  if (measurementSource === "DEMO_INJECTION") {
    findings.push({
      rule: "DEMO_INJECTION_ACTIVE",
      severity: "INFO",
      description: "⚠️ DEMO MODE: These measurements were injected for demonstration purposes, not from real Neon rehearsal.",
    });
  }

  // ─── Final Risk Level Calculation ────────────────────────────────────────
  let riskLevel: RiskLevel;
  if (blocked || riskScore >= 0.8) {
    riskLevel = "CRITICAL";
  } else if (riskScore >= 0.6) {
    riskLevel = "HIGH";
  } else if (riskScore >= 0.3) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  // Check if model hint was overridden
  const modelOverrideIgnored =
    !!input.modelRiskHint &&
    riskLevelValue(input.modelRiskHint) < riskLevelValue(riskLevel) &&
    blocked;

  const topBlocking = findings.filter((f) => f.severity === "BLOCKING");
  const riskReason =
    topBlocking.length > 0
      ? topBlocking.map((f) => f.description).join("; ")
      : findings.length > 0
        ? findings[0].description
        : "No significant risk factors detected";

  return {
    riskLevel,
    riskScore,
    riskReason,
    findings,
    blocked,
    modelOverrideIgnored,
  };
}

function riskLevelValue(level: RiskLevel): number {
  switch (level) {
    case "LOW": return 0;
    case "MEDIUM": return 1;
    case "HIGH": return 2;
    case "CRITICAL": return 3;
  }
}
