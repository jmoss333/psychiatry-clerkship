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
const inventory = readFileSync(new URL('../docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md', import.meta.url), 'utf8');

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

function rule(css, selector) {
  return block(css, selector);
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

test('reader body gives rendered long-form content a readable token-based type scale', () => {
  const body = rule(fd, '.fd-article__body');
  assert.match(body, /font-size:\s*16\.5px/);
  assert.match(body, /line-height:\s*1\.72/);
  assert.match(body, /max-width:\s*62ch/);
  assert.match(body, /color:\s*var\(--fd-text\)/);
  for (const descendant of ['h2', 'h3', 'ul', 'ol', 'li', 'a', 'code', 'blockquote']) {
    const descendantRule = rule(fd, `.fd-article__body ${descendant}`);
    assert.match(descendantRule, /\S/, `rendered article ${descendant} elements need a non-empty treatment`);
  }
  assert.match(rule(fd, '.fd-article__body h2'), /font-family:|font-size:|line-height:/,
    'section headings need representative typography rather than an empty selector');
  assert.match(rule(fd, '.fd-article__body a'), /color:\s*var\(--fd-/,
    'article links must retain a token-based visible treatment');
  assert.match(rule(fd, '.fd-article__body code'), /font-family:|background:\s*var\(--fd-/,
    'inline code needs a readable typography or token-based surface treatment');
});

test('portalled overlays retain a visible keyboard focus indicator', () => {
  const focus = rule(fd, '.fd-search :focus-visible,.fd-sheet :focus-visible,.fd-nudge :focus-visible');
  assert.match(focus, /outline:\s*2px solid var\(--fd-focus\)/,
    'overlays may mount outside .fd-shell and need their own visible outline');
  assert.match(focus, /outline-offset:\s*2px/,
    'overlay focus needs separation from the control edge');
});

test('the class inventory documents the exact distinct front-door selector count', () => {
  const selectorNames = new Set(
    [...strip(fd).matchAll(/\.((?:fd-[A-Za-z0-9_-]+))/g)].map((m) => m[1]),
  );
  const documented = inventory.match(/\((\d+) distinct `fd-\*` selector names,/);
  assert.ok(documented, 'CLASS-INVENTORY must state the distinct fd-* selector count');
  assert.equal(Number(documented[1]), selectorNames.size,
    'CLASS-INVENTORY must stay synchronized with comment-stripped frontdoor.css selectors');
});
