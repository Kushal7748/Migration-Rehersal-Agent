-- ============================================================
-- MIGR8 Control Plane Schema — Migration 002
-- Schema snapshots with fingerprinting
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_request_id UUID NOT NULL REFERENCES migration_requests(id),
  fingerprint TEXT NOT NULL,
  tables JSONB NOT NULL DEFAULT '[]',
  raw_json JSONB NOT NULL DEFAULT '{}',
  estimated_total_rows BIGINT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schema_snapshots_migration ON schema_snapshots(migration_request_id, captured_at DESC);
CREATE INDEX idx_schema_snapshots_fingerprint ON schema_snapshots(fingerprint);
