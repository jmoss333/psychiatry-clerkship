import type { ZodType } from "zod";
import cognitivePromptsJson from "./cognitive-forcing-prompts.json";
import firstEpisodeJson from "./cases/first-episode.json";
import languageRulesJson from "./language-linter-rules.json";
import mseLexiconJson from "./mse-lexicon.json";
import teachingCopyJson from "./teaching-copy.json";
import { assertWorkspaceIntegrity } from "../domain/integrity";
import type {
  CaseDefinition,
  LearnerLevel,
  WorkspaceState,
} from "../domain/model";
import {
  CaseDefinitionSchema,
  CognitivePromptsFileSchema,
  LanguageRulesFileSchema,
  MseLexiconFileSchema,
  TeachingCopyFileSchema,
} from "../domain/schemas";
import type { RuntimeContent } from "../domain/schemas";

export type {
  CognitivePrompt,
  CognitiveTriggerKey,
  LanguageRule,
  LinterFinding,
  MseTerm,
  ReasoningCheck,
  RuntimeContent,
  TeachingCopy,
  VersionedAuthoredContent,
} from "../domain/schemas";

export type AuthoredInputs = {
  firstEpisode: unknown;
  mseLexicon: unknown;
  languageRules: unknown;
  cognitivePrompts: unknown;
  teachingCopy: unknown;
};

const bundledAuthoredInputs: AuthoredInputs = {
  firstEpisode: firstEpisodeJson,
  mseLexicon: mseLexiconJson,
  languageRules: languageRulesJson,
  cognitivePrompts: cognitivePromptsJson,
  teachingCopy: teachingCopyJson,
};

export class ContentValidationError extends Error {
  constructor(
    public readonly fileName: string,
    details: string,
  ) {
    super(`${fileName}: ${details}`);
    this.name = "ContentValidationError";
  }
}

function parseAuthoredFile<T>(
  fileName: string,
  input: unknown,
  schema: ZodType<T>,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ContentValidationError(
      fileName,
      result.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  return result.data;
}

export function loadRuntimeContent(
  inputs: AuthoredInputs = bundledAuthoredInputs,
): RuntimeContent {
  const caseDefinition = parseAuthoredFile(
    "first-episode.json",
    inputs.firstEpisode,
    CaseDefinitionSchema,
  );
  const mse = parseAuthoredFile(
    "mse-lexicon.json",
    inputs.mseLexicon,
    MseLexiconFileSchema,
  );
  const linter = parseAuthoredFile(
    "language-linter-rules.json",
    inputs.languageRules,
    LanguageRulesFileSchema,
  );
  const prompts = parseAuthoredFile(
    "cognitive-forcing-prompts.json",
    inputs.cognitivePrompts,
    CognitivePromptsFileSchema,
  );
  const teaching = parseAuthoredFile(
    "teaching-copy.json",
    inputs.teachingCopy,
    TeachingCopyFileSchema,
  );

  return {
    caseDefinition,
    mseTerms: mse.items,
    languageRules: linter.items,
    cognitivePrompts: prompts.items,
    teachingCopy: teaching.items,
    reviewStatus: {
      "first-episode.json": caseDefinition.facultyReview.status,
      "mse-lexicon.json": mse.facultyReview.status,
      "language-linter-rules.json": linter.facultyReview.status,
      "cognitive-forcing-prompts.json": prompts.facultyReview.status,
      "teaching-copy.json": teaching.facultyReview.status,
    },
  };
}

export function createSeedWorkspace(
  caseDefinition: CaseDefinition,
  level: LearnerLevel,
): WorkspaceState {
  const content = structuredClone({
    facts: caseDefinition.facts,
    timelineItems: caseDefinition.timelineItems,
    hypotheses: caseDefinition.hypotheses,
  });
  const workspace: WorkspaceState = {
    schemaVersion: 1,
    caseId: caseDefinition.id,
    caseVersion: caseDefinition.version,
    learnerLevel: level,
    facts: content.facts,
    timelineItems: content.timelineItems,
    temporalRelations: [],
    mseTranslations: [],
    hypotheses: content.hypotheses,
    summary: [],
    syntheticDataAcknowledged: false,
    updatedAt: new Date().toISOString(),
  };

  return assertWorkspaceIntegrity(workspace);
}
