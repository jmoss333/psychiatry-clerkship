import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The daily production canary crawls the two LIVE Netlify sites. Its projects (canary-ms3 /
// canary-res) are deliberately NARROWER than the nav-* projects CI runs against a local build.
//
// Why this file exists: on 2026-08-20, PR #377 added frontdoor-runtime.spec.js (52 tests, ~98
// page loads) and rotation-edition-v2.spec.js to the nav-* projects — a correct change for CI,
// which runs them against a build. But the production canary consumed the same projects, so it
// silently inherited them. The canary had been green for the 12 scheduled runs before; it then
// went red on 11 of its next 13, every failure a transport error against Netlify's edge
// (ECONNRESET, net::ERR_ABORTED, "Request context disposed") and never once a content assertion.
// Two weeks of daily red on the only automated watch over the live learner sites.
//
// The lesson is not "those specs are bad" — they are good CI specs. It is that a production
// monitor must not share a project list with a build-time suite, because widening the suite is
// invisible from the monitor's side. This test makes the canary's scope explicit and pinned:
// a feature PR can still add any spec it likes to nav-*, and the canary will not notice.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repo, 'tests', 'smoke', 'playwright.config.js');
const smokeDir = path.join(repo, 'tests', 'smoke');
const config = fs.readFileSync(configPath, 'utf8');

// The pinned canary composition. A spec belongs here only if PRODUCTION can be wrong about it in
// a way a local build cannot: pages resolving, bodies non-empty and not Git-LFS pointer stubs,
// the nav inventory matching what was deployed, and the governance/attestation surfaces actually
// rendering to a learner. Client-side behaviour is byte-identical in the build CI already tests.
const EXPECTED = {
  'canary-ms3': ['nav-crawl.spec.js', 'governance-warnings.spec.js', 'qbank-retired.spec.js'],
  'canary-res': ['nav-crawl.spec.js', 'governance-warnings.spec.js'],
};

// A canary spec must be CHEAP, because every operation crosses the public internet to Netlify's
// edge and a burst of them earns connection resets that say nothing about the site. This budget
// counts browser round-trips (navigations + in-page evaluations) per spec file.
//
// Calibration at the time of writing (measured with roundTrips() below), so the ceiling sits in
// open space and needs no tuning as the canary specs grow:
//   in  : nav-crawl 4 · qbank-retired 5 · governance-warnings 8          (ceiling is ~4x the max)
//   out : rotation-curator 35 · front-door 38 · communication-practice 50
//         rotation-edition-v2 86 · frontdoor-runtime 220
const ROUND_TRIP_BUDGET = 30;

function readArray(name) {
  const match = config.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  assert.ok(match, `${name} must be declared in playwright.config.js`);
  return [...match[1].matchAll(/'([^']+\.spec\.js)'/g)].map(m => m[1]);
}

function projectTestMatch(name) {
  const match = config.match(
    new RegExp(`name: '${name}',\\s*\\n\\s*testMatch: ([A-Z0-9_]+),`),
  );
  assert.ok(match, `project ${name} must exist and take testMatch from a named constant`);
  return match[1];
}

function roundTrips(spec) {
  const source = fs.readFileSync(path.join(smokeDir, spec), 'utf8');
  const count = pattern => (source.match(pattern) || []).length;
  return count(/\bpage\.goto\(/g) + count(/\bpage\.reload\(/g) + count(/\.evaluate\(/g);
}

test('the canary projects exist and resolve to the pinned spec sets', () => {
  const resolved = {
    'canary-ms3': readArray(projectTestMatch('canary-ms3')),
    'canary-res': readArray(projectTestMatch('canary-res')),
  };
  // CANARY_MS3_SPECS/CANARY_RES_SPECS spread CANARY_SHARED_SPECS, which the literal-array regex
  // above cannot see through, so compare on the shared set plus each project's own additions.
  const shared = readArray('CANARY_SHARED_SPECS');
  for (const [project, own] of Object.entries(resolved)) {
    const full = [...new Set([...shared, ...own])];
    assert.deepEqual(
      full.slice().sort(),
      EXPECTED[project].slice().sort(),
      `${project} must run exactly the pinned production-truth specs`,
    );
  }
});

test('every canary spec exists and stays within the production round-trip budget', () => {
  for (const spec of new Set(Object.values(EXPECTED).flat())) {
    assert.ok(
      fs.existsSync(path.join(smokeDir, spec)),
      `canary spec ${spec} does not exist`,
    );
    const trips = roundTrips(spec);
    assert.ok(
      trips <= ROUND_TRIP_BUDGET,
      `${spec} makes ${trips} browser round-trips, over the ${ROUND_TRIP_BUDGET} budget for a `
        + 'spec that runs against live production. Either keep it light, or leave it to the '
        + 'nav-* projects that CI runs against a local build.',
    );
  }
});

test('the client-runtime fault-injection suites stay out of the canary', () => {
  // Named explicitly as well as budgeted: these are the four that caused the 2026-08 regression,
  // and a name check reports a far clearer failure than a round-trip count if one returns.
  const BUILD_ONLY = [
    'frontdoor-runtime.spec.js',
    'rotation-edition-v2.spec.js',
    'communication-practice.spec.js',
    'rotation-curator.spec.js',
  ];
  const canarySpecs = new Set(Object.values(EXPECTED).flat());
  for (const spec of BUILD_ONLY) {
    assert.ok(
      !canarySpecs.has(spec),
      `${spec} injects startup faults and drives many page loads; it tests browser logic that is `
        + 'identical in the build CI covers on every PR. Against live Netlify it yields transport '
        + 'noise and no production signal.',
    );
  }
  // And it must still be a real CI spec — if one is deleted or renamed, this list is stale.
  for (const spec of BUILD_ONLY) {
    assert.ok(
      fs.existsSync(path.join(smokeDir, spec)),
      `${spec} no longer exists; update BUILD_ONLY in this test`,
    );
  }
});

test('CI still runs the full nav-* projects, so nothing loses coverage', () => {
  const ci = fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(
    ci,
    /--project=nav-ms3 --project=nav-res/,
    'ci.yml must keep running the full nav-* projects against the local build — narrowing the '
      + 'canary only moves that coverage, it does not drop it',
  );
  for (const project of ['nav-ms3', 'nav-res']) {
    const match = config.match(new RegExp(`name: '${project}',\\s*\\n\\s*testMatch: \\[([^\\]]*)\\]`));
    assert.ok(match, `project ${project} must keep its inline testMatch list`);
    const specs = [...match[1].matchAll(/'([^']+\.spec\.js)'/g)].map(m => m[1]);
    assert.ok(
      specs.includes('frontdoor-runtime.spec.js'),
      `${project} must still carry frontdoor-runtime.spec.js — CI is where it belongs`,
    );
  }
});
