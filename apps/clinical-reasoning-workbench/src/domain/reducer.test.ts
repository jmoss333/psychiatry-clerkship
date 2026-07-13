import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assertWorkspaceIntegrity } from "./integrity";
import type {
  DisconfirmationDraft,
  DisconfirmationRecord,
  FactLinkedText,
  WorkspaceAction,
  WorkspaceState,
} from "./model";
import { workspaceReducer } from "./reducer";
import { makeWorkspace } from "../test/fixtures";

const NOW = "2026-07-12T13:14:15.000Z";
const OLD_TIME = "2026-07-11T12:00:00.000Z";

const emptyLinkedText = (): FactLinkedText => ({ text: "", factIds: [] });
const completeLinkedText = (text = "Learner response"): FactLinkedText => ({
  text,
  factIds: ["F01"],
});

function makeDraft(
  favoredHypothesisId = "bipolar_psychotic_features",
): DisconfirmationDraft {
  return {
    favoredHypothesisId,
    claim: emptyLinkedText(),
    phenomenologyCheck: emptyLinkedText(),
    timeCourseChallenge: emptyLinkedText(),
    exclusionsReview: emptyLinkedText(),
    rivalExplainsBetter: emptyLinkedText(),
    rivalExplainsWorse: emptyLinkedText(),
    findingFavoringRival: emptyLinkedText(),
    findingWeakeningRival: emptyLinkedText(),
    confidenceDecreaser: emptyLinkedText(),
    unresolved: emptyLinkedText(),
    nextDiscriminator: emptyLinkedText(),
  };
}

function makeCompleteChallenge(
  proposedPosition: DisconfirmationRecord["proposedPosition"] = "less_likely",
): DisconfirmationRecord {
  return {
    favoredHypothesisId: "bipolar_psychotic_features",
    claim: completeLinkedText("Claim"),
    phenomenologyCheck: completeLinkedText("Phenomenology"),
    timeCourseChallenge: completeLinkedText("Time course"),
    exclusionsReview: completeLinkedText("Exclusions"),
    rivalHypothesisId: "primary_psychotic_disorder",
    rivalExplainsBetter: completeLinkedText("Explains better"),
    rivalExplainsWorse: completeLinkedText("Explains worse"),
    findingFavoringRival: completeLinkedText("Favors rival"),
    findingWeakeningRival: completeLinkedText("Weakens rival"),
    confidenceDecreaser: completeLinkedText("Decreases confidence"),
    unresolved: completeLinkedText("Unresolved"),
    nextDiscriminator: completeLinkedText("Next discriminator"),
    proposedPosition,
  };
}

function addSummary(workspace: WorkspaceState, id = "summary-existing") {
  workspace.summary = [
    { id, text: "Existing derived summary", factIds: ["F01"] },
  ];
  workspace.updatedAt = OLD_TIME;
  return workspace;
}

function makeFavoredWorkspace(): WorkspaceState {
  const workspace = makeWorkspace();
  workspace.hypotheses[0]!.position = "favored";
  return workspace;
}

type ActionScenario = {
  state: WorkspaceState;
  action: WorkspaceAction;
};

const scenarios: Array<[string, () => ActionScenario]> = [
  [
    "acknowledgeSyntheticData",
    () => ({
      state: addSummary(makeWorkspace()),
      action: { type: "acknowledgeSyntheticData" },
    }),
  ],
  [
    "setLearnerLevel",
    () => ({
      state: addSummary(makeWorkspace()),
      action: { type: "setLearnerLevel", level: "resident" },
    }),
  ],
  [
    "upsertFact",
    () => {
      const state = addSummary(makeWorkspace());
      return {
        state,
        action: {
          type: "upsertFact",
          fact: { ...structuredClone(state.facts[0]!), text: "Learner edit" },
        },
      };
    },
  ],
  [
    "upsertTimelineItem",
    () => {
      const state = addSummary(makeWorkspace());
      return {
        state,
        action: {
          type: "upsertTimelineItem",
          item: {
            ...structuredClone(state.timelineItems[0]!),
            label: "Learner timeline edit",
            learnerEdited: false,
          },
        },
      };
    },
  ],
  [
    "upsertTemporalRelation",
    () => ({
      state: addSummary(makeWorkspace()),
      action: {
        type: "upsertTemporalRelation",
        relation: {
          id: "relation-1",
          fromFactId: "F01",
          toFactId: "F02",
          kind: "preceded",
        },
      },
    }),
  ],
  [
    "saveMseTranslation",
    () => ({
      state: addSummary(makeWorkspace()),
      action: {
        type: "saveMseTranslation",
        translation: {
          id: "mse-1",
          factIds: ["F08"],
          rawObservation: "Speech is rapid.",
          descriptiveWording: "Speech rate is increased.",
          termIds: ["rapid_speech"],
          limitationOrAlternative: "Interruptibility is unknown.",
        },
      },
    }),
  ],
  [
    "upsertHypothesis",
    () => {
      const state = addSummary(makeWorkspace());
      return {
        state,
        action: {
          type: "upsertHypothesis",
          hypothesis: {
            ...structuredClone(state.hypotheses[0]!),
            rationale: { text: "Learner rationale", factIds: ["F01"] },
          },
        },
      };
    },
  ],
  [
    "selectFavored",
    () => ({
      state: addSummary(makeWorkspace()),
      action: {
        type: "selectFavored",
        hypothesisId: "bipolar_psychotic_features",
      },
    }),
  ],
  [
    "saveDisconfirmationDraft",
    () => ({
      state: addSummary(makeFavoredWorkspace()),
      action: { type: "saveDisconfirmationDraft", draft: makeDraft() },
    }),
  ],
  [
    "applyChallenge",
    () => {
      const state = addSummary(makeFavoredWorkspace());
      state.disconfirmationDraft = makeDraft();
      return {
        state,
        action: { type: "applyChallenge", record: makeCompleteChallenge() },
      };
    },
  ],
  [
    "setSummary",
    () => ({
      state: addSummary(makeWorkspace()),
      action: {
        type: "setSummary",
        clauses: [{ id: "summary-new", text: "New summary", factIds: ["F02"] }],
      },
    }),
  ],
  [
    "resetWorkspace",
    () => {
      const replacement = addSummary(
        makeWorkspace("resident"),
        "summary-reset",
      );
      replacement.updatedAt = OLD_TIME;
      return {
        state: addSummary(makeWorkspace()),
        action: { type: "resetWorkspace", workspace: replacement },
      };
    },
  ],
];

const summaryInvalidatingScenarios = scenarios.filter(
  ([name]) => name !== "setSummary" && name !== "resetWorkspace",
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(scenarios)("%s", (_name, prepare) => {
  test("stamps the committed workspace", () => {
    const { state, action } = prepare();
    expect(workspaceReducer(state, action).updatedAt).toBe(NOW);
  });

  test("does not mutate its input workspace", () => {
    const { state, action } = prepare();
    const before = structuredClone(state);
    const next = workspaceReducer(state, action);
    expect(state).toEqual(before);
    expect(next).not.toBe(state);
  });

  test("returns a workspace that passes referential integrity", () => {
    const { state, action } = prepare();
    const next = workspaceReducer(state, action);
    expect(assertWorkspaceIntegrity(next)).toBe(next);
  });
});

test.each(summaryInvalidatingScenarios)(
  "%s invalidates stored derived summary clauses",
  (_name, prepare) => {
    const { state, action } = prepare();
    expect(workspaceReducer(state, action).summary).toEqual([]);
  },
);

test("setSummary commits the supplied summary clauses", () => {
  const { state, action } = scenarios.find(
    ([name]) => name === "setSummary",
  )![1]();
  const next = workspaceReducer(state, action);
  expect(next.summary).toEqual([
    { id: "summary-new", text: "New summary", factIds: ["F02"] },
  ]);
});

test("resetWorkspace preserves the replacement summary and clones the replacement", () => {
  const { state, action } = scenarios.find(
    ([name]) => name === "resetWorkspace",
  )![1]();
  if (action.type !== "resetWorkspace") throw new Error("Unexpected action");
  const replacement = action.workspace;
  const before = structuredClone(replacement);
  const next = workspaceReducer(state, action);

  expect(next.summary).toEqual(before.summary);
  next.facts[0]!.text = "Changed only in the reducer result";
  expect(replacement).toEqual(before);
});

test("upsert actions replace matching IDs and append new IDs", () => {
  const workspace = makeWorkspace();
  const replaced = workspaceReducer(workspace, {
    type: "upsertFact",
    fact: { ...workspace.facts[0]!, text: "Replaced fact text" },
  });
  const appended = workspaceReducer(replaced, {
    type: "upsertFact",
    fact: { ...workspace.facts[0]!, id: "F11", text: "New fictional fact" },
  });

  expect(replaced.facts).toHaveLength(workspace.facts.length);
  expect(replaced.facts[0]!.text).toBe("Replaced fact text");
  expect(appended.facts.at(-1)).toMatchObject({
    id: "F11",
    text: "New fictional fact",
  });
});

test("timeline edits are always marked as learner edited", () => {
  const workspace = makeWorkspace();
  const next = workspaceReducer(workspace, {
    type: "upsertTimelineItem",
    item: { ...workspace.timelineItems[0]!, learnerEdited: false },
  });
  expect(next.timelineItems[0]!.learnerEdited).toBe(true);
});

test("upsertFact rejects blank schema-invalid fact text", () => {
  const workspace = makeWorkspace();
  const before = structuredClone(workspace);
  expect(() =>
    workspaceReducer(workspace, {
      type: "upsertFact",
      fact: { ...workspace.facts[0]!, text: "   " },
    }),
  ).toThrow("Fact text is required");
  expect(workspace).toEqual(before);
});

test("upsertTimelineItem rejects blank schema-invalid timeline text", () => {
  const workspace = makeWorkspace();
  const before = structuredClone(workspace);
  expect(() =>
    workspaceReducer(workspace, {
      type: "upsertTimelineItem",
      item: { ...workspace.timelineItems[0]!, label: "   " },
    }),
  ).toThrow("Timeline text is required");
  expect(workspace).toEqual(before);
});

test("upsertTimelineItem rejects a sort order outside the five visible columns", () => {
  const workspace = makeWorkspace();
  expect(() =>
    workspaceReducer(workspace, {
      type: "upsertTimelineItem",
      item: { ...workspace.timelineItems[0]!, sortOrder: 5 },
    }),
  ).toThrow();
});

test("resetWorkspace also rejects a schema-invalid replacement", () => {
  const workspace = makeWorkspace();
  const replacement = makeWorkspace();
  replacement.facts[0]!.text = "   ";
  expect(() =>
    workspaceReducer(workspace, {
      type: "resetWorkspace",
      workspace: replacement,
    }),
  ).toThrow("Fact text is required");
});

test("selecting a favored hypothesis demotes only the prior favorite", () => {
  const seed = makeWorkspace();
  seed.hypotheses[2]!.position = "less_likely";
  const first = workspaceReducer(seed, {
    type: "selectFavored",
    hypothesisId: "bipolar_psychotic_features",
  });
  const second = workspaceReducer(first, {
    type: "selectFavored",
    hypothesisId: "primary_psychotic_disorder",
  });

  expect(
    second.hypotheses.find(
      (hypothesis) => hypothesis.id === "bipolar_psychotic_features",
    )?.position,
  ).toBe("plausible");
  expect(
    second.hypotheses.find(
      (hypothesis) => hypothesis.id === "primary_psychotic_disorder",
    )?.position,
  ).toBe("favored");
  expect(second.hypotheses[2]!.position).toBe("less_likely");
});

test("selectFavored rejects an unknown hypothesis without changing the input", () => {
  const workspace = makeWorkspace();
  const before = structuredClone(workspace);
  expect(() =>
    workspaceReducer(workspace, {
      type: "selectFavored",
      hypothesisId: "unknown-hypothesis",
    }),
  ).toThrow("Unknown hypothesis unknown-hypothesis");
  expect(workspace).toEqual(before);
});

test("selecting the same favorite retains its matching draft", () => {
  const workspace = makeFavoredWorkspace();
  workspace.disconfirmationDraft = makeDraft();
  const next = workspaceReducer(workspace, {
    type: "selectFavored",
    hypothesisId: "bipolar_psychotic_features",
  });
  expect(next.disconfirmationDraft).toEqual(workspace.disconfirmationDraft);
});

test("changing the favorite atomically clears only a mismatched draft", () => {
  const workspace = makeFavoredWorkspace();
  workspace.disconfirmationDraft = makeDraft();
  const next = workspaceReducer(workspace, {
    type: "selectFavored",
    hypothesisId: "primary_psychotic_disorder",
  });
  expect(next.disconfirmationDraft).toBeUndefined();
  expect(next.hypotheses[1]!.position).toBe("favored");
});

test("changing the favorite retains applied challenge history", () => {
  const workspace = makeFavoredWorkspace();
  workspace.disconfirmation = {
    ...makeCompleteChallenge("plausible"),
    appliedAt: OLD_TIME,
  };
  const next = workspaceReducer(workspace, {
    type: "selectFavored",
    hypothesisId: "primary_psychotic_disorder",
  });
  expect(next.disconfirmation).toEqual(workspace.disconfirmation);
});

test("saveDisconfirmationDraft permits absent rival and proposed position", () => {
  const workspace = makeFavoredWorkspace();
  const draft = makeDraft();
  draft.claim = completeLinkedText("Completed first stage");
  const next = workspaceReducer(workspace, {
    type: "saveDisconfirmationDraft",
    draft,
  });
  expect(next.disconfirmationDraft).toEqual(draft);
  expect(next.disconfirmationDraft?.rivalHypothesisId).toBeUndefined();
  expect(next.disconfirmationDraft?.proposedPosition).toBeUndefined();
});

test("saveDisconfirmationDraft validates completed response links", () => {
  const workspace = makeFavoredWorkspace();
  const draft = makeDraft();
  draft.claim = { text: "Completed but unlinked", factIds: [] };
  expect(() =>
    workspaceReducer(workspace, {
      type: "saveDisconfirmationDraft",
      draft,
    }),
  ).toThrow(/Challenge draft claim requires a fact link/);
});

test("saveDisconfirmationDraft rejects unknown and non-favored subjects", () => {
  const workspace = makeFavoredWorkspace();
  expect(() =>
    workspaceReducer(workspace, {
      type: "saveDisconfirmationDraft",
      draft: makeDraft("unknown-hypothesis"),
    }),
  ).toThrow("Unknown hypothesis unknown-hypothesis");

  expect(() =>
    workspaceReducer(workspace, {
      type: "saveDisconfirmationDraft",
      draft: makeDraft("primary_psychotic_disorder"),
    }),
  ).toThrow("primary_psychotic_disorder is not favored");
});

test("saveDisconfirmationDraft rejects a same, favored, or unknown rival", () => {
  const workspace = makeFavoredWorkspace();

  for (const rivalHypothesisId of [
    "bipolar_psychotic_features",
    "unknown-rival",
  ]) {
    const draft = { ...makeDraft(), rivalHypothesisId };
    expect(() =>
      workspaceReducer(workspace, {
        type: "saveDisconfirmationDraft",
        draft,
      }),
    ).toThrow(new RegExp(rivalHypothesisId));
  }
});

test("applyChallenge rejects any incomplete final response", () => {
  const workspace = makeFavoredWorkspace();
  const blank = makeCompleteChallenge();
  blank.unresolved = { text: "", factIds: ["F01"] };
  const unlinked = makeCompleteChallenge();
  unlinked.nextDiscriminator = { text: "Needed", factIds: [] };

  for (const record of [blank, unlinked]) {
    expect(() =>
      workspaceReducer(workspace, { type: "applyChallenge", record }),
    ).toThrow(
      "Complete every challenge response with a Fact link before updating",
    );
  }
});

test("applyChallenge stores a complete timestamped record and clears its draft", () => {
  const workspace = makeFavoredWorkspace();
  workspace.disconfirmationDraft = makeDraft();
  const record = makeCompleteChallenge("less_likely");
  const next = workspaceReducer(workspace, {
    type: "applyChallenge",
    record,
  });

  expect(next.disconfirmationDraft).toBeUndefined();
  expect(next.disconfirmation).toEqual({ ...record, appliedAt: NOW });
  expect(next.hypotheses.map((hypothesis) => hypothesis.position)).toEqual([
    "less_likely",
    "plausible",
    "plausible",
    "cannot_exclude",
  ]);
});

test("applyChallenge validates the favored subject and rival", () => {
  const workspace = makeFavoredWorkspace();
  const nonFavored = makeCompleteChallenge();
  nonFavored.favoredHypothesisId = "primary_psychotic_disorder";
  expect(() =>
    workspaceReducer(workspace, {
      type: "applyChallenge",
      record: nonFavored,
    }),
  ).toThrow("primary_psychotic_disorder is not favored");

  const sameRival = makeCompleteChallenge();
  sameRival.rivalHypothesisId = sameRival.favoredHypothesisId;
  expect(() =>
    workspaceReducer(workspace, {
      type: "applyChallenge",
      record: sameRival,
    }),
  ).toThrow("bipolar_psychotic_features is not a valid rival");
});

test("the final integrity check rejects an invalid action result", () => {
  const workspace = makeFavoredWorkspace();
  const secondFavorite = {
    ...workspace.hypotheses[1]!,
    position: "favored" as const,
  };
  expect(() =>
    workspaceReducer(workspace, {
      type: "upsertHypothesis",
      hypothesis: secondFavorite,
    }),
  ).toThrow("Only one hypothesis may be favored");
});
