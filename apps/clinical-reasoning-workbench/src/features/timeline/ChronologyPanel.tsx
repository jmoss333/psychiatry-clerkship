import { FactChip } from "../../components/ui/FactChip";
import { buildChronologyPrompts } from "../../domain/reasoningChecks";
import { useWorkspace } from "../../state/useWorkspace";
import { learnerChronologyItems } from "./timelineModel";

export function ChronologyPanel() {
  const { workspace } = useWorkspace();
  const prompts = buildChronologyPrompts(workspace);
  const summaryItems = learnerChronologyItems(workspace.timelineItems);

  return (
    <div
      className="chronology-panel"
      role="region"
      aria-label="Chronology guidance"
    >
      <div className="chronology-panel__section">
        <h3>Chronology questions</h3>
        {prompts.length > 0 ? (
          <ul className="chronology-panel__prompts">
            {prompts.map((prompt) => (
              <li key={prompt}>
                <span>{prompt}</span>
                <strong>Unresolved</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>All current chronology questions have a saved relationship.</p>
        )}
      </div>
      <div className="chronology-panel__section">
        <h3>Learner chronology summary</h3>
        {summaryItems.length > 0 ? (
          <ul aria-label="Learner chronology summary">
            {summaryItems.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                {item.factIds.map((factId) => (
                  <FactChip key={factId} factId={factId} />
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p>No learner-edited timeline events saved yet.</p>
        )}
      </div>
    </div>
  );
}
