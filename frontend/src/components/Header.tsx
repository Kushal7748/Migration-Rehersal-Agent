import React from "react";
import type { ViewTab, MigrationState } from "../types";
import type { MigrationRequest } from "../api/client";
import { Play, RotateCcw, ShieldCheck, Activity } from "lucide-react";

interface HeaderProps {
  activeTab: ViewTab;
  currentState: MigrationState;
  backendStatus: "connecting" | "online" | "offline";
  activeMigration: MigrationRequest | null;
  onResetDemo: () => void;
  onRunRehearsal: () => void;
  onGuardedExecute: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  currentState,
  backendStatus,
  activeMigration,
  onResetDemo,
  onRunRehearsal,
  onGuardedExecute,
}) => {
  const getTitle = () => {
    switch (activeTab) {
      case "rehearsals": return "Rehearsal & Planning Studio";
      case "evidence": return "Immutable Evidence Pack";
      case "policy": return "Policy Service & Approval Gate";
      case "inspector": return "Neon Database Inspector";
      case "models": return "Model Router & AI Gateway";
      case "verification": return "Verification & Audit Trail";
      case "settings": return "Settings & Providers";
      default: return "MIGR8";
    }
  };

  const getStateBadgeClass = () => {
    switch (currentState) {
      case "COMPLETE": return "tf-badge-success";
      case "EVIDENCE_READY":
      case "AWAITING_APPROVAL":
      case "APPROVED": return "tf-badge-info";
      case "REPLANNING":
      case "REHEARSING": return "tf-badge-warning";
      case "FAILED":
      case "REJECTED":
      case "BLOCKED":
      case "STALE": return "tf-badge-danger";
      default: return "tf-badge-info";
    }
  };

  const backendDot =
    backendStatus === "online"
      ? { color: "#10b981", label: "API Online" }
      : backendStatus === "offline"
      ? { color: "#ef4444", label: "API Offline" }
      : { color: "#f59e0b", label: "Connecting…" };

  return (
    <header
      style={{
        height: "var(--header-height)",
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        gap: 10,
        flexShrink: 0,
      }}
    >
      {/* Left: title + state + backend status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
        <h1
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-main)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {getTitle()}
        </h1>

        {activeMigration && (
          <span className={`tf-badge ${getStateBadgeClass()}`}>
            {currentState}
          </span>
        )}

        {/* Backend connectivity indicator */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: "10.5px",
            color: backendDot.color,
            backgroundColor: `${backendDot.color}18`,
            padding: "1px 6px",
            borderRadius: 4,
            border: `1px solid ${backendDot.color}30`,
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
        >
          <Activity size={10} />
          {backendDot.label}
        </span>

        {activeMigration && (
          <span
            style={{
              fontSize: "10.5px",
              color: "var(--text-subtle)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 280,
            }}
            title={activeMigration.request_text}
          >
            · {activeMigration.id.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onResetDemo}
          className="tf-button-secondary"
          title="Refresh migrations data"
        >
          <RotateCcw size={12} />
          Refresh
        </button>

        <button
          onClick={onRunRehearsal}
          className="tf-button-primary"
          title="Trigger isolated rehearsal on Neon COW branch"
          disabled={!activeMigration}
          style={{ opacity: !activeMigration ? 0.5 : 1 }}
        >
          <Play size={12} />
          Rehearse
        </button>

        <button
          onClick={onGuardedExecute}
          className="tf-button-primary"
          style={{ backgroundColor: "var(--success-text)", opacity: !activeMigration ? 0.5 : 1 }}
          title="Execute production write via Policy Service — requires approval token"
          disabled={!activeMigration}
        >
          <ShieldCheck size={12} />
          Execute
        </button>
      </div>
    </header>
  );
};
