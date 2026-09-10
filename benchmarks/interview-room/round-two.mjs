import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBenchmark, replay, runBenchmark } from './run.mjs';
import { renderCalibration, runSide } from './calibration.mjs';

const INPUT = new URL('./round-two.json', import.meta.url);
const REVIEW = 'pending-faculty-review';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const normalized = value => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function keys(object, allowed) {
  assert.ok(object && typeof object === 'object' && !Array.isArray(object), 'Expected an object');
  assert.deepEqual(Object.keys(object).sort(), [...allowed].sort(), 'Unexpected or missing fields; do not encode judgments here');
}

export function loadRoundTwo() { return JSON.parse(fs.readFileSync(INPUT, 'utf8')); }

export function validateRoundTwo(corpus, runtime) {
  keys(corpus, ['schemaVersion', 'reviewStatus', 'purpose', 'pairs']);
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.reviewStatus, REVIEW);
  assert.ok(nonempty(corpus.purpose));
  assert.ok(Array.isArray(corpus.pairs) && corpus.pairs.length > 0);
  const baseline = new Set([
    ...runtime.corpus.scenarios.flatMap(scenario => scenario.turns),
    ...runtime.corpus.responsePairs.map(pair => pair.question),
  ].map(normalized));
  const ids = new Set();
  for (const pair of corpus.pairs) {
    keys(pair, ['id', 'case', 'setup', 'before', 'sides', 'discussion']);
    assert.match(pair.id, /^r2-\d{2}$/);
    assert.ok(!ids.has(pair.id), 'Duplicate pair id'); ids.add(pair.id);
    assert.ok(runtime.pack.cases.some(cd => cd.persona.displayName === pair.case), 'Unknown persona');
    assert.ok(Object.hasOwn(runtime.corpus.setups, pair.setup), 'Unknown setup');
    assert.ok(Array.isArray(pair.before) && pair.before.every(nonempty));
    assert.ok(nonempty(pair.discussion));
    assert.ok(Array.isArray(pair.sides) && pair.sides.length === 2, 'A pair requires two conversations');
    for (const side of pair.sides) {
      keys(side, ['turns']);
      assert.ok(Array.isArray(side.turns) && side.turns.length > 0 && side.turns.every(nonempty));
      for (const turn of side.turns) assert.ok(!baseline.has(normalized(turn)), `${pair.id}: reuses a baseline review turn`);
    }
    assert.notDeepEqual(pair.sides[0].turns.map(normalized), pair.sides[1].turns.map(normalized), 'Pair alternatives must differ');
  }
}

export async function runRoundTwo(runtime, corpus) {
  validateRoundTwo(corpus, runtime);
  // Controls remain in the established corpus. This separate set has no expected
  // grades; execution and parity checks cannot turn it into faculty consensus.
  const baseline = await runBenchmark(runtime);
  assert.equal(baseline.summary.controlMismatches, 0, 'Existing controls must pass');
  assert.equal(baseline.summary.parityMismatches, 0, 'Existing parity must hold');
  const runs = [], pairs = [];
  for (const [index, pair] of corpus.pairs.entries()) {
    const setup = [...runtime.corpus.setups[pair.setup], ...pair.before];
    const context = { ...runtime, corpus: { ...runtime.corpus, setups: { ...runtime.corpus.setups, roundTwo: setup } } };
    const caseData = runtime.pack.cases.find(cd => cd.persona.displayName === pair.case);
    const selectedRows = caseData.checklist.filter(row => ['c_si', 'c_si_followup'].includes(row.id))
      .map(({ id, label }) => ({ id, label }));
    assert.ok(selectedRows.some(row => row.id === 'c_si'), `${pair.id}: no screening checklist row`);
    const sides = [];
    for (const [sideIndex, side] of pair.sides.entries()) {
      const scenario = { id: `${pair.id}-${sideIndex ? 'B' : 'A'}`, setup: 'roundTwo', turns: side.turns,
        checks: [], group: 'fresh-phrasing', basis: 'proposed', reference: 'Unadjudicated second round',
        reviewStatus: REVIEW, rationale: pair.discussion };
      const run = await replay(context, scenario, pair.case);
      assert.ok(run.frames.every(frame => frame.parity), `${run.id}: client/server parity failure`);
      runs.push(run);
      sides.push(runSide({ runs: [run] }, run.id, selectedRows));
    }
    assert.deepEqual(sides[0].context, sides[1].context, `${pair.id}: context differs`);
    pairs.push({ id: pair.id, title: `Comparison ${index + 1}`, persona: pair.case,
      focus: 'Consider the displayed exchange as a whole, including every patient reply.',
      suppliedReplies: false, discussion: pair.discussion, sides });
  }
  const sourceHashes = { ...baseline.provenance.files };
  for (const file of ['round-two.json', 'round-two.mjs', 'calibration.mjs']) {
    sourceHashes[`benchmarks/interview-room/${file}`] = sha(fs.readFileSync(new URL(file, import.meta.url)));
  }
  return {
    exercise: { round: 2, status: REVIEW, governanceAsOf: baseline.provenance.governanceAsOf, sourceHashes, pairs },
    corpusObjectSha256: sha(JSON.stringify(corpus)), runs,
    summary: { pairs: pairs.length, runs: runs.length, frames: runs.reduce((n, run) => n + run.frames.length, 0),
      parityMismatches: 0, adjudicatedLabels: 0, baselineControls: baseline.summary.controlChecks },
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert.ok(['--write', '--check', '--json'].includes(mode), 'Use --write, --check, or --json');
  const result = await runRoundTwo(await loadBenchmark(), loadRoundTwo());
  if (mode === '--json') console.log(JSON.stringify(result, null, 2));
  else {
    for (const [file, blind] of [['round-two-reviewer.html', true], ['round-two-facilitator.html', false]]) {
      const output = new URL(file, import.meta.url);
      const html = renderCalibration(result.exercise, { blind });
      if (mode === '--write') fs.writeFileSync(output, html);
      else assert.equal(fs.readFileSync(output, 'utf8'), html, `${file} is stale; run round-two.mjs --write`);
    }
    console.log(`${mode === '--write' ? 'Generated' : 'Verified'} reviewer and facilitator pages; ${result.summary.runs} conversations, ${result.summary.frames} turns, no adjudicated labels.`);
  }
}
