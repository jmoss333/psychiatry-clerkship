import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, '13_Faculty_Resources', '_automation', 'site_build');

// Offline-shell copy (A2HS sentence + service-worker update toast) is the first shell text
// that ships identically to BOTH sites — unlike page content, it is never routed through
// resident_section.py's RESIDENT_REBRAND rewrite. That makes two failure modes possible that
// no other test catches:
//   1. audience-specific wording (MS3/clerkship/resident/etc.) baked into shared shell copy —
//      wrong for whichever site reads it literally.
//   2. a shared-copy string that happens to contain a RESIDENT_REBRAND "from" needle — since
//      apply_verified_replacements() does a plain text.replace() over the whole built page,
//      an accidental substring match would silently mutate shell copy that was never meant to
//      be rewritten (or, if the needle is required-once elsewhere, the count assumption breaks).

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

function extractShellCopy() {
  const shell = fs.readFileSync(path.join(BUILD_DIR, 'spa_index.html'), 'utf8');
  const swRegister = fs.readFileSync(path.join(BUILD_DIR, 'sw_register.js'), 'utf8');

  const strings = {};

  // Start-page A2HS sentence (renderStart output).
  const a2hs = shell.match(/<p class="sub st-a2hs">([^<]*)<\/p>/);
  assert.ok(a2hs, 'A2HS sentence not found in spa_index.html renderStart output');
  strings['A2HS sentence'] = a2hs[1];

  // sw_register.js update-toast copy: innerHTML/textContent literals + the dismiss aria-label.
  // Extracted by role rather than a blanket string dump, so code identifiers (function names,
  // message types, CSS classes) never get swept in as if they were learner-facing copy.
  const innerHtmlLiterals = [...swRegister.matchAll(/\.innerHTML\s*=\s*'([^']*)'/g)].map((m) => m[1]);
  const textContentLiterals = [...swRegister.matchAll(/\.textContent\s*=\s*'([^']*)'/g)].map((m) => m[1]);
  const ariaLabelLiterals = [...swRegister.matchAll(/setAttribute\('aria-label'\s*,\s*'([^']*)'\)/g)].map(
    (m) => m[1],
  );

  assert.ok(innerHtmlLiterals.length >= 1, 'expected at least one innerHTML toast literal in sw_register.js');
  assert.ok(textContentLiterals.length >= 2, 'expected Refresh + Later button literals in sw_register.js');
  assert.ok(ariaLabelLiterals.length >= 1, 'expected the dismiss aria-label literal in sw_register.js');

  innerHtmlLiterals.forEach((s, i) => { strings[`sw toast innerHTML #${i}`] = s; });
  textContentLiterals.forEach((s, i) => { strings[`sw toast textContent #${i}`] = s; });
  ariaLabelLiterals.forEach((s, i) => { strings[`sw toast aria-label #${i}`] = s; });

  return strings;
}

function extractResidentRebrandNeedles() {
  const src = fs.readFileSync(path.join(BUILD_DIR, 'resident_section.py'), 'utf8');
  const start = src.indexOf('RESIDENT_REBRAND=[');
  assert.ok(start > -1, 'RESIDENT_REBRAND literal not found in resident_section.py');
  const end = src.indexOf('\n]', start);
  assert.ok(end > start, 'could not find the end of the RESIDENT_REBRAND list');
  const block = src.slice(start, end);
  // Every tuple element is a single-quoted Python string literal (no embedded apostrophes in
  // this list as of writing); pull all of them out — both "from" and "to" sides — so a shell
  // copy string colliding with either half of a rebrand pair is caught.
  const needles = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  assert.ok(needles.length >= 10, `expected >=10 quoted needles in RESIDENT_REBRAND, found ${needles.length}`);
  return needles;
}

test('shared shell copy (A2HS sentence + SW toast) is audience-neutral', () => {
  const strings = extractShellCopy();
  for (const [label, value] of Object.entries(strings)) {
    assert.doesNotMatch(
      value,
      AUDIENCE_TOKEN_RE,
      `${label} contains an audience-specific token: ${JSON.stringify(value)}`,
    );
  }
});

test('shared shell copy has zero RESIDENT_REBRAND needle collisions', () => {
  const strings = extractShellCopy();
  const needles = extractResidentRebrandNeedles();
  for (const [label, value] of Object.entries(strings)) {
    for (const needle of needles) {
      assert.ok(
        !value.includes(needle),
        `${label} (${JSON.stringify(value)}) collides with RESIDENT_REBRAND needle ${JSON.stringify(needle)}`,
      );
    }
  }
});

// Guard the guard: the two assertions above only mean something if they can actually fail.
// This test proves the audience-token check has teeth by running it against a deliberately
// bad string (equivalent to what you'd get by hand-inserting "MS3" into a toast literal) and
// confirming it throws — the manual version of this (editing sw_register.js, running
// `node --test tests/shell-copy.test.mjs`, observing a real failure, then reverting) was done
// once during authoring; this keeps that guarantee under CI rather than trusting a one-time
// manual check.
test('the audience-token guard actually rejects a banned token (RED-check)', () => {
  assert.throws(() => {
    assert.doesNotMatch('Updated content available for MS3 students', AUDIENCE_TOKEN_RE);
  }, /AssertionError/);
});

test('the RESIDENT_REBRAND collision guard actually rejects a needle match (RED-check)', () => {
  const needles = extractResidentRebrandNeedles();
  const poisoned = 'On iPhone: ' + needles[0] + ' keeps this offline.';
  assert.throws(() => {
    assert.ok(!poisoned.includes(needles[0]));
  }, /AssertionError/);
});
