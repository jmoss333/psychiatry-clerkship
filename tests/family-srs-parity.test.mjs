// The canonical SM-2 grader is build-injected (common.py inject_shared_snippets)
// from site_build/sm2_apply_grade.js. Consumers must carry the marker and must
// NOT reintroduce a local applyGrade — hand-synced copies are exactly the drift
// this replaced (review.html had silently diverged into a third variant).
// Behaviour is asserted separately in tests/sm2-behavior.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '/*__SM2_APPLY_GRADE__*/';
const CONSUMERS = [
  '13_Faculty_Resources/_automation/site_build/question-bank-practice.html',
  '06_Family_and_Relational/family-systems-practice.html',
  '07_Evidence_and_Reading/Landmark_Trials/review.html',
];

for (const file of CONSUMERS) {
  test(`${file} uses the injected canonical grader`, () => {
    const src = fs.readFileSync(path.join(repo, file), 'utf8');
    assert.ok(src.includes(MARKER), `missing SM-2 snippet marker in ${file}`);
    assert.ok(!/function applyGrade\(/.test(src),
      `${file} defines a local applyGrade — the canonical body lives in sm2_apply_grade.js`);
    assert.ok(/var DAY ?= ?86400000/.test(src),
      `${file} must define DAY before the injected snippet`);
  });
}
