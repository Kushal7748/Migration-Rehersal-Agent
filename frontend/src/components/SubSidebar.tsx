import React from "react";
import type { ViewTab, SubTab } from "../types";
import {
  Activity, Layers, FileCode, Sliders, Share2, Zap, Box, Key, ShieldAlert, History,
} from "lucide-react";

interface SubSidebarProps {
  activeTab: ViewTab;
  activeSubTab: SubTab;
  onSelectSubTab: (subTab: SubTab) => void;
}

export const SubSidebar: React.FC<SubSidebarProps> = ({
  activeTab,
  activeSubTab,
  onSelectSubTab,
}) => {
  const getSubItems = (): Array<{ id: SubTab; label: string; icon: React.ReactNode }> => {
    switch (activeTab) {
      case "settings":
        return [
          { id: "models-catalog", label: "Models", icon: <Sliders size={14} /> },
          { id: "connectors", label: "Connectors", icon: <Share2 size={14} /> },
          { id: "skills", label: "Skills", icon: <Zap size={14} /> },
          { id: "sandbox-providers", label: "Sandbox", icon: <Box size={14} /> },
        ];
      case "rehearsals":
        return [
          { id: "overview", label: "Overview", icon: <Activity size={14} /> },
          { id: "live", label: "Live Run", icon: <Layers size={14} /> },
          { id: "state-machine", label: "State Flow", icon: <FileCode size={14} /> },
        ];
      case "policy":
        return [
          { id: "overview", label: "Tokens", icon: <Key size={14} /> },
          { id: "live", label: "Execution", icon: <ShieldAlert size={14} /> },
        ];
      default:
        return [
          { id: "overview", label: "Overview", icon: <Activity size={14} /> },
          { id: "audit", label: "Audit", icon: <History size={14} /> },
        ];
    }
  };

  const items = getSubItems();

  const sectionLabel = {
    rehearsals: "REHEARSAL",
    evidence: "EVIDENCE",
    policy: "POLICY",
    inspector: "INSPECTOR",
    models: "MODELS",
    verification: "VERIFY",
    settings: "SETTINGS",
  }[activeTab] ?? activeTab.toUpperCase();

  return (
    <div
      style={{
        width: "var(--subsidebar-width)",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "12px 8px",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Section label */}
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          color: "var(--text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
          paddingLeft: 8,
        }}
      >
        {sectionLabel}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => {
          const isSelected = activeSubTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSubTab(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 5,
                border: "none",
                backgroundColor: isSelected ? "var(--bg-tertiary)" : "transparent",
                color: isSelected ? "var(--text-main)" : "var(--text-muted)",
                fontSize: "12px",
                fontWeight: isSelected ? 600 : 400,
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.12s ease",
                width: "100%",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-main)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }
              }}
            >
              <span style={{ color: isSelected ? "var(--accent-primary)" : "inherit", flexShrink: 0 }}>
                {item.icon}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label}
              </span>
              {isSelected && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: "var(--accent-primary)",
                    marginLeft: "auto",
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
