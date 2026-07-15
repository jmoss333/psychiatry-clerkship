#!/usr/bin/env python3
"""Validate faculty attestation consistency across source registries.

The faculty console commits review decisions to reviewed.json. Source headers,
topic metadata, and the Interview Room's case/voice pack must not imply broader
approval than that ledger actually records.
"""

import json
import os
import re
import sys


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REVIEWED_PATH = os.path.join("13_Faculty_Resources", "reviewed.json")
TOPIC_META_PATH = "topic_meta.json"
MANIFEST_PATH = os.path.join(
    "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json"
)

REVIEWED_STATUSES = {"reviewed", "attested"}
PROFILE_STATUSES = {"draft-pending-attestation", "reviewed"}
CADENCES = {"measured-flat", "pressured-fast", "guarded-halting"}
EXPECTED_CANDIDATE_IDS = {"openai-quality-v1", "elevenlabs-expressive-v1"}


def load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def norm_status(value):
    return str(value or "unreviewed")


def is_reviewed(value):
    return norm_status(value) in REVIEWED_STATUSES


def parse_rc_meta(source):
    """Return key/value pairs from one HTML RC-META comment, if present."""
    match = re.search(r"<!--\s*\[RC-META\]\s*(.*?)-->", source, re.S)
    if not match:
        return None
    return dict(re.findall(r"([A-Za-z][\w-]*)=\"([^\"]*)\"", match.group(1)))


def _case_label(case_def, index):
    return str(case_def.get("id") or "case[%d]" % index)


def _validate_speech_profile(slug, case_def, case_id, engine_status):
    errors = []
    profile = case_def.get("speechProfile")
    if not isinstance(profile, dict):
        return ["%s: case %s is missing speechProfile" % (slug, case_id)]

    profile_status = norm_status(profile.get("status"))
    if profile_status not in PROFILE_STATUSES:
        errors.append(
            "%s: case %s speechProfile.status is %s"
            % (slug, case_id, profile_status)
        )

    if not profile.get("id"):
        errors.append("%s: case %s speechProfile is missing id" % (slug, case_id))
    version = profile.get("profileVersion")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        errors.append(
            "%s: case %s speechProfile.profileVersion must be a positive integer"
            % (slug, case_id)
        )
    if profile.get("cadence") not in CADENCES:
        errors.append(
            "%s: case %s speechProfile.cadence is invalid" % (slug, case_id)
        )
    speaking_rate = profile.get("speakingRate")
    if (
        isinstance(speaking_rate, bool)
        or not isinstance(speaking_rate, (int, float))
        or not 0.75 <= speaking_rate <= 1.25
    ):
        errors.append(
            "%s: case %s speechProfile.speakingRate must be between 0.75 and 1.25"
            % (slug, case_id)
        )
    if profile.get("stageDirections") != "visual-only":
        errors.append(
            "%s: case %s speechProfile.stageDirections must be visual-only"
            % (slug, case_id)
        )

    review = profile.get("facultyReview")
    if not isinstance(review, dict):
        errors.append(
            "%s: case %s speechProfile is missing facultyReview" % (slug, case_id)
        )
        review = {}

    if profile_status == "draft-pending-attestation":
        if norm_status(review.get("status")) == "reviewed":
            errors.append(
                "%s: case %s draft speechProfile cannot claim reviewed facultyReview"
                % (slug, case_id)
            )
    elif profile_status == "reviewed":
        if engine_status != "reviewed":
            errors.append(
                "%s: case %s speechProfile is reviewed while speechEngine is %s"
                % (slug, case_id, engine_status)
            )
        if not is_reviewed(case_def.get("facultyReview", {}).get("status")):
            errors.append(
                "%s: non-reviewed case %s cannot have a reviewed speechProfile"
                % (slug, case_id)
            )
        for field in ("provider", "providerModel", "voiceId"):
            if not profile.get(field):
                errors.append(
                    "%s: reviewed case %s speechProfile is missing %s"
                    % (slug, case_id, field)
                )
        if norm_status(review.get("status")) != "reviewed":
            errors.append(
                "%s: reviewed case %s speechProfile facultyReview is not reviewed"
                % (slug, case_id)
            )
        for field in ("reviewer", "reviewedAt", "auditionId", "profileHash"):
            if not review.get(field):
                errors.append(
                    "%s: reviewed case %s speechProfile facultyReview is missing %s"
                    % (slug, case_id, field)
                )

    if profile_status != "draft-pending-attestation":
        for field in ("provider", "providerModel", "voiceId"):
            if profile.get(field) is None:
                errors.append(
                    "%s: null speechProfile.%s is allowed only while draft"
                    % (slug, field)
                )
    return errors


def _validate_speech_engine(slug, pack, cases):
    errors = []
    speech_engine = pack.get("speechEngine")
    if not isinstance(speech_engine, dict):
        return ["%s: pack is missing speechEngine" % slug]

    if speech_engine.get("schemaVersion") != 1:
        errors.append("%s: speechEngine.schemaVersion must be 1" % slug)
    engine_status = norm_status(speech_engine.get("status"))
    if engine_status not in PROFILE_STATUSES:
        errors.append("%s: speechEngine.status is %s" % (slug, engine_status))
    if not isinstance(speech_engine.get("enabled"), bool):
        errors.append("%s: speechEngine.enabled must be boolean" % slug)
    if engine_status == "draft-pending-attestation":
        if speech_engine.get("enabled") is not False:
            errors.append("%s: draft speechEngine must be disabled" % slug)
        if speech_engine.get("activeStack") is not None:
            errors.append("%s: draft speechEngine.activeStack must be null" % slug)

    candidates = speech_engine.get("candidateStacks")
    if not isinstance(candidates, list):
        errors.append("%s: speechEngine.candidateStacks must be a list" % slug)
        candidates = []
    candidate_ids = {
        candidate.get("id")
        for candidate in candidates
        if isinstance(candidate, dict) and candidate.get("id")
    }
    if candidate_ids != EXPECTED_CANDIDATE_IDS:
        errors.append(
            "%s: speechEngine candidate IDs must be %s"
            % (slug, ", ".join(sorted(EXPECTED_CANDIDATE_IDS)))
        )
    if engine_status == "reviewed" and speech_engine.get("activeStack") not in candidate_ids:
        errors.append("%s: reviewed speechEngine must select an audition candidate" % slug)

    rate_card = speech_engine.get("rateCard")
    rate_models = set()
    rate_keys = set()
    if not isinstance(rate_card, dict):
        errors.append("%s: speechEngine is missing rateCard" % slug)
    else:
        if not rate_card.get("version") or not rate_card.get("effectiveDate"):
            errors.append("%s: rateCard requires version and effectiveDate" % slug)
        rates = rate_card.get("rates")
        if not isinstance(rates, list) or not rates:
            errors.append("%s: rateCard.rates must be a non-empty list" % slug)
            rates = []
        for index, rate in enumerate(rates):
            if not isinstance(rate, dict):
                errors.append("%s: rateCard.rates[%d] must be an object" % (slug, index))
                continue
            provider = rate.get("provider")
            model = rate.get("model")
            meter = rate.get("meter")
            if not all((provider, model, meter, rate.get("unit"), rate.get("sourceUrl"))):
                errors.append(
                    "%s: rateCard.rates[%d] is missing provider/model/meter/unit/sourceUrl"
                    % (slug, index)
                )
            price = rate.get("price")
            if (
                isinstance(price, bool)
                or not isinstance(price, (int, float))
                or price <= 0
            ):
                errors.append(
                    "%s: rateCard.rates[%d].price must be positive" % (slug, index)
                )
            if model:
                rate_models.add(model)
                rate_keys.add((model, meter))

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        for leg in ("transcription", "synthesis"):
            contract = candidate.get(leg)
            if not isinstance(contract, dict) or not contract.get("provider") or not contract.get("model"):
                errors.append(
                    "%s: candidate %s is missing %s provider/model"
                    % (slug, candidate.get("id") or "<unknown>", leg)
                )
                continue
            if contract.get("model") not in rate_models:
                errors.append(
                    "%s: candidate model %s is absent from the rate card"
                    % (slug, contract.get("model"))
                )

    actor_model = pack.get("engine", {}).get("modelPinned")
    if actor_model:
        for meter in ("input_tokens", "output_tokens"):
            if (actor_model, meter) not in rate_keys:
                errors.append(
                    "%s: actor model %s %s rate is absent from the rate card"
                    % (slug, actor_model, meter)
                )

    privacy = speech_engine.get("privacyReview")
    if not isinstance(privacy, dict):
        errors.append("%s: speechEngine is missing privacyReview" % slug)
    elif engine_status == "draft-pending-attestation":
        if privacy.get("status") != "pending" or privacy.get("decision") != "pending":
            errors.append("%s: draft speechEngine privacy review must remain pending" % slug)
        if privacy.get("policyUrls") != [] or privacy.get("policyHashes") != []:
            errors.append("%s: pending privacy review policy records must be empty" % slug)
        for field in ("reviewer", "reviewedAt", "nextReviewAt"):
            if privacy.get(field) is not None:
                errors.append(
                    "%s: pending privacyReview.%s must be null" % (slug, field)
                )
        if privacy.get("consentVersion") != "2026-07-14-draft":
            errors.append(
                "%s: pending privacyReview consentVersion must be 2026-07-14-draft"
                % slug
            )

    if speech_engine.get("enabled") is True and engine_status != "reviewed":
        errors.append("%s: managed voice cannot be enabled before speechEngine review" % slug)

    for index, case_def in enumerate(cases):
        if isinstance(case_def, dict):
            case_id = _case_label(case_def, index)
            errors.extend(
                _validate_speech_profile(slug, case_def, case_id, engine_status)
            )
    return errors


def _validate_pack(slug, pack_path, ledger_status, meta_status):
    errors = []
    try:
        pack = load(pack_path)
    except (OSError, ValueError) as exc:
        return ["%s: could not load case pack (%s)" % (slug, exc)]

    pack_status = norm_status(pack.get("status"))
    if is_reviewed(ledger_status) and not is_reviewed(pack_status):
        errors.append(
            "%s: reviewed.json says reviewed but pack status is %s"
            % (slug, pack_status)
        )
    if not is_reviewed(ledger_status) and is_reviewed(pack_status):
        errors.append(
            "%s: pack says %s but reviewed.json status is %s"
            % (slug, pack_status, ledger_status)
        )
    if meta_status and is_reviewed(meta_status) != is_reviewed(pack_status):
        errors.append(
            "%s: RC-META status %s disagrees with pack status %s"
            % (slug, meta_status, pack_status)
        )

    cases = pack.get("cases")
    if not isinstance(cases, list) or not cases:
        return errors + ["%s: pack.cases must be a non-empty list" % slug]
    for index, case_def in enumerate(cases):
        if not isinstance(case_def, dict):
            errors.append("%s: pack.cases[%d] must be an object" % (slug, index))
            continue
        case_id = _case_label(case_def, index)
        review = case_def.get("facultyReview")
        if not isinstance(review, dict):
            errors.append("%s: case %s is missing facultyReview" % (slug, case_id))
            review = {}
        case_status = norm_status(review.get("status"))
        if is_reviewed(pack_status) and not is_reviewed(case_status):
            errors.append(
                "%s: attested pack contains non-reviewed case %s" % (slug, case_id)
            )
        if is_reviewed(case_status):
            reviewer = review.get("reviewer")
            if not reviewer or reviewer == "Pending faculty review":
                errors.append(
                    "%s: reviewed case %s is missing reviewer" % (slug, case_id)
                )
            if not (review.get("lastReviewed") or review.get("reviewedAt")):
                errors.append(
                    "%s: reviewed case %s is missing review date" % (slug, case_id)
                )

    errors.extend(_validate_speech_engine(slug, pack, cases))
    return errors


def validate(root):
    """Return every attestation inconsistency found below ``root``."""
    root = os.path.abspath(os.fspath(root))
    reviewed = load(os.path.join(root, REVIEWED_PATH))
    topic_meta = load(os.path.join(root, TOPIC_META_PATH))
    manifest = load(os.path.join(root, MANIFEST_PATH))
    manifest_md_entries = manifest.get("md", [])
    manifest_tool_entries = manifest.get("tools", [])
    manifest_md = {slug for _src, slug, _title in manifest_md_entries}
    manifest_tools = {slug for _src, slug, _title in manifest_tool_entries}
    manifest_items = manifest_md | manifest_tools

    errors = []
    for slug in sorted(manifest_items):
        if slug not in reviewed:
            errors.append("%s: missing reviewed.json entry" % slug)

    for src, slug, _title in manifest_md_entries:
        ledger_status = norm_status(reviewed.get(slug, {}).get("status"))
        if not is_reviewed(ledger_status):
            continue
        source_path = os.path.join(root, src)
        try:
            with open(source_path, encoding="utf-8") as handle:
                source_head = "\n".join(handle.read().splitlines()[:8])
        except FileNotFoundError:
            errors.append(
                "%s: source file listed in manifest is missing (%s)" % (slug, src)
            )
            continue
        if re.search(r"pending.*review|pending.*attestation|AI-drafted", source_head, re.I):
            errors.append(
                "%s: reviewed.json says reviewed but source banner still says pending review"
                % slug
            )

    for src, slug, _title in manifest_tool_entries:
        ledger_status = norm_status(reviewed.get(slug, {}).get("status"))
        source_path = os.path.join(root, src)
        try:
            with open(source_path, encoding="utf-8") as handle:
                source = handle.read(32768)
        except FileNotFoundError:
            errors.append(
                "%s: source file listed in manifest is missing (%s)" % (slug, src)
            )
            continue
        meta = parse_rc_meta(source)
        if meta is None:
            errors.append("%s: manifest tool is missing an [RC-META] header" % slug)
            meta = {}
        meta_status = meta.get("status")
        if meta_status and is_reviewed(ledger_status) and not is_reviewed(meta_status):
            errors.append(
                "%s: reviewed.json says reviewed but RC-META status is %s"
                % (slug, meta_status)
            )
        if meta_status and not is_reviewed(ledger_status) and is_reviewed(meta_status):
            errors.append(
                "%s: RC-META says reviewed but reviewed.json status is %s"
                % (slug, ledger_status)
            )

        pack_path = os.path.splitext(source_path)[0] + ".pack.json"
        if slug == "sp-interview.html" and not os.path.exists(pack_path):
            errors.append("%s: case pack is missing (%s)" % (slug, pack_path))
        elif os.path.exists(pack_path):
            errors.extend(
                _validate_pack(slug, pack_path, ledger_status, meta_status)
            )

    for slug in sorted(manifest_md):
        meta = topic_meta.get(slug)
        if not isinstance(meta, dict):
            continue
        faculty = meta.get("facultyReview")
        if not isinstance(faculty, dict):
            continue
        ledger = reviewed.get(slug, {})
        ledger_status = norm_status(ledger.get("status"))
        faculty_status = norm_status(faculty.get("status"))
        if is_reviewed(ledger_status) and not is_reviewed(faculty_status):
            errors.append(
                "%s: reviewed.json says reviewed but topic_meta.facultyReview.status is %s"
                % (slug, faculty_status)
            )
        if not is_reviewed(ledger_status) and is_reviewed(faculty_status):
            errors.append(
                "%s: topic_meta says reviewed but reviewed.json status is %s"
                % (slug, ledger_status)
            )
        if is_reviewed(ledger_status):
            if not faculty.get("lastReviewed"):
                errors.append(
                    "%s: reviewed topic_meta entry is missing facultyReview.lastReviewed"
                    % slug
                )
            if not faculty.get("reviewer") or faculty.get("reviewer") == "Pending faculty review":
                errors.append(
                    "%s: reviewed topic_meta entry is missing an attesting reviewer" % slug
                )

    return errors


def main():
    errors = validate(ROOT)
    if errors:
        print("attestation consistency INVALID — %d issue(s):" % len(errors))
        for error in errors:
            print("  -", error)
        return 1

    topic_meta = load(os.path.join(ROOT, TOPIC_META_PATH))
    manifest = load(os.path.join(ROOT, MANIFEST_PATH))
    manifest_md = {slug for _src, slug, _title in manifest.get("md", [])}
    manifest_items = manifest_md | {
        slug for _src, slug, _title in manifest.get("tools", [])
    }
    faculty_count = sum(
        1
        for slug in manifest_md
        if isinstance(topic_meta.get(slug), dict)
        and isinstance(topic_meta.get(slug, {}).get("facultyReview"), dict)
    )
    noun = "entry" if faculty_count == 1 else "entries"
    print(
        "attestation consistency OK — %d manifest item(s), %d topic facultyReview %s aligned."
        % (len(manifest_items), faculty_count, noun)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
