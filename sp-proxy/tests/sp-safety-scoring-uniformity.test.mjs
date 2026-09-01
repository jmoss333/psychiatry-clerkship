// SP safety-scoring uniformity matrix — the #410 D12–D16 wave, checked in as a test.
//
// Provenance: docs/superpowers/plans/2026-08-31-faculty-decisions-410.md (D12–D16),
// ratified by Joshua Moss, MD on 2026-08-31 (gates G1–G4). Generated from the
// verification matrix used to measure the wave; the row data is unchanged.
//
// The contract this file pins: the SAME WORDS EARN THE SAME GRADE IN EVERY CASE.
// Each row states the expected c_si status for [Dana, Marcus, Ray] —
//   O = observed (a plain screen)   P = partial (a euphemism or reflection)   M = missed
// plus optional per-case intent assertions (`must` / `mustNot`).
//
// Teeth-check: this file fails 60/124 against the pre-wave pack and passes 124/124
// against the ratified one. A future pattern change that reintroduces per-case
// divergence fails here first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.join(__dirname, '..', '..', '_prototypes', 'sp-interview', 'sp-interview.pack.json');
const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));

const ID = { Dana: 'sp_depression_gated_si_001', Marcus: 'sp_mania_redirect_001', Ray: 'sp_psychosis_paranoid_001' };
const byId = Object.fromEntries(pack.cases.map(c => [c.id, c]));

function hits(c, text) { return c.intents.filter(it => it.patterns.some(p => new RegExp(p, 'i').test(text))).map(it => it.id); }
function status(c, rowId, h) {
  const row = c.checklist.find(x => x.id === rowId); if (!row) return 'n/a';
  const cov = new Set(h); const got = row.intents.filter(i => cov.has(i)).length;
  if (got === row.intents.length) return 'observed'; if (got > 0) return 'partial';
  if ((row.partialIfOnly || []).some(i => cov.has(i))) return 'partial'; return 'missed';
}


// ---- matrix ------------------------------------------------------------------
// shorthand: O=observed P=partial M=missed for c_si in [Dana, Marcus, Ray]
const S = { O: 'observed', P: 'partial', M: 'missed' };
const rows = [];
const add = (group, ph, dmr, opts = {}) => rows.push({ group, ph, exp: [...dmr].map(k => S[k]), ...opts });

// D12 — same words, same grade; euphemism = partial everywhere; existential point = plain everywhere
add('D12', "What's the point?", 'PPP');
add('D12', 'What is the point?', 'PPP');
add('D12', 'Whats the point anymore?', 'PPP');
add('D12', "Do you ever feel like what's even the point?", 'PPP');
add('D12', "You said what's the point — can you tell me more?", 'PPP');
add('D12', "What's the point of going on?", 'OOO');
add('D12', 'What is the point of going on?', 'OOO');
add('D12', "What's the point of living?", 'OOO');
add('D12', "What's the point of any of this?", 'OOO');
add('D12', "What's the point of going on at all?", 'OOO');
add('D12', "What's the point of continuing to live?", 'OOO');
add('D12', 'Have you thought about hurting yourself?', 'PPP', { mustNot: { Ray: ['violence_screen'] } });
add('D12', 'Have you thought about harming yourself?', 'PPP', { mustNot: { Ray: ['violence_screen'] } });
add('D12', 'Have you had thoughts of doing something to yourself?', 'PPP');
add('D12', 'Have you had thoughts of hurting yourself by taking pills?', 'PPP');
// D6/D7/D11 guards must survive the split (declines everywhere)
add('D12-guard', "What's the point of the lithium?", 'MMM');
add('D12-guard', 'What is the point of the lithium?', 'MMM');
add('D12-guard', "What's the point of staying on the unit?", 'MMM');
add('D12-guard', "What's the point of going on about the irrigation project?", 'MMM');
add('D12-guard', "What's the point of trying?", 'MMM');
add('D12-guard', "What's the point you're making?", 'MMM');
add('D12-guard', "What's the point of the mood chart, in your view?", 'MMM');
add('D12', "You said there's no point in going on — can you tell me more?", 'OOO');  // D11 dash residual closed
add('D12', "What's the point of going on — has it felt like that?", 'OOO');
add('D12-guard', 'no point in going on the lithium?', 'MMM');
add('D12-guard', "Do you think you're hurting yourself by sleeping only two hours?", 'MMM');
add('D12-guard', "Do you think you're hurting yourself with all this spending?", 'MMM');

// D13 — A/B vocabulary: Dana's euphemism set reaches Marcus and Ray at partial
add('D13-AB', 'Have you been having dark thoughts?', 'PPP');
add('D13-AB', 'Have you been in a dark place?', 'PPP');
add('D13-AB', 'Any unsafe thoughts lately?', 'PPP');
add('D13-AB', 'Have you thought about doing something drastic?', 'PPP', { mustNot: { Ray: ['violence_screen'] } });
add('D13-AB', 'Have you thought about doing something stupid?', 'PPP', { mustNot: { Ray: ['violence_screen'] } });
add('D13-AB', 'Any thoughts of self-harm?', 'PPP');
add('D13-AB', 'Do you ever wish you could just disappear?', 'PPP');
// Ray's violence row must still credit other-directed phrasings
add('D13-B', 'Have you thought about hurting someone else?', 'MMM', { must: { Ray: ['violence_screen'] } });
add('D13-B', 'Have you thought about hurting them?', 'MMM', { must: { Ray: ['violence_screen'] } });
add('D13-B', 'Have you thought about doing something to the neighbors?', 'MMM', { must: { Ray: ['violence_screen'] } });
add('D13-B', 'Have you thought about stopping them?', 'MMM', { must: { Ray: ['violence_screen'] } });
// D13 — plain-screen gaps measured while ratifying (not in #410's list)
add('D13-plain', 'Do you want to die?', 'OOO');
add('D13-plain', 'Have you wanted to die?', 'OOO');
add('D13-plain', 'Have you had thoughts of death?', 'OOO');
add('D13-plain', 'Any thoughts of ending it all?', 'OOO');
add('D13-plain', 'Have you had thoughts of not being here anymore?', 'OOO');
add('D13-plain', "Do you ever wish you weren't here?", 'OOO');
add('D13-plain', 'Do you ever wish you could go to sleep and not wake up?', 'OOO');
add('D13-plain', 'Have you had thoughts of killing yourself?', 'OOO');
add('D13-plain', 'Are you having thoughts of suicide?', 'OOO');
add('D13-plain', "Have you had any thoughts that life isn't worth living?", 'OOO');
add('D13-plain', "Do you ever feel like life isn't worth living at all?", 'OOO');
add('D13-plain', 'Do you ever feel your family would be better off without you?', 'OOO');
add('D13-plain', 'Have you ever tried to kill yourself?', 'OOO');
// declines: ambiguous or ordinary (D7 heuristic)
add('D13-guard', 'Do you feel safe?', 'MMM');
add('D13-guard', 'Do you feel safe here on the unit?', 'MMM');
add('D13-guard', 'Did your father die recently?', 'MMM');
add('D13-guard', 'Do you want to be here on the unit?', 'MMM');
add('D13-guard', 'Are you afraid of dying?', 'MMM');
add('D13-guard', 'Would you like the pain to end?', 'MMM');
add('D13-guard', 'Is that apartment not worth living in?', 'MMM');
add('D13-guard', 'Do you think you would be better off without medication?', 'MMM');
add('D13-guard', 'How has your appetite been?', 'MMM');
add('D13-guard', 'Tell me about your job.', 'MMM');

// D14 — Dana follow-up boundaries (si_plan / si_means); c_si must stay 'missed' for all of these
const danaIs = (ids) => ({ must: { Dana: ids } });
const danaNot = (ids) => ({ mustNot: { Dana: ids } });
add('D14-plan-fire', 'Do you have a plan?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you made a plan?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you made any plans?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you made plans?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Do you have a specific plan?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Is there a plan?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Do you have a plan to end your life?', 'OOO', danaIs(['si_plan']));  // also a plain screen
add('D14-plan-fire', 'Have you made any plans to hurt yourself?', 'PPP', danaIs(['si_plan']));  // also a euphemistic screen
add('D14-plan-fire', 'Do you have a plan for how you would do it?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Do you have a plan in mind?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you planned anything?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you planned how?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you gotten as far as a plan?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'How would you do it?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you thought about how you would do it?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', "Do you know how you'd do it?", 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'How might you go about it?', 'MMM', danaIs(['si_plan']));
add('D14-plan-fire', 'Have you thought about a specific way?', 'MMM', danaIs(['si_plan']));
add('D14-plan-decline', 'What is your plan for after discharge?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'Do you have a plan for childcare?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'What plan did the team discuss?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'Is there a safety plan in place?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'What is the treatment plan?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', "What's the plan?", 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'Do you have a plan to go back to work?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'Any plans for the weekend?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'How would you rate your mood today?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'How would you describe your sleep?', 'MMM', danaNot(['si_plan']));
add('D14-plan-decline', 'How would you like me to help?', 'MMM', danaNot(['si_plan']));
add('D14-means-fire', 'Do you have the means?', 'MMM', danaIs(['si_means']));
add('D14-means-fire', 'Do you have access to the pills?', 'MMM', danaIs(['si_means']));
add('D14-means-fire', "Do you have access to Tom's medication?", 'MMM', danaIs(['si_means']));
add('D14-means-fire', 'Do you have access to anything you could use?', 'MMM', danaIs(['si_means']));
add('D14-means-fire', 'Are the pills still at home?', 'MMM', danaIs(['si_means']));
add('D14-means-fire', 'Could you get ahold of them?', 'MMM', danaIs(['si_means']));
add('D14-means-fire', 'Is there a gun in the house? Do you have access to a firearm?', 'MMM', danaIs(['si_means']));
add('D14-means-decline', 'That means a lot to you.', 'MMM', danaNot(['si_means']));
add('D14-means-decline', 'Do you have access to a car?', 'MMM', danaNot(['si_means']));
add('D14-means-decline', 'Do you have access to childcare?', 'MMM', danaNot(['si_means']));
add('D14-means-decline', 'What does that mean to you?', 'MMM', danaNot(['si_means']));

// D15 — Dana protective factors / intent
const prot = danaIs(['si_intent_protective']);
add('D15-fire', 'Do you have things in your life worth living for?', 'MMM', prot);
add('D15-fire', 'What has felt worth living for lately?', 'MMM', prot);
add('D15-fire', 'What keeps you going?', 'MMM', prot);
add('D15-fire', 'What has stopped you from acting on it?', 'MMM', prot);
add('D15-fire', "What's kept you from acting on those thoughts?", 'MMM', prot);
add('D15-fire', 'Is there anything that keeps you here?', 'MMM', prot);
add('D15-fire', 'What are your reasons for living?', 'MMM', prot);
add('D15-fire', 'Do you have reasons to keep going?', 'MMM', prot);
add('D15-fire', 'Is there anything that makes you want to stay alive?', 'MMM', prot);
add('D15-fire', 'Do you want to live?', 'MMM', prot);
add('D15-fire', 'Who would miss you?', 'MMM', prot);
add('D15-fire', 'What would you miss?', 'MMM', prot);
add('D15-fire', 'Who depends on you?', 'MMM', prot);
add('D15-fire', 'Have you come close to acting on those thoughts?', 'MMM', prot);
add('D15-fire', 'How close have you come?', 'MMM', prot);
add('D15-fire', 'Do you intend to act on it?', 'MMM', prot);
add('D15-fire', 'What are your protective factors?', 'MMM', prot);
add('D15-fire', 'Have you acted on it?', 'MMM', prot);
add('D15-decline', 'What stops the medication from working?', 'MMM', danaNot(['si_intent_protective']));
add('D15-decline', 'Who is at home with you?', 'MMM', danaNot(['si_intent_protective']));
add('D15-decline', 'Are you close with your sister?', 'MMM', danaNot(['si_intent_protective']));
// The two protective rows must not credit c_si anywhere (was the real intent of the finding-2 guard)
add('D15-guard', 'Do you have things in your life worth living for?', 'MMM');
add('D15-guard', 'What has felt worth living for lately?', 'MMM');


// ---- the matrix, as one assertion --------------------------------------------
test('the safety-scoring matrix holds in every case (D12–D15 uniformity)', () => {
  const failures = [];
  for (const r of rows) {
    const notes = [];
    ['Dana', 'Marcus', 'Ray'].forEach((who, i) => {
      const c = byId[ID[who]]; const h = hits(c, r.ph); const st = status(c, 'c_si', h);
      if (st !== r.exp[i]) notes.push(`${who} c_si=${st} (want ${r.exp[i]}) via ${h.join('+') || '—'}`);
      for (const m of (r.must?.[who] || [])) if (!h.includes(m)) notes.push(`${who} missing ${m} (got ${h.join('+') || '—'})`);
      for (const m of (r.mustNot?.[who] || [])) if (h.includes(m)) notes.push(`${who} must not hit ${m} (got ${h.join('+')})`);
    });
    if (notes.length) failures.push(`[${r.group}] ${JSON.stringify(r.ph)}\n      ${notes.join('\n      ')}`);
  }
  assert.deepEqual(failures, [], `${failures.length}/${rows.length} matrix rows did not grade as ratified:\n  ${failures.join('\n  ')}`);
});

test('the matrix still covers the whole ratified wave (row-count guard)', () => {
  assert.equal(rows.length, 124, 'matrix row count changed — rows may only be added with a faculty decision');
  const groups = new Set(rows.map(r => r.group));
  for (const g of ['D12', 'D12-guard', 'D13-AB', 'D13-B', 'D13-plain', 'D13-guard',
                   'D14-plan-fire', 'D14-plan-decline', 'D14-means-fire', 'D14-means-decline',
                   'D15-fire', 'D15-decline', 'D15-guard']) {
    assert.ok(groups.has(g), `matrix lost its "${g}" rows`);
  }
});

// ---- gate-integrity: a euphemism must not become a back door -----------------
// D12 closed the euphemism path to DISCLOSURE, not just to full credit. Nothing
// previously stopped a copy edit from putting an attested reveal into an ungated
// response, which would reopen the gate through the text instead of the state
// machine. Ray's si_direct.open carries the attested admission; assert no ungated
// response anywhere reproduces a distinctive span of any attested reveal.
const STOPWORDS = new Set(['about','after','again','because','before','could','every','first','going','never','other','should','still','their','there','these','thing','think','those','through','under','where','which','while','would','yourself','something','anything']);
function shingles(s, n = 5) {
  const w = String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(x => x.length > 2 && !STOPWORDS.has(x));
  const out = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  return out;
}
function collectStrings(v, acc = []) {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach(x => collectStrings(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => collectStrings(x, acc));
  return acc;
}

test('no ungated response reproduces an attested gated reveal (euphemism back-door guard)', () => {
  const leaks = [];
  for (const c of pack.cases) {
    // every attested reveal that is supposed to require a gate
    const gatedText = [];
    for (const g of (c.gated || [])) if (g.reveal) gatedText.push([g.id, g.reveal]);
    for (const [k, v] of Object.entries(c.responses || {})) {
      if (v && typeof v === 'object' && v.open) gatedText.push([`responses.${k}.open`, collectStrings(v.open).join(' ')]);
    }
    const gatedShingles = new Map();
    for (const [id, txt] of gatedText) for (const s of shingles(txt)) if (!gatedShingles.has(s)) gatedShingles.set(s, id);

    // every response reachable WITHOUT a gate: deflections and guarded-tier copy
    const ungated = [];
    for (const g of (c.gated || [])) {
      for (const f of ['deflectLowRapport', 'deflectEuphemism', 'repeatAsk']) {
        if (g[f]) ungated.push([`${c.id} gated.${g.id}.${f}`, g[f]]);
      }
    }
    for (const [k, v] of Object.entries(c.responses || {})) {
      if (v && typeof v === 'object' && v.guarded) ungated.push([`${c.id} responses.${k}.guarded`, collectStrings(v.guarded).join(' ')]);
    }

    for (const [where, txt] of ungated) {
      for (const s of shingles(txt)) {
        if (gatedShingles.has(s)) leaks.push(`${where} reproduces "${s}" from ${gatedShingles.get(s)}`);
      }
    }
  }
  assert.deepEqual(leaks, [], `ungated copy reproduces attested gated content:\n  ${leaks.join('\n  ')}`);
});
