# Psychiatry Clinical Reasoning Workbench — MVP Design

**Status:** Visual direction approved July 11, 2026. This specification governs the staged MVP; the existing reviewed Diagnostic Reasoning Workbench remains unchanged until a later migration is separately approved.

## Product intent

Build a browser-local reasoning tutor for MS3 students and psychiatry residents that connects four activities around one synthetic case:

1. organize the longitudinal course;
2. translate observations into precise MSE language;
3. compare diagnostic hypotheses against supporting, contradicting, and missing evidence;
4. challenge the favored hypothesis and return an evidence-linked update to the differential.

The app teaches reasoning under uncertainty. It is not clinical decision support, an EHR, a documentation system, a diagnostic calculator, or an AI assistant. It must not accept case imports, send data over the network, recommend treatment, assign diagnostic probabilities, or invite use with real patients.

## Approved visual references

These images define layout, visual hierarchy, density, component anatomy, and interaction placement. Versioned JSON/typed content—not text invented inside a mockup—remains the clinical source of truth.

- [Timeline](assets/clinical-reasoning-workbench/timeline.png)
- [MSE Translator](assets/clinical-reasoning-workbench/mse.png)
- [Differential Matrix](assets/clinical-reasoning-workbench/differential.png)
- [Challenge Diagnosis](assets/clinical-reasoning-workbench/challenge-diagnosis.png)

## Architecture and staged integration

- Author the app as an isolated React, Vite, and TypeScript package at `apps/clinical-reasoning-workbench/`. `App` composes the shell and feature routes; feature logic lives in focused modules under `src/domain`, `src/features`, `src/components`, `src/content`, `src/seed`, and `src/test`.
- Build deterministic same-origin HTML, JavaScript, and CSS assets under ignored `/_dist/clinical-reasoning-workbench/`. The repository build copies those artifacts into the generated site; generated bundles are never canonical source files.
- Ship the MVP first as the hidden faculty-preview route `?tool=clinical-reasoning-workbench.html`. Register it as a moderate-risk `fictional-simulation-supervision` tool with pending faculty review, but do not add learner-facing topic links during the preview milestone.
- Leave `?tool=diagnostic-reasoning.html`, its four legacy `?case=` IDs, `reasoning_cases*.json`, and `cw_reason_v1` storage untouched. Cutover and legacy-case migration are a separate milestone after faculty attestation and compatibility testing.
- Use a new localStorage namespace, `cw_reason_workbench_v1`. The app has no backend, authentication, telemetry, external API, CDN dependency, or runtime font request.
- Accept optional preview query parameters `case=first_episode_001` and `level=ms3|resident`. Invalid values fall back to the seeded case and MS3 level without throwing.
- Honor the hub theme contract through `data-theme`, the existing `cw_theme` value, and parent-frame `{ type: "theme", mode: "light" | "dark" }` messages.

## Domain and content contracts

All runtime content is parsed by Zod at startup. Invalid authored content fails closed into a readable error state; it is never partially rendered.

```ts
type FactSource =
  | "direct_observation"
  | "patient_report"
  | "collateral"
  | "chart"
  | "objective_data";

type CaseFact = {
  id: string;
  kind:
    | "symptom"
    | "observation"
    | "collateral"
    | "medication"
    | "substance"
    | "medical_event"
    | "laboratory"
    | "function"
    | "stressor";
  text: string;
  source: FactSource;
  reliability: "high" | "moderate" | "low" | "unknown";
  certainty: "confirmed" | "probable" | "possible" | "unclear";
  start?: string;
  end?: string;
  temporalPrecision?: "exact" | "day" | "week" | "month" | "year" | "relative";
  tags: string[];
};

type TimelineLane =
  | "mood"
  | "psychosis"
  | "sleep_energy"
  | "anxiety_trauma"
  | "substance_use"
  | "medication"
  | "medical_neurologic"
  | "function"
  | "stressors"
  | "treatment";

type TemporalRelationKind =
  | "preceded"
  | "coincided"
  | "continued_after"
  | "occurred_only_during"
  | "improved_after"
  | "worsened_after"
  | "independent_of"
  | "unclear";

type TimelineItem = {
  id: string;
  factIds: string[];
  lane: TimelineLane;
  label: string;
  start?: string;
  end?: string;
  approximate: boolean;
  episodeId?: string;
};

type TemporalRelation = {
  id: string;
  fromFactId: string;
  toFactId: string;
  kind: TemporalRelationKind;
};

type MseTranslation = {
  id: string;
  factIds: string[];
  rawObservation: string;
  descriptiveWording: string;
  termIds: string[];
  limitationOrAlternative: string;
  discriminatingAnswer?: string;
};

type HypothesisPosition = "favored" | "plausible" | "less_likely" | "cannot_exclude";

type EvidenceGap = { id: string; text: string; relatedFactIds: string[] };

type FactLinkedText = { text: string; factIds: string[] };

type Hypothesis = {
  id: string;
  label: string;
  category: string;
  position: HypothesisPosition;
  supportingFactIds: string[];
  contradictingFactIds: string[];
  missingInformation: EvidenceGap[];
  dangerousIfMissed: boolean;
  managementImplications: FactLinkedText;
  rationale: FactLinkedText;
};

type DisconfirmationRecord = {
  favoredHypothesisId: string;
  claim: FactLinkedText;
  phenomenologyCheck: FactLinkedText;
  timeCourseChallenge: FactLinkedText;
  exclusionsReview: FactLinkedText;
  rivalHypothesisId: string;
  rivalExplainsBetter: FactLinkedText;
  rivalExplainsWorse: FactLinkedText;
  findingFavoringRival: FactLinkedText;
  findingWeakeningRival: FactLinkedText;
  confidenceDecreaser: FactLinkedText;
  unresolved: FactLinkedText;
  nextDiscriminator: FactLinkedText;
  proposedPosition: HypothesisPosition;
};

type SummaryClause = { id: string; text: string; factIds: string[] };

type WorkspaceState = {
  schemaVersion: 1;
  caseId: string;
  caseVersion: number;
  learnerLevel: "ms3" | "resident";
  facts: CaseFact[];
  timelineItems: TimelineItem[];
  temporalRelations: TemporalRelation[];
  mseTranslations: MseTranslation[];
  hypotheses: Hypothesis[];
  disconfirmation?: DisconfirmationRecord;
  summary: SummaryClause[];
  syntheticDataAcknowledged: boolean;
  updatedAt: string;
};
```

Referential-integrity invariants:

- Every `factIds` entry resolves to a `CaseFact.id` in the active case.
- Every interpretation, MSE translation, supporting/contradicting link, disconfirmation answer, rationale claim, and generated summary clause has at least one fact link.
- Missing-information entries may have no supporting facts, but must use an explicit empty `relatedFactIds` array rather than an omitted field.
- Exactly one hypothesis may be `favored`; selecting another favored hypothesis demotes the previous one to `plausible`.
- The favored hypothesis must be selected before Challenge Diagnosis can begin.
- `CaseFact` provenance and reliability describe the source of the case information, not whether a belief is objectively true.
- Academic `evidenceIds` for authored teaching rules remain distinct from fictional-case `factIds`.

## Versioned content

Store authored content outside React components:

- `src/content/cases/first-episode.json` — synthetic case, facts, initial timeline, and hypotheses;
- `src/content/mse-lexicon.json` — the 23 requested terms, definitions, observable support, limitations, alternatives, discriminating questions, and academic `evidenceIds`;
- `src/content/language-linter-rules.json` — flagged phrases, rationale, and specific alternatives;
- `src/content/cognitive-forcing-prompts.json` — bias checks and trigger conditions;
- `src/content/teaching-copy.json` — MS3 and resident scaffolding overlays.

The initial lexicon contains: Guarded, Hypervigilant, Psychomotor agitation, Psychomotor retardation, Rapid speech, Pressured speech, Speech latency, Restricted affect, Blunted affect, Flat affect, Labile affect, Circumstantial, Tangential, Flight of ideas, Loose associations, Thought blocking, Perseveration, Internal preoccupation, Delusion, Obsession, Overvalued idea, Insight, and Judgment.

The language linter flags: “manipulative,” “attention-seeking,” “poor historian,” “noncompliant,” “normal affect,” and “denies psychosis.” A result always explains why the phrase is imprecise and offers descriptive alternatives; it never silently rewrites learner text.

The seeded case is explicitly synthetic and remains `facultyReview.status: "draft"`. Its facts are limited to the supplied case: a 19-year-old college student with six months of academic decline/social withdrawal, four months of increasing cannabis use, three months of reported monitoring by neighbors, eight days of about two hours of sleep without fatigue, eight days of increased spending/grandiosity, and current agitation, rapid speech, and persecutory beliefs. Source/reliability metadata are authored as part of the fictional case and require faculty attestation before learner release.

The seed file uses these authored synthetic source assignments so implementation does not invent them:

| ID | Fact text | Source | Reliability | Certainty | Timing / default lane |
|---|---|---|---|---|---|
| F01 | Collateral describes academic decline and social withdrawal. | collateral | moderate | probable | about 6 months / function |
| F02 | Patient reports increasingly heavy cannabis use. | patient_report | moderate | confirmed | about 4 months / substance_use |
| F03 | Patient reports that neighbors are monitoring him. | patient_report | moderate | confirmed | about 3 months / psychosis |
| F04 | Patient reports sleeping about two hours nightly. | patient_report | moderate | confirmed | 8 days / sleep_energy |
| F05 | Patient reports no fatigue despite reduced sleep. | patient_report | moderate | confirmed | 8 days / sleep_energy |
| F06 | Collateral reports increased spending. | collateral | moderate | probable | 8 days / function |
| F07 | Patient makes grandiose statements. | direct_observation | high | confirmed | current / mood |
| F08 | Speech is rapid. | direct_observation | high | confirmed | current / mood |
| F09 | Patient expresses persecutory beliefs. | patient_report | moderate | confirmed | current / psychosis |
| F10 | The chart describes the current presentation as agitated. | chart | moderate | confirmed | current / mood |

“Confirmed” on a patient-report fact confirms that the statement was made; it does not validate the objective truth of the belief or history.

The initial hypotheses are exactly:

- Bipolar I disorder with psychotic features;
- Primary psychotic disorder;
- Cannabis-associated psychosis;
- Medical or neurologic process.

The first three begin as `plausible`. Medical or neurologic process begins as `cannot_exclude` with `dangerousIfMissed: true`. No favored hypothesis is preselected; selecting one is learner work.

MS3 and resident modes use the same facts and reasoning state. MS3 mode exposes more definitions, examples, and discriminating prompts. Resident mode shortens definitions and increases expectations for falsifiers, dangerous alternatives, and management implications. Level switching never changes facts, diagnoses, or saved learner work.

## Application behavior

### Shared shell

- Keep the approved header, case title, learner selector, fictional-case indicator, save status, Export summary control, four tabs, evidence rail, main canvas, and contextual teaching rail.
- Selecting a fact highlights every visible use of that fact in the active module and summary. Selecting a linked citation focuses the corresponding evidence row.
- Evidence assignment works through buttons and menus. Drag and drop may be added later, but is not part of the MVP.
- Save controls commit local edits; autosave runs after committed state changes. The status cycles through “Saving locally,” “Saved locally,” and a persistent failure state.
- On load, missing storage creates a fresh seed workspace. Invalid or unsupported stored data is not silently deleted: show a recovery screen with “Reset fictional workspace” and retain the key until the learner confirms reset. Quota/write failure keeps the current in-memory workspace usable but reports that reload persistence is unavailable.

### Timeline

- Render all ten named lanes on a horizontally scrollable time grid with sticky lane labels.
- Support adding and editing fictional facts, approximate dates/ranges, episode grouping, and the eight temporal relationships.
- Chronology prompts are deterministic checks derived from missing dates and relations, not diagnostic advice.
- The chronology summary is assembled from learner-authored timeline items and clauses, with visible Fact ID citations. It never names a diagnosis automatically.

### MSE Translator

- Preserve the sequence: Raw observation → descriptive wording → supported MSE term → limitation or alternative.
- Learners explicitly choose terms; the app never auto-labels behavior. Ambiguous terms expose one discriminating question.
- Observation and inference remain visually and semantically distinct. The seed exercise uses only supplied facts—for example, “Speech is rapid”—and asks whether the speech was interruptible before “pressured speech” can be supported.
- Linter feedback is advisory. Saving stores original learner text, any accepted revision, term IDs, limitations, and linked fact IDs.

### Differential Matrix

- Use the approved table anatomy with columns for hypothesis, position, supports, contradicts, and missing information.
- The selected row’s inspector holds rationale, dangerous-if-missed state, management implications, and “what would move this down?”
- Cognitive-forcing prompts cover premature closure, confirmation bias, diagnostic overshadowing, substance/medical causes, unsupported confidence, and single low-reliability sources.
- Do not show probabilities, scores, ranking percentages, or algorithmic diagnosis. Management implications are learner-facing evaluation/team-discussion consequences, not medication or treatment recommendations.

### Challenge Diagnosis

- Preserve the seven approved stages and require completion in order. Draft responses persist between tabs.
- The strongest rival must be a non-favored hypothesis already in the matrix.
- Required answers cover what the rival explains better/worse, findings that favor/weaken it, evidence that would reduce confidence, unresolved issues, and the next discriminator.
- “Update differential” applies the learner-selected `proposedPosition`, records the challenge, and returns focus to the changed hypothesis row. It does not decide the new position.

### Summary and export

- Generate a deterministic, concise summary from saved learner-authored clauses; do not use an LLM or invent connective clinical facts.
- Each sentence or clause displays one or more clickable Fact ID citations.
- Assemble the summary in this order: learner-authored chronology; saved MSE translation; “learner-selected favored hypothesis” with supports/contradictions/missing data; disconfirmation update and next discriminator. Omit an unfinished section rather than filling it with inferred content.
- `Copy summary` copies the same visible text when clipboard access is available. `Export summary` downloads a UTF-8 `.txt` file only. The first lines state “Synthetic educational exercise — not for clinical use,” the case ID/version, learner level, and export timestamp. Do not export a reusable case file or provide import.

## Synthetic-data and clinical guardrails

- Before the first free-text edit, require: “I will use fictional educational data only.” Keep a persistent fictional-case label afterward.
- Do not offer new-case creation, patient demographics entry, clipboard import, document upload, or network sync.
- Text fields use bounded lengths and synthetic examples, but the interface must not claim it can technically detect or prevent PHI.
- All content and summaries preserve uncertainty, provenance, and source distinctions.
- All authored clinical content remains draft until faculty review. A reviewed UI shell never implies reviewed case content.
- Never recommend medication, treatment, or autonomous diagnosis. Never add a clinical fact not present in the versioned case.

## Visual system

- **Color:** `#f6f3ee` page background, `#ffffff` work surfaces, `#c25a3c` primary terracotta, `#a84830` primary dark, `#2a6b5e` teal accent, `#1e5248` accent dark, `#2f2924` text, `#51473d` secondary text, `#665a4f` muted text, `#ddd3c6` borders, `#357160` success, `#7a6234` warning, `#a34132` danger, and `#155eef` focus. Dark mode maps to the existing Clinical Warm dark tokens.
- **Typography:** `Source Serif 4`, `Iowan Old Style`, Georgia, serif for titles; `Source Sans 3`, `Segoe UI`, system UI, sans-serif for body and controls. No runtime font download. Titles 20–28 px, section headings 18–22 px, body 14–16 px, controls 13–15 px, metadata 12–13 px.
- **Spacing:** 4, 8, 12, 16, 24, and 32 px scale. Controls are at least 36 px high on desktop and 44 px on touch layouts.
- **Containers:** open rails, tables, list rows, and canvases separated by 1 px rules. Radii are 6, 8, or 10 px. Shadows are absent except for overlay drawers; semantic pills are used only when the label carries real state.
- **Icons:** consistent 16–20 px outline icons, approximately 1.5 px stroke, `currentColor`, with text labels for primary actions. Color is never the only state indicator.
- **Motion:** 120–180 ms state transitions only for drawers, focus, and selection; disable nonessential motion under `prefers-reduced-motion`.

## Responsive behavior

- **≥1100 px:** three-column workspace: 280 px evidence rail, `minmax(520px, 1fr)` canvas, and 300 px teaching rail. Header and tabs remain fixed within the app viewport; each region manages its own overflow.
- **768–1099 px:** canvas uses the full width. Evidence and teaching rails become labeled overlay drawers with focus trapping and focus return. Tabs scroll horizontally without truncating labels.
- **<768 px:** header becomes two rows, tabs remain sticky, and both rails open as full-height sheets. Timeline and matrix retain a minimum internal width with explicit horizontal scrolling and sticky row/lane labels. Challenge comparison stacks favored then rival. MSE stages stack in order.
- No required action is hidden at any width; no desktop table is converted into unrelated cards.

## Accessibility and failure states

- Semantic tablist/tab/tabpanel relationships, table headers, form labels, field descriptions, live save/linter announcements, skip link, and logical heading order are required.
- Keyboard users can complete the entire vertical slice with Tab, Shift+Tab, Enter, Space, arrow-key tab navigation, and Escape for drawers. No step depends on hover, pointer precision, or drag and drop.
- Focus returns to the triggering control after closing a drawer and to the updated hypothesis after applying a challenge.
- Content-validation failure identifies the invalid content file without rendering unsafe partial data. Storage failure preserves in-memory work and explains that reload persistence is unavailable. Empty, no-selection, export-failure, and unsupported-clipboard states use specific recovery actions.
- Contrast targets WCAG 2.2 AA. Touch targets are at least 44×44 px on tablet/mobile.

## Required concept-copy corrections

The approved images remain the visual specification, but these mockup-only clinical strings must not be implemented because the original brief forbids invented facts and treatment recommendations:

- Timeline: omit “Lower mood, less interest” and “Marked impairment; conflict”; neither is in the supplied case.
- MSE: replace the invented pacing/scanning/interruption observation with supplied rapid-speech data and leave interruptibility as a discriminating question.
- Differential: replace “Consider mood stabilizer and/or antipsychotic” with “Clarify immediate safety, observation, collateral, and medical/substance evaluation needs.”
- Challenge: replace the invented “4–6 weeks” and toxicology instruction with “Clarify whether symptoms persist during a verified period without cannabis exposure and obtain longitudinal collateral.”

These are safety/content corrections, not visual redesigns.

## Acceptance and verification

The first vertical slice is complete only when a learner can:

1. load the synthetic case and acknowledge fictional-data-only use;
2. view and edit at least three facts;
3. place facts on the timeline and save one temporal relationship;
4. translate one observation with at least five visible term choices and one discriminating question;
5. attach facts to supporting/contradicting/missing columns for two hypotheses;
6. select one favored hypothesis;
7. complete at least one required disconfirmation response;
8. update the hypothesis position manually;
9. generate and export a short Fact-ID-linked summary;
10. reload and recover the exact local workspace.

Verification requires formatting, ESLint, TypeScript, Zod content validation, Vitest domain tests, React Testing Library component tests, and a Playwright end-to-end run of that workflow. Also verify keyboard-only completion, console-error absence, local persistence, desktop/tablet/mobile layouts, and screenshots for all four approved states. Compare each browser screenshot with its accepted concept at the concept’s native aspect, inspect both with `view_image`, and record at least five fidelity checks per state before handoff.

## Deferred work

- Migrating the four legacy MS3/resident case packs into the new fact-linked schema;
- replacing `diagnostic-reasoning.html` or migrating `cw_reason_v1` data;
- learner-facing navigation and topic deep-link cutover;
- case creation/import, backend sync, authentication, analytics, AI generation, diagnostic scoring, or treatment recommendations.
