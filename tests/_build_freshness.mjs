/* Shared freshness guard for the node suites that assert against _build/.
 *
 * WHY IT EXISTS: `_build/` is a gitignored artifact whose age is invisible to `existsSync`.
 * A build-output test guarded only on existence fails honestly against a build older than the
 * source under test -- the page really has not been built yet -- and that failure is unfixable
 * from inside the supported workflow: site_build/build_and_check.sh is `set -euo pipefail` and
 * runs `node --test tests/*.test.mjs` BEFORE build_deploy.py, so the red test aborts the very
 * build that would refresh _build/. Skipping with the rebuild command breaks that cycle.
 *
 * WHY mtime: the build writes no stamp of its own. But a build reads its inputs and then writes
 * its output, so output-mtime >= input-mtime holds for every input a build actually consumed;
 * only editing a source after the build can invert it. git rewrites mtimes only for files whose
 * content it changes, so a branch switch stales the build exactly when the sources really differ.
 *
 * `_build/<site>/index.html` is the stamp because it is the SPA shell every build regenerates --
 * post-event-huddle T17 already reads it for its nav assertion.
 *
 * This is a SKIP guard, never a pass: callers must run their full assertions when it returns null.
 */
import fs from 'node:fs';
import path from 'node:path';

const REBUILD = '13_Faculty_Resources/_automation/site_build/build_and_check.sh';

/**
 * Decide whether _build/<site> is current enough for build-output assertions to mean anything.
 *
 * @param {string} repo Absolute path to the repository root.
 * @param {'ms3'|'res'} site Which built site tree to examine.
 * @param {string[]} sources Absolute paths to every input this caller's assertions depend on.
 *   A path that does not exist throws: a typo here would make the check vacuously "fresh",
 *   silently retiring the contract the caller is guarding.
 * @returns {string|null} null when the build is current (run the assertions), otherwise a
 *   reason naming the site, the source that outran it, and the command that fixes it.
 */
export function staleBuildReason(repo, site, sources) {
  const rebuild = `rebuild: bash ${REBUILD} ${site}`;

  // Resolve inputs first, so a bad path is reported even where _build/ never exists (CI).
  let newest = null;
  for (const src of sources) {
    let stat;
    try {
      stat = fs.statSync(src);
    } catch {
      throw new Error(`declared build input does not exist: ${src}`);
    }
    if (newest === null || stat.mtimeMs > newest.mtimeMs) newest = { src, mtimeMs: stat.mtimeMs };
  }

  const stamp = path.join(repo, '_build', site, 'index.html');
  if (!fs.existsSync(stamp)) {
    return `_build/${site} is not built (no _build/${site}/index.html) — ${rebuild}`;
  }

  const builtAt = fs.statSync(stamp).mtimeMs;
  if (newest === null || newest.mtimeMs <= builtAt) return null;
  const who = path.relative(repo, newest.src);
  return `_build/${site} is stale (${who} is newer than the build) — ${rebuild}`;
}
