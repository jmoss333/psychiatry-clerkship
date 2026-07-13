import { assertWorkspaceIntegrity } from "./integrity";
import type {
  DisconfirmationRecord,
  FactLinkedText,
  Hypothesis,
  WorkspaceAction,
  WorkspaceState,
} from "./model";
import { WorkspaceStateSchema } from "./schemas";

const upsertById = <T extends { id: string }>(items: T[], next: T): T[] => {
  const found = items.some((item) => item.id === next.id);
  return found
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next];
};

const requireHypothesis = (state: WorkspaceState, id: string): Hypothesis => {
  const item = state.hypotheses.find((hypothesis) => hypothesis.id === id);
  if (!item) throw new Error(`Unknown hypothesis ${id}`);
  return item;
};

const challengeResponses = (
  record: DisconfirmationRecord,
): FactLinkedText[] => [
  record.claim,
  record.phenomenologyCheck,
  record.timeCourseChallenge,
  record.exclusionsReview,
  record.rivalExplainsBetter,
  record.rivalExplainsWorse,
  record.findingFavoringRival,
  record.findingWeakeningRival,
  record.confidenceDecreaser,
  record.unresolved,
  record.nextDiscriminator,
];

function reduceWithoutTimestamp(
  state: WorkspaceState,
  action: WorkspaceAction,
  now: string,
): WorkspaceState {
  switch (action.type) {
    case "acknowledgeSyntheticData":
      return { ...state, syntheticDataAcknowledged: true };
    case "setLearnerLevel":
      return { ...state, learnerLevel: action.level };
    case "upsertFact":
      return { ...state, facts: upsertById(state.facts, action.fact) };
    case "upsertTimelineItem":
      return {
        ...state,
        timelineItems: upsertById(state.timelineItems, {
          ...action.item,
          learnerEdited: true,
        }),
      };
    case "upsertTemporalRelation":
      return {
        ...state,
        temporalRelations: upsertById(state.temporalRelations, action.relation),
      };
    case "saveMseTranslation":
      return {
        ...state,
        mseTranslations: upsertById(state.mseTranslations, action.translation),
      };
    case "upsertHypothesis":
      return {
        ...state,
        hypotheses: upsertById(state.hypotheses, action.hypothesis),
      };
    case "selectFavored": {
      requireHypothesis(state, action.hypothesisId);
      const draftBelongsElsewhere =
        state.disconfirmationDraft &&
        state.disconfirmationDraft.favoredHypothesisId !== action.hypothesisId;
      return {
        ...state,
        hypotheses: state.hypotheses.map((item) => ({
          ...item,
          position:
            item.id === action.hypothesisId
              ? "favored"
              : item.position === "favored"
                ? "plausible"
                : item.position,
        })),
        disconfirmationDraft: draftBelongsElsewhere
          ? undefined
          : state.disconfirmationDraft,
      };
    }
    case "saveDisconfirmationDraft": {
      const favored = requireHypothesis(
        state,
        action.draft.favoredHypothesisId,
      );
      if (favored.position !== "favored") {
        throw new Error(`${favored.id} is not favored`);
      }
      if (action.draft.rivalHypothesisId) {
        const rival = requireHypothesis(state, action.draft.rivalHypothesisId);
        if (rival.id === favored.id || rival.position === "favored") {
          throw new Error(`${rival.id} is not a valid rival`);
        }
      }
      return { ...state, disconfirmationDraft: action.draft };
    }
    case "applyChallenge": {
      const record = action.record;
      const favored = requireHypothesis(state, record.favoredHypothesisId);
      const rival = requireHypothesis(state, record.rivalHypothesisId);
      if (favored.position !== "favored") {
        throw new Error(`${favored.id} is not favored`);
      }
      if (rival.id === favored.id || rival.position === "favored") {
        throw new Error(`${rival.id} is not a valid rival`);
      }
      if (
        challengeResponses(record).some(
          (value) => !value.text.trim() || value.factIds.length === 0,
        )
      ) {
        throw new Error(
          "Complete every challenge response with a Fact link before updating",
        );
      }
      return {
        ...state,
        hypotheses: state.hypotheses.map((item) => ({
          ...item,
          position:
            item.id === record.favoredHypothesisId
              ? record.proposedPosition
              : record.proposedPosition === "favored" &&
                  item.position === "favored"
                ? "plausible"
                : item.position,
        })),
        disconfirmationDraft: undefined,
        disconfirmation: { ...record, appliedAt: now },
      };
    }
    case "setSummary":
      return { ...state, summary: action.clauses };
    case "resetWorkspace":
      return structuredClone(action.workspace);
  }
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  const now = new Date().toISOString();
  const next = reduceWithoutTimestamp(state, action, now);
  const invalidatesSummary =
    action.type !== "setSummary" && action.type !== "resetWorkspace";
  return assertWorkspaceIntegrity(
    WorkspaceStateSchema.parse({
      ...next,
      summary: invalidatesSummary ? [] : next.summary,
      updatedAt: now,
    }),
  );
}
