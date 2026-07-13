import type {
  DisconfirmationDraft,
  DisconfirmationRecord,
  FactLinkedText,
  WorkspaceState,
} from "./model";
import type { RuntimeContent } from "./schemas";

export function assertWorkspaceIntegrity(
  workspace: WorkspaceState,
): WorkspaceState {
  const requireUnique = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) {
        throw new Error(`${label} contains duplicate ID ${value}`);
      }
      seen.add(value);
    }
  };

  requireUnique(
    "Facts",
    workspace.facts.map((item) => item.id),
  );
  requireUnique(
    "Timeline items",
    workspace.timelineItems.map((item) => item.id),
  );
  requireUnique(
    "Temporal relations",
    workspace.temporalRelations.map((item) => item.id),
  );
  requireUnique(
    "MSE translations",
    workspace.mseTranslations.map((item) => item.id),
  );
  requireUnique(
    "Hypotheses",
    workspace.hypotheses.map((item) => item.id),
  );
  requireUnique(
    "Summary clauses",
    workspace.summary.map((item) => item.id),
  );

  const ids = new Set(workspace.facts.map((fact) => fact.id));
  const requireFacts = (
    label: string,
    factIds: string[],
    allowEmpty = false,
  ) => {
    requireUnique(label, factIds);
    if (!allowEmpty && factIds.length === 0) {
      throw new Error(`${label} requires a fact link`);
    }
    for (const id of factIds) {
      if (!ids.has(id)) {
        throw new Error(`${label} references unknown fact ${id}`);
      }
    }
  };
  const requireLinkedText = (label: string, value: FactLinkedText) => {
    requireFacts(label, value.factIds, value.text.trim().length === 0);
  };
  const requireCompleteLinkedText = (label: string, value: FactLinkedText) => {
    if (!value.text.trim()) throw new Error(`${label} requires text`);
    requireFacts(label, value.factIds);
  };
  const challengeResponses = (
    record: DisconfirmationDraft | DisconfirmationRecord,
  ) =>
    [
      ["claim", record.claim],
      ["phenomenology check", record.phenomenologyCheck],
      ["time-course challenge", record.timeCourseChallenge],
      ["exclusions review", record.exclusionsReview],
      ["rival explains better", record.rivalExplainsBetter],
      ["rival explains worse", record.rivalExplainsWorse],
      ["finding favoring rival", record.findingFavoringRival],
      ["finding weakening rival", record.findingWeakeningRival],
      ["confidence decreaser", record.confidenceDecreaser],
      ["unresolved issue", record.unresolved],
      ["next discriminator", record.nextDiscriminator],
    ] as const;

  for (const item of workspace.timelineItems) {
    requireFacts(`Timeline item ${item.id}`, item.factIds);
  }
  for (const relation of workspace.temporalRelations) {
    requireFacts(`Temporal relation ${relation.id} from`, [
      relation.fromFactId,
    ]);
    requireFacts(`Temporal relation ${relation.id} to`, [relation.toFactId]);
    if (relation.fromFactId === relation.toFactId) {
      throw new Error(`Temporal relation ${relation.id} self-links`);
    }
  }
  const relationTriples = new Set<string>();
  for (const relation of workspace.temporalRelations) {
    const triple = JSON.stringify([
      relation.fromFactId,
      relation.toFactId,
      relation.kind,
    ]);
    if (relationTriples.has(triple)) {
      throw new Error(
        `Temporal relations contain duplicate exact temporal relationship ` +
          `${relation.fromFactId} ${relation.kind} ${relation.toFactId}`,
      );
    }
    relationTriples.add(triple);
  }
  for (const item of workspace.mseTranslations) {
    requireFacts(`MSE translation ${item.id}`, item.factIds);
  }
  for (const hypothesis of workspace.hypotheses) {
    requireFacts(
      `${hypothesis.label} supports`,
      hypothesis.supportingFactIds,
      true,
    );
    requireFacts(
      `${hypothesis.label} contradicts`,
      hypothesis.contradictingFactIds,
      true,
    );
    const overlap = hypothesis.supportingFactIds.find((id) =>
      hypothesis.contradictingFactIds.includes(id),
    );
    if (overlap) {
      throw new Error(
        `${hypothesis.label} uses ${overlap} as both support and contradiction`,
      );
    }
    requireUnique(
      `${hypothesis.label} missing information`,
      hypothesis.missingInformation.map((gap) => gap.id),
    );
    for (const gap of hypothesis.missingInformation) {
      requireFacts(
        `${hypothesis.label} missing item ${gap.id}`,
        gap.relatedFactIds,
        true,
      );
    }
    requireLinkedText(`${hypothesis.label} rationale`, hypothesis.rationale);
    requireLinkedText(
      `${hypothesis.label} management implications`,
      hypothesis.managementImplications,
    );
  }
  if (workspace.disconfirmationDraft) {
    const draft = workspace.disconfirmationDraft;
    const favored = workspace.hypotheses.find(
      (item) => item.id === draft.favoredHypothesisId,
    );
    if (!favored || favored.position !== "favored") {
      throw new Error(
        `Draft challenge hypothesis ${draft.favoredHypothesisId} is not favored`,
      );
    }
    if (draft.rivalHypothesisId) {
      const rival = workspace.hypotheses.find(
        (item) => item.id === draft.rivalHypothesisId,
      );
      if (!rival || rival.id === favored.id || rival.position === "favored") {
        throw new Error(`Invalid draft rival ${draft.rivalHypothesisId}`);
      }
    }
    for (const [label, value] of challengeResponses(draft)) {
      requireLinkedText(`Challenge draft ${label}`, value);
    }
  }
  if (workspace.disconfirmation) {
    const record = workspace.disconfirmation;
    const subject = workspace.hypotheses.find(
      (item) => item.id === record.favoredHypothesisId,
    );
    const rival = workspace.hypotheses.find(
      (item) => item.id === record.rivalHypothesisId,
    );
    if (!subject) {
      throw new Error(
        `Unknown challenged hypothesis ${record.favoredHypothesisId}`,
      );
    }
    if (!rival || rival.id === subject.id) {
      throw new Error(`Invalid applied rival ${record.rivalHypothesisId}`);
    }
    for (const [label, value] of challengeResponses(record)) {
      requireCompleteLinkedText(`Applied challenge ${label}`, value);
    }
  }
  for (const clause of workspace.summary) {
    requireFacts(`Summary clause ${clause.id}`, clause.factIds);
  }
  const favored = workspace.hypotheses.filter(
    (item) => item.position === "favored",
  );
  if (favored.length > 1) {
    throw new Error("Only one hypothesis may be favored");
  }
  return workspace;
}

export function assertWorkspaceContentReferences(
  workspace: WorkspaceState,
  content: RuntimeContent,
): WorkspaceState {
  if (
    workspace.caseId !== content.caseDefinition.id ||
    workspace.caseVersion !== content.caseDefinition.version
  ) {
    throw new Error(
      `Workspace case ${workspace.caseId}@${workspace.caseVersion} does not match ` +
        `${content.caseDefinition.id}@${content.caseDefinition.version}`,
    );
  }

  const termIds = new Set(content.mseTerms.map((term) => term.id));
  for (const translation of workspace.mseTranslations) {
    for (const termId of translation.termIds) {
      if (!termIds.has(termId)) {
        throw new Error(
          `MSE translation ${translation.id} references unknown term ${termId}`,
        );
      }
    }
  }
  return workspace;
}
