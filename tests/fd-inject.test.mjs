// Pins the ORDER of the injected snippets, which is load-bearing: fd_state calls localDayIndex
// from phase_policy, and fd_path/fd_reader call fdTodayProgress/fdRow from fd_today. A page whose
// markers appear in the wrong order throws on boot -- and every module's own unit suite would
// still pass, because each concatenates its own dependencies. This is the only test that sees the
// real page order.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SHELL = '../13_Faculty_Resources/_automation/site_build/spa_index.html';
const src = readFileSync(new URL(SHELL, import.meta.url), 'utf8');

// FD_WIRE is last on purpose: it is the only module that calls INTO the renderers above it
// (fdReaderNeighbours, fdSheetKitEntry, fdSearchResults, fdKeyAction) as well as into the shell's
// own fdRender/fdCurrentState. Function declarations hoist, so the position is not what makes it
// work -- but a reader scanning this list should see the dependency direction, and an injection
// that put the wiring above its renderers would be the first thing to suspect.
const ORDER = [
  '/*__PHASE_POLICY__*/', '/*__FD_STATE__*/', '/*__FD_DATA__*/', '/*__FD_DUE__*/',
  '/*__FD_TODAY__*/', '/*__FD_SHELL__*/', '/*__FD_PATH__*/', '/*__FD_LIBRARY__*/',
  '/*__FD_READER__*/', '/*__FD_SEARCH__*/', '/*__FD_SHEET__*/', '/*__FD_WIRE__*/',
];

test('every front-door marker appears exactly once in the shell', () => {
  for (const m of ORDER) {
    assert.equal(src.split(m).length - 1, 1, `${m} must appear exactly once`);
  }
});

test('markers appear in dependency order', () => {
  let last = -1;
  for (const m of ORDER) {
    const at = src.indexOf(m);
    assert.ok(at > last, `${m} must come after ${ORDER[ORDER.indexOf(m) - 1] || 'the start'}`);
    last = at;
  }
});

test('the shell declares the data needles the build replaces', () => {
  for (const n of ['FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY',
                   'FD_SITE_MANIFEST', 'FD_ROLES']) {
    assert.equal(src.split('var ' + n + '=').length - 1, 1,
      `exactly one 'var ${n}=' declaration, for build_deploy.py to replace`);
  }
});

// ORDER above is hand-maintained, and EXPECTED_MARKER_COUNT (parallel-ceilings.test.mjs) only
// pins SNIPPET_MARKERS' SIZE, not ORDER's coverage -- so a marker could be added to both
// SNIPPET_MARKERS and the shell, bump that count correctly, and still land unpinned here if
// nobody remembers to add it to ORDER too. Scan the shell for every FD_* marker actually present
// and require each one to be in ORDER, so a 10th marker (Tasks 4/5 each add one) fails loudly
// here instead of silently shipping with no ordering guarantee.
test('every FD_* marker in the shell is covered by ORDER', () => {
  const found = new Set(src.match(/\/\*__FD_[A-Z0-9_]+__\*\//g) || []);
  assert.ok(found.size > 0, 'sanity: expected to find at least one FD_* marker in the shell');
  for (const m of found) {
    assert.ok(ORDER.includes(m), `${m} appears in spa_index.html but is missing from ORDER`);
  }
});
