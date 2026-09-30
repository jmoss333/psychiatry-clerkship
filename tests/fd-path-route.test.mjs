import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const css = read('frontdoor/frontdoor.css');
const wire = read('frontdoor/fd_wire.js');

test('Path route CSS has a neutral desktop curve and a phone vertical rail', () => {
  assert.match(css, /\.fd-pathroute__connector\{[^}]*fill:none;[^}]*stroke:var\(--fd-line-strong\)/);
  assert.match(css, /\.fd-pathroute__weeks\{[^}]*display:grid/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.fd-pathroute__curve\{display:none\}/);
  assert.match(css, /\.fd-pathroute__weeks::before\{[^}]*background:var\(--fd-line-strong\)/);
  assert.match(css, /\.fd-pathroute__weeks::before\{[^}]*z-index:0/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row\{[^}]*z-index:1/);
  assert.doesNotMatch(css, /fd-pathroute__connector--(?:active|progress|selected|done)/);
});

test('Path tabs retain visible non-colour selected, current, complete, and focus states', () => {
  assert.match(css, /\.fd-pathroute \.fd-timeline__row\.is-sel/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__status/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row:focus-visible/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row\{[^}]*min-height:var\(--fd-target-touch\)/);
});

test('the controller handles route arrow keys and restores the rebuilt week control', () => {
  assert.match(wire, /function pathKeyHandler\(event\)/);
  assert.match(wire, /fdPathMoveWeek\(index,state\.viewWeek,event\.key\)/);
  assert.match(wire, /hasAttribute\('data-fd-view-week'\)/);
  assert.match(wire, /equivalentControl\(target,root\)/);
  assert.match(wire, /listen\(root,'keydown',pathKeyHandler,false\)/);
});

const pathJs = read('frontdoor/fd_path.js');
const jsNum = (name) => Number(pathJs.match(new RegExp(name + '=(\\d+)'))[1]);
const cssNum = (name) => Number(css.match(new RegExp('--' + name + ':(\\d+)px'))[1]);

test('CSS stop heights and band equal the JS geometry that draws the road', () => {
  assert.equal(cssNum('fd-path-band'), jsNum('FD_PATH_BAND'));
  assert.equal(cssNum('fd-path-y-low'), jsNum('FD_PATH_Y_LOW'));
  assert.equal(cssNum('fd-path-y-high'), jsNum('FD_PATH_Y_HIGH'));
});

test('the road is sized to the weeks grid and the stops are not translated', () => {
  assert.match(css, /\.fd-pathroute__connector\{[^}]*vector-effect:non-scaling-stroke/);
  assert.match(css, /\.fd-pathroute__weeks\{[^}]*gap:0/);
  assert.match(css, /\.fd-pathroute__curve\{[^}]*height:var\(--fd-path-band\)/);
  assert.doesNotMatch(css, /\.fd-pathroute \.fd-timeline__row:nth-child\(\d\)\{transform/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row:nth-child\(even\)\{--fd-path-y:var\(--fd-path-y-high\)\}/);
});

test('every stop shows its theme and its ring; current is a flag, not a side dot', () => {
  assert.doesNotMatch(css, /\.fd-pathroute \.fd-timeline__theme\{[^}]*display:none/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__number\{[^}]*conic-gradient\(var\(--fd-teal\) var\(--fd-ring-pct\)/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row\[aria-current="step"\] \.fd-timeline__status\{[^}]*position:absolute/);
});

test('the desktop selected-tab bar does not follow the stop onto the phone rail', () => {
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.fd-pathroute \.fd-timeline__row\.is-sel::after\{display:none\}/);
});

test('forced-colors mode keeps every node outlined and the selected week marked', () => {
  const fc = css.match(/@media \(forced-colors:active\)\{([\s\S]*?)\n\}/);
  assert.ok(fc, 'a forced-colors block exists');
  assert.match(fc[1], /\.fd-pathroute \.fd-timeline__number\{[^}]*border:2px solid CanvasText/);
  assert.match(fc[1], /\.fd-pathroute \.fd-timeline__number\{[^}]*background:Canvas[;}]/, 'the road must not show through the node');
  assert.match(fc[1], /\.fd-pathroute \.fd-timeline__row\.is-sel \.fd-timeline__number\{[^}]*outline:3px solid Highlight/);
});

test('the selected and hovered wash starts below the road band, so the road never breaks', () => {
  assert.match(css, /\.fd-pathroute \.fd-timeline__row:hover\{background:linear-gradient\(transparent var\(--fd-path-band\),var\(--fd-callout\) 0\)\}/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row\.is-sel\{background:linear-gradient\(transparent var\(--fd-path-band\),var\(--fd-selected\) 0\)\}/);
});
