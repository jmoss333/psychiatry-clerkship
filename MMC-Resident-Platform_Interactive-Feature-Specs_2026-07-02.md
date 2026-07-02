# MMC Sanford Psychiatry — Resident Rotation Platform
## Interactive Feature & Simulation Design Specification

**Author:** Joshua Moss, MD | Psychiatrist
**Date:** 2026-07-02
**Audience:** Implementing developer (Codex) + faculty reviewers
**Status:** Design handoff — buildable without a follow-up strategy session

---

## 0. How to read this document

This spec selects the **5 highest-value interactive features** for the resident platform and designs each deeply enough to build directly. It is grounded in the platform as it actually exists today (surveyed 2026-07-02):

- **Static site on Netlify.** No backend, no server, no build step. The SPA is a single hand-authored `index.html` that renders markdown via `marked.min.js` and loads tools in an `<iframe>` (`.toolframe`).
- **Content** = markdown in `/content/*.md`, registered in `nav.json` as `{t, f, k}` (`k` ∈ `md | tool | path`). Structured teaching metadata lives in `topic_meta.json`.
- **Tools** = self-contained single-file HTML in `/tools/*.html`, built with **React 18.2.0 UMD (production) + raw `React.createElement` (aliased `var e=`) + `useState` — no JSX, no Babel, no bundler.** Each file carries an `[RC-META]` HTML comment and inlines the full CSS token set + `[data-theme="dark"]` block.
- **Governance** = `reviewed.json` maps each file to `{status, at, by}`; the SPA paints a "Faculty-reviewed" chip and a `.toolrev` banner. Nothing is presented as attending-verified until it appears here.
- **Storage** = `localStorage`, keys prefixed `cw_`. **No PHI, ever.** Fictional/de-identified inputs only.

Every design decision below respects these constraints so the features drop into the existing repo rather than forcing a re-platform.

### Stated assumptions (per constraints; flagged, not invented)

1. **Quiz bank is already built.** `quizzes.json` (437 Q, 79 decks, each `art`-linked to a Canon paper) plus `shelf-mode.html`, `active-recall.html`, and `review.html` already exist. I therefore treat "Quiz bank on the 200-Paper Canon" as **enhancement, not net-new**, and drop it from the top 5 in favor of higher-marginal-value features. A v2 enhancement path is noted in §Honorable Mentions.
2. **EPA feedback and ABPN/ACGME milestone mapping are one feature, not two.** EPAs are the observable unit; milestones are the reporting lattice they roll up to. Building them separately would duplicate the data model. They are merged into **Feature 4**. If you want them split, that is a scoping conversation — but the merged design is strictly more useful and no harder to build in phases.
3. **"Evidence surveillance / flag-outdated" is infrastructure, not a destination tool.** It is most valuable as a *cross-cutting hook* present on every page, feeding one review queue. It is specified in the **Shared Architecture (§2.4)** and reused by all features, rather than shipped as a standalone screen.
4. **No local hospital policy is invented anywhere.** Every place a real feature would need Sanford BHU / MaineHealth specifics is marked with a typed placeholder token (see §2.2). These render as visible "Confirm locally" chips until faculty fills them.

---

## 1. Ranking & selection

### 1.1 Full candidate ranking

Scored 1–5 (5 = best/highest). **Priority Score** = `(Educational × 1.0) + (Safety × 1.2) + (Distinctiveness × 0.8) − (ImplDifficulty × 0.6) − (Maintenance × 0.6)`. The safety weight is boosted because bedside-adjacent tools carry asymmetric downside; difficulty/maintenance are penalties.

| # | Candidate | Educational | Clinical Safety | Impl. Difficulty | Maintenance | National Distinctiveness | Priority Score | Verdict |
|---|-----------|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 1 | **PRN Agitation Algorithm Trainer** | 5 | 5 | 3 | 3 | 4 | **12.8** | ✅ Build #1 |
| 2 | **Night Float Survival Coach** | 5 | 4 | 3 | 3 | 5 | **12.2** | ✅ Build #2 |
| 3 | **Family Meeting Simulator** | 5 | 3 | 4 | 2 | 5 | **11.0** | ✅ Build #3 |
| 4 | **EPA Feedback + Milestone Map** | 4 | 3 | 3 | 2 | 4 | **9.8** | ✅ Build #4 |
| 5 | **Personality Disorder Team Formulation** | 4 | 3 | 3 | 2 | 4 | **9.8** | ✅ Build #5 |
| 6 | Discharge Planning Pathway | 4 | 4 | 3 | 3 | 3 | 9.4 | ⏸ Honorable mention |
| 7 | Brief Inpatient Psychotherapy Coach | 4 | 2 | 3 | 2 | 4 | 8.6 | ⏸ Honorable mention |
| 8 | Evidence Surveillance / Flag-Outdated | 3 | 3 | 2 | 2 | 3 | 7.8 | 🔧 Built as shared infra (§2.4) |
| 9 | ABPN/ACGME Milestone Mapping (standalone) | 3 | 2 | 3 | 3 | 3 | 6.4 | 🔀 Merged into #4 |
| 10 | Quiz Bank (200-Paper Canon) | 4 | 2 | 3 | 3 | 3 | 7.6 | ✔ Already built → enhance only |

*Ties broken by "improves bedside performance tonight" — a resident-facing, use-it-on-shift bias. #4 and #5 tie numerically; #4 sequences first because its data model (entrustment events) underpins program-level reporting others will want.*

### 1.2 Why these five

- **They cover the gaps the current toolset does not.** Existing tools handle assessment instruments (MSE, C-SSRS, CIWA/COWS, BFCRS, capacity, PHQ/GAD) and study (quizzes, spaced repetition). None teach **management under time pressure** (Agitation, Night Float), **relational/communication skill** (Family Meeting, PD Formulation), or **close the assessment-feedback loop** (EPA/Milestones). The five chosen are precisely the non-overlapping frontier.
- **They map to the four moments that actually shape a resident:** the 2 a.m. decision (Agitation, Night Float), the hard conversation (Family Meeting), the ward team dynamic (PD Formulation), and the growth loop (EPA/Milestones).
- **Distinctiveness is real.** An interactive **cross-cover coach** and a **branching family-meeting simulator** with de-escalation scoring are not standard in residency ed portals. Either could anchor a workshop abstract (AADPRT/AADPRT-adjacent) or a med-ed poster.

### 1.3 Honorable mentions (defer, don't discard)

- **Discharge Planning Pathway** — high safety value; defer only because much of its content overlaps `exp_family.md` and it is more checklist than simulation. Strong v2 once the entrustment model (Feature 4) exists to score it.
- **Brief Inpatient Psychotherapy Coach** — excellent teaching value; defer because it is lower acuity and its content (`brief_psychotherapy.md`) is already strong as prose. Natural sibling to the Family Meeting Simulator's engine.

---

## 2. Shared architecture (build this first — every feature reuses it)

This is the highest-leverage section: five features, one substrate. Build these primitives once as copy-paste includes so tools stay consistent and cheap to maintain.

### 2.1 Non-negotiable stack rules (match the existing repo)

```
- Single self-contained .html per tool in /tools/.
- <head>: theme-init IIFE (reads localStorage 'cw_theme') MUST be first script.
- React 18.2.0 UMD production + react-dom UMD, from cdnjs (same URLs as cssrs.html).
- var e = React.createElement;  no JSX, no Babel, no bundler.
- Inline the full CSS :root token block AND the [data-theme="dark"] block
  (copy verbatim from an existing tool, e.g. cssrs.html — do not re-derive colors).
- Fonts: Source Sans 3 (body), Source Serif 4 (headings). System fallbacks inline.
- Mount point: <main id="root">.  ReactDOM.createRoot(document.getElementById('root')).
- No external state libs, no network calls at runtime except the tool's own JSON pack.
- Register in nav.json ({t, f, k:"tool"}); add [RC-META]; add to reviewed.json when attested.
```

### 2.2 Local-policy placeholder system (REQUIRED by constraints)

The single most important shared primitive. Every clinical specific that varies by institution is a **typed token**, never a hardcoded value. This makes "do not invent local policy" mechanically enforceable and lets faculty localize without touching code.

**Token format (in JSON content packs):**

```json
{ "type": "LOCAL_POLICY",
  "id": "agitation.im.first_line",
  "label": "First-line IM order per BHU formulary",
  "placeholder": "Confirm local formulary / restraint policy",
  "value": null,
  "verifiedBy": null,
  "verifiedAt": null }
```

**Rendering contract:**
- `value === null` → render a dashed amber **"⚠ Confirm locally"** chip showing `label`. The chip is informative, not blocking — the teaching content around it still displays.
- `value !== null` → render the value with a small "Local · verified {verifiedAt}" caption.
- A tiny shared component `LocalChip({token})` (≈30 lines) implements both states. Ship it in every tool.

**Authoring rule for Codex:** if you are ever tempted to type a specific dose, route, monitoring interval, restraint timeframe, formulary agent, pager number, or order-set name, stop and emit a `LOCAL_POLICY` token instead. Generic, published, non-institutional facts (e.g., "benzodiazepines can worsen delirium") are fine as plain content.

### 2.3 Disclaimer component (present without being useless)

One shared banner, three intensities, always dismissible-but-remembered per tool (`localStorage cw_disc_<tool>`):

- **`teaching`** (default, quiet): one line under the H1 — *"Educational tool for MMC psychiatry residents. Not clinical decision support. Verify all management against attending guidance and local policy. Fictional inputs only — no PHI."*
- **`safety`** (agitation, night float): the above **plus** a persistent footer line that cannot be dismissed: *"This trainer does not generate orders. In a real emergency, call your senior/attending and follow BHU protocol."*
- **`simulation`** (family meeting, PD): *"Simulated patients and families are fictional composites for practice. Real interactions vary; there are no 'correct' scripts, only more and less skillful moves."*

Design principle: the disclaimer states what the tool *is for* (which builds trust and use) rather than a wall of legalese (which trains users to ignore it).

### 2.4 Evidence governance + "flag outdated" hook (folds in candidate #9)

Reuse the existing `reviewed.json` pattern; add one learner-facing affordance and one queue file.

- **Every tool footer** shows: `Reviewed by {by} · {at}` (from `reviewed.json`) OR `Draft — pending faculty review`, plus a **"⚑ Flag content"** button.
- **Flag button** opens a 2-field form (reason dropdown: *out of date / factual error / local mismatch / typo-UX*; free text). Because there is no backend, submission does one of:
  - **MVP:** builds a `mailto:` to the faculty inbox `{{LOCAL:faculty_feedback_email}}` with a structured subject, prefilled body incl. tool id + version + section anchor; **and** appends a record to `localStorage cw_flags` so a learner can export their own flags.
  - **v2:** posts to a Netlify Form (`data-netlify="true"` hidden form) → zero-backend capture into Netlify's dashboard, then a nightly export refreshes a `flags_queue.json` faculty can triage.
- **Staleness metadata:** extend each `[RC-META]` with `reviewCadenceDays` and `evidenceThrough` (ISO date of the last literature check). A tiny build script (`tools/_staleness.mjs`, run in CI/manually) emits `staleness.json` listing anything past cadence; the SPA can badge stale items. This operationalizes "evidence surveillance" as data, not vibes.

### 2.5 Shared content-pack pattern

Each feature's clinical content lives in a **separate JSON pack** loaded at runtime (`fetch('./<feature>.pack.json')`), *not* inlined in the HTML. Rationale: faculty (and Codex) edit clinical content without touching React; packs get their own cache header; packs are independently versioned and attestable. Envelope every pack the same way:

```json
{
  "schemaVersion": "1.0",
  "tool": "agitation-trainer",
  "version": "0.1.0",
  "built": "2026-07-02",
  "evidenceThrough": "2026-06-30",
  "reviewCadenceDays": 180,
  "citations": [ { "id": "c1", "ref": "Wilson MP et al. West J Emerg Med 2012 (Project BETA).", "url": "" } ],
  "localPolicies": [ { "type": "LOCAL_POLICY", "id": "example.token", "label": "…", "placeholder": "Confirm locally", "value": null, "verifiedBy": null, "verifiedAt": null } ],
  "content": { "_note": "feature-specific shape; see each feature's Data structure section below" }
}
```

### 2.6 Cross-cutting UX + accessibility defaults (WCAG 2.1 AA)

- **Keyboard:** every interactive control reachable by Tab; visible focus ring (`:focus-visible` 3px, already in tokens); simulator choices operable with number keys 1–9 as an accelerator.
- **Screen reader:** `aria-live="polite"` region announces step changes, scores, and verdicts; each branching choice is a real `<button>` with descriptive text (not "click here").
- **Targets:** ≥44×44px tap targets (mobile); segmented Yes/No controls sized per `cssrs.html`.
- **Motion:** honor `prefers-reduced-motion` (disable rise/slide animations) — pattern already in repo.
- **Contrast:** use only the token palette (already AA-checked in light and dark). Never introduce raw hex in a tool.
- **Reading level:** UI microcopy plain; clinical content may be technical (audience is residents).
- **Dark mode:** paste the verbatim `[data-theme="dark"]` block; test every custom component in both themes; never rely on color alone to convey state (pair color with icon/label — e.g., risk tiers show label + icon, not just red).

---

## 3. Feature 1 — PRN Agitation Algorithm Trainer

> Working title in nav: **"Agitation: PRN Decision Trainer"** · file `tools/agitation-trainer.html` · category `acute-safety`

### 3.1 Product rationale

- **Problem it solves.** Acute agitation is the highest-frequency, highest-stakes decision a junior resident makes unsupervised on nights. Errors cluster predictably: reaching for a benzodiazepine in delirium, IM antipsychotic in suspected stimulant/anticholinergic toxidrome, stacking QT-prolongers, defaulting to medication before verbal de-escalation, or missing that the "agitation" is hypoactive-delirium/akathisia/pain. `agitation.md` teaches the concepts in prose; residents still freeze at the bedside because prose doesn't rehearse the *sequence under uncertainty*.
- **Who uses it.** PGY-1/2 psychiatry residents (primary); cross-covering residents; medical students on the rotation (observer mode). Faculty use it to standardize what "good" looks like.
- **When.** (a) Orientation week, as a guided walkthrough; (b) just-in-time before/after a real event ("what should I have considered?"); (c) spaced practice via randomized scenarios.
- **Why static markdown is insufficient.** The skill is *conditional branching* — "it depends on etiology, setting, prior response, and monitoring." A table can't force you to commit to a first move, then reveal consequences, then adapt. The value is deliberate practice with feedback on an ordered decision, which requires state.

### 3.2 User flow

- **Entry point.** Nav → "Agitation: PRN Decision Trainer" (loads in `.toolframe`). Landing: mode select — **Guided** (teaching, explanations always on) vs **Challenge** (randomized scenario, feedback deferred to end) vs **Reference map** (the full non-interactive algorithm with LocalChips).
- **Step 1 — Scenario stem.** Fictional composite: age band, setting (BHU vs C-L vs ED — a LocalChip notes setting-specific policy), presentation, vitals, known history, current meds, prior PRN response. All from the pack; Challenge mode randomizes across stems.
- **Step 2 — Etiology triage (decision point A).** "What's driving this?" choices: primary psychiatric / delirium / substance intoxication or withdrawal / akathisia / pain or medical / undetermined. Selecting reveals the discriminating features the learner should have weighed (teaching) and gates the downstream branch.
- **Step 3 — Non-pharm first (decision point B).** Force an explicit choice: environmental/verbal de-escalation, offer PO, involve staff, reduce stimulation, etc., *before* any IM option is presented. The tool will not display parenteral options until de-escalation has been actively addressed — this encodes Project BETA sequencing.
- **Step 4 — Pharmacologic reasoning (decision point C).** Learner picks a *class/approach* (e.g., "PO antipsychotic," "PO benzodiazepine," "treat underlying delirium cause," "IM if imminent danger"). **The tool teaches the reasoning and trade-offs; specific agents/doses/routes are `LOCAL_POLICY` tokens** (formulary + restraint policy vary). Feedback flags class-level hazards (benzo-in-delirium, QT stacking, respiratory depression, anticholinergic load).
- **Step 5 — Monitoring & reassessment (decision point D).** Choose what to monitor and when to reassess; LocalChip for interval/restraint-documentation timeframe.
- **Outputs.** A **decision trace** (the path taken, with green/amber/red annotations per step), 2–3 targeted teaching points, linked Canon citations, and a "what would change this" panel. Optional **printable/exportable summary** (no PHI — it's a practice trace) and "add missed concepts to my spaced-repetition review" hook into `review.html`.
- **Error states.** Pack fails to load → friendly retry + link to `agitation.md`. Learner tries to skip to meds → inline nudge ("Address de-escalation first"). Undetermined etiology chosen → valid path (teaches the safe "work it up / least-harm holding" stance), not penalized.
- **Mobile behavior.** Single column; scenario stem collapses to an expandable card; choices are full-width ≥44px buttons; decision trace becomes a vertical timeline (reuse `.node`/`.path` styles from `cssrs.html`); number-key accelerators hidden on touch.

### 3.3 Content model

- **Data fields (per scenario):** `id`, `settingTokenId`, `ageBand`, `stem`, `vitals`, `history`, `currentMeds[]`, `priorResponse`, `trueEtiology` (for scoring/teaching), `distractorFeatures[]`, `discriminators{etiology→[cues]}`, `hazardsByChoice{}`, `teachingPoints[]`, `citationIds[]`.
- **Local policy dependencies (tokens, all `value:null` at ship):** `agitation.deescalation_activation` (who/how to call for help), `agitation.im.first_line`, `agitation.im.alt_delirium`, `agitation.restraint_policy`, `agitation.monitoring_interval`, `agitation.qtc_threshold_action`, `agitation.setting_scope` (BHU vs ED vs C-L differences). **None invented.**
- **Evidence dependencies:** Project BETA de-escalation & psychopharm (Wilson/Holloman, WestJEM 2012); delirium management (benzos worsen non-withdrawal delirium); akathisia recognition; general antipsychotic QT considerations. Cite at class level; avoid dose claims.
- **Update cadence:** `reviewCadenceDays: 180`; re-check when formulary or restraint policy changes (flag hook).
- **Citations/metadata:** standard pack envelope; each teaching point references `citationIds`.

### 3.4 UX specification

- **Screen layout.** Header (H1 + kicker + teaching disclaimer) → mode toggle (segmented, reuse `.modetoggle`) → scenario card → stepper (4–5 steps, current step expanded, prior steps collapsed to a one-line summary with edit affordance) → sticky bottom action bar (Back / Next-or-Reveal).
- **Button labels.** `Guided` · `Challenge` · `Reference map`; step actions: `This is my read →`, `Show what I weighed`, `Commit first move`, `Reveal consequences`, `Reassess`, `See decision trace`, `Try another scenario`, `Add gaps to review`.
- **Progressive disclosure.** Consequences/teaching hidden until the learner commits each step (Guided reveals immediately after commit; Challenge defers all reveals to the trace). Citations behind a "why?" expander.
- **Prevent cognitive overload.** One decision on screen at a time; max ~5 choices per decision; hazards shown as short chips not paragraphs; the full algorithm is quarantined in "Reference map" so the trainer stays lean.
- **Accessibility.** `aria-live` announces each reveal; decision trace has text equivalents for color tiers; keyboard 1–5 selects choices.
- **Dark mode.** Tier colors from tokens; hazard red always paired with a "⚠" glyph and the word "Hazard."

### 3.5 Safety constraints

- **Must not:** output an order, a specific drug + dose + route as a recommendation, or anything resembling a prescription; auto-select a "correct" agent; accept or store PHI.
- **Must defer to attending/local policy:** all agent/dose/route/monitoring/restraint specifics (LocalChips); anything setting-specific.
- **Requires local verification:** every `LOCAL_POLICY` token before a value is shown; the setting scope.
- **Disclaimer intensity:** `safety` (persistent non-dismissible footer: "does not generate orders; call your senior; follow BHU protocol").
- **Framing everywhere:** "trainer / rehearsal," never "guide to what to give." Feedback speaks in terms of *reasoning quality and hazard avoidance*, not "the right drug."

### 3.6 Implementation spec

- **Components:** `App`, `ModeToggle`, `ScenarioCard`, `DecisionStep({choices, onCommit, reveal})`, `HazardChip`, `LocalChip`, `DecisionTrace`, `TeachingPanel`, `Disclaimer`, `FlagButton`, `CitationExpander`.
- **State model (single `useState` object):**
  ```
  { mode:'guided'|'challenge'|'reference',
    scenarioId, stepIndex,
    choices:{ etiology, nonpharm[], pharmApproach, monitoring[] },
    revealed:{ [stepKey]:bool },
    trace:[ {stepKey, choiceId, verdict:'good'|'caution'|'hazard', note} ],
    finished:bool }
  ```
- **Routing.** Single tool; internal state only. Deep-link via hash `#scenario=<id>&mode=guided` (optional) so faculty can assign a specific case.
- **Data structure (pack `content`):**
  ```json
  { "scenarios": [
    { "id":"agit-001","settingTokenId":"agitation.setting_scope","ageBand":"30s",
      "stem":"...", "vitals":{"hr":118,"bp":"148/92","spo2":98,"temp":37.1},
      "currentMeds":["home SSRI"], "priorResponse":"PO offered, declined",
      "trueEtiology":"stimulant_intoxication",
      "discriminators":{"stimulant_intoxication":["dilated pupils","tachycardia","recent use"],
                        "delirium":["fluctuating attention","age","medical trigger"]},
      "choices":{
        "etiology":[{"id":"psych","label":"Primary psychiatric"},{"id":"delirium","label":"Delirium"},
                    {"id":"stimulant_intoxication","label":"Substance intoxication"},
                    {"id":"akathisia","label":"Akathisia"},{"id":"undetermined","label":"Undetermined"}],
        "nonpharm":[{"id":"deesc","label":"Verbal de-escalation"},{"id":"po","label":"Offer PO first"},
                    {"id":"env","label":"Reduce stimulation"},{"id":"help","label":"Activate help","tokenId":"agitation.deescalation_activation"}],
        "pharmApproach":[{"id":"po_ap","label":"PO antipsychotic","tokenId":"agitation.im.first_line","hazard":null},
                         {"id":"benzo","label":"Benzodiazepine","hazardIf":{"delirium":"Worsens non-withdrawal delirium"}},
                         {"id":"treat_cause","label":"Treat underlying cause"},
                         {"id":"im","label":"IM only if imminent danger","tokenId":"agitation.restraint_policy"}]
      },
      "teachingPoints":[{"text":"...","citationIds":["c1"]}],
      "citationIds":["c1","c2"] }
  ] }
  ```
- **Acceptance criteria.**
  1. No scenario ever displays a drug name, dose, or route except through a `LocalChip`; a grep of the built pack for a dose regex returns nothing.
  2. Parenteral options are unreachable until a non-pharm choice is committed.
  3. Choosing a benzodiazepine on a delirium scenario always produces a `hazard` verdict with the correct rationale.
  4. Decision trace reproduces the exact path and verdicts; reload restores nothing (no PHI persistence) except mode preference.
  5. Renders correctly in light+dark, mobile+desktop; passes keyboard-only completion.
- **Test cases.** (a) Delirium + benzo → hazard. (b) Stimulant tox + skip de-escalation → nudge then caution. (c) Undetermined → safe path, no penalty. (d) Pack 404 → graceful fallback. (e) All LocalChips render "Confirm locally" when `value:null`. (f) `prefers-reduced-motion` disables animation. (g) SR announces each reveal.

### 3.7 MVP vs v2

- **MVP:** 8–10 scenarios, Guided + Reference map, decision trace, LocalChips, flag hook. No scoring beyond per-step verdicts.
- **Defer to v2:** Challenge mode with randomization + cumulative score; spaced-repetition integration; faculty scenario authoring UI; time-pressure timer.
- **Nationally distinctive:** a **de-escalation-gated** trainer whose feedback grades *reasoning and hazard avoidance* rather than drug choice, and that ships institution-agnostic via the LocalChip system — directly publishable as a safe, transferable model.

---

## 4. Feature 2 — Night Float Survival Coach

> nav: **"Night Float: Cross-Cover Coach"** · file `tools/night-float.html` · category `systems-safety`

### 4.1 Product rationale

- **Problem.** Night float is where residents feel most alone and least prepared: unfamiliar patients, common cross-cover pages (insomnia, agitation, "patient wants to leave / AMA," falls, chest pain on a psych unit, refusing meds, capacity questions, restraint check-ins, family calling at 2 a.m.), and unclear escalation thresholds. Knowledge exists across many pages; at 2 a.m. nobody navigates a library.
- **Who.** Residents on/approaching night float; cross-covering PGY-1s; students shadowing nights. Program uses it to standardize escalation expectations.
- **When.** Pre-rotation prep; live during a shift as a fast triage lookup; morning debrief ("did I handle that call well?").
- **Why static markdown is insufficient.** The need is *fast, page-shaped triage under stress*: pick the complaint → get a structured "first 5 minutes" → hit the decision points → know the escalation trigger. That's an interactive playbook keyed to the *page you just got*, not a document you read start-to-finish.

### 4.2 User flow

- **Entry point.** Nav → tool. Landing = a **grid of common night pages** (big tappable tiles) + a search box + a "Shift starter" checklist.
- **Shift starter.** Optional pre-shift checklist (sign-out received, sick/unstable patients flagged, code/restraint locations known, who's my backup — LocalChip for the call tree). Purely a memory aid; nothing stored beyond a session tick.
- **Complaint playbook (core loop).** Tap a complaint → structured card: **(1) First moves** (assess/stabilize, what to lay eyes on), **(2) Key questions**, **(3) Red flags / when this is medical not psych**, **(4) Decision point** (manage vs escalate), **(5) Escalate now if…** (explicit triggers) with a LocalChip for *how* to escalate here.
- **Decision points.** Each playbook has 1–2 branch choices (e.g., insomnia: sleep hygiene/behavioral vs medication reasoning [agent = LocalChip]; AMA: has capacity concern? → routes to the capacity tool).
- **Cross-links.** Deep-links to sibling tools: agitation → Feature 1; suicidality → `cssrs.html`; capacity/AMA → `capacity.html`; withdrawal → `withdrawal.html`; catatonia → `bfcrs.html`. The coach is the *hub*, not a re-implementation.
- **Outputs.** A concise on-screen action card; optional "copy sign-out note skeleton" (structured, PHI-free template the resident fills in their EHR — the tool only provides the scaffold text); "flag what stumped me" → feedback hook.
- **Error states.** Unknown complaint → search + "add a request" (flag hook). Escalation LocalChip empty → shows "Confirm your call tree at orientation" rather than a fake number.
- **Mobile behavior.** Mobile-first by design (this is used on a phone at night): large tiles, sticky search, one playbook fills the screen, collapsible sections, dark theme default-friendly (nights). Offline-capable via cache headers so a flaky-wifi call room still loads the last-viewed packs.

### 4.3 Content model

- **Fields (per playbook):** `id`, `complaint`, `synonyms[]` (for search), `acuityHint`, `firstMoves[]`, `keyQuestions[]`, `redFlags[]`, `medicalMimics[]`, `decision:{prompt, options[]}`, `escalateIf[]`, `escalationTokenId`, `crossLinks[]` (tool + anchor), `citationIds[]`.
- **Local policy dependencies (tokens):** `nf.call_tree` (backup/attending escalation path), `nf.rapid_response_criteria`, `nf.transfer_medical_pathway` (psych→medical), `nf.restraint_checkin_interval`, `nf.security_activation`, `nf.sleep_formulary`. **None invented.**
- **Evidence dependencies:** general cross-cover safety principles; delirium/medical-mimic recognition; sleep management principles; AMA/capacity doctrine (links to capacity tool). Institutional workflow = tokens, not evidence.
- **Update cadence:** `reviewCadenceDays: 365` for clinical content; **tokens reviewed every rotation block** (workflow drift is the real staleness risk here).
- **Citations/metadata:** standard envelope.

### 4.4 UX specification

- **Layout.** Home: search + tile grid (grouped: Behavioral, Medical-on-psych, Medico-legal, Logistics). Playbook: five labeled sections in fixed order (learners memorize the shape), decision branch inline, escalation block visually distinct (accent border).
- **Buttons/labels.** Tiles = complaint names; within: `First moves`, `Ask this`, `Red flags`, `Manage` / `Escalate`, `Copy sign-out skeleton`, `Open [C-SSRS / Capacity / …]`, `This stumped me`.
- **Progressive disclosure.** Sections start expanded (speed > tidiness at night) but each is collapsible; cross-links and citations behind expanders.
- **Overload prevention.** Fixed five-part structure = predictable; escalation triggers always bulleted and short; no more than 2 branch options.
- **Accessibility.** Search has a label; tiles are buttons; escalation block uses icon+label+color; large targets.
- **Dark mode.** Default to dark when opened between ~20:00–07:00 (respect `cw_theme` if set; otherwise time-hint) — pair with a visible toggle. Never rely on the auto-switch alone.

### 4.5 Safety constraints

- **Must not:** provide a definitive medical work-up as if authoritative; give doses; imply it replaces calling for help; store PHI (the sign-out skeleton is a blank template only).
- **Defer to attending/local policy:** all escalation paths, rapid-response/transfer criteria, security activation, formulary, restraint intervals (LocalChips).
- **Requires local verification:** the entire escalation layer before go-live; the medical-transfer pathway.
- **Disclaimer intensity:** `safety`. Add a standing line on medical complaints: *"On a psych unit, a medical emergency is a medical emergency — escalate, don't psychiatrize."*
- **Framing:** "coach / playbook for how to think and when to escalate," explicitly *not* "what to order."

### 4.6 Implementation spec

- **Components:** `App`, `SearchBar`, `TileGrid`, `Playbook`, `Section`, `DecisionBranch`, `EscalationBlock`, `CrossLink`, `SignoutSkeleton`, `LocalChip`, `Disclaimer`, `FlagButton`, `ShiftStarter`.
- **State model:** `{ query, activePlaybookId, branchChoice, openSections{}, theme }`. Session-only; nothing durable except `cw_theme` and `cw_disc_nightfloat`.
- **Routing.** Hash deep-link `#p=<complaintId>` so sign-out or faculty can point to a specific playbook.
- **Data structure (pack `content`):**
  ```json
  { "playbooks":[
    { "id":"insomnia","complaint":"Insomnia / can't sleep","synonyms":["sleep","awake"],
      "acuityHint":"low","firstMoves":["Rule out delirium/pain/akathisia","Check what's already ordered"],
      "keyQuestions":["New or chronic?","Caffeine/steroids/substances?","Daytime naps?"],
      "redFlags":["Fluctuating attention (delirium)","New confusion"],
      "medicalMimics":["Hypoxia","Pain","Withdrawal"],
      "decision":{"prompt":"Behavioral vs pharmacologic?","options":[
        {"id":"behavioral","label":"Sleep hygiene / behavioral"},
        {"id":"pharm","label":"Medication reasoning","tokenId":"nf.sleep_formulary"}]},
      "escalateIf":["Signs of delirium","Unstable vitals"],
      "escalationTokenId":"nf.call_tree",
      "crossLinks":[{"tool":"withdrawal.html","label":"If withdrawal suspected"}],
      "citationIds":["c1"] }
  ] }
  ```
- **Acceptance criteria.**
  1. Every playbook renders all five sections in the fixed order; missing data shows a labeled gap, never a blank.
  2. No escalation number/path is shown unless its token has a value; otherwise the "Confirm at orientation" chip.
  3. Search matches on `complaint` + `synonyms`, case-insensitive, ≤150ms on the full pack.
  4. Cross-links open the correct sibling tool at the right anchor.
  5. Sign-out skeleton contains zero prefilled patient data.
  6. Loads and is fully usable on a 360px viewport, offline after first load.
- **Test cases.** (a) Search "AMA" → capacity-linked playbook. (b) Empty `nf.call_tree` → chip, not fake number. (c) Chest pain playbook foregrounds "escalate/transfer," not psychiatric management. (d) Offline reload works. (e) Time-based dark default fires 02:00, respects manual override. (f) Keyboard-only navigation of tiles + playbook.

### 4.7 MVP vs v2

- **MVP:** 12–15 highest-frequency playbooks, search, cross-links, escalation LocalChips, sign-out skeleton, flag hook.
- **Defer to v2:** Shift-starter analytics; "page simulator" mode (a pager buzzes, you triage against a clock — reuses the simulator engine from Feature 3); printable pocket card generated from the packs.
- **Nationally distinctive:** a **cross-cover coaching hub** that unifies scattered protocols into page-shaped, escalation-first playbooks with a clean local/global separation — few programs have this; it travels to any site by swapping tokens.

---

## 5. Feature 3 — Family Meeting Simulator

> nav: **"Family Meeting Simulator"** · file `tools/family-sim.html` · category `communication`

### 5.1 Product rationale

- **Problem.** Family meetings are high-stakes, frequently delegated to residents, and rarely *taught* — residents learn by being thrown in. `family_playbook.md` and `family_modalities.md` give structure; nothing lets a resident *practice the conversation* and see how choices change the room (an anxious parent, a splitting dynamic, a skeptical partner, confidentiality binds, discharge disagreement).
- **Who.** All residents (esp. PGY-1/2); students in observer mode; faculty as a debrief springboard.
- **When.** Before a real family meeting; during communication-skills didactics; async skill-building.
- **Why static markdown is insufficient.** Communication is *interactive and consequential*. The learning is in branching: you pick an opening, the family reacts, you recover or escalate tension. Only a simulator delivers "choice → reaction → reflection," which is the core mechanism of communication training.

### 5.2 User flow

- **Entry.** Nav → tool. Landing: choose a **scenario** (e.g., "Discharge disagreement," "Confidentiality with an adult patient's parents," "Explaining a first-episode psychosis diagnosis," "De-escalating an angry family," "Goals-of-care/expectations mismatch") + choose a **lens** (skill focus: agenda-setting, empathy/NURSE, boundary/confidentiality, shared decision-making).
- **Brief.** One card: who's in the room (fictional), the clinical situation (de-identified composite), your goal for the meeting, and 2–3 skills to practice.
- **Turn loop (the engine).** Each turn: short narrative beat → the family/patient says something → learner picks from 3–4 **response moves** (each tagged to a technique, none labeled "correct"). Selection → a **reaction** (how the room shifts) + a **micro-coach note** (what that move tends to do) + movement on invisible **meters**: *alliance*, *clarity*, *tension*. 6–10 turns per scenario.
- **Decision points.** Recognizable forks: whether to address confidentiality before content; whether to sit with affect or rush to plan; whether to correct a misconception directly or elicit first. Some moves open follow-up sub-choices.
- **Outputs.** **Debrief screen:** meter trajectory (line/spark), the moves you made mapped to techniques, 2–3 strengths + 2–3 growth edges, model "high-skill" phrasings for the toughest beats, links to `family_playbook.md`/MI content, and an **EPA hook** — "log this as deliberate practice toward EPA: Communication" (writes an entrustment self-note into Feature 4's local store).
- **Error states.** Pack load fail → fallback to playbook md. No dead ends — every path completes and is debriefable (a "poor" run is a teaching win, framed constructively).
- **Mobile.** Chat-like vertical transcript; response moves as stacked full-width buttons; meters collapse into a compact trio of chips during play, expand in debrief; number-key accelerators on desktop.

### 5.3 Content model

- **Fields (per scenario):** `id`, `title`, `lensOptions[]`, `cast[]` (role, disposition — fictional), `situation`, `learnerGoal`, `skillsTargeted[]`, `turns[]`.
- **Fields (per turn):** `id`, `narrative`, `speaker`, `utterance`, `moves[]` where each move = `{id, text, technique, effect:{alliance,clarity,tension}, reaction, coachNote, next?}`, optional `subChoices`.
- **Fields (debrief):** technique frequency map, meter series, `strengthsRules[]`/`growthRules[]` (thresholds → messages), `modelPhrasings[]`.
- **Local policy dependencies:** minimal — mostly clinical communication, which is general. Tokens where institutional: `fam.confidentiality_statute_note` ("confirm state/really institutional consent & confidentiality specifics"), `fam.visitor_meeting_policy`. Keep these light; **do not invent statute** — the token says "confirm locally/with risk management."
- **Evidence dependencies:** communication frameworks (SPIKES-style disclosure, NURSE for emotion, MI spirit, shared decision-making, VitalTalk-style principles). Cite frameworks generically; these are teaching heuristics, not clinical orders.
- **Update cadence:** `reviewCadenceDays: 365`; refresh phrasings from faculty feedback each academic year.
- **Citations/metadata:** standard envelope; each `technique` links to a one-line definition + citation.

### 5.4 UX specification

- **Layout.** Two zones: **transcript** (scrolling narrative + utterances) and **move tray** (choices) pinned bottom; a slim **meter strip** at top (three labeled chips: Alliance / Clarity / Tension, each with value + trend arrow, never color-only). Debrief is a distinct full screen.
- **Buttons/labels.** `Start meeting`, move buttons show the *utterance the resident would say* (not the technique name — technique is revealed after), `Say this`, `Continue`, `See how the meeting went`, `Try a different approach`, `Log as EPA practice`.
- **Progressive disclosure.** Technique tag + coach note appear *after* a move is chosen (choose based on judgment, learn the label after). Model phrasings only in debrief. Meter *numbers* are subtle during play; full trajectory revealed in debrief to avoid gaming.
- **Overload prevention.** ≤4 moves per turn; one beat on screen; coach notes ≤2 sentences; meters abstracted to three.
- **Accessibility.** Transcript is an `aria-live` log; moves are labeled buttons; meter trends have text ("Tension: rising"); full keyboard play.
- **Dark mode.** Transcript bubbles and meters from tokens; tension/alliance shown with icon + label + value, not hue alone.

### 5.5 Safety constraints

- **Must not:** present any single script as "the correct thing to say"; caricature families or reduce cultural/identity difference to stereotype (moves must be about *skill*, not personality typecasting); depict a real patient/family; give clinical management advice dressed as communication.
- **Defer to attending/local policy:** confidentiality/consent specifics and visitor policy (LocalChips → "confirm with attending/risk management"); anything that edges into legal doctrine.
- **Requires local verification:** the confidentiality/consent notes.
- **Disclaimer intensity:** `simulation` ("fictional composites; no correct scripts, only more/less skillful moves").
- **Framing:** deliberate practice of *skills*; debrief always constructive; "poor" runs framed as low-stakes reps, never as failure.

### 5.6 Implementation spec

- **Components:** `App`, `ScenarioPicker`, `LensPicker`, `Brief`, `Transcript`, `MoveTray`, `MeterStrip`, `TurnController`, `Debrief`, `MeterChart` (tiny inline SVG sparkline — no chart lib), `ModelPhrasing`, `LocalChip`, `Disclaimer`, `FlagButton`, `EpaLogButton`.
- **State model:**
  ```
  { scenarioId, lens, turnIndex,
    meters:{alliance:50, clarity:50, tension:30},
    history:[ {turnId, moveId, technique, effect, delta} ],
    subChoiceOpen, phase:'pick'|'brief'|'play'|'debrief' }
  ```
  Meters clamp 0–100; deltas from move `effect`. Debrief computes technique frequency + applies `strengthsRules/growthRules` thresholds.
- **Routing.** Hash `#sim=<scenarioId>&lens=<lens>` for assignment/deep-link.
- **Data structure (pack `content`):**
  ```json
  { "scenarios":[
    { "id":"discharge-disagree","title":"Discharge disagreement",
      "lensOptions":["agenda","empathy","shared-decision"],
      "cast":[{"role":"Patient (fictional)","disposition":"ready to leave"},
              {"role":"Parent (fictional)","disposition":"fearful, wants longer stay"}],
      "situation":"Composite: stabilizing patient, family anxious about safety at home.",
      "learnerGoal":"Align on a safe, agreed discharge plan.",
      "skillsTargeted":["agenda-setting","NURSE","shared decision-making"],
      "turns":[
        { "id":"t1","speaker":"Parent","utterance":"You can't send him home, he's not ready!",
          "moves":[
            {"id":"m1","text":"\"I can hear how worried you are. Can you tell me what worries you most?\"",
             "technique":"NURSE: Name/Understand","effect":{"alliance":8,"clarity":2,"tension":-6},
             "reaction":"Parent softens slightly, begins to explain.","coachNote":"Naming affect before content lowers tension."},
            {"id":"m2","text":"\"The team has decided he meets criteria for discharge.\"",
             "technique":"Premature closure","effect":{"alliance":-6,"clarity":1,"tension":10},
             "reaction":"Parent becomes more adamant.","coachNote":"Leading with the decision before the emotion tends to escalate."}
          ] }
      ],
      "strengthsRules":[{"if":"alliance>=65","msg":"You built strong alliance."}],
      "growthRules":[{"if":"tension>=60","msg":"Watch for leading with content before addressing affect."}],
      "modelPhrasings":[{"beat":"t1","text":"\"It sounds like the fear is about safety at home — let's problem-solve that together.\""}] }
  ] }
  ```
- **Acceptance criteria.**
  1. Every scenario is completable via every path; no dead ends; debrief always renders.
  2. Technique labels/coach notes never appear before a move is selected.
  3. Meters stay 0–100; debrief trajectory matches the sequence of deltas exactly.
  4. No move is marked "correct"; debrief language is constructive for all outcomes.
  5. EPA log writes a well-formed self-entry to Feature 4's local store (no PHI).
  6. Light/dark + mobile/desktop pass; transcript is SR-navigable.
- **Test cases.** (a) All-empathic run → high alliance, low tension, appropriate strengths. (b) All-closure run → high tension, constructive growth notes, no "fail" language. (c) Sparkline renders with 6+ points, no external lib. (d) EPA hook produces valid record. (e) Reduced-motion disables bubble animation. (f) Confidentiality scenario shows LocalChip, not invented statute.

### 5.7 MVP vs v2

- **MVP:** 3 scenarios × 1 lens each, full turn engine, meters, debrief, EPA hook, flag.
- **Defer to v2:** multiple lenses per scenario; branching depth (sub-choices); a "faculty debrief mode" (co-review a resident's transcript); authoring UI; the pager-timer variant shared with Night Float.
- **Nationally distinctive:** a **branching family-meeting simulator with technique-tagged moves, alliance/clarity/tension meters, and constructive debrief** — genuinely rare in psychiatry residency ed and a strong workshop/abstract asset. The engine is reusable for the deferred Brief Psychotherapy Coach.

---

## 6. Feature 4 — EPA Feedback + ACGME/ABPN Milestone Map

> nav: **"EPA Feedback & Milestones"** · file `tools/epa-feedback.html` · category `assessment`
> *(Merges candidate #7 "EPA feedback form" and #10 "milestone mapping" — see Assumption 2.)*

### 6.1 Product rationale

- **Problem.** Feedback on the wards is verbal, vague, and lost; milestone reporting feels disconnected from daily work. Residents rarely know *which entrustable activity* they just demonstrated or *where it lands on the milestone lattice*. There's no lightweight way to capture a 60-second entrustment observation and let it accumulate into a picture of growth.
- **Who.** Residents (self-log + request feedback); attendings/seniors (give fast structured feedback); program director/coach (view aggregate — v2).
- **When.** Immediately after an observed activity (an admission interview, a family meeting, a capacity eval, a difficult call handled on nights). The whole point is *point-of-care micro-feedback*.
- **Why static markdown is insufficient.** This is structured data capture + aggregation + mapping — inherently interactive. A markdown form can't compute a trajectory, map EPAs→milestones, or produce a coaching view.

### 6.2 User flow

- **Entry.** Nav → tool. Two front doors: **"Log/receive feedback"** and **"My growth map."**
- **Give/receive feedback (the 60-second loop).** Pick the **EPA** (e.g., "Emergency/agitation management," "Psychiatric interview & MSE," "Family communication," "Capacity assessment," "Cross-cover/handoff") → pick **entrustment level** on a supervision scale (observe-only → direct → indirect → independent → able-to-supervise) → 1 tap **"what went well"** + 1 tap **"next time"** (chip suggestions per EPA, plus free text) → optional narrative. Submit.
- **Because there is no backend:** the record is written to `localStorage cw_epa` (the resident owns their record) **and** an export/share path is offered: **MVP** = generate a shareable summary (copy/mailto to `{{LOCAL:program_coordinator_email}}`) and a downloadable JSON the resident keeps; **v2** = Netlify Form capture → periodic export into a coach dashboard.
- **My growth map.** Shows, per EPA, the trajectory of entrustment levels over time (simple sparkline) and the **milestone crosswalk**: each EPA is mapped to the relevant ACGME Psychiatry subcompetencies it evidences, with a "self-rated current level" the resident can set. Purely formative and self-owned.
- **Decision points.** Self vs faculty entry; which EPA (with a "help me pick" descriptor); entrustment level (anchored descriptors shown on hover/expand).
- **Outputs.** A saved entrustment record; a growth trajectory; a milestone self-map; an exportable portfolio JSON/PDF-skeleton for CCC prep or coaching meetings.
- **Error states.** No entries yet → friendly empty state with a "log your first" CTA. Export blocked (no email client) → offer copy-to-clipboard + download. LocalChips for program specifics empty → "confirm your program's milestone mapping."
- **Mobile.** The 60-second loop is mobile-first (used at the bedside): EPA and level as large chips; two feedback taps; growth map stacks vertically.

### 6.3 Content model

- **Fields (entrustment record):** `id`, `ts`, `epaId`, `role` (self|faculty), `raterInitials?` (free text, no full names/PHI), `context` (setting chip), `entrustmentLevel` (1–5 scale), `wentWell[]`, `nextTime[]`, `narrative?`.
- **Fields (EPA definition):** `id`, `label`, `descriptor`, `levelAnchors[5]` (behavioral anchors per supervision level), `milestoneRefs[]` (subcompetency codes/labels), `wellChips[]`, `nextChips[]`, `citationIds?`.
- **Fields (milestone map):** the ACGME Psychiatry Milestones subcompetency list with short labels; each EPA references the subcompetencies it evidences.
- **Local policy / program dependencies (tokens):** `epa.program_epa_list` ("confirm your program's official EPA set — this is a teaching set"), `epa.milestone_version` ("confirm current ACGME Psychiatry Milestones version in use"), `epa.ccc_export_target`, `epa.program_coordinator_email`. **The EPA list and milestone mapping ship as a clearly-labeled teaching default, explicitly marked "confirm against your program's official version" — not presented as authoritative.**
- **Evidence dependencies:** entrustable professional activities framework; ACGME Psychiatry Milestones (public framework) — *reference the framework structure; mark the specific mapping as teaching-default pending program confirmation.* Do not claim it is the program's official instrument.
- **Update cadence:** `reviewCadenceDays: 365`; **re-verify on any ACGME Milestones revision** and each academic year.
- **Citations/metadata:** standard envelope; cite the milestone framework source.

### 6.4 UX specification

- **Layout.** Tab bar: **Log** | **My Growth**. Log = vertical wizard (EPA → level → quick chips → submit). Growth = per-EPA rows, each a sparkline + current self-level + expandable milestone crosswalk.
- **Buttons/labels.** `Log feedback`, `Self` / `Faculty`, `Pick EPA`, entrustment scale buttons labeled with short anchors (`Observed`, `Direct`, `Indirect`, `Independent`, `Can supervise`), `What went well`, `Next time`, `Save`, `Share with coordinator`, `Download my portfolio`, `View milestone crosswalk`.
- **Progressive disclosure.** Behavioral anchors behind an info expander on each level; milestone crosswalk collapsed by default; narrative optional.
- **Overload prevention.** One decision per wizard step; chip suggestions reduce typing; growth map shows one row per EPA, details on demand.
- **Accessibility.** Scale is a labeled radiogroup; sparklines have text summaries ("3 entries, trending toward Indirect"); full keyboard.
- **Dark mode.** Tokens; entrustment levels shown as labeled steps (not a color gradient alone).

### 6.5 Safety constraints

- **Must not:** present its EPA set or milestone mapping as the program's *official* assessment instrument; store any patient identifiers (rater initials only, and even those optional; explicitly no patient details in narrative — inline hint enforces PHI-free); make consequential evaluative claims about a resident that leave their control without consent.
- **Defer to program/local policy:** the official EPA list, the milestone version, and the formal CCC/reporting workflow (LocalChips).
- **Requires local verification:** EPA list + milestone crosswalk before any programmatic use.
- **Disclaimer intensity:** `teaching`, plus a specific line: *"Formative and self-owned. This is a practice/teaching mapping, not your program's official milestone evaluation."* Plus a **PHI reminder** on the narrative field.
- **Framing:** growth and self-reflection; faculty entries are *coaching*, not summative assessment of record.

### 6.6 Implementation spec

- **Components:** `App`, `TabBar`, `LogWizard`, `EpaPicker`, `EntrustmentScale`, `QuickChips`, `NarrativeField` (with PHI hint), `GrowthMap`, `EpaRow`, `Sparkline`, `MilestoneCrosswalk`, `ExportPanel`, `LocalChip`, `Disclaimer`, `FlagButton`.
- **State model:**
  ```
  { tab:'log'|'growth',
    draft:{ epaId, role, level, wentWell[], nextTime[], narrative },
    records:[ /* from localStorage cw_epa */ ],
    selfLevels:{ [epaId]:level } }
  ```
  Persistence: `localStorage cw_epa` (array of records) + `cw_epa_self` (self-levels). Export serializes both.
- **Routing.** Hash `#epa=log` / `#epa=growth`; `#epa=log&for=<epaId>` lets other tools (Family Sim) deep-link a pre-selected EPA.
- **Data structure (pack `content`):**
  ```json
  { "scale":[{"level":1,"label":"Observed","anchor":"Watched only"},
             {"level":2,"label":"Direct","anchor":"Performed with direct supervision"},
             {"level":3,"label":"Indirect","anchor":"Performed with supervisor available"},
             {"level":4,"label":"Independent","anchor":"Performed independently"},
             {"level":5,"label":"Can supervise","anchor":"Able to supervise others"}],
    "epas":[
      { "id":"epa-agitation","label":"Emergency/agitation management",
        "descriptor":"Assess and manage acute agitation safely.",
        "milestoneRefs":["PC (Psychotic/Emergency care)","SBP (Patient safety)"],
        "wellChips":["Prioritized safety","Used de-escalation first","Clear reasoning"],
        "nextChips":["Consider etiology sooner","Verbalize plan to team"] }
    ],
    "milestones":[{"code":"PC","label":"Patient Care","subs":[{"code":"PC1","label":"..."}]}] }
  ```
- **Acceptance criteria.**
  1. A feedback entry can be completed in ≤5 taps + optional text; record is well-formed and stored.
  2. EPA set and milestone map are visibly labeled "teaching default — confirm with program" (LocalChip present, non-dismissible label).
  3. Growth map computes correct trajectory per EPA from stored records.
  4. Export produces valid JSON containing all records + self-levels; no PHI fields exist in the schema at all.
  5. Narrative field shows a PHI-free reminder and is never pre-filled.
  6. Light/dark + mobile/desktop; scale is keyboard/SR operable.
- **Test cases.** (a) Log 3 agitation entries at rising levels → growth sparkline trends up. (b) Empty state renders CTA. (c) Deep-link from Family Sim pre-selects communication EPA. (d) Export round-trips (download → re-import in v2). (e) Milestone crosswalk expands with correct subcompetency labels. (f) No schema key can hold a patient identifier.

### 6.7 MVP vs v2

- **MVP:** self + faculty logging, entrustment scale, quick chips, per-EPA growth sparkline, milestone crosswalk (teaching default), localStorage + export/mailto, flag hook.
- **Defer to v2:** coach/PD aggregate dashboard (via Netlify Forms capture); import-your-portfolio; QR-based "faculty scan to give feedback"; CCC-prep PDF; longitudinal trends across rotations.
- **Nationally distinctive:** a **frictionless, resident-owned entrustment micro-feedback tool with a transparent EPA→milestone crosswalk** that is honest about being formative — a model many programs want and few have in this lightweight, portable form.

---

## 7. Feature 5 — Personality Disorder Team Formulation Tool

> nav: **"PD Team Formulation"** · file `tools/pd-formulation.html` · category `formulation`

### 7.1 Product rationale

- **Problem.** Patients with prominent personality pathology (esp. borderline-level) generate the ward's hardest team dynamics: splitting, countertransference, inconsistent limits, and escalating behaviors when the team is uncoordinated. Residents are taught diagnosis (`t_personality.md`) but not **team-level formulation and management** — the actual skill that prevents harm and burnout. This is where good formulation changes patient care *and* team function.
- **Who.** Residents (primary); the treatment team conceptually (the tool models team thinking); students. Faculty use it to teach formulation on rounds.
- **When.** When admitting/managing a patient with prominent personality pathology; before a team meeting; when the team is "stuck" or split.
- **Why static markdown is insufficient.** Formulation is *constructive and individualized* — you assemble a biopsychosocial + interpersonal picture, name the countertransference, and derive a *consistent team plan*. That's a guided builder producing a synthesized artifact, not a page to read.

### 7.2 User flow

- **Entry.** Nav → tool. Landing: choose **"Build a formulation"** (guided) or **"Learn the framework"** (concept map + examples).
- **Guided builder (steps).**
  1. **Pattern, not label.** Capture observed interpersonal patterns (chips: idealization/devaluation, boundary testing, self-harm as communication, help-rejecting, intense abandonment sensitivity, etc.) — dimensional/behavioral, avoiding reductive labeling.
  2. **Biopsychosocial threads.** Brief structured prompts (predisposing/precipitating/perpetuating/protective) — free-text + chips, fictional inputs only.
  3. **Interpersonal/countertransference check.** Name the feelings the patient evokes in *you and the team* (guilt, rescue urge, anger, dread, specialness) — normalizing these as *data*, and mapping each to a skillful response.
  4. **Splitting radar.** Prompt: where is the team diverging? (e.g., "night staff vs day team," "who's the 'good' vs 'bad' provider") → generates consistency strategies.
  5. **Team plan synthesis.** The tool assembles a **one-page team formulation**: shared understanding, agreed limits/consistency, communication plan, safety approach (with LocalChips for any policy-bound elements), and what to revisit.
- **Decision points.** Which patterns are present; which countertransference dominates; whether splitting is active; level of behavioral risk (routes safety elements to appropriate sibling tools / LocalChips — never invents a behavioral plan policy).
- **Outputs.** A synthesized, exportable **team formulation sheet** (PHI-free template the resident adapts), teaching notes on each element, links to `t_personality.md` and MI/limit-setting content, and an EPA-practice hook (formulation + communication).
- **Error states.** Empty build → can't synthesize; prompt to add at least patterns + one countertransference. Pack fail → fallback to framework md.
- **Mobile.** Vertical stepper; chips wrap; synthesis renders as a clean stacked sheet; export/copy as text.

### 7.3 Content model

- **Fields (framework pack):** `patterns[]` (chip label + teaching note + typical-response), `bpsPrompts[]` (the 4 P's with example cues), `countertransference[]` (feeling + meaning + skillful response), `splittingStrategies[]`, `consistencyPrinciples[]`, `synthesisTemplate` (section order + boilerplate teaching lines), `citationIds[]`.
- **Fields (session state, not persisted beyond localStorage draft):** selected patterns, BPS entries, selected countertransference, splitting flag + notes, risk level, generated sheet.
- **Local policy dependencies (tokens):** `pd.behavioral_plan_policy` ("confirm unit's behavioral/consistency plan process"), `pd.safety_observation_policy`, `pd.limit_setting_documentation`. Safety/limit specifics are policy — **tokens, not invented rules.**
- **Evidence dependencies:** psychodynamic + evidence-based frames (structural/interpersonal formulation, mentalization/DBT-informed limit-setting principles, countertransference as clinical data). Cite frameworks; keep at principle level.
- **Update cadence:** `reviewCadenceDays: 365`.
- **Citations/metadata:** standard envelope; each pattern/countertransference item links a one-line evidence/teaching note.

### 7.4 UX specification

- **Layout.** Left/top: stepper with 5 stages; main: the active stage's prompts; a persistent **"formulation so far"** mini-summary that fills in as you go (progress made visible). Final: the synthesized sheet in a printable card.
- **Buttons/labels.** `Build a formulation` / `Learn the framework`; stage nav `Patterns`, `Biopsychosocial`, `Countertransference`, `Splitting`, `Team plan`; `Add`, `Generate team formulation`, `Copy sheet`, `Download`, `Open t_personality.md`, `Log as EPA practice`.
- **Progressive disclosure.** Teaching notes behind "why this matters" expanders; the synthesis assembles only at the final step; examples on demand.
- **Overload prevention.** One stage at a time; chips over free-text where possible; the running mini-summary reassures without demanding attention.
- **Accessibility.** Chips are toggle buttons with `aria-pressed`; stepper is a labeled nav; synthesized sheet is semantic headings; keyboard throughout.
- **Dark mode.** Tokens; the "splitting radar" and risk elements use icon+label, not color alone.

### 7.5 Safety constraints

- **Must not:** generate a behavioral/safety plan as if it were policy; label a fictional person with a stigmatizing shorthand ("a borderline"); encourage punitive limit-setting; store PHI (sheet is a template).
- **Defer to attending/local policy:** behavioral plans, observation levels, limit-setting documentation, any safety-bound element (LocalChips); risk management involvement.
- **Requires local verification:** all policy-bound safety elements before use on a real patient.
- **Disclaimer intensity:** `simulation`/`teaching` blend: *"A teaching aid for formulation practice with fictional composites. Real team plans are set with your attending and follow unit policy."*
- **Framing:** person-first, non-pejorative language enforced in UI copy; countertransference framed as normal clinical data, not a failing; consistency framed as compassionate, not controlling.

### 7.6 Implementation spec

- **Components:** `App`, `ModeToggle`, `Stepper`, `PatternPicker`, `BpsPrompts`, `CountertransferencePicker`, `SplittingRadar`, `RunningSummary`, `SynthesisSheet`, `ExportPanel`, `LocalChip`, `Disclaimer`, `FlagButton`, `EpaLogButton`.
- **State model:**
  ```
  { mode:'build'|'learn', stage:0..4,
    patterns:[ids], bps:{predisposing,precipitating,perpetuating,protective},
    counter:[ids], splitting:{active:bool, notes},
    riskLevel:'low'|'elevated'|'refer',
    sheet:null|{sections[]} }
  ```
  Draft autosaves to `localStorage cw_pd_draft` (PHI-free; clearable). Synthesis is a pure function of state + pack template.
- **Routing.** Hash `#pd=build` / `#pd=learn`.
- **Data structure (pack `content`):**
  ```json
  { "patterns":[
     {"id":"idealize-devalue","label":"Idealization / devaluation",
      "note":"Shifts between 'best doctor' and 'worst' signal splitting; expect it, don't personalize.",
      "response":"Name the pattern with the team; hold a steady, consistent stance."}],
    "bpsPrompts":[{"key":"perpetuating","cue":"What's maintaining the pattern on the unit right now?"}],
    "countertransference":[
     {"id":"rescue","feeling":"Urge to rescue / be the special one",
      "meaning":"Often mirrors idealization; risks inconsistent limits.",
      "response":"Align with the team plan rather than freelancing kindness."}],
    "splittingStrategies":["Communicate limits as a team, in writing","One consistent message across shifts"],
    "consistencyPrinciples":["Limits are compassionate and predictable, not punitive"],
    "synthesisTemplate":{"sections":["Shared understanding","Agreed consistency/limits",
       "Communication plan","Safety approach","What to revisit"]},
    "citations":[{"id":"c1","ref":"..."}] }
  ```
- **Acceptance criteria.**
  1. Synthesis requires ≥1 pattern + ≥1 countertransference; otherwise a clear prompt, no broken sheet.
  2. Any safety/limit element in the sheet renders via a LocalChip when policy-bound; no invented behavioral-plan policy text appears.
  3. UI copy contains no pejorative/label-as-noun phrasing (lint the pack against a denylist).
  4. Running summary reflects state live; synthesis is deterministic from state.
  5. Draft persists PHI-free and is clearable; export contains no patient identifiers.
  6. Light/dark + mobile/desktop; chips SR/keyboard operable.
- **Test cases.** (a) Build with idealize/devalue + rescue → sheet includes consistency + team-alignment strategies. (b) No inputs → synthesis blocked with guidance. (c) Risk = "refer" → routes to safety siblings + LocalChip, no invented plan. (d) Denylist lint catches "a borderline." (e) Export PHI-free. (f) Reduced-motion + dark pass.

### 7.7 MVP vs v2

- **MVP:** guided builder (5 stages), synthesis sheet, framework mode, LocalChips, export, EPA hook, flag.
- **Defer to v2:** worked example library; "team mode" (multiple contributors assemble one sheet asynchronously); integration with the Family Sim (practice the meeting that flows from the formulation); print-optimized sheet.
- **Nationally distinctive:** a **team-level formulation builder that treats countertransference and splitting as first-class, teachable data** and outputs a consistency-focused team plan — a genuinely uncommon, high-impact teaching artifact.

---

## 8. Recommended build sequence (proactive next step)

Sprint-sized, dependency-aware. Each feature is one self-contained HTML tool; the shared primitives (§2) are the first sprint and unblock everything.

| Sprint | Deliverable | Depends on | Why here |
|---|---|---|---|
| **0** | Shared primitives: `LocalChip`, `Disclaimer`, `FlagButton`, pack-loader, staleness/`[RC-META]` extension, dark/a11y checklist as a `tools/_TEMPLATE.html` | — | Everything reuses it; also standardizes the existing tools |
| **1** | **Feature 1 — Agitation Trainer** (MVP) | Sprint 0 | Highest safety leverage; smallest new UI surface |
| **2** | **Feature 2 — Night Float Coach** (MVP) | Sprint 0; cross-links to F1 | Reuses F1; unifies existing tools into a hub |
| **3** | **Feature 4 — EPA/Milestones** (MVP) | Sprint 0 | Provides the EPA-log endpoint F3/F5 write to |
| **4** | **Feature 3 — Family Sim** (MVP) | Sprint 0; EPA hook (F4) | Turn engine is the biggest new build; reused later |
| **5** | **Feature 5 — PD Formulation** (MVP) | Sprint 0; EPA hook (F4) | Can reuse F3 patterns; rounds out the set |
| **6+** | v2 passes + Honorable Mentions (Discharge Pathway, Brief Psychotherapy Coach on the F3 engine) | prior sprints | Compounding reuse |

**Global Definition of Done (every tool):** registered in `nav.json`; `[RC-META]` complete incl. `reviewCadenceDays`/`evidenceThrough`; separate JSON pack with citations + `LOCAL_POLICY` tokens; disclaimer at correct intensity; flag hook wired to `{{LOCAL:faculty_feedback_email}}`; passes light+dark and mobile+desktop; keyboard-only completable; no PHI persisted; no invented local policy (dose/policy grep clean); added to `reviewed.json` only after faculty attestation (ships as "Draft — pending review" until then).

## 9. Consolidated local-policy placeholder registry (nothing invented)

Hand this list to faculty for a single localization pass. Every item ships `value: null`.

| Token id | Feature | What faculty must confirm |
|---|---|---|
| `agitation.setting_scope` | F1 | Which settings this covers (BHU/ED/C-L) & differences |
| `agitation.deescalation_activation` | F1 | How/whom to call for help during escalation |
| `agitation.im.first_line` / `.alt_delirium` | F1 | Formulary agents (as reference, not order) |
| `agitation.restraint_policy` | F1 | Restraint/seclusion policy & documentation |
| `agitation.monitoring_interval` / `.qtc_threshold_action` | F1 | Monitoring cadence; QTc action threshold |
| `nf.call_tree` | F2 | Night escalation/backup/attending path |
| `nf.rapid_response_criteria` / `.transfer_medical_pathway` | F2 | Rapid response & psych→medical transfer |
| `nf.restraint_checkin_interval` / `.security_activation` | F2 | Restraint check-ins; security activation |
| `nf.sleep_formulary` | F2 | Sleep-management options (reference) |
| `fam.confidentiality_statute_note` / `fam.visitor_meeting_policy` | F3 | Consent/confidentiality & visitor/meeting policy |
| `epa.program_epa_list` / `epa.milestone_version` | F4 | Official EPA set; current ACGME Milestones version |
| `epa.ccc_export_target` / `epa.program_coordinator_email` | F4 | Reporting/export workflow; coordinator contact |
| `pd.behavioral_plan_policy` / `.safety_observation_policy` / `.limit_setting_documentation` | F5 | Behavioral plan, observation, limit-setting documentation |
| `faculty_feedback_email` | All | Inbox for the flag-content hook |

---

*Prepared for MMC Sanford Psychiatry resident rotation platform. Educational infrastructure — not a clinical decision-support device. All clinical specifics deferred to attending guidance and local policy via marked placeholders.*
*Joshua Moss, MD | Psychiatrist*
