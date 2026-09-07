import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';

const root = new URL('..', import.meta.url).pathname;
const catalog = JSON.parse(readFileSync(join(root, '13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.json'), 'utf8'));
const governance = JSON.parse(readFileSync(join(root, '13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.json'), 'utf8'));
const shell = readFileSync(join(root, '13_Faculty_Resources/_automation/site_build/spa_index.html'), 'utf8');
const curator = readFileSync(join(root, '13_Faculty_Resources/Rotation_Curation/rotation-curator.html'), 'utf8');

test('production catalog remains empty and governance remains disabled', () => {
  assert.deepEqual(catalog, { schemaVersion: 1, records: [] });
  assert.equal(governance.rotationEditionV2, 'disabled');
  assert.deepEqual(governance.dispositions, []);
});

test('both Front Door sources reserve exactly one injected catalog and derive a safe gate context', () => {
  for (const source of [shell, curator]) {
    assert.equal((source.match(/var FD_ROTATION_EDITION_CATALOG=\{\};/g) || []).length, 1);
    assert.match(source, /localCatalogRevision/);
    assert.match(source, /rotationEditionV2/);
  }
});

test('both catalog contexts fail closed unless a digest revision and enabled gate arrive as a valid pair', () => {
  for (const source of [shell, curator]) {
    const start = source.indexOf('function fdRotationCatalogContext(value)');
    const end = source.indexOf('var fdRotationCatalogContextValue=', start);
    assert.ok(start > -1 && end > start, 'source exposes a bounded catalog-context helper');
    const catalogContext = new Function(`${source.slice(start, end)}; return fdRotationCatalogContext;`)();
    const valid = { revision: `sha256-${'A'.repeat(43)}`, rotationEditionV2: 'enabled' };
    assert.deepEqual(catalogContext(valid), { localCatalogRevision: valid.revision, rotationEditionV2: 'enabled' });
    for (const malformed of [
      { revision: 'not-a-digest', rotationEditionV2: 'enabled' },
      { revision: valid.revision, rotationEditionV2: 'other' },
      { revision: valid.revision },
    ]) assert.deepEqual(catalogContext(malformed), { localCatalogRevision: '', rotationEditionV2: 'disabled' });
    let accessorReads = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'revision', { enumerable: true, get() { accessorReads += 1; return valid.revision; } });
    Object.defineProperty(accessor, 'rotationEditionV2', { enumerable: true, get() { accessorReads += 1; return 'enabled'; } });
    assert.deepEqual(catalogContext(accessor), { localCatalogRevision: '', rotationEditionV2: 'disabled' });
    assert.equal(accessorReads, 0);
  }
});

// Inputs that decide whether these two registries can leak into a published tree.
const BUILD_INPUTS = [
  join(root, '13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.json'),
  join(root, '13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.json'),
  join(root, '13_Faculty_Resources/_automation/site_build/build_deploy.py'),
  join(root, '13_Faculty_Resources/_automation/site_build/resident_section.py'),
];

test('published trees contain neither raw catalog source nor governance source', (t) => {
  // A build predating a leak's REMOVAL still contains the leaked file, so an existence-only
  // guard fails here long after the source was fixed — and that red aborts build_and_check.sh
  // before it can rebuild. Skip a stale tree per-site; only skip the whole test if neither
  // tree could be checked, so one fresh tree still enforces the contract.
  const skipped = [];
  let checked = 0;
  for (const site of ['ms3', 'res']) {
    const stale = staleBuildReason(root, site, BUILD_INPUTS);
    if (stale) { skipped.push(stale); continue; }
    const output = join(root, '_build', site);
    assert.equal(existsSync(join(output, 'rotation_edition_catalog.json')), false);
    assert.equal(existsSync(join(output, 'rotation_edition_catalog_governance.json')), false);
    checked += 1;
  }
  if (checked === 0) t.skip(skipped.join(' | '));
});
