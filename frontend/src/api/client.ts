// ============================================================
// MIGR8 API Service Layer
// All frontend ↔ backend communication goes through here.
// ============================================================

const BASE_URL = "/api/v1";

// Demo auth token — in production this is a proper session token
// Using demo user format that auth middleware accepts: "demo:{userId}"
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const AUTH_TOKEN = `demo:${DEMO_USER_ID}`;

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errorMsg = body?.error?.message ?? errorMsg;
    } catch {
      // ignore parse error
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

// ── Health ──────────────────────────────────────────────────
export async function fetchHealth() {
  return apiFetch<{
    status: string;
    timestamp: string;
  }>("/health");
}

export async function fetchReadiness() {
  return apiFetch<{
    ready: boolean;
    database: string;
    config: string;
    neon_read: string;
    neon_write: string;
    execution_mode: string;
    model_gateway: string;
  }>("/ready");
}

// ── Migrations ──────────────────────────────────────────────
export async function fetchMigrations(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<{ data: MigrationRequest[] }>(`/migrations${q}`);
}

export async function fetchMigration(id: string) {
  return apiFetch<{ data: MigrationRequest }>(`/migrations/${id}`);
}

export async function createMigration(body: {
  request_text: string;
  target_database: string;
  target_branch?: string;
  target_table?: string;
}) {
  return apiFetch<{ data: MigrationRequest }>("/migrations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function discoverMigration(id: string) {
  return apiFetch<{ data: unknown }>(`/migrations/${id}/discover`, {
    method: "POST",
  });
}

export async function planMigration(id: string) {
  return apiFetch<{ data: unknown }>(`/migrations/${id}/plan`, {
    method: "POST",
  });
}

export async function rehearseMigration(id: string, plan_id?: string) {
  return apiFetch<{ data: RehearsalRun }>(`/migrations/${id}/rehearse`, {
    method: "POST",
    body: JSON.stringify({ plan_id }),
  });
}

export async function buildEvidence(id: string) {
  return apiFetch<{ data: EvidencePack }>(`/migrations/${id}/build-evidence`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approveMigration(
  id: string,
  action: "APPROVE" | "REJECT",
  reason?: string
) {
  return apiFetch<{
    data: {
      action: string;
      approvalToken: string | null;
      expiresAt: string;
      evidenceId: string;
      message: string;
    };
  }>(`/migrations/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}

export async function executeMigration(id: string, approval_token: string) {
  return apiFetch<{ data: unknown }>(`/migrations/${id}/execute`, {
    method: "POST",
    body: JSON.stringify({ approval_token }),
  });
}

export async function runFullWorkflow(id: string) {
  return apiFetch<{ data: { message: string; migrationId: string; status: string } }>(
    `/migrations/${id}/run-workflow`,
    { method: "POST" }
  );
}

// ── Per-migration sub-resources ─────────────────────────────
export async function fetchPlans(migrationId: string) {
  return apiFetch<{ data: MigrationPlan[] }>(`/migrations/${migrationId}/plans`);
}

export async function fetchRehearsals(migrationId: string) {
  return apiFetch<{ data: RehearsalRun[] }>(`/migrations/${migrationId}/rehearsals`);
}

export async function fetchEvidence(migrationId: string) {
  return apiFetch<{ data: EvidencePack | null }>(`/migrations/${migrationId}/evidence`);
}

export async function fetchAuditLog(migrationId: string) {
  return apiFetch<{ data: AuditEntry[] }>(`/migrations/${migrationId}/audit`);
}

export async function fetchTrace(migrationId: string) {
  return apiFetch<{ data: { stateTransitions: StateTransition[]; modelRoutingLog: ModelRouteLog[] } }>(
    `/migrations/${migrationId}/trace`
  );
}

export async function fetchVerification(migrationId: string) {
  return apiFetch<{ data: VerificationRun | null }>(`/migrations/${migrationId}/verification`);
}

// ── Analytics ────────────────────────────────────────────────
export async function fetchModelAnalytics() {
  return apiFetch<{ data: ModelAnalytic[] }>("/analytics/models");
}

export async function fetchCostAnalytics() {
  return apiFetch<{ data: CostAnalytic[] }>("/analytics/cost");
}

// ── Types ────────────────────────────────────────────────────
export interface MigrationRequest {
  id: string;
  created_by: string;
  request_text: string;
  target_database: string;
  target_branch: string;
  target_table: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MigrationPlan {
  id: string;
  migration_request_id: string;
  version: number;
  strategy: string;
  description: string;
  sql_statements: string[];
  rollback_sql: string[];
  risk_level: string;
  risk_score: number;
  created_at: string;
}

export interface RehearsalRun {
  id: string;
  migration_request_id: string;
  migration_plan_id: string;
  branch_name: string;
  lock_duration_ms: number;
  rows_before: number;
  rows_after: number;
  rows_lost: number;
  passed: boolean;
  failure_reason: string | null;
  started_at: string;
  completed_at: string;
}

export interface EvidencePack {
  id: string;
  evidence_id: string;
  migration_request_id: string;
  plan_version: number;
  summary: string;
  source_schema_fingerprint: string;
  risk_level: string;
  risk_score: number;
  is_stale: boolean;
  created_at: string;
  fields: EvidenceField[];
}

export interface EvidenceField {
  path: string;
  value: unknown;
  provenance: string;
  source: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor_type: string;
  actor_id: string;
  action: string;
  migration_request_id: string | null;
  evidence_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
}

export interface StateTransition {
  id: string;
  migration_request_id: string;
  from_state: string;
  to_state: string;
  triggered_by: string;
  timestamp: string;
}

export interface ModelRouteLog {
  id: string;
  migration_request_id: string;
  task_class: string;
  selected_model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  estimated_cost_usd: number;
  status: string;
  created_at: string;
}

export interface VerificationRun {
  id: string;
  migration_request_id: string;
  column_exists: boolean;
  index_valid: boolean;
  row_count_preserved: boolean;
  constraints_valid: boolean;
  overall_passed: boolean;
  created_at: string;
}

export interface ModelAnalytic {
  provider: string;
  selected_model: string;
  task_class: string;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_estimated_cost_usd: number;
  avg_latency_ms: number;
  fallback_count: number;
  failed_count: number;
}

export interface CostAnalytic {
  day: string;
  provider: string;
  total_cost_usd: number;
  total_tokens: number;
}
