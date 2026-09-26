// ============================================================
// MIGR8 Domain Error Types
// ============================================================

export type DomainErrorCode =
  | "INVALID_STATE_TRANSITION"
  | "SCHEMA_DISCOVERY_FAILED"
  | "SQL_VALIDATION_FAILED"
  | "UNSAFE_MIGRATION"
  | "REHEARSAL_FAILED"
  | "RISK_THRESHOLD_EXCEEDED"
  | "MAX_REPLAN_ATTEMPTS"
  | "EVIDENCE_NOT_FOUND"
  | "EVIDENCE_STALE"
  | "APPROVAL_FORBIDDEN"
  | "APPROVAL_TOKEN_INVALID"
  | "APPROVAL_TOKEN_EXPIRED"
  | "APPROVAL_TOKEN_REPLAY"
  | "PRODUCTION_EXECUTION_FORBIDDEN"
  | "PRODUCTION_EXECUTION_FAILED"
  | "VERIFICATION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_TIMEOUT"
  | "CONTEXT_OVERFLOW"
  | "MALFORMED_RESPONSE"
  | "MIGRATION_NOT_FOUND"
  | "MIGRATION_PLAN_NOT_FOUND"
  | "CONCURRENT_EXECUTION"
  | "CONFIGURATION_ERROR"
  | "DATABASE_ERROR"
  | "NEON_CLIENT_ERROR"
  | "AUTHORIZATION_ERROR"
  | "AUTHENTICATION_ERROR";

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  INVALID_STATE_TRANSITION: 409,
  SCHEMA_DISCOVERY_FAILED: 500,
  SQL_VALIDATION_FAILED: 422,
  UNSAFE_MIGRATION: 422,
  REHEARSAL_FAILED: 500,
  RISK_THRESHOLD_EXCEEDED: 422,
  MAX_REPLAN_ATTEMPTS: 422,
  EVIDENCE_NOT_FOUND: 404,
  EVIDENCE_STALE: 409,
  APPROVAL_FORBIDDEN: 403,
  APPROVAL_TOKEN_INVALID: 401,
  APPROVAL_TOKEN_EXPIRED: 401,
  APPROVAL_TOKEN_REPLAY: 401,
  PRODUCTION_EXECUTION_FORBIDDEN: 403,
  PRODUCTION_EXECUTION_FAILED: 500,
  VERIFICATION_FAILED: 500,
  MODEL_UNAVAILABLE: 503,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_AUTH_FAILED: 503,
  PROVIDER_TIMEOUT: 504,
  CONTEXT_OVERFLOW: 422,
  MALFORMED_RESPONSE: 502,
  MIGRATION_NOT_FOUND: 404,
  MIGRATION_PLAN_NOT_FOUND: 404,
  CONCURRENT_EXECUTION: 409,
  CONFIGURATION_ERROR: 500,
  DATABASE_ERROR: 500,
  NEON_CLIENT_ERROR: 503,
  AUTHORIZATION_ERROR: 403,
  AUTHENTICATION_ERROR: 401,
};

export class Migr8Error extends Error {
  public readonly code: DomainErrorCode;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: DomainErrorCode,
    message: string,
    details?: Record<string, unknown>,
    isOperational = true
  ) {
    super(message);
    this.name = "Migr8Error";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code] ?? 500;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export class InvalidStateTransitionError extends Migr8Error {
  constructor(from: string, to: string, reason?: string) {
    super(
      "INVALID_STATE_TRANSITION",
      `Cannot transition from ${from} to ${to}${reason ? `: ${reason}` : ""}`,
      { from, to, reason }
    );
  }
}

export class ApprovalTokenError extends Migr8Error {
  constructor(
    code: "APPROVAL_TOKEN_INVALID" | "APPROVAL_TOKEN_EXPIRED" | "APPROVAL_TOKEN_REPLAY",
    message: string
  ) {
    super(code, message);
  }
}

export class EvidenceStaleError extends Migr8Error {
  constructor(sourceFingerprint: string, currentFingerprint: string) {
    super(
      "EVIDENCE_STALE",
      "Evidence is stale: schema has changed since rehearsal. Re-rehearsal required.",
      { sourceFingerprint, currentFingerprint }
    );
  }
}

export class SqlValidationError extends Migr8Error {
  constructor(message: string, violations: string[]) {
    super("SQL_VALIDATION_FAILED", message, { violations });
  }
}

export class ProductionExecutionForbiddenError extends Migr8Error {
  constructor(reason: string) {
    super("PRODUCTION_EXECUTION_FORBIDDEN", `Production execution forbidden: ${reason}`);
  }
}
