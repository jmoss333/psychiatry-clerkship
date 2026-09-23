// Embedded-tool frame: content-height by default, viewport-height by declaration.
//
// A tool page is one <iframe class="toolframe">. Until 2026-09-19 that frame was a
// viewport-height box (`calc(100vh - 46px)`) inside a page that also scrolled: two nested scroll
// surfaces, worst on a phone, where the inner scrollbar was the tool's only way down and the
// shell's own chrome above the frame never left the screen. The shell now sizes the frame to the
// tool document (fdSizeToolFrame in spa_index.html) so the page is the only thing that scrolls.
//
// A tool that lays itself out against its OWN viewport cannot take that: a fixed bottom bar lands
// at the foot of a content-tall frame, off-screen until the last scroll, and a sticky panel never
// sticks because the frame's document no longer scrolls. Such a tool declares
// <meta name="cw-frame" content="viewport"> and keeps the viewport-height frame. Three do today
// (rp-agitation: fixed disclaimer footer + sticky panel; rp-brief-psych: fixed bottom bar;
// sp-interview: a transcript with its own scroll). Every other shipped tool was surveyed for
// html/body height, overflow:hidden and position:fixed before the default flipped.
//
// The two helpers are pure over a document so this file drives them with plain objects; the
// smoke half (tool-expand.spec.js "sized to its content") measures the live frame.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const wire = read('frontdoor/fd_wire.js');
const shell = read('spa_index.html');

function shellFunction(name) {
  const match = shell.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
}

// Root tests have no DOM dependency. Keep a narrow host for the real emitted buttons/iframe;
// never invent the final reader or its primary action. Replacing innerHTML creates new nodes,
// while a completion patch must retain the same iframe object and its simulated session.
function toolHost() {
  let html = '', nodes = [];
  return {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      nodes = [...value.matchAll(/<(button|iframe)\b([^>]*)>([^]*?)<\/\1>/g)].map(match => {
        const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]]));
        const scope = attrs['data-fd-dock-source'] ? 'fd-actionbar' : 'fd-article__actions';
        return { tagName: match[1].toUpperCase(), innerHTML: match[3], isConnected: true,
          parentNode: { classList: { contains: name => name === scope },
            replaceChild(node, old) {
              const index = nodes.indexOf(old);
              assert.notEqual(index, -1);
              nodes[index] = node;
              old.isConnected = false;
              node.isConnected = true;
            } },
          getAttribute: name => attrs[name] ?? null,
          setAttribute: (name, value) => { attrs[name] = value; },
        };
      });
    },
    querySelector(selector) {
      if (selector === '.toolframe') return nodes.find(node => node.tagName === 'IFRAME') || null;
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const attr = selector.match(/^\[([\w-]+)\]$/);
      return attr ? nodes.filter(node => node.getAttribute(attr[1]) !== null) : [];
    },
  };
}

test('a mounted tool projects its real primary into the dock and completion preserves its frame', async () => {
  const host = toolHost(), dock = toolHost();
  const document = { activeElement: null, createElement: toolHost, getElementById: () => null };
  const runtime = new Function('contentEl', 'fdDockMount', 'document', `
    ${read('phase_policy.js')}
    ${read('frontdoor/fd_state.js')}
    ${read('frontdoor/fd_data.js')}
    ${read('frontdoor/fd_today.js')}
    ${read('frontdoor/fd_block.js')}
    ${read('frontdoor/fd_shell.js')}
    ${read('frontdoor/fd_reader.js')}
    ${wire}
    var FD_INDEX={byRef:{'tool.html':{ref:'tool.html',kind:'tool',title:'Practice tool',points:[]}},weeks:[]};
    var facultyPreviewRequest=null, fdController=null, fdGuideBookmark=null, currentItem=null;
    var localStorage={setItem:function(){}}, location={search:'?tool=tool.html&resume=1'};
    var facultyPreviewMatchesItem=null, showFacultyPreviewLockNotice=null, postFacultyPreviewStatus=null;
    function fdDisposeGuide(){} function fdDisposeReadingPlace(){} function fdLiveState(state){return state;}
    function fdPracticeLaunchSearch(ref,search){return search;}
    function renderGovernanceNotice(){return '';}
    function setLearnerTitle(){} function announceRoute(){} function focusGovernanceNotice(){}
    function fdRenderOverlays(){}
    ${shellFunction('fdUpdateCareNavigatorStatus')}
    ${shellFunction('fdRenderDock')}
    ${shellFunction('fdPatchCompletion')}
    ${shellFunction('fdRenderTransient')}
    ${shellFunction('fdOpenResourceLive')}
    return {open:fdOpenResourceLive, patch:fdRenderTransient};
  `)(host, dock, document);
  const state = { screen: 'app', tab: 'today', fromTab: 'today', openId: 'tool.html', done: {} };
  assert.equal(await runtime.open('tool.html', { state }), true);
  const frame = host.querySelector('.toolframe');
  assert.ok(frame, 'real fdOpenResource and fdReader mounted the tool iframe');
  assert.equal(frame.getAttribute('src'), 'tools/tool.html?resume=1&amp;governed=1');
  assert.match(host.innerHTML, /fd-reader__toolbar/);
  assert.match(host.innerHTML, /data-fd-back>‹ Today/);
  assert.equal(host.querySelectorAll('[data-fd-dock-source]').length, 1);
  assert.match(dock.innerHTML, /data-fd-dock-forward="primary-reader">Mark done<\/button>/);
  frame.session = { draft: 'unsaved tool input' };
  runtime.patch({ ...state, done: { 'tool.html': true } }, {
    preserveResource: true, surfaces: { completion: true },
  });
  assert.equal(host.querySelector('.toolframe'), frame, 'completion must not remount the tool');
  assert.deepEqual(frame.session, { draft: 'unsaved tool input' });
  assert.match(dock.innerHTML, /data-fd-dock-forward="primary-reader">Back to Today<\/button>/);
});

// eslint-disable-next-line no-new-func
const F = (() => { try { return new Function(`${wire}\nreturn { fdToolFrameMode: fdToolFrameMode, fdToolFrameHeight: fdToolFrameHeight };`)(); } catch (err) { return { fdToolFrameMode: () => { throw err; }, fdToolFrameHeight: () => { throw err; } }; } })();

const docWith = (meta, sizes = {}) => ({
  querySelector: (sel) => (sel === 'meta[name="cw-frame"]' && meta !== null
    ? { getAttribute: (name) => (name === 'content' ? meta : null) } : null),
  documentElement: { offsetHeight: sizes.html ?? 0, scrollHeight: sizes.htmlScroll ?? 0 },
  body: { scrollHeight: sizes.body ?? 0 },
});

test('a tool with no declaration is content-sized; only an explicit viewport declaration opts out', () => {
  assert.equal(F.fdToolFrameMode(null), 'content');
  assert.equal(F.fdToolFrameMode(docWith(null)), 'content');
  assert.equal(F.fdToolFrameMode(docWith('viewport')), 'viewport');
  assert.equal(F.fdToolFrameMode(docWith(' Viewport ')), 'viewport', 'case and whitespace do not matter');
  assert.equal(F.fdToolFrameMode(docWith('content')), 'content');
  assert.equal(F.fdToolFrameMode(docWith('banana')), 'content', 'an unknown value is the default, not an error');
  assert.equal(F.fdToolFrameMode({ querySelector() { throw new Error('cross-origin'); } }), 'content');
});

test('the frame height is the document element\'s own box, which does not chase the frame\'s current height', () => {
  // documentElement.scrollHeight is max(viewport, content), so measuring it from a frame that is
  // already tall can never shrink the frame. offsetHeight is the html element's box, which with
  // height:auto is the content's height whatever the frame currently is.
  assert.equal(F.fdToolFrameHeight(docWith(null, { html: 812.4, htmlScroll: 2000, body: 700 })), 813);
  assert.equal(F.fdToolFrameHeight(docWith(null, { html: 0, body: 500 })), 500, 'falls back to the body when html reports nothing');
  assert.equal(F.fdToolFrameHeight(docWith(null, {})), 0);
  assert.equal(F.fdToolFrameHeight(null), 0);
});

test('the shell wires the sizer after a live mount and on every tool layout patch, never for a faculty preview', () => {
  assert.match(shell, /function fdSizeToolFrame\(frame\)\{/, 'the DOM half lives in the shell');
  const live = shell.slice(shell.indexOf('function fdOpenResourceLive(ref,opts)'), shell.indexOf('function fdOpenRef(ref,search)'));
  assert.match(live, /!facultyPreviewRequest&&typeof fdSizeToolFrame==='function'\)fdSizeToolFrame\(/,
    'sized once the resource has mounted, guarded so the audited preview path and the unit harness stubs are untouched');
  const patch = shell.slice(shell.indexOf('function fdPatchToolLayout(state)'), shell.indexOf('var fdGuideSession=null'));
  assert.match(patch, /fdSizeToolFrame\(/, 'a re-render that keeps the live frame still sizes it (idempotent on the element)');
  const sizer = shell.slice(shell.indexOf('function fdSizeToolFrame(frame)'), shell.indexOf('function fdPatchToolLayout(state)'));
  assert.match(sizer, /ResizeObserver/, 'content that grows or shrinks after load re-sizes the frame');
  assert.match(sizer, /fdToolFrameMode\(/, 'the declaration decides, not a heuristic');
  assert.match(sizer, /__fdSized/, 'wired once per frame element');
});

test('the viewport-height rule is still the base and the content-sized class is what overrides it', () => {
  assert.match(shell, /\.toolframe\{[^}]*height:calc\(100vh - 46px\)/, 'a viewport tool keeps the old frame');
  assert.match(shell, /\.toolframe\.is-content-sized\{[^}]*height:auto/, 'a content tool is released from the viewport height before its inline height lands');
});

test('every shipped tool declaration is a known value, and the three viewport tools are the ones surveyed', () => {
  const pages = JSON.parse(read('shipped_pages.json')).pages;
  const tools = pages.filter((p) => p.kind === 'tool');
  assert.ok(tools.length >= 20);
  const viewport = [];
  for (const p of tools) {
    const html = readFileSync(new URL(`../${p.source}`, import.meta.url), 'utf8');
    const m = html.match(/<meta\s+name="cw-frame"\s+content="([^"]*)"/);
    if (m) {
      assert.equal(m[1], 'viewport', `${p.slug}: the only declaration is viewport (content is the default and is not written down)`);
      viewport.push(p.slug);
    }
  }
  assert.deepEqual(viewport.sort(), ['rp-agitation.html', 'rp-brief-psych.html', 'sp-interview.html'],
    'adding a viewport tool is a deliberate act: survey it for fixed/sticky layout, then extend this list in the same change');
});

test('the contract is written where a tool author reads (CLAUDE.md, mirrored byte-for-byte in AGENTS.md)', () => {
  const claude = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
  const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.match(claude, /cw-frame/);
  assert.equal(claude, agents);
});
