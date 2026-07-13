import { assertWorkspaceIntegrity } from "./integrity";
import type {
  CaseFact,
  CaseFactKind,
  FactCertainty,
  FactReliability,
  FactSource,
  TemporalPrecision,
  TimelineItem,
  TimelineLane,
  WorkspaceState,
} from "./model";
import {
  CaseFactSchema,
  TimelineItemSchema,
  WorkspaceStateSchema,
} from "./schemas";

export const FACT_SOURCE_OPTIONS: ReadonlyArray<{
  value: FactSource;
  label: string;
}> = [
  { value: "direct_observation", label: "Direct observation" },
  { value: "patient_report", label: "Patient report" },
  { value: "collateral", label: "Collateral" },
  { value: "chart", label: "Chart" },
  { value: "objective_data", label: "Objective data" },
];

export const RELIABILITY_OPTIONS: ReadonlyArray<{
  value: FactReliability;
  label: string;
}> = [
  { value: "high", label: "High" },
  { value: "moderate", label: "Moderate" },
  { value: "low", label: "Low" },
  { value: "unknown", label: "Unknown" },
];

export const TIMELINE_LANE_OPTIONS: ReadonlyArray<{
  value: TimelineLane;
  label: string;
}> = [
  { value: "mood", label: "Mood" },
  { value: "psychosis", label: "Psychosis" },
  { value: "sleep_energy", label: "Sleep and energy" },
  { value: "anxiety_trauma", label: "Anxiety and trauma" },
  { value: "substance_use", label: "Substance use" },
  { value: "medication", label: "Medication" },
  { value: "medical_neurologic", label: "Medical and neurologic" },
  { value: "function", label: "Function" },
  { value: "stressors", label: "Stressors" },
  { value: "treatment", label: "Treatment" },
];

export const VISIBLE_TIME_COLUMNS = [
  { value: 0, label: "~6 months" },
  { value: 1, label: "~4 months" },
  { value: 2, label: "~3 months" },
  { value: 3, label: "8 days" },
  { value: 4, label: "Current" },
] as const;

const VISIBLE_TIME_COLUMN_VALUES = new Set<number>(
  VISIBLE_TIME_COLUMNS.map((column) => column.value),
);

export type FactDraft = {
  id: string;
  text: string;
  source: FactSource;
  reliability: FactReliability;
  certainty: FactCertainty;
  kind: CaseFactKind;
  start: string;
  end: string;
  temporalPrecision: TemporalPrecision | "";
  tags: string;
  timelineLabel: string;
  lane: TimelineLane;
  sortOrder: string;
};

export type FactDraftField = keyof FactDraft | "form";

export class FactSaveValidationError extends Error {
  constructor(
    message: string,
    public readonly field: FactDraftField,
  ) {
    super(message);
    this.name = "FactSaveValidationError";
  }
}

export type PreparedFactTimelineSave = {
  fact: CaseFact;
  timelineItem: TimelineItem;
};

export function nextFactId(facts: CaseFact[]): string {
  const highest = Math.max(
    0,
    ...facts.map((fact) => Number.parseInt(fact.id.slice(1), 10) || 0),
  );
  return `F${String(highest + 1).padStart(2, "0")}`;
}

export function approximateFromPrecision(
  precision: TemporalPrecision | undefined,
): boolean {
  return (
    precision !== undefined && precision !== "exact" && precision !== "day"
  );
}

export function findTimelineForFact(
  workspace: WorkspaceState,
  factId: string,
): TimelineItem | undefined {
  const exact = workspace.timelineItems.find(
    (item) => item.id === `timeline-${factId}`,
  );
  if (exact?.factIds.includes(factId)) return exact;
  const linked = workspace.timelineItems.filter((item) =>
    item.factIds.includes(factId),
  );
  return linked.length === 1 ? linked[0] : undefined;
}

function requireTimelineForFact(
  workspace: WorkspaceState,
  factId: string,
): TimelineItem {
  const expectedId = `timeline-${factId}`;
  const exact = workspace.timelineItems.find((item) => item.id === expectedId);
  if (exact) {
    if (!exact.factIds.includes(factId)) {
      throw new Error(
        `Timeline ID ${expectedId} does not reference fact ${factId}`,
      );
    }
    return exact;
  }

  const linked = workspace.timelineItems.filter((item) =>
    item.factIds.includes(factId),
  );
  if (linked.length > 1) {
    throw new Error(`Fact ${factId} has multiple timeline items`);
  }
  if (linked.length === 0) {
    throw new Error(`Fact ${factId} has no timeline item`);
  }
  return linked[0]!;
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next];
}

function normalizeOptional(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeTags(value: string): string[] {
  const seen = new Set<string>();
  return value.split(",").flatMap((tag) => {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  });
}

function withOptionalRange<T extends object>(
  value: T,
  start: string | undefined,
  end: string | undefined,
): T & { start?: string; end?: string } {
  return {
    ...value,
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  };
}

export function prepareFactTimelineSave(
  workspace: WorkspaceState,
  draft: FactDraft,
  editingFactId?: string,
): PreparedFactTimelineSave {
  const existingFact = editingFactId
    ? workspace.facts.find((fact) => fact.id === editingFactId)
    : undefined;
  if (editingFactId && !existingFact) {
    throw new Error(`Unknown fact ${editingFactId}`);
  }

  const factId = existingFact?.id ?? nextFactId(workspace.facts);
  const text =
    existingFact && draft.text === existingFact.text
      ? existingFact.text
      : draft.text.trim();
  const start =
    existingFact && draft.start === (existingFact.start ?? "")
      ? existingFact.start
      : normalizeOptional(draft.start);
  const end =
    existingFact && draft.end === (existingFact.end ?? "")
      ? existingFact.end
      : normalizeOptional(draft.end);
  const temporalPrecision = draft.temporalPrecision || undefined;
  const tags =
    existingFact && draft.tags === existingFact.tags.join(", ")
      ? existingFact.tags
      : normalizeTags(draft.tags);
  const factCandidate = withOptionalRange(
    {
      id: factId,
      kind: draft.kind,
      text,
      source: draft.source,
      reliability: draft.reliability,
      certainty: draft.certainty,
      ...(temporalPrecision ? { temporalPrecision } : {}),
      tags,
    },
    start,
    end,
  );
  const factResult = CaseFactSchema.safeParse(factCandidate);
  if (!factResult.success) {
    const issue = factResult.error.issues[0];
    const field = String(issue?.path[0] ?? "form");
    throw new FactSaveValidationError(
      issue?.message ?? "Fact is invalid",
      field in factCandidate ? (field as FactDraftField) : "form",
    );
  }

  const generatedTimelineId = `timeline-${factId}`;
  if (
    !existingFact &&
    workspace.timelineItems.some((item) => item.id === generatedTimelineId)
  ) {
    throw new Error(`Timeline ID ${generatedTimelineId} is already in use`);
  }
  const existingTimeline = existingFact
    ? requireTimelineForFact(workspace, factId)
    : undefined;
  const factStartWasEdited =
    !existingFact || draft.start !== (existingFact.start ?? "");
  const factEndWasEdited =
    !existingFact || draft.end !== (existingFact.end ?? "");
  const precisionWasEdited =
    !existingFact ||
    draft.temporalPrecision !== (existingFact.temporalPrecision ?? "");
  const timelineStart =
    existingTimeline && !factStartWasEdited ? existingTimeline.start : start;
  const timelineEnd =
    existingTimeline && !factEndWasEdited ? existingTimeline.end : end;
  const timelineBase: Partial<TimelineItem> = existingTimeline
    ? { ...existingTimeline }
    : {};
  delete timelineBase.start;
  delete timelineBase.end;
  const sortOrder = Number(draft.sortOrder);
  if (
    draft.sortOrder.trim() === "" ||
    !VISIBLE_TIME_COLUMN_VALUES.has(sortOrder)
  ) {
    throw new FactSaveValidationError(
      "Choose one of the five visible time columns",
      "sortOrder",
    );
  }
  const timelineCandidate = withOptionalRange(
    {
      ...timelineBase,
      id: existingTimeline?.id ?? generatedTimelineId,
      factIds: existingTimeline?.factIds ?? [factId],
      lane: draft.lane,
      label:
        existingTimeline && draft.timelineLabel === existingTimeline.label
          ? existingTimeline.label
          : draft.timelineLabel.trim() || factResult.data.text,
      approximate:
        existingTimeline && !precisionWasEdited
          ? existingTimeline.approximate
          : approximateFromPrecision(factResult.data.temporalPrecision),
      learnerEdited: true,
      sortOrder,
    },
    timelineStart,
    timelineEnd,
  );
  const timelineResult = TimelineItemSchema.safeParse(timelineCandidate);
  if (!timelineResult.success) {
    const issue = timelineResult.error.issues[0];
    const timelineFieldMap: Record<string, FactDraftField> = {
      lane: "lane",
      label: "timelineLabel",
      start: "start",
      end: "end",
      sortOrder: "sortOrder",
    };
    throw new FactSaveValidationError(
      issue?.message ?? "Timeline item is invalid",
      timelineFieldMap[String(issue?.path[0] ?? "")] ?? "form",
    );
  }

  const facts = upsertById(workspace.facts, factResult.data);
  const timelineItems = upsertById(
    workspace.timelineItems,
    timelineResult.data,
  );
  assertWorkspaceIntegrity(
    WorkspaceStateSchema.parse({ ...workspace, facts, timelineItems }),
  );

  return { fact: factResult.data, timelineItem: timelineResult.data };
}
