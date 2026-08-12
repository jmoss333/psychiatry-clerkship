import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreviewRequest,
  buildExternalReviewUrl,
  createReviewToken,
  deriveAttestationEligibility,
  deriveReviewCounts,
  filterReviewItems,
  isValidReopenReason,
  matchesPreviewStatus,
  normalizeReviewItems,
  normalizeStudentBase,
  reviewedRevisionMatches,
} from '../faculty-console/review-model.mjs';

const REVISION = 'a'.repeat(64);
const TOKEN = '0123456789abcdef0123456789abcdef';

const server = {
  items: [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
  ],
  qbank: [{
    id: 'qb_moo_902', stem: 'A fictional patient has low mood.', category: 'mood',
    evidence: 't_mood.md - syndrome discriminator', pages: ['t_mood.md'],
    difficulty: 2, status: 'draft', revision: REVISION,
    assessment: { gate: 'ready', blockers: [], warnings: [] },
  }],
};

const READY_ASSESSMENT = Object.freeze({
  gate: 'ready',
  blockers: [],
  warnings: [],
});
const WARNING_ASSESSMENT = Object.freeze({
  gate: 'warning',
  blockers: [],
  warnings: [{ code: 'stem.weak_lead_in' }],
});
const BLOCKED_ASSESSMENT = Object.freeze({
  gate: 'blocked',
  blockers: [{ code: 'required.evidence' }],
  warnings: [],
});

const fullServerFixture = {
  items: server.items,
  qbank: [
    ...server.qbank,
    {
      id: 'qb_moo_903', stem: 'A fictional patient has a warning-level draft.', category: 'mood',
      evidence: 't_mood.md - warning discriminator', pages: ['t_mood.md'],
      difficulty: 3, status: 'draft', revision: 'b'.repeat(64),
      assessment: WARNING_ASSESSMENT,
    },
    {
      id: 'qb_moo_904', stem: 'A fictional patient has an attested question.', category: 'mood',
      evidence: 't_mood.md - attested discriminator', pages: ['t_mood.md'],
      difficulty: 2, status: 'attested', revision: 'c'.repeat(64),
      assessment: READY_ASSESSMENT,
    },
  ],
};

const CONFIRMATIONS = Object.freeze({
  clinical: true,
  evidence: true,
  originalityAndNoPhi: true,
});

function contentContext(item, overrides = {}) {
  return {
    item,
    previewStatus: 'ready',
    completeItemReviewed: true,
    separateTabReviewed: false,
    contentChecks: { accuracy: true, interactions: true },
    ...overrides,
  };
}

function questionContext(item, overrides = {}) {
  return {
    item,
    assessment: READY_ASSESSMENT,
    dirty: false,
    previewStatus: 'ready',
    liveReviewed: true,
    retryAttempted: false,
    liveUnavailableAcknowledged: false,
    reviewedRevision: item.revision,
    warningAcks: new Set(),
    confirmations: CONFIRMATIONS,
    ...overrides,
  };
}

test('normalizes all review surfaces with collision-proof keys', () => {
  const items = normalizeReviewItems(server);
  assert.deepEqual(items.map(item => item.key), [
    'page:t_mood.md', 'tool:mse.html', 'question:qb_moo_902',
  ]);
  assert.deepEqual(items.map(item => item.completion), [
    'needs-review', 'complete', 'needs-review',
  ]);
  assert.deepEqual(Object.keys(items[0]), [
    'key', 'type', 'identity', 'title', 'savedStatus', 'completion',
    'revision', 'gate', 'risk', 'searchText', 'record',
  ]);
  assert.deepEqual(deriveReviewCounts(items), {
    total: 3, needsReview: 2, complete: 1, page: 1, tool: 1, question: 1,
  });
});

test('the complete fixture retains Ready, Warning, and attested question state', () => {
  const items = normalizeReviewItems(fullServerFixture);
  assert.deepEqual(items.map(item => item.key), [
    'page:t_mood.md',
    'tool:mse.html',
    'question:qb_moo_902',
    'question:qb_moo_903',
    'question:qb_moo_904',
  ]);
  assert.deepEqual(items.filter(item => item.type === 'question').map(item => ({
    key: item.key,
    gate: item.gate,
    completion: item.completion,
  })), [
    { key: 'question:qb_moo_902', gate: 'ready', completion: 'needs-review' },
    { key: 'question:qb_moo_903', gate: 'warning', completion: 'needs-review' },
    { key: 'question:qb_moo_904', gate: 'ready', completion: 'complete' },
  ]);
});

test('shared search and filters retain question-only dimensions', () => {
  const items = normalizeReviewItems(server);
  assert.deepEqual(filterReviewItems(items, {
    search: 'syndrome', type: 'all', status: 'all',
    category: 'all', gate: 'all', difficulty: 'all',
  }).map(item => item.key), ['question:qb_moo_902']);
  assert.deepEqual(filterReviewItems(items, {
    search: '', type: 'page', status: 'needs-review',
    category: 'mood', gate: 'blocked', difficulty: '3',
  }).map(item => item.key), ['page:t_mood.md']);
});

test('question-only filters apply to questions without hiding content surfaces', () => {
  const items = normalizeReviewItems(fullServerFixture);
  assert.deepEqual(filterReviewItems(items, {
    category: 'mood', gate: 'warning', difficulty: '3',
  }).map(item => item.key), [
    'page:t_mood.md', 'tool:mse.html', 'question:qb_moo_903',
  ]);
});

test('creates a lowercase 128-bit review token through the supplied crypto interface', () => {
  const cryptoImpl = {
    getRandomValues(bytes) {
      assert.ok(bytes instanceof Uint8Array);
      assert.equal(bytes.length, 16);
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    },
  };
  assert.equal(createReviewToken(cryptoImpl), '000102030405060708090a0b0c0d0e0f');
  assert.throws(() => createReviewToken(), /Secure random values are unavailable/);
  assert.throws(() => createReviewToken({ getRandomValues: true }), /Secure random values are unavailable/);
});

test('builds only configured public learner routes', () => {
  assert.deepEqual(normalizeStudentBase('https://students.example/?old=1#fragment'), {
    href: 'https://students.example/', origin: 'https://students.example',
  });
  const [page, tool, question] = normalizeReviewItems(server);
  assert.equal(new URL(buildPreviewRequest({
    studentBase: 'https://students.example/', item: page, reviewToken: TOKEN,
  }).url).search, `?page=t_mood.md&reviewKey=page%3At_mood.md&reviewToken=${TOKEN}`);
  assert.equal(new URL(buildPreviewRequest({
    studentBase: 'https://students.example/', item: tool, reviewToken: TOKEN,
  }).url).search, `?tool=mse.html&reviewKey=tool%3Amse.html&reviewToken=${TOKEN}`);
  assert.equal(new URL(buildPreviewRequest({
    studentBase: 'https://students.example/', item: question, reviewToken: TOKEN,
  }).url).search, `?tool=question-bank-practice.html&reviewItem=qb_moo_902&reviewKey=question%3Aqb_moo_902&reviewToken=${TOKEN}`);
  const external = new URL(buildExternalReviewUrl({
    studentBase: 'https://students.example/', item: page,
  }));
  assert.equal(external.search, '?page=t_mood.md');
  assert.equal(external.searchParams.has('reviewKey'), false);
  assert.equal(external.searchParams.has('reviewToken'), false);
  assert.throws(() => buildExternalReviewUrl({
    studentBase: 'https://students.example/', item: question,
  }));
  for (const studentBase of ['javascript:alert(1)', 'file:///tmp/site', 'https://user:pass@students.example/']) {
    assert.throws(() => buildPreviewRequest({ studentBase, item: page, reviewToken: TOKEN }));
  }
});

test('unsafe bases, malformed tokens, blank identities, and unknown surfaces fail closed', () => {
  const page = normalizeReviewItems(server)[0];
  for (const studentBase of ['', '/relative', 'data:text/html,unsafe', 'ftp://students.example/']) {
    assert.throws(() => normalizeStudentBase(studentBase));
  }
  for (const reviewToken of ['', '0'.repeat(31), '0'.repeat(33), 'G'.repeat(32), 'x'.repeat(32)]) {
    assert.throws(() => buildPreviewRequest({
      studentBase: 'https://students.example/', item: page, reviewToken,
    }));
  }
  for (const item of [
    { ...page, identity: '' },
    { ...page, key: 'page:other.md' },
    { ...page, type: 'video', key: `video:${page.identity}` },
  ]) {
    assert.throws(() => buildPreviewRequest({
      studentBase: 'https://students.example/', item, reviewToken: TOKEN,
    }));
  }
});

test('preview routes reject whitespace-wrapped review tokens', () => {
  const page = normalizeReviewItems(server)[0];
  assert.throws(() => buildPreviewRequest({
    studentBase: 'https://students.example/',
    item: page,
    reviewToken: ` ${TOKEN} `,
  }), /Invalid preview request/);
});

test('preview routes reject whitespace-wrapped item identities', () => {
  const page = normalizeReviewItems(server)[0];
  assert.throws(() => buildPreviewRequest({
    studentBase: 'https://students.example/',
    item: { ...page, identity: ` ${page.identity} ` },
    reviewToken: TOKEN,
  }), /Invalid preview request/);
});

test('external routes reject whitespace-wrapped item identities', () => {
  const page = normalizeReviewItems(server)[0];
  assert.throws(() => buildExternalReviewUrl({
    studentBase: 'https://students.example/',
    item: { ...page, identity: ` ${page.identity} ` },
  }), /External review is available only for a valid page or tool/);
});

test('accepts only the exact current outer-frame status message', () => {
  const item = normalizeReviewItems(server)[0];
  const request = buildPreviewRequest({
    studentBase: 'https://students.example/', item, reviewToken: TOKEN,
  });
  const source = {};
  const good = {
    origin: 'https://students.example', source,
    data: {
      type: 'faculty-preview-status', reviewKey: item.key, reviewToken: TOKEN,
      status: 'ready', surface: 'page',
    },
  };
  assert.equal(matchesPreviewStatus(good, request, source), true);
  assert.equal(matchesPreviewStatus({ ...good, origin: 'https://evil.example' }, request, source), false);
  assert.equal(matchesPreviewStatus({ ...good, source: {} }, request, source), false);
  assert.equal(matchesPreviewStatus({ ...good, data: { ...good.data, reviewToken: 'f'.repeat(32) } }, request, source), false);
  assert.equal(matchesPreviewStatus({ ...good, data: { ...good.data, extra: 'reject' } }, request, source), false);
});

test('rejects stale, malformed, and wrong-surface preview messages', () => {
  const item = normalizeReviewItems(server)[0];
  const request = buildPreviewRequest({
    studentBase: 'https://students.example/', item, reviewToken: TOKEN,
  });
  const source = {};
  const data = {
    type: 'faculty-preview-status',
    reviewKey: item.key,
    reviewToken: TOKEN,
    status: 'ready',
    surface: 'page',
  };
  for (const candidate of [
    { ...data, type: 'faculty-preview-ready' },
    { ...data, reviewKey: 'page:other.md' },
    { ...data, status: 'protocol_unavailable' },
    { ...data, status: 'unknown' },
    { ...data, surface: 'tool' },
    null,
    [],
  ]) {
    assert.equal(matchesPreviewStatus({
      origin: request.origin,
      source,
      data: candidate,
    }, request, source), false);
  }
});

test('reviewed revisions match only the exact valid current question revision', () => {
  const [page, , question] = normalizeReviewItems(server);
  assert.equal(reviewedRevisionMatches(question, REVISION), true);
  assert.equal(reviewedRevisionMatches(question, 'b'.repeat(64)), false);
  assert.equal(reviewedRevisionMatches({ ...question, revision: 'A'.repeat(64) }, 'A'.repeat(64)), false);
  assert.equal(reviewedRevisionMatches(page, ''), false);
});

test('malformed server kinds, duplicate keys, and blank identities fail closed', () => {
  for (const malformed of [
    { items: [{ slug: 'bad.html', title: 'Bad', kind: 'video', status: 'unreviewed' }] },
    { items: [{ slug: ' ', title: 'Blank', kind: 'page', status: 'unreviewed' }] },
    { qbank: [{ id: ' ', status: 'draft' }] },
    { items: [
      { slug: 'same.md', kind: 'page', status: 'unreviewed' },
      { slug: 'same.md', kind: 'page', status: 'unreviewed' },
    ] },
    { qbank: [{ id: 'qb_moo_999' }, { id: 'qb_moo_999' }] },
  ]) {
    assert.throws(() => normalizeReviewItems(malformed));
  }
});

test('page and tool Ready review paths require exact faculty checks', () => {
  const [page, tool] = normalizeReviewItems({
    items: [
      { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
      { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
    ],
  });
  for (const item of [page, tool]) {
    assert.deepEqual(deriveAttestationEligibility(contentContext(item)), {
      eligible: true,
      blockers: [],
    });
    assert.deepEqual(deriveAttestationEligibility(contentContext(item, {
      completeItemReviewed: 'true',
    })), {
      eligible: false,
      blockers: ['review.complete_item_required'],
    });
  }
});

test('content external fallback requires a separate-tab review', () => {
  const page = normalizeReviewItems(server)[0];
  assert.deepEqual(deriveAttestationEligibility(contentContext(page, {
    previewStatus: 'not_found',
    completeItemReviewed: false,
    separateTabReviewed: false,
  })), {
    eligible: false,
    blockers: ['review.separate_tab_required'],
  });
  assert.deepEqual(deriveAttestationEligibility(contentContext(page, {
    previewStatus: 'not_found',
    completeItemReviewed: false,
    separateTabReviewed: true,
  })), {
    eligible: true,
    blockers: [],
  });
});

test('content review fails closed for loading, hostile, initial, and unknown preview states', () => {
  const page = normalizeReviewItems(server)[0];
  assert.deepEqual(deriveAttestationEligibility(contentContext(page, {
    previewStatus: 'loading',
  })), {
    eligible: false,
    blockers: ['preview.loading'],
  });
  for (const previewStatus of [undefined, null, '', 'initial', 'idle', 'unknown', '__proto__', '<img onerror=alert(1)>']) {
    assert.deepEqual(deriveAttestationEligibility(contentContext(page, {
      previewStatus,
    })), {
      eligible: false,
      blockers: ['preview.invalid_state'],
    });
  }
});

test('reviewed and unknown content statuses cannot be attested again', () => {
  for (const status of ['reviewed', 'pending']) {
    const item = normalizeReviewItems({
      items: [{ slug: `${status}.md`, kind: 'page', status }],
    })[0];
    assert.deepEqual(deriveAttestationEligibility(contentContext(item)), {
      eligible: false,
      blockers: ['content.status_not_attestable'],
    });
  }
});

test('content checks require literal booleans', () => {
  const page = normalizeReviewItems(server)[0];
  assert.deepEqual(deriveAttestationEligibility(contentContext(page, {
    contentChecks: { accuracy: 1, interactions: 'yes' },
  })), {
    eligible: false,
    blockers: ['content.resolve_checks_required'],
  });
});

test('question Ready and acknowledged Warning review paths are eligible', () => {
  const items = normalizeReviewItems(fullServerFixture);
  const readyQuestion = items.find(item => item.key === 'question:qb_moo_902');
  const warningQuestion = items.find(item => item.key === 'question:qb_moo_903');
  assert.deepEqual(deriveAttestationEligibility(questionContext(readyQuestion, {
    assessment: READY_ASSESSMENT,
  })), {
    eligible: true,
    blockers: [],
  });
  assert.deepEqual(deriveAttestationEligibility(questionContext(warningQuestion, {
    assessment: WARNING_ASSESSMENT,
    warningAcks: new Set(['stem.weak_lead_in']),
  })), {
    eligible: true,
    blockers: [],
  });
});

test('question not_found and post-Retry protocol-unavailable paths can be acknowledged', () => {
  const question = normalizeReviewItems(server)[2];
  for (const overrides of [
    {
      assessment: READY_ASSESSMENT,
      previewStatus: 'not_found',
      liveReviewed: false,
      liveUnavailableAcknowledged: true,
    },
    {
      assessment: READY_ASSESSMENT,
      previewStatus: 'protocol_unavailable',
      liveReviewed: false,
      retryAttempted: true,
      liveUnavailableAcknowledged: true,
    },
  ]) {
    assert.deepEqual(deriveAttestationEligibility(questionContext(question, overrides)), {
      eligible: true,
      blockers: [],
    });
  }
});

test('a first question preview failure requires Retry before fallback attestation', () => {
  const question = normalizeReviewItems(server)[2];
  assert.deepEqual(deriveAttestationEligibility(questionContext(question, {
    assessment: READY_ASSESSMENT,
    previewStatus: 'error',
    liveReviewed: false,
    retryAttempted: false,
    liveUnavailableAcknowledged: true,
  })), {
    eligible: false,
    blockers: ['preview.retry_required'],
  });
});

for (const [name, overrides, blockers] of [
  ['dirty edits', { dirty: true }, ['question.unsaved_changes']],
  ['stale Draft review', { reviewedRevision: 'd'.repeat(64) }, ['review.saved_revision_required']],
  ['incomplete Warning acknowledgements', {
    assessment: WARNING_ASSESSMENT,
    warningAcks: new Set(),
  }, ['question.warning_ack_required']],
  ['incomplete faculty confirmations', {
    confirmations: { ...CONFIRMATIONS, evidence: false },
  }, ['question.confirmations_required']],
  ['truthy non-boolean faculty confirmations', {
    confirmations: { clinical: 1, evidence: 'yes', originalityAndNoPhi: {} },
  }, ['question.confirmations_required']],
]) {
  test(`question review rejects ${name}`, () => {
    const question = normalizeReviewItems(server)[2];
    assert.deepEqual(deriveAttestationEligibility(questionContext(question, {
      assessment: READY_ASSESSMENT,
      ...overrides,
    })), {
      eligible: false,
      blockers,
    });
  });
}

test('fresh Blocked assessment overrides a normalized item that still says Ready', () => {
  const question = normalizeReviewItems(server)[2];
  assert.equal(question.gate, 'ready');
  assert.deepEqual(deriveAttestationEligibility(questionContext(question, {
    assessment: BLOCKED_ASSESSMENT,
  })), {
    eligible: false,
    blockers: ['question.gate_not_attestable', 'question.blocked'],
  });
});

for (const [name, assessment] of [
  ['null', null],
  ['malformed', { gate: 'ready', blockers: 'not-an-array', warnings: [] }],
  ['Ready with warnings', {
    gate: 'ready', blockers: [], warnings: [{ code: 'unexpected.warning' }],
  }],
  ['Warning without warnings', { gate: 'warning', blockers: [], warnings: [] }],
  ['Blocked without blockers', { gate: 'blocked', blockers: [], warnings: [] }],
  ['unknown-gate', { gate: 'review', blockers: [], warnings: [] }],
]) {
  test(`${name} fresh assessment fails closed`, () => {
    const question = normalizeReviewItems(server)[2];
    assert.deepEqual(deriveAttestationEligibility(questionContext(question, {
      assessment,
    })), {
      eligible: false,
      blockers: ['checks.runtime_failure', 'question.gate_not_attestable'],
    });
  });
}

test('non-draft questions cannot be attested again', () => {
  const question = normalizeReviewItems(fullServerFixture)
    .find(item => item.key === 'question:qb_moo_904');
  assert.deepEqual(deriveAttestationEligibility(questionContext(question, {
    assessment: READY_ASSESSMENT,
  })), {
    eligible: false,
    blockers: ['question.not_draft'],
  });
});

test('missing selection always fails closed', () => {
  assert.deepEqual(deriveAttestationEligibility(), {
    eligible: false,
    blockers: ['selection.missing'],
  });
});

test('a valid risk normalizes to exactly {kind, level}; a malformed one normalizes to null', () => {
  const withValidRisk = normalizeReviewItems({
    items: [{
      slug: 't_mood.md', kind: 'page', status: 'unreviewed',
      risk: { kind: 'clinical', level: 'high' },
    }],
  })[0];
  assert.deepEqual(withValidRisk.risk, { kind: 'clinical', level: 'high' });

  for (const risk of [
    undefined,
    null,
    { kind: 'not-a-real-kind', level: 'high' },
    { kind: 'clinical', level: 'severe' },
    { kind: 'clinical' },
    'clinical',
    ['clinical', 'high'],
  ]) {
    const item = normalizeReviewItems({
      items: [{ slug: 't_mood.md', kind: 'page', status: 'unreviewed', risk }],
    })[0];
    assert.equal(item.risk, null, JSON.stringify(risk));
  }

  // A question item never carries ledger risk — normalization does not invent one.
  const question = normalizeReviewItems(server)[2];
  assert.equal(question.risk, null);
});

test('search matches a content item by its risk kind, in both the raw and space-separated form', () => {
  const items = normalizeReviewItems({
    items: [{
      slug: 'rp-agitation.html', kind: 'tool', status: 'unreviewed',
      risk: { kind: 'local-policy', level: 'moderate' },
    }],
  });
  for (const search of ['local-policy', 'local policy', 'moderate']) {
    assert.deepEqual(filterReviewItems(items, { search }).map(item => item.key),
      ['tool:rp-agitation.html'], search);
  }
  assert.deepEqual(filterReviewItems(items, { search: 'clinical' }), []);
});

test('isValidReopenReason accepts 1-240 trimmed characters and rejects empty, whitespace-only, or oversized input', () => {
  assert.equal(isValidReopenReason('Needs another look.'), true);
  assert.equal(isValidReopenReason('a'), true);
  assert.equal(isValidReopenReason('a'.repeat(240)), true);
  assert.equal(isValidReopenReason(`  ${'a'.repeat(240)}  `), true);
  for (const value of ['', '   ', '\n\t', 'a'.repeat(241), undefined, null, 42, {}, []]) {
    assert.equal(isValidReopenReason(value), false, JSON.stringify(value));
  }
});
