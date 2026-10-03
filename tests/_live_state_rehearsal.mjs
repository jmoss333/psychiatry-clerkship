/* Rehearses the faculty's work against the tests that read it.

Loaded through NODE_OPTIONS=--import=<this file> with LIVE_STATE_SCENARIO=<name>, so every node
process of the run is rehearsed, including node subprocesses the test spawns. For that run,
every node:fs read of a governed file the scenario touches returns the file as it would read
after the scenario. Nothing on disk changes, and the run may not change anything either: a write
into the repository is refused while the process can see fabricated sign-offs.
Without LIVE_STATE_SCENARIO this module patches nothing, so the test that imports it for the
scenario list is unaffected.

EVERY SCENARIO IS A STATE THE CONSOLE OR AN HONEST CONTENT CHANGE CAN PRODUCE ON MAIN, with the
ledger and topic_meta.json kept in step the way the console keeps them. A test that goes red
under one is either reading the faculty's queue or objecting to a state the real system cannot
make; the second means the scenario is wrong, and the fix belongs HERE, never in the test.
  qbank-drained   faculty attest every live draft question (#895 did exactly this)
  qbank-retired   faculty retire every live draft question instead
  pages-signed    faculty sign every pending page: status reviewed, today's date, and a
                  contentHash / clinicalHash computed from today's text by the console's own
                  hash module; the page's topic_meta facultyReview block is promoted with it
  pages-reopened  a content change demotes every signed page: the ledger row and its
                  facultyReview block both go to pending (registration)
  pages-drifted   the text changes under every signature without a demotion: rows stay
                  reviewed but their stored hashes no longer match (ADR-003 drift)

WHAT IT CANNOT REDIRECT: a read by a non-node subprocess (Python, a shell) sees the real file,
and so does a JSON module import (`import x from './f.json' with { type: 'json' }`) or a read
through a stream or a file handle. Those do not pass silently: every redirected read is counted
in LIVE_STATE_COUNT_FILE, and tests/live-governance-state.test.mjs fails a rehearsal in which a
file the test is registered as reading was never redirected. */

import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clinicalManifestForSlug,
  clinicalSourceSha,
  digestFromManifest,
  manifestForSlug,
  sourceBlobSha,
  sourcesForSlug,
} from '../faculty-console/attestation-hash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED_PAGES = path.join(ROOT, '13_Faculty_Resources', '_automation', 'site_build', 'shipped_pages.json');
const OWNER = 'Joshua Moss, MD';
const PENDING = 'Pending faculty review';

export const GOVERNED_FILES = Object.freeze({
  qbank: path.join(ROOT, 'question_bank.json'),
  ledger: path.join(ROOT, '13_Faculty_Resources', 'reviewed.json'),
  meta: path.join(ROOT, 'topic_meta.json'),
});

const today = () => new Date().toISOString().slice(0, 10);
const live = (item) => item && !item.retired;
const rows = (ledger) => Object.entries(ledger).filter(([, row]) => row && typeof row === 'object');

/* The hashes the console would store for `slug` today, or null for a ledger-only legacy row
   (no shipped source: the console signs those without a hash too). */
function boundHashes(slug, meta, readReal) {
  const shipped = JSON.parse(readReal(SHIPPED_PAGES, 'utf8'));
  const paths = sourcesForSlug(shipped, slug);
  if (!paths.length) return null;
  const content = {};
  const clinical = {};
  for (const source of paths) {
    const bytes = readReal(path.join(ROOT, source));
    content[source] = sourceBlobSha(source, bytes);
    clinical[source] = clinicalSourceSha(source, bytes);
  }
  const record = Object.hasOwn(meta, slug) ? meta[slug] : undefined;
  return {
    contentHash: digestFromManifest(manifestForSlug(slug, content, record)),
    clinicalHash: digestFromManifest(clinicalManifestForSlug(slug, clinical, record)),
  };
}

/* Each scenario edits one or two governed files. `edit` receives the parsed documents it
   touches (topic_meta.json first, so a ledger hash can cover the promoted record) and mutates
   them in place; `holds` states what must be true afterwards, per file. */
export const SCENARIOS = Object.freeze({
  'qbank-drained': {
    touches: ['qbank'],
    says: 'faculty attested every live draft question',
    edit({ qbank }) {
      for (const item of qbank.items || []) if (live(item) && item.status === 'draft') item.status = 'attested';
    },
    holds: { qbank: (doc) => !(doc.items || []).some((item) => live(item) && item.status === 'draft') },
  },
  'qbank-retired': {
    touches: ['qbank'],
    says: 'faculty retired every live draft question',
    edit({ qbank }) {
      for (const item of qbank.items || []) {
        if (live(item) && item.status === 'draft') {
          item.retired = true;
          item.retiredReason = 'Retired in a live-state rehearsal.';
        }
      }
    },
    holds: { qbank: (doc) => !(doc.items || []).some((item) => live(item) && item.status === 'draft') },
  },
  'pages-signed': {
    touches: ['meta', 'ledger'],
    says: 'faculty signed every pending page',
    edit({ meta, ledger }, readReal) {
      const date = today();
      for (const [slug, row] of rows(ledger)) {
        if (row.status !== 'pending') continue;
        const block = meta[slug]?.facultyReview;
        if (block && block.status !== 'reviewed') {
          meta[slug].facultyReview = { lastReviewed: date, reviewer: OWNER, status: 'reviewed' };
        }
        const { reason, contentHash, clinicalHash, ...kept } = row;
        const hashes = boundHashes(slug, meta, readReal);
        ledger[slug] = { ...kept, status: 'reviewed', at: date, by: OWNER, ...(hashes || {}) };
      }
    },
    holds: { ledger: (doc) => !Object.values(doc).some((row) => row && row.status === 'pending') },
  },
  'pages-reopened': {
    touches: ['meta', 'ledger'],
    says: 'a content change reopened every signed page',
    edit({ meta, ledger }) {
      const date = today();
      for (const record of Object.values(meta)) {
        const block = record && typeof record === 'object' ? record.facultyReview : null;
        if (block && block.status !== 'pending') record.facultyReview = { status: 'pending' };
      }
      for (const [slug, row] of rows(ledger)) {
        if (row.status !== 'reviewed') continue;
        ledger[slug] = {
          status: 'pending',
          ...(row.risk ? { risk: row.risk } : {}),
          reason: 'Reopened in a live-state rehearsal: the page changed after sign-off.',
          at: date,
          by: PENDING,
        };
      }
    },
    holds: {
      ledger: (doc) => !Object.values(doc).some((row) => row && row.status === 'reviewed'),
      meta: (doc) => !Object.values(doc).some((record) => record?.facultyReview && record.facultyReview.status !== 'pending'),
    },
  },
  'pages-drifted': {
    touches: ['ledger'],
    says: 'the text changed under every signature without a demotion',
    edit({ ledger }) {
      const shift = (hash) => (typeof hash === 'string' && /^[0-9a-f]{40}$/.test(hash)
        ? digestFromManifest(`drifted ${hash}\n`) : hash);
      for (const [, row] of rows(ledger)) {
        if (row.status !== 'reviewed') continue;
        if ('contentHash' in row) row.contentHash = shift(row.contentHash);
        if ('clinicalHash' in row) row.clinicalHash = shift(row.clinicalHash);
      }
    },
    holds: { ledger: () => true },
  },
});

/* Re-serialise the way the repository writes these files: the original indent, raw UTF-8
   (the Python writers use ensure_ascii=False), and the original trailing newline. A writer
   that formats differently only changes bytes, never meaning, and nothing here compares bytes. */
export function serialise(doc, like) {
  const indent = (like.match(/^\{\n( +)/) || [])[1]?.length ?? 2;
  return JSON.stringify(doc, null, indent) + (like.endsWith('\n') ? '\n' : '');
}

/* The scenario applied to the real files: { source: rewrittenText }. */
export function rehearsedFiles(name, readReal = fs.readFileSync) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    throw new Error(`LIVE_STATE_SCENARIO=${name} is not a scenario; known: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  const originals = Object.fromEntries(scenario.touches.map((source) => [source, readReal(GOVERNED_FILES[source], 'utf8')]));
  const docs = Object.fromEntries(Object.entries(originals).map(([source, text]) => [source, JSON.parse(text)]));
  scenario.edit(docs, readReal);
  return Object.fromEntries(Object.entries(docs).map(([source, doc]) => [source, serialise(doc, originals[source])]));
}

function install(name) {
  const real = {
    readFileSync: fs.readFileSync,
    readFile: fs.readFile,
    promisesReadFile: fs.promises.readFile,
    copyFileSync: fs.copyFileSync,
    promisesCopyFile: fs.promises.copyFile,
    appendFileSync: fs.appendFileSync,
    statSync: fs.statSync,
    fstatSync: fs.fstatSync,
  };
  const rewritten = rehearsedFiles(name, real.readFileSync);
  const targets = Object.keys(rewritten).map((source) => {
    const file = GOVERNED_FILES[source];
    const { dev, ino } = real.statSync(file);
    return { source, file, base: path.basename(file), dev, ino, text: rewritten[source] };
  });

  const countFile = process.env.LIVE_STATE_COUNT_FILE;
  const record = (source) => {
    if (countFile) real.appendFileSync(countFile, `${process.pid} ${source}\n`);
  };

  const toPath = (file) => {
    if (file instanceof URL) return fileURLToPath(file);
    if (Buffer.isBuffer(file)) return file.toString('utf8');
    if (typeof file === 'string' && file.startsWith('file:')) return fileURLToPath(file);
    return file;
  };
  /* Matched by device and inode, so a symlinked checkout or a relative path still matches;
     the basename check keeps that stat off every unrelated read. */
  const targetOf = (file) => {
    try {
      if (typeof file === 'number') {
        const { dev, ino } = real.fstatSync(file);
        return targets.find((t) => t.dev === dev && t.ino === ino) || null;
      }
      const p = toPath(file);
      if (typeof p !== 'string') return null;
      const candidates = targets.filter((t) => path.basename(p) === t.base);
      if (!candidates.length) return null;
      const { dev, ino } = real.statSync(p);
      return candidates.find((t) => t.dev === dev && t.ino === ino) || null;
    } catch {
      return null;
    }
  };
  const encodingOf = (options) => (typeof options === 'string' ? options : options?.encoding) || null;
  const serve = (target, options) => {
    record(target.source);
    const encoding = encodingOf(options);
    const bytes = Buffer.from(target.text, 'utf8');
    return encoding ? bytes.toString(encoding) : bytes;
  };

  fs.readFileSync = function rehearsedReadFileSync(file, options) {
    const target = targetOf(file);
    return target ? serve(target, options) : real.readFileSync.apply(this, arguments);
  };
  fs.readFile = function rehearsedReadFile(file, options, callback) {
    const target = targetOf(file);
    if (!target) return real.readFile.apply(this, arguments);
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? undefined : options;
    process.nextTick(() => cb(null, serve(target, opts)));
    return undefined;
  };
  fs.promises.readFile = async function rehearsedPromisesReadFile(file, options) {
    const target = targetOf(file);
    return target ? serve(target, options) : real.promisesReadFile.apply(this, arguments);
  };

  /* No write into the repository while this process can see fabricated sign-offs, or a test
     that regenerates an artifact would land a rehearsal's invented state on disk. Temp dirs are
     fine; a copy OF a governed file carries the rehearsed text, so a sandbox sees the scenario. */
  const tmpDirs = [os.tmpdir(), fs.realpathSync(os.tmpdir())];
  const guard = (file, verb) => {
    const p = toPath(file);
    if (typeof p !== 'string') return;
    const resolved = path.resolve(p);
    const inside = (dir) => resolved === dir || resolved.startsWith(`${dir}${path.sep}`);
    if (inside(ROOT) && !tmpDirs.some(inside)) {
      throw new Error(`live-state rehearsal (${name}): refusing to ${verb} ${path.relative(ROOT, resolved)} -- `
        + 'a rehearsed test must not write into the repository while it sees fabricated sign-offs');
    }
  };
  const guarded = (owner, key, verb, pick = (args) => [args[0]]) => {
    const original = owner[key];
    owner[key] = function guardedWrite(...args) {
      for (const file of pick(args)) guard(file, verb);
      return original.apply(this, args);
    };
  };
  for (const key of ['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream']) guarded(fs, key, 'write');
  for (const key of ['writeFile', 'appendFile']) guarded(fs.promises, key, 'write');
  for (const key of ['renameSync', 'rename']) guarded(fs, key, 'move a file to', (args) => [args[1]]);
  guarded(fs.promises, 'rename', 'move a file to', (args) => [args[1]]);

  fs.copyFileSync = function rehearsedCopyFileSync(src, dest) {
    guard(dest, 'copy into');
    const target = targetOf(src);
    if (!target) return real.copyFileSync.apply(this, arguments);
    record(target.source);
    return fs.writeFileSync(dest, target.text);
  };
  fs.promises.copyFile = async function rehearsedPromisesCopyFile(src, dest) {
    guard(dest, 'copy into');
    const target = targetOf(src);
    if (!target) return real.promisesCopyFile.apply(this, arguments);
    record(target.source);
    return fs.promises.writeFile(dest, target.text);
  };
  syncBuiltinESMExports();
}

if (process.env.LIVE_STATE_SCENARIO) install(process.env.LIVE_STATE_SCENARIO);
