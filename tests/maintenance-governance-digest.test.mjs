import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildGovernanceDigest,
  main,
  parseAttestationValidatorResult,
  parseStaleAttestationResult,
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
    staleAttestations: { slugs: [] },
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
    stdout: 'attestation consistency OK — 87 shipped item(s), 13 topic facultyReview entries aligned.\n',
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
        'attestation consistency OK — 87 shipped item(s), 13 topic facultyReview entries aligned.',
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

/* THE FIXTURES ABOVE ARE COPIES, AND A COPY CAN GO STALE.

   It did. #522 renamed the validator's success line from "N manifest item(s)" to
   "N shipped item(s)" when the shipped set stopped coming from site_manifest.json.
   parseAttestationValidatorResult's regex still demanded the old noun, so every real
   run fell through to `throw new Error('attestation validator did not return a
   recognized contract')` and main() printed "governance digest failed" and returned 1.
   The daily maintenance workflow had been red on every run since, silently, because
   nothing here ever ran the validator — both sides of the contract were fixtures in
   this file, and they agreed with each other.

   So: run the real validator and hold the real parser against its real stdout. If the
   wording drifts again, this goes red in the same commit that moves it. */
test('the contract matches the CURRENT validator, not a fixture of it', () => {
  const repo = path.resolve(import.meta.dirname, '..');
  const result = spawnSync('python3', [
    path.join(repo, '13_Faculty_Resources/_automation/validate_attestation_consistency.py'),
  ], { cwd: repo, encoding: 'utf8', maxBuffer: 1_048_576 });

  assert.doesNotThrow(
    () => parseAttestationValidatorResult(result),
    'validate_attestation_consistency.py\'s real output no longer matches the contract '
    + 'parseAttestationValidatorResult enforces. The digest fails closed on an '
    + 'unrecognized contract, so this is the daily governance-digest workflow going red: '
    + 'update the regex in governance_digest.mjs (and the fixtures above) to the wording '
    + 'the validator prints now. Its stdout was:\n' + JSON.stringify(result.stdout),
  );
});

/* A reviewed page whose attested inputs no longer match its contentHash is drift, not a
   broken record: the page really was reviewed, and the text it was reviewed as no longer
   exists. The learner sites render it pending (surface_governance.load_effective_ledger);
   the digest has to say so too, or the weekly report keeps counting it as covered. */
test('stale attestations are counted, sorted, and open a review queue', () => {
  const digest = buildGovernanceDigest(inputs({
    bank: [{ ...READY_ITEM, status: 'attested' }],
    manifestPages: ['t_mood.md'],
    manifestItems: ['t_mood.md'],
    topicMeta: { 't_mood.md': TOPIC_META['t_mood.md'] },
    reviewed: { 't_mood.md': { status: 'reviewed' } },
    needsReattest: { slugs: [] },
    staleAttestations: { slugs: ['tool.html', 't_mood.md', 't_mood.md'] },
  }));

  assert.deepEqual(digest.staleAttestations, {
    count: 2,
    slugs: ['t_mood.md', 'tool.html'],
  });
  // Nothing else in that digest is a queue -- the drift alone moves the gate.
  assert.equal(digest.gate, 'review');
});

test('no stale attestation leaves an otherwise clean digest ready', () => {
  const digest = buildGovernanceDigest(inputs({
    bank: [{ ...READY_ITEM, status: 'attested' }],
    manifestPages: ['t_mood.md'],
    manifestItems: ['t_mood.md'],
    topicMeta: { 't_mood.md': TOPIC_META['t_mood.md'] },
    reviewed: { 't_mood.md': { status: 'reviewed' } },
    needsReattest: { slugs: [] },
  }));

  assert.deepEqual(digest.staleAttestations, { count: 0, slugs: [] });
  assert.equal(digest.gate, 'ready');
});

/* The tool's exit codes are a contract (docs/RATCHETS.md): 0 clean, 1 a finding, 2 COULD
   NOT CHECK. Reading a 2 as "no stale rows" is the silent-shrink failure this whole PR
   exists to end, so anything but 0 or 1 fails the digest rather than reporting zero. */
test('the stale-attestation tool is read narrowly and 2 is never zero', () => {
  const report = (stale) => JSON.stringify({ schemaVersion: 1, stale, exitCode: 0 });

  assert.deepEqual(parseStaleAttestationResult({
    status: 0,
    stdout: report({}),
    stderr: '',
  }), []);
  assert.deepEqual(parseStaleAttestationResult({
    status: 0,
    stdout: report({
      'tool.html': { stored: 'a'.repeat(40), actual: 'b'.repeat(40), at: '2026-07-03' },
      't_mood.md': { stored: 'c'.repeat(40), actual: 'd'.repeat(40), at: '2026-07-03' },
    }),
    stderr: '',
  }), ['t_mood.md', 'tool.html']);
  // Exit 1 is a finding (an unbound or malformed row), and the report is still a report.
  assert.deepEqual(parseStaleAttestationResult({
    status: 1,
    stdout: JSON.stringify({ schemaVersion: 1, stale: {}, unbound: ['x.md'], exitCode: 1 }),
    stderr: '',
  }), []);

  for (const result of [
    { status: 2, stdout: '', stderr: 'could not check: cannot read topic_meta.json' },
    { status: 2, stdout: report({}), stderr: '' },
    { status: 0, stdout: 'Traceback: PRIVATE', stderr: '' },
    { status: 0, stdout: JSON.stringify({ schemaVersion: 2, stale: {} }), stderr: '' },
    { status: 0, stdout: JSON.stringify({ schemaVersion: 1 }), stderr: '' },
    { status: 0, stdout: JSON.stringify({ schemaVersion: 1, stale: [] }), stderr: '' },
    {
      status: 0,
      stdout: JSON.stringify({ schemaVersion: 1, stale: { '../escape.md': {} } }),
      stderr: '',
    },
  ]) {
    assert.throws(() => parseStaleAttestationResult(result), /attestation|governance|slug/i);
  }
  // A spawn that never ran re-raises its own error, so a failure to RUN the tool is
  // never mistaken for a clean report either.
  assert.throws(
    () => parseStaleAttestationResult({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('spawn failed'),
    }),
    /spawn failed/,
  );
});

/* Same lesson as the validator contract above: both sides of this one must not be
   fixtures that agree with each other. Run the real tool against the real tree. */
test('the stale-attestation contract matches the CURRENT tool, not a fixture of it', () => {
  const repo = path.resolve(import.meta.dirname, '..');
  const result = spawnSync('python3', [
    path.join(repo, 'bin/check_attestation_hashes.py'),
    '--format',
    'json',
  ], { cwd: repo, encoding: 'utf8', maxBuffer: 8_388_608 });

  assert.doesNotThrow(
    () => parseStaleAttestationResult(result),
    'bin/check_attestation_hashes.py --format json no longer matches the contract '
    + 'parseStaleAttestationResult enforces, so the weekly governance digest fails '
    + 'closed. Its status was ' + result.status + ' and its stderr was:\n'
    + JSON.stringify(result.stderr),
  );
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
  assert.match(markdown, /Stale attestations: 0\./);
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
    { staleAttestations: { slugs: ['unsafe/path.md'] } },
    { staleAttestations: [] },
    { attestationErrors: [{ code: 'bad code!', slugPrefix: 't_mood.md' }] },
  ];
  for (const override of invalid) {
    assert.throws(
      () => buildGovernanceDigest(inputs(override)),
      /governance|manifest|slug|attestation|input/i,
    );
  }
});

function cliDependencies({
  bank = [READY_ITEM],
  attestationErrors = [],
  staleSlugs = [],
} = {}) {
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
      runStaleAttestations() {
        if (staleSlugs instanceof Error) throw staleSlugs;
        return structuredClone(staleSlugs);
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
  assert.deepEqual(digest.staleAttestations, { count: 0, slugs: [] });
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

test('CLI reports drift and fails closed when the drift tool cannot be read', () => {
  const drifted = cliDependencies({ staleSlugs: ['t_mood.md'] });
  assert.equal(
    main(['--out-json', '/tmp/drift.json', '--out-md', '/tmp/drift.md'], drifted.dependencies),
    0,
  );
  const digest = JSON.parse(drifted.writes.get('/tmp/drift.json'));
  assert.deepEqual(digest.staleAttestations, { count: 1, slugs: ['t_mood.md'] });
  assert.equal(digest.gate, 'review');

  // "Could not check" must never render as "0 stale": the digest fails instead.
  const unreadable = cliDependencies({
    staleSlugs: new Error('could not check: cannot read topic_meta.json'),
  });
  assert.equal(
    main(['--out-json', '/tmp/x.json', '--out-md', '/tmp/x.md'], unreadable.dependencies),
    1,
  );
  assert.equal(unreadable.writes.size, 0);
  assert.deepEqual(unreadable.errors, ['governance digest failed']);
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
