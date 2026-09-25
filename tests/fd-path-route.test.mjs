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
