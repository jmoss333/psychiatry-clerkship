import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import type { TemporalRelationKind } from "../../domain/model";
import { useWorkspace } from "../../state/useWorkspace";
import { TimelineDialog } from "./TimelineDialog";
import {
  TEMPORAL_RELATION_KINDS,
  prepareTemporalRelationSave,
  type RelationshipDraft,
} from "./timelineModel";

type RelationshipEditorProps = {
  relationId?: string;
  onClose: () => void;
};

export function RelationshipEditor({
  relationId,
  onClose,
}: RelationshipEditorProps) {
  const { dispatch, workspace } = useWorkspace();
  const existing = relationId
    ? workspace.temporalRelations.find((relation) => relation.id === relationId)
    : undefined;
  if (relationId && !existing) {
    throw new Error(`Unknown temporal relationship ${relationId}`);
  }
  const [draft, setDraft] = useState<RelationshipDraft>(() => ({
    fromFactId: existing?.fromFactId ?? workspace.facts[0]?.id ?? "",
    toFactId: existing?.toFactId ?? workspace.facts[1]?.id ?? "",
    kind: existing?.kind ?? "preceded",
  }));
  const [error, setError] = useState<string | null>(null);
  const titleId = "relationship-editor-title";

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      dispatch({
        type: "upsertTemporalRelation",
        relation: prepareTemporalRelationSave(workspace, draft, relationId),
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Temporal relationship could not be saved",
      );
    }
  };

  return (
    <TimelineDialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>
        {existing ? "Edit temporal relationship" : "Add temporal relationship"}
      </h2>
      <form className="timeline-editor__form" onSubmit={save} noValidate>
        <label>
          From fact
          <select
            value={draft.fromFactId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                fromFactId: event.target.value,
              }))
            }
          >
            {workspace.facts.map((fact) => (
              <option key={fact.id} value={fact.id}>
                {fact.id} — {fact.text}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship
          <select
            value={draft.kind}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                kind: event.target.value as TemporalRelationKind,
              }))
            }
          >
            {TEMPORAL_RELATION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          To fact
          <select
            value={draft.toFactId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                toFactId: event.target.value,
              }))
            }
          >
            {workspace.facts.map((fact) => (
              <option key={fact.id} value={fact.id}>
                {fact.id} — {fact.text}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="field-error timeline-editor__wide" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-dialog__actions timeline-editor__wide">
          <Button type="submit" variant="primary">
            Save relationship
          </Button>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </TimelineDialog>
  );
}
