// docs/OPERATIONS.md is the successor runbook (R6, 2026-10-17): the seven procedures someone who
// is not the owner must be able to run. It is an index of commands, workflow names and runbooks,
// so the contract is that nothing it names has gone away: every repository path it cites exists,
// every workflow it names in bold is a workflow's `name:`, and every decision id it cites is in
// decisions.json. A renamed tool fails here instead of failing the covering clinician at 2 am.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = fs.readFileSync(path.join(ROOT, 'docs', 'OPERATIONS.md'), 'utf8');
const ROOTS = ['bin/', 'docs/', '13_Faculty_Resources/', 'sp-proxy/', 'faculty-console/', 'tests/', '.github/'];

test('every repository path the runbook cites exists', () => {
  const cited = new Set();
  const spans = [...DOC.matchAll(/`([^`]+)`/g), ...DOC.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  for (const m of spans) {
    for (const word of m[1].split(/\s+/)) {
      if (ROOTS.some((r) => word.startsWith(r)) && /^[A-Za-z0-9_./-]+$/.test(word)) cited.add(word);
    }
  }
  assert.ok(cited.size >= 10, `only ${cited.size} paths cited; the runbook has lost its references`);
  const absent = [...cited].filter((p) => !fs.existsSync(path.join(ROOT, p)));
  assert.deepEqual(absent, [], 'paths the runbook names that no longer exist');
});

test('every workflow the runbook names in bold is a real workflow name', () => {
  const names = new Set();
  const dir = path.join(ROOT, '.github', 'workflows');
  for (const f of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(f)) continue;
    const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/^name:\s*(.+?)\s*$/m);
    if (m) names.add(m[1].replace(/^["']|["']$/g, ''));
  }
  const cited = [...DOC.matchAll(/\*\*((?:Production|Maintenance|Automation|Surveillance) — [^*]+)\*\*/g)].map((m) => m[1].trim());
  assert.ok(cited.length >= 3, `only ${cited.length} workflow names cited`);
  const unknown = cited.filter((c) => !names.has(c));
  assert.deepEqual(unknown, [], `workflow names in the runbook that match no workflow's name: (known: ${[...names].join(' | ')})`);
});

test('every decision id the runbook cites is in decisions.json', () => {
  const ids = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'decisions.json'), 'utf8')).decisions.map((d) => d.id));
  const cited = [...DOC.matchAll(/decision `([a-z0-9-]+)`/g)].map((m) => m[1]);
  assert.ok(cited.length >= 1, 'the runbook cites no decision id');
  assert.deepEqual(cited.filter((c) => !ids.has(c)), [], 'decision ids the runbook cites that are not in decisions.json');
});

test('the three standing rules and the seven procedures are present', () => {
  for (const heading of ['## 0. ', '## 1. ', '## 2. ', '## 3. ', '## 4. ', '## 5. ', '## 6. ', '## 7. ']) {
    assert.ok(DOC.includes(`\n${heading}`), `missing section ${heading.trim()}`);
  }
  assert.match(DOC, /Never edit `13_Faculty_Resources\/reviewed\.json` by hand/);
  assert.match(DOC, /Never push to `release` by hand/);
  assert.match(DOC, /An agent never\s+mints a signing key/);
});
