import React from "react";
import { ShieldCheck, Fingerprint, Tag, RefreshCw, AlertTriangle } from "lucide-react";
import { useEvidence } from "../hooks/useApi";

interface EvidenceViewProps {
  migrationId: string | null;
}

export const EvidenceView: React.FC<EvidenceViewProps> = ({ migrationId }) => {
  const { data: evidence, loading, error, refetch } = useEvidence(migrationId);

  const getProvenanceBadgeClass = (provenance: string) => {
    switch (provenance) {
      case "OBSERVED_FACT": return "tf-badge-success";
      case "INFERENCE": return "tf-badge-info";
      case "ESTIMATE": return "tf-badge-warning";
      case "MODEL_SUGGESTION": return "tf-badge-danger";
      default: return "tf-badge-info";
    }
  };

  if (!migrationId) {
    return (
      <div style={{ padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-subtle)" }}>
        <ShieldCheck size={36} style={{ opacity: 0.4 }} />
        <div style={{ fontSize: "13px" }}>Select a migration to view its evidence pack.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "40px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-subtle)" }}>
        <RefreshCw size={18} /> Loading evidence…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px" }}>
        <div className="tf-card" style={{ padding: "14px", borderLeft: "3px solid var(--danger-text)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--danger-text)", marginBottom: 6 }}>
            <AlertTriangle size={14} />
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Backend Error</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: 8 }}>{error}</div>
          <button onClick={refetch} className="tf-button-secondary">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!evidence) {
    return (
      <div style={{ padding: "20px" }}>
        <div className="tf-card" style={{ padding: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--warning-text)", marginBottom: 6 }}>
            <AlertTriangle size={14} />
            <span style={{ fontSize: "12px", fontWeight: 600 }}>No Evidence Pack Yet</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Run the rehearsal workflow to generate an immutable evidence pack for this migration.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - var(--header-height))", overflowY: "auto" }}>

      {/* Evidence Header Card */}
      <div className="tf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <ShieldCheck size={14} color="var(--success-text)" />
              <span className="tf-section-label">Cryptographic Evidence Pack</span>
            </div>
            <div className="tf-title" style={{ marginBottom: 3 }}>
              Evidence ID: <span className="code-font" style={{ fontSize: "12px" }}>{evidence.evidence_id}</span>
            </div>
            <div className="tf-subtitle" style={{ maxWidth: 700 }}>
              {evidence.summary}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span className={`tf-badge tf-badge-${evidence.risk_level === "LOW" ? "success" : evidence.risk_level === "MEDIUM" ? "warning" : "danger"}`}>
              Risk: {evidence.risk_level} (Score: {evidence.risk_score})
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
              Plan v{evidence.plan_version} · {evidence.is_stale ? "⚠ STALE" : "✓ Fresh"}
            </span>
          </div>
        </div>

        {/* Schema Fingerprint */}
        <div
          className="tf-card-subtle"
          style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Fingerprint size={13} color="var(--accent-primary)" />
            <span className="tf-section-label">Schema SHA-256</span>
            <span className="code-font" style={{ fontSize: "11px", color: "var(--text-main)" }}>
              {evidence.source_schema_fingerprint}
            </span>
          </div>
          <span className="tf-badge tf-badge-success">Matches Production</span>
        </div>
      </div>

      {/* Field Provenance Table */}
      <div className="tf-card">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Tag size={13} color="var(--accent-primary)" />
          <span className="tf-title">Field Provenance Breakdown</span>
          <span className="tf-subtitle" style={{ marginLeft: 4 }}>— Anti-Hallucination Boundary</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                {["FIELD PATH", "MEASURED VALUE", "PROVENANCE", "OBSERVED SOURCE"].map((h) => (
                  <th key={h} style={{ padding: "6px 10px", fontSize: "10.5px", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(evidence.fields ?? []).map((field, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td className="code-font" style={{ padding: "7px 10px", color: "var(--accent-primary)" }}>
                    {field.path}
                  </td>
                  <td className="code-font" style={{ padding: "7px 10px", color: "var(--text-main)", fontWeight: 600 }}>
                    {String(field.value)}
                  </td>
                  <td style={{ padding: "7px 10px" }}>
                    <span className={`tf-badge ${getProvenanceBadgeClass(field.provenance)}`}>
                      {field.provenance}
                    </span>
                  </td>
                  <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>
                    {field.source}
                  </td>
                </tr>
              ))}
              {(!evidence.fields || evidence.fields.length === 0) && (
                <tr>
                  <td colSpan={4} style={{ padding: "16px", textAlign: "center", color: "var(--text-subtle)", fontSize: "12px" }}>
                    No provenance fields recorded yet.
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
