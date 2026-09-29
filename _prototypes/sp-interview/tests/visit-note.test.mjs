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
  assert.deepEqual(graded.counts, { match: 13, differ: 0, notEstablished: 0, unclear: 0 });
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
  assert.deepEqual(graded.counts, { match: 4, differ: 0, notEstablished: 9, unclear: 0 });
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

// Review of #880 (2026-09-29): a Live reply is the model's paraphrase of the scripted lines (sp.mjs
// tells the actor to paraphrase), so a check for whole scripted lines never heard one. Every
// omission after a Live answer read "her reply there does not state it", above a reply that did.
function liveVisit(exchanges) {
  const P = new T.ProxyProvider('https://example.invalid', '', { rapportMin: pack.engine.rapportMin, rapportMax: pack.engine.rapportMax });
  const s = P.start(cd, { difficulty: 'supported' });
  // The proxy's director state is derived from the learner's words alone, and parity.test.mjs keeps
  // MockProvider identical to sp.mjs deriveState, so the offline engine supplies it here.
  const director = new T.MockProvider();
  const d = director.start(cd, { difficulty: 'supported' });
  for (const [me, pt] of exchanges) {
    director.respond(d, me);
    const t = d.turns[d.turns.length - 1];
    P._applyState(s, { reply: pt, state: { intents: t.intents, flags: t.flags, rapport: t.rapport, unlocked: Object.keys(d.unlocked) }, ticket: null }, me);
  }
  return s;
}
const HONEST = { intake: 'unknown', sertraline: 'unknown', trazodone: 'unknown', other: { text: '', none: true }, total: '12', band: 'moderate', item9: '0', si_since: 'unknown', trend: 'improved', plan_used: 'unknown', tom_meds: 'unknown', firearms: 'unknown', contacts: 'unknown' };
const ASKED = ['sertraline', 'trazodone', 'other', 'plan_used', 'firearms', 'contacts'];
// Two of these are the reviewer's own reproductions; two carry the typographic apostrophe a model writes.
const PARAPHRASED = [
  ['Are you taking the sertraline every morning?', "I missed Saturday and Sunday because it made me sick. I'm back on it now."],
  ['What about the trazodone, the one for sleep?', "I never got that one filled. I didn't want more pills around the house."],
  ['Are you taking anything over the counter, herbal, or any supplements?', "Some St. John's wort since Tuesday. It's just an herb."],
  ['Have you used your safety plan since you got home?', 'Last night, actually. I went down to the kitchen and made tea until it passed.'],
  ['Are there any guns in the house?', 'No, we don’t have any guns. Tom never wanted one.'],
  ['Who would you call at three in the morning?', 'The only name on it is my sister, and I’m not going to call her.'],
];

test('a Live paraphrase that states the fact is heard: leaving it out of the note is a difference', () => {
  const graded = T.gradeVisitNote(cd, liveVisit(PARAPHRASED), HONEST);
  ASKED.forEach((id, i) => {
    const r = row(graded, id);
    assert.equal(r.result, 'unrecorded', id);
    assert.equal(r.evidence.number, i + 1, id);
    assert.equal(r.evidence.patient, PARAPHRASED[i][1], id);
  });
  assert.deepEqual(graded.counts, { match: 4, differ: 6, notEstablished: 3, unclear: 0 });
});

test('the room never says a reply it did not write left the fact unsaid: it asks the learner to check', () => {
  const live = row(T.gradeVisitNote(cd, liveVisit([['Are you taking the sertraline every morning?', 'I take it every morning.']]), HONEST), 'sertraline');
  assert.equal(live.result, 'unclear');
  assert.doesNotMatch(live.word, /does not state it|honest entry/);
  assert.equal(live.evidence.patient, 'I take it every morning.');
  // "Continue offline" replays a Live encounter through the offline engine but keeps her Live words
  // (continueOffline in sp-interview.html), so the rule reads the reply, never the provider.
  const replayed = visit(['Are you taking the sertraline every morning?']);
  replayed.turns[0].pt = 'I take it every morning.';
  const graded = T.gradeVisitNote(cd, replayed, HONEST);
  assert.equal(row(graded, 'sertraline').result, 'unclear');
  assert.deepEqual(graded.counts, { match: 4, differ: 0, notEstablished: 8, unclear: 1 });
  // A scripted turn that only named the topic and a Live reply to the question itself: the quote is
  // the reply the learner has to read, not the one the room could.
  const mixed = visit([SKILLED[0], 'Have you used your safety plan since you got home?']);
  mixed.turns[1].pt = 'It’s on my phone.';
  const plan = row(T.gradeVisitNote(cd, mixed, HONEST), 'plan_used');
  assert.equal(plan.result, 'unclear');
  assert.equal(plan.evidence.number, 2);
});

test('the patterns hear every scripted line that states the fact, and no other line the room can speak', () => {
  const own = T.visitNoteCaseLines(cd);
  assert.ok(own.includes(cd.responses.family_social.open[0]) && own.includes(cd.gated.find((g) => g.id === 'si_behavior_detail').reveal), 'the scan covers response banks and gates');
  const asked = T.visitNoteFields(cd).map(({ field }) => field).filter((f) => f.revealedBy.intents);
  assert.deepEqual(asked.map((f) => f.id), ASKED);
  for (const field of asked) {
    const facts = T.visitNoteFactLines(cd, field);
    assert.ok(facts.length >= 2, field.id);
    for (const line of facts) assert.ok(T.visitNoteCarries(line, [], field.revealedBy.replyMatch), `${field.id} misses its own line: ${line}`);
    for (const line of own.filter((l) => !facts.includes(l))) assert.ok(!T.visitNoteCarries(line, [], field.revealedBy.replyMatch), `${field.id} hears a line that is not its fact: ${line}`);
  }
});

// Written for precision: a miss leaves the row for the learner to check, but a false hit would
// count an honest "not established" as a difference.
const HEARD = {
  sertraline: ["I skipped a couple of days when it upset my stomach.", 'Every day except the weekend — it made me nauseous.', "I didn't take it Saturday or Sunday; my stomach couldn't handle it.", 'Apart from two days last weekend, yes.'],
  trazodone: ["I haven't picked it up from the pharmacy.", "I didn't fill it. Another bottle at home didn't seem like a good idea.", 'I’m not taking that one.'],
  other: ['St John’s Wort. I read it helps.'],
  plan_used: ["I used it last night. Tea, and Ellie's drawing.", 'I did use it once, and it helped a bit.', 'I looked at the picture Ellie drew me until it passed.'],
  firearms: ['No guns. None at all.', 'We’ve never had a gun in the house.'],
  contacts: ["My sister, and I wouldn't call her at three in the morning.", "Just my sister. I haven't even told her I was in the hospital.", 'I’d never call my sister about this.'],
};
const UNHEARD = {
  sertraline: ['I take it every morning.', 'Every morning, like they told me.', "I haven't missed any days.", 'It made me a bit queasy at first, but I take it.', 'I saw Ellie on Sunday.'],
  trazodone: ['I take it most nights.', "I'm not taking it every night, just when I can't sleep.", 'I filled it out. Honestly.', 'It helps me sleep.'],
  other: ['Just the two from the hospital.', 'A glass of wine some nights.'],
  plan_used: ["It's on my phone.", "I haven't used it.", "I never used it. I didn't need to.", 'I went downstairs instead.'],
  firearms: ['Tom has a hunting rifle in the basement.', 'Guns? Why do you ask?', 'Tom keeps one locked in the closet.'],
  contacts: ["My sister's on it, and I'd call her.", "My sister wouldn't mind if I called.", "I'd call Tom."],
};

test('the patterns hear a paraphrase of the record, never a reply that leaves it unsaid or says otherwise', () => {
  const fields = Object.fromEntries(T.visitNoteFields(cd).map(({ field }) => [field.id, field]));
  assert.deepEqual(Object.keys(HEARD), ASKED);
  assert.deepEqual(Object.keys(UNHEARD), ASKED);
  for (const id of ASKED) {
    const patterns = fields[id].revealedBy.replyMatch;
    for (const reply of HEARD[id]) assert.ok(T.visitNoteCarries(reply, [], patterns), `${id} should hear: ${reply}`);
    for (const reply of UNHEARD[id]) assert.ok(!T.visitNoteCarries(reply, [], patterns), `${id} should not hear: ${reply}`);
  }
});

test('the summary counts the rows to check apart, and says nothing of them when there are none', () => {
  assert.equal(T.visitNoteSummary({ match: 4, differ: 5, notEstablished: 3, unclear: 1 }), '4 match · 5 differ · 3 not established in this visit · 1 to check');
  assert.equal(T.visitNoteSummary({ match: 6, differ: 0, notEstablished: 7, unclear: 0 }), '6 match · 0 differ · 7 not established in this visit');
});
