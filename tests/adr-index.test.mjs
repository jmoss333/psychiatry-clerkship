// docs/adr/README.md is the one index of architecture decision records (R6, 2026-10-17).
// Two contracts: every `ADR-NNN` referenced in tracked text is a row of the numbered table, and
// every repository path the index names exists. ADR files live beside the code they govern,
// so the index — not a directory listing — is what makes them findable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'docs', 'adr', 'README.md');
const TEXT = new Set(['.md', '.py', '.mjs', '.js', '.sh', '.yml', '.yaml']);

function trackedTextFiles() {
  const r = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.split('\0').filter((p) => p && TEXT.has(path.extname(p)) && !p.includes('node_modules/'));
}

function numberedRows(indexText) {
  const rows = new Set();
  for (const m of indexText.matchAll(/^\| ADR-(\d{3}) \|/gm)) rows.add(Number(m[1]));
  return rows;
}

test('every ADR-NNN referenced in the repository is a row of docs/adr/README.md', (t) => {
  const files = trackedTextFiles();
  if (files === null) {
    t.skip('git ls-files unavailable here (sandboxed worktree); run host-side');
    return;
  }
  const indexText = fs.readFileSync(INDEX, 'utf8');
  const rows = numberedRows(indexText);
  assert.ok(rows.size >= 3, `the index lists ${rows.size} ADRs; expected ADR-001..003 at least`);
  const missing = new Map();
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of text.matchAll(/\bADR-0*(\d{1,3})\b/g)) {
      const n = Number(m[1]);
      if (!rows.has(n)) missing.set(n, [...(missing.get(n) || []), rel]);
    }
  }
  assert.deepEqual([...missing.entries()], [],
    'ADR numbers referenced but not indexed (number → files); add a row to docs/adr/README.md');
});

test('every repository path docs/adr/README.md names exists', () => {
  const indexText = fs.readFileSync(INDEX, 'utf8');
  const paths = new Set();
  for (const m of indexText.matchAll(/`([^`]+)`/g)) {
    for (const word of m[1].split(/\s+/)) {
      if (word.includes('/') && !word.startsWith('http') && /^[A-Za-z0-9_./-]+$/.test(word)) paths.add(word);
    }
  }
  const absent = [...paths].filter((p) => !fs.existsSync(path.join(ROOT, p)));
  assert.deepEqual(absent, [], 'paths named in the ADR index that do not exist');
  assert.ok(paths.size >= 10, `only ${paths.size} paths found in the index; the table has lost its links`);
});
