-- ============================================================
-- MIGR8 Control Plane Schema — Migration 004
-- Rehearsal runs and per-statement measurements
-- ============================================================

CREATE TABLE IF NOT EXISTS rehearsal_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_plan_id UUID NOT NULL REFERENCES migration_plans(id),
  migration_request_id UUID NOT NULL REFERENCES migration_requests(id),
  branch_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms BIGINT,
  lock_duration_ms BIGINT,
  rows_before BIGINT NOT NULL DEFAULT 0,
  rows_after BIGINT,
  rows_affected BIGINT,
  rows_lost BIGINT DEFAULT 0,
  wal_growth_bytes BIGINT,
  tests_passed INT NOT NULL DEFAULT 0,
  tests_total INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,
  measurement_source TEXT NOT NULL DEFAULT 'REAL' CHECK (measurement_source IN ('REAL', 'DEMO_INJECTION')),
  schema_diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rehearsal_runs_plan ON rehearsal_runs(migration_plan_id);
CREATE INDEX idx_rehearsal_runs_request ON rehearsal_runs(migration_request_id, started_at DESC);

CREATE TABLE IF NOT EXISTS rehearsal_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rehearsal_run_id UUID NOT NULL REFERENCES rehearsal_runs(id),
  statement_index INT NOT NULL,
  sql_hash TEXT NOT NULL,
  statement_type TEXT NOT NULL,
  sql_text TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_ms BIGINT,
  rows_affected BIGINT,
  lock_duration_ms BIGINT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  explain_output JSONB
);

CREATE INDEX idx_rehearsal_statements_run ON rehearsal_statements(rehearsal_run_id, statement_index);
