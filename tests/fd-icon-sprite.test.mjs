/* icon_sprite.py (C1): vendored Lucide subset -> one hidden <symbol> sprite in the shell index.
   Deterministic output, verified single-marker injection, and the wiring order in build_deploy.py.
   Built-output assertions run only against a fresh _build/ (tests/_build_freshness.mjs). */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { staleBuildReason } from './_build_freshness.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB = path.join(REPO, '13_Faculty_Resources/_automation/site_build');
const SCRIPT = path.join(SB, 'icon_sprite.py');
const ICONS_JSON = path.join(SB, 'vendor/lucide-static-1.54.0.icons.json');
const vendor = JSON.parse(readFileSync(ICONS_JSON, 'utf8'));

// Re-pin only after re-running vendor/lucide_subset.py (docstring) and reviewing the JSON diff.
const ICONS_JSON_SHA256 = '6243cc123b500c276e449462c92881ec796cc02bf9f8a893d230060db0d26967';
// Re-pin when the JSON or icon_sprite.py's markup changes: `python3 icon_sprite.py --sha256`.
const SPRITE_SHA256 = 'df77230a0bd448bfece9a5834255300c9accdb735d533ad36beb0f55f13a8539';

function render() {
  const r = spawnSync('python3', [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('vendored icons JSON bytes are pinned', () => {
  assert.equal(createHash('sha256').update(readFileSync(ICONS_JSON)).digest('hex'), ICONS_JSON_SHA256);
});

test('the sprite generator is deterministic and its output is pinned', () => {
  const a = render();
  const b = render();
  assert.equal(a, b, 'two runs over the same JSON must emit identical bytes');
  assert.equal(createHash('sha256').update(a).digest('hex'), SPRITE_SHA256);
});

test('sprite: one <symbol id="ic-NAME" viewBox="0 0 24 24"> per glyph, in sorted order, bodies verbatim', () => {
  const sprite = render();
  const ids = [...sprite.matchAll(/<symbol id="ic-([a-z0-9-]+)" viewBox="0 0 24 24">/g)].map((m) => m[1]);
  const names = Object.keys(vendor.icons).sort();
  assert.deepEqual(ids, names);
  for (const name of names) {
    assert.ok(sprite.includes(`<symbol id="ic-${name}" viewBox="0 0 24 24">${vendor.icons[name].body}</symbol>`), name);
  }
});

test('sprite is hidden, inert and colour-free (visible-neutral by construction)', () => {
  const sprite = render();
  assert.match(sprite, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" id="fd-icon-sprite" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">/);
  assert.ok(sprite.endsWith('</svg>'));
  assert.doesNotMatch(sprite, /<script|\son[a-z]+=|<title|<text|#[0-9a-fA-F]{3,6}\b|<use/);
  assert.equal((sprite.match(/<svg/g) || []).length, 1);
  assert.match(sprite, /<!--\nIcons: lucide-static@1\.54\.0 /);
  assert.match(sprite, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
  assert.match(sprite, /Copyright \(c\) 2013-present Cole Bemis/);
});

test('the shell carries the sprite marker exactly once, right after <body>', () => {
  const shell = readFileSync(path.join(SB, 'spa_index.html'), 'utf8');
  assert.equal(shell.split('<!--fd-icon-sprite-->').length - 1, 1);
  assert.match(shell, /<body>\n<!--fd-icon-sprite-->\n<a class="skip-link" href="#content">/);
  assert.doesNotMatch(shell, /id="fd-icon-sprite"/, 'the source shell carries the marker, never the sprite');
});

test('build_deploy.py injects the sprite after the snippet pass and before the page contract', () => {
  const build = readFileSync(path.join(SB, 'build_deploy.py'), 'utf8');
  const pass = build.indexOf('common.apply_full_page_pass(OUT');
  const inject = build.indexOf('_icon_sprite.inject_sprite_file(OUT+"/index.html")');
  const contract = build.indexOf('common.assert_page_contract(OUT, label="ms3")');
  assert.ok(pass > -1 && inject > -1 && contract > -1);
  assert.ok(pass < inject && inject < contract);
  assert.equal(build.split('inject_sprite_file(').length - 1, 1);
  // The resident build rebrands the MS3-built index; it must not inject a second sprite.
  const resident = readFileSync(path.join(SB, 'resident_section.py'), 'utf8');
  assert.doesNotMatch(resident, /inject_sprite_file|fd-icon-sprite/);
});

for (const site of ['ms3', 'res']) {
  test(`built ${site} shell carries exactly the generated sprite, and nothing references it yet`, (t) => {
    const stale = staleBuildReason(REPO, site, [
      ICONS_JSON, SCRIPT, path.join(SB, 'spa_index.html'), path.join(SB, 'build_deploy.py'),
      path.join(SB, 'frontdoor/fd_icons.js'),
    ]);
    if (stale) { t.skip(stale); return; }
    const index = readFileSync(path.join(REPO, '_build', site, 'index.html'), 'utf8');
    const sprite = render();
    assert.equal(index.split(sprite).length - 1, 1, 'the sprite bytes appear exactly once');
    assert.equal(index.split('id="fd-icon-sprite"').length - 1, 1);
    assert.doesNotMatch(index, /<!--fd-icon-sprite-->|\/\*__FD_ICONS__\*\//);
    assert.match(index, /function fdIcon\(name, opts\)\{/);
    // fdIcon's own source contains `href="#ic-'+...`; a real reference names an id.
    assert.doesNotMatch(index, /href="#ic-[a-z0-9]/, 'C1 adopts no icon: no <use> may point at the sprite');
  });
}
