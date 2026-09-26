-- ============================================================
-- MIGR8 Control Plane Schema — Migration 008
-- Model routing logs and cost accounting
-- ============================================================

CREATE TABLE IF NOT EXISTS model_routing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_request_id UUID REFERENCES migration_requests(id),
  task_class model_task_class NOT NULL,
  selected_model TEXT NOT NULL,
  provider TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  capabilities_required JSONB NOT NULL DEFAULT '[]',
  fallback_model TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  estimated_cost_usd FLOAT NOT NULL DEFAULT 0,
  actual_cost_usd FLOAT,
  retry_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FALLBACK_USED', 'FAILED')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_model_routing_migration ON model_routing_log(migration_request_id, created_at DESC);
CREATE INDEX idx_model_routing_task_class ON model_routing_log(task_class, created_at DESC);
CREATE INDEX idx_model_routing_provider ON model_routing_log(provider, created_at DESC);

-- Benchmark runs for baseline vs optimized comparison
CREATE TABLE IF NOT EXISTS benchmark_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('BASELINE', 'OPTIMIZED')),
  scenario TEXT NOT NULL,
  total_tokens INT NOT NULL DEFAULT 0,
  total_cost_usd FLOAT NOT NULL DEFAULT 0,
  total_latency_ms BIGINT NOT NULL DEFAULT 0,
  total_tool_calls INT NOT NULL DEFAULT 0,
  total_retries INT NOT NULL DEFAULT 0,
  total_failures INT NOT NULL DEFAULT 0,
  migration_succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_benchmark_runs_mode ON benchmark_runs(mode, started_at DESC);
