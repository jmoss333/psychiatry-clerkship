import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';

// Unit tests for the shared _build/ freshness guard.
//
// WHY IT EXISTS: build-output tests (post-event-huddle T17, rotation-edition-build-governance)
// assert against _build/. Their guards used to check that _build/ EXISTS, which is not the same
// question as whether it is CURRENT. A _build/ older than the source under test fails those
// assertions honestly -- the page really is not there yet -- and because
// site_build/build_and_check.sh runs `node --test` BEFORE build_deploy.py under `set -euo
// pipefail`, that failure aborts the very build that would refresh _build/. The only supported
// fix for a stale build was blocked by the staleness. This guard turns that hard failure into a
// skip that names the rebuild command, and leaves a fresh build asserting everything.
//
// mtime is the signal because the build has no stamp of its own: a build writes its output after
// reading its inputs, so output-mtime >= every input-mtime holds for any build that consumed
// them, and only a post-build source edit can invert it.

function tmpRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(repo, rel, when) {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'x');
  if (when !== undefined) fs.utimesSync(abs, when, when);
  return abs;
}
// Epoch seconds; distinct values so ordering is unambiguous on any filesystem granularity.
const OLD = 1_600_000_000;
const NEW = 1_600_000_500;

test('a missing _build/<site> reports the rebuild command rather than passing silently', (t) => {
  const repo = tmpRepo(t);
  const src = write(repo, 'src/tool.html', OLD);
  const reason = staleBuildReason(repo, 'res', [src]);
  assert.ok(reason, 'absent build must produce a reason');
  assert.match(reason, /_build\/res/);
  assert.match(reason, /build_and_check\.sh res/, 'names the rebuild command');
});

test('a _build/<site> without its shell index.html counts as not built', (t) => {
  const repo = tmpRepo(t);
  const src = write(repo, 'src/tool.html', OLD);
  fs.mkdirSync(path.join(repo, '_build', 'res'), { recursive: true });
  const reason = staleBuildReason(repo, 'res', [src]);
  assert.ok(reason, 'a directory alone is not a build');
  assert.match(reason, /build_and_check\.sh res/);
});

test('a build newer than every declared source is fresh, so assertions run', (t) => {
  const repo = tmpRepo(t);
  const src = write(repo, 'src/tool.html', OLD);
  write(repo, '_build/res/index.html', NEW);
  assert.equal(staleBuildReason(repo, 'res', [src]), null);
});

test('a build older than a declared source is stale and the reason names that source', (t) => {
  const repo = tmpRepo(t);
  const quiet = write(repo, 'src/untouched.html', OLD);
  const edited = write(repo, 'src/tool.html', NEW);
  write(repo, '_build/res/index.html', OLD);
  const reason = staleBuildReason(repo, 'res', [quiet, edited]);
  assert.ok(reason, 'stale build must produce a reason');
  assert.match(reason, /stale/i);
  assert.match(reason, /src\/tool\.html/, 'names the source that outran the build');
  assert.doesNotMatch(reason, /untouched/, 'does not blame a source older than the build');
  assert.match(reason, /build_and_check\.sh res/);
});

test('a build stamped at the same instant as its source is fresh, not stale', (t) => {
  // A build reads its inputs and then writes its output, so equal mtimes mean the build
  // consumed that source. Treating a tie as stale would skip on every fast rebuild.
  const repo = tmpRepo(t);
  const src = write(repo, 'src/tool.html', OLD);
  write(repo, '_build/res/index.html', OLD);
  assert.equal(staleBuildReason(repo, 'res', [src]), null);
});

test('a declared source that does not exist is a caller bug and throws', (t) => {
  // Silently ignoring a typo'd input would make the freshness check vacuous, which is the
  // failure mode this guard exists to prevent: a check that always says "fresh" retires the
  // contract it was guarding without anything going red.
  const repo = tmpRepo(t);
  write(repo, '_build/res/index.html', NEW);
  assert.throws(
    () => staleBuildReason(repo, 'res', [path.join(repo, 'src/typo.html')]),
    /typo\.html/,
  );
});

test('the site argument selects which build tree is examined', (t) => {
  const repo = tmpRepo(t);
  const src = write(repo, 'src/tool.html', OLD);
  write(repo, '_build/ms3/index.html', NEW);
  assert.equal(staleBuildReason(repo, 'ms3', [src]), null);
  assert.match(staleBuildReason(repo, 'res', [src]), /_build\/res/);
});
