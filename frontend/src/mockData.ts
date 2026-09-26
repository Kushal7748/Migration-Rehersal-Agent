// ============================================================
// MIGR8 Standalone Mock Dataset (TrueForge UI Verification)
// Used when standalone preview mode is enabled prior to backend integration verification
// ============================================================

import type {
  RehearsalRun,
  EvidencePack,
  ApprovalTokenRecord,
  ModelRoutingMetric,
  AuditLogEntry,
} from "./types";

export const MOCK_MIGRATION_REQUEST = {
  id: "mig-77b312a0-4f9e-4c31-901d",
  requestText: "Add fraud_score to users table and backfill existing active users.",
  targetTable: "users",
  targetBranch: "main",
  currentState: "EVIDENCE_READY" as const,
  createdAt: "2026-09-26T14:30:00.000Z",
  updatedAt: "2026-09-26T14:32:45.000Z",
};

export const MOCK_NAIVE_PLAN = {
  version: 1,
  strategy: "NAIVE_FULL_TABLE_ALTER",
  sql: [
    "ALTER TABLE users ADD COLUMN fraud_score NUMERIC(5,2) DEFAULT 0.0 NOT NULL;",
    "UPDATE users SET fraud_score = 10.0 WHERE status = 'active';",
  ],
  riskHint: "HIGH",
  lockEstimateMs: 3800,
};

export const MOCK_SAFE_PLAN = {
  version: 2,
  strategy: "PHASED_NULLABLE_CHUNKED_BACKFILL",
  sql: [
    "ALTER TABLE users ADD COLUMN fraud_score NUMERIC(5,2);",
    "UPDATE users SET fraud_score = 0.0 WHERE fraud_score IS NULL;",
    "CREATE INDEX CONCURRENTLY idx_users_fraud_score ON users(fraud_score);",
  ],
  rollbackSql: [
    "DROP INDEX CONCURRENTLY IF EXISTS idx_users_fraud_score;",
    "ALTER TABLE users DROP COLUMN IF EXISTS fraud_score;",
  ],
  riskHint: "LOW",
  lockEstimateMs: 48,
};

export const MOCK_REHEARSAL_RUNS: RehearsalRun[] = [
  {
    id: "run-001",
    planVersion: 1,
    branchName: "rehearsal-mig-77b3-v1",
    durationMs: 4200,
    lockDurationMs: 3800,
    rowsBefore: 100000,
    rowsAfter: 100000,
    rowsAffected: 100000,
    rowsLost: 0,
    testsPassed: 4,
    testsTotal: 5,
    passed: false,
    failureReason: "Measured lock duration 3800ms exceeds policy threshold 2000ms",
    measurementSource: "REAL",
    createdAt: "2026-09-26T14:30:45.000Z",
  },
  {
    id: "run-002",
    planVersion: 2,
    branchName: "rehearsal-mig-77b3-v2",
    durationMs: 620,
    lockDurationMs: 48,
    rowsBefore: 100000,
    rowsAfter: 100000,
    rowsAffected: 100,
    rowsLost: 0,
    testsPassed: 5,
    testsTotal: 5,
    passed: true,
    measurementSource: "REAL",
    createdAt: "2026-09-26T14:32:10.000Z",
  },
];

export const MOCK_EVIDENCE_PACK: EvidencePack = {
  evidenceId: "ev-a910bf23-882e-40f1-9c88-123456789abc",
  migrationRequestId: MOCK_MIGRATION_REQUEST.id,
  planVersion: 2,
  riskLevel: "LOW",
  riskScore: 0.12,
  riskReason: "Lock duration 48ms is safely below policy threshold (2000ms). Zero data loss verified.",
  blocked: false,
  rollbackRehearsed: true,
  sourceSchemaFingerprint: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  summary: "Verified 3-step phased migration on 100,000 users. Lock held for 48ms (<2000ms threshold). All 5 validation tests passed.",
  fields: [
    {
      path: "rehearsal.lock_duration_ms",
      value: 48,
      provenance: "OBSERVED_FACT",
      source: "Neon COW Rehearsal Branch: rehearsal-mig-77b3-v2",
    },
    {
      path: "rehearsal.rows_lost",
      value: 0,
      provenance: "OBSERVED_FACT",
      source: "Post-Rehearsal Data Integrity Check",
    },
    {
      path: "risk.lock_threshold_eval",
      value: "PASS (48ms < 2000ms)",
      provenance: "INFERENCE",
      source: "Deterministic Postgres Safety Engine",
    },
    {
      path: "schema.source_fingerprint",
      value: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      provenance: "OBSERVED_FACT",
      source: "Neon Read-Only Schema Inspector",
    },
  ],
};

export const MOCK_APPROVAL_TOKEN: ApprovalTokenRecord = {
  token: "eyJldmlkZW5jZUlkIjoiZXYtYTkxMGJmMjMifQ.3f9a72b8c9d01e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
  tokenHashPrefix: "3f9a72b8",
  evidenceId: MOCK_EVIDENCE_PACK.evidenceId,
  migrationId: MOCK_MIGRATION_REQUEST.id,
  approverId: "security-lead@company.com",
  action: "APPROVE",
  issuedAt: "2026-09-26T14:35:00.000Z",
  expiresAt: "2026-09-26T14:37:00.000Z",
  used: false,
};

export const MOCK_MODEL_METRICS: ModelRoutingMetric[] = [
  {
    taskClass: "INTENT_PARSING",
    selectedModel: "gpt-4o-mini",
    provider: "TrueFoundry AI Gateway",
    inputTokens: 320,
    outputTokens: 120,
    latencyMs: 180,
    costUsd: 0.00012,
    status: "SUCCESS",
  },
  {
    taskClass: "MIGRATION_PLANNING",
    selectedModel: "claude-3-5-sonnet-20241022",
    provider: "TrueFoundry AI Gateway",
    inputTokens: 1450,
    outputTokens: 680,
    latencyMs: 820,
    costUsd: 0.0145,
    status: "SUCCESS",
  },
  {
    taskClass: "INDEPENDENT_CRITIQUE",
    selectedModel: "claude-3-opus-20240229",
    provider: "TrueFoundry AI Gateway",
    inputTokens: 1890,
    outputTokens: 420,
    latencyMs: 1100,
    costUsd: 0.0248,
    status: "SUCCESS",
  },
];

export const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "aud-001",
    actorType: "HUMAN",
    actorId: "operator@company.com",
    action: "MIGRATION_REQUEST_CREATED",
    timestamp: "2026-09-26T14:30:00.000Z",
    metadata: { requestText: "Add fraud_score to users table" },
  },
  {
    id: "aud-002",
    actorType: "AGENT",
    actorId: "migr8-planner",
    action: "SCHEMA_DISCOVERED",
    timestamp: "2026-09-26T14:30:15.000Z",
    metadata: { fingerprint: "sha256:e3b0c442...", tableCount: 3 },
  },
  {
    id: "aud-003",
    actorType: "SYSTEM",
    actorId: "risk-engine",
    action: "REHEARSAL_FAILED",
    timestamp: "2026-09-26T14:30:45.000Z",
    metadata: { planVersion: 1, lockDurationMs: 3800, threshold: 2000 },
  },
  {
    id: "aud-004",
    actorType: "AGENT",
    actorId: "migr8-planner",
    action: "REPLAN_COMPLETED",
    timestamp: "2026-09-26T14:31:30.000Z",
    metadata: { planVersion: 2, strategy: "PHASED_NULLABLE_CHUNKED_BACKFILL" },
  },
  {
    id: "aud-005",
    actorType: "SYSTEM",
    actorId: "rehearsal-runner",
    action: "REHEARSAL_PASSED",
    timestamp: "2026-09-26T14:32:10.000Z",
    metadata: { planVersion: 2, lockDurationMs: 48, testsPassed: 5 },
  },
  {
    id: "aud-006",
    actorType: "HUMAN",
    actorId: "security-lead@company.com",
    action: "APPROVAL_GRANTED",
    timestamp: "2026-09-26T14:35:00.000Z",
    metadata: { evidenceId: "ev-a910bf23...", tokenHashPrefix: "3f9a72b8" },
  },
];
