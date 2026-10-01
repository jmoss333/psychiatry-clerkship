import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// What Do You Say Next? — same-skill second pass (static pilot, one case).
//
// The handoff that asked for this loop set three boundaries that a browser test can show
// for one run but cannot pin as a contract: (1) the second pass reuses the variation the
// case ALREADY carries, verbatim, so the change ships no new clinical wording; (2) the
// second pass is session-only — it never writes cw_comm_v1 or schedules a cw_srs_v1 card;
// (3) the retry exists for the one pilot case only, and every other case keeps the
// "Try the next related case" action the fast-rep design specified. These tests read the
// tool's own source and communication_cases.json so a later edit to either file that
// breaks a boundary fails here, before the smoke suite's separate CI job.
//
// Deliberately NOT asserted: the pilot case's facultyReview.status. That is live governance
// state (CLAUDE.md: a test may not depend on it); the panels surface it through
// reviewBadge(), and that wiring is what is pinned below.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolPath = path.join(
  repo, '02_Clinical_Skills', 'Communication_Practice', 'communication-practice.html');
const casesPath = path.join(repo, 'communication_cases.json');

const html = fs.readFileSync(toolPath, 'utf8');
const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')).cases;

// The pilot table is a plain object literal on one line; evaluate exactly that literal.
const pilotLine = script.split('\n').find((line) => line.startsWith('var RETRY_PILOT='));
assert.ok(pilotLine, 'communication-practice.html declares RETRY_PILOT on its own line');
// eslint-disable-next-line no-new-func
const RETRY_PILOT = new Function(`${pilotLine}; return RETRY_PILOT;`)();

// One-line template functions, sliced by name so each contract reads one panel's markup.
function fn(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.ok(start > -1, `function ${name} exists in the tool`);
  const end = script.indexOf('\nfunction ', start + 1);
  return script.slice(start, end === -1 ? undefined : end);
}
const count = (src, needle) => src.split(needle).length - 1;

test('the pilot covers exactly one authored case, and it exists', () => {
  assert.deepEqual(Object.keys(RETRY_PILOT), ['teach_back_closing_001']);
  const pilot = cases.find((c) => c.id === 'teach_back_closing_001');
  assert.ok(pilot, 'teach_back_closing_001 is still in communication_cases.json');
});

test('the second-pass variation is the authored best-choice feedback, verbatim', () => {
  const pilot = cases.find((c) => c.id === 'teach_back_closing_001');
  const best = pilot.choices.filter((ch) => ch.quality === 'best');
  assert.equal(best.length, 1, 'the pilot case has exactly one best choice');
  const { variation } = RETRY_PILOT.teach_back_closing_001;
  assert.ok(typeof variation === 'string' && variation.length > 0);
  assert.ok(
    best[0].feedback.endsWith(variation),
    `RETRY_PILOT.variation must be the trailing sentence of choice ${best[0].id}'s authored ` +
      `feedback. If faculty rewrote that feedback, update the pilot text to match or retire ` +
      `the pilot — never author a new variation here without an exact-text review.`,
  );
  assert.match(variation, /^Retry: /, 'the variation keeps its authored "Retry:" lead-in');
});

test('the second pass never records or grades: saveAttempt is called once, on the first pass only', () => {
  const choose = fn('choose');
  assert.equal(count(script, 'saveAttempt(c.id,picked)'), 1, 'one call site, in choose()');
  const retryBranch = choose.indexOf('state.phase===PHASE.RETRY_COMPARE');
  const save = choose.indexOf('saveAttempt(c.id,picked)');
  assert.ok(retryBranch > -1 && save > retryBranch, 'the RETRY_COMPARE branch precedes the save');
  const branch = choose.slice(retryBranch, save);
  assert.match(branch, /setPhase\(PHASE\.RETRY_FEEDBACK,picked\.feedback\);return;\}/,
    'the retry branch returns before saveAttempt can run');
  assert.doesNotMatch(branch, /saveAttempt|srsGradeCard|localStorage/, 'nothing persists in the retry branch');
  // The only first-pass gate: a stale choice click outside Compare does nothing.
  assert.match(choose, /if\(state\.phase!==PHASE\.COMPARE\)return;state\.choice=picked;/);
  // No other code path writes the practice history.
  assert.equal(count(script, "localStorage.setItem('cw_comm_v1'"), 1, 'one cw_comm_v1 write, in saveAttempt');
  for (const name of ['retrySpeakingHtml', 'retryCompareHtml', 'retryFeedbackHtml', 'finishedHtml',
    'startSecondPass', 'finishPractice']) {
    assert.doesNotMatch(fn(name), /saveAttempt|srsGradeCard|localStorage/, `${name} persists nothing`);
  }
});

test('every case outside the pilot keeps the next-related primary action', () => {
  const next = fn('primaryNextHtml');
  assert.match(next, /retryPilot\(c\)\?'<button[^']*data-second-pass>Retry the same skill<\/button>':'<button[^']*data-next-related>Try the next related case<\/button>'/);
  // The retry panels can only render for a pilot case that has a recorded first pass.
  assert.match(fn('repHtml'), /if\(retryPilot\(c\)&&state\.choice\)\{if\(state\.phase===PHASE\.RETRY_SPEAKING\)/);
  assert.match(fn('startSecondPass'), /if\(!retryPilot\(currentCase\(\)\)\|\|!state\.choice\)return;/);
});

test('each second-pass panel keeps the one-heading, one-task, at-most-one-action shell', () => {
  for (const [name, actions] of [
    ['retrySpeakingHtml', 1], ['retryCompareHtml', 0], ['retryFeedbackHtml', 1], ['finishedHtml', 1]]) {
    const src = fn(name);
    assert.equal(count(src, 'id="phase-heading" tabindex="-1"'), 1, `${name}: one focusable heading`);
    assert.equal(count(src, 'data-primary-task'), 1, `${name}: one primary task`);
    assert.equal(count(src, 'data-primary-action'), actions, `${name}: ${actions} standalone action(s)`);
    assert.equal(count(src, 'data-rep-panel'), 1, `${name}: one rep panel`);
  }
  // The finish panel's "again" button is secondary — present, but not a second primary action.
  assert.match(fn('finishedHtml'), /class="secondary" data-second-pass>Practice the second pass again</);
});

test('the pilot panels surface the case\'s faculty-review badge rather than hiding it', () => {
  assert.match(fn('retrySpeakingHtml'), /reviewBadge\(c\)/);
  assert.match(fn('finishedHtml'), /reviewBadge\(c\)/);
  // The badge vocabulary itself is unchanged: draft is still labelled as needing review.
  assert.match(fn('reviewBadge'), /Draft · faculty review needed/);
});

test('the second pass is honest about what it compares and what it keeps', () => {
  const feedback = fn('retryFeedbackHtml');
  assert.match(feedback, /This compares the two authored lines you chose, not your spoken words\./);
  assert.match(fn('finishedHtml'), /The second pass was not saved\./);
  assert.doesNotMatch(fn('finishedHtml'), /Your first choice is in local history/);
  assert.match(fn('retrySpeakingHtml'), /Your browser does not listen or record\./);
  // Coaching reuses the authored include/avoid lists and the existing huddle prompt — no new lists.
  const coaching = fn('retryCoachingHtml');
  assert.match(coaching, /Nothing from this second pass is saved\./);
  assert.doesNotMatch(coaching, /Your first choice remains in local history/);
  assert.match(coaching, /d\.mustInclude\.map/);
  assert.match(coaching, /d\.avoid\.map/);
  assert.match(coaching, /supervisionPrompt\(c,second\)/);
  assert.doesNotMatch(coaching, /<li>[A-Z][^<]{10,}<\/li>/, 'no hard-coded coaching bullets');
});

test('timer plumbing treats both speaking phases alike, so interruption rules carry over', () => {
  assert.match(fn('isSpeaking'), /phase===PHASE\.SPEAKING\|\|phase===PHASE\.RETRY_SPEAKING/);
  assert.match(fn('setPhase'), /if\(isSpeaking\(state\.phase\)&&!isSpeaking\(nextPhase\)\)clearTimer\(\);/);
  assert.match(fn('updateTimerDom'), /if\(!isSpeaking\(state\.phase\)\|\|state\.timerCaseId!==currentCase\(\)\.id\)return;/);
  assert.match(fn('finishSpeaking'), /if\(!isSpeaking\(state\.phase\)\)return;/);
  assert.match(fn('applyFilter'), /if\(isSpeaking\(state\.phase\)\)resetRepState\(\);/);
  for (const name of ['resetRepState', 'resetRep']) {
    assert.match(fn(name), /state\.retryChoice=null;/, `${name} clears the second-pass pick`);
  }
});
