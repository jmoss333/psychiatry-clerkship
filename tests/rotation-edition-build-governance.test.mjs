import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

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

test('published trees contain neither raw catalog source nor governance source', () => {
  for (const site of ['ms3', 'res']) {
    const output = join(root, '_build', site);
    if (!existsSync(output)) continue;
    assert.equal(existsSync(join(output, 'rotation_edition_catalog.json')), false);
    assert.equal(existsSync(join(output, 'rotation_edition_catalog_governance.json')), false);
  }
});
