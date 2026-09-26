-- ============================================================
-- MIGR8 Control Plane Schema — Migration 005
-- Evidence packs with provenance-tagged fields
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  migration_request_id UUID NOT NULL REFERENCES migration_requests(id),
  migration_plan_id UUID NOT NULL REFERENCES migration_plans(id),
  rehearsal_run_id UUID NOT NULL REFERENCES rehearsal_runs(id),
  risk_level risk_level NOT NULL,
  risk_reason TEXT NOT NULL,
  risk_score FLOAT NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  rollback_rehearsed BOOLEAN NOT NULL DEFAULT FALSE,
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  source_schema_fingerprint TEXT NOT NULL,
  current_schema_fingerprint TEXT,
  raw_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_packs_migration ON evidence_packs(migration_request_id, created_at DESC);
CREATE INDEX idx_evidence_packs_evidence_id ON evidence_packs(evidence_id);

-- Evidence fields with provenance tracking
CREATE TABLE IF NOT EXISTS evidence_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_pack_id UUID NOT NULL REFERENCES evidence_packs(id),
  field_path TEXT NOT NULL,
  value JSONB,
  provenance evidence_provenance NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_fields_pack ON evidence_fields(evidence_pack_id);
