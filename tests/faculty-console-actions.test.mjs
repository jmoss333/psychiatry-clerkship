import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QbankActionError,
  itemRevision,
  prepareAttestation,
  prepareDraftSave,
} from '../faculty-console/netlify/functions/qbank-actions.mjs';

const manifestPages = ['t_mood.md'];
const confirmed = {
  clinical: true,
  evidence: true,
  originalityAndNoPhi: true,
};

const stems = [
  'A fictional inpatient reports persistent sadness, anhedonia, and guilt. What diagnosis best explains this syndrome?',
  'A fictional older adult develops fluctuating inattention after surgery. What syndrome is most likely?',
  'A fictional outpatient has elevated mood, little need for sleep, and pressured speech. What diagnosis best fits?',
  'A fictional student has intrusive thoughts and time-consuming rituals. What condition is the best explanation?',
  'A fictional patient avoids trauma reminders and has recurrent nightmares. What diagnosis is most likely?',
];

function validItem({
  id = 'qb_moo_900',
  status = 'draft',
  correctKey = 'A',
  stem = stems[0],
} = {}) {
  const options = [
    { key: 'A', t: 'Major depressive disorder' },
    { key: 'B', t: 'Delirium' },
    { key: 'C', t: 'Mania' },
    { key: 'D', t: 'Adjustment disorder' },
  ].map(option => option.key === correctKey
    ? { ...option, c: true }
    : {
      ...option,
      trap: {
        name: `${option.key} discriminator`,
        note: `${option.t} does not match the defining fictional pattern.`,
      },
    });

  return {
    id,
    status,
    type: 'sba',
    category: 'mood',
    competency: ['dx'],
    difficulty: 2,
    pages: ['t_mood.md'],
    link: { label: 'Open Mood Disorders', href: '?page=t_mood.md' },
    stem,
    options,
    why: 'The sustained fictional syndrome supports the keyed diagnosis.',
    pearl: 'Name the syndrome before choosing an answer.',
    evidence: 't_mood.md — fictional syndrome discriminator.',
  };
}

function makeBank(items) {
  return {
    _note: 'Preserve this governed note.',
    version: 1,
    extension: { owner: 'faculty', flags: ['preserve'] },
    items,
  };
}

function entryFor(item, acknowledgedWarnings) {
  const entry = { id: item.id, revision: itemRevision(item) };
  if (acknowledgedWarnings !== undefined) {
    entry.acknowledgedWarnings = acknowledgedWarnings;
  }
  return entry;
}

function clone(value) {
  return structuredClone(value);
}

function draftRequest() {
  const item = validItem();
  const editedItem = clone(item);
  editedItem.stem = 'A revised fictional presentation has persistent sadness. What diagnosis best fits?';
  return {
    bank: makeBank([item]),
    manifestPages: [...manifestPages],
    id: item.id,
    baseRevision: itemRevision(item),
    editedItem,
  };
}

function attestationRequest() {
  const item = validItem();
  return {
    bank: makeBank([item]),
    manifestPages: [...manifestPages],
    entries: [entryFor(item)],
    confirmations: { ...confirmed },
  };
}

function accessorProperty(base, key, value) {
  let reads = 0;
  const container = { ...base };
  delete container[key];
  Object.defineProperty(container, key, {
    enumerable: true,
    get() {
      reads += 1;
      return value;
    },
  });
  return { value: container, reads: () => reads };
}

function malformedArrayCases(valueFactory) {
  return [
    ['sparse', () => {
      const value = [];
      value.length = 1;
      return { value, reads: () => 0 };
    }],
    ['accessor', () => {
      let reads = 0;
      const value = [];
      Object.defineProperty(value, '0', {
        enumerable: true,
        get() {
          reads += 1;
          return valueFactory();
        },
      });
      return { value, reads: () => reads };
    }],
    ['custom-property', () => {
      const value = [valueFactory()];
      value.extra = 'not JSON array data';
      return { value, reads: () => 0 };
    }],
  ];
}

function expectActionError(call, {
  code,
  status,
  issueCodes,
}) {
  let caught;
  assert.throws(call, error => {
    caught = error;
    assert.ok(error instanceof QbankActionError, `expected QbankActionError, received ${error?.constructor?.name}`);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.ok(Array.isArray(error.issues));
    if (issueCodes) {
      assert.deepEqual(error.issues.map(issue => issue.code), issueCodes);
    }
    return true;
  });
  return caught;
}

test('QbankActionError exposes stable defaults and supplied issues', () => {
  const defaultError = new QbankActionError('qbank.example', 'Example failure.');
  assert.equal(defaultError.message, 'Example failure.');
  assert.equal(defaultError.code, 'qbank.example');
  assert.equal(defaultError.status, 422);
  assert.deepEqual(defaultError.issues, []);

  const issues = [{ code: 'required.stem', field: 'stem', message: 'stem cannot be empty.' }];
  const supplied = new QbankActionError('qbank.blocked_draft', 'Blocked.', 409, issues);
  assert.equal(supplied.status, 409);
  assert.deepEqual(supplied.issues, issues);
});

test('itemRevision hashes canonical nested JSON without mutating it', () => {
  const item = { b: [{ d: 4, c: 3 }], a: { z: 1, y: 2 } };
  const before = clone(item);
  const reordered = { a: { y: 2, z: 1 }, b: [{ c: 3, d: 4 }] };

  assert.equal(itemRevision(item), 'f6bb1d6bb4800c4ce3397603584fb39bd2f3ce7a8e9192e6579f5ce73d71e790');
  assert.equal(itemRevision(reordered), itemRevision(item));
  assert.match(itemRevision(item), /^[a-f0-9]{64}$/);
  assert.deepEqual(item, before);
});

test('itemRevision preserves array order in the canonical revision', () => {
  assert.notEqual(itemRevision({ values: ['A', 'B'] }), itemRevision({ values: ['B', 'A'] }));
});

test('itemRevision includes status, reserved, and unknown item fields', () => {
  const item = validItem();
  assert.notEqual(itemRevision(item), itemRevision({ ...item, status: 'attested' }));
  assert.notEqual(itemRevision(item), itemRevision({ ...item, v2: { case: { step: 1 } } }));
  assert.notEqual(itemRevision(item), itemRevision({ ...item, serverOnly: { audit: true } }));
});

test('itemRevision converts malformed values into stable action errors', () => {
  const circular = { id: 'qb_moo_900' };
  circular.self = circular;
  const sparse = [];
  sparse.length = 1;
  const accessor = [];
  Object.defineProperty(accessor, '0', { enumerable: true, get: () => 'hidden' });
  const extraProperty = ['visible'];
  extraProperty.hidden = 'not JSON array data';
  const hiddenObjectProperty = { visible: true };
  Object.defineProperty(hiddenObjectProperty, 'hidden', { value: 'not JSON object data' });
  for (const value of [
    undefined,
    null,
    7,
    [],
    circular,
    { value: 1n },
    { value: undefined },
    { value: Number.NaN },
    { values: sparse },
    { values: accessor },
    { values: extraProperty },
    { value: hiddenObjectProperty },
  ]) {
    expectActionError(() => itemRevision(value), {
      code: 'qbank.invalid_input',
      status: 400,
    });
  }
});

test('prepareDraftSave preserves governed data, forces draft, and never mutates inputs', () => {
  const original = validItem({ status: 'attested' });
  original.v2 = { case: { caseId: 'case-1', step: 1, of: 2 } };
  original.serverOnly = { history: ['keep'] };
  const unrelated = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const bank = makeBank([original, unrelated]);
  const before = clone(bank);
  const editedItem = clone(original);
  editedItem.id = 'qb_moo_999';
  editedItem.status = 'attested';
  editedItem.stem = 'A revised fictional patient has sustained low mood and loss of interest. What diagnosis best fits?';
  editedItem.v2 = { overwritten: true };
  editedItem.serverOnly = { history: ['replace'] };
  editedItem.retired = true;

  const result = prepareDraftSave({
    bank,
    manifestPages,
    id: original.id,
    baseRevision: itemRevision(original),
    editedItem,
  });

  assert.deepEqual(bank, before);
  assert.notStrictEqual(result.bank, bank);
  assert.notStrictEqual(result.bank.items, bank.items);
  assert.deepEqual(Object.keys(result.bank), Object.keys(bank));
  assert.deepEqual(result.bank._note, bank._note);
  assert.deepEqual(result.bank.version, bank.version);
  assert.deepEqual(result.bank.extension, bank.extension);
  assert.deepEqual(result.bank.items[1], unrelated);
  assert.equal(JSON.stringify(result.bank.extension), JSON.stringify(bank.extension));
  assert.equal(JSON.stringify(result.bank.items[1]), JSON.stringify(unrelated));
  assert.equal(result.item, result.bank.items[0]);
  assert.equal(result.item.id, original.id);
  assert.equal(result.item.status, 'draft');
  assert.equal(result.item.retired, undefined);
  assert.deepEqual(result.item.v2, original.v2);
  assert.deepEqual(result.item.serverOnly, original.serverOnly);
  assert.deepEqual(result.changedFields, ['stem']);
  assert.equal(result.assessment.gate, 'ready');
});

test('prepareDraftSave rejects governed-only changes as a no-op', () => {
  const original = validItem({ status: 'attested' });
  original.v2 = { keep: true };
  const bank = makeBank([original]);
  const before = clone(bank);
  const editedItem = clone(original);
  editedItem.id = 'qb_moo_999';
  editedItem.status = 'draft';
  editedItem.v2 = { keep: false };
  editedItem.retired = true;
  editedItem.unknown = 'client supplied';

  expectActionError(() => prepareDraftSave({
    bank,
    manifestPages,
    id: original.id,
    baseRevision: itemRevision(original),
    editedItem,
  }), {
    code: 'qbank.no_changes',
    status: 422,
  });
  assert.deepEqual(bank, before);
});

test('prepareDraftSave allows a warning draft and returns its current warning', () => {
  const original = validItem();
  const bank = makeBank([original]);
  const editedItem = clone(original);
  editedItem.stem = 'A fictional patient has sustained low mood. Which diagnosis is NOT most likely?';

  const result = prepareDraftSave({
    bank,
    manifestPages,
    id: original.id,
    baseRevision: itemRevision(original),
    editedItem,
  });

  assert.equal(result.assessment.gate, 'warning');
  assert.deepEqual(result.assessment.warnings.map(issue => issue.code), ['stem.negative_lead_in']);
  assert.deepEqual(result.changedFields, ['stem']);
});

test('prepareDraftSave rejects structurally blocked edits with rule issues', () => {
  const original = validItem();
  const bank = makeBank([original]);
  const before = clone(bank);
  const editedItem = clone(original);
  editedItem.evidence = ' ';

  expectActionError(() => prepareDraftSave({
    bank,
    manifestPages,
    id: original.id,
    baseRevision: itemRevision(original),
    editedItem,
  }), {
    code: 'qbank.blocked_draft',
    status: 422,
    issueCodes: ['required.evidence'],
  });
  assert.deepEqual(bank, before);
});

test('prepareDraftSave rejects a stale revision without mutating the bank', () => {
  const original = validItem();
  const bank = makeBank([original]);
  const before = clone(bank);
  const editedItem = clone(original);
  editedItem.stem = 'A changed fictional vignette. What diagnosis is most likely?';

  expectActionError(() => prepareDraftSave({
    bank,
    manifestPages,
    id: original.id,
    baseRevision: itemRevision({ ...original, stem: 'Older version.' }),
    editedItem,
  }), {
    code: 'qbank.conflict',
    status: 409,
  });
  assert.deepEqual(bank, before);
});

test('prepareDraftSave rejects unknown and retired IDs rather than silently skipping them', () => {
  const retired = validItem();
  retired.retired = true;
  retired.retiredReason = 'Superseded.';
  const bank = makeBank([retired]);
  const before = clone(bank);

  for (const id of ['qb_moo_900', 'qb_moo_999']) {
    expectActionError(() => prepareDraftSave({
      bank,
      manifestPages,
      id,
      baseRevision: itemRevision(retired),
      editedItem: retired,
    }), {
      code: 'qbank.unknown_item',
      status: 404,
    });
  }
  assert.deepEqual(bank, before);
});

test('actions reject malformed retirement metadata instead of treating it as active', () => {
  for (const malformed of [
    { retired: 'true' },
    { retired: 1 },
    { retired: null },
    { retiredReason: { text: 'not a string' } },
  ]) {
    const item = Object.assign(validItem(), malformed);
    const bank = makeBank([item]);
    const editedItem = clone(item);
    editedItem.stem = 'A revised fictional presentation is described. What diagnosis is most likely?';

    expectActionError(() => prepareDraftSave({
      bank,
      manifestPages,
      id: item.id,
      baseRevision: itemRevision(item),
      editedItem,
    }), {
      code: 'qbank.invalid_input',
      status: 400,
    });
    expectActionError(() => prepareAttestation({
      bank,
      manifestPages,
      entries: [entryFor(item)],
      confirmations: confirmed,
    }), {
      code: 'qbank.invalid_input',
      status: 400,
    });
  }
});

test('prepareDraftSave rejects an active and retired bank-item ID collision', () => {
  const active = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const retired = validItem({ id: active.id, stem: stems[1] });
  retired.retired = true;
  retired.retiredReason = 'Superseded synthetic fixture.';
  const bank = makeBank([active, retired]);
  const before = clone(bank);
  const editedItem = clone(active);
  editedItem.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  expectActionError(() => prepareDraftSave({
    bank,
    manifestPages,
    id: active.id,
    baseRevision: itemRevision(active),
    editedItem,
  }), {
    code: 'qbank.duplicate_item',
    status: 409,
  });
  assert.deepEqual(bank, before);
});

test('prepareAttestation rejects an active and retired bank-item ID collision', () => {
  const active = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const retired = validItem({ id: active.id, stem: stems[1] });
  retired.retired = true;
  retired.retiredReason = 'Superseded synthetic fixture.';
  const bank = makeBank([active, retired]);
  const before = clone(bank);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(active)],
    confirmations: confirmed,
  }), {
    code: 'qbank.duplicate_item',
    status: 409,
  });
  assert.deepEqual(bank, before);
});

test('prepareDraftSave rejects duplicate IDs on unrelated bank items', () => {
  const target = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const duplicate = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const bank = makeBank([target, duplicate, clone(duplicate)]);
  const before = clone(bank);
  const editedItem = clone(target);
  editedItem.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  expectActionError(() => prepareDraftSave({
    bank,
    manifestPages,
    id: target.id,
    baseRevision: itemRevision(target),
    editedItem,
  }), {
    code: 'qbank.duplicate_item',
    status: 409,
  });
  assert.deepEqual(bank, before);
});

test('prepareAttestation rejects duplicate IDs on unrelated bank items', () => {
  const target = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const duplicate = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const bank = makeBank([target, duplicate, clone(duplicate)]);
  const before = clone(bank);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(target)],
    confirmations: confirmed,
  }), {
    code: 'qbank.duplicate_item',
    status: 409,
  });
  assert.deepEqual(bank, before);
});

test('prepareDraftSave requires exactly one active matching item', () => {
  const original = validItem();
  const duplicate = clone(original);
  const bank = makeBank([original, duplicate]);
  const editedItem = clone(original);
  editedItem.stem = 'A revised fictional case has persistent sadness. What diagnosis is most likely?';

  expectActionError(() => prepareDraftSave({
    bank,
    manifestPages,
    id: original.id,
    baseRevision: itemRevision(original),
    editedItem,
  }), {
    code: 'qbank.duplicate_item',
    status: 409,
  });
});

test('prepareDraftSave rejects malformed JSON-like public inputs with action errors', () => {
  const item = validItem();
  const bank = makeBank([item]);
  const revision = itemRevision(item);
  const editedItem = clone(item);
  editedItem.stem = 'A revised fictional syndrome is present. What diagnosis is most likely?';
  const calls = [
    () => prepareDraftSave(null),
    () => prepareDraftSave({ bank: null, manifestPages, id: item.id, baseRevision: revision, editedItem }),
    () => prepareDraftSave({ bank: {}, manifestPages, id: item.id, baseRevision: revision, editedItem }),
    () => prepareDraftSave({ bank: { items: [null] }, manifestPages, id: item.id, baseRevision: revision, editedItem }),
    () => prepareDraftSave({ bank, manifestPages: 't_mood.md', id: item.id, baseRevision: revision, editedItem }),
    () => prepareDraftSave({ bank, manifestPages: [], id: item.id, baseRevision: revision, editedItem }),
    () => prepareDraftSave({ bank, manifestPages: [null], id: item.id, baseRevision: revision, editedItem }),
    () => prepareDraftSave({ bank, manifestPages, id: null, baseRevision: revision, editedItem }),
    () => prepareDraftSave({ bank, manifestPages, id: item.id, baseRevision: null, editedItem }),
    () => prepareDraftSave({ bank, manifestPages, id: item.id, baseRevision: revision, editedItem: null }),
    () => prepareDraftSave({ bank: { ...bank, extension: () => 'not JSON' }, manifestPages, id: item.id, baseRevision: revision, editedItem }),
  ];

  for (const call of calls) {
    expectActionError(call, { code: 'qbank.invalid_input', status: 400 });
  }
});

test('prepareAttestation atomically attests a balanced green batch without mutating inputs', () => {
  const selected = [
    validItem({ id: 'qb_moo_900', correctKey: 'A', stem: stems[0] }),
    validItem({ id: 'qb_moo_901', correctKey: 'A', stem: stems[1] }),
    validItem({ id: 'qb_moo_902', correctKey: 'B', stem: stems[2] }),
    validItem({ id: 'qb_moo_903', correctKey: 'C', stem: stems[3] }),
  ];
  selected[0].v2 = { case: { caseId: 'preserve-me' } };
  const unrelated = validItem({ id: 'qb_moo_904', status: 'attested', correctKey: 'D', stem: stems[4] });
  const bank = makeBank([...selected, unrelated]);
  const before = clone(bank);

  const result = prepareAttestation({
    bank,
    manifestPages,
    entries: selected.map(item => entryFor(item)),
    confirmations: confirmed,
  });

  assert.deepEqual(bank, before);
  assert.notStrictEqual(result.bank, bank);
  assert.deepEqual(result.ids, selected.map(item => item.id));
  assert.deepEqual(result.bank.items.slice(0, 4).map(item => item.status), ['attested', 'attested', 'attested', 'attested']);
  assert.deepEqual(result.bank.items[0].v2, selected[0].v2);
  assert.deepEqual(result.bank.items[4], unrelated);
  assert.equal(result.bank._note, bank._note);
  assert.equal(result.bank.version, bank.version);
  assert.deepEqual(result.bank.extension, bank.extension);
  assert.deepEqual(Object.keys(result.bank), Object.keys(bank));
  const expectedSerializedBank = clone(bank);
  for (const item of expectedSerializedBank.items.slice(0, 4)) item.status = 'attested';
  assert.equal(JSON.stringify(result.bank), JSON.stringify(expectedSerializedBank));
});

test('prepareAttestation cannot change aliased top-level metadata while changing item status', () => {
  const item = validItem();
  const bank = makeBank([item]);
  bank.extension = item;
  const before = clone(bank);

  const result = prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(item)],
    confirmations: confirmed,
  });

  assert.deepEqual(bank, before);
  assert.equal(result.bank.items[0].status, 'attested');
  assert.equal(result.bank.extension.status, 'draft');
});

test('prepareAttestation permits individual and small green selections', () => {
  const first = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const second = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const bank = makeBank([first, second]);

  const one = prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(first)],
    confirmations: confirmed,
  });
  assert.deepEqual(one.ids, [first.id]);

  const two = prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(first), entryFor(second)],
    confirmations: confirmed,
  });
  assert.deepEqual(two.ids, [first.id, second.id]);
});

test('prepareAttestation requires every human confirmation to be literal true', () => {
  const item = validItem();
  const bank = makeBank([item]);
  for (const confirmations of [
    undefined,
    {},
    { ...confirmed, clinical: false },
    { ...confirmed, evidence: 1 },
    { ...confirmed, originalityAndNoPhi: 'true' },
  ]) {
    expectActionError(() => prepareAttestation({
      bank,
      manifestPages,
      entries: [entryFor(item)],
      confirmations,
    }), {
      code: 'attest.confirmations_required',
      status: 422,
    });
  }
});

test('prepareAttestation accepts one yellow item only with the exact current warning set', () => {
  const item = validItem({
    stem: 'A fictional patient has sustained low mood. Which diagnosis is NOT most likely?',
  });
  item.options[3].t = 'None of the above';
  const bank = makeBank([item]);
  const currentWarnings = ['stem.negative_lead_in', 'options.cueing'];

  for (const acknowledgedWarnings of [
    undefined,
    [],
    ['stem.negative_lead_in'],
    [...currentWarnings, 'stale.warning'],
    ['stem.negative_lead_in', 'stem.negative_lead_in', 'options.cueing'],
  ]) {
    expectActionError(() => prepareAttestation({
      bank,
      manifestPages,
      entries: [entryFor(item, acknowledgedWarnings)],
      confirmations: confirmed,
    }), {
      code: 'attest.warning_acknowledgement_required',
      status: 422,
      issueCodes: currentWarnings,
    });
  }

  const result = prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(item, [...currentWarnings].reverse())],
    confirmations: confirmed,
  });
  assert.deepEqual(result.ids, [item.id]);
  assert.equal(result.bank.items[0].status, 'attested');
});

test('prepareAttestation recomputes contextual warnings against unrelated current items', () => {
  const item = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const nearDuplicate = validItem({
    id: 'qb_moo_901',
    stem: `${stems[0].slice(0, -1)} today?`,
  });
  const bank = makeBank([item, nearDuplicate]);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(item)],
    confirmations: confirmed,
  }), {
    code: 'attest.warning_acknowledgement_required',
    status: 422,
    issueCodes: ['stem.near_duplicate'],
  });

  const result = prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(item, ['stem.near_duplicate'])],
    confirmations: confirmed,
  });
  assert.deepEqual(result.ids, [item.id]);
});

test('prepareAttestation rejects yellow items in a batch even when warnings are acknowledged', () => {
  const warning = validItem({
    id: 'qb_moo_900',
    stem: 'A fictional patient has sustained low mood. Which diagnosis is NOT most likely?',
  });
  const ready = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const bank = makeBank([warning, ready]);
  const before = clone(bank);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(warning, ['stem.negative_lead_in']), entryFor(ready)],
    confirmations: confirmed,
  }), {
    code: 'attest.warning_individual_only',
    status: 422,
    issueCodes: ['stem.negative_lead_in'],
  });
  assert.deepEqual(bank, before);
});

test('prepareAttestation rejects blocked items and returns their rule issues', () => {
  const item = validItem();
  item.evidence = '';
  const bank = makeBank([item]);
  const before = clone(bank);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(item)],
    confirmations: confirmed,
  }), {
    code: 'attest.blocked',
    status: 422,
    issueCodes: ['required.evidence'],
  });
  assert.deepEqual(bank, before);
});

test('prepareAttestation requires current draft revisions', () => {
  const draft = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const attested = validItem({ id: 'qb_moo_901', status: 'attested', stem: stems[1] });
  const bank = makeBank([draft, attested]);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [{ id: draft.id, revision: itemRevision({ ...draft, stem: 'Stale stem.' }) }],
    confirmations: confirmed,
  }), {
    code: 'qbank.conflict',
    status: 409,
  });

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(attested)],
    confirmations: confirmed,
  }), {
    code: 'attest.not_draft',
    status: 422,
  });
});

test('prepareAttestation rejects unknown, retired, and duplicate selections without silent skips', () => {
  const ready = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const retired = validItem({ id: 'qb_moo_901', stem: stems[1] });
  retired.retired = true;
  const bank = makeBank([ready, retired]);
  const before = clone(bank);

  for (const entry of [
    { id: 'qb_moo_999', revision: itemRevision(ready) },
    entryFor(retired),
  ]) {
    expectActionError(() => prepareAttestation({
      bank,
      manifestPages,
      entries: [entry],
      confirmations: confirmed,
    }), {
      code: 'qbank.unknown_item',
      status: 404,
    });
  }

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(ready), entryFor(ready)],
    confirmations: confirmed,
  }), {
    code: 'attest.duplicate_item',
    status: 422,
  });
  assert.deepEqual(bank, before);
});

test('prepareAttestation validates the whole mixed selection before changing any status', () => {
  const first = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const second = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const bank = makeBank([first, second]);
  const before = clone(bank);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [
      entryFor(first),
      { id: second.id, revision: itemRevision({ ...second, stem: 'An older revision.' }) },
    ],
    confirmations: confirmed,
  }), {
    code: 'qbank.conflict',
    status: 409,
  });
  assert.deepEqual(bank, before);
  assert.deepEqual(bank.items.map(item => item.status), ['draft', 'draft']);
});

test('prepareAttestation keeps a valid first item unchanged when a later item is red', () => {
  const first = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const blocked = validItem({ id: 'qb_moo_901', stem: stems[1] });
  blocked.evidence = '';
  const bank = makeBank([first, blocked]);
  const before = clone(bank);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: [entryFor(first), entryFor(blocked)],
    confirmations: confirmed,
  }), {
    code: 'attest.blocked',
    status: 422,
    issueCodes: ['required.evidence'],
  });
  assert.deepEqual(bank, before);
  assert.equal(bank.items[0].status, 'draft');
});

test('prepareAttestation enforces the all-A batch answer-key balance gate', () => {
  const items = stems.slice(0, 4).map((stem, index) => validItem({
    id: `qb_moo_90${index}`,
    correctKey: 'A',
    stem,
  }));
  const bank = makeBank(items);
  const before = clone(bank);

  expectActionError(() => prepareAttestation({
    bank,
    manifestPages,
    entries: items.map(item => entryFor(item)),
    confirmations: confirmed,
  }), {
    code: 'attest.batch_blocked',
    status: 422,
    issueCodes: ['batch.answer_key_balance'],
  });
  assert.deepEqual(bank, before);
});

test('prepareAttestation rejects an empty selection', () => {
  expectActionError(() => prepareAttestation({
    bank: makeBank([]),
    manifestPages,
    entries: [],
    confirmations: confirmed,
  }), {
    code: 'attest.empty_selection',
    status: 422,
  });
});

test('prepareAttestation rejects malformed JSON-like public inputs with action errors', () => {
  const item = validItem();
  const bank = makeBank([item]);
  const entry = entryFor(item);
  const calls = [
    () => prepareAttestation(null),
    () => prepareAttestation({ bank: null, manifestPages, entries: [entry], confirmations: confirmed }),
    () => prepareAttestation({ bank: {}, manifestPages, entries: [entry], confirmations: confirmed }),
    () => prepareAttestation({ bank: { items: [null] }, manifestPages, entries: [entry], confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages: 't_mood.md', entries: [entry], confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages: [], entries: [entry], confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages: [null], entries: [entry], confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages, entries: null, confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages, entries: [null], confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages, entries: [{ ...entry, id: 7 }], confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages, entries: [{ ...entry, revision: null }], confirmations: confirmed }),
    () => prepareAttestation({ bank, manifestPages, entries: [{ ...entry, acknowledgedWarnings: 'stem.lead_in' }], confirmations: confirmed }),
    () => prepareAttestation({ bank: { ...bank, extension: () => 'not JSON' }, manifestPages, entries: [entry], confirmations: confirmed }),
  ];

  for (const call of calls) {
    expectActionError(call, { code: 'qbank.invalid_input', status: 400 });
  }
});

test('prepareDraftSave validates the top-level request before reading an accessor', () => {
  const request = draftRequest();
  const wrapped = accessorProperty(request, 'bank', request.bank);

  expectActionError(() => prepareDraftSave(wrapped.value), {
    code: 'qbank.invalid_input',
    status: 400,
  });
  assert.equal(wrapped.reads(), 0);
});

test('prepareAttestation validates the top-level request before reading an accessor', () => {
  const request = attestationRequest();
  const wrapped = accessorProperty(request, 'entries', request.entries);

  expectActionError(() => prepareAttestation(wrapped.value), {
    code: 'qbank.invalid_input',
    status: 400,
  });
  assert.equal(wrapped.reads(), 0);
});

test('prepareDraftSave validates the bank before reading its items property', () => {
  const request = draftRequest();
  const wrapped = accessorProperty(
    { _note: request.bank._note, version: request.bank.version, extension: request.bank.extension },
    'items',
    request.bank.items,
  );
  request.bank = wrapped.value;

  expectActionError(() => prepareDraftSave(request), {
    code: 'qbank.invalid_input',
    status: 400,
  });
  assert.equal(wrapped.reads(), 0);
});

for (const [shape, create] of malformedArrayCases(() => 't_mood.md')) {
  test(`prepareDraftSave rejects a ${shape} manifest array before reading it`, () => {
    const request = draftRequest();
    const malformed = create();
    request.manifestPages = malformed.value;

    expectActionError(() => prepareDraftSave(request), {
      code: 'qbank.invalid_input',
      status: 400,
    });
    assert.equal(malformed.reads(), 0);
  });

  test(`prepareAttestation rejects a ${shape} manifest array before reading it`, () => {
    const request = attestationRequest();
    const malformed = create();
    request.manifestPages = malformed.value;

    expectActionError(() => prepareAttestation(request), {
      code: 'qbank.invalid_input',
      status: 400,
    });
    assert.equal(malformed.reads(), 0);
  });
}

for (const [shape, create] of malformedArrayCases(() => entryFor(validItem()))) {
  test(`prepareAttestation rejects a ${shape} entries array before reading it`, () => {
    const request = attestationRequest();
    const malformed = create();
    request.entries = malformed.value;

    expectActionError(() => prepareAttestation(request), {
      code: 'qbank.invalid_input',
      status: 400,
    });
    assert.equal(malformed.reads(), 0);
  });
}

for (const [shape, create] of [
  ['accessor', () => accessorProperty({ evidence: true, originalityAndNoPhi: true }, 'clinical', true)],
  ['non-enumerable property', () => {
    const value = { ...confirmed };
    Object.defineProperty(value, 'extra', { value: true });
    return { value, reads: () => 0 };
  }],
  ['symbol property', () => {
    const value = { ...confirmed };
    value[Symbol('extra')] = true;
    return { value, reads: () => 0 };
  }],
]) {
  test(`prepareAttestation rejects confirmations with a ${shape}`, () => {
    const request = attestationRequest();
    const malformed = create();
    request.confirmations = malformed.value;

    expectActionError(() => prepareAttestation(request), {
      code: 'qbank.invalid_input',
      status: 400,
    });
    assert.equal(malformed.reads(), 0);
  });
}

test('prepareAttestation validates each entry before reading an accessor property', () => {
  const request = attestationRequest();
  const original = request.entries[0];
  const wrapped = accessorProperty({ revision: original.revision }, 'id', original.id);
  request.entries = [wrapped.value];

  expectActionError(() => prepareAttestation(request), {
    code: 'qbank.invalid_input',
    status: 400,
  });
  assert.equal(wrapped.reads(), 0);
});

test('public action boundaries safely wrap hostile thrown values', () => {
  const hostileInput = () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    const input = {};
    Object.defineProperty(input, 'bank', {
      enumerable: true,
      get() { throw revocable.proxy; },
    });
    return input;
  };

  for (const call of [
    () => prepareDraftSave(hostileInput()),
    () => prepareAttestation(hostileInput()),
  ]) {
    expectActionError(call, { code: 'qbank.invalid_input', status: 400 });
  }
});
