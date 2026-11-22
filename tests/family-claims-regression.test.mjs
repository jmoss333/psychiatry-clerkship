// Regression tests from the 2026-11-22 family-evidence review (superseded, misattributed and
// overstated claims about family intervention). Tests 1-9 each reproduce one finding the same PR
// corrected; X1-X4 pin four further corrections made in that PR; B1-B5 pin the Batch 2 wording faculty
// chose on 2026-11-22 (decision D-2026-11-22-01, items J1-J15). Findings, sources and stored spans:
// the PR description, the Batch 2 handoff file and evidence_annotations.json.
//
// It reads only the wording of shipped content: every file shipped_pages.json lists, plus the
// topic_meta.json overlay of each shipped slug (keyed by slug, so derived from the same listing).
// It never reads attestation state (reviewed.json, facultyReview, facultyReviewStatus, question
// status beyond "retired"), so it cannot trip tests/live-governance-state.test.mjs (invariant 10).
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
const LISTING = JSON.parse(read('13_Faculty_Resources/_automation/site_build/shipped_pages.json'));
const PAGES = Array.isArray(LISTING) ? LISTING : LISTING.pages;
const SHIPPED = (() => {
  const set = new Set();
  for (const p of PAGES) { if (p.source) set.add(p.source); for (const e of p.extraSources || []) set.add(e); }
  return [...set].filter(f => /\.(md|html|json|js)$/.test(f) && fs.existsSync(path.join(ROOT, f))).sort();
})();
const SLUGS = new Set(PAGES.map(p => p.slug).filter(Boolean));

// A "record" is the unit a learner meets as one thing: a whole page, one question, one quiz card,
// one topic_meta overlay. Each record carries its strings so a check can look at one or all.
function strings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) for (const x of node) strings(x, out);
  else if (node && typeof node === 'object') { if (node.retired === true) return out; for (const k of Object.keys(node)) strings(node[k], out); }
  return out;
}
const RECORDS = [];
for (const file of SHIPPED) {
  const raw = read(file);
  if (!file.endsWith('.json')) { RECORDS.push({ where: file, texts: raw.split('\n') }); continue; }
  const data = JSON.parse(raw);
  if (Array.isArray(data.items)) {                       // question_bank.json: one record per live item
    for (const item of data.items) if (item.retired !== true) RECORDS.push({ where: `${file} ${item.id}`, texts: strings(item), question: true });
  } else if (Array.isArray(data.decks)) {                // quiz decks: one record per card
    for (const deck of data.decks) (deck.questions || []).forEach((q, i) => RECORDS.push({ where: `${file} ${deck.id}#${i}`, texts: strings(q) }));
  } else {
    RECORDS.push({ where: file, texts: strings(data) });
  }
}
const META = JSON.parse(read('topic_meta.json'));
for (const slug of Object.keys(META)) if (SLUGS.has(slug)) RECORDS.push({ where: `topic_meta.json ${slug}`, texts: strings(META[slug]) });

assert.ok(SHIPPED.length > 100 && RECORDS.length > 500, `shipped universe looks empty (${SHIPPED.length} files, ${RECORDS.length} records) -- refusing to pass over nothing`);
const QUESTIONS = RECORDS.filter(r => r.question);
assert.ok(QUESTIONS.length > 100, `question bank looks empty (${QUESTIONS.length} live items)`);

const offenders = (records, re) => records.flatMap(r => r.texts.filter(t => re.test(t)).map(t => `${r.where}: ${t.slice(0, 170)}`));
const none = (re, why, records = RECORDS) => { const h = offenders(records, re); assert.equal(h.length, 0, `${why}\n  ${h.join('\n  ')}`); };
const sentences = t => t.split(/(?<=[.;!?])\s+/);

test('1 no shipped source names clinician avoidance as the barrier to family work', () => {
  none(/clinician avoidance/i, 'no source ranks clinician avoidance first: Ince 2016 reports organisational barriers most often; Tham & Solomon 2024 list patients declining among the barriers');
});
test('2 no shipped source says Open Dialogue has no completed RCT or that ODDESSI is ongoing', () => {
  none(/no completed RCT exists|ODDESSI trial is ongoing|ODDESSI\)? has not reported/i, 'ODDESSI reported in 2026: no statistically significant difference in time to relapse, HR 0.95 (95% CI 0.67-1.32) (Pilling 2026)');
});
test('3 no shipped source says two sessions or fewer "is ineffective"', () => {
  none(/(≤\s?2|two|2)( family)? sessions?( or fewer)?( of family \w+)?\s+(is|are)\s+ineffective|≤\s?2 is ineffective/i,
    'Rodolico 2022: two sessions or fewer did not significantly reduce relapse -- a non-significant result, not proof of no effect');
});
test('4 every shipped record that gives an NNT from the 2010 Cochrane review also names the 2024 Cochrane update', () => {
  const NNT7 = /\bNNT\s*(?:of\s+|around\s+|about\s+|≈\s*|~\s*)?7\b(?!\.\d)/i;
  const PHAROAH = /Pharoah|2010 Cochrane|Cochrane 2010|family (intervention|psychoeducation|work)/i;
  const UPDATE = /2024 Cochrane update|Chien/i;
  const bad = RECORDS.filter(r => {
    const all = r.texts.join('\n');
    const gives = r.texts.some(t => sentences(t).some(s => NNT7.test(s) && PHAROAH.test(s))) && /Pharoah|Cochrane/i.test(all);
    return gives && !UPDATE.test(all);
  }).map(r => r.where);
  assert.deepEqual(bad, [], 'Pharoah 2010 (NNT ~7) has a 2024 Cochrane update (Chien 2024, CD013541) that rates the relapse evidence low-certainty and finds little to no difference in admission');
});
test('5 no shipped source says family involvement "triples the odds"', () => {
  none(/triples? the odds/i, 'Haselden 2019 is an observational association: adjusted OR 2.79 (95% CI 1.28-6.08) for a 7-day visit');
});
test('6 the schizophrenia "37% / 10%" relapse figures ship only labelled as a model estimate, and no Miklowitz 2003 line carries them', () => {
  // Rodolico 2022's full text (read 2026-11-22) gives 37% and 10% as 12-month event rates the authors calculated from
  // the odds ratio (appendix p 8), not rates observed in a trial arm. Faculty decision D-2026-11-22-01 (Batch 2, J9)
  // restored them on Family Therapy Modalities only, in a line that says so, with the full-text span stored. Anywhere
  // else, or in a line without that label, they are the overstatement this PR removed.
  const MODALITIES = '06_Family_and_Relational/family_therapy_modalities_inpatient.md';
  const FIGURES = /\b37\s?%[^.]{0,80}\b10\s?%|\b10\s?%[^.]{0,80}\b37\s?%|from\s+~?37\s?%/i;
  const RELAPSE_37 = t => /\b37\s?%/.test(t) && /relaps/i.test(t) && /schizophren|psychoeducation|family/i.test(t);
  const LABELLED = t => /model estimate/i.test(t) && /not a rate seen in one trial/i.test(t) && /Rodolico/.test(t);
  const bad = RECORDS.flatMap(r => r.texts.filter(t => (FIGURES.test(t) || RELAPSE_37(t)) && !(r.where === MODALITIES && LABELLED(t)))
    .map(t => `${r.where}: ${t.slice(0, 160)}`));
  assert.deepEqual(bad, [], 'relapse "37% / 10%" are event rates Rodolico 2022 calculated from the odds ratio; they ship only on the modalities page, labelled as a model estimate (D-2026-11-22-01, J9)');
  const labelled = RECORDS.filter(r => r.where === MODALITIES).flatMap(r => r.texts.filter(t => FIGURES.test(t) && LABELLED(t)));
  assert.equal(labelled.length, 1, 'expected the one labelled estimate on the modalities page -- refusing to pass over nothing');
  const row = JSON.parse(read('evidence_annotations.json')).annotations.find(a => a.sourceId === 'rodolico-2022-family-nma');
  const span = row ? row.verifiedAgainst.sourceSpan : '';
  for (const words of ['Event rates were calculated from ORs', '37% of participants receiving treatment as usual relapsed',
    '10% [7–14] of participants', 'No studies had low risk of bias']) {
    assert.ok(span.includes(words), `the stored Rodolico span must carry "${words}" to license the labelled estimate`);
  }
  // The landmark index is the record the quiz decks were extracted from. It is not shipped, so it is named here.
  const index = JSON.parse(read('07_Evidence_and_Reading/Landmark_Trials/LM_master_index.json'));
  const entries = (index.papers || []).filter(e => /Miklowitz/.test(JSON.stringify(e)) && /2003/.test(JSON.stringify(e)));
  assert.ok(entries.length > 0, 'Miklowitz 2003 entry not found in LM_master_index.json papers -- refusing to pass over nothing');
  const lines = entries.flatMap(e => strings(e)).filter(t => /\b(37|10)\s?%/.test(t) && /relaps/i.test(t) && /schizophren/i.test(t));
  assert.deepEqual(lines, [], 'a schizophrenia meta-analysis cannot confirm a bipolar trial; remove the sentence from the Miklowitz 2003 entry');
});
test('7 no shipped source or live question attributes "doubling to quintupling" to Butzlaff & Hooley', () => {
  const bad = RECORDS.flatMap(r => r.texts.filter(t => /doubl\w*\s+to\s+quintupl/i.test(t) && /Butzlaff/i.test(t)).map(t => `${r.where}: ${t.slice(0, 160)}`));
  assert.deepEqual(bad, [], 'the odds ratios are Ma 2021; Butzlaff & Hooley 1998 is the earlier meta-analysis of 27 studies and reports no odds ratios in its abstract');
});
test('8 no live question calls the family NNT one of "the strongest NNTs in inpatient psychiatry"', () => {
  none(/strongest NNTs? in inpatient psychiatry/i, 'no source ranks it; the 2024 Cochrane update rates the relapse evidence low-certainty', QUESTIONS);
});
test('9 the registry holds every source this work cites, each with a stored span, and the Tham & Solomon note no longer names clinician avoidance', () => {
  const CITED = [
    'rodolico-2022-family-nma', 'chien-2024-family-cochrane', 'pharoah-2010-family-intervention', 'ince-2016-implementation',
    'tham-solomon-2024', 'pilling-2026-oddessi', 'haselden-2019-family-involvement-followup', 'ma-2021',
    'butzlaff-hooley-1998-ee-meta', 'dixon-1999-family-services', 'fontanella-2020-youth-followup-suicide',
    'lemmens-2009-family-therapy-depression', 'nice-cg178-psychosis-schizophrenia', 'chung-2019-first-week-month',
    // Batch 2 (D-2026-11-22-01)
    'okpokoro-2014-brief-family-cochrane', 'glick-1990-inpatient-family-intervention', 'eassom-2014-family-involvement-implementation',
    'norheim-2025-ifip-cluster-rct', 'bighelli-2021-psychosocial-relapse-nma', 'henken-2007-family-therapy-depression-cochrane',
    'pitschel-walz-2006-munich-pip',
  ];
  const registry = JSON.parse(read('evidence_registry.json')).sources;
  const ids = new Set(registry.map(s => s.id));
  const annotated = new Set(JSON.parse(read('evidence_annotations.json')).annotations.map(a => a.sourceId));
  assert.deepEqual(CITED.filter(id => !ids.has(id)), [], 'registry is missing a cited source');
  assert.deepEqual(CITED.filter(id => !annotated.has(id)), [], 'a cited source has no stored verbatim span');
  const tham = registry.find(s => s.id === 'tham-solomon-2024');
  assert.doesNotMatch(JSON.stringify(tham.governance.clerkshipRelevance || ''), /clinician avoidance/i, 'Tham & Solomon 2024 do not rank barriers');
});

// ---------- Further corrections made in the same PR (red on the base commit) --------------------
test('X1 no shipped source calls the family NNT "statin territory" or credits it with reducing readmission', () => {
  none(/statin territory/i, 'removed with the 2024 Cochrane update beside the 2010 estimate');
  none(/family intervention[^.]{0,60}reduces relapse and readmission/i, 'the 2024 Cochrane update finds little to no difference in hospital admission');
});
test('X2 no shipped source says pre-discharge 7-day follow-up carries "substantially lower suicide risk"', () => {
  none(/substantially lower suicide risk/i, 'Fontanella 2020: an attended 7-day visit, in youths, associated with adjusted RR 0.44 over days 8-180');
});
test('X3 no shipped source says days 0-3 are the highest-risk post-discharge days on Chung 2019\'s authority', () => {
  none(/days 0[–-]3 the highest/i, 'Chung 2019 compares the first week with days 8-31; it reports no days 0-3 estimate');
});
test('X4 no shipped source says family psychoeducation is "supported by over 100 RCTs"', () => {
  none(/supported by over 100 RCTs/i, 'the cited network meta-analysis included 90 RCTs (Rodolico 2022)');
});

// ---------- Batch 2: the wording faculty chose (D-2026-11-22-01; red on 3bf9a93f) ----------------
test('B1 no shipped source calls family psychoeducation the single strongest psychosocial intervention (J10)', () => {
  none(/single strongest psychosocial intervention/i, 'Rodolico 2022 compared family models only; across 20 psychosocial interventions Bighelli 2021 found lower point estimates for family interventions, relapse prevention programmes and CBT');
});
test('B2 no shipped source says brief, simple family psychoeducation formats are effective (J8.1)', () => {
  none(/even brief,? simple formats are effective/i, 'two sessions or fewer did not significantly reduce relapse (Rodolico 2022); brief family intervention evidence is low to very low quality (Okpokoro 2014)');
});
test('B3 no shipped source says involving families in discharge planning increases follow-up attendance (F05)', () => {
  none(/(significantly )?increases follow-up attendance/i, 'Haselden 2019 is an association from chart review (adjusted OR 2.79), not an effect');
});
test('B4 no shipped source says family or group-format psychoeducation "reduced recurrence" in bipolar disorder (J11)', () => {
  none(/(family or group|group or family) format reduced recurrence/i, 'Miklowitz 2021: an association, and OR 0.12 is a component-model estimate with a credible interval');
});
test('B5 no shipped source says that bringing the family in "changes outcomes" (J1)', () => {
  none(/Bringing the family in changes outcomes/i, 'the relapse evidence is for multi-session programs; the one inpatient-only trial found little effect at discharge (Glick 1990)');
});
