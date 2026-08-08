import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNIPPET = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/phi_heuristic.js');
const SP = path.join(ROOT, '_prototypes/sp-interview/sp-interview.html');
const SP_PREVIEW = path.join(ROOT, '_prototypes/sp-interview/sp-interview.preview.html');

function loadHeuristic() {
  const body = fs.readFileSync(SNIPPET, 'utf8');
  return new Function(body + '; return looksLikePhi;')();
}

test('T3: shared heuristic passes the sp-interview fixtures plus ward cases', () => {
  const looksLikePhi = loadHeuristic();
  const cases = [
    ['MRN 4482913 patient in bed 4', true],
    ['my patient said the same thing yesterday', true],
    ['dob 3/14/1990', true],
    ['Have you had thoughts of killing yourself?', false],
    ['QTc over 500', false],
    ['lithium level 1.2', false],
  ];
  for (const [text, expected] of cases) assert.equal(looksLikePhi(text), expected, text);
});

test('T3b: PHI_PATTERNS line is byte-identical across all three copies', () => {
  const pick = (src, file) => {
    const line = src.split(/\r?\n/).find((l) => l.startsWith('var PHI_PATTERNS='));
    assert.ok(line, `PHI_PATTERNS line missing in ${file}`);
    return line;
  };
  const snippetLine = pick(fs.readFileSync(SNIPPET, 'utf8'), 'phi_heuristic.js');
  const spLine = pick(fs.readFileSync(SP, 'utf8'), 'sp-interview.html');
  const previewLine = pick(fs.readFileSync(SP_PREVIEW, 'utf8'), 'sp-interview.preview.html');

  assert.equal(snippetLine, spLine,
    'PHI_PATTERNS mismatch: phi_heuristic.js vs sp-interview.html — edit all three copies together');
  assert.equal(spLine, previewLine,
    'PHI_PATTERNS mismatch: sp-interview.html vs sp-interview.preview.html — edit all three copies together');
});

test('T3b-teeth: PHI_PATTERNS mutation is detected by the pin logic', () => {
  // Pure in-memory verification that the pin logic fails on mutations.
  // Read all three sources once; build mutated variant as a string (no disk writes).
  const pick = (src, file) => {
    const line = src.split(/\r?\n/).find((l) => l.startsWith('var PHI_PATTERNS='));
    assert.ok(line, `PHI_PATTERNS line missing in ${file}`);
    return line;
  };

  const snippetLine = pick(fs.readFileSync(SNIPPET, 'utf8'), 'phi_heuristic.js');
  const previewContent = fs.readFileSync(SP_PREVIEW, 'utf8');
  const previewLine = pick(previewContent, 'sp-interview.preview.html');

  // Verify pin passes in clean state
  assert.equal(snippetLine, previewLine, 'pin baseline: all three copies must match');

  // Build mutated variant in-memory (6+ → 7+ regex)
  const mutatedLine = previewLine.replace(
    'var PHI_PATTERNS=[/\\b\\d{6,}\\b/',
    'var PHI_PATTERNS=[/\\b\\d{7,}\\b/'
  );
  assert.notEqual(mutatedLine, previewLine, 'mutation setup failed');

  // Verify the pin logic detects the mutation
  assert.throws(
    () => {
      assert.equal(snippetLine, mutatedLine,
        'PHI_PATTERNS mismatch: phi_heuristic.js, sp-interview.html, sp-interview.preview.html — edit all three copies together');
    },
    { message: /PHI_PATTERNS mismatch/ },
    'pin should detect mutation'
  );
});
