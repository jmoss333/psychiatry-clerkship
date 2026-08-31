// One not-found surface for both ref kinds (Fresh Eyes Audit A4).
//
// Before this, the same mistake produced two different broken states: an unknown ?page= left the
// dead slug in the address bar while the app rendered something else, so a copied URL lied; an
// unknown ?tool= rendered the raw filename as the page title, framed a 404, and showed
// "Review status unavailable—verify with faculty" under it.
//
// The subtle part, and what these tests mostly guard: "not in byRef" does NOT mean "not a real
// page". curriculum.json's libraryExclude registers pages that ship and are reachable but are
// deliberately absent from the Library projection — orientation-video.html, the week*.md pages,
// the rp-* tools. Routing those to a not-found surface would break working links, which is a
// worse defect than the one being fixed.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

// eslint-disable-next-line no-new-func
const F = new Function('governanceBadge', `
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${read('frontdoor/fd_today.js')}
  ${read('frontdoor/fd_reader.js')}
  return { fdBuildIndex: fdBuildIndex, fdReader: fdReader, fdNotFound: fdNotFound };
`)(() => '');

const CUR = readJson('../curriculum.json');
const INDEX = F.fdBuildIndex(
  { ...CUR, path: CUR.learningPaths.ms3, weeks: CUR.learningPaths.ms3.weeks },
  readJson('../topic_meta.json'),
  readJson('../tool_registry.json'),
  readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json'),
);
const render = (ref) => F.fdReader(INDEX, { ref, week: 1, done: {} }, '');

test('an unknown page ref renders the not-found surface, not a raw filename title', () => {
  const html = render('resident_welcome.md');
  assert.match(html, /fd-reader--notfound/);
  assert.match(html, /We couldn’t find that page/);
  assert.doesNotMatch(html, /<h1 class="fd-article__h1">resident_welcome\.md<\/h1>/);
});

test('an unknown tool ref renders the same surface, and frames no 404', () => {
  const html = render('nope.html');
  assert.match(html, /fd-reader--notfound/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /fd-reader--tool/, 'a missing page is not an "Interactive tool"');
});

test('both ref kinds get the SAME surface — one not-found, not two', () => {
  const page = render('resident_welcome.md').replace(/resident_welcome\.md/g, 'REF');
  const tool = render('nope.html').replace(/nope\.html/g, 'REF');
  assert.equal(page, tool);
});

test('the fail-safe governance copy is kept verbatim', () => {
  // Failing closed on review status is correct — the shell cannot vouch for a page it cannot
  // identify. Only the presentation around this line was broken.
  assert.match(render('nope.html'), /Review status unavailable—verify with faculty/);
});

test('the surface names the ref that was requested, so a bad link is diagnosable', () => {
  assert.match(render('nope.html'), /<span class="fd-src">nope\.html<\/span>/);
});

test('the surface offers a way out rather than dead-ending', () => {
  const html = render('nope.html');
  assert.match(html, /data-fd-tab="today"/);
  assert.match(html, /data-fd-tab="library"/);
});

// ---- the guard that matters most: valid-but-unprojected routes must NOT be caught ------------

test('libraryExclude refs are known routes and still render as real pages', () => {
  for (const { ref } of CUR.libraryExclude) {
    assert.equal(INDEX.known[ref], true, `${ref} is a shipped page and must stay known`);
    assert.doesNotMatch(render(ref), /fd-reader--notfound/,
      `${ref} is deliberately absent from the Library projection, not missing`);
  }
});

test('orientation-video.html specifically survives — the case the reader comment warns about', () => {
  assert.doesNotMatch(render('orientation-video.html'), /fd-reader--notfound/);
});

test('every ref the index projects renders as a real page', () => {
  for (const ref of Object.keys(INDEX.byRef)) {
    assert.doesNotMatch(render(ref), /fd-reader--notfound/, `${ref} wrongly reported missing`);
  }
});

test('a bare index with no known set keeps the old degrade-gracefully path', () => {
  // Early boot and older callers pass {byRef:{}}; they must not have every page report missing.
  const html = F.fdReader({ byRef: {}, weeks: [] }, { ref: 'anything.md' }, '');
  assert.doesNotMatch(html, /fd-reader--notfound/);
});

// ---- route level: the half that shipped broken --------------------------------------------
// tests above pin fdReader, which renders the surface correctly. That was not enough: for a .md
// ref the wire layer then fetched content/<ref>, got a 404, replaced the surface with "Page
// unavailable", reported not-ok, and startup threw — so a dead ?page= link bounced to Today while
// a dead ?tool= link (an iframe, mounted synchronously) showed the surface. Verified live on
// production 2026-08-28. These tests pin the ROUTE, so a renderer-only fix cannot pass again.

// eslint-disable-next-line no-new-func
const W = new Function('governanceBadge', `
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${read('frontdoor/fd_today.js')}
  ${read('frontdoor/fd_reader.js')}
  ${read('frontdoor/fd_wire.js')}
  return { fdOpenResource: fdOpenResource };
`)(() => '');

const openRef = async (ref) => {
  const host = { innerHTML: '' };
  let fetched = null;
  const ok = await W.fdOpenResource(ref, {
    index: INDEX,
    state: { tab: 'today', week: 1, done: {} },
    search: '',
    host,
    fetcher: (url) => { fetched = url; return Promise.resolve({ ok: false, status: 404 }); },
    parseMarkdown: (md) => md,
    scrollReset: () => {},
  });
  return { ok, html: host.innerHTML, fetched };
};

test('an unknown page ref never reaches the network', async () => {
  const r = await openRef('nosuchpage.md');
  assert.equal(r.fetched, null, `must not fetch a ref the site does not know (got ${r.fetched})`);
});

test('an unknown page ref renders the not-found surface, not "Page unavailable"', async () => {
  const r = await openRef('nosuchpage.md');
  assert.match(r.html, /fd-reader--notfound/);
  assert.doesNotMatch(r.html, /Page unavailable/);
});

test('an unknown ref reports SUCCESS so startup does not throw and bounce to Today', async () => {
  // fdOpenInitialResource throws on a not-ok receipt; that throw is what sent the learner to
  // Today with no explanation. Showing the surface IS the correct outcome for this input.
  assert.equal((await openRef('nosuchpage.md')).ok, true);
});

test('both ref kinds take the same route-level path', async () => {
  const page = await openRef('nosuchpage.md');
  const tool = await openRef('nope.html');
  assert.equal(page.ok, tool.ok);
  assert.match(tool.html, /fd-reader--notfound/);
  assert.equal(tool.fetched, null);
});

test('a KNOWN page ref still fetches — the guard must not swallow real content', async () => {
  const r = await openRef('welcome.md');
  assert.equal(r.fetched, 'content/welcome.md');
});

test('a known-but-unprojected libraryExclude ref still fetches', async () => {
  // orientation-video.html and friends are real pages; the guard must not strand them.
  const r = await openRef('rotation.md');
  assert.equal(r.fetched, 'content/rotation.md');
});
