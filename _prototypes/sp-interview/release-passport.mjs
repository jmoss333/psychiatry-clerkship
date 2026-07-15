#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value, { raw = false } = {}) {
  return createHash('sha256').update(raw ? value : canonical(value)).digest('hex');
}

export function createReleasePassport({
  htmlBytes = fs.readFileSync(path.join(HERE, 'sp-interview.html')),
  packBytes = fs.readFileSync(path.join(HERE, 'sp-interview.pack.json')),
} = {}) {
  const pack = JSON.parse(Buffer.from(packBytes).toString('utf8'));
  const speechEngine = pack.speechEngine ?? null;
  const cases = Array.isArray(pack.cases) ? pack.cases : [];
  return {
    schemaVersion: 1,
    status: speechEngine?.enabled === false
      ? 'managed_voice_disabled'
      : 'activation_not_attested',
    hashes: {
      html: sha256(htmlBytes, { raw: true }),
      pack: sha256(packBytes, { raw: true }),
      caseReviews: sha256(cases.map((caseDef) => ({
        caseId: caseDef.id,
        facultyReview: caseDef.facultyReview ?? null,
      }))),
      speechEngine: sha256(speechEngine),
      profiles: sha256(cases.map((caseDef) => ({
        caseId: caseDef.id,
        speechProfile: caseDef.speechProfile ?? null,
      }))),
      privacyRecord: sha256(speechEngine?.privacyReview ?? null),
      rateCard: sha256(speechEngine?.rateCard ?? null),
    },
    externalGates: {
      facultyVoiceAudition: 'missing',
      privacyApproval: 'missing',
      providerAccountControls: 'missing',
      learnerPilot: 'missing',
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(createReleasePassport(), null, 2)}\n`);
}
