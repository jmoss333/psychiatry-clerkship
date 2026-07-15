from datetime import date
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import shutil
from types import SimpleNamespace

import pytest

from pcl_anki.contract import HistoryRegistry
from pcl_anki.history import history_bytes, history_to_dict
from pcl_anki.package import RELEASE_FILENAMES
from pcl_anki.review import validate_history_proposal
from pcl_anki.release import (
    INTERNAL_REVIEW_EPOCH,
    ReleaseOrchestrationError,
    capture_governed_inputs,
    classify_maintenance_issues,
    evaluate_release,
    require_clean_tracked_worktree,
    run_candidate_migration,
    run_profile,
)


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def test_governed_snapshot_excludes_history_and_git_topology_but_detects_byte_drift(
    tmp_path,
):
    repo = tmp_path / "repo"
    repo.mkdir()
    governed = repo / "governed.json"
    history = repo / "release_history.json"
    governed.write_text('{"value":1}\n', encoding="utf-8")
    history.write_text('{"schemaVersion":1}\n', encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "add", ".")
    _git(
        repo,
        "-c",
        "user.name=Test Fixture",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "fixture",
    )

    first = capture_governed_inputs(repo, (governed, history))
    history.write_text('{"schemaVersion":1,"releases":[]}\n', encoding="utf-8")
    _git(repo, "add", str(history))
    _git(
        repo,
        "-c",
        "user.name=Test Fixture",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "history only",
    )
    second = capture_governed_inputs(repo, (governed, history))

    assert second.sha256 == first.sha256
    assert second.ledger == first.ledger == (("governed.json", first.ledger[0][1]),)

    governed.write_text('{"value":2}\n', encoding="utf-8")
    with pytest.raises(ReleaseOrchestrationError, match="dirty governed input"):
        capture_governed_inputs(repo, (governed, history))
    _git(repo, "add", str(governed))
    _git(
        repo,
        "-c",
        "user.name=Test Fixture",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "governed byte drift",
    )
    third = capture_governed_inputs(repo, (governed, history))
    assert third.sha256 != first.sha256


def test_governed_snapshot_rejects_missing_outside_symlink_and_duplicate_paths(
    tmp_path,
):
    repo = tmp_path / "repo"
    repo.mkdir()
    governed = repo / "governed.json"
    governed.write_text('{"value":1}\n', encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "add", ".")
    _git(
        repo,
        "-c",
        "user.name=Test Fixture",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "fixture",
    )
    outside = tmp_path / "outside.json"
    outside.write_text("{}\n", encoding="utf-8")
    linked = repo / "linked.json"
    linked.symlink_to(governed)

    for paths, message in (
        ((repo / "missing.json",), "missing or outside"),
        ((outside,), "missing or outside"),
        ((linked,), "invalid governed input"),
        ((governed, governed), "duplicate governed input"),
    ):
        with pytest.raises(ReleaseOrchestrationError, match=message):
            capture_governed_inputs(repo, paths)


def test_prepare_release_cleanliness_gate_ignores_untracked_but_blocks_tracked_drift(
    tmp_path,
):
    repo = tmp_path / "repo"
    repo.mkdir()
    tracked = repo / "tracked.txt"
    tracked.write_text("one\n", encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "add", ".")
    _git(
        repo,
        "-c",
        "user.name=Test Fixture",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "fixture",
    )
    (repo / "untracked.txt").write_text("allowed\n", encoding="utf-8")
    require_clean_tracked_worktree(repo)
    tracked.write_text("two\n", encoding="utf-8")
    with pytest.raises(ReleaseOrchestrationError, match="clean tracked"):
        require_clean_tracked_worktree(repo)


def test_maintenance_allowlist_is_explicit_and_unknown_hard_issue_blocks():
    from pcl_anki.contract import Issue

    expected = Issue(
        "CORE_COVERAGE_TOTAL_MISMATCH", "hard", "core", "phase 2 incomplete"
    )
    unknown = Issue("FUTURE_UNKNOWN", "hard", "input", "must fail closed")

    assert classify_maintenance_issues((expected,)) == ()
    assert classify_maintenance_issues((expected, unknown)) == (unknown,)
    assert classify_maintenance_issues(
        (
            Issue("CARD_APPROVAL_REQUIRED", "hard", "card", "phase 2"),
            Issue("QBANK_RENDER_REVIEW_REQUIRED", "hard", "qbank", "phase 2"),
        )
    ) == ()
    assert INTERNAL_REVIEW_EPOCH == 946684800


def test_history_baseline_must_be_an_exact_prefix():
    from pcl_anki.release import validate_history_baseline

    baseline = HistoryRegistry((), ())
    current = HistoryRegistry((), ())
    assert validate_history_baseline(baseline, current) is current

    changed = HistoryRegistry(
        (),
        (
            {
                "releaseId": "synthetic",
                "releaseDate": date(2026, 7, 14).isoformat(),
                "releaseEpoch": 1,
            },
        ),
    )
    with pytest.raises(ReleaseOrchestrationError, match="baseline"):
        validate_history_baseline(baseline, changed)


def test_evaluate_release_builds_one_candidate_from_governance_and_render_layers(
    passing_release_factory,
):
    bundle = passing_release_factory()
    config = deepcopy(bundle.inputs.release_config)
    config.update(
        releaseId="synthetic-task9-release",
        releaseDate="2026-07-14",
        releaseEpoch=1784059200,
    )
    inputs = SimpleNamespace(
        **{
            **vars(bundle.inputs),
            "mode": "authoring",
            "release_config": config,
            "governed_input_sha256": "a" * 64,
            "governed_input_ledger": (("synthetic/input.json", "b" * 64),),
        }
    )

    candidate = evaluate_release(
        inputs,
        build_epoch=1784059200,
        evaluation_date=date(2026, 7, 14),
        profile="prepare",
        baseline_history=HistoryRegistry((), ()),
    )

    assert candidate.release_id == "synthetic-task9-release"
    assert candidate.release_epoch == 1784059200
    assert candidate.governed_input_sha256 == "a" * 64
    assert len(candidate.core_active) == 144
    assert len(candidate.application_active) == 48
    assert len(candidate.qbank_active) == 1
    assert not [issue for issue in candidate.issues if issue.severity == "hard"]


def test_evaluate_release_refuses_config_epoch_mismatch(passing_release_factory):
    bundle = passing_release_factory()
    config = deepcopy(bundle.inputs.release_config)
    config.update(
        releaseId="synthetic-task9-release",
        releaseDate="2026-07-14",
        releaseEpoch=1784059200,
    )
    inputs = SimpleNamespace(
        **{
            **vars(bundle.inputs),
            "release_config": config,
            "governed_input_sha256": "a" * 64,
            "governed_input_ledger": (("synthetic/input.json", "b" * 64),),
        }
    )

    with pytest.raises(ReleaseOrchestrationError, match="epoch"):
        evaluate_release(
            inputs,
            build_epoch=1784059201,
            evaluation_date=date(2026, 7, 14),
            profile="prepare",
            baseline_history=HistoryRegistry((), ()),
        )


def _profile_inputs(bundle, **changes):
    config = deepcopy(bundle.inputs.release_config)
    config.update(
        releaseId="synthetic-task9-release",
        releaseDate="2026-07-14",
        releaseEpoch=1784059200,
    )
    return SimpleNamespace(
        **{
            **vars(bundle.inputs),
            "release_config": config,
            "governed_input_sha256": "a" * 64,
            "governed_input_ledger": (("synthetic/input.json", "b" * 64),),
            **changes,
        }
    )


def test_authoring_writes_closed_review_candidate_and_only_internal_pilot_output(
    passing_release_factory, tmp_path
):
    bundle = passing_release_factory()
    cards = tuple(bundle.inputs.cards[1:])
    inputs = _profile_inputs(bundle, cards=cards)
    out = tmp_path / "authoring"
    review = tmp_path / "review"

    candidate = run_profile(
        inputs,
        profile="authoring",
        out=out,
        review_out=review,
        baseline_history=HistoryRegistry((), ()),
        candidate_date=date(2026, 7, 14),
        build_epoch=1784059200,
    )

    assert [issue for issue in candidate.issues if issue.severity == "hard"]
    assert {path.name for path in out.iterdir()} == {"internal-pilot-preview.json"}
    report = json.loads((review / "review_candidate.json").read_text())
    assert report["releaseReady"] is False
    assert report["issues"]
    qbank_preview = next(
        value
        for value in report["draftAndCurrentPreviews"]
        if value["namespace"] == "qbank"
        and value["uid"] == bundle.qbank_item["id"]
    )
    assert qbank_preview["frontHtml"] and qbank_preview["backHtml"]
    assert qbank_preview["qbank"]["stem"] == bundle.qbank_item["stem"]
    assert all("psychiatry_clerkship" not in path.name for path in out.iterdir())


def test_authoring_fail_on_hard_writes_reports_but_no_internal_package(
    passing_release_factory, tmp_path
):
    bundle = passing_release_factory()
    inputs = _profile_inputs(bundle, cards=tuple(bundle.inputs.cards[1:]))
    out = tmp_path / "authoring"
    review = tmp_path / "review"

    with pytest.raises(ReleaseOrchestrationError, match="hard issue"):
        run_profile(
            inputs,
            profile="authoring",
            out=out,
            review_out=review,
            baseline_history=HistoryRegistry((), ()),
            candidate_date=date(2026, 7, 14),
            build_epoch=1784059200,
            fail_on_hard=True,
        )

    assert (review / "review_candidate.json").is_file()
    assert not out.exists()


@pytest.mark.parametrize("profile", ["maintenance", "prepare", "release"])
def test_fail_on_hard_is_authoring_only(passing_release_factory, tmp_path, profile):
    with pytest.raises(ReleaseOrchestrationError, match="authoring"):
        run_profile(
            _profile_inputs(passing_release_factory()),
            profile=profile,
            out=tmp_path / "out",
            review_out=tmp_path / "review",
            baseline_history=HistoryRegistry((), ()),
            fail_on_hard=True,
        )


def test_maintenance_writes_no_package_for_only_allowlisted_phase2_gaps(
    passing_release_factory, tmp_path
):
    bundle = passing_release_factory()
    inputs = _profile_inputs(
        bundle,
        cards=(),
        detected_quarantines=(),
        release_history={"schemaVersion": 1, "identityEntries": [], "releases": []},
    )

    candidate = run_profile(
        inputs,
        profile="maintenance",
        out=tmp_path / "out",
        review_out=tmp_path / "review",
        baseline_history=HistoryRegistry((), ()),
    )

    assert candidate.release_epoch == INTERNAL_REVIEW_EPOCH
    assert not (tmp_path / "out").exists()
    assert (tmp_path / "review" / "review_candidate.json").is_file()


def test_prepare_writes_inspected_candidate_then_closed_mechanical_proposal(
    passing_release_factory, legacy_qbank_path, legacy_all_path, tmp_path, monkeypatch
):
    bundle = passing_release_factory()
    inputs = _profile_inputs(bundle, release_history={"schemaVersion": 1, "identityEntries": [], "releases": []})
    baseline = HistoryRegistry((), ())
    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_bytes(history_bytes(baseline))
    prior = tmp_path / "prior"
    prior.mkdir()
    shutil.copy2(legacy_qbank_path, prior / legacy_qbank_path.name)
    shutil.copy2(legacy_all_path, prior / legacy_all_path.name)
    out = tmp_path / "candidate"
    review = tmp_path / "review"
    monkeypatch.chdir(tmp_path)

    candidate = run_profile(
        inputs,
        profile="prepare",
        out=out,
        review_out=review,
        baseline_history=baseline,
        history_baseline_path=baseline_path,
        prior_release_dir=prior,
        evaluation_date=date(2026, 7, 14),
    )

    assert {path.name for path in out.iterdir()} == RELEASE_FILENAMES
    proposal = json.loads((review / "release_history.proposal.json").read_text())
    validate_history_proposal(proposal)
    assert proposal["historyAppend"]["releaseRecord"]["releaseId"] == candidate.release_id
    assert proposal["historyAppend"]["releaseRecord"]["governedInputSha256"] == "a" * 64
    expected_head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=bundle.inputs.repo_root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    assert proposal["generatedFromCommit"] == expected_head
    assert "reviewer" not in json.dumps(proposal).lower()
    assert "decision" not in json.dumps(proposal).lower()
    assert not (review / "release_history.patch.json").exists()


def test_release_requires_exact_new_history_append_and_emits_no_proposal(
    passing_release_factory, legacy_qbank_path, legacy_all_path, tmp_path
):
    bundle = passing_release_factory()
    baseline = HistoryRegistry((), ())
    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_bytes(history_bytes(baseline))
    prior = tmp_path / "prior"
    prior.mkdir()
    shutil.copy2(legacy_qbank_path, prior / legacy_qbank_path.name)
    shutil.copy2(legacy_all_path, prior / legacy_all_path.name)
    prepare_review = tmp_path / "prepare-review"
    base_inputs = _profile_inputs(
        bundle,
        release_history={"schemaVersion": 1, "identityEntries": [], "releases": []},
    )
    run_profile(
        base_inputs,
        profile="prepare",
        out=tmp_path / "prepare-candidate",
        review_out=prepare_review,
        baseline_history=baseline,
        history_baseline_path=baseline_path,
        prior_release_dir=prior,
        evaluation_date=date(2026, 7, 14),
    )
    proposal = json.loads(
        (prepare_review / "release_history.proposal.json").read_text()
    )
    append = proposal["historyAppend"]
    reviewed = HistoryRegistry(
        tuple(append["newIdentityEntries"]), (append["releaseRecord"],)
    )
    release_inputs = SimpleNamespace(
        **{
            **vars(base_inputs),
            "release_history": history_to_dict(reviewed),
        }
    )
    release_review = tmp_path / "release-review"

    run_profile(
        release_inputs,
        profile="release",
        out=tmp_path / "release-candidate",
        review_out=release_review,
        baseline_history=baseline,
        history_baseline_path=baseline_path,
        prior_release_dir=prior,
        evaluation_date=date(2026, 7, 14),
    )

    assert not (release_review / "release_history.proposal.json").exists()
    assert {path.name for path in (tmp_path / "release-candidate").iterdir()} == RELEASE_FILENAMES

    race_review = tmp_path / "race-review"
    run_profile(
        release_inputs,
        profile="release",
        out=tmp_path / "race-candidate",
        review_out=race_review,
        baseline_history=baseline,
        history_baseline_path=baseline_path,
        prior_release_dir=tmp_path / "release-candidate",
        evaluation_date=date(2026, 7, 14),
    )
    assert not (race_review / "release_history.proposal.json").exists()

    rebuild_baseline_path = tmp_path / "rebuild-baseline.json"
    rebuild_baseline_path.write_bytes(history_bytes(reviewed))
    rebuild_review = tmp_path / "rebuild-review"
    run_profile(
        release_inputs,
        profile="release",
        out=tmp_path / "rebuild-candidate",
        review_out=rebuild_review,
        baseline_history=reviewed,
        history_baseline_path=rebuild_baseline_path,
        prior_release_dir=tmp_path / "release-candidate",
        evaluation_date=date(2026, 7, 14),
    )
    assert not (rebuild_review / "release_history.proposal.json").exists()

    candidate = evaluate_release(
        release_inputs,
        build_epoch=1784059200,
        evaluation_date=date(2026, 7, 14),
        profile="release",
        baseline_history=reviewed,
    )
    for field, forged_value in (
        ("migrationSeedReleaseId", "forged-seed"),
        ("migrationContractSha256", "f" * 64),
    ):
        forged_record = deepcopy(append["releaseRecord"])
        forged_record[field] = forged_value
        forged = HistoryRegistry(
            tuple(append["newIdentityEntries"]), (forged_record,)
        )
        ordinary = run_candidate_migration(
            tmp_path / "release-candidate",
            tmp_path / "rebuild-candidate",
            forged,
            forged,
            candidate,
        )
        race = run_candidate_migration(
            tmp_path / "release-candidate",
            tmp_path / "rebuild-candidate",
            baseline,
            forged,
            candidate,
        )
        assert [issue.code for issue in ordinary.issues] == [
            "MIGRATION_PROOF_FAILED"
        ]
        assert [issue.code for issue in race.issues] == ["MIGRATION_PROOF_FAILED"]


def test_release_rejects_partial_history_match(
    passing_release_factory, legacy_qbank_path, legacy_all_path, tmp_path
):
    bundle = passing_release_factory()
    baseline = HistoryRegistry((), ())
    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_bytes(history_bytes(baseline))
    prior = tmp_path / "prior"
    prior.mkdir()
    shutil.copy2(legacy_qbank_path, prior / legacy_qbank_path.name)
    shutil.copy2(legacy_all_path, prior / legacy_all_path.name)
    inputs = _profile_inputs(
        bundle,
        release_history={"schemaVersion": 1, "identityEntries": [], "releases": []},
    )
    with pytest.raises(ReleaseOrchestrationError, match="history patch"):
        run_profile(
            inputs,
            profile="release",
            out=tmp_path / "candidate",
            review_out=tmp_path / "review",
            baseline_history=baseline,
            history_baseline_path=baseline_path,
            prior_release_dir=prior,
            evaluation_date=date(2026, 7, 14),
        )


def test_prepare_rejects_future_config_date_against_utc_evaluation(
    passing_release_factory, tmp_path
):
    bundle = passing_release_factory()
    inputs = _profile_inputs(
        bundle,
        release_history={"schemaVersion": 1, "identityEntries": [], "releases": []},
    )
    inputs.release_config["releaseDate"] = "2026-07-15"
    with pytest.raises(ReleaseOrchestrationError, match="future"):
        run_profile(
            inputs,
            profile="prepare",
            out=tmp_path / "out",
            review_out=tmp_path / "review",
            baseline_history=HistoryRegistry((), ()),
            history_baseline_path=tmp_path / "missing",
            prior_release_dir=tmp_path,
            evaluation_date=date(2026, 7, 14),
        )


def test_prepare_rejects_authoring_date_and_epoch_overrides(
    passing_release_factory, tmp_path
):
    inputs = _profile_inputs(
        passing_release_factory(),
        release_history={"schemaVersion": 1, "identityEntries": [], "releases": []},
    )
    with pytest.raises(ReleaseOrchestrationError, match="only for authoring"):
        run_profile(
            inputs,
            profile="prepare",
            out=tmp_path / "out",
            review_out=tmp_path / "review",
            baseline_history=HistoryRegistry((), ()),
            candidate_date=date(2026, 7, 14),
            build_epoch=1784059200,
        )


@pytest.mark.parametrize(
    ("field", "message"),
    (
        ("releaseId", "candidate release ID"),
        ("releaseDate", "configured release date"),
        ("releaseEpoch", "configured release epoch"),
    ),
)
def test_prepare_refuses_null_release_identity_date_or_epoch(
    passing_release_factory,
    legacy_qbank_path,
    legacy_all_path,
    tmp_path,
    field,
    message,
):
    bundle = passing_release_factory()
    inputs = _profile_inputs(
        bundle,
        release_history={"schemaVersion": 1, "identityEntries": [], "releases": []},
    )
    inputs.release_config[field] = None
    baseline = HistoryRegistry((), ())
    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_bytes(history_bytes(baseline))
    prior = tmp_path / "prior"
    prior.mkdir()
    shutil.copy2(legacy_qbank_path, prior / legacy_qbank_path.name)
    shutil.copy2(legacy_all_path, prior / legacy_all_path.name)

    with pytest.raises(ReleaseOrchestrationError, match=message):
        run_profile(
            inputs,
            profile="prepare",
            out=tmp_path / "out",
            review_out=tmp_path / "review",
            baseline_history=baseline,
            history_baseline_path=baseline_path,
            prior_release_dir=prior,
            evaluation_date=date(2026, 7, 14),
        )
