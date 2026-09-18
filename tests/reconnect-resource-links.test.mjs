import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUD_SOURCE = '03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md';
const FAMILY_SOURCE = '14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md';
const RECONNECT_ORIGIN = 'https://reconnect-tools.netlify.app';

function read(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8');
}

function reconnectAnchors(markdown) {
  return Array.from(markdown.matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>/g), (match) => ({
    attributes: `${match[1]} ${match[3]}`,
    url: new URL(match[2], 'https://clerkship.invalid'),
  })).filter(({ url }) => url.origin === RECONNECT_ORIGIN);
}

function assertSafeCanonicalLinks(sourcePath, expectedPaths) {
  const anchors = reconnectAnchors(read(sourcePath));
  assert.deepEqual(
    anchors.map(({ url }) => url.pathname),
    expectedPaths,
    `${sourcePath} should link only to the selected canonical ReConnect tools`,
  );

  for (const { attributes, url } of anchors) {
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.equal(url.search, '', 'patient or learner context must not be placed in the tool URL');
    assert.equal(url.hash, '');
    assert.match(attributes, /\btarget="_blank"/);
    assert.match(attributes, /\brel="[^"]*\bnoopener\b[^"]*\bnoreferrer\b[^"]*"/);
  }
}

test('SUD discharge teaching links safely to the canonical meeting calendar and resource finder', () => {
  assertSafeCanonicalLinks(SUD_SOURCE, [
    '/tools/recovery-meeting-calendar.html',
    '/tools/reconnect-resource-finder-v7.html',
  ]);
});

test('family discharge teaching links safely to the canonical resource finder', () => {
  assertSafeCanonicalLinks(FAMILY_SOURCE, [
    '/tools/reconnect-resource-finder-v7.html',
  ]);
});
