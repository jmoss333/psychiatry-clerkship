import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const HTML = readFileSync(new URL(
  '../13_Faculty_Resources/Rotation_Curation/rotation-curator.html', import.meta.url,
), 'utf8');
const LEARNER = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url,
), 'utf8');
const COMMON = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/common.py', import.meta.url,
), 'utf8');
const CURATOR = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js', import.meta.url,
), 'utf8');
const SALVAGE = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_v1_salvage.js', import.meta.url,
), 'utf8');

test('curator page keeps the account-free pending-review boundary and disabled publication', () => {
  assert.match(HTML, />Faculty rotation edition builder</);
  assert.match(HTML, /Account-free and not access-controlled/);
  assert.match(HTML, /Pending faculty and privacy review/);
  assert.doesNotMatch(HTML, /verified curator|institutionally approved|institutional endorsement/i);
  assert.match(HTML, /<button[^>]+id="curatorGenerate"[^>]+disabled[^>]+aria-disabled="true"/);
  assert.match(HTML, /min-height:\s*44px/);
  assert.match(HTML, /@media\s*\(max-width:\s*760px\)/);
  assert.match(HTML, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('curator-only salvage injects after catalog and contract and before curator state', () => {
  const markers = [
    '/*__FD_DATA__*/', '/*__FD_EDITION_CATALOG__*/', '/*__FD_EDITION_CONTRACT__*/',
    '/*__FD_EDITION_PROJECT__*/', '/*__FD_EDITION_V1_SALVAGE__*/', '/*__FD_CURATOR__*/',
  ];
  let prior = -1;
  for (const marker of markers) {
    assert.equal(HTML.split(marker).length - 1, 1, marker);
    const at = HTML.indexOf(marker); assert.ok(at > prior, `${marker} dependency order`); prior = at;
  }
  assert.match(COMMON, /"\/\*__FD_EDITION_V1_SALVAGE__\*\/":\s*"frontdoor\/fd_edition_v1_salvage\.js"/);
  assert.match(SALVAGE, /var fdEditionV1ValidateForSalvage;/);
  assert.match(SALVAGE, /var fdEditionV1Salvage;/);
});

test('v1 salvage marker and parsing symbols are absent from learner source', () => {
  for (const token of [
    '/*__FD_EDITION_V1_SALVAGE__*/', 'fdEditionV1ValidateForSalvage', 'fdEditionV1Salvage',
  ]) assert.equal(LEARNER.includes(token), false, token);
  assert.equal(LEARNER.includes('fd_edition_v1_salvage.js'), false);
});

test('bootstrap snapshots the audience catalog before mount and passes the exact v2 mount contract', () => {
  const snapshot = HTML.indexOf('fdEditionCatalogSnapshot(FD_ROTATION_EDITION_CATALOG,FD_CURATOR_CONTEXT.audience');
  const mount = HTML.indexOf('fdCuratorMount(document.getElementById(\'root\'),FD_INDEX,FD_CURATOR_CONTEXT,fdCatalogSnapshot,fdGenerationDate,fdCuratorDependencies)');
  assert.ok(snapshot > -1 && mount > snapshot);
  assert.match(HTML, /fdCuratorLocalGenerationDate\(fdLocalCalendar\)/);
  assert.match(HTML, /getFullYear:function\(\)\{return fdNow\.getFullYear\(\);\}/);
  assert.match(HTML, /getMonth:function\(\)\{return fdNow\.getMonth\(\);\}/);
  assert.match(HTML, /getDate:function\(\)\{return fdNow\.getDate\(\);\}/);
  assert.doesNotMatch(HTML.slice(HTML.indexOf('var fdGenerationDate=')), /toISOString\(/);
});

test('snapshot failure uses fixed unavailable markup without calling curator mount', () => {
  assert.match(HTML, /fdCuratorCatalogUnavailable\(document\.getElementById\('root'\)\)/);
  assert.match(CURATOR, /Rotation edition catalog unavailable/);
  const failure = HTML.slice(HTML.indexOf('if(!prepared||prepared.ok!==true'));
  assert.ok(failure.indexOf('fdCuratorCatalogUnavailable') < failure.indexOf('fdCuratorMount('));
});

test('site context carries the complete v2 revision and gate boundary', () => {
  assert.match(HTML, /var FD_CURATOR_CONTEXT=\{audience:FD_AUDIENCE,pathId:FD_INDEX\.path\.id,coreRevision:FD_CORE_REVISION,/);
  assert.match(HTML, /localCatalogRevision:fdRotationCatalogContextValue\.localCatalogRevision,/);
  assert.match(HTML, /rotationEditionV2:fdRotationCatalogContextValue\.rotationEditionV2\};/);
  for (const name of [
    'FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY', 'FD_SITE_MANIFEST',
    'FD_ROLES', 'FD_AUDIENCE', 'FD_CORE_REVISION', 'FD_ROTATION_EDITION_CATALOG',
  ]) assert.equal(HTML.split(`var ${name}=`).length - 1, 1, name);
});

test('Steps 1 through 3 retain semantic mounts and native navigation', () => {
  assert.match(HTML, /<nav[^>]+aria-label="Builder steps"/);
  for (const label of ['Edition', 'Curriculum', 'Schedule', 'Local details', 'Preview and share']) {
    assert.equal(HTML.split(`>${label}<`).length - 1, 1, label);
  }
  assert.match(HTML, /id="curatorEditorMount"/);
  assert.match(HTML, /id="curatorPreviewMount"/);
  assert.match(CURATOR, /function fdCuratorStepOneMarkup\(/);
  assert.match(CURATOR, /function fdCuratorCurriculumMarkup\(/);
  assert.match(CURATOR, /function fdCuratorScheduleMarkup\(/);
});
