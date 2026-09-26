// ============================================================
// MIGR8 API Hooks — React hooks for data fetching & mutations
// ============================================================
import { useState, useEffect, useCallback } from "react";
import * as api from "../api/client";
import type {
  MigrationRequest,
  MigrationPlan,
  RehearsalRun,
  EvidencePack,
  AuditEntry,
  StateTransition,
  ModelRouteLog,
  VerificationRun,
  ModelAnalytic,
} from "../api/client";

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  const fetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await fn();
      setState({ data: result, loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: (e as Error).message });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  return { ...state, refetch: fetch };
}

// ── Readiness ───────────────────────────────────────────────
export function useReadiness() {
  return useAsync(() => api.fetchReadiness(), []);
}

// ── Migrations List ─────────────────────────────────────────
export function useMigrations() {
  return useAsync(() => api.fetchMigrations({ limit: 20 }), []);
}

// ── Single Migration ────────────────────────────────────────
export function useMigration(id: string | null) {
  return useAsync(
    () => (id ? api.fetchMigration(id).then((r) => r.data) : Promise.resolve(null)),
    [id]
  );
}

// ── Plans ───────────────────────────────────────────────────
export function usePlans(migrationId: string | null) {
  return useAsync(
    () => (migrationId ? api.fetchPlans(migrationId).then((r) => r.data) : Promise.resolve([])),
    [migrationId]
  );
}

// ── Rehearsals ──────────────────────────────────────────────
export function useRehearsals(migrationId: string | null) {
  return useAsync(
    () => (migrationId ? api.fetchRehearsals(migrationId).then((r) => r.data) : Promise.resolve([])),
    [migrationId]
  );
}

// ── Evidence ────────────────────────────────────────────────
export function useEvidence(migrationId: string | null) {
  return useAsync(
    () => (migrationId ? api.fetchEvidence(migrationId).then((r) => r.data) : Promise.resolve(null)),
    [migrationId]
  );
}

// ── Audit Log ───────────────────────────────────────────────
export function useAuditLog(migrationId: string | null) {
  return useAsync(
    () => (migrationId ? api.fetchAuditLog(migrationId).then((r) => r.data) : Promise.resolve([])),
    [migrationId]
  );
}

// ── Trace ────────────────────────────────────────────────────
export function useTrace(migrationId: string | null) {
  return useAsync(
    () =>
      migrationId
        ? api.fetchTrace(migrationId).then((r) => r.data)
        : Promise.resolve({ stateTransitions: [], modelRoutingLog: [] }),
    [migrationId]
  );
}

// ── Verification ────────────────────────────────────────────
export function useVerification(migrationId: string | null) {
  return useAsync(
    () => (migrationId ? api.fetchVerification(migrationId).then((r) => r.data) : Promise.resolve(null)),
    [migrationId]
  );
}

// ── Model Analytics ─────────────────────────────────────────
export function useModelAnalytics() {
  return useAsync(() => api.fetchModelAnalytics().then((r) => r.data), []);
}

// Re-export types for convenience
export type {
  MigrationRequest,
  MigrationPlan,
  RehearsalRun,
  EvidencePack,
  AuditEntry,
  StateTransition,
  ModelRouteLog,
  VerificationRun,
  ModelAnalytic,
};
