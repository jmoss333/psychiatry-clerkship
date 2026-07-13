import { useRef } from "react";
import type { KeyboardEvent } from "react";

export type WorkbenchTab = "timeline" | "mse" | "differential" | "challenge";

const TABS: ReadonlyArray<{ id: WorkbenchTab; label: string }> = [
  { id: "timeline", label: "Timeline" },
  { id: "mse", label: "MSE" },
  { id: "differential", label: "Differential" },
  { id: "challenge", label: "Challenge Diagnosis" },
];

type TabNavProps = {
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
};

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activate = (index: number) => {
    const next = TABS[index];
    if (!next) return;
    onTabChange(next.id);
    tabRefs.current[index]?.focus();
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    activate(nextIndex);
  };

  return (
    <div className="tab-nav" role="tablist" aria-label="Workbench views">
      {TABS.map((tab, index) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
