#!/usr/bin/env python3
"""Every required safety surface must carry a real crisis contact IN THE BUILT SITE.

WHAT THIS ADDS, because three checks already cover neighbouring ground and duplicating them
would be waste:

  build_deploy.py:330 / resident_section.py:129  assert the injection FIRED on every required
      surface — the marker was found and replaced. That is not the same as a contact being
      present: if a resource lost its `contact`, or the markdown->HTML pass mangled the block,
      injection still "fires" and the build still passes.
  tests/crisis-block.test.mjs:240  renders canonical contacts into both built indices — but
      only the SHELL, and into a synthetic temp copy, not the real _build/.
  tests/fd-crisis-visibility.test.mjs  proves a rendered block is not hidden inside a collapsed
      section. It reasons about the shell's collapse pass, not about built page content.

So nothing today reads the REAL build and asks the blunt question: does the page a learner
opens actually contain a number they can call? That question is this file's whole job, and it
covers all three required lists across both audiences.

WHAT IT DOES NOT CLAIM. This proves what the build produced, never what a browser received —
a CDN can serve something stale, and the egress proxy blocks *.netlify.app from sandboxed
sessions, so the HTTP half stays deploy-verifier's job. It also says nothing about visibility;
that is fd-crisis-visibility.test.mjs.

WHY bin/ AND NOT tests/. A build-output assertion is a local-only contract: `node --test` runs
before BOTH build_and_check.sh invocations and _build/ starts absent in CI, so a test there
would skip exactly where it matters (see CLAUDE.md, build-output test paragraph). bin/verify.sh
builds both sites at :180-181, so this runs after them and has a real build to read.

USAGE
  python3 bin/check_crisis_surfaces.py              # check both sites; exit 1 on a gap
  python3 bin/check_crisis_surfaces.py --self-test  # prove the checker can actually fail
  python3 bin/check_crisis_surfaces.py --site ms3   # one audience

EXIT CODES. 0 clean or skipped (no build to read), 1 a required surface is missing a contact,
2 the checker could not determine what to check. That last one matters: a checker that cannot
find the required lists must fail loudly, never pass vacuously by checking an empty set.
"""
from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE_BUILD = REPO / "13_Faculty_Resources" / "_automation" / "site_build"
BUILD_DEPLOY = SITE_BUILD / "build_deploy.py"
RESIDENT_SECTION = SITE_BUILD / "resident_section.py"
CRISIS_JSON = REPO / "crisis_resources.json"
SHIPPED_PAGES = SITE_BUILD / "shipped_pages.json"
REBUILD = "bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh {site}"

# ADR-002's own reader. Asked for by name rather than re-parsed here: load_shipped_pages()
# validates the document's version and every page's shape and RAISES on a malformed entry,
# which is the behaviour a safety checker needs. See sites_by_slug().
sys.path.insert(0, str(SITE_BUILD))
from shipped_pages import ShippedPagesError, load_shipped_pages  # noqa: E402

# Every file whose content changes WHAT THIS CHECKS or what a correct answer looks like.
# shipped_pages.json belongs here because it decides which audience each required surface is
# demanded of: regenerating it after a build (a `--quick` run, adding a producer) changes the
# question while the tree being read is unchanged, and an undeclared input means that run
# reports a confident OK over the wrong set (Codex P2 on #545).
STALE_INPUTS = (CRISIS_JSON, BUILD_DEPLOY, RESIDENT_SECTION,
                SITE_BUILD / "crisis_block.py", SHIPPED_PAGES)


class Undeterminable(Exception):
    """The checker cannot establish what it is supposed to check."""


def literal_set(py_file: Path, name: str) -> set[str]:
    """Read a module-level `NAME={...}` set of string literals without importing the module.

    Importing build_deploy.py would run an entire site build, so the set is parsed out of the
    AST instead. Every failure path raises: a checker that silently returns an empty set would
    report PASS while checking nothing, which is the exact defect this file exists to catch.
    """
    try:
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    except (OSError, SyntaxError) as exc:
        raise Undeterminable(f"cannot parse {py_file.name}: {exc}") from exc

    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            continue
        try:
            value = ast.literal_eval(node.value)
        except ValueError as exc:
            raise Undeterminable(f"{name} in {py_file.name} is not a literal: {exc}") from exc
        if not isinstance(value, (set, frozenset, list, tuple)) or not value:
            raise Undeterminable(f"{name} in {py_file.name} is empty or not a collection")
        if not all(isinstance(v, str) for v in value):
            raise Undeterminable(f"{name} in {py_file.name} holds a non-string entry")
        return set(value)
    raise Undeterminable(f"{name} not found in {py_file.name} — was it renamed?")


def canonical_contacts() -> list[tuple[str, str]]:
    """(id, contact) for every resource. A resource with a blank contact is itself the bug."""
    try:
        data = json.loads(CRISIS_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise Undeterminable(f"cannot read crisis_resources.json: {exc}") from exc
    out = []
    for resource in data.get("resources", []):
        rid, contact = resource.get("id"), resource.get("contact")
        if not rid or not contact:
            raise Undeterminable(f"crisis_resources.json resource {rid!r} has no contact")
        out.append((rid, contact))
    if not out:
        raise Undeterminable("crisis_resources.json lists no resources")
    return out


def sites_by_slug(root: Path | None = None) -> dict[str, list[str]]:
    """slug -> which audiences ship it, from the derived universe ADR-002 says to ask.

    This is load-bearing, not decoration. _CRISIS_REQUIRED_MD holds three MS3-only
    Case-of-the-Week pages (the resident site ships `_res` twins instead), so applying the
    shared list wholesale to both audiences reports three phantom failures on res. The first
    run of this checker did exactly that. Asking shipped_pages.json which site ships a slug is
    both the fix and the architecturally correct source — never the producers.

    READ THROUGH load_shipped_pages(), never json.loads. A private parser here looked
    equivalent and was not: `list(page.get("sites") or [])` turned a missing, empty or
    malformed `sites` into [], `site in []` is False for BOTH audiences, and the required
    surface silently left the list while the run still printed OK over a smaller set. That is
    the vacuity this whole file exists to catch, reproduced inside the file itself (Codex P2
    on #545). The loader validates version and page shape and fails closed; the self-test
    proves a malformed entry now raises.
    """
    try:
        document = load_shipped_pages(root if root is not None else REPO)
    except ShippedPagesError as exc:
        # The loader's messages already name the file; re-prefixing would double it.
        raise Undeterminable(str(exc)) from exc
    # load_shipped_pages guarantees a non-empty pages list and a non-empty `sites` on each.
    return {page["slug"]: list(page["sites"]) for page in document["pages"]}


def required_surfaces() -> dict[str, list[tuple[str, str]]]:
    """Per site: (relative built path, why-it-is-required label), from the producers themselves.

    Read rather than restated. The three lists are governance decisions recorded in the build
    scripts; a copy here would drift the moment a surface is added, and drift on THIS list means
    a page silently stops being checked. Each entry is then scoped to the audiences that
    actually ship it — a surface absent from a site is not a gap there.
    """
    md = literal_set(BUILD_DEPLOY, "_CRISIS_REQUIRED_MD")
    tools = literal_set(BUILD_DEPLOY, "_CRISIS_REQUIRED_TOOLS")
    res_md = literal_set(RESIDENT_SECTION, "_CRISIS_REQUIRED_RES_MD")
    ships = sites_by_slug()

    def scoped(site, slugs, subdir, why):
        rows = []
        for slug in sorted(slugs):
            where = ships.get(slug)
            if where is None:
                # Required by the build but absent from the shipped universe: that is a real
                # inconsistency between two governance files, so surface it rather than skip.
                rows.append((f"{subdir}/{slug}", f"{why}; NOT IN shipped_pages.json"))
            elif site in where:
                rows.append((f"{subdir}/{slug}", why))
        return rows

    out = {}
    for site in ("ms3", "res"):
        rows = (scoped(site, md, "content", "_CRISIS_REQUIRED_MD")
                + scoped(site, tools, "tools", "_CRISIS_REQUIRED_TOOLS"))
        if site == "res":
            # The resident site inherits the shared surfaces through resident_section.py and
            # adds its own Case-of-the-Week list. Checking both is the point: nothing else
            # verifies that the inheritance actually landed in _build/res.
            rows += scoped(site, res_md, "content", "_CRISIS_REQUIRED_RES_MD")
        out[site] = rows
    return out


def newer_input(built_at: float, inputs=STALE_INPUTS) -> Path | None:
    """The first declared input that outran the build, or None. Pure, so it is falsifiable.

    A declared path that does not exist RAISES rather than being skipped: a typo in
    STALE_INPUTS would otherwise make the freshness check vacuously "fresh" and retire the
    contract in silence (CLAUDE.md, staleBuildReason paragraph).
    """
    for src in inputs:
        if not src.exists():
            raise Undeterminable(f"declared input does not exist: {src}")
        if src.stat().st_mtime > built_at:
            return src
    return None


def stale_reason(site: str, build_root: Path | None = None) -> str | None:
    """None when _build/<site> is current enough to mean something, else why it is not.

    Mirrors tests/_build_freshness.mjs: a build older than the sources under test fails such a
    check honestly, and that red would then be blamed on content rather than on the stale tree.
    """
    stamp = (build_root if build_root is not None else REPO / "_build" / site) / "index.html"
    if not stamp.exists():
        return f"_build/{site} is not built"
    src = newer_input(stamp.stat().st_mtime)
    if src is None:
        return None
    return f"_build/{site} is stale ({src.relative_to(REPO)} is newer than the build)"


def check_site(site: str, surfaces: list[tuple[str, str]],
               contacts: list[tuple[str, str]], root: Path | None = None) -> list[str]:
    """Return one failure line per (surface, missing contact). Empty means clean."""
    base = root if root is not None else REPO / "_build" / site
    failures = []
    for rel, why in surfaces:
        path = base / rel
        if not path.exists():
            failures.append(f"{site}/{rel}: REQUIRED SURFACE NOT BUILT (listed in {why})")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        missing = [rid for rid, contact in contacts if contact not in text]
        if missing:
            failures.append(
                f"{site}/{rel}: no crisis contact for {', '.join(missing)} "
                f"(required by {why})")
    return failures


def self_test() -> int:
    """Prove the checker fails when a contact is absent. A gate that cannot fail is not a gate.

    This is the lesson from #539, where a coverage assertion passed cleanly and turned out to be
    unfalsifiable. Run it before trusting a green result from the real check.
    """
    import os
    import tempfile
    import time

    contacts = canonical_contacts()
    good = " ".join(c for _, c in contacts)
    cases = []

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "content").mkdir(parents=True)
        surfaces = [("content/ok.md", "T"), ("content/bad.md", "T"), ("content/gone.md", "T")]
        (root / "content/ok.md").write_text(f"page\n{good}\n", encoding="utf-8")
        # Carries the heading and every contact but one — the realistic failure, and the one
        # "did the injection fire?" cannot see.
        (root / "content/bad.md").write_text(
            f"page\n{' '.join(c for _, c in contacts[1:])}\n", encoding="utf-8")

        found = check_site("t", surfaces, contacts, root=root)
        cases.append(("a page with every contact passes",
                      not any(f.startswith("t/content/ok.md") for f in found)))
        cases.append(("a page missing ONE contact fails",
                      any(f.startswith("t/content/bad.md") for f in found)))
        cases.append(("the failure names the missing resource",
                      any(contacts[0][0] in f for f in found)))
        cases.append(("a required surface that was not built fails",
                      any("gone.md" in f and "NOT BUILT" in f for f in found)))

    # The lists must come from the producers and must be non-empty; a checker that silently
    # checks nothing is the failure mode this whole file guards against.
    try:
        sizes = {k: len(v) for k, v in required_surfaces().items()}
        cases.append(("the required lists parse out of the build scripts",
                      all(n > 0 for n in sizes.values())))
        # NOT "res has more surfaces" — per-site scoping drops the MS3-only Case-of-the-Week
        # pages from res and adds the resident twins, so the counts come out equal. What must
        # hold is that res actually carries its OWN required list; nothing else verifies that
        # resident_section.py's inheritance and its extra surfaces both landed.
        res_only = {rel for rel, why in required_surfaces()["res"]
                    if "_CRISIS_REQUIRED_RES_MD" in why}
        cases.append((f"res carries its own required surfaces ({len(res_only)})",
                      len(res_only) == len(literal_set(RESIDENT_SECTION,
                                                       "_CRISIS_REQUIRED_RES_MD"))))
        cases.append(("res also inherits the shared surfaces",
                      len(required_surfaces()["res"]) > len(res_only)))

        # Regression pin for this checker's OWN first bug. _CRISIS_REQUIRED_MD holds MS3-only
        # Case-of-the-Week pages; applying the shared list wholesale to res reported three
        # phantom failures. If per-site scoping is ever dropped, those slugs reappear on res.
        by_site = required_surfaces()
        ships = sites_by_slug()
        leaked = sorted(rel.split("/", 1)[1] for rel, _ in by_site["res"]
                        if "ms3" in (ships.get(rel.split("/", 1)[1]) or [])
                        and "res" not in (ships.get(rel.split("/", 1)[1]) or []))
        cases.append((f"an ms3-only surface is never demanded of res (leaked: {leaked or 'none'})",
                      not leaked))
    except Undeterminable as exc:
        cases.append((f"required lists parse ({exc})", False))

    try:
        literal_set(BUILD_DEPLOY, "_NO_SUCH_SET_")
        cases.append(("a renamed list raises instead of checking nothing", False))
    except Undeterminable:
        cases.append(("a renamed list raises instead of checking nothing", True))

    # --- the two ways this checker could quietly check LESS than it claims (Codex, #545) ---
    #
    # Both are the same defect wearing different clothes: the run still prints OK, over a set
    # that is no longer the required one. Neither is visible in the output, which is why each
    # gets a falsification rather than a comment.

    # (1) A required slug whose `sites` is missing, empty or malformed. The old private parser
    #     turned it into [], and `site in []` is False for BOTH audiences, so the surface left
    #     the required list with no trace. Reproduced on the real document, one field changed.
    with tempfile.TemporaryDirectory() as tmp:
        fake_root = Path(tmp)
        fake = fake_root / SHIPPED_PAGES.relative_to(REPO)
        fake.parent.mkdir(parents=True)
        document = json.loads(SHIPPED_PAGES.read_text(encoding="utf-8"))
        victim = sorted(literal_set(BUILD_DEPLOY, "_CRISIS_REQUIRED_MD"))[0]
        hit = [page for page in document["pages"] if page.get("slug") == victim]
        # If the victim is not in the universe the case proves nothing, so say so rather than
        # passing: a fixture that stopped matching reality is how a test goes quietly vacuous.
        cases.append((f"the malformed-sites fixture still names a shipped page ({victim})",
                      len(hit) == 1))
        for page in hit:
            page["sites"] = []
        fake.write_text(json.dumps(document), encoding="utf-8")
        label = f"a malformed `sites` on {victim} raises, never a silent drop"
        try:
            scoped = sites_by_slug(fake_root)
            cases.append((f"{label} (returned {len(scoped)} pages)", False))
        except Undeterminable:
            cases.append((label, True))

    # (2) shipped_pages.json regenerated after a build changes WHICH AUDIENCE each surface is
    #     demanded of, so an undeclared input means the guard calls a stale tree current and
    #     the run answers a question the build never saw. Pinned as membership AND behaviour.
    cases.append(("shipped_pages.json is a declared freshness input",
                  SHIPPED_PAGES in STALE_INPUTS))
    try:
        cases.append(("an input newer than the build is named, not ignored",
                      newer_input(0.0, [SHIPPED_PAGES]) == SHIPPED_PAGES))
        cases.append(("a build newer than every declared input is not called stale",
                      newer_input(time.time() + 3600) is None))
        try:
            newer_input(0.0, [SITE_BUILD / "no_such_declared_input.py"])
            cases.append(("a declared input that does not exist raises", False))
        except Undeterminable:
            cases.append(("a declared input that does not exist raises", True))
    except Undeterminable as exc:
        cases.append((f"the declared freshness inputs all resolve ({exc})", False))

    # And the whole guard end to end: a build stamped before every input must SKIP with the
    # rebuild command, never silently check a tree that predates what it is being checked for.
    with tempfile.TemporaryDirectory() as tmp:
        fake_build = Path(tmp)
        stamp = fake_build / "index.html"
        stamp.write_text("built", encoding="utf-8")
        os.utime(stamp, (0, 0))
        reason = stale_reason("t", build_root=fake_build)
        cases.append(("a build older than its inputs is reported stale, not checked",
                      bool(reason) and "stale" in reason))

    for label, ok in cases:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    failed = [label for label, ok in cases if not ok]
    print(f"self-test: {len(cases) - len(failed)}/{len(cases)} passed")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--site", choices=["ms3", "res"], help="check one audience only")
    ap.add_argument("--self-test", action="store_true", help="prove the checker can fail")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    try:
        contacts = canonical_contacts()
        by_site = required_surfaces()
    except Undeterminable as exc:
        print(f"CANNOT CHECK — {exc}")
        print("Refusing to report PASS while checking nothing.")
        return 2

    sites = [args.site] if args.site else ["ms3", "res"]
    failures, checked, skipped = [], 0, []
    for site in sites:
        try:
            reason = stale_reason(site)
        except Undeterminable as exc:
            print(f"CANNOT CHECK — {exc}")
            return 2
        if reason:
            skipped.append(f"{site}: {reason} — {REBUILD.format(site=site)}")
            continue
        surfaces = by_site[site]
        checked += len(surfaces)
        failures += check_site(site, surfaces, contacts)

    for line in skipped:
        print(f"  SKIP  {line}")
    if failures:
        print(f"\n{len(failures)} required safety surface(s) missing a crisis contact "
              f"in the built site:")
        for f in failures:
            print(f"   - {f}")
        print("\nA learner opening these pages is told to give crisis contacts that the page "
              "does not carry.\nCheck crisis_resources.json and the page's crisis-block marker.")
        return 1

    if checked:
        print(f"OK — {checked} required safety surface(s) across {len(sites) - len(skipped)} "
              f"site(s) carry all {len(contacts)} canonical crisis contacts.")
    elif skipped:
        print("nothing checked — no current build to read (see SKIP above).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
