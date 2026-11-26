// Interview Room red-team findings IR-2 to IR-10 (simulator red-team, 2026-11-25; fixes drafted
// 2026-11-26 for faculty review). Each finding is pinned on BOTH the server (sp.mjs deriveState /
// computeCoverage) and the client (MockProvider + the debrief helpers), because a client that
// out-scores the server is a parity break (security invariant #1) and the debrief is client-only.
//
//   IR-3/IR-12  excludePatterns veto a negated ask, a third person's suicide, a family-history
//               question and "we'll keep you safe" on the screen and violence intents; a direct
//               question still matches, and the client honours the excludes the way the server does.
//   IR-2        a rapport-gated screen the patient deflected is never "observed".
//   IR-4        follow-up counts only on a clean turn that BEGAN with the disclosure gate open;
//               technique cannot read Observed while a follow-up row a disclosure opened is incomplete.
//   IR-5        follow-up rows after Ray's command disclosure (critical once g_command opens) and
//               after Marcus's disclosure.
//   IR-6        Morgan: abrupt-cessation advice is a flag; the withdrawal history is answerable.
//   IR-7        a critical step asked after the hallway coach named it reads "completed after a prompt".
//   IR-9        a total suicide miss shows the pack's criticalMiss.missed plainly; the hedge and the
//               self-report stay for partial or ambiguous asks, the self-report only on safety turns.
//   IR-10       Dana's follow-up visit: means safety becomes critical once she discloses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { _internals } = await import(path.join(REPO, 'sp-proxy/netlify/functions/sp.mjs'));
const pack = JSON.parse(fs.readFileSync(path.join(REPO, '_prototypes/sp-interview/sp-interview.pack.json'), 'utf8'));
const html = fs.readFileSync(path.join(REPO, '_prototypes/sp-interview/sp-interview.html'), 'utf8');
const src = html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/)[0].replace(/^<script>\n/, '').replace(/\n<\/script>$/, '');
global.window = {};
global.document = { getElementById: () => ({ addEventListener() {}, removeEventListener() {}, textContent: '' }), documentElement: { getAttribute: () => null, setAttribute() {} }, createElement: () => ({ click() {} }) };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.React = { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) };
global.ReactDOM = { createRoot: () => ({ render() {} }) };
global.fetch = () => Promise.reject(new Error('no net'));
(0, eval)(src);
const T = global.window.__SP_TEST__;

const byId = Object.fromEntries(pack.cases.map((c) => [c.id, c]));
const DANA = byId.sp_depression_gated_si_001, MARCUS = byId.sp_mania_redirect_001, RAY = byId.sp_psychosis_paranoid_001;
const MORGAN = byId.sp_alcohol_ambivalence_001, FOLLOWUP = byId.sp_depression_followup_001;
const RAY_WARM = ["Hi, I'm Alex, one of the medical students — and no, this isn't being recorded. You're in control of what we talk about.",
  'We can stop whenever you want. What has this been like for you, these last few weeks?',
  'That sounds really frightening — living like that.', 'That sounds exhausting — carrying all of this by yourself.'];

async function client(caseDef, msgs) {
  const P = new T.MockProvider(); const s = P.start(caseDef, { difficulty: 'supported' }); const replies = [];
  for (const m of msgs) replies.push((await P.respond(s, m)).reply);
  return { s, replies, cov: T.computeCoverage(s) };
}
function server(caseDef, msgs) { const s = _internals.deriveState(caseDef, msgs); return { s, cov: _internals.computeCoverage(caseDef, s) }; }
const row = (cov, id) => cov.find((c) => c.id === id);
async function both(caseDef, msgs) {
  const c = await client(caseDef, msgs), v = server(caseDef, msgs);
  // Parity on every scenario in this file: same unlocked gates, same coverage rows.
  assert.deepEqual(Object.keys(c.s.unlocked).sort(), Object.keys(v.s.unlocked).sort(), 'unlocked parity');
  assert.deepEqual(JSON.parse(JSON.stringify(c.cov)), JSON.parse(JSON.stringify(v.cov)), 'coverage parity');
  return c;
}

// ---------------------------------------------------------------- IR-3 / IR-12
const FRAMINGS = {
  'negated ask': "My husband mentioned suicide but I'm not going to ask about that.",
  'negated ask, second person': "I'm not going to ask whether you want to end your life.",
  'third person': 'Tom said he felt suicidal once, years ago.',
  'family history': 'Is there a family history of suicide?',
  'family history, question form': 'Do you have any family history of suicide?',
  'family attempt': 'Has anyone in your family ever tried to kill themselves?',
};
const DIRECT = [
  'Have you had thoughts of killing yourself?',
  "I don't have to ask this, but have you had thoughts of killing yourself?",
  'Your sister died by suicide — have you ever thought about ending your own life?',
  'Has anyone in your family died by suicide, and have you had thoughts of suicide yourself?',
];

test('IR-3: a negated, third-person or family-history framing earns no screen credit and opens no gate, on either side', async () => {
  for (const caseDef of [DANA, MARCUS, RAY, MORGAN, FOLLOWUP]) {
    for (const [name, text] of Object.entries(FRAMINGS)) {
      const { s, cov } = await both(caseDef, [text]);
      for (const id of ['si_direct', 'si_passive', 'si_euphemism', 'si_behavior']) assert.ok(!s.covered[id], `${caseDef.id} ${name}: ${id} credited`);
      assert.deepEqual(Object.keys(s.unlocked), [], `${caseDef.id} ${name}: a gate opened`);
      assert.equal(row(cov, 'c_si').status, 'missed', `${caseDef.id} ${name}`);
    }
  }
});

test('IR-3: a direct question to the patient still matches, even beside a family or third-person frame', async () => {
  for (const caseDef of [DANA, MARCUS, RAY, MORGAN, FOLLOWUP]) {
    for (const text of DIRECT) {
      const { s, cov } = await both(caseDef, [text]);
      assert.ok(s.covered.si_direct, `${caseDef.id}: ${text}`);
      assert.equal(row(cov, 'c_si').status, 'observed', `${caseDef.id}: ${text}`);
    }
  }
  // The screen gates still open on the direct question.
  assert.ok((await both(DANA, [DIRECT[0]])).s.unlocked.si_active);
  assert.ok((await both(MARCUS, [DIRECT[0]])).s.unlocked.g_si_mixed);
});

test('IR-3: "we\'ll keep you safe" is not a violence screen for Ray; asking about hurting others still is', async () => {
  for (const text of ["We'll keep you safe here.", 'What would help keep you safe tonight?']) {
    const { s } = await both(RAY, [text]);
    assert.ok(!s.covered.violence_screen, text);
  }
  assert.ok((await both(RAY, ["Have you had thoughts of hurting the people you're afraid of?"])).s.covered.violence_screen);
});

test('IR-12: the client honours excludePatterns per sentence, exactly as the server does', async () => {
  // Same sentence: vetoed. Separate sentences: the question in the second is credited.
  assert.ok(!(await both(DANA, ['Is there a family history of suicide, or of depression?'])).s.covered.si_direct);
  assert.ok((await both(DANA, ['Is there a family history of depression? Have you had thoughts of suicide?'])).s.covered.si_direct);
  // A client that ignored excludes would credit this; the hits the client records must equal the server's.
  const c = await client(DANA, [FRAMINGS['negated ask']]);
  assert.deepEqual(c.s.turns[0].intents, _internals.deriveState(DANA, [FRAMINGS['negated ask']]).lastIntents);
});

// ---------------------------------------------------------------- IR-2
test('IR-2: a command screen Ray deflected is partial and marked deflected, never observed; the box uses his criticalMiss.partial', async () => {
  const { s, cov } = await both(RAY, ['Do the voices tell you to do anything?']);
  assert.ok(!s.unlocked.g_command);
  const c = row(cov, 'c_command');
  assert.equal(c.status, 'partial');
  assert.equal(c.deflected, true);
  assert.match(T.coverageDisplay(c).word, /deflected/);
  const box = T.criticalFeedback(c, s);
  assert.equal(box.mode, 'deflected');
  assert.ok(box.body.startsWith(RAY.criticalMiss.partial), 'Ray\'s pack-authored partial text is shown');
  assert.equal(box.selfReport, false);
  // Once rapport is earned the same question opens the gate and reads observed.
  const warm = await both(RAY, [...RAY_WARM, 'When the voice talks, does it ever tell you to do anything?']);
  assert.equal(row(warm.cov, 'c_command').status, 'observed');
  assert.equal(row(warm.cov, 'c_command').deflected, undefined);
});

test('IR-2: Marcus\'s screen after a flag that blocks the gate is partial, not observed', async () => {
  const { s, cov } = await both(MARCUS, ['You need to calm down, okay?', 'Have you had thoughts of killing yourself?']);
  assert.ok(!s.unlocked.g_si_mixed);
  assert.equal(row(cov, 'c_si').status, 'partial');
  assert.equal(row(cov, 'c_si').deflected, true);
  assert.equal(T.criticalFeedback(row(cov, 'c_si'), s).mode, 'deflected');
});

// ---------------------------------------------------------------- IR-4
test('IR-4: follow-up asked before the disclosure, or stacked into the screening turn, is not follow-up', async () => {
  const before = await both(DANA, ['Do you have a plan?', 'Are the pills still at home?', 'Have you had thoughts of killing yourself?']);
  const f = row(before.cov, 'c_si_followup');
  assert.equal(f.status, 'missed');
  assert.equal(f.askedEarly, true);
  assert.match(T.coverageDisplay(f).word, /before the disclosure/);
  const stacked = await both(DANA, ['Have you thought about killing yourself, and do you have a plan?']);
  assert.ok(stacked.s.unlocked.si_active);
  assert.notEqual(row(stacked.cov, 'c_si_followup').status, 'observed');
  assert.ok(!stacked.s.afterGate['si_active|si_plan'], 'the plan question shared the disclosure turn');
  // Asked again after the disclosure, it counts.
  const after = await both(DANA, ['Have you had thoughts of killing yourself?', 'Do you have a plan?', 'Are the pills still at home — do you have access to them?',
    'What has kept you going?', 'Have you ever tried to hurt yourself before?']);
  assert.equal(row(after.cov, 'c_si_followup').status, 'observed');
});

test('IR-4: a disclosure with no follow-up caps technique at partial', async () => {
  const msgs = ["Hi, my name is Alex, I'm the medical student on the team. Before we start — what would you most want us to understand today?",
    "Tell me more about what's been going on, in your own words.", 'It sounds like everything has felt really heavy for a while.',
    'When you say burden — have you had thoughts of killing yourself?', 'Let me make sure I\'ve got this right — did I miss anything?'];
  const { s, cov } = await both(DANA, msgs);
  assert.ok(s.unlocked.si_active);
  assert.equal(row(cov, 'c_si_followup').status, 'missed');
  const rub = T.computeRubric(s, cov);
  assert.equal(rub.technique, 'partial');
  assert.ok(T.buildNarrative(s, cov, rub).growth.some((g) => /every follow-up topic/.test(g.t)));
});

// ---------------------------------------------------------------- IR-5
test('IR-5: Ray\'s command follow-up is unavailable before the disclosure and critical once g_command opens', async () => {
  const cold = await both(RAY, []);
  const r0 = row(cold.cov, 'c_command_followup');
  assert.equal(r0.status, 'na');
  assert.equal(r0.critical, false);
  const disclosed = await both(RAY, [...RAY_WARM, 'When the voice talks, does it ever tell you to do anything?']);
  const r1 = row(disclosed.cov, 'c_command_followup');
  assert.ok(disclosed.s.unlocked.g_command);
  assert.equal(r1.critical, true);
  assert.equal(r1.status, 'missed');
  const box = T.criticalFeedback(r1, disclosed.s);
  assert.equal(box.mode, 'missed');
  assert.equal(box.body, RAY.checklist.find((c) => c.id === 'c_command_followup').criticalMiss.missed);
  const followed = await both(RAY, [...RAY_WARM, 'When the voice talks, does it ever tell you to do anything?',
    "Have you had thoughts of hurting the people you're afraid of?", 'Do you have any weapons or guns at home?',
    'Have you ever been in fights, or been violent with anyone, in the past?']);
  assert.equal(row(followed.cov, 'c_command_followup').status, 'observed');
  assert.match(followed.replies.at(-2), /No guns|anything like that/);
  assert.match(followed.replies.at(-1), /never hurt|Never/);
});

test('IR-5: Marcus has a follow-up row after his disclosure, answered by detail gates that stay locked before it', async () => {
  const locked = await both(MARCUS, ['Do you have a plan?']);
  assert.deepEqual(Object.keys(locked.s.unlocked), []);
  assert.doesNotMatch(locked.replies[0], /Tuesday/, 'the locked follow-up does not leak the disclosure');
  assert.equal(row(locked.cov, 'c_si_followup').status, 'na');
  const done = await both(MARCUS, ['Have you had thoughts of killing yourself?', 'Have you made any plan to end your life?',
    'Do you have access to any guns, or anything at home you could use?', 'What keeps you going?', 'Have you ever tried to hurt yourself before?']);
  for (const g of ['g_si_mixed', 'si_plan_detail', 'si_means_detail', 'si_protective_detail', 'si_behavior_detail']) assert.ok(done.s.unlocked[g], g);
  assert.equal(row(done.cov, 'c_si_followup').status, 'observed');
});

// ---------------------------------------------------------------- IR-6
test('IR-6: Morgan — abrupt-cessation advice is flagged; a safety question about stopping is not', async () => {
  for (const text of ['Why not just stop tonight, cold turkey?', 'What if you just stopped drinking completely, starting today?', 'You should just quit.']) {
    const { s } = await both(MORGAN, [text]);
    assert.ok(s.turns[0].flags.includes('advise_abrupt_stop'), text);
    assert.ok(!s.covered.next_step, `${text}: never credited as a next step`);
  }
  for (const text of ['Is it safe to quit cold turkey?', 'Is it medically safe for you to stop drinking suddenly — any withdrawal or seizures before?',
    "I'm not telling you to stop tonight.", 'Have you ever tried to stop cold turkey before?']) {
    const { s } = await both(MORGAN, [text]);
    assert.ok(!s.turns[0].flags.includes('advise_abrupt_stop'), text);
  }
  const { s, cov, replies } = await both(MORGAN, ['Why not just stop tonight, cold turkey?']);
  assert.match(replies[0], /withdrawal/);
  const rub = T.computeRubric(s, cov), nar = T.buildNarrative(s, cov, rub);
  assert.notEqual(rub.technique, 'observed');
  assert.match(nar.growth[0].t, /stopping suddenly without a medical withdrawal evaluation can be dangerous/);
});

test('IR-6: Morgan can answer last drink, past withdrawal, seizures and DTs, and the row is credited', async () => {
  const { s, cov, replies } = await both(MORGAN, ['When was your last drink?', 'Have you ever had a seizure, or seen things that weren\'t there, when you stopped?']);
  assert.ok(s.covered.withdrawal_history);
  assert.equal(row(cov, 'c_withdrawal').status, 'observed');
  assert.match(replies[0], /last drink was the (?:night|evening) I fell/i);
  for (const line of [...MORGAN.responses.withdrawal_history.guarded, ...MORGAN.responses.withdrawal_history.open]) {
    assert.doesNotMatch(line, /\d+\s?(mg|mcg|mL)\b/, 'no dose literal');
    assert.doesNotMatch(line, /\b(?:take|use|try)\b[^.]*\b(?:taper|librium|chlordiazepoxide|lorazepam|diazepam|benzo)/i, 'no withdrawal-management advice');
  }
  assert.match(MORGAN.localGrounding.informationLimits.withdrawal, /withdrawal risk requires clinical evaluation/);
});

// ---------------------------------------------------------------- IR-7
test('IR-7: a critical step asked after the coach named it reads "completed after a prompt"', async () => {
  const { s } = await client(MORGAN, ['Tell me a little about what has been going on.']);
  assert.equal(T.recordCoachHint(s), 'c_si', 'the coach names the critical screen first');
  const P = new T.MockProvider();
  await P.respond(s, 'Have you had thoughts of killing yourself?');
  const cov = T.promptMarks(s, T.computeCoverage(s));
  const si = row(cov, 'c_si');
  assert.equal(si.status, 'observed');
  assert.equal(si.afterPrompt, true);
  assert.equal(si.promptedAtTurn, 1);
  assert.equal(si.answeredTurn, 2);
  assert.match(T.coverageDisplay(si).word, /completed after a prompt/);
  // Asked before any prompt, it stays clean.
  const clean = await client(MORGAN, ['Have you had thoughts of killing yourself?']);
  assert.equal(row(T.promptMarks(clean.s, T.computeCoverage(clean.s)), 'c_si').afterPrompt, undefined);
  // A hint that is never followed changes nothing.
  const unheeded = await client(MORGAN, ['Tell me a little about what has been going on.']);
  T.recordCoachHint(unheeded.s);
  assert.equal(row(T.promptMarks(unheeded.s, T.computeCoverage(unheeded.s)), 'c_si').afterPrompt, undefined);
});

// ---------------------------------------------------------------- IR-9
test('IR-9: a total suicide miss shows the case\'s criticalMiss.missed plainly, with no hedge and no self-report', async () => {
  for (const caseDef of [DANA, MARCUS, MORGAN, FOLLOWUP]) {
    const { s, cov } = await client(caseDef, ['Tell me what brought you in.', 'How has your sleep been?']);
    const box = T.criticalFeedback(row(cov, 'c_si'), s);
    assert.equal(box.mode, 'missed', caseDef.id);
    assert.equal(box.body, caseDef.criticalMiss.missed, caseDef.id);
    assert.doesNotMatch(box.opener + box.body, /does not establish|did not recognize/, caseDef.id);
    assert.equal(box.selfReport, false);
  }
});

test('IR-9: a partial or ambiguous ask keeps the hedge; the self-report offers only turns with safety vocabulary', async () => {
  const partial = await client(DANA, ['How has your sleep been?', 'Do you ever think about hurting yourself?']);
  const p = T.criticalFeedback(row(partial.cov, 'c_si'), partial.s);
  assert.equal(p.mode, 'hedged');
  assert.match(p.body, /does not establish whether/);
  assert.equal(p.consequence, DANA.criticalMiss.partial);
  assert.deepEqual(p.selfReportTurns, [2], 'the sleep turn is not offered');
  const ambiguous = await client(DANA, ['How has your sleep been?', 'Have you been considering deliberately bringing your own life to an end?']);
  const a = T.criticalFeedback(row(ambiguous.cov, 'c_si'), ambiguous.s);
  assert.equal(row(ambiguous.cov, 'c_si').status, 'missed');
  assert.equal(a.mode, 'hedged', 'an unrecognized plain question is ambiguous, never "not asked"');
  assert.deepEqual(a.selfReportTurns, [2]);
  // Without the session, the D16/G4 wording is unchanged.
  assert.match(T.criticalFeedback(row(ambiguous.cov, 'c_si')).body, /does not establish whether/);
});

// ---------------------------------------------------------------- IR-10
test('IR-10: Dana\'s follow-up visit — means safety is critical once she discloses, and a skipped check opens its box', async () => {
  const before = await both(FOLLOWUP, ['How has it been since you left the hospital?']);
  assert.equal(row(before.cov, 'c_means').critical, false);
  const after = await both(FOLLOWUP, ['Since you left the hospital, have you had any thoughts of killing yourself?', 'Okay. We will see you in two weeks.']);
  const m = row(after.cov, 'c_means');
  assert.equal(m.critical, true);
  assert.equal(m.status, 'missed');
  assert.equal(T.criticalFeedback(m, after.s).body, FOLLOWUP.checklist.find((c) => c.id === 'c_means').criticalMiss.missed);
  const checked = await both(FOLLOWUP, ['Since you left the hospital, have you had any thoughts of killing yourself?', 'Did Tom take his sleeping pills to work?', 'Are there any guns in the house?']);
  assert.equal(row(checked.cov, 'c_means').status, 'observed');
});
