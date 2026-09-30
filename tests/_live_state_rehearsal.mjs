/* Rehearses the faculty's work against the tests that read it.

Loaded with `node --import <this file> --test <test file>` and LIVE_STATE_SCENARIO=<name>. For
that one run, every read of the named governed file through node:fs returns the file as it
would read after the scenario: the queue drained, or the queue refilled. Nothing on disk changes.
Without LIVE_STATE_SCENARIO this module patches nothing, so the test that imports it for the
scenario list is unaffected.

Each scenario is something that legitimately happens on main, so a test that goes red under one
is a test that will go red for being right:
  qbank-drained   faculty attest every live draft question (#895 did exactly this)
  qbank-retired   faculty retire every live draft question instead of attesting it
  ledger-signed   faculty sign every pending page (#725 signed 101 at once)
  ledger-pending  a content change reopens every signed page (registration, the honest demotion)
  meta-demoted    a content change demotes every facultyReview block in topic_meta.json

WHAT IT CANNOT REDIRECT: a read made by a subprocess the test spawns (Python, a shell) sees the
real file. A test whose check depends on a subprocess agreeing with node about the same file is
registered with `rehearse: false` and the reason. */

import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const GOVERNED_FILES = Object.freeze({
  qbank: path.join(ROOT, 'question_bank.json'),
  ledger: path.join(ROOT, '13_Faculty_Resources', 'reviewed.json'),
  meta: path.join(ROOT, 'topic_meta.json'),
});

const REHEARSAL_DAY = '2026-01-01';
const live = (item) => item && !item.retired;

export const SCENARIOS = Object.freeze({
  'qbank-drained': {
    source: 'qbank',
    says: 'faculty attested every live draft question',
    apply(doc) {
      for (const item of doc.items || []) if (live(item) && item.status === 'draft') item.status = 'attested';
    },
    holds: (doc) => !(doc.items || []).some((item) => live(item) && item.status === 'draft'),
  },
  'qbank-retired': {
    source: 'qbank',
    says: 'faculty retired every live draft question',
    apply(doc) {
      for (const item of doc.items || []) {
        if (live(item) && item.status === 'draft') {
          item.retired = true;
          item.retiredReason = 'Retired in a live-state rehearsal.';
        }
      }
    },
    holds: (doc) => !(doc.items || []).some((item) => live(item) && item.status === 'draft'),
  },
  'ledger-signed': {
    source: 'ledger',
    says: 'faculty signed every pending page',
    apply(doc) {
      for (const [slug, row] of Object.entries(doc)) {
        if (!row || typeof row !== 'object' || row.status !== 'pending') continue;
        const { reason, ...kept } = row;
        doc[slug] = { ...kept, status: 'reviewed', at: REHEARSAL_DAY, by: 'Joshua Moss, MD' };
      }
    },
    holds: (doc) => !Object.values(doc).some((row) => row && row.status === 'pending'),
  },
  'ledger-pending': {
    source: 'ledger',
    says: 'a content change reopened every signed page',
    apply(doc) {
      for (const [slug, row] of Object.entries(doc)) {
        if (!row || typeof row !== 'object' || row.status !== 'reviewed') continue;
        doc[slug] = {
          status: 'pending',
          ...(row.risk ? { risk: row.risk } : {}),
          reason: 'Reopened in a live-state rehearsal: the page changed after sign-off.',
          at: REHEARSAL_DAY,
          by: 'Pending faculty review',
        };
      }
    },
    holds: (doc) => !Object.values(doc).some((row) => row && row.status === 'reviewed'),
  },
  'meta-demoted': {
    source: 'meta',
    says: "a content change demoted every page's facultyReview block",
    apply(doc) {
      for (const record of Object.values(doc)) {
        const review = record && typeof record === 'object' ? record.facultyReview : null;
        if (!review || review.status === 'pending') continue;
        record.facultyReview = { status: 'pending' };
      }
    },
    holds: (doc) => !Object.values(doc).some((record) => record?.facultyReview && record.facultyReview.status !== 'pending'),
  },
});

/* Re-serialise the way the repository writes these files: the original indent, raw UTF-8
   (the Python writers use ensure_ascii=False), and the original trailing newline. */
export function rewrite(text, apply) {
  const doc = JSON.parse(text);
  apply(doc);
  const indent = (text.match(/^\{\n( +)/) || [])[1]?.length ?? 2;
  return JSON.stringify(doc, null, indent) + (text.endsWith('\n') ? '\n' : '');
}

function install(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    throw new Error(`LIVE_STATE_SCENARIO=${name} is not a scenario; known: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  const target = GOVERNED_FILES[scenario.source];
  const original = fs.readFileSync(target, 'utf8');
  const rewritten = rewrite(original, scenario.apply);

  const isTarget = (file) => {
    try {
      let p = file;
      if (p instanceof URL) p = fileURLToPath(p);
      else if (Buffer.isBuffer(p)) p = p.toString('utf8');
      if (typeof p !== 'string') return false;
      if (p.startsWith('file:')) p = fileURLToPath(p);
      return path.resolve(p) === target;
    } catch {
      return false;
    }
  };
  const encodingOf = (options) => (typeof options === 'string' ? options : options?.encoding) || null;
  const serve = (options) => {
    const encoding = encodingOf(options);
    return encoding ? Buffer.from(rewritten, 'utf8').toString(encoding) : Buffer.from(rewritten, 'utf8');
  };

  const readFileSync = fs.readFileSync;
  fs.readFileSync = function rehearsedReadFileSync(file, options) {
    return isTarget(file) ? serve(options) : readFileSync.apply(this, arguments);
  };
  const readFile = fs.readFile;
  fs.readFile = function rehearsedReadFile(file, options, callback) {
    if (!isTarget(file)) return readFile.apply(this, arguments);
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? undefined : options;
    process.nextTick(() => cb(null, serve(opts)));
    return undefined;
  };
  const promisesReadFile = fs.promises.readFile;
  fs.promises.readFile = async function rehearsedPromisesReadFile(file, options) {
    return isTarget(file) ? serve(options) : promisesReadFile.apply(this, arguments);
  };
  syncBuiltinESMExports();
}

if (process.env.LIVE_STATE_SCENARIO) install(process.env.LIVE_STATE_SCENARIO);
