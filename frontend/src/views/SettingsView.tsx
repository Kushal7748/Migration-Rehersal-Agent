import React from "react";
import type { SubTab } from "../types";
import { Sliders, Share2, Zap, Box, Plus, CheckCircle, XCircle, RefreshCw } from "lucide-react";

interface SettingsViewProps {
  activeSubTab: SubTab;
  backendStatus: "connecting" | "online" | "offline";
  readiness: {
    ready: boolean;
    database: string;
    config: string;
    neon_read: string;
    neon_write: string;
    execution_mode: string;
    model_gateway: string;
  } | null;
}

function StatusDot({ status }: { status: string }) {
  const ok = status === "ok" || status === "production" || status === "configured";
  const warn = status === "demo_mode" || status === "mock_mode";
  const color = ok ? "var(--success-text)" : warn ? "var(--warning-text)" : "var(--danger-text)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "11px", color, fontWeight: 500 }}>
      {ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {status}
    </span>
  );
}

export const SettingsView: React.FC<SettingsViewProps> = ({ activeSubTab, backendStatus, readiness }) => {
  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - var(--header-height))", overflowY: "auto" }}>

      {/* Backend Status Card — always visible */}
      <div className="tf-card" style={{ borderLeft: `3px solid ${backendStatus === "online" ? "var(--success-text)" : backendStatus === "offline" ? "var(--danger-text)" : "var(--warning-text)"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: readiness ? 8 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {backendStatus === "connecting" ? <RefreshCw size={13} /> : backendStatus === "online" ? <CheckCircle size={13} color="var(--success-text)" /> : <XCircle size={13} color="var(--danger-text)" />}
            <span className="tf-title">MIGR8 Backend API (Port 3001)</span>
          </div>
          <span className={`tf-badge tf-badge-${backendStatus === "online" ? "success" : backendStatus === "offline" ? "danger" : "warning"}`}>
            {backendStatus.toUpperCase()}
          </span>
        </div>

        {readiness && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 6 }}>
            {[
              { label: "Database", value: readiness.database },
              { label: "Config", value: readiness.config },
              { label: "Neon Read", value: readiness.neon_read },
              { label: "Neon Write", value: readiness.neon_write },
              { label: "Execution", value: readiness.execution_mode },
              { label: "AI Gateway", value: readiness.model_gateway },
            ].map(({ label, value }) => (
              <div key={label} className="tf-card-subtle" style={{ padding: "6px 8px" }}>
                <div className="tf-section-label" style={{ marginBottom: 3 }}>{label}</div>
                <StatusDot status={value} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connectors tab */}
      {activeSubTab === "connectors" && (
        <div className="tf-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Share2 size={13} color="var(--accent-primary)" />
              <span className="tf-title">Database & Tool Connectors</span>
            </div>
            <button className="tf-button-primary">
              <Plus size={12} /> Add Connector
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              {
                name: "Neon Model Context Protocol (MCP)",
                desc: "Read-only schema discovery, branching, and isolated rehearsal environments.",
                status: "CONNECTED",
                cls: "tf-badge-success",
              },
              {
                name: "MIGR8 Policy Microservice (Port 3002)",
                desc: "Independent security boundary with write access for guarded production execution.",
                status: "ACTIVE",
                cls: "tf-badge-success",
              },
              {
                name: "TrueForge Sandbox (localhost:8790)",
                desc: "Local agent sandbox for tool executions and schema analysis tasks.",
                status: "ENABLED",
                cls: "tf-badge-success",
              },
              {
                name: "TrueFoundry AI Gateway",
                desc: "Unified model routing gateway at gateway.truefoundry.ai for all LLM calls.",
                status: "CONFIGURED",
                cls: "tf-badge-info",
              },
            ].map((c, i) => (
              <div key={i} className="tf-card-subtle">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-main)" }}>{c.name}</span>
                  <span className={`tf-badge ${c.cls}`}>{c.status}</span>
                </div>
                <div className="tf-subtitle">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills tab */}
      {activeSubTab === "skills" && (
        <div className="tf-card">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Zap size={13} color="var(--accent-primary)" />
            <span className="tf-title">Agent Skills & Knowledge Engines</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              {
                name: "deterministic-postgres-risk-engine",
                desc: "Evaluates lock duration SLAs, table volume thresholds, and prevents full-table exclusive locks.",
                badge: "ACTIVE",
                cls: "tf-badge-success",
              },
              {
                name: "crypto-approval-token-signer",
                desc: "Issues single-use, 120-second time-limited HMAC-SHA256 tokens bound to exact evidence IDs.",
                badge: "ACTIVE",
                cls: "tf-badge-success",
              },
              {
                name: "neon-cow-branch-manager",
                desc: "Creates and tears down ephemeral Copy-on-Write rehearsal branches on Neon Postgres.",
                badge: "ACTIVE",
                cls: "tf-badge-success",
              },
              {
                name: "schema-fingerprint-validator",
                desc: "Computes SHA-256 fingerprint of production schema to prevent stale-evidence attacks.",
                badge: "ACTIVE",
                cls: "tf-badge-success",
              },
            ].map((s, i) => (
              <div key={i} className="tf-card-subtle" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="code-font" style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-main)", marginBottom: 3 }}>{s.name}</div>
                  <div className="tf-subtitle">{s.desc}</div>
                </div>
                <span className={`tf-badge ${s.cls}`} style={{ flexShrink: 0, marginLeft: 10 }}>{s.badge}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sandbox Providers tab */}
      {activeSubTab === "sandbox-providers" && (
        <div className="tf-card">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Box size={13} color="var(--accent-primary)" />
            <span className="tf-title">Sandbox & Code Mode Providers</span>
          </div>
          <div className="tf-card-subtle" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-main)", marginBottom: 3 }}>TrueForge Local Standalone Sandbox</div>
              <div className="tf-subtitle">Local sandbox for running tool executions and schema analysis. Endpoint: <span className="code-font" style={{ fontSize: "11px" }}>http://localhost:8790</span></div>
            </div>
            <span className="tf-badge tf-badge-success">ENABLED</span>
          </div>
        </div>
      )}

      {/* Models tab (default) */}
      {activeSubTab === "models-catalog" && (
        <div className="tf-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Sliders size={13} color="var(--accent-primary)" />
              <span className="tf-title">Configured AI Models & Providers</span>
            </div>
            <button className="tf-button-primary">
              <Plus size={12} /> Add Model Provider
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              {
                name: "gpt-model (TrueFoundry Gateway)",
                provider: "TrueFoundry AI Gateway → gateway.truefoundry.ai",
                model: "vm-polaris/openai",
                task: "MIGRATION_PLANNING",
                badge: "PRIMARY",
                cls: "tf-badge-info",
              },
              {
                name: "gpt-model (TrueFoundry Gateway)",
                provider: "TrueFoundry AI Gateway → gateway.truefoundry.ai",
                model: "vm-polaris/openai",
                task: "INDEPENDENT_CRITIQUE",
                badge: "CRITIC",
                cls: "tf-badge-warning",
              },
              {
                name: "gpt-model (TrueFoundry Gateway)",
                provider: "TrueFoundry AI Gateway → gateway.truefoundry.ai",
                model: "vm-polaris/openai",
                task: "INTENT_PARSING",
                badge: "FAST",
                cls: "tf-badge-success",
              },
            ].map((m, i) => (
              <div key={i} className="tf-card-subtle" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-main)", marginBottom: 2 }}>{m.name}</div>
                  <div className="tf-subtitle">Provider: {m.provider} · Task: <span className="code-font" style={{ fontSize: "11px" }}>{m.task}</span></div>
                  <div className="tf-subtitle" style={{ marginTop: 1 }}>Model ID: <span className="code-font" style={{ fontSize: "11px", color: "var(--accent-primary)" }}>{m.model}</span></div>
                </div>
                <span className={`tf-badge ${m.cls}`}>{m.badge}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
