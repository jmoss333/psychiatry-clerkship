import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url,
), 'utf8');
const due = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js', import.meta.url,
), 'utf8');
const shellModule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js', import.meta.url,
), 'utf8');
const wireModule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js', import.meta.url,
), 'utf8');
const capsule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sess_capsule.js', import.meta.url,
), 'utf8');
const stateModule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js', import.meta.url,
), 'utf8');
const readingPlaceModule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_reading_place.js', import.meta.url,
), 'utf8');
const todayModule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js', import.meta.url,
), 'utf8');
const frontdoorCss = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css', import.meta.url,
), 'utf8');
const reviewed = readFileSync(new URL(
  '../13_Faculty_Resources/reviewed.json', import.meta.url,
), 'utf8');
const staticQa = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/check-static-site.mjs', import.meta.url,
), 'utf8');

const activeLearningPathConsumers = [
  '../13_Faculty_Resources/_automation/site_build/build_deploy.py',
  '../13_Faculty_Resources/_automation/site_build/resident_section.py',
  '../13_Faculty_Resources/_automation/site_build/common.py',
  '../13_Faculty_Resources/_automation/validate_tool_governance.py',
  '../13_Faculty_Resources/_automation/surface_governance.py',
  '../13_Faculty_Resources/_automation/validate_curriculum.py',
  '../_prototypes/sp-interview/tests/ci-build-contract.test.mjs',
  '../curriculum.json',
  '../tests/smoke/playwright.config.js',
  '../tests/smoke/visual-regression.spec.js',
  '../tests/smoke/ward-capture.spec.js',
].map((relative) => [relative, readFileSync(new URL(relative, import.meta.url), 'utf8')]);

function count(needle) { return source.split(needle).length - 1; }

test('build injection emits one reading-place module after state and before consumers', () => {
  const marker = '/*__FD_READING_PLACE__*/';
  assert.equal(count(marker), 1, 'one source marker');
  const directory = mkdtempSync(join(tmpdir(), 'fd-reading-place-injection-'));
  const output = join(directory, 'index.html');
  try {
    copyFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), output);
    const script = [
      'import sys',
      'sys.path.insert(0, sys.argv[1])',
      'import common',
      'assert common.inject_shared_snippets(sys.argv[2])',
    ].join('\n');
    const result = spawnSync('python3', ['-c', script,
      new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url).pathname, output],
    { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const emitted = readFileSync(output, 'utf8');
    assert.equal(emitted.includes(marker), false, 'marker was replaced');
    assert.equal(emitted.split(readingPlaceModule).length - 1, 1, 'exact canonical module bytes emitted once');
    assert.ok(emitted.indexOf(stateModule) < emitted.indexOf(readingPlaceModule)
      && emitted.indexOf(readingPlaceModule) < emitted.indexOf('var FD_CURRICULUM='),
    'state, reading-place helper, then Front Door consumers');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function shellFunction(name) {
  const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert.ok(match, `${name} is available for behavioral tests`);
  return match[0];
}

function dockHarness(preview = false) {
  let primary = { id: 'primary-reader', label: 'Mark done' }, guide = false;
  const host = { querySelector(selector) {
    if (selector === '.fd-reader--guide') return guide ? {} : null;
    if (selector === '[data-fd-dock-source]' && primary) return {
      getAttribute: key => key === 'data-fd-dock-source' ? primary.id : primary.label,
    };
    return null;
  } };
  const doc = { activeElement: null };
  let markup = '', controls = [];
  const mount = {
    get innerHTML() { return markup; },
    set innerHTML(value) {
      if (controls.includes(doc.activeElement)) doc.activeElement = null;
      for (const node of controls) node.isConnected = false;
      markup = value;
      controls = [...value.matchAll(/<button\b([^>]*)>/g)].map(match => {
        const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]]));
        return { isConnected: true, parentNode: mount,
          getAttribute: key => attrs[key] ?? null, setAttribute: (key, value) => { attrs[key] = value; },
          focus(options) { doc.activeElement = this; this.focusOptions = options; } };
      });
    },
    contains: node => controls.includes(node),
    replaceChild(node, old) {
      const index = controls.indexOf(old);
      assert.notEqual(index, -1);
      controls[index] = node;
      old.isConnected = false;
      node.isConnected = true;
      node.parentNode = mount;
    },
    querySelector(selector) {
      const match = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      return match ? controls.find(node => match[2] === undefined
        ? node.getAttribute(match[1]) !== null : node.getAttribute(match[1]) === match[2]) || null : null;
    },
  };
  const render = new Function('contentEl', 'fdDockMount', 'facultyPreviewRequest', 'document', `
    ${stateModule}
    function fdClone(state){return JSON.parse(JSON.stringify(state));}
    function fdEsc(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
    ${shellModule}
    ${wireModule.slice(wireModule.indexOf('function fdDockSource('), wireModule.indexOf('function fdForwardDockAction('))}
    function fdLiveState(state){return state;}
    ${shellFunction('fdRenderDock')}
    return fdRenderDock;
  `)(host, mount, preview, doc);
  return { host, mount, render, doc, primary(value) { primary = value; }, guide(value) { guide = value; } };
}

test('same-route dock refresh preserves the focused action without scrolling', () => {
  const h = dockHarness(), state = { screen: 'app', tab: 'today', openId: 'a.md' };
  h.render(state);
  const old = h.mount.querySelector('[data-fd-dock-forward="primary-reader"]');
  old.focus();
  h.primary({ id: 'primary-reader', label: 'Next: Page B →' });
  h.render(state, true);
  const fresh = h.mount.querySelector('[data-fd-dock-forward="primary-reader"]');
  assert.notEqual(fresh, old);
  assert.equal(h.doc.activeElement, fresh);
  assert.deepEqual(fresh.focusOptions, { preventScroll: true });
});

test('dock refresh does not take focus from content, dialogs, navigation, or an absent successor', () => {
  const state = { screen: 'app', tab: 'today', openId: 'a.md' };
  for (const outside of ['content', 'Search', 'Capture', 'overlay']) {
    const h = dockHarness(); h.render(state);
    const focused = { name: outside }; h.doc.activeElement = focused;
    h.render(state, true);
    assert.equal(h.doc.activeElement, focused);
  }
  for (const overlay of [{ searchOpen: true }, { sheet: 'safety' }]) {
    const h = dockHarness(); h.render(state);
    h.mount.querySelector('[data-fd-dock-forward="primary-reader"]').focus();
    h.render({ ...state, ...overlay }, true);
    assert.equal(h.doc.activeElement, null, 'overlay owns its focus transition');
  }
  const h = dockHarness(); h.render(state);
  h.mount.querySelector('[data-fd-dock-forward="primary-reader"]').focus();
  h.render({ ...state, openId: 'b.md' });
  assert.equal(h.doc.activeElement, null, 'full navigation owns focus');
  h.mount.querySelector('[data-fd-dock-forward="primary-reader"]').focus();
  h.primary(null); h.render(state, true);
  assert.equal(h.doc.activeElement, null, 'no equivalent action means no invented target');
});

test('dock refresh retains overlay invokers and Capture expanded state without moving dialog focus', () => {
  const h = dockHarness(), state = { screen: 'app', tab: 'today' };
  h.render(state);
  const search = h.mount.querySelector('[data-fd-search]');
  const capture = h.mount.querySelector('[data-capture-open]');
  capture.setAttribute('aria-expanded', 'true');
  const input = { name: 'overlay input' };
  h.doc.activeElement = input;
  for (const next of [state, { ...state, searchOpen: true }]) {
    h.primary({ id: 'primary-resume', label: 'Resume' });
    h.render(next);
    assert.equal(h.mount.querySelector('[data-fd-search]'), search, 'Search restores the exact dock opener');
    assert.equal(h.mount.querySelector('[data-capture-open]'), capture, 'Capture retains the exact dock opener');
    assert.equal(search.isConnected, true);
    assert.equal(capture.isConnected, true);
    assert.equal(capture.getAttribute('aria-expanded'), 'true');
    assert.equal(h.doc.activeElement, input);
    assert.match(h.mount.innerHTML, /data-fd-dock-forward="primary-resume">Resume/);
  }
});

test('dock refresh uses the live source and clears learner actions on excluded screens', () => {
  const h = dockHarness(), state = { screen: 'app', tab: 'today' };
  h.render(state);
  assert.match(h.mount.innerHTML, /data-fd-dock-forward="primary-reader">Mark done/);
  h.primary({ id: 'primary-resume', label: 'Resume' });
  h.render(state);
  assert.match(h.mount.innerHTML, /data-fd-dock-forward="primary-resume">Resume/);
  assert.doesNotMatch(h.mount.innerHTML, /primary-reader/);
  assert.equal(state.dockAction, undefined, 'derived action never mutates live state');
  h.primary(null); h.render(state);
  assert.match(h.mount.innerHTML, /data-fd-tab="library">Browse/);
  h.guide(true); h.render(state);
  assert.match(h.mount.innerHTML, /data-capture-open/, 'enhanced guides retain the learner dock');
  h.guide(false); h.render({ screen: 'setup' });
  assert.equal(h.mount.innerHTML, '');
  const preview = dockHarness(true); preview.render(state);
  assert.equal(preview.mount.innerHTML, '');
});

test('completion patch updates the dock label with the preserved reader control', () => {
  const button = (label) => ({
    attrs: { 'data-fd-toggle': 'a.md', 'data-fd-dock-label': label, 'aria-pressed': label === 'Mark done' ? 'false' : 'true' },
    innerHTML: `<span>${label}</span>`,
    parentNode: { classList: { contains: name => name === 'fd-actionbar' } },
    getAttribute(key) { return this.attrs[key] ?? null; },
    setAttribute(key, value) { this.attrs[key] = value; },
  });
  const current = button('Mark done'), fresh = button('Next: Page B →');
  const host = { querySelectorAll: () => [current], querySelector: () => null };
  const doc = { createElement: () => ({ querySelectorAll: () => [fresh], querySelector: () => null }) };
  const patch = new Function('contentEl', 'document', 'fdLiveState', 'fdReader', 'FD_INDEX',
    `${shellFunction('fdPatchCompletion')} return fdPatchCompletion;`)(host, doc, state => ({ ...state }), () => '', {});
  patch({ openId: 'a.md' });
  assert.equal(current.getAttribute('data-fd-dock-label'), 'Next: Page B →');
  assert.equal(current.getAttribute('aria-pressed'), 'true');
});

for (const ok of [true, false]) test(`resource ${ok ? 'tool mount' : 'load failure'} refreshes the dock from the final DOM`, async () => {
  const h = dockHarness();
  const state = { screen: 'app', openId: 'tool.html', tab: 'today' };
  h.render(state);
  const open = new Function('contentEl', 'fdRenderDock', 'fdOpenResource', `
    var FD_INDEX={byRef:{'tool.html':{kind:'tool',title:'Tool'}}}, facultyPreviewRequest=null;
    var fdController=null, fdGuideBookmark=null, currentItem=null, location={search:''};
    var localStorage={setItem:function(){}}, facultyPreviewMatchesItem=null, showFacultyPreviewLockNotice=null, postFacultyPreviewStatus=null;
    function fdDisposeGuide(){} function fdDisposeReadingPlace(){} function fdLiveState(s){return s;} function fdPracticeLaunchSearch(){return '';}
    function fdLegacyItem(item,ref){return {f:ref};} function renderGovernanceNotice(){return '';}
    function setLearnerTitle(){} function announceRoute(){} function focusGovernanceNotice(){}
    ${shellFunction('fdOpenResourceLive')}
    return fdOpenResourceLive;
  `)(h.host, h.render, async () => {
    h.primary(ok ? { id: 'primary-reader', label: 'Next: Page B →' } : null);
    return ok;
  });
  assert.equal(await open('tool.html', { state }), ok);
  if (ok) assert.match(h.mount.innerHTML, />Next: Page B →<\/button>/);
  else {
    assert.doesNotMatch(h.mount.innerHTML, /data-fd-dock-forward/);
    assert.match(h.mount.innerHTML, />Browse<\/button>/);
  }
});

test('the source body is the single live Front Door shell', () => {
  assert.equal(count('class="fd-shell"'), 1, 'one shell root');
  assert.equal((source.match(/<main\b/g) || []).length, 1, 'one main landmark');
  assert.equal(count('id="content"'), 1, 'one stable resource host');
  assert.equal(count('id="routeStatus"'), 1, 'one route live region');
  assert.equal(count('id="governanceMount"'), 1, 'one stable governance mount');
  assert.equal(count('id="fdOverlayMount"'), 1, 'one overlay mount');
  assert.equal(count('id="fdNudgeMount"'), 1, 'one nudge mount');
  assert.equal(count('id="fdDockMount"'), 1, 'one stable dock mount');
  assert.doesNotMatch(source, /<aside id="side"|id="modetoggle"|id="modeCompanion"/);
});

test('the learner dock follows each base render and refreshes after a completion patch', () => {
  const mount = source.indexOf('id="fdDockMount"');
  const main = source.indexOf('id="content"');
  assert.ok(mount > -1 && mount < main, 'dock mount is a shell sibling before main');
  const helper = source.slice(source.indexOf('function fdRenderDock('), source.indexOf('function fdProgressMarkup(state)'));
  assert.match(helper, /state\.screen==='app'&&!facultyPreviewRequest/);
  assert.match(helper, /fdDockSource\(contentEl\)/);
  assert.match(helper, /fdClone\(fdLiveState\(state\)\)/);
  assert.match(helper, /fdDock\(live\)/);
  const base = source.slice(source.indexOf('function fdRender(state,detail)'), source.indexOf('function fdPatchCompletion(state)'));
  assert.ok(base.indexOf('contentEl.innerHTML=fdBaseMarkup(state)') < base.indexOf('fdRenderDock(state)'),
    'dock reads the newly rendered source');
  const transient = source.slice(source.indexOf('function fdRenderTransient(state,detail)'), source.indexOf('function fdOpenProgress(state,opts)'));
  assert.match(transient, /if\(surfaces\.base\|\|surfaces\.completion\)fdRenderDock\(state,true\)/);
});

test('the shell has one build-replaced edition context and ordered v2 catalog modules', () => {
  for (const marker of ['FD_EDITION_CATALOG', 'FD_EDITION_CONTRACT', 'FD_EDITION_PROJECT', 'FD_EDITION_STUDENT']) {
    assert.equal(count(`/*__${marker}__*/`), 1, `${marker} marker`);
  }
  for (const name of ['FD_AUDIENCE', 'FD_CORE_REVISION']) {
    assert.equal((source.match(new RegExp(`var ${name}=\\"\\";`, 'g')) || []).length, 1,
      `${name} JSON literal`);
  }
  assert.equal((source.match(/var FD_ROTATION_EDITION_CATALOG=\{\};/g) || []).length, 1,
    'one build-replaced rotation catalog projection');
  const data = source.indexOf('/*__FD_DATA__*/');
  const catalog = source.indexOf('/*__FD_EDITION_CATALOG__*/');
  const edition = source.indexOf('/*__FD_EDITION_CONTRACT__*/');
  const consumer = source.indexOf('/*__FD_TODAY__*/');
  assert.ok(data > -1 && data < catalog && catalog < edition && edition < consumer,
    'catalog must prepare before the contract and all edition consumers');
});

test('edition validation selects the only live index before the learner shell starts', () => {
  assert.equal(count('var FD_CANONICAL_INDEX=fdBuildIndex('), 1,
    'the audience-correct canonical index is created exactly once');
  assert.equal(count('var FD_INDEX=FD_CANONICAL_INDEX;'), 1,
    'the live index starts from that one canonical index');
  assert.doesNotMatch(source, /var FD_INDEX=fdBuildIndex\(/,
    'the retired synchronous index-and-render boot must stay absent');

  const snapshotCall = source.indexOf('fdEditionCatalogSnapshot(FD_ROTATION_EDITION_CATALOG,FD_SITE_CONTEXT.audience');
  const resolveCall = source.indexOf('fdEditionResolveStartup(FD_CANONICAL_INDEX,fdCatalogSnapshot');
  assert.ok(snapshotCall > -1 && snapshotCall < resolveCall,
    'the branded catalog snapshot must settle before learner resolution');
  assert.ok(resolveCall > -1, 'startup must resolve stored and incoming editions');
  assert.match(source.slice(resolveCall), /\.then\(fdStartFrontDoor\)/,
    'the resolver must hand the selected result to the only shell starter');

  const start = source.indexOf('async function fdStartFrontDoor(result)');
  const end = source.indexOf('\n  var fdEditionInputs=', start);
  assert.ok(start > -1 && end > start, 'one deferred shell starter is required');
  const body = source.slice(start, end);
  const selection = body.indexOf('FD_INDEX=result.index');
  assert.ok(selection > -1, 'the resolver result must select FD_INDEX');
  for (const consumer of ['fdRotationWeek(', 'fdResolveState(', 'fdRender(', 'fdWire(']) {
    assert.ok(body.indexOf(consumer) > selection,
      `${consumer} must run only after the edition index is selected`);
  }
  assert.match(source, /id="fdApp" class="fd-shell" aria-busy="true" inert/,
    'the initial shell must expose a native noninteractive pending resolver state');
  assert.match(body, /releaseStartupGate:function\(\)\{return fdEditionRuntimeReleaseGate\(fdApp\);\}/,
    'the controller commit must own the atomic inert and busy release');
});

test('startup makes acceptance the final fallible boundary after real wiring, rendering, resources, history, and gate release', () => {
  const start = source.indexOf('async function fdStartFrontDoor(result)');
  const end = source.indexOf('\n  var fdEditionInputs=', start);
  assert.ok(start > -1 && end > start, 'the shell starter must expose an awaited transaction');
  const body = source.slice(start, end);
  const ordinaryStart = body.indexOf("if(result.mode==='switch-required'");
  assert.ok(ordinaryStart > -1, 'ordinary v2 startup follows the terminal prerelease branch');
  const ordinary = body.slice(ordinaryStart);
  const keys = ordinary.indexOf('fdEditionStorageKeys(FD_SITE_CONTEXT.audience)');
  const checkpoint = ordinary.indexOf('fdEditionStartupJournal(');
  const stateLoad = ordinary.indexOf('fdLoad()');
  const preflight = ordinary.indexOf('fdEditionRuntimePreflightWiring(');
  const wire = ordinary.indexOf('fdWire(');
  const open = ordinary.indexOf('await fdOpenInitialResource(');
  const prepare = ordinary.indexOf('fdController.prepareStartup()');
  const commit = ordinary.indexOf('fdController.commitStartup()');
  const acceptanceCallback = ordinary.indexOf('fdController.commitStartup(function(){');
  const acceptance = ordinary.indexOf('fdEditionCommitAcceptance(', acceptanceCallback);
  const rejectedMount = ordinary.indexOf("result.mode==='rejected'&&!fdEditionRuntimeMountError(");
  const rejectedFocus = ordinary.indexOf(
    "result.mode==='rejected'&&!fdEditionRuntimeFocusError(fdEditionMount)", acceptanceCallback,
  );
  assert.ok(keys > -1 && keys < checkpoint && checkpoint < stateLoad && stateLoad < preflight
    && preflight < wire && wire < open && open < prepare && prepare < acceptanceCallback
    && acceptanceCallback < acceptance,
  'all real wiring/render/resource/history/gate preparation must precede the acceptance callback');
  assert.ok(rejectedMount > -1 && rejectedMount < prepare && acceptance < rejectedFocus,
    'a rejected edition must mount while inert and receive focus only after prepare and commit succeed');
  assert.ok(commit < 0 || commit === acceptanceCallback,
    'there must be no unguarded controller commit call');
  assert.equal((ordinary.match(/fdEditionCommitAcceptance\(/g) || []).length, 1,
    'acceptance has exactly one guarded call site');
  const prepareStart = wireModule.indexOf('function prepareStartup()');
  const commitStart = wireModule.indexOf('function commitStartup(', prepareStart);
  const controllerStart = wireModule.indexOf('\n  function controller(', commitStart);
  const prepareBody = wireModule.slice(prepareStart, commitStart);
  const commitBody = wireModule.slice(commitStart, controllerStart);
  const history = prepareBody.indexOf('replaceHistorySnapshot()');
  const gate = prepareBody.indexOf('o.releaseStartupGate');
  const prepared = prepareBody.indexOf('startupPrepared=true');
  const accept = commitBody.indexOf('acceptStartup');
  const armed = commitBody.indexOf('startupCommitted=true');
  assert.ok(history > -1 && history < gate && gate < prepared,
    'history and gate release must finish in the fallible prepare phase');
  assert.ok(accept > -1 && accept < armed, 'acceptance must immediately precede arming');
  assert.doesNotMatch(commitBody, /replaceHistorySnapshot|releaseStartupGate|addEventListener|render|openResource/,
    'no fallible UI, listener, history, resource, or gate work may follow the prepare phase');
  assert.doesNotMatch(source, /fdEditionCheckpointStorage|fdEditionRestoreStorage/,
    'startup rollback must not snapshot or diff the entire localStorage namespace');
});

test('runtime fallback releases the gate before mounting and focusing one fixed edition error', () => {
  const start = source.indexOf('function fdEditionRuntimeFallback(receipt,state)');
  const end = source.indexOf('\n  async function fdStartFrontDoor(result)', start);
  assert.ok(start > -1 && end > start, 'one runtime fallback is required');
  const fallback = source.slice(start, end);
  const gate = fallback.indexOf('fdEditionRuntimeReleaseGate(fdApp)');
  const mount = fallback.indexOf('fdEditionRuntimeMountError(fdEditionMount');
  const focus = fallback.indexOf('fdEditionRuntimeFocusError(fdEditionMount)', mount);
  assert.ok(gate > -1 && gate < mount && mount < focus,
    'fallback must leave the shell interactive before moving focus to its mounted error');
});

test('an unsupported prerelease v1 link renders canonical core and stops before journals or listeners', () => {
  const start = source.indexOf('async function fdStartFrontDoor(result)');
  const end = source.indexOf('\n  var fdEditionInputs=', start);
  assert.ok(start > -1 && end > start, 'the shell starter must exist');
  const body = source.slice(start, end);
  const rejection = body.indexOf("result.receipt.code==='EDITION_PRERELEASE_UNSUPPORTED'");
  const journal = body.indexOf('fdEditionStartupJournal(');
  const wire = body.indexOf('fdWire(');
  assert.ok(rejection > -1 && rejection < journal && rejection < wire,
    'the prerelease rejection must terminate before any startup journal or listener wiring');
  const branchEnd = body.indexOf('\n  }', rejection);
  const branch = body.slice(rejection, branchEnd);
  assert.match(branch, /FD_INDEX=FD_CANONICAL_INDEX/,
    'the terminal prerelease branch must retain the canonical core index');
  assert.match(branch, /fdRender\(/, 'the terminal prerelease branch must render canonical core');
  assert.match(branch, /fdEditionRuntimeMountError\(/,
    'the terminal prerelease branch must show the fixed rejection');
  assert.match(branch, /fdEditionRuntimeReleaseGate\(fdApp\)/,
    'the terminal prerelease branch must release the pending shell without listeners');
  assert.ok(branch.indexOf('fdEditionRuntimeReleaseGate(fdApp)')
    < branch.indexOf('fdEditionRuntimeFocusError(fdEditionMount)'),
  'the terminal prerelease error can receive focus only after its gate is released');
  assert.match(branch, /return/,
    'the terminal prerelease branch must not fall through to ordinary startup');
});

test('failed-switch direct recovery and local toggles share one trusted candidate identity', () => {
  const recoveryStart = source.indexOf('function fdRecoverCommittedEdition(candidate)');
  const recoveryEnd = source.indexOf('\n  try{', recoveryStart);
  const recovery = source.slice(recoveryStart, recoveryEnd);
  assert.ok(recoveryStart > -1 && recoveryEnd > recoveryStart);
  assert.match(recovery, /FD_INDEX=index;fdActiveEditionSnapshot=recoverySnapshot/,
    'candidate index and trusted snapshot must be adopted together before render');
  assert.match(recovery, /FD_INDEX=previousIndex;fdActiveEditionSnapshot=previousSnapshot/,
    'failed direct rendering must restore both prior runtime identities');

  const clickStart = source.indexOf('function fdAuxClick(event)');
  const clickEnd = source.indexOf('\n    el=target.closest&&target.closest(\'[data-capture-open]\')', clickStart);
  const localClick = source.slice(clickStart, clickEnd);
  assert.match(localClick, /fdEditionActiveIdentity\(fdActiveEditionSnapshot,FD_INDEX\)/);
  assert.doesNotMatch(localClick, /FD_INDEX\.edition\.fingerprint/,
    'authorization, storage, and refresh must not derive identity independently');
});

test('the retired sidebar, legacy search/nav boot, companion, and dashboard are absent', () => {
  assert.doesNotMatch(source, /fetch\('nav\.json'\)/);
  for (const name of ['renderModeCompanion', 'renderWardDashboard', 'itemsForMode',
    'scoreItemForMode', 'renderHome', 'renderStart', 'showPath', 'reflectLibrary']) {
    assert.doesNotMatch(source, new RegExp(`function\\s+${name}\\s*\\(`), `${name} must be retired`);
  }
  const script = source.slice(source.indexOf('<body>'));
  assert.doesNotMatch(script, /#nav\b|searchEl\.addEventListener/,
    'no removed sidebar/search DOM consumer may boot');
});

test('fdRender guards every live surface independently', () => {
  assert.equal((source.match(/function fdRender\(state,detail\)/g) || []).length, 1);
  for (const surface of ['today', 'path', 'library', 'reader', 'progress']) {
    assert.match(source, new RegExp(`fdSurface\\('${surface}'`),
      `${surface} must have its own guarded render`);
  }
  assert.match(source, /function fdRenderTransient\(state,detail\)/);
  assert.match(source, /d\.preserveResource/);
  assert.match(source, /d\.effect&&d\.effect\.mode/);
  assert.match(source, /hydrate=detail&&detail\.kind==='hydrate'/);
  assert.match(source, /if\(!hydrate&&fdChromeMount\)/,
    'background hydration must not replace focused header controls');
});

test('faculty preview ignores the learner tool-width preference', () => {
  const start = source.indexOf('function fdPatchToolLayout(state)');
  const end = source.indexOf('function fdRender(state,detail)', start);
  assert.ok(start > -1 && end > start, 'tool layout patch moved');
  const classes = new Set(['fd-main', 'is-tool-expanded']);
  const readerClasses = new Set(['fd-reader', 'fd-reader--tool', 'is-tool-expanded']);
  const control = {
    pressed: 'true',
    setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; },
  };
  const reader = {
    classList: {
      add(name) { readerClasses.add(name); },
      remove(name) { readerClasses.delete(name); },
    },
    querySelector(selector) { return selector === '[data-fd-expand-tool]' ? control : null; },
  };
  const contentEl = {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
    querySelector(selector) { return selector === '.fd-reader--tool' ? reader : null; },
  };
  // Execute the shipped patch function against the loading Reader that exists immediately
  // before the audited faculty-preview handoff replaces it.
  // eslint-disable-next-line no-new-func
  const patchLayout = new Function('contentEl', 'facultyPreviewRequest',
    `${source.slice(start, end)}; return fdPatchToolLayout;`)(contentEl, { surface: 'tool' });
  patchLayout({ toolExpanded: true });

  assert.equal(classes.has('is-tool-expanded'), false);
  assert.equal(readerClasses.has('is-tool-expanded'), false);
  assert.equal(control.pressed, 'false');
});

test('one live controller owns stable delegated navigation', () => {
  assert.equal((source.match(/=fdWire\(/g) || []).length, 1, 'exactly one controller install');
  assert.match(source, /getState:readState/,
    'resource wrapper must rehydrate the current progress and block for each render');
  assert.match(source, /return facultyPreviewRequest\?state:fdLiveState\(state\)/,
    'preview retains its audited state while learner readers receive live progress');
  assert.match(source, /renderTransient:fdRenderTransient/);
  assert.match(source, /openProgress:fdOpenProgress/);
  assert.match(source, /fdAuxClick/);
  assert.doesNotMatch(source, /__ptBound|\(function capWire\(/,
    'rerender-fragile one-time binders are retired');
});

test('live state delegates duration and membership to the injected path index', () => {
  assert.match(source, /fdRotationWeek\(out\.rotationStart,FD_INDEX\.weeks,out\.nowMs\)/);
  assert.match(source, /fdFindWeek\(FD_INDEX,out\.week\)/);
  assert.match(source, /fdFindWeek\(FD_INDEX,out\.viewWeek\)/);
  assert.match(source, /fdRotationWeek\(fdRotation,FD_INDEX\.weeks,Date\.now\(\)\)/);
});

test('governed resources preserve route/query/history and post-mount state effects', () => {
  for (const needle of ['function renderGovernanceNotice(item)',
    'function refreshGovernanceNotice()', 'function readFacultyPreviewRequest()',
    'function restoreFacultyPreviewRoute()', 'function showFacultyPreviewLockNotice()',
    'function loadFacultyPreviewTool(item,opts,bar)', 'marked.parse', '/*__SW_REGISTER__*/']) {
    assert.ok(source.includes(needle), `${needle} must survive the cutover`);
  }
  assert.match(source, /currentItem=/);
  assert.match(source, /localStorage\.setItem\('cw_last'/);
  assert.match(source, /announceRoute\(/);
  assert.match(source, /focusGovernanceNotice\(/);
  assert.match(due, /\?tool=question-bank-practice\.html&amp;resume=1/);
});

test('canonical learner stores survive and completion remains the legacy object map', () => {
  const keys = ['cw_progress_v1', 'cw_srs_v1', 'cw_quiz_v1', 'cw_qb_v1', 'cw_calib_v1',
    'cw_pretest_v1', 'cw_plan_v1', 'cw_sess_v1', 'cw_capture_v1', 'cw_last', 'cw_study_id',
    'cw_qb_focus', 'cw_shelf_date'];
  const stores = source + capsule;
  for (const key of keys) assert.ok(stores.includes(key), `${key} store disappeared`);
  assert.match(source + stateModule, /fdProgressDoneMap\(/);
  assert.match(source + stateModule, /fdProgressToggle\(/);
  assert.doesNotMatch(source, /cw_frontdoor_v1[^\n]*(?:done|streak|week)/,
    'Front Door state must not duplicate canonical progress/week/streak stores');
});

test('Progress remains an internal reader view with stable delegated capture/pretest/export actions', () => {
  assert.match(todayModule, /data-fd-progress/);
  assert.doesNotMatch(source, /\{id:'progress',label:'Progress'/,
    'Progress is not a fourth top-level tab');
  for (const needle of ['function masteryByBlueprint()', 'function renderCalibPanel()',
    'function weakTopics()', 'function startPretest()', 'function submitPretest()',
    'function renderStoredPlan()', 'window.exportStudy=', 'data-cap-open', 'data-cap-copy',
    'data-progress-action="progress"']) {
    assert.ok(source.includes(needle), `${needle} must remain reachable`);
  }
  // The exam-date control moved to the settings panel. Progress keeps a read-only signpost, and
  // the needles that used to sit in the list above were its input and its writer -- asserting
  // they are ABSENT is what keeps that a move; tests/phase-chip.test.mjs pins the rest.
  assert.ok(!source.includes('data-progress-action="save-exam"'),
    'the exam-date writer belongs to the settings panel now, not to Progress');
});

test('late data hydration refreshes Progress only while its root view is still mounted', () => {
  assert.match(source,
    /if\(state\.openId==='__progress__'&&contentEl\.querySelector\('#pgRoot'\)\)fdOpenProgress/,
    'a delayed metadata/search response must not erase the nested placement or plan view');
});

test('live Reader keeps topic practice, quiz, feedback, and page enhancement behavior delegated', () => {
  assert.match(source, /parseMarkdown:function\(markdown\)/);
  // The reader passes the handheld flag (tests/practice-panel.test.mjs pins both call sites).
  assert.match(source, /buildTpl\(meta,ref,\{open:fdHandheld\(\)\}\)/);
  assert.match(source, /makeCollapsible\(body\)/);
  assert.match(source, /enhanceTables\(body\)/);
  for (const selector of ["closest('.tyo')", "closest('.pgfb-b')", "closest('[data-tool]')"]) {
    assert.ok(source.includes(selector), `${selector} must be owned by the stable root delegate`);
  }
});

test('theme initialization and visible control survive without changing the frozen palette', () => {
  assert.match(source, /localStorage\.getItem\('cw_theme'\)/);
  // The header control is the settings gear; the theme modes themselves are rendered inside the
  // panel it opens. What this pins is unchanged -- the shell still offers a reachable way in.
  assert.match(shellModule, /data-fd-settings/);
  assert.equal(count('frontdoor.css'), 1);
});

test('due, resume, capture, and internal Progress use the frozen Front Door tokens', () => {
  for (const selector of ['.fd-due', '.fd-resume', '.fd-capture', '.fd-progresscard',
    '.fd-progress-reader']) {
    assert.ok(frontdoorCss.includes(selector), `${selector} requires a responsive Front Door rule`);
  }
  const task5Styles = frontdoorCss.slice(frontdoorCss.indexOf('/* Task 5 governed runtime rows */'));
  assert.ok(task5Styles.length > 200, 'Task 5 style block is missing or empty');
  assert.doesNotMatch(task5Styles, /#[0-9a-f]{3,8}\b/i,
    'Task 5 styling must reuse the frozen tokens rather than add palette literals');
});

test('Learning Path has no active consumer while its historical review receipt is preserved', () => {
  for (const [relative, body] of activeLearningPathConsumers) {
    assert.doesNotMatch(body, /learning-path\.html|Learning Path/i,
      `${relative} still actively consumes the retired surface`);
  }
  assert.match(reviewed, /"learning-path\.html"\s*:/,
    'the historical reviewed-ledger receipt must not be deleted');
});

test('the live shell carries no hand-maintained tool map, and static QA covers what replaced them', () => {
  // Every one of these was a second copy of a registry, and each drifted: PRACTICE_LABELS
  // outlived two instrument retirements, PRACTICE_CASE_LABELS fell two cases behind
  // communication_cases.json, PRACTICE_PAGE_TOOLS duplicated relatedTools, PRACTICE_SAFE
  // duplicated tool_registry.riskLevel. The panel reads FD_INDEX and FD_TOOL_REGISTRY instead.
  for (const retired of ['PRACTICE_LABELS', 'PRACTICE_LABEL_NEUTRAL', 'PRACTICE_PAGE_TOOLS',
    'PRACTICE_CASE_LABELS', 'PRACTICE_SAFE']) {
    assert.ok(!new RegExp(`var ${retired}\\s*=`).test(source),
      `${retired} is retired — reinstating it reintroduces the drift it caused`);
  }
  // The shell-map scan is gone with the maps; 4b is what covers those links now, and it must
  // reach all three fields the panel renders links from.
  assert.doesNotMatch(staticQa, /const TOOL_MAP_VARS =/,
    'the shell tool-map scan should be gone along with the maps it scanned');
  for (const field of ['cta', 'clinicalWorkflow.actions', 'relatedTools']) {
    assert.ok(staticQa.includes(field),
      `static QA section 4b must resolve topic_meta ${field} targets against the shipped tree`);
  }
  assert.doesNotMatch(staticQa, /idBlockCheck\('(?:CASE_TITLES|FAMILY_SCENARIO_TITLES)'/,
    'retired shell title maps must not remain mandatory QA inputs');
});

// ---- Phase 3 (F4): the boot never stamps a role onto a deep-link visitor --------------------
//
// Until 2026-09-16 a visitor following a link to one page was silently given FD_ROLES[0] so the
// resolver would not send them to the wizard. fdResolveState now admits that visitor as a guest
// with no role; both boot sites (the main boot and the rejected-edition prerelease path) keep
// `browsing=true` and assign nothing, so the next plain visit runs the wizard from step 1.
test('a deep-link visitor is a guest: the boot keeps browsing but assigns no role, on both boot paths', () => {
  assert.doesNotMatch(source, /fdStored\.role=\(FD_ROLES\[0\]/, 'main boot must not stamp a role');
  assert.doesNotMatch(source, /fdPrereleaseStored\.role=\(FD_ROLES\[0\]/, 'prerelease boot must not stamp a role');
  assert.match(source, /if\(fdIncomingRef&&!fdIsLegacyRouteAlias\(fdIncomingRef\)&&!fdStored\.role\)\{\s*fdStored\.browsing=true;\s*\}/);
  assert.match(source, /if\(fdPrereleaseRef&&!fdIsLegacyRouteAlias\(fdPrereleaseRef\)&&!fdPrereleaseStored\.role\)\{\s*fdPrereleaseStored\.browsing=true;\s*\}/);
  assert.match(wireModule, /out\.guest=true;\s*out\.screen='app';/, 'the resolver, not the boot, owns the guest decision');
});
