import { useState, useEffect } from "react";
import type { ViewTab, SubTab } from "./types";
import { Sidebar } from "./components/Sidebar";
import { SubSidebar } from "./components/SubSidebar";
import { Header } from "./components/Header";
import { RehearsalView } from "./views/RehearsalView";
import { EvidenceView } from "./views/EvidenceView";
import { PolicyApprovalView } from "./views/PolicyApprovalView";
import { DatabaseInspectorView } from "./views/DatabaseInspectorView";
import { ModelRouterView } from "./views/ModelRouterView";
import { VerificationView } from "./views/VerificationView";
import { SettingsView } from "./views/SettingsView";
import { useMigrations, useReadiness } from "./hooks/useApi";
import * as api from "./api/client";

export function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>("rehearsals");
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("overview");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [activeMigrationId, setActiveMigrationId] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");

  // Live backend data
  const { data: migrationsData, refetch: refetchMigrations } = useMigrations();
  const { data: readiness } = useReadiness();

  // Track backend connectivity
  useEffect(() => {
    if (readiness !== null) {
      setBackendStatus(readiness.ready ? "online" : "offline");
    }
  }, [readiness]);

  // Set the first (latest) migration as active by default
  useEffect(() => {
    if (migrationsData?.data && migrationsData.data.length > 0 && !activeMigrationId) {
      setActiveMigrationId(migrationsData.data[0].id);
    }
  }, [migrationsData, activeMigrationId]);

  const activeMigration = migrationsData?.data?.find((m) => m.id === activeMigrationId) ?? null;
  const currentState = (activeMigration?.status as import("./types").MigrationState) ?? "INTAKE";

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    if (tab === "settings") {
      setActiveSubTab("models-catalog");
    } else {
      setActiveSubTab("overview");
    }
  };

  const handleToggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (isDarkMode) {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  };

  const handleResetDemo = async () => {
    if (!activeMigrationId) {
      alert("No active migration selected.");
      return;
    }
    if (confirm("Reset: Start a new migration workflow for the active request?")) {
      await refetchMigrations();
      setActiveMigrationId(null);
    }
  };

  const handleRunRehearsal = async () => {
    if (!activeMigrationId) {
      alert("No active migration. Create a migration request first.");
      return;
    }
    try {
      await api.rehearseMigration(activeMigrationId);
      await refetchMigrations();
      alert("Rehearsal completed! Evidence pack ready.");
    } catch (e) {
      alert(`Rehearsal failed: ${(e as Error).message}`);
    }
  };

  const handleGuardedExecute = async () => {
    if (!activeMigrationId) {
      alert("No active migration.");
      return;
    }
    const token = prompt("Enter your HMAC-SHA256 approval token:");
    if (!token) return;
    try {
      await api.executeMigration(activeMigrationId, token);
      await refetchMigrations();
      alert("Production migration executed and verified!");
    } catch (e) {
      alert(`Execution failed: ${(e as Error).message}`);
    }
  };

  const handleNewRehearsal = () => {
    setActiveTab("rehearsals");
    setActiveSubTab("overview");
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case "rehearsals":
        return (
          <RehearsalView
            activeMigrationId={activeMigrationId}
            migrations={migrationsData?.data ?? []}
            onSelectMigration={setActiveMigrationId}
            onNewMigration={async (text, db) => {
              try {
                const result = await api.createMigration({
                  request_text: text,
                  target_database: db,
                  target_branch: "main",
                });
                await refetchMigrations();
                setActiveMigrationId(result.data.id);
              } catch (e) {
                alert(`Failed: ${(e as Error).message}`);
              }
            }}
            onRunWorkflow={async () => {
              if (!activeMigrationId) return;
              try {
                await api.runFullWorkflow(activeMigrationId);
                await refetchMigrations();
                alert("Workflow started! Refreshing state...");
              } catch (e) {
                alert(`Workflow error: ${(e as Error).message}`);
              }
            }}
          />
        );
      case "evidence":
        return <EvidenceView migrationId={activeMigrationId} />;
      case "policy":
        return (
          <PolicyApprovalView
            migrationId={activeMigrationId}
            migration={activeMigration}
            onApprove={async (action, reason) => {
              if (!activeMigrationId) return;
              try {
                const result = await api.approveMigration(activeMigrationId, action, reason);
                await refetchMigrations();
                if (result.data.approvalToken) {
                  alert(
                    `${action} token issued!\n\nToken: ${result.data.approvalToken}\n\nExpires: ${result.data.expiresAt}\n\nCopy and use with Guarded Execute.`
                  );
                } else {
                  alert(result.data.message);
                }
              } catch (e) {
                alert(`Approval error: ${(e as Error).message}`);
              }
            }}
          />
        );
      case "inspector":
        return <DatabaseInspectorView migrationId={activeMigrationId} />;
      case "models":
        return <ModelRouterView migrationId={activeMigrationId} />;
      case "verification":
        return <VerificationView migrationId={activeMigrationId} />;
      case "settings":
        return <SettingsView activeSubTab={activeSubTab} backendStatus={backendStatus} readiness={readiness} />;
      default:
        return <RehearsalView activeMigrationId={activeMigrationId} migrations={[]} onSelectMigration={setActiveMigrationId} onNewMigration={async () => {}} onRunWorkflow={async () => {}} />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", backgroundColor: "var(--bg-primary)" }}>
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        onNewRehearsal={handleNewRehearsal}
      />

      <SubSidebar
        activeTab={activeTab}
        activeSubTab={activeSubTab}
        onSelectSubTab={setActiveSubTab}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <Header
          activeTab={activeTab}
          currentState={currentState}
          backendStatus={backendStatus}
          activeMigration={activeMigration}
          onResetDemo={handleResetDemo}
          onRunRehearsal={handleRunRehearsal}
          onGuardedExecute={handleGuardedExecute}
        />
        <main style={{ flex: 1, overflow: "hidden" }}>
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}

export default App;
