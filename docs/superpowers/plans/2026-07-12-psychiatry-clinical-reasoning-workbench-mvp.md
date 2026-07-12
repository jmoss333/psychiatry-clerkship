# Psychiatry Clinical Reasoning Workbench MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a staged, browser-local React workbench that lets a learner organize one synthetic psychiatry case across Timeline, MSE, Differential, and Challenge Diagnosis modules, then export a Fact-ID-linked summary.

**Architecture:** An isolated React/Vite package owns the domain model, versioned content, reducer, persistence, and feature UI. Vite emits one self-contained HTML artifact into ignored `/_dist`; the existing static-site pipeline copies it to a hidden faculty-preview route while leaving the reviewed legacy workbench, deep links, and `cw_reason_v1` state unchanged.

**Tech Stack:** Node.js 20.19+, React 19.2.7, React DOM 19.2.7, TypeScript 6.0.3, Vite 8.1.4, Zod 4.4.3, Vitest 4.1.10, React Testing Library 16.3.2, jsdom 29.1.1, ESLint 10.6.0, Prettier 3.9.5, Lucide React 1.23.0, `vite-plugin-singlefile` 2.3.3, and the repository’s existing Playwright 1.46.1 smoke suite.

## Global Constraints

- Canonical design: `docs/superpowers/specs/2026-07-11-psychiatry-clinical-reasoning-workbench-design.md` and its four accepted PNG references.
- Node must satisfy Vite’s supported floor: `>=20.19.0`; pin TypeScript to `6.0.3` because TypeScript-ESLint 8.63 supports TypeScript `<6.1.0`, not TypeScript 7.
- No backend, authentication, analytics, telemetry, LLM, external API, runtime CDN, runtime font request, case import, or real-patient workflow.
- Keep `diagnostic-reasoning.html`, its four legacy case IDs, `reasoning_cases.json`, `reasoning_cases_resident.json`, and `cw_reason_v1` unchanged.
- New persistence key: `cw_reason_workbench_v1`; invalid stored data is retained until the learner explicitly resets it.
- New route: hidden preview `?tool=clinical-reasoning-workbench.html`; no learner-facing `topic_meta.json` link in this milestone.
- All authored case/MSE/linter/prompt content lives outside React components and remains faculty-review `draft` or `pending`.
- Every interpretation, hypothesis rationale/implication, challenge response, and summary clause carries valid `factIds`; academic `evidenceIds` remain a separate namespace.
- Never generate a diagnosis, probability, score, medication recommendation, treatment recommendation, or fact absent from the versioned synthetic case.
- Learner free text is local-only and bounded: fact 280 characters, description 500, rationale/implication 800, challenge response 600.
- No required behavior depends on drag and drop, hover, pointer precision, or color alone.
- Preserve the accepted Clinical Warm palette, three-rail desktop layout, table/canvas container model, explicit control typography, and responsive drawer behavior.
- Generated bundles, coverage, test results, and Playwright reports stay untracked.

## File Structure

```text
apps/clinical-reasoning-workbench/
  package.json                    # isolated dependencies and verification scripts
  package-lock.json               # reproducible npm graph
  index.html                      # RC-META, noindex, pre-paint theme, Vite entry
  vite.config.ts                  # React + Vitest + single-file output to /_dist
  tsconfig.json                   # strict browser TypeScript configuration
  eslint.config.js                # flat ESLint configuration
  .prettierignore                 # generated directories only
  src/
    main.tsx                      # createRoot entry
    App.tsx                       # composition glue and route/tab selection
    domain/
      model.ts                    # exported domain types and action union
      schemas.ts                  # Zod schemas and inferred types
      integrity.ts                # cross-reference and invariant checks
      reducer.ts                  # pure workspace transitions
      persistence.ts              # versioned localStorage read/write/reset
      query.ts                    # safe case/level preview-query parsing
      disconfirmation.ts          # ordered draft creation/final validation
      summary.ts                  # deterministic Fact-ID-linked clauses/export text
      reasoningChecks.ts          # chronology and cognitive-forcing evaluators
    content/
      cases/first-episode.json    # approved synthetic facts and hypotheses
      mse-lexicon.json            # 23 MSE terms and discriminating questions
      language-linter-rules.json  # six precise-language rules
      cognitive-forcing-prompts.json # six cognitive-forcing prompts
      teaching-copy.json          # MS3/resident scaffolding overlays
      loadContent.ts              # parse content and build the seed workspace
    state/
      WorkspaceProvider.tsx       # reducer, persistence status, selected Fact IDs
      useWorkspace.ts             # typed context hook
      SyntheticDataGateProvider.tsx # one gate shared by every free-text editor
      useSyntheticDataGate.ts     # guardFreeTextEdit callback hook
    components/
      AppShell.tsx                # header, tabs, rails, responsive drawers
      Header.tsx                  # case/level/fictional/save/export controls
      TabNav.tsx                  # accessible four-tab navigation
      EvidenceDrawer.tsx          # filter/select/edit synthetic facts
      TeachingPanel.tsx           # module-specific guidance rail
      SyntheticDataDialog.tsx     # first-free-text acknowledgement gate
      WorkspaceRecovery.tsx       # invalid-storage/content failure recovery
      ui/Button.tsx               # button variants and focus behavior
      ui/FactChip.tsx             # clickable Fact ID citation
      ui/SourceReliability.tsx     # provenance and reliability labels
      ui/LinkedText.tsx           # text plus citations
    features/
      timeline/TimelineWorkspace.tsx
      timeline/TimelineGrid.tsx
      timeline/FactEditor.tsx
      timeline/RelationshipEditor.tsx
      timeline/ChronologyPanel.tsx
      mse/MseWorkspace.tsx
      mse/TermLibrary.tsx
      mse/LanguageLinter.tsx
      differential/DifferentialWorkspace.tsx
      differential/EvidenceMenu.tsx
      differential/HypothesisInspector.tsx
      differential/ReasoningCheckPanel.tsx
      challenge/ChallengeWorkspace.tsx
      challenge/ChallengeStepper.tsx
      challenge/RivalComparison.tsx
      summary/SummaryPanel.tsx
    styles/
      tokens.css                   # Clinical Warm tokens and dark mapping
      base.css                     # reset, type, focus, form primitives
      shell.css                    # three-rail layout and responsive drawers
      features.css                 # approved timeline/table/form anatomy
    test/
      setup.ts                     # jest-dom and DOM cleanup
      fixtures.ts                  # valid/invalid workspace builders
      renderApp.tsx                # provider-aware component renderer
```

Repository integration files remain in their existing locations: `.nvmrc`, `.gitignore`, `tool_registry.json`, `13_Faculty_Resources/reviewed.json`, `13_Faculty_Resources/_automation/site_build/{build_and_check.sh,build_deploy.py,resident_section.py,site_manifest.json}`, `.github/workflows/ci.yml`, and `tests/smoke/{playwright.config.js,clinical-reasoning-workbench.spec.js}`.

---

### Task 1: Scaffold the isolated React/Vite package and single-file build

**Files:**
- Create: `.nvmrc`
- Modify: `.gitignore`
- Create: `apps/clinical-reasoning-workbench/package.json`
- Create: `apps/clinical-reasoning-workbench/package-lock.json`
- Create: `apps/clinical-reasoning-workbench/index.html`
- Create: `apps/clinical-reasoning-workbench/vite.config.ts`
- Create: `apps/clinical-reasoning-workbench/tsconfig.json`
- Create: `apps/clinical-reasoning-workbench/eslint.config.js`
- Create: `apps/clinical-reasoning-workbench/.prettierignore`
- Create: `apps/clinical-reasoning-workbench/src/main.tsx`
- Create: `apps/clinical-reasoning-workbench/src/App.tsx`
- Create: `apps/clinical-reasoning-workbench/src/App.test.tsx`
- Create: `apps/clinical-reasoning-workbench/src/test/setup.ts`

**Interfaces:**
- Consumes: approved product title, route name, RC-META, and `cw_theme` contract from the design spec.
- Produces: `npm run dev`, `npm run verify`, and `npm run build`; build output `/_dist/clinical-reasoning-workbench/index.html`; exported `App` component.

- [ ] **Step 1: Create the package and toolchain configuration**

Use this exact `package.json`:

```json
{
  "name": "@psychiatry-clerkship/clinical-reasoning-workbench",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20.19.0" },
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "npm run typecheck && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "lucide-react": "1.23.0",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@testing-library/dom": "10.4.1",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.0",
    "@vitejs/plugin-react": "6.0.3",
    "eslint": "10.6.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.3",
    "globals": "17.7.0",
    "jsdom": "29.1.1",
    "prettier": "3.9.5",
    "typescript": "6.0.3",
    "typescript-eslint": "8.63.0",
    "vite": "8.1.4",
    "vite-plugin-singlefile": "2.3.3",
    "vitest": "4.1.10"
  }
}
```

Set `.nvmrc` to `20.19.0`. Add these app-scoped ignores:

```gitignore
/apps/clinical-reasoning-workbench/coverage/
/apps/clinical-reasoning-workbench/playwright-report/
/apps/clinical-reasoning-workbench/test-results/
```

Use `defineConfig` from `vitest/config`, React, and `viteSingleFile({ removeViteModuleLoader: true })`; set `base: "./"`, `build.outDir: "../../_dist/clinical-reasoning-workbench"`, `emptyOutDir: true`, `sourcemap: false`, and Vitest `environment: "jsdom"`, `globals: true`, `setupFiles: "./src/test/setup.ts"`, `css: true`.

Use strict TypeScript with `target: "ES2022"`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `resolveJsonModule: true`, `noUncheckedIndexedAccess: true`, and include `src` plus `vite.config.ts`.

The HTML head must contain the exact metadata and pre-paint script:

```html
<!-- [RC-META] tool="Clinical Reasoning Workbench" version="0.1" built="2026-07-12" category="clinical-reasoning" audience="ms3,resident" settings="synthetic,self-study" time="15-25min" summary="Synthetic educational reasoning workspace. Local-only state under cw_reason_workbench_v1; no PHI, diagnosis automation, treatment recommendation, or network transmission." -->
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex,nofollow" />
<title>Clinical Reasoning Workbench</title>
<script>
  try {
    const theme = localStorage.getItem('cw_theme');
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  } catch (_) {
    document.documentElement.dataset.theme = 'light';
  }
</script>
```

- [ ] **Step 2: Install exactly the locked dependencies**

Run:

```bash
npm install --prefix apps/clinical-reasoning-workbench
```

Expected: `package-lock.json` is created with lockfile version 3 and `npm ls --prefix apps/clinical-reasoning-workbench --depth=0` reports the versions above without peer-dependency errors.

- [ ] **Step 3: Write the failing shell test**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the product boundary before any case workflow', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Clinical Reasoning Workbench' })).toBeVisible();
  expect(screen.getByText('Fictional educational case')).toBeVisible();
});
```

`src/test/setup.ts` imports `@testing-library/jest-dom/vitest`.

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/App.test.tsx
```

Expected: FAIL because `App` does not yet export a rendered heading.

- [ ] **Step 5: Implement the minimal shell**

```tsx
export function App() {
  return (
    <main>
      <h1>Clinical Reasoning Workbench</h1>
      <p>Fictional educational case</p>
    </main>
  );
}
```

`main.tsx` calls `createRoot(document.getElementById('root')!).render(<App />)`.

- [ ] **Step 6: Verify package checks and single-file output**

Run:

```bash
npm run format --prefix apps/clinical-reasoning-workbench
npm run verify --prefix apps/clinical-reasoning-workbench
test -s _dist/clinical-reasoning-workbench/index.html
test "$(find _dist/clinical-reasoning-workbench -type f | wc -l | tr -d ' ')" = "1"
```

Expected: all checks pass and the output directory contains only `index.html`.

- [ ] **Step 7: Commit**

```bash
git add .nvmrc .gitignore apps/clinical-reasoning-workbench
git commit -m "build: scaffold clinical reasoning workbench"
```

---

### Task 2: Add strict domain schemas, the synthetic case, and integrity checks

**Files:**
- Create: `apps/clinical-reasoning-workbench/src/domain/model.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/schemas.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/integrity.ts`
- Create: `apps/clinical-reasoning-workbench/src/content/cases/first-episode.json`
- Create: `apps/clinical-reasoning-workbench/src/content/loadContent.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/schemas.test.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/integrity.test.ts`
- Create: `apps/clinical-reasoning-workbench/src/test/fixtures.ts`

**Interfaces:**
- Consumes: the approved TypeScript model and ten seed facts from the design spec.
- Produces: `CaseDefinition`, `WorkspaceState`, `WorkspaceAction`, `parseCaseDefinition(input)`, `createSeedWorkspace(caseDefinition, level)`, and `assertWorkspaceIntegrity(workspace)`.

`src/test/fixtures.ts` starts with this canonical builder; later tasks extend the same file:

```ts
export function makeWorkspace(level: 'ms3' | 'resident' = 'ms3'): WorkspaceState {
  return createSeedWorkspace(parseCaseDefinition(rawCase), level);
}
```

- [ ] **Step 1: Write failing schema and referential-integrity tests**

```ts
import rawCase from '../content/cases/first-episode.json';
import { parseCaseDefinition } from './schemas';
import { assertWorkspaceIntegrity } from './integrity';
import { createSeedWorkspace } from '../content/loadContent';

test('parses the approved seed and preserves ten stable Fact IDs', () => {
  const parsed = parseCaseDefinition(rawCase);
  expect(parsed.facts.map((fact) => fact.id)).toEqual([
    'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10',
  ]);
});

test('rejects a dangling case-fact link', () => {
  const workspace = createSeedWorkspace(parseCaseDefinition(rawCase), 'ms3');
  workspace.hypotheses[0]!.supportingFactIds = ['F99'];
  expect(() => assertWorkspaceIntegrity(workspace)).toThrow(/F99/);
});

test('rejects dangling relations, duplicate IDs, and support/contradiction overlap', () => {
  const dangling = makeWorkspace();
  dangling.temporalRelations.push({ id: 'relation-1', fromFactId: 'F02', toFactId: 'F99', kind: 'preceded' });
  expect(() => assertWorkspaceIntegrity(dangling)).toThrow(/F99/);

  const duplicate = makeWorkspace();
  duplicate.timelineItems[1]!.id = duplicate.timelineItems[0]!.id;
  expect(() => assertWorkspaceIntegrity(duplicate)).toThrow(/duplicate ID/);

  const overlap = makeWorkspace();
  overlap.hypotheses[0]!.supportingFactIds = ['F04'];
  overlap.hypotheses[0]!.contradictingFactIds = ['F04'];
  expect(() => assertWorkspaceIntegrity(overlap)).toThrow(/both support and contradiction/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/schemas.test.ts src/domain/integrity.test.ts
```

Expected: FAIL because the domain modules and seed case do not exist.

- [ ] **Step 3: Implement the exact public model and Zod schemas**

Copy the approved `CaseFact`, `TimelineLane`, `TemporalRelationKind`, `TimelineItem`, `TemporalRelation`, `MseTranslation`, `FactLinkedText`, `Hypothesis`, `DisconfirmationRecord`, `SummaryClause`, and `WorkspaceState` definitions from the design specification into `model.ts`. Add three implementation-state fields required to preserve learner authorship/provenance and deterministic ordering without changing visible clinical content:

```ts
// Add to TimelineItem. Seed items start false; any learner save sets true.
learnerEdited: boolean;

// Add to TimelineItem. Orders time-grid columns without mixing relative/absolute units.
sortOrder: number;

// Add to MseTranslation. descriptiveWording always retains the learner's original text.
acceptedRevision?: string;
```

Represent ordered challenge work with separate draft and applied types so stages 1–4 can persist before a rival/position exists:

```ts
export type DisconfirmationDraft = Omit<
  DisconfirmationRecord,
  'rivalHypothesisId' | 'proposedPosition'
> & {
  rivalHypothesisId?: string;
  proposedPosition?: HypothesisPosition;
};

export type AppliedDisconfirmationRecord = DisconfirmationRecord & {
  appliedAt: string;
};

// Add to WorkspaceState; replace its original disconfirmation property with these two.
disconfirmationDraft?: DisconfirmationDraft;
disconfirmation?: AppliedDisconfirmationRecord;
```

Then add this action union:

```ts
export type FacultyReview = {
  status: 'draft' | 'pending' | 'reviewed';
  reviewedAt?: string;
  reviewedBy?: string;
};

export type CaseDefinition = {
  id: string;
  version: number;
  fictional: true;
  learnerTitle: string;
  facultyReview: FacultyReview;
  facts: CaseFact[];
  timelineItems: TimelineItem[];
  hypotheses: Hypothesis[];
};

export type WorkspaceAction =
  | { type: 'acknowledgeSyntheticData' }
  | { type: 'setLearnerLevel'; level: 'ms3' | 'resident' }
  | { type: 'upsertFact'; fact: CaseFact }
  | { type: 'upsertTimelineItem'; item: TimelineItem }
  | { type: 'upsertTemporalRelation'; relation: TemporalRelation }
  | { type: 'saveMseTranslation'; translation: MseTranslation }
  | { type: 'upsertHypothesis'; hypothesis: Hypothesis }
  | { type: 'selectFavored'; hypothesisId: string }
  | { type: 'saveDisconfirmationDraft'; draft: DisconfirmationDraft }
  | { type: 'applyChallenge'; record: DisconfirmationRecord }
  | { type: 'setSummary'; clauses: SummaryClause[] }
  | { type: 'resetWorkspace'; workspace: WorkspaceState };
```

Zod strings enforce the global maximum lengths. `CaseDefinitionSchema` requires `fictional: z.literal(true)`, non-empty stable IDs, unique Fact/Timeline/Hypothesis IDs, and `facultyReview.status` from the exact union above. `DisconfirmationDraftSchema` allows absent rival/position and blank future-stage `FactLinkedText`; `AppliedDisconfirmationRecordSchema` requires every response text/link, rival, position, and ISO `appliedAt`. `WorkspaceStateSchema` requires `schemaVersion: z.literal(1)`, zero or one favored hypothesis, unique Fact/Timeline/Relation/MSE-translation/Hypothesis/Summary IDs, and the complete arrays from the approved type plus the internal fields above. `parseCaseDefinition(input: unknown): CaseDefinition` calls `.parse` and returns `structuredClone(parsed)`.

- [ ] **Step 4: Create the exact seed content**

`first-episode.json` contains `id: "first_episode_001"`, `version: 1`, `fictional: true`, learner title `Synthetic Case 01 · First episode`, `facultyReview.status: "draft"`, and this exact `facts` array:

```json
[
  {"id":"F01","kind":"function","text":"Collateral describes academic decline and social withdrawal.","source":"collateral","reliability":"moderate","certainty":"probable","start":"about 6 months before current presentation","temporalPrecision":"relative","tags":[]},
  {"id":"F02","kind":"substance","text":"Patient reports increasingly heavy cannabis use.","source":"patient_report","reliability":"moderate","certainty":"confirmed","start":"about 4 months before current presentation","temporalPrecision":"relative","tags":[]},
  {"id":"F03","kind":"symptom","text":"Patient reports that neighbors are monitoring him.","source":"patient_report","reliability":"moderate","certainty":"confirmed","start":"about 3 months before current presentation","temporalPrecision":"relative","tags":[]},
  {"id":"F04","kind":"symptom","text":"Patient reports sleeping about two hours nightly.","source":"patient_report","reliability":"moderate","certainty":"confirmed","start":"8 days before current presentation","temporalPrecision":"day","tags":[]},
  {"id":"F05","kind":"symptom","text":"Patient reports no fatigue despite reduced sleep.","source":"patient_report","reliability":"moderate","certainty":"confirmed","start":"8 days before current presentation","temporalPrecision":"day","tags":[]},
  {"id":"F06","kind":"function","text":"Collateral reports increased spending.","source":"collateral","reliability":"moderate","certainty":"probable","start":"8 days before current presentation","temporalPrecision":"day","tags":[]},
  {"id":"F07","kind":"observation","text":"Patient makes grandiose statements.","source":"direct_observation","reliability":"high","certainty":"confirmed","start":"current presentation","temporalPrecision":"exact","tags":[]},
  {"id":"F08","kind":"observation","text":"Speech is rapid.","source":"direct_observation","reliability":"high","certainty":"confirmed","start":"current presentation","temporalPrecision":"exact","tags":[]},
  {"id":"F09","kind":"symptom","text":"Patient expresses persecutory beliefs.","source":"patient_report","reliability":"moderate","certainty":"confirmed","start":"current presentation","temporalPrecision":"exact","tags":[]},
  {"id":"F10","kind":"observation","text":"The chart describes the current presentation as agitated.","source":"chart","reliability":"moderate","certainty":"confirmed","start":"current presentation","temporalPrecision":"exact","tags":[]}
]
```

Use these exact timeline lanes in F01–F10 order: `function`, `substance_use`, `psychosis`, `sleep_energy`, `sleep_energy`, `function`, `mood`, `mood`, `psychosis`, `mood`. Timeline IDs are `timeline-F01` through `timeline-F10`; labels equal their source fact text; `factIds` contains that one Fact ID; F01–F03 are `approximate: true`; F04–F10 are `approximate: false`; every seed item has `learnerEdited: false` and no episode ID. Use `sortOrder` values `[0, 1, 2, 3, 3, 3, 4, 4, 4, 4]`, corresponding to the visible columns `~6 months`, `~4 months`, `~3 months`, `8 days`, and `Current`.

Use these hypothesis seeds:

```json
[
  {
    "id": "bipolar_psychotic_features",
    "label": "Bipolar I disorder with psychotic features",
    "category": "mood",
    "position": "plausible",
    "supportingFactIds": [],
    "contradictingFactIds": [],
    "missingInformation": [],
    "dangerousIfMissed": false,
    "managementImplications": { "text": "", "factIds": [] },
    "rationale": { "text": "", "factIds": [] }
  },
  {
    "id": "primary_psychotic_disorder",
    "label": "Primary psychotic disorder",
    "category": "psychotic",
    "position": "plausible",
    "supportingFactIds": [],
    "contradictingFactIds": [],
    "missingInformation": [],
    "dangerousIfMissed": false,
    "managementImplications": { "text": "", "factIds": [] },
    "rationale": { "text": "", "factIds": [] }
  },
  {
    "id": "cannabis_associated_psychosis",
    "label": "Cannabis-associated psychosis",
    "category": "substance",
    "position": "plausible",
    "supportingFactIds": [],
    "contradictingFactIds": [],
    "missingInformation": [],
    "dangerousIfMissed": false,
    "managementImplications": { "text": "", "factIds": [] },
    "rationale": { "text": "", "factIds": [] }
  },
  {
    "id": "medical_neurologic_process",
    "label": "Medical or neurologic process",
    "category": "medical",
    "position": "cannot_exclude",
    "supportingFactIds": [],
    "contradictingFactIds": [],
    "missingInformation": [],
    "dangerousIfMissed": true,
    "managementImplications": { "text": "", "factIds": [] },
    "rationale": { "text": "", "factIds": [] }
  }
]
```

Seed one `TimelineItem` for each fact in its approved default lane with `learnerEdited: false`; mark month-relative dates approximate and eight-day/current dates exact. Do not seed temporal relationships, MSE translations, a favored hypothesis, a challenge, or summary conclusions.

- [ ] **Step 5: Implement integrity checking and seed construction**

```ts
export function assertWorkspaceIntegrity(workspace: WorkspaceState): WorkspaceState {
  const requireUnique = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) throw new Error(`${label} contains duplicate ID ${value}`);
      seen.add(value);
    }
  };

  requireUnique('Facts', workspace.facts.map((item) => item.id));
  requireUnique('Timeline items', workspace.timelineItems.map((item) => item.id));
  requireUnique('Temporal relations', workspace.temporalRelations.map((item) => item.id));
  requireUnique('MSE translations', workspace.mseTranslations.map((item) => item.id));
  requireUnique('Hypotheses', workspace.hypotheses.map((item) => item.id));
  requireUnique('Summary clauses', workspace.summary.map((item) => item.id));
  const ids = new Set(workspace.facts.map((fact) => fact.id));
  const requireFacts = (label: string, factIds: string[], allowEmpty = false) => {
    requireUnique(label, factIds);
    if (!allowEmpty && factIds.length === 0) throw new Error(`${label} requires a fact link`);
    for (const id of factIds) if (!ids.has(id)) throw new Error(`${label} references unknown fact ${id}`);
  };
  const requireLinkedText = (label: string, value: FactLinkedText) => {
    requireFacts(label, value.factIds, value.text.trim().length === 0);
  };
  const requireCompleteLinkedText = (label: string, value: FactLinkedText) => {
    if (!value.text.trim()) throw new Error(`${label} requires text`);
    requireFacts(label, value.factIds);
  };
  const challengeResponses = (record: DisconfirmationDraft | DisconfirmationRecord) => [
    ['claim', record.claim],
    ['phenomenology check', record.phenomenologyCheck],
    ['time-course challenge', record.timeCourseChallenge],
    ['exclusions review', record.exclusionsReview],
    ['rival explains better', record.rivalExplainsBetter],
    ['rival explains worse', record.rivalExplainsWorse],
    ['finding favoring rival', record.findingFavoringRival],
    ['finding weakening rival', record.findingWeakeningRival],
    ['confidence decreaser', record.confidenceDecreaser],
    ['unresolved issue', record.unresolved],
    ['next discriminator', record.nextDiscriminator],
  ] as const;

  for (const item of workspace.timelineItems) requireFacts(`Timeline item ${item.id}`, item.factIds);
  for (const relation of workspace.temporalRelations) {
    requireFacts(`Temporal relation ${relation.id} from`, [relation.fromFactId]);
    requireFacts(`Temporal relation ${relation.id} to`, [relation.toFactId]);
    if (relation.fromFactId === relation.toFactId) throw new Error(`Temporal relation ${relation.id} self-links`);
  }
  for (const item of workspace.mseTranslations) requireFacts(`MSE translation ${item.id}`, item.factIds);
  for (const hypothesis of workspace.hypotheses) {
    requireFacts(`${hypothesis.label} supports`, hypothesis.supportingFactIds, true);
    requireFacts(`${hypothesis.label} contradicts`, hypothesis.contradictingFactIds, true);
    const overlap = hypothesis.supportingFactIds.find((id) => hypothesis.contradictingFactIds.includes(id));
    if (overlap) throw new Error(`${hypothesis.label} uses ${overlap} as both support and contradiction`);
    requireUnique(`${hypothesis.label} missing information`, hypothesis.missingInformation.map((gap) => gap.id));
    for (const gap of hypothesis.missingInformation) {
      requireFacts(`${hypothesis.label} missing item ${gap.id}`, gap.relatedFactIds, true);
    }
    requireLinkedText(`${hypothesis.label} rationale`, hypothesis.rationale);
    requireLinkedText(`${hypothesis.label} management implications`, hypothesis.managementImplications);
  }
  if (workspace.disconfirmationDraft) {
    const draft = workspace.disconfirmationDraft;
    const favored = workspace.hypotheses.find((item) => item.id === draft.favoredHypothesisId);
    if (!favored || favored.position !== 'favored') {
      throw new Error(`Draft challenge hypothesis ${draft.favoredHypothesisId} is not favored`);
    }
    if (draft.rivalHypothesisId) {
      const rival = workspace.hypotheses.find((item) => item.id === draft.rivalHypothesisId);
      if (!rival || rival.id === favored.id || rival.position === 'favored') {
        throw new Error(`Invalid draft rival ${draft.rivalHypothesisId}`);
      }
    }
    for (const [label, value] of challengeResponses(draft)) {
      requireLinkedText(`Challenge draft ${label}`, value);
    }
  }
  if (workspace.disconfirmation) {
    const record = workspace.disconfirmation;
    const subject = workspace.hypotheses.find((item) => item.id === record.favoredHypothesisId);
    const rival = workspace.hypotheses.find((item) => item.id === record.rivalHypothesisId);
    if (!subject) throw new Error(`Unknown challenged hypothesis ${record.favoredHypothesisId}`);
    if (!rival || rival.id === subject.id) throw new Error(`Invalid applied rival ${record.rivalHypothesisId}`);
    for (const [label, value] of challengeResponses(record)) {
      requireCompleteLinkedText(`Applied challenge ${label}`, value);
    }
  }
  for (const clause of workspace.summary) requireFacts(`Summary clause ${clause.id}`, clause.factIds);
  const favored = workspace.hypotheses.filter((item) => item.position === 'favored');
  if (favored.length > 1) throw new Error('Only one hypothesis may be favored');
  return workspace;
}
```

For `FactLinkedText`, require a non-empty link only when `text.trim()` is non-empty. A draft must point to the current favorite; its rival may be absent until stage 5 but must be non-favored when present. An applied record is complete historical data and may remain after later learner position changes. `createSeedWorkspace` deep-clones case content, sets `schemaVersion: 1`, the requested learner level, `syntheticDataAcknowledged: false`, no draft/applied challenge, empty summary, and an ISO timestamp.

- [ ] **Step 6: Run and pass the focused tests**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/schemas.test.ts src/domain/integrity.test.ts
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; fixtures with `F99`, a dangling temporal relation, a duplicate ID, an overlapping support/contradiction, or an invalid draft rival all fail with errors naming the violated value.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/domain apps/clinical-reasoning-workbench/src/content/cases apps/clinical-reasoning-workbench/src/content/loadContent.ts apps/clinical-reasoning-workbench/src/test/fixtures.ts
git commit -m "feat: add fact-linked reasoning domain"
```

---

### Task 3: Add the reducer, versioned persistence, and workspace context

**Files:**
- Create: `apps/clinical-reasoning-workbench/src/domain/reducer.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/reducer.test.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/persistence.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/persistence.test.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/query.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/query.test.ts`
- Create: `apps/clinical-reasoning-workbench/src/state/WorkspaceProvider.tsx`
- Create: `apps/clinical-reasoning-workbench/src/state/WorkspaceProvider.test.tsx`
- Create: `apps/clinical-reasoning-workbench/src/state/useWorkspace.ts`
- Modify: `apps/clinical-reasoning-workbench/src/test/fixtures.ts`
- Create: `apps/clinical-reasoning-workbench/src/test/renderApp.tsx`

**Interfaces:**
- Consumes: `WorkspaceState`, `WorkspaceAction`, `WorkspaceStateSchema`, `assertWorkspaceIntegrity`, and `createSeedWorkspace`.
- Produces: `workspaceReducer`, `loadWorkspace(storage)`, `saveWorkspace(storage, workspace)`, `resetStoredWorkspace(storage)`, `parsePreviewQuery(search)`, `WorkspaceProvider`, and `useWorkspace()`.

- [ ] **Step 1: Write reducer and persistence failure tests**

First add deterministic storage fixtures:

```ts
export function makeMemoryStorage(seed: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

export function makeThrowingStorage(failure: {
  get?: Error;
  set?: Error;
  remove?: Error;
}): Storage {
  const storage = makeMemoryStorage();
  return {
    ...storage,
    getItem: (key) => { if (failure.get) throw failure.get; return storage.getItem(key); },
    setItem: (key, value) => { if (failure.set) throw failure.set; storage.setItem(key, value); },
    removeItem: (key) => { if (failure.remove) throw failure.remove; storage.removeItem(key); },
  };
}
```

```ts
test('selecting a favored hypothesis demotes the prior favorite', () => {
  const seed = makeWorkspace();
  const first = workspaceReducer(seed, { type: 'selectFavored', hypothesisId: 'bipolar_psychotic_features' });
  const second = workspaceReducer(first, { type: 'selectFavored', hypothesisId: 'primary_psychotic_disorder' });
  expect(second.hypotheses.find((h) => h.id === 'bipolar_psychotic_features')?.position).toBe('plausible');
  expect(second.hypotheses.find((h) => h.id === 'primary_psychotic_disorder')?.position).toBe('favored');
});

test('invalid persisted data is retained until explicit reset', () => {
  localStorage.setItem('cw_reason_workbench_v1', '{"schemaVersion":99}');
  const result = loadWorkspace(localStorage);
  expect(result.status).toBe('invalid');
  expect(localStorage.getItem('cw_reason_workbench_v1')).toBe('{"schemaVersion":99}');
});

test('storage read failure returns unavailable instead of blocking the in-memory app', () => {
  const storage = makeThrowingStorage({ get: new DOMException('Blocked', 'SecurityError') });
  expect(loadWorkspace(storage)).toEqual({ status: 'unavailable', message: 'Blocked' });
});

test('invalid preview values fall back without throwing', () => {
  expect(parsePreviewQuery('?case=unknown&level=attending')).toEqual({
    caseId: 'first_episode_001',
    levelOverride: 'ms3',
  });
  expect(parsePreviewQuery('?case=first_episode_001&level=resident')).toEqual({
    caseId: 'first_episode_001',
    levelOverride: 'resident',
  });
});
```

In `WorkspaceProvider.test.tsx` add:

```tsx
function ProviderProbe() {
  const { workspace, dispatch, saveStatus, persistenceError } = useWorkspace();
  return (
    <>
      <output aria-label="Learner level">{workspace.learnerLevel}</output>
      <output aria-label="Save status">{saveStatus}</output>
      {persistenceError ? <div role="alert">{persistenceError}</div> : null}
      <button type="button" onClick={() => dispatch({ type: 'setLearnerLevel', level: 'resident' })}>
        Set resident
      </button>
    </>
  );
}

test('keeps in-memory work and reports a storage write failure', async () => {
  const user = userEvent.setup();
  renderApp(<ProviderProbe />, { storage: makeThrowingStorage({ set: new Error('Quota exceeded') }) });
  await user.click(screen.getByRole('button', { name: 'Set resident' }));
  expect(screen.getByLabelText('Learner level')).toHaveTextContent('resident');
  expect(await screen.findByRole('alert')).toHaveTextContent('work will be lost on reload');
  expect(screen.getByLabelText('Save status')).toHaveTextContent('error');
});

test('renders saving before saved', async () => {
  const user = userEvent.setup();
  renderApp(<ProviderProbe />, { storage: makeMemoryStorage() });
  await user.click(screen.getByRole('button', { name: 'Set resident' }));
  expect(screen.getByLabelText('Save status')).toHaveTextContent('saving');
  await waitFor(() => expect(screen.getByLabelText('Save status')).toHaveTextContent('saved'));
});

test('storage unavailability keeps a usable in-memory workspace', () => {
  renderApp(<ProviderProbe />, {
    storage: makeThrowingStorage({ get: new DOMException('Blocked', 'SecurityError') }),
  });
  expect(screen.getByLabelText('Learner level')).toHaveTextContent('ms3');
  expect(screen.getByRole('alert')).toHaveTextContent('work will be lost on reload');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/reducer.test.ts src/domain/persistence.test.ts src/domain/query.test.ts
```

Expected: FAIL because reducer and persistence functions are missing.

- [ ] **Step 3: Implement pure reducer transitions**

Each action returns a new object, stamps `updatedAt`, and runs `assertWorkspaceIntegrity` before returning. Use this complete transition implementation:

```ts
const upsertById = <T extends { id: string }>(items: T[], next: T): T[] => {
  const found = items.some((item) => item.id === next.id);
  return found ? items.map((item) => (item.id === next.id ? next : item)) : [...items, next];
};

const requireHypothesis = (state: WorkspaceState, id: string): Hypothesis => {
  const item = state.hypotheses.find((hypothesis) => hypothesis.id === id);
  if (!item) throw new Error(`Unknown hypothesis ${id}`);
  return item;
};

const challengeResponses = (record: DisconfirmationRecord): FactLinkedText[] => [
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

function reduceWithoutTimestamp(state: WorkspaceState, action: WorkspaceAction, now: string): WorkspaceState {
  switch (action.type) {
    case 'acknowledgeSyntheticData':
      return { ...state, syntheticDataAcknowledged: true };
    case 'setLearnerLevel':
      return { ...state, learnerLevel: action.level };
    case 'upsertFact':
      return { ...state, facts: upsertById(state.facts, action.fact) };
    case 'upsertTimelineItem':
      return {
        ...state,
        timelineItems: upsertById(state.timelineItems, { ...action.item, learnerEdited: true }),
      };
    case 'upsertTemporalRelation':
      return { ...state, temporalRelations: upsertById(state.temporalRelations, action.relation) };
    case 'saveMseTranslation':
      return { ...state, mseTranslations: upsertById(state.mseTranslations, action.translation) };
    case 'upsertHypothesis':
      return { ...state, hypotheses: upsertById(state.hypotheses, action.hypothesis) };
    case 'selectFavored': {
      requireHypothesis(state, action.hypothesisId);
      const draftBelongsElsewhere =
        state.disconfirmationDraft &&
        state.disconfirmationDraft.favoredHypothesisId !== action.hypothesisId;
      return {
        ...state,
        hypotheses: state.hypotheses.map((item) => ({
          ...item,
          position: item.id === action.hypothesisId
            ? 'favored'
            : item.position === 'favored'
              ? 'plausible'
              : item.position,
        })),
        disconfirmationDraft: draftBelongsElsewhere ? undefined : state.disconfirmationDraft,
      };
    }
    case 'saveDisconfirmationDraft': {
      const favored = requireHypothesis(state, action.draft.favoredHypothesisId);
      if (favored.position !== 'favored') throw new Error(`${favored.id} is not favored`);
      if (action.draft.rivalHypothesisId) {
        const rival = requireHypothesis(state, action.draft.rivalHypothesisId);
        if (rival.id === favored.id || rival.position === 'favored') {
          throw new Error(`${rival.id} is not a valid rival`);
        }
      }
      return { ...state, disconfirmationDraft: action.draft };
    }
    case 'applyChallenge': {
      const record = action.record;
      const favored = requireHypothesis(state, record.favoredHypothesisId);
      const rival = requireHypothesis(state, record.rivalHypothesisId);
      if (favored.position !== 'favored') throw new Error(`${favored.id} is not favored`);
      if (rival.id === favored.id || rival.position === 'favored') throw new Error(`${rival.id} is not a valid rival`);
      if (challengeResponses(record).some((value) => !value.text.trim() || value.factIds.length === 0)) {
        throw new Error('Complete every challenge response with a Fact link before updating');
      }
      return {
        ...state,
        hypotheses: state.hypotheses.map((item) => ({
          ...item,
          position: item.id === record.favoredHypothesisId
            ? record.proposedPosition
            : record.proposedPosition === 'favored' && item.position === 'favored'
              ? 'plausible'
              : item.position,
        })),
        disconfirmationDraft: undefined,
        disconfirmation: { ...record, appliedAt: now },
      };
    }
    case 'setSummary':
      return { ...state, summary: action.clauses };
    case 'resetWorkspace':
      return assertWorkspaceIntegrity(structuredClone(action.workspace));
  }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  const now = new Date().toISOString();
  const next = reduceWithoutTimestamp(state, action, now);
  const invalidatesSummary = action.type !== 'setSummary' && action.type !== 'resetWorkspace';
  return assertWorkspaceIntegrity({
    ...next,
    summary: invalidatesSummary ? [] : next.summary,
    updatedAt: now,
  });
}
```

`selectFavored` rejects an unknown ID and demotes only the previous favorite. A new favorite clears only a draft for another hypothesis; applied history remains. `saveDisconfirmationDraft` permits absent stage-5 rival/stage-7 position while validating every completed response link. `applyChallenge` accepts only the final complete record and changes only its learner-named hypothesis, except for the single-favorite demotion rule. Every learner edit invalidates stored derived summary clauses; opening the Summary panel rebuilds them in Task 11. `resetWorkspace` returns the supplied validated seed.

- [ ] **Step 4: Implement fail-closed persistence**

```ts
export const WORKSPACE_KEY = 'cw_reason_workbench_v1';
export type LoadWorkspaceResult =
  | { status: 'missing' }
  | { status: 'loaded'; workspace: WorkspaceState }
  | { status: 'unavailable'; message: string }
  | { status: 'invalid'; message: string };

export function loadWorkspace(storage: Storage): LoadWorkspaceResult {
  let raw: string | null;
  try {
    raw = storage.getItem(WORKSPACE_KEY);
  } catch (error) {
    return { status: 'unavailable', message: error instanceof Error ? error.message : 'Local storage is unavailable' };
  }
  if (raw === null) return { status: 'missing' };
  try {
    return { status: 'loaded', workspace: assertWorkspaceIntegrity(WorkspaceStateSchema.parse(JSON.parse(raw))) };
  } catch (error) {
    return { status: 'invalid', message: error instanceof Error ? error.message : 'Stored workspace is invalid' };
  }
}

export function saveWorkspace(storage: Storage, workspace: WorkspaceState): void {
  storage.setItem(WORKSPACE_KEY, JSON.stringify(assertWorkspaceIntegrity(workspace)));
}

export function resetStoredWorkspace(storage: Storage): void {
  storage.removeItem(WORKSPACE_KEY);
}
```

Add safe query parsing in `query.ts`:

```ts
export type PreviewSelection = {
  caseId: 'first_episode_001';
  levelOverride?: 'ms3' | 'resident';
};

export function parsePreviewQuery(search: string): PreviewSelection {
  const params = new URLSearchParams(search);
  const rawLevel = params.get('level');
  const levelOverride = rawLevel === null
    ? undefined
    : rawLevel === 'resident'
      ? 'resident'
      : 'ms3';
  return { caseId: 'first_episode_001', ...(levelOverride ? { levelOverride } : {}) };
}
```

The only supported case is `first_episode_001`; missing or invalid `case` therefore resolves to it. Missing `level` preserves a valid loaded level and seeds MS3 when storage is absent; valid `level=ms3|resident` overrides the loaded/seed level; any other supplied level resolves to MS3. Parsing never throws.

- [ ] **Step 5: Implement the provider contract**

Use these exact provider/testing interfaces:

```ts
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type WorkspaceContextValue = {
  workspace: WorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
  selectedFactIds: string[];
  selectFacts: (factIds: string[]) => void;
  evidencePanelOpen: boolean;
  evidenceFocusRequest: { factId: string; requestId: number } | null;
  openEvidencePanel: () => void;
  closeEvidencePanel: () => void;
  revealFact: (factId: string) => void;
  saveStatus: SaveStatus;
  loadError: string | null;
  persistenceError: string | null;
  resetInvalidWorkspace: () => void;
};

export type WorkspaceProviderProps = PropsWithChildren<{
  initialWorkspace?: WorkspaceState;
  storage?: Storage;
  previewSelection?: PreviewSelection;
}>;

export type RenderAppOptions = {
  workspace?: WorkspaceState;
  storage?: Storage;
  previewSelection?: PreviewSelection;
};

export function renderApp(ui: ReactElement, options: RenderAppOptions = {}): RenderResult;
```

`WorkspaceProvider` resolves `previewSelection ?? parsePreviewQuery(window.location.search)` and loads once from `storage ?? window.localStorage`; if `initialWorkspace` is supplied, it validates and uses that fixture instead. With neither a stored nor initial workspace, it calls `createSeedWorkspace(parseCaseDefinition(rawCase), selection.levelOverride ?? 'ms3')`. A valid override replaces only `learnerLevel`, preserving the loaded work. A readable stored workspace whose `caseId` or `caseVersion` differs from the loaded `CaseDefinition` is an invalid-load recovery state. A storage `unavailable` result instead creates a usable fresh in-memory seed with `loadError: null`, `saveStatus: 'error'`, and `persistenceError: 'Local storage is unavailable; work will be lost on reload.'`; it never renders reset recovery.

`selectedFactIds` and the evidence-panel controller are non-persisted React UI state owned by the provider. `selectFacts` replaces selection after deduplicating IDs that exist in `workspace.facts`; it is not a `WorkspaceAction`. `revealFact(factId)` validates the ID, selects it, sets `evidencePanelOpen: true`, and replaces `evidenceFocusRequest` with `{ factId, requestId: prior + 1 }` so repeated clicks refocus. `AppShell` uses `evidencePanelOpen` to open the responsive Case facts drawer; `EvidenceDrawer` watches the request, scrolls its `[data-fact-id]` row into view, and focuses that row. Desktop keeps the rail visible but honors the same focus request.

`loadError` is reserved for readable-but-invalid/unsupported stored data. On a committed reducer change, set `saveStatus: 'saving'` synchronously, then perform `saveWorkspace` inside `setTimeout(..., 0)`; clear that timer on a newer change/unmount. The macrotask boundary guarantees one rendered `Saving locally` state before `saved` or persistent `error`, avoiding React automatic batching. A write failure preserves in-memory state and exposes `persistenceError: 'Local saving is unavailable; work will be lost on reload.'`. `resetInvalidWorkspace` is the only path that calls `resetStoredWorkspace`; on success it installs a fresh seed and clears both errors, and on removal failure it retains the key/load error and sets `persistenceError: 'The fictional workspace could not be reset.'`. `useWorkspace` throws `useWorkspace must be used inside WorkspaceProvider` outside the provider. `renderApp` wraps tested UI in exactly one provider created from the supplied options.

- [ ] **Step 6: Run focused and package checks**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/reducer.test.ts src/domain/persistence.test.ts src/domain/query.test.ts src/state/WorkspaceProvider.test.tsx
npm run lint --prefix apps/clinical-reasoning-workbench
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; no reducer mutates its input fixture.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/domain/reducer* apps/clinical-reasoning-workbench/src/domain/persistence* apps/clinical-reasoning-workbench/src/domain/query* apps/clinical-reasoning-workbench/src/state apps/clinical-reasoning-workbench/src/test/renderApp.tsx apps/clinical-reasoning-workbench/src/test/fixtures.ts
git commit -m "feat: persist versioned reasoning workspace"
```

---

### Task 4: Add versioned MSE, language, teaching, and cognitive-forcing content

**Files:**
- Create: `apps/clinical-reasoning-workbench/src/content/mse-lexicon.json`
- Create: `apps/clinical-reasoning-workbench/src/content/language-linter-rules.json`
- Create: `apps/clinical-reasoning-workbench/src/content/cognitive-forcing-prompts.json`
- Create: `apps/clinical-reasoning-workbench/src/content/teaching-copy.json`
- Modify: `apps/clinical-reasoning-workbench/src/domain/schemas.ts`
- Modify: `apps/clinical-reasoning-workbench/src/domain/integrity.ts`
- Modify: `apps/clinical-reasoning-workbench/src/content/loadContent.ts`
- Modify: `apps/clinical-reasoning-workbench/src/state/WorkspaceProvider.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/state/useWorkspace.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/reasoningChecks.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/reasoningChecks.test.ts`

**Interfaces:**
- Consumes: `WorkspaceState`, fact provenance/reliability, and the existing MSE canon at `02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html` plus the MS3 pocket guide.
- Produces: `MseTerm`, `LanguageRule`, `CognitivePrompt`, `TeachingCopy`, `RuntimeContent`, `loadRuntimeContent()`, `assertWorkspaceContentReferences(workspace, content)`, `lintLanguage(text, rules?)`, `evaluateReasoningChecks(workspace, prompts?)`, and `buildChronologyPrompts(workspace)`.

Use these exact public content/evaluator types:

```ts
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
  | 'reviewed_fewer_than_three'
  | 'no_favored_contradiction'
  | 'medical_row_unexamined'
  | 'substance_or_medical_unexamined'
  | 'fewer_than_two_supports'
  | 'only_support_low_or_unknown';

export type CognitivePrompt = { id: string; trigger: CognitiveTriggerKey; prompt: string };
export type ReasoningCheck = { id: string; status: 'ok' | 'watch'; prompt: string };
export type LinterFinding = LanguageRule & { originalText: string };

export type TeachingCopy = Record<'ms3' | 'resident', {
  defaultDefinitionsExpanded: boolean;
  msePanelTitle: string;
  differentialPanelTitle: string;
  challengePanelTitle: string;
  factLinkPrompt: string;
}>;

export type VersionedAuthoredContent<T> = {
  contentVersion: 1;
  facultyReview: { status: 'draft' | 'pending' | 'reviewed'; reviewedAt?: string; reviewedBy?: string };
  items: T;
};

export type RuntimeContent = {
  caseDefinition: CaseDefinition;
  mseTerms: MseTerm[];
  languageRules: LanguageRule[];
  cognitivePrompts: CognitivePrompt[];
  teachingCopy: TeachingCopy;
  reviewStatus: Record<
    'first-episode.json' | 'mse-lexicon.json' | 'language-linter-rules.json' |
    'cognitive-forcing-prompts.json' | 'teaching-copy.json',
    'draft' | 'pending' | 'reviewed'
  >;
};
```

- [ ] **Step 1: Write failing content-contract tests**

```ts
const validAuthoredInputs = (): AuthoredInputs => ({
  firstEpisode: structuredClone(firstEpisodeJson),
  mseLexicon: structuredClone(mseLexiconJson),
  languageRules: structuredClone(languageRulesJson),
  cognitivePrompts: structuredClone(cognitivePromptsJson),
  teachingCopy: structuredClone(teachingCopyJson),
});

test('loads exactly the 23 approved MSE terms', () => {
  const content = loadRuntimeContent();
  expect(content.mseTerms).toHaveLength(23);
  expect(content.mseTerms.map((term) => term.label)).toContain('Pressured speech');
  expect(content.mseTerms.every((term) => term.alternatives.length > 0)).toBe(true);
});

test('distinguishes rapid from pressured speech with one question', () => {
  const pressured = loadRuntimeContent().mseTerms.find((term) => term.id === 'pressured_speech');
  expect(pressured?.discriminatingQuestion).toBe(
    'Could the patient be interrupted, or did speech continue despite attempts to interject?',
  );
});

test.each(['manipulative', 'attention-seeking', 'poor historian', 'noncompliant', 'normal affect', 'denies psychosis'])(
  'flags %s without rewriting the learner text',
  (phrase) => {
    const result = lintLanguage(phrase);
    expect(result).toHaveLength(1);
    expect(result[0]?.originalText).toBe(phrase);
    expect(result[0]?.alternatives.length).toBeGreaterThan(0);
  },
);

test('names an invalid authored file and renders no partial content', () => {
  const inputs = validAuthoredInputs();
  inputs.mseLexicon = { contentVersion: 1, facultyReview: { status: 'draft' }, items: [] };
  expect(() => loadRuntimeContent(inputs)).toThrow(/mse-lexicon\.json.*23 terms/);
});

test('keeps every authored content file in draft or pending review', () => {
  expect(Object.values(loadRuntimeContent().reviewStatus)).toEqual([
    'draft', 'draft', 'draft', 'draft', 'draft',
  ]);
});

test('rejects a restored workspace for a different case version', () => {
  const content = loadRuntimeContent();
  const workspace = { ...makeWorkspace(), caseVersion: 99 };
  expect(() => assertWorkspaceContentReferences(workspace, content)).toThrow(/@99.*@1/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/reasoningChecks.test.ts
```

Expected: FAIL because teaching content and evaluator functions are missing.

- [ ] **Step 3: Create the complete MSE lexicon**

`mse-lexicon.json` is `{ "contentVersion": 1, "facultyReview": { "status": "draft" }, "items": [...] }`. Each object inside `items` has `id`, `label`, `domain`, `definition`, `observableSupport`, `limitation`, non-empty `alternatives`, `discriminatingQuestion` (string or `null`), and `evidenceIds: []`. Use these exact 23 item records plus the alternatives map immediately below:

```json
[
  {"id":"guarded","label":"Guarded","domain":"behavior","definition":"Reluctant or cautious disclosure during the interview.","observableSupport":"Brief or selective answers, repeated hesitation, or explicit reluctance to share after the purpose is explained.","limitation":"May reflect fear, mistrust, trauma, culture, privacy concerns, or the interview setting; it does not establish deception.","discriminatingQuestion":"Was the patient reluctant to disclose after clarification and reassurance, or simply concise?","evidenceIds":[]},
  {"id":"hypervigilant","label":"Hypervigilant","domain":"behavior","definition":"Sustained, heightened attention to possible threat.","observableSupport":"Persistent threat-focused scanning, exaggerated monitoring, or difficulty disengaging attention from possible danger.","limitation":"Describe the environment and consider realistic safety concerns, trauma activation, substances, or delirium.","discriminatingQuestion":"Was the scanning sustained and threat-focused, and could attention be redirected?","evidenceIds":[]},
  {"id":"psychomotor_agitation","label":"Psychomotor agitation","domain":"behavior","definition":"Observable increase in motor activity associated with internal tension or activation.","observableSupport":"Pacing, repeated position changes, hand-wringing, or other increased movement that is difficult to settle.","limitation":"Distinguish from purposeful activity, akathisia, pain, intoxication, and environmental discomfort.","discriminatingQuestion":"Was the movement restless and difficult to settle, or purposeful and goal-directed?","evidenceIds":[]},
  {"id":"psychomotor_retardation","label":"Psychomotor retardation","domain":"behavior","definition":"Observable slowing of movement, speech, and response initiation.","observableSupport":"Reduced spontaneous movement, slowed gait or gestures, and delayed motor or verbal responses.","limitation":"Consider medication effects, neurologic illness, catatonia, fatigue, and cultural communication style.","discriminatingQuestion":"Was slowing present across movement and response initiation rather than speech rate alone?","evidenceIds":[]},
  {"id":"rapid_speech","label":"Rapid speech","domain":"speech","definition":"Speech delivered at an increased rate.","observableSupport":"Words are produced faster than expected while speech may remain interruptible and organized.","limitation":"Rate alone does not establish pressure, mania, or disorganization.","discriminatingQuestion":"Could the patient be interrupted, or did speech continue despite attempts to interject?","evidenceIds":[]},
  {"id":"pressured_speech","label":"Pressured speech","domain":"speech","definition":"Increased speech output with a driven quality and reduced interruptibility.","observableSupport":"Speech continues despite attempts to interject, with few pauses and an apparent compulsion to keep talking.","limitation":"Document rate, amount, pauses, and interruptibility; do not infer it from talkativeness alone.","discriminatingQuestion":"Could the patient be interrupted, or did speech continue despite attempts to interject?","evidenceIds":[]},
  {"id":"speech_latency","label":"Speech latency","domain":"speech","definition":"Delay between a question or conversational cue and the start of a response.","observableSupport":"Repeated, measurable pauses before answers begin.","limitation":"May reflect depression, psychosis, cognition, language processing, anxiety, hearing, or deliberate reflection.","discriminatingQuestion":"Was the delay consistent across questions and longer than expected for reflection or language processing?","evidenceIds":[]},
  {"id":"restricted_affect","label":"Restricted affect","domain":"affect","definition":"Mild-to-moderate reduction in the range or intensity of observed emotional expression.","observableSupport":"Some variation remains, but facial, vocal, or gestural expression is narrower than expected for context.","limitation":"Describe range, reactivity, and context; avoid treating cultural restraint as pathology.","discriminatingQuestion":"Was expression narrowed with meaningful reactivity still present?","evidenceIds":[]},
  {"id":"blunted_affect","label":"Blunted affect","domain":"affect","definition":"Marked reduction in the intensity and range of emotional expression.","observableSupport":"Facial, vocal, and gestural expression show little change despite emotionally varied content.","limitation":"Differentiate from sedation, neurologic illness, depression, and cultural style.","discriminatingQuestion":"Was emotional expression markedly reduced but still observable?","evidenceIds":[]},
  {"id":"flat_affect","label":"Flat affect","domain":"affect","definition":"Near absence of observable emotional expression.","observableSupport":"Minimal facial movement, vocal prosody, gesture, or reactivity across the encounter.","limitation":"Reserve for near-absence; do not use as a synonym for restricted or blunted affect.","discriminatingQuestion":"Was emotional expression nearly absent rather than merely reduced?","evidenceIds":[]},
  {"id":"labile_affect","label":"Labile affect","domain":"affect","definition":"Rapid or marked shifts in observed emotional expression.","observableSupport":"Affect changes abruptly in intensity or quality during the encounter.","limitation":"Describe triggers, duration, and congruence; normal reactivity is not lability.","discriminatingQuestion":"Were shifts abrupt or disproportionate rather than understandable responses to changing content?","evidenceIds":[]},
  {"id":"circumstantial","label":"Circumstantial","domain":"thought_process","definition":"Overinclusive, indirect thought that eventually returns to the original point.","observableSupport":"Excessive detail and detours occur, but the question is ultimately answered.","limitation":"Distinguish from a detailed communication style and from tangentiality.","discriminatingQuestion":"Did the patient eventually return to and answer the original question?","evidenceIds":[]},
  {"id":"tangential","label":"Tangential","domain":"thought_process","definition":"Thought moves away from the question and does not return to answer it.","observableSupport":"Responses follow related side paths without reaching the requested point.","limitation":"Check comprehension, language, anxiety, and interview structure before labeling.","discriminatingQuestion":"Did the patient eventually return to and answer the original question?","evidenceIds":[]},
  {"id":"flight_of_ideas","label":"Flight of ideas","domain":"thought_process","definition":"Rapid shifts between topics with connections that remain understandable.","observableSupport":"Ideas change quickly through associations, wordplay, or distractibility while a link can still be followed.","limitation":"Distinguish from loose associations, ordinary enthusiasm, and a fast interview pace.","discriminatingQuestion":"Were transitions rapid but understandable, or weak and difficult to follow?","evidenceIds":[]},
  {"id":"loose_associations","label":"Loose associations","domain":"thought_process","definition":"Ideas shift with weak, illogical, or difficult-to-follow connections.","observableSupport":"The relationship between successive statements is unclear despite clarification.","limitation":"Consider language differences, hearing, cognition, and interviewer misunderstanding.","discriminatingQuestion":"Were connections weak or illogical even after clarification?","evidenceIds":[]},
  {"id":"thought_blocking","label":"Thought blocking","domain":"thought_process","definition":"Abrupt interruption of a train of thought before completion.","observableSupport":"Speech stops suddenly and the person cannot readily resume the prior idea.","limitation":"Distinguish from distraction, hesitation, memory lapse, and choosing not to answer.","discriminatingQuestion":"Did thought stop abruptly with difficulty recovering the prior idea?","evidenceIds":[]},
  {"id":"perseveration","label":"Perseveration","domain":"thought_process","definition":"Inappropriate repetition of a response, word, action, or topic after the context has changed.","observableSupport":"The same answer or theme recurs despite new questions or redirection.","limitation":"Distinguish from a clinically central concern that the patient intentionally revisits.","discriminatingQuestion":"Did the same response persist despite a clear change in question or task?","evidenceIds":[]},
  {"id":"internal_preoccupation","label":"Internal preoccupation","domain":"perception","definition":"Observed behavior suggesting attention is directed toward internal experiences.","observableSupport":"Long unexplained pauses, looking toward unseen stimuli, or apparent response to something not evident in the room.","limitation":"This is an inference, not proof of hallucinations; document the behavior and the patient's report separately.","discriminatingQuestion":"What behavior was directly observed, and what internal experience did the patient report?","evidenceIds":[]},
  {"id":"delusion","label":"Delusion","domain":"thought_content","definition":"A firmly held belief maintained despite strong counterevidence and not better understood within the person's cultural context.","observableSupport":"Document content, conviction, preoccupation, impact, response to counterevidence, and cultural context.","limitation":"Do not label an unfamiliar, culturally shared, plausible, or insufficiently explored belief as delusional.","discriminatingQuestion":"How fixed is the belief, how does it respond to counterevidence, and is it culturally shared?","evidenceIds":[]},
  {"id":"obsession","label":"Obsession","domain":"thought_content","definition":"Recurrent intrusive thoughts, urges, or images experienced as unwanted and distressing.","observableSupport":"The person identifies the experience as intrusive, attempts to resist or neutralize it, or changes behavior because of it.","limitation":"Distinguish from rumination, delusion, worry, and an overvalued idea.","discriminatingQuestion":"Is the thought experienced as intrusive and unwanted, or as true and justified?","evidenceIds":[]},
  {"id":"overvalued_idea","label":"Overvalued idea","domain":"thought_content","definition":"A strongly held, emotionally important belief that is less fixed than a delusion.","observableSupport":"The belief dominates attention or behavior but retains some responsiveness to doubt or counterevidence.","limitation":"Assess cultural context, plausibility, conviction, and flexibility rather than using the term as a midpoint by default.","discriminatingQuestion":"Can the person acknowledge meaningful doubt or alternatives to the belief?","evidenceIds":[]},
  {"id":"insight","label":"Insight","domain":"insight","definition":"Awareness and understanding of symptoms, circumstances, contributors, and need for help.","observableSupport":"Describe which aspects the person recognizes and which they do not.","limitation":"Insight is multidimensional; avoid a global good-or-poor label without evidence.","discriminatingQuestion":"What does the patient understand about the experience, its impact, and the need for help?","evidenceIds":[]},
  {"id":"judgment","label":"Judgment","domain":"judgment","definition":"Ability to make reasoned, safe decisions in context.","observableSupport":"Anchor the description to recent real-world choices and the reasoning behind them.","limitation":"Do not infer judgment from diagnosis, agreement with the team, or hypothetical questions alone.","discriminatingQuestion":"What recent decision best demonstrates how options, consequences, and safety were weighed?","evidenceIds":[]}
]
```

Merge this exact non-empty `alternatives` array into each record by ID (these are faculty-draft prompts for differential description, not app-selected labels):

```json
{
  "guarded": ["Concise communication", "Fear or mistrust in the interview setting"],
  "hypervigilant": ["Realistic environmental scanning", "Distractibility"],
  "psychomotor_agitation": ["Akathisia", "Pain or environmental discomfort", "Purposeful activity"],
  "psychomotor_retardation": ["Sedation or fatigue", "Neurologic slowing"],
  "rapid_speech": ["Pressured speech", "Anxiety-related increased rate", "Baseline communication style"],
  "pressured_speech": ["Rapid but interruptible speech", "Talkativeness"],
  "speech_latency": ["Deliberate reflection", "Language-processing or hearing difficulty"],
  "restricted_affect": ["Cultural restraint", "Blunted affect"],
  "blunted_affect": ["Restricted affect", "Sedation or neurologic illness"],
  "flat_affect": ["Blunted affect", "Sedation"],
  "labile_affect": ["Context-appropriate reactivity", "Anxiety-related shifts"],
  "circumstantial": ["Detailed communication style", "Tangential thought process"],
  "tangential": ["Circumstantial thought process", "Question misunderstanding"],
  "flight_of_ideas": ["Loose associations", "Rapid but goal-directed speech"],
  "loose_associations": ["Language difference", "Cognitive impairment or interviewer misunderstanding"],
  "thought_blocking": ["Distraction", "Hesitation or memory lapse"],
  "perseveration": ["Intentional return to a central concern", "Cognitive rigidity"],
  "internal_preoccupation": ["Distraction", "Anxiety or deliberate reflection"],
  "delusion": ["Culturally shared belief", "Overvalued idea", "Insufficiently explored plausible belief"],
  "obsession": ["Worry or rumination", "Overvalued idea", "Delusional belief"],
  "overvalued_idea": ["Culturally shared belief", "Obsession", "Delusion"],
  "insight": ["Partial or domain-specific awareness", "Disagreement with the team despite intact understanding"],
  "judgment": ["Limited information or constrained options", "Different values despite reasoned decision-making"]
}
```

- [ ] **Step 4: Create complete linter and prompt data**

`language-linter-rules.json` uses the same version/review envelope with `status: "draft"`. Its `items` value is the following array; use case-insensitive whole-phrase matching and preserve the matched learner text:

```json
[
  {"id":"manipulative","phrase":"manipulative","why":"Loaded shorthand obscures the observed behavior, context, and need.","alternatives":["Describe the specific behavior, context, and apparent function without assigning motive."]},
  {"id":"attention_seeking","phrase":"attention-seeking","why":"The phrase assigns motive and can stigmatize distress or help-seeking.","alternatives":["Sought staff support repeatedly when distressed.","State what support was requested and what preceded it."]},
  {"id":"poor_historian","phrase":"poor historian","why":"The phrase blames the patient and does not explain why the history is limited.","alternatives":["History is limited by inconsistent recall; collateral is needed.","Timeline is limited by disorganization, intoxication, anxiety, or another named barrier."]},
  {"id":"noncompliant","phrase":"noncompliant","why":"The phrase hides the reason a recommendation was not followed.","alternatives":["Missed doses because…","Declined because…"]},
  {"id":"normal_affect","phrase":"normal affect","why":"Affect should be described by range, intensity, reactivity, stability, and congruence.","alternatives":["Describe observed range, reactivity, stability, and congruence."]},
  {"id":"denies_psychosis","phrase":"denies psychosis","why":"Psychosis is not a single yes-or-no symptom and patient report must remain separate from observation.","alternatives":["Document the hallucination, delusion, disorganization, and behavior questions asked, then record patient report and observation separately."]}
]
```

`cognitive-forcing-prompts.json` uses the same version/review envelope with `status: "draft"`. Use these exact `items` records:

```json
[
  {"id":"premature_closure","trigger":"reviewed_fewer_than_three","prompt":"Review at least three hypotheses before closing the differential."},
  {"id":"confirmation_bias","trigger":"no_favored_contradiction","prompt":"Add at least one contradictory or tension-creating fact for the favored hypothesis."},
  {"id":"diagnostic_overshadowing","trigger":"medical_row_unexamined","prompt":"Examine the medical or neurologic row before attributing findings to a psychiatric explanation."},
  {"id":"substance_medical_causes","trigger":"substance_or_medical_unexamined","prompt":"Review both substance-associated and medical or neurologic explanations."},
  {"id":"unsupported_confidence","trigger":"fewer_than_two_supports","prompt":"Add at least two supporting facts before treating the favored hypothesis as well supported."},
  {"id":"single_low_reliability_source","trigger":"only_support_low_or_unknown","prompt":"Seek a supporting fact from an additional or more reliable source."}
]
```

`teaching-copy.json` is `{ "contentVersion": 1, "facultyReview": { "status": "draft" }, "items": { ... } }`. Use this exact `items` value:

```json
{
  "ms3": {
    "defaultDefinitionsExpanded": true,
    "msePanelTitle": "Translate observation into precise language",
    "differentialPanelTitle": "Build a falsifiable differential",
    "challengePanelTitle": "Test the favored explanation",
    "factLinkPrompt": "Link every interpretation to a case fact."
  },
  "resident": {
    "defaultDefinitionsExpanded": false,
    "msePanelTitle": "Separate observation, inference, and limitation",
    "differentialPanelTitle": "Prioritize falsifiers and dangerous alternatives",
    "challengePanelTitle": "State what would change your position",
    "factLinkPrompt": "Link falsifiers, management implications, and next discriminators to case facts."
  }
}
```

- [ ] **Step 5: Implement deterministic evaluators**

Parse every authored file before exposing any content:

```ts
export type AuthoredInputs = {
  firstEpisode: unknown;
  mseLexicon: unknown;
  languageRules: unknown;
  cognitivePrompts: unknown;
  teachingCopy: unknown;
};

const FacultyReviewSchema = z.object({
  status: z.enum(['draft', 'pending', 'reviewed']),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().optional(),
});
const VersionFieldsSchema = z.object({
  contentVersion: z.literal(1),
  facultyReview: FacultyReviewSchema,
});
const MseTermSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  domain: z.string().min(1),
  definition: z.string().min(1),
  observableSupport: z.string().min(1),
  limitation: z.string().min(1),
  alternatives: z.array(z.string().min(1)).min(1),
  discriminatingQuestion: z.string().min(1).nullable(),
  evidenceIds: z.array(z.string().min(1)),
});
const LanguageRuleSchema = z.object({
  id: z.string().min(1),
  phrase: z.string().min(1),
  why: z.string().min(1),
  alternatives: z.array(z.string().min(1)).min(1),
});
const CognitivePromptSchema = z.object({
  id: z.string().min(1),
  trigger: z.enum([
    'reviewed_fewer_than_three',
    'no_favored_contradiction',
    'medical_row_unexamined',
    'substance_or_medical_unexamined',
    'fewer_than_two_supports',
    'only_support_low_or_unknown',
  ]),
  prompt: z.string().min(1),
});
const TeachingLevelSchema = z.object({
  defaultDefinitionsExpanded: z.boolean(),
  msePanelTitle: z.string().min(1),
  differentialPanelTitle: z.string().min(1),
  challengePanelTitle: z.string().min(1),
  factLinkPrompt: z.string().min(1),
});
const requireUniqueContentIds = (items: { id: string }[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', message: `duplicate content ID ${item.id}` });
    seen.add(item.id);
  }
};

export const MseLexiconFileSchema = VersionFieldsSchema.extend({
  items: z.array(MseTermSchema).superRefine((items, ctx) => {
    if (items.length !== 23) ctx.addIssue({ code: 'custom', message: 'expected exactly 23 terms' });
  }),
}).superRefine((value, ctx) => requireUniqueContentIds(value.items, ctx));
export const LanguageRulesFileSchema = VersionFieldsSchema.extend({
  items: z.array(LanguageRuleSchema).length(6),
}).superRefine((value, ctx) => requireUniqueContentIds(value.items, ctx));
export const CognitivePromptsFileSchema = VersionFieldsSchema.extend({
  items: z.array(CognitivePromptSchema).length(6),
}).superRefine((value, ctx) => requireUniqueContentIds(value.items, ctx));
export const TeachingCopyFileSchema = VersionFieldsSchema.extend({
  items: z.object({ ms3: TeachingLevelSchema, resident: TeachingLevelSchema }),
});

const bundledAuthoredInputs: AuthoredInputs = {
  firstEpisode: firstEpisodeJson,
  mseLexicon: mseLexiconJson,
  languageRules: languageRulesJson,
  cognitivePrompts: cognitivePromptsJson,
  teachingCopy: teachingCopyJson,
};

export class ContentValidationError extends Error {
  constructor(public readonly fileName: string, details: string) {
    super(`${fileName}: ${details}`);
    this.name = 'ContentValidationError';
  }
}

function parseAuthoredFile<T>(fileName: string, input: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ContentValidationError(fileName, result.error.issues.map((issue) => issue.message).join('; '));
  }
  return result.data;
}

export function loadRuntimeContent(inputs: AuthoredInputs = bundledAuthoredInputs): RuntimeContent {
  const caseDefinition = parseAuthoredFile('first-episode.json', inputs.firstEpisode, CaseDefinitionSchema);
  const mse = parseAuthoredFile('mse-lexicon.json', inputs.mseLexicon, MseLexiconFileSchema);
  const linter = parseAuthoredFile('language-linter-rules.json', inputs.languageRules, LanguageRulesFileSchema);
  const prompts = parseAuthoredFile(
    'cognitive-forcing-prompts.json',
    inputs.cognitivePrompts,
    CognitivePromptsFileSchema,
  );
  const teaching = parseAuthoredFile('teaching-copy.json', inputs.teachingCopy, TeachingCopyFileSchema);
  return {
    caseDefinition,
    mseTerms: mse.items,
    languageRules: linter.items,
    cognitivePrompts: prompts.items,
    teachingCopy: teaching.items,
    reviewStatus: {
      'first-episode.json': caseDefinition.facultyReview.status,
      'mse-lexicon.json': mse.facultyReview.status,
      'language-linter-rules.json': linter.facultyReview.status,
      'cognitive-forcing-prompts.json': prompts.facultyReview.status,
      'teaching-copy.json': teaching.facultyReview.status,
    },
  };
}
```

`AuthoredInputs` has the five keys used above and is exported only to inject invalid fixtures in tests. Every file schema requires `contentVersion: 1`, review status, unique IDs, non-empty fields, and exactly the corresponding `items` shape; failure aborts the entire load with the source filename.

Extend `WorkspaceContextValue` with `content: RuntimeContent`, and extend both `WorkspaceProviderProps` and `RenderAppOptions` with optional `content?: RuntimeContent`. The provider calls `loadRuntimeContent()` exactly once when no content fixture is supplied, uses `content.caseDefinition` for fresh/reset workspaces, and makes the already-validated teaching content available to feature components. Do not parse content separately inside individual components.

Add this cross-content integrity check and call it after every stored load and before every save:

```ts
export function assertWorkspaceContentReferences(
  workspace: WorkspaceState,
  content: RuntimeContent,
): WorkspaceState {
  if (workspace.caseId !== content.caseDefinition.id || workspace.caseVersion !== content.caseDefinition.version) {
    throw new Error(
      `Workspace case ${workspace.caseId}@${workspace.caseVersion} does not match ` +
      `${content.caseDefinition.id}@${content.caseDefinition.version}`,
    );
  }
  const termIds = new Set(content.mseTerms.map((term) => term.id));
  for (const translation of workspace.mseTranslations) {
    for (const termId of translation.termIds) {
      if (!termIds.has(termId)) throw new Error(`MSE translation ${translation.id} references unknown term ${termId}`);
    }
  }
  return workspace;
}
```

The provider treats a restored unknown term ID as invalid stored data, retains the key, and shows `WorkspaceRecovery`. This guarantees `buildSummary` never invents a term label.

`lintLanguage` uses escaped, case-insensitive phrase matching and returns every matching rule without changing the source text:

```ts
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function lintLanguage(
  text: string,
  rules: LanguageRule[] = loadRuntimeContent().languageRules,
): LinterFinding[] {
  return rules.flatMap((rule) => {
    const pattern = new RegExp(`(?:^|\\b)${escapeRegExp(rule.phrase)}(?:\\b|$)`, 'i');
    const match = text.match(pattern);
    return match ? [{ ...rule, originalText: match[0].trim() }] : [];
  });
}
```

`evaluateReasoningChecks(workspace, prompts = loadRuntimeContent().cognitivePrompts)` defines a hypothesis as reviewed when it has a support, contradiction, missing-information entry, non-empty rationale, or non-empty management implication. The medical/substance checks inspect `category === 'medical'` and `category === 'substance'`. `fewer_than_two_supports` and `only_support_low_or_unknown` apply only when a favorite exists; the latter is `watch` only when every supporting fact has `reliability` low or unknown. It returns one `ReasoningCheck` per cognitive record in file order. App components always pass `content.languageRules` / `content.cognitivePrompts`, so startup parses each authored file once; optional defaults exist only for focused unit tests.

`buildChronologyPrompts` emits:

- “Which dates are approximate?” when any timeline item is approximate;
- “Did increasing cannabis use precede, coincide with, or remain independent of persecutory beliefs?” until a relation connects F02 to F03 or F09;
- “Did psychotic symptoms continue outside mood symptoms?” until a relation connects a mood-linked fact to F03 or F09.

- [ ] **Step 6: Run tests and validate content**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/reasoningChecks.test.ts
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: 23 unique term IDs, six linter rules, six cognitive prompts, and no dangling academic `evidenceIds`.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/content apps/clinical-reasoning-workbench/src/domain/reasoningChecks* apps/clinical-reasoning-workbench/src/domain/schemas.ts apps/clinical-reasoning-workbench/src/domain/integrity.ts apps/clinical-reasoning-workbench/src/state/WorkspaceProvider.tsx apps/clinical-reasoning-workbench/src/state/useWorkspace.ts
git commit -m "feat: add versioned reasoning teaching content"
```

---

### Task 5: Build the approved application shell and responsive design system

**Files:**
- Modify: `apps/clinical-reasoning-workbench/src/main.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/App.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/App.test.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/AppShell.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/Header.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/TabNav.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/TeachingPanel.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/ContentErrorScreen.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/WorkspaceRecovery.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/ui/Button.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/ui/FactChip.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/ui/SourceReliability.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/ui/LinkedText.tsx`
- Create: `apps/clinical-reasoning-workbench/src/styles/tokens.css`
- Create: `apps/clinical-reasoning-workbench/src/styles/base.css`
- Create: `apps/clinical-reasoning-workbench/src/styles/shell.css`
- Create: `apps/clinical-reasoning-workbench/src/styles/features.css`
- Create: `apps/clinical-reasoning-workbench/src/features/timeline/TimelineWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/mse/MseWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/differential/DifferentialWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/challenge/ChallengeWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceProvider`, save status, learner level, current case, and selected Fact IDs.
- Produces: `WorkbenchTab = 'timeline' | 'mse' | 'differential' | 'challenge'`, semantic shell slots, responsive rail controls, and shared visual primitives.

- [ ] **Step 1: Write failing semantic shell tests**

```tsx
test('exposes the four tabs with arrow-key navigation', async () => {
  const user = userEvent.setup();
  renderApp(<App />);
  const timeline = screen.getByRole('tab', { name: 'Timeline' });
  timeline.focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'MSE' })).toHaveFocus();
});

test('applies parent-frame dark theme messages', () => {
  renderApp(<App />);
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'theme', mode: 'dark' } }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
});

test('shows reset recovery without rendering a partial workspace', () => {
  const storage = makeMemoryStorage({ cw_reason_workbench_v1: '{"schemaVersion":99}' });
  renderApp(<App />, { storage });
  expect(screen.getByRole('heading', { name: 'Saved fictional workspace needs to be reset' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reset fictional workspace' })).toBeVisible();
  expect(screen.queryByRole('tab', { name: 'Timeline' })).not.toBeInTheDocument();
});

test('provides skip navigation and a live local-save announcement', () => {
  renderApp(<App />);
  expect(screen.getByRole('link', { name: 'Skip to workspace' })).toHaveAttribute('href', '#workspace-main');
  expect(screen.getByRole('status', { name: 'Local save status' })).toHaveAttribute('aria-live', 'polite');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/components/AppShell.test.tsx
```

Expected: FAIL because semantic tabs and theme listener are missing.

- [ ] **Step 3: Implement tokens and layout exactly**

`tokens.css` defines the approved light tokens and existing dark mapping. The core layout is:

```css
:root {
  --bg: #f6f3ee;
  --surface: #ffffff;
  --primary: #c25a3c;
  --primary-dark: #a84830;
  --accent: #2a6b5e;
  --accent-dark: #1e5248;
  --text: #2f2924;
  --text-mid: #51473d;
  --text-light: #665a4f;
  --border: #ddd3c6;
  --success: #357160;
  --warning: #7a6234;
  --danger: #a34132;
  --focus: #155eef;
  --font-title: "Source Serif 4", "Iowan Old Style", Georgia, serif;
  --font-ui: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --header-height: 64px;
  --tabs-height: 48px;
}

[data-theme="dark"] {
  --bg: #1a1816;
  --surface: #2a2520;
  --primary: #d4896e;
  --primary-dark: #dd9277;
  --accent: #5aad9a;
  --accent-dark: #6cbcaa;
  --text: #e8e2da;
  --text-mid: #b3a596;
  --text-light: #8a7c6e;
  --border: #3d3630;
  --success: #5aad8e;
  --warning: #c4a45c;
  --danger: #d46858;
  --focus: #7aa2ff;
}

.workbench {
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
}

.workspace-grid {
  display: grid;
  grid-template-columns: 280px minmax(520px, 1fr) 300px;
  min-height: calc(100dvh - var(--header-height) - var(--tabs-height));
}

.evidence-rail,
.teaching-rail {
  background: var(--surface);
  overflow: auto;
}

.evidence-rail { border-right: 1px solid var(--border); }
.teaching-rail { border-left: 1px solid var(--border); }

@media (max-width: 1099px) {
  .workspace-grid { grid-template-columns: minmax(0, 1fr); }
  .evidence-rail,
  .teaching-rail { position: fixed; inset: var(--header-height) 0 0 auto; width: min(360px, 100vw); z-index: 20; }
}

@media (max-width: 767px) {
  .evidence-rail,
  .teaching-rail { inset: 0; width: 100vw; }
  .header { grid-template-columns: 1fr auto; }
}
```

Controls use deliberate 13–15 px `--font-ui` typography, a 36 px minimum desktop height, and a 44 px minimum below 1100 px. Titles use 20–28 px `--font-title`; section headings use 18–22 px; body is 14–16 px; metadata is 12–13 px. `:focus-visible` uses a 3 px `--focus` outline with 2 px offset. Transitions are 120–180 ms only for drawers/focus/selection and are disabled under `prefers-reduced-motion: reduce`. Do not introduce gradients, marketing copy, decorative cards, or a second navigation system.

- [ ] **Step 4: Implement accessible header, tabs, rails, and primitives**

`AppShell` begins with a visually hidden-until-focused `Skip to workspace` link targeting `<main id="workspace-main" tabIndex={-1}>`. Header is `position: sticky; top: 0`; tabs are sticky immediately below `var(--header-height)`; both remain within the app viewport and have explicit z-index/background/border so content never shows through. `TabNav` uses `role="tablist"`, roving `tabIndex`, ArrowLeft/ArrowRight/Home/End, `aria-selected`, and `aria-controls`. Header save text sits in `<span role="status" aria-label="Local save status" aria-live="polite" aria-atomic="true">` and maps exactly to `Saving locally`, `Saved locally`, or the persistent failure state.

The allowed persistent above-the-fold copy is exactly: `Clinical Reasoning Workbench`, `Synthetic Case 01 · First episode`, `MS3`, `Resident`, `Fictional educational case`, the current local-save status, `Export summary`, `Timeline`, `MSE`, `Differential`, `Challenge Diagnosis`, `Case facts`, and `Teaching`. Do not add a kicker, subtitle, badge, score, metric, or extra navigation label.

Use this icon inventory at 16–20 px, 1.5 px stroke, and `currentColor`: `FileText` for Case facts, `BookOpen` for Teaching, `Download` for Export summary, `CheckCircle2` for saved, `LoaderCircle` for saving, `AlertTriangle` for persistence error, `Search` for fact/term filtering, `ChevronDown` for disclosure, and `X` for closing overlays. Primary actions retain visible text. Tablet/mobile overlays trap focus, close on Escape, and return focus to their trigger.

Every visible Fact citation uses the shared `FactChip`. It reads `selectedFactIds`, applies both `aria-pressed="true"` and `.is-selected` when selected, and calls context `revealFact(factId)` on activation. Feature rows/table cells/timeline marks use the same selected-ID state to apply `.is-evidence-selected`; therefore a citation click highlights all visible uses, opens the responsive Case facts drawer, and focuses/scrolls the evidence row without feature-specific selection stores. MSE, Differential, Challenge, and Summary components must render all Fact IDs through `FactChip`, not plain text.

- [ ] **Step 5: Wire App as composition glue**

```tsx
export function App() {
  const [tab, setTab] = useState<WorkbenchTab>('timeline');
  const { loadError, resetInvalidWorkspace } = useWorkspace();
  if (loadError) {
    return <WorkspaceRecovery message={loadError} onReset={resetInvalidWorkspace} />;
  }
  return (
    <AppShell activeTab={tab} onTabChange={setTab}>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'timeline' ? <TimelineWorkspace /> : null}
        {tab === 'mse' ? <MseWorkspace /> : null}
        {tab === 'differential' ? <DifferentialWorkspace /> : null}
        {tab === 'challenge' ? <ChallengeWorkspace /> : null}
      </div>
    </AppShell>
  );
}
```

`main.tsx` owns the only production provider and the fail-closed authored-content boundary:

```tsx
const root = createRoot(document.getElementById('root')!);
try {
  const content = loadRuntimeContent();
  root.render(
    <StrictMode>
      <WorkspaceProvider content={content}>
        <App />
      </WorkspaceProvider>
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown authored-content error';
  root.render(<ContentErrorScreen message={message} />);
}
```

`ContentErrorScreen` renders `role="alert"`, heading `Workbench content could not be loaded`, the file-naming error message, and no app shell. `WorkspaceRecovery` renders the tested heading/message/reset button and no app shell. The header shows `persistenceError` in a persistent `role="alert"` while keeping the in-memory workspace usable. Update `App.test.tsx` to use `renderApp(<App />)` so all tests use exactly one provider.

Create the four exported feature components now with these exact temporary bodies; later tasks replace only their bodies:

```tsx
export function TimelineWorkspace() { return <section><h2>Psychiatric Timeline</h2></section>; }
export function MseWorkspace() { return <section><h2>MSE Translator</h2></section>; }
export function DifferentialWorkspace() { return <section><h2>Differential Matrix</h2></section>; }
export function ChallengeWorkspace() { return <section><h2>Challenge Diagnosis</h2></section>; }
```

- [ ] **Step 6: Pass focused tests and inspect both breakpoints**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/components/AppShell.test.tsx
npm run dev --prefix apps/clinical-reasoning-workbench
```

Expected: tests pass; at 1180 px the shell has three rails, at 834 px side rails open as overlays, and at 390 px no header/tab control clips.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/main.tsx apps/clinical-reasoning-workbench/src/App.tsx apps/clinical-reasoning-workbench/src/App.test.tsx apps/clinical-reasoning-workbench/src/components apps/clinical-reasoning-workbench/src/styles apps/clinical-reasoning-workbench/src/features
git commit -m "feat: build clinical warm workbench shell"
```

---

### Task 6: Add the evidence drawer, fact selection/editing, and synthetic-data gate

**Files:**
- Modify: `apps/clinical-reasoning-workbench/src/main.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/EvidenceDrawer.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/SyntheticDataDialog.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/EvidenceDrawer.test.tsx`
- Create: `apps/clinical-reasoning-workbench/src/components/ui/GuardedTextArea.tsx`
- Create: `apps/clinical-reasoning-workbench/src/state/SyntheticDataGateProvider.tsx`
- Create: `apps/clinical-reasoning-workbench/src/state/SyntheticDataGateProvider.test.tsx`
- Create: `apps/clinical-reasoning-workbench/src/state/useSyntheticDataGate.ts`
- Modify: `apps/clinical-reasoning-workbench/src/test/renderApp.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/test/fixtures.ts`
- Modify: `apps/clinical-reasoning-workbench/src/components/AppShell.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/domain/reducer.ts`
- Modify: `apps/clinical-reasoning-workbench/src/domain/schemas.ts`

**Interfaces:**
- Consumes: facts, selected Fact IDs, context `selectFacts`, and `acknowledgeSyntheticData`, `upsertFact`, and `upsertTimelineItem` actions.
- Produces: filterable fact rows, non-persisted multi-selection, one shared first-free-text acknowledgement gate, and a bounded synthetic fact editor with paired timeline placement.

Add this reusable acknowledged fixture for later free-text component tests:

```ts
export function makeAcknowledgedWorkspace(): WorkspaceState {
  return { ...makeWorkspace(), syntheticDataAcknowledged: true };
}
```

- [ ] **Step 1: Write failing acknowledgement and editing tests**

```tsx
test('requires synthetic-data acknowledgement before the first fact edit', async () => {
  const user = userEvent.setup();
  renderApp(<EvidenceDrawer />);
  await user.click(screen.getByRole('button', { name: 'Edit F01' }));
  expect(screen.getByRole('dialog', { name: 'Fictional data only' })).toBeVisible();
  expect(screen.getByText('I will use fictional educational data only.')).toBeVisible();
});

test('selects multiple facts without drag and drop', async () => {
  const user = userEvent.setup();
  renderApp(<EvidenceDrawer />);
  await user.click(screen.getByRole('checkbox', { name: /Select F04/ }));
  await user.click(screen.getByRole('checkbox', { name: /Select F05/ }));
  expect(screen.getByText('2 facts selected')).toBeVisible();
});

test('guards a non-fact free-text field with the same acknowledgement', async () => {
  const user = userEvent.setup();
  renderApp(<GuardedTextArea aria-label="Reasoning text" value="" onChange={() => undefined} />);
  await user.click(screen.getByLabelText('Reasoning text'));
  expect(screen.getByRole('dialog', { name: 'Fictional data only' })).toBeVisible();
});

test('reveals one fact across citations and focuses its evidence row', async () => {
  const user = userEvent.setup();
  renderApp(
    <>
      <FactChip factId="F04" />
      <FactChip factId="F04" />
      <EvidenceDrawer />
    </>,
  );
  await user.click(screen.getAllByRole('button', { name: 'F04' })[0]!);
  for (const chip of screen.getAllByRole('button', { name: 'F04' })) {
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  }
  expect(screen.getByRole('row', { name: /F04/ })).toHaveFocus();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/components/EvidenceDrawer.test.tsx
```

Expected: FAIL because the evidence drawer is not implemented.

- [ ] **Step 3: Implement evidence rows and filters**

Each fact row uses `role="row"`, `data-fact-id`, and `tabIndex={-1}`, and shows text, Fact ID, source, reliability, certainty, and temporal label. Filter controls cover text search, source, reliability, and selected-only. Use real checkboxes for multi-selection; call context `selectFacts([...selectedFactIds, fact.id])` rather than dispatching a domain action. `revealFact` opens the responsive panel and focuses/scrolls the row. `SourceReliability` renders text plus icon/shape, not color alone.

- [ ] **Step 4: Implement the acknowledgement and bounded editor**

Implement this shared gate contract:

```ts
export type SyntheticDataGateValue = {
  guardFreeTextEdit: (resume: () => void) => void;
};
```

`SyntheticDataGateProvider` reads `workspace.syntheticDataAcknowledged`. `guardFreeTextEdit` runs `resume` immediately when acknowledged; otherwise it stores exactly one continuation and opens `SyntheticDataDialog`. Continue dispatches `acknowledgeSyntheticData`, closes the dialog, and runs the stored continuation in `queueMicrotask`; Cancel closes and discards it. `GuardedTextArea` is read-only while unacknowledged; focus, pointer-down, or typing calls the guard and refocuses the textarea only after Continue. Every learner-authored free-text field in Tasks 6–11 must use `GuardedTextArea` (or the same hook for an input), including fact text, MSE wording/limitation, gaps, rationale, management implications, challenge responses, and timeline labels.

Wrap `App` with `SyntheticDataGateProvider` inside `WorkspaceProvider` in both `main.tsx` and `renderApp`; this remains one workspace provider. The first Add/Edit action opens the exact acknowledgement `I will use fictional educational data only.` with `Continue with fictional data`/`Cancel` controls.

The fact editor permits text up to 280 characters, source, reliability, certainty, kind, date/range, temporal precision, tags, and a timeline lane. Existing Fact IDs are read-only. Generate a new ID with this exact helper:

```ts
export function nextFactId(facts: CaseFact[]): string {
  const highest = Math.max(0, ...facts.map((fact) => Number.parseInt(fact.id.slice(1), 10) || 0));
  return `F${String(highest + 1).padStart(2, '0')}`;
}
```

Saving a new fact dispatches `upsertFact` and `upsertTimelineItem` with ID `timeline-${fact.id}`, the chosen lane/label/date fields, the learner-selected visible time-column `sortOrder`, `factIds: [fact.id]`, and `learnerEdited: true`. Editing an existing fact dispatches `upsertFact` and updates its existing timeline item so lane/order are not incorrectly stored on `CaseFact`. The editor never exposes patient name, MRN, DOB, facility, upload, import, or clipboard-paste controls.

- [ ] **Step 5: Run focused tests and keyboard checks**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/components/EvidenceDrawer.test.tsx src/state/SyntheticDataGateProvider.test.tsx
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; Escape closes dialogs, focus returns to the triggering Add/Edit button, and 281-character facts are rejected with a visible field error.

- [ ] **Step 6: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/main.tsx apps/clinical-reasoning-workbench/src/components/EvidenceDrawer* apps/clinical-reasoning-workbench/src/components/SyntheticDataDialog.tsx apps/clinical-reasoning-workbench/src/components/ui/GuardedTextArea.tsx apps/clinical-reasoning-workbench/src/components/AppShell.tsx apps/clinical-reasoning-workbench/src/state/SyntheticDataGateProvider* apps/clinical-reasoning-workbench/src/state/useSyntheticDataGate.ts apps/clinical-reasoning-workbench/src/test/renderApp.tsx apps/clinical-reasoning-workbench/src/test/fixtures.ts apps/clinical-reasoning-workbench/src/domain/reducer.ts apps/clinical-reasoning-workbench/src/domain/schemas.ts
git commit -m "feat: add synthetic evidence editing"
```

---

### Task 7: Implement the Psychiatric Timeline Builder

**Files:**
- Modify: `apps/clinical-reasoning-workbench/src/features/timeline/TimelineWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/timeline/TimelineGrid.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/timeline/FactEditor.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/timeline/RelationshipEditor.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/timeline/ChronologyPanel.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/timeline/TimelineWorkspace.test.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/styles/features.css`

**Interfaces:**
- Consumes: timeline items, temporal relations, selected facts, chronology prompts, `upsertTimelineItem`, and `upsertTemporalRelation`.
- Produces: ten-lane timeline grid, approximate/range editing, episode grouping, relation editing, and Fact-linked chronology summary.

- [ ] **Step 1: Write the failing timeline workflow test**

```tsx
test('edits a timeline item and saves a temporal relationship by keyboard', async () => {
  const user = userEvent.setup();
  renderApp(<TimelineWorkspace />);
  await user.click(screen.getByRole('button', { name: 'Edit F06 timeline event' }));
  await user.selectOptions(screen.getByLabelText('Timeline lane'), 'mood');
  await user.click(screen.getByRole('button', { name: 'Save event' }));
  expect(screen.getByRole('row', { name: /Mood.*F06/ })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Add temporal relationship' }));
  await user.selectOptions(screen.getByLabelText('From fact'), 'F02');
  await user.selectOptions(screen.getByLabelText('Relationship'), 'preceded');
  await user.selectOptions(screen.getByLabelText('To fact'), 'F03');
  await user.click(screen.getByRole('button', { name: 'Save relationship' }));
  expect(screen.getByText(/F02 preceded F03/)).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/timeline/TimelineWorkspace.test.tsx
```

Expected: FAIL because timeline controls are missing.

- [ ] **Step 3: Implement the ten-lane accessible grid**

Render Mood, Psychosis, Sleep and energy, Anxiety and trauma, Substance use, Medication, Medical and neurologic, Function, Stressors, and Treatment in that order. Use a semantic table/grid hybrid with sticky lane labels, time headers, text alternatives for every visual bar/point, and a minimum 720 px internal canvas with explicit horizontal overflow below 768 px. Solid line means ongoing, dotted line means probable/uncertain, filled dot means point event, and outlined dot means approximate.

- [ ] **Step 4: Implement event, episode, and relation editors**

Event fields map directly to `TimelineItem`; every Save dispatches an item with `learnerEdited: true`. Manual event entry reuses `nextFactId`, `upsertFact`, and paired `upsertTimelineItem` from Task 6 so every event remains a case fact. Episode IDs are learner-supplied short labels up to 80 characters through `GuardedTextArea`. Relationship choices are the eight approved `TemporalRelationKind` values. Prevent self-links and duplicate `{fromFactId,toFactId,kind}` triples. Every operation is available through labeled buttons/selects.

- [ ] **Step 5: Implement deterministic chronology guidance and summary**

`ChronologyPanel` renders `buildChronologyPrompts(workspace)`. The summary filters to `timelineItems.filter((item) => item.learnerEdited)`, sorts by numeric `sortOrder` ascending with original array index as the stable tie-break, and uses learner-saved labels only; each clause includes the source item's Fact IDs. The event editor changes `sortOrder` through the same visible time-column choices used by the grid, so relative labels, current presentation, and later absolute-date support never mix incompatible numeric units. Seed items remain visible on the grid but do not become learner-authored summary claims until edited. The summary never names a diagnosis. Selecting a citation highlights the event and evidence row.

- [ ] **Step 6: Pass tests and compare the desktop state**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/timeline/TimelineWorkspace.test.tsx
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; the default Timeline screen matches `docs/superpowers/specs/assets/clinical-reasoning-workbench/timeline.png` in rail widths, header/tabs, grid anatomy, selected F06 state, and chronology panel, with the approved clinical-copy corrections applied.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/features/timeline apps/clinical-reasoning-workbench/src/styles/features.css
git commit -m "feat: add psychiatric timeline builder"
```

---

### Task 8: Implement the MSE Translator and precise-language linter

**Files:**
- Modify: `apps/clinical-reasoning-workbench/src/features/mse/MseWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/mse/TermLibrary.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/mse/LanguageLinter.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/mse/MseWorkspace.test.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/domain/reducer.test.ts`
- Modify: `apps/clinical-reasoning-workbench/src/styles/features.css`

**Interfaces:**
- Consumes: selected facts, the 23-term lexicon, `lintLanguage`, `MseTranslation`, and `saveMseTranslation`.
- Produces: the four-stage observation-to-language workflow, explicit term selection, discriminating questions, advisory linter results, and a persisted Fact-linked translation.

- [ ] **Step 1: Write the failing MSE workflow test**

```tsx
test('saves an explicitly selected term with limitation and source fact', async () => {
  const user = userEvent.setup();
  renderApp(<MseWorkspace />, { workspace: makeAcknowledgedWorkspace() });
  await user.selectOptions(screen.getByLabelText('Raw observation fact'), 'F08');
  await user.type(screen.getByLabelText('Descriptive wording'), 'Speech is rapid.');
  expect(screen.getAllByRole('checkbox', { name: /Use .* term/ })).toHaveLength(23);
  await user.click(screen.getByRole('checkbox', { name: 'Use Rapid speech term' }));
  expect(screen.getByText(/Could the patient be interrupted/)).toBeVisible();
  await user.type(
    screen.getByLabelText('Limitation or alternative'),
    'Rate alone does not establish pressure or disorganization.',
  );
  await user.click(screen.getByRole('button', { name: 'Save MSE translation' }));
  expect(screen.getByText('Saved with F08')).toBeVisible();
});

test('shows advisory language feedback without replacing learner text', async () => {
  const user = userEvent.setup();
  renderApp(<MseWorkspace />, { workspace: makeAcknowledgedWorkspace() });
  await user.type(screen.getByLabelText('Descriptive wording'), 'The patient is a poor historian.');
  expect(screen.getByText(/History is limited by inconsistent recall/)).toBeVisible();
  expect(screen.getByLabelText('Descriptive wording')).toHaveValue('The patient is a poor historian.');
});

test('persists original wording and an edited accepted revision separately', () => {
  const translation: MseTranslation = {
    id: 'mse-F08',
    factIds: ['F08'],
    rawObservation: 'Speech is rapid.',
    descriptiveWording: 'Speech is rapid.',
    acceptedRevision: 'Speech rate is increased; interruptibility was not established.',
    termIds: ['rapid_speech'],
    limitationOrAlternative: 'The available history has source limitations.',
  };
  const state = workspaceReducer(makeAcknowledgedWorkspace(), { type: 'saveMseTranslation', translation });
  const storage = makeMemoryStorage();
  saveWorkspace(storage, state);
  const loaded = loadWorkspace(storage);
  expect(loaded.status).toBe('loaded');
  if (loaded.status === 'loaded') expect(loaded.workspace.mseTranslations[0]).toEqual(translation);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/mse/MseWorkspace.test.tsx
```

Expected: FAIL because the MSE feature has only a temporary heading.

- [ ] **Step 3: Implement the four approved stages**

Lay out `Raw observation`, `Descriptive wording`, `Supported MSE term`, and `Limitation or alternative` in that order. The raw-observation control lists facts and visibly separates direct observation, patient report, collateral, chart, and objective data. `TermLibrary` groups all 23 terms by domain, supplies text search, and uses real checkboxes so the learner—not the app—chooses each term. Show definition, observable support, limitation, every authored alternative, and one discriminating question for the selected term; alternatives are teaching prompts only and never auto-select/replace a term or learner wording.

- [ ] **Step 4: Implement validation and advisory linter behavior**

A saved `MseTranslation` requires at least one Fact ID, non-empty descriptive wording, at least one learner-selected term, and non-empty limitation/alternative text. Use `GuardedTextArea` for every free-text field. Keep `rawObservation` as the selected fact text. `descriptiveWording` always stores the learner's original text at the moment a linter alternative is first accepted (or the current text when no alternative is accepted). Clicking `Use this wording` stores the selected alternative in `acceptedRevision` and displays it for continued editing without overwriting `descriptiveWording`. Later edits update `acceptedRevision`; they never clear or replace `descriptiveWording`. `Revert to original wording` clears `acceptedRevision` and restores the original display; a subsequent edit creates a new revision while keeping the original frozen. Persist a discriminating answer only when the learner enters it.

`LanguageLinter` runs live in an `aria-live="polite"` region, displays every matching rule and alternative, and never mutates the field automatically. Summary generation uses `acceptedRevision ?? descriptiveWording` while the saved record retains both provenance values.

- [ ] **Step 5: Match the approved state and responsive stack**

At desktop width, preserve the accepted MSE concept's stage progression, term-library density, right teaching rail, selected-term treatment, and F08 source link. Below 768 px, stack the four stages in order without hiding the library or save action. Apply the required copy correction: use supplied rapid-speech data and leave interruptibility as a question rather than an observed fact.

- [ ] **Step 6: Pass focused tests and package checks**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/mse/MseWorkspace.test.tsx src/domain/reasoningChecks.test.ts
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; the saved translation includes `factIds: ['F08']`, `termIds: ['rapid_speech']`, and the entered limitation, while the original linter-triggering text remains unchanged until the learner accepts an alternative.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/features/mse apps/clinical-reasoning-workbench/src/domain/reducer.test.ts apps/clinical-reasoning-workbench/src/styles/features.css
git commit -m "feat: add MSE translation workflow"
```

---

### Task 9: Implement the evidence-linked Differential Matrix

**Files:**
- Modify: `apps/clinical-reasoning-workbench/src/features/differential/DifferentialWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/differential/EvidenceMenu.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/differential/HypothesisInspector.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/differential/ReasoningCheckPanel.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/differential/DifferentialWorkspace.test.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/styles/features.css`

**Interfaces:**
- Consumes: hypotheses, facts, learner level, `evaluateReasoningChecks`, `upsertHypothesis`, and `selectFavored`.
- Produces: the approved five-column matrix, keyboard evidence assignment, selected-row inspector, manual favored selection, and deterministic cognitive-forcing feedback.

- [ ] **Step 1: Write the failing matrix workflow test**

```tsx
test('links supports, contradictions, and missing information for two hypotheses', async () => {
  const user = userEvent.setup();
  renderApp(<DifferentialWorkspace />, { workspace: makeAcknowledgedWorkspace() });
  await user.click(screen.getByRole('button', { name: /Edit evidence for Bipolar I disorder/ }));
  await user.click(screen.getByRole('checkbox', { name: /F04 as supporting/ }));
  await user.click(screen.getByRole('checkbox', { name: /F05 as supporting/ }));
  await user.click(screen.getByRole('checkbox', { name: /F02 as contradicting/ }));
  await user.type(screen.getByLabelText('Missing information for Bipolar I disorder'), 'Whether beliefs persist outside mood symptoms.');
  await user.click(screen.getByRole('checkbox', { name: /Link F03 to missing information/ }));
  await user.click(screen.getByRole('button', { name: 'Save evidence links' }));
  await user.click(screen.getByRole('button', { name: /Edit evidence for Cannabis-associated psychosis/ }));
  await user.click(screen.getByRole('checkbox', { name: /F02 as supporting/ }));
  await user.click(screen.getByRole('checkbox', { name: /F05 as contradicting/ }));
  await user.type(screen.getByLabelText('Missing information for Cannabis-associated psychosis'), 'Whether symptoms persist without cannabis exposure.');
  await user.click(screen.getByRole('checkbox', { name: /Link F09 to missing information/ }));
  await user.click(screen.getByRole('button', { name: 'Save evidence links' }));
  await user.click(screen.getByRole('button', { name: /Favor Bipolar I disorder/ }));
  expect(screen.getByRole('row', { name: /Bipolar I disorder.*Favored/ })).toBeVisible();
  expect(screen.getByRole('row', { name: /Cannabis-associated psychosis.*F02.*F05.*persist without cannabis/ })).toBeVisible();
  expect(screen.queryByText(/%|probability|score/i)).not.toBeInTheDocument();
});

test('flags unsupported confidence deterministically', async () => {
  const user = userEvent.setup();
  renderApp(<DifferentialWorkspace />);
  await user.click(screen.getByRole('button', { name: /Favor Primary psychotic disorder/ }));
  expect(screen.getByText(/Add at least two supporting facts/)).toBeVisible();
});

test('adds a learner-authored hypothesis without generating one', async () => {
  const user = userEvent.setup();
  renderApp(<DifferentialWorkspace />, { workspace: makeAcknowledgedWorkspace() });
  await user.click(screen.getByRole('button', { name: 'Add hypothesis' }));
  await user.type(screen.getByLabelText('Hypothesis label'), 'Learner-authored alternative');
  await user.type(screen.getByLabelText('Category'), 'other');
  await user.click(screen.getByRole('button', { name: 'Save hypothesis' }));
  expect(screen.getByRole('row', { name: /Learner-authored alternative.*Plausible/ })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/differential/DifferentialWorkspace.test.tsx
```

Expected: FAIL because the differential feature has only a temporary heading.

- [ ] **Step 3: Implement the approved matrix anatomy**

Render a semantic table with `Hypothesis`, `Position`, `Supports`, `Contradicts`, and `Missing information` columns. Keep the four seeded rows in case order. `Add hypothesis` opens guarded label/category fields and saves a learner-authored row with ID `learner-hypothesis-${n}` where `n` is one plus the highest existing learner suffix, `position: 'plausible'`, empty evidence/gaps, `dangerousIfMissed: false`, and blank Fact-linked rationale/implications. The app never suggests or generates the label.

Evidence cells show Fact chips plus an `Edit evidence` button; `EvidenceMenu` assigns facts with labeled supporting/contradicting checkboxes and prohibits the same Fact ID in both arrays for one hypothesis. Missing-information entries accept text up to 500 characters and optional related Fact IDs. At widths below 768 px, retain a minimum 760 px internal table with horizontal scrolling and a sticky hypothesis column; do not convert rows to cards.

- [ ] **Step 4: Implement the selected-row inspector**

`HypothesisInspector` edits position, rationale, dangerous-if-missed, management implications, and `What would move this down?` using guarded free-text controls. Its ordinary position selector contains only `plausible`, `less_likely`, and `cannot_exclude`; the sole route to `favored` is the separate `Favor` action, which dispatches `selectFavored` and enforces the one-favorite transition. Store `What would move this down?` as the one `EvidenceGap` with ID `move-down-${hypothesis.id}` inside that hypothesis's `missingInformation`; update that entry in place instead of adding an undeclared model field. Rationale and non-empty management text each require at least one Fact ID. Use the corrected management prompt exactly: `Clarify immediate safety, observation, collateral, and medical/substance evaluation needs.` Do not expose probability, numeric confidence, score, autonomous ranking, medication, or treatment controls.

- [ ] **Step 5: Implement favored selection and cognitive forcing**

The visible `Favor` action dispatches `selectFavored`; selecting a second favorite demotes the previous one to `plausible`. `ReasoningCheckPanel` displays all six deterministic checks with `OK` or `Review` text and links each review item to the relevant row or evidence control. MS3 copy expands definitions/examples; resident copy foregrounds falsifiers, dangerous alternatives, and management implications.

- [ ] **Step 6: Pass focused tests and inspect the desktop state**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/differential/DifferentialWorkspace.test.tsx src/domain/reducer.test.ts src/domain/reasoningChecks.test.ts
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; two rows contain support, contradiction, and linked missing-information data; exactly one row is favored; and the screen matches `differential.png` in table density, inspector hierarchy, and reasoning-check placement with the approved clinical-copy correction.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/features/differential apps/clinical-reasoning-workbench/src/styles/features.css
git commit -m "feat: add evidence-linked differential matrix"
```

---

### Task 10: Implement the ordered Challenge Diagnosis workflow

**Files:**
- Create: `apps/clinical-reasoning-workbench/src/domain/disconfirmation.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/disconfirmation.test.ts`
- Modify: `apps/clinical-reasoning-workbench/src/features/challenge/ChallengeWorkspace.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/challenge/ChallengeStepper.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/challenge/RivalComparison.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/challenge/ChallengeWorkspace.test.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/App.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/test/fixtures.ts`
- Modify: `apps/clinical-reasoning-workbench/src/styles/features.css`

**Interfaces:**
- Consumes: one learner-favored hypothesis, non-favored rivals, `DisconfirmationDraft`, `saveDisconfirmationDraft`, and final `applyChallenge`.
- Produces: `createDisconfirmationDraft(favoredHypothesisId)`, `completeDisconfirmationDraft(draft)`, seven ordered stages, persisted draft responses, Fact-linked rival comparison, manual position update, and focus return to the changed differential row.

Extend the fixture file with:

```ts
export function makeAcknowledgedWorkspaceWithFavored(hypothesisId: string): WorkspaceState {
  return workspaceReducer(makeAcknowledgedWorkspace(), { type: 'selectFavored', hypothesisId });
}
```

- [ ] **Step 1: Write failing prerequisite and update tests**

```tsx
async function fillLinkedResponse(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  text: string,
  factId: string,
) {
  await user.type(screen.getByLabelText(label), text);
  await user.click(screen.getByRole('checkbox', { name: `Link ${factId} to ${label}` }));
}

test('blocks the challenge until the learner selects a favored hypothesis', () => {
  renderApp(<ChallengeWorkspace onReturnToDifferential={() => undefined} />);
  expect(screen.getByRole('heading', { name: 'Choose a favored hypothesis first' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Begin challenge' })).toBeDisabled();
});

test('persists stage-one work before a rival or position exists', () => {
  const state = makeAcknowledgedWorkspaceWithFavored('bipolar_psychotic_features');
  const draft = createDisconfirmationDraft('bipolar_psychotic_features');
  draft.claim = { text: 'The favored hypothesis links mood and psychotic findings.', factIds: ['F04'] };
  const next = workspaceReducer(state, { type: 'saveDisconfirmationDraft', draft });
  expect(next.disconfirmationDraft?.rivalHypothesisId).toBeUndefined();
  expect(next.disconfirmationDraft?.proposedPosition).toBeUndefined();
  expect(next.disconfirmationDraft?.claim.factIds).toEqual(['F04']);
});

test('saves a Fact-linked rival challenge and applies only the learner position', async () => {
  const user = userEvent.setup();
  const onReturn = vi.fn();
  renderApp(<ChallengeWorkspace onReturnToDifferential={onReturn} />, {
    workspace: makeAcknowledgedWorkspaceWithFavored('bipolar_psychotic_features'),
  });
  await fillLinkedResponse(user, 'Diagnostic claim', 'The favored hypothesis links mood and psychotic findings.', 'F04');
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await fillLinkedResponse(user, 'Phenomenology check', 'Clarify rapid speech without assuming pressure.', 'F08');
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await fillLinkedResponse(user, 'Time-course challenge', 'Clarify whether beliefs occur outside mood symptoms.', 'F03');
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await fillLinkedResponse(user, 'Substance, medication, and medical exclusions', 'Cannabis timing remains unresolved.', 'F02');
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await user.selectOptions(screen.getByLabelText('Strongest rival'), 'cannabis_associated_psychosis');
  await fillLinkedResponse(user, 'What does the rival explain better?', 'Cannabis escalation may track symptom emergence.', 'F02');
  await fillLinkedResponse(user, 'What does the rival explain worse?', 'Reduced sleep without fatigue remains less explained.', 'F05');
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await fillLinkedResponse(user, 'What finding would favor the rival?', 'A tighter temporal relationship to cannabis would favor it.', 'F02');
  await fillLinkedResponse(user, 'What finding would weaken the rival?', 'Symptoms independent of cannabis would weaken it.', 'F09');
  await fillLinkedResponse(user, 'What would substantially decrease confidence?', 'Psychotic symptoms outside mood changes would decrease confidence.', 'F03');
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await fillLinkedResponse(user, 'What remains unresolved?', 'The relationship between mood and psychosis remains unresolved.', 'F03');
  await fillLinkedResponse(
    user,
    'What is the next best discriminator?',
    'Clarify persistence without cannabis exposure and obtain longitudinal collateral.',
    'F02',
  );
  await user.selectOptions(screen.getByLabelText('New favored-hypothesis position'), 'plausible');
  await user.click(screen.getByRole('button', { name: 'Update differential' }));
  expect(onReturn).toHaveBeenCalledWith('bipolar_psychotic_features');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/challenge/ChallengeWorkspace.test.tsx
```

Expected: FAIL because the challenge feature and callback contract are missing.

- [ ] **Step 3: Implement the seven ordered stages**

Use these exact stages and field ownership:

1. `State the claim` — `claim`;
2. `Check the phenomenology` — `phenomenologyCheck`;
3. `Challenge the time course` — `timeCourseChallenge`;
4. `Review exclusions` — `exclusionsReview`;
5. `Compare the strongest rival` — `rivalHypothesisId`, `rivalExplainsBetter`, `rivalExplainsWorse`;
6. `Try to disconfirm` — `findingFavoringRival`, `findingWeakeningRival`, `confidenceDecreaser`;
7. `Revise and discriminate` — `unresolved`, `nextDiscriminator`, `proposedPosition`.

Create and complete drafts through these exact domain helpers:

```ts
const emptyLinkedText = (): FactLinkedText => ({ text: '', factIds: [] });

export function createDisconfirmationDraft(favoredHypothesisId: string): DisconfirmationDraft {
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

export function completeDisconfirmationDraft(draft: DisconfirmationDraft): DisconfirmationRecord {
  if (!draft.rivalHypothesisId) throw new Error('Select the strongest rival');
  if (!draft.proposedPosition) throw new Error('Select the new favored-hypothesis position');
  const values = [
    draft.claim, draft.phenomenologyCheck, draft.timeCourseChallenge, draft.exclusionsReview,
    draft.rivalExplainsBetter, draft.rivalExplainsWorse, draft.findingFavoringRival,
    draft.findingWeakeningRival, draft.confidenceDecreaser, draft.unresolved, draft.nextDiscriminator,
  ];
  if (values.some((value) => !value.text.trim() || value.factIds.length === 0)) {
    throw new Error('Complete every challenge response with a Fact link');
  }
  return { ...draft, rivalHypothesisId: draft.rivalHypothesisId, proposedPosition: draft.proposedPosition };
}
```

Each response uses `GuardedTextArea`, requires at least one Fact ID, and is bounded at 600 characters. At stage 1, initialize `DisconfirmationDraft` with the favorite ID, all eleven `FactLinkedText` values as `{ text: '', factIds: [] }`, and no rival/position. Every `Save and continue` dispatches `saveDisconfirmationDraft` with the accumulated draft. Stage 5 adds `rivalHypothesisId`; stage 7 adds `proposedPosition`. The Next button remains disabled until the current stage's required text and Fact links are valid. Completed stages remain editable, but a later stage cannot be opened until all earlier stages validate.

- [ ] **Step 4: Implement the rival comparison and clinical boundary**

The rival selector lists only non-favored hypotheses already present in the matrix. Desktop shows favored and rival side-by-side; below 768 px it stacks favored then rival. Display supports, contradictions, source reliability, and learner responses without scores. Use this corrected next-discriminator guidance exactly: `Clarify whether symptoms persist during a verified period without cannabis exposure and obtain longitudinal collateral.` Do not add a duration, toxicology instruction, medication recommendation, or app-generated position.

- [ ] **Step 5: Apply the learner's update and restore focus**

`Update differential` converts the fully populated draft to a `DisconfirmationRecord` only after asserting both `rivalHypothesisId` and `proposedPosition` are present, then dispatches `applyChallenge({ record })`; the reducer adds `appliedAt`, clears `disconfirmationDraft`, and stores the applied record. It then calls `onReturnToDifferential(favoredHypothesisId)`. `App` changes the active tab to `differential`; `DifferentialWorkspace` accepts `focusHypothesisId` and focuses the changed row heading after render. The reducer must not alter any other hypothesis position except the single-favorite invariant when the proposed position is `favored`.

- [ ] **Step 6: Pass tests and inspect the challenge state**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/features/challenge/ChallengeWorkspace.test.tsx src/domain/disconfirmation.test.ts src/domain/reducer.test.ts
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; drafts survive tab changes, the rival cannot equal the favorite, no stage can be skipped, and the screen matches `challenge-diagnosis.png` in stepper, comparison, form hierarchy, and action placement with the corrected discriminator copy.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/domain/disconfirmation* apps/clinical-reasoning-workbench/src/features/challenge apps/clinical-reasoning-workbench/src/features/differential/DifferentialWorkspace.tsx apps/clinical-reasoning-workbench/src/App.tsx apps/clinical-reasoning-workbench/src/test/fixtures.ts apps/clinical-reasoning-workbench/src/styles/features.css
git commit -m "feat: add diagnostic disconfirmation workflow"
```

---

### Task 11: Generate, copy, and export the deterministic Fact-linked summary

**Files:**
- Create: `apps/clinical-reasoning-workbench/src/domain/summary.ts`
- Create: `apps/clinical-reasoning-workbench/src/domain/summary.test.ts`
- Create: `apps/clinical-reasoning-workbench/src/features/summary/SummaryPanel.tsx`
- Create: `apps/clinical-reasoning-workbench/src/features/summary/SummaryPanel.test.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/components/Header.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/App.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/test/fixtures.ts`
- Modify: `apps/clinical-reasoning-workbench/src/styles/features.css`

**Interfaces:**
- Consumes: saved learner-authored timeline, MSE, favored-hypothesis, and challenge state.
- Produces: `buildSummary(workspace, mseTerms)`, `formatSummaryBody(clauses)`, `formatSummaryExport(workspace, clauses, exportedAt)`, `copySummary(text, clipboard)`, `downloadSummary(text, document, urlApi)`, and a visible `SummaryPanel`.

Build the completed summary fixture from real reducer transitions so it exercises the historical-favorite case:

```ts
const linked = (text: string, factId: string): FactLinkedText => ({ text, factIds: [factId] });

export function makeCompletedWorkspace(): WorkspaceState {
  let state = makeAcknowledgedWorkspaceWithFavored('bipolar_psychotic_features');
  const timelineItem = state.timelineItems.find((item) => item.factIds.includes('F06'))!;
  state = workspaceReducer(state, {
    type: 'upsertTimelineItem',
    item: { ...timelineItem, lane: 'mood', label: 'Collateral reports increased spending.', learnerEdited: true },
  });
  state = workspaceReducer(state, {
    type: 'saveMseTranslation',
    translation: {
      id: 'mse-F08',
      factIds: ['F08'],
      rawObservation: 'Speech is rapid.',
      descriptiveWording: 'Speech is rapid.',
      termIds: ['rapid_speech'],
      limitationOrAlternative: 'Rate alone does not establish pressure or disorganization.',
    },
  });
  const bipolar = state.hypotheses.find((item) => item.id === 'bipolar_psychotic_features')!;
  state = workspaceReducer(state, {
    type: 'upsertHypothesis',
    hypothesis: {
      ...bipolar,
      supportingFactIds: ['F04', 'F05'],
      contradictingFactIds: ['F02'],
      missingInformation: [{
        id: 'mood-psychosis-time-course',
        text: 'Whether beliefs persist outside mood symptoms.',
        relatedFactIds: ['F03'],
      }],
      rationale: linked('Reduced sleep without fatigue supports the learner-selected hypothesis.', 'F05'),
      managementImplications: linked('Clarify safety, collateral, and medical/substance evaluation needs.', 'F02'),
    },
  });
  const record: DisconfirmationRecord = {
    favoredHypothesisId: 'bipolar_psychotic_features',
    claim: linked('The favored hypothesis links mood and psychotic findings.', 'F04'),
    phenomenologyCheck: linked('Clarify rapid speech without assuming pressure.', 'F08'),
    timeCourseChallenge: linked('Clarify whether beliefs occur outside mood symptoms.', 'F03'),
    exclusionsReview: linked('Cannabis timing remains unresolved.', 'F02'),
    rivalHypothesisId: 'cannabis_associated_psychosis',
    rivalExplainsBetter: linked('Cannabis escalation may track symptom emergence.', 'F02'),
    rivalExplainsWorse: linked('Reduced sleep without fatigue remains less explained.', 'F05'),
    findingFavoringRival: linked('A tighter temporal relationship to cannabis would favor it.', 'F02'),
    findingWeakeningRival: linked('Symptoms independent of cannabis would weaken it.', 'F09'),
    confidenceDecreaser: linked('Psychotic symptoms outside mood changes would decrease confidence.', 'F03'),
    unresolved: linked('The relationship between mood and psychosis remains unresolved.', 'F03'),
    nextDiscriminator: linked('Clarify persistence without cannabis exposure and obtain longitudinal collateral.', 'F02'),
    proposedPosition: 'plausible',
  };
  return workspaceReducer(state, { type: 'applyChallenge', record });
}
```

- [ ] **Step 1: Write failing summary and export tests**

```ts
test('omits unfinished sections and never adds an absent clinical fact', () => {
  const workspace = makeCompletedWorkspace();
  workspace.mseTranslations = [];
  const clauses = buildSummary(workspace, loadRuntimeContent().mseTerms);
  expect(clauses.map((item) => item.id)).toEqual(['chronology', 'favored-hypothesis', 'disconfirmation']);
  expect(workspace.hypotheses.some((item) => item.position === 'favored')).toBe(false);
  expect(clauses.find((item) => item.id === 'favored-hypothesis')?.text).toContain('Bipolar I disorder');
  expect(clauses.every((item) => item.factIds.length > 0)).toBe(true);
  expect(clauses.map((item) => item.text).join(' ')).not.toMatch(/4–6 weeks|toxicology|mood stabilizer|antipsychotic/i);
});

test('formats the exact synthetic-use export header', () => {
  const workspace = makeCompletedWorkspace();
  const clauses = buildSummary(workspace, loadRuntimeContent().mseTerms);
  const text = formatSummaryExport(workspace, clauses, new Date('2026-07-12T16:00:00.000Z'));
  expect(text.split('\n').slice(0, 5)).toEqual([
    'Synthetic educational exercise — not for clinical use',
    'Case: first_episode_001 (version 1)',
    'Learner level: MS3',
    'Exported: 2026-07-12T16:00:00.000Z',
    '',
  ]);
});

test('a later current favorite takes precedence over applied challenge history', () => {
  let workspace = makeCompletedWorkspace();
  const primary = workspace.hypotheses.find((item) => item.id === 'primary_psychotic_disorder')!;
  workspace = workspaceReducer(workspace, {
    type: 'upsertHypothesis',
    hypothesis: { ...primary, supportingFactIds: ['F03'] },
  });
  workspace = workspaceReducer(workspace, { type: 'selectFavored', hypothesisId: primary.id });
  const favored = buildSummary(workspace, loadRuntimeContent().mseTerms)
    .find((item) => item.id === 'favored-hypothesis');
  expect(favored?.text).toContain('Primary psychotic disorder');
  expect(favored?.text).not.toContain('Bipolar I disorder');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/summary.test.ts src/features/summary/SummaryPanel.test.tsx
```

Expected: FAIL because summary assembly and UI do not exist.

- [ ] **Step 3: Implement deterministic clause assembly**

`buildSummary(workspace, mseTerms)` receives the already-validated lexicon from `useWorkspace().content` and returns clauses in this exact order, omitting any section without saved learner work:

1. `chronology` — oldest-to-current `learnerEdited: true` timeline labels joined with semicolons; Fact IDs are the stable union from those items;
2. `mse` — `acceptedRevision ?? descriptiveWording`, learner-selected term labels, and limitation/alternative; Fact IDs come only from saved translations;
3. `favored-hypothesis` — prefix `Learner-selected favored hypothesis:`, then the selected label and saved supporting, contradicting, and missing-information text. Select the current `position === 'favored'` first; use `workspace.disconfirmation?.favoredHypothesisId` only when no current favorite remains after an applied challenge. Fact IDs are the union of linked supports, contradictions, rationale, implications, and related missing-information facts. Omit this clause if the subject has no linked facts;
4. `disconfirmation` — only when the applied `disconfirmation` record exists; prefix `After diagnostic challenge, learner-selected position:`, then proposed position, saved unresolved text, and next discriminator. Fact IDs come only from the corresponding saved fields. Never summarize `disconfirmationDraft`.

Resolve every saved `termId` against the supplied `mseTerms`; the restored-workspace check in Task 4 prevents unknown IDs, and a defensive unknown-ID error names the translation and term rather than inventing a label. Deduplicate Fact IDs while preserving first appearance. Never infer connective clinical facts, a diagnosis, probability, recommendation, or missing section. Validate with `assertWorkspaceIntegrity({ ...workspace, summary: clauses })`, then return the clauses. On Summary-panel open, dispatch `setSummary` with that result. Every later non-summary reducer action clears `workspace.summary`, so a later open always rebuilds rather than showing stale derived text.

- [ ] **Step 4: Implement visible citations and recovery states**

`SummaryPanel` renders one paragraph per clause with clickable `FactChip` citations. Clicking a citation selects the Fact ID and opens/focuses the evidence row. Empty state says `Complete and save work in the modules to build a summary.` Copy failure says `Copy is unavailable in this browser. Select the text below instead.` Export failure leaves the summary visible and says `The summary could not be downloaded. Try Copy summary.`

- [ ] **Step 5: Implement copy and UTF-8 text download**

`formatSummaryBody` returns exactly the visible clauses as `${text} [${factIds.join(', ')}]` separated by a blank line. `copySummary` receives `navigator.clipboard` as an injected interface and writes that visible body exactly. `formatSummaryExport` prepends the exact five-line header from the test to the same body. `downloadSummary` creates a UTF-8 `text/plain;charset=utf-8` Blob from the export text, clicks a temporary anchor named `clinical-reasoning-summary-first_episode_001.txt`, revokes its object URL, and never emits JSON or an importable case file.

- [ ] **Step 6: Integrate the header action and pass tests**

The accepted `Export summary` header control opens `SummaryPanel`; it does not create a fifth tab. Add `Copy summary`, `Export summary`, and `Close summary` controls inside the panel with focus trapping and focus return. Run:

```bash
npm test --prefix apps/clinical-reasoning-workbench -- src/domain/summary.test.ts src/features/summary/SummaryPanel.test.tsx
npm run typecheck --prefix apps/clinical-reasoning-workbench
```

Expected: PASS; copied text matches the visible body byte-for-byte, the downloaded text contains the required metadata header plus that exact body, citations focus evidence, and no unfinished section appears.

- [ ] **Step 7: Commit**

```bash
git add apps/clinical-reasoning-workbench/src/domain/summary* apps/clinical-reasoning-workbench/src/features/summary apps/clinical-reasoning-workbench/src/components/Header.tsx apps/clinical-reasoning-workbench/src/App.tsx apps/clinical-reasoning-workbench/src/test/fixtures.ts apps/clinical-reasoning-workbench/src/styles/features.css
git commit -m "feat: export fact-linked reasoning summary"
```

---

### Task 12: Integrate the hidden preview into both static-site builds and CI

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh`
- Modify: `13_Faculty_Resources/_automation/site_build/site_manifest.json`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `tool_registry.json`
- Modify: `13_Faculty_Resources/reviewed.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/smoke/package.json`
- Modify: `tests/smoke/playwright.config.js`
- Create: `tests/smoke/clinical-reasoning-workbench.spec.js`

**Interfaces:**
- Consumes: the app package's single-file `/_dist/clinical-reasoning-workbench/index.html` and the current static-site source map/nav/registry contracts.
- Produces: hidden MS3 and resident preview routes at `?tool=clinical-reasoning-workbench.html`, pending faculty-attestation metadata, and a real browser end-to-end gate.

- [ ] **Step 1: Write the failing static integration assertions**

Create the Playwright spec with two smoke checks before wiring the build:

```js
import { expect, test } from '@playwright/test';

const sites = [
  ['MS3', process.env.MS3_BASE_URL || 'http://localhost:4200'],
  ['Resident', process.env.RES_BASE_URL || 'http://localhost:4201'],
];

for (const [label, baseURL] of sites) {
  test(`${label} ships the hidden workbench without sidebar exposure`, async ({ page }) => {
    await page.goto(`${baseURL}/?tool=clinical-reasoning-workbench.html`);
    const tool = page.frameLocator('#content iframe.toolframe');
    await expect(tool.getByRole('heading', { name: 'Clinical Reasoning Workbench' })).toBeVisible();
    await page.goto(baseURL);
    await expect(page.locator('.navitem[data-f="clinical-reasoning-workbench.html"]')).toBeHidden();
  });
}
```

- [ ] **Step 2: Run the build to verify the new route is absent**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
test -s _build/ms3/tools/clinical-reasoning-workbench.html
```

Expected: `build_and_check.sh ms3` exits 0 at the existing baseline; `test -s ...` exits 1 because the new artifact is not registered.

- [ ] **Step 3: Build the app before the existing static preflight**

In `build_and_check.sh`, define `APP="$LIB/apps/clinical-reasoning-workbench"`. Before `validate_topic_meta.py`, run `npm ci --prefix "$APP"` only when `$APP/node_modules` is absent, then always run `npm run build --prefix "$APP"`. This makes clean Netlify builds self-sufficient while avoiding a second install when the `res` build follows `ms3` in the same job.

Add this exact manifest tool tuple next to the legacy reasoning tool:

```json
[
  "_dist/clinical-reasoning-workbench/index.html",
  "clinical-reasoning-workbench.html",
  "Clinical Reasoning Workbench"
]
```

- [ ] **Step 4: Register a hidden route in both nav builders**

Add `clinical-reasoning-workbench.html` to both `HIDDEN_TOOLS` sets. In the MS3 `Understand the Problem` items, place `_tool("clinical-reasoning-workbench.html", "Clinical Reasoning Workbench", True)` immediately after the legacy tool. In resident `TOOLS`, add the tuple `("clinical-reasoning-workbench.html", "Clinical Reasoning Workbench")`; in resident `Understand the Problem`, add the separate nav dict `{"t":"Clinical Reasoning Workbench","f":"clinical-reasoning-workbench.html","k":"tool","hidden":True}` immediately after the legacy tool. Do not change or hide `diagnostic-reasoning.html`; both tools ship, but only the legacy tool remains learner-visible.

- [ ] **Step 5: Add governance metadata without attesting clinical content**

Add this `tool_registry.json` entry beside the legacy reasoning entry:

```json
{
  "file": "clinical-reasoning-workbench.html",
  "title": "Clinical Reasoning Workbench",
  "sourcePath": "apps/clinical-reasoning-workbench/index.html",
  "category": "clinical-reasoning",
  "riskLevel": "moderate",
  "disclaimerType": "fictional-simulation-supervision",
  "storageKeys": ["cw_reason_workbench_v1"],
  "evidenceIds": [],
  "relatedPages": ["diagnostic-reasoning.html", "ddx.md", "pg_formulation.md", "mse.html", "t_mood.md", "t_psychosis.md", "t_sud.md"]
}
```

Add this `reviewed.json` entry; do not mark it reviewed:

```json
"clinical-reasoning-workbench.html": {
  "status": "pending",
  "at": "2026-07-12",
  "by": "Joshua Moss, MD",
  "note": "Hidden staged preview. Synthetic case, MSE lexicon, linter rules, prompts, and teaching copy require faculty attestation before learner-facing release."
}
```

- [ ] **Step 6: Add reproducible CI and the full browser workflow**

For both CI jobs, set `node-version: "20.19.0"` and add npm caching with both lockfile paths. Before site builds, run `npm ci --prefix apps/clinical-reasoning-workbench` and `npm run verify --prefix apps/clinical-reasoning-workbench`. In the smoke job, keep the existing Playwright install and add the `workbench` project to `playwright.config.js` with `testMatch: 'clinical-reasoning-workbench.spec.js'` and Desktop Chrome. Add `test:workbench` to `tests/smoke/package.json` and run `npx playwright test --project=workbench` as a fourth CI smoke check.

Add this complete MS3 workflow to the same Playwright file (the component labels are the contracts established in Tasks 6–11):

```js
async function fillLinkedResponse(tool, label, text, factId) {
  await tool.getByLabel(label).fill(text);
  await tool.getByRole('checkbox', { name: `Link ${factId} to ${label}` }).check();
}

test('MS3 completes, exports, and reloads the persisted vertical slice', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const baseURL = process.env.MS3_BASE_URL || 'http://localhost:4200';
  await page.goto(baseURL);
  await page.evaluate(() => localStorage.removeItem('cw_reason_workbench_v1'));
  await page.goto(`${baseURL}/?tool=clinical-reasoning-workbench.html&case=first_episode_001&level=ms3`);
  const tool = page.frameLocator('#content iframe.toolframe');
  await expect(tool.getByRole('heading', { name: 'Clinical Reasoning Workbench' })).toBeVisible();

  for (const [factId, exactText] of [
    ['F01', 'Collateral describes academic decline and social withdrawal.'],
    ['F02', 'Patient reports increasingly heavy cannabis use.'],
    ['F03', 'Patient reports that neighbors are monitoring him.'],
  ]) {
    await tool.getByRole('button', { name: `Edit ${factId}` }).click();
    const gate = tool.getByRole('dialog', { name: 'Fictional data only' });
    if (await gate.isVisible().catch(() => false)) {
      await gate.getByRole('button', { name: 'Continue with fictional data' }).click();
    }
    await tool.getByLabel('Fact text').fill(exactText);
    await tool.getByRole('button', { name: 'Save fact' }).click();
  }

  await tool.getByRole('tab', { name: 'Timeline' }).click();
  await tool.getByRole('button', { name: 'Edit F06 timeline event' }).click();
  await tool.getByLabel('Timeline lane').selectOption('mood');
  await tool.getByRole('button', { name: 'Save event' }).click();
  await tool.getByRole('button', { name: 'Add temporal relationship' }).click();
  await tool.getByLabel('From fact').selectOption('F02');
  await tool.getByLabel('Relationship').selectOption('preceded');
  await tool.getByLabel('To fact').selectOption('F03');
  await tool.getByRole('button', { name: 'Save relationship' }).click();

  await tool.getByRole('tab', { name: 'MSE' }).click();
  await tool.getByLabel('Raw observation fact').selectOption('F08');
  await tool.getByLabel('Descriptive wording').fill('Speech is rapid.');
  await tool.getByRole('checkbox', { name: 'Use Rapid speech term' }).check();
  await tool.getByLabel('Limitation or alternative').fill('Rate alone does not establish pressure or disorganization.');
  await tool.getByRole('button', { name: 'Save MSE translation' }).click();

  await tool.getByRole('tab', { name: 'Differential' }).click();
  await tool.getByRole('button', { name: /Edit evidence for Bipolar I disorder/ }).click();
  await tool.getByRole('checkbox', { name: /F04 as supporting/ }).check();
  await tool.getByRole('checkbox', { name: /F05 as supporting/ }).check();
  await tool.getByRole('checkbox', { name: /F02 as contradicting/ }).check();
  await tool.getByLabel('Missing information for Bipolar I disorder').fill('Whether beliefs persist outside mood symptoms.');
  await tool.getByRole('checkbox', { name: /Link F03 to missing information/ }).check();
  await tool.getByRole('button', { name: 'Save evidence links' }).click();
  await tool.getByRole('button', { name: /Edit evidence for Cannabis-associated psychosis/ }).click();
  await tool.getByRole('checkbox', { name: /F02 as supporting/ }).check();
  await tool.getByRole('checkbox', { name: /F05 as contradicting/ }).check();
  await tool.getByLabel('Missing information for Cannabis-associated psychosis').fill('Whether symptoms persist without cannabis exposure.');
  await tool.getByRole('checkbox', { name: /Link F09 to missing information/ }).check();
  await tool.getByRole('button', { name: 'Save evidence links' }).click();
  await tool.getByRole('button', { name: /Favor Bipolar I disorder/ }).click();

  await tool.getByRole('tab', { name: 'Challenge Diagnosis' }).click();
  await fillLinkedResponse(tool, 'Diagnostic claim', 'The favored hypothesis links mood and psychotic findings.', 'F04');
  await tool.getByRole('button', { name: 'Save and continue' }).click();
  await fillLinkedResponse(tool, 'Phenomenology check', 'Clarify rapid speech without assuming pressure.', 'F08');
  await tool.getByRole('button', { name: 'Save and continue' }).click();
  await fillLinkedResponse(tool, 'Time-course challenge', 'Clarify whether beliefs occur outside mood symptoms.', 'F03');
  await tool.getByRole('button', { name: 'Save and continue' }).click();
  await fillLinkedResponse(tool, 'Substance, medication, and medical exclusions', 'Cannabis timing remains unresolved.', 'F02');
  await tool.getByRole('button', { name: 'Save and continue' }).click();
  await tool.getByLabel('Strongest rival').selectOption('cannabis_associated_psychosis');
  await fillLinkedResponse(tool, 'What does the rival explain better?', 'Cannabis escalation may track symptom emergence.', 'F02');
  await fillLinkedResponse(tool, 'What does the rival explain worse?', 'Reduced sleep without fatigue remains less explained.', 'F05');
  await tool.getByRole('button', { name: 'Save and continue' }).click();
  await fillLinkedResponse(tool, 'What finding would favor the rival?', 'A tighter temporal relationship to cannabis would favor it.', 'F02');
  await fillLinkedResponse(tool, 'What finding would weaken the rival?', 'Symptoms independent of cannabis would weaken it.', 'F09');
  await fillLinkedResponse(tool, 'What would substantially decrease confidence?', 'Psychotic symptoms outside mood changes would decrease confidence.', 'F03');
  await tool.getByRole('button', { name: 'Save and continue' }).click();
  await fillLinkedResponse(tool, 'What remains unresolved?', 'The relationship between mood and psychosis remains unresolved.', 'F03');
  await fillLinkedResponse(tool, 'What is the next best discriminator?', 'Clarify persistence without cannabis exposure and obtain longitudinal collateral.', 'F02');
  await tool.getByLabel('New favored-hypothesis position').selectOption('plausible');
  await tool.getByRole('button', { name: 'Update differential' }).click();

  await tool.getByRole('button', { name: 'Export summary' }).first().click();
  const summary = tool.getByRole('dialog', { name: 'Evidence-linked summary' });
  await expect(summary.getByText(/Learner-selected favored hypothesis/)).toBeVisible();
  await summary.getByRole('button', { name: 'Copy summary' }).click();
  const downloadPromise = page.waitForEvent('download');
  await summary.getByRole('button', { name: 'Export summary' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('clinical-reasoning-summary-first_episode_001.txt');

  const beforeReload = await page.evaluate(() => localStorage.getItem('cw_reason_workbench_v1'));
  expect(beforeReload).not.toBeNull();
  await page.reload();
  await expect(tool.getByRole('heading', { name: 'Clinical Reasoning Workbench' })).toBeVisible();
  const afterReload = await page.evaluate(() => localStorage.getItem('cw_reason_workbench_v1'));
  expect(afterReload).not.toBeNull();
  expect(JSON.parse(afterReload)).toEqual(JSON.parse(beforeReload));
  expect(consoleErrors).toEqual([]);
});
```

Configure the `workbench` project with `permissions: ['clipboard-read', 'clipboard-write']`. Resident receives the route/no-sidebar and load checks because it ships the identical built artifact.

- [ ] **Step 7: Run all integration checks**

Run in separate terminals after starting both local servers:

```bash
npm ci --prefix apps/clinical-reasoning-workbench
npm run verify --prefix apps/clinical-reasoning-workbench
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 -m http.server 4200 --directory _build/ms3
python3 -m http.server 4201 --directory _build/res
npm ci --prefix tests/smoke
npm test --prefix tests/smoke -- --project=workbench
```

Expected: package verification passes; both static gates end in `build_and_check: ms3 OK` / `res OK`; the app exists once in each `/tools` directory; the hidden route loads in both sites; the full MS3 workflow persists and exports; no console errors occur.

- [ ] **Step 8: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_and_check.sh 13_Faculty_Resources/_automation/site_build/site_manifest.json 13_Faculty_Resources/_automation/site_build/build_deploy.py 13_Faculty_Resources/_automation/site_build/resident_section.py tool_registry.json 13_Faculty_Resources/reviewed.json .github/workflows/ci.yml tests/smoke
git commit -m "build: publish hidden reasoning workbench preview"
```

---

### Task 13: Complete agency-signoff fidelity, accessibility, and release verification

**Files:**
- Create: `docs/superpowers/verification/2026-07-12-clinical-reasoning-workbench-fidelity.md`
- Modify: `apps/clinical-reasoning-workbench/src/App.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/components/AppShell.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/components/Header.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/components/TabNav.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/components/EvidenceDrawer.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/features/timeline/TimelineWorkspace.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/features/mse/MseWorkspace.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/features/differential/DifferentialWorkspace.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/features/challenge/ChallengeWorkspace.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/features/summary/SummaryPanel.tsx`
- Modify: `apps/clinical-reasoning-workbench/src/styles/tokens.css`
- Modify: `apps/clinical-reasoning-workbench/src/styles/base.css`
- Modify: `apps/clinical-reasoning-workbench/src/styles/shell.css`
- Modify: `apps/clinical-reasoning-workbench/src/styles/features.css`
- Modify: `tests/smoke/clinical-reasoning-workbench.spec.js`

**Interfaces:**
- Consumes: all four accepted concept PNGs, the hidden built route, and the complete vertical-slice test.
- Produces: four faithful responsive states, a written 20-point minimum fidelity ledger, verified keyboard and persistence behavior, and a clean implementation handoff.

- [ ] **Step 1: Run the complete nonvisual gate from a clean install**

Run:

```bash
npm ci --prefix apps/clinical-reasoning-workbench
npm run verify --prefix apps/clinical-reasoning-workbench
npm ci --prefix tests/smoke
npm exec --prefix tests/smoke -- playwright install chromium
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Then start `python3 -m http.server 4200 --directory _build/ms3` in terminal A and `python3 -m http.server 4201 --directory _build/res` in terminal B. In terminal C, wait until `http://localhost:4200/` and `http://localhost:4201/` respond, then run:

```bash
npm test --prefix tests/smoke -- --project=workbench --project=nav-ms3 --project=nav-res
```

Expected: every command exits 0. If a broader pre-existing check fails outside this workbench, record the exact command/failure separately and still rerun every targeted workbench check to distinguish targeted success from baseline failure.

- [ ] **Step 2: Verify the real app with Browser/IAB first**

Use the `browser:control-in-app-browser` skill against the hidden MS3 route. Complete the vertical slice without test-only helpers, then reload and verify saved state. Repeat the core shell/drawer checks at 1504×1046, 834×1112, and 390×844; verify 1506×1044 for Differential and 1503×1047 for MSE to match their concepts' native dimensions. Check all four tabs, summary copy/download, invalid-storage recovery, storage-write failure messaging, dark theme, reduced motion, and zero console errors. Use Playwright Chromium only if Browser/IAB is unavailable or unreliable, and record the concrete fallback reason.

- [ ] **Step 3: Capture and inspect all four concept/render pairs**

Capture fresh browser screenshots in a temporary untracked directory for Timeline (1504×1046), MSE (1503×1047), Differential (1506×1044), and Challenge (1504×1046). Use `view_image` on each accepted concept and its latest browser screenshot in the same QA pass. Do not hand off while a pair has fixable drift in copy, header/tabs, rail widths, hierarchy, typography, palette, border/radius treatment, icon metaphor/stroke, selected states, table/grid density, or responsive behavior.

- [ ] **Step 4: Write and satisfy the fidelity ledger**

Create the verification document with one table per state and at least five concrete rows per table. Every row records `Comparison point`, `Concept evidence`, `Browser evidence`, `Mismatch`, and `Fix or intentional deviation`. Include the above-the-fold copy diff for each state. The only allowed intentional copy deviations are the four required clinical corrections already recorded in the design spec; all visual differences are repaired. End the document with:

- Browser/IAB method or exact Playwright fallback reason;
- native dimensions checked;
- `view_image` confirmation for all eight images;
- keyboard-only workflow result;
- local persistence/recovery result;
- console-error result;
- exact test/build commands and outcomes;
- explicit agency-signoff answer.

- [ ] **Step 5: Complete keyboard and WCAG-focused checks**

Using only Tab, Shift+Tab, Enter, Space, arrow keys, and Escape, complete the vertical slice and confirm focus visibility/return for tabs, drawers, dialogs, evidence menus, summary, and the post-challenge differential row. Inspect semantic table headers, labels/descriptions, `aria-live` save/linter status, skip link, heading order, 44×44 touch targets below 1100 px, and color-independent states. Run a browser accessibility scan if the Browser tool exposes one; any serious or critical issue blocks completion.

- [ ] **Step 6: Repair findings and rerun the affected gate after every change**

For domain/state changes, rerun the focused Vitest file plus typecheck. For component/style changes, rerun the focused React test, Browser/IAB state, and its concept/render `view_image` pair. For build/registry changes, rerun both static builds and the workbench Playwright project. Continue until the ledger has no unresolved fixable mismatch, no placeholder/debug UI, no stale QA artifact, and no console error.

- [ ] **Step 7: Final repository audit and verification commit**

Run:

```bash
git status --short
git diff --check
git diff --stat 9d7456e..HEAD
git diff --exit-code 9d7456e -- 02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html reasoning_cases.json reasoning_cases_resident.json
if rg -n --glob '!*.test.*' "cw_reason_v1|4–6 weeks|toxicology|mood stabilizer|antipsychotic" apps/clinical-reasoning-workbench/src; then exit 1; fi
rg -n "cw_reason_workbench_v1" apps/clinical-reasoning-workbench/src apps/clinical-reasoning-workbench/index.html
```

Expected: only intentional implementation/verification files are changed; no whitespace errors; the base-to-HEAD legacy diff is empty; the negated production scan exits 0 because no prohibited legacy key/mockup clinical string is found; the new storage-key scan reports only `cw_reason_workbench_v1`. Delete the scoped temporary screenshot directory and generated test artifacts, then commit any final fidelity fixes plus the verification document:

```bash
git add apps/clinical-reasoning-workbench tests/smoke/clinical-reasoning-workbench.spec.js docs/superpowers/verification/2026-07-12-clinical-reasoning-workbench-fidelity.md
git commit -m "test: verify reasoning workbench fidelity"
```

- [ ] **Step 8: Prepare the implementation handoff**

Report the architecture summary, grouped files created/changed, four screenshots, Browser/IAB method or fallback reason, all native sizes, at least five comparison points per state, copy-diff result, material mismatches fixed, core workflow result, exact test/build outcomes, accessibility checks, known limitations, specification deviations (including the four approved clinical-copy corrections), and the recommended next milestone. The next milestone recommendation is faculty attestation of the case/lexicon/linter/prompts/teaching copy, followed only then by a separately approved legacy-case migration/cutover. State explicitly whether a skilled design agency would sign off on the implementation; if the answer is not an unqualified yes, return to Step 6.
