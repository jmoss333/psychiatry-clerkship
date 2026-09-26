// The Progress page draws its bars ("Mastery by blueprint", "Coverage by section", the confidence
// calibration rows and the placement result via masteryBarsHtml) as
// `<span class="track"><span class="fill" style="width:NN%"></span></span>` inside a flex `.brow`.
// The flex container blockifies `.track` (a direct flex item), but `.fill` is nested one level
// deeper and stays INLINE unless the stylesheet says otherwise -- and an inline non-replaced
// element ignores both `width` and `height`. Verified on production 2026-09-26: every
// `.hm-bars .fill` computed display:inline with a 0x0 box while the label beside it read "Mood 77%".
// Present since the baseline commit; no test had ever measured the rendered fill.
//
// This pins the file-level half: the two rules must declare a block display so neither depends on
// the flex context surviving. tests/smoke/front-door.spec.js measures the resolved box in a
// browser, which is the only place the cascade actually exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPA = path.join(ROOT, '13_Faculty_Resources', '_automation', 'site_build', 'spa_index.html');
const shell = fs.readFileSync(SPA, 'utf8');

// The shell carries more than one inline <style> block (the bar rules sit in the second), so the
// contract is over all of them: a rule that moved between blocks must still be found.
function shellStylesheets() {
  const blocks = [];
  const re = /<style>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(shell))) blocks.push(m[1]);
  assert.ok(blocks.length >= 2, `spa_index.html carries its inline stylesheets (found ${blocks.length})`);
  return blocks.join('\n');
}

function rule(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(?:^|[}\\s])' + esc + '\\{([^}]*)\\}'));
  assert.ok(m, `the shell stylesheet declares ${selector}`);
  return m[1];
}

test('the bar markup nests an inline fill inside the flex-item track', () => {
  // The reason the display rule is load-bearing. If the emitters ever change shape, revisit the
  // rule rather than deleting this assertion: a <div> fill would not need it, a <span> does.
  const emitters = shell.match(/<span class="track"><span class="fill" style="width:/g) || [];
  assert.ok(emitters.length >= 3,
    `expected the mastery, coverage and calibration emitters (found ${emitters.length})`);
  assert.match(rule(shellStylesheets(), '.hm-bars .brow'), /display:flex/,
    'the row is a flex container, which is what blockifies .track and nothing below it');
});

test('.hm-bars .fill declares a block display so its width and height apply', () => {
  const body = rule(shellStylesheets(), '.hm-bars .fill');
  assert.match(body, /(?:^|;)display:block(?:;|$)/,
    `.hm-bars .fill must set display:block (an inline span ignores width/height); got {${body}}`);
  assert.match(body, /height:100%/, 'the fill still takes the full track height');
});

// The score column was `flex:0 0 42px`: wide enough for "72%", not for "50% · few", "not started"
// or a calibration row's "100% · 12", all of which wrapped onto two lines (62px is the widest at
// the 12px xs font). The basis stays FIXED rather than auto so every row's track starts at the
// same x; it is em-based so it follows the font token, with headroom for CI's Linux fallback font.
test('.hm-bars .pc reserves one line for its widest label', () => {
  const body = rule(shellStylesheets(), '.hm-bars .pc');
  assert.match(body, /(?:^|;)white-space:nowrap(?:;|$)/,
    `.hm-bars .pc must not wrap its label; got {${body}}`);
  const basis = body.match(/(?:^|;)flex:0 0 (\d+(?:\.\d+)?)(em|px)(?:;|$)/);
  assert.ok(basis, `.hm-bars .pc keeps a fixed flex basis so the tracks stay aligned; got {${body}}`);
  const px = basis[2] === 'em' ? Number(basis[1]) * 12 : Number(basis[1]);
  assert.ok(px >= 68, `.hm-bars .pc basis must clear "not started" (62px at 12px) with headroom; got ${px}px`);
});

test('.hm-bars .track declares a block display rather than relying on flex blockification', () => {
  const body = rule(shellStylesheets(), '.hm-bars .track');
  assert.match(body, /(?:^|;)display:block(?:;|$)/,
    `.hm-bars .track must set display:block explicitly; got {${body}}`);
  assert.match(body, /overflow:hidden/, 'the track still clips the fill to its rounded ends');
});
