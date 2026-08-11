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

  // Ward question-capture copy (P1 warning, P2 interstitial, P3 disclosure, P4 clipboard stamp).
  // These are the whole PHI enforcement surface — there is no automated PHI check in build or CI —
  // and they ship verbatim to both sites, so they must be audience-neutral and must not collide
  // with a RESIDENT_REBRAND needle. Extracted by role, like the sw_register literals below.
  const capWarn = shell.match(/<p class="cap-warn">([\s\S]*?)<\/p>/);
  assert.ok(capWarn, 'capture P1 warning not found in spa_index.html');
  strings['capture P1 warning'] = capWarn[1].replace(/<[^>]*>/g, '');

  const capDisclose = shell.match(/<p class="cap-disclose">([^<]*)<\/p>/);
  assert.ok(capDisclose, 'capture P3 disclosure not found in spa_index.html');
  strings['capture P3 disclosure'] = capDisclose[1];

  const capPhi = shell.match(/<div class="cap-phi"[^>]*>'\s*\+\s*'([\s\S]*?)'\s*\+\s*'/);
  assert.ok(capPhi, 'capture P2 interstitial not found in spa_index.html');
  strings['capture P2 interstitial'] = capPhi[1].replace(/<[^>]*>/g, '');

  const capStamp = shell.match(/lines=\['([^']*)'/);
  assert.ok(capStamp, 'capture P4 clipboard stamp not found in spa_index.html');
  strings['capture P4 clipboard stamp'] = capStamp[1];

  const capAria = shell.match(/aria-label="(Your question[^"]*)"/);
  assert.ok(capAria, 'capture textarea aria-label not found in spa_index.html');
  strings['capture textarea aria-label'] = capAria[1];

  const capBtn = shell.match(/id="captureBtnDesk"[^>]*>([^<]*)</);
  assert.ok(capBtn, 'desktop capture button label not found in spa_index.html');
  strings['capture desktop button'] = capBtn[1];

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

  // Rotation phase-policy labels (phase_policy.js) — the six phasePolicy() branches' shipped
  // copy (unset/post/taper/consolidate/interleave/encode). These reach BOTH sites verbatim
  // via the /*__PHASE_POLICY__*/ marker — no RESIDENT_REBRAND rewrite pass touches them —
  // so they must be audience-neutral ("Exam", never "Shelf" per the file's own copy-rule
  // comment) and needle-free, exactly like the shell/toast copy above.
  const phasePolicySrc = fs.readFileSync(path.join(BUILD_DIR, 'phase_policy.js'), 'utf8');
  extractPhasePolicyLabels(phasePolicySrc).forEach((s, i) => { strings[`phase-policy label #${i}`] = s; });

  return strings;
}

// Extracted as its own function (source passed in, not read internally) so the RED-teeth
// check below can run it against an in-memory-mutated variant of the source without ever
// writing to disk — same in-memory-only discipline as tests/ward-capture.test.mjs's T3b-teeth.
//
// Four of the six labels (taper/consolidate/interleave/encode) are built by string
// concatenation, e.g. `'Exam in '+days+' day'+(days===1?'':'s')+' — taper new cards,
// review daily.'` — capturing only the first quoted segment (`label:'([^']*)'`, the shape
// used for the single-literal sw_register.js toast strings) would reduce all four to
// "Exam in " and silently skip everything after the first `+`, which is exactly where a
// "Shelf" typo would live. So: grab the WHOLE `label:` expression up to the return object's
// closing `}` (no label expression contains a literal `}`), then pull out and join every
// single-quoted segment inside it, reassembling the full shipped text.
function extractPhasePolicyLabels(src) {
  const exprs = [...src.matchAll(/label:([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(exprs.length >= 6, `expected >=6 label:... expressions in phase_policy.js, found ${exprs.length}`);
  return exprs.map((expr) => [...expr.matchAll(/'([^']*)'/g)].map((m) => m[1]).join(''));
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

test('shared shell copy (A2HS sentence + SW toast + capture) is audience-neutral', () => {
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

// Positive-content pin: prove extractPhasePolicyLabels() reassembles the FULL text of the
// four concatenation-built labels, not just the first quoted fragment. Without this, the
// >=6-count guard alone would stay green even if extraction silently regressed back to
// `label:'([^']*)'` (first-fragment-only) — the exact bug a prior draft of this guard shipped
// with, where taper/consolidate/interleave/encode all reduced to "Exam in " and everything
// after their first `+` (including where a "Shelf" typo would live) went unchecked.
test('phase-policy label extraction reassembles the full text of concatenated labels, not just the first fragment', () => {
  const labels = extractPhasePolicyLabels(fs.readFileSync(path.join(BUILD_DIR, 'phase_policy.js'), 'utf8'));
  assert.equal(labels.length, 6, `expected exactly 6 phase-policy labels, found ${labels.length}`);
  assert.match(labels[2], /taper new cards/, 'taper label tail missing — extraction regressed to first-fragment-only');
  assert.match(labels[3], /consolidate: fewer new cards/, 'consolidate label tail missing — extraction regressed to first-fragment-only');
  assert.match(labels[4], /mix topics as you practice/, 'interleave label tail missing — extraction regressed to first-fragment-only');
  assert.match(labels[5], /steady building/, 'encode label tail missing — extraction regressed to first-fragment-only');
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

// Phase-policy label guard has teeth: mutate one label in-memory (never touching disk — the
// Task 4 lesson: a prior draft's teeth test wrote to disk on every CI run and was rewritten
// as pure in-memory string comparison instead) to plant the exact banned word the file's own
// copy-rule comment calls out ("Exam, never Shelf"), run it back through the real extraction
// regex, and confirm the audience-token guard actually trips on it.
//
// Deliberately planted in the TAPER label's TAIL fragment (' — taper new cards, review
// daily.'), not the 'post' label — 'post' is one of the two single-literal labels, so a
// mutation there would pass under EITHER extraction shape (fixed or the first-fragment-only
// bug this guard originally shipped with) and would prove nothing about whether the
// concatenated labels are actually covered. The taper label's first quoted segment
// ('Exam in ') is left untouched by this mutation; only a correct full-expression extraction
// ever sees the tail where the "Shelf" typo lands.
test('the audience-token guard actually rejects a "Shelf" planted in a concatenated phase-policy label\'s tail (RED-check, in-memory only)', () => {
  const realSrc = fs.readFileSync(path.join(BUILD_DIR, 'phase_policy.js'), 'utf8');
  const mutated = realSrc.replace(
    " — taper new cards, review daily.'",
    " — Shelf new cards, review daily.'",
  );
  assert.notEqual(mutated, realSrc, 'the replace() must actually have matched something, or this test proves nothing');

  const labels = extractPhasePolicyLabels(mutated);
  const hit = labels.find((s) => AUDIENCE_TOKEN_RE.test(s));
  assert.ok(hit, 'expected the planted "Shelf" (in the taper label\'s tail fragment) to be present among the extracted labels');
  assert.match(hit, /Exam in /, 'sanity: the tripped label should still carry its untouched leading fragment, confirming full reassembly (not a fluke first-fragment match)');
  assert.throws(() => {
    labels.forEach((s) => assert.doesNotMatch(s, AUDIENCE_TOKEN_RE));
  }, /AssertionError/, 'the audience-token guard must fail closed when a concatenated phase-policy label\'s tail is corrupted');
});
