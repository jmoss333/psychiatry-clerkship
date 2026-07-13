import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { FactChip } from "../../components/ui/FactChip";
import { useSyntheticDataGate } from "../../state/useSyntheticDataGate";
import { useWorkspace } from "../../state/useWorkspace";
import { FactEditor } from "./FactEditor";
import { RelationshipEditor } from "./RelationshipEditor";
import { TimelineGrid } from "./TimelineGrid";

type EditorState =
  | { kind: "event"; itemId?: string }
  | { kind: "relationship"; relationId?: string }
  | null;

export function TimelineWorkspace() {
  const { selectedFactIds, workspace } = useWorkspace();
  const { guardFreeTextEdit } = useSyntheticDataGate();
  const [editor, setEditor] = useState<EditorState>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addEventTriggerRef = useRef<HTMLButtonElement>(null);
  const addRelationshipTriggerRef = useRef<HTMLButtonElement>(null);

  const openEventEditor = (trigger: HTMLButtonElement, itemId?: string) => {
    editorTriggerRef.current = trigger;
    guardFreeTextEdit(() => setEditor({ kind: "event", itemId }));
  };

  const openRelationshipEditor = (
    trigger: HTMLButtonElement,
    relationId?: string,
  ) => {
    editorTriggerRef.current = trigger;
    setEditor({ kind: "relationship", relationId });
  };

  const closeEditor = () => {
    const logicalTarget = editor;
    setEditor(null);
    const trigger = editorTriggerRef.current;
    editorTriggerRef.current = null;
    queueMicrotask(() => {
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
      const eventTarget =
        logicalTarget?.kind === "event" && logicalTarget.itemId
          ? Array.from(
              document.querySelectorAll<HTMLElement>("[data-timeline-item-id]"),
            )
              .find(
                (element) =>
                  element.dataset.timelineItemId === logicalTarget.itemId,
              )
              ?.querySelector<HTMLButtonElement>(".timeline-mark__edit")
          : null;
      const relationshipTarget =
        logicalTarget?.kind === "relationship" && logicalTarget.relationId
          ? Array.from(
              document.querySelectorAll<HTMLElement>("[data-relation-id]"),
            )
              .find(
                (element) =>
                  element.dataset.relationId === logicalTarget.relationId,
              )
              ?.querySelector<HTMLButtonElement>("button[aria-label^='Edit']")
          : null;
      const fallback =
        logicalTarget?.kind === "relationship"
          ? addRelationshipTriggerRef.current
          : addEventTriggerRef.current;
      (eventTarget ?? relationshipTarget ?? fallback)?.focus();
    });
  };

  return (
    <section className="timeline-workspace" aria-labelledby="timeline-title">
      <header className="timeline-workspace__toolbar">
        <h2 id="timeline-title">Longitudinal timeline</h2>
        <div className="timeline-workspace__actions">
          <Button
            ref={addEventTriggerRef}
            variant="primary"
            onClick={(event) => openEventEditor(event.currentTarget)}
          >
            Add fictional event
          </Button>
          <Button
            ref={addRelationshipTriggerRef}
            onClick={(event) => openRelationshipEditor(event.currentTarget)}
          >
            Add temporal relationship
          </Button>
        </div>
      </header>

      <TimelineGrid
        onEditItem={(itemId, trigger) => openEventEditor(trigger, itemId)}
      />

      <div className="timeline-legend">
        <ul aria-label="Timeline display key">
          <li>
            <span
              className="timeline-legend__cue timeline-legend__cue--solid"
              aria-hidden="true"
            />
            Ongoing — solid line
          </li>
          <li>
            <span
              className="timeline-legend__cue timeline-legend__cue--dotted"
              aria-hidden="true"
            />
            Probable or uncertain — dotted line
          </li>
          <li>
            <span
              className="timeline-legend__cue timeline-legend__cue--filled"
              aria-hidden="true"
            />
            Point event — filled dot
          </li>
          <li>
            <span
              className="timeline-legend__cue timeline-legend__cue--outlined"
              aria-hidden="true"
            />
            Approximate — outlined dot
          </li>
        </ul>
        <p>All times are shown in the five shared relative-time columns.</p>
      </div>

      <div
        className="timeline-relations"
        aria-labelledby="saved-relations-title"
      >
        <h3 id="saved-relations-title">Saved temporal relationships</h3>
        {workspace.temporalRelations.length > 0 ? (
          <ul>
            {workspace.temporalRelations.map((relation) => {
              const label = `${relation.fromFactId} ${relation.kind} ${relation.toFactId}`;
              const selected =
                selectedFactIds.includes(relation.fromFactId) ||
                selectedFactIds.includes(relation.toFactId);
              return (
                <li
                  key={relation.id}
                  aria-label={label}
                  data-relation-id={relation.id}
                  className={selected ? "is-evidence-selected" : undefined}
                >
                  <span className="timeline-relations__statement">
                    <FactChip factId={relation.fromFactId} />
                    <span>{relation.kind}</span>
                    <FactChip factId={relation.toFactId} />
                  </span>
                  <Button
                    variant="ghost"
                    aria-label={`Edit ${label} relationship`}
                    onClick={(event) =>
                      openRelationshipEditor(event.currentTarget, relation.id)
                    }
                  >
                    Edit
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No temporal relationships saved yet.</p>
        )}
      </div>

      {editor?.kind === "event"
        ? createPortal(
            <FactEditor itemId={editor.itemId} onClose={closeEditor} />,
            document.body,
          )
        : null}
      {editor?.kind === "relationship"
        ? createPortal(
            <RelationshipEditor
              relationId={editor.relationId}
              onClose={closeEditor}
            />,
            document.body,
          )
        : null}
    </section>
  );
}
