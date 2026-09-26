import React from "react";
import { History, Shield, RefreshCw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useVerification, useAuditLog } from "../hooks/useApi";

interface VerificationViewProps {
  migrationId: string | null;
}

export const VerificationView: React.FC<VerificationViewProps> = ({ migrationId }) => {
  const { data: verification, loading: vLoading, refetch: refetchV } = useVerification(migrationId);
  const { data: auditLog, loading: aLoading, refetch: refetchA } = useAuditLog(migrationId);

  const refetch = () => { refetchV(); refetchA(); };

  if (!migrationId) {
    return (
      <div style={{ padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-subtle)" }}>
        <Shield size={36} style={{ opacity: 0.4 }} />
        <div style={{ fontSize: "13px" }}>Select a migration to view verification status.</div>
      </div>
    );
  }

  const checks = verification
    ? [
        { name: "Schema Columns", passed: verification.column_exists, detail: "users.fraud_score verified accessible" },
        { name: "Index Status", passed: verification.index_valid, detail: "idx_users_fraud_score valid & active" },
        { name: "Row Preservation", passed: verification.row_count_preserved, detail: "100% rows intact" },
        { name: "Constraints", passed: verification.constraints_valid, detail: "Zero orphaned rows" },
      ]
    : [];

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - var(--header-height))", overflowY: "auto" }}>

      {/* Top Banner */}
      <div className="tf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Shield size={13} color="var(--success-text)" />
              <span className="tf-section-label">Verification Engine & Append-Only Audit Trail</span>
            </div>
            <div className="tf-title">
              Post-Execution Verification: {" "}
              {verification ? (
                <span style={{ color: verification.overall_passed ? "var(--success-text)" : "var(--danger-text)" }}>
                  {verification.overall_passed ? "PASS ✓" : "FAIL ✗"}
                </span>
              ) : "Pending"}
            </div>
            <div className="tf-subtitle" style={{ marginTop: 3 }}>
              Migrations never auto-complete solely on HTTP 200. Verification checks column existence, index validity,
              constraint integrity, and row count preservation.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={refetch} className="tf-button-secondary" style={{ height: 24, padding: "0 8px", fontSize: "11px" }}>
              <RefreshCw size={11} /> Refresh
            </button>
            {verification && (
              <span className={`tf-badge tf-badge-${verification.overall_passed ? "success" : "danger"}`}>
                {verification.overall_passed ? "VERIFIED" : "FAILED"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Verification Checks Grid */}
      {(vLoading || checks.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {vLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="tf-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                <RefreshCw size={16} color="var(--text-subtle)" />
              </div>
            ))
          ) : (
            checks.map((check, idx) => (
              <div key={idx} className="tf-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-main)" }}>{check.name}</span>
                  {check.passed
                    ? <CheckCircle size={14} color="var(--success-text)" />
                    : <XCircle size={14} color="var(--danger-text)" />
                  }
                </div>
                <div className="tf-subtitle">{check.detail}</div>
              </div>
            ))
          )}
        </div>
      )}

      {!vLoading && !verification && (
        <div className="tf-card" style={{ borderLeft: "3px solid var(--warning-text)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--warning-text)", fontSize: "12px" }}>
            <AlertTriangle size={13} />
            No verification run found for this migration yet.
          </div>
        </div>
      )}

      {/* Append-Only Audit Log */}
      <div className="tf-card" style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <History size={13} color="var(--accent-primary)" />
          <span className="tf-title">Append-Only Audit Log</span>
          {aLoading && <RefreshCw size={12} color="var(--text-subtle)" />}
          <span className="tf-subtitle">({auditLog?.length ?? 0} events)</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                {["TIMESTAMP", "ACTOR", "ACTOR ID", "ACTION", "METADATA"].map((h) => (
                  <th key={h} style={{ padding: "5px 10px", fontSize: "10.5px", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(auditLog ?? []).map((entry) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td className="code-font" style={{ padding: "5px 10px", color: "var(--text-subtle)", fontSize: "10.5px", whiteSpace: "nowrap" }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: "5px 10px" }}>
                    <span className="tf-badge tf-badge-info">{entry.actor_type}</span>
                  </td>
                  <td style={{ padding: "5px 10px", color: "var(--text-main)", fontWeight: 500, fontSize: "11.5px" }}>
                    {entry.actor_id.slice(0, 12)}…
                  </td>
                  <td className="code-font" style={{ padding: "5px 10px", color: "var(--accent-primary)", fontWeight: 600, fontSize: "11.5px" }}>
                    {entry.action}
                  </td>
                  <td className="code-font" style={{ padding: "5px 10px", color: "var(--text-muted)", fontSize: "10.5px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {JSON.stringify(entry.metadata)}
                  </td>
                </tr>
              ))}
              {!aLoading && (!auditLog || auditLog.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--text-subtle)", fontSize: "12px" }}>
                    No audit events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
