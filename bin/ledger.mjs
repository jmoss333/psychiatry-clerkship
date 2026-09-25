#!/usr/bin/env node
/**
 * bin/ledger.mjs — look at the attestation ledger from a terminal (ADR-003).
 *
 *   node bin/ledger.mjs verify    [--file PATH]          verify every signature and the whole chain
 *   node bin/ledger.mjs status    [--file PATH]          head, counts, and what each learner site serves
 *   node bin/ledger.mjs materialize --out DIR [--file PATH]
 *                                  write reviewed.json / topic_meta.json / question_bank.json WITH the
 *                                  ledger applied, for report tools that read the git baseline only
 *   node bin/ledger.mjs audit                             every commit on the branch must only APPEND
 *
 * Without --file the ledger is fetched from the `attestations` branch (CLERKSHIP_LEDGER_REPO /
 * CLERKSHIP_LEDGER_BRANCH override). Report-only: it never writes the ledger or the repository.
 * Exit 0 clean · 1 the ledger is not trustworthy · 2 could not check.
 *
 * WHY `audit` EXISTS. Signatures and the hash chain catch any edit, insertion, reordering or
 * forgery — but not a commit that deletes lines off the END: what is left is still a valid
 * chain. That only ever UNDER-claims (sign-offs vanish; nothing false appears), and the branch
 * ruleset forbids force-pushes, so the history of every truncation is still on the branch.
 * `audit` walks it and fails when any commit's ledger is not its parent's ledger plus lines.
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
} from '../faculty-console/ledger.mjs';
import { readReceipt } from '../faculty-console/ledger-publish.mjs';
import { DEFAULT_REPO_URL, OVERLAID, fetchLedger } from '../13_Faculty_Resources/_automation/site_build/ledger_overlay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';
const SITES = {
  ms3: 'https://une-ms3-psychiatry.netlify.app',
  res: 'https://mmc-psychiatry-residents-sanford.netlify.app',
};

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
}

function keys() {
  const file = path.join(ROOT, KEYS_PATH);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { version: 1, keys: [] };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function loadText(args) {
  const file = option(args, '--file');
  if (file) return { text: fs.readFileSync(path.resolve(file), 'utf8'), where: file };
  const branch = process.env.CLERKSHIP_LEDGER_BRANCH || LEDGER_BRANCH;
  const fetched = fetchLedger(ROOT, process.env.CLERKSHIP_LEDGER_REPO || DEFAULT_REPO_URL, branch);
  if (!fetched.ok) throw new Error(`could not fetch the ledger: ${fetched.why}`);
  return { text: fetched.text, where: `${branch}@${fetched.commit}` };
}

function git(args) {
  return spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

async function main(argv) {
  const [command, ...args] = argv;
  if (!['verify', 'status', 'materialize', 'audit'].includes(command)) {
    console.error('usage: node bin/ledger.mjs verify|status|materialize|audit [--file PATH] [--out DIR]');
    return 2;
  }

  if (command === 'audit') {
    const branch = process.env.CLERKSHIP_LEDGER_BRANCH || LEDGER_BRANCH;
    const url = process.env.CLERKSHIP_LEDGER_REPO || DEFAULT_REPO_URL;
    const ref = 'refs/clerkship-ledger/audit';
    const fetched = git(['fetch', '--no-tags', '--quiet', url, `+refs/heads/${branch}:${ref}`]);
    if (fetched.status !== 0) {
      console.error(`ledger audit: could not fetch ${branch}: ${fetched.stderr.trim()}`);
      return 2;
    }
    const commits = git(['rev-list', '--reverse', '--first-parent', ref]).stdout.split('\n').filter(Boolean);
    let previous = '';
    for (const commit of commits) {
      const shown = git(['show', `${commit}:${LEDGER_FILE}`]);
      const text = shown.status === 0 ? shown.stdout : '';
      if (!text.startsWith(previous)) {
        console.error(`ledger audit: FAIL — commit ${commit.slice(0, 10)} does not only append to ${LEDGER_FILE}`);
        return 1;
      }
      previous = text;
    }
    try {
      verifyLedger(previous, keys());
    } catch (error) {
      console.error(`ledger audit: FAIL — the current ledger does not verify: ${error.message}`);
      return 1;
    }
    console.log(`ledger audit: OK — ${commits.length} commit(s) on ${branch}, each only appended; the head verifies`);
    return 0;
  }

  let loaded;
  try {
    loaded = loadText(args);
  } catch (error) {
    console.error(`ledger ${command}: ${error.message}`);
    return 2;
  }
  let verified;
  try {
    verified = verifyLedger(loaded.text, keys());
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    console.error(`ledger ${command}: NOT TRUSTWORTHY — ${error.message} [${error.code}] (${loaded.where})`);
    return 1;
  }

  if (command === 'verify') {
    console.log(`ledger verify: OK — ${verified.events.length} event(s), every signature and link verified`
      + (verified.head ? `; head seq ${verified.head.seq} at ${verified.head.ts}` : '') + ` (${loaded.where})`);
    return 0;
  }

  if (command === 'status') {
    const kinds = { content: 0, question: 0 };
    for (const event of verified.events) kinds[event.kind] += 1;
    console.log(`ledger: ${verified.events.length} event(s) — ${kinds.content} page/tool, ${kinds.question} question`
      + (verified.head ? `; head seq ${verified.head.seq} at ${verified.head.ts}` : ''));
    for (const [site, url] of Object.entries(SITES)) {
      const receipt = await readReceipt(url, globalThis.fetch);
      const behind = receipt && verified.head && Number.isSafeInteger(receipt.seq) && receipt.seq < verified.head.seq;
      console.log(`  ${site}: ${receipt ? `${receipt.status}, serves seq ${receipt.seq ?? '—'} (built ${receipt.builtAt})` : 'no receipt (ledger not switched on for this site?)'}`
        + (behind ? ' — BEHIND, publish pending' : ''));
    }
    return 0;
  }

  const out = option(args, '--out');
  if (!out) {
    console.error('ledger materialize: --out DIR is required');
    return 2;
  }
  const shipped = readJson(SHIPPED);
  const result = applyLedger({
    reviewed: readJson(OVERLAID.reviewed),
    topicMeta: readJson(OVERLAID.topicMeta),
    qbank: readJson(OVERLAID.qbank),
    events: verified.events,
    shippedSlugs: new Set(shipped.pages.map(page => page.slug)),
  });
  for (const [key, relative] of Object.entries(OVERLAID)) {
    const target = path.join(path.resolve(out), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(result[key], null, 2)}\n`, 'utf8');
  }
  console.log(`ledger materialize: wrote the combined record to ${out} (${verified.events.length} event(s) applied)`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
