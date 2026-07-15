import { createHash } from 'node:crypto';

import { operationalError } from './sp-http.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const CADENCES = new Set(['measured-flat', 'pressured-fast', 'guarded-halting']);
const OPENAI_STOCK_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
]);
const CANDIDATE_KEYS = ['id', 'synthesis', 'transcription'];
const PROVIDER_LEG_KEYS = ['model', 'provider'];
const RATE_CARD_KEYS = ['currency', 'effectiveDate', 'rates', 'version'];
const RATE_KEYS = ['meter', 'model', 'price', 'provider', 'sourceUrl', 'unit'];
const RUNTIME_KEYS = [
  'stackId',
  'synthesisModel',
  'synthesisProvider',
  'transcriptionModel',
  'transcriptionProvider',
  'zeroRetentionEntitled',
];

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSha256(value) {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function finiteBetween(value, minimum, maximum) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function validHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && nonempty(url.hostname);
  } catch {
    return false;
  }
}

function epochMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function clockValue(now) {
  const value = typeof now === 'function' ? now() : now;
  if (value instanceof Date) return value.getTime();
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalHash(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function engineHash(engine) {
  const withoutSelfHash = { ...engine };
  delete withoutSelfHash.engineHash;
  return canonicalHash(withoutSelfHash);
}

function profileHash(profile) {
  const withoutSelfHash = {
    ...profile,
    facultyReview: { ...profile.facultyReview },
  };
  delete withoutSelfHash.facultyReview.profileHash;
  return canonicalHash(withoutSelfHash);
}

function reviewedCase(caseDef, nowMs) {
  const review = caseDef?.facultyReview;
  const reviewedAt = review?.lastReviewed ?? review?.reviewedAt;
  const reviewedAtMs = epochMs(reviewedAt);
  return Boolean(
    caseDef
    && review?.status === 'reviewed'
    && nonempty(review.reviewer)
    && reviewedAtMs !== null
    && reviewedAtMs <= nowMs
  );
}

function reviewedPrivacy(privacy, active, runtime, nowMs) {
  const reviewedAtMs = epochMs(privacy?.reviewedAt);
  const nextReviewAtMs = epochMs(privacy?.nextReviewAt);
  const controls = privacy?.accountControls;
  return Boolean(
    privacy?.status === 'reviewed'
    && privacy?.decision === 'approved'
    && Array.isArray(privacy.policyUrls)
    && privacy.policyUrls.length > 0
    && privacy.policyUrls.every(validHttpsUrl)
    && Array.isArray(privacy.policyHashes)
    && privacy.policyHashes.length === privacy.policyUrls.length
    && privacy.policyHashes.every(validSha256)
    && nonempty(privacy.reviewer)
    && reviewedAtMs !== null
    && reviewedAtMs <= nowMs
    && nextReviewAtMs !== null
    && nowMs < nextReviewAtMs
    && nonempty(privacy.consentVersion)
    && !privacy.consentVersion.toLowerCase().includes('draft')
    && exactKeys(controls, ['provider', 'zeroRetentionEntitled', 'evidenceHash'])
    && nonempty(controls.provider)
    && typeof controls.zeroRetentionEntitled === 'boolean'
    && validSha256(controls.evidenceHash)
    && active?.transcription?.provider === active?.synthesis?.provider
    && controls.provider === active?.synthesis?.provider
    && typeof runtime?.zeroRetentionEntitled === 'boolean'
    && runtime.zeroRetentionEntitled === controls.zeroRetentionEntitled
  );
}

function reviewedRateCard(rateCard, activeStack, nowMs) {
  const effectiveAtMs = epochMs(rateCard?.effectiveDate);
  if (
    !exactKeys(rateCard, RATE_CARD_KEYS)
    || !nonempty(rateCard?.version)
    || !nonempty(rateCard?.currency)
    || effectiveAtMs === null
    || effectiveAtMs > nowMs
    || !Array.isArray(rateCard?.rates)
    || rateCard.rates.length === 0
    || !rateCard.rates.every((rate) => (
      exactKeys(rate, RATE_KEYS)
      && validHttpsUrl(rate.sourceUrl)
    ))
  ) {
    return false;
  }
  const requiredRates = [
    {
      provider: activeStack.transcription.provider,
      model: activeStack.transcription.model,
      meter: 'transcription_audio',
    },
    {
      provider: activeStack.synthesis.provider,
      model: activeStack.synthesis.model,
      meter: 'synthesis_characters',
    },
  ];
  return requiredRates.every((required) => {
    const matches = rateCard.rates.filter((rate) => (
      rate?.provider === required.provider
      && rate?.model === required.model
      && rate?.meter === required.meter
    ));
    return matches.length === 1
      && nonempty(matches[0].unit)
      && typeof matches[0].price === 'number'
      && Number.isFinite(matches[0].price)
      && matches[0].price > 0;
  });
}

function reviewedProvenance(provenance, nowMs) {
  const verifiedAtMs = epochMs(provenance?.verifiedAt);
  return Boolean(
    exactKeys(
      provenance,
      ['kind', 'catalogUrl', 'verifiedBy', 'verifiedAt', 'evidenceHash'],
    )
    && provenance.kind === 'provider-stock'
    && validHttpsUrl(provenance.catalogUrl)
    && nonempty(provenance.verifiedBy)
    && verifiedAtMs !== null
    && verifiedAtMs <= nowMs
    && validSha256(provenance.evidenceHash)
  );
}

function reviewedProviderMapping(profile) {
  if (profile.provider === 'openai' && profile.providerModel === 'tts-1-hd') {
    return OPENAI_STOCK_VOICES.has(profile.voiceId)
      && profile.adapterMappingVersion === 'openai-tts-1-hd-v1'
      && exactKeys(profile.providerSettings, ['speed'])
      && profile.providerSettings.speed === profile.speakingRate;
  }
  if (profile.provider === 'elevenlabs' && profile.providerModel === 'eleven_v3') {
    const settings = profile.providerSettings;
    return profile.adapterMappingVersion === 'eleven-v3-v1'
      && exactKeys(settings, [
        'speed',
        'stability',
        'similarity_boost',
        'style',
        'use_speaker_boost',
      ])
      && settings.speed === profile.speakingRate
      && finiteBetween(settings.speed, 0.7, 1.2)
      && [0, 0.5, 1].includes(settings.stability)
      && finiteBetween(settings.similarity_boost, 0, 1)
      && finiteBetween(settings.style, 0, 1)
      && typeof settings.use_speaker_boost === 'boolean';
  }
  return false;
}

function reviewedProfile(profile, caseDef, nowMs) {
  const review = profile?.facultyReview;
  const reviewedAtMs = epochMs(review?.reviewedAt);
  return Boolean(
    profile?.status === 'reviewed'
    && nonempty(profile.id)
    && Number.isInteger(profile.profileVersion)
    && profile.profileVersion > 0
    && nonempty(profile.provider)
    && nonempty(profile.providerModel)
    && nonempty(profile.voiceId)
    && reviewedProvenance(profile.voiceProvenance, nowMs)
    && CADENCES.has(profile.cadence)
    && finiteBetween(profile.speakingRate, 0.75, 1.25)
    && reviewedProviderMapping(profile)
    && profile.stageDirections === 'visual-only'
    && review?.status === 'reviewed'
    && nonempty(review.reviewer)
    && reviewedAtMs !== null
    && reviewedAtMs <= nowMs
    && nonempty(review.auditionId)
    && validSha256(review.profileHash)
    && reviewedCase(caseDef, nowMs)
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function safeProviderProfile(profile) {
  return deepFreeze({
    id: profile.id,
    status: profile.status,
    profileVersion: profile.profileVersion,
    provider: profile.provider,
    providerModel: profile.providerModel,
    voiceId: profile.voiceId,
    voiceProvenance: { ...profile.voiceProvenance },
    cadence: profile.cadence,
    speakingRate: profile.speakingRate,
    adapterMappingVersion: profile.adapterMappingVersion,
    providerSettings: { ...profile.providerSettings },
    stageDirections: profile.stageDirections,
  });
}

export function resolveReviewedCase({ pack, caseId, now = Date.now }) {
  const cases = Array.isArray(pack?.cases) ? pack.cases : [];
  const caseDef = cases.find((candidate) => candidate?.id === caseId);
  if (!caseDef) {
    throw operationalError(400, 'unknown_case', 'Unknown case.');
  }
  if (!reviewedCase(caseDef, clockValue(now))) {
    throw operationalError(
      403,
      'case_not_reviewed',
      'This case is not reviewed for learner use.',
    );
  }
  return caseDef;
}

export function reviewedCaseSummaries(pack, { now = Date.now } = {}) {
  const nowMs = clockValue(now);
  return (Array.isArray(pack?.cases) ? pack.cases : [])
    .filter((caseDef) => reviewedCase(caseDef, nowMs))
    .map((caseDef) => ({ id: caseDef.id, title: caseDef.title }));
}

export function managedVoiceEligibility({
  pack,
  packHash,
  caseDef,
  now,
  runtime,
}) {
  try {
    const nowMs = clockValue(now);
    const engine = pack?.speechEngine;
    const profile = caseDef?.speechProfile;
    if (!Number.isFinite(nowMs) || !validSha256(packHash)) return { eligible: false };
    if (!Array.isArray(pack?.cases) || !pack.cases.includes(caseDef)) return { eligible: false };
    if (!reviewedCase(caseDef, nowMs) || !reviewedProfile(profile, caseDef, nowMs)) {
      return { eligible: false };
    }
    if (
      engine?.schemaVersion !== 1
      || engine.status !== 'reviewed'
      || engine.enabled !== true
      || !nonempty(engine.activeStack)
      || !validSha256(engine.engineHash)
      || engineHash(engine) !== engine.engineHash
    ) {
      return { eligible: false };
    }
    if (profileHash(profile) !== profile.facultyReview.profileHash) return { eligible: false };

    const candidates = Array.isArray(engine.candidateStacks) ? engine.candidateStacks : [];
    if (!candidates.every((candidate) => (
      exactKeys(candidate, CANDIDATE_KEYS)
      && exactKeys(candidate.transcription, PROVIDER_LEG_KEYS)
      && exactKeys(candidate.synthesis, PROVIDER_LEG_KEYS)
    ))) {
      return { eligible: false };
    }
    const activeCandidates = candidates.filter((candidate) => candidate?.id === engine.activeStack);
    if (activeCandidates.length !== 1) return { eligible: false };
    const active = activeCandidates[0];
    if (
      !exactKeys(runtime, RUNTIME_KEYS)
      || ![
        runtime.stackId,
        runtime.transcriptionProvider,
        runtime.transcriptionModel,
        runtime.synthesisProvider,
        runtime.synthesisModel,
        active.transcription?.provider,
        active.transcription?.model,
        active.synthesis?.provider,
        active.synthesis?.model,
      ].every(nonempty)
      || runtime.stackId !== engine.activeStack
      || runtime.transcriptionProvider !== active.transcription?.provider
      || runtime.transcriptionModel !== active.transcription?.model
      || runtime.synthesisProvider !== active.synthesis?.provider
      || runtime.synthesisModel !== active.synthesis?.model
      || profile.provider !== runtime.synthesisProvider
      || profile.providerModel !== runtime.synthesisModel
      || !reviewedPrivacy(engine.privacyReview, active, runtime, nowMs)
      || !reviewedRateCard(engine.rateCard, active, nowMs)
    ) {
      return { eligible: false };
    }

    const attestationHash = canonicalHash({
      packHash,
      engineHash: engine.engineHash,
      profileHash: profile.facultyReview.profileHash,
      caseId: caseDef.id,
      caseReview: caseDef.facultyReview,
    });
    return deepFreeze({
      eligible: true,
      packHash,
      engineHash: engine.engineHash,
      profileHash: profile.facultyReview.profileHash,
      attestationHash,
      zeroRetentionEntitled: engine.privacyReview.accountControls.zeroRetentionEntitled,
      profile: safeProviderProfile(profile),
    });
  } catch {
    return { eligible: false };
  }
}

export function requireManagedVoiceEligibility(input) {
  const result = managedVoiceEligibility(input);
  if (!result.eligible) {
    throw operationalError(
      403,
      'managed_voice_ineligible',
      'Managed voice is not eligible for this case.',
    );
  }
  return result;
}
