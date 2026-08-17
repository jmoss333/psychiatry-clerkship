// Boot contract for the front-door shell (Plan 3, Task 3 — "the point of no return").
//
// Two halves, deliberately:
//
//   (1) SOURCE assertions over the shipped spa_index.html. The sidebar must be gone, and each
//       row of the task brief's "what must survive the rewrite" table must still be present.
//       Every survival assertion names its CONSUMER in the failure message: these functions have
//       no caller inside this file, so the only thing standing between them and a future
//       "unused, delete it" pass is a message that says who breaks.
//
//   (2) BEHAVIOURAL coverage of fdRender/fdSurface, evaluated for real via `new Function` over
//       the nine injected module sources concatenated in inject_shared_snippets()' dependency
//       order plus the sliced fdRender block — the same slice-and-execute idiom
//       tests/phase-chip.test.mjs and tests/srs-home-counters.test.mjs use.
//
//       The per-surface try/catch requirement (spec §6) is tested by SABOTAGE, not by grepping
//       for the word "catch". A text scan for `catch` inside fdRender cannot fail for the reason
//       we care about — it stays green if all four surfaces share one outer guard, which is the
//       exact failure mode being designed against (the old renderHome had precisely one
//       unguarded throw path and it blanked the entire page instead of one region). So each
//       surface renderer is reassigned to a throwing stub in turn, and the assertion is that the
//       header, the tab row, and the OTHER surfaces still render. That goes red the moment the
//       guards are merged, removed, or moved outside the surface call.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const source = readFileSync(new URL(`../${SPA}`, import.meta.url), 'utf8');

const RENDER_START = '/* ---- front door render ---- */';
const RENDER_END = '/* ---- end front door render ---- */';

function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  const b = source.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return source.slice(a, b);
}

// ---- the sidebar is gone ------------------------------------------------------------

test('the sidebar, its rail, and the mode surfaces are gone from the shell', () => {
  for (const needle of ['id="side"', 'modetoggle', 'modeCompanion',
                        'renderModeCompanion', 'renderWardDashboard']) {
    assert.equal(source.split(needle).length - 1, 0,
      `${needle} must not survive the front-door swap`);
  }
});

test('the mode-scoring engine behind the deleted dashboard is gone too', () => {
  // Named separately from the markup check because these are pure functions with no markup of
  // their own — a deleter who removed only the rendering would leave them looking "still used".
  for (const needle of ['function itemsForMode', 'function scoreItemForMode',
                        'function dashboardMode', 'function setDashboardMode',
                        'function dashCfg', 'function modeReason',
                        'window.renderHome', 'window.renderProgress']) {
    assert.equal(source.split(needle).length - 1, 0, `${needle} must not survive`);
  }
});

// ---- fdRender exists exactly once ---------------------------------------------------

test('fdRender is declared exactly once, as a function of state', () => {
  assert.equal(source.split('function fdRender(').length - 1, 1,
    'exactly one fdRender declaration — Task 4 calls it after every state change');
  assert.match(source, /function fdRender\(state\)\{/);
});

test('the front-door render marker pair appears exactly once', () => {
  assert.equal(source.split(RENDER_START).length - 1, 1);
  assert.equal(source.split(RENDER_END).length - 1, 1);
});

// ---- what must survive the rewrite --------------------------------------------------
// One test per row of the task brief's table. The message names the consumer on purpose.

test('SURVIVOR: governance notices — consumer: compliance surface + tests/surface-governance-ui.test.mjs', () => {
  assert.match(source, /function renderGovernanceNotice\(item\)\{/,
    'renderGovernanceNotice renders the pending/reviewed notice for a page or tool');
  assert.match(source, /function refreshGovernanceNotice\(\)\{/,
    'refreshGovernanceNotice swaps the notice when governance.json settles');
  assert.match(source, /function governanceBadge\(triplet\)\{/,
    'governanceBadge marks pending rows; Task 7 rewires all three onto the front door');
  assert.match(source, /fetch\('governance\.json'\)/,
    'the notice is worthless without its data source');
});

test('SURVIVOR: faculty-preview route — consumer: faculty-console/ (the reviewer preview iframe)', () => {
  assert.match(source, /function readFacultyPreviewRequest\(\)\{/,
    'faculty-console/ opens learner pages through ?reviewKey/?reviewToken; this parses them');
  assert.match(source, /function restoreFacultyPreviewRoute\(\)\{/,
    'the preview route is pinned so a stray navigation cannot escape the review frame');
  assert.match(source, /function showFacultyPreviewLockNotice\(\)\{/,
    'the lock notice is what the reviewer sees instead of navigating away');
  assert.match(source, /faculty-preview-status/,
    'the console listens for this postMessage to know the preview loaded');
});

test('SURVIVOR: theme init + the cw_theme toggle — consumer: clinical-warm.css and all 21 tools', () => {
  assert.match(source, /localStorage\.getItem\('cw_theme'\)/,
    'the pre-paint head script is what stops a dark-mode user flashing light');
  assert.match(source, /localStorage\.setItem\('cw_theme'/,
    'every clinical tool inherits data-theme through cw_theme; without a writer the toggle is dead');
  assert.match(source, /data-fd-theme/,
    'the toggle control itself lives in fdHeader() and is reached by this delegated attribute — '
    + 'the front-door header re-renders, so an element-bound listener would not survive');
});

test('SURVIVOR: service-worker registration — consumer: the offline shell', () => {
  assert.equal(source.split('/*__SW_REGISTER__*/').length - 1, 1,
    'exactly one SW_REGISTER marker; the offline shell and its update toast come from it');
});

test('SURVIVOR: ?page=/?tool= routing — consumer: topic_meta cta[], Week READMEs, nav-crawl smoke', () => {
  assert.match(source, /function setRoute\(it, replace, opts\)\{/,
    'setRoute writes ?page=/?tool= into history; deep links are load-bearing for topic_meta '
    + "cta[] entries, every Week README, communicationHref()/familyAction(), and "
    + 'tests/smoke/nav-crawl.spec.js');
  assert.match(source, /function toolExtraFromParams\(sp\)\{/,
    'carries &case=/&scenario=/&resume=1 through to the tool iframe');
  assert.match(source, /function pageTitle\(it\)\{/,
    'setRoute sets document.title through it');
  assert.match(source, /sp0\.get\('page'\)\|\|sp0\.get\('tool'\)/,
    'the boot must still read a deep link out of the URL');
});

test('SURVIVOR: marked rendering of markdown pages — consumer: the reader pane bodyHtml', () => {
  assert.match(source, /marked\.parse\(/,
    'fdReader(index, state, bodyHtml) takes already-rendered HTML; this is the only site that '
    + 'turns a shipped .md page into it');
  assert.match(source, /<script src="marked\.min\.js"><\/script>/,
    'marked.parse without the library is a runtime throw on the first page opened');
});

test('SURVIVOR: SRS / question-bank helpers — consumer: the due row and the done map', () => {
  assert.match(source, /function srsState\(\)\{/, 'reads cw_srs_v1');
  assert.match(source, /function dueBreakdown\(\)\{/, 'the due row Task 5 ported is built from it');
  assert.match(source, /function progLoad\(\)\{/,
    "cw_progress_v1 IS the front door's done map — fd_state.js persists no copy of it, by design");

  // *** THE SESS_CAPSULE SURVIVOR WAS RESOLVED AS A RETIREMENT (Plan 3 Task 8). ***
  // Task 3 preserved the marker on the expectation, written into this test, that "Task 5 ports the
  // resume row that calls it". Task 5 ported the tool surface, the due row, the capture triage,
  // Progress and the A2HS line — but no resume row, and neither did Tasks 6 or 7. sessLoad(),
  // sessSave() and sessClear() therefore had zero callers in this page, and the marker was pasting
  // an unreachable snippet into every build of both sites. The snippet is untouched and still live
  // in question-bank-practice.html (tests/sess-capsule.test.mjs), so a student's in-progress qbank
  // session still resumes when they reopen the TOOL; what is gone is the shell's shortcut to it.
  // Reversing this is one line — re-add the marker — which is the point of pinning the absence
  // here rather than deleting the assertion: a re-add is a decision someone makes on purpose.
  assert.equal(source.split('/*__SESS_CAPSULE__*/').length - 1, 0,
    'the SESS_CAPSULE marker is retired from the shell — restoring it means restoring a caller too, '
    + 'or it injects dead code again');
  assert.doesNotMatch(source, /\bsessLoad\(|\bsessSave\(|\bsessClear\(/,
    'and no shell code may call the capsule helpers while the marker is absent — they would be '
    + 'undefined at runtime');
});

test('SURVIVOR: ward-capture store — consumer: Task 5 ports its triage surface', () => {
  assert.match(source, /function capOpen\(invoker\)\{/, 'the capture dialog');
  assert.match(source, /function capSave\(force\)\{/, 'the PHI-interstitial write path');
  assert.match(source, /'cw_capture_v1'/, 'the store key, written as a literal for the QA gate scan');
  // Task 5 DID port the triage surface, and porting it moved the markup: capTriageHtml() is gone
  // and fd_due.js's fdCaptureTriage() renders it from data fd_wire.js's fdCaptureState() reads.
  // The thing to pin here is therefore the marker — lose it and the store has a writer, a PHI
  // interstitial, and nowhere to show what it holds.
  assert.equal(source.split('/*__FD_DUE__*/').length - 1, 1,
    'exactly one FD_DUE marker — the due row and the capture triage arrive through it');
  assert.match(source, /function dueBreakdown\(\)\{/, 'the due row is built from it');
});

// ---- the standing disclaimer --------------------------------------------------------

test('SURVIVOR: the no-PHI / pending-review disclaimer banner — consumer: every learner, both sites', () => {
  // This is a compliance surface, not chrome. It is the standing statement that the clinical
  // content is synthetic and that some pages are not yet faculty-attested. Deleting it removes
  // that disclaimer from every page on both sites at once, silently — which is exactly why it
  // gets an assertion of its own rather than riding along with the shell markup.
  assert.match(source, /Educational use; fictional composites only, no PHI\./,
    'the synthetic-content disclaimer must stay on the shell');
  assert.match(source, /Some pages are pending faculty review\./,
    'the unattested-content disclaimer must stay on the shell');
  assert.match(source, /id="bannerX"/, 'the banner keeps a dismiss control');
  assert.match(source, /'cw_banner_dismissed'/,
    'dismissal persists in the cw_* namespace the QA gate scans for');
});

// ---- behavioural: per-surface isolation ---------------------------------------------

const renderBlock = slice(RENDER_START, RENDER_END);

const INDEX_FIXTURE = {
  weeks: [{
    n: 1,
    title: 'Foundations',
    theme: 'Orientation',
    items: [{ ref: 'a.md', kind: 'read' }, { ref: 'mse.html', kind: 'tool' }],
  }],
  libraryColumns: [{ title: 'Core', items: [{ ref: 'a.md', kind: 'read' }] }],
  safetyKit: [{ ref: 'a.md', label: 'Risk', tint: 'danger' }],
  synonyms: {},
};
const META_FIXTURE = { 'a.md': { read: 8, tldr: 'A summary.', points: ['one'] } };
const REGISTRY_FIXTURE = { tools: [{ file: 'mse.html', title: 'Mental Status Exam' }] };
const MANIFEST_FIXTURE = { md: [['x/a.md', 'a.md', 'A page']], tools: [['t/mse.html', 'mse.html', 'MSE']] };
const ROLES_FIXTURE = [{ id: 'student', name: 'Core rotation', desc: 'd', hint: 'most common' }];

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// Builds a live fdRender over the real module sources. `sabotage` names a surface renderer to
// replace with a throwing stub AFTER the modules are defined — function declarations are
// mutable bindings, so this reproduces "this one surface blew up" without editing any source.
function makeRender(sabotage) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('localStorage', 'document', 'sabotage', `
    ${read('phase_policy.js')}
    ${read('frontdoor/fd_state.js')}
    ${read('frontdoor/fd_data.js')}
    ${read('frontdoor/fd_due.js')}
    ${read('frontdoor/fd_today.js')}
    ${read('frontdoor/fd_shell.js')}
    ${read('frontdoor/fd_path.js')}
    ${read('frontdoor/fd_library.js')}
    ${read('frontdoor/fd_reader.js')}
    ${read('frontdoor/fd_search.js')}
    ${read('frontdoor/fd_sheet.js')}
    ${read('frontdoor/fd_wire.js')}
    var FD_CURRICULUM=${JSON.stringify(INDEX_FIXTURE)};
    var FD_TOPIC_META=${JSON.stringify(META_FIXTURE)};
    var FD_TOOL_REGISTRY=${JSON.stringify(REGISTRY_FIXTURE)};
    var FD_SITE_MANIFEST=${JSON.stringify(MANIFEST_FIXTURE)};
    var FD_COMMUNICATION_CASES={cases:[{id:'case_001',title:'A drill'}]};
    var FD_ROLES=${JSON.stringify(ROLES_FIXTURE)};
    var FD_BODY={};
    function fdFetchBody(){}
    // The one first-script global fdRender reads directly. null = an ordinary learner session;
    // the preview branch (which skips the wizard) is exercised in tests/fd-tool.test.mjs.
    // fdToolSync IS inside renderBlock and runs for real here — with document.getElementById
    // stubbed to null it is a no-op, which is the right shape for a render-only harness.
    var facultyPreviewRequest=null;
    // The other first-script global fdRender reaches for: the review-status notice it mounts for
    // any open page or tool. Stubbed rather than sliced in — the notice has its own suite
    // (tests/surface-governance-ui.test.mjs), and without a stub every render carrying an openId
    // would throw inside fdSurface and spend the console.warn the sabotage test counts.
    function renderGovernanceNotice(){ return '<div class="governance-notice reviewed-receipt">stub</div>'; }
    ${renderBlock}
    if(sabotage==='today') fdToday=function(){ throw new Error('boom'); };
    if(sabotage==='path') fdPath=function(){ throw new Error('boom'); };
    if(sabotage==='library') fdLibrary=function(){ throw new Error('boom'); };
    if(sabotage==='reader') fdReader=function(){ throw new Error('boom'); };
    if(sabotage==='setup-role') fdSetupRole=function(){ throw new Error('boom'); };
    return fdRender;
  `);
  return fn(memStorage(), { getElementById: () => null }, sabotage || null);
}

const BASE = { role: 'student', week: 1, tab: 'today', done: {}, nowMs: Date.UTC(2026, 7, 17, 9) };

test('a healthy render puts the tab surface inside .fd-main under the header', () => {
  const html = makeRender()(BASE);
  assert.match(html, /class="fd-header"/);
  assert.match(html, /class="fd-tabs"/);
  assert.match(html, /<main class="fd-main"/);
  assert.match(html, /class="fd-today"/);
  assert.doesNotMatch(html, /fd-fallback/, 'nothing failed, so nothing should degrade');
});

test('the first-run wizard renders instead of the app when no role is stored', () => {
  const html = makeRender()({ tab: 'today', done: {} });
  assert.match(html, /data-fd-role="student"/);
  assert.doesNotMatch(html, /class="fd-tabs"/, 'setup owns the whole viewport — no tab row behind it');
});

test('step 2 renders while the wizard is on that step', () => {
  const html = makeRender()({ role: 'student', setup: 'week', tab: 'today', done: {} });
  assert.match(html, /data-fd-week="1"/);
  assert.match(html, /Core rotation ✓/, 'the chosen role name is resolved from FD_ROLES');
});

test('a role with no week lands in the APP, not back in the wizard', () => {
  // Task 4 moved this gate from "no week is set" to an explicit wizard step, and the reason is
  // this state. It is reachable two ways that both used to dead-end: the wizard's own "Not on
  // rotation — just browse" tile deliberately sets no week, and a student who closed the tab
  // mid-setup keeps their role. Gated on week, both re-entered step 2 with no way out —
  // "just browse" in particular could never be honoured, because honouring it recreated its own
  // precondition. fd_today.js already ships the app-side answer: the "30-second setup" card.
  const html = makeRender()({ role: 'student', tab: 'today', done: {} });
  assert.match(html, /class="fd-tabs"/, 'the app shell renders');
  assert.match(html, /data-fd-change-week/, 'and offers the week question as a card, not a wall');
  assert.doesNotMatch(html, /class="fd-weekgrid"/, 'the wizard must not be on screen');
});

test('the wizard can step back to the role question', () => {
  const html = makeRender()({ role: 'student', setup: 'role', tab: 'today', done: {} });
  assert.match(html, /data-fd-role="student"/,
    'setup:"role" is what data-fd-back in step 2 sets; without this branch back is a dead button');
});

// Each row names the class the HEALTHY surface emits. Asserting it is absent is what proves the
// sabotage actually took effect: without it, a test that only looked for .fd-fallback would still
// pass if the fallback were emitted alongside a surface that rendered fine.
for (const [surface, state, healthyMarker] of [
  ['today', { ...BASE, tab: 'today' }, /class="fd-today"/],
  ['path', { ...BASE, tab: 'path' }, /class="fd-path"/],
  ['library', { ...BASE, tab: 'library' }, /class="fd-library"/],
  ['reader', { ...BASE, openId: 'a.md', fromTab: 'today' }, /class="fd-reader"/],
]) {
  test(`a throwing ${surface} degrades to .fd-fallback and leaves the header and tabs usable`, () => {
    const html = makeRender(surface)(state);
    assert.match(html, /class="fd-fallback"/,
      `${surface} threw, so its region must degrade rather than take the page down`);
    assert.doesNotMatch(html, healthyMarker,
      `${surface} was sabotaged, so its own markup must be absent — if it is still here the `
      + 'sabotage did not take and this whole loop is testing nothing');
    assert.match(html, /class="fd-header"/,
      'spec §6: the header stays usable when a surface fails');
    assert.match(html, /class="fd-tabs"/,
      'spec §6: the tab row stays usable so the learner can leave the broken surface');
    assert.ok(!/undefined/.test(html), 'a degraded render must not print "undefined"');
  });
}

test('a failed surface is reported to the console, named', () => {
  // The warn is the only thing that makes a swallowed failure findable in development. Capturing
  // it here is also what stops fdSurface's `name` parameter from being decorative.
  const seen = [];
  const original = console.warn;
  console.warn = (...args) => seen.push(args);
  try { makeRender('path')({ ...BASE, tab: 'path' }); } finally { console.warn = original; }
  assert.equal(seen.length, 1, 'exactly one warning for one failed surface');
  assert.match(String(seen[0][0]), /path/, 'the message must name which surface failed');
  assert.ok(seen[0][1] instanceof Error, 'the original error must be passed through, not discarded');
});

test('the wizard fallback does not point at chrome the wizard never renders', () => {
  // The setup branch emits no header and no tab row, so "use another tab" would name a way out
  // that is not on screen.
  const render = makeRender('setup-role');
  const html = render({ tab: 'today', done: {} });
  assert.match(html, /class="fd-fallback"/);
  assert.doesNotMatch(html, /class="fd-tabs"/, 'precondition: the wizard has no tab row');
  const copy = html.match(/<div class="fd-fallback">([^<]*)</)[1];
  assert.doesNotMatch(copy, /tab/i,
    'the wizard fallback must not send a student to tabs that do not exist');
  assert.match(copy, /reload/i, 'it still has to offer something actionable');
});

test('one surface failing does not take the others down with it', () => {
  // The assertion that kills a single shared try/catch around the whole body: with today
  // sabotaged, switching to path must still render the real path surface.
  const render = makeRender('today');
  assert.match(render({ ...BASE, tab: 'today' }), /class="fd-fallback"/);
  assert.match(render({ ...BASE, tab: 'path' }), /class="fd-path"/,
    'path has its own guard and its own renderer — it must be unaffected by today throwing');
  assert.doesNotMatch(render({ ...BASE, tab: 'path' }), /fd-fallback/);
});

test('the fallback copy names a way out rather than an error code', () => {
  const html = makeRender('today')(BASE);
  const m = html.match(/<div class="fd-fallback">([^<]*)</);
  assert.ok(m, 'fallback must carry text, not an empty div');
  assert.doesNotMatch(m[1], /error|Error|failed|exception/,
    'a learner who did nothing wrong should read a degraded state, not a stack-trace apology');
  assert.match(m[1], /reload|tab/i, 'the copy must offer the learner something to do');
});

test('a broken index degrades every surface rather than throwing out of fdRender', () => {
  // fdBuildIndex is handed deliberately malformed data. fdRender must still return a string.
  // eslint-disable-next-line no-new-func
  const fn = new Function('localStorage', 'document', `
    ${read('phase_policy.js')}
    ${read('frontdoor/fd_state.js')}
    ${read('frontdoor/fd_data.js')}
    ${read('frontdoor/fd_due.js')}
    ${read('frontdoor/fd_today.js')}
    ${read('frontdoor/fd_shell.js')}
    ${read('frontdoor/fd_path.js')}
    ${read('frontdoor/fd_library.js')}
    ${read('frontdoor/fd_reader.js')}
    ${read('frontdoor/fd_search.js')}
    ${read('frontdoor/fd_sheet.js')}
    ${read('frontdoor/fd_wire.js')}
    var FD_CURRICULUM=null, FD_TOPIC_META=null, FD_TOOL_REGISTRY=null,
        FD_SITE_MANIFEST=null, FD_ROLES=${JSON.stringify(ROLES_FIXTURE)},
        FD_COMMUNICATION_CASES=null;
    var FD_BODY={};
    function fdFetchBody(){}
    // The one first-script global fdRender reads directly. null = an ordinary learner session;
    // the preview branch (which skips the wizard) is exercised in tests/fd-tool.test.mjs.
    // fdToolSync IS inside renderBlock and runs for real here — with document.getElementById
    // stubbed to null it is a no-op, which is the right shape for a render-only harness.
    var facultyPreviewRequest=null;
    fdBuildIndex=function(){ throw new Error('curriculum unusable'); };
    ${renderBlock}
    return fdRender;
  `);
  const html = fn(memStorage(), { getElementById: () => null })(BASE);
  assert.equal(typeof html, 'string');
  assert.match(html, /class="fd-header"/, 'the header does not depend on the index being usable');
});

// ---- the review-status notice on the front door (Plan 3 Task 7) -------------------------------
// Task 5 rewired the TOOL path only, which left a markdown page — including one whose ledger entry
// is `pending` at `high` risk — showing no review status at all. These pin the symmetry, the
// mount, and the focus hand-off that Task 5 explicitly deferred here.

test('the notice has ONE render call site, and it covers page and tool alike', () => {
  const sites = source.match(/renderGovernanceNotice\(/g) || [];
  assert.equal(sites.length, 3,
    'expected the definition + fdRender\'s mount + refreshGovernanceNotice\'s late swap, no more: '
    + 'a second render site is how the page path and the tool path drift apart again');
  assert.match(source, /fdMount\('governanceNotice', fdSurface\('governance'/,
    'fdRender must write the notice to its own mount');
  assert.match(source, /renderGovernanceNotice\(govItem\)/);
});

test('the tool pane no longer renders a notice of its own', () => {
  const pane = source.slice(source.indexOf("'<div class=\"fd-toolpane\">'"));
  assert.doesNotMatch(pane.slice(0, 300), /renderGovernanceNotice/,
    'two notices for one tool is exactly the duplication the single call site removes');
});

test('the notice is mounted OUTSIDE #content, and both DOM readers agree with that', () => {
  assert.match(source, /<div id="governanceNotice"><\/div>/);
  assert.match(source, /function governanceNoticeHost\(\)\{ return document\.getElementById\('governanceNotice'\); \}/);
  const focus = slice('function focusPendingHighNotice()', 'function focusGovernanceNotice');
  assert.match(focus, /governanceNoticeHost\(\)/);
  assert.doesNotMatch(focus, /contentEl\./,
    'a reader still pointed at contentEl finds nothing and silently does nothing');
  const refresh = slice('function refreshGovernanceNotice()', 'function rerenderCurrent()');
  assert.match(refresh, /governanceNoticeHost\(\)/);
  assert.doesNotMatch(refresh, /contentEl\./);
});

test('__progress__ and the bare tabs get no notice — no ledger has ever heard of them', () => {
  assert.match(source, /var govItem=\(!wizard&&openRoute&&openRoute\.k!=='special'\)\?openRoute:null;/,
    'the ROUTE decides, not the surface; and the wizard suppresses it');
});

test('the notice is not part of #content, so a re-render cannot re-fire its role="alert"', () => {
  // The behavioural half: fdRender's return value IS the #content markup, so the notice must not
  // be in it. Inside #content the alert would be re-inserted — and re-shouted — on every tick of a
  // checkbox, because fdMount replaces innerHTML whenever the markup changes.
  const html = makeRender()({ ...BASE, openId: 'a.md' });
  assert.doesNotMatch(html, /governance-notice/);
  assert.match(html, /class="fd-article"/, 'precondition: this render really did open a page');
});

test('focusGovernanceNotice is called from exactly one place: the routed branch of fdFocusAfterRender', () => {
  // Task 5 left it unwired because at the OLD position it ran before announceRoute and lost the
  // focus it had just taken. The order is now announceRoute (focus -> #content) then this.
  const wire = read('frontdoor/fd_wire.js');
  const calls = (wire.match(/focusGovernanceNotice\(/g) || []).length;
  assert.equal(calls, 1, 'one call, inside fdFocusGovernance');
  assert.match(wire, /if\(routed\)\{ fdFocusGovernance\(\); return; \}/,
    'it must run in the branch that fires AFTER fdAnnounce, not inside the render');
  const apply = wire.slice(wire.indexOf('function fdApply('));
  assert.ok(apply.indexOf('fdAnnounce(next)') < apply.indexOf('fdFocusAfterRender('),
    'announceRoute moves focus first; the notice takes it second');
});

test('boot and popstate deliberately do NOT take focus for the notice', () => {
  // Boot: #governanceNotice precedes #content in the document, so on a cold load the notice is
  // already first in reading order — and announceRoute skips its own focus move there too.
  // Popstate: a back press restores a page, it does not re-raise its warning. Neither path calls
  // fdFocusAfterRender, which is the structural form of the function's own fromHistory guard.
  const wire = read('frontdoor/fd_wire.js');
  const popstate = wire.slice(wire.indexOf("addEventListener('popstate'"));
  assert.doesNotMatch(popstate, /fdFocusAfterRender|fdFocusGovernance/);
  const boot = source.slice(source.indexOf('/* ---- front door boot ---- */'));
  assert.doesNotMatch(boot, /fdFocusAfterRender|fdFocusGovernance/);
});

// ---- the crisis-contact block the sheet draws --------------------------------------------------

test('the shell carries the crisis marker in an inert template, and hands it to fdSheet', () => {
  assert.match(source, /<template id="fdCrisisSource"><!-- crisis-block-html --><\/template>/,
    'build_deploy.py replaces the marker; a <template> keeps it out of the painted page');
  assert.match(source, /function fdCrisisHtml\(\)\{/);
  assert.match(source, /fdSheet\(idx, FD_TOPIC_META, st, fdCrisisHtml\(\)\)/,
    'the sheet takes it as a parameter, the same shape fdReader takes its body in');
});

test('the shell hand-maintains no crisis number of its own', () => {
  assert.doesNotMatch(source, /741741|568-1112/,
    'crisis_resources.json is the only source; the shell carries a marker, never a number');
});
