import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = path.join(
  ROOT, '13_Faculty_Resources/Rotation_Curation/rotation-curator.html',
);
const MODULE_PATH = path.join(
  ROOT, '13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js',
);
const MANIFEST_PATH = path.join(
  ROOT, '13_Faculty_Resources/_automation/site_build/site_manifest.json',
);
const CURRICULUM_PATH = path.join(ROOT, 'curriculum.json');
const LEDGER_PATH = path.join(ROOT, '13_Faculty_Resources/reviewed.json');
const MS3_BUILD = path.join(
  ROOT, '13_Faculty_Resources/_automation/site_build/build_deploy.py',
);
const RESIDENT_BUILD = path.join(
  ROOT, '13_Faculty_Resources/_automation/site_build/resident_section.py',
);
const SMOKE_SPEC = path.join(ROOT, 'tests/smoke/rotation-curator.spec.js');
const SMOKE_CONFIG = path.join(ROOT, 'tests/smoke/playwright.config.js');

const source = fs.existsSync(SOURCE_PATH) ? fs.readFileSync(SOURCE_PATH, 'utf8') : '';
const moduleBody = fs.existsSync(MODULE_PATH) ? fs.readFileSync(MODULE_PATH, 'utf8') : '';

test('registers the curator source, manifest, learner-Library exclusion, and pending ledger record', () => {
  assert.ok(source, 'rotation curator source must exist');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.deepEqual(
    manifest.tools.find((entry) => entry[1] === 'rotation-curator.html'),
    [
      '13_Faculty_Resources/Rotation_Curation/rotation-curator.html',
      'rotation-curator.html',
      'Rotation Edition Curator',
    ],
  );

  const curriculum = JSON.parse(fs.readFileSync(CURRICULUM_PATH, 'utf8'));
  const exclusion = curriculum.libraryExclude.find(
    (entry) => entry.ref === 'rotation-curator.html',
  );
  assert.ok(exclusion, 'faculty curator must be excluded from learner Library placement');
  assert.match(exclusion.reason, /faculty curation utility/i);
  assert.match(exclusion.reason, /not learner Library content/i);

  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  assert.deepEqual(ledger['rotation-curator.html'], {
    status: 'pending',
    risk: { kind: 'local-policy', level: 'moderate' },
    reason: 'New account-free faculty curation workflow awaiting faculty and privacy review.',
    at: '2026-08-19',
    by: 'Pending faculty review',
  });
});

test('declares the conservative faculty metadata and account-free pending-review boundary', () => {
  const marker = '<!-- [CLERKSHIP-META v1] tool="Rotation Edition Curator" version="1.0" built="2026-08-19" category="faculty-curation" audience="faculty" settings="self-study" time="20min" clinicalClaim="false" summary="Arrange an audience-locked curriculum and bounded local orientation into an account-free edition link." -->';
  assert.equal(source.split(marker).length - 1, 1);
  assert.match(source, />Faculty rotation edition builder</);
  assert.match(source, /Account-free and not access-controlled/);
  assert.match(source, /Pending faculty and privacy review/);
  assert.doesNotMatch(source, /verified curator|institutionally approved|institutional endorsement/i);
});

test('ships a semantic five-step worksheet with locked context and disabled publication', () => {
  assert.match(source, /<nav[^>]+aria-label="Builder steps"/);
  for (const label of ['Edition', 'Curriculum', 'Schedule', 'Local details', 'Preview and share']) {
    assert.equal(source.split(`>${label}<`).length - 1, 1, `${label} step must appear once`);
  }
  assert.match(source, /id="curatorAudienceLock"/);
  assert.match(source, /id="curatorPathLock"/);
  assert.match(source, /id="curatorEditorMount"/);
  assert.match(source, /id="curatorPreviewMount"/);
  assert.match(source, /<button[^>]+id="curatorGenerate"[^>]+disabled[^>]+aria-disabled="true"/);
  assert.match(source, /min-height:\s*44px/);
  assert.match(source, /@media\s*\(max-width:\s*760px\)/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('declares seven replaceable payload values and expands curator modules in dependency order', () => {
  for (const name of [
    'FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY', 'FD_SITE_MANIFEST',
    'FD_ROLES', 'FD_AUDIENCE', 'FD_CORE_REVISION',
  ]) {
    assert.equal(source.split(`var ${name}=`).length - 1, 1, name);
  }
  const markers = [
    '/*__FD_DATA__*/',
    '/*__FD_EDITION_CONTRACT__*/',
    '/*__FD_EDITION_PROJECT__*/',
    '/*__FD_CURATOR__*/',
  ];
  let previous = -1;
  for (const marker of markers) {
    assert.equal(source.split(marker).length - 1, 1, marker);
    assert.ok(source.indexOf(marker) > previous, `${marker} must preserve dependency order`);
    previous = source.indexOf(marker);
  }
});

test('bounds the canonical topic metadata dose waiver to its one injected assignment', () => {
  assert.doesNotMatch(source, /QA-ALLOW-DOSE(?!-(?:START|END))/);
  const start = '/* QA-ALLOW-DOSE-START: canonical-topic-meta */';
  const end = '/* QA-ALLOW-DOSE-END: canonical-topic-meta */';
  assert.equal(source.split(start).length - 1, 1);
  assert.equal(source.split(end).length - 1, 1);
  assert.match(
    source,
    /\/\* QA-ALLOW-DOSE-START: canonical-topic-meta \*\/\s*var FD_TOPIC_META=\{\};\s*\/\* QA-ALLOW-DOSE-END: canonical-topic-meta \*\//,
  );
});

test('wires a real built-page curator contract into both CI smoke projects', () => {
  assert.ok(fs.existsSync(SMOKE_SPEC), 'built rotation curator smoke contract must exist');
  const smoke = fs.readFileSync(SMOKE_SPEC, 'utf8');
  const config = fs.readFileSync(SMOKE_CONFIG, 'utf8');
  assert.match(smoke, /\/tools\/rotation-curator\.html/);
  assert.equal(config.split("'rotation-curator.spec.js'").length - 1, 2);
});

test('initial reducer keeps audience and duration locked while publication stays unavailable', () => {
  assert.ok(moduleBody, 'curator module must exist');
  const api = new Function(`${moduleBody}\nreturn {fdCuratorInitialState,fdCuratorReduce};`)();
  const ms3 = api.fdCuratorInitialState(
    { path: { id: 'ms3-six-week', weekCount: 6 } },
    { audience: 'ms3', coreRevision: 'a'.repeat(40) },
  );
  const resident = api.fdCuratorInitialState(
    { path: { id: 'resident-four-week', weekCount: 4 } },
    { audience: 'resident', coreRevision: 'b'.repeat(40) },
  );
  assert.deepEqual(ms3.site, {
    audience: 'ms3', pathId: 'ms3-six-week', weekCount: 6,
    coreRevision: 'a'.repeat(40),
  });
  assert.deepEqual(resident.site, {
    audience: 'resident', pathId: 'resident-four-week', weekCount: 4,
    coreRevision: 'b'.repeat(40),
  });
  assert.equal(api.fdCuratorReduce(ms3, { type: 'GO_TO_STEP', step: 5 }).step, 5);
  assert.equal(api.fdCuratorReduce(ms3, { type: 'ENABLE_GENERATION' }).generateEnabled, false);
  assert.equal(ms3.generateEnabled, false);
});

test('both audience builders inject index and curator destinations after final audience projection', () => {
  for (const [label, filename] of [['ms3', MS3_BUILD], ['resident', RESIDENT_BUILD]]) {
    const build = fs.readFileSync(filename, 'utf8');
    if (label === 'ms3') {
      assert.match(
        build,
        /_tool\("rotation-curator\.html","Faculty: Curate a rotation edition",True\)/,
      );
    } else {
      assert.match(
        build,
        /\{"t":"Faculty: Curate a rotation edition","f":"rotation-curator\.html","k":"tool","hidden":True\}/,
      );
    }
    assert.match(
      build,
      /_frontdoor_destinations\s*=\s*\(\s*OUT\+"\/index\.html",\s*OUT\+"\/tools\/rotation-curator\.html"\s*\)/,
      `${label} must use the fixed destination tuple`,
    );
    assert.match(build, /for _frontdoor_destination in _frontdoor_destinations:/);
    assert.match(build, /inject_frontdoor_payload\(\s*_frontdoor_destination,/);
  }
});
