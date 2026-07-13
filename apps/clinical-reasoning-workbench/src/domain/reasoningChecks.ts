import { loadRuntimeContent } from "../content/loadContent";
import type {
  CognitivePrompt,
  LanguageRule,
  LinterFinding,
  ReasoningCheck,
} from "../content/loadContent";
import type { Hypothesis, TemporalRelation, WorkspaceState } from "./model";

export type { LinterFinding, ReasoningCheck } from "../content/loadContent";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function lintLanguage(
  text: string,
  rules: LanguageRule[] = loadRuntimeContent().languageRules,
): LinterFinding[] {
  return rules.flatMap((rule) => {
    const pattern = new RegExp(
      `(?:^|\\b)${escapeRegExp(rule.phrase)}(?:\\b|$)`,
      "i",
    );
    const match = text.match(pattern);
    return match ? [{ ...rule, originalText: match[0].trim() }] : [];
  });
}

const isReviewed = (hypothesis: Hypothesis) =>
  hypothesis.supportingFactIds.length > 0 ||
  hypothesis.contradictingFactIds.length > 0 ||
  hypothesis.missingInformation.length > 0 ||
  hypothesis.rationale.text.trim().length > 0 ||
  hypothesis.managementImplications.text.trim().length > 0;

export function evaluateReasoningChecks(
  workspace: WorkspaceState,
  prompts: CognitivePrompt[] = loadRuntimeContent().cognitivePrompts,
): ReasoningCheck[] {
  const favorite = workspace.hypotheses.find(
    (hypothesis) => hypothesis.position === "favored",
  );
  const medicalReviewed = workspace.hypotheses.some(
    (hypothesis) => hypothesis.category === "medical" && isReviewed(hypothesis),
  );
  const substanceReviewed = workspace.hypotheses.some(
    (hypothesis) =>
      hypothesis.category === "substance" && isReviewed(hypothesis),
  );
  const factsById = new Map(workspace.facts.map((fact) => [fact.id, fact]));

  const triggered = (prompt: CognitivePrompt): boolean => {
    switch (prompt.trigger) {
      case "reviewed_fewer_than_three":
        return workspace.hypotheses.filter(isReviewed).length < 3;
      case "no_favored_contradiction":
        return Boolean(favorite && favorite.contradictingFactIds.length === 0);
      case "medical_row_unexamined":
        return !medicalReviewed;
      case "substance_or_medical_unexamined":
        return !substanceReviewed || !medicalReviewed;
      case "fewer_than_two_supports":
        return Boolean(favorite && favorite.supportingFactIds.length < 2);
      case "only_support_low_or_unknown":
        return Boolean(
          favorite &&
          favorite.supportingFactIds.length > 0 &&
          favorite.supportingFactIds.every((factId) => {
            const reliability = factsById.get(factId)?.reliability;
            return reliability === "low" || reliability === "unknown";
          }),
        );
    }
  };

  return prompts.map((prompt) => ({
    id: prompt.id,
    status: triggered(prompt) ? "watch" : "ok",
    prompt: prompt.prompt,
  }));
}

const connects = (relation: TemporalRelation, first: string, second: string) =>
  (relation.fromFactId === first && relation.toFactId === second) ||
  (relation.fromFactId === second && relation.toFactId === first);

export function buildChronologyPrompts(workspace: WorkspaceState): string[] {
  const prompts: string[] = [];
  if (workspace.timelineItems.some((item) => item.approximate)) {
    prompts.push("Which dates are approximate?");
  }

  const psychosisFactIds = ["F03", "F09"];
  const cannabisRelationExists = workspace.temporalRelations.some((relation) =>
    psychosisFactIds.some((factId) => connects(relation, "F02", factId)),
  );
  if (!cannabisRelationExists) {
    prompts.push(
      "Did increasing cannabis use precede, coincide with, or remain independent of persecutory beliefs?",
    );
  }

  const moodFactIds = new Set(
    workspace.timelineItems
      .filter((item) => item.lane === "mood")
      .flatMap((item) => item.factIds),
  );
  const moodPsychosisRelationExists = workspace.temporalRelations.some(
    (relation) =>
      psychosisFactIds.some((psychosisFactId) =>
        [...moodFactIds].some((moodFactId) =>
          connects(relation, moodFactId, psychosisFactId),
        ),
      ),
  );
  if (!moodPsychosisRelationExists) {
    prompts.push("Did psychotic symptoms continue outside mood symptoms?");
  }

  return prompts;
}
