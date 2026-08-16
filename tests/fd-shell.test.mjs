// The keyboard map is the part worth testing hardest: it is pure decision logic with six
// interacting conditions, and every one of its branches is a real usability bug when wrong
// (typing "1" in the search box must not switch tabs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_shell.js')}
  return { fdHeader: fdHeader, fdTabs: fdTabs, fdSetupRole: fdSetupRole,
           fdSetupWeek: fdSetupWeek, fdKeyAction: fdKeyAction };
`);
const F = make();

const OPTS = { typing: false, screen: 'app', searchOpen: false, sheetOpen: false, reading: false };
const o = (over) => Object.assign({}, OPTS, over);

// ---- keyboard map ----------------------------------------------------------------

test('slash and cmd-k open search', () => {
  assert.deepEqual(F.fdKeyAction('/', o()), { type: 'search' });
  assert.deepEqual(F.fdKeyAction('k', o({ meta: true })), { type: 'search' });
});

test('no shortcut fires while typing in an input', () => {
  for (const k of ['/', '1', '2', '3', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(F.fdKeyAction(k, o({ typing: true })), null, `${k} fired while typing`);
  }
});

test('escape closes search first, then the sheet', () => {
  assert.deepEqual(F.fdKeyAction('Escape', o({ searchOpen: true, sheetOpen: true })), { type: 'close' });
  assert.deepEqual(F.fdKeyAction('Escape', o({ sheetOpen: true })), { type: 'close' });
  assert.equal(F.fdKeyAction('Escape', o()), null, 'escape with nothing open does nothing');
});

test('1/2/3 switch tabs only when nothing is layered above the page', () => {
  assert.deepEqual(F.fdKeyAction('1', o()), { type: 'tab', tab: 'today' });
  assert.deepEqual(F.fdKeyAction('2', o()), { type: 'tab', tab: 'path' });
  assert.deepEqual(F.fdKeyAction('3', o()), { type: 'tab', tab: 'library' });
  assert.equal(F.fdKeyAction('1', o({ searchOpen: true })), null);
  assert.equal(F.fdKeyAction('1', o({ sheetOpen: true })), null);
});

test('arrows move between items only while reading', () => {
  assert.deepEqual(F.fdKeyAction('ArrowLeft', o({ reading: true })), { type: 'nav', dir: -1 });
  assert.deepEqual(F.fdKeyAction('ArrowRight', o({ reading: true })), { type: 'nav', dir: 1 });
  assert.equal(F.fdKeyAction('ArrowLeft', o()), null, 'arrows do nothing outside the reader');
});

test('no shortcut fires during first-run setup except nothing at all', () => {
  for (const k of ['/', '1', 'ArrowLeft']) {
    assert.equal(F.fdKeyAction(k, o({ screen: 'setup' })), null, `${k} fired during setup`);
  }
});

// ---- renderers -------------------------------------------------------------------

test('the active tab is marked for both CSS and assistive tech', () => {
  const html = F.fdTabs('path');
  assert.match(html, /class="[^"]*fd-tab[^"]*is-active[^"]*"[^>]*data-fd-tab="path"/);
  assert.match(html, /aria-current="page"/);
  assert.equal((html.match(/is-active/g) || []).length, 1, 'exactly one tab is active');
});

test('the header renders the safety button and the week pill', () => {
  const html = F.fdHeader({ week: 4 });
  assert.match(html, /data-fd-safety/);
  assert.match(html, /Week 4/);
});

test('the header says exam, never the site-specific word', () => {
  assert.doesNotMatch(F.fdHeader({ week: 6 }), /MS3|clerkship|student|shelf|resident/i);
});

test('role and week choices are addressable by the delegated click handler', () => {
  const roles = F.fdSetupRole([{ id: 'ms3', name: 'Student', desc: 'd', hint: 'most common' }]);
  assert.match(roles, /data-fd-role="ms3"/);
  const weeks = F.fdSetupWeek([{ n: 1, title: 'Foundations', theme: 't' }], 'Student');
  assert.match(weeks, /data-fd-week="1"/);
  assert.match(weeks, /data-fd-week="0"/, 'the browse option must be addressable too');
});

test('user-supplied text is escaped in every renderer', () => {
  const evil = '<img src=x onerror=1>';
  assert.doesNotMatch(F.fdSetupRole([{ id: 'x', name: evil, desc: evil, hint: '' }]), /<img/);
  assert.doesNotMatch(F.fdSetupWeek([{ n: 1, title: evil, theme: evil }], evil), /<img/);
});
