// The Front Door's self-hosted display face (2026-10-01): Source Serif 4, latin subset, variable
// optical size, weights 600-700 only. Two failure modes are pinned here because neither shows up
// as a red test anywhere else: a rule asking for a lighter weight would silently render semibold
// (the browser matches the nearest weight the face has), and a face that is declared but not
// shipped (or shipped without its licence) just falls back to Georgia with no error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const BUILD = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const css = readFileSync(new URL('frontdoor/frontdoor.css', BUILD), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const deploy = readFileSync(new URL('build_deploy.py', BUILD), 'utf8');
const FONT = 'source-serif-4-latin-opsz-wght600-700.woff2';
const LICENCE = 'source-serif-4-OFL.txt';

test('the face is declared once, self-hosted, swap, and limited to weights 600-700', () => {
  const faces = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 1);
  assert.match(faces[0], /font-family:'Source Serif 4'/);
  assert.match(faces[0], /font-weight:600 700/);
  assert.match(faces[0], /font-display:swap/);
  assert.match(faces[0], new RegExp(`src:url\\('fonts/${FONT.replace(/\./g, '\\.')}'\\) format\\('woff2'\\)`));
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/, 'never a third-party font host');
});

test('every rule that names the face asks for 600+ or is a bold-by-default heading, with Georgia behind it', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*'Source Serif 4'[^{}]*)\}/g)]
    .filter((m) => !/@font-face/.test(m[1]));
  assert.ok(rules.length >= 10, `expected the heading rules, found ${rules.length}`);
  for (const [, selector, body] of rules) {
    const sel = selector.trim();
    assert.match(body, /font-family:'Source Serif 4',Georgia,/, `${sel}: Georgia is the fallback`);
    const w = body.match(/font-weight:(\d+)/);
    if (w) assert.ok(Number(w[1]) >= 600, `${sel} asks for weight ${w[1]}, which the face does not have`);
    else assert.match(sel, /(^|[\s,>])h[1-3]\b|\.fd-pilot__title$/, `${sel}: no weight set, so it must be a bold-by-default heading`);
  }
});

test('the font and its OFL licence are committed and the build copies both', () => {
  for (const name of [FONT, LICENCE]) {
    const file = new URL(`fonts/${name}`, BUILD);
    assert.ok(existsSync(file), `${name} is committed`);
    assert.ok(statSync(file).size > 1000, `${name} is real content, not a stub`);
    assert.match(deploy, new RegExp(name.replace(/\./g, '\\.')), `build_deploy.py copies ${name}`);
  }
  assert.match(readFileSync(new URL(`fonts/${LICENCE}`, BUILD), 'utf8'), /SIL Open Font License, Version 1\.1/);
  assert.equal(readFileSync(new URL(`fonts/${FONT}`, BUILD)).subarray(0, 4).toString('latin1'), 'wOF2');
});
