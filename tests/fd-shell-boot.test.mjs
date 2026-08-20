import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const capsule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sess_capsule.js', import.meta.url,
), 'utf8');
const stateModule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js', import.meta.url,
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

test('the source body is the single live Front Door shell', () => {
  assert.equal(count('class="fd-shell"'), 1, 'one shell root');
  assert.equal((source.match(/<main\b/g) || []).length, 1, 'one main landmark');
  assert.equal(count('id="content"'), 1, 'one stable resource host');
  assert.equal(count('id="routeStatus"'), 1, 'one route live region');
  assert.equal(count('id="governanceMount"'), 1, 'one stable governance mount');
  assert.equal(count('id="fdOverlayMount"'), 1, 'one overlay mount');
  assert.equal(count('id="fdNudgeMount"'), 1, 'one nudge mount');
  assert.doesNotMatch(source, /<aside id="side"|id="modetoggle"|id="modeCompanion"/);
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

test('startup uses audience v2 keys and preflights fallible wiring before acceptance writes', () => {
  const start = source.indexOf('async function fdStartFrontDoor(result)');
  const end = source.indexOf('\n  var fdEditionInputs=', start);
  assert.ok(start > -1 && end > start, 'the shell starter must expose an awaited transaction');
  const body = source.slice(start, end);
  const ordinaryStart = body.indexOf("if(result.mode==='switch-required'");
  assert.ok(ordinaryStart > -1, 'ordinary v2 startup follows the terminal prerelease branch');
  const ordinary = body.slice(ordinaryStart);
  const keys = ordinary.indexOf('fdEditionStorageKeys(FD_SITE_CONTEXT.audience)');
  const checkpoint = ordinary.indexOf('fdEditionStartupJournal(');
  const acceptance = ordinary.indexOf('fdEditionCommitAcceptance(');
  const armed = ordinary.indexOf('fdEditionAcceptanceDirty=true');
  const stateLoad = ordinary.indexOf('fdLoad()');
  const preflight = ordinary.indexOf('fdEditionRuntimePreflightWiring(');
  const wire = ordinary.indexOf('fdWire(');
  const open = ordinary.indexOf('await fdOpenInitialResource(');
  const commit = ordinary.indexOf('fdController.commitStartup()');
  assert.ok(keys > -1 && keys < checkpoint && checkpoint < stateLoad && stateLoad < preflight
    && preflight < armed && acceptance > armed && acceptance < wire,
  'the two-key v2 transaction must start only after fallible wiring preflight');
  assert.ok(wire > acceptance, 'real listeners must not be installed before acceptance settles');
  assert.ok(open > stateLoad && commit > open,
    'the initial resource receipt must settle before startup history commits');
  assert.doesNotMatch(source, /fdEditionCheckpointStorage|fdEditionRestoreStorage/,
    'startup rollback must not snapshot or diff the entire localStorage namespace');
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
  assert.match(source, /d\.effect&&d\.effect\.theme/);
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
  assert.match(source, /getState:options\.getState\|\|function\(\)\{ return fdController\.getState\(\); \}/,
    'resource wrapper must provide Task 4 live-state access');
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
    'data-progress-action="save-exam"', "localStorage.setItem('cw_shelf_date'"]) {
    assert.ok(source.includes(needle), `${needle} must remain reachable`);
  }
});

test('late data hydration refreshes Progress only while its root view is still mounted', () => {
  assert.match(source,
    /if\(state\.openId==='__progress__'&&contentEl\.querySelector\('#pgRoot'\)\)fdOpenProgress/,
    'a delayed metadata/search response must not erase the nested placement or plan view');
});

test('live Reader keeps topic practice, quiz, feedback, and page enhancement behavior delegated', () => {
  assert.match(source, /parseMarkdown:function\(markdown\)/);
  assert.match(source, /buildTpl\(meta,ref\)/);
  assert.match(source, /makeCollapsible\(body\)/);
  assert.match(source, /enhanceTables\(body\)/);
  for (const selector of ["closest('.tyo')", "closest('.pgfb-b')", "closest('[data-tool]')"]) {
    assert.ok(source.includes(selector), `${selector} must be owned by the stable root delegate`);
  }
});

test('theme initialization and visible control survive without changing the frozen palette', () => {
  assert.match(source, /localStorage\.getItem\('cw_theme'\)/);
  assert.match(shellModule, /data-fd-theme/);
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

test('static QA follows the two literal tool maps that remain in the live shell', () => {
  const declaration = staticQa.match(/const TOOL_MAP_VARS = \[[^\n]+\];/);
  assert.ok(declaration, 'static QA must declare the live shell tool-map inventory');
  assert.equal(declaration[0],
    "const TOOL_MAP_VARS = ['PRACTICE_LABELS', 'PRACTICE_PAGE_TOOLS'];");
  assert.doesNotMatch(staticQa, /idBlockCheck\('(?:CASE_TITLES|FAMILY_SCENARIO_TITLES)'/,
    'retired shell title maps must not remain mandatory QA inputs');
});
