#!/usr/bin/env node
/**
 * ledger_overlay.mjs — put the attestation ledger's sign-offs into this build (ADR-003).
 *
 * Runs FIRST in build_and_check.sh, before any validator, test or builder reads the ledger
 * files, so every one of them judges the combined record and nothing downstream needs to know
 * the ledger exists. It rewrites the WORKING COPIES of reviewed.json, topic_meta.json and
 * question_bank.json in the build checkout; on Netlify that checkout is thrown away, and
 * locally build_and_check.sh backs the three files up and restores them on exit.
 *
 *   CLERKSHIP_LEDGER=on             enable (set per learner site in the Netlify UI at activation)
 *   CLERKSHIP_LEDGER_REPO=<url>     default https://github.com/jmoss333/psychiatry-clerkship.git
 *   CLERKSHIP_LEDGER_BRANCH=<name>  default attestations
 *   CLERKSHIP_LEDGER_FILE=<path>    read the ledger from a local file instead of fetching
 *
 *   node ledger_overlay.mjs [--root DIR] [--receipt FILE] [--backup DIR]
 *   node ledger_overlay.mjs --restore DIR [--root DIR]
 *
 * EXIT CODES — the whole failure policy, and the reason for each:
 *   0  applied; OR off; OR the ledger could not be FETCHED (baseline only, loud warning).
 *      Unreachable can only UNDER-claim: a signed page shows pending, never the reverse (L-4).
 *   1  the ledger was fetched and is NOT TRUSTWORTHY — a bad signature, a broken chain, an
 *      unknown or revoked key, a malformed line. The build is refused, so the last good
 *      deploy stays live (L-3). Emergency override: CLERKSHIP_LEDGER=off ships baseline only.
 *   2  usage error, or the baseline itself cannot be read.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  KEYS_PATH,
  LEDGER_BRANCH,
  LEDGER_FILE,
  LedgerError,
  applyLedger,
  verifyLedger,
} from '../../../faculty-console/ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, '../../..');
export const DEFAULT_REPO_URL = 'https://github.com/jmoss333/psychiatry-clerkship.git';
export const OVERLAID = Object.freeze({
  reviewed: '13_Faculty_Resources/reviewed.json',
  topicMeta: 'topic_meta.json',
  qbank: 'question_bank.json',
});
const SHIPPED = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';
const FETCHED_REF = 'refs/clerkship-ledger/fetched';
const MAX_BUFFER = 64 * 1024 * 1024;

class UsageError extends Error {}

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, receipt: null, backup: null, restore: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--root', '--receipt', '--backup', '--restore'].includes(flag)) {
      throw new UsageError(`unknown argument ${flag}`);
    }
    if (!value || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    args[flag.slice(2)] = path.resolve(value);
    index += 1;
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function git(root, args, options = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    ...options,
  });
}

/**
 * The ledger text and the commit it came from, or { ok: false, why } when it could not be
 * reached. A branch with no ledger file yet is an EMPTY ledger, not an unreachable one.
 */
export function fetchLedger(root, repoUrl, branch) {
  const fetched = git(root, ['fetch', '--no-tags', '--depth=1', '--quiet', repoUrl,
    `+refs/heads/${branch}:${FETCHED_REF}`]);
  if (fetched.status !== 0) {
    const why = (fetched.stderr || fetched.error?.message || 'git fetch failed').trim().split('\n')[0];
    return { ok: false, why };
  }
  const commit = git(root, ['rev-parse', FETCHED_REF]).stdout.trim();
  const shown = git(root, ['show', `${FETCHED_REF}:${LEDGER_FILE}`]);
  if (shown.status !== 0) return { ok: true, text: '', commit, note: `no ${LEDGER_FILE} on ${branch}` };
  return { ok: true, text: shown.stdout, commit };
}

function writeReceipt(file, receipt) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, receipt);
}

function restore(root, dir) {
  for (const relative of Object.values(OVERLAID)) {
    const saved = path.join(dir, relative);
    if (fs.existsSync(saved)) fs.copyFileSync(saved, path.join(root, relative));
  }
}

export function run(argv = process.argv.slice(2), env = process.env, log = console) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    log.error(`ledger overlay: ${error.message}`);
    return 2;
  }
  if (args.restore) {
    restore(args.root, args.restore);
    log.log('ledger overlay: baseline files restored');
    return 0;
  }
  const mode = String(env.CLERKSHIP_LEDGER || 'off').trim().toLowerCase();
  if (mode !== 'on') {
    log.log('ledger overlay: off (CLERKSHIP_LEDGER is not "on") — building from the git baseline only');
    return 0;
  }

  const branch = String(env.CLERKSHIP_LEDGER_BRANCH || LEDGER_BRANCH).trim();
  const repoUrl = String(env.CLERKSHIP_LEDGER_REPO || DEFAULT_REPO_URL).trim();
  const localFile = String(env.CLERKSHIP_LEDGER_FILE || '').trim();
  const receiptBase = { schemaVersion: 1, branch, builtAt: new Date().toISOString() };

  let source;
  if (localFile) {
    try {
      source = { ok: true, text: fs.readFileSync(path.resolve(localFile), 'utf8'), commit: null, note: `local file ${localFile}` };
    } catch (error) {
      source = { ok: false, why: `cannot read ${localFile}: ${error.code || error.message}` };
    }
  } else {
    source = fetchLedger(args.root, repoUrl, branch);
  }
  if (!source.ok) {
    log.warn(`ledger overlay: WARNING — the attestation ledger could not be fetched (${source.why}).`);
    log.warn('ledger overlay: building from the git baseline ONLY; ledger sign-offs will show as pending until the next build.');
    writeReceipt(args.receipt, { ...receiptBase, status: 'baseline-only', seq: null, why: source.why });
    return 0;
  }

  let baseline;
  try {
    const keysFile = path.join(args.root, KEYS_PATH);
    baseline = {
      keys: fs.existsSync(keysFile) ? readJson(keysFile) : { version: 1, keys: [] },
      reviewed: readJson(path.join(args.root, OVERLAID.reviewed)),
      topicMeta: readJson(path.join(args.root, OVERLAID.topicMeta)),
      qbank: readJson(path.join(args.root, OVERLAID.qbank)),
      shipped: readJson(path.join(args.root, SHIPPED)),
    };
  } catch (error) {
    log.error(`ledger overlay: cannot read the baseline: ${error.message}`);
    return 2;
  }

  let verified;
  try {
    verified = verifyLedger(source.text, baseline.keys);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    log.error(`ledger overlay: LEDGER INVALID — this build is refused (ADR-003 L-3): ${error.message} [${error.code}]`);
    log.error(`ledger overlay: source ${source.commit ? `${branch}@${source.commit}` : source.note}`);
    log.error('ledger overlay: the last good deploy stays live. Emergency override: set CLERKSHIP_LEDGER=off to ship the git baseline only.');
    return 1;
  }

  const shippedSlugs = new Set((baseline.shipped.pages || []).map(page => page.slug));
  const result = applyLedger({
    reviewed: baseline.reviewed,
    topicMeta: baseline.topicMeta,
    qbank: baseline.qbank,
    events: verified.events,
    shippedSlugs,
  });

  if (args.backup) {
    for (const relative of Object.values(OVERLAID)) {
      const saved = path.join(args.backup, relative);
      fs.mkdirSync(path.dirname(saved), { recursive: true });
      fs.copyFileSync(path.join(args.root, relative), saved);
    }
  }
  const outputs = { reviewed: result.reviewed, topicMeta: result.topicMeta, qbank: result.qbank };
  for (const [key, relative] of Object.entries(OVERLAID)) {
    if (JSON.stringify(outputs[key]) !== JSON.stringify(baseline[key])) {
      writeJson(path.join(args.root, relative), outputs[key]);
    }
  }

  const { report } = result;
  const receipt = {
    ...receiptBase,
    status: 'applied',
    seq: verified.head ? verified.head.seq : 0,
    head: verified.head ? verified.head.hash : null,
    headTs: verified.head ? verified.head.ts : null,
    commit: source.commit,
    events: verified.events.length,
    applied: {
      contentAttested: report.content.attested.length,
      contentReopened: report.content.reopened.length,
      questionAttested: report.question.attested.length,
      questionReopened: report.question.reopened.length,
    },
    skipped: report.skipped,
    questionDrift: report.questionDrift,
  };
  writeReceipt(args.receipt, receipt);
  log.log(`ledger overlay: applied ${verified.events.length} verified event(s) through seq ${receipt.seq}`
    + ` — ${receipt.applied.contentAttested} page(s) signed, ${receipt.applied.contentReopened} reopened,`
    + ` ${receipt.applied.questionAttested} question(s) signed, ${receipt.applied.questionReopened} reopened`);
  for (const skip of report.skipped) log.warn(`ledger overlay: skipped ${skip.kind} ${skip.id} — ${skip.why}`);
  for (const id of report.questionDrift) {
    log.warn(`ledger overlay: question ${id} changed after it was signed — left unsigned until re-signed`);
  }
  if (source.note) log.warn(`ledger overlay: note — ${source.note}`);
  return 0;
}

// Run when executed, not when imported. Compare REAL paths: on macOS /tmp is a symlink to
// /private/tmp, so argv[1] and import.meta.url name the same file differently — and a plain
// comparison made this CLI exit 0 having done nothing, in the build, over a tampered ledger.
// (build_and_check.sh now also refuses a ledger build that produced no receipt.)
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = run();
}
