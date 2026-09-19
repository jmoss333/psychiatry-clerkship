#!/usr/bin/env python3
"""An attestation must name the text it attested, and the name must still fit.

WHY THIS EXISTS: on 2026-09-16 two agent-authored PRs, #640 and #672, added 85 citations to
pages faculty had already attested; of the 74 that could afterwards be checked, 53 were
misattributed or fabricated, and both PRs were reverted (#687/#688). The same commits re-dated
three of those pages' attestations and flipped three pending pages to reviewed under the
owner's name. Every one of those pages went on reading `reviewed`, by a named clinician, on a
date — because nothing in the repository bound an attestation to the text it attested. That is
root cause 2 of the breach: a review recorded a person, a date and a risk level and never an
answer to "reviewed WHAT?", so rewriting the page afterwards cost nothing and showed nowhere.

THE RULE lives in 13_Faculty_Resources/_automation/attestation_hash.py and is implemented
there once. This file re-implements none of it; it is a CLI over that module. A ledger entry's
`contentHash` is the git blob SHA of a manifest naming every input the review covered — the
slug's shipped source(s) and its topic_meta record, `facultyReview` removed — one line each,
itself a blob SHA. `--explain` prints the manifest so anyone can re-derive it by hand.

    python3 bin/check_attestation_hashes.py                    # report (STALE is a notice)
    python3 bin/check_attestation_hashes.py --strict --base REV
    python3 bin/check_attestation_hashes.py --format json
    python3 bin/check_attestation_hashes.py --explain SLUG [--rev REV]
    python3 bin/check_attestation_hashes.py --write-backfill [--as-of-attestation|--as-of-now]
                                            [--table PATH.md]
    python3 bin/check_attestation_hashes.py --self-test

THE ATTESTATION DAY ENDS AT 23:59:59 **UTC**, always, whatever the auditor's clock says. Git
reads a bare `--before=<date>T23:59:59` in the local zone, so the same ledger resolved to
different commits — and different digests — from different desks: six rows moved under
`TZ=Asia/Tokyo`. A digest that depends on where its reader sits is not evidence, so the
boundary is pinned (`day_end_utc`) and the backfill table says so in its header.

EXIT CODES (docs/RATCHETS.md): 0 clean; 1 a finding — an unbound, malformed or unshipped-and-
unlisted reviewed row; 2 COULD NOT CHECK, never a pass — an unreadable input, an attested
source missing from the tree, `--strict` without `--base`, or a ledger with no reviewed shipped
row at all. That last one is docs/SILENT_SHRINK_CHECKLIST.md §D2/§D4: a check reporting success
over an empty set is the defect, not the absence of one.

WHY `--strict` IS DIFF-SCOPED. Drift is the normal in-flight state of any edit to a reviewed
page: a content PR changes the text and the ledger is re-hashed later, by the console, when a
human re-attests. Failing every PR that touches an attested page would make the gate noise and
then make it optional. So the plain run reports STALE and exits 0, and `--strict --base REV`
fails only on the rows the diff itself touched — a row whose `status` or `contentHash` changed
between REV and head, or that is new at head. The rule it enforces is narrow and exact: what
you attest in this change must match the text in this change. Drift elsewhere is still printed,
and still does not fail you.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from attestation_hash import (  # noqa: E402
    AttestationHashError,
    blob_sha,
    canonical_topic_meta_record,
    digest,
    digest_from_tree,
    ledger_hash_report,
    manifest_for_slug,
    sources_for_slug,
)

LEDGER_REL = "13_Faculty_Resources/reviewed.json"
SHIPPED_REL = "13_Faculty_Resources/_automation/site_build/shipped_pages.json"
TOPIC_META_REL = "topic_meta.json"


class InputError(Exception):
    """An input this tool must read is unreadable — exit 2, never a pass."""


class GitError(Exception):
    """A git command this tool depends on failed — exit 2, never a pass."""


# --------------------------------------------------------------------------------------
# the three inputs, read as data
# --------------------------------------------------------------------------------------


def load_inputs(root):
    """(ledger, shipped_doc, topic_meta) under `root`; InputError names the first absentee.

    `shipped_pages.json` is read with json.load rather than through site_build's loader:
    it is the sanctioned derived listing (ADR-002), and tests/shipped-pages-readers.test.mjs
    freezes the set of files that read the PRODUCERS directly. This reads neither producer.
    """
    root = Path(root)
    documents = []
    for rel in (LEDGER_REL, SHIPPED_REL, TOPIC_META_REL):
        try:
            documents.append(json.loads((root / rel).read_text(encoding="utf-8")))
        except (OSError, ValueError) as exc:
            raise InputError("cannot read %s: %s" % (rel, exc)) from exc
    return tuple(documents)


# --------------------------------------------------------------------------------------
# git, with the ambient git environment scrubbed
# --------------------------------------------------------------------------------------


def _git(root, args, check=True):
    """Run git under `root`, returning the CompletedProcess with BYTES on stdout.

    Every GIT_* variable is dropped: git exports GIT_DIR into hook children and this tool's
    self-test builds throwaway repos, so an inherited GIT_DIR would point those writes at the
    real repository (bin/verify.sh:30-38 for the incident that earned this). Bytes, not text,
    because `cat-file blob` returns a source file and the locale is not the repo's business.
    """
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env["GIT_OPTIONAL_LOCKS"] = "0"
    proc = subprocess.run(["git", *args], cwd=str(root), capture_output=True, env=env)
    if check and proc.returncode != 0:
        raise GitError("git %s: %s"
                       % (" ".join(args), proc.stderr.decode("utf-8", "replace").strip()))
    return proc


def _git_text(root, args, check=True):
    return _git(root, args, check=check).stdout.decode("utf-8", "replace")


def history_ref(root):
    """`origin/main` when it resolves here, else `HEAD` — and the caller says which."""
    proc = _git(root, ["rev-parse", "--verify", "--quiet", "origin/main"], check=False)
    return "origin/main" if proc.returncode == 0 and proc.stdout.strip() else "HEAD"


def _blob_at(root, rev, path):
    """The bytes of `path` at `rev`, or None when the tree there does not carry it."""
    proc = _git(root, ["rev-parse", "--verify", "--quiet", "%s:%s" % (rev, path)], check=False)
    sha = proc.stdout.decode("utf-8", "replace").strip()
    if proc.returncode != 0 or not sha:
        return None
    return _git(root, ["cat-file", "blob", sha]).stdout


def day_end_utc(at):
    """The end of the attestation day, pinned to UTC.

    `git rev-list --before=2026-07-09T23:59:59` reads that timestamp in the CALLER'S local
    timezone, so the same ledger resolves to different commits — and therefore different
    digests — depending on where the auditor sits. Six rows moved under `TZ=Asia/Tokyo`
    (withdrawal.html, suicide.md, violence.md, collateral_workflow.md, psychotherapy.md,
    case_formulation.md). An attestation digest that depends on the reader's clock is not
    evidence of anything, so the boundary is always UTC and never the ambient zone.
    """
    return "%sT23:59:59+00:00" % at


def _rev_before(root, ref, path, at):
    """The last commit on `ref` touching `path` on or before the attestation day (UTC)."""
    out = _git_text(root, ["rev-list", "-1", "--before=%s" % day_end_utc(at), ref, "--", path])
    return out.strip() or None


def _rev_earliest(root, ref, path):
    """The first commit on `ref` that touches `path`."""
    lines = _git_text(root, ["rev-list", "--reverse", ref, "--", path]).split()
    return lines[0] if lines else None


# --------------------------------------------------------------------------------------
# the report
# --------------------------------------------------------------------------------------


def _short(value):
    return ("%s…" % value[:8]) if isinstance(value, str) and value else "(none)"


def touched_slugs(base_ledger, head_ledger):
    """Slugs this change attests: new at head, or `status`/`contentHash` changed since base.

    This is the whole of `--strict`'s scope. Drift in a row the diff did not touch is the
    normal in-flight state of an edit to a reviewed page; drift in a row the diff DID touch
    is an attestation made against text it does not match.
    """
    touched = []
    for slug, entry in head_ledger.items():
        if not isinstance(entry, dict):
            continue
        before = base_ledger.get(slug)
        if not isinstance(before, dict):
            touched.append(slug)
        elif (before.get("status") != entry.get("status")
              or before.get("contentHash") != entry.get("contentHash")):
            touched.append(slug)
    return sorted(touched)


def base_ledger_at(root, rev):
    """The ledger as of `rev`. Unreadable is exit 2 — a strict run that cannot see the base
    has not checked anything."""
    proc = _git(root, ["show", "%s:%s" % (rev, LEDGER_REL)], check=False)
    if proc.returncode != 0:
        raise InputError("cannot read %s at %s: %s"
                         % (LEDGER_REL, rev, proc.stderr.decode("utf-8", "replace").strip()))
    try:
        return json.loads(proc.stdout.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise InputError("cannot parse %s at %s: %s" % (LEDGER_REL, rev, exc)) from exc


def report_lines(ledger, report, strict_stale, strict_base):
    """One line per finding, in severity order; the caller adds the summary last."""
    lines = []
    for slug in sorted(report["unresolvable"]):
        lines.append("UNRESOLVABLE %s — attested source missing from the tree: %s"
                     % (slug, ", ".join(report["unresolvable"][slug])))
    for slug in sorted(report["unbound"]):
        at = (ledger.get(slug) or {}).get("at", "?")
        lines.append("UNBOUND %s — reviewed %s with no contentHash; bind it through the "
                     "faculty console" % (slug, at))
    for slug in sorted(report["malformed"]):
        entry = ledger.get(slug)
        stored = entry.get("contentHash") if isinstance(entry, dict) else entry
        lines.append("MALFORMED %s — contentHash is not a 40-hex git blob SHA: %.40r"
                     % (slug, stored))
    for slug in sorted(report["unshipped_unlisted"]):
        lines.append("UNSHIPPED %s — reviewed, but no site ships it and it is not on "
                     "LEDGER_ONLY_LEGACY" % slug)
    for slug in sorted(report["stale"]):
        drift = report["stale"][slug]
        lines.append("STALE %s — attested %s, inputs changed (stored %s, actual %s)"
                     % (slug, drift["at"], _short(drift["stored"]), _short(drift["actual"])))
    for slug in strict_stale:
        drift = report["stale"][slug]
        lines.append("STRICT %s — this change attests it, but its inputs do not match head "
                     "(stored %s, actual %s); re-hash it against %s"
                     % (slug, _short(drift["stored"]), _short(drift["actual"]), strict_base))
    return lines


def exit_code(report, strict_stale, considered):
    """0 clean · 1 a finding · 2 could not check. Never 0 over an empty set."""
    if report["unresolvable"]:
        return 2
    if report["unbound"] or report["malformed"] or report["unshipped_unlisted"]:
        return 1
    if strict_stale:
        return 1
    if considered == 0:
        return 2
    return 0


def run_report(root, strict_base=None, fmt="text", stream=None):
    stream = sys.stdout if stream is None else stream
    root = Path(root)
    ledger, shipped, topic_meta = load_inputs(root)
    report = ledger_hash_report(root, ledger, shipped, topic_meta)

    strict_stale = []
    if strict_base is not None:
        base = base_ledger_at(root, strict_base)
        strict_stale = [slug for slug in touched_slugs(base, ledger) if slug in report["stale"]]

    considered = (len(report["bound"]) + len(report["stale"]) + len(report["unbound"])
                  + len(report["malformed"]) + len(report["unresolvable"]))
    code = exit_code(report, strict_stale, considered)
    reviewed = sum(1 for entry in ledger.values()
                   if isinstance(entry, dict) and entry.get("status") == "reviewed")

    if fmt == "json":
        json.dump({
            "schemaVersion": 1,
            "reviewedEntries": reviewed,
            "bound": report["bound"],
            "stale": {slug: {key: drift[key] for key in ("stored", "actual", "at")}
                      for slug, drift in report["stale"].items()},
            "unbound": sorted(report["unbound"]),
            "malformed": sorted(report["malformed"]),
            "unresolvable": report["unresolvable"],
            "legacy": sorted(report["legacy"]),
            "unshippedUnlisted": sorted(report["unshipped_unlisted"]),
            "strictBase": strict_base,
            "strictStale": strict_stale,
            "exitCode": code,
        }, stream, indent=1, sort_keys=True)
        stream.write("\n")
        return code

    for line in report_lines(ledger, report, strict_stale, strict_base):
        print(line, file=stream)
    if considered == 0 and code == 2:
        print("could not check: no reviewed entry in %s resolves to a shipped source — "
              "a pass over an empty set is the defect (SILENT_SHRINK_CHECKLIST §D2/§D4)"
              % LEDGER_REL, file=stream)
    print("attestation hashes: %d bound, %d stale, %d unbound, %d malformed, "
          "%d unresolvable, %d legacy (%d reviewed)"
          % (len(report["bound"]), len(report["stale"]), len(report["unbound"]),
             len(report["malformed"]), len(report["unresolvable"]), len(report["legacy"]),
             reviewed), file=stream)
    return code


# --------------------------------------------------------------------------------------
# --explain
# --------------------------------------------------------------------------------------


def run_explain(root, slug, rev=None, stream=None):
    """One slug's manifest, provenance and hand-reproduction recipe.

    With `--rev` it resolves the manifest AS OF that commit, using the same helpers the
    backfill uses. Without it, a stored hash written as-of-attestation could be printed but
    never re-derived: `--explain` showed today's tree, which for a drifted row is by
    definition not the tree the hash covers. The per-row `rev` lives in the backfill table
    and the handoff record; this is what makes that column usable.
    """
    stream = sys.stdout if stream is None else stream
    root = Path(root)
    ledger, shipped, topic_meta = load_inputs(root)

    paths = sources_for_slug(shipped, slug)
    if not paths:
        raise InputError("%s: no site ships this slug, so it has no attested inputs" % slug)
    entry = ledger.get(slug) if isinstance(ledger.get(slug), dict) else {}
    stored = entry.get("contentHash")

    notes = []
    if rev is None:
        missing = [path for path in paths if not (root / path).is_file()]
        if missing:
            raise InputError("%s: attested source missing from the tree: %s"
                             % (slug, ", ".join(missing)))
        sources = {path: (root / path).read_bytes() for path in paths}
        origins = {path: None for path in paths}
        record = topic_meta.get(slug)
    else:
        resolved = _resolve_rev(root, rev)
        sources, origins = _sources_at_rev(root, history_ref(root), paths, resolved, slug,
                                           entry.get("at"), notes)
        record = _topic_meta_at(root, resolved, {}).get(slug)

    manifest = manifest_for_slug(slug, sources, record)
    actual = blob_sha(manifest.encode("utf-8"))

    print("%s — the inputs its attestation covers%s"
          % (slug, "" if rev is None else " as of %s" % resolved[:7]), file=stream)
    print("", file=stream)
    for path in sorted(sources):
        print("  %s %s" % (path, blob_sha(sources[path])), file=stream)
        print("      %s" % ("working-tree bytes of %s" % path if rev is None
                            else "%s at %s" % (path, origins[path][:7])), file=stream)
    # Mirrors `manifest_for_slug`'s rule exactly: a value that is not a mapping is no
    # record, so there is no `topic_meta` line to print. Printing one would crash inside
    # `canonical_topic_meta_record` (AttributeError on a str) and turn an explanation of a
    # defect into a traceback about it.
    if isinstance(record, dict):
        print("  topic_meta %s" % blob_sha(canonical_topic_meta_record(record)), file=stream)
        print("      %s record %r%s, facultyReview removed, key-sorted, no whitespace"
              % (TOPIC_META_REL, slug, "" if rev is None else " at %s" % resolved[:7]),
              file=stream)
    else:
        print("  (no topic_meta record for this slug — no topic_meta line)", file=stream)
    for note in notes:
        print(note, file=stream)

    print("", file=stream)
    print("manifest (%d line(s); its blob SHA is the contentHash):" % len(manifest.splitlines()),
          file=stream)
    for line in manifest.splitlines():
        print("  | %s" % line, file=stream)

    print("", file=stream)
    print("  ledger   %s%s" % (entry.get("status", "(no row)"),
                               (" on %s by %s" % (entry.get("at"), entry.get("by")))
                               if entry.get("at") else ""), file=stream)
    print("  stored   %s" % (stored if stored else "(none — unbound)"), file=stream)
    print("  %s %s" % ("actual  " if rev is None else "at rev  ", actual), file=stream)
    if rev is None:
        print("  state    %s" % ("BOUND" if stored == actual
                                 else "UNBOUND" if not stored else "STALE"), file=stream)
    else:
        print("  verdict  %s" % ("this rev REPRODUCES the stored hash" if stored == actual
                                 else "this rev does NOT reproduce the stored hash"),
              file=stream)

    print("", file=stream)
    print("reproduce by hand:", file=stream)
    for path in sorted(sources):
        print("  %s" % ("git hash-object --no-filters %s" % path if rev is None
                        else "git rev-parse %s:%s" % (origins[path][:7], path)), file=stream)
    quoted = " ".join("'%s'" % line for line in manifest.splitlines())
    print("  printf '%%s\\n' %s | git hash-object --stdin" % quoted, file=stream)
    return 0


# --------------------------------------------------------------------------------------
# --write-backfill: bind each existing attestation to the inputs as of its own `at` date
# --------------------------------------------------------------------------------------


def _topic_meta_at(root, rev, cache):
    """The source topic_meta.json as of `rev`; absent reads as {} (so: no topic_meta line)."""
    if rev not in cache:
        data = _blob_at(root, rev, TOPIC_META_REL)
        if data is None:
            cache[rev] = {}
        else:
            try:
                cache[rev] = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, ValueError) as exc:
                raise InputError("cannot parse %s at %s: %s" % (TOPIC_META_REL, rev, exc))
    return cache[rev]


def _resolve_rev(root, rev):
    """`rev` as a full commit SHA; an unresolvable one is exit 2, not a guess."""
    proc = _git(root, ["rev-parse", "--verify", "--quiet", "%s^{commit}" % rev], check=False)
    resolved = proc.stdout.decode("utf-8", "replace").strip()
    if proc.returncode != 0 or not resolved:
        raise InputError("%s does not resolve to a commit here" % rev)
    return resolved


def _sources_at_rev(root, ref, paths, rev, slug, at, notes):
    """(bytes per path, rev each came from) as of `rev`.

    One definition, shared by the backfill and `--explain --rev`, so the two can never
    disagree about which blob a row's hash covers. A path absent at `rev` falls back to its
    OWN nearest commit and the fallback is recorded in `notes` rather than swallowed.
    """
    sources, origins = {}, {}
    for path in paths:
        data, origin = _blob_at(root, rev, path), rev
        if data is None:
            own = (_rev_before(root, ref, path, at) if at else None) \
                or _rev_earliest(root, ref, path)
            data = _blob_at(root, own, path) if own else None
            if data is None:
                raise GitError("%s: %s exists in no commit on %s" % (slug, path, ref))
            origin = own
            notes.append("  note: %s — %s absent at %s, taken from its own %s"
                         % (slug, path, rev[:7], own[:7]))
        sources[path], origins[path] = data, origin
    return sources, origins


def _row_as_of_attestation(root, ref, shipped, slug, at, cache, notes):
    """(rev, basis, hash) for one slug, hashing the inputs as of its own attestation date."""
    paths = sources_for_slug(shipped, slug)
    primary = paths[0]
    rev, basis = _rev_before(root, ref, primary, at), "at-date"
    if rev is None:
        rev, basis = _rev_earliest(root, ref, primary), "earliest"
    if rev is None:
        raise GitError("%s: no commit on %s touches %s" % (slug, ref, primary))

    sources, _ = _sources_at_rev(root, ref, paths, rev, slug, at, notes)
    return rev, basis, digest(slug, sources, _topic_meta_at(root, rev, cache).get(slug))


def _stale_now(root, shipped, topic_meta, slug, content_hash):
    try:
        return "yes" if digest_from_tree(root, shipped, topic_meta, slug) != content_hash \
            else "no"
    except (FileNotFoundError, AttestationHashError):
        return "unresolvable"


def write_table(path, rows, ref, as_of):
    """The audit table that goes in the backfill PR body."""
    lines = [
        "# Truthful contentHash backfill — %d row(s)" % len(rows),
        "",
        "History read from `%s`.%s" % (ref, "" if ref == "origin/main"
                                       else " (`origin/main` does not resolve here.)"),
        "",
        "The attestation day ends at **23:59:59 UTC**, pinned explicitly: git reads a bare "
        "local timestamp, and six rows resolved to different commits under `TZ=Asia/Tokyo`.",
        "",
        "`basis=at-date` means the page's primary source has a commit on or before its `at` "
        "date and the tree as of that commit was hashed. `basis=earliest` means it does not, "
        "so the earliest recorded blob was used instead — the honest answer to \"what did the "
        "reviewer see?\" when the history does not reach back that far. `basis=now` is "
        "`--as-of-now`: the working tree. `commits since at` counts commits on the history ref "
        "touching the slug's sources after its attestation day. Reproduce any row with "
        "`--explain <slug> --rev <rev>`.",
        "",
        "| slug | at | rev | basis | commits since at | stale now |",
        "|---|---|---|---|---|---|",
    ]
    for row in rows:
        lines.append("| %s | %s | %s | %s | %s | %s |"
                     % (row["slug"], row["at"], row["rev"], row["basis"],
                        row["commits"], row["stale"]))
    lines.append("")
    lines.append("Mode: `--as-of-%s`. `at` and `by` are untouched; the only key added is "
                 "`contentHash`." % as_of)
    lines.append("")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def run_backfill(root, as_of="attestation", table_path=None, stream=None):
    stream = sys.stdout if stream is None else stream
    root = Path(root)
    ledger, shipped, topic_meta = load_inputs(root)

    dirty = _git_text(root, ["status", "--porcelain", "--", LEDGER_REL]).strip()
    if dirty:
        raise InputError("%s has uncommitted changes — the backfill must be the only edit in "
                         "its commit; commit or revert them first" % LEDGER_REL)

    report = ledger_hash_report(root, ledger, shipped, topic_meta)
    targets = sorted(report["unbound"])
    ref = history_ref(root)
    cache, notes, rows = {}, [], []

    for slug in targets:
        at = ledger[slug].get("at")
        if not at:
            raise InputError("%s: reviewed with no `at` date; cannot bind it truthfully" % slug)
        if as_of == "now":
            rev, basis = "(working tree)", "now"
            try:
                content_hash = digest_from_tree(root, shipped, topic_meta, slug)
            except OSError as exc:
                # `unbound` is decided before `unresolvable` (attestation_hash.py:205 precedes
                # :215), so an unbound row whose source is gone reaches here. Refusing is the
                # only honest answer: --as-of-now has no other tree to read.
                raise InputError("%s: attested source missing from the tree (%s); "
                                 "--as-of-attestation reads it from history instead"
                                 % (slug, exc)) from exc
        else:
            rev, basis, content_hash = _row_as_of_attestation(
                root, ref, shipped, slug, at, cache, notes)
        ledger[slug]["contentHash"] = content_hash
        paths = sources_for_slug(shipped, slug)
        commits = _git_text(root, ["rev-list", "--count", "--since=%s" % day_end_utc(at), ref,
                                   "--", *paths]).strip() or "0"
        rows.append({"slug": slug, "at": at, "rev": rev[:7] if basis != "now" else rev,
                     "basis": basis, "commits": commits,
                     "stale": _stale_now(root, shipped, topic_meta, slug, content_hash)})
        print("bound %s — %s, %s %s -> %s"
              % (slug, at, rev[:7] if basis != "now" else rev, basis, _short(content_hash)),
              file=stream)

    for note in notes:
        print(note, file=stream)

    if targets:
        (root / LEDGER_REL).write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    if table_path:
        write_table(table_path, rows, ref, as_of)

    by_basis = {basis: sum(1 for row in rows if row["basis"] == basis)
                for basis in ("at-date", "earliest", "now")}
    print("backfill: %d rows bound (%d at-date, %d earliest-recorded, %d as-of-now) — %s"
          % (len(rows), by_basis["at-date"], by_basis["earliest"], by_basis["now"],
             ("wrote %s" % LEDGER_REL) if targets else "nothing unbound, ledger untouched"),
          file=stream)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=None,
                        help="repository root to check (default: this checkout)")
    parser.add_argument("--strict", action="store_true",
                        help="also fail when a row THIS change attests is stale at head")
    parser.add_argument("--base", default=None, help="the merge ref --strict compares against")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--explain", metavar="SLUG", default=None,
                        help="print one slug's manifest, provenance and hash-object recipe")
    parser.add_argument("--rev", metavar="REV", default=None,
                        help="with --explain: resolve the manifest as of REV, so a stored "
                             "hash written as-of-attestation can be re-derived")
    parser.add_argument("--write-backfill", action="store_true",
                        help="add a contentHash to every unbound reviewed row")
    parser.add_argument("--as-of-attestation", action="store_true",
                        help="backfill from the inputs as of each row's own `at` (default)")
    parser.add_argument("--as-of-now", action="store_true",
                        help="backfill from the working tree instead")
    parser.add_argument("--table", metavar="PATH.md", default=None,
                        help="write the backfill's audit table here")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    root = Path(args.root).resolve() if args.root else ROOT
    try:
        if args.as_of_attestation and args.as_of_now:
            raise InputError("--as-of-attestation and --as-of-now are exclusive")
        if args.strict and not args.base:
            raise InputError("--strict requires --base REV: the scope it checks is what "
                             "changed between that ref and head")
        if args.base and not args.strict:
            raise InputError("--base is only meaningful with --strict")
        if args.write_backfill:
            if args.strict or args.explain or args.rev:
                raise InputError("--write-backfill does not combine with --strict, --explain "
                                 "or --rev")
            return run_backfill(root, "now" if args.as_of_now else "attestation", args.table)
        if args.rev and not args.explain:
            raise InputError("--rev is only meaningful with --explain")
        if args.explain:
            return run_explain(root, args.explain, args.rev)
        return run_report(root, args.base, args.format)
    except (InputError, GitError, AttestationHashError, OSError) as exc:
        # OSError is the backstop, not a formality: a file this tool must read or write can
        # vanish anywhere (a deleted attested source, an unwritable --table). "Could not
        # check" is exit 2 by contract, and a traceback exits 1 — which reads as a finding.
        print("could not check: %s" % exc, file=sys.stderr)
        return 2


# --------------------------------------------------------------------------------------
# self-test — hermetic: tmp roots and tmp git repos only, never the live tree
# --------------------------------------------------------------------------------------

ALPHA = b"alpha\n"
ALPHA_REVISED = b"alpha, revised\n"
BETA = b"beta\n"
BETA_REVISED = b"beta, revised\n"
GAMMA = b"gamma\n"
ATTESTER = "Joshua Moss, MD"


def _fixture_shipped():
    """x.md ships from one source; w.md from two (the resident-override shape)."""
    return {
        "version": 1,
        "pages": [
            {"kind": "page", "slug": "x.md", "source": "a.md", "sites": ["ms3"]},
            {
                "kind": "page",
                "slug": "w.md",
                "source": "a.md",
                "extraSources": ["b.md"],
                "sites": ["ms3", "res"],
            },
        ],
    }


def _fixture_topic_meta(tldr="one"):
    return {
        "x.md": {
            "tldr": tldr,
            "facultyReview": {
                "status": "reviewed",
                "reviewer": ATTESTER,
                "lastReviewed": "2026-07-01",
            },
        }
    }


def _entry(status="reviewed", at="2026-07-01", content_hash=None):
    entry = {"status": status, "risk": {"kind": "clinical", "level": "moderate"},
             "at": at, "by": ATTESTER if status == "reviewed" else "Pending faculty review"}
    if content_hash is not None:
        entry["contentHash"] = content_hash
    return entry


def _write_root(root, ledger, files=None, topic_meta=None, shipped=None):
    """Lay out a fixture root: the three inputs plus the source files."""
    root = Path(root)
    files = {"a.md": ALPHA, "b.md": BETA} if files is None else files
    for name, data in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_bytes(data)
    for rel, doc in (
        (LEDGER_REL, ledger),
        (SHIPPED_REL, _fixture_shipped() if shipped is None else shipped),
        (TOPIC_META_REL, _fixture_topic_meta() if topic_meta is None else topic_meta),
    ):
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    return root


def _run(argv):
    """Run the CLI, capturing both streams. A crash is a failure, not a traceback."""
    out, err = io.StringIO(), io.StringIO()
    try:
        with redirect_stdout(out), redirect_stderr(err):
            code = main(argv)
    except SystemExit as exc:  # argparse
        code = exc.code
    except Exception as exc:  # noqa: BLE001 — a crash must read as a failed case
        return -1, "%s: %s" % (type(exc).__name__, exc)
    return code, out.getvalue() + err.getvalue()


def _fixture_git_env(extra=None):
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update({
        "GIT_AUTHOR_NAME": "Fixture",
        "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
        "GIT_COMMITTER_NAME": "Fixture",
        "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
    })
    if extra:
        env.update(extra)
    return env


def _fixture_git(root, args, date=None):
    extra = {"GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date} if date else None
    proc = subprocess.run(["git", *args], cwd=str(root), capture_output=True, text=True,
                          env=_fixture_git_env(extra))
    if proc.returncode != 0:
        raise GitError("fixture git %s failed: %s" % (" ".join(args), proc.stderr.strip()))
    return proc.stdout


def _fixture_repo(root):
    """An empty git repo at `root`, isolated from the ambient git environment."""
    _fixture_git(root, ["-c", "init.defaultBranch=main", "init", "-q"])
    _fixture_git(root, ["config", "user.name", "Fixture"])
    _fixture_git(root, ["config", "user.email", "fixture@example.invalid"])
    _fixture_git(root, ["config", "commit.gpgsign", "false"])
    return root


def _fixture_commit(root, message, date):
    _fixture_git(root, ["add", "-A"])
    _fixture_git(root, ["commit", "-q", "--no-verify", "-m", message], date=date)
    return _fixture_git(root, ["rev-parse", "HEAD"]).strip()


def _tmp(stack):
    holder = tempfile.TemporaryDirectory()
    stack.append(holder)
    return Path(holder.name)


class _tz:
    """Run a block under a given TZ, restoring the ambient one afterwards.

    `_git` passes the process environment through to git, TZ included, so this is how the
    self-test reproduces an auditor in another timezone without leaving one behind.
    """

    def __init__(self, zone):
        self.zone, self.previous = zone, None

    def __enter__(self):
        self.previous = os.environ.get("TZ")
        os.environ["TZ"] = self.zone
        return self

    def __exit__(self, *exc):
        if self.previous is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = self.previous
        return False


def _read_text(path):
    """A file the tool was supposed to write; absent reads as empty, not as a traceback."""
    try:
        return Path(path).read_text(encoding="utf-8")
    except OSError:
        return ""


def _table_rows(text):
    """The audit table's DATA rows, as {slug: [slug, at, rev, basis, commits, stale]}.

    Asserting on the table's prose instead of its rows is how a check goes vacuous: the
    explanatory paragraph names every basis, so `basis=at-date` appears in a table with no
    rows at all (SILENT_SHRINK_CHECKLIST §D2). Only a parsed row can answer what the tool
    actually recorded for a slug.
    """
    rows = {}
    for line in text.splitlines():
        if not line.startswith("|") or line.startswith("| slug ") or set(line) <= set("|- "):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) == 6:
            rows[cells[0]] = cells
    return rows


def _cell(rows, slug, index):
    return rows[slug][index] if slug in rows else "(no row for %s)" % slug


def self_test():  # noqa: C901 — a flat list of cases reads better than helpers here
    failures, cases, stack = [], [], []

    def check(name, got, want):
        cases.append(name)
        if got != want:
            failures.append("%s: got %r, want %r" % (name, got, want))

    def check_in(name, needle, haystack):
        cases.append(name)
        if needle not in haystack:
            failures.append("%s: %r not in output %r" % (name, needle, haystack[:400]))

    try:
        # ---- the plain report ---------------------------------------------------------
        root = _write_root(_tmp(stack), {})
        shipped, topic_meta = _fixture_shipped(), _fixture_topic_meta()
        x_hash = digest_from_tree(root, shipped, topic_meta, "x.md")
        w_hash = digest_from_tree(root, shipped, topic_meta, "w.md")

        root = _write_root(_tmp(stack), {"x.md": _entry(content_hash=x_hash)})
        code, out = _run(["--root", str(root)])
        check("a bound ledger exits 0", code, 0)
        check_in("and says so", "1 bound", out)

        root = _write_root(_tmp(stack), {"x.md": _entry(content_hash=x_hash)},
                           files={"a.md": ALPHA_REVISED, "b.md": BETA})
        code, out = _run(["--root", str(root)])
        check("an edited source does not fail the plain run", code, 0)
        check_in("but is reported as STALE", "STALE x.md", out)
        check_in("with the date the review was given", "2026-07-01", out)

        root = _write_root(_tmp(stack), {"x.md": _entry()})
        code, out = _run(["--root", str(root)])
        check("a reviewed entry with no contentHash exits 1", code, 1)
        check_in("and says UNBOUND", "UNBOUND x.md", out)

        root = _write_root(_tmp(stack), {"x.md": _entry(content_hash="d" * 64)})
        code, out = _run(["--root", str(root)])
        check("a 64-hex contentHash exits 1", code, 1)
        check_in("and says MALFORMED", "MALFORMED x.md", out)

        root = _write_root(_tmp(stack), {"x.md": _entry(content_hash="")})
        code, out = _run(["--root", str(root)])
        check("an empty contentHash exits 1", code, 1)
        check_in("and is malformed, not unbound", "MALFORMED x.md", out)

        root = _write_root(_tmp(stack), {"w.md": _entry(content_hash=w_hash)})
        (root / "b.md").unlink()
        code, out = _run(["--root", str(root)])
        check("a missing attested source exits 2 (could not check)", code, 2)
        check_in("and says UNRESOLVABLE", "UNRESOLVABLE w.md", out)

        root = _write_root(_tmp(stack), {"ghost.md": _entry(content_hash=x_hash)})
        code, out = _run(["--root", str(root)])
        check("a reviewed slug no site ships exits 1", code, 1)
        check_in("and says UNSHIPPED", "UNSHIPPED ghost.md", out)

        # §D2/§D4: a pass over an empty set is the defect, not the absence of one.
        root = _write_root(_tmp(stack), {"x.md": _entry(status="pending")})
        code, out = _run(["--root", str(root)])
        check("a ledger with no reviewed shipped row exits 2, not 0", code, 2)
        check_in("and says it could not check", "could not check", out)

        root = _write_root(_tmp(stack), {"x.md": _entry(content_hash=x_hash)})
        code, out = _run(["--root", str(root), "--format", "json"])
        check("--format json exits 0 on a bound ledger", code, 0)
        try:
            payload = json.loads(out)
        except ValueError:
            payload = {}
        check("--format json emits the report", payload.get("bound"), {"x.md": x_hash})
        check("with an explicit exit code", payload.get("exitCode"), 0)

        # ---- --explain ----------------------------------------------------------------
        code, out = _run(["--root", str(root), "--explain", "x.md"])
        check("--explain exits 0", code, 0)
        check_in("prints the manifest line for the source", "a.md ", out)
        check_in("prints the topic_meta line", "topic_meta ", out)
        check_in("prints the hash-object recipe", "git hash-object --stdin", out)
        check_in("and the stored hash", x_hash, out)

        code, out = _run(["--root", str(root), "--explain", "ghost.md"])
        check("--explain on a slug no site ships exits 2", code, 2)

        # A topic_meta value that is not a record is no record — `--explain` must MIRROR
        # `manifest_for_slug`, not crash. Before the guard this raised
        # `AttributeError: 'str' object has no attribute 'items'` out of
        # canonical_topic_meta_record, so the one command that explains a defect died on it.
        bad = _write_root(_tmp(stack), {"x.md": _entry(content_hash=x_hash)},
                          topic_meta={"x.md": "not a record"})
        code, out = _run(["--root", str(bad), "--explain", "x.md"])
        check("--explain on a non-record topic_meta value exits 0", code, 0)
        check_in("still prints the source line", "a.md ", out)
        check("and prints no topic_meta line", "  topic_meta " in out, False)
        check_in("saying so in words", "no topic_meta record for this slug", out)

        code, out = _run(["--root", str(root), "--rev", "HEAD"])
        check("--rev without --explain exits 2", code, 2)

        # ---- --strict is diff-scoped (A-2) --------------------------------------------
        code, out = _run(["--root", str(root), "--strict"])
        check("--strict without --base exits 2", code, 2)
        check_in("and says why", "--base", out)

        repo = _fixture_repo(_tmp(stack))
        _write_root(repo, {"x.md": _entry(content_hash=x_hash),
                           "w.md": _entry(status="pending")})
        base = _fixture_commit(repo, "base", "2026-07-01T12:00:00 +0000")
        # head: x.md untouched by the diff but stale (a.md edited); w.md promoted and clean.
        (repo / "a.md").write_bytes(ALPHA_REVISED)
        w_head = digest_from_tree(repo, shipped, topic_meta, "w.md")
        _write_root(repo, {"x.md": _entry(content_hash=x_hash),
                           "w.md": _entry(content_hash=w_head)},
                    files={"a.md": ALPHA_REVISED, "b.md": BETA})
        code, out = _run(["--root", str(repo), "--strict", "--base", base])
        check("--strict passes drift the diff did not touch", code, 0)
        check_in("while still reporting it", "STALE x.md", out)

        # head: w.md promoted AND stale — the shape strict exists to catch.
        _write_root(repo, {"x.md": _entry(content_hash=x_hash),
                           "w.md": _entry(content_hash=w_hash)},
                    files={"a.md": ALPHA_REVISED, "b.md": BETA})
        code, out = _run(["--root", str(repo), "--strict", "--base", base])
        check("--strict fails a promoted row that is stale at head", code, 1)
        check_in("and names it", "STRICT w.md", out)

        code, out = _run(["--root", str(repo), "--strict", "--base", "nosuchrev"])
        check("--strict on an unreadable base exits 2", code, 2)

        # ---- the truthful backfill ----------------------------------------------------
        # Three commits, so that NO row's honest answer equals the working tree: a
        # working-tree fallback anywhere in the backfill has to show up as a wrong hash.
        repo = _fixture_repo(_tmp(stack))
        ledger = {"x.md": _entry(at="2025-01-01"), "w.md": _entry(at="2025-01-01"),
                  "v.md": _entry(at="2025-01-01")}
        back_shipped = {
            "version": 1,
            "pages": [
                {"kind": "page", "slug": "x.md", "source": "a.md", "sites": ["ms3"]},
                {"kind": "page", "slug": "w.md", "source": "b.md", "sites": ["res"]},
                {"kind": "page", "slug": "v.md", "source": "a.md",
                 "extraSources": ["c.md"], "sites": ["ms3", "res"]},
            ],
        }
        _write_root(repo, ledger, files={"a.md": ALPHA},
                    topic_meta=_fixture_topic_meta("one"), shipped=back_shipped)
        first_rev = _fixture_commit(repo, "first", "2020-01-01T12:00:00 +0000")
        # b.md is born AFTER the attestation date; a.md changes after it.
        _write_root(repo, ledger, files={"a.md": ALPHA_REVISED, "b.md": BETA},
                    topic_meta=_fixture_topic_meta("two"), shipped=back_shipped)
        second_rev = _fixture_commit(repo, "second", "2030-01-01T12:00:00 +0000")
        # b.md changes again, and c.md is born last of all.
        _write_root(repo, ledger, files={"a.md": ALPHA_REVISED, "b.md": BETA_REVISED,
                                         "c.md": GAMMA},
                    topic_meta=_fixture_topic_meta("two"), shipped=back_shipped)
        _fixture_commit(repo, "third", "2031-01-01T12:00:00 +0000")
        before_text = _read_text(repo / LEDGER_REL)

        table = repo / "table.md"
        code, out = _run(["--root", str(repo), "--write-backfill", "--as-of-attestation",
                          "--table", str(table)])
        check("--write-backfill exits 0", code, 0)
        written = json.loads(_read_text(repo / LEDGER_REL) or "{}")
        check("x.md is bound to the blob as of its attestation date",
              written.get("x.md", {}).get("contentHash"),
              digest("x.md", {"a.md": ALPHA}, _fixture_topic_meta("one")["x.md"]))
        check("which is NOT the working tree's hash",
              written.get("x.md", {}).get("contentHash")
              == digest_from_tree(repo, back_shipped, _fixture_topic_meta("two"), "x.md"),
              False)
        check("a path with no commit before `at` falls back to its earliest blob",
              written.get("w.md", {}).get("contentHash"),
              digest("w.md", {"b.md": BETA}, None))
        check("which is NOT the working tree's hash either",
              written.get("w.md", {}).get("contentHash")
              == digest_from_tree(repo, back_shipped, _fixture_topic_meta("two"), "w.md"),
              False)
        # v.md's primary source pins the page to the first commit, where c.md does not yet
        # exist; that source falls back to its OWN earliest blob and the run says so.
        check("a source absent at the page's rev falls back to its own nearest commit",
              written.get("v.md", {}).get("contentHash"),
              digest("v.md", {"a.md": ALPHA, "c.md": GAMMA}, None))
        check_in("and the fallback is announced, not silent", "c.md absent at", out)
        check("contentHash is the last key of the entry",
              list(written.get("x.md", {}))[-1:], ["contentHash"])
        stripped = {slug: {k: v for k, v in entry.items() if k != "contentHash"}
                    for slug, entry in written.items()}
        check("and nothing else changed", stripped, json.loads(before_text))
        # The line-level shape A4's step 2 checks: every line the write ADDED is either a
        # contentHash line or the line before it, which gained a trailing comma.
        before_lines = before_text.splitlines()
        added = [line for line in _read_text(repo / LEDGER_REL).splitlines()
                 if line not in before_lines]
        check("every added line is a contentHash line or a line that gained a comma",
              [line for line in added
               if '"contentHash"' not in line and line.rstrip(",") not in before_lines], [])

        # The table's ROWS, not its prose: the explanatory paragraph names every basis, so a
        # table with zero rows would satisfy a substring check for "at-date" (§D2).
        table_text = _read_text(table)
        check_in("the table names the history ref it read", "History read from `HEAD`",
                 table_text)
        check_in("the table has the agreed columns",
                 "| slug | at | rev | basis | commits since at | stale now |", table_text)
        table_rows = _table_rows(table_text)
        check("the table has one row per bound slug", sorted(table_rows), ["v.md", "w.md", "x.md"])
        check("x.md's ROW says basis=at-date", _cell(table_rows, "x.md", 3), "at-date")
        check("and names the commit it hashed", _cell(table_rows, "x.md", 2), first_rev[:7])
        check("and carries its attestation date", _cell(table_rows, "x.md", 1), "2025-01-01")
        check("and records that it is stale now", _cell(table_rows, "x.md", 5), "yes")
        check("w.md's ROW says basis=earliest", _cell(table_rows, "w.md", 3), "earliest")
        check("and names b.md's earliest commit", _cell(table_rows, "w.md", 2), second_rev[:7])

        # The rev column is only useful if it can be replayed: --explain --rev must re-derive
        # the STORED hash of a drifted row, which plain --explain (today's tree) cannot.
        x_stored = written.get("x.md", {}).get("contentHash")
        code, out = _run(["--root", str(repo), "--explain", "x.md", "--rev", first_rev])
        check("--explain --rev exits 0", code, 0)
        # Anchored on the `at rev` line: the `stored` line prints that hash either way.
        check_in("reproduces the stored at-date hash", "at rev   %s" % x_stored, out)
        check_in("and says so in as many words", "this rev REPRODUCES the stored hash", out)
        check_in("with a recipe against that rev", "git rev-parse %s:a.md" % first_rev[:7], out)
        code, out = _run(["--root", str(repo), "--explain", "x.md"])
        check("plain --explain still reads today's tree", code, 0)
        check_in("so the same row reads STALE there", "state    STALE", out)
        code, out = _run(["--root", str(repo), "--explain", "x.md", "--rev", "nosuchrev"])
        check("--explain on an unresolvable rev exits 2", code, 2)

        _fixture_commit(repo, "backfill", "2030-01-02T12:00:00 +0000")
        code, out = _run(["--root", str(repo), "--write-backfill"])
        check("a second run has nothing to bind", code, 0)
        check_in("and says so", "0 rows", out)

        # --as-of-now hashes the working tree (fixtures and the owner's own re-binding).
        repo2 = _fixture_repo(_tmp(stack))
        _write_root(repo2, {"x.md": _entry(at="2025-01-01")}, files={"a.md": ALPHA_REVISED},
                    topic_meta=_fixture_topic_meta("two"), shipped=back_shipped)
        _fixture_commit(repo2, "only", "2030-01-01T12:00:00 +0000")
        code, out = _run(["--root", str(repo2), "--write-backfill", "--as-of-now"])
        check("--as-of-now exits 0", code, 0)
        now_written = json.loads(_read_text(repo2 / LEDGER_REL) or "{}")
        check("--as-of-now binds the working tree",
              now_written.get("x.md", {}).get("contentHash"),
              digest_from_tree(repo2, back_shipped, _fixture_topic_meta("two"), "x.md"))

        # An unbound row whose source is GONE from the tree. `unbound` is classified before
        # `unresolvable`, so the row is targeted; --as-of-now has no tree left to read it
        # from, and "could not check" is exit 2 — a traceback would exit 1 and read as a
        # finding. --as-of-attestation still binds it, because history still has the bytes.
        repo4 = _fixture_repo(_tmp(stack))
        _write_root(repo4, {"x.md": _entry(at="2025-01-01")}, files={"a.md": ALPHA},
                    topic_meta=_fixture_topic_meta("one"), shipped=back_shipped)
        _fixture_commit(repo4, "only", "2020-01-01T12:00:00 +0000")
        gone_text = _read_text(repo4 / LEDGER_REL)
        (repo4 / "a.md").unlink()
        code, out = _run(["--root", str(repo4), "--write-backfill", "--as-of-now"])
        check("--as-of-now over a missing source exits 2, not a traceback", code, 2)
        check_in("and says it could not check", "could not check", out)
        check_in("naming the slug", "x.md", out)
        check("and writes nothing", _read_text(repo4 / LEDGER_REL), gone_text)
        code, out = _run(["--root", str(repo4), "--write-backfill", "--as-of-attestation",
                          "--table", str(repo4 / "gone.md")])
        check("--as-of-attestation binds it from history instead", code, 0)
        check("to the blob that commit holds",
              json.loads(_read_text(repo4 / LEDGER_REL) or "{}").get("x.md", {})
              .get("contentHash"),
              digest("x.md", {"a.md": ALPHA}, _fixture_topic_meta("one")["x.md"]))
        check("and its row reports `stale now` as unresolvable, never as clean",
              _cell(_table_rows(_read_text(repo4 / "gone.md")), "x.md", 5), "unresolvable")

        # ---- the attestation-day boundary is UTC, not the auditor's clock -------------
        # A commit at 20:00 UTC on the attestation day is INSIDE the day in UTC and OUTSIDE
        # it in Tokyo (UTC+9), which is how six live rows resolved to different revs — and
        # different digests — depending on where the run happened.
        tz_shipped = {"version": 1,
                      "pages": [{"kind": "page", "slug": "x.md", "source": "a.md",
                                 "sites": ["ms3"]}]}

        def tz_repo():
            repo = _fixture_repo(_tmp(stack))
            _write_root(repo, {"x.md": _entry(at="2025-01-01")}, files={"a.md": ALPHA},
                        topic_meta={}, shipped=tz_shipped)
            _fixture_commit(repo, "before the day", "2024-01-01T12:00:00 +0000")
            _write_root(repo, {"x.md": _entry(at="2025-01-01")},
                        files={"a.md": ALPHA_REVISED}, topic_meta={}, shipped=tz_shipped)
            _fixture_commit(repo, "20:00 UTC on the day", "2025-01-01T20:00:00 +0000")
            return repo

        boundary = tz_repo()
        bare = {}
        pinned = {}
        for zone in ("UTC", "Asia/Tokyo"):
            with _tz(zone):
                bare[zone] = _git_text(
                    boundary,
                    ["rev-list", "-1", "--before=2025-01-01T23:59:59", "HEAD", "--", "a.md"],
                ).strip()
                pinned[zone] = _rev_before(boundary, "HEAD", "a.md", "2025-01-01")
        # Anti-vacuity: prove this fixture is one where an unpinned boundary really moves.
        check("the fixture is one where a LOCAL boundary would differ",
              bare["UTC"] != bare["Asia/Tokyo"], True)
        check("but the pinned boundary resolves the same rev in both zones",
              pinned["UTC"] == pinned["Asia/Tokyo"], True)

        tz_hashes = {}
        for zone in ("UTC", "Asia/Tokyo"):
            repo_tz = tz_repo()
            with _tz(zone):
                code, out = _run(["--root", str(repo_tz), "--write-backfill"])
            check("--write-backfill exits 0 under TZ=%s" % zone, code, 0)
            tz_hashes[zone] = json.loads(_read_text(repo_tz / LEDGER_REL) or "{}") \
                .get("x.md", {}).get("contentHash")
        check("the backfilled hash does not depend on the auditor's timezone",
              tz_hashes["UTC"], tz_hashes["Asia/Tokyo"])
        check("and it is the blob from inside the UTC day",
              tz_hashes["UTC"], digest("x.md", {"a.md": ALPHA_REVISED}, None))

        # a dirty ledger is refused: the backfill must be the only change in its commit.
        repo3 = _fixture_repo(_tmp(stack))
        _write_root(repo3, {"x.md": _entry(at="2025-01-01")}, files={"a.md": ALPHA},
                    topic_meta=_fixture_topic_meta("one"), shipped=back_shipped)
        _fixture_commit(repo3, "only", "2020-01-01T12:00:00 +0000")
        dirty = json.loads((repo3 / LEDGER_REL).read_text(encoding="utf-8"))
        dirty["x.md"]["at"] = "2025-02-02"
        (repo3 / LEDGER_REL).write_text(json.dumps(dirty, indent=2) + "\n", encoding="utf-8")
        dirty_text = _read_text(repo3 / LEDGER_REL)
        code, out = _run(["--root", str(repo3), "--write-backfill"])
        check("--write-backfill refuses a dirty reviewed.json", code, 2)
        check("and leaves it untouched", _read_text(repo3 / LEDGER_REL), dirty_text)

        # ---- unreadable inputs are exit 2, never a pass -------------------------------
        root = _tmp(stack)
        code, out = _run(["--root", str(root)])
        check("a root with no ledger exits 2", code, 2)
    finally:
        for holder in stack:
            holder.cleanup()

    if failures:
        for line in failures:
            print("  FAIL %s" % line, file=sys.stderr)
        print("self-test: %d/%d failed" % (len(failures), len(cases)), file=sys.stderr)
        return 1
    print("self-test: %d/%d passed" % (len(cases), len(cases)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
