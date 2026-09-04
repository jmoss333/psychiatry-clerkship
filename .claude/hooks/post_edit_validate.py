#!/usr/bin/env python3
"""PostToolUse hook for Edit | Write | MultiEdit.

The edit has already landed. This hook does the follow-through that CLAUDE.md otherwise
asks the agent to remember:

  * CLAUDE.md edited            -> AGENTS.md is re-copied (Codex parity; CI fails on drift)
  * AGENTS.md edited directly   -> blocked with the reason: CLAUDE.md is canonical
  * a root registry edited      -> its validator runs now; failures come back as a block
  * a "what ships" producer      -> shipped_pages.py --check runs; a stale tracked file
                                   comes back as a block naming the --write command
  * a workflow .yml edited      -> validate_scheduled_workflows.py runs; on a digest mismatch
                                   the NEW digest is printed, computed with the validator's own
                                   _load/_contract_digest, plus the three-contract checklist
  * a new content source file   -> reminder to register it in site_manifest.json + nav
  * an attested page edited     -> reminder that the attestation is now stale
  * a finding-shaped sentence   -> bin/sweep_unlicensed_claims.py --page on that file

"block" here means the tool already ran and the reason is fed back to the agent to act on.
Everything else is additionalContext. Internal errors degrade to silence.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import clerkship_guards as G
except Exception:  # pragma: no cover
    sys.exit(0)

VALIDATOR_TIMEOUT = 150


def run(cmd: list[str], root: Path, timeout: int = VALIDATOR_TIMEOUT) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "timed out after %ss" % timeout
    except OSError as exc:
        return 127, str(exc)
    out = (proc.stdout + proc.stderr).strip()
    return proc.returncode, out


def tail(text: str, n: int = 20) -> str:
    lines = text.splitlines()
    return "\n".join(lines[-n:])


def workflow_digest_hint(rel: str, root: Path) -> str:
    name = rel.rsplit("/", 1)[-1]
    maint = root / G.TOOLING_PREFIX / "maintenance"
    sys.path.insert(0, str(maint))
    try:
        import validate_scheduled_workflows as V  # type: ignore
    except Exception as exc:
        return "could not import validate_scheduled_workflows to recompute the digest (%s)" % exc
    expected = getattr(V, "EXPECTED_WORKFLOW_CONTRACT_DIGESTS", {})
    if name not in expected:
        return ""
    errors: list = []
    workflow, _ = V._load(root, name, errors)
    if workflow is None:
        return "workflow did not parse: %s" % errors
    new = V._contract_digest(workflow)
    if new == expected[name]:
        return ""
    return (
        "Contract digest for %s is now %s (pinned: %s). If the change is intended, update "
        "EXPECTED_WORKFLOW_CONTRACT_DIGESTS in maintenance/validate_scheduled_workflows.py and "
        "its step inventory for this file; if it is ci.yml, also mirror any new step in "
        "bin/verify.sh (or name it in bin/check-verify-coverage.py ALLOWED) and, for a new root "
        "registry, extend PAIRS in _automation/test_validate_registry_schemas.py."
        % (name, new, expected[name])
    )


def is_untracked(rel: str, root: Path) -> bool:
    code, _ = run(["git", "ls-files", "--error-unmatch", rel], root, timeout=10)
    return code != 0


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    tool_input = event.get("tool_input") or {}
    file_path = tool_input.get("file_path")
    if not file_path:
        return 0
    root = G.repo_root(event)
    rel = G.relpath(file_path, root)
    blocks: list[str] = []
    notes: list[str] = []

    # --- agent-guide parity -------------------------------------------------------------
    if rel == "CLAUDE.md":
        try:
            (root / "AGENTS.md").write_bytes((root / "CLAUDE.md").read_bytes())
            notes.append("AGENTS.md re-synced from CLAUDE.md (byte-identical copy; CI enforces parity).")
        except OSError as exc:
            blocks.append("could not sync AGENTS.md from CLAUDE.md: %s" % exc)
    elif rel == "AGENTS.md":
        blocks.append(
            "AGENTS.md is a byte-identical copy of CLAUDE.md, which is canonical. Make the change "
            "in CLAUDE.md instead; this hook re-copies AGENTS.md automatically."
        )

    # --- registries ---------------------------------------------------------------------
    for validator in G.REGISTRY_VALIDATORS.get(rel, []):
        script = root / validator
        if not script.exists():
            continue
        code, out = run([sys.executable, str(script)], root)
        if code != 0:
            blocks.append("%s failed after editing %s (exit %d):\n%s" % (validator, rel, code, tail(out)))
        else:
            notes.append("%s: OK" % validator.rsplit("/", 1)[-1])

    # --- "what ships" producers (ADR-002) -----------------------------------------------
    # site_manifest.json, cotw_registry.json and site_extras.py feed one derived, tracked
    # file. Editing a producer without regenerating it is the single new failure mode that
    # ADR trades for the old silent-invisibility one, so catch it at the edit rather than
    # at the push. The check is a fast pure derivation — no build, no network.
    if rel in G.SHIPPED_PAGES_PRODUCERS:
        script = root / G.TOOLING_PREFIX / "site_build" / "shipped_pages.py"
        if script.exists():
            code, out = run([sys.executable, str(script), "--check"], root, timeout=60)
            if code != 0:
                blocks.append(
                    "shipped_pages.json is stale after editing %s (exit %d):\n%s\n"
                    "Regenerate it:  python3 %ssite_build/shipped_pages.py --write"
                    % (rel, code, tail(out, 20), G.TOOLING_PREFIX)
                )
            else:
                notes.append("shipped_pages.py --check: OK")

    # --- workflows ----------------------------------------------------------------------
    if rel.startswith(".github/workflows/") and rel.endswith((".yml", ".yaml")):
        script = root / G.TOOLING_PREFIX / "maintenance" / "validate_scheduled_workflows.py"
        if script.exists():
            code, out = run([sys.executable, str(script)], root)
            if code != 0:
                hint = workflow_digest_hint(rel, root)
                blocks.append(
                    "validate_scheduled_workflows.py failed (exit %d):\n%s%s"
                    % (code, tail(out, 12), ("\n" + hint) if hint else "")
                )
            else:
                notes.append("validate_scheduled_workflows.py: OK")

    # --- new content source not registered ---------------------------------------------
    if G.is_content_source(rel) and rel.endswith((".md", ".html")) and is_untracked(rel, root):
        if rel not in G.manifest_sources(root):
            notes.append(
                "%s is a new content source and is not registered in "
                "13_Faculty_Resources/_automation/site_build/site_manifest.json. A shipped page must "
                "be registered there AND in nav inside build_deploy.py, or the QA gate's "
                "orphaned-source check hard-fails the build. Add a pending stamp in "
                "13_Faculty_Resources/reviewed.json and consider a topic_meta.json entry "
                "(use the topic-meta-author skill)." % rel
            )

    # --- attested page ------------------------------------------------------------------
    status = G.attestation_status(rel, root)
    if status in ("reviewed", "attested"):
        notes.append(
            "%s is currently '%s' in 13_Faculty_Resources/reviewed.json. This edit makes that "
            "attestation stale: faculty must re-attest via the faculty console, or the ledger row "
            "must move to pending." % (rel, status)
        )

    # --- finding-shaped claims ------------------------------------------------------------
    text = str(tool_input.get("content") or tool_input.get("new_string") or "")
    if not text and tool_input.get("edits"):
        text = "\n".join(str(e.get("new_string") or "") for e in tool_input["edits"])
    if text and G.mentions_finding(text, rel):
        sweep = root / "bin" / "sweep_unlicensed_claims.py"
        detail = ""
        if sweep.exists():
            code, out = run([sys.executable, str(sweep), "--page", rel], root, timeout=60)
            if out:
                detail = "\n" + tail(out, 12)
        notes.append(
            "The new text asserts a finding. Every claim about a paper needs that paper's own words: "
            "add or update its sourceSpan in evidence_annotations.json in the same change (read the "
            "RESULTS, not the title), then run validate_evidence_annotations.py. The evidence-verifier "
            "agent does this end to end.%s" % detail
        )

    if blocks:
        reason = "\n\n".join(blocks)
        if notes:
            reason += "\n\nAlso: " + "\n".join(notes)
        print(json.dumps({"decision": "block", "reason": reason}))
        return 0
    if notes:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": "\n".join(notes),
            }
        }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
