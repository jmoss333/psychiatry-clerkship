import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const netlify = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

function redirectBlock(from) {
  const blocks = netlify.split('[[redirects]]').slice(1);
  return blocks.find((block) => new RegExp(`\\bfrom\\s*=\\s*"${from}"`).test(block)) ?? '';
}

test('public Interview Room paths rewrite to their deployed functions', () => {
  for (const [from, target] of [
    ['/api/sp', '/.netlify/functions/sp'],
    ['/api/sp/voice', '/.netlify/functions/sp-voice'],
    ['/api/sp/health-status', '/.netlify/functions/sp-health-status'],
  ]) {
    const block = redirectBlock(from);
    assert.notEqual(block, '', `missing Netlify rewrite for ${from}`);
    assert.match(block, new RegExp(`\\bto\\s*=\\s*"${target}"`));
    assert.match(block, /\bstatus\s*=\s*200\b/);
    assert.match(block, /\bforce\s*=\s*true\b/);
  }
});
