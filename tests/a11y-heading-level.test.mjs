// Heading levels the shell injects must not skip (axe `heading-order`, 2026-10-07).
//
// The permanent axe smoke (tests/smoke/a11y-axe.spec.js) found two shell-owned headings announced
// at level 3 directly under a page h1: the build-injected crisis block on a reading page
// (t_mood.md: h1 "Mood" -> h3 "If someone is in crisis") and the Library's Teaching companion
// (h1 "Library" -> h3 "Teaching companion" -> h2 preview). Both are now announced at level 2,
// which is correct wherever they render because an h2 can never skip a level. aria-level carries
// the level so the drawn size, and every visual baseline that shows them, is unchanged.
// The browser spec checks the rendered result; this pins the source so a revert is caught at
// `node --test` time, before any build.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SB = '13_Faculty_Resources/_automation/site_build/';

test('the markdown crisis block announces its heading at level 2', () => {
  const md = execFileSync('python3', ['-B', `${SB}crisis_block.py`], { cwd: ROOT, encoding: 'utf8' });
  assert.match(md, /^> <h3 aria-level="2">If someone is in crisis<\/h3>$/m);
  assert.doesNotMatch(md, /^> #{1,6} If someone is in crisis/m, 'a markdown heading would drop the level');
  // the hook the Reader keys on still precedes it
  assert.ok(md.indexOf('crisis-block-hook') < md.indexOf('If someone is in crisis'));
});

test('the HTML crisis block (tools, shell) keeps its native h2', () => {
  const src = readFileSync(new URL(`${SB}crisis_block.py`, ROOT), 'utf8');
  assert.match(src, /<h2 id="crisis-block-heading"/);
});

test('the Library Teaching companion heading is announced at level 2', () => {
  const src = readFileSync(new URL(`${SB}frontdoor/fd_library.js`, ROOT), 'utf8');
  assert.match(src, /<h3 aria-level="2">Teaching companion<\/h3>/);
  assert.doesNotMatch(src, /<h3>Teaching companion<\/h3>/);
});
