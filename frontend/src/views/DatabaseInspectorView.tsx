import React from "react";
import { Database, GitBranch, Table, RefreshCw } from "lucide-react";
import { useTrace } from "../hooks/useApi";

interface DatabaseInspectorViewProps {
  migrationId: string | null;
}

const SCHEMA_COLUMNS = [
  { name: "id", type: "uuid", nullable: "NO", key: "PRIMARY KEY" },
  { name: "email", type: "varchar(255)", nullable: "NO", key: "UNIQUE INDEX" },
  { name: "name", type: "varchar(255)", nullable: "NO", key: "-" },
  { name: "status", type: "varchar(50)", nullable: "NO", key: "INDEX" },
  { name: "fraud_score", type: "numeric(5,2)", nullable: "YES", key: "CONCURRENT INDEX" },
  { name: "created_at", type: "timestamptz", nullable: "NO", key: "-" },
];

export const DatabaseInspectorView: React.FC<DatabaseInspectorViewProps> = ({ migrationId }) => {
  const { data: trace, loading: traceLoading } = useTrace(migrationId);
  const stateTransitions = trace?.stateTransitions ?? [];

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - var(--header-height))", overflowY: "auto" }}>

      {/* Top Banner */}
      <div className="tf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Database size={13} color="var(--accent-primary)" />
              <span className="tf-section-label">Neon Serverless Postgres Integration</span>
            </div>
            <div className="tf-title">Target Database & Ephemeral Rehearsal Branches</div>
          </div>
          <span className="tf-badge tf-badge-success">● NEON CLIENT ACTIVE</span>
        </div>
      </div>

      {/* Grid: Branches + Schema */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>

        {/* Branches Panel */}
        <div className="tf-card">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <GitBranch size={13} color="var(--accent-primary)" />
            <span className="tf-title">Active Neon Branches</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              {
                name: "main",
                badge: "PRODUCTION",
                badgeClass: "tf-badge-info",
                desc: "Parent branch. 100,000 active users. Writes strictly guarded.",
                accent: "var(--accent-primary)",
              },
              {
                name: "rehearsal-mig-77b3-v2",
                badge: "ACTIVE COW",
                badgeClass: "tf-badge-success",
                desc: "Isolated Copy-on-Write rehearsal branch. Passed 48ms lock rehearsal.",
                accent: "var(--success-text)",
              },
              {
                name: "rehearsal-mig-77b3-v1",
                badge: "DELETED",
                badgeClass: "tf-badge-danger",
                desc: "Discarded after 3800ms lock duration threshold failure.",
                accent: "var(--border-color)",
                muted: true,
              },
            ].map((b, i) => (
              <div
                key={i}
                className="tf-card-subtle"
                style={{
                  borderLeft: `3px solid ${b.accent}`,
                  opacity: b.muted ? 0.55 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span className="code-font" style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-main)" }}>
                    {b.name}
                  </span>
                  <span className={`tf-badge ${b.badgeClass}`}>{b.badge}</span>
                </div>
                <div className="tf-subtitle">{b.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Schema Inspector Panel */}
        <div className="tf-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Table size={13} color="var(--accent-primary)" />
              <span className="tf-title">
                Schema Inspector: <span className="code-font" style={{ color: "var(--accent-primary)", fontSize: "12px" }}>public.users</span>
              </span>
            </div>
            <span className="tf-badge tf-badge-info">100,000 ROWS</span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                {["COLUMN", "DATA TYPE", "NULLABLE", "KEY / CONSTRAINT"].map((h) => (
                  <th key={h} style={{ padding: "5px 10px", fontSize: "10.5px", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCHEMA_COLUMNS.map((col, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td className="code-font" style={{ padding: "6px 10px", color: "var(--text-main)", fontWeight: 500 }}>
                    {col.name}
                    {col.name === "fraud_score" && (
                      <span className="tf-badge tf-badge-warning" style={{ marginLeft: 6, fontSize: "10px" }}>NEW</span>
                    )}
                  </td>
                  <td className="code-font" style={{ padding: "6px 10px", color: "var(--accent-primary)" }}>{col.type}</td>
                  <td style={{ padding: "6px 10px" }}>
                    <span className={`tf-badge ${col.nullable === "YES" ? "tf-badge-warning" : "tf-badge-success"}`}>
                      {col.nullable}
                    </span>
                  </td>
                  <td className="code-font" style={{ padding: "6px 10px", color: "var(--text-muted)", fontSize: "11px" }}>{col.key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* State Transition Log */}
      {migrationId && (
        <div className="tf-card">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <RefreshCw size={13} color="var(--accent-primary)" />
            <span className="tf-title">State Transition Log</span>
            {traceLoading && <RefreshCw size={12} color="var(--text-subtle)" />}
            <span className="tf-subtitle">({stateTransitions.length} transitions)</span>
          </div>

          {stateTransitions.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  {["TIMESTAMP", "FROM", "TO", "TRIGGERED BY"].map((h) => (
                    <th key={h} style={{ padding: "5px 10px", fontSize: "10.5px", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stateTransitions.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td className="code-font" style={{ padding: "5px 10px", color: "var(--text-subtle)", fontSize: "10.5px" }}>
                      {new Date(t.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: "5px 10px" }}>
                      <span className="tf-badge tf-badge-warning">{t.from_state}</span>
                    </td>
                    <td style={{ padding: "5px 10px" }}>
                      <span className="tf-badge tf-badge-success">{t.to_state}</span>
                    </td>
                    <td style={{ padding: "5px 10px", color: "var(--text-muted)", fontSize: "11.5px" }}>{t.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: "16px", textAlign: "center", color: "var(--text-subtle)", fontSize: "12px" }}>
              {traceLoading ? "Loading transitions…" : "No state transitions recorded yet."}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
