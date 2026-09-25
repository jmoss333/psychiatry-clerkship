// The build-side reader (13_Faculty_Resources/_automation/site_build/ledger_overlay.mjs,
// ADR-003). Drives the real CLI against a throwaway repository root: off changes nothing;
// on applies a verified ledger and writes the receipt; a tampered ledger exits 1 and leaves
// every file untouched; an unreachable ledger builds the baseline (exit 0); restore puts the
// baseline back byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { appendEvents, loadSigner } from '../faculty-console/ledger.mjs';
import { scrubInheritedGitEnv } from './_git_env.mjs';

// Builds git repositories: an inherited GIT_DIR would aim them at the repo running this file.
scrubInheritedGitEnv();

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(repo, '13_Faculty_Resources/_automation/site_build/ledger_overlay.mjs');
const HASH = 'a'.repeat(40);

function signer() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return loadSigner(privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'));
}

function keysDoc(s) {
  return { version: 1, keys: [{ keyId: s.keyId, algorithm: 'ed25519',
    publicKeyPem: s.publicKey.export({ type: 'spki', format: 'pem' }), addedAt: '2026-09-25', revokedAt: null }] };
}

function write(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(s) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-overlay-'));
  write(root, '13_Faculty_Resources/ledger/keys.json', keysDoc(s));
  write(root, '13_Faculty_Resources/reviewed.json', {
    't_mood.md': { status: 'pending', risk: { kind: 'clinical', level: 'high' }, at: '2026-09-20',
      by: 'Pending faculty review', reason: 'New page.' },
  });
  write(root, 'topic_meta.json', { 't_mood.md': { tldr: 'x', facultyReview: { status: 'pending' } } });
  write(root, 'question_bank.json', { version: 1, items: [] });
  write(root, '13_Faculty_Resources/_automation/site_build/shipped_pages.json',
    { version: 1, pages: [{ slug: 't_mood.md', source: '03/t_mood.md' }] });
  return root;
}

function ledgerText(s, drafts) {
  return appendEvents({ existingText: '', keysDoc: keysDoc(s), drafts, ts: '2026-09-25T12:00:00.000Z',
    by: 'Joshua Moss, MD', base: 'b'.repeat(40), signer: s }).text;
}

function run(root, env, extra = []) {
  const receipt = path.join(root, '_build/ledger-receipt.json');
  const proc = spawnSync(process.execPath, [CLI, '--root', root, '--receipt', receipt, ...extra], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
  return { ...proc, receipt };
}

function snapshot(root) {
  return ['13_Faculty_Resources/reviewed.json', 'topic_meta.json', 'question_bank.json']
    .map(relative => fs.readFileSync(path.join(root, relative), 'utf8'));
}

test('off (the default) changes nothing and writes no receipt', () => {
  const s = signer();
  const root = fixture(s);
  const before = snapshot(root);
  const proc = run(root, {});
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /ledger overlay: off/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(fs.existsSync(proc.receipt), false);
});

test('on: a verified ledger is applied and the receipt names the seq it applied', () => {
  const s = signer();
  const root = fixture(s);
  const ledgerFile = path.join(root, 'events.jsonl');
  fs.writeFileSync(ledgerFile, ledgerText(s, [{ type: 'attest', kind: 'content', id: 't_mood.md', contentHash: HASH }]));
  const proc = run(root, { CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_FILE: ledgerFile });
  assert.equal(proc.status, 0, proc.stderr);
  const reviewed = JSON.parse(fs.readFileSync(path.join(root, '13_Faculty_Resources/reviewed.json'), 'utf8'));
  assert.equal(reviewed['t_mood.md'].status, 'reviewed');
  assert.equal(reviewed['t_mood.md'].contentHash, HASH);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'topic_meta.json'), 'utf8'));
  assert.equal(meta['t_mood.md'].facultyReview.status, 'reviewed');
  const receipt = JSON.parse(fs.readFileSync(proc.receipt, 'utf8'));
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.status, 'applied');
  assert.equal(receipt.seq, 1);
  assert.equal(receipt.applied.contentAttested, 1);
  // The rewritten files keep the repository's own formatting.
  assert.equal(fs.readFileSync(path.join(root, 'question_bank.json'), 'utf8'), '{\n  "version": 1,\n  "items": []\n}\n');
});

test('L-3: a tampered ledger exits 1 and leaves every file untouched', () => {
  const s = signer();
  const root = fixture(s);
  const before = snapshot(root);
  const ledgerFile = path.join(root, 'events.jsonl');
  fs.writeFileSync(ledgerFile, ledgerText(s, [{ type: 'attest', kind: 'content', id: 't_mood.md', contentHash: HASH }])
    .replace(HASH, 'c'.repeat(40)));
  const proc = run(root, { CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_FILE: ledgerFile });
  assert.equal(proc.status, 1);
  assert.match(proc.stderr, /LEDGER INVALID — this build is refused/);
  assert.match(proc.stderr, /CLERKSHIP_LEDGER=off/);
  assert.deepEqual(snapshot(root), before);
});

test('L-3: a ledger signed by a key missing from keys.json exits 1', () => {
  const s = signer();
  const root = fixture(s);
  const ledgerFile = path.join(root, 'events.jsonl');
  fs.writeFileSync(ledgerFile, ledgerText(s, [{ type: 'attest', kind: 'content', id: 't_mood.md', contentHash: HASH }]));
  write(root, '13_Faculty_Resources/ledger/keys.json', { version: 1, keys: [] });
  const proc = run(root, { CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_FILE: ledgerFile });
  assert.equal(proc.status, 1, proc.stdout);
});

test('L-4: an unreachable ledger builds the baseline, says so, and exits 0', () => {
  const s = signer();
  const root = fixture(s);
  spawnSync('git', ['init', '-q', root]);
  const before = snapshot(root);
  const proc = run(root, { CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_REPO: path.join(root, 'no-such-repo.git') });
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stderr, /could not be fetched/);
  assert.deepEqual(snapshot(root), before);
  const receipt = JSON.parse(fs.readFileSync(proc.receipt, 'utf8'));
  assert.equal(receipt.status, 'baseline-only');
  assert.equal(receipt.seq, null);
});

test('the fetch path reads the ledger from a branch, and an empty branch is an empty ledger', () => {
  const s = signer();
  const root = fixture(s);
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-remote-'));
  const gitIn = (dir, args) => {
    const proc = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    assert.equal(proc.status, 0, proc.stderr);
    return proc.stdout;
  };
  gitIn(remote, ['init', '-q', '-b', 'attestations']);
  write(remote, 'README.md', 'ledger\n');
  gitIn(remote, ['add', '-A']);
  gitIn(remote, ['commit', '-q', '-m', 'empty ledger branch']);
  spawnSync('git', ['init', '-q', root]);
  let proc = run(root, { CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_REPO: remote });
  assert.equal(proc.status, 0, proc.stderr);
  assert.equal(JSON.parse(fs.readFileSync(proc.receipt, 'utf8')).seq, 0);

  write(remote, 'ledger/events.jsonl', ledgerText(s, [{ type: 'attest', kind: 'content', id: 't_mood.md', contentHash: HASH }]));
  gitIn(remote, ['add', '-A']);
  gitIn(remote, ['commit', '-q', '-m', 'ledger #1']);
  proc = run(root, { CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_REPO: remote });
  assert.equal(proc.status, 0, proc.stderr);
  const receipt = JSON.parse(fs.readFileSync(proc.receipt, 'utf8'));
  assert.equal(receipt.seq, 1);
  assert.match(receipt.commit, /^[0-9a-f]{40}$/);
});

test('backup and restore put the baseline back byte for byte', () => {
  const s = signer();
  const root = fixture(s);
  const before = snapshot(root);
  const ledgerFile = path.join(root, 'events.jsonl');
  fs.writeFileSync(ledgerFile, ledgerText(s, [{ type: 'attest', kind: 'content', id: 't_mood.md', contentHash: HASH }]));
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-backup-'));
  assert.equal(run(root, { CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_FILE: ledgerFile }, ['--backup', backup]).status, 0);
  assert.notDeepEqual(snapshot(root), before);
  const restored = spawnSync(process.execPath, [CLI, '--root', root, '--restore', backup], { encoding: 'utf8' });
  assert.equal(restored.status, 0, restored.stderr);
  assert.deepEqual(snapshot(root), before);
});

test('the CLI runs when invoked through a symlinked path (macOS /tmp is one)', () => {
  const s = signer();
  const root = fixture(s);
  const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-link-'));
  const link = path.join(linkDir, 'ledger_overlay.mjs');
  fs.symlinkSync(CLI, link);
  const ledgerFile = path.join(root, 'events.jsonl');
  fs.writeFileSync(ledgerFile, ledgerText(s, [{ type: 'attest', kind: 'content', id: 't_mood.md', contentHash: HASH }])
    .replace(HASH, 'c'.repeat(40)));
  const proc = spawnSync(process.execPath, [link, '--root', root], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CLERKSHIP_LEDGER: 'on', CLERKSHIP_LEDGER_FILE: ledgerFile },
  });
  assert.equal(proc.status, 1, 'a tampered ledger must be refused however the CLI is reached');
  assert.match(proc.stderr, /LEDGER INVALID/);
});
