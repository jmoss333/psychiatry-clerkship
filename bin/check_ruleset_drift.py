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

    python3 bin/check_ruleset_drift.py                  # check (exit 2 on drift)
    python3 bin/check_ruleset_drift.py --list           # the pinned ruleset, readably
    python3 bin/check_ruleset_drift.py --update         # re-pin an INTENTIONAL change
    python3 bin/check_ruleset_drift.py --check-bypass   # needs ruleset WRITE access
    python3 bin/check_ruleset_drift.py --update-bypass  # re-pin the bypass list
    python3 bin/check_ruleset_drift.py --self-test

THE BYPASS LIST IS A SEPARATE, OPT-IN CHECK. `bypass_actors` is returned only to a
caller with **write** access to the ruleset -- not read. (GitHub: "To prevent leaking
sensitive information, the bypass_actors property is only returned if the user making
the API request has write access to the ruleset.") There is no GITHUB_TOKEN permission
that grants it: `administration` is not a workflow `permissions:` scope at all, and
reading the ruleset itself needs only Metadata:read. Putting a ruleset-WRITE credential
into a scheduled workflow so it can read one field would hand the guard the keys to the
thing it guards, so this tool does not do that.

Instead the default check is caller-invariant BY CONSTRUCTION: every caller-dependent
field is stripped, so anonymous, GITHUB_TOKEN and an owner PAT all normalize to the
same bytes. The bypass list is pinned separately in its own fixture and verified by
`--check-bypass`, which you run locally with a credential that already has the access.
The nightly job says out loud that it did not check it.

"""

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
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
BYPASS_FIXTURE = FIXTURE.with_name("ruleset-main-bypass.json")
# A dated, content-free attestation that a human with the necessary access actually
# ran --check-bypass. monthly_review.py ages this against receipts.rulesetBypass
# .maxAgeDays, so "nobody has checked the bypass list in over a month" becomes a
# visible row in the monthly review instead of a note someone has to remember.
BYPASS_RECEIPT = (
    FIXTURE.parent.parent / "receipts" / "ruleset-bypass.json"
)

DEFAULT_REPOSITORY = "jmoss333/psychiatry-clerkship"
RULESET_ID = 21202405

SAFE_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
MAX_API_BYTES = 2_000_000
API_TIMEOUT_SECONDS = 20

# Change without meaning: timestamps move on any save, node_id and _links are
# addressing, not policy. Everything else is pinned.
#
# `current_user_can_bypass` is the important one, and it is here because it was
# NOT here on 2026-09-04 and the check cried wolf five nights running. It answers
# "may THIS CALLER bypass" -- a property of the token doing the asking, not of the
# ruleset. It is absent for an unauthenticated read (how the fixture was seeded)
# and "never" for the Actions GITHUB_TOKEN, so a fixture seeded by one caller can
# never match the other. Caller-context fields must be stripped; policy fields,
# including ones this tool has never seen, must not be. That distinction is the
# whole correctness argument for the fail-loud default below.
VOLATILE_KEYS = frozenset({
    "updated_at",
    "created_at",
    "node_id",
    "_links",
    # Caller-dependent. Stripping these is what makes the default check identical for
    # every caller; `_self_test` asserts that parity across all three caller classes.
    "current_user_can_bypass",
    "bypass_actors",
})


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
    return json.loads(json.dumps(pinned, sort_keys=True))


def normalize_bypass(raw):
    """Return the bypass list, or None if this caller was not shown it.

    None means "this caller lacks ruleset write access", never "empty" -- an empty
    bypass list is `[]` and is a meaningfully different fact. The earlier version of
    this tool recorded the two identically as `null`, which reads like an answer and
    is not one.
    """
    if not isinstance(raw, dict):
        raise RulesetDriftError("ruleset payload is not an object")
    actors = raw.get("bypass_actors")
    if actors is None:
        return None
    if not isinstance(actors, list):
        raise RulesetDriftError("bypass_actors is malformed")
    return json.loads(json.dumps(actors, sort_keys=True))


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
            # The bypass fixture is a top-level list, so a whole-list change has no
            # path. Name it rather than printing a bare colon.
            lines.append(
                f"  {path or '<whole list>'}: {json.dumps(want, sort_keys=True)}"
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


def load_bypass_fixture():
    try:
        return json.loads(BYPASS_FIXTURE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RulesetDriftError(
            "bypass fixture is missing; seed it with --update-bypass") from exc
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RulesetDriftError("bypass fixture is unreadable") from exc


def write_bypass_receipt(actors):
    """Attest that the bypass list was verified, without restating it.

    Content-free by design: a timestamp, a count, and a digest of the exact list that
    was matched. The list itself already lives in the committed fixture; duplicating
    it here would just be a second copy to drift.
    """
    payload = json.dumps(actors, sort_keys=True).encode("utf-8")
    BYPASS_RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    BYPASS_RECEIPT.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "state": "success",
                "checkedAt": datetime.now(timezone.utc)
                .replace(microsecond=0)
                .isoformat()
                .replace("+00:00", "Z"),
                "actorCount": len(actors),
                "bypassSha256": hashlib.sha256(payload).hexdigest(),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def write_bypass_fixture(actors):
    BYPASS_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    BYPASS_FIXTURE.write_text(
        json.dumps(actors, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


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
    # ...but a CALLER-context field is not policy and must never read as drift.
    # Regression: the fixture is seeded unauthenticated (field absent) and CI runs
    # authenticated (field present), which failed the heartbeat five nights running.
    for caller in ("never", "always", "pull_requests_only"):
        seen = dict(base, current_user_can_bypass=caller)
        assert diff(pinned, normalize(seen)) == [], (
            "caller-context field counted as drift", caller)
    # CALLER PARITY -- the property this tool got wrong twice.
    # The same ruleset, seen by the three callers that actually exist, must normalize
    # to identical bytes. Anonymous sees neither extra field; the Actions GITHUB_TOKEN
    # sees current_user_can_bypass but never bypass_actors (no workflow permission
    # grants it); an owner PAT with ruleset write sees both. If a future GitHub field
    # is caller-dependent and we forget to strip it, this fails here -- on a laptop,
    # with no token and no CI round-trip -- instead of after five red nights.
    anonymous = dict(base)
    actions_token = dict(base, current_user_can_bypass="never")
    owner_pat = dict(
        base,
        current_user_can_bypass="always",
        bypass_actors=[{"actor_id": 5, "actor_type": "RepositoryRole",
                        "bypass_mode": "always"}],
    )
    shapes = {"anonymous": anonymous, "actions": actions_token, "owner": owner_pat}
    rendered = {k: json.dumps(normalize(v), sort_keys=True) for k, v in shapes.items()}
    assert len(set(rendered.values())) == 1, ("callers disagree", rendered)

    # ...and the bypass list is read ONLY by the opt-in path, where absent (this caller
    # was not shown it) stays distinguishable from [] (shown, and empty).
    assert normalize_bypass(anonymous) is None, "absent bypass must be None"
    assert normalize_bypass(actions_token) is None, "Actions token must not see bypass"
    assert normalize_bypass(owner_pat) == owner_pat["bypass_actors"], "owner sees it"
    assert normalize_bypass(dict(base, bypass_actors=[])) == [], "empty is not absent"

    print("check_ruleset_drift: self-test OK")
    return 0


def main(argv=None, *, opener=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--check-bypass", action="store_true")
    parser.add_argument("--update-bypass", action="store_true")
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
        raw_live = fetch_ruleset(
            args.repository, args.ruleset_id,
            token=os.environ.get("GITHUB_TOKEN"), opener=opener)
        live = normalize(raw_live)
    except RulesetDriftError as exc:
        # Unavailable is not healthy. A pin that cannot be read must not report OK.
        print(f"ruleset-drift failed: {exc}", file=sys.stderr)
        return 2

    if args.update:
        write_fixture(live)
        print(f"ruleset-drift: fixture re-pinned ({FIXTURE.relative_to(ROOT)})")
        return 0

    if args.check_bypass or args.update_bypass:
        actors = normalize_bypass(raw_live)
        if actors is None:
            # Failing here is the point: silently "passing" because this caller was
            # never shown the field is exactly the false reassurance this tool exists
            # to avoid.
            print(
                "ruleset-drift failed: this caller was not shown bypass_actors. "
                "GitHub returns it only with WRITE access to the ruleset -- run this "
                "locally with an owner credential (gh auth), not from Actions.",
                file=sys.stderr,
            )
            return 2
        if args.update_bypass:
            write_bypass_fixture(actors)
            print(
                "ruleset-drift: bypass list re-pinned "
                f"({BYPASS_FIXTURE.relative_to(ROOT)}, {len(actors)} actor(s))"
            )
            return 0
        try:
            expected_actors = load_bypass_fixture()
        except RulesetDriftError as exc:
            print(f"ruleset-drift failed: {exc}", file=sys.stderr)
            return 2
        bypass_lines = diff(expected_actors, actors)
        if not bypass_lines:
            # Only a MATCH writes the receipt. A drift deliberately leaves it to go
            # stale, so an unresolved drift keeps showing up in the monthly review.
            write_bypass_receipt(actors)
            print(
                f"ruleset-drift: bypass list matches the pinned fixture "
                f"({len(actors)} actor(s)); receipt written to "
                f"{BYPASS_RECEIPT.relative_to(ROOT)}"
            )
            return 0
        print(
            "ruleset-drift failed: the bypass list has drifted from the pinned "
            f"fixture ({len(bypass_lines)} field(s))",
            file=sys.stderr,
        )
        for line in bypass_lines:
            print(line, file=sys.stderr)
        print(
            "  -> anyone on this list is exempt from EVERY rule in the ruleset. "
            "If intentional, re-pin with: "
            "python3 bin/check_ruleset_drift.py --update-bypass",
            file=sys.stderr,
        )
        return 2

    try:
        expected = load_fixture()
    except RulesetDriftError as exc:
        print(f"ruleset-drift failed: {exc}", file=sys.stderr)
        return 2

    lines = diff(expected, live)
    if not lines:
        print(
            f"ruleset-drift: ruleset {args.ruleset_id} matches the pinned fixture "
            "(bypass list NOT checked -- needs ruleset write access; "
            "run --check-bypass locally)"
        )
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
