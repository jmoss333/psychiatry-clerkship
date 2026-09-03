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

// A VALID entry: retired, and therefore carrying the route a withdrawal must leave
// behind (INV-IR2). Tests that want the missing-route case delete officialSource.
function entry(overrides = {}) {
  return {
    id: 'fx',
    instrument: 'Fixture Instrument',
    status: 'retired',
    decisionRef: 'docs/fixture-decision.md — recorded 2026-08-27',
    officialSource: {
      custodian: 'Fixture Custodian',
      access: 'free-download',
      formUrl: 'https://forms.example.org/fixture-scale',
      formLabel: 'the fixture scale and its coding guide',
      redistribution: 'link-only',
      verified: '2026-09-03',
    },
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

// ---------- INV-IR2: a withdrawal must leave a route ----------
//
// Removing a reproduction takes away the only copy of the instrument the learner had. A page
// that says "not reproduced here" and names no way to get the real form is a dead end — the
// same shape of failure as ODC-4, where an attested page sent students to a tool that did not
// exist. officialSource records the custodian's own download; these tests pin both halves:
// the page must ship it, and it must be the custodian's URL rather than a copy hosted here.

const routed = () => entry({
  pages: [{
    file: 'stub.html',
    requireNotReproducedStatement: true,
    requireOfficialSourceLink: true,
  }],
});
const ROUTED_OK = {
  file: 'stub.html', rel: 'tools/stub.html',
  text: '<p>This page no longer reproduces the instrument.</p>'
      + '<a href="https://forms.example.org/fixture-scale">Get the official form</a>',
};

test('a retired page that ships its recorded route passes', () => {
  const r = run({ instruments: [routed()], pages: [ROUTED_OK], claimsGovernance: true });
  assert.deepEqual(r.hard, []);
});

test('dropping the official-source link from a pinned page fails hard', () => {
  const page = { ...ROUTED_OK, text: '<p>This page no longer reproduces the instrument.</p>' };
  const r = run({ instruments: [routed()], pages: [page], claimsGovernance: true });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /official-source link/i);
  assert.match(r.hard[0], /forms\.example\.org/);
  assert.match(r.hard[0], /dead end/i);
});

test('naming the custodian in prose is not a route — the learner needs the href', () => {
  // The whole point is a link someone can follow off a page that no longer has the form.
  const page = { ...ROUTED_OK, text: '<p>Not reproduced. Ask Fixture Custodian for the form.</p>' };
  const r = run({ instruments: [routed()], pages: [page], claimsGovernance: true });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /official-source link/i);
});

test('a pin cannot demand a route the registry never recorded', () => {
  const bare = routed();
  delete bare.officialSource;
  const r = run({ instruments: [bare], pages: [ROUTED_OK], claimsGovernance: true });
  // Two findings, deliberately: the retired-without-a-route failure AND the dangling pin.
  assert.equal(r.hard.length, 2);
  assert.ok(r.hard.some((m) => /no officialSource/.test(m)));
  assert.ok(r.hard.some((m) => /records no officialSource\.formUrl/.test(m)));
});

test('retiring an instrument without recording a route fails hard', () => {
  const bare = entry();
  delete bare.officialSource;
  const r = run({ instruments: [bare], pages: [CLEAN_PAGE] });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /must leave a route/i);
});

test('a restricted instrument needs a route too (the BFCRS standing)', () => {
  const bare = entry({ status: 'restricted' });
  delete bare.officialSource;
  const r = run({ instruments: [bare], pages: [CLEAN_PAGE] });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /must leave a route/i);
});

test('mirroring the form here instead of linking the custodian fails hard', () => {
  // Hosting the whole form is BROADER redistribution than the excerpts that were withdrawn.
  // Recording a repo-relative path is the shape that mistake would take.
  for (const bad of ['/forms/fixture-scale.pdf', 'forms/fixture-scale.pdf', 'http://forms.example.org/x']) {
    const mirrored = entry();
    mirrored.officialSource.formUrl = bad;
    const r = run({ instruments: [mirrored], pages: [CLEAN_PAGE] });
    assert.equal(r.hard.length, 1, `expected a finding for ${bad}`);
    assert.match(r.hard[0], /link-only route must be an absolute https URL/);
  }
});

test('a mirrored trainingUrl fails on the same rule', () => {
  const mirrored = entry();
  mirrored.officialSource.trainingUrl = '/training/fixture.html';
  const r = run({ instruments: [mirrored], pages: [CLEAN_PAGE] });
  assert.equal(r.hard.length, 1);
  assert.match(r.hard[0], /trainingUrl/);
});

test('the mirror rule guards the registry, so it runs on ungoverned builds too', () => {
  // Unlike the presentation pins, this is not a per-site choice: a mirrored form is a rights
  // problem wherever it ships.
  const mirrored = entry();
  mirrored.officialSource.formUrl = 'forms/fixture-scale.pdf';
  const r = run({ instruments: [mirrored], pages: [CLEAN_PAGE], claimsGovernance: false });
  assert.equal(r.hard.length, 1);
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

test('every real instrument records a route, and every route points at its custodian', () => {
  // Not only the retired/restricted ones the schema requires. COWS and PHQ-9/GAD-7 still
  // ship reproductions, and the route is what makes "score from the real form, not from this
  // page" an instruction a learner can follow; Stanley-Brown has no page at all, and carries
  // its route so WP-06R-b's rehearsal tool inherits one instead of inventing it.
  const rights = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  for (const e of rights.instruments) {
    const src = e.officialSource;
    assert.ok(src, `${e.id}: no officialSource — a learner meeting this instrument needs the form`);
    assert.match(src.formUrl, /^https:\/\/[^/\s]+\./,
      `${e.id}: formUrl must be an absolute https custodian URL — this library links, never mirrors`);
    assert.ok(src.formLabel && src.formLabel.length >= 8,
      `${e.id}: say what the learner gets, not "click here"`);
    assert.match(src.verified, /^\d{4}-\d{2}-\d{2}$/, `${e.id}: verified must be a date`);
    if (src.trainingUrl) assert.match(src.trainingUrl, /^https:\/\/[^/\s]+\./);
  }
});

test('the CIWA-Ar route is honest about being a third-party posting', () => {
  // It is the one instrument here with no custodian still distributing a form — which is the
  // same fact that made its rights unestablishable (2026-08-28). A route recorded as though
  // CSAM were the rights-holder would quietly re-argue a settled question.
  const rights = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const ciwa = rights.instruments.find((i) => i.id === 'ciwa-ar');
  assert.equal(ciwa.officialSource.access, 'institution-protocol',
    'the form the learner scores from is the unit’s, not the linked copy');
  assert.match(ciwa.officialSource.note, /not (the rights-holder|a licensor)/i,
    'the note must say whose copy this is');
});

test('recording a route did not disturb any disposition', () => {
  // Routes are wayfinding and get refreshed freely; statuses move only with a decisionRef.
  // Pinned so a future link fix cannot ride a status change in with it.
  const rights = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const statuses = Object.fromEntries(rights.instruments.map((i) => [i.id, i.status]));
  assert.deepEqual(statuses, {
    cssrs: 'retired',
    bfcrs: 'restricted',
    cows: 'flagged-interim',
    'ciwa-ar': 'retired',
    'phq9-gad7': 'provisional',
    'stanley-brown': 'restricted',
  });
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
