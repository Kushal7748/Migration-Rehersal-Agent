-- ============================================================
-- MIGR8 Control Plane Schema — Migration 003
-- Migration plans and deterministic plan checks
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_request_id UUID NOT NULL REFERENCES migration_requests(id),
  schema_snapshot_id UUID REFERENCES schema_snapshots(id),
  version INT NOT NULL,
  proposed_sql JSONB NOT NULL DEFAULT '[]',
  rollback_sql JSONB NOT NULL DEFAULT '[]',
  strategy_notes TEXT NOT NULL DEFAULT '',
  assumptions JSONB NOT NULL DEFAULT '[]',
  risk_hint risk_level NOT NULL DEFAULT 'MEDIUM',
  planner_model TEXT NOT NULL,
  critic_model TEXT,
  validation_status TEXT NOT NULL DEFAULT 'PENDING',
  critic_feedback JSONB,
  parsed_intent JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(migration_request_id, version)
);

CREATE INDEX idx_migration_plans_request ON migration_plans(migration_request_id, version DESC);

CREATE TABLE IF NOT EXISTS migration_plan_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_plan_id UUID NOT NULL REFERENCES migration_plans(id),
  dangerous_operation_detected BOOLEAN NOT NULL DEFAULT FALSE,
  allowlist_passed BOOLEAN NOT NULL DEFAULT FALSE,
  target_match_passed BOOLEAN NOT NULL DEFAULT FALSE,
  where_clause_check_passed BOOLEAN NOT NULL DEFAULT FALSE,
  dependency_check_passed BOOLEAN NOT NULL DEFAULT FALSE,
  multi_table_check_passed BOOLEAN NOT NULL DEFAULT FALSE,
  violations JSONB NOT NULL DEFAULT '[]',
  overall_passed BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plan_checks_plan ON migration_plan_checks(migration_plan_id);
