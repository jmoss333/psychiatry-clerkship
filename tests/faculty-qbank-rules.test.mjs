import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TYPES,
  CATEGORIES,
  COMPETENCIES,
  SUBTYPES,
  OPTION_KEYS,
  assessItem,
  assessBank,
  mergeEditableItem,
  diffEditableFields,
  assessBatch,
} from '../faculty-console/qbank-rules.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clone = value => structuredClone(value);

const valid = () => ({
  id: 'qb_moo_900', status: 'draft', type: 'sba', category: 'mood',
  competency: ['dx'], difficulty: 2, pages: ['t_mood.md'],
  link: { label: 'Open Mood Disorders', href: '?page=t_mood.md' },
  stem: 'A fictional patient has a sustained depressive syndrome. Most likely diagnosis?',
  options: [
    { key: 'A', t: 'Major depressive disorder', c: true },
    { key: 'B', t: 'Delirium', trap: { name: 'Timeline miss', note: 'Delirium fluctuates.' } },
    { key: 'C', t: 'Mania', trap: { name: 'Polarity miss', note: 'Mania needs activation.' } },
    { key: 'D', t: 'Adjustment disorder', trap: { name: 'Threshold miss', note: 'The full syndrome is present.' } },
  ],
  why: 'The sustained syndrome supports major depressive disorder.',
  pearl: 'Name the syndrome before choosing treatment.',
  evidence: 't_mood.md — depressive syndrome discriminator.',
});

function contextFor(item, overrides = {}) {
  return {
    manifestPages: ['t_mood.md'],
    activeItems: [item],
    ...overrides,
  };
}

function codes(issues) {
  return issues.map(entry => entry.code);
}

function setCorrectKey(item, key) {
  for (const option of item.options) {
    if (option.key === key) {
      option.c = true;
      delete option.trap;
    } else {
      delete option.c;
      option.trap ??= { name: 'Plausible miss', note: 'This is less appropriate.' };
    }
  }
  return item;
}

test('exports the schema contract constants verbatim', () => {
  assert.deepEqual(TYPES, ['sba', 'two-tier', 'relational']);
  assert.deepEqual(CATEGORIES, ['mood','psychosis','anxiety','substance','neurocog','pharm','safety','personality','childdev','otherdx','ethics','relational']);
  assert.deepEqual(COMPETENCIES, ['dx','next-step','management','safety','pharm','psychosocial']);
  assert.deepEqual(SUBTYPES, ['family-system','what-would-you-say','transition-of-care']);
  assert.deepEqual(OPTION_KEYS, ['A','B','C','D']);
});

test('valid item is green', () => {
  const item = valid();
  const result = assessItem(item, contextFor(item));
  assert.equal(result.gate, 'ready');
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.warnings, []);
});

for (const [name, mutate, code] of [
  ['empty evidence', x => { x.evidence = ' '; }, 'required.evidence'],
  ['duplicate option keys', x => { x.options[3].key = 'A'; }, 'options.keys'],
  ['two correct answers', x => { x.options[1].c = true; }, 'options.correct_count'],
  ['missing trap', x => { delete x.options[1].trap; }, 'options.trap'],
  ['unknown source page', x => { x.pages = ['missing.md']; }, 'pages.unknown'],
  ['broken deep link', x => { x.link.href = '?page=missing.md'; }, 'link.unknown_page'],
]) test(name, () => {
  const item = valid(); mutate(item);
  assert.ok(assessItem(item, contextFor(item)).blockers.some(entry => entry.code === code));
});

test('required top-level strings reject missing or whitespace-only values', () => {
  for (const field of ['id', 'status', 'type', 'category', 'stem', 'why', 'pearl', 'evidence']) {
    const item = valid();
    item[field] = '   ';
    assert.ok(codes(assessItem(item, contextFor(item)).blockers).includes(`required.${field}`), field);
  }
});

for (const [name, mutate, code] of [
  ['malformed id', x => { x.id = 'mood-900'; }, 'id.format'],
  ['invalid status', x => { x.status = 'approved'; }, 'status.enum'],
  ['invalid type', x => { x.type = 'multiple-choice'; }, 'type.enum'],
  ['invalid category', x => { x.category = 'sleep'; }, 'category.enum'],
  ['empty competency array', x => { x.competency = []; }, 'competency.count'],
  ['too many competencies', x => { x.competency = ['dx', 'next-step', 'management', 'safety']; }, 'competency.count'],
  ['invalid competency', x => { x.competency = ['diagnosis']; }, 'competency.enum'],
  ['duplicate competencies', x => { x.competency = ['dx', 'dx']; }, 'competency.duplicate'],
  ['invalid difficulty', x => { x.difficulty = 4; }, 'difficulty.enum'],
  ['non-boolean high-yield flag', x => { x.hy = 'yes'; }, 'hy.type'],
  ['empty pages array', x => { x.pages = []; }, 'pages.required'],
  ['malformed page slug', x => { x.pages = ['t_mood.html']; }, 'pages.format'],
  ['duplicate page slug', x => { x.pages = ['t_mood.md', 't_mood.md']; }, 'pages.duplicate'],
  ['missing link', x => { delete x.link; }, 'link.required'],
  ['empty link label', x => { x.link.label = ' '; }, 'link.label'],
  ['malformed link target', x => { x.link.href = 'https://example.test/mood'; }, 'link.format'],
  ['external deep link', x => { x.link.href = 'https://example.test/?page=t_mood.md'; }, 'link.format'],
  ['traversing tool link', x => { x.link.href = 'tools/../mood.html'; }, 'link.format'],
  ['not four options', x => { x.options.pop(); }, 'options.count'],
  ['empty option text', x => { x.options[2].t = ' '; }, 'options.text'],
  ['duplicate normalized answer text', x => { x.options[2].t = ' delirium '; }, 'options.duplicate_text'],
  ['retired item', x => { x.retired = true; }, 'item.retired'],
]) test(name, () => {
  const item = valid(); mutate(item);
  assert.ok(codes(assessItem(item, contextFor(item)).blockers).includes(code));
});

test('item identity must resolve to exactly one active item', () => {
  const item = valid();
  const other = valid(); other.id = 'qb_moo_901';
  assert.ok(codes(assessItem(item, contextFor(item, { activeItems: [other] })).blockers).includes('id.unknown'));
  assert.ok(codes(assessItem(item, contextFor(item, { activeItems: [item, clone(item)] })).blockers).includes('id.duplicate'));
});

test('relational items require a valid subtype', () => {
  const missing = valid(); missing.type = 'relational';
  assert.ok(codes(assessItem(missing, contextFor(missing)).blockers).includes('subtype.required'));

  const invalid = valid(); invalid.type = 'relational'; invalid.subtype = 'generic';
  assert.ok(codes(assessItem(invalid, contextFor(invalid)).blockers).includes('subtype.enum'));

  const relational = valid(); relational.type = 'relational'; relational.subtype = 'family-system';
  assert.equal(assessItem(relational, contextFor(relational)).gate, 'ready');
});

function twoTier() {
  const item = valid();
  item.type = 'two-tier';
  item.tier2 = {
    q: 'Which rationale best explains the answer?',
    options: [
      { key: 'A', t: 'The syndrome meets the diagnostic threshold.', c: true },
      { key: 'B', t: 'The timeline fluctuates.' },
      { key: 'C', t: 'Activation defines this presentation.' },
    ],
    why: 'The sustained syndrome crosses the diagnostic threshold.',
  };
  return item;
}

for (const [name, mutate, code] of [
  ['missing tier two', x => { delete x.tier2; }, 'tier2.required'],
  ['empty tier-two question', x => { x.tier2.q = ' '; }, 'tier2.question'],
  ['wrong tier-two option count', x => { x.tier2.options.pop(); }, 'tier2.options_count'],
  ['duplicate tier-two keys', x => { x.tier2.options[2].key = 'A'; }, 'tier2.keys'],
  ['empty tier-two option text', x => { x.tier2.options[1].t = ''; }, 'tier2.text'],
  ['duplicate tier-two answer text', x => { x.tier2.options[1].t = x.tier2.options[0].t; }, 'tier2.duplicate_text'],
  ['two correct tier-two answers', x => { x.tier2.options[1].c = true; }, 'tier2.correct_count'],
  ['empty tier-two explanation', x => { x.tier2.why = ' '; }, 'tier2.why'],
]) test(name, () => {
  const item = twoTier(); mutate(item);
  assert.ok(codes(assessItem(item, contextFor(item)).blockers).includes(code));
});

test('valid tier-two shape is ready', () => {
  const item = twoTier();
  assert.equal(assessItem(item, contextFor(item)).gate, 'ready');
});

test('negative wording warns only in the final lead-in', () => {
  const prose = valid();
  prose.stem = 'The patient does not report mania. What is the most likely diagnosis?';
  assert.ok(!codes(assessItem(prose, contextFor(prose)).warnings).includes('stem.negative_lead_in'));

  for (const leadIn of [
    'Which finding is NOT expected?',
    'Which option is least appropriate?',
    'All of the following are expected EXCEPT?',
  ]) {
    const item = valid(); item.stem = `A fictional patient presents for care. ${leadIn}`;
    assert.ok(codes(assessItem(item, contextFor(item)).warnings).includes('stem.negative_lead_in'), leadIn);
  }
});

test('missing and weak question-form lead-ins are warnings', () => {
  const noQuestion = valid(); noQuestion.stem = 'A fictional patient has a sustained depressive syndrome.';
  assert.ok(codes(assessItem(noQuestion, contextFor(noQuestion)).warnings).includes('stem.lead_in'));

  const weak = valid(); weak.stem = 'A fictional patient has a sustained depressive syndrome. Which of the following is true?';
  assert.ok(codes(assessItem(weak, contextFor(weak)).warnings).includes('stem.weak_lead_in'));
});

test('all-of-the-above and none-of-the-above options are warnings', () => {
  for (const wording of ['All of the above', 'None of the above']) {
    const item = valid(); item.options[1].t = wording;
    assert.ok(codes(assessItem(item, contextFor(item)).warnings).includes('options.cueing'), wording);
  }
});

test('answer-length warning uses the unique-longest ratio and 35-character floor', () => {
  const item = valid();
  item.options[0].t = 'This uniquely long correct response contains enough explanatory qualification to create a conspicuous answer-position cue for a learner.';
  item.options[1].t = 'Short one';
  item.options[2].t = 'Short two';
  item.options[3].t = 'Short three';
  assert.ok(codes(assessItem(item, contextFor(item)).warnings).includes('options.answer_length'));

  const tied = clone(item); tied.options[1].t = tied.options[0].t;
  assert.ok(!codes(assessItem(tied, contextFor(tied)).warnings).includes('options.answer_length'));

  const smallGap = valid(); smallGap.options[0].t = 'Correct answer is a little longer';
  smallGap.options[1].t = 'Brief'; smallGap.options[2].t = 'Short'; smallGap.options[3].t = 'Tiny';
  assert.ok(!codes(assessItem(smallGap, contextFor(smallGap)).warnings).includes('options.answer_length'));
});

test('evidence and page-link mismatches are advisory when both slugs are shipped', () => {
  const item = valid();
  item.evidence = 't_psychosis.md — a different source anchor.';
  item.link.href = '?page=t_psychosis.md';
  const result = assessItem(item, contextFor(item, { manifestPages: ['t_mood.md', 't_psychosis.md'] }));
  assert.ok(codes(result.warnings).includes('evidence.page_mismatch'));
  assert.ok(codes(result.warnings).includes('link.page_mismatch'));
  assert.equal(result.blockers.length, 0);
});

test('near-duplicate stems warn at 85% Jaccard token overlap', () => {
  const item = valid();
  item.stem = 'A fictional patient reports sadness fatigue insomnia guilt poor concentration and hopelessness. Most likely diagnosis?';
  const duplicate = clone(item); duplicate.id = 'qb_moo_901';
  duplicate.stem = 'A fictional patient reports sadness fatigue insomnia guilt poor concentration and anhedonia. Most likely diagnosis?';
  const result = assessItem(item, contextFor(item, { activeItems: [item, duplicate] }));
  assert.ok(codes(result.warnings).includes('stem.near_duplicate'));

  duplicate.stem = 'A hospitalized patient becomes acutely confused and inattentive overnight. Best next step?';
  assert.ok(!codes(assessItem(item, contextFor(item, { activeItems: [item, duplicate] })).warnings).includes('stem.near_duplicate'));
});

test('governed merge preserves stable data, forces draft, and drops inapplicable fields', () => {
  const original = valid();
  original.status = 'attested';
  original.v2 = { case: { caseId: 'case-1', step: 1, of: 2 } };
  original.serverOnly = { keep: true };
  const edited = clone(original);
  edited.id = 'qb_moo_999';
  edited.status = 'attested';
  edited.stem = 'A revised fictional vignette. Best diagnosis?';
  edited.subtype = 'family-system';
  edited.tier2 = { q: 'Injected?', options: [], why: 'No.' };
  edited.v2 = { overwritten: true };
  edited.serverOnly = { keep: false };
  edited.retired = true;

  const merged = mergeEditableItem(original, edited);
  assert.equal(merged.id, original.id);
  assert.equal(merged.status, 'draft');
  assert.equal(merged.stem, edited.stem);
  assert.deepEqual(merged.v2, original.v2);
  assert.deepEqual(merged.serverOnly, original.serverOnly);
  assert.equal(merged.retired, undefined);
  assert.equal(merged.subtype, undefined);
  assert.equal(merged.tier2, undefined);

  edited.options[0].t = 'Changed after merge';
  assert.notEqual(merged.options[0].t, edited.options[0].t);
});

test('governed merge preserves retirement metadata from the original', () => {
  const original = valid();
  original.retired = true;
  original.retiredReason = 'Duplicate item.';
  const edited = clone(original); delete edited.retired; delete edited.retiredReason;
  const merged = mergeEditableItem(original, edited);
  assert.equal(merged.retired, true);
  assert.equal(merged.retiredReason, 'Duplicate item.');
});

test('field diff reports editable leaf labels and ignores governed fields', () => {
  const original = valid();
  const edited = clone(original);
  edited.id = 'qb_moo_999';
  edited.status = 'attested';
  edited.link.href = '?page=t_psychosis.md';
  edited.options[1].trap.note = 'A revised corrective note.';
  edited.tier2 = twoTier().tier2;

  assert.deepEqual(diffEditableFields(original, edited), [
    'link.href',
    'options.B.trap.note',
    'tier2',
  ]);
});

test('field diff addresses tier-two options by stable key', () => {
  const original = twoTier();
  const edited = clone(original);
  edited.tier2.options[2].t = 'A revised rationale.';
  assert.deepEqual(diffEditableFields(original, edited), ['tier2.options.C.t']);
});

test('bank summary excludes retired items and reports draft answer keys', () => {
  const draftA = valid();
  const draftB = setCorrectKey(valid(), 'B'); draftB.id = 'qb_moo_901';
  draftB.stem = 'During an outpatient follow-up, symptoms remain unexplained. Which of the following is true?';
  const attestedC = setCorrectKey(valid(), 'C'); attestedC.id = 'qb_moo_902'; attestedC.status = 'attested';
  attestedC.stem = 'An older inpatient develops fluctuating attention after surgery. What is the most likely syndrome?';
  const retiredD = setCorrectKey(valid(), 'D'); retiredD.id = 'qb_moo_903'; retiredD.retired = true;
  const items = [draftA, draftB, attestedC, retiredD];
  const result = assessBank(items, { manifestPages: ['t_mood.md'], activeItems: items });

  assert.deepEqual(result.counts, {
    total: 3,
    draft: 2,
    attested: 1,
    ready: 2,
    warning: 1,
    blocked: 0,
  });
  assert.deepEqual(result.answerKeys, { A: 1, B: 1, C: 0, D: 0 });
  assert.deepEqual(result.categoryAnswerKeys.mood, { A: 1, B: 1, C: 0, D: 0 });
  assert.deepEqual(Object.keys(result.byId).sort(), ['qb_moo_900', 'qb_moo_901', 'qb_moo_902']);
});

test('bank and batch summaries classify malformed option containers without throwing', () => {
  const item = valid(); item.options = {};
  const bank = assessBank([item], { manifestPages: ['t_mood.md'] });
  assert.equal(bank.counts.blocked, 1);
  assert.deepEqual(bank.answerKeys, { A: 0, B: 0, C: 0, D: 0 });
  assert.deepEqual(assessBatch([item]).answerKeys, { A: 0, B: 0, C: 0, D: 0 });
});

test('batch balance rejects strong position cues only for selections of four or more', () => {
  const make = (id, key) => {
    const item = setCorrectKey(valid(), key); item.id = id; return item;
  };
  const threeAs = [make('qb_moo_901', 'A'), make('qb_moo_902', 'A'), make('qb_moo_903', 'A')];
  assert.equal(assessBatch(threeAs).ok, true);

  const balanced = [make('qb_moo_901', 'A'), make('qb_moo_902', 'A'), make('qb_moo_903', 'B'), make('qb_moo_904', 'C')];
  assert.deepEqual(assessBatch(balanced), {
    ok: true,
    issues: [],
    answerKeys: { A: 2, B: 1, C: 1, D: 0 },
  });

  const cued = [make('qb_moo_901', 'A'), make('qb_moo_902', 'A'), make('qb_moo_903', 'A'), make('qb_moo_904', 'B')];
  const result = assessBatch(cued);
  assert.equal(result.ok, false);
  assert.deepEqual(result.answerKeys, { A: 3, B: 1, C: 0, D: 0 });
  assert.deepEqual(codes(result.issues), ['batch.answer_key_balance']);
});

test('current repository bank has 189 blocker-free active items and documents the all-A draft cohort', () => {
  const bank = JSON.parse(fs.readFileSync(path.join(repo, 'question_bank.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/site_manifest.json'), 'utf8'));
  const manifestPages = (manifest.md || []).map(([, slug]) => slug);
  const result = assessBank(bank.items, { manifestPages, activeItems: bank.items });

  assert.equal(result.counts.total, 189);
  assert.equal(result.counts.draft, 46);
  assert.equal(result.counts.attested, 143);
  assert.equal(Object.keys(result.byId).length, 189);
  assert.equal(Object.values(result.byId).flatMap(entry => entry.blockers).length, 0);
  assert.deepEqual(result.answerKeys, { A: 46, B: 0, C: 0, D: 0 });
  for (const item of bank.items.filter(entry => entry.retired)) {
    assert.equal(Object.hasOwn(result.byId, item.id), false);
  }
});
