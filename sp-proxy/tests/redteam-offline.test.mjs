// bin/redteam-offline.mjs — the deterministic Tier 1 of the SP red-team — derives its case
// table from the pack and FAILS when a reviewed case has no probe. Until 2026-09-26 the cases
// were a three-name literal and Morgan shipped `reviewed` with no probe on any line of him,
// while `--coverage` (keyed on `gated`, and Morgan has no gates) read him as fully covered.
// These tests break the guard on purpose: a fixture pack with a reviewed case no probe names
// must turn Tier 1 red, and a case that is in the pack but not reviewed must SKIP its probes
// (reported), never pass them.
//
// This suite lives under sp-proxy/tests, not tests/, on purpose: the runner imports the proxy's
// sp.mjs, which imports @netlify/blobs from sp-proxy/node_modules, and the learner-site Netlify
// builds run `node --test tests/*.test.mjs` dependency-free (no npm install) before either site
// builds. A root test that spawns the runner failed both deploy previews in under a minute on
// 2026-09-26; here it runs where the engine's dependencies are guaranteed (`npm --prefix
// sp-proxy test`, a CI step and a verify.sh step).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO, 'bin', 'redteam-offline.mjs');
const PACK = path.join(REPO, '_prototypes', 'sp-interview', 'sp-interview.pack.json');
const MORGAN = 'sp_alcohol_ambivalence_001';

function run(args) {
  const proc = spawnSync('node', [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });
  return { status: proc.status, out: `${proc.stdout}\n${proc.stderr}` };
}

function fixturePack(t, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redteam-offline-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
  mutate(pack);
  const file = path.join(dir, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack));
  return file;
}

test('the real pack passes Tier 1, and every reviewed case is driven — Morgan by the M series', () => {
  const r = run([]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /\d+\/\d+ deterministic probes pass/);
  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']) assert.match(r.out, new RegExp(`^pass  ${id}  `, 'm'), `${id} ran and passed`);
  assert.doesNotMatch(r.out, /^skip /m, 'nothing is skipped on the real pack');
  assert.doesNotMatch(r.out, /no Tier-1 probe/);
  // The pack has four reviewed cases; the script must not carry a hand-written table any more.
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(src, /Dana:\s*'sp_depression_gated_si_001'/, 'the case table is derived from the pack, not written by hand');
});

test('a reviewed case no probe names turns Tier 1 red — the case gate bites', (t) => {
  const file = fixturePack(t, (pack) => {
    const quinn = JSON.parse(JSON.stringify(pack.cases.find((c) => c.id === MORGAN)));
    quinn.id = 'sp_fixture_undriven_001';
    quinn.persona.displayName = 'Quinn';
    quinn.title = 'Quinn — fixture';
    pack.cases.push(quinn);
  });
  const r = run([file]);
  assert.equal(r.status, 1, `expected exit 1 for an undriven reviewed case\n${r.out}`);
  assert.match(r.out, /FAIL  CASE  every reviewed case is driven by at least one probe/);
  assert.match(r.out, /no Tier-1 probe: sp_fixture_undriven_001/);
  assert.match(r.out, /DO NOT RECORD A RED-TEAM PASS/);
  // Every individual probe still passed — the case gate is the ONLY thing that noticed.
  assert.doesNotMatch(r.out, /^FAIL  [BCM]\d/m);
});

test('a case that is in the pack but not reviewed skips its probes — reported, never counted as a pass', (t) => {
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.facultyReview = { status: 'pending', reviewer: null, lastReviewed: null };
  });
  const r = run([file]);
  assert.equal(r.status, 0, r.out);
  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']) assert.match(r.out, new RegExp(`^skip  ${id}  `, 'm'), `${id} skipped`);
  assert.match(r.out, /is in the pack but not reviewed — learners cannot select it/);
  assert.match(r.out, /\(7 skipped: case not reviewed\)/);
  assert.doesNotMatch(r.out, /^pass  M\d/m, 'a skipped probe is never reported as a pass');
});

test('a probe naming a case that is not in the pack at all is a broken probe, and fails', (t) => {
  const file = fixturePack(t, (pack) => {
    pack.cases = pack.cases.filter((c) => c.id !== MORGAN);
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /crashed: case not found for Morgan — not in the pack/);
});

test('--coverage reports the passing probes that drive each case, and says a gateless case has nothing to open', () => {
  const r = run(['--coverage']);
  assert.equal(r.status, 0, r.out);
  const morganBlock = r.out.split(MORGAN)[1] || '';
  assert.match(morganBlock, /driven by 7 passing probe\(s\): M1, M2, M3, M4, M5, M6, M7/);
  assert.match(morganBlock, /no disclosure gates — nothing to open/);
  assert.match(r.out, /Every reviewed case is driven by at least one passing probe\./);
  assert.match(r.out, /Every pack gate has at least one probe\./);
});

test('a run in which nothing passed is never "clean": every case pending → exit 1 on the pass floor', (t) => {
  const file = fixturePack(t, (pack) => {
    for (const c of pack.cases) c.facultyReview = { status: 'pending', reviewer: null, lastReviewed: null };
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^skip  B1  /m);
  assert.match(r.out, /FAIL  NONE  at least one probe ran to completion/);
  assert.match(r.out, /no probe passed — nothing was proved/);
  assert.doesNotMatch(r.out, /Tier 1 clean/);
});

test('a duplicate case id is refused before anything runs — the case gate keys by id', (t) => {
  const file = fixturePack(t, (pack) => {
    const twin = JSON.parse(JSON.stringify(pack.cases.find((c) => c.id === MORGAN)));
    twin.persona.displayName = 'Morgan Twin'; // same id, no probe names this display name
    pack.cases.push(twin);
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL  PACK  duplicate case id\(s\): sp_alcohol_ambivalence_001/);
  assert.doesNotMatch(r.out, /^pass  /m, 'nothing ran');
  const c = run([file, '--coverage']);
  assert.equal(c.status, 1, 'coverage mode refuses the same pack');
});

test('a case is driven only by a PASSING probe: when every Morgan probe fails, coverage counts zero and exits 1', (t) => {
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.checklist = null; // computeCoverage throws for Morgan, so every M probe crashes after probe()
  });
  const cov = run([file, '--coverage']);
  assert.equal(cov.status, 1, cov.out);
  const morganBlock = cov.out.split(MORGAN)[1] || '';
  assert.match(morganBlock, /driven by 0 passing probe\(s\)/);
  assert.match(cov.out, /1 reviewed case\(s\) with no passing probe: sp_alcohol_ambivalence_001/);
  assert.match(cov.out, /COVERAGE GAP/);
  const tier1 = run([file]);
  assert.equal(tier1.status, 1);
  assert.match(tier1.out, /^FAIL  M1  [^\n]*\n\s+· crashed:/m);
  assert.match(tier1.out, /no Tier-1 probe: sp_alcohol_ambivalence_001/, 'a probe that crashed after calling probe() does not count as driving the case');
});

test('--coverage is a gate, and M1 pins that Morgan is gateless: a new disclosure gate with no probe fails both', (t) => {
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.gated = [{ id: 'g_fixture_unprobed', requiresIntents: ['values'], requiresRapport: 9, reveal: 'fixture reveal line' }];
  });
  const r = run([file, '--coverage']);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /g_fixture_unprobed: NO PROBE ASSERTS ON state\.unlocked FOR THIS GATE/);
  assert.match(r.out, /1 gate\(s\) with no probe:\s+- sp_alcohol_ambivalence_001 \/ g_fixture_unprobed/);
  assert.match(r.out, /COVERAGE GAP/);
  const tier1 = run([file]);
  assert.equal(tier1.status, 1, tier1.out);
  assert.match(tier1.out, /Morgan gained disclosure gate\(s\) \[g_fixture_unprobed\]/);
});

test('M5 is not vacuous: it pins that the injury question trips the indirect screen, so a narrowed pattern turns it red', (t) => {
  // Design §18 documents the over-breadth; the probe must reproduce it, not merely fail to
  // observe it. A pack whose si_euphemism no longer matches the phrase makes M5 (and M2) fail.
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.intents.find((i) => i.id === 'si_euphemism').patterns = ['\\bzzz-never-matches\\b'];
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^FAIL  M5  [^\n]*\n\s+· the injury question no longer trips si_euphemism/m);
  assert.match(r.out, /^FAIL  M2  /m);
});
