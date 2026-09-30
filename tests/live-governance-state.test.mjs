/* A test may not depend on live governance state. This file makes that rule enforceable.

THE RULE (CLAUDE.md): an assertion that reads the faculty's real sign-offs -- "some page is
pending", "the bank holds drafts", "this page is attested" -- is a test of the faculty's queue,
not of the code, and faculty draining that queue turns it red. The inverse also holds: a test
that passes only while a backlog exists retires itself silently when the backlog clears.

WHY IT NEEDED TEETH. The rule lived in CLAUDE.md and was broken three times anyway, each time
blocking the very sign-offs it was reading:
  #729  front-door.spec.js wanted a pending Library page; #725 attested 101 pages.
  #781  faculty-qbank-rules.test.mjs pinned 55 draft questions; 39 attestations made it 16.
  #895  qbank-retired.spec.js wanted the shipped bank to hold drafts; #895 attested the last 5.
Building this found four more that had not bitten yet (all fixed in the same change):
  faculty-batch-selection.test.mjs    had checked nothing since the queue fell below 4 drafts
                                      per category; now it skips and says so.
  fd-sheet.test.mjs                   read delirium.md's live facultyReview as a "fixture
                                      premise"; now the reviewed branch is a controlled fixture.
  fd-data.test.mjs                    required all five safety-kit pages to be attested; now it
                                      requires `attested` to follow each page's own record and
                                      reports an unattested kit protocol as a diagnostic.
  attestation-projection-build.test   its contentHash floor went red when nothing was signed;
                                      now that state skips and a hashless signed ledger still fails.

WHAT THIS ENFORCES, in three layers:
  1. FIND. tests/_live_state_scan.mjs reads every file under tests/ and reports each one that
     reads a governed file from the real repository or a served site AND uses a review-state
     value. (Its header says exactly what it can and cannot see.)
  2. REGISTER. Every finding must appear in REGISTRY below with a kind and a reason, and every
     registration must still be a finding. A new live-state test cannot land unnoticed: the
     reviewer sees the registry line and the reason.
  3. REHEARSE. Every registered node test is re-run with the faculty's work done for it (see
     tests/_live_state_rehearsal.mjs for the five scenarios, each a state main can really reach,
     with the ledger and topic_meta.json kept in step and fresh hashes computed by the console's
     own hash module). Reads are redirected for that run only, and the run fails closed: a
     rehearsal that never reached the test's reads of a governed file is a failure, not a pass.
     Playwright specs cannot be rehearsed here (they need a built site); their registration and
     its reason are the control.

WHEN A REHEARSAL GOES RED there are exactly two explanations, and the fix differs:
  (a) the test depends on the faculty's live queue -- fix the test (HOW_TO_FIX below);
  (b) the scenario made a state the console or an honest content change cannot make, and the
      test is a governance or integrity check objecting correctly -- fix the SCENARIO in
      tests/_live_state_rehearsal.mjs. Never weaken an integrity check to satisfy a rehearsal
      (CLAUDE.md: do not "fix" a test that is reporting a governance violation).

TO RUN ONE REHEARSAL BY HAND:
  LIVE_STATE_SCENARIO=qbank-drained NODE_OPTIONS=--import=./tests/_live_state_rehearsal.mjs \
    node --test tests/<file>
*/

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  clinicalManifestForSlug,
  clinicalSourceSha,
  digestFromManifest,
  manifestForSlug,
  sourceBlobSha,
  sourcesForSlug,
} from '../faculty-console/attestation-hash.mjs';
import { SOURCES, scanSource, scanTree } from './_live_state_scan.mjs';
import { GOVERNED_FILES, SCENARIOS, rehearsedFiles, serialise } from './_live_state_rehearsal.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRELOAD = pathToFileURL(path.join(ROOT, 'tests', '_live_state_rehearsal.mjs')).href;
const SELF = ['tests/live-governance-state.test.mjs', 'tests/_live_state_scan.mjs', 'tests/_live_state_rehearsal.mjs'];

const KINDS = Object.freeze({
  invariant: 'asserts only what holds for every legitimate review state: a partition, either status allowed, a count computed from the same data rather than pinned',
  fixture: 'reads live content but serves or derives its own review state, so the state under test is fixed by the test (the #729 and #903 pattern)',
  'skips-visibly': 'needs a live example in some review state; when none exists it skips with the reason, and the branch is pinned by a fixture test elsewhere',
  dormant: 'not run by any gate (a bin/check_vacuity.py EXEMPT path); listed so its live-state debt is visible before anyone wires it in',
});

/* One entry per test that reads live review state.
     why           how it stays right whatever the faculty do (one or two sentences).
     sources       governed files it reads that the scanner cannot see (added to what it finds).
     skipScenarios scenario -> the reason that rehearsal cannot apply to this file.
     skipsUnder    rehearsals in which `skipTest` must report SKIP rather than pass: the proof it
                   no longer passes over an empty set.
     detected      false for a test the scanner cannot see at all; it must stay undetected, or
                   the flag comes off. */
const REGISTRY = Object.freeze({
  'tests/anki/test_qbank_governance.py': {
    kind: 'dormant',
    why: 'Pins live counts (192 items, 143 eligible, 49 drafts, 3 retired) and `_note` wording that main '
      + 'no longer matches (184 attested, 5 draft, 3 retired on 2026-09-30), so it fails the day the suite is '
      + 'wired in. Replace the pins with the partition checks faculty-qbank-rules.test.mjs adopted on 2026-09-25 first.',
  },
  'tests/anki/test_render.py': {
    kind: 'dormant',
    why: 'Its `qbank` fixture loads the live bank; the tests over it check render shapes and hashes, not '
      + 'counts, but they cannot be rehearsed without anki==26.5 + genanki. Rehearse against a drained bank before wiring the suite in.',
  },
  'tests/anki/test_review.py': {
    kind: 'dormant',
    why: 'test_real_shaped_qb_pha_002_preview_resolves_exact_governed_source asserts the psychopharmacology '
      + "primer is SIGNED in the live ledger (source['status']['status'] == 'reviewed'): a live pin that goes red "
      + 'the first time that page is reopened. Fix before wiring the suite in.',
  },
  'tests/attestation-hash-parity.test.mjs': {
    kind: 'invariant',
    sources: ['qbank'],
    skipScenarios: {
      'qbank-drained': 'the question-bank checks compare node with a Python twin and with git, both of which read the real bank in a subprocess',
      'qbank-retired': 'the question-bank checks compare node with a Python twin and with git, both of which read the real bank in a subprocess',
    },
    why: 'The JS and Python hash twins must agree on whatever the ledger, topic_meta.json and the bank hold; '
      + 'the status-flip checks build their own flipped copy, and the stored-hash format test reports its counts rather than pinning them.',
  },
  'tests/attestation-projection-build.test.mjs': {
    kind: 'skips-visibly',
    skipsUnder: ['pages-reopened'],
    skipTest: 'no stored contentHash reaches any built artifact',
    why: 'Compares the built sites with the source ledger and topic_meta.json and skips per site when _build/ '
      + 'is stale; its contentHash floor now skips when nothing is signed and nothing is hashed, and still fails a signed ledger with no hash.',
  },
  'tests/faculty-batch-selection.test.mjs': {
    kind: 'skips-visibly',
    skipsUnder: ['qbank-drained', 'qbank-retired'],
    skipTest: 'the live bank: every per-category draft cohort of 4+ now passes assessBatch',
    why: 'Batches the live draft queue by category; with no category holding 4+ drafts it now skips with the '
      + 'count instead of passing over nothing. The balance rule is pinned by the fixture tests in the same file.',
  },
  'tests/faculty-qbank-rules.test.mjs': {
    kind: 'invariant',
    why: 'The current-bank test asserts only a partition (draft + attested = active, the key tally covers '
      + 'exactly the drafts, every active item blocker-free); its live-count pins came out on 2026-09-25 after #781.',
  },
  'tests/fd-data.test.mjs': {
    kind: 'invariant',
    why: 'Reads real topic_meta.json content for the Front Door index; the kit test requires `attested` to '
      + "follow each kit page's own facultyReview and reports an unattested kit protocol as a diagnostic.",
  },
  'tests/fd-library.test.mjs': {
    kind: 'invariant',
    why: 'Real Essentials renders with its pending count computed from the same index and compared with the '
      + 'rendered HTML, never pinned; the review-state branches use inline fixtures.',
  },
  'tests/fd-search.test.mjs': {
    kind: 'invariant',
    why: 'Searches real topic_meta.json content; every review-state case (pending high-risk, reviewed) is an '
      + 'inline fixture item.',
  },
  'tests/fd-sheet.test.mjs': {
    kind: 'fixture',
    why: 'Renders real protocols; the reviewed branch is pinned by ATTESTED_META, a controlled review state over '
      + "the real delirium.md content, instead of that page's live facultyReview.",
  },
  'tests/mse-rounds.test.mjs': {
    kind: 'invariant',
    why: 'Allows either ledger status for mse.html and oral.html and checks the pending sentinel only for a '
      + 'row that is pending.',
  },
  'tests/post-event-huddle.test.mjs': {
    kind: 'invariant',
    why: 'Requires only that the page marker never claims a review the ledger lacks, for either ledger status; '
      + "the rule's truth table is pinned beside it.",
  },
  'tests/search-discovery.test.mjs': {
    kind: 'invariant',
    why: 'Real topic_meta.json supplies the search content; the governance triplets it attaches are inline '
      + 'fixtures, so no assertion depends on what is signed.',
  },
  'tests/search-ward-benchmark.test.mjs': {
    kind: 'invariant',
    why: 'Real topic_meta.json supplies the benchmark content; the governance triplets it attaches are inline '
      + 'fixtures, so no assertion depends on what is signed.',
  },
  'tests/smoke/front-door.spec.js': {
    kind: 'fixture',
    why: 'Reads the served governance.json and topic_meta.json, then pins each governance branch with a '
      + 'controlled fixture (#729). Playwright, so not rehearsed here.',
  },
  'tests/smoke/qbank-retired.spec.js': {
    kind: 'fixture',
    why: 'Derives a test bank guaranteed to hold attested, draft and retired items from the shipped one and '
      + 'serves it with page.route (#903). Playwright, so not rehearsed here.',
  },
  'tests/smoke/governance-warnings.spec.js': {
    kind: 'skips-visibly',
    detected: false,
    why: "Reads live review state through nav.json's embedded governance, which the scanner does not trace; "
      + 'when no placed item is in the needed state it skips with the reason, and surface-governance-ui.test.mjs '
      + 'pins the branches. Playwright, so not rehearsed here.',
  },
});

const HOW_TO_FIX = `
If the test reads the faculty's live queue, it will go red when the faculty do their job (#729,
#781, #895), or quietly stop checking anything when the queue empties. Pick one:
  1. Serve or build your own review state: a fixture, or a state derived from the live file the
     way tests/smoke/qbank-retired.spec.js derives its bank. Register it as "fixture".
  2. Assert only what holds for ANY legitimate state: a partition, "either status is allowed", a
     count computed from the same data. Register it as "invariant".
  3. If the check needs a live example that may not exist, skip visibly with the reason
     (t.skip / test.skip) and pin the branch with a fixture elsewhere. Register it as "skips-visibly".
Then add it to REGISTRY in tests/live-governance-state.test.mjs with one or two sentences on why it
stays right. Node tests are re-run with the queue drained and refilled to prove it.
BUT if the red assertion is an integrity or governance check (hashes bound, ledger and topic_meta
agreeing, a signature by a human), the scenario may have made a state the console cannot make:
fix the scenario in tests/_live_state_rehearsal.mjs, never the check.`;

const isNodeTest = (file) => /^tests\/[^/]+\.test\.mjs$/.test(file);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* The governed files a registered test reads, and the rehearsals it must survive: every scenario
   that touches one of them, minus the recorded exceptions. */
function sourcesOf(file, entry, found) {
  return [...new Set([...(found.get(file)?.sources || []), ...(entry.sources || [])])].sort();
}
function scenariosFor(file, entry, found) {
  const sources = new Set(sourcesOf(file, entry, found));
  return Object.entries(SCENARIOS)
    .filter(([name, s]) => s.touches.some((source) => sources.has(source)) && !entry.skipScenarios?.[name])
    .map(([name]) => name);
}

function tapCounts(output) {
  const count = (key) => Number((output.match(new RegExp(`^# ${key} (\\d+)$`, 'm')) || [])[1] ?? NaN);
  return { tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped') };
}

async function rehearse(file, scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-state-rehearsal-'));
  const countFile = path.join(dir, 'redirected.txt');
  fs.writeFileSync(countFile, '');
  const env = {
    ...process.env,
    LIVE_STATE_SCENARIO: scenario,
    LIVE_STATE_COUNT_FILE: countFile,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${PRELOAD}`.trim(),
  };
  delete env.NODE_TEST_CONTEXT;
  let result;
  try {
    const { stdout, stderr } = await run(process.execPath, ['--test', '--test-reporter=tap', file],
      { cwd: ROOT, env, timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
    result = { code: 0, output: `${stdout}\n${stderr}` };
  } catch (error) {
    const infra = error.killed || error.signal || typeof error.code === 'string';
    result = { code: infra ? 'infra' : (error.code ?? 1), output: `${error.stdout || ''}\n${error.stderr || ''}\n${error.message}` };
  }
  const redirected = {};
  for (const line of fs.readFileSync(countFile, 'utf8').split('\n').filter(Boolean)) {
    const source = line.split(' ')[1];
    redirected[source] = (redirected[source] || 0) + 1;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...result, redirected };
}

const failureExcerpt = (output) => output.split('\n')
  .filter((line) => /^not ok|^\s+(error|expected|actual|message|name):|AssertionError|Error:/.test(line))
  .slice(0, 24).join('\n');

/* Everything wrong with one rehearsal run, as sentences. Empty means it passed honestly. */
function verdict(file, entry, sources, scenario, result) {
  const says = SCENARIOS[scenario].says;
  const problems = [];
  if (result.code === 'infra') {
    return [`${file} [${scenario}]: the rehearsal could not run (timeout, signal or output overflow) -- `
      + `an infrastructure failure, not a finding about the test.\n${result.output.slice(-1500)}`];
  }
  if (result.code !== 0) {
    problems.push(`${file} went red when ${says}. Decide which it is before changing anything: a test of `
      + `the faculty's live queue, or a governance check objecting to a state the scenario should not make.\n`
      + `${failureExcerpt(result.output)}\n${HOW_TO_FIX}`);
  }
  const counts = tapCounts(result.output);
  if (!(counts.tests > 0)) problems.push(`${file} ran no tests under ${scenario}.\n${result.output.slice(0, 1500)}`);
  for (const source of SCENARIOS[scenario].touches.filter((s) => sources.includes(s))) {
    if (!result.redirected[source]) {
      problems.push(`${file} [${scenario}]: the rehearsal never reached its read of ${SOURCES[source].what}, so the `
        + 'run proved nothing. It reads the file some way the rehearsal cannot redirect (a JSON import, a '
        + 'stream, a non-node subprocess): read it through node:fs, or record the reason in skipScenarios.');
    }
  }
  if ((entry.skipsUnder || []).includes(scenario)) {
    const skipped = new RegExp(`^ok \\d+ - ${escapeRe(entry.skipTest)}[^\\n]*# SKIP`, 'm');
    if (!skipped.test(result.output)) {
      problems.push(`${file}: "${entry.skipTest}" must skip, visibly, when ${says}; it did not, so it is `
        + 'passing over an empty set.');
    }
  }
  return problems;
}

// ---- 1. the scanner ------------------------------------------------------------------------------

const PLANTED = [
  // The three that shipped.
  ['#895 as shipped: the served bank must hold drafts', 'tests/smoke/p.spec.js', [
    "const res = await requestGetWithRetry(page.request, `${baseURL}/question_bank.json`);",
    "const drafts = items.filter((it) => !it.retired && it.status !== 'attested');",
    'expect(drafts.length).toBeGreaterThan(0);',
  ], { sources: ['qbank'], usesState: true }],
  ['#729 as shipped: the served ledger must hold a pending page', 'tests/smoke/p.spec.js', [
    "const response = await requestGetWithRetry(page.request, '/governance.json');",
    "const pending = (await response.json()).items.filter((i) => i.status === 'pending');",
    'expect(pending.length).toBeGreaterThan(0);',
  ], { sources: ['served'], usesState: true }],
  ['#781 as shipped: a repo-root join and a pinned draft count', 'tests/p.test.mjs', [
    "const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "const bank = JSON.parse(fs.readFileSync(path.join(repo, 'question_bank.json'), 'utf8'));",
    "assert.equal(bank.items.filter((i) => i.status === 'draft').length, 55);",
  ], { sources: ['qbank'], usesState: true }],
  // The next ones someone might write.
  ['an arrow reader helper that resolves against import.meta.url', 'tests/p.test.mjs', [
    "const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));",
    "const META = readJson('../topic_meta.json');",
    "assert.equal(META['delirium.md'].facultyReview.status, 'reviewed');",
  ], { sources: ['meta'], usesState: true }],
  ['a function-declaration helper whose body spans lines', 'tests/p.test.mjs', [
    'function load(rel) {',
    '  const file = new URL(rel, import.meta.url);',
    "  return JSON.parse(readFileSync(file, 'utf8'));",
    '}',
    "const ledger = load('../13_Faculty_Resources/reviewed.json');",
    "assert.ok(Object.values(ledger).some((row) => row.status === 'pending'));",
  ], { sources: ['ledger'], usesState: true }],
  ['a file-name constant joined with the root on another line', 'tests/p.test.mjs', [
    "const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "const REVIEWED = '13_Faculty_Resources/reviewed.json';",
    'const ledger = readJson(repo, REVIEWED);',
    "assert.ok(Object.values(ledger).some((row) => row.status === 'pending'));",
  ], { sources: ['ledger'], usesState: true }],
  ['a served URL held in a variable', 'tests/smoke/p.spec.js', [
    'const url = `${baseURL}/governance.json`;',
    'const ledger = await (await request.get(url)).json();',
    "expect(ledger.items.some((i) => i.status === 'pending')).toBe(true);",
  ], { sources: ['served'], usesState: true }],
  ['a waitForResponse on the served ledger', 'tests/smoke/p.spec.js', [
    "const response = await page.waitForResponse('**/governance.json');",
    "expect((await response.json()).items.some((i) => i.status === 'pending')).toBe(true);",
  ], { sources: ['served'], usesState: true }],
  ['import.meta.dirname and an unquoted-key pin', 'tests/p.test.mjs', [
    "const bank = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'question_bank.json'), 'utf8'));",
    'assert.deepEqual(tally(bank), { attested: 184, draft: 5 });',
  ], { sources: ['qbank'], usesState: true }],
  ['process.cwd() as the root', 'tests/p.test.mjs', [
    'const ROOT = process.cwd();',
    "const ledger = JSON.parse(readFileSync(path.join(ROOT, '13_Faculty_Resources/reviewed.json'), 'utf8'));",
    'assert.equal(countByStatus(ledger).pending, 2);',
  ], { sources: ['ledger'], usesState: true }],
  ['a repository-relative path handed straight to a read', 'tests/p.test.mjs', [
    "const ledger = JSON.parse(readFileSync('13_Faculty_Resources/reviewed.json', 'utf8'));",
    "assert.ok(Object.values(ledger).some((row) => row.status === 'pending'));",
  ], { sources: ['ledger'], usesState: true }],
  ['a live read held in a variable NAMED fixture', 'tests/p.test.mjs', [
    "const fixture = JSON.parse(readFileSync(new URL('../question_bank.json', import.meta.url), 'utf8'));",
    "assert.ok(fixture.items.some((i) => i.status === 'draft'));",
  ], { sources: ['qbank'], usesState: true }],
  ['a copy of the live bank into a sandbox', 'tests/p.test.mjs', [
    "const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "fs.copyFileSync(path.join(repo, 'question_bank.json'), sandboxBank);",
    "assert.ok(readBank(sandboxBank).items.some((i) => i.status === 'draft'));",
  ], { sources: ['qbank'], usesState: true }],
  ['a regex literal that looks like a comment opener, before a live read', 'tests/p.test.mjs', [
    "const trim = (u) => u.replace(/^\\/*/, '');",
    "const bank = JSON.parse(readFileSync(new URL('../question_bank.json', import.meta.url), 'utf8'));",
    "assert.ok(bank.items.some((i) => i.status === 'draft'));",
  ], { sources: ['qbank'], usesState: true }],
  ['Python: a path constant under REPO_ROOT and a pinned count', 'tests/anki/test_p.py', [
    'REPO_ROOT = Path(__file__).resolve().parents[2]',
    'QBANK_PATH = REPO_ROOT / "question_bank.json"',
    'assert sum(item["status"] == "draft" for item in qbank["items"]) == 49',
  ], { sources: ['qbank'], usesState: true }],
  ['Python: an os.path root and a def helper', 'tests/anki/test_p.py', [
    'HERE = os.path.dirname(os.path.abspath(__file__))',
    'def load(name):',
    '    with open(os.path.join(HERE, "..", "..", name)) as handle:',
    '        return json.load(handle)',
    'ledger = load("13_Faculty_Resources/reviewed.json")',
    'assert any(row["status"] == "pending" for row in ledger.values())',
  ], { sources: ['ledger'], usesState: true }],
  // Look-alikes that must NOT be findings.
  ['NOT live: mock-repository keys', 'tests/p.test.mjs', [
    "const QBANK_PATH = 'question_bank.json';",
    "files[QBANK_PATH] = { json: { items: [{ status: 'draft' }] } };",
    "assert.deepEqual(refsFor(mock, QBANK_PATH), ['attest/pending']);",
    'assert.equal(mock.get(QBANK_PATH).sha, SHA);',
  ], { sources: [], usesState: true }],
  ['NOT live: a page.route interception serving its own bank', 'tests/smoke/p.spec.js', [
    "await page.route('**/question_bank.json', (route) => route.fulfill({ json: { items: [{ status: 'draft' }] } }));",
  ], { sources: [], usesState: true }],
  ['NOT live: a temp-dir ledger', 'tests/p.test.mjs', [
    "const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));",
    "const ledger = JSON.parse(fs.readFileSync(path.join(dir, '13_Faculty_Resources/reviewed.json'), 'utf8'));",
    "assert.equal(ledger.a.status, 'pending');",
  ], { sources: [], usesState: true }],
  ['NOT live: a fixtures directory', 'tests/p.test.mjs', [
    'const HERE = path.dirname(fileURLToPath(import.meta.url));',
    "const bank = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'question_bank.json'), 'utf8'));",
    "assert.equal(bank.items[0].status, 'draft');",
  ], { sources: [], usesState: true }],
  ['NOT live: mentions inside comments only', 'tests/p.test.mjs', [
    '// production reads 13_Faculty_Resources/reviewed.json via import.meta.url',
    "/* const ledger = readFileSync(new URL('../13_Faculty_Resources/reviewed.json', import.meta.url)); */",
    "assert.equal(status, 'pending');",
  ], { sources: [], usesState: true }],
  ['NOT live: tool-governance.json is not the ledger', 'tests/smoke/p.spec.js', [
    "const tools = await requestGetWithRetry(page.request, '/tool-governance.json');",
    "expect(tools.items.every((t) => t.status === 'pending' || t.status === 'reviewed')).toBe(true);",
  ], { sources: [], usesState: true }],
  ['NOT live: a write is not a read', 'tests/p.test.mjs', [
    "const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "fs.writeFileSync(path.join(repo, 'question_bank.json'), JSON.stringify({ items: [{ status: 'draft' }] }));",
  ], { sources: [], usesState: true }],
  ['NOT a finding: live content read with no review state used', 'tests/p.test.mjs', [
    "const META = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));",
    "assert.ok(META['delirium.md'].tldr.length > 0);",
  ], { sources: ['meta'], usesState: false }],
  ['NOT a finding: review-state words only inside a comment', 'tests/p.test.mjs', [
    "const META = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));",
    "// each facultyReview here reads 'reviewed' or 'pending'",
    'assert.ok(Object.keys(META).length > 0);',
  ], { sources: ['meta'], usesState: false }],
];

test('the scanner finds the shipped bugs and their likely successors, and passes over their look-alikes', () => {
  const wrong = [];
  for (const [name, rel, lines, expected] of PLANTED) {
    const scan = scanSource(rel, lines.join('\n'));
    const got = { sources: scan.sources, usesState: scan.usesState };
    if (JSON.stringify(got) !== JSON.stringify(expected)) wrong.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
  assert.deepEqual(wrong, []);
});

// ---- 2. the registry -----------------------------------------------------------------------------

const EXEMPT_PREFIXES = (() => {
  const text = fs.readFileSync(path.join(ROOT, 'bin', 'check_vacuity.py'), 'utf8');
  const block = text.match(/\nEXEMPT = \{([\s\S]*?)\n\}/);
  assert.ok(block, 'bin/check_vacuity.py no longer has an EXEMPT = { ... } block to read');
  return [...block[1].matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
})();

const FOUND = scanTree(ROOT, { exclude: SELF });

test('every test that reads live review state is registered, and every registration is still true', () => {
  const problems = [];
  for (const [file, scan] of FOUND) {
    if (!REGISTRY[file]) {
      problems.push(`${file} reads ${scan.sources.map((s) => SOURCES[s].what).join(' and ')} `
        + `(line ${scan.lines.join(', ')}) and uses review state, but is not registered.`);
    } else if (REGISTRY[file].detected === false) {
      problems.push(`${file} is registered with detected: false, but the scanner now finds it `
        + `(line ${scan.lines.join(', ')}). Remove the flag.`);
    }
  }
  for (const [file, entry] of Object.entries(REGISTRY)) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      problems.push(`${file} is registered but no longer exists. Remove its entry.`);
      continue;
    }
    if (entry.detected !== false && !FOUND.has(file)) {
      problems.push(`${file} is registered but no longer reads live review state. Remove its entry.`);
    }
    if (!KINDS[entry.kind]) problems.push(`${file}: kind "${entry.kind}" is not one of ${Object.keys(KINDS).join(', ')}.`);
    if (typeof entry.why !== 'string' || entry.why.length < 60) {
      problems.push(`${file}: "why" must say, in a sentence or two, how the test stays right whatever the faculty do.`);
    }
    if (entry.kind === 'dormant' && !EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix))) {
      problems.push(`${file} is registered as dormant, but bin/check_vacuity.py does not exempt it: a gate runs it. `
        + 'Give it a real kind.');
    }
    for (const source of entry.sources || []) if (!SOURCES[source]) problems.push(`${file}: unknown source "${source}".`);
    for (const [scenario, reason] of Object.entries(entry.skipScenarios || {})) {
      if (!SCENARIOS[scenario]) problems.push(`${file}: skipScenarios names an unknown scenario "${scenario}".`);
      if (typeof reason !== 'string' || reason.length < 30) problems.push(`${file}: skipScenarios.${scenario} needs its reason.`);
    }
    for (const scenario of entry.skipsUnder || []) {
      if (!SCENARIOS[scenario]) problems.push(`${file}: skipsUnder names an unknown scenario "${scenario}".`);
    }
    if ((entry.skipsUnder || []).length && typeof entry.skipTest !== 'string') {
      problems.push(`${file}: skipsUnder needs skipTest, the name of the test that must skip.`);
    }
    if (isNodeTest(file) && entry.kind !== 'dormant' && scenariosFor(file, entry, FOUND).length === 0) {
      problems.push(`${file} is a node test but no rehearsal applies to it. Name the governed files it reads in `
        + '"sources", or it is registered without ever being checked.');
    }
  }
  assert.deepEqual(problems, [], `${problems.join('\n')}\n${problems.length ? HOW_TO_FIX : ''}`);
});

// ---- 3. the rehearsal ----------------------------------------------------------------------------

test('the rehearsal re-serialises each governed file without changing its meaning', (t) => {
  for (const [source, file] of Object.entries(GOVERNED_FILES)) {
    const text = fs.readFileSync(file, 'utf8');
    const again = serialise(JSON.parse(text), text);
    assert.deepEqual(JSON.parse(again), JSON.parse(text), `${source}: re-serialising must not change the document`);
    /* Bytes are reported, never asserted: a writer that formats differently is not a finding, and
       asserting bytes here would make this file the next test a sign-off PR turns red. */
    if (again !== text) t.diagnostic(`${source}: rehearsed bytes differ in formatting only from ${path.relative(ROOT, file)}`);
  }
});

/* The scenarios are checked against a CONTROLLED queue, not the live one -- otherwise this file
   would be the next test that goes vacuous when the faculty clear their queue. Two real shipped
   pages are cast as "pending" (P) and "signed" (S) in a synthetic ledger; the question bank holds
   one live draft, one attested item and one retired draft. Everything else is read for real, so
   the hashes are computed over real page text. */
test('each scenario makes exactly the state it claims, in step, with the hashes the console would store', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, '13_Faculty_Resources/_automation/site_build/shipped_pages.json'), 'utf8'));
  const realMeta = JSON.parse(fs.readFileSync(GOVERNED_FILES.meta, 'utf8'));
  const slugs = [...new Set(shipped.pages.map((page) => page.slug))].filter((slug) => sourcesForSlug(shipped, slug).length);
  const P = slugs.find((slug) => realMeta[slug]?.facultyReview) || slugs[0];
  const S = slugs.find((slug) => slug !== P);
  assert.ok(P && S, 'shipped_pages.json must list two pages with sources');
  const ledger = {
    [P]: { status: 'pending', risk: { kind: 'clinical', level: 'moderate' }, reason: 'New page.', at: '2026-01-01', by: 'Pending faculty review' },
    [S]: { status: 'reviewed', risk: { kind: 'general', level: 'low' }, at: '2026-01-01', by: 'Joshua Moss, MD', contentHash: 'a'.repeat(40), clinicalHash: 'b'.repeat(40) },
  };
  const meta = structuredClone(realMeta);
  if (meta[P]) meta[P].facultyReview = { status: 'pending' };
  if (meta[S]) meta[S].facultyReview = { lastReviewed: '2026-01-01', reviewer: 'Joshua Moss, MD', status: 'reviewed' };
  const bank = { version: 1, items: [
    { id: 'q_draft', status: 'draft' }, { id: 'q_attested', status: 'attested' }, { id: 'q_retired', status: 'draft', retired: true },
  ] };
  const fakes = { [GOVERNED_FILES.ledger]: ledger, [GOVERNED_FILES.meta]: meta, [GOVERNED_FILES.qbank]: bank };
  const readReal = (file, encoding) => (fakes[file] ? JSON.stringify(fakes[file], null, 2) : fs.readFileSync(file, encoding));
  const after = (name) => Object.fromEntries(Object.entries(rehearsedFiles(name, readReal)).map(([s, t]) => [s, JSON.parse(t)]));
  const expectedHashes = (slug, record) => {
    const content = {};
    const clinical = {};
    for (const source of sourcesForSlug(shipped, slug)) {
      const bytes = fs.readFileSync(path.join(ROOT, source));
      content[source] = sourceBlobSha(source, bytes);
      clinical[source] = clinicalSourceSha(source, bytes);
    }
    return {
      contentHash: digestFromManifest(manifestForSlug(slug, content, record)),
      clinicalHash: digestFromManifest(clinicalManifestForSlug(slug, clinical, record)),
    };
  };
  const inStep = (name, docs) => {
    for (const [slug, record] of Object.entries(docs.meta)) {
      if (record?.facultyReview?.status === 'reviewed' && docs.ledger[slug]) {
        assert.equal(docs.ledger[slug].status, 'reviewed', `${name}: ${slug} reads reviewed in topic_meta.json but not in the ledger`);
      }
    }
  };
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const docs = after(name);
    assert.deepEqual(Object.keys(docs).sort(), [...scenario.touches].sort(), `${name}: touches exactly what it declares`);
    for (const [source, holds] of Object.entries(scenario.holds)) assert.equal(holds(docs[source]), true, `${name}: ${source}`);
    if (docs.ledger && docs.meta) inStep(name, docs);
  }

  const drained = after('qbank-drained').qbank.items;
  assert.deepEqual(drained.map((i) => [i.id, i.status, Boolean(i.retired)]),
    [['q_draft', 'attested', false], ['q_attested', 'attested', false], ['q_retired', 'draft', true]]);
  const retired = after('qbank-retired').qbank.items;
  assert.equal(retired[0].retired, true);
  assert.equal(typeof retired[0].retiredReason, 'string');
  assert.equal(retired[1].retired, undefined, 'an attested item is never retired by the rehearsal');

  const signed = after('pages-signed');
  assert.equal(signed.ledger[P].status, 'reviewed');
  assert.equal(signed.ledger[P].by, 'Joshua Moss, MD');
  assert.equal(signed.ledger[P].at, new Date().toISOString().slice(0, 10), 'signed today, as the console would');
  assert.ok(!('reason' in signed.ledger[P]), 'a signed row carries no pending reason');
  assert.deepEqual(signed.ledger[P].risk, ledger[P].risk);
  const recordAfter = Object.hasOwn(signed.meta, P) ? signed.meta[P] : undefined;
  const bound = expectedHashes(P, recordAfter);
  assert.equal(signed.ledger[P].contentHash, bound.contentHash, "a signature carries today's contentHash, never a blank");
  assert.equal(signed.ledger[P].clinicalHash, bound.clinicalHash, "a signature carries today's clinicalHash");
  if (meta[P]) assert.equal(signed.meta[P].facultyReview.status, 'reviewed', 'the facultyReview block is promoted with its row');
  assert.deepEqual(signed.ledger[S], ledger[S], 'an already-signed row is untouched');

  const reopened = after('pages-reopened');
  assert.equal(reopened.ledger[S].status, 'pending');
  assert.equal(reopened.ledger[S].by, 'Pending faculty review');
  assert.equal(typeof reopened.ledger[S].reason, 'string');
  assert.deepEqual(reopened.ledger[S].risk, ledger[S].risk);
  assert.ok(!('contentHash' in reopened.ledger[S]) && !('clinicalHash' in reopened.ledger[S]), 'a reopened row claims no signature');
  if (meta[S]) assert.equal(reopened.meta[S].facultyReview.status, 'pending', 'the facultyReview block is demoted with its row');

  const drifted = after('pages-drifted');
  assert.equal(drifted.ledger[S].status, 'reviewed', 'drift is not a demotion');
  for (const key of ['contentHash', 'clinicalHash']) {
    assert.notEqual(drifted.ledger[S][key], ledger[S][key], `drift moves the stored ${key}`);
    assert.match(drifted.ledger[S][key], /^[0-9a-f]{40}$/, `a drifted ${key} is still well-formed`);
  }
  assert.deepEqual(drifted.ledger[P], ledger[P], 'a pending row does not drift');
});

test('the rehearsal redirects every node:fs read style, refuses repository writes, and fails loudly on a bad scenario', async () => {
  const probe = [
    "import fs from 'node:fs';",
    "import { readFileSync } from 'node:fs';",
    "import { readFile } from 'node:fs/promises';",
    "import os from 'node:os';",
    "import path from 'node:path';",
    "import { pathToFileURL } from 'node:url';",
    `import { GOVERNED_FILES, SCENARIOS } from ${JSON.stringify(PRELOAD)};`,
    'const scenario = SCENARIOS[process.env.LIVE_STATE_SCENARIO];',
    'const out = {};',
    'for (const [source, holds] of Object.entries(scenario.holds)) {',
    '  const file = GOVERNED_FILES[source];',
    '  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "p-")), "copy.json");',
    '  fs.copyFileSync(file, copy);',
    '  const fd = fs.openSync(file, "r");',
    '  const reads = {',
    "    defaultImport: fs.readFileSync(file, 'utf8'),",
    "    namedImportUrl: readFileSync(pathToFileURL(file), { encoding: 'utf8' }),",
    '    buffer: readFileSync(file).toString(),',
    "    relative: readFileSync(path.relative(process.cwd(), file), 'utf8'),",
    "    descriptor: readFileSync(fd, 'utf8'),",
    "    promises: await readFile(file, 'utf8'),",
    "    callback: await new Promise((ok, no) => fs.readFile(file, 'utf8', (e, t) => (e ? no(e) : ok(t)))),",
    "    copied: readFileSync(copy, 'utf8'),",
    '  };',
    '  fs.closeSync(fd);',
    '  fs.rmSync(path.dirname(copy), { recursive: true, force: true });',
    '  out[source] = Object.fromEntries(Object.entries(reads).map(([k, t]) => [k, holds(JSON.parse(t))]));',
    '}',
    'let refused = false;',
    'try { fs.writeFileSync(path.join(process.cwd(), "rehearsal-probe.txt"), "x"); } catch (e) { refused = /refusing to write/.test(e.message); }',
    'out.refusedRepositoryWrite = refused;',
    'console.log(JSON.stringify(out));',
  ].join('\n');
  for (const name of Object.keys(SCENARIOS)) {
    const env = { ...process.env, LIVE_STATE_SCENARIO: name, NODE_OPTIONS: `--import=${PRELOAD}` };
    delete env.NODE_TEST_CONTEXT;
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', probe], { cwd: ROOT, env });
    const out = JSON.parse(stdout.trim().split('\n').pop());
    assert.equal(out.refusedRepositoryWrite, true, `${name}: a write into the repository must be refused`);
    delete out.refusedRepositoryWrite;
    const unredirected = Object.entries(out).flatMap(([source, styles]) => Object.entries(styles)
      .filter(([, holds]) => holds !== true).map(([style]) => `${source}/${style}`));
    assert.deepEqual(unredirected, [], `${name}: these read styles saw the real file`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'rehearsal-probe.txt')), false, 'the refused write left nothing behind');
  const env = { ...process.env, LIVE_STATE_SCENARIO: 'no-such-scenario', NODE_OPTIONS: `--import=${PRELOAD}` };
  delete env.NODE_TEST_CONTEXT;
  await assert.rejects(run(process.execPath, ['-e', '0'], { cwd: ROOT, env }),
    /is not a scenario/, 'an unknown scenario must fail loudly, never run the test unrehearsed');
});

/* The bugs this exists for, planted as real test files, each reading the real governed file a
   different way. Each passes against a queue in the matching state, and must go red -- on its
   planted assertion, not on a load error -- once the rehearsal does the faculty's work. */
const MUTANTS = [
  ['#895: the bank must hold a live draft', 'qbank-drained', 'qbank', [
    "import fs from 'node:fs';",
    'const bank = JSON.parse(fs.readFileSync(FILE, "utf8"));',
    "test('mutant', () => assert.ok(bank.items.some((i) => !i.retired && i.status === 'draft')));",
  ]],
  ['#895 again, through fs/promises and retirement', 'qbank-retired', 'qbank', [
    "import { readFile } from 'node:fs/promises';",
    'const bank = JSON.parse(await readFile(FILE, "utf8"));',
    "test('mutant', () => assert.ok(bank.items.some((i) => !i.retired && i.status === 'draft')));",
  ]],
  ['#729: the ledger must hold a pending page', 'pages-signed', 'ledger', [
    "import { readFileSync } from 'node:fs';",
    'const ledger = JSON.parse(readFileSync(FILE, "utf8"));',
    "test('mutant', () => assert.ok(Object.values(ledger).some((row) => row.status === 'pending')));",
  ]],
  ['the old contentHash floor: some signed page must carry a hash', 'pages-reopened', 'ledger', [
    "import fs from 'node:fs';",
    'const ledger = JSON.parse(fs.readFileSync(new URL(`file://${FILE}`), "utf8"));',
    "test('mutant', () => assert.ok(Object.values(ledger).some((row) => typeof row.contentHash === 'string')));",
  ]],
  ["the old fd-sheet premise: delirium.md's source record must read reviewed", 'pages-reopened', 'meta', [
    "import fs from 'node:fs';",
    'const meta = JSON.parse(fs.readFileSync(FILE, "utf8"));',
    "test('mutant', () => assert.equal(meta['delirium.md'].facultyReview.status, 'reviewed'));",
  ]],
  ['a test pinned to the stored hash it was written against', 'pages-drifted', 'ledger', [
    "import { execFileSync } from 'node:child_process';",
    'const read = (s) => JSON.parse(execFileSync(process.execPath, ["-e", `process.stdout.write(require("fs").readFileSync(${JSON.stringify(s)}, "utf8"))`]).toString());',
    'const ledger = read(FILE);',
    `const pinned = ${JSON.stringify(Object.entries(JSON.parse(fs.readFileSync(GOVERNED_FILES.ledger, 'utf8'))).find(([, r]) => typeof r?.contentHash === 'string')?.[1]?.contentHash ?? null)};`,
    "test('mutant', () => assert.ok(Object.values(ledger).some((row) => row.contentHash === pinned)));",
  ]],
];

test('the rehearsal turns each shipped bug red, through every read style and in node subprocesses', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-state-mutants-'));
  try {
    for (const [index, [name, scenario, source, body]] of MUTANTS.entries()) {
      const file = path.join(dir, `m${index}.test.mjs`);
      fs.writeFileSync(file, [
        "import assert from 'node:assert/strict';",
        "import test from 'node:test';",
        `const FILE = ${JSON.stringify(GOVERNED_FILES[source])};`,
        ...body,
      ].join('\n'));
      const { code, output } = await rehearse(file, scenario);
      assert.notEqual(code, 0, `${name}: survived the ${scenario} rehearsal\n${output.slice(0, 2000)}`);
      assert.match(output, /^not ok \d+ - mutant\b/m, `${name}: the planted assertion is not what failed\n${output.slice(0, 2000)}`);
      assert.equal(tapCounts(output).fail, 1, `${name}: expected exactly the planted assertion to fail`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a rehearsal that never reaches the test\'s read fails closed instead of passing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-state-blind-'));
  try {
    const file = path.join(dir, 'blind.test.mjs');
    /* The bank is read by `cat`, a process that is not node: no rehearsal hook can ever see
       it, on any Node version. (A JSON import was the first choice, but Node 22's loader reads
       through the patched fs and Node 25's does not, so it was blind on one and not the other.) */
    fs.writeFileSync(file, [
      "import assert from 'node:assert/strict';",
      "import { execFileSync } from 'node:child_process';",
      "import test from 'node:test';",
      `const bank = JSON.parse(execFileSync('cat', [${JSON.stringify(GOVERNED_FILES.qbank)}], { encoding: 'utf8' }));`,
      "test('reads the bank through a process the rehearsal cannot see', () => assert.ok(Array.isArray(bank.items)));",
    ].join('\n'));
    const result = await rehearse(file, 'qbank-drained');
    const problems = verdict(file, { kind: 'invariant' }, ['qbank'], 'qbank-drained', result);
    assert.equal(result.code, 0, 'the blind test itself passes -- which is exactly the danger');
    assert.match(problems.join('\n'), /never reached its read/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every registered node test stays green when the faculty drain or refill the queue', { concurrency: 4 }, async (t) => {
  const jobs = [];
  for (const [file, entry] of Object.entries(REGISTRY)) {
    if (!isNodeTest(file) || entry.kind === 'dormant') continue;
    const sources = sourcesOf(file, entry, FOUND);
    /* One file's scenarios run one after another; different files run side by side. */
    jobs.push([file, entry, sources, scenariosFor(file, entry, FOUND)]);
  }
  assert.ok(jobs.length >= 10, `only ${jobs.length} node test(s) to rehearse; the registry or the scanner has lost its node tests`);
  await Promise.all(jobs.map(([file, entry, sources, scenarios]) => t.test(file, async () => {
    const problems = [];
    for (const scenario of scenarios) {
      problems.push(...verdict(file, entry, sources, scenario, await rehearse(file, scenario)));
    }
    assert.deepEqual(problems, [], problems.join('\n\n'));
  })));
});
