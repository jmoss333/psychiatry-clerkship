import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';
import { PANEL_BUILD_INPUTS } from './_panel_render.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const INPUTS = PANEL_BUILD_INPUTS.map(p => path.relative(REPO, p));
const WELCOME_INPUTS = [
  '13_Faculty_Resources/_automation/site_build/welcome_compass.py',
  '14_Tracks/Resident/resident_welcome.meta.json',
];
const OLD = 1_600_000_000;
const BUILT = OLD + 100;
const EDITED = OLD + 200;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-freshness-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(dir, rel, text, time = OLD) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.utimesSync(file, time, time);
  return file;
}

for (const changed of WELCOME_INPUTS) {
  test(`resident Welcome freshness follows ${changed}`, (t) => {
    const dir = fixture(t);
    const inputs = INPUTS.map(rel => write(dir, rel, 'fixture'));
    write(dir, '_build/res/index.html', 'built', BUILT);
    assert.equal(staleBuildReason(dir, 'res', inputs), null);
    // The changed file is written whether or not it was declared. Removing its production
    // entry recreates the false-clean bug and makes this assertion fail.
    const changedFile = write(dir, changed, 'changed', EDITED);
    const reason = staleBuildReason(dir, 'res', inputs);
    assert.ok(reason?.includes(changed), 'the changed Welcome input must invalidate the build');
    assert.match(reason, /is newer than the build/);
    write(dir, '_build/res/index.html', 'rebuilt', EDITED);
    assert.equal(staleBuildReason(dir, 'res', inputs), null);
    fs.rmSync(changedFile);
    assert.throws(() => staleBuildReason(dir, 'res', inputs), /declared build input does not exist/);
  });

  test(`--write preserves both corpora when ${changed} outruns the resident build`, (t) => {
    const dir = fixture(t);
    for (const rel of INPUTS) write(dir, rel, 'fixture');
    write(dir, changed, 'changed', EDITED);
    write(dir, '_build/ms3/index.html', 'built', EDITED + 100);
    write(dir, '_build/res/index.html', 'built', BUILT);
    for (const site of ['ms3', 'res']) write(dir, `tests/__panels__/${site}/welcome.md.html`, 'original');
    write(dir, 'bin/render_panels.mjs', fs.readFileSync(path.join(REPO, 'bin/render_panels.mjs')));
    write(dir, 'tests/_build_freshness.mjs', fs.readFileSync(path.join(REPO, 'tests/_build_freshness.mjs')));
    // Run the real CLI and freshness guard. Only the render result is controlled, so an
    // omitted input or premature write would replace the sentinel snapshots and fail.
    write(dir, 'tests/_panel_render.mjs', `
      import path from 'node:path';
      const ROOT = new URL('../', import.meta.url);
      export const AUDIENCES = ['ms3', 'res'];
      export const PANEL_BUILD_INPUTS = ${JSON.stringify(INPUTS)}.map(p => path.join(${JSON.stringify(dir)}, p));
      export const formatPanel = html => html;
      export const renderFromBuild = () => [['welcome.md', 'new render']];
      export const shippedPanelRefs = () => new Set(['welcome.md']);
      export const snapshotName = ref => ref + '.html';
      export const snapshotDir = site => new URL('tests/__panels__/' + site + '/', ROOT);
    `);
    const run = () => spawnSync(process.execPath, [path.join(dir, 'bin/render_panels.mjs'), '--write'], {
      cwd: dir, encoding: 'utf8', timeout: 30_000,
    });
    const stale = run();
    assert.equal(stale.status, 2, stale.stderr);
    assert.ok(stale.stderr.includes(changed), stale.stderr);
    assert.match(stale.stderr, /cannot render res:.*is newer than the build/);
    for (const site of ['ms3', 'res']) {
      assert.equal(fs.readFileSync(path.join(dir, `tests/__panels__/${site}/welcome.md.html`), 'utf8'), 'original');
    }
    // Prove the same CLI and fixture can write: the blocked result above is caused by
    // freshness, not an unusable renderer or unreachable write path.
    write(dir, '_build/res/index.html', 'rebuilt', EDITED + 100);
    const fresh = run();
    assert.equal(fresh.status, 0, fresh.stderr);
    for (const site of ['ms3', 'res']) {
      assert.equal(fs.readFileSync(path.join(dir, `tests/__panels__/${site}/welcome.md.html`), 'utf8'), 'new render');
    }
  });
}
