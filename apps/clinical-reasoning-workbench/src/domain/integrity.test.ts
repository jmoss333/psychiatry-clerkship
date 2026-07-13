import type {
  AppliedDisconfirmationRecord,
  DisconfirmationDraft,
  FactLinkedText,
  WorkspaceState,
} from "./model";
import { makeWorkspace } from "../test/fixtures";
import { assertWorkspaceIntegrity } from "./integrity";

const CHALLENGE_RESPONSE_FIELDS = [
  "claim",
  "phenomenologyCheck",
  "timeCourseChallenge",
  "exclusionsReview",
  "rivalExplainsBetter",
  "rivalExplainsWorse",
  "findingFavoringRival",
  "findingWeakeningRival",
  "confidenceDecreaser",
  "unresolved",
  "nextDiscriminator",
] as const;

const emptyLinkedText = (): FactLinkedText => ({ text: "", factIds: [] });
const completeLinkedText = (): FactLinkedText => ({
  text: "Learner response",
  factIds: ["F01"],
});

function makeDraft(favoredHypothesisId: string): DisconfirmationDraft {
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

function makeAppliedRecord(): AppliedDisconfirmationRecord {
  return {
    favoredHypothesisId: "bipolar_psychotic_features",
    claim: completeLinkedText(),
    phenomenologyCheck: completeLinkedText(),
    timeCourseChallenge: completeLinkedText(),
    exclusionsReview: completeLinkedText(),
    rivalHypothesisId: "primary_psychotic_disorder",
    rivalExplainsBetter: completeLinkedText(),
    rivalExplainsWorse: completeLinkedText(),
    findingFavoringRival: completeLinkedText(),
    findingWeakeningRival: completeLinkedText(),
    confidenceDecreaser: completeLinkedText(),
    unresolved: completeLinkedText(),
    nextDiscriminator: completeLinkedText(),
    proposedPosition: "plausible",
    appliedAt: "2026-07-12T12:00:00.000Z",
  };
}

test("rejects a dangling case-fact link", () => {
  const workspace = makeWorkspace();
  workspace.hypotheses[0]!.supportingFactIds = ["F99"];
  expect(() => assertWorkspaceIntegrity(workspace)).toThrow(/F99/);
});

test("rejects dangling relations, duplicate IDs, and support/contradiction overlap", () => {
  const dangling = makeWorkspace();
  dangling.temporalRelations.push({
    id: "relation-1",
    fromFactId: "F02",
    toFactId: "F99",
    kind: "preceded",
  });
  expect(() => assertWorkspaceIntegrity(dangling)).toThrow(/F99/);

  const duplicate = makeWorkspace();
  duplicate.timelineItems[1]!.id = duplicate.timelineItems[0]!.id;
  expect(() => assertWorkspaceIntegrity(duplicate)).toThrow(/duplicate ID/);

  const overlap = makeWorkspace();
  overlap.hypotheses[0]!.supportingFactIds = ["F04"];
  overlap.hypotheses[0]!.contradictingFactIds = ["F04"];
  expect(() => assertWorkspaceIntegrity(overlap)).toThrow(
    /both support and contradiction/,
  );
});

test("rejects duplicate IDs in every Workspace collection", () => {
  const duplicateCases: Array<{
    label: string;
    mutate: (workspace: WorkspaceState) => void;
  }> = [
    {
      label: "Facts",
      mutate: (workspace) =>
        workspace.facts.push(structuredClone(workspace.facts[0]!)),
    },
    {
      label: "Timeline items",
      mutate: (workspace) =>
        workspace.timelineItems.push(
          structuredClone(workspace.timelineItems[0]!),
        ),
    },
    {
      label: "Temporal relations",
      mutate: (workspace) => {
        workspace.temporalRelations.push(
          {
            id: "relation-1",
            fromFactId: "F01",
            toFactId: "F02",
            kind: "preceded",
          },
          {
            id: "relation-1",
            fromFactId: "F02",
            toFactId: "F03",
            kind: "preceded",
          },
        );
      },
    },
    {
      label: "MSE translations",
      mutate: (workspace) => {
        const translation = {
          id: "mse-1",
          factIds: ["F08"],
          rawObservation: "Speech is rapid.",
          descriptiveWording: "Speech rate is increased.",
          termIds: ["rapid-speech"],
          limitationOrAlternative: "Interruptibility is unknown.",
        };
        workspace.mseTranslations.push(
          structuredClone(translation),
          structuredClone(translation),
        );
      },
    },
    {
      label: "Hypotheses",
      mutate: (workspace) =>
        workspace.hypotheses.push(structuredClone(workspace.hypotheses[0]!)),
    },
    {
      label: "Summary clauses",
      mutate: (workspace) => {
        const clause = {
          id: "summary-1",
          text: "Learner-authored summary.",
          factIds: ["F01"],
        };
        workspace.summary.push(
          structuredClone(clause),
          structuredClone(clause),
        );
      },
    },
  ];

  for (const { label, mutate } of duplicateCases) {
    const workspace = makeWorkspace();
    mutate(workspace);
    expect(() => assertWorkspaceIntegrity(workspace), label).toThrow(
      /duplicate ID/,
    );
  }
});

test("checks every Fact-linked workspace surface without resolving term IDs", () => {
  const timeline = makeWorkspace();
  timeline.timelineItems[0]!.factIds = [];
  expect(() => assertWorkspaceIntegrity(timeline)).toThrow(
    /requires a fact link/,
  );

  const mse = makeWorkspace();
  mse.mseTranslations.push({
    id: "mse-1",
    factIds: ["F99"],
    rawObservation: "Speech is rapid.",
    descriptiveWording: "Speech rate is increased.",
    termIds: ["academic-term-not-a-fact-id"],
    limitationOrAlternative: "Interruptibility is unknown.",
  });
  expect(() => assertWorkspaceIntegrity(mse)).toThrow(/F99/);

  const rationale = makeWorkspace();
  rationale.hypotheses[0]!.rationale = {
    text: "Learner rationale",
    factIds: [],
  };
  expect(() => assertWorkspaceIntegrity(rationale)).toThrow(
    /rationale requires a fact link/,
  );

  const implication = makeWorkspace();
  implication.hypotheses[0]!.managementImplications = {
    text: "Learner implication",
    factIds: ["F99"],
  };
  expect(() => assertWorkspaceIntegrity(implication)).toThrow(/F99/);

  const summary = makeWorkspace();
  summary.summary.push({
    id: "summary-1",
    text: "Learner-authored summary.",
    factIds: [],
  });
  expect(() => assertWorkspaceIntegrity(summary)).toThrow(
    /requires a fact link/,
  );
});

test("permits empty missing-information links but validates provided links", () => {
  const emptyLinks = makeWorkspace();
  emptyLinks.hypotheses[0]!.missingInformation.push({
    id: "gap-1",
    text: "Longitudinal collateral is missing.",
    relatedFactIds: [],
  });
  expect(assertWorkspaceIntegrity(emptyLinks)).toBe(emptyLinks);

  const dangling = makeWorkspace();
  dangling.hypotheses[0]!.missingInformation.push({
    id: "gap-1",
    text: "Longitudinal collateral is missing.",
    relatedFactIds: ["F99"],
  });
  expect(() => assertWorkspaceIntegrity(dangling)).toThrow(/F99/);

  const duplicateGap = makeWorkspace();
  duplicateGap.hypotheses[0]!.missingInformation.push(
    { id: "gap-1", text: "First gap", relatedFactIds: [] },
    { id: "gap-1", text: "Second gap", relatedFactIds: [] },
  );
  expect(() => assertWorkspaceIntegrity(duplicateGap)).toThrow(/duplicate ID/);
});

test("rejects duplicate Fact links and self-linked temporal relations", () => {
  const duplicateLink = makeWorkspace();
  duplicateLink.timelineItems[0]!.factIds = ["F01", "F01"];
  expect(() => assertWorkspaceIntegrity(duplicateLink)).toThrow(/duplicate ID/);

  const selfLink = makeWorkspace();
  selfLink.temporalRelations.push({
    id: "relation-1",
    fromFactId: "F01",
    toFactId: "F01",
    kind: "coincided",
  });
  expect(() => assertWorkspaceIntegrity(selfLink)).toThrow(/self-links/);
});

test("rejects duplicate exact temporal-relation triples even when IDs differ", () => {
  const workspace = makeWorkspace();
  workspace.temporalRelations.push(
    {
      id: "relation-001",
      fromFactId: "F02",
      toFactId: "F03",
      kind: "preceded",
    },
    {
      id: "relation-002",
      fromFactId: "F02",
      toFactId: "F03",
      kind: "preceded",
    },
  );

  expect(() => assertWorkspaceIntegrity(workspace)).toThrow(
    /duplicate exact temporal relationship/,
  );
});

test("allows a blank staged draft but requires its subject to be the current favorite", () => {
  const workspace = makeWorkspace();
  workspace.hypotheses[0]!.position = "favored";
  workspace.disconfirmationDraft = makeDraft(workspace.hypotheses[0]!.id);
  expect(assertWorkspaceIntegrity(workspace)).toBe(workspace);

  const nonFavorite = makeWorkspace();
  nonFavorite.disconfirmationDraft = makeDraft(nonFavorite.hypotheses[0]!.id);
  expect(() => assertWorkspaceIntegrity(nonFavorite)).toThrow(/not favored/);

  const unlinkedResponse = makeWorkspace();
  unlinkedResponse.hypotheses[0]!.position = "favored";
  unlinkedResponse.disconfirmationDraft = makeDraft(
    unlinkedResponse.hypotheses[0]!.id,
  );
  unlinkedResponse.disconfirmationDraft.claim = {
    text: "A completed stage response",
    factIds: [],
  };
  expect(() => assertWorkspaceIntegrity(unlinkedResponse)).toThrow(
    /requires a fact link/,
  );
});

test("rejects an invalid draft rival by its violated value", () => {
  const sameAsFavorite = makeWorkspace();
  sameAsFavorite.hypotheses[0]!.position = "favored";
  sameAsFavorite.disconfirmationDraft = {
    ...makeDraft(sameAsFavorite.hypotheses[0]!.id),
    rivalHypothesisId: sameAsFavorite.hypotheses[0]!.id,
  };
  expect(() => assertWorkspaceIntegrity(sameAsFavorite)).toThrow(
    new RegExp(`Invalid draft rival ${sameAsFavorite.hypotheses[0]!.id}`),
  );

  const unknown = makeWorkspace();
  unknown.hypotheses[0]!.position = "favored";
  unknown.disconfirmationDraft = {
    ...makeDraft(unknown.hypotheses[0]!.id),
    rivalHypothesisId: "unknown-rival",
  };
  expect(() => assertWorkspaceIntegrity(unknown)).toThrow(/unknown-rival/);
});

test("requires complete applied-record text and Fact links", () => {
  const complete = makeWorkspace();
  complete.hypotheses[0]!.position = "favored";
  complete.disconfirmation = makeAppliedRecord();
  expect(assertWorkspaceIntegrity(complete)).toBe(complete);

  for (const field of CHALLENGE_RESPONSE_FIELDS) {
    const blank = makeWorkspace();
    blank.hypotheses[0]!.position = "favored";
    blank.disconfirmation = makeAppliedRecord();
    blank.disconfirmation[field] = { text: "", factIds: ["F01"] };
    expect(() => assertWorkspaceIntegrity(blank), `${field} text`).toThrow(
      /requires text/,
    );

    const unlinked = makeWorkspace();
    unlinked.hypotheses[0]!.position = "favored";
    unlinked.disconfirmation = makeAppliedRecord();
    unlinked.disconfirmation[field] = { text: "Response", factIds: [] };
    expect(() => assertWorkspaceIntegrity(unlinked), `${field} links`).toThrow(
      /requires a fact link/,
    );

    const dangling = makeWorkspace();
    dangling.hypotheses[0]!.position = "favored";
    dangling.disconfirmation = makeAppliedRecord();
    dangling.disconfirmation[field] = { text: "Response", factIds: ["F99"] };
    expect(
      () => assertWorkspaceIntegrity(dangling),
      `${field} dangling link`,
    ).toThrow(/F99/);
  }
});

test("keeps applied history valid after later learner position changes", () => {
  const workspace = makeWorkspace();
  workspace.hypotheses[0]!.position = "plausible";
  workspace.hypotheses[1]!.position = "favored";
  workspace.disconfirmation = makeAppliedRecord();

  expect(assertWorkspaceIntegrity(workspace)).toBe(workspace);
});

test("rejects unknown applied subjects and invalid applied rivals", () => {
  const unknownSubject = makeWorkspace();
  unknownSubject.disconfirmation = {
    ...makeAppliedRecord(),
    favoredHypothesisId: "unknown-subject",
  };
  expect(() => assertWorkspaceIntegrity(unknownSubject)).toThrow(
    /unknown-subject/,
  );

  const sameRival = makeWorkspace();
  sameRival.disconfirmation = {
    ...makeAppliedRecord(),
    rivalHypothesisId: "bipolar_psychotic_features",
  };
  expect(() => assertWorkspaceIntegrity(sameRival)).toThrow(
    /bipolar_psychotic_features/,
  );
});

test("allows zero or one favorite and rejects more than one", () => {
  const zero = makeWorkspace();
  expect(assertWorkspaceIntegrity(zero)).toBe(zero);

  const one = makeWorkspace();
  one.hypotheses[0]!.position = "favored";
  expect(assertWorkspaceIntegrity(one)).toBe(one);

  const two = makeWorkspace();
  two.hypotheses[0]!.position = "favored";
  two.hypotheses[1]!.position = "favored";
  expect(() => assertWorkspaceIntegrity(two)).toThrow(
    /Only one hypothesis may be favored/,
  );
});
