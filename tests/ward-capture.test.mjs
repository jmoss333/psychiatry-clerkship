import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNIPPET = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/phi_heuristic.js');
const SP = path.join(ROOT, '_prototypes/sp-interview/sp-interview.html');

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

test('T3b: PHI_PATTERNS line is byte-identical between the snippet and sp-interview source', () => {
  const pick = (src, file) => {
    const line = src.split(/\r?\n/).find((l) => l.startsWith('var PHI_PATTERNS='));
    assert.ok(line, `PHI_PATTERNS line missing in ${file}`);
    return line;
  };
  assert.equal(
    pick(fs.readFileSync(SNIPPET, 'utf8'), 'phi_heuristic.js'),
    pick(fs.readFileSync(SP, 'utf8'), 'sp-interview.html'),
    'edit both copies together — sp-interview cannot consume the marker (its tests eval source)',
  );
});
