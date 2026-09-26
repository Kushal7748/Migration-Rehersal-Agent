import React from "react";
import {
  Shield,
  Plus,
  Play,
  FileCheck,
  Lock,
  Database,
  Cpu,
  CheckCircle,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import type { ViewTab } from "../types";

interface SidebarProps {
  activeTab: ViewTab;
  onSelectTab: (tab: ViewTab) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onNewRehearsal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isDarkMode,
  onToggleTheme,
  onNewRehearsal,
}) => {
  const navItems: Array<{ id: ViewTab; label: string; icon: React.ReactNode }> = [
    { id: "rehearsals", label: "Rehearsal", icon: <Play size={17} /> },
    { id: "evidence", label: "Evidence", icon: <FileCheck size={17} /> },
    { id: "policy", label: "Policy", icon: <Lock size={17} /> },
    { id: "inspector", label: "Inspector", icon: <Database size={17} /> },
    { id: "models", label: "Models", icon: <Cpu size={17} /> },
    { id: "verification", label: "Verify", icon: <CheckCircle size={17} /> },
  ];

  const navBtnStyle = (isActive: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "6px 4px",
    border: "none",
    borderRadius: 6,
    backgroundColor: isActive ? "var(--accent-light)" : "transparent",
    color: isActive ? "var(--accent-primary)" : "var(--text-subtle)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    cursor: "pointer",
    transition: "all 0.12s ease",
    position: "relative",
  });

  return (
    <aside
      style={{
        width: "var(--sidebar-width)",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 6px",
        zIndex: 50,
        overflowY: "auto",
        overflowX: "hidden",
        gap: 0,
      }}
    >
      {/* Brand Logo */}
      <div
        title="MIGR8 Autonomous Rehearsal Engine"
        style={{
          width: 36,
          height: 36,
          borderRadius: 7,
          backgroundColor: "var(--accent-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          marginBottom: 10,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)",
          flexShrink: 0,
        }}
        onClick={() => onSelectTab("rehearsals")}
      >
        <Shield size={19} />
      </div>

      {/* New Rehearsal Action Button */}
      <button
        title="New Migration Rehearsal"
        onClick={onNewRehearsal}
        style={{
          width: 36,
          height: 36,
          borderRadius: 7,
          border: "1px dashed var(--border-color)",
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          marginBottom: 10,
          transition: "all 0.12s ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--accent-primary)";
          e.currentTarget.style.color = "var(--accent-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-color)";
          e.currentTarget.style.color = "var(--text-subtle)";
        }}
      >
        <Plus size={16} />
      </button>

      {/* Thin divider */}
      <div style={{ width: "75%", height: 1, backgroundColor: "var(--border-color)", marginBottom: 10 }} />

      {/* Main Nav Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, width: "100%" }}>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              title={item.label}
              onClick={() => onSelectTab(item.id)}
              style={navBtnStyle(isActive)}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-main)";
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-subtle)";
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    left: -6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 22,
                    borderRadius: 2,
                    backgroundColor: "var(--accent-primary)",
                  }}
                />
              )}
              {item.icon}
              <span
                style={{
                  fontSize: "9.5px",
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.01em",
                  lineHeight: 1.2,
                  textAlign: "center",
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", width: "100%", paddingTop: 8 }}>
        <button
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          onClick={onToggleTheme}
          style={navBtnStyle(false)}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-main)"; e.currentTarget.style.backgroundColor = "var(--bg-tertiary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-subtle)"; e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          <span style={{ fontSize: "9.5px" }}>Theme</span>
        </button>

        <button
          title="Settings (Models, Connectors, Skills)"
          onClick={() => onSelectTab("settings")}
          style={navBtnStyle(activeTab === "settings")}
          onMouseEnter={(e) => {
            if (activeTab !== "settings") {
              e.currentTarget.style.color = "var(--text-main)";
              e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== "settings") {
              e.currentTarget.style.color = "var(--text-subtle)";
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <Settings size={16} />
          <span style={{ fontSize: "9.5px", fontWeight: activeTab === "settings" ? 600 : 400 }}>Settings</span>
        </button>

        {/* User Avatar */}
        <div
          title="Security Approver Profile"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            backgroundColor: "var(--accent-light)",
            border: "1px solid var(--accent-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: 700,
            color: "var(--accent-primary)",
            cursor: "pointer",
            marginTop: 6,
          }}
        >
          SA
        </div>
      </div>
    </aside>
  );
};
