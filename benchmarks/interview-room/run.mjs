import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { _internals, createSpHandler } from '../../sp-proxy/netlify/functions/sp.mjs';
import { createHttp } from '../../sp-proxy/netlify/functions/_shared/sp-http.mjs';
import * as governance from '../../sp-proxy/netlify/functions/_shared/sp-governance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PACK = '_prototypes/sp-interview/sp-interview.pack.json';
const CLIENT = '_prototypes/sp-interview/sp-interview.html';
const SERVER = 'sp-proxy/netlify/functions/sp.mjs';
const CORPUS = 'benchmarks/interview-room/corpus.json';
const REVIEW = 'pending-faculty-review';
const BASIS = ['existing-decision', 'proposed', 'accepted-limitation'];
const SKIP_PACK_NOT_APPROVED = 'pack_not_approved';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const denyNetwork = () => { throw new Error('Benchmark network access is forbidden'); };
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

// Best-effort provenance only. A checkout obtained without its .git directory
// (a release tarball, a CI artifact fetch) must not make the whole benchmark
// unrunnable just because HEAD cannot be resolved.
function sourceCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown (not a git checkout)';
  }
}

// Executes the actual application script in a fresh context, using its existing
// test hook. Neither the matcher nor its scoring rules are reimplemented here.
function loadClient(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const source = scripts.find(match => match[1].includes('var e=React.createElement'))?.[1];
  assert.ok(source, 'Interview Room application script missing');
  const window = {};
  const storage = { getItem: () => null, setItem() { throw new Error('Unexpected benchmark storage write'); }, removeItem() {} };
  const context = vm.createContext({
    window,
    document: {
      getElementById: () => ({ textContent: '', addEventListener() {}, removeEventListener() {} }),
      documentElement: { getAttribute: () => null, setAttribute() {} },
      createElement: () => ({ click() {} }),
    },
    React: { createElement: () => null, useState: v => [v, () => {}], useEffect() {}, useRef: v => ({ current: v }) },
    ReactDOM: { createRoot: () => ({ render() {} }) },
    localStorage: storage, sessionStorage: storage, fetch: denyNetwork,
  });
  vm.runInContext(source, context, { filename: CLIENT, timeout: 5000 });
  for (const key of ['MockProvider', 'computeCoverage', 'computeRubric', 'buildNarrative']) {
    assert.equal(typeof window.__SP_TEST__?.[key], 'function', `Missing actual client hook ${key}`);
  }
  return window.__SP_TEST__;
}

export function validateCorpus(corpus, pack) {
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.reviewStatus, REVIEW, 'Benchmark labels cannot self-attest');
  assert.match(corpus.governanceAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${corpus.governanceAsOf}T12:00:00Z`).toISOString().slice(0, 10), corpus.governanceAsOf);
  assert.ok(Array.isArray(corpus.scenarios) && corpus.scenarios.length > 0);
  const byName = Object.fromEntries(pack.cases.map(c => [c.persona.displayName, c]));
  const ids = new Set();
  for (const scenario of corpus.scenarios) {
    assert.ok(nonempty(scenario.id) && !ids.has(scenario.id), 'Missing or duplicate scenario id');
    ids.add(scenario.id);
    assert.equal(scenario.reviewStatus, REVIEW);
    assert.ok(BASIS.includes(scenario.basis), `${scenario.id}: unknown decision basis`);
    assert.ok(nonempty(scenario.reference) && nonempty(scenario.rationale) && nonempty(scenario.group));
    assert.ok(Array.isArray(corpus.setups[scenario.setup]), `${scenario.id}: unknown setup`);
    assert.ok(corpus.setups[scenario.setup].every(nonempty));
    assert.ok(Array.isArray(scenario.turns) && scenario.turns.length && scenario.turns.every(nonempty));
    assert.ok(Array.isArray(scenario.cases) && scenario.cases.length > 0);
    assert.equal(new Set(scenario.cases).size, scenario.cases.length);
    assert.ok(Array.isArray(scenario.checks) && scenario.checks.length > 0);
    for (const name of scenario.cases) {
      const cd = byName[name];
      assert.ok(cd, `${scenario.id}: unknown persona ${name}`);
      assert.ok(scenario.checks.some(check => !check.forCase || check.forCase === name), `${scenario.id}: no checks for ${name}`);
      for (const check of scenario.checks) {
        if (check.forCase !== undefined) {
          assert.ok(scenario.cases.includes(check.forCase), `${scenario.id}: assertion refers to a persona outside this scenario`);
          if (check.forCase !== name) continue;
        }
        const step = check.step ?? scenario.turns.length;
        assert.ok(Number.isInteger(step) && step >= 1 && step <= scenario.turns.length, `${scenario.id}: invalid check step`);
        if (check.kind === 'coverage') {
          assert.ok(cd.checklist.some(c => c.id === check.key), `${scenario.id}: unknown checklist row ${check.key}`);
          assert.ok(['observed', 'partial', 'missed', 'na'].includes(check.expected));
        } else if (check.kind === 'gate' || check.kind === 'intent') {
          const values = check.kind === 'gate' ? cd.gated : cd.intents;
          assert.ok(values.some(c => c.id === check.key), `${scenario.id}: unknown ${check.kind} ${check.key}`);
          assert.equal(typeof check.expected, 'boolean');
        } else {
          assert.equal(check.kind, 'narrativeContains', 'Unsupported assertion type');
          assert.ok(nonempty(check.key));
          assert.equal(typeof check.expected, 'boolean');
        }
      }
    }
  }
  assert.ok(Array.isArray(corpus.responsePairs) && corpus.responsePairs.length > 0);
  for (const pair of corpus.responsePairs) {
    assert.ok(nonempty(pair.id) && !ids.has(pair.id), 'Missing or duplicate pair id');
    ids.add(pair.id);
    assert.ok(byName[pair.case] && nonempty(pair.question) && nonempty(pair.questionForFaculty));
    assert.equal(pair.patients.length, 2);
    assert.ok(pair.patients.every(nonempty));
    assert.notEqual(pair.patients[0], pair.patients[1]);
  }
}

export async function loadBenchmark() {
  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, CORPUS), 'utf8'));
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, PACK), 'utf8'));
  validateCorpus(corpus, pack);
  return { corpus, pack, hooks: loadClient(fs.readFileSync(path.join(ROOT, CLIENT), 'utf8')) };
}

function snapshot(state, coverage) {
  return {
    covered: Object.keys(state.covered).sort(), unlocked: Object.keys(state.unlocked).sort(),
    rapport: state.rapport, coverage: Object.fromEntries(coverage.map(c => [c.id, c.status])),
  };
}

export async function replay(runtime, scenario, name) {
  const cd = runtime.pack.cases.find(c => c.persona.displayName === name);
  assert.ok(cd, `Unknown persona ${name}`);
  const provider = new runtime.hooks.MockProvider();
  const session = provider.start(cd, { difficulty: 'supported' });
  const setup = runtime.corpus.setups[scenario.setup];
  const messages = [...setup, ...scenario.turns];
  const frames = [];
  for (const [index, student] of messages.entries()) {
    const response = await provider.respond(session, student);
    const serverState = _internals.deriveState(cd, messages.slice(0, index + 1));
    const coverage = runtime.hooks.computeCoverage(session);
    const client = snapshot(session, coverage);
    const server = snapshot(serverState, _internals.computeCoverage(cd, serverState));
    const rubric = runtime.hooks.computeRubric(session, coverage);
    frames.push(plain({
      turn: index + 1, setup: index < setup.length, student, patient: response.reply,
      client, server, parity: JSON.stringify(client) === JSON.stringify(server),
      rubric, narrative: runtime.hooks.buildNarrative(session, coverage, rubric),
    }));
  }
  const checks = scenario.checks.filter(check => !check.forCase || check.forCase === name).map(check => {
    const frame = frames[setup.length + (check.step ?? scenario.turns.length) - 1];
    const actual = {};
    if (check.kind === 'narrativeContains') {
      actual.client = frame.narrative.strengths.some(s => s.includes(check.key))
        || frame.narrative.growth.some(g => g.t.includes(check.key));
    } else {
      for (const side of ['client', 'server']) {
        if (check.kind === 'coverage') actual[side] = frame[side].coverage[check.key];
        else actual[side] = frame[side][check.kind === 'gate' ? 'unlocked' : 'covered'].includes(check.key);
      }
    }
    return { ...check, turn: frame.turn, actual, matches: Object.values(actual).every(value => value === check.expected) };
  });
  return { id: `${scenario.id}/${name}`, scenarioId: scenario.id, persona: name, group: scenario.group,
    basis: scenario.basis, reference: scenario.reference, reviewStatus: scenario.reviewStatus,
    rationale: scenario.rationale, frames, checks };
}

// The real evaluation handler receives paired synthetic transcripts. Only I/O
// dependencies are substituted: HTTP credentials, pack loader, budget, provider.
// The captured prompt is evidence about deterministic INPUT to the evaluator;
// the stubbed evaluator output is never counted as a clinical result.
//
// The handler's own pack-approval gate (POST_PACK_STATUSES in sp.mjs) is not
// bypassed: it is exercised with the pack exactly as loaded from disk. When the
// pack's real top-level status is not reviewed/attested, the handler correctly
// refuses every POST with 403 pack_not_approved, and this leg is reported as a
// named, visible skip rather than stubbed to a false success or a fatal crash.
async function responsePair(runtime, pair) {
  const cd = runtime.pack.cases.find(c => c.persona.displayName === pair.case);
  const variants = [];
  const now = Date.parse(`${runtime.corpus.governanceAsOf}T12:00:00Z`);
  const packHash = sha(fs.readFileSync(path.join(ROOT, PACK)));
  const packSnapshot = deepFreeze({ pack: structuredClone(runtime.pack), packHash, fetchedAt: now });
  for (const patient of pair.patients) {
    let captured;
    const http = createHttp({ studentKey: 'synthetic-benchmark-key', operationsKey: 'synthetic-ops-key',
      allowedOrigins: ['https://benchmark.example.test'], production: true });
    const handler = createSpHandler({
      http, governance, packLoader: { async load() { return packSnapshot; } },
      budget: {
        async reserve() { return {}; }, async markProviderStarted() { return { authorized: true }; },
        async settle({ outcome }) { return { status: outcome === 'succeeded' ? 'settled' : 'provider_failed', outcome }; },
        async failBeforeProvider() { return { status: 'failed_before_provider' }; },
      },
      anthropic: { async prepare() { return { async call({ bodyBytes }) {
        captured = JSON.parse(new TextDecoder().decode(bodyBytes));
        const text = JSON.stringify({
          domains: Object.fromEntries(['alliance', 'data', 'technique', 'organization'].map(k => [k, { rating: 'partial', note: 'Synthetic transport stub; not evaluated.' }])),
          strengths: ['Synthetic transport stub.', 'No clinical inference.'],
          growth: [{ t: 'Synthetic stub only.', link: cd.linkedPages[0] }, { t: 'Synthetic stub only.', link: cd.linkedPages[0] }],
          selfAssessmentNote: 'No learner assessment performed.',
        });
        return { text, usage: { inputTokens: 1, outputTokens: 1 } };
      } }; } },
      config: { rotationId: 'synthetic-benchmark', actorModel: runtime.pack.engine.modelPinned,
        evaluatorModel: runtime.pack.engine.modelPinned, maxActorOutputTokens: 300,
        maxEvaluatorOutputTokens: 1500, now: () => now },
    });
    const turns = runtime.corpus.setups.warm.map(me => ({ me, pt: 'Please continue.' }));
    if (pair.id === 'plan-answer-versus-deflection') turns.push({ me: 'Have you had thoughts of killing yourself?', pt: 'Yes, those thoughts have been present.' });
    turns.push({ me: pair.question, pt: patient });
    const response = await handler(new Request('https://proxy.example.test/api/sp', {
      method: 'POST', headers: { origin: 'https://benchmark.example.test', 'x-student-key': 'synthetic-benchmark-key', 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'evaluate', caseId: cd.id, encounterId: 'AAECAwQFBgcICQoLDA0ODw', turns,
        selfAssess: { a: 'Synthetic benchmark.', b: 'Synthetic benchmark.', c: 'Synthetic benchmark.' } }),
    }));
    const body = await response.json();
    if (response.status === 403 && body?.error?.code === SKIP_PACK_NOT_APPROVED) {
      variants.push({ patient, handlerStatus: response.status, skipped: SKIP_PACK_NOT_APPROVED });
      continue;
    }
    assert.equal(response.status, 200, `${pair.id}: evaluation handler failed: ${JSON.stringify(body)}`);
    assert.ok(captured, 'Evaluation request was not captured');
    const line = captured.system.split('\n').find(s => s.startsWith('COVERAGE_MAP (deterministic — trust it): '));
    assert.ok(line, 'Coverage map was not located in the actual evaluator prompt');
    variants.push({ patient, handlerStatus: response.status, transcript: captured.messages[0].content,
      coverage: JSON.parse(line.slice(line.indexOf(': ') + 2)), promptSha256: sha(JSON.stringify(captured)) });
  }
  const skipped = variants.some(v => v.skipped) ? SKIP_PACK_NOT_APPROVED : null;
  return { ...pair, reviewStatus: REVIEW, completed: !skipped, skipped, variants,
    coverageChanged: skipped ? null : JSON.stringify(variants[0].coverage) !== JSON.stringify(variants[1].coverage) };
}

export async function runBenchmark(runtime) {
  validateCorpus(runtime.corpus, runtime.pack);
  const runs = [];
  const responsePairs = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = denyNetwork;
  try {
    for (const scenario of runtime.corpus.scenarios) {
      for (const name of scenario.cases) runs.push(await replay(runtime, scenario, name));
    }
    for (const pair of runtime.corpus.responsePairs) responsePairs.push(await responsePair(runtime, pair));
  } finally { globalThis.fetch = previousFetch; }
  const count = (basis, mismatches = false) => runs.filter(r => r.basis === basis)
    .reduce((n, r) => n + r.checks.filter(c => !mismatches || !c.matches).length, 0);
  const files = [PACK, CLIENT, SERVER, CORPUS, 'benchmarks/interview-room/run.mjs', runtime.corpus.decisionReference];
  return {
    schemaVersion: 1, reviewStatus: REVIEW,
    provenance: { sourceCommit: sourceCommit(),
      node: process.version, governanceAsOf: runtime.corpus.governanceAsOf,
      packObjectSha256: sha(JSON.stringify(runtime.pack)), corpusObjectSha256: sha(JSON.stringify(runtime.corpus)),
      files: Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(path.join(ROOT, f)))])) },
    scope: 'Local actual client and server; synthetic patient variants through an injected handler. No hosted service or live actor/evaluator model was tested.',
    summary: { scenarios: runtime.corpus.scenarios.length, runs: runs.length,
      frames: runs.reduce((n, r) => n + r.frames.length, 0),
      parityMismatches: runs.flatMap(r => r.frames).filter(f => !f.parity).length,
      controlChecks: count('existing-decision'), controlMismatches: count('existing-decision', true),
      proposedChecks: count('proposed'), proposedMismatches: count('proposed', true),
      acceptedLimitationChecks: count('accepted-limitation'), acceptedLimitationMismatches: count('accepted-limitation', true),
      responsePairs: responsePairs.length, responsePairsSkipped: responsePairs.filter(p => p.skipped).length },
    runs, responsePairs,
  };
}

const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n', '<br>');
export function renderReport(report) {
  const s = report.summary;
  const lines = [
    '# Interview Room conversation benchmark', '',
    '**Pending faculty review.** Proposed labels are review hypotheses. This selected adversarial set is not a clinical accuracy estimate, a learner grade, or a release approval.', '',
    report.scope, '',
    `Source commit: \`${report.provenance.sourceCommit}\`. Runtime: \`${report.provenance.node}\`. File hashes below identify the actual measured inputs.`, '',
    `Governance clock is fixed at ${report.provenance.governanceAsOf} for this reproducible retrospective benchmark. It does not establish current release eligibility.`, '',
    `- ${s.scenarios} scenario definitions; ${s.runs} persona runs; ${s.frames} conversation turns.`,
    `- Existing-decision controls: ${s.controlChecks - s.controlMismatches}/${s.controlChecks} checks agree.`,
    `- Proposed labels: ${s.proposedMismatches}/${s.proposedChecks} checks differ; these require adjudication.`,
    `- Explicitly accepted limitation: ${s.acceptedLimitationMismatches}/${s.acceptedLimitationChecks} semantic-comparator differences, recorded separately.`,
    `- Client/server parity: ${s.parityMismatches} mismatched turns. Agreement does not establish clinical validity.`,
    `- Patient-response pairs through the real evaluation handler: ${s.responsePairs - s.responsePairsSkipped}/${s.responsePairs} completed${s.responsePairsSkipped ? `; **${s.responsePairsSkipped} skipped (${SKIP_PACK_NOT_APPROVED})** — the case pack's current top-level review status keeps the handler's POST path closed to every request, not only this benchmark's` : ''}.`, '',
    '## Results by conversation', '',
    '| Conversation | Basis | Checks agree | Review rationale |', '|---|---|---:|---|',
  ];
  for (const r of report.runs) lines.push(`| ${r.id} | ${r.basis} | ${r.checks.filter(c => c.matches).length}/${r.checks.length} | ${cell(r.rationale)} |`);
  for (const r of report.runs) {
    for (const f of r.frames.filter(f => !f.parity)) {
      lines.push('', `**Parity failure: ${r.id}, turn ${f.turn}.**`, '',
        `Client: \`${JSON.stringify(f.client)}\``, '', `Server: \`${JSON.stringify(f.server)}\``, '');
    }
  }
  lines.push('', '## Discrepancy evidence', '');
  for (const r of report.runs.filter(r => r.checks.some(c => !c.matches))) {
    lines.push(`### ${r.id}`, '', `Basis: **${r.basis}**. ${r.reference}.`, '', r.rationale, '');
    for (const c of r.checks.filter(c => !c.matches)) {
      lines.push(`- Turn ${c.turn}, ${c.kind} \`${c.key}\`: proposed/control value \`${JSON.stringify(c.expected)}\`; actual \`${JSON.stringify(c.actual)}\`.`);
    }
    lines.push('', '| Turn | Learner | Actual offline patient reply | Gates after reply |', '|---|---|---|---|');
    for (const f of r.frames.filter(f => !f.setup)) lines.push(`| ${f.turn} | ${cell(f.student)} | ${cell(f.patient)} | ${cell(f.client.unlocked.join(', ') || 'none')} |`);
    const last = r.frames.at(-1);
    lines.push('', `Offline strengths: ${last.narrative.strengths.map(t => JSON.stringify(t)).join(' / ')}`, '');
  }
  lines.push('## Patient response pairs: actual evaluator input', '',
    'These probes substitute synthetic patient text and pass it through the real evaluation handler with a capturing provider stub. They measure the coverage map sent to the evaluator, not a live model\'s interpretation or output. All other transcript turns and self-assessment fields remain identical within each pair.', '');
  for (const pair of report.responsePairs) {
    lines.push(`### ${pair.id}`, '', `Question: ${pair.question}`, '',
      `- A: ${pair.patients[0]}`, `- B: ${pair.patients[1]}`);
    if (pair.skipped) {
      lines.push(`- **Skipped: ${pair.skipped}.** The case pack's current top-level review status is not reviewed/attested, so \`sp.mjs\` refused this POST with 403 \`pack_not_approved\` before the evaluator input was ever assembled. This is not a benchmark failure; it is the same gate every learner request meets.`);
    } else {
      lines.push(`- Coverage map changed: **${pair.coverageChanged ? 'yes' : 'no'}**; both handler requests completed.`);
    }
    lines.push(`- Faculty decision: ${pair.questionForFaculty}`, '');
  }
  lines.push('## Evidence boundaries', '',
    '- Existing-decision controls reuse D12–D15 and pack contracts. The new corpus itself has not been faculty reviewed.',
    '- D16 retains the closed vocabulary and explicitly accepts certain residuals. This report does not authorize a semantic classifier or a vocabulary change.',
    '- Coverage says a question was recognized; a gate or patient response is separate evidence. A refusal is not learner failure, and an observed question alone is not completed assessment.',
    '- All conversations are synthetic. No real learner records, patient records, credentials, browser storage, or provider services were accessed by this runner.',
    '- The runner validates its fixtures and reports parity or control failures as errors. Proposed-label differences remain visible findings, not automatically enforced clinical policy.',
    '- A patient-response pair skipped for `pack_not_approved` is a gate observation, not a clinical finding: it says nothing about the proposed labels above, only that the pack is not currently reviewed/attested.', '',
    '## Source fingerprints', '', '| Source | SHA-256 |', '|---|---|');
  for (const [file, hash] of Object.entries(report.provenance.files)) lines.push(`| ${file} | \`${hash}\` |`);
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.every(arg => ['--json', '--strict'].includes(arg)), 'Usage: node run.mjs [--json] [--strict]');
    const report = await runBenchmark(await loadBenchmark());
    process.stdout.write(args.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report));
    if (report.summary.parityMismatches || report.summary.controlMismatches) process.exitCode = 1;
    else if (args.includes('--strict') && report.summary.proposedMismatches) process.exitCode = 2;
  } catch (error) {
    console.error(`Benchmark could not complete: ${error.message}`);
    process.exitCode = 1;
  }
}
