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

for (const [name, call, verify] of [
  ['assessItem accepts a null context', () => assessItem({}, null), result => {
    assert.equal(result.gate, 'blocked');
    assert.ok(Array.isArray(result.blockers));
  }],
  ['assessItem normalizes wrong context containers', () => assessItem(valid(), { manifestPages: {}, activeItems: 'wrong' }), result => {
    assert.equal(result.gate, 'ready');
  }],
  ['assessItem accepts primitive item and context values', () => assessItem(7, 'wrong'), result => {
    assert.equal(result.gate, 'blocked');
  }],
  ['assessBank ignores a null item', () => assessBank([null], null), result => {
    assert.equal(result.counts.total, 0);
    assert.deepEqual(Object.keys(result.byId), []);
  }],
  ['assessBank normalizes non-array inputs', () => assessBank(7, { manifestPages: 'wrong', activeItems: {} }), result => {
    assert.equal(result.counts.total, 0);
  }],
  ['assessBatch accepts null', () => assessBatch(null), result => {
    assert.deepEqual(result.answerKeys, { A: 0, B: 0, C: 0, D: 0 });
  }],
  ['assessBatch ignores a null item', () => assessBatch([null]), result => {
    assert.deepEqual(result.answerKeys, { A: 0, B: 0, C: 0, D: 0 });
  }],
  ['assessBatch normalizes primitive inputs', () => assessBatch('wrong'), result => {
    assert.equal(result.ok, true);
  }],
  ['mergeEditableItem accepts a null edit', () => mergeEditableItem(valid(), null), result => {
    assert.equal(result.id, 'qb_moo_900');
    assert.equal(result.status, 'draft');
  }],
  ['mergeEditableItem normalizes primitive records', () => mergeEditableItem(null, 7), result => {
    assert.equal(result.status, 'draft');
  }],
  ['diffEditableFields normalizes null and primitive records', () => diffEditableFields(null, 7), result => {
    assert.ok(Array.isArray(result));
  }],
]) test(name, () => {
  let result;
  assert.doesNotThrow(() => { result = call(); });
  verify(result);
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

test('evidence matching compares exact Markdown slugs rather than substrings', () => {
  const item = valid();
  item.pages = ['mood.md'];
  item.link.href = '?page=mood.md';
  item.evidence = 't_mood.md — a different source anchor.';
  const result = assessItem(item, contextFor(item, { manifestPages: ['mood.md'] }));
  assert.ok(codes(result.warnings).includes('evidence.page_mismatch'));
  assert.equal(result.blockers.length, 0);
});

for (const suffix of ['.bak', '2']) {
  test(`evidence matching rejects Markdown-like suffix ${suffix}`, () => {
    const item = valid();
    item.pages = ['mood.md'];
    item.link.href = '?page=mood.md';
    item.evidence = `mood.md${suffix} — not the exact source slug.`;
    const result = assessItem(item, contextFor(item, { manifestPages: ['mood.md'] }));
    assert.ok(codes(result.warnings).includes('evidence.page_mismatch'));
    assert.equal(result.blockers.length, 0);
  });
}

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

test('governed merge updates supported nested fields while preserving only repository extensions', () => {
  const original = twoTier();
  original.link.repository = { source: 'preserve-link-extension' };
  original.options[1].repository = { calibration: 'preserve-option-extension' };
  original.options[1].trap.repository = { noteVersion: 2 };
  original.tier2.repository = { source: 'preserve-tier-extension' };
  original.tier2.options[1].trap = {
    name: 'Preserve existing tier-two trap',
    note: 'The editor does not currently expose tier-two trap fields.',
    repository: { reviewed: true },
  };
  const before = clone(original);
  const edited = {
    ...clone(original),
    link: {
      label: 'Open the revised mood page',
      href: '?page=t_mood.md',
      clientInjected: { doNotTrust: true },
    },
    options: original.options.map(option => ({
      key: option.key,
      t: option.key === 'B' ? 'A revised distractor' : option.t,
      ...(option.c === true ? { c: true } : {}),
      ...(option.trap ? {
        trap: {
          name: option.trap.name,
          note: option.key === 'B' ? 'A revised corrective note.' : option.trap.note,
          clientInjected: 'drop me',
        },
      } : {}),
      clientInjected: 'drop me',
    })),
    tier2: {
      q: 'Which revised rationale best explains the answer?',
      why: original.tier2.why,
      clientInjected: 'drop me',
      options: original.tier2.options.map(option => ({
        key: option.key,
        t: option.t,
        ...(option.c === true ? { c: true } : {}),
        clientInjected: 'drop me',
      })),
    },
  };
  const editedBefore = clone(edited);

  const merged = mergeEditableItem(original, edited);

  assert.deepEqual(original, before);
  assert.deepEqual(edited, editedBefore);
  assert.deepEqual(merged.link.repository, original.link.repository);
  assert.equal(Object.hasOwn(merged.link, 'clientInjected'), false);
  assert.deepEqual(merged.options[1].repository, original.options[1].repository);
  assert.deepEqual(merged.options[1].trap.repository, original.options[1].trap.repository);
  assert.equal(merged.options[1].t, 'A revised distractor');
  assert.equal(merged.options[1].trap.note, 'A revised corrective note.');
  assert.equal(Object.hasOwn(merged.options[1], 'clientInjected'), false);
  assert.equal(Object.hasOwn(merged.options[1].trap, 'clientInjected'), false);
  assert.deepEqual(merged.tier2.repository, original.tier2.repository);
  assert.deepEqual(merged.tier2.options[1].trap, original.tier2.options[1].trap);
  assert.equal(Object.hasOwn(merged.tier2, 'clientInjected'), false);
  assert.equal(Object.hasOwn(merged.tier2.options[1], 'clientInjected'), false);

  merged.tier2.options[1].trap.repository.reviewed = false;
  assert.equal(original.tier2.options[1].trap.repository.reviewed, true);
});

test('governed merge honors explicit tier-two option cardinality changes by stable key', () => {
  const original = twoTier();
  original.tier2.options[1].repository = { preserve: 'B' };
  const edited = clone(original);
  edited.tier2.options.push({ key: 'D', t: 'A new fourth rationale.' });
  const expanded = mergeEditableItem(original, edited);
  assert.deepEqual(expanded.tier2.options.map(option => option.key), ['A', 'B', 'C', 'D']);
  assert.deepEqual(expanded.tier2.options[1].repository, { preserve: 'B' });

  const reducedEdit = clone(expanded);
  reducedEdit.tier2.options = reducedEdit.tier2.options.slice(0, 3);
  const reduced = mergeEditableItem(expanded, reducedEdit);
  assert.deepEqual(reduced.tier2.options.map(option => option.key), ['A', 'B', 'C']);
  assert.deepEqual(reduced.tier2.options[1].repository, { preserve: 'B' });
});

test('governed merge does not silently restore missing supported nested structure', () => {
  const original = twoTier();
  const edited = clone(original);
  edited.link = { label: original.link.label };
  edited.options[1] = { key: 'B', trap: clone(original.options[1].trap) };
  edited.tier2 = {
    why: original.tier2.why,
    options: clone(original.tier2.options),
  };

  const merged = mergeEditableItem(original, edited);
  const result = assessItem(merged, contextFor(merged));

  assert.equal(Object.hasOwn(merged.link, 'href'), false);
  assert.equal(Object.hasOwn(merged.options[1], 't'), false);
  assert.equal(Object.hasOwn(merged.tier2, 'q'), false);
  assert.ok(codes(result.blockers).includes('link.href'));
  assert.ok(codes(result.blockers).includes('options.text'));
  assert.ok(codes(result.blockers).includes('tier2.question'));
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

for (const [name, original, edit, expected] of [
  ['tier-one', (() => {
    const item = valid(); item.options[3].key = 'E'; return item;
  })(), item => { item.options[3].t = 'A revised malformed-key answer.'; }, ['options']],
  ['tier-two', (() => {
    const item = twoTier(); item.tier2.options[2].key = 'E'; return item;
  })(), item => { item.tier2.options[2].t = 'A revised malformed-key rationale.'; }, ['tier2.options']],
]) test(`field diff cannot hide ${name} edits behind malformed option keys`, () => {
  const edited = clone(original); edit(edited);
  assert.deepEqual(diffEditableFields(original, edited), expected);
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

test('bank summary maps safely retain reserved ID and category names', () => {
  const proto = valid();
  proto.id = '__proto__';
  proto.category = 'constructor';
  const constructor = valid();
  constructor.id = 'constructor';
  constructor.category = '__proto__';
  constructor.stem = 'An inpatient has new fluctuating attention overnight. What is the most likely syndrome?';

  const result = assessBank([proto, constructor], { manifestPages: ['t_mood.md'] });
  assert.equal(Object.getPrototypeOf(result.byId), null);
  assert.equal(Object.getPrototypeOf(result.categoryAnswerKeys), null);
  assert.equal(Object.hasOwn(result.byId, '__proto__'), true);
  assert.equal(Object.hasOwn(result.byId, 'constructor'), true);
  assert.equal(Object.hasOwn(result.categoryAnswerKeys, '__proto__'), true);
  assert.equal(Object.hasOwn(result.categoryAnswerKeys, 'constructor'), true);
  assert.equal(result.categoryAnswerKeys.__proto__.A, 1);
  assert.equal(result.categoryAnswerKeys.constructor.A, 1);
});

test('bank and batch summaries classify malformed option containers without throwing', () => {
  const item = valid(); item.options = {};
  const bank = assessBank([item], { manifestPages: ['t_mood.md'] });
  assert.equal(bank.counts.blocked, 1);
  assert.deepEqual(bank.answerKeys, { A: 0, B: 0, C: 0, D: 0 });
  assert.deepEqual(assessBatch([item]).answerKeys, { A: 0, B: 0, C: 0, D: 0 });
});

test('bank and batch summaries tolerate null and primitive options inside an array', () => {
  const item = setCorrectKey(valid(), 'D');
  item.options[0] = null;
  item.options[1] = 7;

  let bank;
  let batch;
  assert.doesNotThrow(() => {
    bank = assessBank([item], { manifestPages: ['t_mood.md'] });
    batch = assessBatch([item]);
  });
  assert.deepEqual(bank.answerKeys, { A: 0, B: 0, C: 0, D: 1 });
  assert.deepEqual(batch.answerKeys, { A: 0, B: 0, C: 0, D: 1 });
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

test('malformed members cannot shrink a four-item batch below the balance threshold', () => {
  const items = [valid(), valid(), valid(), null];
  items[1].id = 'qb_moo_901';
  items[2].id = 'qb_moo_902';
  const result = assessBatch(items);
  assert.equal(result.ok, false);
  assert.deepEqual(result.answerKeys, { A: 3, B: 0, C: 0, D: 0 });
  assert.deepEqual(codes(result.issues), ['batch.answer_key_balance']);
});

test('current repository bank has 189 blocker-free active items with a balanced draft answer-key spread', () => {
  const bank = JSON.parse(fs.readFileSync(path.join(repo, 'question_bank.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/site_manifest.json'), 'utf8'));
  const manifestPages = (manifest.md || []).map(([, slug]) => slug);
  const result = assessBank(bank.items, { manifestPages, activeItems: bank.items });

  // The AI-drafted cohort originally carried its correct answer at key A on 46 of 47
  // active drafts, which tripped batch.answer_key_balance for every cohort of 4+ and
  // biased position-learners. The 2026-08-11 re-key pass (salvaged from the July 10
  // .codex/36da working tree, reconciled against retirements that landed since) spreads
  // the drafts' correct keys near-evenly; qb_pha_011 (demoted attested->draft in
  // PR #280, keyed B) accounts for the +1 on B relative to the transplanted 46.
  // Five of those drafts were attested in the faculty console on 2026-08-11/12, stranded
  // on attest/pending, and replayed onto main in #380. Four of the five were then reopened:
  // the console reads attest/pending, which forked BEFORE the answer-key rebalance, so it
  // showed pre-rebalance text and #380 replayed the status onto questions whose wording —
  // and for three of them, whose correct option (A->B, A->C, A->D) — had since changed.
  // Only qb_anx_016 stayed attested; its text on main is the version that was reviewed.
  // A status is only meaningful against the content it was given for.
  assert.equal(result.counts.total, 189);
  assert.equal(result.counts.draft, 46);
  assert.equal(result.counts.attested, 143);
  assert.equal(Object.keys(result.byId).length, 189);
  assert.equal(Object.values(result.byId).flatMap(entry => entry.blockers).length, 0);
  assert.deepEqual(result.answerKeys, { A: 12, B: 12, C: 11, D: 11 });
  for (const item of bank.items.filter(entry => entry.retired)) {
    assert.equal(Object.hasOwn(result.byId, item.id), false);
  }
});
