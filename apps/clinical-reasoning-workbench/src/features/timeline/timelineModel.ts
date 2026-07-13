import { assertWorkspaceIntegrity } from "../../domain/integrity";
import type {
  TemporalRelation,
  TemporalRelationKind,
  TimelineItem,
  TimelineLane,
  WorkspaceState,
} from "../../domain/model";
import {
  TemporalRelationSchema,
  WorkspaceStateSchema,
} from "../../domain/schemas";

export const TIMELINE_LANES: ReadonlyArray<{
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

export const TEMPORAL_RELATION_KINDS: readonly TemporalRelationKind[] = [
  "preceded",
  "coincided",
  "continued_after",
  "occurred_only_during",
  "improved_after",
  "worsened_after",
  "independent_of",
  "unclear",
];

export function learnerChronologyItems(items: TimelineItem[]): TimelineItem[] {
  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => item.learnerEdited)
    .sort(
      (first, second) =>
        first.item.sortOrder - second.item.sortOrder ||
        first.originalIndex - second.originalIndex,
    )
    .map(({ item }) => item);
}

export function nextTemporalRelationId(relations: TemporalRelation[]): string {
  const used = new Set(relations.map((relation) => relation.id));
  let next =
    Math.max(
      0,
      ...relations.map((relation) => {
        const match = /^relation-(\d+)$/.exec(relation.id);
        return match ? Number.parseInt(match[1]!, 10) : 0;
      }),
    ) + 1;
  let candidate = `relation-${String(next).padStart(3, "0")}`;
  while (used.has(candidate)) {
    next += 1;
    candidate = `relation-${String(next).padStart(3, "0")}`;
  }
  return candidate;
}

export type RelationshipDraft = {
  fromFactId: string;
  toFactId: string;
  kind: TemporalRelationKind;
};

export function prepareTemporalRelationSave(
  workspace: WorkspaceState,
  draft: RelationshipDraft,
  relationId?: string,
): TemporalRelation {
  const existing = relationId
    ? workspace.temporalRelations.find((relation) => relation.id === relationId)
    : undefined;
  if (relationId && !existing) {
    throw new Error(`Unknown temporal relationship ${relationId}`);
  }
  const factIds = new Set(workspace.facts.map((fact) => fact.id));
  if (!factIds.has(draft.fromFactId)) {
    throw new Error(`Unknown from fact ${draft.fromFactId}`);
  }
  if (!factIds.has(draft.toFactId)) {
    throw new Error(`Unknown to fact ${draft.toFactId}`);
  }
  if (draft.fromFactId === draft.toFactId) {
    throw new Error("A temporal relationship cannot link a fact to itself");
  }
  const duplicate = workspace.temporalRelations.some(
    (relation) =>
      relation.id !== relationId &&
      relation.fromFactId === draft.fromFactId &&
      relation.toFactId === draft.toFactId &&
      relation.kind === draft.kind,
  );
  if (duplicate) {
    throw new Error("This exact temporal relationship already exists");
  }

  const candidate = TemporalRelationSchema.parse({
    id: existing?.id ?? nextTemporalRelationId(workspace.temporalRelations),
    ...draft,
  });
  if (
    !existing &&
    workspace.temporalRelations.some((relation) => relation.id === candidate.id)
  ) {
    throw new Error(
      `Temporal relationship ID ${candidate.id} is already in use`,
    );
  }
  const temporalRelations = existing
    ? workspace.temporalRelations.map((relation) =>
        relation.id === existing.id ? candidate : relation,
      )
    : [...workspace.temporalRelations, candidate];
  assertWorkspaceIntegrity(
    WorkspaceStateSchema.parse({ ...workspace, temporalRelations }),
  );
  return candidate;
}
