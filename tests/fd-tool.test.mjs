// Contract for the TOOL surface — the branch that mounts an interactive tool in an iframe.
//
// Why this file exists: Plan 3 Task 3 correctly deleted show(), whose `item.k==='tool'` branch was
// the only thing that ever created that iframe, and no task rebuilt it. `?tool=x.html` rendered an
// article shell with no frame and 404'd content/x.html — all 22 shipped tools plus every cta[]
// deep link in topic_meta.json — and NOT ONE TEST WENT RED, because the shell tests slice
// renderers and the renderers were all fine. It was found by driving the page. So the contract is
// pinned here, against the deleted code (spa_index.html @098ad50:1127-1136) rather than against
// what the current source happens to do.
//
// Structural rather than executed for the mount itself: fdToolSync writes into a real DOM node and
// the faculty-preview path does a network preflight. The pure part (the frame markup, the suffix)
// is executed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const shell = read('spa_index.html');
const wire = read('frontdoor/fd_wire.js');
const css = read('frontdoor/frontdoor.css');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

const toolBlock = slice(shell, '/* ---- tool surface ----', '/* ---- end tool surface ---- */');

// ---- the frame itself ------------------------------------------------------------------

// fdToolFrameHtml is pure over (item, opts) once esc() and the governed suffix helper are in
// scope, so it is executed with the shell's own helpers rather than re-implemented here.
function buildFrameFn() {
  const governance = slice(shell, '/* ---- governance notice ---- */', '/* ---- end governance notice ---- */');
  // eslint-disable-next-line no-new-func
  const factory = new Function('URLSearchParams', `
    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    var GOVERNANCE={status:'loading',items:{}};
    ${governance}
    var FD_TOOL_EXTRA='', FD_TOOL_EXTRA_REF='';
    ${toolBlock.slice(toolBlock.indexOf('function fdToolOpts'), toolBlock.indexOf('var FD_TOOL_MOUNTED'))}
    return { fdToolFrameHtml: fdToolFrameHtml };
  `);
  return factory(URLSearchParams).fdToolFrameHtml;
}

test('the frame points at tools/<slug> with the governed suffix and an escaped title', () => {
  const fdToolFrameHtml = buildFrameFn();
  const html = fdToolFrameHtml({ f: 'mse.html', k: 'tool', t: 'Mental Status Exam' });
  assert.match(html, /^<iframe class="fd-toolframe" src="tools\/mse\.html\?governed=1" /);
  assert.match(html, /title="Mental Status Exam"><\/iframe>$/);
});

test('a deep link\'s extra params ride the src — this is the part that looks optional and is not', () => {
  // &case=, &scenario= and &resume=1 are shipped by topic_meta cta[] entries and by
  // communicationHref()/familyAction(). Dropping them opens the right tool at the WRONG PLACE,
  // with no error anywhere — the tool simply shows its front page.
  const fdToolFrameHtml = buildFrameFn();
  const html = fdToolFrameHtml({ f: 'communication-practice.html', k: 'tool', t: 'T' },
    { toolExtra: '&case=agitation_01&resume=1' });
  const query = html.match(/src="tools\/communication-practice\.html\?([^"]*)"/)[1];
  const params = new URLSearchParams(query.replace(/&amp;/g, '&'));
  assert.equal(params.get('case'), 'agitation_01');
  assert.equal(params.get('resume'), '1');
  assert.equal(params.get('governed'), '1', 'the governed flag must survive alongside them');
});

test('a hostile tool title cannot break out of the title attribute', () => {
  const fdToolFrameHtml = buildFrameFn();
  const html = fdToolFrameHtml({ f: 'x.html', k: 'tool', t: '<script>t()</script>' });
  assert.doesNotMatch(html, /<script>/);
});

// ---- the mount -------------------------------------------------------------------------

test('the frame is mounted OUTSIDE #content, in its own element', () => {
  // The reason is not tidiness: fdMount replaces #content wholesale whenever the body markup
  // changes, and re-inserting an <iframe> reloads it. A theme toggle changes the header's
  // aria-pressed and nothing else — and would silently discard a half-finished CIWA score, a
  // question mid-answer, or a standardized-patient conversation.
  assert.match(shell, /<div id="fdTool" class="fd-toolmount"><\/div>/);
  const body = slice(shell, '<div class="fd-shell">', '</div>\n<script>');
  assert.ok(body.indexOf('id="content"') < body.indexOf('id="fdTool"'),
    'the mount follows #content, so the header and back link paint above the frame');
  assert.match(toolBlock, /fdMount\('fdTool'/);
});

test('the mount is written only when the OPEN TOOL changes', () => {
  assert.match(toolBlock, /if\(FD_TOOL_MOUNTED===ref\) return;/,
    'without this guard every re-render reloads the tool');
  assert.match(toolBlock, /FD_TOOL_MOUNTED=ref;/);
});

test('closing a tool empties the mount rather than leaving it running behind the next surface', () => {
  assert.match(toolBlock, /if\(!ref\)\{ fdMount\('fdTool',''\); return; \}/);
});

test('.fd-toolmount takes the remaining viewport height and disappears when empty', () => {
  assert.match(css, /\.fd-toolmount\{display:none\}/);
  assert.match(css, /\.fd-toolmount:not\(:empty\)\{[^}]*flex:1 1 auto/);
  assert.match(css, /\.fd-toolmount:not\(:empty\)\{[^}]*min-height:420px/,
    'an ABSOLUTE floor: an iframe with no height of its own falls back to 150px, and a tool '
    + 'squeezed to 150px is unusable and fails silently');
  assert.match(css, /\.fd-toolframe\{[^}]*flex:1 1 auto/);
  assert.match(css, /\.fd-toolframe\{[^}]*border:0/);
});

test('frontdoor.css owns the tool frame — no raw colour, tokens only', () => {
  const rules = [...css.matchAll(/\.fd-tool[a-z-]*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  assert.ok(rules.length > 0, 'sanity: expected .fd-tool* rules to exist');
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b/i, 'colours are var(--fd-*), never raw hex');
});

// ---- routing ---------------------------------------------------------------------------

test('a tool ref renders the tool pane, not the article reader', () => {
  const render = slice(shell, '/* ---- front door render ---- */', '/* ---- end front door render ---- */');
  assert.match(render, /if\(openTool\)\{/);
  assert.match(render, /fdReaderBackButton\(fdReaderBackLabel\(st\.fromTab\)\)/,
    'a tool fills the viewport; without a back link the only way out is the header');
});

test('a tool ref never fetches content/<slug> — that 404 was the other half of the defect', () => {
  assert.match(shell, /if\(st\.openId&&fdRouteItem\(st\.openId\)\.k==='md'\) fdFetchBody\(/,
    'only a markdown ref has a body to fetch');
});

test('fdRouteItem is memoised, because the preview guards compare object identity', () => {
  // loadFacultyPreviewTool()/failFacultyPreviewTool() both guard with `currentItem!==item`. While
  // fdRouteItem built a fresh object per call that comparison was TRUE unconditionally, so the
  // faculty preview could never mount at all.
  assert.match(wire, /var FD_ROUTE_ITEMS=\{\};/);
  assert.match(wire, /if\(fdOwns\(FD_ROUTE_ITEMS, key\)\) return FD_ROUTE_ITEMS\[key\];/);
  assert.match(wire, /var key='r:'\+ref;/, 'prefixed so no ref can address Object.prototype');
});

test('the tool frame does not mount behind the first-run wizard', () => {
  // Found by driving the page, not by a test: the mount lives OUTSIDE #content, so the wizard's
  // full-viewport screen does not cover it — it sits underneath, taking flex height from the
  // screen the student is meant to be reading and loading a tool nobody asked for.
  const render = slice(shell, '/* ---- front door render ---- */', '/* ---- end front door render ---- */');
  assert.match(render, /var openTool=\(!wizard&&openRoute&&openRoute\.k==='tool'\)\?openRoute:null;/);
});

// ---- the faculty-console preview route --------------------------------------------------

test('a faculty preview never renders the first-run wizard', () => {
  // A reviewer's frame carries no cw_frontdoor_v1, so `!st.role` is true for EVERY preview — the
  // console would be shown the role picker instead of the item under review, and told 'ready'.
  const render = slice(shell, '/* ---- front door render ---- */', '/* ---- end front door render ---- */');
  assert.match(render, /if\(!facultyPreviewRequest\)\{\s*\n\s*if\(!st\.role\|\|st\.setup==='role'\) wizard='role';/);
});

test('a faculty preview uses the preflight loader, never the plain frame', () => {
  // The console waits on a postMessage the preflight path posts and the plain frame does not; a
  // plain iframe here leaves the reviewer's console spinning on a tool that in fact loaded.
  assert.match(toolBlock, /if\(facultyPreviewRequest\)\{/);
  assert.match(toolBlock, /loadFacultyPreviewTool\(item, opts\);/);
  assert.match(toolBlock, /currentItem=item;/,
    'at boot the first render precedes fdRoute, and the async guard reads currentItem');
});

test('both preview writers target the tool mount, not contentEl', () => {
  const fail = slice(shell, 'function failFacultyPreviewTool(', 'function loadFacultyPreviewTool(');
  const load = slice(shell, 'function loadFacultyPreviewTool(', '/* Shared PHI heuristic');
  for (const [name, src] of [['failFacultyPreviewTool', fail], ['loadFacultyPreviewTool', load]]) {
    assert.match(src, /getElementById\('fdTool'\)/, `${name} must write into the tool mount`);
    assert.doesNotMatch(src, /contentEl\.innerHTML/,
      `${name} overwriting #content would delete the reviewer's only way out of the frame`);
  }
});

test('the preview frame carries the same class the plain one does', () => {
  assert.match(shell, /frame\.className='fd-toolframe';/,
    'two class names for one element is how the two paths drift apart visually');
});

test('the question-status relay is restored — the console cannot resolve without it', () => {
  // question-bank-practice.html reports whether the item under review actually rendered; only the
  // shell can answer the console. This listener was deleted with the nav.json block in Task 3.
  assert.match(wire, /d\.type==='faculty-preview-question-status'/);
  assert.match(wire, /ev\.source===currentToolFrame\.contentWindow/,
    'the message must come from the frame we mounted, not from any frame');
  assert.match(wire, /Object\.keys\(d\)\.sort\(\)\.join\(','\)==='reviewItem,reviewKey,reviewToken,status,surface,type'/,
    'exact shape match — the deleted handler had it and it is what makes the relay unforgeable');
});

test('every navigating message type is locked behind the preview guard', () => {
  const listener = slice(wire, "window.addEventListener('message'", "window.addEventListener('popstate'");
  assert.match(listener, /if\(d\.type!=='openPage'&&d\.type!=='openLibrary'&&d\.type!=='search'\) return;\s*\n\s*if\(facultyPreviewRequest\)\{ showFacultyPreviewLockNotice\(\); return; \}/,
    'the lock must precede the navigation, for all three types');
  assert.ok(listener.indexOf("d.type==='theme'") < listener.indexOf("d.type!=='openPage'"),
    'theme is handled before the guard on purpose: it changes no route');
});

test('an unknown openPage ref is ignored rather than opened over a 404', () => {
  const listener = slice(wire, "window.addEventListener('message'", "window.addEventListener('popstate'");
  assert.match(listener, /if\(!\(fdIndexSafe\(\)\.byRef\|\|\{\}\)\[d\.f\]\) return;/);
  assert.match(listener, /if\(d\.f==='__home__'\)\{/,
    "question-bank-practice.html still posts the deleted shell's name for Today");
});

test('a .html ref the index does not list is still treated as a tool', () => {
  // Found by driving a faculty preview at a ref curriculum.json does not reference: it was
  // classified 'md', rendered as an article shell, had content/<slug>.html fetched for it, and
  // reported NO status at all — the console waited forever. The index is the first authority and
  // the extension is the fallback, using fd_data.js's own fdIsTool so the two cannot disagree.
  assert.match(wire, /if\(it\) return \(it\.kind==='tool'\)\?'tool':'md';\s*\n\s*return fdIsTool\(ref\)\?'tool':'md';/);
});

test('the page preview reports its own status from the same fetch that renders it', () => {
  // The deleted show() posted 'ready'/'not_found' from its md branch. fdFetchBody is that fetch
  // now, and until this it posted nothing: a page preview never resolved in the console, whether
  // the page existed or not. postFacultyPreviewStatus() is itself a no-op outside a preview.
  const fetchBody = slice(shell, 'function fdFetchBody(ref, done){', 'function fdDoneMap(');
  assert.match(fetchBody, /pageError\.facultyPreviewStatus=\(r\.status===404\)\?'not_found':'error';/);
  assert.match(fetchBody, /postFacultyPreviewStatus\('ready','page'\);/);
  assert.match(fetchBody, /postFacultyPreviewStatus\(\(err&&err\.facultyPreviewStatus\)\|\|'error','page'\);/);
});
