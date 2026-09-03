// Audience must follow the project, not a hard-coded project name.
//
// Every smoke spec decides which site it is looking at from testInfo.project.name.
// Until 2026-09-03 that decision was a literal comparison against 'nav-res'. #473
// added a second pair of projects — canary-ms3 / canary-res — pointing a SUBSET of
// the same specs at production. Under 'canary-res' the literal is false, so the
// resident crawl silently asserted the MS3 inventory:
//
//     [canary-res] nav-crawl.spec.js:159
//     Expected: 83   Received: 92
//
// 17 passed, 2 failed, zero transport errors. The canary reported the library as
// broken when the library was fine and the TEST was pointed at the wrong audience
// — the exact class of false alarm #473 existed to remove.
//
// These tests pin the property rather than the current project list, so adding a
// third pair (staging, per-PR preview) cannot reintroduce it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeDir = path.join(repo, 'tests', 'smoke');
const config = fs.readFileSync(path.join(smokeDir, 'playwright.config.js'), 'utf8');

const { projectAudience, isResidentProject } = await import(
  path.join(smokeDir, 'audience.js')
);

test('audience is derived from the project name suffix, both pairs', () => {
  assert.equal(projectAudience('nav-res'), 'resident');
  assert.equal(projectAudience('canary-res'), 'resident');
  assert.equal(projectAudience('nav-ms3'), 'ms3');
  assert.equal(projectAudience('canary-ms3'), 'ms3');

  assert.equal(isResidentProject('canary-res'), true);
  // The regression itself: this returned false before the fix, sending the
  // resident crawl down the ms3 branch.
  assert.notEqual(isResidentProject('canary-res'), isResidentProject('canary-ms3'));
});

test('a project name carrying no audience fails loudly rather than defaulting to ms3', () => {
  // Silently guessing is what made the canary failure look like a content fault.
  assert.throws(() => projectAudience('canary'), /encodes no audience/);
  assert.throws(() => projectAudience(''), /encodes no audience/);
  assert.throws(() => projectAudience(undefined), /encodes no audience/);
});

// Deliberately NOT "every project": lfs, visual, interview-room, faculty-console and
// offline each run a single audience-agnostic spec and never consult the helper.
// Requiring an audience of them would be false, and projectAudience() throws by
// design. The property that matters is narrower and exact: any project that runs an
// audience-dependent spec must resolve.
test('every project running an audience-dependent spec resolves to an audience', () => {
  // Always follow the declaration, never a flattened snapshot of it: CANARY_MS3_SPECS
  // is `[...CANARY_SHARED_SPECS, 'qbank-retired.spec.js']`, so reading only its own
  // literals loses nav-crawl.spec.js — the very spec this test is here to track.
  const expand = (name, seen = new Set()) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const body = config.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
    if (!body) return [];
    const direct = [...body[1].matchAll(/'([^']+\.spec\.js)'/g)].map(m => m[1]);
    const spread = [...body[1].matchAll(/\.\.\.([A-Z0-9_]+)/g)].flatMap(m => expand(m[1], seen));
    return [...direct, ...spread];
  };

  const projects = [...config.matchAll(/name: '([^']+)',\s*\n\s*testMatch: ([^\n]+?),?\s*\n/g)]
    .map(([, name, testMatch]) => {
      const specs = testMatch.trim().startsWith('[')
        ? [...testMatch.matchAll(/'([^']+\.spec\.js)'/g)].map(m => m[1])
        : expand(testMatch.replace(/[^A-Z0-9_]/g, ''));
      return { name, specs };
    });

  const audienceDependent = projects.filter(p => p.specs.includes('nav-crawl.spec.js'));
  assert.deepEqual(
    audienceDependent.map(p => p.name).sort(),
    ['canary-ms3', 'canary-res', 'nav-ms3', 'nav-res'],
    'the set of projects running nav-crawl.spec.js changed — confirm each still encodes its audience',
  );
  for (const { name } of audienceDependent) {
    assert.doesNotThrow(
      () => projectAudience(name),
      `project "${name}" runs nav-crawl.spec.js but encodes no audience in its name, so every `
      + 'audience-dependent assertion in it would take the wrong branch',
    );
  }
});

test('no spec re-hard-codes a project name to decide audience', () => {
  // Scoped to the specs the canary actually runs. The nav-*-only specs still carry
  // the old literal; it is correct for them today and changing them is a separate
  // change, but a canary spec cannot carry it without reintroducing this bug.
  const canarySpecs = ['nav-crawl.spec.js', 'governance-warnings.spec.js', 'qbank-retired.spec.js'];
  for (const spec of canarySpecs) {
    const source = fs.readFileSync(path.join(smokeDir, spec), 'utf8');
    assert.doesNotMatch(
      source,
      /project\.name\s*===\s*'nav-(res|ms3)'/,
      `${spec} runs under the canary projects too, so comparing project.name against a `
      + "literal 'nav-*' silently mis-keys the audience there — use projectAudience()/"
      + 'isResidentProject() from ./audience.js instead',
    );
  }
});
