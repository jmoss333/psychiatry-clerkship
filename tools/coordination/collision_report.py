#!/usr/bin/env python3
"""Classify proposed repository paths against concurrent-work evidence."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from io import TextIOBase
from pathlib import Path, PurePosixPath
from typing import Sequence


STATUS_RANK = {"SAFE": 0, "COORDINATE": 1, "OCCUPIED": 2}
REASON_ORDER = (
    "local_dirty_overlap",
    "active_branch_overlap",
    "inactive_branch_overlap",
    "active_agent_scope",
    "open_pr_overlap",
    "duplicate_open_pr_head",
    "incomplete_evidence",
)
SAFE_REF = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]*")
SAFE_REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
SAFE_WORKTREE_ID = re.compile(r"wt[1-9][0-9]*")
SAFE_HEAD_OID = re.compile(r"[0-9a-fA-F]{40,64}")
KNOWN_DEGRADED_SOURCES = frozenset(("claude_agents", "github", "local_git"))


@dataclass(frozen=True)
class LocalEvidence:
    """One repository-relative path associated with a sanitized worktree id."""

    path: str
    worktree_id: str


@dataclass(frozen=True)
class PullRequestEvidence:
    """The path-only portion of one open pull request."""

    number: int
    head_oid: str
    base_ref: str
    paths: tuple[str, ...]


@dataclass(frozen=True)
class EvidenceSnapshot:
    """Point-in-time evidence consumed by the pure classifier."""

    dirty: tuple[LocalEvidence, ...] = ()
    active_branch: tuple[LocalEvidence, ...] = ()
    inactive_branch: tuple[LocalEvidence, ...] = ()
    active_scopes: tuple[LocalEvidence, ...] = ()
    pull_requests: tuple[PullRequestEvidence, ...] = ()
    degraded_sources: tuple[str, ...] = ()
    case_insensitive: bool = False


class ProbeFailure(RuntimeError):
    """A read-only evidence source could not be inspected completely."""


class ReadOnlyRunner:
    """Execute only the command shapes used by the collision sentinel."""

    timeout_seconds = 20

    @staticmethod
    def _allowed(argv: tuple[str, ...]) -> bool:
        if argv in (
            ("git", "worktree", "list", "--porcelain"),
            (
                "git",
                "symbolic-ref",
                "--quiet",
                "--short",
                "refs/remotes/origin/HEAD",
            ),
            ("git", "config", "--bool", "core.ignorecase"),
            ("claude", "agents", "--json"),
            ("gh", "repo", "view", "--json", "nameWithOwner"),
        ):
            return True
        if len(argv) == 7 and argv[:2] == ("git", "-C"):
            return argv[3:] == (
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
            )
        if len(argv) == 8 and argv[:2] == ("git", "-C"):
            return (
                argv[3:7]
                == ("diff", "--name-status", "-z", "--find-renames")
                and bool(SAFE_REF.fullmatch(argv[7].removesuffix("...HEAD")))
                and argv[7].endswith("...HEAD")
            )
        if len(argv) == 5 and argv[:4] == (
            "gh",
            "api",
            "--paginate",
            "--slurp",
        ):
            endpoint = argv[4]
            return bool(
                re.fullmatch(
                    r"repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pulls"
                    r"(?:\?state=open&per_page=100|/\d+/files\?per_page=100)",
                    endpoint,
                )
            )
        if len(argv) == 3 and argv[:2] == ("gh", "api"):
            return bool(
                re.fullmatch(
                    r"repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pulls/\d+",
                    argv[2],
                )
            )
        return False

    def run(self, argv: Sequence[str], *, cwd: Path) -> bytes:
        command = tuple(str(part) for part in argv)
        if not self._allowed(command):
            raise ValueError("command is not in the read-only allowlist")
        env = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith("GIT_")
        }
        env["GIT_OPTIONAL_LOCKS"] = "0"
        env["GH_PROMPT_DISABLED"] = "1"
        try:
            completed = subprocess.run(
                command,
                cwd=cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.timeout_seconds,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ProbeFailure("read-only probe unavailable") from exc
        if completed.returncode != 0:
            raise ProbeFailure("read-only probe failed")
        return completed.stdout


@dataclass(frozen=True)
class _Worktree:
    root: Path
    worktree_id: str


def normalize_repo_path(raw: str) -> str:
    """Return a canonical repository-relative path or reject unsafe input."""

    if not isinstance(raw, str) or not raw or "\x00" in raw or "\\" in raw:
        raise ValueError("invalid repository-relative path")
    path = PurePosixPath(raw)
    if path.is_absolute():
        raise ValueError("invalid repository-relative path")
    parts = tuple(part for part in raw.split("/") if part not in ("", "."))
    if not parts or any(part == ".." for part in parts):
        raise ValueError("invalid repository-relative path")
    if parts[0].casefold() == ".git":
        raise ValueError("invalid repository-relative path")
    return "/".join(parts)


def paths_overlap(left: str, right: str, *, case_insensitive: bool = False) -> bool:
    """Return whether either normalized path is the other's component prefix."""

    left_parts = normalize_repo_path(left).split("/")
    right_parts = normalize_repo_path(right).split("/")
    if case_insensitive:
        left_parts = [part.casefold() for part in left_parts]
        right_parts = [part.casefold() for part in right_parts]
    shared = min(len(left_parts), len(right_parts))
    return left_parts[:shared] == right_parts[:shared]


def _validated_local(
    items: tuple[LocalEvidence, ...],
    *,
    allow_root: bool = False,
) -> tuple[LocalEvidence, ...]:
    validated = []
    for item in items:
        if allow_root and item.path == ".":
            path = "."
        else:
            try:
                path = normalize_repo_path(item.path)
            except (TypeError, ValueError) as exc:
                raise ValueError("invalid local evidence path") from exc
        worktree_id = str(item.worktree_id)
        if not SAFE_WORKTREE_ID.fullmatch(worktree_id):
            raise ValueError("invalid local evidence identifier")
        validated.append(LocalEvidence(path=path, worktree_id=worktree_id))
    return tuple(validated)


def _validated_prs(
    pull_requests: tuple[PullRequestEvidence, ...],
) -> tuple[PullRequestEvidence, ...]:
    validated = []
    for pull in pull_requests:
        try:
            number = int(pull.number)
            head_oid = str(pull.head_oid)
            base_ref = str(pull.base_ref)
            paths = tuple(normalize_repo_path(path) for path in pull.paths)
        except (TypeError, ValueError) as exc:
            raise ValueError("invalid pull-request evidence path") from exc
        if (
            number < 1
            or not SAFE_HEAD_OID.fullmatch(head_oid)
            or not SAFE_REF.fullmatch(base_ref)
        ):
            raise ValueError("invalid pull-request evidence metadata")
        validated.append(
            PullRequestEvidence(
                number=number,
                head_oid=head_oid,
                base_ref=base_ref,
                paths=paths,
            )
        )
    return tuple(validated)


def _duplicate_heads(
    pull_requests: tuple[PullRequestEvidence, ...],
) -> tuple[dict[str, object], ...]:
    grouped: dict[str, set[int]] = {}
    for pull in pull_requests:
        if pull.head_oid:
            grouped.setdefault(pull.head_oid, set()).add(pull.number)
    duplicates = [
        {"headOid": head_oid[:12], "prNumbers": sorted(numbers)}
        for head_oid, numbers in grouped.items()
        if len(numbers) > 1
    ]
    return tuple(sorted(duplicates, key=lambda item: (item["headOid"], item["prNumbers"])))


def build_report(
    paths: Sequence[str],
    snapshot: EvidenceSnapshot,
    *,
    observed_at: str,
) -> dict[str, object]:
    """Build a deterministic, privacy-bounded collision report."""

    proposed = sorted({normalize_repo_path(path) for path in paths})
    if not proposed:
        raise ValueError("at least one proposed path is required")

    dirty = _validated_local(snapshot.dirty)
    active_branch = _validated_local(snapshot.active_branch)
    inactive_branch = _validated_local(snapshot.inactive_branch)
    active_scopes = _validated_local(snapshot.active_scopes, allow_root=True)
    pull_requests = _validated_prs(snapshot.pull_requests)
    degraded_values = {str(source) for source in snapshot.degraded_sources if source}
    if not degraded_values.issubset(KNOWN_DEGRADED_SOURCES):
        raise ValueError("invalid degraded evidence source")
    degraded = sorted(degraded_values)
    duplicate_full_oids = {
        pull.head_oid
        for pull in pull_requests
        if sum(1 for candidate in pull_requests if candidate.head_oid == pull.head_oid) > 1
    }

    entries = []
    for proposed_path in proposed:
        reasons: set[str] = set()
        matched_paths: set[str] = set()
        pr_numbers: set[int] = set()
        worktree_ids: set[str] = set()

        def absorb_local(
            items: tuple[LocalEvidence, ...],
            reason: str,
        ) -> None:
            for item in items:
                overlaps = item.path == "." or paths_overlap(
                        proposed_path,
                        item.path,
                        case_insensitive=snapshot.case_insensitive,
                    )
                if overlaps:
                    reasons.add(reason)
                    matched_paths.add(item.path)
                    worktree_ids.add(item.worktree_id)

        absorb_local(dirty, "local_dirty_overlap")
        absorb_local(active_branch, "active_branch_overlap")
        absorb_local(inactive_branch, "inactive_branch_overlap")
        absorb_local(active_scopes, "active_agent_scope")

        for pull in pull_requests:
            matching = [
                path
                for path in pull.paths
                if paths_overlap(
                    proposed_path,
                    path,
                    case_insensitive=snapshot.case_insensitive,
                )
            ]
            if not matching:
                continue
            reasons.add("open_pr_overlap")
            matched_paths.update(matching)
            pr_numbers.add(pull.number)
            if pull.head_oid in duplicate_full_oids:
                reasons.add("duplicate_open_pr_head")

        if degraded:
            reasons.add("incomplete_evidence")

        if "local_dirty_overlap" in reasons or "active_branch_overlap" in reasons:
            status = "OCCUPIED"
        elif reasons:
            status = "COORDINATE"
        else:
            status = "SAFE"
            reasons.add("no_collision")

        ordered_reasons = [reason for reason in REASON_ORDER if reason in reasons]
        if "no_collision" in reasons:
            ordered_reasons.append("no_collision")
        entries.append(
            {
                "path": proposed_path,
                "status": status,
                "reasonCodes": ordered_reasons,
                "matchedPaths": sorted(matched_paths),
                "prNumbers": sorted(pr_numbers),
                "worktreeIds": sorted(worktree_ids),
            }
        )

    overall = max(
        (entry["status"] for entry in entries),
        key=lambda status: STATUS_RANK[status],
    )
    return {
        "schemaVersion": 1,
        "observedAt": str(observed_at),
        "evidenceComplete": not degraded,
        "overall": overall,
        "degradedSources": degraded,
        "duplicateOpenPrHeads": list(_duplicate_heads(pull_requests)),
        "paths": entries,
    }


def render_text(report: dict[str, object]) -> str:
    """Render a compact deterministic report without raw collector details."""

    completeness = "complete" if report["evidenceComplete"] else "incomplete"
    lines = [
        f"collision sentinel: {report['overall']} (evidence {completeness})",
    ]
    for entry in report["paths"]:
        reasons = ", ".join(entry["reasonCodes"])
        path = json.dumps(entry["path"], ensure_ascii=True)
        lines.append(f"  {entry['status']:<10} {path} [{reasons}]")
        if entry["prNumbers"]:
            numbers = ", ".join(f"#{number}" for number in entry["prNumbers"])
            lines.append(f"             open PRs: {numbers}")
        if entry["matchedPaths"]:
            lines.append(
                "             matched: "
                + ", ".join(
                    json.dumps(match, ensure_ascii=True)
                    for match in entry["matchedPaths"]
                )
            )
    for duplicate in report["duplicateOpenPrHeads"]:
        numbers = ", ".join(f"#{number}" for number in duplicate["prNumbers"])
        lines.append(f"  duplicate head {duplicate['headOid']}: {numbers}")
    if report["degradedSources"]:
        lines.append("  degraded: " + ", ".join(report["degradedSources"]))
    return "\n".join(lines) + "\n"


def exit_code(report: dict[str, object], *, check: bool) -> int:
    """Keep report-only invocation separate from opt-in gate semantics."""

    if not check:
        return 0
    return 0 if report["overall"] == "SAFE" and report["evidenceComplete"] else 3


def _parse_worktrees(raw: bytes) -> tuple[_Worktree, ...]:
    roots = []
    decoded = raw.decode("utf-8", errors="surrogateescape").strip()
    if not decoded:
        raise ProbeFailure("no worktrees found")
    for block in decoded.split("\n\n"):
        candidates = [
            line.removeprefix("worktree ")
            for line in block.splitlines()
            if line.startswith("worktree ")
        ]
        if len(candidates) != 1:
            raise ProbeFailure("invalid worktree evidence")
        root = Path(candidates[0])
        if not root.is_absolute():
            raise ProbeFailure("invalid worktree evidence")
        try:
            roots.append(root.resolve(strict=False))
        except (OSError, RuntimeError) as exc:
            raise ProbeFailure("invalid worktree evidence") from exc
    if not roots:
        raise ProbeFailure("no worktrees found")
    if len(set(roots)) != len(roots):
        raise ProbeFailure("duplicate worktree evidence")
    ordered = sorted(set(roots), key=lambda path: str(path).casefold())
    return tuple(
        _Worktree(root=root, worktree_id=f"wt{index}")
        for index, root in enumerate(ordered, start=1)
    )


def _decode_repo_path(raw: bytes) -> str:
    try:
        return normalize_repo_path(os.fsdecode(raw))
    except (TypeError, ValueError) as exc:
        raise ProbeFailure("unsafe repository path from probe") from exc


def _parse_status_paths(raw: bytes) -> tuple[str, ...]:
    tokens = raw.split(b"\0")
    if tokens and tokens[-1] == b"":
        tokens.pop()
    paths = []
    index = 0
    while index < len(tokens):
        record = tokens[index]
        index += 1
        if len(record) < 4 or record[2:3] != b" ":
            raise ProbeFailure("malformed git status evidence")
        status = record[:2].decode("ascii", errors="strict")
        paths.append(_decode_repo_path(record[3:]))
        if "R" in status or "C" in status:
            if index >= len(tokens):
                raise ProbeFailure("incomplete git rename evidence")
            paths.append(_decode_repo_path(tokens[index]))
            index += 1
    return tuple(sorted(set(paths)))


def _parse_name_status_paths(raw: bytes) -> tuple[str, ...]:
    tokens = raw.split(b"\0")
    if tokens and tokens[-1] == b"":
        tokens.pop()
    paths = []
    index = 0
    while index < len(tokens):
        status = tokens[index].decode("ascii", errors="strict")
        index += 1
        path_count = 2 if status.startswith(("R", "C")) else 1
        if index + path_count > len(tokens):
            raise ProbeFailure("incomplete git diff evidence")
        for _ in range(path_count):
            paths.append(_decode_repo_path(tokens[index]))
            index += 1
    return tuple(sorted(set(paths)))


def _flatten_pages(raw: bytes) -> list[dict[str, object]]:
    try:
        pages = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ProbeFailure("invalid JSON evidence") from exc
    if not isinstance(pages, list):
        raise ProbeFailure("invalid paginated evidence")
    if pages and all(isinstance(item, dict) for item in pages):
        return list(pages)
    flattened = []
    for page in pages:
        if not isinstance(page, list) or not all(isinstance(item, dict) for item in page):
            raise ProbeFailure("invalid paginated evidence")
        flattened.extend(page)
    return flattened


def _deepest_worktree(cwd: Path, worktrees: tuple[_Worktree, ...]) -> _Worktree | None:
    matches = []
    for worktree in worktrees:
        try:
            cwd.relative_to(worktree.root)
        except ValueError:
            continue
        matches.append(worktree)
    if not matches:
        return None
    return max(matches, key=lambda item: len(item.root.parts))


def _collect_active_scopes(
    worktrees: tuple[_Worktree, ...],
    runner: ReadOnlyRunner,
    repo_root: Path,
) -> tuple[tuple[LocalEvidence, ...], set[str]]:
    raw = runner.run(("claude", "agents", "--json"), cwd=repo_root)
    try:
        agents = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ProbeFailure("invalid Claude agent evidence") from exc
    if not isinstance(agents, list):
        raise ProbeFailure("invalid Claude agent evidence")
    scopes = set()
    active_ids = set()
    for agent in agents:
        if not isinstance(agent, dict) or not isinstance(agent.get("cwd"), str):
            raise ProbeFailure("invalid Claude agent evidence")
        cwd = Path(agent["cwd"])
        if not cwd.is_absolute():
            raise ProbeFailure("invalid Claude agent evidence")
        try:
            cwd = cwd.resolve(strict=False)
        except (OSError, RuntimeError) as exc:
            raise ProbeFailure("invalid Claude agent evidence") from exc
        worktree = _deepest_worktree(cwd, worktrees)
        if worktree is None:
            continue
        try:
            relative = cwd.relative_to(worktree.root)
        except ValueError:
            continue
        scope = "." if relative == Path(".") else normalize_repo_path(relative.as_posix())
        scopes.add((scope, worktree.worktree_id))
        active_ids.add(worktree.worktree_id)
    return (
        tuple(LocalEvidence(path, worktree_id) for path, worktree_id in sorted(scopes)),
        active_ids,
    )


def _collect_pull_requests(
    runner: ReadOnlyRunner,
    repo_root: Path,
) -> tuple[tuple[PullRequestEvidence, ...], bool]:
    repo_payload = json.loads(
        runner.run(("gh", "repo", "view", "--json", "nameWithOwner"), cwd=repo_root)
    )
    repository = repo_payload.get("nameWithOwner") if isinstance(repo_payload, dict) else None
    if not isinstance(repository, str) or not SAFE_REPOSITORY.fullmatch(repository):
        raise ProbeFailure("invalid GitHub repository identity")

    pulls = _flatten_pages(
        runner.run(
            (
                "gh",
                "api",
                "--paginate",
                "--slurp",
                f"repos/{repository}/pulls?state=open&per_page=100",
            ),
            cwd=repo_root,
        )
    )
    evidence = []
    complete = True
    for pull in pulls:
        try:
            number = int(pull["number"])
            if number < 1:
                raise ValueError("invalid pull request number")
            detail = json.loads(
                runner.run(
                    ("gh", "api", f"repos/{repository}/pulls/{number}"),
                    cwd=repo_root,
                )
            )
            if not isinstance(detail, dict) or int(detail["number"]) != number:
                raise ValueError("pull request detail mismatch")
            changed_files = int(detail["changed_files"])
            head_oid = str(detail["head"]["sha"])
            base_ref = str(detail["base"]["ref"])
            if (
                changed_files < 0
                or not SAFE_HEAD_OID.fullmatch(head_oid)
                or not SAFE_REF.fullmatch(base_ref)
            ):
                raise ValueError("invalid pull request detail")
            file_records = _flatten_pages(
                runner.run(
                    (
                        "gh",
                        "api",
                        "--paginate",
                        "--slurp",
                        f"repos/{repository}/pulls/{number}/files?per_page=100",
                    ),
                    cwd=repo_root,
                )
            )
        except (
            KeyError,
            TypeError,
            ValueError,
            ProbeFailure,
            json.JSONDecodeError,
        ) as exc:
            complete = False
            continue
        if len(file_records) != changed_files:
            complete = False
        paths = set()
        try:
            for record in file_records:
                paths.add(normalize_repo_path(str(record["filename"])))
                previous = record.get("previous_filename")
                if previous:
                    paths.add(normalize_repo_path(str(previous)))
        except (KeyError, TypeError, ValueError):
            complete = False
            continue
        evidence.append(
            PullRequestEvidence(
                number=number,
                head_oid=head_oid,
                base_ref=base_ref,
                paths=tuple(sorted(paths)),
            )
        )
    return tuple(sorted(evidence, key=lambda item: item.number)), complete


def collect_evidence(
    repo_root: Path,
    *,
    runner: ReadOnlyRunner | None = None,
) -> EvidenceSnapshot:
    """Collect point-in-time local, process, and GitHub evidence without mutation."""

    root = Path(repo_root)
    command_runner = runner or ReadOnlyRunner()
    worktrees = _parse_worktrees(
        command_runner.run(("git", "worktree", "list", "--porcelain"), cwd=root)
    )
    degraded = set()

    try:
        default_ref = command_runner.run(
            (
                "git",
                "symbolic-ref",
                "--quiet",
                "--short",
                "refs/remotes/origin/HEAD",
            ),
            cwd=root,
        ).decode("ascii").strip()
        if not SAFE_REF.fullmatch(default_ref):
            raise ProbeFailure("invalid default branch reference")
    except (UnicodeDecodeError, ProbeFailure):
        default_ref = ""
        degraded.add("local_git")

    try:
        ignorecase = command_runner.run(
            ("git", "config", "--bool", "core.ignorecase"), cwd=root
        ).decode("ascii").strip().lower() == "true"
    except (UnicodeDecodeError, ProbeFailure):
        ignorecase = False
        degraded.add("local_git")

    try:
        active_scopes, active_ids = _collect_active_scopes(
            worktrees, command_runner, root
        )
    except (ProbeFailure, ValueError):
        active_scopes, active_ids = (), set()
        degraded.add("claude_agents")

    dirty = []
    active_branch = []
    inactive_branch = []
    for worktree in worktrees:
        try:
            status_paths = _parse_status_paths(
                command_runner.run(
                    (
                        "git",
                        "-C",
                        str(worktree.root),
                        "status",
                        "--porcelain=v1",
                        "-z",
                        "--untracked-files=all",
                    ),
                    cwd=root,
                )
            )
            dirty.extend(
                LocalEvidence(path, worktree.worktree_id) for path in status_paths
            )
        except (ProbeFailure, UnicodeDecodeError):
            degraded.add("local_git")

        if not default_ref:
            continue
        try:
            branch_paths = _parse_name_status_paths(
                command_runner.run(
                    (
                        "git",
                        "-C",
                        str(worktree.root),
                        "diff",
                        "--name-status",
                        "-z",
                        "--find-renames",
                        f"{default_ref}...HEAD",
                    ),
                    cwd=root,
                )
            )
        except (ProbeFailure, UnicodeDecodeError):
            degraded.add("local_git")
            continue
        destination = active_branch if worktree.worktree_id in active_ids else inactive_branch
        destination.extend(
            LocalEvidence(path, worktree.worktree_id) for path in branch_paths
        )

    try:
        pull_requests, github_complete = _collect_pull_requests(command_runner, root)
        if not github_complete:
            degraded.add("github")
    except (ProbeFailure, json.JSONDecodeError, OSError, TypeError, ValueError):
        pull_requests = ()
        degraded.add("github")

    local_sort = lambda item: (item.path.casefold(), item.worktree_id)
    return EvidenceSnapshot(
        dirty=tuple(sorted(set(dirty), key=local_sort)),
        active_branch=tuple(sorted(set(active_branch), key=local_sort)),
        inactive_branch=tuple(sorted(set(inactive_branch), key=local_sort)),
        active_scopes=tuple(sorted(set(active_scopes), key=local_sort)),
        pull_requests=pull_requests,
        degraded_sources=tuple(sorted(degraded)),
        case_insensitive=ignorecase,
    )


def _utc_observed_at() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _write_error(stream: TextIOBase, message: str) -> None:
    stream.write(f"collision sentinel: {message}\n")


def main(
    argv: Sequence[str] | None = None,
    *,
    runner: ReadOnlyRunner | None = None,
    stdout: TextIOBase | None = None,
    stderr: TextIOBase | None = None,
    observed_at: str | None = None,
) -> int:
    """Run the report-only CLI; ``--check`` opts into gate semantics."""

    output = stdout or sys.stdout
    errors = stderr or sys.stderr
    parser = argparse.ArgumentParser(
        description=(
            "Classify proposed repository paths against read-only local, "
            "Claude-session, and GitHub evidence."
        )
    )
    parser.add_argument("--path", action="append", default=[])
    parser.add_argument("--paths-file")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
    )
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)

    proposed = list(args.path)
    if args.paths_file:
        try:
            proposed.extend(
                line
                for line in Path(args.paths_file).read_text(encoding="utf-8").splitlines()
                if line.strip()
            )
        except (OSError, UnicodeError):
            _write_error(errors, "unable to read proposed paths")
            return 2
    try:
        normalized = [normalize_repo_path(path) for path in proposed]
    except (TypeError, ValueError):
        _write_error(errors, "invalid repository-relative path")
        return 2
    if not normalized:
        _write_error(errors, "at least one --path or --paths-file entry is required")
        return 2

    try:
        snapshot = collect_evidence(args.repo_root, runner=runner)
        report = build_report(
            normalized,
            snapshot,
            observed_at=observed_at or _utc_observed_at(),
        )
    except (OSError, ProbeFailure, TypeError, ValueError, json.JSONDecodeError):
        _write_error(errors, "unable to produce a valid report")
        return 1

    if args.format == "json":
        output.write(json.dumps(report, indent=2, sort_keys=True) + "\n")
    else:
        output.write(render_text(report))
    return exit_code(report, check=args.check)


if __name__ == "__main__":
    raise SystemExit(main())
