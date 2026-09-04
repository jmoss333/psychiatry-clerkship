#!/usr/bin/env python3
"""Pin main's branch ruleset to a fixture, so a governance change cannot silently
fail to land -- or silently land when nobody asked.

The failure this exists to catch, in the exact form it happened:

  2026-09-03  Five PRs are stranded behind "Require branches to be up to date
              before merging". Josh decides to relax it and edits the ruleset.
  2026-09-03  The edit does not take. GitHub's ruleset editor hides that checkbox
              behind a collapsed `Show additional settings` disclosure, and its
              sudo re-auth prompt RELOADS the page and discards the pending form
              with the message "No changes have been made" -- which reads exactly
              like success.
  2026-09-04  Nine hours later the PRs are still stranded. Diagnosis took an
              evening of archaeology: reading rulesets, classic branch protection,
              and the org-vs-user account model to work out which rule, at which
              level, was doing the blocking. The answer was that NOTHING had
              changed since 2026-08-22 -- visible in one field, `updated_at`, that
              nobody thought to look at.

A committed fixture turns that evening into a diff. It also catches the reverse
and more dangerous case: a protection quietly disappearing -- a required check
dropped, `enforcement` moved to `evaluate`, a new actor added to the bypass list --
which today nothing in this repo would notice at all.

WHAT IT CHECKS: the live ruleset, normalized, byte-for-byte against the fixture.
Volatile fields (`updated_at`, `created_at`, `node_id`, `_links`) are stripped --
they change without meaning. Everything else is pinned, INCLUDING keys the fixture
does not yet know about: an unrecognised key is drift, not something to skip. A
protection that grows a new dimension should make a human look at it.

WHAT IT DELIBERATELY DOES NOT CHECK: whether the ruleset is *right*. That is a
faculty decision, not a mechanical one. This tool only answers "is it what you last
agreed it should be" -- and, crucially, "did your last edit actually land".

Report-only, like check_decision_drift.py. Not in ci.yml (a step there trips three
separate contracts -- see CLAUDE.md); it runs from the nightly heartbeat, where a
red row is a prompt to look rather than a merge blocker.

    python3 bin/check_ruleset_drift.py             # check (exit 2 on drift)
    python3 bin/check_ruleset_drift.py --list      # the pinned ruleset, readably
    python3 bin/check_ruleset_drift.py --update    # re-pin after an INTENTIONAL change
    python3 bin/check_ruleset_drift.py --self-test

NOTE ON SEEDING: `bypass_actors` is only returned to a caller with
`administration: read`. The fixture committed alongside this tool was seeded from an
unauthenticated read and therefore records `bypassActors: null` -- meaning "not yet
observed", not "empty". The first authenticated run will report drift naming the real
bypass list; that first diff is informative (it shows you who can bypass main), and
`--update` after reading it is the intended response.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = (
    ROOT
    / "13_Faculty_Resources"
    / "_automation"
    / "maintenance"
    / "fixtures"
    / "ruleset-main.json"
)

DEFAULT_REPOSITORY = "jmoss333/psychiatry-clerkship"
RULESET_ID = 21202405

SAFE_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
MAX_API_BYTES = 2_000_000
API_TIMEOUT_SECONDS = 20

# Change without meaning: timestamps move on any save, node_id and _links are
# addressing, not policy. Everything else is pinned.
VOLATILE_KEYS = frozenset({"updated_at", "created_at", "node_id", "_links"})


class RulesetDriftError(RuntimeError):
    """The live ruleset could not be read or trusted."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def normalize(raw):
    """Strip volatile fields and canonicalise ordering. Nothing else is dropped."""
    if not isinstance(raw, dict):
        raise RulesetDriftError("ruleset payload is not an object")
    pinned = {k: v for k, v in raw.items() if k not in VOLATILE_KEYS}
    # bypass_actors is absent for unauthenticated callers. Record the distinction
    # explicitly: null means "not observed", [] would mean "observed, and empty".
    pinned["bypassActors"] = raw.get("bypass_actors")
    pinned.pop("bypass_actors", None)
    return json.loads(json.dumps(pinned, sort_keys=True))


def fetch_ruleset(repository, ruleset_id, *, token=None, opener=None):
    if not isinstance(repository, str) or SAFE_REPOSITORY.fullmatch(repository) is None:
        raise RulesetDriftError("GitHub repository is invalid")
    if not isinstance(ruleset_id, int) or isinstance(ruleset_id, bool) or ruleset_id <= 0:
        raise RulesetDriftError("ruleset id is invalid")
    url = f"https://api.github.com/repos/{repository}/rulesets/{ruleset_id}"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    client = opener or build_opener(_NoRedirect())
    try:
        response = client.open(Request(url, method="GET", headers=headers),
                               timeout=API_TIMEOUT_SECONDS)
        try:
            if getattr(response, "status", None) != 200:
                raise RulesetDriftError("GitHub rulesets API returned a failure")
            body = response.read(MAX_API_BYTES + 1)
        finally:
            response.close()
    except RulesetDriftError:
        raise
    except Exception as exc:
        raise RulesetDriftError("GitHub rulesets API is unavailable") from exc
    if not isinstance(body, bytes) or len(body) > MAX_API_BYTES:
        raise RulesetDriftError("GitHub rulesets API response is too large")
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RulesetDriftError("GitHub rulesets API response is malformed") from exc


def diff(expected, actual):
    """Return sorted 'path: expected -> actual' lines. Empty means no drift."""
    lines = []

    def walk(path, want, got):
        if isinstance(want, dict) and isinstance(got, dict):
            for key in sorted(set(want) | set(got)):
                walk(f"{path}.{key}" if path else key,
                     want.get(key, "<absent>"), got.get(key, "<absent>"))
            return
        if isinstance(want, list) and isinstance(got, list) and len(want) == len(got):
            for index, (w, g) in enumerate(zip(want, got)):
                walk(f"{path}[{index}]", w, g)
            return
        if want != got:
            lines.append(
                f"  {path}: {json.dumps(want, sort_keys=True)}"
                f" -> {json.dumps(got, sort_keys=True)}"
            )

    walk("", expected, actual)
    return sorted(lines)


def load_fixture():
    try:
        return json.loads(FIXTURE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RulesetDriftError("fixture is missing; seed it with --update") from exc
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RulesetDriftError("fixture is unreadable") from exc


def write_fixture(pinned):
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(
        json.dumps(pinned, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def _self_test():
    base = {
        "id": 1, "enforcement": "active", "updated_at": "2026-01-01T00:00:00Z",
        "rules": [{"type": "required_status_checks", "parameters": {
            "strict_required_status_checks_policy": True}}],
    }
    pinned = normalize(base)
    assert "updated_at" not in pinned, "volatile field survived normalization"
    assert pinned["bypassActors"] is None, "unobserved bypass list must be null"
    # A timestamp-only change is not drift.
    moved = dict(base, updated_at="2026-09-04T00:43:06Z")
    assert diff(pinned, normalize(moved)) == [], "timestamp counted as drift"
    # The exact 2026-09-03 failure: the flag flips and nothing else does.
    relaxed = json.loads(json.dumps(base))
    relaxed["rules"][0]["parameters"]["strict_required_status_checks_policy"] = False
    lines = diff(pinned, normalize(relaxed))
    assert len(lines) == 1 and "strict_required_status_checks_policy" in lines[0], lines
    # A protection vanishing is drift.
    dropped = json.loads(json.dumps(base))
    dropped["rules"] = []
    assert diff(pinned, normalize(dropped)), "removed rule not reported"
    # An unrecognised key is drift, not something to skip.
    grown = dict(base, some_new_protection="active")
    assert diff(pinned, normalize(grown)), "new key not reported"
    print("check_ruleset_drift: self-test OK")
    return 0


def main(argv=None, *, opener=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--repository", default=os.environ.get(
        "GITHUB_REPOSITORY") or DEFAULT_REPOSITORY)
    parser.add_argument("--ruleset-id", type=int, default=RULESET_ID)
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if args.list:
        try:
            print(json.dumps(load_fixture(), indent=2, sort_keys=True))
        except RulesetDriftError as exc:
            print(f"ruleset-drift failed: {exc}", file=sys.stderr)
            return 2
        return 0

    try:
        live = normalize(fetch_ruleset(
            args.repository, args.ruleset_id,
            token=os.environ.get("GITHUB_TOKEN"), opener=opener))
    except RulesetDriftError as exc:
        # Unavailable is not healthy. A pin that cannot be read must not report OK.
        print(f"ruleset-drift failed: {exc}", file=sys.stderr)
        return 2

    if args.update:
        write_fixture(live)
        print(f"ruleset-drift: fixture re-pinned ({FIXTURE.relative_to(ROOT)})")
        return 0

    try:
        expected = load_fixture()
    except RulesetDriftError as exc:
        print(f"ruleset-drift failed: {exc}", file=sys.stderr)
        return 2

    lines = diff(expected, live)
    if not lines:
        print(f"ruleset-drift: ruleset {args.ruleset_id} matches the pinned fixture")
        return 0
    print(
        f"ruleset-drift failed: ruleset {args.ruleset_id} has drifted from the "
        f"pinned fixture ({len(lines)} field(s))",
        file=sys.stderr,
    )
    for line in lines:
        print(line, file=sys.stderr)
    print(
        "  -> if this change was intentional, re-pin with: "
        "python3 bin/check_ruleset_drift.py --update",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
