// Regression tests from the 2026-11-10 independent clinical-claims audit (suicide risk, alcohol
// withdrawal, lithium, delirium, thiamine/glucose). Each A*/B* test reproduces one finding that the
// same PR corrected (A2 and B1 wait for the pharmacy-link follow-up: their questions are linked from
// pharmacy cards, and a withheld question id in pharmacy_public.json fails the publication check); the G* tests guard corrections made earlier. Findings and sources:
// the PR description and corrections.json in the audit packet.
//
// It reads only shipped content text. It never reads attestation state (reviewed.json, facultyReview,
// question status beyond "retired"), so it cannot trip tests/live-governance-state.test.mjs (invariant 10).
// "What ships" comes from the one derived listing, shipped_pages.json (ADR-002) -- never the producers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.dirname(fileURLToPath(import.meta.url));
while (!fs.existsSync(path.join(ROOT, 'question_bank.json'))) {
  const up = path.dirname(ROOT);
  if (up === ROOT) throw new Error('repository root not found (no question_bank.json above this file)');
  ROOT = up;
}
const OVERLAY = process.env.CLERKSHIP_OVERLAY || '';
const read = rel => {
  const o = OVERLAY && path.join(OVERLAY, rel);
  return fs.readFileSync(o && fs.existsSync(o) ? o : path.join(ROOT, rel), 'utf8');
};
const SHIPPED = (() => {
  const j = JSON.parse(read('13_Faculty_Resources/_automation/site_build/shipped_pages.json'));
  const set = new Set();
  for (const p of (Array.isArray(j) ? j : j.pages)) { if (p.source) set.add(p.source); for (const e of p.extraSources || []) set.add(e); }
  return [...set].filter(f => /\.(md|html|json|js)$/.test(f) && fs.existsSync(path.join(ROOT, f))).sort();
})();
// Every string a learner can read: JSON string leaves, or lines of a text file. [{file, where, text}]
function* units(file) {
  const raw = read(file);
  if (file.endsWith('.json')) {
    const walk = function* (node, where) {
      if (typeof node === 'string') yield { file, where, text: node };
      else if (Array.isArray(node)) for (let i = 0; i < node.length; i++) yield* walk(node[i], `${where}[${node[i] && node[i].id ? node[i].id : i}]`);
      else if (node && typeof node === 'object') { if (node.retired === true) return; for (const k of Object.keys(node)) yield* walk(node[k], `${where}/${k}`); }
    };
    yield* walk(JSON.parse(raw), '');
  } else { const lines = raw.split('\n'); for (let i = 0; i < lines.length; i++) yield { file, where: `L${i + 1}`, text: lines[i] }; }
}
const ALL = SHIPPED.flatMap(f => [...units(f)]);
assert.ok(SHIPPED.length > 100 && ALL.length > 5000, `shipped universe looks empty (${SHIPPED.length} files, ${ALL.length} strings) -- refusing to pass over nothing`);
const hits = (re, also) => ALL.filter(u => re.test(u.text) && (!also || also(u))).map(u => `${u.file} ${u.where}: ${u.text.slice(0, 160)}`);
const none = (re, msg, also) => { const h = hits(re, also); assert.equal(h.length, 0, `${msg}\n  ${h.join('\n  ')}`); };
const sentences = t => t.split(/(?<=[.;!?])\s+/);
const QB = JSON.parse(read('question_bank.json')).items.filter(i => i.retired !== true);

// ---------- Group A: factual errors -------------------------------------------------------------
test('A1 no question keys lethal-means COUNSELLING as the intervention with the strongest evidence for fewer suicide deaths', () => {
  const bad = QB.filter(i => /strongest evidence[^?]*suicide death/i.test(i.stem) && i.options.some(o => o.c && /counsel/i.test(o.t))).map(i => i.id);
  assert.deepEqual(bad, [], 'the death evidence is for reducing ACCESS (mostly population-level); no trial shows counselling alone lowers deaths (Shank 2026; Steeg 2025)');
});
test('A3 Stanley 2018 is reported as an association of about 45% fewer suicidal behaviours, not "≈50%" or "halved"', () => {
  none(/(≈|~|approximately|about|roughly)\s*50\s?%\s+fewer suicidal behaviou?rs|suicidal behaviou?rs by approximately 50\s?%|halve[sd]? suicidal behaviou?r/i, 'Stanley 2018: 45% fewer suicidal behaviours, OR 0.56, non-randomised cohort comparison');
});
test('A4 rounds questions: Saitz 1994 durations are medians; delirium tremens is not defined by seizures; the Wernicke triad figure is not "~10%"', () => {
  none(/mean 9 vs\.? 68 hours/i, 'Saitz 1994 reports MEDIAN duration 9 h vs 68 h');
  none(/autonomic instability, and seizures\./i, 'withdrawal seizures are a separate complication, not a defining feature of delirium tremens', u => /withdrawal/i.test(u.text));
  none(/all three features are present in only ~10% of cases/i, 'Harper 1986: 16% had the classical triad');
});
test('A5 no page says under-dosing is "the commonest reason" Wernicke progresses to Korsakoff', () => {
  none(/commonest reason a treated Wernicke/i, 'unsupported; the only dose-comparison RCT (Dingwall 2022) found no clear benefit of higher doses');
});
test('A6 landmark quizzes: Cipriani OR 0.13 is not taught as a bare "87%" risk reduction; means restriction is not "consistently ... without substitution"', () => {
  none(/reduced the risk of completed suicide by approximately 87%/i, 'OR 0.13 has a 95% CI of 0.03 to 0.66 and rests on few events');
  none(/corresponds to an 87% reduction in risk/i, 'state the interval and the few events alongside the point estimate');
  none(/consistently reduces overall suicide rates without significant method substitution/i, 'effects vary by method; firearm-regulation effects are small, if any (Shank 2026)');
});
// ---------- Group B: overclaims / stale wording -------------------------------------------------
test('B3 hypoactive delirium\'s worse outcomes are not attributed solely ("precisely because") to under-recognition', () => {
  none(/precisely because (it goes unrecognized|no one is alarmed)/i, 'association is established (e.g. Kiely 2007); sole causation by under-recognition is not');
});
test('B4 the suicide page does not give lithium and clozapine the same unhedged anti-suicidal standing', () => {
  none(/lithium and clozapine carry specific anti-suicidal evidence/i, 'sibling pages already teach lithium as "meaningful but uncertain"');
});
test('B5/B6 wherever symptom-triggered CIWA-Ar dosing is the stated treatment on the core SUD page, its validity limit is stated too', () => {
  const sud = read('03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md');
  assert.match(sud, /CIWA-Ar is not valid|not valid[^.]{0,60}CIWA/i, 't_sud.md teaches symptom-triggered dosing without saying the CIWA-Ar is not valid in delirium / non-communicative patients (ASAM 2020 VI.9)');
});
// ---------- Guards on corrections ALREADY made (must pass today) --------------------------------
test('G1 every shipped file that teaches "thiamine before glucose" also carries the hypoglycemia carve-out (debt list may only shrink)', () => {
  const RULE = /thiamine[^.\n]{0,60}\bbefore\b[^.\n]{0,40}(glucose|dextrose|carbohydrate|feeding)|thiamine[- ]before/i;
  const CARVE = /hypoglyc/i;
  // Files that state the rule only as a label or pointer and say nothing about hypoglycemia. Found 2026-11-10.
  const KNOWN_DEBT = new Set(JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'thiamine-carveout-debt.json'), 'utf8')).files);
  const missing = SHIPPED.filter(f => { const t = read(f); return RULE.test(t) && !CARVE.test(t); });
  const fresh = missing.filter(f => !KNOWN_DEBT.has(f));
  assert.deepEqual(fresh, [], 'a file teaches the sequencing rule with no "never delay dextrose for hypoglycemia" anywhere in it');
  const paid = [...KNOWN_DEBT].filter(f => !missing.includes(f));
  assert.deepEqual(paid, [], 'these files now carry the carve-out: delete them from thiamine-carveout-debt.json (the list may only shrink)');
});
test('G2 no shipped page teaches a no-suicide contract as protective, and EXTRIP\'s any-level criteria stay attached to the 4.0 threshold', () => {
  none(/no-(suicide|harm) contracts? (is|are) (the )?(gold standard|effective|protective)\b(?! )/i, 'contracts are not protective', u => !/\b(not|no evidence|trap|wrong)\b/i.test(u.text) && !/options\[/.test(u.where) && !/\/o\[/.test(u.where));
  const bad = ALL.filter(u => /lithium/i.test(u.text) && />\s?4\.0/.test(u.text) && /dialysis|extracorporeal|EXTRIP/i.test(u.text) && !/(at any level|irrespective of the level|regardless of the level|irrespective)/i.test(u.text)).map(u => `${u.file} ${u.where}`);
  assert.deepEqual(bad, [], 'EXTRIP: decreased consciousness, seizures or life-threatening dysrhythmias qualify irrespective of the level');
});
// ---------- Batch 2: the judgment calls Joshua Moss, MD, decided on 2026-11-10 (J1, J2, J5) -----
test('J1 no question tests the thiamine-glucose ORDER as a must', () => {
  const bad = QB.filter(i => /thiamine/i.test(JSON.stringify(i.options)) && /must occur before the glucose|most important step before administering the glucose/i.test(i.stem)).map(i => i.id);
  assert.deepEqual(bad, [], 'the order rests on case reports and ASAM 2020 accepts either; test that thiamine accompanies the glucose');
});
test('J2 the MS3 decision aid carries no numeric CIWA-Ar cut-offs, and resident surfaces use the ASAM 2020 bands', () => {
  const aid = read('04_Acute_and_Safety/Decision_Aids/decision-aids.html');
  assert.doesNotMatch(aid, /className:"bk"\},"(≤ ?8|9–19|≥ ?20)"/, 'three different band sets shipped; the decision aid now defers to the unit protocol');
  assert.match(aid, /A low score does not withhold treatment after a prior withdrawal seizure/);
  none(/Scores <8–10: mild; 8–18: moderate/, 'rounds questions use the ASAM 2020 bands (<10, 10–18, ≥19)');
});
test('J5 benzodiazepines in delirium: withdrawal is the main exception, not the single one', () => {
  none(/single exception of alcohol or sedative withdrawal/i, 'the library itself teaches benzodiazepines for seizures, catatonia and some toxidromes', u => !u.file.endsWith('question_bank.json'));
});
