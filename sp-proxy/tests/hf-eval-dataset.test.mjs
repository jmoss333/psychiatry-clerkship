import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXPORTER = path.join(ROOT, 'benchmarks/interview-room/hf-dataset.mjs');
const REQUIRED = ['git_sha', 'pack_sha256', 'model_id', 'model_revision'];
const FORBIDDEN_KEYS = new Set([
  'email', 'learner_id', 'learner_name', 'patient_id', 'student_id', 'user_id',
  'ip', 'user_agent', 'audio', 'recording', 'real_encounter_id', 'self_assessment',
]);

function exportTo(dir) {
  return spawnSync(process.execPath, [EXPORTER, '--write', dir], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function readRows(dir) {
  return fs.readFileSync(path.join(dir, 'baseline.jsonl'), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line));
}

function keysIn(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, nested] of Object.entries(value)) {
    found.add(key);
    keysIn(nested, found);
  }
  return found;
}

test('exports a deterministic synthetic-only baseline with complete row provenance', () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-eval-first-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-eval-second-'));
  try {
    const one = exportTo(first);
    assert.equal(one.status, 0, one.stderr || one.stdout);
    const two = exportTo(second);
    assert.equal(two.status, 0, two.stderr || two.stdout);

    const firstBytes = fs.readFileSync(path.join(first, 'baseline.jsonl'));
    const secondBytes = fs.readFileSync(path.join(second, 'baseline.jsonl'));
    assert.deepEqual(firstBytes, secondBytes, 'the same source revision must produce identical dataset bytes');

    const rows = readRows(first);
    assert.ok(rows.length > 49, 'export one or more turn rows for every synthetic persona run');
    assert.equal(new Set(rows.map(row => row.run_id)).size, 1);
    for (const row of rows) {
      for (const key of REQUIRED) assert.match(row[key], /\S/, `${key} must be present on every row`);
      assert.match(row.git_sha, /^[a-f0-9]{40}$/);
      assert.match(row.pack_sha256, /^[a-f0-9]{64}$/);
      assert.equal(row.model_id, 'local/InterviewRoomMockProvider');
      assert.match(row.model_revision, /^[a-f0-9]{64}$/);
      assert.equal(row.live_model_invoked, false);
      assert.equal(row.data_classification, 'synthetic-only');
      assert.equal(row.source_review_status, 'pending-faculty-review');
      assert.equal(typeof row.scripted_interviewer_text, 'string');
      assert.equal(typeof row.synthetic_patient_text, 'string');
    }

    const observedKeys = keysIn(rows);
    assert.deepEqual([...observedKeys].filter(key => FORBIDDEN_KEYS.has(key)), []);
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

test('writes a local analysis whose counts match the exported rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-eval-analysis-'));
  try {
    const result = exportTo(dir);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const rows = readRows(dir);
    const analysis = JSON.parse(fs.readFileSync(path.join(dir, 'analysis.json'), 'utf8'));
    assert.equal(analysis.rows, rows.length);
    assert.equal(analysis.live_model_rows, 0);
    assert.equal(analysis.non_synthetic_rows, 0);
    assert.equal(analysis.client_server_parity_mismatches, 0);
    assert.equal(analysis.git_sha, rows[0].git_sha);
    assert.equal(analysis.pack_sha256, rows[0].pack_sha256);
    assert.equal(analysis.model_id, rows[0].model_id);
    assert.equal(analysis.model_revision, rows[0].model_revision);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
