import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBenchmark, runBenchmark } from './run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PACK = '_prototypes/sp-interview/sp-interview.pack.json';
const CLIENT = '_prototypes/sp-interview/sp-interview.html';
const MODEL_ID = 'local/InterviewRoomMockProvider';
const DATA_CLASSIFICATION = 'synthetic-only';
const REQUIRED_PROVENANCE = ['git_sha', 'pack_sha256', 'model_id', 'model_revision'];
const FORBIDDEN_KEYS = new Set([
  'email', 'learner_id', 'learner_name', 'patient_id', 'student_id', 'user_id',
  'ip', 'user_agent', 'audio', 'recording', 'real_encounter_id', 'self_assessment',
]);

const sha = value => createHash('sha256').update(value).digest('hex');

function visitKeys(value, visitor) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    visitor(key);
    visitKeys(nested, visitor);
  }
}

export function validateRows(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0, 'Baseline dataset must contain rows');
  const runIds = new Set();
  for (const [index, row] of rows.entries()) {
    for (const key of REQUIRED_PROVENANCE) {
      assert.equal(typeof row[key], 'string', `Row ${index}: ${key} must be a string`);
      assert.ok(row[key].trim(), `Row ${index}: ${key} must not be empty`);
    }
    assert.match(row.git_sha, /^[a-f0-9]{40}$/, `Row ${index}: invalid git_sha`);
    assert.match(row.pack_sha256, /^[a-f0-9]{64}$/, `Row ${index}: invalid pack_sha256`);
    assert.match(row.model_revision, /^[a-f0-9]{64}$/, `Row ${index}: invalid model_revision`);
    assert.equal(row.data_classification, DATA_CLASSIFICATION, `Row ${index}: only synthetic data is allowed`);
    assert.equal(row.live_model_invoked, false, `Row ${index}: baseline must remain offline`);
    assert.equal(row.source_review_status, 'pending-faculty-review', `Row ${index}: labels cannot self-attest`);
    visitKeys(row, key => assert.ok(!FORBIDDEN_KEYS.has(key), `Row ${index}: forbidden field ${key}`));
    runIds.add(row.run_id);
  }
  assert.equal(runIds.size, 1, 'A baseline export must contain exactly one run_id');
  return rows;
}

export function rowsFromReport(report, runtime) {
  const gitSha = report.provenance.sourceCommit;
  const packSha256 = report.provenance.files[PACK];
  const modelRevision = report.provenance.files[CLIENT];
  assert.match(gitSha, /^[a-f0-9]{40}$/, 'A dataset export requires a Git checkout with a resolved commit');
  assert.match(packSha256, /^[a-f0-9]{64}$/);
  assert.match(modelRevision, /^[a-f0-9]{64}$/);
  const runId = `offline-${gitSha.slice(0, 12)}-${packSha256.slice(0, 12)}-${modelRevision.slice(0, 12)}`;
  const rows = [];
  for (const run of report.runs) {
    for (const frame of run.frames) {
      const checks = run.checks
        .filter(check => check.turn === frame.turn)
        .map(check => ({ kind: check.kind, key: check.key, expected: check.expected,
          actual: check.actual, matches: check.matches }));
      rows.push({
        schema_version: 1,
        run_id: runId,
        git_sha: gitSha,
        pack_sha256: packSha256,
        model_id: MODEL_ID,
        model_revision: modelRevision,
        configured_live_actor_model_id: runtime.pack.engine.modelPinned,
        provider: 'local-offline',
        live_model_invoked: false,
        data_classification: DATA_CLASSIFICATION,
        source_review_status: report.reviewStatus,
        scenario_id: run.scenarioId,
        persona: run.persona,
        group: run.group,
        decision_basis: run.basis,
        turn: frame.turn,
        setup_turn: frame.setup,
        scripted_interviewer_text: frame.student,
        synthetic_patient_text: frame.patient,
        deterministic_status: frame.client.coverage,
        unlocked_gate_ids: frame.client.unlocked,
        recognized_intent_ids: frame.client.covered,
        rapport: frame.client.rapport,
        client_server_parity: frame.parity,
        checks,
      });
    }
  }
  return validateRows(rows);
}

export function analyzeRows(rows) {
  validateRows(rows);
  const first = rows[0];
  return {
    schema_version: 1,
    run_id: first.run_id,
    git_sha: first.git_sha,
    pack_sha256: first.pack_sha256,
    model_id: first.model_id,
    model_revision: first.model_revision,
    rows: rows.length,
    scenarios: new Set(rows.map(row => row.scenario_id)).size,
    personas: new Set(rows.map(row => row.persona)).size,
    checked_rows: rows.filter(row => row.checks.length > 0).length,
    check_mismatches: rows.reduce((count, row) => count + row.checks.filter(check => !check.matches).length, 0),
    client_server_parity_mismatches: rows.filter(row => !row.client_server_parity).length,
    live_model_rows: rows.filter(row => row.live_model_invoked).length,
    non_synthetic_rows: rows.filter(row => row.data_classification !== DATA_CLASSIFICATION).length,
  };
}

function datasetCard(analysis) {
  return `---
pretty_name: Clerkship Interview Room Evaluations
configs:
- config_name: default
  data_files:
  - split: baseline
    path: baseline.jsonl
---

# Clerkship Interview Room Evaluations

Private, synthetic-only evaluation artifacts for the Psychiatry Clerkship Library Interview Room.

This baseline contains scripted conversations from the repository benchmark. It contains no learner records, real-patient information, recordings, browser storage, analytics events, credentials, or live provider responses. The corpus labels remain pending faculty review and are not a clinical accuracy estimate, learner assessment, or release approval.

## Baseline provenance

- Run: \`${analysis.run_id}\`
- Git commit: \`${analysis.git_sha}\`
- Patient-pack SHA-256: \`${analysis.pack_sha256}\`
- Offline model: \`${analysis.model_id}\`
- Model revision: \`${analysis.model_revision}\`
- Live model invoked: no

The model revision is the SHA-256 of the exact Interview Room client file containing the offline MockProvider used for these replies. The separately recorded configured live actor was not called.
`;
}

export async function writeDataset(destination) {
  const runtime = await loadBenchmark();
  const report = await runBenchmark(runtime);
  const rows = rowsFromReport(report, runtime);
  const analysis = analyzeRows(rows);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'baseline.jsonl'), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
  fs.writeFileSync(path.join(destination, 'analysis.json'), `${JSON.stringify(analysis, null, 2)}\n`);
  fs.writeFileSync(path.join(destination, 'README.md'), datasetCard(analysis));
  return analysis;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.deepEqual(args.slice(0, 1), ['--write'], 'Usage: node hf-dataset.mjs --write <directory>');
    assert.equal(args.length, 2, 'Usage: node hf-dataset.mjs --write <directory>');
    const destination = path.resolve(args[1]);
    const analysis = await writeDataset(destination);
    process.stdout.write(`${JSON.stringify(analysis)}\n`);
  } catch (error) {
    console.error(`HF dataset export could not complete: ${error.message}`);
    process.exitCode = 1;
  }
}
