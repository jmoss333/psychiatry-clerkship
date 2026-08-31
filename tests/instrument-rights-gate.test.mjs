// Instrument-rights publication contract (INV-IR1) — behavior tests.
//
// The invariant: a build may publish a page naming a listed instrument only in the state
// its recorded disposition allows. Dispositions live in instrument_rights.json (root
// registry, schema-paired); every entry cites the decision record that established it.
// The gate module is pure and is wired into check-static-site.mjs (§11), so a violation
// hard-fails both Netlify builds. Enforcement recommended by
// docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md ("Recommended
// enforcement, once scope is decided" — scope was decided 2026-08-23, Option A; ships
// HARD per the same section, A3 having retired in #396).
//
// Signature discipline (learned empirically before seeding): signatures detect the
// REPRODUCTION that shipped, never plain clinical language — "thoughts of killing
// yourself" is what any clinician says at the bedside and lives legitimately in the
// SP pack, mse.html, and the shell, so it is NOT a signature. Scan scope is
// learner-rendered HTML only: matcher vocabulary in *.pack.json is not reproduction.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/instrument-rights-gate.mjs');
const CHECKER = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/check-static-site.mjs');
const REGISTRY = path.join(ROOT, 'instrument_rights.json');
const MANIFEST = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/site_manifest.json');

const { evaluateInstrumentRights } = await import(MODULE);

// ---------- fixture helpers ----------

function entry(overrides = {}) {
  return {
    id: 'fx',
    instrument: 'Fixture Instrument',
    status: 'retired',
    decisionRef: 'docs/fixture-decision.md — recorded 2026-08-27',
    signatures: ['a distinctive shipped fixture stem'],
    pages: [],
    ...overrides,
  };
}

function run({ instruments, pages, nav = null, toolRegistry = null, claimsGovernance = false }) {
  return evaluateInstrumentRights({
    rights: { schemaVersion: 1, instruments },
    pages,
    nav,
    toolRegistry,
    claimsGovernance,
  });
}

const CLEAN_PAGE = { file: 'clean.html', rel: 'tools/clean.html', text: '<h1>nothing here</h1>' };
const HIT_PAGE = { file: 'hit.html', rel: 'tools/hit.html', text: 'x A Distinctive SHIPPED fixture stem x' };

// ---------- signature scan ----------

test('retired signature in any shipped page is a hard failure', () => {
  const r = run({ instruments: [entry({ status: 'retired' })], pages: [CLEAN_PAGE, HIT_PAGE] });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /hit\.html/);
  assert.match(r.hard[0], /a distinctive shipped fixture stem/i);
  assert.match(r.hard[0], /fixture-decision/);
});

test('restricted signature is a hard failure (BFCRS re-add scenario)', () => {
  const r = run({ instruments: [entry({ status: 'restricted' })], pages: [HIT_PAGE] });
  assert.equal(r.hard.length, 1);
});

test('matching is case-insensitive substring over rendered text', () => {
  const r = run({
    instruments: [entry()],
    pages: [{ file: 'p.html', rel: 'tools/p.html', text: 'A DISTINCTIVE shipped FIXTURE stem' }],
  });
  assert.equal(r.hard.length, 1);
});

test('a clean build produces no findings', () => {
  const r = run({ instruments: [entry()], pages: [CLEAN_PAGE] });
  assert.deepEqual(r.hard, []);
  assert.deepEqual(r.info, []);
});

// ---------- interim waiver (the recorded COWS standing) ----------

const waived = () => entry({
  status: 'flagged-interim',
  interimWaiver: {
    grantedBy: 'Author-of-record',
    recordedIn: 'docs/fixture-decision.md — flagged, not reverted',
    scope: 'fixture anchors stay published pending the call',
    files: ['hit.html'],
  },
});

test('flagged-interim signature under a recorded waiver is surfaced as info, not failure', () => {
  const r = run({ instruments: [waived()], pages: [HIT_PAGE] });
  assert.deepEqual(r.hard, []);
  assert.equal(r.info.length, 1);
  assert.match(r.info[0], /waiver/i);
  assert.match(r.info[0], /flagged, not reverted/);
});

test('removing the waiver while the signatures still ship is a hard failure', () => {
  const noWaiver = waived();
  delete noWaiver.interimWaiver;
  const r = run({ instruments: [noWaiver], pages: [HIT_PAGE] });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /no recorded interim waiver/i);
});

test('a waiver is file-scoped: the same signature in a NEW file fails hard', () => {
  const r = run({
    instruments: [waived()],
    pages: [HIT_PAGE, { file: 'new-trainer.html', rel: 'tools/new-trainer.html', text: 'a distinctive shipped fixture stem' }],
  });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /new-trainer\.html/);
});

// ---------- provisional (the recorded PHQ-9/GAD-7 standing) ----------

test('provisional signatures are allowed only on their declared pages', () => {
  const prov = entry({ status: 'provisional', pages: [{ file: 'hit.html' }] });
  const ok = run({ instruments: [prov], pages: [HIT_PAGE] });
  assert.deepEqual(ok.hard, []);
  const stray = run({
    instruments: [prov],
    pages: [{ file: 'other.html', rel: 'tools/other.html', text: 'a distinctive shipped fixture stem' }],
  });
  assert.equal(stray.hard.length, 1);
  assert.match(stray.hard[0], /other\.html/);
});

// ---------- registry discipline ----------

test('an entry without a decisionRef is itself a hard failure', () => {
  const bad = entry();
  bad.decisionRef = '';
  const r = run({ instruments: [bad], pages: [CLEAN_PAGE] });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /decisionRef/);
});

// ---------- governed-page pins (tri-state gate: skipped for fixtures) ----------

const pinned = () => entry({
  status: 'retired',
  signatures: ['a distinctive shipped fixture stem'],
  pages: [{
    file: 'stub.html',
    requiredTitle: 'Fixture — Official Form & Training',
    requiredDisclaimerType: 'instrument-not-reproduced',
    requireNotReproducedStatement: true,
    requireNoScript: true,
  }],
});
const STUB_OK = {
  file: 'stub.html', rel: 'tools/stub.html',
  text: '<h1>Fixture</h1><p>This page no longer reproduces the instrument.</p>',
};
const NAV_OK = [{ section: 'S', items: [{ t: 'Fixture — Official Form & Training', f: 'stub.html', k: 'tool' }] }];
const REG_OK = { tools: [{ file: 'stub.html', disclaimerType: 'instrument-not-reproduced' }] };

test('a compliant governed stub passes all pins', () => {
  const r = run({ instruments: [pinned()], pages: [STUB_OK], nav: NAV_OK, toolRegistry: REG_OK, claimsGovernance: true });
  assert.deepEqual(r.hard, []);
});

test('re-titling a retired page back to the instrument name fails hard', () => {
  const nav = [{ section: 'S', items: [{ t: 'Fixture Screener', f: 'stub.html', k: 'tool' }] }];
  const r = run({ instruments: [pinned()], pages: [STUB_OK], nav, toolRegistry: REG_OK, claimsGovernance: true });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /title/i);
  assert.match(r.hard[0], /stub\.html/);
});

test('disclaimerType drift on a governed page fails hard', () => {
  const reg = { tools: [{ file: 'stub.html', disclaimerType: 'validated-screening-teaching' }] };
  const r = run({ instruments: [pinned()], pages: [STUB_OK], nav: NAV_OK, toolRegistry: reg, claimsGovernance: true });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /disclaimerType/);
});

test('dropping the not-reproduced statement fails hard', () => {
  const page = { ...STUB_OK, text: '<h1>Fixture</h1>' };
  const r = run({ instruments: [pinned()], pages: [page], nav: NAV_OK, toolRegistry: REG_OK, claimsGovernance: true });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /not-reproduced statement/i);
});

test('a script returning to a requireNoScript page fails hard', () => {
  const page = { ...STUB_OK, text: STUB_OK.text + '<script>var q=[];</script>' };
  const r = run({ instruments: [pinned()], pages: [page], nav: NAV_OK, toolRegistry: REG_OK, claimsGovernance: true });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /script/i);
});

test('pins are skipped for ungoverned fixture sites, but the signature scan still runs', () => {
  const nav = [{ section: 'S', items: [{ t: 'Wrong Title', f: 'stub.html', k: 'tool' }] }];
  const page = { ...STUB_OK, text: 'a distinctive shipped fixture stem' };
  const r = run({ instruments: [pinned()], pages: [page], nav, toolRegistry: REG_OK, claimsGovernance: false });
  assert.equal(r.hard.length, 1, 'exactly the signature hit, no pin findings');
  assert.match(r.hard[0], /fixture stem/i);
});

test('pins apply only to pages the site actually ships', () => {
  const r = run({ instruments: [pinned()], pages: [CLEAN_PAGE], nav: NAV_OK, toolRegistry: REG_OK, claimsGovernance: true });
  assert.deepEqual(r.hard, [], 'a page the build does not ship cannot fail its pins here — nav wiring is §2’s job');
});

// ---------- the real registry ----------

test('the real instrument_rights.json parses and keeps signature discipline', () => {
  const rights = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  assert.equal(rights.schemaVersion, 1);
  assert.ok(Array.isArray(rights.instruments) && rights.instruments.length >= 5);
  for (const e of rights.instruments) {
    assert.ok(e.decisionRef && e.decisionRef.trim().length > 0, `${e.id}: decisionRef required`);
    for (const sig of e.signatures) {
      assert.ok(sig.length >= 12,
        `${e.id}: signature "${sig}" too short — short fragments block legitimate clinical prose`);
    }
    if (e.status === 'flagged-interim') {
      assert.ok(e.interimWaiver && Array.isArray(e.interimWaiver.files) && e.interimWaiver.files.length,
        `${e.id}: flagged-interim requires a file-scoped recorded waiver`);
    }
  }
});

// ---------- end-to-end: the wired checker ----------

function runSite(mutate) {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-gate-'));
  try {
    fs.mkdirSync(path.join(site, 'tools'));
    const META = '<!-- [CLERKSHIP-META v1] tool="Synthetic" version="1.0" built="2026-08-27" category="test" audience="faculty" settings="self-study" time="1min" clinicalClaim="false" summary="Instrument-rights gate fixture." -->';
    let body = '<p>clean fixture</p>';
    if (mutate === 'plant-stem') body = '<p>Have you wished you were dead or wished…</p>';
    fs.writeFileSync(path.join(site, 'index.html'),
      '<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width">');
    fs.writeFileSync(path.join(site, 'tools', 'fixture.html'),
      `<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width">${META}\n${body}`);
    fs.writeFileSync(path.join(site, 'nav.json'),
      JSON.stringify([{ section: 'Fixture', items: [{ t: 'Tool', f: 'fixture.html', k: 'tool' }] }]));
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const sources = [...manifest.tools, ...manifest.md, ...(manifest.toolAssets || [])]
      .map(([source]) => source);
    fs.writeFileSync(`${site}.source-map.json`, JSON.stringify({ sources }));
    const result = spawnSync(process.execPath, [CHECKER, site], { encoding: 'utf8' });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
    fs.rmSync(`${site}.source-map.json`, { force: true });
  }
}

test('e2e: a planted retired stem fails the wired static gate', () => {
  const r = runSite('plant-stem');
  assert.notEqual(r.status, 0);
  assert.match(r.output, /instrument-rights/);
  assert.match(r.output, /wished you were dead/i);
});

test('e2e: a clean fixture passes the wired gate with no instrument-rights findings', () => {
  const r = runSite('clean');
  assert.equal(r.status, 0, r.output);
  assert.doesNotMatch(r.output, /✗.*instrument-rights/);
});
