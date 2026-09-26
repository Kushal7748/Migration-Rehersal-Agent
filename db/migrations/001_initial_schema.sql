-- ============================================================
-- MIGR8 Control Plane Schema — Migration 001
-- Initial schema: migration_requests, state_transition_log, audit_log
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE migration_state AS ENUM (
  'INTAKE', 'DISCOVERING', 'PLANNING', 'CRITIQUING', 'REHEARSING',
  'RISK_EVALUATION', 'REPLANNING', 'EVIDENCE_READY', 'AWAITING_APPROVAL',
  'APPROVED', 'POLICY_VALIDATION', 'EXECUTING', 'VERIFYING', 'COMPLETE',
  'FAILED', 'REJECTED', 'STALE', 'BLOCKED', 'CANCELLED'
);

CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE evidence_provenance AS ENUM (
  'OBSERVED_FACT', 'INFERENCE', 'ESTIMATE', 'MODEL_SUGGESTION'
);

CREATE TYPE actor_type AS ENUM ('SYSTEM', 'AGENT', 'HUMAN', 'POLICY_SERVICE');

CREATE TYPE user_role AS ENUM ('ADMIN', 'OPERATOR', 'APPROVER', 'VIEWER');

CREATE TYPE approval_action AS ENUM ('APPROVE', 'REJECT');

CREATE TYPE verification_status AS ENUM ('PASS', 'FAIL', 'PARTIAL', 'PENDING');

CREATE TYPE model_task_class AS ENUM (
  'INTENT_PARSING', 'DATABASE_INVESTIGATION', 'MIGRATION_PLANNING',
  'INDEPENDENT_CRITIQUE', 'EVIDENCE_SUMMARY', 'MULTILINGUAL_SUMMARY'
);

-- Users / Auth
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'VIEWER',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration Requests
CREATE TABLE IF NOT EXISTS migration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id),
  request_text TEXT NOT NULL,
  target_database TEXT NOT NULL,
  target_branch TEXT NOT NULL DEFAULT 'main',
  target_table TEXT,
  status migration_state NOT NULL DEFAULT 'INTAKE',
  current_plan_version INT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_migration_requests_status ON migration_requests(status);
CREATE INDEX idx_migration_requests_created_by ON migration_requests(created_by);
CREATE INDEX idx_migration_requests_created_at ON migration_requests(created_at DESC);

-- State Transition Log (append-only)
CREATE TABLE IF NOT EXISTS state_transition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_request_id UUID NOT NULL REFERENCES migration_requests(id),
  from_state migration_state NOT NULL,
  to_state migration_state NOT NULL,
  actor TEXT NOT NULL,
  actor_type actor_type NOT NULL,
  reason TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_state_transitions_migration ON state_transition_log(migration_request_id, timestamp DESC);

-- Audit Log (append-only, immutable)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  migration_request_id UUID REFERENCES migration_requests(id),
  evidence_id UUID,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_migration ON audit_log(migration_request_id, timestamp DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, timestamp DESC);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);

-- Idempotency Keys (for API deduplication)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  migration_request_id UUID REFERENCES migration_requests(id),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
