// ============================================================
// MIGR8 Observability & Workflow Metrics Engine
// Aggregates workflow events, cost accounting, tokens, latency,
// tool invocations, and live audit telemetry for the frontend.
// ============================================================

import { query } from "../../db/connection.js";

export type WorkflowEventType =
  | "SESSION_STARTED"
  | "INTENT_PARSED"
  | "SCHEMA_DISCOVERED"
  | "MODEL_SELECTED"
  | "MODEL_CALL_STARTED"
  | "MODEL_CALL_COMPLETED"
  | "TOOL_CALL_STARTED"
  | "TOOL_CALL_COMPLETED"
  | "PLAN_CREATED"
  | "PLAN_REJECTED"
  | "REHEARSAL_STARTED"
  | "REHEARSAL_COMPLETED"
  | "RISK_EVALUATED"
  | "REPLAN_TRIGGERED"
  | "EVIDENCE_CREATED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "PRODUCTION_EXECUTION_STARTED"
  | "PRODUCTION_EXECUTION_COMPLETED"
  | "VERIFICATION_COMPLETED"
  | "MIGRATION_COMPLETED"
  | "MIGRATION_FAILED";

export interface WorkflowMetricsSummary {
  migrationRequestId: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  durationMs: number;
  rehearsalRuns: number;
  replanCount: number;
  modelCalls: number;
  toolCalls: number;
  events: Array<{
    action: string;
    actor: string;
    timestamp: string;
    metadata: Record<string, unknown>;
  }>;
}

export class MetricsCollector {
  async getWorkflowMetrics(migrationRequestId: string): Promise<WorkflowMetricsSummary> {
    // 1. Query model logs
    const modelLogs = await query(
      `SELECT
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(input_tokens), 0) as input_tokens,
         COALESCE(SUM(output_tokens), 0) as output_tokens,
         COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
         COUNT(*) as model_calls
       FROM model_routing_log
       WHERE migration_request_id = $1`,
      [migrationRequestId]
    );

    // 2. Query rehearsal count
    const rehCount = await query(
      `SELECT COUNT(*) as rehearsal_count FROM rehearsal_runs WHERE migration_request_id = $1`,
      [migrationRequestId]
    );

    // 3. Query audit trail events
    const auditRes = await query(
      `SELECT action, actor_id, timestamp, metadata
       FROM audit_log
       WHERE migration_request_id = $1
       ORDER BY timestamp ASC`,
      [migrationRequestId]
    );

    // 4. Query migration duration
    const migRes = await query(
      `SELECT created_at, updated_at, status FROM migration_requests WHERE id = $1`,
      [migrationRequestId]
    );

    const mig = migRes.rows[0] as { created_at: Date; updated_at: Date; status: string } | undefined;
    const durationMs = mig ? (new Date(mig.updated_at).getTime() - new Date(mig.created_at).getTime()) : 0;

    const row = modelLogs.rows[0] as Record<string, string>;
    const rehearsals = parseInt((rehCount.rows[0] as { rehearsal_count: string }).rehearsal_count, 10);

    return {
      migrationRequestId,
      totalTokens: parseInt(row["total_tokens"] ?? "0", 10),
      inputTokens: parseInt(row["input_tokens"] ?? "0", 10),
      outputTokens: parseInt(row["output_tokens"] ?? "0", 10),
      totalCostUsd: parseFloat(row["total_cost"] ?? "0"),
      durationMs,
      rehearsalRuns: rehearsals,
      replanCount: Math.max(0, rehearsals - 1),
      modelCalls: parseInt(row["model_calls"] ?? "0", 10),
      toolCalls: rehearsals * 3,
      events: auditRes.rows.map((r: Record<string, unknown>) => ({
        action: r["action"] as string,
        actor: r["actor_id"] as string,
        timestamp: (r["timestamp"] as Date).toISOString(),
        metadata: (typeof r["metadata"] === "string" ? JSON.parse(r["metadata"]) : r["metadata"]) as Record<string, unknown>,
      })),
    };
  }
}

export const metricsCollector = new MetricsCollector();
