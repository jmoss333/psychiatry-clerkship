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

test('pack loader deeply freezes the cached pack and snapshot so content cannot diverge from its hash', async () => {
  const raw = '{"version":1,"cases":[{"id":"case-reviewed","nested":{"labels":["original"]}}]}';
  let fetches = 0;
  const loader = createPackLoader({
    url: 'https://content.example.test/pack.json',
    fetchImpl: async () => {
      fetches += 1;
      return new Response(raw, { status: 200 });
    },
    now: () => 1_000,
  });

  const first = await loader.load();
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.pack), true);
  assert.equal(Object.isFrozen(first.pack.cases), true);
  assert.equal(Object.isFrozen(first.pack.cases[0]), true);
  assert.equal(Object.isFrozen(first.pack.cases[0].nested.labels), true);
  assert.throws(() => { first.pack.cases[0].id = 'mutated'; }, TypeError);
  assert.throws(() => { first.pack.cases[0].nested.labels.push('mutated'); }, TypeError);

  const later = await loader.load();
  assert.strictEqual(later, first);
  assert.equal(later.pack.cases[0].id, 'case-reviewed');
  assert.deepEqual(later.pack.cases[0].nested.labels, ['original']);
  assert.equal(later.packHash, sha256(Buffer.from(raw, 'utf8')));
  assert.equal(fetches, 1);
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

test('reviewed case resolution and summaries expose only fully attested reviewed public fields', () => {
  const pack = createReviewedPack();
  assert.strictEqual(
    resolveReviewedCase({ pack, caseId: 'case-reviewed', now: () => NOW_MS }),
    pack.cases[0],
  );
  assert.deepEqual(reviewedCaseSummaries(pack, { now: () => NOW_MS }), [
    { id: 'case-reviewed', title: 'Dana — reviewed case' },
    { id: 'case-reviewed-second', title: 'Morgan — second reviewed case' },
  ]);

  assert.throws(
    () => resolveReviewedCase({ pack, caseId: 'missing-case', now: () => NOW_MS }),
    (error) => assertOperationalError(error, {
      status: 400,
      code: 'unknown_case',
      message: 'Unknown case.',
    }),
  );
  assert.throws(
    () => resolveReviewedCase({ pack, caseId: 'case-draft', now: () => NOW_MS }),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'case_not_reviewed',
      message: 'This case is not reviewed for learner use.',
    }),
  );
});

test('case resolution and summaries reject blank reviewers, invalid dates, and future reviews', () => {
  const mutations = [
    ['blank reviewer', (review) => { review.reviewer = '   '; }],
    ['invalid date', (review) => { review.lastReviewed = '2026-02-30'; }],
    ['future date', (review) => { review.lastReviewed = '2026-07-15'; }],
  ];

  for (const [label, mutate] of mutations) {
    const pack = createReviewedPack();
    mutate(pack.cases[0].facultyReview);
    assert.throws(
      () => resolveReviewedCase({ pack, caseId: 'case-reviewed', now: () => NOW_MS }),
      (error) => assertOperationalError(error, {
        status: 403,
        code: 'case_not_reviewed',
        message: 'This case is not reviewed for learner use.',
      }),
      label,
    );
    assert.deepEqual(reviewedCaseSummaries(pack, { now: () => NOW_MS }), [
      { id: 'case-reviewed-second', title: 'Morgan — second reviewed case' },
    ], label);
  }
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
    zeroRetentionEntitled: false,
    profile: {
      id: 'dana-measured-v1',
      status: 'reviewed',
      profileVersion: 2,
      provider: 'openai',
      providerModel: 'tts-1-hd',
      voiceId: 'alloy',
      voiceProvenance: {
        kind: 'provider-stock',
        catalogUrl: 'https://provider.example.test/stock-voices/alloy',
        verifiedBy: 'Faculty voice reviewer',
        verifiedAt: '2026-07-13',
        evidenceHash: canonicalHash({ provider: 'openai', voiceId: 'alloy' }),
      },
      cadence: 'measured-flat',
      speakingRate: 0.95,
      adapterMappingVersion: 'openai-tts-1-hd-v1',
      providerSettings: { speed: 0.95 },
      stageDirections: 'visual-only',
    },
  });
  const eligibility = managedVoiceEligibility({
    pack,
    packHash: PACK_HASH,
    caseDef,
    now: () => NOW_MS,
    runtime: RUNTIME_PINS,
  });
  assert.equal(Object.isFrozen(eligibility), true);
  assert.equal(Object.isFrozen(eligibility.profile), true);
  assert.equal(Object.isFrozen(eligibility.profile.voiceProvenance), true);
  assert.equal(Object.isFrozen(eligibility.profile.providerSettings), true);
  assert.throws(() => { eligibility.profile.providerSettings.speed = 1.1; }, TypeError);
});

test('one reviewed runtime stack supports different attested stock voices by case', () => {
  const pack = createReviewedPack();
  const first = managedVoiceEligibility({
    pack,
    packHash: PACK_HASH,
    caseDef: pack.cases[0],
    now: () => NOW_MS,
    runtime: RUNTIME_PINS,
  });
  const second = managedVoiceEligibility({
    pack,
    packHash: PACK_HASH,
    caseDef: pack.cases[1],
    now: () => NOW_MS,
    runtime: RUNTIME_PINS,
  });

  assert.equal(first.eligible, true);
  assert.equal(second.eligible, true);
  assert.equal(first.profile.voiceId, 'alloy');
  assert.equal(second.profile.voiceId, 'echo');
  assert.notEqual(first.profileHash, second.profileHash);
  assert.deepEqual(Object.keys(RUNTIME_PINS).sort(), [
    'stackId',
    'synthesisModel',
    'synthesisProvider',
    'transcriptionModel',
    'transcriptionProvider',
    'zeroRetentionEntitled',
  ]);
});

test('reviewed OpenAI provenance and adapter settings fail semantic validation after rehashing', () => {
  const mutations = [
    ['provenance kind', (profile) => { profile.voiceProvenance.kind = 'cloned'; }],
    ['provenance URL', (profile) => { profile.voiceProvenance.catalogUrl = 'http://example.test/voice'; }],
    ['provenance verifier', (profile) => { profile.voiceProvenance.verifiedBy = '   '; }],
    ['provenance date', (profile) => { profile.voiceProvenance.verifiedAt = '2026-02-30'; }],
    ['future provenance date', (profile) => { profile.voiceProvenance.verifiedAt = '2026-07-15'; }],
    ['provenance evidence hash', (profile) => { profile.voiceProvenance.evidenceHash = 'AA'.repeat(32); }],
    ['provenance extra key', (profile) => { profile.voiceProvenance.extra = true; }],
    ['adapter mapping', (profile) => { profile.adapterMappingVersion = 'openai-tts-v2'; }],
    ['settings missing speed', (profile) => { profile.providerSettings = {}; }],
    ['settings extra key', (profile) => { profile.providerSettings.pitch = 1; }],
    ['settings speed mismatch', (profile) => { profile.providerSettings.speed = 1; }],
    ['custom OpenAI voice', (profile) => { profile.voiceId = 'custom-voice-id'; }],
  ];

  for (const [label, mutate] of mutations) {
    const pack = createReviewedPack();
    mutate(pack.cases[0].speechProfile);
    refreshGovernanceHashes(pack);
    assert.deepEqual(managedVoiceEligibility({
      pack,
      packHash: PACK_HASH,
      caseDef: pack.cases[0],
      now: () => NOW_MS,
      runtime: RUNTIME_PINS,
    }), { eligible: false }, label);
  }
});

test('reviewed Eleven v3 profiles require the exact supported attested mapping and settings', () => {
  function elevenPack() {
    const pack = createReviewedPack();
    pack.speechEngine.activeStack = 'elevenlabs-expressive-v1';
    pack.speechEngine.candidateStacks = [{
      id: 'elevenlabs-expressive-v1',
      transcription: { provider: 'elevenlabs', model: 'scribe_v2' },
      synthesis: { provider: 'elevenlabs', model: 'eleven_v3' },
    }];
    pack.speechEngine.rateCard.rates = [
      {
        provider: 'elevenlabs', model: 'scribe_v2', meter: 'transcription_audio',
        unit: 'hour', price: 0.22, sourceUrl: 'https://example.test/rates/transcription',
      },
      {
        provider: 'elevenlabs', model: 'eleven_v3', meter: 'synthesis_characters',
        unit: 'thousand_characters', price: 0.1, sourceUrl: 'https://example.test/rates/synthesis',
      },
    ];
    for (const caseDef of pack.cases.slice(0, 2)) {
      const profile = caseDef.speechProfile;
      profile.provider = 'elevenlabs';
      profile.providerModel = 'eleven_v3';
      profile.adapterMappingVersion = 'eleven-v3-v1';
      profile.providerSettings = {
        speed: profile.speakingRate,
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.2,
        use_speaker_boost: true,
      };
    }
    pack.speechEngine.privacyReview.accountControls = {
      provider: 'elevenlabs',
      zeroRetentionEntitled: false,
      evidenceHash: canonicalHash({ provider: 'elevenlabs', zeroRetentionEntitled: false }),
    };
    return refreshGovernanceHashes(pack);
  }
  const runtime = {
    stackId: 'elevenlabs-expressive-v1',
    transcriptionProvider: 'elevenlabs',
    transcriptionModel: 'scribe_v2',
    synthesisProvider: 'elevenlabs',
    synthesisModel: 'eleven_v3',
    zeroRetentionEntitled: false,
  };
  const valid = elevenPack();
  assert.equal(managedVoiceEligibility({
    pack: valid,
    packHash: PACK_HASH,
    caseDef: valid.cases[0],
    now: () => NOW_MS,
    runtime,
  }).eligible, true);

  const mutations = [
    ['mapping', (profile) => { profile.adapterMappingVersion = 'eleven-v2-v1'; }],
    ['speed mismatch', (profile) => { profile.providerSettings.speed = 1; }],
    ['speed above 1.2', (profile) => { profile.speakingRate = 1.21; profile.providerSettings.speed = 1.21; }],
    ['stability', (profile) => { profile.providerSettings.stability = 0.2; }],
    ['similarity', (profile) => { profile.providerSettings.similarity_boost = 1.01; }],
    ['style', (profile) => { profile.providerSettings.style = -0.01; }],
    ['speaker boost', (profile) => { profile.providerSettings.use_speaker_boost = 'true'; }],
    ['missing key', (profile) => { delete profile.providerSettings.style; }],
    ['extra key', (profile) => { profile.providerSettings.pitch = 1; }],
  ];
  for (const [label, mutate] of mutations) {
    const pack = elevenPack();
    mutate(pack.cases[0].speechProfile);
    refreshGovernanceHashes(pack);
    assert.deepEqual(managedVoiceEligibility({
      pack,
      packHash: PACK_HASH,
      caseDef: pack.cases[0],
      now: () => NOW_MS,
      runtime,
    }), { eligible: false }, label);
  }
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
    ['profile voice changed with stale hash', ({ caseDef }) => { caseDef.speechProfile.voiceId = 'other'; }],
    ['voice provenance kind changed', ({ caseDef }) => { caseDef.speechProfile.voiceProvenance.kind = 'cloned'; }],
    ['voice provenance catalog is not HTTPS', ({ caseDef }) => { caseDef.speechProfile.voiceProvenance.catalogUrl = 'http://provider.example.test/voice'; }],
    ['voice provenance verifier missing', ({ caseDef }) => { caseDef.speechProfile.voiceProvenance.verifiedBy = ''; }],
    ['voice provenance date invalid', ({ caseDef }) => { caseDef.speechProfile.voiceProvenance.verifiedAt = '2026-02-30'; }],
    ['voice provenance date future', ({ caseDef }) => { caseDef.speechProfile.voiceProvenance.verifiedAt = '2026-07-15'; }],
    ['voice provenance evidence hash invalid', ({ caseDef }) => { caseDef.speechProfile.voiceProvenance.evidenceHash = 'not-a-hash'; }],
    ['voice provenance has an extra field', ({ caseDef }) => { caseDef.speechProfile.voiceProvenance.cloneConsent = true; }],
    ['adapter mapping changed', ({ caseDef }) => { caseDef.speechProfile.adapterMappingVersion = 'unreviewed-v2'; }],
    ['provider settings speed differs from speaking rate', ({ caseDef }) => { caseDef.speechProfile.providerSettings.speed = 1; }],
    ['provider settings has an extra field', ({ caseDef }) => { caseDef.speechProfile.providerSettings.pitch = 2; }],
    ['cadence changed with stale hash', ({ caseDef }) => { caseDef.speechProfile.cadence = 'pressured-fast'; }],
    ['speaking rate changed with stale hash', ({ caseDef }) => { caseDef.speechProfile.speakingRate = 1; }],
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
    ['privacy account controls absent', ({ pack }) => { delete pack.speechEngine.privacyReview.accountControls; refreshGovernanceHashes(pack); }],
    ['privacy account provider changed', ({ pack }) => { pack.speechEngine.privacyReview.accountControls.provider = 'elevenlabs'; refreshGovernanceHashes(pack); }],
    ['privacy account evidence hash invalid', ({ pack }) => { pack.speechEngine.privacyReview.accountControls.evidenceHash = 'not-a-hash'; refreshGovernanceHashes(pack); }],
    ['privacy account controls has extra field', ({ pack }) => { pack.speechEngine.privacyReview.accountControls.reviewedBy = 'someone'; refreshGovernanceHashes(pack); }],
    ['runtime retention entitlement changed', ({ runtime }) => { runtime.zeroRetentionEntitled = true; }],
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
