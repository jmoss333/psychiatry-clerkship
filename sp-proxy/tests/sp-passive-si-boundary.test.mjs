// The N3 re-approval pack's synthetic phrase set (2026-10-29), pinned against the shipped pack
// through the SAME engine the proxy and the offline simulator run (sp.mjs _internals.deriveState;
// intent matching mirrors compileIntents exactly: `new RegExp(p, 'i')`, any pattern credits).
//
// Why this exists: #1119's ead14afe stopped `be here` / `live` at a following location so that
// "not wanting to be here in the hospital" no longer read as a passive death wish. Its stop list
// also held `with` and `for`, which blocked three ordinary passive-SI phrasings — "not wanting to
// be here WITH US anymore", "not want to be here FOR MUCH LONGER", "not want to live WITH THIS
// PAIN anymore". The amendment keeps in/at/on as hard stops and lets `with us / everyone` and
// `for much longer / long / anyone / your kids` through, while `live with <a person>` still stops.
//
// Every row is synthetic. Each carries what the pattern set must do with it:
//   match      the intent must be credited and the case's gate must open
//   block      the intent must NOT be credited and the gate must stay shut
//   pending    a known gap or a negation/negative-polarity question awaiting a clinical decision
//              (pack §"Not for tonight"): reported, never failed, so a later fix is not blocked
//
// Modes:
//   plan     turn 2 after "Have you had thoughts of killing yourself?"; si_plan + si_plan_detail,
//            checked on Dana AND the follow-up case
//   passive  a single cold turn on Dana; si_passive + si_active
//   direct   a single cold turn on Dana; si_direct + si_active
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { _internals } from '../netlify/functions/sp.mjs';

const { deriveState } = _internals;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.join(__dirname, '..', '..', '_prototypes', 'sp-interview', 'sp-interview.pack.json');
const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
const DANA = 'sp_depression_gated_si_001';
const FOLLOW = 'sp_depression_followup_001';
const DISCLOSE = 'Have you had thoughts of killing yourself?';

const caseById = (id) => {
  const c = pack.cases.find((x) => x.id === id);
  assert.ok(c, `pack is missing case ${id}`);
  return c;
};
const recognised = (caseDef, text) => caseDef.intents
  .filter((it) => it.patterns.some((p) => new RegExp(p, 'i').test(text)))
  .map((it) => it.id);

// [mode, expect, pack row, phrase]. Rows are numbered as in the pack's tables.
const ROWS = [
  // ---- si_plan, after disclosure (pack table rows 1–39) ----
  ['plan', 'match', 1, 'Have you thought about how to kill yourself?'],
  ['plan', 'match', 2, 'Have you thought about how you would do it?'],
  ['plan', 'match', 3, "Have you thought about how you'd end your life?"],
  ['plan', 'match', 4, 'Have you thought about how to end it?'],
  ['plan', 'match', 5, 'Have you thought about when?'],
  ['plan', 'match', 6, 'Have you thought about when or where?'],
  ['plan', 'match', 7, 'Have you thought about where you would do it?'],
  ['plan', 'match', 8, 'Have you thought about when it would happen?'],
  ['plan', 'match', 9, 'Have you thought about when and how?'],
  ['plan', 'match', 10, 'Have you thought about where you might go to do it?'],
  ['plan', 'match', 11, 'Do you have a plan?'],
  ['plan', 'match', 12, 'Have you made a plan to end your life?'],
  ['plan', 'match', 13, 'Have you thought about a specific way?'],
  ['plan', 'match', 14, 'Have you thought about how to take your life?'],
  ['plan', 'match', 15, 'Have you thought about how?'],
  ['plan', 'match', 16, 'Have you thought about where?'],
  ['plan', 'match', 17, "Have you thought about when you'd do it?"],
  ['plan', 'match', 18, "Have you thought about how you'd go about it?"],
  ['plan', 'match', 19, 'Have you thought about how to overdose?'],
  ['plan', 'match', 20, 'Have you thought about when you might act on these thoughts?'],
  ['plan', 'pending', 21, 'Have you thought about where you would get the pills to do it?'],
  ['plan', 'match', 22, 'Have you thought about how to get the pills?'],
  ['plan', 'match', 23, 'Have you thought about where, like a particular place?'],
  ['plan', 'block', 24, "Have you thought about when you'd like to go home?"],
  ['plan', 'block', 25, 'Have you thought about when you will be discharged?'],
  ['plan', 'block', 26, 'Have you thought about where you will stay after discharge?'],
  ['plan', 'block', 27, 'Have you thought about where you want to live?'],
  ['plan', 'block', 28, 'Have you thought about how to tell your husband?'],
  ['plan', 'block', 29, 'Have you thought about how to cope when it gets bad?'],
  ['plan', 'block', 30, 'Have you thought about how to get through the weekend?'],
  ['plan', 'block', 31, 'Have you thought about how to pay for the medication?'],
  ['plan', 'block', 32, 'Have you thought about how to get home from here?'],
  ['plan', 'block', 33, 'Have you thought about how to ask for help next time?'],
  ['plan', 'block', 34, 'Have you thought about how to stay safe?'],
  ['plan', 'block', 35, 'Have you thought about when you might go back to work?'],
  ['plan', 'block', 36, 'Have you thought about where you would go for support?'],
  ['plan', 'block', 37, 'Have you thought about how to spend your time after discharge?'],
  ['plan', 'pending', 38, "You haven't thought about how to do it, have you?"],
  ['plan', 'pending', 39, "I'm not asking you to tell me a plan, just whether you feel safe."],
  // ---- si_passive, cold (pack table rows 1–31) ----
  ['passive', 'match', 1, 'Do you ever wish you were dead?'],
  ['passive', 'match', 2, "Have you wished you weren't here?"],
  ['passive', 'match', 3, 'Have you been not wanting to be here anymore?'],
  ['passive', 'match', 4, 'Have there been times you did not want to be here?'],
  ['passive', 'pending', 5, "Do you feel like you don't want to live?"],
  ['passive', 'match', 6, 'Have you felt you did not want to live anymore?'],
  ['passive', 'pending', 7, "Do you think everyone would be better off if you weren't here?"],
  ['passive', 'match', 8, "Do you ever think they'd be better off if I wasn't here?"],
  ['passive', 'match', 9, 'Have you thought you might be better off not being here?'],
  ['passive', 'match', 10, 'Do you sometimes not want to be here, like at all?'],
  ['passive', 'match', 11, 'Do you wish you could go to sleep and not wake up?'],
  ['passive', 'match', 12, 'Have you been not wanting to be here, alive I mean?'],
  ['passive', 'pending', 13, "Do you ever feel like you don't want to be here anymore?"],
  ['passive', 'pending', 14, "Do you sometimes feel you don't want to be alive?"],
  ['passive', 'match', 15, 'Do you ever feel like not wanting to be here with us anymore?'],
  ['passive', 'match', 16, 'Have there been times you did not want to be here for much longer?'],
  ['passive', 'match', 17, 'Do you sometimes not want to live with this pain anymore?'],
  ['passive', 'match', 18, "Have you wished you weren't here anymore?"],
  ['passive', 'block', 19, "Do you wish you weren't here, in the hospital?"],
  ['passive', 'block', 20, 'It sounds like you are not wanting to be here in the hospital.'],
  ['passive', 'block', 21, 'You said you do not want to be here at the hospital — tell me more.'],
  ['passive', 'block', 22, "I get that you don't want to be here on the unit."],
  ['passive', 'block', 23, "You don't want to be here with your husband watching?"],
  ['passive', 'block', 24, "You don't want to live with your mother anymore?"],
  ['passive', 'block', 25, "You don't want to live alone after discharge?"],
  ['passive', 'block', 26, "You don't want to live there anymore?"],
  ['passive', 'block', 27, "Do you wish you weren't here in the hospital?"],
  ['passive', 'block', 28, 'Would you be better off not being here at this unit?'],
  ['passive', 'block', 29, 'Do you not want to be here for the family meeting?'],
  ['passive', 'pending', 30, "I'm not asking whether you wish you were dead."],
  ['passive', 'pending', 31, "You don't wish you were dead, do you?"],
  // ---- si_direct, cold (pack table rows 1–8; patterns unchanged, a control) ----
  ['direct', 'match', 1, 'Are you thinking of killing yourself?'],
  ['direct', 'match', 2, 'Have you had thoughts of suicide?'],
  ['direct', 'match', 3, 'Have you thought about ending your life?'],
  ['direct', 'pending', 4, 'Has anyone in your family died by suicide?'],
  ['direct', 'block', 5, 'Tell me about the hospital food.'],
  ['direct', 'block', 6, "You said you're tired of the hospital — what is hardest?"],
  ['direct', 'pending', 7, "I'm not saying you would kill yourself."],
  ['direct', 'pending', 8, "You're not thinking of suicide, right?"],
];

// The three phrasings ead14afe's `with` / `for` stops blocked; the amendment restores them.
const RESTORED = ROWS.filter(([mode, , row]) => mode === 'passive' && [15, 16, 17].includes(row));
// Every location-boundary phrasing the hospital fix exists to block (passive rows 19–29):
// hospital, unit, family meeting, `with <a person>`, `live with <a person>` / alone / there.
const BOUNDARY = ROWS.filter(([mode, expect]) => mode === 'passive' && expect === 'block');

const INTENT = { plan: 'si_plan', passive: 'si_passive', direct: 'si_direct' };
const GATE = { plan: 'si_plan_detail', passive: 'si_active', direct: 'si_active' };

function observe(mode, text) {
  const cases = mode === 'plan' ? [DANA, FOLLOW] : [DANA];
  return cases.map((id) => {
    const c = caseById(id);
    const turns = mode === 'plan' ? [DISCLOSE, text] : [text];
    return { id, intent: recognised(c, text).includes(INTENT[mode]), gate: !!deriveState(c, turns).unlocked[GATE[mode]] };
  });
}

test('the phrase set is the pack\'s 78 rows (39 plan, 31 passive, 8 direct)', () => {
  const count = (m) => ROWS.filter(([mode]) => mode === m).length;
  assert.deepEqual([ROWS.length, count('plan'), count('passive'), count('direct')], [78, 39, 31, 8]);
  assert.equal(RESTORED.length, 3);
  assert.equal(BOUNDARY.length, 11, 'every hospital / unit / family-meeting / with-a-person row is in the boundary set');
  for (const re of [/hospital/, /unit\b/, /family meeting/, /with your husband/, /live with your mother/]) {
    assert.ok(BOUNDARY.some(([, , , text]) => re.test(text)), `boundary set lost its ${re} row`);
  }
});

test('restored: "with us", "for much longer" and "live with this pain" credit si_passive and open the disclosure', () => {
  for (const [, , row, text] of RESTORED) {
    for (const r of observe('passive', text)) {
      assert.ok(r.intent, `passive row ${row} not credited as si_passive: ${JSON.stringify(text)}`);
      assert.ok(r.gate, `passive row ${row} did not open si_active: ${JSON.stringify(text)}`);
    }
  }
});

test('blocked: every hospital / unit / family-meeting / with-a-person phrasing stays out of si_passive and keeps the disclosure shut', () => {
  for (const [, , row, text] of BOUNDARY) {
    const c = caseById(DANA);
    const hits = recognised(c, text);
    assert.ok(!hits.includes('si_passive'), `passive row ${row} credited si_passive: ${JSON.stringify(text)}`);
    assert.ok(!hits.includes('si_direct'), `passive row ${row} credited si_direct: ${JSON.stringify(text)}`);
    assert.ok(!deriveState(c, [text]).unlocked.si_active, `passive row ${row} opened si_active: ${JSON.stringify(text)}`);
  }
});

test('the boundary holds in every case that carries si_passive, not just Dana', () => {
  const carriers = pack.cases.filter((c) => c.intents.some((it) => it.id === 'si_passive'));
  assert.ok(carriers.length >= 5, `expected si_passive in every case, found ${carriers.length}`);
  const failures = [];
  for (const c of carriers) {
    for (const [, , row, text] of RESTORED) if (!recognised(c, text).includes('si_passive')) failures.push(`${c.id}: restored row ${row} missed`);
    for (const [, , row, text] of BOUNDARY) if (recognised(c, text).includes('si_passive')) failures.push(`${c.id}: boundary row ${row} credited`);
  }
  assert.deepEqual(failures, []);
});

test('every match / block row in the phrase set behaves as pinned (plan rows on Dana and the follow-up case)', () => {
  const failures = [];
  for (const [mode, expect, row, text] of ROWS) {
    if (expect === 'pending') continue;
    for (const r of observe(mode, text)) {
      const want = expect === 'match';
      if (r.intent !== want || r.gate !== want) {
        failures.push(`${mode} row ${row} (${r.id}) expected ${expect}: intent ${r.intent}, ${GATE[mode]} ${r.gate} — ${JSON.stringify(text)}`);
      }
    }
  }
  assert.deepEqual(failures, [], `phrase-set drift:\n  ${failures.join('\n  ')}`);
});

test('pending rows (known gaps and negations awaiting a clinical decision) are reported, never failed', () => {
  const pending = ROWS.filter(([, expect]) => expect === 'pending');
  const lines = pending.map(([mode, , row, text]) => {
    const r = observe(mode, text)[0];
    return `${mode} row ${row}: ${r.intent ? 'credited' : 'not credited'} — ${text}`;
  });
  console.log(`passive-SI boundary — pending clinical decision (${pending.length}):\n  ${lines.join('\n  ')}`);
});
