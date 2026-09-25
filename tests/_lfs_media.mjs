/* Shared Git-LFS guard for the node suites that SPAWN a real site build.
 *
 * WHY IT EXISTS: build_deploy.py gates its required media through
 * welcome_compass.require_real_files(), which hard-fails a Git-LFS pointer stub outside
 * the two soft contexts check_lfs_media.is_soft_context() names (GitHub Actions' lfs:false
 * checkout, Netlify deploy previews). A machine with no git-lfs installed has no smudge
 * filter, so every LFS-tracked file checks out AS its ~133-byte pointer text. A build
 * spawned there aborts with "MS3 Compass required files are invalid: <some .mp4>" --
 * a red that has nothing to do with the contract the caller is pinning, cannot be fixed
 * by editing any source, and trains readers to discount the whole suite.
 *
 * Since 2026-09-25 that premise no longer holds for build_deploy.py: require_real_files() was
 * retired with the orientation videos, so a spawned build no longer aborts on stubs and this
 * guard now errs toward SKIPPING in a no-LFS sandbox. CI is unaffected (soft context -> null
 * -> run). Narrowing or retiring it is a follow-up; CLAUDE.md describes it.
 *
 * WHY IT SHELLS OUT: "is this a pointer stub" is already defined once, in
 * site_build/check_lfs_media.py, alongside the deploy gate that enforces it. A second
 * definition here in JS could drift from the one production actually uses, so this asks
 * that module instead (`--worktree-stubs`, exit 1 = a spawned build cannot run here).
 *
 * This is a SKIP guard, never a pass, and it never softens the deploy gate: production is
 * not a soft context and does not consult this path. Callers must run their full
 * assertions when it returns null -- including when it cannot tell.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CHECKER = '13_Faculty_Resources/_automation/site_build/check_lfs_media.py';
const PYTHON = process.env.CLERKSHIP_META_PYTHON || 'python3';

// The answer is a property of the environment, not of any one test, so ask once per
// process. Keyed by repo so a caller passing a different tree is not served a stale verdict.
const cache = new Map();

/**
 * Decide whether a site build spawned against this working tree can run at all.
 *
 * @param {string} repo Absolute path to the repository root.
 * @returns {string|null} null when the build will proceed -- run the assertions --
 *   otherwise a reason naming the offending file and the command that fixes it.
 */
export function lfsStubReason(repo) {
  if (cache.has(repo)) return cache.get(repo);

  const result = spawnSync(PYTHON, [path.join(repo, CHECKER), '--worktree-stubs'], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
  });

  // Exit 1 is the only "cannot build here" answer. A missing interpreter, a crash, a
  // usage error (2) or a timeout all mean we could not tell -- and an unknown must send
  // the caller down the loud path, never the silent one.
  const reason = result.status === 1 ? (result.stdout || '').trim() : null;

  cache.set(repo, reason || null);
  return cache.get(repo);
}
