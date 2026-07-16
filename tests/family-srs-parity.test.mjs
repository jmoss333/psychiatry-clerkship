import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractApplyGrade(file) {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  const m = src.match(/function applyGrade\(card, ?grade\)\{[\s\S]*?return c;\s*\}/);
  assert.ok(m, `applyGrade not found in ${file}`);
  return m[0].replace(/\s+/g, '');
}

const qbank = extractApplyGrade('13_Faculty_Resources/_automation/site_build/question-bank-practice.html');
const family = extractApplyGrade('06_Family_and_Relational/family-systems-practice.html');

assert.equal(family, qbank, 'family tool applyGrade must match question-bank-practice.html (SM-2 parity)');
console.log('Family SRS applyGrade parity with question bank verified');
