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

test('no canary spec identifies its audience by an exact project name', () => {
  // The hole this test closes. #473 added canary-ms3/canary-res, but the specs derived audience
  // from `testInfo.project.name === 'nav-res'`, so canary-res fell through to the MS3 branch and
  // asserted 83 routes against the resident site's 92 on the canary's first live run. Two red
  // tests, zero production signal — the exact failure mode #473 set out to remove.
  //
  // The scope test above passed throughout, because composition was never the problem: a spec can
  // be correctly chosen and still be unable to tell which site it is pointed at. Audience must
  // come from audience.js, which derives it from the project's suffix.
  const BARE_PREDICATE = /project\.name\s*===\s*['"]nav-(res|ms3)['"]/;
  for (const spec of new Set(Object.values(EXPECTED).flat())) {
    const source = fs.readFileSync(path.join(smokeDir, spec), 'utf8');
    assert.ok(
      !BARE_PREDICATE.test(source),
      `${spec} compares project.name to a literal 'nav-*'. A canary project is named canary-*, `
        + 'so that test silently answers for the wrong audience. Use isResidentProject/audienceOf '
        + 'from tests/smoke/audience.js instead.',
    );
  }
});

// The five projects whose names encode no audience. Each runs a single audience-agnostic spec,
// and none of those specs may import audience.js — that is what makes audienceOf() safe to throw
// on an unrecognised name instead of quietly answering 'ms3'. Defaulting is the exact shape of
// the bug audience.js exists to fix: a name nobody taught the helper about becoming the MS3
// answer in silence. If one of these suites ever genuinely needs an audience, give the project
// an audience-bearing name — do not soften the helper.
const AUDIENCE_AGNOSTIC = ['lfs', 'visual', 'interview-room', 'faculty-console', 'offline'];

test('audience.js resolves every audience-bearing project name in the config', async () => {
  const { audienceOf } = await import(path.join(smokeDir, 'audience.js'));
  const names = [...config.matchAll(/name: '([^']+)'/g)].map(m => m[1]);
  assert.ok(names.includes('canary-res') && names.includes('nav-res'), 'expected the -res projects');
  for (const name of names.filter(n => !AUDIENCE_AGNOSTIC.includes(n))) {
    const expected = name.endsWith('-res') ? 'resident' : 'ms3';
    assert.equal(
      audienceOf(name),
      expected,
      `project ${name} must resolve to the ${expected} audience`,
    );
  }
});

test('audienceOf throws on a name encoding no audience, rather than defaulting to ms3', async () => {
  const { audienceOf } = await import(path.join(smokeDir, 'audience.js'));
  for (const name of ['staging', 'preview-1', 'nav', '']) {
    assert.throws(
      () => audienceOf(name),
      /encodes no audience/,
      `audienceOf(${JSON.stringify(name)}) must throw; silently answering 'ms3' is how `
        + 'canary-res asserted the MS3 inventory against the resident site',
    );
  }
});

test('every project name in the config is either audience-bearing or a known agnostic one', () => {
  // Catches the third case: a NEW project added with a name like 'staging' or 'preview-mmc'.
  // Either it belongs to an audience and must say so in its name, or it is agnostic and must be
  // listed above — which forces whoever adds it to check that its spec does not import
  // audience.js. Without this, a new agnostic project would only surface as a throw at run time.
  const names = [...config.matchAll(/name: '([^']+)'/g)].map(m => m[1]);
  const unclassified = names.filter(
    n => !AUDIENCE_AGNOSTIC.includes(n) && !/-(res|ms3)$/.test(n),
  );
  assert.deepEqual(
    unclassified,
    [],
    `project(s) ${unclassified.join(', ')} encode no audience and are not listed in `
      + 'AUDIENCE_AGNOSTIC. Give the project an audience suffix, or add it to that list after '
      + 'confirming its spec does not import audience.js.',
  );
});

test('no audience-agnostic spec imports audience.js', () => {
  // The invariant that lets audienceOf() throw. These projects run under names that encode no
  // audience, so a spec of theirs calling the helper would fail at run time, inside a scheduled
  // job, rather than here.
  const specForProject = new Map();
  for (const name of AUDIENCE_AGNOSTIC) {
    const block = config.slice(config.indexOf(`name: '${name}'`));
    const match = block.match(/testMatch:\s*'([^']+)'/);
    if (match) specForProject.set(name, match[1]);
  }
  assert.equal(
    specForProject.size,
    AUDIENCE_AGNOSTIC.length,
    'could not read a testMatch for every audience-agnostic project; the config shape changed',
  );
  for (const [name, spec] of specForProject) {
    const source = fs.readFileSync(path.join(smokeDir, spec), 'utf8');
    assert.ok(
      !/from '\.\/audience\.js'/.test(source),
      `${spec} runs under the audience-agnostic project '${name}' but imports audience.js. `
        + 'audienceOf() will throw there. Give the project an audience-bearing name instead.',
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
