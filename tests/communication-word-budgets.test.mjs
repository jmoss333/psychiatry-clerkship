import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// tests/smoke/communication-practice.spec.js budgets the rep panel: orient < 60 visible
// words, feedback < 55. Those are the right assertions and they run in a real browser --
// but the smoke suite is a SEPARATE CI job, so bin/verify.sh never runs it and
// bin/check-verify-coverage.py cannot even see it (that checker inspects the
// build-test-validate job only). The gap is not a recorded exemption; it is a blind spot.
//
// It cost a real regression. WP-5n rewrote family_conflict_discharge_001 choice d for
// finding A2MS3-F002 and took its feedback from 20 words to 57. Every local gate passed.
// CI went red ~9 minutes later with "Feedback word budget ... Expected: < 55, Received: 77",
// twice, on two different heads, before it was caught.
//
// This test closes that loop by computing the SAME number the browser measures, from the
// tool's own templates, with no browser. The panel is deterministic, so it can be modelled:
// see PANEL_CHROME below, and MODEL_PIN, which asserts the model still reproduces the exact
// value the browser reported for the regression that motivated this file.
//
// Margins are thin -- 58/59 on orient and 54/54 on feedback as of 2026-09-05 -- so this is
// a live constraint on authoring, not a formality. If it fails, shorten the prose; do not
// raise the budget without changing the smoke spec too, or the two will disagree and CI
// wins.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const casesPath = path.join(repo, 'communication_cases.json');
const toolPath = path.join(
  repo, '02_Clinical_Skills', 'Communication_Practice', 'communication-practice.html');
const specPath = path.join(repo, 'tests', 'smoke', 'communication-practice.spec.js');

// Budgets, mirrored from the smoke spec. Verified against it below so they cannot drift.
const ORIENT_BUDGET = 60;
const FEEDBACK_BUDGET = 55;

// Fixed text the panel renders around the authored strings, transcribed from
// communication-practice.html. visibleWordCount() strips .sr-only, [hidden], and the
// non-summary children of a closed <details>, so the deeper-coaching block contributes
// only its <summary>.
const PANEL_CHROME = {
  orient: ['Start 20-second response', 'Your browser does not listen or record.'],
  feedbackCommon: ['Try the next related case', 'Deeper coaching'],
  transferBest: 'Say it again: Keep the stance in your own words.',
  transferOther: 'Say it again: Validate first, then ask one clear next question.',
};

const QUALITY_LABEL = {
  best: 'Best next line',
  partial: 'Partly useful',
  harmful: 'Avoid this line',
};
const qualityLabel = (q) => QUALITY_LABEL[q] ?? 'Missed opportunity';

const REVIEW_BADGE = {
  reviewed: 'Reviewed',
  pending: 'Pending faculty review',
  retired: 'Retired',
};
const reviewBadge = (c) =>
  REVIEW_BADGE[(c.facultyReview ?? {}).status ?? 'draft'] ?? 'Draft · faculty review needed';

// innerText collapsed to single spaces, then split -- the same arithmetic as
// visibleWordCount() in the smoke spec's helper.
const words = (s) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ').length : 0;
};
const sum = (...parts) => parts.reduce((n, p) => n + words(p), 0);

const orientWords = (c) =>
  sum(c.setting, reviewBadge(c), c.title, c.prompt, ...PANEL_CHROME.orient);

const feedbackWords = (c, choice) =>
  sum(
    qualityLabel(choice.quality),
    choice.feedback,
    choice.quality === 'best' ? PANEL_CHROME.transferBest : PANEL_CHROME.transferOther,
    ...PANEL_CHROME.feedbackCommon,
  );

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')).cases;

// The one observation tying this model to reality: the browser reported exactly 77 for
// family_conflict_discharge_001/d when its feedback was the 57-word WP-5n wording. If a
// template edit changes the chrome and this file is not updated, this pin fails first and
// says so, rather than the model silently drifting into agreement with nothing.
const MODEL_PIN = {
  quality: 'missed',
  feedback:
    'Specific concerns matter, but as worded this presumes the patient is deceptive and ' +
    'cross-examines him through his family — in the room, right after he has gone quiet. ' +
    'There is no timing that rescues it. Ask the family what they are worried about instead, ' +
    'and keep the patient a participant rather than the subject of the inquiry.',
  observed: 77,
};

test('the panel model reproduces the word count the browser actually reported', () => {
  const modelled = feedbackWords({}, MODEL_PIN);
  assert.equal(
    modelled,
    MODEL_PIN.observed,
    `The feedback-panel model no longer matches the browser. CI measured ` +
      `${MODEL_PIN.observed} words for this exact string; this file computes ${modelled}. ` +
      `communication-practice.html's feedbackHtml/deeperCoachingHtml chrome has probably ` +
      `changed -- update PANEL_CHROME and this pin together.`,
  );
});

test('budgets here match the smoke spec they mirror', () => {
  const spec = fs.readFileSync(specPath, 'utf8');
  assert.match(spec, new RegExp(`Orient word budget[\\s\\S]{0,200}?toBeLessThan\\(${ORIENT_BUDGET}\\)`),
    `The smoke spec's orient budget no longer reads ${ORIENT_BUDGET}; update ORIENT_BUDGET.`);
  assert.match(spec, new RegExp(`Feedback word budget[\\s\\S]{0,200}?toBeLessThan\\(${FEEDBACK_BUDGET}\\)`),
    `The smoke spec's feedback budget no longer reads ${FEEDBACK_BUDGET}; update FEEDBACK_BUDGET.`);
});

test('the chrome strings still exist in the tool', () => {
  const html = fs.readFileSync(toolPath, 'utf8');
  const literals = [
    ...PANEL_CHROME.orient,
    ...PANEL_CHROME.feedbackCommon,
    PANEL_CHROME.transferBest,
    PANEL_CHROME.transferOther,
    ...Object.values(QUALITY_LABEL),
    ...Object.values(REVIEW_BADGE),
  ];
  for (const s of literals) {
    assert.ok(
      html.includes(s),
      `communication-practice.html no longer contains the panel string ${JSON.stringify(s)}. ` +
        `The model is stale -- re-derive PANEL_CHROME from the current templates.`,
    );
  }
});

test('every authored case fits the orient word budget', () => {
  const over = cases
    .map((c) => [orientWords(c), c.id])
    .filter(([n]) => n >= ORIENT_BUDGET);
  assert.deepEqual(
    over, [],
    `Orient panel over budget (< ${ORIENT_BUDGET} words). Shorten setting/title/prompt.`,
  );
});

test('every authored choice fits the feedback word budget', () => {
  const over = [];
  for (const c of cases) {
    for (const ch of c.choices ?? []) {
      const n = feedbackWords(c, ch);
      if (n >= FEEDBACK_BUDGET) over.push([n, `${c.id}/${ch.id}`]);
    }
  }
  assert.deepEqual(
    over, [],
    `Feedback panel over budget (< ${FEEDBACK_BUDGET} words). The panel adds ~20 words of ` +
      `chrome around the feedback string, so the prose itself has ~34 words to work with.`,
  );
});
