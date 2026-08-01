# Communication Practice Fast Rep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn **What Do You Say Next?** into a 60–90 second bedside communication rep that asks the learner to say one sentence before seeing choices, then gives one concise verdict and one transfer task.

**Architecture:** Keep the existing single-file HTML tool and JSON case bank. Replace the simultaneous renderer with a four-phase controller (`orient → speaking → compare → feedback`), an absolute-deadline timer, a shared desktop/mobile case navigator, and a validating adapter around the unchanged `cw_comm_v1` storage contract.

**Tech Stack:** Static HTML/CSS, dependency-free browser JavaScript, existing `communication_cases.json`, Playwright 1.61.1 on current `origin/main`, Node static regression tests, and the existing MS3/resident build-and-QA pipeline.

**Approved design:** `docs/superpowers/specs/2026-08-01-communication-practice-fast-rep-design.md`

## Global Constraints

- Do not edit `communication_cases.json` or `communication_cases.schema.json`. This release changes presentation and interaction timing, not authored clinical content.
- Preserve every prompt, choice, feedback sentence, faculty-review record, linked page, and evidence ID exactly as supplied by the case bank.
- Keep the safety-boundary paragraph visible before the first action and unchanged word-for-word.
- Preserve the current `<!-- crisis-block-html -->` source marker; the build's safety governance requires it.
- Keep persistent data limited to `cw_comm_v1[caseId] = {choiceId, quality, at}`. Do not add a version wrapper, phase, timer, filter, coaching state, spoken content, or free text.
- Do not request microphone permission, instantiate recording or speech-recognition APIs, add a text field, or imply that the spoken response is evaluated.
- Keep the existing hardcoded `FILTERS`, `DOMAIN_ORDER`, and `CASE_FILTERS` maps in the HTML. Moving them into JSON is outside this release.
- Use native buttons, `<details>`, and `<dialog>` wherever those elements fit. Do not add a framework, package, backend, or polyfill.
- The initial main practice panel must contain fewer than 60 visible words. The default feedback panel must contain fewer than 55 visible words. The page heading and desktop/mobile case navigator are outside those counts; the visible **Deeper coaching** summary is inside the feedback count, while its collapsed body is outside it.
- Every phase has exactly one element marked `data-primary-task`. Orient, Speaking, and Feedback each have exactly one standalone `data-primary-action`; Compare has zero standalone primary actions because its choice group is the primary task.
- Preserve valid `?case=` and `?filter=` routing, progress, filter selection, random case selection, related-case selection, practice details, and confirmed history reset.
- Use a fixed `REP_SECONDS = 20` even if a case's legacy `rapidDrill.targetSeconds` differs. Continue using the authored rapid-drill starter, stance, include, and avoid content; do not use its old duration to time the new rep.
- Build MS3 first and resident second. Their generated output is shared, so never run the two build scripts concurrently.
- Do not refresh visual baselines on macOS. If a covered screenshot changes, use the repository's Ubuntu/Chromium workflow.
- No PHI. Tests may use only the repository's fictional cases.

---

## Safe Execution Setup

The primary checkout currently contains unrelated uncommitted work, including edits to `tests/smoke/playwright.config.js` and an untracked `tests/smoke/mode-companion.spec.js`. Do not implement in that checkout and do not copy its whole Playwright configuration.

- [ ] Refresh the remote view, create a clean worktree from current `origin/main`, and bring in only the approved design; read this plan from its absolute path in the primary checkout:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library
git fetch origin
git worktree add .worktrees/communication-fast-rep -b codex/communication-fast-rep origin/main
cd .worktrees/communication-fast-rep
git cherry-pick 9321f27
git status --short --branch
```

Expected: a clean `codex/communication-fast-rep` branch based on the latest `origin/main`, with the approved design commit added. The implementation plan remains readable at its absolute path in the primary checkout and does not need to be copied into the execution worktree. If the design cherry-pick conflicts because the spec already landed, abort that cherry-pick and verify that the matching file is already present; do not resolve by copying files from the dirty checkout.

- [ ] Record the clean baseline and prepare the pinned browser-test runtime before editing:

```bash
git merge-base HEAD origin/main
git hash-object communication_cases.json communication_cases.schema.json
cd tests/smoke
npm ci
npx playwright install chromium
cd ../..
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash tests/smoke/start-local-servers.sh
git status --short
```

Record the launcher’s state directory and exact `kill` command. Leave that one server set running through Tasks 1–5; it serves rebuilt files from the same `_build` directories. Do not start another set on ports 4200–4202. Each task below rebuilds MS3 and then resident before expecting its new browser tests to pass. Preserve current main's `minmax(0,1fr)` overflow protection when replacing the old grid. Use `git merge-base HEAD origin/main` in each shell instead of relying on an environment variable that will not survive subagent turns.

---

## Stable DOM and JavaScript Contracts

Use these names consistently so the browser tests describe behavior rather than styling:

### DOM hooks

- `[data-rep-panel][data-phase="orient|speaking|compare|feedback"]` — current main phase.
- `#phase-heading[tabindex="-1"]` — focus target after a phase or case change.
- `[data-rep-budget]` — visible words counted in Orient.
- `[data-feedback-budget]` — visible words counted in default Feedback.
- `[data-primary-task]` — the phase's one primary task.
- `[data-primary-action]` — the phase's standalone primary CTA, when one exists.
- `[data-start-speaking]`, `[data-finish-speaking]` — spoken-rep controls.
- `[data-countdown]` — visible timer text with `role="timer"` and `aria-live="off"`.
- `#rep-status[aria-live="polite"][aria-atomic="true"]` — persistent, visually hidden announcements.
- `[data-starter-cue]` — native disclosure available only during Speaking.
- `[data-choice-id]` and `[data-choice-group]` — Compare options and their labelled group.
- `[data-selected-choice]` and `[data-feedback]` — visually hidden selected-line context and visible authored feedback.
- `[data-deeper-coaching]` — native disclosure, collapsed by default.
- `[data-next-related]` — Feedback's primary action.
- `[data-case-select]`, `[data-filter]`, `[data-surprise]`, `[data-practice-details]` — shared navigator actions.
- `[data-desktop-navigator]` — desktop case sidebar.
- `[data-mobile-summary]`, `[data-browse-cases]`, and `#case-picker` — mobile navigator and modal dialog.
- `[data-route-notice]`, `[data-load-error]`, `[data-retry-load]`, and `[data-show-all]` — recovery states.

### Controller state and functions

```js
var PHASE = {
  ORIENT: 'orient',
  SPEAKING: 'speaking',
  COMPARE: 'compare',
  FEEDBACK: 'feedback'
};
var REP_SECONDS = 20;

var state = {
  cases: [],
  current: 0,
  choice: null,
  filter: requestedFilter(),
  attempts: loadAttempts(),
  requestedCase: requestedCaseId(),
  routeNotice: '',
  phase: PHASE.ORIENT,
  endsAt: 0,
  timerId: null,
  timerCaseId: '',
  announcedFive: false,
  nudgeOpen: false,
  coachingOpen: false,
  mobileOpen: false,
  tryToday: {}
};
```

The implementation must provide and use these small responsibilities:

```js
normalizeAttempts(raw)
loadAttempts()
saveAttempt(caseId, choice)
clearTimer()
remainingSeconds()
updateTimerDom()
announce(text)
clearAnnouncement()
startSpeaking()
finishSpeaking()
setPhase(nextPhase, announcement)
resetRepState()
selectCase(caseId, options)
applyFilter(filterId, options)
surpriseMe()
orientHtml(caseData)
speakingHtml(caseData)
compareHtml(caseData)
feedbackHtml(caseData)
deeperCoachingHtml(caseData, pickedChoice)
desktopNavigatorHtml()
mobileNavigatorHtml()
render(options)
loadCases()
```

`render(options)` accepts an optional `{focusPhase: boolean, reopenPicker: boolean, focusSelector: string}` object. It may replace `#app` contents, but it must not replace `#rep-status`. Timer ticks update only `[data-countdown]`; they do not rerender the app or move focus.

---

### Task 1: Establish the four-phase interaction contract

**Files:**

- Create: `tests/smoke/communication-practice.spec.js`
- Modify: `tests/smoke/playwright.config.js`
- Modify: `02_Clinical_Skills/Communication_Practice/communication-practice.html`

**Interfaces:**

- Consumes: the approved four-state design, built URL `/tools/communication-practice.html`, existing case-bank fields, and the stable hooks above.
- Produces: one progressive main-panel state at a time, a 20-second absolute-deadline timer, choice-gated feedback, exact primary-task semantics, and enforceable word budgets.

- [ ] Add `communication-practice.spec.js` to the existing `testMatch` arrays for both `nav-ms3` and `nav-res`. Append only the filename; preserve every entry already present in the clean execution worktree.

The resulting shape is:

```js
{
  name: 'nav-ms3',
  testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js', 'qbank-retired.spec.js', 'aria-live.spec.js', 'mode-companion.spec.js', 'communication-practice.spec.js'],
  use: { ...devices['Desktop Chrome'], baseURL: MS3_URL },
},
{
  name: 'nav-res',
  testMatch: ['nav-crawl.spec.js', 'longitudinal-case.spec.js', 'family-systems.spec.js', 'mode-companion.spec.js', 'communication-practice.spec.js'],
  use: { ...devices['Desktop Chrome'], baseURL: RES_URL },
},
```

These are the arrays on the currently verified `origin/main`. If the freshly fetched branch contains another legitimate entry, preserve it and append the new spec after it. Do not copy the locally modified configuration from the primary checkout.

- [ ] Create the smoke-test helpers with exact visible-text and phase contracts:

```js
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const TOOL = '/tools/communication-practice.html';

async function openTool(page, query = '') {
  await page.goto(`${TOOL}${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rep-panel]')).toBeVisible();
}

async function visibleWordCount(locator) {
  return locator.evaluate((element) => {
    const text = element.innerText.replace(/\s+/g, ' ').trim();
    return text ? text.split(' ').length : 0;
  });
}

async function expectPhase(page, phase, standaloneActions) {
  const panel = page.locator(`[data-rep-panel][data-phase="${phase}"]`);
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-primary-task]')).toHaveCount(1);
  await expect(panel.locator('[data-primary-action]')).toHaveCount(standaloneActions);
  return panel;
}
```

Playwright creates a new browser context for each test, so do not add a global storage-clearing init script. Tests that exercise compatibility must be able to seed `cw_comm_v1` deliberately before reloading the tool.

- [ ] Write a failing test named `one rep reveals choices only after speaking and feedback only after comparison`. It must assert this exact sequence:

```js
await openTool(page, '?case=guardedness_privacy_001');
await expectPhase(page, 'orient', 1);
await expect(page.locator('[data-choice-id]')).toHaveCount(0);
await expect(page.locator('[data-deeper-coaching]')).toHaveCount(0);

await page.getByRole('button', { name: 'Start 20-second response' }).click();
await expectPhase(page, 'speaking', 1);
await expect(page.getByText('Give one first sentence aloud', { exact: true })).toBeVisible();
await expect(page.locator('[data-choice-id]')).toHaveCount(0);

const nudge = page.locator('[data-starter-cue]');
await nudge.getByText('Need one starter cue?', { exact: true }).click();
await expect(nudge).toContainText('Use one sentence to give the patient more control before asking for more information.');
await expect(page.locator('[data-choice-id]')).toHaveCount(0);

await page.getByRole('button', { name: 'Finish now' }).click();
await expectPhase(page, 'compare', 0);
await expect(page.getByRole('group', { name: 'Which line is closest to your response?' })).toBeVisible();

await page.locator('[data-choice-id="b"]').click();
const feedback = await expectPhase(page, 'feedback', 1);
await expect(feedback).toContainText('Best next line');
await expect(feedback).toContainText('Say it again');
await expect(page.locator('[data-deeper-coaching]')).not.toHaveAttribute('open', '');
await expect(page.getByRole('button', { name: 'Try the next related case' })).toBeVisible();
```

Continue the same test by opening `[data-deeper-coaching]`. Assert it exposes the learner goal, **Stance**, **Include**, **Avoid**, **Supervisor huddle**, **Try this today**, related topic links, at least one exact `evidenceIds` value from the loaded case, and the local-storage explanation. Capture `cw_comm_v1`, choose a try-today preset, and assert the store is byte-for-byte unchanged; try-today remains in-memory only.

Run it and confirm that the current simultaneous interface fails because choices are visible before the spoken rep:

```bash
cd tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --grep "one rep"
```

- [ ] Add a failing natural-completion test using Playwright's installed fake clock. Install the clock before navigation, start the response, jump forward 20,001 ms, and expect Compare:

```js
test('the absolute deadline advances to compare after a throttled interval', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  await openTool(page, '?case=bpd_rupture_repair_001');
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await expect(page.locator('[data-countdown]')).toHaveText('20 seconds');
  await page.clock.fastForward(20_001);
  await expectPhase(page, 'compare', 0);
});
```

`bpd_rupture_repair_001` carries a legacy 30-second authored target, so this test fails if the implementation accidentally reuses that duration instead of the approved fixed 20 seconds.

Run it and confirm failure before implementing the new deadline-based timer.

- [ ] Add a failing budget test. Read the case bank in the browser, open every case through its valid deep link, and assert `< 60` for `[data-rep-budget]`. Exercise every authored choice through Start → Finish → Compare and assert `< 55` for `[data-feedback-budget]`. Include the case ID and choice ID in assertion messages so a later data change identifies the offender.

Core loop:

```js
await openTool(page);
const cases = await page.evaluate(async () => {
  const data = await fetch('../communication_cases.json').then((response) => response.json());
  return data.cases.map((item) => ({
    id: item.id,
    choiceIds: item.choices.map((choice) => choice.id),
  }));
});

for (const caseData of cases) {
  await openTool(page, `?case=${caseData.id}`);
  await expect(page.locator('[data-rep-panel] > *')).toHaveCount(1);
  expect(
    await visibleWordCount(page.locator('[data-rep-budget]')),
    `Orient word budget for ${caseData.id}`,
  ).toBeLessThan(60);

  for (const choiceId of caseData.choiceIds) {
    await openTool(page, `?case=${caseData.id}`);
    await page.getByRole('button', { name: 'Start 20-second response' }).click();
    await page.getByRole('button', { name: 'Finish now' }).click();
    await page.locator(`[data-choice-id="${choiceId}"]`).click();
    await expect(page.locator('[data-rep-panel] > *')).toHaveCount(2);
    await expect(page.locator('[data-rep-panel] > [data-feedback-budget]')).toHaveCount(1);
    await expect(page.locator('[data-rep-panel] > [data-selected-choice].sr-only')).toHaveCount(1);
    expect(
      await visibleWordCount(page.locator('[data-feedback-budget]')),
      `Feedback word budget for ${caseData.id}/${choiceId}`,
    ).toBeLessThan(55);
  }
}
```

Run the complete new spec against the unchanged MS3 build and confirm the flow, timer, and budget contracts fail before changing the tool:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep/tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3
```

- [ ] Replace the current decrementing drill state with the approved phase state. Replace the existing metadata comment with this exact line and preserve the `<!-- crisis-block-html -->` marker near the end of the file:

```html
<!-- [CLERKSHIP-META v1] tool="What Do You Say Next?" version="3.0" built="2026-08-01" category="clinical-skills" audience="trainee,ms3" settings="inpatient,self-study" time="2min" summary="Four-step communication practice with a fixed 20-second spoken response before choices, concise feedback and transfer, filtered case browsing, and anonymous local choice history under cw_comm_v1. The browser does not listen or record; no PHI." -->
```

- [ ] Implement exact timer ownership. Use a 250 ms interval only to refresh the visual value; derive every value from `Date.now()` and `state.endsAt`:

```js
function clearTimer() {
  if (state.timerId !== null) clearInterval(state.timerId);
  state.timerId = null;
  state.endsAt = 0;
  state.timerCaseId = '';
  state.announcedFive = false;
}

function remainingSeconds() {
  return state.endsAt ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) : 0;
}

function announce(text) {
  document.getElementById('rep-status').textContent = text || '';
}

function clearAnnouncement() {
  announce('');
}

function setPhase(nextPhase, announcement) {
  if (state.phase === PHASE.SPEAKING && nextPhase !== PHASE.SPEAKING) clearTimer();
  state.phase = nextPhase;
  render({focusPhase: true});
  if (announcement) announce(announcement);
}

function updateTimerDom() {
  if (state.phase !== PHASE.SPEAKING || state.timerCaseId !== currentCase().id) return;
  var remaining = remainingSeconds();
  var timer = document.querySelector('[data-countdown]');
  if (timer) timer.textContent = remaining + (remaining === 1 ? ' second' : ' seconds');
  if (remaining <= 5 && remaining > 0 && !state.announcedFive) {
    state.announcedFive = true;
    announce('5 seconds remaining.');
  }
  if (remaining === 0) finishSpeaking('Time is up. Compare your sentence with the choices.');
}

function startSpeaking() {
  clearTimer();
  state.endsAt = Date.now() + REP_SECONDS * 1000;
  state.timerCaseId = currentCase().id;
  state.nudgeOpen = false;
  setPhase(PHASE.SPEAKING, 'Spoken response started. ' + REP_SECONDS + ' seconds.');
  state.timerId = setInterval(updateTimerDom, 250);
}

function finishSpeaking(message) {
  if (state.phase !== PHASE.SPEAKING) return;
  setPhase(PHASE.COMPARE, message || 'Compare your sentence with the choices.');
}
```

`announce(text)` writes only to the persistent `#rep-status`; the countdown itself is not a live region. Register both `pagehide` and `beforeunload` to call `clearTimer`. The case-ID guard prevents a queued callback from an old rep from completing a newer one.

- [ ] Implement the four renderers. Use these exact concise default strings so the word budgets remain deterministic:

  - Orient CTA: **Start 20-second response**.
  - Orient privacy line: **Your browser does not listen or record.**
  - Speaking heading/task: **Give one first sentence aloud**.
  - Speaking disclosure: **Need one starter cue?**; its body is only `rapidDrill(caseData).starter`.
  - Compare legend: **Which line is closest to your response?**
  - Best transfer: **Say it again: Keep the stance in your own words.**
  - Other transfer: **Say it again: Validate first, then ask one clear next question.**
  - Feedback CTA: **Try the next related case**.
  - Collapsed disclosure summary: **Deeper coaching**.

Orient's `[data-rep-budget]` is the sole direct child of `[data-rep-panel]` and contains only one setting/domain pill, the faculty-review badge, case title, exact prompt, CTA, and privacy line. Do not include skill tags or the learner goal there. Feedback has exactly two direct children: `[data-feedback-budget]` plus the explicitly allowed `.sr-only[data-selected-choice]`. The budget wrapper contains the existing quality label, exact authored feedback, the one transfer line, CTA, and visible Deeper coaching summary. Route notices and navigator content live outside the rep panel.

In Feedback, render the existing quality label itself as `#phase-heading`; do not add a separate visible “Feedback” or case-title heading. This keeps the longest current path at 54 visible words, including the two-word Deeper coaching summary, without shortening the 34-word authored feedback.

Use the existing concise draft badge and a concise **Reviewed** badge in Orient. Put reviewer name and last-reviewed date, when present, inside Deeper coaching so future attribution does not silently break the Orient budget. Place the visually hidden selected-choice association outside `[data-feedback-budget]`; only visible default feedback belongs in that measured wrapper.

- [ ] Implement `deeperCoachingHtml(caseData, pickedChoice)` with the existing authored or deterministic material: learner goal, stance, must-include list, avoid list, supervisor huddle prompt, try-today presets, linked topic pages, `evidenceIds`, and the exact local-storage explanation. Keep it collapsed on every newly reached Feedback phase. It must not appear in Orient, Speaking, or Compare.

- [ ] Make a choice click write the existing attempt and move directly to Feedback. Do not infer anything about the learner's unrecorded spoken sentence. Because the Compare buttons are removed on the phase change, render the chosen authored line in a visually hidden `[data-selected-choice]` element with a stable ID, then set that ID as `aria-describedby` on the visible `[data-feedback]` region. Focused `#phase-heading` conveys the quality label; announce only the authored feedback once through `#rep-status` so assistive technology does not hear the quality twice. Do not visibly repeat the selected line.

- [ ] Run the focused tests for both audiences:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --project=nav-res
```

Expected: the four-phase flow, early finish, natural deadline, task-count, and all word-budget assertions pass in both builds.

- [ ] Commit the green unit:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep
git add 02_Clinical_Skills/Communication_Practice/communication-practice.html tests/smoke/communication-practice.spec.js tests/smoke/playwright.config.js
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(communication): add fast spoken rep flow"
```

Expected staged paths: exactly the three files listed above.

---

### Task 2: Recompose case navigation for desktop and mobile

**Files:**

- Modify: `tests/smoke/communication-practice.spec.js`
- Modify: `02_Clinical_Skills/Communication_Practice/communication-practice.html`

**Interfaces:**

- Consumes: the existing filter maps, `relatedCase()`, normalized attempts, and the Task 1 phase controller.
- Produces: a compact desktop sidebar, a mobile modal picker backed by the same HTML/data helpers, status labels, Surprise me, Practice details, and no-match recovery.

- [ ] Add a failing desktop test named `desktop navigator keeps browsing useful but secondary`. At a 1280×800 viewport, assert:

  1. `[data-desktop-navigator]` is visible and `[data-mobile-summary]` is hidden.
  2. The summary reads `0 of 10 practiced`.
  3. Each case has one text status, initially `Not practiced`.
  4. The active case button has `aria-current="true"`.
  5. Selecting Family shows only the three family cases and resets an excluded active case to the first matching case at Orient.
  6. **Surprise me** selects a different case when at least two filtered cases exist, resets to Orient, and does not create a stored attempt.
  7. **Practice details** is collapsed initially, then reveals the domain summary, local filter history, and Reset local history only when history exists.
  8. The filter strip has computed `flex-wrap: nowrap`, horizontal overflow `auto` or `scroll`, and `scrollWidth > clientWidth` in the compact sidebar.

Reload once with four valid seeded attempts and assert every status mapping by case: `best → Practiced well`, `partial → Practiced`, `missed → Review`, `harmful → Retry`, and a case without a record → `Not practiced`. Scope every case locator to `[data-desktop-navigator]` because the mobile dialog contains a second copy of the list in the DOM.

For deterministic Surprise me behavior, override `Math.random` before navigation:

```js
await page.addInitScript(() => { Math.random = () => 0.999; });
```

- [ ] Add a failing test named `related case progression returns to orient`: after selecting a choice and activating **Try the next related case**, the new case must differ, share a skill tag or linked page when such a case exists, open at Orient, and leave the original attempt visible as a practiced status in the navigator.

- [ ] Add a failing test named `mobile case browser is modal and returns focus` at 390×844:

```js
await page.setViewportSize({ width: 390, height: 844 });
await openTool(page);
await expect(page.locator('[data-desktop-navigator]')).toBeHidden();
await expect(page.locator('[data-mobile-summary]')).toBeVisible();

const browse = page.getByRole('button', { name: 'Browse cases' });
await browse.click();
const picker = page.getByRole('dialog', { name: 'Browse communication cases' });
await expect(picker).toBeVisible();
await expect(picker.getByRole('button', { name: /All/ })).toBeFocused();

await page.keyboard.press('Escape');
await expect(picker).toBeHidden();
await expect(browse).toBeFocused();

await browse.click();
await picker.locator('[data-case-select="family_meeting_opening_001"]').click();
await expect(picker).toBeHidden();
await expect(page.locator('[data-rep-panel][data-phase="orient"]')).toBeVisible();
await expect(page.locator('#phase-heading')).toBeFocused();
```

Also reopen the dialog and activate its explicit **Close case browser** button; it must return focus to Browse cases. While the dialog is open, choose Family and assert the dialog remains open after the filter rerender. Finally assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at 390×844.

- [ ] Add a failing test named `no cases recovery never leaves a stale rep` with a mocked bank rather than changing production data. Route `communication_cases.json` to a fixture containing only `psychosis_validation_001`, click Family, and assert the empty message and Show all action appear while `[data-rep-panel]` has count zero. Activating Show all must restore that one case at Orient.

- [ ] Add a failing test named `reduced motion removes transitions` with `page.emulateMedia({reducedMotion: 'reduce'})`. Confirm the media query matches and the computed animation name is `none` and transition duration is `0s` on `[data-rep-panel]`.

- [ ] Before changing navigator code, run the Task 2 tests against the Task 1 build and confirm the desktop, mobile, no-match, and reduced-motion assertions fail:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep/tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --grep "navigator|related case|mobile case|no cases|reduced motion"
```

- [ ] Replace `.grid`, `.list`, and the current mobile horizontal case strip with the selected compact split layout:

```css
.practice-layout{display:grid;grid-template-columns:minmax(210px,260px) minmax(0,1fr);gap:16px;align-items:start}
.case-sidebar{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}
.mobile-summary{display:none}
.filter-strip{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.rep-card{min-width:0;overflow-wrap:anywhere}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
@media(max-width:720px){
  .practice-layout{display:block}
  .case-sidebar{display:none}
  .mobile-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
  #case-picker{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid var(--border);border-radius:14px;padding:0}
  #case-picker::backdrop{background:rgba(47,41,36,.48)}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
```

Polish sizes and spacing within the existing Clinical Warm palette; do not introduce a new visual theme.

- [ ] Render the navigator from shared helpers. `desktopNavigatorHtml()` and the body of `mobileNavigatorHtml()` must both reuse `filterHtml()`, `caseListHtml()`, `surpriseHtml()`, and `practiceDetailsHtml()` so labels and counts cannot drift.

Each case button must be generated from the real case and attempt values:

```js
function caseButtonHtml(c) {
  var active = c.id === currentCase().id;
  var attempt = state.attempts[c.id];
  var status = attempt ? doneLabel(attempt.quality) : 'Not practiced';
  return '<button type="button" class="casebtn' + (active ? ' on' : '') + '"' +
    ' data-case-select="' + esc(c.id) + '" aria-current="' + String(active) + '">' +
    '<span class="case-title">' + esc(c.title) + '</span>' +
    '<span class="case-status">' + esc(status) + '</span></button>';
}

function doneLabel(quality) {
  return quality === 'best' ? 'Practiced well' :
    quality === 'partial' ? 'Practiced' :
    quality === 'harmful' ? 'Retry' : 'Review';
}
```

Remove topic subtitles from the compact default list; topic/domain detail remains available through filters and Practice details.

- [ ] Change the old random 60-second action into **Surprise me**. It chooses `pick` from the active filtered list and calls `selectCase(pick.id, {focusPhase: true})`; it does not start the timer. Starting and finishing the 20-second response remain explicit learner actions.

- [ ] Centralize every case transition so active-case reselection is also a clean restart:

```js
function resetRepState() {
  clearTimer();
  clearAnnouncement();
  state.phase = PHASE.ORIENT;
  state.choice = null;
  state.nudgeOpen = false;
  state.coachingOpen = false;
}

function selectCase(caseId, options) {
  if (!setCurrentById(caseId)) return false;
  resetRepState();
  state.mobileOpen = !!(options && options.keepPickerOpen);
  render({focusPhase: !!(options && options.focusPhase), reopenPicker: state.mobileOpen});
  return true;
}
```

Case buttons, Surprise me, related-case progression, filter-induced selection, and valid deep-link initialization all use this seam. A valid deep link is communicated by the selected case itself rather than an extra recommendation paragraph that would compete with the first task. A current-case button click intentionally restarts that case at Orient without writing progress.

- [ ] Implement filter consistency and no-match recovery:

```js
function applyFilter(filterId, options) {
  state.filter = FILTERS.some(function (item) { return item[0] === filterId; }) ? filterId : 'all';
  var matches = filteredCases();
  if (matches.length && matches.indexOf(currentCase()) === -1) {
    var keepPickerOpen = !!(options && options.keepPickerOpen);
    selectCase(matches[0].id, {focusPhase: !keepPickerOpen, keepPickerOpen: keepPickerOpen});
  } else {
    render({reopenPicker: !!(options && options.keepPickerOpen)});
  }
}
```

When `filteredCases()` is empty, render **No cases match this filter** and one **Show all cases** button; render no stale rep panel. **Show all cases** restores `all`, selects the first case, and focuses its Orient heading.

- [ ] Implement the native modal dialog. Opening calls `showModal()` and focuses the active filter (All when no more specific filter is active). Escape and explicit Close set `state.mobileOpen = false`, close the dialog, and return focus to Browse cases. Selecting a case closes the dialog but focuses the new phase heading instead. Use a captured `cancel` listener because the native dialog's cancel event is not a dependable bubbling delegation target.

- [ ] Preserve disclosure state only where needed: case/filter changes reset `nudgeOpen` and `coachingOpen`; choosing a try-today preset while Deeper coaching is open rerenders with that disclosure still open. Practice details may close on filter changes.

- [ ] Run focused tests in both builds, then commit:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --project=nav-res
cd ../..
git add 02_Clinical_Skills/Communication_Practice/communication-practice.html tests/smoke/communication-practice.spec.js
git diff --cached --check
git commit -m "feat(communication): add compact case navigator"
```

---

### Task 3: Preserve storage and routing while adding honest recovery

**Files:**

- Modify: `tests/smoke/communication-practice.spec.js`
- Modify: `02_Clinical_Skills/Communication_Practice/communication-practice.html`

**Interfaces:**

- Consumes: existing `cw_comm_v1` objects, `?case=`, `?filter=`, and the case-bank fetch.
- Produces: validated history reads, exact compatible writes, valid/invalid route behavior, retryable data loading, and preservation of unrelated `cw_*` keys.

- [ ] Add a failing test named `storage contract preserves prior and unrelated data`. Freeze the page clock so the stored date cannot change across midnight, open the tool once to establish its origin, seed a valid prior record and an unrelated key, then reload:

```js
await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
await openTool(page);
await page.evaluate(() => {
  localStorage.setItem('cw_comm_v1', JSON.stringify({
    psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-07-31' },
  }));
  localStorage.setItem('cw_unrelated_test', JSON.stringify({ keep: true }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
```

Assert the existing case shows **Practiced well**. Complete `suicide_direct_question_001` with choice `b`, then assert the entire parsed store equals:

```js
{
  psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-07-31' },
  suicide_direct_question_001: { choiceId: 'b', quality: 'best', at: '2026-08-01' },
}
```

Also assert `cw_unrelated_test` is unchanged, there are no new `cw_*` keys, and starting/finishing a rep without choosing does not write history.

- [ ] Add table-driven tests named `corrupt history: malformed JSON`, `corrupt history: null`, `corrupt history: array`, `corrupt history: primitive`, and `corrupt history: malformed records`. Include a malformed record whose quality is the inherited property name `constructor`. Seed each raw string with `page.evaluate()` after establishing the tool origin, capture it before reload, then assert the identical raw `cw_comm_v1` string remains afterward. Every variant must still reach Orient, treat invalid records as unpracticed, preserve `cw_unrelated_test`, and emit no page error. Loading may ignore corrupt data but must not rewrite it.

- [ ] Add a test named `history reset removes only communication attempts` that seeds one valid attempt plus `cw_unrelated_test`, accepts the confirmation dialog, and asserts only `cw_comm_v1` is removed, the current rep returns to Orient, and the unrelated key is unchanged.

- [ ] Run the storage tests against the Task 2 build and confirm corrupt-record normalization fails before changing the adapter:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep/tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --grep "storage contract|history reset|corrupt history"
```

- [ ] Implement a validating adapter that retains only records in the existing shape without writing during load:

```js
var QUALITY = {best: true, partial: true, missed: true, harmful: true};

function normalizeAttempts(raw) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return {};
  return Object.keys(raw).reduce(function (clean, caseId) {
    var record = raw[caseId];
    if (!record || Array.isArray(record) || typeof record !== 'object') return clean;
    if (typeof record.choiceId !== 'string' || !record.choiceId || QUALITY[record.quality] !== true) return clean;
    if (typeof record.at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.at)) return clean;
    clean[caseId] = {choiceId: record.choiceId, quality: record.quality, at: record.at};
    return clean;
  }, Object.create(null));
}

function loadAttempts() {
  try {
    return normalizeAttempts(JSON.parse(localStorage.getItem('cw_comm_v1') || '{}'));
  } catch (_) {
    return {};
  }
}
```

`saveAttempt()` overwrites only the selected case entry with `{choiceId, quality, at}` and serializes the normalized object. Loading corrupt data must not delete or rewrite storage.

- [ ] Add tests named `valid deep links select their requested case` and `invalid routes recover honestly` with these exact expectations:

  - `?case=family_meeting_opening_001&filter=family` selects that case and Family.
  - A valid case excluded by the requested filter selects the case and changes to its first `CASE_FILTERS` tag so it remains visible.
  - `?filter=not-a-filter` falls back to All without an error.
  - `?case=removed_case` selects the first case allowed by the valid filter and shows **That practice case is no longer available.** in `[data-route-notice]`.

- [ ] Add a failing test named `load failure offers a working retry` that intercepts the first case-bank request with HTTP 503, then allows the second request through:

```js
let requestCount = 0;
await page.route('**/communication_cases.json', async (route) => {
  requestCount += 1;
  if (requestCount === 1) {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  } else {
    await route.continue();
  }
});

await page.goto(TOOL, { waitUntil: 'domcontentloaded' });
const error = page.locator('[data-load-error]');
await expect(error).toContainText('Could not load communication cases.');
await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
await expect(error.getByRole('link', { name: 'Return to the library' })).toHaveAttribute('href', '../index.html');
await error.getByRole('button', { name: 'Retry' }).click();
await expect(page.locator('[data-rep-panel][data-phase="orient"]')).toBeVisible();
```

- [ ] Run the routing and loading tests against the current implementation and confirm invalid-case notice and Retry behavior fail before refactoring startup:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep/tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --grep "deep link|invalid routes|load failure"
```

- [ ] Refactor startup into `loadCases()`. It renders a loading state, fetches and validates a non-empty `cases` array, applies routing once, and renders. On failure it renders only a concise error card with Retry and Return to the library—no empty sidebar and no “no cases” claim.

- [ ] Make history reset call `clearTimer()` and `resetRepState()` after confirmation. It removes only `cw_comm_v1`; it never clears unrelated local storage. If no history exists, the reset control is not rendered.

- [ ] Run the focused tests and commit:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --project=nav-res
cd ../..
git add 02_Clinical_Skills/Communication_Practice/communication-practice.html tests/smoke/communication-practice.spec.js
git diff --cached --check
git commit -m "fix(communication): harden history and recovery"
```

---

### Task 4: Complete keyboard, announcement, privacy, and timer safeguards

**Files:**

- Modify: `tests/smoke/communication-practice.spec.js`
- Modify: `02_Clinical_Skills/Communication_Practice/communication-practice.html`

**Interfaces:**

- Consumes: native focus behavior, the persistent live region, the timer adapter, and all Task 1–3 controls.
- Produces: keyboard-complete flow, meaningful phase focus, sparse live announcements, cancelled timers on every exit, and executable proof that the browser neither listens nor accepts text.

- [ ] Add a failing test named `keyboard flow moves focus without duplicate feedback announcements`. Use only Tab, Enter, Space, and Escape to complete one rep and open/close Deeper coaching. Assert `#phase-heading` is focused after Start, Finish, choice selection, case selection, and related-case progression. Timer ticks must leave focus where the learner placed it. In Feedback, assert `[data-selected-choice]` is visually hidden and the visible `[data-feedback]` element's `aria-describedby` equals the selected-choice element's ID. Before selecting the choice, install a `MutationObserver` on `#rep-status` that pushes each non-empty `textContent` value into `window.__commAnnouncements`; after selection, assert the exact authored feedback appears in that array once and the quality label does not appear there.

- [ ] Add a failing test named `timer announces only start five seconds and completion` using the fake clock:

```js
await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
await openTool(page);
const live = page.locator('#rep-status');
await page.getByRole('button', { name: 'Start 20-second response' }).click();
await expect(live).toHaveText('Spoken response started. 20 seconds.');

await page.clock.fastForward(15_001);
await expect(live).toHaveText('5 seconds remaining.');

await page.clock.fastForward(5_001);
await expect(live).toHaveText('Time is up. Compare your sentence with the choices.');
```

Assert `[data-countdown]` has `role="timer"` and `aria-live="off"`; there must be exactly one polite live region in the tool. Do not announce every timer tick.

- [ ] Add tests named `case changes cancel the timer`, `surprise and reset cancel the timer`, and `pagehide clears the active interval`:

  - Start Speaking, select a different case, fast-forward 30 seconds, and remain at the new case's Orient state.
  - Start Speaking, choose Surprise me, fast-forward, and remain at the selected case's Orient state.
  - With pre-seeded history, start Speaking, reset history and confirm, fast-forward, and remain at Orient.
  - Start Speaking, dispatch `pagehide`, and prove the active interval was cleared.

After case change, Surprise me, filter-induced case change, and history reset, assert `#rep-status` is empty before advancing the fake clock; an interrupted rep must not leave stale “started” or “5 seconds remaining” text behind.

For the `pagehide` case, wrap `window.clearInterval` after page load, start Speaking, dispatch `new PageTransitionEvent('pagehide')`, and assert the wrapper's in-memory call counter increased. Also assert `state` is not exposed globally and no rejected promise or page error occurs.

- [ ] Add a test named `spoken reps request no media and accept no text`. Before navigation, stub `navigator.mediaDevices.getUserMedia`, `MediaRecorder`, `SpeechRecognition`, and `webkitSpeechRecognition` to increment counters if called or constructed. After a complete rep, assert all counters remain zero. Also assert there are zero `textarea`, text-like `input`, `[contenteditable="true"]`, `audio`, and `video` elements.

- [ ] Capture `pageerror` and console errors in the focused flows:

```js
function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}
```

Assert the array is empty at each test's end. If an existing build-injected script creates unrelated baseline console noise in both the old and new tool, document and narrowly filter the exact known message; do not use a blanket ignore.

- [ ] Add a test named `review status remains visible` with an intercepted fixture because every live case is currently draft. Use `route.fetch()` to obtain the real JSON, change only the first response object's `facultyReview` to `{status: 'reviewed', reviewer: 'Test Reviewer', lastReviewed: '2026-08-01'}`, and fulfill the browser request with that in-memory JSON. Assert **Reviewed** on that active first case, then select an unchanged second case and assert **draft · faculty review needed**. Do not write the fixture to disk.

- [ ] Add a test named `safety boundary is unchanged and source contains no capture APIs`. Assert the fictional-practice boundary is visible with this exact text:

```text
Safety boundary: fictional practice only. Do not enter patient information. There are no free-text patient fields; this tool stores only anonymous practice choices in this browser. It is not clinical advice, legal advice, or a substitute for supervision, local policy, or validated instruments.
```

Add a source-level assertion that the HTML contains none of these API identifiers:

```js
expect(source).not.toMatch(/getUserMedia|MediaRecorder|SpeechRecognition|webkitSpeechRecognition/);
```

Read `source` with `readFile(new URL('../../02_Clinical_Skills/Communication_Practice/communication-practice.html', import.meta.url), 'utf8')`. Because the privacy test itself names those APIs, run this assertion against the tool source, not the test file.

- [ ] Add a test named `persistent live node survives phase transitions`. Stash the announcer node identity in `window.__commLiveNode`, advance the speaking clock by one second, finish early, and select a choice. Assert after each transition that the stashed node is still connected and is strictly equal to `document.querySelector('#rep-status')`; full-app rerenders must never replace it.

- [ ] Run all Task 4 tests against the Task 3 build as a characterization pass before further accessibility changes:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep/tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --grep "keyboard flow|timer announces|cancel the timer|pagehide|spoken reps|review status|safety boundary|persistent live"
```

Several base behaviors were intentionally introduced in Tasks 1–3, so some or all assertions may already pass. Record the exact failing test names; do not manufacture a red result by weakening working code. The following implementation checks close real failures and preserve passing contracts. If the characterization run is fully green, Task 4 is a regression-test-only commit.

- [ ] Ensure `setPhase()` and `selectCase()` synchronously focus `#phase-heading` after render. Do not use a delayed focus that becomes flaky under Playwright's fake clock. Native dialog close is the only exception: Escape/Close returns focus to Browse cases, while case selection focuses the heading.

- [ ] Add captured `toggle` handlers for the two native disclosures so `nudgeOpen` and `coachingOpen` survive only rerenders that occur within the same phase. Do not rerender on a timer tick. Reset both values on any case change. Implement `clearAnnouncement()` as `document.getElementById('rep-status').textContent = ''` and call it from `resetRepState()` so every interrupted rep clears stale live text.

- [ ] Run the focused tests, then commit:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --project=nav-res
cd ../..
git add 02_Clinical_Skills/Communication_Practice/communication-practice.html tests/smoke/communication-practice.spec.js
git diff --cached --check
git commit -m "test(communication): verify accessible private reps"
```

---

### Task 5: Run release gates and prove the clinical-data boundary

**Files:**

- Verify only; change a file only to fix a failure caused by Tasks 1–4.

**Interfaces:**

- Consumes: the completed implementation branch.
- Produces: evidence that targeted behavior, both built audiences, the broader regression suite, and the no-clinical-copy boundary are green.

- [ ] Confirm scope before running expensive gates:

```bash
git status --short
git diff --check "$(git merge-base HEAD origin/main)..HEAD"
git diff --exit-code "$(git merge-base HEAD origin/main)..HEAD" -- communication_cases.json communication_cases.schema.json
git diff --name-only "$(git merge-base HEAD origin/main)..HEAD"
```

Expected implementation paths beyond the one cherry-picked design doc: only the communication-practice HTML, its focused smoke spec, and Playwright configuration. This implementation plan remains in the primary checkout.

- [ ] Run the repository's validators and static tests:

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
node --test tests/*.test.mjs
```

- [ ] Build and check both sites sequentially:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- [ ] Confirm the persistent server set started during setup is still healthy against the freshly rebuilt directories:

```bash
curl -fsS http://127.0.0.1:4200/tools/communication-practice.html >/dev/null
curl -fsS http://127.0.0.1:4201/tools/communication-practice.html >/dev/null
curl -fsS http://127.0.0.1:4202/ >/dev/null
```

If the original server PIDs exited, restart the launcher once and record its new exact stop command. Do not start a second set while any original PID still owns a port.

- [ ] Run the focused spec in both audiences, then the complete nav projects:

```bash
cd tests/smoke
npx playwright test communication-practice.spec.js --project=nav-ms3 --project=nav-res
npx playwright test --project=nav-ms3 --project=nav-res
```

- [ ] Stop the three local servers using the exact PIDs printed by the launcher. Confirm ports 4200, 4201, and 4202 are no longer owned by that server set.

- [ ] Inspect the final diff for accidental clinical or unrelated changes:

```bash
cd /Users/jm/Psychiatry-Clerkship-Library/.worktrees/communication-fast-rep
git diff --check "$(git merge-base HEAD origin/main)..HEAD"
git diff --exit-code "$(git merge-base HEAD origin/main)..HEAD" -- communication_cases.json communication_cases.schema.json
git status --short
git log --oneline "$(git merge-base HEAD origin/main)..HEAD"
```

Expected: clean worktree; clinical JSON/schema diff is empty; every implementation commit is present.

- [ ] If any verification-driven fix was required, rerun the smallest failing test first, then the full command family it belongs to. Stage only the explicit file or files actually edited, inspect `git diff --cached --name-only`, and commit with `fix(communication): address verification finding`. Never stage all files wholesale.

---

## Completion Checklist

- [ ] Orient → Speaking → Compare → Feedback works in both MS3 and resident builds.
- [ ] Choices never appear before the learner finishes or times out.
- [ ] Initial and feedback word budgets pass across every current case and choice.
- [ ] Desktop sidebar and mobile dialog expose the same filters, cases, statuses, Surprise me, and Practice details.
- [ ] Keyboard focus and sparse live announcements are deterministic.
- [ ] Timer resources are cleared on phase change, case change, Surprise me, history reset, and unload.
- [ ] Valid deep links work; invalid links and data-load failure recover honestly.
- [ ] `cw_comm_v1` remains exactly compatible and unrelated storage is untouched.
- [ ] No microphone, recording, speech recognition, transcript, or free-text surface exists.
- [ ] Authored clinical case data and schema have a zero diff.
- [ ] Validators, static tests, sequential builds, targeted smoke tests, and full nav smoke projects pass.

## Concrete Next Best Option

Execute this plan with **superpowers:subagent-driven-development** in the isolated worktree. It gives each task a fresh implementer/reviewer loop while keeping the user's dirty primary checkout untouched.

## Innovative Follow-on, Not Part of This Plan

After this focused retrofit is measured, consider a privacy-safe **Three-Minute Ward Rep**: one evolving fictional patient generates a communication sentence, one clinical-reasoning commitment, and one rounds/family handoff. It should reuse this answer-first interaction pattern without storing spoken content or combining clinical governance boundaries prematurely.
