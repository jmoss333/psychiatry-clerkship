import rawCase from "../content/cases/first-episode.json";
import { createSeedWorkspace } from "../content/loadContent";
import { makeWorkspace } from "../test/fixtures";
import type {
  AppliedDisconfirmationRecord,
  DisconfirmationDraft,
  FactLinkedText,
  WorkspaceState,
} from "./model";
import {
  AppliedDisconfirmationRecordSchema,
  CaseDefinitionSchema,
  MAX_ID_LENGTH,
  WorkspaceStateSchema,
  parseCaseDefinition,
} from "./schemas";

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

const linked = (text = "Linked learner response"): FactLinkedText => ({
  text,
  factIds: ["F01"],
});

function makeAppliedRecord(): AppliedDisconfirmationRecord {
  return {
    favoredHypothesisId: "bipolar_psychotic_features",
    claim: linked(),
    phenomenologyCheck: linked(),
    timeCourseChallenge: linked(),
    exclusionsReview: linked(),
    rivalHypothesisId: "primary_psychotic_disorder",
    rivalExplainsBetter: linked(),
    rivalExplainsWorse: linked(),
    findingFavoringRival: linked(),
    findingWeakeningRival: linked(),
    confidenceDecreaser: linked(),
    unresolved: linked(),
    nextDiscriminator: linked(),
    proposedPosition: "plausible",
    appliedAt: "2026-07-12T12:00:00.000Z",
  };
}

function makeDraftRecord(): DisconfirmationDraft {
  const blank = (): FactLinkedText => ({ text: "", factIds: [] });
  return {
    favoredHypothesisId: "bipolar_psychotic_features",
    claim: blank(),
    phenomenologyCheck: blank(),
    timeCourseChallenge: blank(),
    exclusionsReview: blank(),
    rivalExplainsBetter: blank(),
    rivalExplainsWorse: blank(),
    findingFavoringRival: blank(),
    findingWeakeningRival: blank(),
    confidenceDecreaser: blank(),
    unresolved: blank(),
    nextDiscriminator: blank(),
  };
}

test("parses the approved seed and preserves its exact authored contract", () => {
  const parsed = parseCaseDefinition(rawCase);

  expect(parsed).toMatchObject({
    id: "first_episode_001",
    version: 1,
    fictional: true,
    learnerTitle: "Synthetic Case 01 · First episode",
    facultyReview: { status: "draft" },
  });
  expect(parsed.facts.map((fact) => fact.id)).toEqual([
    "F01",
    "F02",
    "F03",
    "F04",
    "F05",
    "F06",
    "F07",
    "F08",
    "F09",
    "F10",
  ]);
  expect(parsed.facts).toEqual([
    {
      id: "F01",
      kind: "function",
      text: "Collateral describes academic decline and social withdrawal.",
      source: "collateral",
      reliability: "moderate",
      certainty: "probable",
      start: "about 6 months before current presentation",
      temporalPrecision: "relative",
      tags: [],
    },
    {
      id: "F02",
      kind: "substance",
      text: "Patient reports increasingly heavy cannabis use.",
      source: "patient_report",
      reliability: "moderate",
      certainty: "confirmed",
      start: "about 4 months before current presentation",
      temporalPrecision: "relative",
      tags: [],
    },
    {
      id: "F03",
      kind: "symptom",
      text: "Patient reports that neighbors are monitoring him.",
      source: "patient_report",
      reliability: "moderate",
      certainty: "confirmed",
      start: "about 3 months before current presentation",
      temporalPrecision: "relative",
      tags: [],
    },
    {
      id: "F04",
      kind: "symptom",
      text: "Patient reports sleeping about two hours nightly.",
      source: "patient_report",
      reliability: "moderate",
      certainty: "confirmed",
      start: "8 days before current presentation",
      temporalPrecision: "day",
      tags: [],
    },
    {
      id: "F05",
      kind: "symptom",
      text: "Patient reports no fatigue despite reduced sleep.",
      source: "patient_report",
      reliability: "moderate",
      certainty: "confirmed",
      start: "8 days before current presentation",
      temporalPrecision: "day",
      tags: [],
    },
    {
      id: "F06",
      kind: "function",
      text: "Collateral reports increased spending.",
      source: "collateral",
      reliability: "moderate",
      certainty: "probable",
      start: "8 days before current presentation",
      temporalPrecision: "day",
      tags: [],
    },
    {
      id: "F07",
      kind: "observation",
      text: "Patient makes grandiose statements.",
      source: "direct_observation",
      reliability: "high",
      certainty: "confirmed",
      start: "current presentation",
      temporalPrecision: "exact",
      tags: [],
    },
    {
      id: "F08",
      kind: "observation",
      text: "Speech is rapid.",
      source: "direct_observation",
      reliability: "high",
      certainty: "confirmed",
      start: "current presentation",
      temporalPrecision: "exact",
      tags: [],
    },
    {
      id: "F09",
      kind: "symptom",
      text: "Patient expresses persecutory beliefs.",
      source: "patient_report",
      reliability: "moderate",
      certainty: "confirmed",
      start: "current presentation",
      temporalPrecision: "exact",
      tags: [],
    },
    {
      id: "F10",
      kind: "observation",
      text: "The chart describes the current presentation as agitated.",
      source: "chart",
      reliability: "moderate",
      certainty: "confirmed",
      start: "current presentation",
      temporalPrecision: "exact",
      tags: [],
    },
  ]);
  expect(parsed.timelineItems.map((item) => item.id)).toEqual(
    parsed.facts.map((fact) => `timeline-${fact.id}`),
  );
  expect(parsed.timelineItems.map((item) => item.factIds)).toEqual([
    ["F01"],
    ["F02"],
    ["F03"],
    ["F04"],
    ["F05"],
    ["F06"],
    ["F07"],
    ["F08"],
    ["F09"],
    ["F10"],
  ]);
  expect(
    parsed.timelineItems.every((item) => item.episodeId === undefined),
  ).toBe(true);
  expect(parsed.timelineItems.map((item) => item.lane)).toEqual([
    "function",
    "substance_use",
    "psychosis",
    "sleep_energy",
    "sleep_energy",
    "function",
    "mood",
    "mood",
    "psychosis",
    "mood",
  ]);
  expect(parsed.timelineItems.map((item) => item.sortOrder)).toEqual([
    0, 1, 2, 3, 3, 3, 4, 4, 4, 4,
  ]);
  expect(parsed.timelineItems.map((item) => item.approximate)).toEqual([
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  expect(parsed.timelineItems.every((item) => !item.learnerEdited)).toBe(true);
  expect(parsed.timelineItems.map((item) => item.start)).toEqual(
    parsed.facts.map((fact) => fact.start),
  );
  expect(parsed.timelineItems.map((item) => item.label)).toEqual(
    parsed.facts.map((fact) => fact.text),
  );
  expect(parsed.hypotheses).toEqual([
    {
      id: "bipolar_psychotic_features",
      label: "Bipolar I disorder with psychotic features",
      category: "mood",
      position: "plausible",
      supportingFactIds: [],
      contradictingFactIds: [],
      missingInformation: [],
      dangerousIfMissed: false,
      managementImplications: { text: "", factIds: [] },
      rationale: { text: "", factIds: [] },
    },
    {
      id: "primary_psychotic_disorder",
      label: "Primary psychotic disorder",
      category: "psychotic",
      position: "plausible",
      supportingFactIds: [],
      contradictingFactIds: [],
      missingInformation: [],
      dangerousIfMissed: false,
      managementImplications: { text: "", factIds: [] },
      rationale: { text: "", factIds: [] },
    },
    {
      id: "cannabis_associated_psychosis",
      label: "Cannabis-associated psychosis",
      category: "substance",
      position: "plausible",
      supportingFactIds: [],
      contradictingFactIds: [],
      missingInformation: [],
      dangerousIfMissed: false,
      managementImplications: { text: "", factIds: [] },
      rationale: { text: "", factIds: [] },
    },
    {
      id: "medical_neurologic_process",
      label: "Medical or neurologic process",
      category: "medical",
      position: "cannot_exclude",
      supportingFactIds: [],
      contradictingFactIds: [],
      missingInformation: [],
      dangerousIfMissed: true,
      managementImplications: { text: "", factIds: [] },
      rationale: { text: "", factIds: [] },
    },
  ]);
});

test("parseCaseDefinition returns a deep clone", () => {
  const parsed = parseCaseDefinition(rawCase);
  parsed.facts[0]!.text = "Changed only in the parsed clone.";
  parsed.timelineItems[0]!.factIds.push("F02");

  const reparsed = parseCaseDefinition(rawCase);
  expect(reparsed.facts[0]!.text).toBe(
    "Collateral describes academic decline and social withdrawal.",
  );
  expect(reparsed.timelineItems[0]!.factIds).toEqual(["F01"]);
  expect(parsed.facts).not.toBe(rawCase.facts);
});

test("requires the fictional literal and exact faculty-review status union", () => {
  expect(
    CaseDefinitionSchema.safeParse({ ...rawCase, fictional: false }).success,
  ).toBe(false);
  expect(
    CaseDefinitionSchema.safeParse({
      ...rawCase,
      facultyReview: { status: "approved" },
    }).success,
  ).toBe(false);
});

test("uses strict required authored objects without hard-coding seed cardinality", () => {
  expect(
    CaseDefinitionSchema.safeParse({ ...rawCase, unexpected: true }).success,
  ).toBe(false);
  expect(
    CaseDefinitionSchema.safeParse({ ...rawCase, facts: undefined }).success,
  ).toBe(false);

  const smallerCase = parseCaseDefinition(rawCase);
  smallerCase.facts = smallerCase.facts.slice(0, 1);
  smallerCase.timelineItems = smallerCase.timelineItems.slice(0, 1);
  smallerCase.hypotheses = smallerCase.hypotheses.slice(0, 1);
  expect(CaseDefinitionSchema.safeParse(smallerCase).success).toBe(true);
});

test("bounds stable IDs at 100 characters and episode IDs at exactly 80", () => {
  const longCaseId = { ...rawCase, id: "i".repeat(MAX_ID_LENGTH + 1) };
  expect(CaseDefinitionSchema.safeParse(longCaseId).success).toBe(false);

  const episodeAtLimit = {
    ...rawCase,
    timelineItems: rawCase.timelineItems.map((item, index) =>
      index === 0 ? { ...item, episodeId: "e".repeat(80) } : item,
    ),
  };
  expect(CaseDefinitionSchema.safeParse(episodeAtLimit).success).toBe(true);

  const longEpisodeId = {
    ...rawCase,
    timelineItems: rawCase.timelineItems.map((item, index) =>
      index === 0 ? { ...item, episodeId: "e".repeat(81) } : item,
    ),
  };
  expect(CaseDefinitionSchema.safeParse(longEpisodeId).success).toBe(false);
});

test("requires non-empty unique Case Fact, Timeline, and Hypothesis IDs", () => {
  const blankFact = structuredClone(rawCase);
  blankFact.facts[0]!.id = "";
  expect(CaseDefinitionSchema.safeParse(blankFact).success).toBe(false);

  const duplicateFact = structuredClone(rawCase);
  duplicateFact.facts[1]!.id = duplicateFact.facts[0]!.id;
  expect(CaseDefinitionSchema.safeParse(duplicateFact).success).toBe(false);

  const duplicateTimeline = structuredClone(rawCase);
  duplicateTimeline.timelineItems[1]!.id =
    duplicateTimeline.timelineItems[0]!.id;
  expect(CaseDefinitionSchema.safeParse(duplicateTimeline).success).toBe(false);

  const duplicateHypothesis = structuredClone(rawCase);
  duplicateHypothesis.hypotheses[1]!.id = duplicateHypothesis.hypotheses[0]!.id;
  expect(CaseDefinitionSchema.safeParse(duplicateHypothesis).success).toBe(
    false,
  );
});

test("fails closed on dangling or overlapping authored case links", () => {
  const danglingTimeline = structuredClone(rawCase);
  danglingTimeline.timelineItems[0]!.factIds = ["F99"];
  expect(() => parseCaseDefinition(danglingTimeline)).toThrow(/F99/);

  const danglingHypothesis = parseCaseDefinition(rawCase);
  danglingHypothesis.hypotheses[0]!.rationale = {
    text: "Authored rationale",
    factIds: ["F99"],
  };
  expect(() => parseCaseDefinition(danglingHypothesis)).toThrow(/F99/);

  const overlap = parseCaseDefinition(rawCase);
  overlap.hypotheses[0]!.supportingFactIds = ["F04"];
  overlap.hypotheses[0]!.contradictingFactIds = ["F04"];
  expect(() => parseCaseDefinition(overlap)).toThrow(
    /both support and contradiction/,
  );
});

test("enforces fact and timeline text at 280 characters", () => {
  const atLimit = parseCaseDefinition(rawCase);
  atLimit.facts[0]!.text = "f".repeat(280);
  atLimit.timelineItems[0]!.label = "t".repeat(280);
  expect(CaseDefinitionSchema.safeParse(atLimit).success).toBe(true);

  const longFact = structuredClone(atLimit);
  longFact.facts[0]!.text = "f".repeat(281);
  expect(CaseDefinitionSchema.safeParse(longFact).success).toBe(false);

  const longTimeline = structuredClone(atLimit);
  longTimeline.timelineItems[0]!.label = "t".repeat(281);
  expect(CaseDefinitionSchema.safeParse(longTimeline).success).toBe(false);
});

test.each([-1, 1.5, 5])(
  "rejects timeline sortOrder %s outside the five visible time columns",
  (sortOrder) => {
    const invalid = parseCaseDefinition(rawCase);
    invalid.timelineItems[0]!.sortOrder = sortOrder;
    expect(CaseDefinitionSchema.safeParse(invalid).success).toBe(false);
  },
);

test("enforces the 500-character description and evidence-gap bound", () => {
  const atLimit = makeWorkspace();
  atLimit.mseTranslations.push({
    id: "mse-1",
    factIds: ["F08"],
    rawObservation: "r".repeat(500),
    descriptiveWording: "d".repeat(500),
    acceptedRevision: "a".repeat(500),
    termIds: ["rapid-speech"],
    limitationOrAlternative: "l".repeat(500),
    discriminatingAnswer: "q".repeat(500),
  });
  atLimit.hypotheses[0]!.missingInformation.push({
    id: "gap-1",
    text: "g".repeat(500),
    relatedFactIds: [],
  });
  atLimit.summary.push({
    id: "summary-1",
    text: "s".repeat(500),
    factIds: ["F01"],
  });
  expect(WorkspaceStateSchema.safeParse(atLimit).success).toBe(true);

  for (const field of [
    "rawObservation",
    "descriptiveWording",
    "acceptedRevision",
    "limitationOrAlternative",
    "discriminatingAnswer",
  ] as const) {
    const tooLong = structuredClone(atLimit);
    tooLong.mseTranslations[0]![field] = "x".repeat(501);
    expect(WorkspaceStateSchema.safeParse(tooLong).success, field).toBe(false);
  }

  const longGap = structuredClone(atLimit);
  longGap.hypotheses[0]!.missingInformation[0]!.text = "g".repeat(501);
  expect(WorkspaceStateSchema.safeParse(longGap).success).toBe(false);

  const longSummary = structuredClone(atLimit);
  longSummary.summary[0]!.text = "s".repeat(501);
  expect(WorkspaceStateSchema.safeParse(longSummary).success).toBe(false);
});

test("enforces rationale and management implication text at 800 characters", () => {
  const atLimit = parseCaseDefinition(rawCase);
  atLimit.hypotheses[0]!.rationale = {
    text: "r".repeat(800),
    factIds: ["F01"],
  };
  atLimit.hypotheses[0]!.managementImplications = {
    text: "m".repeat(800),
    factIds: ["F01"],
  };
  expect(CaseDefinitionSchema.safeParse(atLimit).success).toBe(true);

  const longRationale = structuredClone(atLimit);
  longRationale.hypotheses[0]!.rationale.text = "r".repeat(801);
  expect(CaseDefinitionSchema.safeParse(longRationale).success).toBe(false);

  const longImplication = structuredClone(atLimit);
  longImplication.hypotheses[0]!.managementImplications.text = "m".repeat(801);
  expect(CaseDefinitionSchema.safeParse(longImplication).success).toBe(false);
});

test("requires every applied challenge response, Fact link, rival, position, and ISO timestamp", () => {
  const record = makeAppliedRecord();
  expect(AppliedDisconfirmationRecordSchema.safeParse(record).success).toBe(
    true,
  );

  for (const field of CHALLENGE_RESPONSE_FIELDS) {
    const blank = structuredClone(record);
    blank[field] = { text: "", factIds: ["F01"] };
    expect(
      AppliedDisconfirmationRecordSchema.safeParse(blank).success,
      `${field} text`,
    ).toBe(false);

    const unlinked = structuredClone(record);
    unlinked[field] = { text: "Response", factIds: [] };
    expect(
      AppliedDisconfirmationRecordSchema.safeParse(unlinked).success,
      `${field} links`,
    ).toBe(false);
  }

  for (const field of [
    "rivalHypothesisId",
    "proposedPosition",
    "appliedAt",
  ] as const) {
    const incomplete: Partial<AppliedDisconfirmationRecord> =
      structuredClone(record);
    delete incomplete[field];
    expect(
      AppliedDisconfirmationRecordSchema.safeParse(incomplete).success,
      field,
    ).toBe(false);
  }

  expect(
    AppliedDisconfirmationRecordSchema.safeParse({
      ...record,
      appliedAt: "July 12, 2026",
    }).success,
  ).toBe(false);
});

test("requires all eleven draft response objects while allowing blank future stages", () => {
  const workspace = makeWorkspace();
  workspace.hypotheses[0]!.position = "favored";
  workspace.disconfirmationDraft = makeDraftRecord();
  expect(WorkspaceStateSchema.safeParse(workspace).success).toBe(true);

  const incompleteDraft: Partial<DisconfirmationDraft> = makeDraftRecord();
  delete incompleteDraft.nextDiscriminator;
  expect(
    WorkspaceStateSchema.safeParse({
      ...workspace,
      disconfirmationDraft: incompleteDraft,
    }).success,
  ).toBe(false);
});

test("enforces the 600-character bound on every challenge response", () => {
  const atLimit = makeAppliedRecord();
  for (const field of CHALLENGE_RESPONSE_FIELDS) {
    atLimit[field] = linked("c".repeat(600));
  }
  expect(AppliedDisconfirmationRecordSchema.safeParse(atLimit).success).toBe(
    true,
  );

  for (const field of CHALLENGE_RESPONSE_FIELDS) {
    const tooLong = structuredClone(atLimit);
    tooLong[field] = linked("c".repeat(601));
    expect(
      AppliedDisconfirmationRecordSchema.safeParse(tooLong).success,
      field,
    ).toBe(false);
  }
});

test("keeps academic evidence IDs separate from case Fact-linked domain text", () => {
  const authoredRationale = {
    ...rawCase,
    hypotheses: rawCase.hypotheses.map((hypothesis, index) =>
      index === 0
        ? {
            ...hypothesis,
            rationale: {
              ...hypothesis.rationale,
              evidenceIds: ["E01"],
            },
          }
        : hypothesis,
    ),
  };
  expect(CaseDefinitionSchema.safeParse(authoredRationale).success).toBe(false);

  const workspace = makeWorkspace();
  workspace.mseTranslations.push({
    id: "mse-1",
    factIds: ["F08"],
    rawObservation: "Speech is rapid.",
    descriptiveWording: "Speech rate is increased.",
    termIds: ["rapid-speech"],
    limitationOrAlternative: "Interruptibility is not described.",
  });
  workspace.summary.push({
    id: "summary-1",
    text: "Learner-authored chronology.",
    factIds: ["F01"],
  });
  workspace.hypotheses[0]!.position = "favored";
  workspace.disconfirmation = makeAppliedRecord();

  const withMseEvidenceIds = {
    ...workspace,
    mseTranslations: workspace.mseTranslations.map((translation) => ({
      ...translation,
      evidenceIds: ["E01"],
    })),
  };
  expect(WorkspaceStateSchema.safeParse(withMseEvidenceIds).success).toBe(
    false,
  );

  const withSummaryEvidenceIds = {
    ...workspace,
    summary: workspace.summary.map((clause) => ({
      ...clause,
      evidenceIds: ["E01"],
    })),
  };
  expect(WorkspaceStateSchema.safeParse(withSummaryEvidenceIds).success).toBe(
    false,
  );

  const withChallengeEvidenceIds = {
    ...workspace,
    disconfirmation: {
      ...workspace.disconfirmation!,
      claim: {
        ...workspace.disconfirmation!.claim,
        evidenceIds: ["E01"],
      },
    },
  };
  expect(WorkspaceStateSchema.safeParse(withChallengeEvidenceIds).success).toBe(
    false,
  );
});

test("requires unique Workspace IDs in every named collection", () => {
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
    const result = WorkspaceStateSchema.safeParse(workspace);
    expect(result.success, label).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.message).join(" "),
      ).toContain("duplicate ID");
    }
  }
});

test("allows zero or one favored hypothesis but rejects two", () => {
  const zeroFavored = makeWorkspace();
  expect(WorkspaceStateSchema.safeParse(zeroFavored).success).toBe(true);

  const oneFavored = makeWorkspace();
  oneFavored.hypotheses[0]!.position = "favored";
  expect(WorkspaceStateSchema.safeParse(oneFavored).success).toBe(true);

  const twoFavored = structuredClone(oneFavored);
  twoFavored.hypotheses[1]!.position = "favored";
  expect(WorkspaceStateSchema.safeParse(twoFavored).success).toBe(false);
});

test("creates an isolated seed workspace with required empty state and ISO time", () => {
  const caseDefinition = parseCaseDefinition(rawCase);
  const workspace = createSeedWorkspace(caseDefinition, "resident");
  const secondWorkspace = createSeedWorkspace(caseDefinition, "resident");

  expect(workspace).toMatchObject({
    schemaVersion: 1,
    caseId: "first_episode_001",
    caseVersion: 1,
    learnerLevel: "resident",
    temporalRelations: [],
    mseTranslations: [],
    summary: [],
    syntheticDataAcknowledged: false,
  });
  expect(workspace.disconfirmationDraft).toBeUndefined();
  expect(workspace.disconfirmation).toBeUndefined();
  expect(workspace.updatedAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  expect(Number.isNaN(Date.parse(workspace.updatedAt))).toBe(false);

  workspace.facts[0]!.text = "Changed only in the first workspace.";
  workspace.timelineItems[0]!.factIds.push("F02");
  workspace.hypotheses[0]!.label = "Changed only in the first workspace.";
  expect(caseDefinition.facts[0]!.text).toBe(
    "Collateral describes academic decline and social withdrawal.",
  );
  expect(secondWorkspace.facts[0]!.text).toBe(
    "Collateral describes academic decline and social withdrawal.",
  );
  expect(secondWorkspace.timelineItems[0]!.factIds).toEqual(["F01"]);
  expect(secondWorkspace.hypotheses[0]!.label).toBe(
    "Bipolar I disorder with psychotic features",
  );
});

test("seed construction checks integrity even when a typed case is mutated", () => {
  const caseDefinition = parseCaseDefinition(rawCase);
  caseDefinition.timelineItems[0]!.factIds = ["F99"];

  expect(() => createSeedWorkspace(caseDefinition, "ms3")).toThrow(/F99/);
});
