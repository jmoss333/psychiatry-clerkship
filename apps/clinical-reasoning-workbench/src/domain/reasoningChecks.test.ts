import firstEpisodeJson from "../content/cases/first-episode.json";
import cognitivePromptsJson from "../content/cognitive-forcing-prompts.json";
import languageRulesJson from "../content/language-linter-rules.json";
import mseLexiconJson from "../content/mse-lexicon.json";
import teachingCopyJson from "../content/teaching-copy.json";
import {
  loadRuntimeContent,
  type AuthoredInputs,
  type LanguageRule,
} from "../content/loadContent";
import { makeWorkspace } from "../test/fixtures";
import { assertWorkspaceContentReferences } from "./integrity";
import type { Hypothesis, WorkspaceState } from "./model";
import {
  buildChronologyPrompts,
  evaluateReasoningChecks,
  lintLanguage,
} from "./reasoningChecks";

const APPROVED_MSE_IDS = [
  "guarded",
  "hypervigilant",
  "psychomotor_agitation",
  "psychomotor_retardation",
  "rapid_speech",
  "pressured_speech",
  "speech_latency",
  "restricted_affect",
  "blunted_affect",
  "flat_affect",
  "labile_affect",
  "circumstantial",
  "tangential",
  "flight_of_ideas",
  "loose_associations",
  "thought_blocking",
  "perseveration",
  "internal_preoccupation",
  "delusion",
  "obsession",
  "overvalued_idea",
  "insight",
  "judgment",
] as const;

const APPROVED_LANGUAGE_PHRASES = [
  "manipulative",
  "attention-seeking",
  "poor historian",
  "noncompliant",
  "normal affect",
  "denies psychosis",
] as const;

const APPROVED_PROMPT_TRIGGERS = [
  "reviewed_fewer_than_three",
  "no_favored_contradiction",
  "medical_row_unexamined",
  "substance_or_medical_unexamined",
  "fewer_than_two_supports",
  "only_support_low_or_unknown",
] as const;

const CHRONOLOGY_PROMPTS = [
  "Which dates are approximate?",
  "Did increasing cannabis use precede, coincide with, or remain independent of persecutory beliefs?",
  "Did psychotic symptoms continue outside mood symptoms?",
] as const;

const validAuthoredInputs = (): AuthoredInputs => ({
  firstEpisode: structuredClone(firstEpisodeJson),
  mseLexicon: structuredClone(mseLexiconJson),
  languageRules: structuredClone(languageRulesJson),
  cognitivePrompts: structuredClone(cognitivePromptsJson),
  teachingCopy: structuredClone(teachingCopyJson),
});

const authoredItems = <T>(input: unknown): T => input as T;

function checkStatus(workspace: WorkspaceState, id: string) {
  return evaluateReasoningChecks(workspace).find((check) => check.id === id)
    ?.status;
}

function markReviewed(
  hypothesis: Hypothesis,
  mode: "support" | "contradiction" | "missing" | "rationale" | "management",
) {
  if (mode === "support") hypothesis.supportingFactIds = ["F01"];
  if (mode === "contradiction") hypothesis.contradictingFactIds = ["F01"];
  if (mode === "missing") {
    hypothesis.missingInformation = [
      {
        id: `gap-${hypothesis.id}`,
        text: "Missing detail",
        relatedFactIds: [],
      },
    ];
  }
  if (mode === "rationale") {
    hypothesis.rationale = { text: "Reasoned review", factIds: ["F01"] };
  }
  if (mode === "management") {
    hypothesis.managementImplications = {
      text: "Evaluation implication",
      factIds: ["F01"],
    };
  }
}

test("loads the exact approved MSE ID order, labels, and non-empty alternatives", () => {
  const content = loadRuntimeContent();
  expect(content.mseTerms.map((term) => term.id)).toEqual(APPROVED_MSE_IDS);
  expect(content.mseTerms).toHaveLength(23);
  expect(content.mseTerms.map((term) => term.label)).toContain(
    "Pressured speech",
  );
  expect(content.mseTerms.every((term) => term.alternatives.length > 0)).toBe(
    true,
  );
});

test("keeps all v1 academic evidence IDs empty and separate from case fact IDs", () => {
  const content = loadRuntimeContent();
  expect(content.mseTerms.every((term) => term.evidenceIds.length === 0)).toBe(
    true,
  );

  const inputs = validAuthoredInputs();
  const mse = authoredItems<{ items: Array<{ evidenceIds: string[] }> }>(
    inputs.mseLexicon,
  );
  mse.items[0]!.evidenceIds = ["F01"];
  expect(() => loadRuntimeContent(inputs)).toThrow(
    /mse-lexicon\.json.*evidenceIds/i,
  );
});

test("distinguishes rapid from pressured speech with one exact question", () => {
  const terms = loadRuntimeContent().mseTerms;
  const expected =
    "Could the patient be interrupted, or did speech continue despite attempts to interject?";
  expect(
    terms.find((term) => term.id === "rapid_speech")?.discriminatingQuestion,
  ).toBe(expected);
  expect(
    terms.find((term) => term.id === "pressured_speech")
      ?.discriminatingQuestion,
  ).toBe(expected);
});

test("loads the exact approved linter phrase and cognitive-trigger order", () => {
  const content = loadRuntimeContent();
  expect(content.languageRules.map((rule) => rule.phrase)).toEqual(
    APPROVED_LANGUAGE_PHRASES,
  );
  expect(content.cognitivePrompts.map((prompt) => prompt.trigger)).toEqual(
    APPROVED_PROMPT_TRIGGERS,
  );
});

test.each([
  "manipulative",
  "attention-seeking",
  "poor historian",
  "noncompliant",
  "normal affect",
  "denies psychosis",
])("flags %s without rewriting the learner text", (phrase) => {
  const result = lintLanguage(phrase);
  expect(result).toHaveLength(1);
  expect(result[0]?.originalText).toBe(phrase);
  expect(result[0]?.alternatives.length).toBeGreaterThan(0);
});

test("lints case-insensitively, preserves punctuation-adjacent casing, and keeps rule order", () => {
  const text = 'Called "NONCOMPLIANT," then described as Manipulative.';
  expect(
    lintLanguage(text).map(({ id, originalText }) => ({ id, originalText })),
  ).toEqual([
    { id: "manipulative", originalText: "Manipulative" },
    { id: "noncompliant", originalText: "NONCOMPLIANT" },
  ]);
  expect(text).toBe('Called "NONCOMPLIANT," then described as Manipulative.');
});

test("matches the full hyphenated phrase but not word substrings", () => {
  expect(lintLanguage("attention-seeking")).toHaveLength(1);
  expect(lintLanguage("attention-seekingly")).toEqual([]);
  expect(lintLanguage("unmanipulative")).toEqual([]);
  expect(lintLanguage("noncompliantness")).toEqual([]);
});

test("escapes regular-expression metacharacters in injected rules", () => {
  const rules: LanguageRule[] = [
    {
      id: "literal_punctuation",
      phrase: "poor.historian",
      why: "Test-only injected rule",
      alternatives: ["Describe the barrier."],
    },
  ];
  expect(lintLanguage("A POOR.HISTORIAN label", rules)[0]?.originalText).toBe(
    "POOR.HISTORIAN",
  );
  expect(lintLanguage("A poorXhistorian label", rules)).toEqual([]);
});

test("names an invalid authored file and exposes no partial result", () => {
  const inputs = validAuthoredInputs();
  inputs.mseLexicon = {
    contentVersion: 1,
    facultyReview: { status: "draft" },
    items: [],
  };
  let exposed: ReturnType<typeof loadRuntimeContent> | undefined;
  expect(() => {
    exposed = loadRuntimeContent(inputs);
  }).toThrow(/mse-lexicon\.json.*expected exactly 23 terms/);
  expect(exposed).toBeUndefined();
});

test.each([0, 22, 24])(
  "uses the custom 23-term cardinality error for %i injected terms",
  (count) => {
    const inputs = validAuthoredInputs();
    const mse = authoredItems<{ items: unknown[] }>(inputs.mseLexicon);
    const source = structuredClone(mse.items);
    while (source.length < 24) {
      const copy = structuredClone(source[source.length % 23]) as {
        id: string;
      };
      copy.id = `extra-${source.length}`;
      source.push(copy);
    }
    mse.items = source.slice(0, count);
    expect(() => loadRuntimeContent(inputs)).toThrow(
      /mse-lexicon\.json.*expected exactly 23 terms/,
    );
  },
);

test("rejects duplicate content IDs while allowing a structurally valid test substitution", () => {
  const duplicate = validAuthoredInputs();
  const duplicateMse = authoredItems<{ items: Array<{ id: string }> }>(
    duplicate.mseLexicon,
  );
  duplicateMse.items[1]!.id = duplicateMse.items[0]!.id;
  expect(() => loadRuntimeContent(duplicate)).toThrow(
    /mse-lexicon\.json.*duplicate content ID guarded/,
  );

  const substituted = validAuthoredInputs();
  const substitutedMse = authoredItems<{
    items: Array<{ id: string; label: string }>;
  }>(substituted.mseLexicon);
  substitutedMse.items[0]!.id = "test_only_guarded_substitute";
  substitutedMse.items[0]!.label = "Test-only guarded substitute";
  expect(loadRuntimeContent(substituted).mseTerms[0]?.id).toBe(
    "test_only_guarded_substitute",
  );
  expect(loadRuntimeContent().mseTerms.map((term) => term.id)).toEqual(
    APPROVED_MSE_IDS,
  );
});

test.each([
  ["languageRules", "language-linter-rules.json"],
  ["cognitivePrompts", "cognitive-forcing-prompts.json"],
] as const)("rejects duplicate IDs in %s", (key, fileName) => {
  const inputs = validAuthoredInputs();
  const file = authoredItems<{ items: Array<{ id: string }> }>(inputs[key]);
  file.items[1]!.id = file.items[0]!.id;
  expect(() => loadRuntimeContent(inputs)).toThrow(
    new RegExp(`${fileName.replace(".", "\\.")}.*duplicate content ID`),
  );
});

test.each([
  ["firstEpisode", "first-episode.json"],
  ["mseLexicon", "mse-lexicon.json"],
  ["languageRules", "language-linter-rules.json"],
  ["cognitivePrompts", "cognitive-forcing-prompts.json"],
  ["teachingCopy", "teaching-copy.json"],
] as const)("rejects unknown root keys in %s", (key, fileName) => {
  const inputs = validAuthoredInputs();
  inputs[key] = { ...(inputs[key] as object), unexpected: true };
  expect(() => loadRuntimeContent(inputs)).toThrow(
    new RegExp(fileName.replace(".", "\\.")),
  );
});

test.each([
  [
    "mseLexicon",
    "mse-lexicon.json",
    (input: unknown) => {
      const file = authoredItems<{ items: Array<Record<string, unknown>> }>(
        input,
      );
      file.items[0]!.unexpected = true;
    },
  ],
  [
    "languageRules",
    "language-linter-rules.json",
    (input: unknown) => {
      const file = authoredItems<{ items: Array<Record<string, unknown>> }>(
        input,
      );
      file.items[0]!.unexpected = true;
    },
  ],
  [
    "cognitivePrompts",
    "cognitive-forcing-prompts.json",
    (input: unknown) => {
      const file = authoredItems<{ items: Array<Record<string, unknown>> }>(
        input,
      );
      file.items[0]!.unexpected = true;
    },
  ],
  [
    "teachingCopy",
    "teaching-copy.json",
    (input: unknown) => {
      const file = authoredItems<{
        items: { ms3: Record<string, unknown> };
      }>(input);
      file.items.ms3.unexpected = true;
    },
  ],
] as const)("rejects unknown nested keys in %s", (key, fileName, mutate) => {
  const inputs = validAuthoredInputs();
  mutate(inputs[key]);
  expect(() => loadRuntimeContent(inputs)).toThrow(
    new RegExp(fileName.replace(".", "\\.")),
  );
});

test("reuses strict faculty review validation including ISO reviewedAt", () => {
  const inputs = validAuthoredInputs();
  const mse = authoredItems<{
    facultyReview: Record<string, unknown>;
  }>(inputs.mseLexicon);
  mse.facultyReview.reviewedAt = "not-an-ISO-date";
  expect(() => loadRuntimeContent(inputs)).toThrow(/mse-lexicon\.json/);

  const extra = validAuthoredInputs();
  const prompts = authoredItems<{
    facultyReview: Record<string, unknown>;
  }>(extra.cognitivePrompts);
  prompts.facultyReview.unexpected = true;
  expect(() => loadRuntimeContent(extra)).toThrow(
    /cognitive-forcing-prompts\.json/,
  );
});

test("rejects empty authored fields and alternatives with the source filename", () => {
  const mseInputs = validAuthoredInputs();
  authoredItems<{ items: Array<{ alternatives: string[] }> }>(
    mseInputs.mseLexicon,
  ).items[0]!.alternatives = [];
  expect(() => loadRuntimeContent(mseInputs)).toThrow(/mse-lexicon\.json/);

  const linterInputs = validAuthoredInputs();
  authoredItems<{ items: Array<{ why: string }> }>(
    linterInputs.languageRules,
  ).items[0]!.why = "";
  expect(() => loadRuntimeContent(linterInputs)).toThrow(
    /language-linter-rules\.json/,
  );

  const promptInputs = validAuthoredInputs();
  authoredItems<{ items: Array<{ prompt: string }> }>(
    promptInputs.cognitivePrompts,
  ).items[0]!.prompt = "";
  expect(() => loadRuntimeContent(promptInputs)).toThrow(
    /cognitive-forcing-prompts\.json/,
  );

  const teachingInputs = validAuthoredInputs();
  authoredItems<{ items: { resident: { msePanelTitle: string } } }>(
    teachingInputs.teachingCopy,
  ).items.resident.msePanelTitle = "";
  expect(() => loadRuntimeContent(teachingInputs)).toThrow(
    /teaching-copy\.json/,
  );
});

test("keeps every authored content file in draft review in filename order", () => {
  expect(loadRuntimeContent().reviewStatus).toEqual({
    "first-episode.json": "draft",
    "mse-lexicon.json": "draft",
    "language-linter-rules.json": "draft",
    "cognitive-forcing-prompts.json": "draft",
    "teaching-copy.json": "draft",
  });
  expect(Object.values(loadRuntimeContent().reviewStatus)).toEqual([
    "draft",
    "draft",
    "draft",
    "draft",
    "draft",
  ]);
});

test("rejects a restored workspace for a different case ID or version", () => {
  const content = loadRuntimeContent();
  const wrongId = { ...makeWorkspace(), caseId: "another_case" };
  const wrongVersion = { ...makeWorkspace(), caseVersion: 99 };
  expect(() => assertWorkspaceContentReferences(wrongId, content)).toThrow(
    /another_case@1.*first_episode_001@1/,
  );
  expect(() => assertWorkspaceContentReferences(wrongVersion, content)).toThrow(
    /first_episode_001@99.*first_episode_001@1/,
  );
});

test("rejects every unknown MSE term reference without resolving it as a fact ID", () => {
  const workspace = makeWorkspace();
  workspace.mseTranslations.push({
    id: "translation-1",
    factIds: ["F08"],
    rawObservation: "Speech is rapid.",
    descriptiveWording: "Speech rate is increased.",
    termIds: ["F08", "unknown_term"],
    limitationOrAlternative: "Interruptibility was not assessed.",
  });
  expect(() =>
    assertWorkspaceContentReferences(workspace, loadRuntimeContent()),
  ).toThrow(/translation-1 references unknown term F08/);
});

test("returns exactly one reasoning check per authored prompt in file order", () => {
  const content = loadRuntimeContent();
  const checks = evaluateReasoningChecks(
    makeWorkspace(),
    content.cognitivePrompts,
  );
  expect(checks).toEqual(
    content.cognitivePrompts.map((prompt, index) => ({
      id: prompt.id,
      status: ["watch", "ok", "watch", "watch", "ok", "ok"][index],
      prompt: prompt.prompt,
    })),
  );
});

test.each([
  "support",
  "contradiction",
  "missing",
  "rationale",
  "management",
] as const)("counts a hypothesis with %s as reviewed", (mode) => {
  const workspace = makeWorkspace();
  workspace.hypotheses
    .slice(0, 3)
    .forEach((hypothesis) => markReviewed(hypothesis, mode));
  expect(checkStatus(workspace, "premature_closure")).toBe("ok");
});

test("ignores whitespace-only rationale and management text when counting reviewed rows", () => {
  const workspace = makeWorkspace();
  workspace.hypotheses[0]!.rationale.text = "   ";
  workspace.hypotheses[1]!.managementImplications.text = "\n";
  expect(checkStatus(workspace, "premature_closure")).toBe("watch");
});

test("suppresses favorite-only checks until a favorite exists", () => {
  const workspace = makeWorkspace();
  const checks = evaluateReasoningChecks(workspace);
  expect(checks.find((check) => check.id === "confirmation_bias")?.status).toBe(
    "ok",
  );
  expect(
    checks.find((check) => check.id === "unsupported_confidence")?.status,
  ).toBe("ok");
  expect(
    checks.find((check) => check.id === "single_low_reliability_source")
      ?.status,
  ).toBe("ok");
});

test("requires a contradiction and two supports only for the selected favorite", () => {
  const workspace = makeWorkspace();
  const favorite = workspace.hypotheses[0]!;
  favorite.position = "favored";
  favorite.supportingFactIds = ["F01"];
  expect(checkStatus(workspace, "confirmation_bias")).toBe("watch");
  expect(checkStatus(workspace, "unsupported_confidence")).toBe("watch");

  favorite.contradictingFactIds = ["F02"];
  favorite.supportingFactIds = ["F01", "F07"];
  expect(checkStatus(workspace, "confirmation_bias")).toBe("ok");
  expect(checkStatus(workspace, "unsupported_confidence")).toBe("ok");
});

test("uses exact lowercase category values and watches when either medical or substance is unreviewed", () => {
  const workspace = makeWorkspace();
  const substance = workspace.hypotheses.find(
    (hypothesis) => hypothesis.category === "substance",
  )!;
  const medical = workspace.hypotheses.find(
    (hypothesis) => hypothesis.category === "medical",
  )!;
  markReviewed(substance, "missing");
  expect(checkStatus(workspace, "diagnostic_overshadowing")).toBe("watch");
  expect(checkStatus(workspace, "substance_medical_causes")).toBe("watch");

  markReviewed(medical, "rationale");
  expect(checkStatus(workspace, "diagnostic_overshadowing")).toBe("ok");
  expect(checkStatus(workspace, "substance_medical_causes")).toBe("ok");

  medical.category = "Medical";
  substance.category = "Substance";
  expect(checkStatus(workspace, "diagnostic_overshadowing")).toBe("watch");
  expect(checkStatus(workspace, "substance_medical_causes")).toBe("watch");
});

test("watches low-or-unknown support only with at least one support and when every source is low or unknown", () => {
  const workspace = makeWorkspace();
  const favorite = workspace.hypotheses[0]!;
  favorite.position = "favored";
  expect(checkStatus(workspace, "single_low_reliability_source")).toBe("ok");

  workspace.facts.find((fact) => fact.id === "F01")!.reliability = "low";
  workspace.facts.find((fact) => fact.id === "F02")!.reliability = "unknown";
  favorite.supportingFactIds = ["F01", "F02"];
  expect(checkStatus(workspace, "single_low_reliability_source")).toBe("watch");

  workspace.facts.find((fact) => fact.id === "F02")!.reliability = "moderate";
  expect(checkStatus(workspace, "single_low_reliability_source")).toBe("ok");
});

test("emits chronology prompts in the fixed order", () => {
  expect(buildChronologyPrompts(makeWorkspace())).toEqual(CHRONOLOGY_PROMPTS);
});

test("removes only the approximate-date prompt when all timeline items are exact", () => {
  const workspace = makeWorkspace();
  workspace.timelineItems.forEach((item) => {
    item.approximate = false;
  });
  expect(buildChronologyPrompts(workspace)).toEqual(
    CHRONOLOGY_PROMPTS.slice(1),
  );
});

test.each(["F03", "F09"] as const)(
  "stops the cannabis prompt for any relation kind and either direction connecting F02 to %s",
  (psychosisFactId) => {
    const workspace = makeWorkspace();
    workspace.temporalRelations.push({
      id: `relation-${psychosisFactId}`,
      fromFactId: psychosisFactId,
      toFactId: "F02",
      kind: "unclear",
    });
    expect(buildChronologyPrompts(workspace)).not.toContain(
      CHRONOLOGY_PROMPTS[1],
    );
  },
);

test("derives mood-linked facts from current timeline items and stops the mood prompt in either direction", () => {
  const workspace = makeWorkspace();
  const moodItem = workspace.timelineItems.find(
    (item) => item.lane === "mood",
  )!;
  moodItem.factIds = ["F06"];
  workspace.timelineItems
    .filter((item) => item !== moodItem && item.lane === "mood")
    .forEach((item) => {
      item.lane = "function";
    });
  workspace.temporalRelations.push({
    id: "mood-psychosis-relation",
    fromFactId: "F09",
    toFactId: "F06",
    kind: "continued_after",
  });
  expect(buildChronologyPrompts(workspace)).not.toContain(
    CHRONOLOGY_PROMPTS[2],
  );
});
