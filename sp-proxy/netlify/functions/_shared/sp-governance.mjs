import { createHash } from 'node:crypto';

import { operationalError } from './sp-http.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const CADENCES = new Set(['measured-flat', 'pressured-fast', 'guarded-halting']);

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSha256(value) {
  return typeof value === 'string' && SHA256_HEX.test(value);
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

function reviewedPrivacy(privacy, nowMs) {
  const reviewedAtMs = epochMs(privacy?.reviewedAt);
  const nextReviewAtMs = epochMs(privacy?.nextReviewAt);
  return Boolean(
    privacy?.status === 'reviewed'
    && privacy?.decision === 'approved'
    && Array.isArray(privacy.policyUrls)
    && privacy.policyUrls.length > 0
    && privacy.policyUrls.every(nonempty)
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
  );
}

function reviewedRateCard(rateCard, activeStack, nowMs) {
  const effectiveAtMs = epochMs(rateCard?.effectiveDate);
  if (
    !nonempty(rateCard?.version)
    || !nonempty(rateCard?.currency)
    || effectiveAtMs === null
    || effectiveAtMs > nowMs
    || !Array.isArray(rateCard?.rates)
    || rateCard.rates.length === 0
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
      && matches[0].price > 0
      && nonempty(matches[0].sourceUrl);
  });
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
    && CADENCES.has(profile.cadence)
    && typeof profile.speakingRate === 'number'
    && Number.isFinite(profile.speakingRate)
    && profile.speakingRate >= 0.75
    && profile.speakingRate <= 1.25
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

export function resolveReviewedCase({ pack, caseId }) {
  const cases = Array.isArray(pack?.cases) ? pack.cases : [];
  const caseDef = cases.find((candidate) => candidate?.id === caseId);
  if (!caseDef) {
    throw operationalError(400, 'unknown_case', 'Unknown case.');
  }
  if (caseDef?.facultyReview?.status !== 'reviewed') {
    throw operationalError(
      403,
      'case_not_reviewed',
      'This case is not reviewed for learner use.',
    );
  }
  return caseDef;
}

export function reviewedCaseSummaries(pack) {
  return (Array.isArray(pack?.cases) ? pack.cases : [])
    .filter((caseDef) => caseDef?.facultyReview?.status === 'reviewed')
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
      || !reviewedPrivacy(engine.privacyReview, nowMs)
    ) {
      return { eligible: false };
    }
    if (profileHash(profile) !== profile.facultyReview.profileHash) return { eligible: false };

    const candidates = Array.isArray(engine.candidateStacks) ? engine.candidateStacks : [];
    const activeCandidates = candidates.filter((candidate) => candidate?.id === engine.activeStack);
    if (activeCandidates.length !== 1) return { eligible: false };
    const active = activeCandidates[0];
    if (
      !runtime
      || ![
        runtime.stackId,
        runtime.transcriptionProvider,
        runtime.transcriptionModel,
        runtime.synthesisProvider,
        runtime.synthesisModel,
        runtime.voiceId,
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
      || profile.voiceId !== runtime.voiceId
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
    return {
      eligible: true,
      packHash,
      engineHash: engine.engineHash,
      profileHash: profile.facultyReview.profileHash,
      attestationHash,
      profile: {
        id: profile.id,
        version: profile.profileVersion,
        provider: profile.provider,
        model: profile.providerModel,
        voiceId: profile.voiceId,
      },
    };
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
