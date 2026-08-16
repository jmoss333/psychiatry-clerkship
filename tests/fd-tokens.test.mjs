// Pins the token contract rather than the pixels. Tasks 3-9 reference token NAMES only, so a
// renamed or dropped token silently breaks a surface that no unit test renders -- this catches it.
// Also pins that every token has a dark counterpart, which is the half of the palette the source
// design does not provide and is therefore the half most likely to be forgotten.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const warm = readFileSync(new URL(`${BUILD}/clinical-warm.css`, import.meta.url), 'utf8');
const fd = readFileSync(new URL(`${BUILD}/frontdoor/frontdoor.css`, import.meta.url), 'utf8');

const TOKENS = [
  'fd-bg', 'fd-surface', 'fd-surface-warm', 'fd-line', 'fd-line-strong', 'fd-line-hover',
  'fd-text', 'fd-text-mid', 'fd-text-dim', 'fd-terracotta', 'fd-terracotta-dark',
  'fd-teal', 'fd-teal-deep', 'fd-teal-wash', 'fd-success', 'fd-danger', 'fd-danger-dark',
  'fd-danger-wash', 'fd-olive', 'fd-selected', 'fd-chip', 'fd-callout',
];

// Comments are stripped before locating a block. clinical-warm.css's file header legitimately
// names the selectors it defines, and a bare indexOf(':root') otherwise matches that prose and
// then walks into the NEXT block -- which would silently read the dark values as the light ones
// and make the "palettes differ" assertion below compare the dark block against itself.
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function block(css, selector) {
  const text = strip(css);
  const i = text.indexOf(selector);
  assert.ok(i !== -1, `no ${selector} block in clinical-warm.css`);
  const open = text.indexOf('{', i);
  const close = text.indexOf('}', open);
  return text.slice(open, close);
}

test('every front-door token is defined in the light palette', () => {
  const light = block(warm, ':root');
  for (const t of TOKENS) assert.match(light, new RegExp(`--${t}\\s*:`), `missing --${t}`);
});

test('every front-door token has a dark counterpart', () => {
  const dark = block(warm, '[data-theme="dark"]');
  for (const t of TOKENS) assert.match(dark, new RegExp(`--${t}\\s*:`), `--${t} has no dark value`);
});

test('the dark palette actually differs from the light one', () => {
  const light = block(warm, ':root');
  const dark = block(warm, '[data-theme="dark"]');
  const grab = (css, t) => (css.match(new RegExp(`--${t}\\s*:\\s*([^;]+);`)) || [])[1];
  // Backgrounds and text must invert; an accidental copy-paste of the light block would pass the
  // presence tests above while shipping an unreadable dark mode.
  for (const t of ['fd-bg', 'fd-surface', 'fd-text']) {
    assert.notEqual(grab(light, t), grab(dark, t), `--${t} is identical in both themes`);
  }
});

test('the light palette is declared before the dark one, or dark never wins', () => {
  // `:root` and `[data-theme="dark"]` have identical specificity (0,1,0) and both match <html>,
  // so source order is the ONLY thing that decides. A light block appended after the dark one
  // would override every dark value and the toggle would render light-on-light.
  const text = strip(warm);
  assert.ok(text.indexOf(':root') < text.indexOf('[data-theme="dark"]'),
    ':root must precede [data-theme="dark"] in clinical-warm.css');
});

test('frontdoor.css references tokens, never raw hex colours', () => {
  const hex = fd.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [],
    `frontdoor.css must use var(--fd-*), found raw hex: ${hex.join(', ')}`);
});

test('every --fd-* frontdoor.css consumes is actually defined in both themes', () => {
  // Broader than the fixed TOKENS list above: it also covers the derived tokens this stylesheet
  // needed beyond the design's 22 (ink-on-accent, elevation, scrim, focus ring). An undefined
  // custom property resolves to nothing, so a typo here paints transparent rather than erroring.
  const referenced = new Set(
    [...fd.matchAll(/var\(\s*(--fd-[a-z0-9-]+)/g)].map((m) => m[1]),
  );
  const declaredLocally = new Set(
    [...fd.matchAll(/(--fd-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
  const light = block(warm, ':root');
  const dark = block(warm, '[data-theme="dark"]');
  for (const name of referenced) {
    if (declaredLocally.has(name)) continue; // scoped to a component, not a palette token
    assert.match(light, new RegExp(`${name}\\s*:`), `${name} used but absent from :root`);
    assert.match(dark, new RegExp(`${name}\\s*:`), `${name} used but absent from the dark block`);
  }
});

test('frontdoor.css carries no audience token', () => {
  assert.doesNotMatch(fd, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});

test('the desktop breakpoint is 1000px, as the design specifies', () => {
  assert.match(fd, /min-width:\s*1000px/,
    'desktop rails appear at >=1000px (design handoff, Global Frame)');
});

test('animations are disabled under prefers-reduced-motion', () => {
  assert.match(fd, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    'the source prototype ships no reduced-motion handling; this repo requires it');
});

test('the article body carries the spec typography, not browser defaults', () => {
  const body = fd.match(/\.fd-article__body\s*\{([^}]*)\}/);
  assert.ok(body, '.fd-article__body must have a rule — marked() output lands there');
  assert.match(body[1], /font-size:\s*16\.5px/, 'spec §5: 16.5px');
  assert.match(body[1], /line-height:\s*1\.72/, 'spec §5: 1.72');
  assert.match(body[1], /max-width:\s*62ch/, 'spec §5: 62ch measure');
});

// Comments stripped before rule-parsing, same reasoning as strip()/block() above: a comment
// mentioning a selector by name must not be mistaken for the rule itself.
const fdStripped = strip(fd);

// Concatenated declaration bodies of every rule whose comma-separated selector list contains
// `selector` as an EXACT entry -- not a prefix match. Fix round 2 of the Task 2 review found that
// a prefix regex (`\.fd-article__body\s+table\b`) matches ANY rule sharing that prefix, including
// an unrelated sibling rule added in the SAME commit (`.fd-article__body table:last-child`):
// deleting the rule that actually carries the styling left the old assertion green, because the
// decoy sibling still matched the prefix. Concatenating every exact-match rule's body (rather than
// returning just the first) also closes the th/td case, where the real declarations are split
// across a shared rule (`.fd-article__body th,.fd-article__body td{...}`) and a tag-specific one
// -- either can be deleted independently of the other, so both must contribute to what gets
// asserted on. Verified against the live file: table/th/td/li/blockquote all currently carry a
// sibling or split-declaration rule that a naive prefix match cannot tell apart from the real one.
function fdRuleBody(selector) {
  const bodies = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(fdStripped))) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (selectors.includes(selector)) bodies.push(m[2]);
  }
  return bodies.join(' ');
}

test('article body descendants are styled, not left to the browser', () => {
  for (const sel of ['h2', 'h3', 'ul', 'ol', 'a', 'code']) {
    assert.notEqual(fdRuleBody(`.fd-article__body ${sel}`), '',
      `.fd-article__body ${sel} needs a rule — marked() emits it`);
  }
  // li and blockquote each have a `:last-child` sibling rule in this same section. Exact-selector
  // matching (see fdRuleBody above) is what stops that sibling from standing in for the real rule;
  // asserting on the declared property below is what stops the real rule's actual styling from
  // being silently gutted while its selector — and so the exact match — still survives.
  assert.match(fdRuleBody('.fd-article__body li'), /margin:/,
    '.fd-article__body li needs list-item spacing');
  assert.match(fdRuleBody('.fd-article__body blockquote'), /border-left:/,
    '.fd-article__body blockquote needs its callout treatment');
});

// Fix round 2 of the Task 2 review. The round-1 version of this test matched a selector PREFIX
// against the raw file text (`\.fd-article__body\s+table\b`), so it passed as long as ANY rule
// started with that text — including the decoy `table:last-child` sibling added in the SAME
// commit as the real rule, and independently of th/td's declarations being split across two
// rules. Deleting the one line this fix round exists for (`display:block;overflow-x:auto`) left
// the old test green. See task-2-report.md for the delete/fail/restore/pass transcript proving
// the assertions below actually discriminate. Colours/tokens are unaffected — CSS unchanged.
test('article body table scrolls instead of overflowing the viewport at any breakpoint', () => {
  const table = fdRuleBody('.fd-article__body table');
  assert.notEqual(table, '', '.fd-article__body table needs its own rule (not just table:last-child)');
  assert.match(table, /display:\s*block/,
    'a wide table must not push the 62ch-capped article past the viewport at any breakpoint');
  assert.match(table, /overflow-x:\s*auto/,
    'the overflow-safety measure this fix round exists for — 17/67 shipped pages carry a table');
});

test('article body table cells carry padding and a border, not left to the browser', () => {
  const th = fdRuleBody('.fd-article__body th');
  assert.match(th, /padding:/, '.fd-article__body th needs cell padding');
  assert.match(th, /border-bottom:/, '.fd-article__body th needs a cell border');
  assert.match(th, /font-weight:/, '.fd-article__body th needs header emphasis');
  const td = fdRuleBody('.fd-article__body td');
  assert.match(td, /padding:/, '.fd-article__body td needs cell padding');
  assert.match(td, /border-bottom:/, '.fd-article__body td needs a cell border');
  assert.match(td, /color:/, '.fd-article__body td needs its own text colour');
});

test('article body hr is styled, not a bare rule', () => {
  assert.match(fdRuleBody('.fd-article__body hr'), /border-top:/,
    '.fd-article__body hr needs the hairline rule treatment — 5/67 shipped pages carry one');
});
