"""Self-contained faculty review clinic and closed patch validation."""

from __future__ import annotations

from datetime import date
import html
import json
import os
from pathlib import Path
import tempfile
from typing import Mapping

from jsonschema import Draft7Validator, FormatChecker
from referencing import Registry, Resource

from pcl_anki.contract import canonical_json_bytes, canonical_json_sha256


class ReviewPatchError(ValueError):
    """Raised when a browser export is incomplete, stale, or out of scope."""


def _schema(name: str) -> tuple[Path, dict]:
    path = Path(__file__).resolve().parents[1] / name
    value = json.loads(path.read_text(encoding="utf-8"))
    value["$id"] = path.as_uri()
    return path, value


def _errors(value: object, schema_name: str) -> list[str]:
    path, schema = _schema(schema_name)
    registry = Registry().with_resource(path.as_uri(), Resource.from_contents(schema))
    canonical_dir = path.parents[2] / "anki"
    for name in (
        "release_history.schema.json",
        "cards.schema.json",
        "qbank_render_reviews.schema.json",
        "quarantine.schema.json",
    ):
        target = canonical_dir / name
        referenced = json.loads(target.read_text(encoding="utf-8"))
        registry = registry.with_resource(
            target.as_uri(), Resource.from_contents(referenced)
        )
    validator = Draft7Validator(
        schema, format_checker=FormatChecker(), registry=registry
    )
    return [
        f"${''.join(f'[{p}]' if isinstance(p, int) else f'.{p}' for p in error.path)}: {error.message}"
        for error in sorted(validator.iter_errors(value), key=lambda item: list(item.path))
    ]


def validate_history_proposal(value: object) -> Mapping:
    errors = _errors(value, "history_proposal.schema.json")
    if errors:
        raise ReviewPatchError("invalid history proposal: " + "; ".join(errors))
    assert isinstance(value, Mapping)
    return value


def validate_review_patch(value: object) -> Mapping:
    errors = _errors(value, "review_patch.schema.json")
    if errors:
        message = "; ".join(errors)
        if "reviewer" in message:
            raise ReviewPatchError("reviewer name is required")
        if "reviewedAt" in message or "date" in message:
            raise ReviewPatchError("valid ISO review date is required")
        raise ReviewPatchError("invalid review patch: " + message)
    assert isinstance(value, Mapping)
    for decision in value["decisions"]:
        reviewer = decision["reviewer"]
        if not isinstance(reviewer, str) or not reviewer.strip():
            raise ReviewPatchError("reviewer name is required")
        try:
            date.fromisoformat(decision["reviewedAt"])
        except (TypeError, ValueError) as error:
            raise ReviewPatchError("valid ISO review date is required") from error
    keys = [decision["recordKey"] for decision in value["decisions"]]
    if len(keys) != len(set(keys)):
        raise ReviewPatchError("duplicate review decision record key")
    if value.get("targetRegistry") == "release_history":
        if len(value["decisions"]) != 1:
            raise ReviewPatchError("release history patch requires one exact decision")
        if canonical_json_bytes(value["decisions"][0]["proposedRecord"]) != canonical_json_bytes(
            value["historyAppend"]
        ):
            raise ReviewPatchError("release history patch changed the mechanical append")
    return value


_REGISTRY_COLLECTION = {
    "cards": "cards",
    "qbank_render_reviews": "reviews",
    "quarantine": "accepted",
}


def _record_key(target: str, record: Mapping) -> str:
    if target == "cards":
        return str(record.get("id", ""))
    if target == "qbank_render_reviews":
        return f"{record.get('qbankId', '')}:{record.get('identity', '')}"
    if target == "quarantine":
        return ":".join(
            str(record.get(name, ""))
            for name in (
                "namespace",
                "uid",
                "identity",
                "reasonCode",
                "subjectSha256",
            )
        )
    raise ReviewPatchError(f"invalid target registry: {target}")


def _immutable_projection(target: str, record: Mapping) -> dict:
    names = {
        "cards": ("id", "kind"),
        "qbank_render_reviews": ("qbankId", "identity"),
        "quarantine": (
            "namespace",
            "uid",
            "identity",
            "reasonCode",
            "subjectSha256",
            "sourcePath",
            "firstSeenCommit",
        ),
    }[target]
    return {name: record.get(name) for name in names}


def _atomic_json_write(path: Path, value: object) -> None:
    data = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    temporary_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=f".{path.name}.", dir=path.parent, delete=False
        ) as stream:
            temporary_name = stream.name
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, path)
        temporary_name = None
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)


def apply_optimistic_registry_patch(
    registry_path: Path,
    patch: Mapping,
    *,
    current_head: str,
    current_input_sha256: str,
) -> tuple[str, ...]:
    """Validate every decision in memory, then atomically replace one registry."""

    patch = validate_review_patch(patch)
    target = patch["targetRegistry"]
    if target not in _REGISTRY_COLLECTION:
        raise ReviewPatchError(f"invalid non-history target registry: {target}")
    if patch["generatedFromCommit"] != current_head:
        raise ReviewPatchError("stale patch generatedFromCommit")
    if patch["inputSha256"] != current_input_sha256:
        raise ReviewPatchError("stale input SHA-256")
    try:
        root = json.loads(Path(registry_path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReviewPatchError(f"cannot read canonical registry: {error}") from error
    collection_name = _REGISTRY_COLLECTION[target]
    records = root.get(collection_name) if isinstance(root, dict) else None
    if not isinstance(records, list):
        raise ReviewPatchError("canonical registry has an invalid collection")
    working = [dict(record) for record in records]
    changed = []
    for decision in patch["decisions"]:
        key = decision["recordKey"]
        matches = [
            index
            for index, record in enumerate(working)
            if _record_key(target, record) == key
        ]
        if len(matches) > 1:
            raise ReviewPatchError(f"duplicate canonical record: {key}")
        proposed = decision["proposedRecord"]
        if _record_key(target, proposed) != key:
            raise ReviewPatchError(f"immutable identity changed for {key}")
        if matches:
            index = matches[0]
            current = working[index]
            if decision["baseRecordSha256"] != canonical_json_sha256(current):
                raise ReviewPatchError(f"stale base record for {key}")
            if canonical_json_bytes(
                _immutable_projection(target, current)
            ) != canonical_json_bytes(_immutable_projection(target, proposed)):
                raise ReviewPatchError(f"immutable identity changed for {key}")
            working[index] = dict(proposed)
        else:
            if decision["baseRecordSha256"] is not None:
                raise ReviewPatchError(f"missing base record for {key}")
            working.append(dict(proposed))
        changed.append(key)
    updated = dict(root)
    updated[collection_name] = working
    _atomic_json_write(Path(registry_path), updated)
    return tuple(changed)


def validate_nonhistory_patch(
    inputs: object, current_history, patch: Mapping
) -> None:
    """Recompute target-specific governed hashes before any canonical write."""

    from types import SimpleNamespace

    from pcl_anki.governance import evaluate_card, evaluate_qbank_note
    from pcl_anki.history import preview_withdrawals
    from pcl_anki.release import INTERNAL_REVIEW_EPOCH, evaluate_release, utc_today
    from pcl_anki.render import build_withdrawal_note

    def values(obj):
        return dict(obj) if isinstance(obj, Mapping) else vars(obj)

    target = patch["targetRegistry"]
    if any(decision["decision"] not in {"accept", "edit"} for decision in patch["decisions"]):
        raise ReviewPatchError("only accept/edit decisions may change a canonical registry")
    if target == "cards":
        cards = list(getattr(inputs, "cards", ()))
        by_id = {card.get("id"): index for index, card in enumerate(cards)}
        for decision in patch["decisions"]:
            proposed = decision["proposedRecord"]
            if proposed.get("id") in by_id:
                cards[by_id[proposed["id"]]] = proposed
            else:
                cards.append(proposed)
        fresh_inputs = SimpleNamespace(**{**values(inputs), "cards": tuple(cards), "mode": "authoring"})
        for decision in patch["decisions"]:
            proposed = decision["proposedRecord"]
            review = proposed.get("review") if isinstance(proposed.get("review"), Mapping) else {}
            if (
                review.get("cardApprovedBy") != decision["reviewer"]
                or review.get("cardApprovedAt") != decision["reviewedAt"]
            ):
                raise ReviewPatchError("card reviewer/date does not match exported decision")
            result = evaluate_card(proposed, fresh_inputs, utc_today())
            hard = [issue for issue in result.issues if issue.severity == "hard"]
            if hard:
                raise ReviewPatchError(
                    "card source/qbank/template/render/evidence/policy recomputation failed"
                )
        return
    if target == "qbank_render_reviews":
        reviews = list(getattr(inputs, "qbank_reviews", ()))
        keys = {
            (record.get("qbankId"), record.get("identity")): index
            for index, record in enumerate(reviews)
        }
        for decision in patch["decisions"]:
            proposed = decision["proposedRecord"]
            key = proposed.get("qbankId"), proposed.get("identity")
            if key in keys:
                reviews[keys[key]] = proposed
            else:
                reviews.append(proposed)
        fresh_inputs = SimpleNamespace(
            **{**values(inputs), "qbank_reviews": tuple(reviews), "mode": "authoring"}
        )
        items = {
            item.get("id"): item
            for item in getattr(inputs, "question_bank", {}).get("items", ())
            if isinstance(item, Mapping)
        }
        for decision in patch["decisions"]:
            proposed = decision["proposedRecord"]
            if (
                proposed.get("facultyApprovedBy") != decision["reviewer"]
                or proposed.get("facultyApprovedAt") != decision["reviewedAt"]
            ):
                raise ReviewPatchError("qbank reviewer/date does not match exported decision")
            item = items.get(proposed.get("qbankId"))
            if item is None:
                raise ReviewPatchError("qbank patch targets a missing canonical item")
            result = evaluate_qbank_note(
                item, proposed["identity"], fresh_inputs, utc_today()
            )
            if any(issue.severity == "hard" for issue in result.issues):
                raise ReviewPatchError(
                    "qbank source/template/render/evidence/policy recomputation failed"
                )
        return
    if target != "quarantine":
        raise ReviewPatchError(f"invalid non-history target registry: {target}")

    # Reconcile against the actual canonical ledger, without adding the proposed
    # decision.  An already accepted unchanged finding must not be re-approved.
    unreviewed_inputs = SimpleNamespace(**{**values(inputs), "mode": "authoring"})
    candidate = evaluate_release(
        unreviewed_inputs,
        build_epoch=INTERNAL_REVIEW_EPOCH,
        evaluation_date=utc_today(),
        profile="authoring",
        baseline_history=current_history,
    )
    live = {
        (
            finding.namespace,
            finding.uid,
            finding.identity,
            finding.reason_code,
            finding.subject_sha256,
        ): finding
        for finding in (*candidate.quarantine.new, *candidate.quarantine.changed)
    }
    for decision in patch["decisions"]:
        proposed = decision["proposedRecord"]
        key = (
            proposed.get("namespace"),
            proposed.get("uid"),
            proposed.get("identity"),
            proposed.get("reasonCode"),
            proposed.get("subjectSha256"),
        )
        finding = live.get(key)
        if finding is None:
            raise ReviewPatchError("quarantine patch does not match a live exact finding")
        if (
            proposed.get("sourcePath") != finding.source_path
            or proposed.get("firstSeenCommit") != finding.first_seen_commit
            or proposed.get("reviewedBy") != decision["reviewer"]
            or proposed.get("reviewedAt") != decision["reviewedAt"]
        ):
            raise ReviewPatchError("quarantine finding/reviewer/date is stale or forged")
        if proposed.get("disposition") == "withdraw":
            affected = None
            for release in current_history.releases:
                if any(
                    member.get("namespace") == finding.namespace
                    and member.get("uid") == finding.uid
                    and member.get("identity") == finding.identity
                    and member.get("status") == "active"
                    for member in release.get("memberships", ())
                ):
                    affected = release.get("releaseId")
            previews = preview_withdrawals(
                current_history,
                (
                    {
                        "namespace": finding.namespace,
                        "uid": finding.uid,
                        "identity": finding.identity,
                        "reasonCode": finding.reason_code,
                        "affectedReleaseId": affected,
                    },
                ),
            ) if isinstance(affected, str) else ()
            if len(previews) != 1:
                raise ReviewPatchError("withdrawal lacks one exact shipped neutral preview")
            preview = previews[0]
            build_withdrawal_note(preview)
            if (
                proposed.get("affectedReleaseId") != affected
                or proposed.get("withdrawalTemplateVersion")
                != "pcl-neutral-withdrawal-v1"
                or proposed.get("approvedWithdrawalSha256") != preview.render_sha256
            ):
                raise ReviewPatchError("withdrawal neutral render/template/release was edited")


def apply_review_patch(
    repo: Path,
    patch_path: Path,
    *,
    candidate_dir: Path | None = None,
    history_baseline: Path | None = None,
    prior_release_dir: Path | None = None,
) -> tuple[str, ...]:
    """Recompute optimistic context and atomically apply one canonical patch."""

    from pcl_anki.contract import HistoryRegistry
    from pcl_anki.history import (
        history_from_dict,
        history_to_dict,
        load_history,
        propose_history_append,
        validate_history,
    )
    from pcl_anki.inspect import inspect_release
    from pcl_anki.migration import preflight_release_identity
    from pcl_anki.release import (
        _file_sha256,
        _history_append_dict,
        _load_receipt,
        _run_git,
        _stable_directory_sha256,
        evaluate_release,
        load_release_inputs,
        run_candidate_migration,
        utc_today,
        validate_history_baseline,
    )

    repo = Path(repo).resolve(strict=True)
    patch_path = Path(patch_path)
    try:
        raw_patch = json.loads(patch_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReviewPatchError(f"cannot read review patch: {error}") from error
    if isinstance(raw_patch, Mapping) and raw_patch.get("proposalType") == "release_history":
        raise ReviewPatchError("raw history proposal cannot be applied as a review patch")
    patch = validate_review_patch(raw_patch)
    head = _run_git(repo, "rev-parse", "HEAD")
    if head.returncode != 0:
        raise ReviewPatchError("cannot resolve current Git HEAD")
    current_head = head.stdout.strip()
    inputs = load_release_inputs(repo)
    if patch["generatedFromCommit"] != current_head:
        raise ReviewPatchError("stale patch generatedFromCommit")
    if patch["inputSha256"] != inputs.governed_input_sha256:
        raise ReviewPatchError("stale input SHA-256")

    target = patch["targetRegistry"]
    registry_dir = repo / "13_Faculty_Resources" / "anki"
    if target != "release_history":
        paths = {
            "cards": registry_dir / "cards.json",
            "qbank_render_reviews": registry_dir / "qbank_render_reviews.json",
            "quarantine": registry_dir / "quarantine.json",
        }
        try:
            registry_path = paths[target]
        except KeyError as error:
            raise ReviewPatchError(f"invalid target registry: {target}") from error
        current_history = history_from_dict(inputs.release_history)
        validate_nonhistory_patch(inputs, current_history, patch)
        return apply_optimistic_registry_patch(
            registry_path,
            patch,
            current_head=current_head,
            current_input_sha256=inputs.governed_input_sha256,
        )

    if candidate_dir is None or history_baseline is None or prior_release_dir is None:
        raise ReviewPatchError(
            "release_history requires candidate, history baseline, and prior-release paths"
        )
    proposal_path = patch_path.with_name("release_history.proposal.json")
    try:
        proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReviewPatchError(f"source history proposal is missing: {error}") from error
    validate_history_proposal(proposal)
    if (
        proposal["generatedFromCommit"] != patch["generatedFromCommit"]
        or proposal["generatedFromCommit"] != current_head
        or proposal["inputSha256"] != patch["inputSha256"]
        or proposal["inputSha256"] != inputs.governed_input_sha256
    ):
        raise ReviewPatchError("source proposal commit/input binding is stale")
    if canonical_json_sha256(proposal) != patch["sourceProposalSha256"]:
        raise ReviewPatchError("source proposal hash is stale or forged")
    if canonical_json_bytes(proposal["historyAppend"]) != canonical_json_bytes(
        patch["historyAppend"]
    ):
        raise ReviewPatchError("review patch changed the source HistoryAppend")

    baseline = load_history(Path(history_baseline))
    current_path = registry_dir / "release_history.json"
    current = load_history(current_path)
    validate_history_baseline(baseline, current)
    if canonical_json_bytes(history_to_dict(current)) != canonical_json_bytes(
        history_to_dict(baseline)
    ):
        raise ReviewPatchError("history changed after proposal generation")
    config = inputs.release_config
    epoch = config.get("releaseEpoch") if isinstance(config, Mapping) else None
    if not isinstance(epoch, int) or isinstance(epoch, bool):
        raise ReviewPatchError("reviewed release config lacks an epoch")
    candidate = evaluate_release(
        inputs,
        build_epoch=epoch,
        evaluation_date=utc_today(),
        profile="prepare",
        baseline_history=baseline,
    )
    if any(issue.severity == "hard" for issue in candidate.issues):
        raise ReviewPatchError("candidate governance no longer passes")
    try:
        if preflight_release_identity(candidate, baseline) != "new":
            raise ReviewPatchError("history review patches may append only a new release")
    except ValueError as error:
        raise ReviewPatchError(str(error)) from error
    receipt = _load_receipt(Path(candidate_dir) / "anki_release_receipt.json")
    if receipt.get("governedInputSha256") != inputs.governed_input_sha256:
        raise ReviewPatchError("candidate was generated from different governed inputs")
    inspection = inspect_release(Path(candidate_dir), receipt)
    if any(issue.severity == "hard" for issue in inspection.issues):
        raise ReviewPatchError("candidate artifact inspection failed")
    migration = run_candidate_migration(
        Path(prior_release_dir), Path(candidate_dir), baseline, current, candidate
    )
    if any(issue.severity == "hard" for issue in migration.issues):
        raise ReviewPatchError("candidate migration proof failed")
    expected_append = propose_history_append(inspection, migration, candidate, baseline)
    if canonical_json_bytes(_history_append_dict(expected_append)) != canonical_json_bytes(
        patch["historyAppend"]
    ):
        raise ReviewPatchError("review patch HistoryAppend does not recompute exactly")
    context = proposal["context"]
    manifest_path = proposal_path.with_name("candidate_manifest.json")
    if (
        not manifest_path.is_file()
        or _file_sha256(manifest_path) != context["candidateManifestSha256"]
        or dict(sorted(inspection.artifact_sha256.items()))
        != context["inspectedFilesSha256"]
        or _file_sha256(Path(history_baseline))
        != context["historyBaselineSha256"]
        or _stable_directory_sha256(Path(prior_release_dir))
        != context["priorReleaseSeedSha256"]
        or migration.contract_sha256 != context["migrationProofSha256"]
        or inspection.receipt["csv"]["sha256"]
        != context["deterministicCsvSha256"]
        or inspection.receipt["receiptContractSha256"]
        != context["receiptContractSha256"]
    ):
        raise ReviewPatchError("history proposal inspected context is stale or tampered")
    decision = patch["decisions"][0]
    expected_key = f"release:{candidate.release_id}"
    if (
        decision["decision"] != "accept"
        or decision["recordKey"] != expected_key
        or decision["baseRecordSha256"] is not None
    ):
        raise ReviewPatchError("history patch target/base record is invalid")
    updated = HistoryRegistry(
        (*current.identity_entries, *expected_append.new_identity_entries),
        (*current.releases, expected_append.release_record),
    )
    issues = validate_history(updated, current)
    if issues:
        raise ReviewPatchError(
            "reviewed history append is invalid: "
            + "; ".join(issue.code for issue in issues)
        )
    _atomic_json_write(current_path, history_to_dict(updated))
    return (expected_key,)


def build_review_html(candidate: Mapping) -> str:
    """Embed the exact proposal bytes and an offline named-review exporter."""

    if candidate.get("proposalType") == "release_history":
        validate_history_proposal(candidate)
    elif candidate.get("reportType") == "anki_review_candidate":
        return _build_candidate_review_html(candidate)
    payload = canonical_json_bytes(candidate).decode("utf-8")
    visible = html.escape(json.dumps(candidate, ensure_ascii=False, indent=2, sort_keys=True))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PCL Anki faculty clinic</title>
<style>body{{font:16px system-ui;margin:2rem;max-width:1100px}}pre{{white-space:pre-wrap;background:#f5f5f5;padding:1rem}}label{{display:block;margin:.8rem 0}}button{{padding:.6rem 1rem}}</style></head>
<body><h1>Governed Anki faculty clinic</h1>
<p>Inspect the complete mechanical proposal before exporting a separate review patch.</p>
<pre id="proposal-visible">{visible}</pre>
<label>Reviewer name <input id="reviewer" required></label>
<label>Review date <input id="reviewedAt" type="date" required></label>
<button id="export">Export release_history.patch.json</button>
<script id="proposal" type="application/json">{payload}</script>
<script>
const proposal=JSON.parse(document.getElementById('proposal').textContent);
document.getElementById('export').addEventListener('click',async()=>{{
 const reviewer=document.getElementById('reviewer').value.trim();
 const reviewedAt=document.getElementById('reviewedAt').value;
 if(!reviewer||!/^\\d{{4}}-\\d{{2}}-\\d{{2}}$/.test(reviewedAt)){{alert('Reviewer name and review date are required.');return;}}
 const bytes=new TextEncoder().encode(document.getElementById('proposal').textContent); const digest=await crypto.subtle.digest('SHA-256',bytes); const sourceProposalSha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const patch={{schemaVersion:1,targetRegistry:'release_history',generatedFromCommit:proposal.generatedFromCommit,inputSha256:proposal.inputSha256,sourceProposalSha256,historyAppend:proposal.historyAppend,decisions:[{{recordKey:'release:'+proposal.historyAppend.releaseRecord.releaseId,baseRecordSha256:null,proposedRecord:proposal.historyAppend,decision:'accept',reviewer,reviewedAt}}]}};
 const blob=new Blob([JSON.stringify(patch,null,2)+'\\n'],{{type:'application/json'}}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='release_history.patch.json'; a.click(); URL.revokeObjectURL(a.href);
}});
</script></body></html>"""


def _build_candidate_review_html(candidate: Mapping) -> str:
    payload = canonical_json_bytes(candidate).decode("utf-8")
    sections = []
    for note in candidate.get("draftAndCurrentPreviews", ()):
        if not isinstance(note, Mapping):
            continue
        sections.append(
            "<section><h2>"
            + html.escape(
                f"{note.get('namespace')}:{note.get('uid')}:{note.get('identity')}"
            )
            + "</h2><h3>Exact Anki front</h3><div class=\"render\">"
            + str(note.get("frontHtml", ""))
            + "</div><h3>Exact Anki back</h3><div class=\"render\">"
            + str(note.get("backHtml", ""))
            + "</div><h3>Governed source, qbank, risk, and prior approval</h3><pre>"
            + html.escape(
                json.dumps(
                    {
                        "renderSha256": note.get("renderSha256"),
                        "templateContractSha256": note.get(
                            "templateContractSha256"
                        ),
                        "source": note.get("source"),
                        "qbank": note.get("qbank"),
                        "risk": note.get("risk"),
                        "review": note.get("review"),
                        "priorApprovedRenderSha256": note.get(
                            "priorApprovedRenderSha256"
                        ),
                    },
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
            )
            + "</pre></section>"
        )
    for preview in candidate.get("withdrawalPreviews", ()):
        if not isinstance(preview, Mapping):
            continue
        sections.append(
            "<section class=\"withdrawal\"><h2>Exact neutral withdrawal preview</h2>"
            "<h3>Front</h3><div class=\"render\">"
            + str(preview.get("frontHtml", ""))
            + "</div><h3>Back</h3><div class=\"render\">"
            + str(preview.get("backHtml", ""))
            + "</div><pre>"
            + html.escape(json.dumps(preview, ensure_ascii=False, indent=2, sort_keys=True))
            + "</pre></section>"
        )
    visible_context = html.escape(
        json.dumps(
            {
                "issues": candidate.get("issues"),
                "quarantine": candidate.get("quarantine"),
                "qbankItems": candidate.get("qbankItems"),
                "evidenceRecords": candidate.get("evidenceRecords"),
                "policyRecords": candidate.get("policyRecords"),
                "governedInputSha256": candidate.get("governedInputSha256"),
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>PCL Anki authoring clinic</title><style>body{{font:16px system-ui;margin:2rem;max-width:1200px}}section{{border:1px solid #bbb;padding:1rem;margin:1rem 0}}.render{{padding:1rem;background:#fff}}pre{{white-space:pre-wrap;background:#f4f4f4;padding:1rem}}label{{display:block;margin:.7rem 0}}</style></head>
<body><h1>Anki faculty card clinic</h1><p>Every exact rendered note in this export is displayed below. Page review never counts as approval.</p>
{''.join(sections)}<h2>Complete governed context</h2><pre>{visible_context}</pre>
<h2>Named quarantine decision export</h2>
<label>Review owner <input id="owner" required></label><label>Reviewer name <input id="reviewer" required></label><label>Review date <input id="reviewedAt" type="date" required></label>
<label>Disposition <select id="disposition"><option value="exclude">Exclude</option><option value="withdraw">Withdraw shipped note</option><option value="retire">Retire</option></select></label>
<p>This Task-9 export is quarantine-decision only. Edit or reject leaves canonical files unchanged and exports no patch.</p>
<button id="accept">Accept exact quarantine decision</button>
<script id="candidate" type="application/json">{payload}</script><script>
const candidate=JSON.parse(document.getElementById('candidate').textContent);
document.getElementById('accept').addEventListener('click',()=>{{
 const reviewOwner=document.getElementById('owner').value.trim(),reviewer=document.getElementById('reviewer').value.trim(),reviewedAt=document.getElementById('reviewedAt').value,disposition=document.getElementById('disposition').value;
 if(!reviewOwner||!reviewer||!/^\\d{{4}}-\\d{{2}}-\\d{{2}}$/.test(reviewedAt)){{alert('Owner, reviewer, and ISO review date are required.');return;}}
 const findings=[...(candidate.quarantine.new||[]),...(candidate.quarantine.changed||[])]; if(!findings.length){{alert('No new or changed quarantine finding to export.');return;}}
 const decisions=findings.map(f=>{{const key=[f.namespace,f.uid,f.identity,f.reasonCode,f.subjectSha256].join(':'); const proposedRecord={{namespace:f.namespace,uid:f.uid,identity:f.identity,reasonCode:f.reasonCode,subjectSha256:f.subjectSha256,sourcePath:f.sourcePath,firstSeenCommit:f.firstSeenCommit,reviewOwner,disposition,reviewedBy:reviewer,reviewedAt}}; if(disposition==='withdraw'){{const p=(candidate.withdrawalPreviews||[]).find(v=>v.namespace===f.namespace&&v.uid===f.uid&&v.identity===f.identity&&v.reasonCode===f.reasonCode); if(!p) throw new Error('Exact neutral withdrawal preview is required'); proposedRecord.affectedReleaseId=p.affectedReleaseId; proposedRecord.withdrawalTemplateVersion=p.withdrawalTemplateVersion; proposedRecord.approvedWithdrawalSha256=p.approvedWithdrawalSha256;}} return {{recordKey:key,baseRecordSha256:(candidate.quarantineBaseRecordSha256||{{}})[key]||null,proposedRecord,decision:'accept',reviewer,reviewedAt}};}});
 const patch={{schemaVersion:1,targetRegistry:'quarantine',generatedFromCommit:candidate.generatedFromCommit,inputSha256:candidate.governedInputSha256,decisions}}; const blob=new Blob([JSON.stringify(patch,null,2)+'\\n'],{{type:'application/json'}}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='quarantine.review.patch.json';a.click();URL.revokeObjectURL(a.href);
}});
</script></body></html>"""
