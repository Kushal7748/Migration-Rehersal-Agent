import React from "react";
import { Cpu, Activity, Layers, RefreshCw } from "lucide-react";
import { useModelAnalytics, useTrace } from "../hooks/useApi";

interface ModelRouterViewProps {
  migrationId: string | null;
}

const MODEL_ROUTING_CONFIG = [
  {
    task: "INTENT PARSING",
    model: "gpt-model (via TrueFoundry)",
    provider: "TrueFoundry Gateway → OpenAI",
    role: "Fast structured intent extraction & schema parsing",
    capabilities: ["FAST_INFERENCE", "LOW_COST"],
  },
  {
    task: "MIGRATION PLANNING",
    model: "gpt-model (via TrueFoundry)",
    provider: "TrueFoundry Gateway → OpenAI",
    role: "Primary SQL planner & phased migration strategist",
    capabilities: ["REASONING", "SQL_GENERATION"],
  },
  {
    task: "INDEPENDENT CRITIQUE",
    model: "gpt-model (via TrueFoundry)",
    provider: "TrueFoundry Gateway → OpenAI",
    role: "Rigorous independent plan challenger & safety auditor",
    capabilities: ["CRITIQUE", "SAFETY_AUDIT"],
  },
];

export const ModelRouterView: React.FC<ModelRouterViewProps> = ({ migrationId }) => {
  const { data: analytics, loading: analyticsLoading } = useModelAnalytics();
  const { data: trace, loading: traceLoading } = useTrace(migrationId);

  const routingLogs = trace?.modelRoutingLog ?? [];

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - var(--header-height))", overflowY: "auto" }}>

      {/* Top Banner */}
      <div className="tf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Cpu size={13} color="var(--accent-primary)" />
              <span className="tf-section-label">TrueFoundry AI Gateway & Model Routing</span>
            </div>
            <div className="tf-title">Multi-Model Orchestration & Task-Based Routing</div>
            <div className="tf-subtitle" style={{ marginTop: 3 }}>
              Business logic invokes task classes, not model names. Gateway: <span className="code-font" style={{ fontSize: "11px" }}>https://gateway.truefoundry.ai</span>
            </div>
          </div>
          <span className="tf-badge tf-badge-info">TRUEFOUNDRY GATEWAY ACTIVE</span>
        </div>
      </div>

      {/* Task Routing Matrix */}
      <div className="tf-card">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Layers size={13} color="var(--accent-primary)" />
          <span className="tf-title">Configured Model Routing Matrix</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {MODEL_ROUTING_CONFIG.map((item, idx) => (
            <div key={idx} className="tf-card-subtle" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="tf-section-label">{item.task}</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-main)" }}>{item.model}</div>
              <div className="tf-subtitle">{item.role}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-subtle)" }}>{item.provider}</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                {item.capabilities.map((c, i) => (
                  <span key={i} className="tf-badge tf-badge-info" style={{ fontSize: "10px" }}>{c}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Telemetry from this migration */}
      {migrationId && (
        <div className="tf-card">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Activity size={13} color="var(--accent-primary)" />
            <span className="tf-title">Live Routing Log for Active Migration</span>
            {traceLoading && <RefreshCw size={12} color="var(--text-subtle)" />}
            <span className="tf-subtitle">({routingLogs.length} API calls)</span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                {["TASK CLASS", "MODEL", "TOKENS IN/OUT", "LATENCY", "COST (USD)", "STATUS"].map((h) => (
                  <th key={h} style={{ padding: "5px 10px", fontSize: "10.5px", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routingLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "5px 10px" }}>
                    <span className="tf-badge tf-badge-info">{log.task_class}</span>
                  </td>
                  <td className="code-font" style={{ padding: "5px 10px", color: "var(--text-main)", fontSize: "11px" }}>{log.selected_model}</td>
                  <td style={{ padding: "5px 10px", color: "var(--text-muted)", fontSize: "11.5px" }}>
                    {log.input_tokens.toLocaleString()} / {log.output_tokens.toLocaleString()}
                  </td>
                  <td style={{ padding: "5px 10px", color: "var(--text-main)" }}>{log.latency_ms}ms</td>
                  <td style={{ padding: "5px 10px", color: "var(--success-text)", fontWeight: 600 }}>
                    ${log.estimated_cost_usd.toFixed(4)}
                  </td>
                  <td style={{ padding: "5px 10px" }}>
                    <span className={`tf-badge tf-badge-${log.status === "SUCCESS" ? "success" : log.status === "FALLBACK_USED" ? "warning" : "danger"}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!traceLoading && routingLogs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "var(--text-subtle)", fontSize: "12px" }}>
                    No model calls recorded for this migration yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Aggregate Analytics */}
      <div className="tf-card">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Activity size={13} color="var(--accent-primary)" />
          <span className="tf-title">Aggregate Model Telemetry (All Migrations)</span>
          {analyticsLoading && <RefreshCw size={12} color="var(--text-subtle)" />}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
              {["PROVIDER", "MODEL", "TASK", "CALLS", "TOTAL TOKENS", "AVG LATENCY", "TOTAL COST"].map((h) => (
                <th key={h} style={{ padding: "5px 10px", fontSize: "10.5px", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(analytics ?? []).map((row, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid var(--border-color)" }}>
                <td style={{ padding: "5px 10px", color: "var(--text-muted)", fontSize: "11.5px" }}>{row.provider}</td>
                <td className="code-font" style={{ padding: "5px 10px", color: "var(--text-main)", fontSize: "11px" }}>{row.selected_model}</td>
                <td style={{ padding: "5px 10px" }}><span className="tf-badge tf-badge-info">{row.task_class}</span></td>
                <td style={{ padding: "5px 10px", color: "var(--text-main)" }}>{row.total_calls}</td>
                <td style={{ padding: "5px 10px", color: "var(--text-muted)" }}>{Number(row.total_tokens).toLocaleString()}</td>
                <td style={{ padding: "5px 10px", color: "var(--text-main)" }}>{Number(row.avg_latency_ms).toFixed(0)}ms</td>
                <td style={{ padding: "5px 10px", color: "var(--success-text)", fontWeight: 600 }}>
                  ${Number(row.total_estimated_cost_usd).toFixed(4)}
                </td>
              </tr>
            ))}
            {!analyticsLoading && (!analytics || analytics.length === 0) && (
              <tr>
                <td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "var(--text-subtle)", fontSize: "12px" }}>
                  No model analytics data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
