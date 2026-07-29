#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessBank } from '../../../faculty-console/qbank-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const REVIEWED_STATUSES = new Set(['reviewed', 'attested']);
const SAFE_SLUG = /^[A-Za-z0-9_.-]{1,128}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/;

function fail(message) {
  throw new Error(`governance input: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function safeSlug(value, label) {
  if (typeof value !== 'string' || !SAFE_SLUG.test(value)) fail(`${label} has an unsafe slug`);
  return value;
}

function uniqueSlugs(value, label, { rejectDuplicates = false } = {}) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const slugs = value.map((entry, index) => safeSlug(entry, `${label}[${index}]`));
  const unique = [...new Set(slugs)];
  if (rejectDuplicates && unique.length !== slugs.length) fail(`${label} contains duplicate slugs`);
  return unique.sort();
}

function highRiskComplete(meta) {
  return Array.isArray(meta.evidenceIds)
    && meta.evidenceIds.some((value) => typeof value === 'string' && value.trim())
    && meta.facultyReview
    && typeof meta.facultyReview === 'object'
    && !Array.isArray(meta.facultyReview)
    && typeof meta.facultyReview.status === 'string'
    && meta.facultyReview.status.trim()
    && typeof meta.facultyReview.lastReviewed === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(meta.facultyReview.lastReviewed);
}

function topicSummary(manifestPages, topicMeta) {
  const summary = {
    highRisk: { total: 0, metadataPresent: 0, complete: 0, incomplete: 0 },
    other: {
      total: 0,
      metadataPresent: 0,
      metadataMissing: 0,
      optionalGovernancePresent: 0,
      optionalGovernanceMissing: 0,
    },
  };
  for (const slug of manifestPages) {
    const meta = topicMeta[slug];
    const present = Boolean(meta && typeof meta === 'object' && !Array.isArray(meta));
    if (present && meta.safetyLevel === 'high') {
      summary.highRisk.total += 1;
      summary.highRisk.metadataPresent += 1;
      if (highRiskComplete(meta)) summary.highRisk.complete += 1;
      else summary.highRisk.incomplete += 1;
      continue;
    }
    summary.other.total += 1;
    if (!present) {
      summary.other.metadataMissing += 1;
      summary.other.optionalGovernanceMissing += 1;
      continue;
    }
    summary.other.metadataPresent += 1;
    const governed = ['low', 'moderate'].includes(meta.safetyLevel)
      || Boolean(meta.facultyReview && typeof meta.facultyReview === 'object');
    if (governed) summary.other.optionalGovernancePresent += 1;
    else summary.other.optionalGovernanceMissing += 1;
  }
  return summary;
}

function reviewedSummary(manifestItems, reviewed) {
  const summary = { total: manifestItems.length, reviewed: 0, pending: 0, missing: 0 };
  for (const slug of manifestItems) {
    const entry = reviewed[slug];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      summary.missing += 1;
    } else if (REVIEWED_STATUSES.has(entry.status)) {
      summary.reviewed += 1;
    } else {
      summary.pending += 1;
    }
  }
  return summary;
}

function normalizeAttestationError(value) {
  if (typeof value === 'string') {
    const match = /^\s*([A-Za-z0-9_.-]{1,128}):/.exec(value);
    return { code: 'consistency', slugPrefix: match ? match[1] : 'unknown' };
  }
  const entry = object(value, 'attestation error');
  if (!SAFE_CODE.test(entry.code) || !SAFE_SLUG.test(entry.slugPrefix)) {
    fail('attestation error has unsafe code or slug');
  }
  return { code: entry.code, slugPrefix: entry.slugPrefix };
}

function reviewQueuePresent(digest) {
  return digest.qbank.counts.draft > 0
    || digest.qbank.counts.warning > 0
    || digest.topics.highRisk.incomplete > 0
    || digest.topics.other.metadataMissing > 0
    || digest.topics.other.optionalGovernanceMissing > 0
    || digest.reviewed.pending > 0
    || digest.reviewed.missing > 0
    || digest.reattestation.count > 0;
}

export function buildGovernanceDigest(inputs) {
  const source = object(inputs, 'root');
  if (!Array.isArray(source.bank)) fail('bank must be an array');
  const manifestPages = uniqueSlugs(source.manifestPages, 'manifestPages');
  const manifestItems = uniqueSlugs(
    source.manifestItems ?? source.manifestPages,
    'manifestItems',
    { rejectDuplicates: true },
  );
  const topicMeta = object(source.topicMeta, 'topicMeta');
  const reviewed = object(source.reviewed, 'reviewed');
  const needsReattest = object(source.needsReattest, 'needsReattest');
  const reattestationSlugs = uniqueSlugs(needsReattest.slugs, 'needsReattest.slugs');
  if (reattestationSlugs.some((slug) => !manifestItems.includes(slug))) {
    fail('needsReattest.slugs contains an item outside the shipped manifest');
  }
  if (!Array.isArray(source.attestationErrors)) fail('attestationErrors must be an array');

  const assessed = assessBank(source.bank, { manifestPages });
  const counts = {
    total: assessed.counts.total,
    draft: assessed.counts.draft,
    attested: assessed.counts.attested,
    ready: assessed.counts.ready,
    warning: assessed.counts.warning,
    blocked: assessed.counts.blocked,
  };
  const blockedIds = Object.entries(assessed.byId)
    .filter(([, result]) => result.gate === 'blocked')
    .map(([id]) => safeSlug(id, 'blocked question id'))
    .sort();
  const errors = source.attestationErrors.map(normalizeAttestationError)
    .sort((left, right) => (
      left.slugPrefix.localeCompare(right.slugPrefix) || left.code.localeCompare(right.code)
    ));

  const digest = {
    schemaVersion: 1,
    gate: 'ready',
    qbank: { counts, warningCount: counts.warning, blockedIds },
    topics: topicSummary(manifestPages, topicMeta),
    reviewed: reviewedSummary(manifestItems, reviewed),
    reattestation: { count: reattestationSlugs.length, slugs: reattestationSlugs },
    attestation: {
      status: errors.length ? 'invalid' : 'ready',
      errorCount: errors.length,
      errors,
    },
  };
  if (counts.blocked > 0 || errors.length > 0) digest.gate = 'blocked';
  else if (reviewQueuePresent(digest)) digest.gate = 'review';
  return digest;
}

export function renderGovernanceMarkdown(digest) {
  const ids = digest.qbank.blockedIds.length ? digest.qbank.blockedIds.join(', ') : 'none';
  return [
    '# Faculty governance digest',
    '',
    `Gate: **${digest.gate}**`,
    '',
    `Questions: ${digest.qbank.counts.total} total; ${digest.qbank.counts.draft} draft; `
      + `${digest.qbank.counts.attested} attested; ${digest.qbank.counts.ready} ready; `
      + `${digest.qbank.counts.warning} warning; ${digest.qbank.counts.blocked} blocked.`,
    `Blocked question IDs: ${ids}`,
    `High-risk topics: ${digest.topics.highRisk.complete}/${digest.topics.highRisk.total} complete.`,
    `Other topic metadata missing: ${digest.topics.other.metadataMissing}.`,
    `Reviewed coverage: ${digest.reviewed.reviewed}/${digest.reviewed.total}; `
      + `${digest.reviewed.pending} pending; ${digest.reviewed.missing} missing.`,
    `Re-attestation queue: ${digest.reattestation.count}.`,
    `Attestation consistency: ${digest.attestation.status} (${digest.attestation.errorCount} error(s)).`,
    '',
    'Faculty review remains required. This automation does not attest, approve, or modify content.',
    '',
  ].join('\n');
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function manifestInputs(manifest) {
  const md = Array.isArray(manifest.md) ? manifest.md : fail('manifest md must be an array');
  const tools = Array.isArray(manifest.tools) ? manifest.tools : fail('manifest tools must be an array');
  const slugs = (rows, label) => rows.map((row, index) => {
    if (!Array.isArray(row) || row.length < 2) fail(`${label}[${index}] must be a manifest tuple`);
    return safeSlug(row[1], `${label}[${index}] slug`);
  });
  return { manifestPages: slugs(md, 'manifest md'), manifestItems: [...slugs(md, 'manifest md'), ...slugs(tools, 'manifest tools')] };
}

export function parseAttestationValidatorResult(result) {
  object(result, 'attestation validator result');
  if (result.error) throw result.error;
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (stderr.trim()) throw new Error('attestation validator wrote unexpected stderr');
  if (result.status === 0 && /^attestation consistency OK\b/.test(stdout.trim())) return [];
  const lines = stdout.split(/\r?\n/).filter((line) => /^\s*-\s+/.test(line));
  if (
    result.status === 1
    && /^attestation consistency INVALID\b/.test(stdout.trim())
    && lines.length > 0
    && lines.length <= 256
  ) {
    return lines.map((line) => line.replace(/^\s*-\s+/, ''));
  }
  throw new Error('attestation validator did not return a recognized contract');
}

function runAttestationValidator() {
  const validator = path.join(ROOT, '13_Faculty_Resources/_automation/validate_attestation_consistency.py');
  return parseAttestationValidatorResult(spawnSync('python3', [validator], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1_048_576,
  }));
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--out-json', '--out-md'].includes(flag) || !value) fail('CLI arguments are invalid');
    result[flag] = value;
  }
  if (!result['--out-json'] || !result['--out-md']) fail('both output paths are required');
  return result;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    const manifest = readJson('13_Faculty_Resources/_automation/site_build/site_manifest.json');
    const { manifestPages, manifestItems } = manifestInputs(manifest);
    const bankWrapper = readJson('question_bank.json');
    const digest = buildGovernanceDigest({
      bank: bankWrapper.items,
      manifestPages,
      manifestItems,
      topicMeta: readJson('topic_meta.json'),
      reviewed: readJson('13_Faculty_Resources/reviewed.json'),
      needsReattest: readJson(
        '13_Faculty_Resources/_automation/surveillance/config/needs_reattest.json',
      ),
      attestationErrors: runAttestationValidator(),
    });
    writeFileSync(args['--out-json'], `${JSON.stringify(digest, null, 2)}\n`, 'utf8');
    writeFileSync(args['--out-md'], renderGovernanceMarkdown(digest), 'utf8');
    return digest.gate === 'blocked' ? 2 : 0;
  } catch {
    console.error('governance digest failed');
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
