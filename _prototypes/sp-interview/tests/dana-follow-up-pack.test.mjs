// Dana one week after discharge (sp_depression_followup_001): the pack case and its invariants.
// It lands `pending` — the tool, the proxy and the red-team runner offer only `reviewed` cases —
// and becomes `reviewed` only on the owner's read of its lines. Every test here holds in both
// states; the landing-shape test accepts either and checks the one it finds.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../..');
const { _internals } = await import(path.join(REPO, 'sp-proxy/netlify/functions/sp.mjs'));
const { deriveState, computeCoverage, actorSystem } = _internals;
const pack = JSON.parse(fs.readFileSync(path.join(here, '..', 'sp-interview.pack.json'), 'utf8'));
const rights = JSON.parse(fs.readFileSync(path.join(REPO, 'instrument_rights.json'), 'utf8'));

const FOLLOW_UP = 'sp_depression_followup_001';
const cd = pack.cases.find((c) => c.id === FOLLOW_UP);
const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
const intent = (id) => cd.intents.find((i) => i.id === id);
const SKILLED = [
  "Hi Dana, I'm Alex, the medical student working with Dr. Rivera. Today I'd like to go over how the week has gone, your medicines, your safety plan and the form you filled out — is that okay?",
  'How has it been since you left the hospital?',
  "It sounds like you've been working hard to be okay by the interview.",
  'How has your mood been?',
  'How are you sleeping?',
  'And your energy?',
  'The discharge plan had a therapy intake on Monday — did you make it to that appointment?',
  'Are you taking the sertraline every morning?',
  'What about the trazodone, the one for sleep?',
  'Are you taking anything over the counter, herbal, or any supplements?',
  'How much alcohol have you been drinking?',
  'Can we go over the questionnaire you filled out?',
  'Since you left the hospital, have you had any thoughts of killing yourself?',
  'Have you made any plan to end your life?',
  'Have you done anything since you left to act on those thoughts?',
  'What keeps you going on those nights?',
  'Did Tom take his sleeping pills to work like he said?',
  'Are there any guns in the house?',
  'Have you used your safety plan since you got home?',
  'Who would you call at three in the morning?',
  "Let me make sure I've got this right — and before you leave, can we rebook the intake together?",
];

test('the follow-up is the same patient, appended last, with a pending or a fully signed review', () => {
  assert.ok(cd, 'the pack carries the follow-up case');
  assert.equal(pack.cases[pack.cases.length - 1].id, FOLLOW_UP, 'appended after Morgan');
  assert.equal(cd.persona.displayName, dana.persona.displayName, 'the same patient as Day 1');
  assert.equal(cd.title, 'Dana — One week after discharge');
  assert.equal(cd.continues, dana.id, 'the next encounter after the admission interview');
  const review = cd.facultyReview;
  assert.ok(['pending', 'reviewed'].includes(review.status), `status ${review.status}`);
  if (review.status === 'pending') assert.deepEqual(review, { status: 'pending', reviewer: null, lastReviewed: null });
  else assert.ok(review.reviewer && /^\d{4}-\d{2}-\d{2}$/.test(review.lastReviewed), 'a signed review names its reviewer and date');
  assert.equal(cd.speechProfile.status, 'draft-pending-attestation');
  assert.equal(cd.speechProfile.cadence, dana.speechProfile.cadence);
  assert.equal(cd.speechProfile.speakingRate, dana.speechProfile.speakingRate);
  assert.notEqual(cd.speechProfile.id, dana.speechProfile.id, 'its own draft profile id');
});

test('the uniform suicide screen is Day 1 Dana\'s byte for byte, and c_si has the exact uniform shape', () => {
  for (const id of ['si_direct', 'si_passive', 'si_euphemism']) {
    assert.deepEqual(intent(id), dana.intents.find((i) => i.id === id), `${id} matches Day 1`);
  }
  assert.deepEqual(cd.checklist.find((c) => c.id === 'c_si'), {
    id: 'c_si', label: 'Suicide: asked directly, in plain language', intents: ['si_direct'],
    partialIfOnly: ['si_euphemism', 'si_passive'], critical: true,
  });
  assert.equal(cd.checklist.filter((c) => c.critical).length, 1, 'one critical item');
  assert.deepEqual(cd.rubric.domains.map((d) => d.id), ['alliance', 'data', 'technique', 'organization']);
  for (const key of ['partial', 'missed', 'rehearse', 'ref', 'reframe']) assert.ok(cd.criticalMiss[key].length > 10, key);
});

test('nothing in the case is a dose, a crisis number, PHQ-9 wording or a Stanley-Brown form label', () => {
  const text = JSON.stringify(cd);
  const lower = text.toLowerCase();
  assert.doesNotMatch(text, /\d+\s?(mg|mcg|mL)\b/, 'no dose literal');
  assert.doesNotMatch(text, /\b(988|741741|911)\b/, 'no crisis number in the pack');
  const phq = rights.instruments.find((i) => i.id === 'phq9-gad7');
  assert.ok(phq.signatures.length >= 3, 'the registered PHQ signatures are read, not assumed');
  for (const signature of phq.signatures) assert.ok(!lower.includes(signature.toLowerCase()), `PHQ item wording: ${signature}`);
  // The form's two most distinctive response options (its anchor ladder); held here only to detect them.
  for (const option of ['more than half the days', 'nearly every day']) assert.ok(!lower.includes(option), `PHQ response wording: ${option}`);
  // The distinctive labels tests/safety-planning-shell.test.mjs treats as reproduction of the form.
  for (const label of ['internal coping strategies', 'people and social settings that provide distraction', 'people whom i can ask for help', 'professionals or agencies i can contact during a crisis', 'making the environment safer']) {
    assert.ok(!lower.includes(label), `Stanley-Brown label: ${label}`);
  }
});

test('small talk opens nothing, every gate is wired, and no gate opens on a euphemism (S1–S3, before review)', () => {
  const SMALL_TALK = ['Hi.', 'Thanks for taking the time to talk with me.', 'Okay.', 'Tell me more about that.', 'It sounds like it has been a long week.'];
  const ids = new Set(cd.gated.map((g) => g.id));
  for (const g of cd.gated) {
    assert.ok(g.requiresIntents.length, `${g.id} has keys`);
    for (const key of g.requiresIntents) {
      assert.ok(intent(key), `${g.id} requires a defined intent ${key}`);
      assert.ok(!SMALL_TALK.some((line) => intent(key).patterns.some((p) => new RegExp(p, 'i').test(line))), `${g.id}/${key} opens on small talk`);
    }
    if (g.requiresGate) assert.ok(ids.has(g.requiresGate) && g.requiresGate !== g.id, `${g.id} parent`);
    assert.ok(!g.requiresIntents.includes('si_euphemism'), `${g.id} opens on si_euphemism (G1)`);
  }
  assert.deepEqual(Object.keys(deriveState(cd, SMALL_TALK).unlocked), []);
});

test('a skilled visit opens every gate and fully covers the checklist', () => {
  const s = deriveState(cd, SKILLED);
  assert.deepEqual(Object.keys(s.unlocked).sort(), cd.gated.map((g) => g.id).sort());
  for (const row of computeCoverage(cd, s)) assert.equal(row.status, 'observed', row.id);
});

test('Tom\'s pills are a means question, never her trazodone; a generic medicine question credits only itself', () => {
  const tom = deriveState(cd, ['Did Tom take his sleep medication to work?']);
  assert.ok(tom.covered.means_check && tom.covered.si_means && !tom.covered.med_trazodone, Object.keys(tom.covered).join(','));
  assert.ok(tom.unlocked.means_detail, 'the question opens the means disclosure at any rapport');
  const generic = deriveState(cd, ['Are you taking your medications?']);
  assert.ok(generic.covered.meds_medical && !generic.covered.med_sertraline && !generic.covered.med_trazodone && !generic.covered.med_other);
});

test('reading item 9 aloud opens the disclosure and grades c_si partial; a euphemism opens nothing', () => {
  const item9 = deriveState(cd, ['On the form, the last question asks about thoughts that you would be better off dead — can we talk about that one?']);
  assert.ok(item9.unlocked.si_active && item9.covered.questionnaire_review);
  assert.equal(computeCoverage(cd, item9).find((r) => r.id === 'c_si').status, 'partial');
  assert.deepEqual(Object.keys(deriveState(cd, ['Have you had any thoughts of hurting yourself?']).unlocked), []);
});

test('a judgmental turn holds back the intake answer until it is two turns back', () => {
  assert.ok(!deriveState(cd, ['You should really keep your appointments.', 'Did you make it to the intake on Monday?']).unlocked.appt_detail);
  assert.ok(deriveState(cd, ['You should really keep your appointments.', 'Okay.', 'Okay.', 'Did you make it to the intake on Monday?']).unlocked.appt_detail);
});

test('the chart and the note agree: 13 fields, the scores make the total, the band and item 9 follow, every source resolves', () => {
  const chart = Object.fromEntries(cd.chart.map((d) => [d.id, d]));
  const fields = cd.visitNote.sections.flatMap((s) => s.fields);
  const f = Object.fromEntries(fields.map((x) => [x.id, x]));
  assert.equal(fields.length, 13);
  const scores = chart['phq9-today'].scores;
  assert.equal(scores.length, 9);
  assert.equal(scores.reduce((a, b) => a + b, 0), f.total.answer);
  assert.ok(chart['phq9-today'].lines[0].includes(scores.join(' · ')), 'the chart line shows the item scores');
  assert.equal(f.band.bands.find((b) => f.total.answer <= b.max).value, f.band.answer);
  assert.deepEqual(f.band.bands.map((b) => b.max), [4, 9, 14, 19, 27], 'the Screeners page bands');
  assert.equal(f.item9.answer, scores[8]);
  assert.ok(chart['discharge-summary'].lines.some((l) => l.includes('PHQ-9 at admission: 22')) && f.trend.answer === 'improved');
  const gates = new Set(cd.gated.map((g) => g.id));
  for (const x of fields) {
    const r = x.revealedBy;
    if (r.gate) assert.ok(gates.has(r.gate), `${x.id}: gate ${r.gate}`);
    if (r.intents) r.intents.forEach((id) => assert.ok(intent(id), `${x.id}: intent ${id}`));
    if (r.chart) assert.ok(chart[r.chart], `${x.id}: chart ${r.chart}`);
    if (x.type === 'choice') {
      assert.ok(x.choices.some((c) => c[0] === x.answer), `${x.id}: answer is a choice`);
      if (!r.chart) assert.ok(x.choices.some((c) => c[0] === x.unknown), `${x.id}: an elicited field offers "not established"`);
    }
    if (x.type === 'items') x.expect.forEach((ex) => ex.match.forEach((p) => new RegExp(p, 'i')));
    assert.ok(x.record.length > 5 && x.teach.length > 5, `${x.id}: record and teaching line`);
  }
});

test('every graded fact is in both tiers of its reply (or a gate); the generic medicine reply reveals none', () => {
  const both = (key, re) => ['guarded', 'open'].every((tier) => cd.responses[key][tier].every((line) => re.test(line)));
  assert.ok(both('med_sertraline', /skipped/i));
  assert.ok(both('side_effects', /skipped/i));
  assert.ok(both('med_trazodone', /never filled|didn't fill/i));
  assert.ok(both('med_other', /st\. john/i));
  assert.ok(both('plan_review', /used it/i));
  assert.ok(both('plan_contacts', /sister/i) && both('plan_contacts', /not calling/i));
  assert.ok(both('firearms', /no guns/i));
  assert.ok(['guarded', 'open'].every((tier) => cd.responses.meds_medical[tier].every((line) => !/wort|skip|fill/i.test(line))));
});

test('locked content, the hidden agenda and the answer key stay out of the actor prompt', () => {
  const system = actorSystem(cd, deriveState(cd, []));
  for (const g of cd.gated) assert.ok(!system.includes(g.reveal), `locked reveal: ${g.id}`);
  assert.ok(!system.includes(cd.hiddenAgenda));
  for (const x of cd.visitNote.sections.flatMap((s) => s.fields)) assert.ok(!system.includes(x.record), `answer key: ${x.id}`);
});

test('the chart states only what the discharge record holds, never a gated fact', () => {
  const chart = JSON.stringify(cd.chart).toLowerCase();
  for (const fact of ['cancel', 'skipped', 'never filled', 'wort', 'two nights', 'send me back', "haven't looked", 'sister', 'zero on the form']) {
    assert.ok(!chart.includes(fact), `the chart gives away: ${fact}`);
  }
});
