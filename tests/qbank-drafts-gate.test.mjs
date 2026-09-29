// bin/check-qbank-drafts.mjs end to end: the real CLI over a temporary checkout. The script's own
// --self-test covers the pure judgement; this pins the parts it cannot — exit codes, the file
// --fix writes (byte-identical formatting, only the repaired lines change), the optional
// desktop-only file, and "could not check" when a repository file is missing.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixtureItem, MANIFEST_PATH, QBANK_PATH, DESKTOP_ONLY_PATH } from '../bin/check-qbank-drafts.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/check-qbank-drafts.mjs');
const MANIFEST = { md: [['03_Core_Topics/Mood/mood_teaching.md', 't_mood.md', 'Mood']], tools: [] };
const STATEMENT = 'A 30-year-old woman has two weeks of low mood. The most likely diagnosis is:';

const made = [];
after(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });

function checkout(items, { manifest = MANIFEST, desktopOnly } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qbank-drafts-'));
  made.push(root);
  fs.mkdirSync(path.join(root, path.dirname(MANIFEST_PATH)), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, QBANK_PATH), `${JSON.stringify({ _note: 'fixture', version: 1, items }, null, 2)}\n`);
  if (manifest) fs.writeFileSync(path.join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  if (desktopOnly) fs.writeFileSync(path.join(root, DESKTOP_ONLY_PATH), `${JSON.stringify(desktopOnly, null, 2)}\n`);
  return root;
}

const run = (root, ...args) => spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

test('a clean bank passes with exit 0', () => {
  const result = run(checkout([fixtureItem()]));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /OK — all 1 live draft\(s\) can be attested from the phone/);
});

test('a flagged draft fails with exit 1 and names the warning and the --fix hint', () => {
  const result = run(checkout([fixtureItem({ stem: STATEMENT })]));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FLAGGED \(desktop-only\)\s+qb_mood_901/);
  assert.match(result.stdout, /stem\.lead_in .*\[--fix repairs this\]/);
});

test('an attested item with the same warning is out of scope', () => {
  const result = run(checkout([fixtureItem({ stem: STATEMENT, status: 'attested' })]));
  assert.equal(result.status, 0, result.stdout);
});

test('--fix rewrites only the flagged lines, keeps formatting, and turns the gate green', () => {
  const root = checkout([
    fixtureItem({ stem: STATEMENT, evidence: "mood_teaching.md 'Diagnosis' — criteria." }),
    fixtureItem({ id: 'qb_mood_902', status: 'attested', stem: 'Mood. The next step is:' }),
  ]);
  const before = fs.readFileSync(path.join(root, QBANK_PATH), 'utf8').split('\n');
  const result = run(root, '--fix');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /--fix: 2 mechanical repair\(s\)/);
  const after = fs.readFileSync(path.join(root, QBANK_PATH), 'utf8').split('\n');
  assert.equal(after.length, before.length);
  const changed = after.map((line, i) => [before[i], line]).filter(([a, b]) => a !== b);
  assert.deepEqual(changed.map(([, b]) => b.trim()), [
    '"stem": "A 30-year-old woman has two weeks of low mood. What is the most likely diagnosis?",',
    '"evidence": "t_mood.md \'Diagnosis\' — criteria."',
  ]);
  const attested = JSON.parse(after.join('\n')).items[1];
  assert.equal(attested.stem, 'Mood. The next step is:', 'an attested item is never rewritten');
});

test('--fix on a clean bank writes nothing', () => {
  const root = checkout([fixtureItem()]);
  const file = path.join(root, QBANK_PATH);
  const before = fs.statSync(file).mtimeMs;
  const result = run(root, '--fix');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--fix: 0 mechanical repair\(s\)\n/);
  assert.equal(fs.statSync(file).mtimeMs, before);
});

test('any desktop-only entry fails while the cap is 0', () => {
  const desktopOnly = { entries: [{ id: 'qb_mood_901', codes: ['stem.lead_in'], reason: 'owner keeps it' }] };
  const result = run(checkout([fixtureItem({ stem: STATEMENT })], { desktopOnly }));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /CAP\s+bin\/qbank_desktop_only\.json — 1 desktop-only entry; the cap is 0/);
});

test('a missing manifest is "could not check" (exit 2), never a pass', () => {
  const result = run(checkout([fixtureItem()], { manifest: null }));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /could not check/);
});

test('the repository desktop-only file is empty and well-formed', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const raw = JSON.parse(fs.readFileSync(path.join(repo, DESKTOP_ONLY_PATH), 'utf8'));
  assert.deepEqual(raw.entries, []);
});
