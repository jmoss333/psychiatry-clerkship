import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_capture_email.js', import.meta.url,
), 'utf8');
const F = runInNewContext(`${source}\n({fdEmailLocalPart,fdEmailAddress,fdEmailSelection,fdEmailDigest,fdEmailMailto})`, {
  URL, encodeURIComponent,
});

test('recipient accepts one local part under the locked domain', () => {
  assert.equal(F.fdEmailLocalPart('faculty.name+teaching'), 'faculty.name+teaching');
  assert.equal(F.fdEmailAddress('faculty.name'), 'faculty.name@mainehealth.org');
  for (const bad of ['a@b', 'a b', ' a', 'a ', 'a,b', 'a;b', 'a\nbcc:x', 'a\rBcc:x',
    '', '.faculty', 'faculty.', 'faculty..name', 'a\tb', '__proto__', 'constructor',
    'prototype', 'a'.repeat(65), 1, {}, Object.create({ value: 'faculty' })]) {
    assert.equal(F.fdEmailLocalPart(bad), null, `reject ${String(bad)}`);
    assert.equal(F.fdEmailAddress(bad), null, `reject address ${String(bad)}`);
  }
});

test('selection includes only explicitly chosen open items and deduplicates ids', () => {
  const items = [
    { id: 'a', text: 'First?', route: 'rounds', state: 'open', ctx: 'page.md', at: 123, answer: 'private' },
    { id: 'a', text: 'Duplicate?', route: 'later', state: 'open' },
    { id: 'b', text: 'Done?', route: null, state: 'done' },
    { id: 'c', text: 'Other?', route: 'supervision', state: 'open' },
    Object.assign(Object.create({ id: 'inherited' }), { text: 'Inherited?', state: 'open', route: null }),
    { id: '__proto__', text: 'Prototype?', state: 'open', route: null },
  ];
  const selected = F.fdEmailSelection(items, ['c', 'a', 'a', 'b', 'inherited', '__proto__', 'missing']);
  assert.deepEqual(Array.from(selected, item => item.id), ['a', 'c']);
  assert.deepEqual(Object.keys(selected[0]).sort(), ['ctx', 'id', 'route', 'text']);
  assert.equal(selected[0].text, 'First?');
  assert.equal(selected[0].ctx, 'page.md');
  assert.equal(F.fdEmailSelection(items, Object.create({ 0: 'a', length: 1 })).length, 0);
});

test('digest groups exactly selected questions and derives source only from canonical index', () => {
  const index = { byRef: { 'page.md': { ref: 'page.md', title: 'Interview structure' } } };
  const items = [
    { id: 'z', text: 'Unrouted?', route: null, ctx: 'missing.md', title: 'Forged', url: 'https://evil.test' },
    { id: 'b', text: 'Later?', route: 'later', ctx: 'page.md', title: 'Forged', url: 'https://evil.test' },
    { id: 's', text: 'Supervision?', route: 'supervision', ctx: null },
    { id: 'a', text: 'Rounds?', route: 'rounds', ctx: null },
  ];
  const selected = F.fdEmailSelection(items.map(item => ({ ...item, state: 'open' })), ['z', 'b', 's', 'a']);
  const digest = F.fdEmailDigest(index, selected, 'https://example.test');
  assert.equal(digest.subject, 'Psychiatry learning questions (4)');
  assert.match(digest.body, /^This is a learner-prepared teaching digest\. It contains no patient information\./);
  assert.match(digest.body, /Ask on rounds[\s\S]*Rounds\?[\s\S]*Discuss in supervision[\s\S]*Supervision\?[\s\S]*Look up later[\s\S]*Later\?[\s\S]*Unrouted[\s\S]*Unrouted\?/);
  assert.match(digest.body, /Interview structure[\s\S]*https:\/\/example\.test\/\?page=page\.md/);
  assert.doesNotMatch(digest.body, /Forged|evil\.test|missing\.md|123|private|answer|updatedAt|readingPlaces|practice/);
  const one = F.fdEmailDigest(index, F.fdEmailSelection(items.map(item => ({ ...item, state: 'open' })), ['b']), 'https://example.test');
  assert.equal(one.subject, 'Psychiatry learning questions (1)');
  assert.match(one.body, /Later\?/);
  assert.doesNotMatch(one.body, /Rounds\?|Supervision\?|Unrouted\?/);
});

test('digest rejects inherited, noncanonical, and non-same-origin source metadata', () => {
  const inherited = Object.create({ 'page.md': { ref: 'page.md', title: 'Inherited title' } });
  const index = { byRef: inherited };
  const items = [{ id: 'a', text: 'Question?', route: null, ctx: 'page.md' }];
  assert.doesNotMatch(F.fdEmailDigest(index, items, 'https://example.test').body, /Inherited title|\?page=/);
  index.byRef = { 'page.md': { ref: 'other.md', title: 'Wrong key' } };
  assert.doesNotMatch(F.fdEmailDigest(index, items, 'https://example.test').body, /Wrong key|\?page=/);
  index.byRef = { 'page.md': { ref: 'page.md', title: 'Canonical title' } };
  for (const badOrigin of ['https://example.test/elsewhere', 'https://evil.test/?next=https://example.test', 'file:///tmp/site', 'javascript:alert(1)']) {
    assert.doesNotMatch(F.fdEmailDigest(index, items, badOrigin).body, /\?page=/);
  }
  const traversal = F.fdEmailDigest({ byRef: { '../page.md': { ref: '../page.md', title: 'Traversal' } } },
    [{ id: 'x', text: 'Question?', route: null, ctx: '../page.md' }], 'https://example.test');
  assert.doesNotMatch(traversal.body, /Traversal|\?page=/);
});

test('mailto URI encodes recipient, subject, and body and refuses overlong drafts intact', () => {
  const digest = { subject: 'Psychiatry learning questions (1)', body: 'Question?\nA&B + 2' };
  const result = F.fdEmailMailto('faculty+teaching', digest);
  assert.equal(result.ok, true);
  assert.equal(result.href, 'mailto:faculty%2Bteaching%40mainehealth.org?subject=Psychiatry%20learning%20questions%20(1)&body=Question%3F%0AA%26B%20%2B%202');
  assert.equal(F.fdEmailMailto('a\nbcc:x', digest).ok, false);
  const shorter = F.fdEmailMailto('faculty', digest);
  const tooLong = F.fdEmailMailto('faculty', digest, shorter.href.length - 1);
  assert.deepEqual({ ...tooLong }, { ok: false, reason: 'too-long' });
  assert.equal(F.fdEmailMailto('faculty', digest, shorter.href.length).ok, true);
  assert.deepEqual({ ...F.fdEmailMailto('faculty', { subject: digest.subject, body: 'a'.repeat(2000) }) },
    { ok: false, reason: 'too-long' });
  assert.equal(F.fdEmailMailto('faculty', Object.create(digest)).ok, false);
});

test('malformed saved Unicode cannot crash or produce a partial mailto URI', () => {
  const digest = F.fdEmailDigest({}, [{ id: 'a', text: '\ud800', route: null }], 'https://example.test');
  assert.deepEqual({ ...F.fdEmailMailto('faculty', digest) }, { ok: false, reason: 'invalid-digest' });
});
