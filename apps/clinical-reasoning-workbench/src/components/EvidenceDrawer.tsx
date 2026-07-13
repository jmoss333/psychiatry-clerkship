import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  CaseFact,
  CaseFactKind,
  FactCertainty,
  FactReliability,
  FactSource,
  TemporalPrecision,
  TimelineLane,
  WorkspaceState,
} from "../domain/model";
import {
  FACT_SOURCE_OPTIONS,
  RELIABILITY_OPTIONS,
  TIMELINE_LANE_OPTIONS,
  VISIBLE_TIME_COLUMNS,
  FactSaveValidationError,
  findTimelineForFact,
  nextFactId,
  prepareFactTimelineSave,
  type FactDraft,
  type FactDraftField,
} from "../domain/factEditing";
import { useSyntheticDataGate } from "../state/useSyntheticDataGate";
import { useWorkspace } from "../state/useWorkspace";
import { Button } from "./ui/Button";
import { GuardedTextArea } from "./ui/GuardedTextArea";
import { SourceReliability } from "./ui/SourceReliability";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

const PRECISION_OPTIONS: ReadonlyArray<{
  value: TemporalPrecision;
  label: string;
}> = [
  { value: "exact", label: "Exact" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "relative", label: "Relative" },
];

const SOURCE_LABELS = Object.fromEntries(
  FACT_SOURCE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<FactSource, string>;
const CERTAINTY_LABELS = Object.fromEntries(
  CERTAINTY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<FactCertainty, string>;

function makeDraft(
  workspace: WorkspaceState,
  fact: CaseFact | undefined,
): FactDraft {
  const factId = fact?.id ?? nextFactId(workspace.facts);
  const timelineItem = fact
    ? findTimelineForFact(workspace, fact.id)
    : undefined;
  return {
    id: factId,
    text: fact?.text ?? "",
    source: fact?.source ?? "patient_report",
    reliability: fact?.reliability ?? "unknown",
    certainty: fact?.certainty ?? "unclear",
    kind: fact?.kind ?? "observation",
    start: fact?.start ?? "",
    end: fact?.end ?? "",
    temporalPrecision: fact ? (fact.temporalPrecision ?? "") : "exact",
    tags: fact?.tags.join(", ") ?? "",
    timelineLabel: timelineItem?.label ?? "",
    lane: timelineItem?.lane ?? "mood",
    sortOrder: timelineItem ? String(timelineItem.sortOrder) : "",
  };
}

type FactEditorProps = {
  editingFactId?: string;
  onClose: () => void;
};

function FactEditor({ editingFactId, onClose }: FactEditorProps) {
  const { dispatch, workspace } = useWorkspace();
  const fact = editingFactId
    ? workspace.facts.find((item) => item.id === editingFactId)
    : undefined;
  const [draft, setDraft] = useState(() => makeDraft(workspace, fact));
  const [error, setError] = useState<{
    message: string;
    field: FactDraftField;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const errorId = "fact-editor-error";

  const errorProps = (field: FactDraftField) =>
    error?.field === field
      ? ({ "aria-invalid": true, "aria-describedby": errorId } as const)
      : {};

  useEffect(() => {
    const background = document.querySelector<HTMLElement>(
      ".synthetic-gate-background",
    );
    const wasInert = background?.hasAttribute("inert") ?? false;
    background?.setAttribute("inert", "");
    textRef.current?.focus();
    return () => {
      if (!wasInert) background?.removeAttribute("inert");
    };
  }, []);

  const update = <K extends keyof FactDraft>(key: K, value: FactDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const closeOnEscapeAndTrapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
        [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const prepared = prepareFactTimelineSave(workspace, draft, editingFactId);
      dispatch({ type: "upsertFact", fact: prepared.fact });
      dispatch({
        type: "upsertTimelineItem",
        item: prepared.timelineItem,
      });
      onClose();
    } catch (saveError) {
      setError({
        message:
          saveError instanceof Error
            ? saveError.message
            : "Fact could not be saved",
        field:
          saveError instanceof FactSaveValidationError
            ? saveError.field
            : "form",
      });
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal-dialog fact-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fact-editor-title"
        onKeyDown={closeOnEscapeAndTrapFocus}
      >
        <h2 id="fact-editor-title">
          {editingFactId ? `Edit ${editingFactId}` : "Add fictional fact"}
        </h2>
        <form onSubmit={save} noValidate>
          <label>
            Fact ID
            <input value={draft.id} readOnly {...errorProps("id")} />
          </label>
          <label className="fact-editor__wide">
            Fact text
            <GuardedTextArea
              ref={textRef}
              value={draft.text}
              {...errorProps("text")}
              onChange={(event) => update("text", event.target.value)}
            />
          </label>
          <label>
            Source
            <select
              value={draft.source}
              {...errorProps("source")}
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
              {...errorProps("reliability")}
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
              {...errorProps("certainty")}
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
              {...errorProps("kind")}
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
          <label>
            Start
            <input
              value={draft.start}
              {...errorProps("start")}
              onChange={(event) => update("start", event.target.value)}
            />
          </label>
          <label>
            End
            <input
              value={draft.end}
              {...errorProps("end")}
              onChange={(event) => update("end", event.target.value)}
            />
          </label>
          <label>
            Temporal precision
            <select
              value={draft.temporalPrecision}
              {...errorProps("temporalPrecision")}
              onChange={(event) =>
                update(
                  "temporalPrecision",
                  event.target.value as TemporalPrecision | "",
                )
              }
            >
              <option value="">Not specified</option>
              {PRECISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tags
            <input
              value={draft.tags}
              {...errorProps("tags")}
              onChange={(event) => update("tags", event.target.value)}
            />
          </label>
          <label className="fact-editor__wide">
            Timeline label
            <GuardedTextArea
              value={draft.timelineLabel}
              {...errorProps("timelineLabel")}
              onChange={(event) => update("timelineLabel", event.target.value)}
            />
          </label>
          <label>
            Timeline lane
            <select
              value={draft.lane}
              {...errorProps("lane")}
              onChange={(event) =>
                update("lane", event.target.value as TimelineLane)
              }
            >
              {TIMELINE_LANE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visible time-column order
            <select
              value={draft.sortOrder}
              {...errorProps("sortOrder")}
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
          {error ? (
            <p
              id={errorId}
              className="field-error fact-editor__wide"
              role="alert"
            >
              {error.message}
            </p>
          ) : null}
          <div className="modal-dialog__actions fact-editor__wide">
            <Button variant="primary" type="submit">
              Save fact
            </Button>
            <Button
              type="button"
              aria-label="Cancel fact editing"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

type EditingState = { factId?: string } | null;

export function EvidenceDrawer() {
  const { evidenceFocusRequest, selectedFactIds, selectFacts, workspace } =
    useWorkspace();
  const { guardFreeTextEdit } = useSyntheticDataGate();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<FactSource | "all">("all");
  const [reliability, setReliability] = useState<FactReliability | "all">(
    "all",
  );
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [dismissedEvidenceRequestId, setDismissedEvidenceRequestId] = useState<
    number | null
  >(null);
  const [editing, setEditing] = useState<EditingState>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addFactButtonRef = useRef<HTMLButtonElement>(null);

  const visibleFacts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return workspace.facts.filter((fact) => {
      const pinnedByCitation =
        evidenceFocusRequest?.requestId !== dismissedEvidenceRequestId &&
        evidenceFocusRequest?.factId === fact.id;
      if (!pinnedByCitation) {
        if (source !== "all" && fact.source !== source) return false;
        if (reliability !== "all" && fact.reliability !== reliability) {
          return false;
        }
        if (selectedOnly && !selectedFactIds.includes(fact.id)) return false;
      }
      if (!normalizedSearch) return true;
      const searchable = [
        fact.id,
        fact.text,
        SOURCE_LABELS[fact.source],
        fact.reliability,
        fact.certainty,
        fact.start,
        fact.end,
        ...fact.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return pinnedByCitation || searchable.includes(normalizedSearch);
    });
  }, [
    evidenceFocusRequest?.factId,
    evidenceFocusRequest?.requestId,
    dismissedEvidenceRequestId,
    reliability,
    search,
    selectedFactIds,
    selectedOnly,
    source,
    workspace.facts,
  ]);

  useLayoutEffect(() => {
    if (!evidenceFocusRequest) return;
    const row = rowRefs.current.get(evidenceFocusRequest.factId);
    row?.scrollIntoView?.({ block: "nearest" });
    row?.focus();
  }, [evidenceFocusRequest]);

  const toggleFact = (factId: string) => {
    setDismissedEvidenceRequestId(evidenceFocusRequest?.requestId ?? null);
    selectFacts(
      selectedFactIds.includes(factId)
        ? selectedFactIds.filter((id) => id !== factId)
        : [...selectedFactIds, factId],
    );
  };

  const requestEditor = (trigger: HTMLButtonElement, factId?: string) => {
    editorTriggerRef.current = trigger;
    guardFreeTextEdit(() => setEditing(factId ? { factId } : {}));
  };

  const closeEditor = () => {
    setEditing(null);
    const trigger = editorTriggerRef.current;
    editorTriggerRef.current = null;
    queueMicrotask(() => {
      const destination = trigger?.isConnected
        ? trigger
        : addFactButtonRef.current?.isConnected
          ? addFactButtonRef.current
          : null;
      destination?.focus();
    });
  };

  const selectedCount = selectedFactIds.length;

  return (
    <div className="evidence-drawer">
      <div className="evidence-drawer__toolbar">
        <Button
          ref={addFactButtonRef}
          variant="primary"
          onClick={(event) => requestEditor(event.currentTarget)}
        >
          Add fictional fact
        </Button>
        <label>
          <span>Search facts</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setDismissedEvidenceRequestId(
                evidenceFocusRequest?.requestId ?? null,
              );
              setSearch(event.target.value);
            }}
          />
        </label>
        <label>
          <span>Source</span>
          <select
            aria-label="Filter by source"
            value={source}
            onChange={(event) => {
              setDismissedEvidenceRequestId(
                evidenceFocusRequest?.requestId ?? null,
              );
              setSource(event.target.value as FactSource | "all");
            }}
          >
            <option value="all">All sources</option>
            {FACT_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Reliability</span>
          <select
            aria-label="Filter by reliability"
            value={reliability}
            onChange={(event) => {
              setDismissedEvidenceRequestId(
                evidenceFocusRequest?.requestId ?? null,
              );
              setReliability(event.target.value as FactReliability | "all");
            }}
          >
            <option value="all">All reliability</option>
            {RELIABILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="evidence-drawer__selected-only">
          <input
            type="checkbox"
            checked={selectedOnly}
            onChange={(event) => {
              setDismissedEvidenceRequestId(
                evidenceFocusRequest?.requestId ?? null,
              );
              setSelectedOnly(event.target.checked);
            }}
          />
          Show selected facts only
        </label>
        <p className="evidence-drawer__selection" aria-live="polite">
          {selectedCount} {selectedCount === 1 ? "fact" : "facts"} selected
        </p>
      </div>
      {visibleFacts.length === 0 ? (
        <p
          className="evidence-drawer__empty"
          role="status"
          aria-label="Fact filter status"
          aria-live="polite"
        >
          No facts match these filters.
        </p>
      ) : null}
      <div className="evidence-table" role="table" aria-label="Case facts">
        {visibleFacts.map((fact) => {
          const selected = selectedFactIds.includes(fact.id);
          const temporalLabel = fact.end
            ? `${fact.start ?? "Start not specified"} to ${fact.end}`
            : (fact.start ?? "Time not specified");
          return (
            <div
              key={fact.id}
              ref={(node) => {
                if (node) rowRefs.current.set(fact.id, node);
                else rowRefs.current.delete(fact.id);
              }}
              role="row"
              tabIndex={-1}
              data-fact-id={fact.id}
              className={`evidence-row ${selected ? "is-evidence-selected" : ""}`.trim()}
            >
              <div role="cell" className="evidence-row__content">
                <div className="evidence-row__identity">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Select ${fact.id}`}
                      checked={selected}
                      onChange={() => toggleFact(fact.id)}
                    />
                    <span className="evidence-row__id">{fact.id}</span>
                  </label>
                  <Button
                    variant="ghost"
                    aria-label={`Edit ${fact.id}`}
                    onClick={(event) =>
                      requestEditor(event.currentTarget, fact.id)
                    }
                  >
                    Edit
                  </Button>
                </div>
                <p className="evidence-row__text">{fact.text}</p>
                <dl className="evidence-row__meta">
                  <div>
                    <dt>Source</dt>
                    <dd>{SOURCE_LABELS[fact.source]}</dd>
                  </div>
                  <div>
                    <dt>Reliability</dt>
                    <dd>
                      <SourceReliability reliability={fact.reliability} />
                    </dd>
                  </div>
                  <div>
                    <dt>Certainty</dt>
                    <dd>{CERTAINTY_LABELS[fact.certainty]}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{temporalLabel}</dd>
                  </div>
                </dl>
              </div>
            </div>
          );
        })}
      </div>
      {editing
        ? createPortal(
            <FactEditor editingFactId={editing.factId} onClose={closeEditor} />,
            document.body,
          )
        : null}
    </div>
  );
}
