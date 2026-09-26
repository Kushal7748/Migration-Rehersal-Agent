-- ============================================================
-- MIGR8 Control Plane Schema — Migration 007
-- Verification runs post-execution
-- ============================================================

CREATE TABLE IF NOT EXISTS verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_request_id UUID NOT NULL REFERENCES migration_requests(id),
  migration_plan_id UUID REFERENCES migration_plans(id),
  expected_schema JSONB,
  actual_schema JSONB,
  expected_row_count BIGINT,
  actual_row_count BIGINT,
  expected_indexes JSONB,
  actual_indexes JSONB,
  constraint_status JSONB,
  verification_status verification_status NOT NULL DEFAULT 'PENDING',
  mismatches JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_runs_migration ON verification_runs(migration_request_id, created_at DESC);
