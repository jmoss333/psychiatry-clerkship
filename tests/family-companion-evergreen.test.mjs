import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(
  path.join(repo, '06_Family_and_Relational/_source/index.html'),
  'utf8',
);

const evergreen = 'EVERGREEN FACULTY TEACHING COMPANION · UPDATED JULY 2026';
const provenance = 'Developed from a June 2026 family-therapy seminar.';

assert.ok(html.includes(evergreen));
assert.ok(html.includes(provenance));
assert.doesNotMatch(html, /TUE JUNE 16, 2026/);
assert.doesNotMatch(html, /June 16, 2026 seminar companion/);
assert.doesNotMatch(html, /before the seminar or during it/);
assert.doesNotMatch(html, /June 16|3:30 PM|McG Classroom/i);

console.log('Family Therapy Companion evergreen framing verified');
