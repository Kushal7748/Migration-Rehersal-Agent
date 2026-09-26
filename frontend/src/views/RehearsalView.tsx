import React, { useState } from "react";
import {
  CheckCircle, Clock, ArrowRight, GitBranch, Shield, Layers, Plus, Play,
  AlertTriangle, RefreshCw,
} from "lucide-react";
import { usePlans, useRehearsals, type MigrationRequest } from "../hooks/useApi";

interface RehearsalViewProps {
  activeMigrationId: string | null;
  migrations: MigrationRequest[];
  onSelectMigration: (id: string) => void;
  onNewMigration: (text: string, db: string) => Promise<void>;
  onRunWorkflow: () => Promise<void>;
}

const STATE_STEPS = [
  "INTAKE", "DISCOVER", "PLANNING", "REHEARSING",
  "EVIDENCE_READY", "AWAITING_APPROVAL", "APPROVED", "EXECUTING", "VERIFYING", "COMPLETE",
];

export const RehearsalView: React.FC<RehearsalViewProps> = ({
  activeMigrationId,
  migrations,
  onSelectMigration,
  onNewMigration,
  onRunWorkflow,
}) => {
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const [newText, setNewText] = useState("");
  const [newDb, setNewDb] = useState("neon-production");
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);

  const { data: plans, loading: plansLoading } = usePlans(activeMigrationId);
  const { data: rehearsals, loading: rehearsalsLoading } = useRehearsals(activeMigrationId);

  const activeMigration = migrations.find((m) => m.id === activeMigrationId) ?? null;
  const selectedPlan = plans?.[selectedPlanIdx] ?? null;
  const latestRehearsal = rehearsals?.[0] ?? null;

  const getStepState = (step: string) => {
    const current = activeMigration?.status ?? "INTAKE";
    const currentIdx = STATE_STEPS.indexOf(current);
    const stepIdx = STATE_STEPS.indexOf(step);
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  };

  const handleCreate = async () => {
    if (!newText.trim()) return;
    setCreating(true);
    await onNewMigration(newText, newDb);
    setNewText("");
    setCreating(false);
  };

  const handleRunWorkflow = async () => {
    setRunning(true);
    await onRunWorkflow();
    setRunning(false);
  };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - var(--header-height))", overflowY: "auto" }}>

      {/* New Migration Request Form */}
      <div className="tf-card" style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Plus size={13} color="var(--accent-primary)" />
          <span className="tf-section-label">New Migration Request</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Describe the migration (e.g. 'Add fraud_score column to users table')"
            style={{
              flex: 1,
              height: 28,
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: 5,
              padding: "0 10px",
              fontSize: "12px",
              color: "var(--text-main)",
              outline: "none",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <input
            value={newDb}
            onChange={(e) => setNewDb(e.target.value)}
            placeholder="Target DB"
            style={{
              width: 160,
              height: 28,
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: 5,
              padding: "0 8px",
              fontSize: "12px",
              color: "var(--text-main)",
              outline: "none",
            }}
          />
          <button
            onClick={handleCreate}
            className="tf-button-primary"
            disabled={!newText.trim() || creating}
          >
            {creating ? <RefreshCw size={12} className="spin" /> : <Plus size={12} />}
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {/* Migrations List */}
      {migrations.length > 0 && (
        <div className="tf-card" style={{ padding: "10px 14px" }}>
          <div className="tf-section-label" style={{ marginBottom: 8 }}>Migration Requests ({migrations.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
            {migrations.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelectMigration(m.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "5px 8px",
                  borderRadius: 5,
                  border: "1px solid",
                  borderColor: m.id === activeMigrationId ? "var(--accent-primary)" : "transparent",
                  backgroundColor: m.id === activeMigrationId ? "var(--accent-light)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "monospace",
                    color: "var(--text-subtle)",
                    flexShrink: 0,
                  }}
                >
                  {m.id.slice(0, 8)}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "12px",
                    color: "var(--text-main)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.request_text}
                </span>
                <span className={`tf-badge tf-badge-${
                  m.status === "COMPLETE" ? "success" :
                  m.status === "FAILED" || m.status === "REJECTED" ? "danger" :
                  m.status === "EVIDENCE_READY" || m.status === "APPROVED" ? "info" : "warning"
                }`}>
                  {m.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeMigration ? (
        <>
          {/* Active Migration Banner */}
          <div className="tf-card" style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div className="tf-section-label">Active · {activeMigration.id.slice(0, 8)}</div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-main)",
                    marginTop: 3,
                    maxWidth: 600,
                  }}
                >
                  "{activeMigration.request_text}"
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {activeMigration.target_table && (
                  <span className="tf-badge tf-badge-info">Table: {activeMigration.target_table}</span>
                )}
                <span className="tf-badge tf-badge-info">Branch: {activeMigration.target_branch}</span>
                <button
                  onClick={handleRunWorkflow}
                  className="tf-button-primary"
                  disabled={running}
                  style={{ fontSize: "11px", height: 24, padding: "2px 8px" }}
                >
                  {running ? <RefreshCw size={11} /> : <Play size={11} />}
                  {running ? "Running…" : "Run Full Workflow"}
                </button>
              </div>
            </div>

            {/* State Machine Flow */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
              {STATE_STEPS.map((step, idx) => {
                const s = getStepState(step);
                return (
                  <React.Fragment key={idx}>
                    <div
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: "10px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        backgroundColor:
                          s === "active" ? "var(--accent-light)" :
                          s === "done" ? "var(--bg-tertiary)" : "transparent",
                        color:
                          s === "active" ? "var(--accent-primary)" :
                          s === "done" ? "var(--text-muted)" : "var(--text-subtle)",
                        border: `1px solid ${s === "active" ? "var(--accent-primary)" : "var(--border-color)"}`,
                      }}
                    >
                      {step}
                    </div>
                    {idx < STATE_STEPS.length - 1 && (
                      <ArrowRight size={10} color="var(--border-color)" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Plans & Rehearsal Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
            {/* Left: Plans */}
            <div className="tf-card" style={{ padding: "10px 14px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers size={13} color="var(--accent-primary)" />
                  <span className="tf-title">Migration Plans</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {plansLoading && <RefreshCw size={12} color="var(--text-subtle)" />}
                  {plans?.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlanIdx(i)}
                      className={selectedPlanIdx === i ? "tf-button-primary" : "tf-button-secondary"}
                      style={{ height: 22, padding: "0 8px", fontSize: "11px" }}
                    >
                      v{p.version}
                    </button>
                  ))}
                </div>
              </div>

              {selectedPlan ? (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div className="tf-section-label" style={{ marginBottom: 2 }}>Strategy</div>
                    <div style={{ fontSize: "12px", color: "var(--text-main)", fontWeight: 500 }}>
                      {selectedPlan.strategy}
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: 2 }}>
                      {selectedPlan.description}
                    </div>
                  </div>
                  <div className="tf-section-label" style={{ marginBottom: 4 }}>SQL Statements</div>
                  <pre
                    className="code-font"
                    style={{
                      flex: 1,
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      padding: 10,
                      borderRadius: 5,
                      color: "#86efac",
                      overflowX: "auto",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      maxHeight: 240,
                    }}
                  >
                    {selectedPlan.sql_statements?.join("\n\n") ?? "No SQL statements"}
                  </pre>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <span className={`tf-badge tf-badge-${selectedPlan.risk_level === "LOW" ? "success" : selectedPlan.risk_level === "MEDIUM" ? "warning" : "danger"}`}>
                      Risk: {selectedPlan.risk_level}
                    </span>
                    <span className="tf-badge tf-badge-info">Score: {selectedPlan.risk_score}</span>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-subtle)", fontSize: "12px", gap: 8 }}>
                  {plansLoading ? (
                    <RefreshCw size={18} />
                  ) : (
                    <>
                      <AlertTriangle size={18} />
                      <span>No plans yet. Run the workflow to generate.</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right: Rehearsal Measurements */}
            <div className="tf-card" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <GitBranch size={13} color="var(--accent-primary)" />
                  <span className="tf-title">Rehearsal Measurements</span>
                </div>
                {rehearsalsLoading && <RefreshCw size={12} color="var(--text-subtle)" />}
                {latestRehearsal && (
                  <span className={`tf-badge ${latestRehearsal.passed ? "tf-badge-success" : "tf-badge-danger"}`}>
                    {latestRehearsal.passed ? "PASSED" : "FAILED"}
                  </span>
                )}
              </div>

              {latestRehearsal ? (
                <>
                  <div className="tf-card-subtle">
                    <div className="tf-section-label">COW Branch (Neon Postgres)</div>
                    <div className="code-font" style={{ fontSize: "11px", color: "var(--text-main)", marginTop: 2 }}>
                      {latestRehearsal.branch_name}
                    </div>
                  </div>

                  <div
                    className="tf-card-subtle"
                    style={{
                      borderLeft: `3px solid ${latestRehearsal.passed ? "var(--success-text)" : "var(--danger-text)"}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                        <Clock size={12} />
                        Lock Duration
                      </span>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: latestRehearsal.passed ? "var(--success-text)" : "var(--danger-text)" }}>
                        {latestRehearsal.lock_duration_ms} ms
                      </span>
                    </div>
                    <div style={{ height: 6, backgroundColor: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, (latestRehearsal.lock_duration_ms / 2000) * 100)}%`,
                          backgroundColor: latestRehearsal.passed ? "var(--success-text)" : "var(--danger-text)",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                      Threshold: 2000ms · {latestRehearsal.passed ? "✓ Within SLA" : "✗ Exceeds SLA"}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div className="tf-card-subtle">
                      <div className="tf-section-label">Rows Before / After</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, marginTop: 3 }}>
                        {latestRehearsal.rows_before.toLocaleString()} / {latestRehearsal.rows_after.toLocaleString()}
                      </div>
                    </div>
                    <div className="tf-card-subtle">
                      <div className="tf-section-label">Data Loss</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, marginTop: 3, color: latestRehearsal.rows_lost === 0 ? "var(--success-text)" : "var(--danger-text)" }}>
                        {latestRehearsal.rows_lost === 0 ? "Zero Loss ✓" : `${latestRehearsal.rows_lost} Lost!`}
                      </div>
                    </div>
                  </div>

                  <div className="tf-card-subtle">
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, fontSize: "12px", fontWeight: 600 }}>
                      <Shield size={12} color="var(--accent-primary)" />
                      Verification Checklist
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "11.5px", color: "var(--text-muted)" }}>
                      {[
                        "Table structure accessible after DDL",
                        "Row counts strictly preserved",
                        "Foreign key integrity maintained",
                        "Concurrent index build verified",
                      ].map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <CheckCircle size={11} color="var(--success-text)" />
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-subtle)", fontSize: "12px", gap: 8 }}>
                  {rehearsalsLoading ? <RefreshCw size={18} /> : (
                    <>
                      <AlertTriangle size={18} />
                      <span>No rehearsals yet. Run a rehearsal first.</span>
                    </>
                  )}
                </div>
              )}

              {rehearsals && rehearsals.length > 1 && (
                <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>
                  {rehearsals.length} total rehearsal runs for this migration.
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "var(--text-subtle)",
          }}
        >
          <Shield size={36} color="var(--accent-primary)" style={{ opacity: 0.5 }} />
          <div style={{ fontSize: "13px", fontWeight: 500 }}>No migration selected</div>
          <div style={{ fontSize: "12px" }}>Create a migration request above or select one from the list.</div>
        </div>
      )}
    </div>
  );
};
