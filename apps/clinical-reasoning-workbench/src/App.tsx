import { useState } from "react";
import { AppShell } from "./components/AppShell";
import type { WorkbenchTab } from "./components/TabNav";
import { WorkspaceRecovery } from "./components/WorkspaceRecovery";
import { ChallengeWorkspace } from "./features/challenge/ChallengeWorkspace";
import { DifferentialWorkspace } from "./features/differential/DifferentialWorkspace";
import { MseWorkspace } from "./features/mse/MseWorkspace";
import { TimelineWorkspace } from "./features/timeline/TimelineWorkspace";
import { ChronologyPanel } from "./features/timeline/ChronologyPanel";
import { useWorkspace } from "./state/useWorkspace";

export function App() {
  const [tab, setTab] = useState<WorkbenchTab>("timeline");
  const { loadError, persistenceError, resetInvalidWorkspace } = useWorkspace();

  if (loadError) {
    return (
      <WorkspaceRecovery
        message={loadError}
        persistenceError={persistenceError}
        onReset={resetInvalidWorkspace}
      />
    );
  }

  return (
    <AppShell
      activeTab={tab}
      onTabChange={setTab}
      teachingSlot={tab === "timeline" ? <ChronologyPanel /> : null}
    >
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "timeline" ? <TimelineWorkspace /> : null}
        {tab === "mse" ? <MseWorkspace /> : null}
        {tab === "differential" ? <DifferentialWorkspace /> : null}
        {tab === "challenge" ? <ChallengeWorkspace /> : null}
      </div>
    </AppShell>
  );
}
