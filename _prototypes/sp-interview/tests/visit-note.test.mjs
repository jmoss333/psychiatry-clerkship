// The chart and the visit note — a per-case, browser-only feature of the Interview Room — driven
// through the page's own offline engine. The follow-up case is read from the pack as content: no
// test here reads a case's review status (CLAUDE.md: a test may not depend on live governance
// state); the next-encounter test builds the statuses it needs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'sp-interview.html'), 'utf8');
const script = html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/)[0].replace(/^<script>\n/, '').replace(/\n<\/script>$/, '');
globalThis.window = {};
globalThis.document = { getElementById: () => ({ addEventListener() {}, removeEventListener() {}, textContent: '' }), documentElement: { getAttribute: () => null, setAttribute() {} }, createElement: () => ({ click() {}, set href(v) {} }), body: { appendChild() {}, removeChild() {} }, querySelector: () => null, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.React = { createElement: () => null, useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) };
globalThis.ReactDOM = { createRoot: () => ({ render() {} }) };
globalThis.fetch = () => Promise.reject(new Error('no net'));
// Indirect eval runs this repository's own page script in the global scope, as smoke.test.js and
// morgan.test.js do, so these tests exercise the shipped functions rather than a copy of them.
(0, eval)(script);
const T = globalThis.window.__SP_TEST__;
const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'sp-interview.pack.json'), 'utf8'));
const cd = pack.cases.find((c) => c.id === 'sp_depression_followup_001');
const dayOne = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');

function visit(lines) {
  const P = new T.MockProvider();
  const s = P.start(cd, { difficulty: 'supported' });
  for (const line of lines) P.respond(s, line);
  return s;
}
const row = (graded, id) => graded.rows.find((r) => r.id === id);
const RIGHT = { intake: 'missed', sertraline: 'differently', trazodone: 'not_taking', other: { text: "St. John's wort; wine some nights", none: false }, total: '12', band: 'moderate', item9: '0', si_since: 'passive', trend: 'improved', plan_used: 'yes', tom_meds: 'not_confirmed', firearms: 'none', contacts: 'revise' };
const SKILLED = [
  "Hi Dana, I'm Alex, the medical student working with Dr. Rivera. Today I'd like to go over how the week has gone, your medicines, your safety plan and the form you filled out — is that okay?",
  'How has it been since you left the hospital?',
  "It sounds like you've been working hard to be okay by the interview.",
  'How has your mood been?', 'How are you sleeping?', 'And your energy?',
  'The discharge plan had a therapy intake on Monday — did you make it to that appointment?',
  'Are you taking the sertraline every morning?', 'What about the trazodone, the one for sleep?',
  'Are you taking anything over the counter, herbal, or any supplements?', 'How much alcohol have you been drinking?',
  'Can we go over the questionnaire you filled out?',
  'Since you left the hospital, have you had any thoughts of killing yourself?',
  'Have you made any plan to end your life?', 'Have you done anything since you left to act on those thoughts?',
  'What keeps you going on those nights?', 'Did Tom take his sleeping pills to work like he said?', 'Are there any guns in the house?',
  'Have you used your safety plan since you got home?', 'Who would you call at three in the morning?',
  "Let me make sure I've got this right — and before you leave, can we rebook the intake together?",
];

test('the case declares four chart documents; a case without a chart has none', () => {
  assert.deepEqual(T.chartDocs(cd).map((d) => d.id), ['discharge-summary', 'discharge-medications', 'follow-up-plan', 'phq9-today']);
  assert.deepEqual(T.chartDocs(dayOne), []);
  assert.deepEqual(T.visitNoteFields(dayOne), []);
  assert.equal(T.visitNoteComplete(dayOne, {}), true, 'a case without a note never blocks the self-assessment');
});

test('the note is complete only when every field has an answer; numbers are whole numbers in range', () => {
  assert.equal(T.visitNoteFields(cd).length, 13);
  assert.equal(T.visitNoteComplete(cd, RIGHT), true);
  const missing = { ...RIGHT }; delete missing.firearms;
  assert.equal(T.visitNoteComplete(cd, missing), false);
  for (const total of ['012', ' 12 ']) assert.equal(T.visitNoteComplete(cd, { ...RIGHT, total }), true, JSON.stringify(total));
  for (const total of ['12.0', 'twelve', '28', '-1', '']) assert.equal(T.visitNoteComplete(cd, { ...RIGHT, total }), false, JSON.stringify(total));
  assert.equal(row(T.gradeVisitNote(cd, visit([]), { ...RIGHT, total: '012' }), 'total').result, 'match');
  assert.equal(T.visitNoteComplete(cd, { ...RIGHT, other: { text: '   ', none: false } }), false, 'blank text is not an answer');
  assert.equal(T.visitNoteComplete(cd, { ...RIGHT, other: { text: '', none: true } }), true, '"None found" is an answer');
});

test('a skilled visit with a right note: every row matches, with her reply beside each elicited fact', () => {
  const graded = T.gradeVisitNote(cd, visit(SKILLED), RIGHT);
  assert.deepEqual(graded.counts, { match: 13, differ: 0, notEstablished: 0 });
  assert.equal(row(graded, 'si_since').evidence.number, 13, 'the plain question is exchange 13');
  assert.match(row(graded, 'si_since').evidence.patient, /put zero on the form/);
  assert.equal(row(graded, 'intake').evidence.number, 7);
  assert.equal(row(graded, 'tom_meds').evidence.number, 17);
  assert.equal(row(graded, 'total').evidence, null, 'a chart-derived row quotes no exchange');
  assert.equal(row(graded, 'other').note, 'You also recorded: Wine some nights.');
});

test('no questions asked and an honest note: elicited rows are "not established", chart rows still score', () => {
  const honest = { intake: 'unknown', sertraline: 'unknown', trazodone: 'unknown', other: { text: '', none: true }, total: '12', band: 'moderate', item9: '0', si_since: 'unknown', trend: 'improved', plan_used: 'unknown', tom_meds: 'unknown', firearms: 'unknown', contacts: 'unknown' };
  const graded = T.gradeVisitNote(cd, visit(['Hi.']), honest);
  assert.deepEqual(graded.counts, { match: 4, differ: 0, notEstablished: 9 });
  assert.ok(graded.rows.filter((r) => !r.fromChart).every((r) => r.result === 'accurate'));
});

test('assumptions made without asking differ; a right guess is flagged, not credited', () => {
  const graded = T.gradeVisitNote(cd, visit(['Hi.']), { ...RIGHT, intake: 'kept', sertraline: 'as_prescribed', si_since: 'none' });
  for (const id of ['intake', 'sertraline', 'si_since']) assert.equal(row(graded, id).result, 'differs-unestablished', id);
  assert.equal(row(graded, 'trazodone').result, 'unsupported');
  assert.match(row(graded, 'trazodone').word, /did not recognize the topic/);
});

test('asked but not recorded; a wrong total with its own band gets the band note', () => {
  const graded = T.gradeVisitNote(cd, visit(SKILLED), { ...RIGHT, intake: 'unknown', total: '8', band: 'mild' });
  assert.equal(row(graded, 'intake').result, 'unrecorded');
  assert.equal(row(graded, 'total').result, 'differs');
  assert.equal(row(graded, 'band').result, 'differs');
  assert.equal(row(graded, 'band').note, 'That is the right band for the total you wrote (8).');
});

test('items: "None found" after she named it, text without the required item, and "None found" ticked over typed text', () => {
  const s = visit(SKILLED);
  assert.equal(row(T.gradeVisitNote(cd, s, { ...RIGHT, other: { text: '', none: true } }), 'other').result, 'unrecorded');
  assert.equal(row(T.gradeVisitNote(cd, s, { ...RIGHT, other: { text: 'melatonin', none: false } }), 'other').result, 'differs');
  // Ticking "None found" keeps the typed text (unticking restores it); while ticked it grades as none.
  const ticked = row(T.gradeVisitNote(cd, s, { ...RIGHT, other: { text: "St. John's wort", none: true } }), 'other');
  assert.equal(ticked.result, 'unrecorded');
  assert.equal(ticked.entry, 'None found');
  assert.equal(ticked.note, '');
});

test('item 9 read aloud: the disclosure opens on that exchange, and c_si stays partial', () => {
  const s = visit(['On the form, the last question asks about thoughts that you would be better off dead — can we talk about that one?']);
  const r = row(T.gradeVisitNote(cd, s, RIGHT), 'si_since');
  assert.equal(r.result, 'match');
  assert.equal(r.evidence.number, 1);
  assert.equal(T.computeCoverage(s).find((c) => c.id === 'c_si').status, 'partial');
});

test('the evidence is her actual reply, not the scripted line (a live model may leave a fact unsaid)', () => {
  const s = visit(['Are you taking the sertraline every morning?']);
  s.turns[0].pt = 'I take it every morning.';
  const r = row(T.gradeVisitNote(cd, s, { ...RIGHT, sertraline: 'as_prescribed' }), 'sertraline');
  assert.equal(r.result, 'differs');
  assert.equal(r.evidence.patient, 'I take it every morning.');
  assert.equal(r.record, 'Taking it, but she skipped two days for nausea.');
});

test('a disclosure the replay cannot place is still established (a spoken turn can join several utterances)', () => {
  const s = visit(['Hi.']);
  s.unlocked.si_active = true; // as recorded from the proxy's state for a spoken turn
  const r = row(T.gradeVisitNote(cd, s, RIGHT), 'si_since');
  assert.equal(r.established, true);
  assert.equal(r.evidence, null);
  assert.equal(r.result, 'match');
});

test('the next encounter with the same patient is offered only once faculty have released it', () => {
  const copy = (status) => {
    const p = JSON.parse(JSON.stringify(pack));
    p.cases.find((c) => c.id === cd.id).facultyReview = status === 'reviewed'
      ? { status: 'reviewed', reviewer: 'Fixture reviewer', lastReviewed: '2026-01-01' }
      : { status: 'pending', reviewer: null, lastReviewed: null };
    return p;
  };
  assert.equal(T.nextEncounterFor(copy('reviewed'), dayOne.id).id, cd.id);
  assert.equal(T.nextEncounterFor(copy('pending'), dayOne.id), null);
  assert.equal(T.nextEncounterFor(copy('reviewed'), 'sp_mania_redirect_001'), null);
});

// Final review (2026-09-28): a turn can be recognized for a topic her reply never addresses. Offline
// Dana answers one topic per turn, so the agenda line ("… your medicines, your safety plan and the
// form …") is recognized for the plan while she answers about her medicines.
test('the quote is the exchange where she said it, not the agenda turn that only named the topic', () => {
  const r = row(T.gradeVisitNote(cd, visit(SKILLED), RIGHT), 'plan_used');
  assert.equal(r.evidence.number, 19, 'the safety-plan question, not exchange 1');
  assert.match(r.evidence.patient, /used it last night/);
});

test('an honest "not established" is no difference when her reply never stated the fact', () => {
  const agendaOnly = T.gradeVisitNote(cd, visit([SKILLED[0]]), { ...RIGHT, plan_used: 'unknown' });
  const plan = row(agendaOnly, 'plan_used');
  assert.equal(plan.result, 'unconfirmed');
  assert.match(plan.word, /does not state it/);
  assert.equal(plan.evidence.number, 1, 'the recognized exchange is still shown, to check');
  assert.equal(agendaOnly.counts.differ, 0);
  // A specific question answered generically is the same case.
  const generic = T.gradeVisitNote(cd, visit(['Are you taking your medications, like the sertraline?']), { ...RIGHT, sertraline: 'unknown' });
  assert.equal(row(generic, 'sertraline').result, 'unconfirmed');
  // Once she has said it, leaving it out of the note is still a difference.
  assert.equal(row(T.gradeVisitNote(cd, visit(SKILLED), { ...RIGHT, plan_used: 'unknown' }), 'plan_used').result, 'unrecorded');
});

test('a softened question or a held-back disclosure is recognized: the row says she did not disclose it', () => {
  const soft = row(T.gradeVisitNote(cd, visit(['Have you had any thoughts of hurting yourself?']), { ...RIGHT, si_since: 'none' }), 'si_since');
  assert.equal(soft.result, 'differs-unestablished');
  assert.equal(soft.recognized, true);
  assert.doesNotMatch(soft.word, /did not recognize/);
  assert.match(soft.word, /did not disclose/);
  assert.equal(soft.evidence.number, 1);
  assert.match(soft.evidence.patient, /Hurt myself\? No/);
  const held = row(T.gradeVisitNote(cd, visit(['You should really keep your appointments.', 'Did you make it to the intake on Monday?']), RIGHT), 'intake');
  assert.equal(held.result, 'unsupported');
  assert.equal(held.recognized, true);
  assert.match(held.word, /did not disclose/);
  assert.equal(held.evidence.number, 2, 'the question she deflected');
  const never = row(T.gradeVisitNote(cd, visit(['Hi.']), RIGHT), 'intake');
  assert.equal(never.recognized, false);
  assert.match(never.word, /did not recognize the topic/);
});

test('each case speaks at its declared rate, so the follow-up keeps Day 1\'s measured pace', () => {
  for (const c of pack.cases) assert.equal(T.paceFor(c).rate, c.speechProfile.speakingRate, c.id);
  assert.equal(T.paceFor(cd).label, T.paceFor(dayOne).label);
});
