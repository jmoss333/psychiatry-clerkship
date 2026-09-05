import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGovernanceDigest,
  main,
  parseAttestationValidatorResult,
  renderGovernanceMarkdown,
} from '../13_Faculty_Resources/_automation/maintenance/governance_digest.mjs';

const READY_ITEM = {
  id: 'qb_mood_001',
  status: 'draft',
  type: 'sba',
  category: 'mood',
  competency: ['dx'],
  difficulty: 1,
  hy: true,
  pages: ['t_mood.md'],
  link: { label: 'Open topic', href: '?page=t_mood.md' },
  stem: 'What is the best next step for this synthetic teaching vignette?',
  options: [
    { key: 'A', t: 'Synthetic correct answer', c: true },
    { key: 'B', t: 'Synthetic distractor B', trap: { name: 'B trap', note: 'B note' } },
    { key: 'C', t: 'Synthetic distractor C', trap: { name: 'C trap', note: 'C note' } },
    { key: 'D', t: 'Synthetic distractor D', trap: { name: 'D trap', note: 'D note' } },
  ],
  why: 'Synthetic explanation that must never appear in the digest.',
  pearl: 'Synthetic pearl that must never appear in the digest.',
  evidence: 'Synthetic evidence for t_mood.md that must never appear.',
};

const WARNING_ITEM = {
  id: 'qb_mood_002',
  status: 'draft',
  type: 'sba',
  category: 'mood',
  competency: ['management'],
  difficulty: 2,
  pages: ['t_mood.md'],
  link: { label: 'Open topic', href: '?page=t_mood.md' },
  stem: 'Review this synthetic warning stem without a question-form lead-in.',
  options: [
    { key: 'A', t: 'Synthetic warning correct answer', c: true },
    { key: 'B', t: 'Synthetic warning B', trap: { name: 'B trap', note: 'B note' } },
    { key: 'C', t: 'Synthetic warning C', trap: { name: 'C trap', note: 'C note' } },
    { key: 'D', t: 'Synthetic warning D', trap: { name: 'D trap', note: 'D note' } },
  ],
  why: 'Synthetic warning explanation.',
  pearl: 'Synthetic warning pearl.',
  evidence: 'Synthetic warning evidence t_mood.md.',
};

const BLOCKED_ITEM = {
  id: 'qb_mood_003',
  status: 'draft',
  type: 'sba',
  category: 'mood',
  competency: ['safety'],
  difficulty: 2,
  pages: ['t_mood.md'],
  link: { label: 'Open topic', href: '?page=t_mood.md' },
  stem: 'What is the safest synthetic next step?',
  options: [
    { key: 'A', t: 'Synthetic blocked answer A', c: true },
    { key: 'B', t: 'Synthetic blocked answer B', trap: { name: 'B trap', note: 'B note' } },
    { key: 'C', t: 'Synthetic blocked answer C', trap: { name: 'C trap', note: 'C note' } },
    { key: 'D', t: 'Synthetic blocked answer D', trap: { name: 'D trap', note: 'D note' } },
  ],
  why: '',
  pearl: 'Synthetic blocked pearl.',
  evidence: 'Synthetic blocked evidence t_mood.md.',
};

const TOPIC_META = {
  't_mood.md': {
    safetyLevel: 'high',
    evidenceIds: ['synthetic-evidence-id'],
    facultyReview: {
      status: 'reviewed',
      lastReviewed: '2026-01-01',
      reviewer: 'PRIVATE REVIEWER NAME',
    },
    tldr: 'PRIVATE CLINICAL PAGE BODY',
  },
  'other.md': {
    safetyLevel: 'moderate',
    facultyReview: { status: 'pending', reviewer: 'PRIVATE OTHER REVIEWER' },
  },
};

function inputs(overrides = {}) {
  return {
    bank: [READY_ITEM, WARNING_ITEM, BLOCKED_ITEM],
    manifestPages: ['t_mood.md', 'other.md', 'missing.md'],
    manifestItems: ['t_mood.md', 'other.md', 'missing.md', 'tool.html'],
    topicMeta: TOPIC_META,
    reviewed: {
      't_mood.md': {
        status: 'reviewed',
        by: 'PRIVATE REVIEWER NAME',
        at: '2026-01-01',
        note: 'PRIVATE REVIEW NOTE',
      },
      'other.md': { status: 'pending', by: 'PRIVATE OTHER REVIEWER' },
      'missing.md': { status: 'attested', by: 'PRIVATE THIRD REVIEWER' },
    },
    needsReattest: { slugs: ['other.md', 't_mood.md'] },
    attestationErrors: [],
    ...overrides,
  };
}

test('warnings and drafts are review queues but blockers fail the gate', () => {
  const digest = buildGovernanceDigest(inputs());
  assert.deepEqual(digest.qbank.counts, {
    total: 3,
    draft: 3,
    attested: 0,
    ready: 1,
    warning: 1,
    blocked: 1,
  });
  assert.equal(digest.qbank.warningCount, 1);
  assert.deepEqual(digest.qbank.blockedIds, ['qb_mood_003']);
  assert.equal(digest.gate, 'blocked');
});

test('warning-only and draft queues return review rather than blocked', () => {
  const digest = buildGovernanceDigest(inputs({
    bank: [READY_ITEM, WARNING_ITEM],
  }));
  assert.equal(digest.gate, 'review');
  assert.equal(digest.qbank.counts.blocked, 0);
  assert.equal(digest.qbank.counts.warning, 1);
});

test('an otherwise clean digest is ready', () => {
  const digest = buildGovernanceDigest(inputs({
    bank: [{ ...READY_ITEM, status: 'attested' }],
    manifestPages: ['t_mood.md'],
    manifestItems: ['t_mood.md'],
    topicMeta: { 't_mood.md': TOPIC_META['t_mood.md'] },
    reviewed: { 't_mood.md': { status: 'reviewed' } },
    needsReattest: { slugs: [] },
  }));
  assert.equal(digest.gate, 'ready');
});

test('attestation drift blocks and exposes only bounded codes and slug prefixes', () => {
  const digest = buildGovernanceDigest(inputs({
    bank: [READY_ITEM],
    attestationErrors: [
      { code: 'ledger_status_mismatch', slugPrefix: 't_mood.md' },
      'tool.html: PRIVATE validator explanation and identity',
    ],
  }));
  assert.equal(digest.gate, 'blocked');
  assert.deepEqual(digest.attestation, {
    status: 'invalid',
    errorCount: 2,
    errors: [
      { code: 'ledger_status_mismatch', slugPrefix: 't_mood.md' },
      { code: 'consistency', slugPrefix: 'tool.html' },
    ],
  });
  assert.doesNotMatch(JSON.stringify(digest), /PRIVATE validator explanation|identity/);
});

test('attestation subprocess output is recognized narrowly', () => {
  assert.deepEqual(parseAttestationValidatorResult({
    status: 0,
    stdout: 'attestation consistency OK — 87 manifest item(s), 13 topic facultyReview entries aligned.\n',
    stderr: '',
  }), []);
  assert.deepEqual(parseAttestationValidatorResult({
    status: 1,
    stdout: [
      'attestation consistency INVALID — 2 issue(s):',
      '  - t_mood.md: PRIVATE mismatch details',
      '  - tool.html: PRIVATE second mismatch',
      '',
    ].join('\n'),
    stderr: '',
  }), [
    't_mood.md: PRIVATE mismatch details',
    'tool.html: PRIVATE second mismatch',
  ]);
  for (const result of [
    { status: 0, stdout: 'unexpected success', stderr: '' },
    {
      status: 0,
      stdout: [
        'attestation consistency OK — 87 manifest item(s), 13 topic facultyReview entries aligned.',
        '  - t_mood.md: contradictory drift',
      ].join('\n'),
      stderr: '',
    },
    { status: 1, stdout: 'Traceback: PRIVATE', stderr: '' },
    {
      status: 1,
      stdout: [
        'attestation consistency INVALID — 2 issue(s):',
        '  - t_mood.md: only one bullet',
      ].join('\n'),
      stderr: '',
    },
    { status: 2, stdout: '', stderr: 'runtime failure' },
  ]) {
    assert.throws(
      () => parseAttestationValidatorResult(result),
      /validator|stderr/i,
    );
  }
});

test('topic metadata is grouped by high-risk versus other topics', () => {
  const digest = buildGovernanceDigest(inputs());
  assert.deepEqual(digest.topics, {
    highRisk: {
      total: 1,
      metadataPresent: 1,
      complete: 1,
      incomplete: 0,
    },
    other: {
      total: 2,
      metadataPresent: 1,
      metadataMissing: 1,
      optionalGovernancePresent: 1,
      optionalGovernanceMissing: 1,
    },
  });
});

test('missing high-risk required governance is a review queue, not a blocker', () => {
  const digest = buildGovernanceDigest(inputs({
    bank: [{ ...READY_ITEM, status: 'attested' }],
    topicMeta: {
      't_mood.md': {
        safetyLevel: 'high',
        evidenceIds: [],
        facultyReview: { status: 'pending' },
      },
      'other.md': {},
    },
  }));
  assert.equal(digest.topics.highRisk.incomplete, 1);
  assert.equal(digest.gate, 'review');
});

test('reviewed coverage uses all manifest items without exposing ledger identity', () => {
  const digest = buildGovernanceDigest(inputs());
  assert.deepEqual(digest.reviewed, {
    total: 4,
    reviewed: 2,
    pending: 1,
    missing: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(digest),
    /PRIVATE REVIEWER|PRIVATE OTHER REVIEWER|PRIVATE THIRD REVIEWER|PRIVATE REVIEW NOTE/,
  );
});

test('re-attestation queue is counted, validated, deduplicated, and sorted', () => {
  const digest = buildGovernanceDigest(inputs({
    needsReattest: { slugs: ['t_mood.md', 'other.md', 't_mood.md'] },
  }));
  assert.deepEqual(digest.reattestation, {
    count: 2,
    slugs: ['other.md', 't_mood.md'],
  });
});

test('ordering is deterministic and clinical or assessment text never appears', () => {
  const first = buildGovernanceDigest(inputs({
    needsReattest: { slugs: ['t_mood.md', 'other.md'] },
  }));
  const second = buildGovernanceDigest(inputs({
    needsReattest: { slugs: ['other.md', 't_mood.md'] },
  }));
  assert.deepEqual(first, second);
  const serialized = JSON.stringify(first);
  for (const forbidden of [
    READY_ITEM.stem,
    READY_ITEM.options[0].t,
    READY_ITEM.why,
    READY_ITEM.pearl,
    READY_ITEM.evidence,
    'PRIVATE CLINICAL PAGE BODY',
    'PRIVATE REVIEWER NAME',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(serialized, /answerKeys|categoryAnswerKeys|blockers|warnings/);
});

test('markdown is content-free and reports faculty authority', () => {
  const markdown = renderGovernanceMarkdown(buildGovernanceDigest(inputs()));
  assert.match(markdown, /Faculty review remains required/i);
  assert.match(markdown, /Blocked question IDs: qb_mood_003/);
  assert.doesNotMatch(markdown, /Synthetic teaching vignette|PRIVATE|correct answer/);
});

test('malformed inputs fail closed', () => {
  const invalid = [
    { bank: {} },
    { bank: [READY_ITEM, null] },
    { bank: [READY_ITEM, 'corrupt record'] },
    { manifestPages: ['../private.md'] },
    { manifestItems: ['tool.html', 'tool.html'] },
    { topicMeta: [] },
    { reviewed: [] },
    { needsReattest: { slugs: ['unsafe/path.md'] } },
    { attestationErrors: [{ code: 'bad code!', slugPrefix: 't_mood.md' }] },
  ];
  for (const override of invalid) {
    assert.throws(
      () => buildGovernanceDigest(inputs(override)),
      /governance|manifest|slug|attestation|input/i,
    );
  }
});

function cliDependencies({ bank = [READY_ITEM], attestationErrors = [] } = {}) {
  const files = {
    // The CLI reads the derived "what ships" listing (ADR-002), not site_manifest.json.
    '13_Faculty_Resources/_automation/site_build/shipped_pages.json': {
      version: 1,
      pages: [{
        slug: 't_mood.md',
        kind: 'page',
        sites: ['ms3', 'res'],
        title: 'PRIVATE PAGE TITLE',
        source: 'source.md',
        producer: 'site_manifest',
      }],
    },
    'question_bank.json': { items: bank },
    'topic_meta.json': { 't_mood.md': TOPIC_META['t_mood.md'] },
    '13_Faculty_Resources/reviewed.json': {
      't_mood.md': { status: 'reviewed', by: 'PRIVATE REVIEWER NAME' },
    },
    '13_Faculty_Resources/_automation/surveillance/config/needs_reattest.json': {
      slugs: [],
    },
  };
  const writes = new Map();
  const errors = [];
  return {
    writes,
    errors,
    dependencies: {
      readJson(relativePath) {
        if (!(relativePath in files)) throw new Error('unexpected file');
        return structuredClone(files[relativePath]);
      },
      runAttestationValidator() {
        return structuredClone(attestationErrors);
      },
      writeFile(outputPath, value, encoding) {
        assert.equal(encoding, 'utf8');
        writes.set(outputPath, value);
      },
      logError(message) {
        errors.push(message);
      },
    },
  };
}

test('CLI writes both artifacts and returns 0 for a non-blocking review queue', () => {
  const harness = cliDependencies();
  assert.equal(
    main(['--out-json', '/tmp/digest.json', '--out-md', '/tmp/digest.md'], harness.dependencies),
    0,
  );
  assert.deepEqual([...harness.writes.keys()].sort(), ['/tmp/digest.json', '/tmp/digest.md']);
  const digest = JSON.parse(harness.writes.get('/tmp/digest.json'));
  assert.equal(digest.gate, 'review');
  assert.match(harness.writes.get('/tmp/digest.md'), /Faculty review remains required/);
  assert.doesNotMatch(
    [...harness.writes.values()].join('\n'),
    /PRIVATE PAGE TITLE|PRIVATE REVIEWER NAME|Synthetic teaching vignette/,
  );
  assert.deepEqual(harness.errors, []);
});

test('CLI writes artifacts before returning 2 for blockers or attestation drift', () => {
  for (const options of [
    { bank: [BLOCKED_ITEM] },
    {
      bank: [READY_ITEM],
      attestationErrors: [{ code: 'consistency', slugPrefix: 't_mood.md' }],
    },
  ]) {
    const harness = cliDependencies(options);
    assert.equal(
      main(
        ['--out-json', '/tmp/blocked.json', '--out-md', '/tmp/blocked.md'],
        harness.dependencies,
      ),
      2,
    );
    assert.equal(harness.writes.size, 2);
    assert.equal(JSON.parse(harness.writes.get('/tmp/blocked.json')).gate, 'blocked');
  }
});

test('CLI returns 1 and writes no artifacts for malformed or runtime input', () => {
  const malformed = cliDependencies({ bank: [READY_ITEM, null] });
  assert.equal(
    main(['--out-json', '/tmp/bad.json', '--out-md', '/tmp/bad.md'], malformed.dependencies),
    1,
  );
  assert.equal(malformed.writes.size, 0);
  assert.deepEqual(malformed.errors, ['governance digest failed']);

  const runtime = cliDependencies();
  runtime.dependencies.writeFile = () => {
    throw new Error('disk failure');
  };
  assert.equal(
    main(
      ['--out-json', '/tmp/runtime.json', '--out-md', '/tmp/runtime.md'],
      runtime.dependencies,
    ),
    1,
  );
  assert.deepEqual(runtime.errors, ['governance digest failed']);
});
