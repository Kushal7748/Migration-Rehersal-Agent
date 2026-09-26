// ============================================================
// MIGR8 Core Domain Types
// ============================================================

export type MigrationState =
  | "INTAKE"
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
  | "BLOCKED"
  | "CANCELLED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type EvidenceFieldProvenance =
  | "OBSERVED_FACT"
  | "INFERENCE"
  | "ESTIMATE"
  | "MODEL_SUGGESTION";

export type ActorType = "SYSTEM" | "AGENT" | "HUMAN" | "POLICY_SERVICE";

export type UserRole = "ADMIN" | "OPERATOR" | "APPROVER" | "VIEWER";

export type ApprovalAction = "APPROVE" | "REJECT";

export type VerificationStatus = "PASS" | "FAIL" | "PARTIAL" | "PENDING";

export type ModelTaskClass =
  | "INTENT_PARSING"
  | "DATABASE_INVESTIGATION"
  | "MIGRATION_PLANNING"
  | "INDEPENDENT_CRITIQUE"
  | "EVIDENCE_SUMMARY"
  | "MULTILINGUAL_SUMMARY";

export interface MigrationRequest {
  id: string;
  createdBy: string;
  requestText: string;
  targetDatabase: string;
  targetBranch: string;
  targetTable?: string;
  status: MigrationState;
  currentPlanVersion: number;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface SchemaSnapshot {
  id: string;
  migrationRequestId: string;
  tables: TableInfo[];
  fingerprint: string;
  capturedAt: Date;
  rawJson: Record<string, unknown>;
}

export interface TableInfo {
  name: string;
  schema: string;
  rowCount: number;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKeyInfo[];
  constraints: ConstraintInfo[];
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isConcurrent: boolean;
  definition: string;
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface ConstraintInfo {
  name: string;
  type: string;
  definition: string;
  isValid: boolean;
}

export interface MigrationPlan {
  id: string;
  migrationRequestId: string;
  version: number;
  proposedSql: string[];
  rollbackSql: string[];
  strategyNotes: string;
  assumptions: string[];
  riskHint: RiskLevel;
  plannerModel: string;
  criticModel?: string;
  validationStatus: "PENDING" | "APPROVED_FOR_REHEARSAL" | "REJECTED";
  criticFeedback?: CriticFeedback;
  checks?: MigrationPlanChecks;
  createdAt: Date;
}

export interface MigrationPlanChecks {
  dangerousOperationDetected: boolean;
  allowlistPassed: boolean;
  targetMatchPassed: boolean;
  whereClauseCheckPassed: boolean;
  dependencyCheckPassed: boolean;
  multiTableCheckPassed: boolean;
}

export interface CriticFeedback {
  approvedForRehearsal: boolean;
  blockingIssues: string[];
  nonBlockingIssues: string[];
  recommendedChanges: string[];
}

export interface RehearsalRun {
  id: string;
  migrationPlanId: string;
  migrationRequestId: string;
  branchId: string;
  branchName: string;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  lockDurationMs?: number;
  rowsBefore: number;
  rowsAfter?: number;
  rowsAffected?: number;
  rowsLost?: number;
  walGrowthBytes?: number;
  testsPassed: number;
  testsTotal: number;
  passed: boolean;
  failureReason?: string;
  measurementSource: "REAL" | "DEMO_INJECTION";
}

export interface RehearsalStatement {
  id: string;
  rehearsalRunId: string;
  statementIndex: number;
  sqlHash: string;
  statementType: string;
  sql: string;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  rowsAffected?: number;
  lockDurationMs?: number;
  success: boolean;
  error?: string;
  explainOutput?: unknown;
}

export interface EvidencePack {
  id: string;
  evidenceId: string;
  migrationRequestId: string;
  migrationPlanId: string;
  rehearsalRunId: string;
  riskLevel: RiskLevel;
  riskReason: string;
  riskScore: number;
  summary: string;
  rollbackRehearsed: boolean;
  isStale: boolean;
  sourceSchemaFingerprint: string;
  currentSchemaFingerprint?: string;
  rawJson: Record<string, unknown>;
  createdAt: Date;
}

export interface EvidenceField {
  id: string;
  evidencePackId: string;
  fieldPath: string;
  value: unknown;
  provenance: EvidenceFieldProvenance;
  source: string;
}

export interface Approval {
  id: string;
  evidenceId: string;
  migrationRequestId: string;
  approverId: string;
  action: ApprovalAction;
  issuedAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  used: boolean;
  decision?: string;
  tokenHash: string;
  nonce: string;
  requestContext: Record<string, unknown>;
}

export interface ModelRoutingLog {
  id: string;
  migrationRequestId?: string;
  taskClass: ModelTaskClass;
  selectedModel: string;
  provider: string;
  reason: string;
  capabilitiesRequired: string[];
  fallbackModel?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  status: "SUCCESS" | "FALLBACK_USED" | "FAILED";
  errorCode?: string;
  createdAt: Date;
}

export interface VerificationRun {
  id: string;
  migrationRequestId: string;
  rehearsalRunId?: string;
  expectedSchema: unknown;
  actualSchema: unknown;
  expectedRowCount: number;
  actualRowCount: number;
  expectedIndexes: unknown;
  actualIndexes: unknown;
  constraintStatus: unknown;
  verificationStatus: VerificationStatus;
  mismatches: string[];
  completedAt?: Date;
}

export interface StateTransitionLog {
  id: string;
  migrationRequestId: string;
  fromState: MigrationState;
  toState: MigrationState;
  actor: string;
  actorType: ActorType;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface AuditLog {
  id: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  migrationRequestId?: string;
  evidenceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// Structured intent from natural language
export interface ParsedIntent {
  operation: "schema_change" | "data_change" | "index_change" | "constraint_change" | "mixed";
  targetTable: string;
  requestedChanges: IntentChange[];
  rawText: string;
}

export interface IntentChange {
  type: "add_column" | "drop_column" | "modify_column" | "add_index" | "drop_index" | "backfill" | "add_constraint" | "drop_constraint";
  name?: string;
  targetColumn?: string;
  dataType?: string;
  details?: Record<string, unknown>;
}
