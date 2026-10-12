// The Care aftercare packet's build-time payload (docs/superpowers/plans/2026-10-12-care-packet-print.md §1).
//
// The browser needs the standard inserts AND the crisis contacts they reference, and crisis numbers
// live in crisis_resources.json only. So the build resolves nothing: it ships the data unchanged plus a
// `contacts` map copied from the governed record, and the sheet fills `{{crisis:<id>}}` from it. These
// tests read the governed file DIRECTLY as the oracle (never the payload) so a swapped, truncated or
// stale contact cannot pass by agreeing with itself.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { staleBuildReason } from './_build_freshness.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SITE_BUILD = path.join(REPO, '13_Faculty_Resources/_automation/site_build');
const DATA = path.join(SITE_BUILD, 'data/care-inserts.v1.json');
const SCHEMA = path.join(SITE_BUILD, 'data/care-inserts.v1.schema.json');
const CRISIS = path.join(REPO, 'crisis_resources.json');
const SHELL = path.join(SITE_BUILD, 'spa_index.html');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const NEEDLE = 'var FD_CARE_INSERTS=null;';

// -B writes no __pycache__ into the tree. Not -I: isolated mode also hides the user site-packages, and on
// a machine where jsonschema's own dependency (attrs) lives there the import fails for a reason that has
// nothing to do with this code (CI installs everything into one place; the sibling spawn-python tests use
// plain `python3 -c` for the same reason). The cwd is the build directory, whose contents are controlled,
// so the empty sys.path[0] entry cannot pick up a stray json.py from the repo root.
function py(body, args = []) {
  const code = `import json, sys\nsys.path.insert(0, ${JSON.stringify(SITE_BUILD)})\nimport care_inserts_payload as p\n${body}`;
  return spawnSync('python3', ['-B', '-c', code, ...args], { cwd: SITE_BUILD, encoding: 'utf8' });
}
function payload() {
  const run = py('print(json.dumps(p.build_payload()))');
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'care-payload-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function referencedIds(data) {
  const ids = new Set(data.crisis.map(line => line.ref));
  const text = JSON.stringify([data.crisisCopy, data.inserts]);
  for (const match of text.matchAll(/\{\{crisis:([a-z0-9_]+)\}\}/g)) ids.add(match[1]);
  return ids;
}

test('every referenced crisis id carries the governed record\'s name, contact and availability, byte for byte', () => {
  const crisis = readJson(CRISIS);
  const built = payload();
  assert.ok(Object.keys(built.contacts).length >= 2);
  for (const [id, entry] of Object.entries(built.contacts)) {
    const governed = crisis.resources.find(resource => resource.id === id);
    assert.ok(governed, `${id} is in crisis_resources.json`);
    assert.deepEqual(entry, { name: governed.name, contact: governed.contact, availability: governed.availability }, id);
  }
});

test('the payload names exactly the crisis ids the data references: none missing, none extra', () => {
  const data = readJson(DATA);
  assert.deepEqual(Object.keys(payload().contacts).sort(), [...referencedIds(data)].sort());
});

test('`required` is the validator\'s pair and each id resolves to a non-empty contact', () => {
  const built = payload();
  assert.deepEqual([...built.required].sort(), ['lifeline_988', 'maine_crisis_line']);
  for (const id of built.required) {
    assert.ok(built.contacts[id], `${id} resolves`);
    assert.ok(String(built.contacts[id].contact).trim().length > 0, `${id} has a contact`);
  }
});

test('the payload is the validated data plus contacts and required, minus every internal record', () => {
  const data = readJson(DATA);
  const built = payload();
  assert.deepEqual(Object.keys(built).sort(), ['contacts', 'crisis', 'crisisCopy', 'generatedAt', 'inserts', 'required']);
  assert.equal(built.generatedAt, data.generatedAt);
  assert.deepEqual(built.crisisCopy, data.crisisCopy);
  assert.deepEqual(built.crisis, data.crisis);
  // A helpline row ships only what can be printed. Its source URLs and verification date are an
  // internal record ("Neither is ever printed"): a browser that never receives them cannot print them.
  const printable = data.inserts.map(insert => insert.table
    ? { ...insert, table: insert.table.map(({ who, number, what }) => ({ who, number, what })) }
    : insert);
  assert.deepEqual(built.inserts, printable);
  assert.ok(built.inserts.some(insert => insert.table && insert.table.length), 'the helpline tables are present');
  const shipped = JSON.stringify(built);
  for (const key of ['alsoAvailable', 'verificationSource', 'verifiedOn', 'reconnectRecord', 'upstreamDiscrepancies',
    'unitEscalationNote', 'verifiedDate', 'alsoSources', '"source"']) {
    assert.ok(!shipped.includes(key), `${key} stays out of the payload`);
  }
});

test('a crisis reference that does not resolve aborts the build instead of shipping a hole', t => {
  const dir = tempDir(t);
  const data = readJson(DATA);
  data.crisis[0].ref = 'not_a_real_resource';
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify(data));
  const run = py('p.build_payload(data_path=sys.argv[1])', [file]);
  assert.notEqual(run.status, 0, 'must fail');
  assert.match(run.stderr + run.stdout, /not_a_real_resource|crisis/i);
});

test('data the validator rejects aborts the build (a dose literal in patient prose)', t => {
  const dir = tempDir(t);
  const data = readJson(DATA);
  data.inserts.find(insert => insert.id === 'meds').bullets.push('Take 10 mg every morning.');
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify(data));
  const run = py('p.build_payload(data_path=sys.argv[1])', [file]);
  assert.notEqual(run.status, 0, 'must fail');
  assert.match(run.stderr + run.stdout, /dose|10 mg/i);
});

test('a governed record with a blank contact for a required line aborts the build', t => {
  const dir = tempDir(t);
  const crisis = readJson(CRISIS);
  crisis.resources.find(resource => resource.id === 'lifeline_988').contact = '';
  const file = path.join(dir, 'crisis.json');
  fs.writeFileSync(file, JSON.stringify(crisis));
  const run = py('p.build_payload(crisis_path=sys.argv[1])', [file]);
  assert.notEqual(run.status, 0, 'must fail');
  // The failure must be about THIS defect, not an unrelated crash (a missing module also exits non-zero).
  assert.match(run.stderr + run.stdout, /lifeline_988/);
  assert.match(run.stderr + run.stdout, /contact/i);
});

test('injection replaces the shell needle once, escapes markup, and the value parses back unchanged', () => {
  const hostile = { evil: '</script><script>alert(1)</script> <!-- & \u2028 \u2029 "quoted" \\', list: [1, 2, { a: '>' }] };
  const run = py(
    `text = 'a\\n' + ${JSON.stringify(NEEDLE)} + '\\nb'\nout = p.inject(text, json.loads(sys.argv[1]))\nprint(json.dumps({'out': out}))`,
    [JSON.stringify(hostile)],
  );
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout).out;
  assert.ok(!out.includes('</script'), 'no closing script tag');
  assert.ok(!out.includes('<!--'), 'no comment opener');
  assert.ok(!out.includes('\u2028') && !out.includes('\u2029'), 'no raw line separators');
  const match = out.match(/^a\nvar FD_CARE_INSERTS=(.*);\nb$/s);
  assert.ok(match, 'the declaration keeps its shape');
  assert.deepEqual(JSON.parse(match[1]), hostile);
  assert.ok(!out.includes(NEEDLE), 'the null declaration is gone');
});

test('injection aborts when the needle is missing or duplicated', () => {
  for (const [label, text] of [['missing', 'no declaration here'], ['duplicated', `${NEEDLE}\n${NEEDLE}`]]) {
    const run = py(`p.inject(sys.argv[1], {'x': 1})`, [text]);
    assert.notEqual(run.status, 0, `${label} must abort`);
    assert.match(run.stderr + run.stdout, /FD_CARE_INSERTS/);
  }
});

test('the postcondition accepts a declared payload and rejects a shell that never received one', () => {
  const ok = py(`p.assert_injected('x\\nvar FD_CARE_INSERTS={"a":1};\\ny')`);
  assert.equal(ok.status, 0, ok.stderr);
  for (const text of [`x\n${NEEDLE}\ny`, 'x\ny', 'var FD_CARE_INSERTS={};\nvar FD_CARE_INSERTS={};']) {
    const bad = py('p.assert_injected(sys.argv[1])', [text]);
    assert.notEqual(bad.status, 0, JSON.stringify(text));
  }
});

test('the shell declares the needle exactly once and the build wires injection plus its postcondition', () => {
  const shell = fs.readFileSync(SHELL, 'utf8');
  assert.equal(shell.split(NEEDLE).length - 1, 1, 'spa_index.html declares the null needle once');
  const build = fs.readFileSync(path.join(SITE_BUILD, 'build_deploy.py'), 'utf8');
  assert.match(build, /care_inserts_payload\.build_payload\(/);
  assert.match(build, /care_inserts_payload\.inject\(/);
  assert.match(build, /care_inserts_payload\.assert_injected\(/);
  const resident = fs.readFileSync(path.join(SITE_BUILD, 'resident_section.py'), 'utf8');
  assert.match(resident, /care_inserts_payload\.assert_injected\(/, 'the resident build re-asserts the postcondition');
});

// Local-only contract: node --test runs before both builds, so _build/ does not exist in CI. Guard on
// freshness, never existence (tests/_build_freshness.mjs).
for (const site of ['ms3', 'res']) {
  test(`${site}: the built shell serves exactly the payload the builder produces`, t => {
    const stale = staleBuildReason(REPO, site, [
      SHELL, DATA, SCHEMA, CRISIS, path.join(SITE_BUILD, 'care_inserts_payload.py'), path.join(SITE_BUILD, 'build_deploy.py'),
    ]);
    if (stale) return t.skip(stale);
    const html = fs.readFileSync(path.join(REPO, '_build', site, 'index.html'), 'utf8');
    const declared = [...html.matchAll(/var FD_CARE_INSERTS=/g)].length;
    assert.equal(declared, 1, 'one declaration');
    assert.ok(!html.includes(NEEDLE), 'the null declaration did not survive');
    const line = html.split('\n').find(row => row.includes('var FD_CARE_INSERTS='));
    const value = line.slice(line.indexOf('var FD_CARE_INSERTS=') + 'var FD_CARE_INSERTS='.length).replace(/;\s*$/, '');
    assert.deepEqual(JSON.parse(value), payload());
  });
}
