// ============================================================
// MIGR8 Frontend Domain & State Types
// ============================================================

export type ViewTab =
  | "rehearsals"
  | "evidence"
  | "policy"
  | "inspector"
  | "models"
  | "verification"
  | "settings";

export type SubTab =
  | "overview"
  | "live"
  | "state-machine"
  | "models-catalog"
  | "connectors"
  | "skills"
  | "sandbox-providers"
  | "audit";

export type MigrationState =
  | "INTAKE"
  | "DISCOVER"
  | "DISCOVERING"
  | "PLANNING"
  | "CRITIQUING"
  | "REHEARSING"
  | "RISK_EVALUATION"
  | "REPLANNING"
  | "EVIDENCE_READY"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "POLICY_VALIDATION"
  | "EXECUTING"
  | "VERIFYING"
  | "COMPLETE"
  | "FAILED"
  | "REJECTED"
  | "STALE"
  | "BLOCKED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RehearsalRun {
  id: string;
  planVersion: number;
  branchName: string;
  durationMs: number;
  lockDurationMs: number;
  rowsBefore: number;
  rowsAfter: number;
  rowsAffected: number;
  rowsLost: number;
  testsPassed: number;
  testsTotal: number;
  passed: boolean;
  failureReason?: string;
  measurementSource: "REAL" | "DEMO_INJECTION";
  createdAt: string;
}

export interface EvidenceField {
  path: string;
  value: unknown;
  provenance: "OBSERVED_FACT" | "INFERENCE" | "ESTIMATE" | "MODEL_SUGGESTION";
  source: string;
}

export interface EvidencePack {
  evidenceId: string;
  migrationRequestId: string;
  planVersion: number;
  riskLevel: RiskLevel;
  riskScore: number;
  riskReason: string;
  blocked: boolean;
  rollbackRehearsed: boolean;
  sourceSchemaFingerprint: string;
  summary: string;
  fields: EvidenceField[];
}

export interface ApprovalTokenRecord {
  token: string;
  tokenHashPrefix: string;
  evidenceId: string;
  migrationId: string;
  approverId: string;
  action: "APPROVE" | "REJECT";
  issuedAt: string;
  expiresAt: string;
  used: boolean;
}

export interface ModelRoutingMetric {
  taskClass: string;
  selectedModel: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  status: "SUCCESS" | "FALLBACK";
}

export interface AuditLogEntry {
  id: string;
  actorType: "SYSTEM" | "AGENT" | "HUMAN" | "POLICY_SERVICE";
  actorId: string;
  action: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}
