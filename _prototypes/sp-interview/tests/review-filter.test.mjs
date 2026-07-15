import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'sp-interview.html'), 'utf8');
const match = html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/);
assert.ok(match, 'main script must be present');

const source = match[0]
  .replace(/^<script>\n/, '')
  .replace(/\n<\/script>$/, '');

global.window = {};
global.document = {
  getElementById: () => ({
    addEventListener() {},
    removeEventListener() {},
    textContent: '',
  }),
  documentElement: {
    getAttribute: () => null,
    setAttribute() {},
  },
  createElement: () => ({ click() {} }),
};
global.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
global.sessionStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
global.React = {
  createElement: () => null,
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
};
global.ReactDOM = { createRoot: () => ({ render() {} }) };
global.fetch = () => Promise.reject(new Error('no net'));

eval(source);

const testApi = global.window.__SP_TEST__;
const pack = JSON.parse(fs.readFileSync(path.join(root, 'sp-interview.pack.json'), 'utf8'));

assert.equal(
  typeof testApi.eligibleCases,
  'function',
  'eligibleCases must be exported through the test API',
);
assert.equal(
  typeof testApi.isManagedVoiceEligible,
  'function',
  'isManagedVoiceEligible must be exported through the test API',
);
assert.deepEqual(
  pack.cases.map((caseDef) => caseDef.id),
  [
    'sp_depression_gated_si_001',
    'sp_mania_redirect_001',
    'sp_psychosis_paranoid_001',
  ],
  'all deterministic regression cases must remain in the canonical pack',
);
assert.deepEqual(
  testApi.eligibleCases(pack).map((caseDef) => caseDef.id),
  ['sp_depression_gated_si_001'],
);
assert.equal(testApi.isManagedVoiceEligible(pack, pack.cases[0]), false);

console.log('PASS — learner selector exposes only reviewed cases and managed voice fails closed');
