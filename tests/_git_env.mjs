// _git_env.mjs — keep a test's throwaway git repositories out of the repository running it.
//
// Git exports GIT_DIR (and GIT_INDEX_FILE, GIT_WORK_TREE, GIT_PREFIX, …) into every hook,
// `git rebase --exec` command and `!` alias it runs, and GIT_DIR outranks both `git -C <dir>`
// and the working directory. A fixture that inherits it and runs `git init <tmp>` does not make
// a repository in <tmp>: it RE-initialises the repository that launched the suite — and when
// GIT_DIR is a linked worktree's gitdir (every session here works in one), that re-init writes
// core.bare=true into the SHARED .git/config. The fixture's next `git config user.name …`,
// `git config filter.lfs.smudge cat`, `git add`, `git commit` land there too.
//
// That is not hypothetical. 2026-08-20: core.bare=true + user "Fixture" (bin/verify.sh's
// header). 2026-09-24: core.bare=true + user "Synthetic Tester" (runtime-contract,
// devcontainer-receipt) + a repo-level `filter.lfs … = cat` that silently switched Git-LFS off
// (lfs-pull-cached), from `node --test tests/*.test.mjs` run with the hook's GIT_DIR — and the
// pre-push hook then failed open because the work tree could no longer be found.
//
// bin/verify.sh scrubs this environment, but only for runs that go through verify.sh. So every
// test file that builds a git repository calls scrubInheritedGitEnv() at MODULE scope, before
// any test runs. `node --test` runs each file in its own process, so this cleans exactly that
// file's process — and therefore every child it spawns: git itself, and the bash/python tools
// under test that run git against the fixture. tests/git-env-isolation.test.mjs pins that every
// such file does. bin/_git_env.py is the Python twin.

/**
 * Delete every inherited GIT_* variable from `env` (default: this process), in place.
 * Nothing a fixture needs survives the scrub by accident; set what you need AFTER it
 * (per spawn, e.g. GIT_AUTHOR_DATE) so the dependency is visible at the call site.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]} the names removed, sorted
 */
export function scrubInheritedGitEnv(env = process.env) {
  const removed = Object.keys(env).filter((key) => key.startsWith('GIT_')).sort();
  for (const key of removed) delete env[key];
  return removed;
}
