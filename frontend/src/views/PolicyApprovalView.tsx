import React, { useState } from "react";
import { Lock, Key, ShieldCheck, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import type { MigrationRequest } from "../hooks/useApi";
import { useEvidence } from "../hooks/useApi";

interface PolicyApprovalViewProps {
  migrationId: string | null;
  migration: MigrationRequest | null;
  onApprove: (action: "APPROVE" | "REJECT", reason?: string) => Promise<void>;
}

const POLICY_CHECKS = [
  "Authenticate caller identity & session token",
  "Verify approver role (APPROVER or ADMIN required)",
  "Verify migration state is APPROVED / AWAITING_APPROVAL",
  "Load Evidence Pack from trusted DB (never client payload)",
  "Verify evidence is not marked stale",
  "Verify approval token hash against DB record",
  "Enforce single-use restriction (token not previously consumed)",
  "Verify token expiration (Date.now() < expires_at)",
  "Verify cryptographic HMAC-SHA256 signature",
  "Re-inspect target schema fingerprint (Stale-evidence defense)",
  "Load migration SQL from plan DB and execute on production Neon",
];

export const PolicyApprovalView: React.FC<PolicyApprovalViewProps> = ({
  migrationId,
  migration,
  onApprove,
}) => {
  const [approving, setApproving] = useState(false);
  const { data: evidence } = useEvidence(migrationId);

  const handleApprove = async (action: "APPROVE" | "REJECT") => {
    const reason = action === "REJECT"
      ? prompt("Rejection reason (optional):")
      : undefined;
    setApproving(true);
    try {
      await onApprove(action, reason ?? undefined);
    } finally {
      setApproving(false);
    }
  };

  if (!migrationId || !migration) {
    return (
      <div style={{ padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-subtle)" }}>
        <Lock size={36} style={{ opacity: 0.4 }} />
        <div style={{ fontSize: "13px" }}>Select a migration to manage approvals.</div>
      </div>
    );
  }

  const canApprove = migration.status === "EVIDENCE_READY" || migration.status === "AWAITING_APPROVAL";

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - var(--header-height))", overflowY: "auto" }}>

      {/* Top Banner */}
      <div className="tf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Lock size={13} color="var(--accent-primary)" />
              <span className="tf-section-label">Independent Policy Service Microservice (Port 3002)</span>
            </div>
            <div className="tf-title">Human Approval & Cryptographic Production Gate</div>
            <div className="tf-subtitle" style={{ marginTop: 3, maxWidth: 700 }}>
              The Agent has zero production write credentials. Production execution strictly requires a valid,
              unexpired, single-use HMAC-SHA256 token signed by an authorized Security Approver.
            </div>
          </div>
          <span className="tf-badge tf-badge-info">PORT 3002 ISOLATED</span>
        </div>
      </div>

      {/* Migration State Warning */}
      {!canApprove && (
        <div className="tf-card" style={{ borderLeft: "3px solid var(--warning-text)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--warning-text)", fontSize: "12px" }}>
            <AlertTriangle size={13} />
            <span>Migration must be in EVIDENCE_READY or AWAITING_APPROVAL state to approve. Current: <strong>{migration.status}</strong></span>
          </div>
        </div>
      )}

      {/* Grid: Token card + Policy checklist */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Approval Token Card */}
        <div className="tf-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Key size={13} color="var(--accent-primary)" />
            <span className="tf-title">HMAC-SHA256 Approval Token</span>
          </div>

          {evidence ? (
            <>
              <div className="tf-card-subtle">
                <div className="tf-section-label">BOUND EVIDENCE ID</div>
                <div className="code-font" style={{ fontSize: "11px", marginTop: 2 }}>{evidence.evidence_id}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="tf-card-subtle">
                  <div className="tf-section-label">TOKEN TTL</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, marginTop: 3 }}>120 Seconds</div>
                </div>
                <div className="tf-card-subtle">
                  <div className="tf-section-label">USAGE</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, marginTop: 3, color: "var(--success-text)" }}>Single-Use Only</div>
                </div>
              </div>

              <div className="tf-card-subtle">
                <div className="tf-section-label" style={{ marginBottom: 3 }}>MIGRATION STATUS</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={`tf-badge tf-badge-${
                    migration.status === "COMPLETE" ? "success" :
                    migration.status === "REJECTED" || migration.status === "FAILED" ? "danger" :
                    migration.status === "EVIDENCE_READY" || migration.status === "APPROVED" ? "info" : "warning"
                  }`}>
                    {migration.status}
                  </span>
                  <span className="tf-subtitle">{migration.id.slice(0, 8)}…</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "12px", color: "var(--text-subtle)", padding: "12px 0" }}>
              No evidence pack found. Build evidence first.
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
            <button
              onClick={() => handleApprove("APPROVE")}
              className="tf-button-primary"
              disabled={!canApprove || approving || !evidence}
              style={{ flex: 1, justifyContent: "center", opacity: canApprove && evidence ? 1 : 0.5 }}
            >
              {approving ? <RefreshCw size={12} /> : <Key size={12} />}
              {approving ? "Approving…" : "Approve & Mint Token"}
            </button>
            <button
              onClick={() => handleApprove("REJECT")}
              className="tf-button-secondary"
              disabled={!canApprove || approving}
              style={{ flex: 1, justifyContent: "center", opacity: canApprove ? 1 : 0.5, borderColor: "var(--danger-text)", color: "var(--danger-text)" }}
            >
              Reject
            </button>
          </div>
        </div>

        {/* Policy Service Verification Checklist */}
        <div className="tf-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={13} color="var(--success-text)" />
            <span className="tf-title">Policy Service Verification Pre-Conditions</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {POLICY_CHECKS.map((check, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 7,
                  fontSize: "11.5px",
                  color: "var(--text-muted)",
                  lineHeight: 1.4,
                }}
              >
                <CheckCircle2 size={12} color="var(--success-text)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{idx + 1}. {check}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => handleApprove("APPROVE")}
            className="tf-button-primary"
            disabled={!canApprove || approving || !evidence}
            style={{
              width: "100%",
              justifyContent: "center",
              backgroundColor: canApprove && evidence ? "var(--success-text)" : undefined,
              opacity: canApprove && evidence ? 1 : 0.5,
              marginTop: "auto",
            }}
          >
            <ShieldCheck size={12} />
            Execute Guarded Production Migration
          </button>
        </div>
      </div>
    </div>
  );
};
