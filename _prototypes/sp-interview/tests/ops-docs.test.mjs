import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const README = path.join(ROOT, 'sp-proxy/README.md');
const REDTEAM = path.join(ROOT, 'sp-proxy/REDTEAM_CHECKLIST.md');
const PASSPORT = path.join(ROOT, '_prototypes/sp-interview/release-passport.mjs');
const NETLIFY = path.join(ROOT, 'sp-proxy/netlify.toml');

test('operations guide names every managed-voice control without embedding values', () => {
  const readme = fs.readFileSync(README, 'utf8');
  for (const heading of [
    'Managed voice remains disabled',
    'Environment variables (names only)',
    'Retention and deletion',
    'Accidental PHI response',
    'Rate card and budget',
    'Operations usage access',
    'Vendor alerts and policy review',
    'Rollback',
    'Rotation turnover',
    'External activation gates',
  ]) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(readme, new RegExp(`^## ${escaped}$`, 'm'), `missing section: ${heading}`);
  }
  for (const variable of [
    'SP_MANAGED_VOICE_ENABLED',
    'SP_ROTATION_ID',
    'SP_OPERATIONS_KEY',
    'SP_SPEECH_TICKET_SECRET',
    'OPENAI_API_KEY',
    'ELEVENLABS_API_KEY',
    'SP_VOICE_STACK_ID',
    'SP_VOICE_TRANSCRIPTION_PROVIDER',
    'SP_VOICE_TRANSCRIPTION_MODEL',
    'SP_VOICE_SYNTHESIS_PROVIDER',
    'SP_VOICE_SYNTHESIS_MODEL',
    'SP_VOICE_ZERO_RETENTION_ENTITLED',
  ]) {
    assert.match(readme, new RegExp(`\\b${variable}\\b`), `missing environment name: ${variable}`);
  }
  assert.match(readme, /\$16[\s\S]*\$20|\$20[\s\S]*\$16/);
  assert.match(readme, /content-free (?:logs|logging)/i);
  assert.match(readme, /separate operations credential/i);
  assert.match(readme, /SP_MANAGED_VOICE_ENABLED=false/);
  assert.doesNotMatch(readme, /falls back automatically/i);
});

test('proxy deployment pins Node 20 and the runbook matches immutable actor settings', () => {
  const netlify = fs.readFileSync(NETLIFY, 'utf8');
  const readme = fs.readFileSync(README, 'utf8');

  assert.match(netlify, /\[build\.environment\][\s\S]*\bNODE_VERSION\s*=\s*"20"/);
  for (const deadVariable of [
    'SP_MODEL_ACTOR',
    'SP_MODEL_EVALUATOR',
    'SP_MAX_TURNS',
    'SP_MAX_TOKENS_ACTOR',
    'SP_MAX_TOKENS_EVAL',
    'SP_DAILY_LIMIT',
  ]) {
    assert.doesNotMatch(readme, new RegExp(`\\b${deadVariable}\\b`), `dead setting documented: ${deadVariable}`);
  }
  assert.match(readme, /claude-haiku-4-5-20251001/);
  assert.match(readme, /actor and evaluator[\s\S]{0,120}same reviewed model/i);
  assert.match(readme, /300[\s\S]{0,120}1,?500/);
  assert.match(readme, /40-turn|maximum of 40 turns/i);
  assert.match(readme, /\{"schemaVersion":1,"actorModel":"claude-haiku-4-5-20251001","evaluatorModel":"claude-haiku-4-5-20251001","packVersion":"<reviewed pack version>","packStatus":"<reviewed status>","cases":\[\.\.\.\]\}/);
  assert.doesNotMatch(readme, /\{"ok":true/);
});

test('red-team guide includes all ten voice probes and forbids silent fallback', () => {
  const checklist = fs.readFileSync(REDTEAM, 'utf8');
  for (let number = 1; number <= 10; number += 1) {
    assert.match(checklist, new RegExp(`\\| V${number} \\|`), `missing voice probe V${number}`);
  }
  for (const phrase of [
    'mic after off',
    'overlap',
    'self-capture',
    'wrong-case voice',
    'altered ticket',
    'stage direction',
    'audio after end',
    'silent fallback',
    'cap behavior',
    'safety pronunciation',
  ]) {
    assert.match(checklist, new RegExp(phrase, 'i'), `missing voice probe: ${phrase}`);
  }
  assert.doesNotMatch(checklist, /falls back automatically/i);
});

test('release passport is content-free and cannot attest missing external gates', () => {
  const result = spawnSync(process.execPath, [PASSPORT], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(receipt), ['schemaVersion', 'status', 'hashes', 'externalGates']);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.status, 'managed_voice_disabled');
  assert.deepEqual(Object.keys(receipt.hashes), [
    'html',
    'pack',
    'caseReviews',
    'speechEngine',
    'profiles',
    'privacyRecord',
    'rateCard',
  ]);
  for (const hash of Object.values(receipt.hashes)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(receipt.externalGates, {
    facultyVoiceAudition: 'missing',
    privacyApproval: 'missing',
    providerAccountControls: 'missing',
    learnerPilot: 'missing',
  });
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /sp_depression|sp_mania|sp_psychosis|openai|elevenlabs|alloy|dana|marcus|ray/i,
  );
});
