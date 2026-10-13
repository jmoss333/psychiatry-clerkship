// The safety drawer's pause (2026-10-10 safety-drawer spec §4.5), extracted from the shell and
// run against a fake DOM, plus the shell contracts that hold it in place.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), 'utf8');
const BEGIN = '/* ---- safety pause (begin) ----';
const END = '/* ---- safety pause (end) ---- */';
const MOUNTS = ['fdChromeMount', 'fdCaptureMount', 'fdDockMount', 'content', 'governanceMount'];
const SPARED = ['routeStatus', 'careNavigatorStatus', 'fdOverlayMount', 'fdNudgeMount'];

function fakeEl() {
  return { attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; } };
}
function fakeMedia(paused) {
  return { paused, calls: 0, pause() { this.paused = true; this.calls += 1; } };
}
function harness() {
  assert.equal(shell.split(BEGIN).length, 2, 'the pause block is marked exactly once');
  const src = shell.slice(shell.indexOf(BEGIN), shell.indexOf(END));
  const els = Object.fromEntries([...MOUNTS, ...SPARED].map((id) => [id, fakeEl()]));
  const posted = [];
  const pageMedia = [fakeMedia(false), fakeMedia(true)];
  const frameMedia = [fakeMedia(false)];
  const frame = { contentWindow: { postMessage: (m) => posted.push(m) }, contentDocument: { querySelectorAll: () => frameMedia } };
  const document = { getElementById: (id) => els[id] || null, querySelectorAll: () => pageMedia };
  const contentEl = { querySelector: (sel) => (sel === 'iframe' ? frame : null) };
  const isSafety = (index, sheet) => sheet === 'kit' || sheet === 'agitation.md';
  // eslint-disable-next-line no-new-func
  const api = new Function('document', 'contentEl', 'FD_INDEX', 'fdSheetIsSafety',
    `${src}\nreturn { fdSyncSafetyPause: fdSyncSafetyPause };`)(document, contentEl, { kit: [] }, isSafety);
  return { api, els, posted, pageMedia, frameMedia };
}

test('opening a safety sheet inerts exactly the five mounts', () => {
  const h = harness();
  h.api.fdSyncSafetyPause({ sheet: 'kit' });
  for (const id of MOUNTS) assert.equal(h.els[id].attrs.inert, '', id);
  for (const id of SPARED) assert.equal('inert' in h.els[id].attrs, false, id);
});

test('it pauses playing media in the page and the tool frame and posts cw-pause once', () => {
  const h = harness();
  h.api.fdSyncSafetyPause({ sheet: 'agitation.md' });
  h.api.fdSyncSafetyPause({ sheet: 'kit' });
  assert.deepEqual(h.pageMedia.map((m) => m.calls), [1, 0], 'only the playing element is paused');
  assert.equal(h.frameMedia[0].calls, 1);
  assert.deepEqual(h.posted, [{ type: 'cw-pause', reason: 'safety' }], 'kit -> protocol is not a second pause');
});

test('closing releases every mount and posts cw-resume, without resuming media', () => {
  const h = harness();
  h.api.fdSyncSafetyPause({ sheet: 'kit' });
  h.api.fdSyncSafetyPause({ sheet: null });
  for (const id of MOUNTS) assert.equal('inert' in h.els[id].attrs, false, id);
  assert.deepEqual(h.posted.map((m) => m.type), ['cw-pause', 'cw-resume']);
  assert.equal(h.pageMedia[0].paused, true, 'media stays paused for the learner to resume');
});

test('settings and item previews pause nothing', () => {
  const h = harness();
  for (const sheet of ['settings', 'item:mse.html']) h.api.fdSyncSafetyPause({ sheet });
  for (const id of MOUNTS) assert.equal('inert' in h.els[id].attrs, false, id);
  assert.deepEqual(h.posted, []);
});

test('the pause syncs before the base view is rebuilt in both render paths', () => {
  for (const name of ['function fdRender(state,detail){', 'function fdRenderTransient(state,detail){']) {
    const body = shell.slice(shell.indexOf(name));
    const sync = body.indexOf('fdSyncSafetyPause(state);');
    const rebuild = body.indexOf('contentEl.innerHTML=');
    assert.ok(sync > 0 && sync < rebuild, `${name} must release inert before a resource mounts`);
  }
});

test('the safety skip control is the first focusable element inside #fdApp', () => {
  assert.match(shell, /<div id="fdApp"[^>]*>\s*<button type="button" class="skip-safety" data-fd-safety>Safety protocols<\/button>/);
  assert.equal(shell.split('class="skip-link"').length, 2, 'the content skip link stays the only .skip-link');
});

test('the draft-tree flag is declared once and forwarded typeof-guarded', () => {
  assert.equal(shell.split('var FD_DRAFT_TREES=false;').length, 2);
  assert.match(shell, /if\(typeof FD_DRAFT_TREES==='boolean'\)out\.draftTrees=FD_DRAFT_TREES;/);
});
