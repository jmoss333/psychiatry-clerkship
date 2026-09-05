// WP-06R-b shell guards — the three invariants the spec puts in code, not in copy.
//
// SPEC_Safety_Planning_Practice_v1_DRAFT.md §1 is explicit that these are "enforced in code, not
// asserted in copy". A comment saying "no export button" is not enforcement; this file is.
//
// Why a prototype gets guarded at all: the Stanley-Brown Safety Plan's own terms name PROGRAMMING
// the form as reproduction (instrument_rights.json, `stanley-brown`, status restricted). A shell
// that drifted into a form-filler, or grew an export, would cross that line quietly — and the
// drift would arrive as an innocuous-looking convenience feature, which is exactly the shape of
// change a reviewer waves through. If one of these assertions fails, THAT EDIT is the finding.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '_prototypes/safety-planning/safety-planning-practice.preview.html');
const MANIFEST = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/site_manifest.json');

// The shell is a preview and may legitimately be deleted on promotion. Skip rather than fail if
// it is gone — but if it is gone from _prototypes AND present in the manifest, the promotion
// checklist applies and these guards must be re-homed onto the shipped file.
const present = existsSync(FILE);
const html = present ? readFileSync(FILE, 'utf8') : '';

test('the shell exists, or has been promoted deliberately', () => {
  if (present) return;
  const manifest = readFileSync(MANIFEST, 'utf8');
  assert.ok(!/safety-planning/.test(manifest),
    'the prototype is gone but a safety-planning page is in the manifest — promotion happened; '
    + 're-home these invariant guards onto the shipped file rather than losing them');
});

test('no export surface of any kind', { skip: !present }, () => {
  // The spec names this "the verdict() failure mode and the worst PHI surface the library could
  // add". Matched against markup and code, with comments stripped so the file may still DESCRIBE
  // the prohibition — which it does, deliberately, on the page and in its header comment.
  const code = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const banned of [
    /\bdownload\b/i,
    /clipboard/i,
    /execCommand/i,
    /window\s*\.\s*print/i,
    /createObjectURL/i,
    /new\s+Blob\b/i,
  ]) {
    assert.doesNotMatch(code, banned,
      `an export surface appeared (${banned}) — the tool must produce no output document at all; `
      + 'see SPEC_Safety_Planning_Practice_v1_DRAFT.md §1');
  }
});

test('the learner’s rehearsal text is never persisted', { skip: !present }, () => {
  const writes = [...html.matchAll(/localStorage\s*\.\s*setItem\s*\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(writes.length, 1,
    `expected exactly one localStorage write, found ${writes.length} — a second write is how free `
    + 'text starts being stored');
  assert.match(writes[0], /state\.ratings/,
    'the only persisted value must be the self-ratings; the rehearsal text must die with the step');
  // The textarea must never be read into anything that outlives the render.
  assert.doesNotMatch(html, /setItem\s*\([^)]*(?:value|textarea|say)\b/i,
    'the rehearsal textarea must not reach storage');
});

test('the learner’s line survives the reveal, without being persisted', { skip: !present }, () => {
  // Codex review on #533 caught this: renderStep() rewrote the card into a fresh empty textarea,
  // so the line vanished at the exact moment it was needed to compare against the model — the
  // whole exercise. The fix must hold BOTH halves: the draft survives an in-step re-render, and
  // it still never reaches storage (the invariant above).
  assert.match(html, /var\s+draft\s*=\s*''/, 'the in-memory draft must exist');
  assert.match(html, /<textarea id="say"[^>]*>'\s*\+\s*esc\(draft\)/,
    'the textarea must re-render carrying the draft, or the reveal destroys the learner’s line');
  assert.match(html, /revealbtn'\s*\)\s*\{\s*captureDraft\(\)/,
    'reveal must capture the draft before re-rendering');
  assert.match(html, /dataset\.grade\s*\)\s*\{\s*\n?\s*captureDraft\(\)/,
    'grading also re-renders the step — it must capture the draft too');
  // Leaving the step drops it, which is what the page promises the learner.
  for (const leave of [/dataset\.case\s*\)\s*\{\s*draft = ''/, /dataset\.step\s*\)\s*\{\s*draft = ''/]) {
    assert.match(html, leave, 'changing step or case must clear the draft');
  }
  // And the draft must stay out of the persisted object.
  assert.doesNotMatch(html, /state\.draft/, 'the draft must not live on state — save() persists state.ratings');
});

test('storage stays in the cw_* namespace', { skip: !present }, () => {
  const keys = [...html.matchAll(/localStorage\s*\.\s*(?:get|set)Item\s*\(\s*([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")/g)]
    .map((m) => m[1]);
  assert.ok(keys.length > 0, 'expected at least one storage access');
  // Keys go through the STORE_KEY constant; pin the constant itself.
  const decl = html.match(/STORE_KEY\s*=\s*'([^']+)'/);
  assert.ok(decl, 'STORE_KEY must be a literal so the namespace is greppable');
  assert.match(decl[1], /^cw_/,
    `storage key "${decl[1]}" is outside the cw_* namespace — the QA gate hard-fails this on any `
    + 'shipped page, and the prototype should not teach the wrong habit');
});

test('no crisis number is hard-coded', { skip: !present }, () => {
  // crisis_resources.json owns these; the marker is present for build-time injection on promotion.
  assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /\b988\b|1-800-\d|\b741741\b/,
    'crisis contacts live in crisis_resources.json only (CLAUDE.md)');
  assert.match(html, /<!-- crisis-block-html -->/,
    'keep the injection marker so promotion picks up the crisis block automatically');
});

test('the shell does not ship — it is unregistered by design', { skip: !present }, () => {
  const manifest = readFileSync(MANIFEST, 'utf8');
  assert.ok(!/safety-planning/.test(manifest),
    'the shell carries unsigned clinical strings on a suicide-safety surface and must not be '
    + 'registered until the spec §7 author checklist is complete');
});

test('the page states its own draft status on its face', { skip: !present }, () => {
  // A reviewer who opens the file without reading the README must still learn it is unsigned.
  assert.match(html, /not attested|unattested/i);
  assert.match(html, /suicidesafetyplan\.com/,
    'the official-source route recorded in instrument_rights.json must be on the page');
});

test('nothing from the copyrighted form is reproduced', { skip: !present }, () => {
  // Signature discipline, learned the hard way and recorded in instrument_rights.json's _note:
  // a signature must detect the reproduction that SHIPPED, never plain clinical language. Short
  // or generic fragments block legitimate prose — "warning signs" is ordinary clinical English
  // and appears here inside a trap ("What are your warning signs?" gets you a shrug), which is
  // teaching, not reproduction. So the check is split by how distinctive each label actually is.

  // (a) Distinctive multi-word labels: reproduction anywhere in the file is the finding.
  const DISTINCTIVE = [
    'internal coping strategies',
    'people and social settings that provide distraction',
    'people whom i can ask for help',
    'professionals or agencies i can contact during a crisis',
    'making the environment safer',
  ];
  const text = html.toLowerCase();
  for (const label of DISTINCTIVE) {
    assert.ok(!text.includes(label),
      `form field label reproduced: "${label}" — the six headings must be original to this `
      + 'library (spec §0); restating the form is reproduction');
  }

  // (b) Generic labels: only a finding if one becomes a STEP TITLE, i.e. the tool is structuring
  // itself as the form rather than teaching the method under its own headings.
  const titles = [...html.matchAll(/\btitle:\s*'([^']+)'/g)].map((m) => m[1].toLowerCase());
  assert.ok(titles.length >= 6, `expected the six-step titles, found ${titles.length}`);
  for (const generic of ['warning signs', 'coping strategies', 'reasons for living']) {
    assert.ok(!titles.some((t) => t.includes(generic)),
      `step title "${generic}" mirrors the form's own label — the headings must be original `
      + '(spec §0). Teaching the same method under different headings is the entire design.');
  }

  // (c) The tool must never call ITS OWN content a Stanley-Brown Safety Plan. Naming the form in
  // the official-source link is required, not forbidden — so exclude the route block, which is
  // the one place the product name legitimately appears as a destination.
  const withoutRoute = html.replace(/<div class="route">[\s\S]*?<\/div>/g, '');
  assert.doesNotMatch(withoutRoute, /\byour\s+Stanley[-–—\s]*Brown\b|\bthis\s+Stanley[-–—\s]*Brown\b/i,
    'the tool must never present its own output as a Stanley-Brown Safety Plan');
});
