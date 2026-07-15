import { createHash } from 'node:crypto';

export const NOW_MS = Date.parse('2026-07-14T12:00:00.000Z');
export const PACK_HASH = 'ab'.repeat(32);

export const RUNTIME_PINS = Object.freeze({
  stackId: 'openai-quality-v1',
  transcriptionProvider: 'openai',
  transcriptionModel: 'whisper-1',
  synthesisProvider: 'openai',
  synthesisModel: 'tts-1-hd',
  zeroRetentionEntitled: false,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalHash(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function refreshGovernanceHashes(pack) {
  for (const caseDef of pack.cases ?? []) {
    const profile = caseDef.speechProfile;
    if (!profile?.facultyReview) continue;
    const profileForHash = clone(profile);
    delete profileForHash.facultyReview.profileHash;
    profile.facultyReview.profileHash = canonicalHash(profileForHash);
  }

  if (pack.speechEngine) {
    const engineForHash = clone(pack.speechEngine);
    delete engineForHash.engineHash;
    pack.speechEngine.engineHash = canonicalHash(engineForHash);
  }
  return pack;
}

function reviewedProfile({ id, voiceId, cadence, speakingRate }) {
  return {
    id,
    status: 'reviewed',
    profileVersion: 2,
    provider: 'openai',
    providerModel: 'tts-1-hd',
    voiceId,
    voiceProvenance: {
      kind: 'provider-stock',
      catalogUrl: `https://provider.example.test/stock-voices/${voiceId}`,
      verifiedBy: 'Faculty voice reviewer',
      verifiedAt: '2026-07-13',
      evidenceHash: canonicalHash({ provider: 'openai', voiceId }),
    },
    cadence,
    speakingRate,
    adapterMappingVersion: 'openai-tts-1-hd-v1',
    providerSettings: { speed: speakingRate },
    stageDirections: 'visual-only',
    facultyReview: {
      status: 'reviewed',
      reviewer: 'Joshua Moss, MD',
      reviewedAt: '2026-07-13',
      auditionId: `audition-${id}`,
      profileHash: null,
    },
  };
}

export function createReviewedPack() {
  const pack = {
    schemaVersion: '1.0',
    version: 'voice-fixture-v1',
    status: 'reviewed',
    speechEngine: {
      schemaVersion: 1,
      status: 'reviewed',
      enabled: true,
      activeStack: 'openai-quality-v1',
      candidateStacks: [
        {
          id: 'openai-quality-v1',
          transcription: { provider: 'openai', model: 'whisper-1' },
          synthesis: { provider: 'openai', model: 'tts-1-hd' },
        },
      ],
      rateCard: {
        version: '2026-07-14-reviewed-v1',
        effectiveDate: '2026-07-14',
        currency: 'USD',
        rates: [
          {
            provider: 'openai',
            model: 'whisper-1',
            meter: 'transcription_audio',
            unit: 'minute',
            price: 0.006,
            sourceUrl: 'https://example.test/rates/transcription',
          },
          {
            provider: 'openai',
            model: 'tts-1-hd',
            meter: 'synthesis_characters',
            unit: 'million_characters',
            price: 30,
            sourceUrl: 'https://example.test/rates/synthesis',
          },
        ],
      },
      privacyReview: {
        status: 'reviewed',
        policyUrls: ['https://example.test/provider-privacy'],
        policyHashes: ['cd'.repeat(32)],
        reviewer: 'Privacy reviewer',
        reviewedAt: '2026-07-13',
        nextReviewAt: '2027-07-14',
        decision: 'approved',
        consentVersion: '2026-07-14-v1',
        accountControls: {
          provider: 'openai',
          zeroRetentionEntitled: false,
          evidenceHash: canonicalHash({ provider: 'openai', zeroRetentionEntitled: false }),
        },
      },
      engineHash: null,
    },
    cases: [
      {
        id: 'case-reviewed',
        title: 'Dana — reviewed case',
        topic: 'not returned by the summary',
        facultyReview: {
          status: 'reviewed',
          reviewer: 'Joshua Moss, MD',
          lastReviewed: '2026-07-13',
        },
        speechProfile: {
          ...reviewedProfile({
            id: 'dana-measured-v1',
            voiceId: 'alloy',
            cadence: 'measured-flat',
            speakingRate: 0.95,
          }),
        },
      },
      {
        id: 'case-reviewed-second',
        title: 'Morgan — second reviewed case',
        facultyReview: {
          status: 'reviewed',
          reviewer: 'Joshua Moss, MD',
          lastReviewed: '2026-07-13',
        },
        speechProfile: reviewedProfile({
          id: 'morgan-guarded-v1',
          voiceId: 'echo',
          cadence: 'guarded-halting',
          speakingRate: 0.85,
        }),
      },
      {
        id: 'case-draft',
        title: 'Draft case',
        facultyReview: {
          status: 'draft',
          reviewer: '',
          lastReviewed: '',
        },
      },
    ],
  };
  return refreshGovernanceHashes(pack);
}
