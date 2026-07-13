import { z } from "zod";
import type { CaseDefinition } from "./model";

export type MseTerm = {
  id: string;
  label: string;
  domain: string;
  definition: string;
  observableSupport: string;
  limitation: string;
  alternatives: string[];
  discriminatingQuestion: string | null;
  evidenceIds: string[];
};

export type LanguageRule = {
  id: string;
  phrase: string;
  why: string;
  alternatives: string[];
};

export type CognitiveTriggerKey =
  | "reviewed_fewer_than_three"
  | "no_favored_contradiction"
  | "medical_row_unexamined"
  | "substance_or_medical_unexamined"
  | "fewer_than_two_supports"
  | "only_support_low_or_unknown";

export type CognitivePrompt = {
  id: string;
  trigger: CognitiveTriggerKey;
  prompt: string;
};

export type ReasoningCheck = {
  id: string;
  status: "ok" | "watch";
  prompt: string;
};

export type LinterFinding = LanguageRule & { originalText: string };

export type TeachingCopy = Record<
  "ms3" | "resident",
  {
    defaultDefinitionsExpanded: boolean;
    msePanelTitle: string;
    differentialPanelTitle: string;
    challengePanelTitle: string;
    factLinkPrompt: string;
  }
>;

export type VersionedAuthoredContent<T> = {
  contentVersion: 1;
  facultyReview: {
    status: "draft" | "pending" | "reviewed";
    reviewedAt?: string;
    reviewedBy?: string;
  };
  items: T;
};

export type RuntimeContent = {
  caseDefinition: CaseDefinition;
  mseTerms: MseTerm[];
  languageRules: LanguageRule[];
  cognitivePrompts: CognitivePrompt[];
  teachingCopy: TeachingCopy;
  reviewStatus: Record<
    | "first-episode.json"
    | "mse-lexicon.json"
    | "language-linter-rules.json"
    | "cognitive-forcing-prompts.json"
    | "teaching-copy.json",
    "draft" | "pending" | "reviewed"
  >;
};

export const MAX_ID_LENGTH = 100;
export const MAX_EPISODE_ID_LENGTH = 80;
export const MAX_FACT_TEXT_LENGTH = 280;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_RATIONALE_LENGTH = 800;
export const MAX_CHALLENGE_RESPONSE_LENGTH = 600;

const hasVisibleText = (value: string) => value.trim().length > 0;

export const StableIdSchema = z
  .string()
  .min(1, "ID must not be empty")
  .max(MAX_ID_LENGTH, `ID must be at most ${MAX_ID_LENGTH} characters`)
  .refine(hasVisibleText, "ID must not be blank");

export const EpisodeIdSchema = z
  .string()
  .min(1, "Episode ID must not be empty")
  .max(
    MAX_EPISODE_ID_LENGTH,
    `Episode ID must be at most ${MAX_EPISODE_ID_LENGTH} characters`,
  )
  .refine(hasVisibleText, "Episode ID must not be blank");

export const FactTextSchema = z
  .string()
  .max(
    MAX_FACT_TEXT_LENGTH,
    `Fact text must be at most ${MAX_FACT_TEXT_LENGTH} characters`,
  )
  .refine(hasVisibleText, "Fact text is required");

export const TimelineTextSchema = z
  .string()
  .max(
    MAX_FACT_TEXT_LENGTH,
    `Timeline text must be at most ${MAX_FACT_TEXT_LENGTH} characters`,
  )
  .refine(hasVisibleText, "Timeline text is required");

export const DescriptionTextSchema = z
  .string()
  .max(
    MAX_DESCRIPTION_LENGTH,
    `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
  );

export const RationaleTextSchema = z
  .string()
  .max(
    MAX_RATIONALE_LENGTH,
    `Rationale or implication must be at most ${MAX_RATIONALE_LENGTH} characters`,
  );

export const ChallengeTextSchema = z
  .string()
  .max(
    MAX_CHALLENGE_RESPONSE_LENGTH,
    `Challenge response must be at most ${MAX_CHALLENGE_RESPONSE_LENGTH} characters`,
  );

export const IsoDateTimeSchema = z.iso.datetime();

function uniqueIdArray(label: string) {
  return z.array(StableIdSchema).superRefine((values, ctx) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        ctx.addIssue({
          code: "custom",
          message: `${label} contains duplicate ID ${value}`,
          path: [index],
        });
      }
      seen.add(value);
    });
  });
}

export const FactIdArraySchema = uniqueIdArray("Fact links");
export const TermIdArraySchema = uniqueIdArray("MSE term IDs");

export const FactSourceSchema = z.enum([
  "direct_observation",
  "patient_report",
  "collateral",
  "chart",
  "objective_data",
]);

export const CaseFactKindSchema = z.enum([
  "symptom",
  "observation",
  "collateral",
  "medication",
  "substance",
  "medical_event",
  "laboratory",
  "function",
  "stressor",
]);

export const FactReliabilitySchema = z.enum([
  "high",
  "moderate",
  "low",
  "unknown",
]);

export const FactCertaintySchema = z.enum([
  "confirmed",
  "probable",
  "possible",
  "unclear",
]);

export const TemporalPrecisionSchema = z.enum([
  "exact",
  "day",
  "week",
  "month",
  "year",
  "relative",
]);

export const CaseFactSchema = z.strictObject({
  id: StableIdSchema,
  kind: CaseFactKindSchema,
  text: FactTextSchema,
  source: FactSourceSchema,
  reliability: FactReliabilitySchema,
  certainty: FactCertaintySchema,
  start: DescriptionTextSchema.optional(),
  end: DescriptionTextSchema.optional(),
  temporalPrecision: TemporalPrecisionSchema.optional(),
  tags: z.array(DescriptionTextSchema),
});

export const TimelineLaneSchema = z.enum([
  "mood",
  "psychosis",
  "sleep_energy",
  "anxiety_trauma",
  "substance_use",
  "medication",
  "medical_neurologic",
  "function",
  "stressors",
  "treatment",
]);

export const TemporalRelationKindSchema = z.enum([
  "preceded",
  "coincided",
  "continued_after",
  "occurred_only_during",
  "improved_after",
  "worsened_after",
  "independent_of",
  "unclear",
]);

export const TimelineItemSchema = z.strictObject({
  id: StableIdSchema,
  factIds: FactIdArraySchema,
  lane: TimelineLaneSchema,
  label: TimelineTextSchema,
  start: DescriptionTextSchema.optional(),
  end: DescriptionTextSchema.optional(),
  approximate: z.boolean(),
  episodeId: EpisodeIdSchema.optional(),
  learnerEdited: z.boolean(),
  sortOrder: z.number().int().min(0).max(4),
});

export const TemporalRelationSchema = z.strictObject({
  id: StableIdSchema,
  fromFactId: StableIdSchema,
  toFactId: StableIdSchema,
  kind: TemporalRelationKindSchema,
});

export const MseTranslationSchema = z.strictObject({
  id: StableIdSchema,
  factIds: FactIdArraySchema,
  rawObservation: DescriptionTextSchema,
  descriptiveWording: DescriptionTextSchema,
  acceptedRevision: DescriptionTextSchema.optional(),
  termIds: TermIdArraySchema,
  limitationOrAlternative: DescriptionTextSchema,
  discriminatingAnswer: DescriptionTextSchema.optional(),
});

export const HypothesisPositionSchema = z.enum([
  "favored",
  "plausible",
  "less_likely",
  "cannot_exclude",
]);

export const EvidenceGapSchema = z.strictObject({
  id: StableIdSchema,
  text: DescriptionTextSchema,
  relatedFactIds: FactIdArraySchema,
});

export const FactLinkedTextSchema = z.strictObject({
  text: RationaleTextSchema,
  factIds: FactIdArraySchema,
});

export const ChallengeFactLinkedTextSchema = z.strictObject({
  text: ChallengeTextSchema,
  factIds: FactIdArraySchema,
});

export const CompleteChallengeFactLinkedTextSchema = z.strictObject({
  text: ChallengeTextSchema.refine(
    hasVisibleText,
    "Challenge response requires text",
  ),
  factIds: FactIdArraySchema.min(1, "Challenge response requires a fact link"),
});

export const HypothesisSchema = z
  .strictObject({
    id: StableIdSchema,
    label: DescriptionTextSchema,
    category: DescriptionTextSchema,
    position: HypothesisPositionSchema,
    supportingFactIds: FactIdArraySchema,
    contradictingFactIds: FactIdArraySchema,
    missingInformation: z.array(EvidenceGapSchema),
    dangerousIfMissed: z.boolean(),
    managementImplications: FactLinkedTextSchema,
    rationale: FactLinkedTextSchema,
  })
  .superRefine((hypothesis, ctx) => {
    const overlap = hypothesis.supportingFactIds.find((id) =>
      hypothesis.contradictingFactIds.includes(id),
    );
    if (overlap) {
      ctx.addIssue({
        code: "custom",
        message: `${hypothesis.label} uses ${overlap} as both support and contradiction`,
        path: ["contradictingFactIds"],
      });
    }

    const gapIds = new Set<string>();
    hypothesis.missingInformation.forEach((gap, index) => {
      if (gapIds.has(gap.id)) {
        ctx.addIssue({
          code: "custom",
          message: `${hypothesis.label} missing information contains duplicate ID ${gap.id}`,
          path: ["missingInformation", index, "id"],
        });
      }
      gapIds.add(gap.id);
    });
  });

const challengeShape = {
  favoredHypothesisId: StableIdSchema,
  claim: CompleteChallengeFactLinkedTextSchema,
  phenomenologyCheck: CompleteChallengeFactLinkedTextSchema,
  timeCourseChallenge: CompleteChallengeFactLinkedTextSchema,
  exclusionsReview: CompleteChallengeFactLinkedTextSchema,
  rivalHypothesisId: StableIdSchema,
  rivalExplainsBetter: CompleteChallengeFactLinkedTextSchema,
  rivalExplainsWorse: CompleteChallengeFactLinkedTextSchema,
  findingFavoringRival: CompleteChallengeFactLinkedTextSchema,
  findingWeakeningRival: CompleteChallengeFactLinkedTextSchema,
  confidenceDecreaser: CompleteChallengeFactLinkedTextSchema,
  unresolved: CompleteChallengeFactLinkedTextSchema,
  nextDiscriminator: CompleteChallengeFactLinkedTextSchema,
  proposedPosition: HypothesisPositionSchema,
};

export const DisconfirmationRecordSchema = z.strictObject(challengeShape);

export const DisconfirmationDraftSchema = z.strictObject({
  favoredHypothesisId: StableIdSchema,
  claim: ChallengeFactLinkedTextSchema,
  phenomenologyCheck: ChallengeFactLinkedTextSchema,
  timeCourseChallenge: ChallengeFactLinkedTextSchema,
  exclusionsReview: ChallengeFactLinkedTextSchema,
  rivalHypothesisId: StableIdSchema.optional(),
  rivalExplainsBetter: ChallengeFactLinkedTextSchema,
  rivalExplainsWorse: ChallengeFactLinkedTextSchema,
  findingFavoringRival: ChallengeFactLinkedTextSchema,
  findingWeakeningRival: ChallengeFactLinkedTextSchema,
  confidenceDecreaser: ChallengeFactLinkedTextSchema,
  unresolved: ChallengeFactLinkedTextSchema,
  nextDiscriminator: ChallengeFactLinkedTextSchema,
  proposedPosition: HypothesisPositionSchema.optional(),
});

export const AppliedDisconfirmationRecordSchema = z.strictObject({
  ...challengeShape,
  appliedAt: IsoDateTimeSchema,
});

export const SummaryClauseSchema = z.strictObject({
  id: StableIdSchema,
  text: DescriptionTextSchema,
  factIds: FactIdArraySchema,
});

export const LearnerLevelSchema = z.enum(["ms3", "resident"]);

export const FacultyReviewStatusSchema = z.enum([
  "draft",
  "pending",
  "reviewed",
]);

export const FacultyReviewSchema = z.strictObject({
  status: FacultyReviewStatusSchema,
  reviewedAt: IsoDateTimeSchema.optional(),
  reviewedBy: DescriptionTextSchema.optional(),
});

const VersionFieldsSchema = z.strictObject({
  contentVersion: z.literal(1),
  facultyReview: FacultyReviewSchema,
});

const MseTermSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  domain: z.string().min(1),
  definition: z.string().min(1),
  observableSupport: z.string().min(1),
  limitation: z.string().min(1),
  alternatives: z.array(z.string().min(1)).min(1),
  discriminatingQuestion: z.string().min(1).nullable(),
  evidenceIds: z
    .array(z.string().min(1))
    .length(
      0,
      "academic evidenceIds must remain empty until a registry is available",
    ),
});

const LanguageRuleSchema = z.strictObject({
  id: z.string().min(1),
  phrase: z.string().min(1),
  why: z.string().min(1),
  alternatives: z.array(z.string().min(1)).min(1),
});

const CognitivePromptSchema = z.strictObject({
  id: z.string().min(1),
  trigger: z.enum([
    "reviewed_fewer_than_three",
    "no_favored_contradiction",
    "medical_row_unexamined",
    "substance_or_medical_unexamined",
    "fewer_than_two_supports",
    "only_support_low_or_unknown",
  ]),
  prompt: z.string().min(1),
});

const TeachingLevelSchema = z.strictObject({
  defaultDefinitionsExpanded: z.boolean(),
  msePanelTitle: z.string().min(1),
  differentialPanelTitle: z.string().min(1),
  challengePanelTitle: z.string().min(1),
  factLinkPrompt: z.string().min(1),
});

const requireUniqueContentIds = (
  items: { id: string }[],
  ctx: z.core.$RefinementCtx<unknown>,
) => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate content ID ${item.id}`,
      });
    }
    seen.add(item.id);
  }
};

export const MseLexiconFileSchema = VersionFieldsSchema.extend({
  items: z.array(MseTermSchema).superRefine((items, ctx) => {
    if (items.length !== 23) {
      ctx.addIssue({
        code: "custom",
        message: "expected exactly 23 terms",
      });
    }
  }),
}).superRefine((value, ctx) => requireUniqueContentIds(value.items, ctx));

export const LanguageRulesFileSchema = VersionFieldsSchema.extend({
  items: z.array(LanguageRuleSchema).length(6),
}).superRefine((value, ctx) => requireUniqueContentIds(value.items, ctx));

export const CognitivePromptsFileSchema = VersionFieldsSchema.extend({
  items: z.array(CognitivePromptSchema).length(6),
}).superRefine((value, ctx) => requireUniqueContentIds(value.items, ctx));

export const TeachingCopyFileSchema = VersionFieldsSchema.extend({
  items: z.strictObject({
    ms3: TeachingLevelSchema,
    resident: TeachingLevelSchema,
  }),
});

function addCollectionIdIssues<T extends { id: string }>(
  label: string,
  items: T[],
  ctx: z.core.$RefinementCtx<unknown>,
  path: string,
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        message: `${label} contains duplicate ID ${item.id}`,
        path: [path, index, "id"],
      });
    }
    seen.add(item.id);
  });
}

function addFavoriteIssue(
  hypotheses: Array<{ position: string }>,
  ctx: z.core.$RefinementCtx<unknown>,
) {
  if (hypotheses.filter((item) => item.position === "favored").length > 1) {
    ctx.addIssue({
      code: "custom",
      message: "Only one hypothesis may be favored",
      path: ["hypotheses"],
    });
  }
}

export const CaseDefinitionSchema = z
  .strictObject({
    id: StableIdSchema,
    version: z.number().int().positive(),
    fictional: z.literal(true),
    learnerTitle: DescriptionTextSchema,
    facultyReview: FacultyReviewSchema,
    facts: z.array(CaseFactSchema),
    timelineItems: z.array(TimelineItemSchema),
    hypotheses: z.array(HypothesisSchema),
  })
  .superRefine((caseDefinition, ctx) => {
    addCollectionIdIssues("Facts", caseDefinition.facts, ctx, "facts");
    addCollectionIdIssues(
      "Timeline items",
      caseDefinition.timelineItems,
      ctx,
      "timelineItems",
    );
    addCollectionIdIssues(
      "Hypotheses",
      caseDefinition.hypotheses,
      ctx,
      "hypotheses",
    );
    addFavoriteIssue(caseDefinition.hypotheses, ctx);

    const factIds = new Set(caseDefinition.facts.map((fact) => fact.id));
    const checkFactIds = (
      label: string,
      values: string[],
      path: (string | number)[],
      allowEmpty = false,
    ) => {
      if (!allowEmpty && values.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `${label} requires a fact link`,
          path,
        });
      }
      values.forEach((id, index) => {
        if (!factIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: `${label} references unknown fact ${id}`,
            path: [...path, index],
          });
        }
      });
    };

    caseDefinition.timelineItems.forEach((item, index) => {
      checkFactIds(`Timeline item ${item.id}`, item.factIds, [
        "timelineItems",
        index,
        "factIds",
      ]);
    });
    caseDefinition.hypotheses.forEach((hypothesis, hypothesisIndex) => {
      const hypothesisPath = ["hypotheses", hypothesisIndex] as const;
      checkFactIds(
        `${hypothesis.label} supports`,
        hypothesis.supportingFactIds,
        [...hypothesisPath, "supportingFactIds"],
        true,
      );
      checkFactIds(
        `${hypothesis.label} contradicts`,
        hypothesis.contradictingFactIds,
        [...hypothesisPath, "contradictingFactIds"],
        true,
      );
      hypothesis.missingInformation.forEach((gap, gapIndex) => {
        checkFactIds(
          `${hypothesis.label} missing item ${gap.id}`,
          gap.relatedFactIds,
          [...hypothesisPath, "missingInformation", gapIndex, "relatedFactIds"],
          true,
        );
      });
      checkFactIds(
        `${hypothesis.label} rationale`,
        hypothesis.rationale.factIds,
        [...hypothesisPath, "rationale", "factIds"],
        !hasVisibleText(hypothesis.rationale.text),
      );
      checkFactIds(
        `${hypothesis.label} management implications`,
        hypothesis.managementImplications.factIds,
        [...hypothesisPath, "managementImplications", "factIds"],
        !hasVisibleText(hypothesis.managementImplications.text),
      );
    });
  });

export const WorkspaceStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    caseId: StableIdSchema,
    caseVersion: z.number().int().positive(),
    learnerLevel: LearnerLevelSchema,
    facts: z.array(CaseFactSchema),
    timelineItems: z.array(TimelineItemSchema),
    temporalRelations: z.array(TemporalRelationSchema),
    mseTranslations: z.array(MseTranslationSchema),
    hypotheses: z.array(HypothesisSchema),
    disconfirmationDraft: DisconfirmationDraftSchema.optional(),
    disconfirmation: AppliedDisconfirmationRecordSchema.optional(),
    summary: z.array(SummaryClauseSchema),
    syntheticDataAcknowledged: z.boolean(),
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((workspace, ctx) => {
    addCollectionIdIssues("Facts", workspace.facts, ctx, "facts");
    addCollectionIdIssues(
      "Timeline items",
      workspace.timelineItems,
      ctx,
      "timelineItems",
    );
    addCollectionIdIssues(
      "Temporal relations",
      workspace.temporalRelations,
      ctx,
      "temporalRelations",
    );
    addCollectionIdIssues(
      "MSE translations",
      workspace.mseTranslations,
      ctx,
      "mseTranslations",
    );
    addCollectionIdIssues(
      "Hypotheses",
      workspace.hypotheses,
      ctx,
      "hypotheses",
    );
    addCollectionIdIssues("Summary clauses", workspace.summary, ctx, "summary");
    addFavoriteIssue(workspace.hypotheses, ctx);
  });

export function parseCaseDefinition(input: unknown): CaseDefinition {
  const parsed = CaseDefinitionSchema.parse(input);
  return structuredClone(parsed);
}
