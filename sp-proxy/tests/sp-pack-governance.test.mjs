import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createPackLoader,
} from '../netlify/functions/_shared/sp-pack.mjs';
import {
  managedVoiceEligibility,
  requireManagedVoiceEligibility,
  resolveReviewedCase,
  reviewedCaseSummaries,
} from '../netlify/functions/_shared/sp-governance.mjs';
import {
  canonicalHash,
  createReviewedPack,
  NOW_MS,
  PACK_HASH,
  refreshGovernanceHashes,
  RUNTIME_PINS,
} from './fixtures/pack.fixture.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertOperationalError(error, { status, code, message }) {
  assert.equal(error?.status, status);
  assert.equal(error?.code, code);
  assert.equal(error?.message, message);
  return true;
}

test('pack loader hashes the exact response bytes and caches only while elapsed is below five minutes', async () => {
  const bodies = [
    '{\n  "version": 1, "cases": []\n}\n',
    '{"version":1,"cases":[]}',
  ];
  let nowMs = 1_000;
  const calls = [];
  const loader = createPackLoader({
    url: 'https://content.example.test/pack.json',
    token: 'read-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(bodies[calls.length - 1], { status: 200 });
    },
    now: () => nowMs,
    ttlMs: 300_000,
  });

  const first = await loader.load();
  assert.deepEqual(first, {
    pack: { version: 1, cases: [] },
    packHash: sha256(Buffer.from(bodies[0], 'utf8')),
    fetchedAt: 1_000,
  });
  assert.match(first.packHash, /^[a-f0-9]{64}$/);
  assert.equal(calls[0].url, 'https://content.example.test/pack.json');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer read-token');
  assert.equal(calls[0].options.headers.Accept, 'application/vnd.github.raw');

  nowMs = 300_999;
  assert.strictEqual(await loader.load(), first);
  assert.equal(calls.length, 1);

  nowMs = 301_000;
  const atBoundary = await loader.load();
  assert.equal(calls.length, 2, 'cache must refetch when elapsed equals ttlMs');
  assert.deepEqual(atBoundary.pack, first.pack);
  assert.notEqual(atBoundary.packHash, first.packHash, 'JSON-equivalent raw bytes bind differently');
  assert.equal(atBoundary.packHash, sha256(Buffer.from(bodies[1], 'utf8')));
  assert.equal(atBoundary.fetchedAt, 301_000);
});

test('an expired pack cache fails closed on fetch or parse errors instead of serving stale content', async () => {
  let nowMs = 0;
  let mode = 'ok';
  const loader = createPackLoader({
    url: 'https://content.example.test/pack.json',
    fetchImpl: async () => {
      if (mode === 'network') throw new Error('network detail');
      if (mode === 'bad-json') return new Response('{bad json', { status: 200 });
      return new Response('{"version":1,"cases":[]}', { status: 200 });
    },
    now: () => nowMs,
    ttlMs: 300_000,
  });

  await loader.load();
  nowMs = 300_000;
  mode = 'network';
  await assert.rejects(
    loader.load(),
    (error) => assertOperationalError(error, {
      status: 502,
      code: 'pack_unavailable',
      message: 'The reviewed case pack is unavailable.',
    }),
  );

  mode = 'bad-json';
  await assert.rejects(
    loader.load(),
    (error) => assertOperationalError(error, {
      status: 502,
      code: 'pack_invalid',
      message: 'The reviewed case pack is invalid.',
    }),
  );
});

test('reviewed case resolution and summaries expose only reviewed public fields', () => {
  const pack = createReviewedPack();
  assert.strictEqual(
    resolveReviewedCase({ pack, caseId: 'case-reviewed' }),
    pack.cases[0],
  );
  assert.deepEqual(reviewedCaseSummaries(pack), [
    { id: 'case-reviewed', title: 'Dana — reviewed case' },
  ]);

  assert.throws(
    () => resolveReviewedCase({ pack, caseId: 'missing-case' }),
    (error) => assertOperationalError(error, {
      status: 400,
      code: 'unknown_case',
      message: 'Unknown case.',
    }),
  );
  assert.throws(
    () => resolveReviewedCase({ pack, caseId: 'case-draft' }),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'case_not_reviewed',
      message: 'This case is not reviewed for learner use.',
    }),
  );
});

test('fully reviewed governance returns exact pack, engine, profile, attestation, and runtime bindings', () => {
  const pack = createReviewedPack();
  const caseDef = pack.cases[0];
  const engineHash = pack.speechEngine.engineHash;
  const profileHash = caseDef.speechProfile.facultyReview.profileHash;
  const attestationHash = canonicalHash({
    packHash: PACK_HASH,
    engineHash,
    profileHash,
    caseId: caseDef.id,
    caseReview: caseDef.facultyReview,
  });

  assert.deepEqual(managedVoiceEligibility({
    pack,
    packHash: PACK_HASH,
    caseDef,
    now: () => NOW_MS,
    runtime: RUNTIME_PINS,
  }), {
    eligible: true,
    packHash: PACK_HASH,
    engineHash,
    profileHash,
    attestationHash,
    profile: {
      id: 'dana-measured-v1',
      version: 2,
      provider: 'openai',
      model: 'tts-1-hd',
      voiceId: 'alloy',
    },
  });
});

test('managed voice independently fails closed on every review, privacy, hash, and runtime pin', () => {
  const checks = [
    ['invalid pack hash', ({ input }) => { input.packHash = 'not-a-hash'; }],
    ['engine not reviewed', ({ pack }) => { pack.speechEngine.status = 'draft-pending-attestation'; refreshGovernanceHashes(pack); }],
    ['engine disabled', ({ pack }) => { pack.speechEngine.enabled = false; refreshGovernanceHashes(pack); }],
    ['active stack absent', ({ pack }) => { pack.speechEngine.activeStack = 'missing'; refreshGovernanceHashes(pack); }],
    ['runtime stack changed', ({ runtime }) => { runtime.stackId = 'other-stack'; }],
    ['runtime stack missing', ({ runtime }) => { runtime.stackId = ''; }],
    ['transcription provider changed', ({ runtime }) => { runtime.transcriptionProvider = 'other'; }],
    ['transcription provider missing from both runtime and stack', ({ runtime, pack }) => { runtime.transcriptionProvider = ''; pack.speechEngine.candidateStacks[0].transcription.provider = ''; refreshGovernanceHashes(pack); }],
    ['transcription model changed', ({ runtime }) => { runtime.transcriptionModel = 'other'; }],
    ['transcription model missing from both runtime and stack', ({ runtime, pack }) => { runtime.transcriptionModel = ''; pack.speechEngine.candidateStacks[0].transcription.model = ''; refreshGovernanceHashes(pack); }],
    ['synthesis provider changed', ({ runtime }) => { runtime.synthesisProvider = 'other'; }],
    ['synthesis model changed', ({ runtime }) => { runtime.synthesisModel = 'other'; }],
    ['voice changed', ({ runtime }) => { runtime.voiceId = 'other'; }],
    ['rate card absent', ({ pack }) => { delete pack.speechEngine.rateCard; refreshGovernanceHashes(pack); }],
    ['rate card version absent', ({ pack }) => { pack.speechEngine.rateCard.version = ''; refreshGovernanceHashes(pack); }],
    ['rate card currency absent', ({ pack }) => { pack.speechEngine.rateCard.currency = ''; refreshGovernanceHashes(pack); }],
    ['rate card effective date impossible', ({ pack }) => { pack.speechEngine.rateCard.effectiveDate = '2026-02-30'; refreshGovernanceHashes(pack); }],
    ['rate card effective date future', ({ pack }) => { pack.speechEngine.rateCard.effectiveDate = '2027-07-14'; refreshGovernanceHashes(pack); }],
    ['active transcription rate absent', ({ pack }) => { pack.speechEngine.rateCard.rates.shift(); refreshGovernanceHashes(pack); }],
    ['active synthesis rate absent', ({ pack }) => { pack.speechEngine.rateCard.rates.pop(); refreshGovernanceHashes(pack); }],
    ['active rate duplicated', ({ pack }) => { pack.speechEngine.rateCard.rates.push({ ...pack.speechEngine.rateCard.rates[0] }); refreshGovernanceHashes(pack); }],
    ['case not reviewed', ({ caseDef }) => { caseDef.facultyReview.status = 'draft'; }],
    ['case reviewer missing', ({ caseDef }) => { caseDef.facultyReview.reviewer = ''; }],
    ['case review date missing', ({ caseDef }) => { caseDef.facultyReview.lastReviewed = ''; }],
    ['case review date impossible', ({ caseDef }) => { caseDef.facultyReview.lastReviewed = '2026-02-30'; }],
    ['profile not reviewed', ({ caseDef, pack }) => { caseDef.speechProfile.status = 'draft-pending-attestation'; refreshGovernanceHashes(pack); }],
    ['profile faculty review pending', ({ caseDef, pack }) => { caseDef.speechProfile.facultyReview.status = 'pending'; refreshGovernanceHashes(pack); }],
    ['profile reviewer missing', ({ caseDef, pack }) => { caseDef.speechProfile.facultyReview.reviewer = ''; refreshGovernanceHashes(pack); }],
    ['profile review date missing', ({ caseDef, pack }) => { caseDef.speechProfile.facultyReview.reviewedAt = ''; refreshGovernanceHashes(pack); }],
    ['profile review date impossible', ({ caseDef, pack }) => { caseDef.speechProfile.facultyReview.reviewedAt = '2026-02-30'; refreshGovernanceHashes(pack); }],
    ['profile audition missing', ({ caseDef, pack }) => { caseDef.speechProfile.facultyReview.auditionId = ''; refreshGovernanceHashes(pack); }],
    ['profile provider changed', ({ caseDef, pack }) => { caseDef.speechProfile.provider = 'other'; refreshGovernanceHashes(pack); }],
    ['profile model changed', ({ caseDef, pack }) => { caseDef.speechProfile.providerModel = 'other'; refreshGovernanceHashes(pack); }],
    ['profile voice changed', ({ caseDef, pack }) => { caseDef.speechProfile.voiceId = 'other'; refreshGovernanceHashes(pack); }],
    ['engine hash stale', ({ pack }) => { pack.speechEngine.engineHash = '00'.repeat(32); }],
    ['profile hash stale', ({ caseDef }) => { caseDef.speechProfile.facultyReview.profileHash = '00'.repeat(32); }],
    ['privacy status pending', ({ pack }) => { pack.speechEngine.privacyReview.status = 'pending'; refreshGovernanceHashes(pack); }],
    ['privacy decision pending', ({ pack }) => { pack.speechEngine.privacyReview.decision = 'pending'; refreshGovernanceHashes(pack); }],
    ['privacy URLs empty', ({ pack }) => { pack.speechEngine.privacyReview.policyUrls = []; refreshGovernanceHashes(pack); }],
    ['privacy hashes empty', ({ pack }) => { pack.speechEngine.privacyReview.policyHashes = []; refreshGovernanceHashes(pack); }],
    ['privacy records mismatched', ({ pack }) => { pack.speechEngine.privacyReview.policyHashes.push('ef'.repeat(32)); refreshGovernanceHashes(pack); }],
    ['privacy reviewer missing', ({ pack }) => { pack.speechEngine.privacyReview.reviewer = ''; refreshGovernanceHashes(pack); }],
    ['privacy reviewed date missing', ({ pack }) => { pack.speechEngine.privacyReview.reviewedAt = ''; refreshGovernanceHashes(pack); }],
    ['privacy reviewed date impossible', ({ pack }) => { pack.speechEngine.privacyReview.reviewedAt = '2026-02-30'; refreshGovernanceHashes(pack); }],
    ['privacy next-review date impossible', ({ pack }) => { pack.speechEngine.privacyReview.nextReviewAt = '2027-02-30'; refreshGovernanceHashes(pack); }],
    ['privacy consent is draft', ({ pack }) => { pack.speechEngine.privacyReview.consentVersion = 'draft-v2'; refreshGovernanceHashes(pack); }],
  ];

  for (const [label, mutate] of checks) {
    const pack = createReviewedPack();
    const caseDef = pack.cases[0];
    const runtime = { ...RUNTIME_PINS };
    const input = {
      pack,
      packHash: PACK_HASH,
      caseDef,
      now: () => NOW_MS,
      runtime,
    };
    mutate({ input, pack, caseDef, runtime });
    assert.deepEqual(managedVoiceEligibility(input), { eligible: false }, label);
  }
});

test('privacy next-review boundary is strict: one millisecond before passes and equality fails', () => {
  const pack = createReviewedPack();
  const caseDef = pack.cases[0];
  const boundary = Date.parse(pack.speechEngine.privacyReview.nextReviewAt);

  assert.equal(managedVoiceEligibility({
    pack,
    packHash: PACK_HASH,
    caseDef,
    now: () => boundary - 1,
    runtime: RUNTIME_PINS,
  }).eligible, true);
  assert.deepEqual(managedVoiceEligibility({
    pack,
    packHash: PACK_HASH,
    caseDef,
    now: () => boundary,
    runtime: RUNTIME_PINS,
  }), { eligible: false });
});

test('current draft pack fields return ineligible and the required gate uses the stable 403 error', () => {
  const pack = {
    status: 'draft-pending-attestation',
    speechEngine: {
      status: 'draft-pending-attestation',
      enabled: false,
    },
    cases: [{
      id: 'draft-case',
      facultyReview: { status: 'draft' },
      speechProfile: { status: 'draft-pending-attestation' },
    }],
  };
  const input = {
    pack,
    packHash: PACK_HASH,
    caseDef: pack.cases[0],
    now: () => NOW_MS,
    runtime: RUNTIME_PINS,
  };
  assert.deepEqual(managedVoiceEligibility(input), { eligible: false });
  assert.throws(
    () => requireManagedVoiceEligibility(input),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'managed_voice_ineligible',
      message: 'Managed voice is not eligible for this case.',
    }),
  );
});
