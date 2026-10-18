// The repository's tracked top-level entries are an allowlist (R7, 2026-10-17). Adding a root
// file or directory is a deliberate act that edits this list in the same PR; removing one means
// deleting it here too. Why: the root had grown to ~100 entries, raw material beside shipped
// source, and nothing noticed — every `ls`, every agent's orientation and every new reader paid
// for it. Only TRACKED entries count: a sandbox's untracked scratch is not the repository's problem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep sorted. Shrinking is welcome; growing is a reviewed choice.
const ALLOWED = [
  '.claude', '.devcontainer', '.dockerignore', '.gitattributes', '.github', '.gitignore',
  '.mcp.json', '.superpowers', '.vscode',
  '00_START_HERE', '01_Six_Week_Curriculum', '02_Clinical_Skills', '03_Core_Topics',
  '04_Acute_and_Safety', '05_Psychopharmacology', '06_Family_and_Relational',
  '07_Evidence_and_Reading', '08_Cases_and_Simulation', '09_Exam_Prep',
  '10_Patient_and_Family_Education', '11_AI_and_Prompts', '12_Media', '13_Faculty_Resources',
  '14_Tracks', '99_Archive',
  'AGENTS.md', 'CLAUDE.md', 'Evidence Inbox', 'LICENSE', 'LICENSE-content',
  'OPENEVIDENCE RAW FILES TO REVIEW', 'QUESTION_BANK_BLUEPRINT.md',
  'QUESTION_BANK_EXECUTION_BRIEF.md', 'QUESTION_BANK_STANDARD.md', 'README.md',
  '_FILL_MANIFEST.csv', '_MASTER_INDEX.xlsx', '_prototypes', 'benchmarks', 'bin',
  'communication_cases.json', 'communication_cases.schema.json', 'crisis_resources.json',
  'crisis_resources.schema.json', 'curriculum.json', 'curriculum.schema.json', 'decisions.json',
  'decisions.schema.json', 'docs', 'evidence_annotations.json', 'evidence_annotations.schema.json',
  'evidence_registry.json', 'evidence_registry.schema.json', 'faculty-console',
  'family_systems_scenarios.json', 'family_systems_scenarios.schema.json', 'index.html',
  'instrument_rights.json', 'instrument_rights.schema.json', 'longitudinal_case.json',
  'media_manifest.json', 'media_map.json', 'metrics', 'netlify.toml', 'pairings.json',
  'pairings.schema.json', 'pharmacy.json', 'pharmacy.schema.json', 'question_bank.json',
  'question_bank.schema.json', 'quizzes.fingerprints.json', 'quizzes.schema.json',
  'reasoning_cases.json', 'reasoning_cases_resident.json', 'requirements-dev.txt',
  'requirements.txt', 'research_returns.json', 'research_returns.schema.json',
  'rotation_edition.schema.json', 'runtime_versions.json', 'sp-preview', 'sp-proxy',
  'standards.json', 'standards.schema.json', 'tests', 'tool_registry.json',
  'tool_registry.schema.json', 'tools', 'topic_meta.json', 'topic_meta.schema.json',
  'vocabulary.json', 'vocabulary.schema.json',
];

function trackedRootEntries() {
  const r = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const top = new Set();
  for (const p of r.stdout.split('\0')) if (p) top.add(p.split('/')[0]);
  return [...top].sort();
}

test('the allowlist itself is sorted and free of duplicates', () => {
  assert.deepEqual(ALLOWED, [...new Set(ALLOWED)].sort(), 'ALLOWED must be sorted with no duplicates');
});

test('every tracked top-level entry is allowlisted, and every allowlisted entry still exists', (t) => {
  const tracked = trackedRootEntries();
  if (tracked === null) {
    t.skip('git ls-files unavailable here (sandboxed worktree); run host-side');
    return;
  }
  const allowed = new Set(ALLOWED);
  const unlisted = tracked.filter((e) => !allowed.has(e));
  assert.deepEqual(unlisted, [],
    'new tracked root entries — list each in tests/root-layout.test.mjs in this PR, or move it under docs/ or 99_Archive/');
  const trackedSet = new Set(tracked);
  const gone = ALLOWED.filter((e) => !trackedSet.has(e));
  assert.deepEqual(gone, [], 'allowlisted entries no longer tracked — delete them from the list (shrinking is the point)');
});
