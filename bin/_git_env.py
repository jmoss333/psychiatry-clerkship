"""Keep a test's throwaway git repositories out of the repository running it.

Python twin of ``tests/_git_env.mjs``; read that file's header for the mechanism and the two
incidents (2026-08-20, 2026-09-24). In one paragraph: git exports GIT_DIR into every hook,
``rebase --exec`` command and ``!`` alias, GIT_DIR outranks both ``git -C`` and the working
directory, and a fixture that inherits it re-initialises the REAL repository instead of its
temp dir — ``core.bare = true`` in the shared ``.git/config`` when GIT_DIR is a linked
worktree's gitdir — after which the fixture's ``git config`` / ``add`` / ``commit`` land there.

Usage — a test module that builds git repositories calls this once at MODULE scope, before
any test runs, which cleans the environment of every child the test spawns (git itself and the
tools under test that run git against the fixture)::

    sys.path.insert(0, str(ROOT / "bin"))
    from _git_env import scrub_inherited_git_env
    scrub_inherited_git_env()

A ``bin/`` tool whose ``--self-test`` builds repositories calls it at the top of the self-test
only: in normal operation such a tool may legitimately need a hook's GIT_INDEX_FILE.
``tests/git-env-isolation.test.mjs`` pins that every fixture module does one or the other.
"""

import os
from typing import List, MutableMapping


def scrub_inherited_git_env(env: MutableMapping[str, str] = os.environ) -> List[str]:
    """Delete every GIT_* variable from ``env`` (default: this process), in place.

    Returns the names removed, sorted. Set anything a fixture needs (GIT_AUTHOR_DATE, …)
    after the scrub, per call, so the dependency is visible where it is used.
    """
    removed = sorted(key for key in env if key.startswith("GIT_"))
    for key in removed:
        del env[key]
    return removed
