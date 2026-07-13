import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { GuardedTextArea } from "../../components/ui/GuardedTextArea";
import {
  FACT_SOURCE_OPTIONS,
  RELIABILITY_OPTIONS,
  VISIBLE_TIME_COLUMNS,
  nextFactId,
  prepareFactTimelineSave,
} from "../../domain/factEditing";
import { assertWorkspaceIntegrity } from "../../domain/integrity";
import type {
  CaseFactKind,
  FactCertainty,
  FactReliability,
  FactSource,
  TimelineItem,
  TimelineLane,
  WorkspaceState,
} from "../../domain/model";
import {
  MAX_EPISODE_ID_LENGTH,
  TimelineItemSchema,
  WorkspaceStateSchema,
} from "../../domain/schemas";
import { useWorkspace } from "../../state/useWorkspace";
import { TIMELINE_LANES } from "./timelineModel";
import { TimelineDialog } from "./TimelineDialog";

const CERTAINTY_OPTIONS: ReadonlyArray<{
  value: FactCertainty;
  label: string;
}> = [
  { value: "confirmed", label: "Confirmed" },
  { value: "probable", label: "Probable" },
  { value: "possible", label: "Possible" },
  { value: "unclear", label: "Unclear" },
];

const KIND_OPTIONS: ReadonlyArray<{ value: CaseFactKind; label: string }> = [
  { value: "symptom", label: "Symptom" },
  { value: "observation", label: "Observation" },
  { value: "collateral", label: "Collateral" },
  { value: "medication", label: "Medication" },
  { value: "substance", label: "Substance" },
  { value: "medical_event", label: "Medical event" },
  { value: "laboratory", label: "Laboratory" },
  { value: "function", label: "Function" },
  { value: "stressor", label: "Stressor" },
];

type EventDraft = {
  factId: string;
  factText: string;
  source: FactSource;
  reliability: FactReliability;
  certainty: FactCertainty;
  kind: CaseFactKind;
  label: string;
  lane: TimelineLane;
  start: string;
  end: string;
  approximate: boolean;
  episodeId: string;
  sortOrder: string;
};

type FactEditorProps = {
  itemId?: string;
  onClose: () => void;
};

function makeDraft(
  workspace: WorkspaceState,
  item: TimelineItem | undefined,
): EventDraft {
  return {
    factId: item?.factIds[0] ?? nextFactId(workspace.facts),
    factText: "",
    source: "patient_report",
    reliability: "unknown",
    certainty: "unclear",
    kind: "observation",
    label: item?.label ?? "",
    lane: item?.lane ?? "mood",
    start: item?.start ?? "",
    end: item?.end ?? "",
    approximate: item?.approximate ?? false,
    episodeId: item?.episodeId ?? "",
    sortOrder: item ? String(item.sortOrder) : "",
  };
}

function normalizedOptional(value: string): string | undefined {
  return value.trim() || undefined;
}

function preserveOrNormalize(
  draftValue: string,
  existingValue: string | undefined,
): string | undefined {
  return draftValue === (existingValue ?? "")
    ? existingValue
    : normalizedOptional(draftValue);
}

function timelineIssue(input: unknown): TimelineItem {
  const result = TimelineItemSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      result.error.issues[0]?.message ?? "Timeline event is invalid",
    );
  }
  return result.data;
}

function validateCombinedWorkspace(
  workspace: WorkspaceState,
  facts: WorkspaceState["facts"],
  item: TimelineItem,
) {
  const timelineItems = workspace.timelineItems.some(
    (timelineItem) => timelineItem.id === item.id,
  )
    ? workspace.timelineItems.map((timelineItem) =>
        timelineItem.id === item.id ? item : timelineItem,
      )
    : [...workspace.timelineItems, item];
  assertWorkspaceIntegrity(
    WorkspaceStateSchema.parse({ ...workspace, facts, timelineItems }),
  );
}

function prepareExistingEventSave(
  workspace: WorkspaceState,
  item: TimelineItem,
  draft: EventDraft,
): TimelineItem {
  const label = draft.label === item.label ? item.label : draft.label.trim();
  const episodeId = preserveOrNormalize(draft.episodeId, item.episodeId);
  const start = preserveOrNormalize(draft.start, item.start);
  const end = preserveOrNormalize(draft.end, item.end);
  const candidate = timelineIssue({
    ...item,
    label,
    lane: draft.lane,
    approximate: draft.approximate,
    learnerEdited: true,
    sortOrder: Number(draft.sortOrder),
    ...(start ? { start } : { start: undefined }),
    ...(end ? { end } : { end: undefined }),
    ...(episodeId ? { episodeId } : { episodeId: undefined }),
  });
  validateCombinedWorkspace(workspace, workspace.facts, candidate);
  return candidate;
}

function prepareManualEventSave(workspace: WorkspaceState, draft: EventDraft) {
  const prepared = prepareFactTimelineSave(workspace, {
    id: nextFactId(workspace.facts),
    text: draft.factText,
    source: draft.source,
    reliability: draft.reliability,
    certainty: draft.certainty,
    kind: draft.kind,
    start: draft.start,
    end: draft.end,
    temporalPrecision: draft.approximate ? "relative" : "exact",
    tags: "",
    timelineLabel: draft.label,
    lane: draft.lane,
    sortOrder: draft.sortOrder,
  });
  const episodeId = normalizedOptional(draft.episodeId);
  const timelineItem = timelineIssue({
    ...prepared.timelineItem,
    approximate: draft.approximate,
    ...(episodeId ? { episodeId } : {}),
  });
  validateCombinedWorkspace(
    workspace,
    [...workspace.facts, prepared.fact],
    timelineItem,
  );
  return { fact: prepared.fact, timelineItem };
}

export function FactEditor({ itemId, onClose }: FactEditorProps) {
  const { dispatch, workspace } = useWorkspace();
  const item = itemId
    ? workspace.timelineItems.find((timelineItem) => timelineItem.id === itemId)
    : undefined;
  if (itemId && !item) throw new Error(`Unknown timeline item ${itemId}`);
  const [draft, setDraft] = useState(() => makeDraft(workspace, item));
  const [error, setError] = useState<string | null>(null);
  const titleId = "timeline-event-editor-title";
  const manual = item === undefined;

  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      if (item) {
        dispatch({
          type: "upsertTimelineItem",
          item: prepareExistingEventSave(workspace, item, draft),
        });
      } else {
        const prepared = prepareManualEventSave(workspace, draft);
        dispatch({ type: "upsertFact", fact: prepared.fact });
        dispatch({
          type: "upsertTimelineItem",
          item: prepared.timelineItem,
        });
      }
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Timeline event could not be saved",
      );
    }
  };

  return (
    <TimelineDialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>
        {manual ? "Add fictional event" : "Edit timeline event"}
      </h2>
      <form className="timeline-editor__form" onSubmit={save} noValidate>
        <label>
          Fact ID
          <input value={draft.factId} readOnly />
        </label>
        {manual ? (
          <>
            <label className="timeline-editor__wide">
              Fictional event fact
              <GuardedTextArea
                value={draft.factText}
                maxLength={280}
                onChange={(event) => update("factText", event.target.value)}
              />
            </label>
            <label>
              Source
              <select
                value={draft.source}
                onChange={(event) =>
                  update("source", event.target.value as FactSource)
                }
              >
                {FACT_SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reliability
              <select
                value={draft.reliability}
                onChange={(event) =>
                  update("reliability", event.target.value as FactReliability)
                }
              >
                {RELIABILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Certainty
              <select
                value={draft.certainty}
                onChange={(event) =>
                  update("certainty", event.target.value as FactCertainty)
                }
              >
                {CERTAINTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kind
              <select
                value={draft.kind}
                onChange={(event) =>
                  update("kind", event.target.value as CaseFactKind)
                }
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label className="timeline-editor__wide">
          Timeline label
          <GuardedTextArea
            value={draft.label}
            maxLength={280}
            onChange={(event) => update("label", event.target.value)}
          />
        </label>
        <label>
          Timeline lane
          <select
            value={draft.lane}
            onChange={(event) =>
              update("lane", event.target.value as TimelineLane)
            }
          >
            {TIMELINE_LANES.map((lane) => (
              <option key={lane.value} value={lane.value}>
                {lane.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visible time column
          <select
            value={draft.sortOrder}
            onChange={(event) => update("sortOrder", event.target.value)}
          >
            <option value="">Choose a time column</option>
            {VISIBLE_TIME_COLUMNS.map((column) => (
              <option key={column.value} value={column.value}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start
          <input
            value={draft.start}
            onChange={(event) => update("start", event.target.value)}
          />
        </label>
        <label>
          End
          <input
            value={draft.end}
            onChange={(event) => update("end", event.target.value)}
          />
        </label>
        <label className="timeline-editor__checkbox">
          <input
            type="checkbox"
            checked={draft.approximate}
            onChange={(event) => update("approximate", event.target.checked)}
          />
          Approximate date
        </label>
        <label className="timeline-editor__wide">
          Episode ID
          <GuardedTextArea
            value={draft.episodeId}
            maxLength={MAX_EPISODE_ID_LENGTH}
            onChange={(event) => update("episodeId", event.target.value)}
          />
        </label>
        {error ? (
          <p className="field-error timeline-editor__wide" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-dialog__actions timeline-editor__wide">
          <Button variant="primary" type="submit">
            Save event
          </Button>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </TimelineDialog>
  );
}
