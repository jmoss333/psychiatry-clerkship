import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wire = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), 'utf8');

function make(overrides = {}) {
  const globals = {
    toolExtraFromParams(sp) {
      let out = '';
      sp.forEach((value, key) => {
        if (!['tool', 'page', 'tab'].includes(key)) {
          out += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        }
      });
      return out;
    },
    toolFrameSuffixWithGovernance(extra) {
      const params = new URLSearchParams(String(extra || '').replace(/^&/, ''));
      params.set('governed', '1');
      return `?${params.toString()}`;
    },
    ...overrides,
  };
  // eslint-disable-next-line no-new-func
  return new Function('g', `
    var toolExtraFromParams=g.toolExtraFromParams;
    var toolFrameSuffixWithGovernance=g.toolFrameSuffixWithGovernance;
    var facultyPreviewRequest=g.facultyPreviewRequest;
    var show=g.show;
    ${wire}
    return { fdResourceRequest: fdResourceRequest, fdOpenResource: fdOpenResource, fdWire: fdWire };
  `)(globals);
}

test('markdown resources request content/<slug> with no iframe suffix', () => {
  assert.deepEqual(make().fdResourceRequest('interview.md', '?page=interview.md'), {
    kind: 'read', url: 'content/interview.md', frameSuffix: '', toolExtra: '',
  });
});

test('tool resources preserve case, scenario, resume, and exact faculty-preview parameters', () => {
  const search = '?tool=practice.html&case=A%201&scenario=s2&resume=1' +
    '&reviewItem=q-7&reviewKey=question%3Aq-7&reviewToken=0123456789abcdef0123456789abcdef';
  const req = make().fdResourceRequest('practice.html', search);
  assert.equal(req.kind, 'tool');
  assert.equal(req.url, 'tools/practice.html');
  const params = new URLSearchParams(req.frameSuffix);
  assert.equal(params.get('case'), 'A 1');
  assert.equal(params.get('scenario'), 's2');
  assert.equal(params.get('resume'), '1');
  assert.equal(params.get('reviewItem'), 'q-7');
  assert.equal(params.get('reviewKey'), 'question:q-7');
  assert.equal(params.get('reviewToken'), '0123456789abcdef0123456789abcdef');
  assert.equal(params.get('governed'), '1');
  assert.equal(params.has('tool'), false);
});

test('fdOpenResource fetches markdown, parses it, and renders the Reader', async () => {
  const calls = [];
  const host = { innerHTML: '' };
  const item = { ref: 'page.md', kind: 'read', title: 'Page' };
  const index = { byRef: { 'page.md': item }, weeks: [] };
  const F = make();
  const result = await F.fdOpenResource('page.md', {
    index, state: { tab: 'today', week: 1, done: {} }, host,
    fetcher: async (url) => { calls.push(['fetch', url]); return { ok: true, text: async () => 'Body' }; },
    parseMarkdown: (text) => { calls.push(['parse', text]); return '<p>Body</p>'; },
    governanceNotice: (legacy) => { calls.push(['governance', legacy.f]); return '<div>reviewed</div>'; },
    renderReader: (_index, readerState, body) => {
      calls.push(['reader', readerState.ref, body]);
      return `<article>${body}</article>`;
    },
    facultyPreviewMatches: () => true,
  });
  assert.equal(result, true);
  assert.equal(host.innerHTML, '<article><div>reviewed</div><p>Body</p></article>');
  assert.deepEqual(calls, [
    ['fetch', 'content/page.md'], ['parse', 'Body'], ['governance', 'page.md'],
    ['reader', 'page.md', '<div>reviewed</div><p>Body</p>'],
  ]);
});

test('delayed markdown resolves fresh reviewed and pending notices immediately before Reader mount', async () => {
  const freshNotices = [
    '<div class="governance-notice reviewed-receipt">Reviewed by faculty · 2026-08-17</div>',
    '<section class="governance-notice pending-high" role="alert">Pending faculty review</section>',
    '<div class="governance-notice pending-compact" role="status">Pending faculty review</div>',
  ];
  for (const freshNotice of freshNotices) {
    let resolveText;
    let governanceState = 'loading';
    const host = { innerHTML: '' };
    const notices = [];
    const pending = make().fdOpenResource('page.md', {
      index: {
        byRef: { 'page.md': { ref: 'page.md', kind: 'read', title: 'Page' } }, weeks: [],
      },
      state: { tab: 'library' }, host,
      fetcher: async () => ({
        ok: true,
        text: () => new Promise((resolve) => { resolveText = resolve; }),
      }),
      parseMarkdown: text => `<p>${text}</p>`,
      governanceNotice: () => {
        const notice = governanceState === 'ready'
          ? freshNotice
          : '<div class="governance-notice unavailable">Review status unavailable</div>';
        notices.push(notice);
        return notice;
      },
      renderReader: (_index, _state, body) => `<article>${body}</article>`,
      facultyPreviewMatches: () => true,
    });

    while (!resolveText) await Promise.resolve();
    governanceState = 'ready';
    resolveText('Body');
    assert.equal(await pending, true);
    assert.ok(host.innerHTML.includes(freshNotice));
    assert.doesNotMatch(host.innerHTML, /governance-notice unavailable/);
    assert.equal(notices.at(-1), freshNotice);
  }
});

test('a truly unavailable governance notice remains visible when the Reader mounts', async () => {
  const host = { innerHTML: '' };
  await make().fdOpenResource('page.md', {
    index: {
      byRef: { 'page.md': { ref: 'page.md', kind: 'read', title: 'Page' } }, weeks: [],
    },
    state: { tab: 'library' }, host,
    fetcher: async () => ({ ok: true, text: async () => 'Body' }),
    parseMarkdown: text => `<p>${text}</p>`,
    governanceNotice: () => '<div class="governance-notice unavailable">Review status unavailable</div>',
    renderReader: (_index, _state, body) => `<article>${body}</article>`,
    facultyPreviewMatches: () => true,
  });
  assert.match(host.innerHTML, /governance-notice unavailable/);
  assert.match(host.innerHTML, /<p>Body<\/p>/);
});

test('fdOpenResource strips only the leading source H1 so Reader owns the single title path', async () => {
  const host = { innerHTML: '' };
  const parsed = [];
  await make().fdOpenResource('page.md', {
    index: {
      byRef: { 'page.md': { ref: 'page.md', kind: 'read', title: 'Manifest Title' } }, weeks: [],
    },
    state: { tab: 'today' }, host,
    fetcher: async () => ({
      ok: true,
      text: async () => '# Source Heading\nIntro stays.\n\n## Subsequent heading\nBody stays.',
    }),
    parseMarkdown: (markdown) => {
      parsed.push(markdown);
      return markdown.replace(/^# (.*)$/gm, '<h1>$1</h1>')
        .replace(/^## (.*)$/gm, '<h2>$1</h2>')
        .replace(/^(Intro stays\.|Body stays\.)$/gm, '<p>$1</p>');
    },
    governanceNotice: () => '',
    renderReader: (_index, _state, body) => `<article><h1>Manifest Title</h1>${body}</article>`,
    facultyPreviewMatches: () => true,
  });
  assert.equal((host.innerHTML.match(/<h1>/g) || []).length, 1);
  assert.match(host.innerHTML, /<h1>Manifest Title<\/h1>/);
  assert.match(host.innerHTML, /<h2>Subsequent heading<\/h2>/);
  assert.match(host.innerHTML, /Intro stays\./);
  assert.match(host.innerHTML, /Body stays\./);
  assert.equal(parsed[0], 'Intro stays.\n\n## Subsequent heading\nBody stays.');
});

test('a late markdown response cannot overwrite a newer navigation generation', async () => {
  let resolveText;
  let current = 'old.md';
  const host = { innerHTML: '' };
  const F = make();
  const old = F.fdOpenResource('old.md', {
    index: { byRef: { 'old.md': { ref: 'old.md', kind: 'read', title: 'Old' } }, weeks: [] },
    state: {}, host,
    fetcher: async () => ({
      ok: true, text: () => new Promise((resolve) => { resolveText = resolve; }),
    }),
    parseMarkdown: (markdown) => `<p>${markdown}</p>`, governanceNotice: () => '',
    renderReader: (_index, _state, body) => body, facultyPreviewMatches: () => true,
    isCurrent: () => current === 'old.md',
  });
  while (!resolveText) await Promise.resolve();
  current = 'new.md';
  host.innerHTML = '<p>new route</p>';
  resolveText('late old route');
  assert.equal(await old, false);
  assert.equal(host.innerHTML, '<p>new route</p>');
});

test('tools render the governed iframe through the Reader with preserved query state', async () => {
  const host = { innerHTML: '' };
  const item = { ref: 'practice.html', kind: 'tool', title: 'Practice' };
  const index = { byRef: { 'practice.html': item }, weeks: [] };
  const F = make();
  await F.fdOpenResource('practice.html', {
    index, state: { tab: 'path', week: 2, done: {} }, host,
    search: '?tool=practice.html&case=c1&scenario=s1&resume=1',
    governanceNotice: () => '<div class="governance-notice">pending</div>',
    renderReader: (_index, _state, body) => `<main>${body}</main>`,
    facultyPreviewMatches: () => true,
  });
  assert.match(host.innerHTML, /governance-notice/);
  assert.match(host.innerHTML, /<iframe class="toolframe"/);
  assert.match(host.innerHTML, /src="tools\/practice\.html\?case=c1&amp;scenario=s1&amp;resume=1&amp;governed=1"/);
});

test('a failed resource load changes only the scoped reader host', async () => {
  const header = { innerHTML: '<header>still here</header>' };
  const host = { innerHTML: '<article>old</article>' };
  const item = { ref: 'missing.md', kind: 'read', title: 'Missing' };
  const result = await make().fdOpenResource('missing.md', {
    index: { byRef: { 'missing.md': item }, weeks: [] }, state: {}, host,
    fetcher: async () => ({ ok: false, status: 404 }),
    parseMarkdown: () => { throw new Error('must not parse'); },
    governanceNotice: () => '', renderReader: () => { throw new Error('must not render'); },
    facultyPreviewMatches: () => true,
  });
  assert.equal(result, false);
  assert.equal(header.innerHTML, '<header>still here</header>');
  assert.match(host.innerHTML, /role="alert"/);
  assert.match(host.innerHTML, /Page unavailable/);
});

test('faculty-preview mismatch uses the existing lock path and never loads a resource', async () => {
  let locked = 0;
  let fetched = 0;
  const result = await make().fdOpenResource('other.md', {
    index: { byRef: { 'other.md': { ref: 'other.md', kind: 'read', title: 'Other' } }, weeks: [] },
    state: {}, host: { innerHTML: '' },
    facultyPreviewMatches: () => false,
    facultyPreviewLock: () => { locked += 1; },
    fetcher: async () => { fetched += 1; return { ok: true, text: async () => '' }; },
  });
  assert.equal(result, false);
  assert.equal(locked, 1);
  assert.equal(fetched, 0);
});

test('an active faculty preview delegates to the existing governed show path unchanged', async () => {
  const calls = [];
  const F = make({
    facultyPreviewRequest: { surface: 'tool' },
    show: (legacy, _unused, options) => { calls.push([legacy, options]); },
  });
  const result = await F.fdOpenResource('practice.html', {
    index: {
      byRef: { 'practice.html': { ref: 'practice.html', kind: 'tool', title: 'Practice' } },
      weeks: [],
    },
    state: {}, search: '?tool=practice.html&reviewKey=tool%3Apractice.html&reviewToken=token',
    facultyPreviewMatches: () => true,
  });
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], { f: 'practice.html', t: 'Practice', k: 'tool' });
  assert.equal(calls[0][1].fromHistory, false);
  assert.match(calls[0][1].toolExtra, /reviewKey=tool%3Apractice\.html/);
  assert.match(calls[0][1].toolExtra, /reviewToken=token/);
});

test('initial faculty tool preview reaches governed preflight, iframe load, and ready receipt without bookmarking', async () => {
  const previewStart = shell.indexOf('function loadFacultyPreviewTool(item,opts,bar)');
  const previewEnd = shell.indexOf('/* Shared PHI heuristic', previewStart);
  const liveStart = shell.indexOf('function fdOpenResourceLive(ref,opts)');
  const liveEnd = shell.indexOf('function fdOpenRef(ref,search)', liveStart);
  assert.ok(previewStart > -1 && previewEnd > previewStart, 'faculty preview functions moved');
  assert.ok(liveStart > -1 && liveEnd > liveStart, 'live resource adapter moved');
  const previewCode = shell.slice(previewStart, previewEnd);
  const liveCode = shell.slice(liveStart, liveEnd);

  const writes = [];
  const statuses = [];
  const preflights = [];
  let frame = null;
  const contentEl = {
    innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(node) { frame = node; },
    querySelector() { return null; },
  };
  const globals = {
    FD_INDEX: {
      byRef: {
        'practice.html': { ref: 'practice.html', kind: 'tool', title: 'Practice' },
      },
      weeks: [],
    },
    contentEl,
    localStorage: { setItem(key, value) { writes.push([key, value]); } },
    fetch(url, options) {
      preflights.push([url, options]);
      return Promise.resolve({ ok: true, url });
    },
    location: {
      href: 'https://clerkship.test/?tool=practice.html',
      origin: 'https://clerkship.test',
      pathname: '/',
      search: '?tool=practice.html',
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'iframe');
        const listeners = {};
        return {
          listeners,
          addEventListener(type, listener) { listeners[type] = listener; },
        };
      },
    },
    window: { scrollTo() {} },
    postFacultyPreviewStatus(status, surface) { statuses.push([status, surface]); },
  };
  // Execute the shipped resource controller and the shell's real preview/resource adapters
  // together. This catches ordering bugs that either unit in isolation cannot observe.
  // eslint-disable-next-line no-new-func
  const harness = new Function('g', `
    var toolExtraFromParams=function(sp){
      var out=''; sp.forEach(function(value,key){
        if(['tool','page','tab'].indexOf(key)<0)out+='&'+encodeURIComponent(key)+'='+encodeURIComponent(value);
      }); return out;
    };
    var toolFrameSuffixWithGovernance=function(extra){
      var sp=new URLSearchParams(String(extra||'').replace(/^&/,''));
      sp.set('governed','1'); return '?'+sp.toString();
    };
    var FD_INDEX=g.FD_INDEX, contentEl=g.contentEl, localStorage=g.localStorage;
    var fetch=g.fetch, location=g.location, document=g.document, window=g.window;
    var facultyPreviewRequest={surface:'tool',reviewKey:'tool:practice.html',reviewToken:'${'a'.repeat(32)}'};
    var currentItem=null, currentToolFrame=null, fdController={getState:function(){return {tab:'today'};}};
    var renderGovernanceNotice=function(){return '<div>governed</div>';};
    var facultyPreviewMatchesItem=function(item){return item&&item.k==='tool'&&item.f==='practice.html';};
    var showFacultyPreviewLockNotice=function(){throw new Error('matching preview was locked');};
    var postFacultyPreviewStatus=g.postFacultyPreviewStatus;
    var setRoute=function(){}, skel=function(){return '<p>loading</p>';};
    var failFacultyPreviewTool=function(){throw new Error('preview failed');};
    var marked={parse:function(s){return s;}}, TOPIC_META={}, buildTpl=function(){return '';};
    var makeCollapsible=function(){}, enhanceTables=function(){}, buildReviewLedger=function(){return '';};
    var installTitleReviewButton=function(){return null;}, announceRoute=function(){}, focusGovernanceNotice=function(){};
    ${wire}
    ${previewCode}
    ${liveCode}
    return {
      open:function(){return fdOpenResourceLive('practice.html',{
        search:'?tool=practice.html&reviewKey=tool%3Apractice.html&reviewToken=${'a'.repeat(32)}',
        isCurrent:function(){return true;}
      });},
      current:function(){return currentItem;}
    };
  `)(globals);

  assert.equal(await harness.open(), true);
  for (let i = 0; i < 5 && !frame; i += 1) await Promise.resolve();
  assert.equal(preflights.length, 1, 'the exact governed tool must be preflighted once');
  assert.ok(frame, 'the governed tool iframe must mount after preflight');
  assert.match(frame.src, /^tools\/practice\.html\?/);
  assert.match(frame.src, /governed=1/);
  frame.listeners.load();
  assert.deepEqual(statuses, [['ready', 'tool']]);
  assert.deepEqual(harness.current(), { f: 'practice.html', t: 'Practice', k: 'tool' });
  assert.deepEqual(writes, [], 'faculty preview must not mutate the learner cw_last bookmark');
});

test('opening a resource resets scroll, but history navigation does not', async () => {
  const calls = [];
  const base = {
    index: { byRef: {} },
    state: {},
    search: '?page=interview.md',
    host: { innerHTML: '' },
    renderReader: (_i, _s, body) => body,
    governanceNotice: () => '',
    parseMarkdown: (md) => md,
    fetcher: () => Promise.resolve({ ok: true, text: () => Promise.resolve('# X\n\nbody') }),
    scrollReset: () => { calls.push('reset'); },
  };

  await make().fdOpenResource('interview.md', { ...base });
  assert.deepEqual(calls, ['reset'], 'a genuine navigation lands at the top of the new page');

  calls.length = 0;
  await make().fdOpenResource('interview.md', { ...base, fromHistory: true });
  assert.deepEqual(calls, [], 'back/forward must restore the reader position, not jump to top');
});
