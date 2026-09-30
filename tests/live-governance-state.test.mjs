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
                                      requires `attested` to follow each page's own record.
  attestation-projection-build.test   its contentHash floor went red when nothing was signed;
                                      now that state skips and a hashless signed ledger still fails.

WHAT THIS ENFORCES, in three layers:
  1. FIND. tests/_live_state_scan.mjs reads every file under tests/ and reports each one that
     reads a governed file from the real repository or a served site AND uses a review-state
     value. (Its header says exactly what it can and cannot see.)
  2. REGISTER. Every finding must appear in REGISTRY below with a kind and a reason, and every
     registration must still be a finding. A new live-state test cannot land unnoticed: the
     reviewer sees the registry line and the reason.
  3. REHEARSE. Every registered node test is re-run with the faculty's work done for it:
     every live draft attested, every draft retired, every pending page signed, every signed
     page reopened, every facultyReview demoted (tests/_live_state_rehearsal.mjs, which
     redirects node:fs reads for that one run; nothing on disk changes). Each must stay green.
     Playwright specs cannot be rehearsed here (they need a built site); their registration and
     its reason are the control.

TO RUN ONE REHEARSAL BY HAND:
  LIVE_STATE_SCENARIO=qbank-drained node --import ./tests/_live_state_rehearsal.mjs --test tests/<file>
*/

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SOURCES, scanSource, scanTree } from './_live_state_scan.mjs';
import { GOVERNED_FILES, SCENARIOS, rewrite } from './_live_state_rehearsal.mjs';

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

/* One line per test that reads live review state. `why` says how it stays right whatever the
   faculty do. `skipsUnder` names the rehearsals in which the test must report a skip rather than
   a pass (the proof that it no longer passes over an empty set). `detected: false` marks a test
   the scanner cannot see (it reads the state through a file the scanner does not trace); it must
   stay undetected, or the flag comes off. */
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
    why: 'The JS and Python hash twins must agree on whatever the ledger and topic_meta.json hold; the '
      + 'status-flip checks build their own flipped copy. Its question-bank twin reads the bank in a Python '
      + 'subprocess, which a rehearsal cannot redirect, so only the ledger and topic_meta rehearsals run.',
  },
  'tests/attestation-projection-build.test.mjs': {
    kind: 'invariant',
    why: 'Compares the built sites with the source ledger and topic_meta.json and skips per site when _build/ '
      + 'is stale. Its contentHash floor now skips when nothing is signed (the ledger-pending rehearsal turned it red on 2026-09-30).',
  },
  'tests/faculty-batch-selection.test.mjs': {
    kind: 'skips-visibly',
    skipsUnder: ['qbank-drained', 'qbank-retired'],
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
    why: 'Reads real topic_meta.json content for the Front Door index; the kit test now requires `attested` '
      + "to follow each kit page's own facultyReview instead of pinning all five as attested.",
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
      + 'pins the branches.',
  },
});

const HOW_TO_FIX = `
A test that reads the faculty's live review state goes red when the faculty do their job (#729,
#781, #895), or quietly stops checking anything when the queue empties. Pick one:
  1. Serve or build your own review state: a fixture, or a state derived from the live file the
     way tests/smoke/qbank-retired.spec.js derives its bank. Register it as "fixture".
  2. Assert only what holds for ANY legitimate state: a partition, "either status is allowed", a
     count computed from the same data. Register it as "invariant".
  3. If the check needs a live example that may not exist, skip visibly with the reason
     (t.skip / test.skip) and pin the branch with a fixture elsewhere. Register it as "skips-visibly".
Then add it to REGISTRY in tests/live-governance-state.test.mjs with one or two sentences on why it
stays right. Node tests are re-run with the queue drained and refilled to prove it.`;

const isNodeTest = (file) => /^tests\/[^/]+\.test\.mjs$/.test(file);

/* The rehearsals a registered node test must survive: every scenario for every governed file it
   reads live. Served governance.json has no node-side scenario (only Playwright reads it). */
function scenariosFor(file, scan) {
  const sources = new Set(scan?.sources || []);
  return Object.entries(SCENARIOS).filter(([, s]) => sources.has(s.source)).map(([name]) => name);
}

function tapCounts(output) {
  const count = (key) => Number((output.match(new RegExp(`^# ${key} (\\d+)$`, 'm')) || [])[1] ?? NaN);
  return { tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped') };
}

async function rehearse(file, scenario) {
  const env = { ...process.env, LIVE_STATE_SCENARIO: scenario };
  delete env.NODE_TEST_CONTEXT;
  try {
    const { stdout, stderr } = await run(process.execPath,
      ['--import', PRELOAD, '--test', '--test-reporter=tap', file],
      { cwd: ROOT, env, timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, output: `${stdout}\n${stderr}` };
  } catch (error) {
    return { code: error.code ?? 1, output: `${error.stdout || ''}\n${error.stderr || ''}\n${error.message}` };
  }
}

const failureExcerpt = (output) => output.split('\n')
  .filter((line) => /^not ok|^\s+(error|expected|actual|message|name):|AssertionError|Error:/.test(line))
  .slice(0, 24).join('\n');

// ---- 1. the scanner ------------------------------------------------------------------------------

const PLANTED = [
  ['#895 as shipped: the served bank must hold drafts', 'tests/smoke/planted.spec.js', [
    "const res = await requestGetWithRetry(page.request, `${baseURL}/question_bank.json`);",
    "const drafts = items.filter((it) => !it.retired && it.status !== 'attested');",
    'expect(drafts.length).toBeGreaterThan(0);',
  ], { sources: ['qbank'], usesState: true }],
  ['#729 as shipped: the served ledger must hold a pending page', 'tests/smoke/planted.spec.js', [
    "const response = await requestGetWithRetry(page.request, '/governance.json');",
    "const pending = (await response.json()).items.filter((i) => i.status === 'pending');",
    'expect(pending.length).toBeGreaterThan(0);',
  ], { sources: ['served'], usesState: true }],
  ['#781 as shipped: a repo-root join and a pinned draft count', 'tests/planted.test.mjs', [
    "const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "const bank = JSON.parse(fs.readFileSync(path.join(repo, 'question_bank.json'), 'utf8'));",
    "assert.equal(bank.items.filter((i) => i.status === 'draft').length, 55);",
  ], { sources: ['qbank'], usesState: true }],
  ['a reader helper that resolves against import.meta.url', 'tests/planted.test.mjs', [
    "const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));",
    "const META = readJson('../topic_meta.json');",
    "assert.equal(META['delirium.md'].facultyReview.status, 'reviewed');",
  ], { sources: ['meta'], usesState: true }],
  ['a file-name constant joined with the root on another line', 'tests/planted.test.mjs', [
    "const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "const REVIEWED = '13_Faculty_Resources/reviewed.json';",
    'const ledger = readJson(repo, REVIEWED);',
    "assert.ok(Object.values(ledger).some((row) => row.status === 'pending'));",
  ], { sources: ['ledger'], usesState: true }],
  ['Python: a path constant under REPO_ROOT and a pinned count', 'tests/anki/test_planted.py', [
    'REPO_ROOT = Path(__file__).resolve().parents[2]',
    'QBANK_PATH = REPO_ROOT / "question_bank.json"',
    'assert sum(item["status"] == "draft" for item in qbank["items"]) == 49',
  ], { sources: ['qbank'], usesState: true }],
  ['NOT live: mock-repository keys', 'tests/planted.test.mjs', [
    "const QBANK_PATH = 'question_bank.json';",
    "files[QBANK_PATH] = { json: { items: [{ status: 'draft' }] } };",
    "assert.deepEqual(refsFor(mock, QBANK_PATH), ['attest/pending']);",
  ], { sources: [], usesState: true }],
  ['NOT live: a page.route interception serving its own bank', 'tests/smoke/planted.spec.js', [
    "await page.route('**/question_bank.json', (route) => route.fulfill({ json: { items: [{ status: 'draft' }] } }));",
  ], { sources: [], usesState: true }],
  ['NOT live: a temp-dir ledger', 'tests/planted.test.mjs', [
    "const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));",
    "const ledger = JSON.parse(fs.readFileSync(path.join(dir, '13_Faculty_Resources/reviewed.json'), 'utf8'));",
    "assert.equal(ledger.a.status, 'pending');",
  ], { sources: [], usesState: true }],
  ['NOT live: a fixtures directory', 'tests/planted.test.mjs', [
    'const HERE = path.dirname(fileURLToPath(import.meta.url));',
    "const bank = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'question_bank.json'), 'utf8'));",
    "assert.equal(bank.items[0].status, 'draft');",
  ], { sources: [], usesState: true }],
  ['NOT live: mentions inside comments only', 'tests/planted.test.mjs', [
    '// production reads 13_Faculty_Resources/reviewed.json via import.meta.url',
    "/* const ledger = readFileSync(new URL('../13_Faculty_Resources/reviewed.json', import.meta.url)); */",
    "assert.equal(status, 'pending');",
  ], { sources: [], usesState: true }],
  ['NOT live: tool-governance.json is not the ledger', 'tests/smoke/planted.spec.js', [
    "const tools = await requestGetWithRetry(page.request, '/tool-governance.json');",
    "expect(tools.items.every((t) => t.status === 'pending' || t.status === 'reviewed')).toBe(true);",
  ], { sources: [], usesState: true }],
  ['NOT live: a write is not a read', 'tests/planted.test.mjs', [
    "const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "fs.writeFileSync(path.join(repo, 'question_bank.json'), JSON.stringify({ items: [{ status: 'draft' }] }));",
  ], { sources: [], usesState: true }],
  ['NOT a finding: live content read with no review state used', 'tests/planted.test.mjs', [
    "const META = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));",
    "assert.ok(META['delirium.md'].tldr.length > 0);",
  ], { sources: ['meta'], usesState: false }],
  ['NOT a finding: review-state words only inside a comment', 'tests/planted.test.mjs', [
    "const META = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));",
    "// each facultyReview here reads 'reviewed' or 'pending'",
    'assert.ok(Object.keys(META).length > 0);',
  ], { sources: ['meta'], usesState: false }],
];

test('the scanner finds the three shipped bugs and passes over their look-alikes', () => {
  for (const [name, rel, lines, expected] of PLANTED) {
    const scan = scanSource(rel, lines.join('\n'));
    assert.deepEqual({ sources: scan.sources, usesState: scan.usesState }, expected, name);
  }
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
    for (const scenario of entry.skipsUnder || []) {
      if (!SCENARIOS[scenario]) problems.push(`${file}: skipsUnder names an unknown scenario "${scenario}".`);
    }
  }
  assert.deepEqual(problems, [], `${problems.join('\n')}\n${problems.length ? HOW_TO_FIX : ''}`);
});

// ---- 3. the rehearsal ----------------------------------------------------------------------------

test('the rehearsal re-serialises each governed file byte-for-byte when nothing changes', () => {
  for (const [source, file] of Object.entries(GOVERNED_FILES)) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(rewrite(text, () => {}), text, `${source}: a no-op rewrite must reproduce ${path.relative(ROOT, file)} exactly`);
  }
});

test('the rehearsal redirects every node:fs read style, and each scenario leaves the state it claims', async () => {
  const probe = [
    "import fs from 'node:fs';",
    "import { readFileSync } from 'node:fs';",
    "import { readFile } from 'node:fs/promises';",
    "import { pathToFileURL } from 'node:url';",
    `import { GOVERNED_FILES, SCENARIOS } from ${JSON.stringify(PRELOAD)};`,
    'const scenario = SCENARIOS[process.env.LIVE_STATE_SCENARIO];',
    'const file = GOVERNED_FILES[scenario.source];',
    'const reads = {',
    "  defaultImport: fs.readFileSync(file, 'utf8'),",
    "  namedImport: readFileSync(pathToFileURL(file), { encoding: 'utf8' }),",
    '  buffer: readFileSync(file).toString(),',
    "  promises: await readFile(file, 'utf8'),",
    "  callback: await new Promise((ok, no) => fs.readFile(file, 'utf8', (e, t) => (e ? no(e) : ok(t)))),",
    '};',
    'console.log(JSON.stringify(Object.fromEntries(Object.entries(reads).map(([k, t]) => [k, scenario.holds(JSON.parse(t))]))));',
  ].join('\n');
  for (const name of Object.keys(SCENARIOS)) {
    const env = { ...process.env, LIVE_STATE_SCENARIO: name };
    delete env.NODE_TEST_CONTEXT;
    const { stdout } = await run(process.execPath, ['--import', PRELOAD, '--input-type=module', '-e', probe], { cwd: ROOT, env });
    const holds = JSON.parse(stdout.trim().split('\n').pop());
    assert.deepEqual(Object.values(holds).filter((v) => v !== true), [], `${name}: ${JSON.stringify(holds)}`);
  }
  const env = { ...process.env, LIVE_STATE_SCENARIO: 'no-such-scenario' };
  delete env.NODE_TEST_CONTEXT;
  await assert.rejects(run(process.execPath, ['--import', PRELOAD, '-e', '0'], { cwd: ROOT, env }),
    /is not a scenario/, 'an unknown scenario must fail loudly, never run the test unrehearsed');
});

/* The bugs this exists for, planted as real test files: each passes against a queue in the
   matching state and must go red once the rehearsal does the faculty's work. */
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
  ['#729: the ledger must hold a pending page', 'ledger-signed', 'ledger', [
    "import { readFileSync } from 'node:fs';",
    'const ledger = JSON.parse(readFileSync(FILE, "utf8"));',
    "test('mutant', () => assert.ok(Object.values(ledger).some((row) => row.status === 'pending')));",
  ]],
  ['the old contentHash floor: some signed page must carry a hash', 'ledger-pending', 'ledger', [
    "import fs from 'node:fs';",
    'const ledger = JSON.parse(fs.readFileSync(new URL(`file://${FILE}`), "utf8"));',
    "test('mutant', () => assert.ok(Object.values(ledger).some((row) => typeof row.contentHash === 'string')));",
  ]],
  ["the old fd-sheet premise: delirium.md's source record must read reviewed", 'meta-demoted', 'meta', [
    "import fs from 'node:fs';",
    'const meta = JSON.parse(fs.readFileSync(FILE, "utf8"));',
    "test('mutant', () => assert.equal(meta['delirium.md'].facultyReview.status, 'reviewed'));",
  ]],
];

test('the rehearsal turns each shipped bug red', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-state-mutants-'));
  try {
    for (const [name, scenario, source, body] of MUTANTS) {
      const file = path.join(dir, `${scenario}.test.mjs`);
      fs.writeFileSync(file, [
        "import assert from 'node:assert/strict';",
        "import test from 'node:test';",
        `const FILE = ${JSON.stringify(GOVERNED_FILES[source])};`,
        ...body,
      ].join('\n'));
      const { code, output } = await rehearse(file, scenario);
      assert.notEqual(code, 0, `${name}: survived the ${scenario} rehearsal\n${output.slice(0, 2000)}`);
      assert.equal(tapCounts(output).fail, 1, `${name}: expected exactly the planted assertion to fail\n${output.slice(0, 2000)}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every registered node test stays green when the faculty drain or refill the queue', { concurrency: 4 }, async (t) => {
  const jobs = [];
  for (const [file, entry] of Object.entries(REGISTRY)) {
    if (!isNodeTest(file) || entry.kind === 'dormant') continue;
    for (const scenario of scenariosFor(file, FOUND.get(file))) jobs.push([file, entry, scenario]);
  }
  assert.ok(jobs.length >= 10, `only ${jobs.length} rehearsal(s) planned; the registry or the scanner has lost its node tests`);
  await Promise.all(jobs.map(([file, entry, scenario]) => t.test(`${file} [${scenario}: ${SCENARIOS[scenario].says}]`, async () => {
    const { code, output } = await rehearse(file, scenario);
    const counts = tapCounts(output);
    assert.equal(code, 0, `${file} went red when ${SCENARIOS[scenario].says}. `
      + `That is a test of the faculty's queue, not of the code.\n${failureExcerpt(output)}\n${HOW_TO_FIX}`);
    assert.ok(counts.tests > 0, `${file} ran no tests under ${scenario}\n${output.slice(0, 1500)}`);
    if ((entry.skipsUnder || []).includes(scenario)) {
      assert.ok(counts.skipped >= 1, `${file} must skip, visibly, when ${SCENARIOS[scenario].says}; it reported `
        + `${counts.pass} pass / ${counts.skipped} skipped, so it is passing over an empty set`);
    }
  })));
});
