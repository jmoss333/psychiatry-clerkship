from copy import deepcopy
from datetime import date
from hashlib import sha256
import json
from pathlib import Path

import pytest

from pcl_anki.contract import canonical_json_sha256, normalize_source
from pcl_anki.sources import (
    SourceResolutionError,
    heading_slug,
    load_manifest,
    load_week_map,
    parse_markdown_sections,
    resolve_introduced_week,
    resolve_source,
    sequence_review_payload,
)


ANCHOR_VECTORS = (
    Path(__file__).parent / "fixtures" / "anchor_vectors.json"
)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", newline="")


@pytest.fixture
def source_repo(tmp_path: Path) -> dict:
    source_path = "03_Core_Topics/Mood/topic.md"
    slug = "topic page.md"
    anchor = "safety-capacity-follow-up"
    quote = "Café guidance requires careful spacing."
    markdown = """# Synthetic Topic

> **Review status:** Reviewed and attested by Faculty Reviewer (2026-07-14).

## Safety, Capacity & Follow-up!

Café guidance requires careful spacing.

### Practical detail

Use the named section for the exact source passage.

## Next Section

This sentence is outside the governed section.
"""
    manifest_path = (
        tmp_path
        / "13_Faculty_Resources"
        / "_automation"
        / "site_build"
        / "site_manifest.json"
    )
    config_path = tmp_path / "13_Faculty_Resources" / "anki" / "release_config.json"
    week_map_path = tmp_path / "maps" / "week.md"
    source_file = tmp_path / source_path
    write_text(source_file, markdown)
    write_text(week_map_path, "# Sequence\n\n## Week 3\n\n- [Topic](?page=topic%20page.md)\n")
    write_json(
        manifest_path,
        {
            "_note": "synthetic source manifest",
            "tools": [],
            "md": [[source_path, slug, "Synthetic Topic"]],
        },
    )
    write_json(
        config_path,
        {
            "canonicalBaseUrl": "https://une-ms3-psychiatry.netlify.app/",
            "sequenceMapPath": "maps/week.md",
            "primaryAuthorityPathPrefixes": ["03_Core_Topics/"],
            "contextOnlyPathPrefixes": ["cases/"],
            "sequencingOnlyPaths": [
                "maps/week.md",
                "09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md",
                "14_Tracks/MS3/Student_Ready_Pack/core_reading_list.md",
                "14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md",
                "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
            ],
        },
    )
    return {
        "root": tmp_path,
        "source_path": source_path,
        "source_file": source_file,
        "slug": slug,
        "anchor": anchor,
        "quote": quote,
        "markdown": markdown,
        "manifest_path": manifest_path,
        "config_path": config_path,
        "week_map_path": week_map_path,
        "reviewed": {
            slug: {
                "status": "reviewed",
                "at": "2026-07-14",
                "by": "Faculty Reviewer",
            }
        },
        "surveillance": {"slugs": []},
        "source": {
            "path": source_path,
            "slug": slug,
            "anchor": anchor,
            "quote": quote,
        },
    }


def resolution_error(
    source_repo: dict,
    code: str,
    *,
    source: dict | None = None,
    reviewed: dict | None = None,
    surveillance: dict | None = None,
) -> SourceResolutionError:
    manifest = load_manifest(source_repo["manifest_path"])
    with pytest.raises(SourceResolutionError) as raised:
        resolve_source(
            source_repo["root"],
            source if source is not None else source_repo["source"],
            manifest,
            reviewed if reviewed is not None else source_repo["reviewed"],
            surveillance if surveillance is not None else source_repo["surveillance"],
        )
    assert raised.value.code == code
    return raised.value


def test_heading_slug_matches_shared_golden_vectors():
    vectors = json.loads(ANCHOR_VECTORS.read_text(encoding="utf-8"))
    assert [heading_slug(vector["heading"]) for vector in vectors] == [
        vector["expected"] for vector in vectors
    ]


def test_parse_markdown_sections_supports_atx_and_setext_boundaries():
    text = """# Document

## ATX *Heading* ##
ATX body.

Setext `Heading`
-----------------
Setext body.

### Child
Child body.

## Peer
Peer body.
"""
    sections = parse_markdown_sections(text)

    assert [(section.title, section.anchor, section.level) for section in sections] == [
        ("Document", "document", 1),
        ("ATX *Heading*", "atx-heading", 2),
        ("Setext `Heading`", "setext-heading", 2),
        ("Child", "child", 3),
        ("Peer", "peer", 2),
    ]
    setext = next(section for section in sections if section.anchor == "setext-heading")
    assert setext.start_line == 6
    assert setext.end_line == 12
    assert "Setext body." in setext.raw_text
    assert "Child body." in setext.raw_text
    assert "Peer body." not in setext.raw_text


def test_markdown_sections_ignore_fenced_headings_and_allow_indented_atx():
    text = """# Real Document

```markdown
## Fenced ATX
Fenced Setext
-------------
```

   ## Indented [Safety planning][ref] ##
Visible body.

~~~
### Also Fenced
~~~

[ref]: https://example.test
"""

    sections = parse_markdown_sections(text)

    assert [(section.title, section.anchor, section.level) for section in sections] == [
        ("Real Document", "real-document", 1),
        (
            "Indented [Safety planning][ref]",
            "indented-safety-planning",
            2,
        ),
    ]


def test_load_manifest_builds_unique_bidirectional_maps(source_repo):
    manifest = load_manifest(source_repo["manifest_path"])

    assert manifest.path_to_slug == {
        source_repo["source_path"]: source_repo["slug"]
    }
    assert manifest.slug_to_path == {
        source_repo["slug"]: source_repo["source_path"]
    }
    assert manifest.slug_to_title == {source_repo["slug"]: "Synthetic Topic"}


@pytest.mark.parametrize(
    "unsafe_path",
    [
        "",
        ".",
        "..",
        "/absolute/topic.md",
        "03_Core_Topics/../outside.md",
        "03_Core_Topics/../../outside.md",
        "03_Core_Topics\\Mood\\topic.md",
        "03_Core_Topics//Mood/topic.md",
        "./03_Core_Topics/Mood/topic.md",
    ],
)
def test_load_manifest_rejects_noncanonical_or_escaping_paths(
    source_repo, unsafe_path
):
    manifest = json.loads(source_repo["manifest_path"].read_text(encoding="utf-8"))
    manifest["md"][0][0] = unsafe_path
    write_json(source_repo["manifest_path"], manifest)

    with pytest.raises(SourceResolutionError) as raised:
        load_manifest(source_repo["manifest_path"])
    assert raised.value.code == "MANIFEST_PATH_INVALID"


@pytest.mark.parametrize("duplicate_index", [0, 1])
def test_load_manifest_rejects_duplicate_path_or_slug(source_repo, duplicate_index):
    manifest = json.loads(source_repo["manifest_path"].read_text(encoding="utf-8"))
    duplicate = list(manifest["md"][0])
    duplicate[duplicate_index] = (
        manifest["md"][0][duplicate_index]
        if duplicate_index == 0
        else manifest["md"][0][duplicate_index]
    )
    if duplicate_index == 0:
        duplicate[1] = "other.md"
    else:
        duplicate[0] = "03_Core_Topics/Mood/other.md"
    manifest["md"].append(duplicate)
    write_json(source_repo["manifest_path"], manifest)

    with pytest.raises(SourceResolutionError) as raised:
        load_manifest(source_repo["manifest_path"])
    assert raised.value.code in {"MANIFEST_DUPLICATE_PATH", "MANIFEST_DUPLICATE_SLUG"}


def test_load_week_map_tracks_earliest_page_and_tool_week(source_repo):
    write_text(
        source_repo["week_map_path"],
        """# Sequence

## Week 4
- [Topic later](?page=topic%20page.md)
- [Tool later](?tool=decision-aids.html)

## Week 2 — Earlier
- [Topic earlier](?page=topic%20page.md)
- [Tool earlier](?tool=decision-aids.html)
""",
    )
    manifest = load_manifest(source_repo["manifest_path"])

    week_map = load_week_map(source_repo["week_map_path"], manifest)

    assert week_map.slug_to_first_week == {source_repo["slug"]: 2}
    assert week_map.tool_to_first_week == {"decision-aids.html": 2}


def test_resolve_source_returns_exact_reviewed_passage(source_repo):
    manifest = load_manifest(source_repo["manifest_path"])

    resolved = resolve_source(
        source_repo["root"],
        source_repo["source"],
        manifest,
        source_repo["reviewed"],
        source_repo["surveillance"],
    )

    normalized_quote = normalize_source(source_repo["quote"])
    section = next(
        section
        for section in parse_markdown_sections(source_repo["markdown"])
        if section.anchor == source_repo["anchor"]
    )
    assert resolved.path == source_repo["source_path"]
    assert resolved.slug == source_repo["slug"]
    assert resolved.anchor == source_repo["anchor"]
    assert resolved.url == (
        "https://une-ms3-psychiatry.netlify.app/"
        "?page=topic%20page.md#safety-capacity-follow-up"
    )
    assert resolved.quote == normalized_quote
    assert resolved.quote_sha256 == sha256(normalized_quote.encode("utf-8")).hexdigest()
    assert resolved.section_sha256 == sha256(
        section.normalized_text.encode("utf-8")
    ).hexdigest()
    assert resolved.reviewed_at == date(2026, 7, 14)
    assert resolved.introduced_week == 3


def test_source_path_must_be_present_in_manifest(source_repo):
    source = {**source_repo["source"], "path": "03_Core_Topics/Mood/missing.md"}
    resolution_error(source_repo, "SOURCE_PATH_NOT_IN_MANIFEST", source=source)


def test_declared_slug_must_equal_manifest_slug(source_repo):
    source = {**source_repo["source"], "slug": "other.md"}
    resolution_error(source_repo, "SOURCE_SLUG_MISMATCH", source=source)


def test_source_slug_must_be_reviewed(source_repo):
    reviewed = deepcopy(source_repo["reviewed"])
    reviewed[source_repo["slug"]]["status"] = "pending"
    resolution_error(source_repo, "SOURCE_NOT_REVIEWED", reviewed=reviewed)


def test_pending_review_banner_fails_closed(source_repo):
    write_text(
        source_repo["source_file"],
        source_repo["markdown"].replace(
            "Reviewed and attested by Faculty Reviewer (2026-07-14)",
            "Pending faculty review",
        ),
    )
    resolution_error(source_repo, "SOURCE_PENDING_REVIEW_BANNER")


def test_named_heading_anchor_must_exist(source_repo):
    source = {**source_repo["source"], "anchor": "missing-heading"}
    resolution_error(source_repo, "SOURCE_ANCHOR_MISSING", source=source)


def test_named_heading_anchor_must_be_unique(source_repo):
    write_text(
        source_repo["source_file"],
        source_repo["markdown"]
        + "\n## Safety Capacity Follow-up\n\nDuplicate governed heading.\n",
    )
    resolution_error(source_repo, "SOURCE_ANCHOR_DUPLICATED")


def test_quote_must_exist(source_repo):
    source = {**source_repo["source"], "quote": "Missing source passage."}
    resolution_error(source_repo, "SOURCE_QUOTE_MISSING", source=source)


def test_quote_must_be_unique_inside_section(source_repo):
    write_text(
        source_repo["source_file"],
        source_repo["markdown"].replace(
            "### Practical detail",
            source_repo["quote"] + "\n\n### Practical detail",
        ),
    )
    resolution_error(source_repo, "SOURCE_QUOTE_DUPLICATED")


def test_quote_cannot_move_outside_named_section(source_repo):
    write_text(
        source_repo["source_file"],
        source_repo["markdown"]
        .replace(source_repo["quote"], "A different sentence remains here.", 1)
        .replace(
            "This sentence is outside the governed section.",
            source_repo["quote"],
        ),
    )
    resolution_error(source_repo, "SOURCE_QUOTE_OUTSIDE_SECTION")


def test_unicode_crlf_and_whitespace_only_quote_changes_normalize_equivalently(
    source_repo,
):
    decomposed = "Cafe\u0301   guidance\r\nrequires\tcareful spacing."
    source = {**source_repo["source"], "quote": decomposed}
    manifest = load_manifest(source_repo["manifest_path"])

    resolved = resolve_source(
        source_repo["root"],
        source,
        manifest,
        source_repo["reviewed"],
        source_repo["surveillance"],
    )

    assert resolved.quote == "Café guidance requires careful spacing."
    assert resolved.quote_sha256 == sha256(
        resolved.quote.encode("utf-8")
    ).hexdigest()


@pytest.mark.parametrize("escape_repo", [False, True])
def test_resolve_source_rejects_symlink_escape_from_authority_or_repo(
    source_repo, escape_repo
):
    if escape_repo:
        outside = source_repo["root"].parent / (
            source_repo["root"].name + "-outside.md"
        )
        expected_code = "SOURCE_REPO_ESCAPE"
    else:
        outside = source_repo["root"] / "outside-authority.md"
        expected_code = "SOURCE_AUTHORITY_ESCAPE"
    write_text(outside, source_repo["markdown"])
    source_repo["source_file"].unlink()
    source_repo["source_file"].symlink_to(outside)

    resolution_error(source_repo, expected_code)


def test_surveillance_presence_requires_reattest(source_repo):
    resolution_error(
        source_repo,
        "SOURCE_NEEDS_REATTEST",
        surveillance={"slugs": [source_repo["slug"]]},
    )


def test_source_path_must_be_primary_authority(source_repo):
    source_path = "08_Reference/secondary.md"
    manifest = json.loads(source_repo["manifest_path"].read_text(encoding="utf-8"))
    manifest["md"].append([source_path, "secondary.md", "Secondary"])
    write_json(source_repo["manifest_path"], manifest)
    write_text(source_repo["root"] / source_path, source_repo["markdown"])
    reviewed = {
        "secondary.md": {
            "status": "reviewed",
            "at": "2026-07-14",
            "by": "Faculty Reviewer",
        }
    }
    source = {**source_repo["source"], "path": source_path, "slug": "secondary.md"}
    resolution_error(
        source_repo,
        "SOURCE_NOT_PRIMARY_AUTHORITY",
        source=source,
        reviewed=reviewed,
    )


def test_configured_authority_prefix_must_exist(source_repo):
    config = json.loads(source_repo["config_path"].read_text(encoding="utf-8"))
    config["primaryAuthorityPathPrefixes"].append("05_Psychopharmacology/")
    write_json(source_repo["config_path"], config)
    resolution_error(source_repo, "AUTHORITY_PREFIX_MISSING")


def test_configured_authority_prefix_must_match_manifest_markdown(source_repo):
    config = json.loads(source_repo["config_path"].read_text(encoding="utf-8"))
    config["primaryAuthorityPathPrefixes"].append("05_Psychopharmacology/")
    write_json(source_repo["config_path"], config)
    (source_repo["root"] / "05_Psychopharmacology").mkdir(parents=True)
    resolution_error(source_repo, "AUTHORITY_PREFIX_UNMAPPED")


@pytest.mark.parametrize(
    "sequencing_path",
    [
        "maps/week.md",
        "09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md",
        "14_Tracks/MS3/Student_Ready_Pack/core_reading_list.md",
        "14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md",
        "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
    ],
)
def test_sequencing_material_cannot_be_primary_authority(
    source_repo, sequencing_path
):
    manifest = json.loads(source_repo["manifest_path"].read_text(encoding="utf-8"))
    slug = Path(sequencing_path).name
    manifest["md"].append([sequencing_path, slug, "Sequencing Only"])
    write_json(source_repo["manifest_path"], manifest)
    write_text(source_repo["root"] / sequencing_path, source_repo["markdown"])
    source = {**source_repo["source"], "path": sequencing_path, "slug": slug}
    reviewed = {
        slug: {
            "status": "reviewed",
            "at": "2026-07-14",
            "by": "Faculty Reviewer",
        }
    }
    resolution_error(
        source_repo,
        "SOURCE_SEQUENCING_ONLY",
        source=source,
        reviewed=reviewed,
    )


def test_context_case_cannot_be_primary_treatment_authority(source_repo):
    source_path = "cases/treatment_osce.md"
    manifest = json.loads(source_repo["manifest_path"].read_text(encoding="utf-8"))
    manifest["md"].append([source_path, "osce.md", "Treatment OSCE"])
    write_json(source_repo["manifest_path"], manifest)
    write_text(source_repo["root"] / source_path, source_repo["markdown"])
    source = {
        **source_repo["source"],
        "path": source_path,
        "slug": "osce.md",
        "claimType": "treatment",
    }
    reviewed = {
        "osce.md": {
            "status": "reviewed",
            "at": "2026-07-14",
            "by": "Faculty Reviewer",
        }
    }
    resolution_error(
        source_repo,
        "SOURCE_CONTEXT_ONLY",
        source=source,
        reviewed=reviewed,
    )


def complete_sequence_override() -> dict:
    return {
        "sequenceBasis": "faculty_override",
        "sequenceRationale": "Introduce this reviewed authority before its map update.",
        "sequenceReviewedBy": "Faculty Reviewer",
        "sequenceReviewedAt": "2026-07-14",
    }


def test_core_or_application_source_requires_sequence_introduction(source_repo):
    week_map = load_week_map(source_repo["week_map_path"], load_manifest(source_repo["manifest_path"]))

    with pytest.raises(SourceResolutionError) as raised:
        resolve_introduced_week(
            {"slug": "unsequenced.md", "week": 2, "namespace": "core"},
            week_map,
            {"sequenceBasis": "weekly_map"},
        )
    assert raised.value.code == "SOURCE_SEQUENCE_MISSING"


def test_card_week_cannot_precede_earliest_introduced_week(source_repo):
    week_map = load_week_map(source_repo["week_map_path"], load_manifest(source_repo["manifest_path"]))

    with pytest.raises(SourceResolutionError) as raised:
        resolve_introduced_week(
            {"slug": source_repo["slug"], "week": 2, "namespace": "application"},
            week_map,
            {"sequenceBasis": "weekly_map"},
        )
    assert raised.value.code == "SOURCE_WEEK_BEFORE_INTRODUCTION"


@pytest.mark.parametrize(
    "missing_field",
    ["sequenceRationale", "sequenceReviewedBy", "sequenceReviewedAt"],
)
def test_sequence_override_requires_named_review(source_repo, missing_field):
    week_map = load_week_map(source_repo["week_map_path"], load_manifest(source_repo["manifest_path"]))
    review = complete_sequence_override()
    del review[missing_field]

    with pytest.raises(SourceResolutionError) as raised:
        resolve_introduced_week(
            {"slug": "unsequenced.md", "week": 2, "namespace": "core"},
            week_map,
            review,
        )
    assert raised.value.code == "SEQUENCE_OVERRIDE_INCOMPLETE"


def test_sequence_override_fields_are_part_of_exact_approval_projection():
    review = complete_sequence_override()
    payload = sequence_review_payload(review)
    approved = canonical_json_sha256(payload)

    assert payload == review
    for field in (
        "sequenceBasis",
        "sequenceRationale",
        "sequenceReviewedBy",
        "sequenceReviewedAt",
    ):
        mutated = deepcopy(review)
        mutated[field] += " changed"
        assert canonical_json_sha256(sequence_review_payload(mutated)) != approved


def test_full_qbank_source_is_exempt_from_week_map_membership(source_repo):
    week_map = load_week_map(source_repo["week_map_path"], load_manifest(source_repo["manifest_path"]))

    assert (
        resolve_introduced_week(
            {"slug": "unsequenced.md", "namespace": "qbank"},
            week_map,
        )
        is None
    )


@pytest.mark.parametrize(
    "base_url",
    [
        "https://example.test/",
        "https://une-ms3-psychiatry.netlify.app",
        "http://une-ms3-psychiatry.netlify.app/",
    ],
)
def test_resolve_source_requires_exact_canonical_base_url(source_repo, base_url):
    config = json.loads(source_repo["config_path"].read_text(encoding="utf-8"))
    config["canonicalBaseUrl"] = base_url
    write_json(source_repo["config_path"], config)

    resolution_error(source_repo, "CANONICAL_BASE_URL_MISMATCH")
