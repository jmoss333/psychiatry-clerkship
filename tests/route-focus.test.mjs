import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), 'utf8');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing shell function boundary: ${start}`);
  return source.slice(a, b);
}

function harness() {
  const state = { modal: null, focus: 'search', notice: false };
  const status = { textContent: '' };
  const document = {
    getElementById: id => id === 'routeStatus' ? status : null,
    querySelector: selector => {
      assert.equal(selector, '[role="dialog"][aria-modal="true"]');
      return state.modal;
    },
  };
  const notice = { focus() { state.focus = 'notice'; document.activeElement = notice; } };
  const content = {
    focus() { state.focus = 'content'; },
    querySelector: () => state.notice ? notice : null,
  };
  const location = { pathname: '/', search: '?page=t_mood.md' };
  const functions = new Function('document', 'contentEl', 'location',
    between('var activeRouteIdentity=', 'function setRoute(') +
    between('function focusPendingHighNotice()', 'function afterStartupGate(') +
    ';return { announceRoute, focusPendingHighNotice };')(document, content, location);
  functions.announceRoute({ f: '__home__', t: 'Today' });
  return { ...functions, state, status, location };
}

test('ordinary route completion announces the page and moves focus once', () => {
  const h = harness();
  h.announceRoute({ f: 't_mood.md', t: 'Mood' });
  assert.equal(h.status.textContent, 'Mood loaded');
  assert.equal(h.state.focus, 'content');
  h.state.focus = 'reading-control';
  h.announceRoute({ f: 't_mood.md', t: 'Mood' });
  assert.equal(h.state.focus, 'reading-control');
});

test('a foreground modal keeps focus when a reading completes; the skipped take is not replayed', () => {
  const h = harness();
  h.state.modal = {};
  h.announceRoute({ f: 't_mood.md', t: 'Mood' });
  assert.equal(h.status.textContent, 'Mood loaded');
  assert.equal(h.state.focus, 'search');
  h.state.modal = null;
  h.state.focus = 'restored-invoker';
  h.announceRoute({ f: 't_mood.md', t: 'Mood' });
  assert.equal(h.state.focus, 'restored-invoker');
  h.location.search = '?page=med_monitoring.md';
  h.announceRoute({ f: 'med_monitoring.md', t: 'Medication Monitoring' });
  assert.equal(h.state.focus, 'content', 'a subsequent navigation still owns its focus take');
});

test('parameter-only navigation also respects the current modal', () => {
  const h = harness();
  h.announceRoute({ f: 't_mood.md', t: 'Mood' });
  h.state.focus = 'search';
  h.state.modal = {};
  h.location.search += '&guideFind=mood';
  h.announceRoute({ f: 't_mood.md', t: 'Mood' });
  assert.equal(h.state.focus, 'search');
});

test('pending-high warning focus is retained for ordinary navigation but never escapes a modal', () => {
  const h = harness();
  h.state.notice = true;
  h.state.modal = {};
  assert.equal(h.focusPendingHighNotice(), false);
  assert.equal(h.state.focus, 'search');
  h.state.modal = null;
  assert.equal(h.focusPendingHighNotice(), true);
  assert.equal(h.state.focus, 'notice');
});
