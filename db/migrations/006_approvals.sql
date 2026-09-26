-- ============================================================
-- MIGR8 Control Plane Schema — Migration 006
-- Approval tokens with HMAC binding
-- ============================================================

CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id TEXT NOT NULL,
  migration_request_id UUID NOT NULL REFERENCES migration_requests(id),
  approver_id UUID NOT NULL REFERENCES users(id),
  action approval_action NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  decision TEXT,
  token_hash TEXT NOT NULL UNIQUE, -- SHA256 of the signed token
  nonce TEXT NOT NULL,
  request_context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approvals_migration ON approvals(migration_request_id, issued_at DESC);
CREATE INDEX idx_approvals_token_hash ON approvals(token_hash);
CREATE INDEX idx_approvals_evidence ON approvals(evidence_id);
-- Ensure one unused approval per migration at a time
CREATE UNIQUE INDEX idx_approvals_active ON approvals(migration_request_id) WHERE NOT used AND action = 'APPROVE';
