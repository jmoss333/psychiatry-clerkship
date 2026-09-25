#!/usr/bin/env python3
"""Unit tests for the shipped_pages derivation (ADR-002).

The gates that matter most run against the real repository: --check in CI and the
hook, --check-build against the actual build output. These cover the properties
those gates rely on and that a synthetic root can exercise directly -- determinism,
the override rule, and that --check-build fails in BOTH directions.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))

import shipped_pages  # noqa: E402

SCRIPT = HERE / "shipped_pages.py"


def run(root, *args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--root", str(root), *args],
        capture_output=True,
        text=True,
    )


def synthetic_root(tmp):
    """A miniature repository with one shared page, one shared tool, one week."""
    root = Path(tmp)
    build = root / "13_Faculty_Resources" / "_automation" / "site_build"
    cotw = root / "08_Cases_and_Simulation" / "case-of-the-week"
    build.mkdir(parents=True)
    cotw.mkdir(parents=True)
    # The derivation imports site_extras from ITS OWN directory, not from --root, so a
    # synthetic root exercises the real extras list. Only the JSON producers vary here.
    # That includes TOOL_SHARED_DATA, whose slugs must ship or derive() refuses, so the
    # miniature manifest ships each of those tools too.
    declared = sorted(set(shipped_pages.site_extras.TOOL_SHARED_DATA) - {
        slug for _source, slug, _title in shipped_pages.site_extras.RESIDENT_PROTO_TOOLS
    })
    (build / "site_manifest.json").write_text(
        json.dumps(
            {
                "md": [["01_Core/t_mood.md", "t_mood.md", "Mood"]],
                "tools": [["04_Assessment/mse.html", "mse.html", "MSE"]]
                + [["tools/%s" % slug, slug, slug] for slug in declared],
            }
        ),
        encoding="utf-8",
    )
    (cotw / "cotw_registry.json").write_text(
        json.dumps(
            {
                "weeks": [
                    {
                        "date": "2026-08-31",
                        "topic": "catatonia",
                        "label": "Catatonia (Aug 31)",
                        "ms3_src": "2026-08-31_catatonia_MS3.md",
                        "res_src": "2026-08-31_catatonia_Resident.md",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    return root


class DeriveTests(unittest.TestCase):
    def test_real_repository_derivation_is_byte_identical_twice(self):
        first = shipped_pages.serialize(shipped_pages.derive(ROOT))
        second = shipped_pages.serialize(shipped_pages.derive(ROOT))
        self.assertEqual(first, second)

    def test_tracked_file_matches_the_derivation(self):
        tracked = (HERE / "shipped_pages.json").read_text(encoding="utf-8")
        self.assertEqual(tracked, shipped_pages.serialize(shipped_pages.derive(ROOT)))

    def test_pages_are_sorted_by_slug_and_unique(self):
        pages = shipped_pages.derive(ROOT)["pages"]
        slugs = [page["slug"] for page in pages]
        self.assertEqual(slugs, sorted(slugs))
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_resident_overrides_do_not_duplicate_a_shared_page(self):
        """welcome.md and cotw_index.md ship on both sites, once each.

        resident_section.py writes its own source over the inherited MS3 file; that is
        an override, not a second shipped page. Getting this wrong would put two rows
        under one slug and give the console a duplicate to attest twice.
        """
        pages = {page["slug"]: page for page in shipped_pages.derive(ROOT)["pages"]}
        for slug in ("welcome.md", "cotw_index.md"):
            self.assertEqual(pages[slug]["sites"], ["ms3", "res"], slug)
            self.assertEqual(pages[slug]["producer"], "site_manifest", slug)

    def test_a_resident_override_is_recorded_as_an_extra_source(self):
        """The override's own file is an attested input of the shared slug.

        attestation_hash.sources_for_slug takes the UNION of `source` and
        `extraSources`, so an edit to the resident file must drift the shared page's
        attestation. Dropping the override on the floor would leave the text the
        resident site actually serves outside every hash that claims to cover it.
        """
        pages = {page["slug"]: page for page in shipped_pages.derive(ROOT)["pages"]}
        self.assertEqual(
            pages["welcome.md"]["extraSources"],
            ["14_Tracks/Resident/resident_welcome.md"],
        )
        self.assertEqual(
            pages["cotw_index.md"]["extraSources"],
            ["08_Cases_and_Simulation/case-of-the-week/index_resident.md"],
        )
        self.assertEqual(
            sorted(
                slug
                for slug, page in pages.items()
                if "extraSources" in page and page["kind"] == "page"
            ),
            ["cotw_index.md", "welcome.md"],
        )

    def test_synthetic_root_derives_the_expected_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            pages = {p["slug"]: p for p in shipped_pages.derive(root)["pages"]}
            self.assertEqual(pages["t_mood.md"]["sites"], ["ms3", "res"])
            self.assertEqual(pages["mse.html"]["kind"], "tool")
            self.assertEqual(pages["cotw_20260831_catatonia_ms3.md"]["sites"], ["ms3"])
            self.assertEqual(
                pages["cotw_20260831_catatonia_res.md"]["title"],
                "Catatonia (Aug 31) — Resident",
            )
            # The resident-only extras come from the real site_extras.py.
            self.assertEqual(pages["rp-agitation.html"]["sites"], ["res"])
            self.assertEqual(pages["orientation-video.html"]["sites"], ["ms3"])

    def test_a_malformed_registry_raises_rather_than_skipping_a_week(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            registry = root / "08_Cases_and_Simulation" / "case-of-the-week" / "cotw_registry.json"
            registry.write_text(
                json.dumps({"weeks": [{"date": "2026-08-31", "topic": "x"}]}),
                encoding="utf-8",
            )
            with self.assertRaises(shipped_pages.ShippedPagesError):
                shipped_pages.derive(root)


# A data file a tool loads: fetch('x.json'), fetch("./x.json"), fetch('../x.json'), or a
# <track src="./x.vtt">. Anything built at runtime from variables is invisible here, which
# is why the reverse direction is asserted too.
FETCHED_DATA = re.compile(
    r"""(?:\bfetch\(\s*|<track\b[^>]*?\bsrc=)(['"`])(?:\.\.?/)?([\w.-]+(?:%s))\1"""
    % "|".join(re.escape(suffix) for suffix in shipped_pages.site_extras.TOOL_DATA_SUFFIXES)
)

# The registration as it stands, written out so that changing which files bind which tool
# is a visible, reviewed edit rather than a side effect. Each entry drifts that tool's
# attestation the first time it lands, which is the owner's decision to take.
EXPECTED_TOOL_DATA = {
    "communication-practice.html": ["communication_cases.json"],
    "diagnostic-reasoning.html": ["reasoning_cases.json", "reasoning_cases_resident.json"],
    "family-systems.html": ["family_systems_scenarios.json"],
    "one-patient-six-weeks.html": ["longitudinal_case.json"],
    "orientation-video.html": ["_prototypes/orientation-video/Inpatient_Psych_Orientation.vtt"],
    "review.html": [
        "07_Evidence_and_Reading/Landmark_Trials/quizzes.json",
        "communication_cases.json",
        "family_systems_scenarios.json",
        "reasoning_cases.json",
        "reasoning_cases_resident.json",
    ],
    "rp-agitation.html": ["_prototypes/agitation-trainer/rp-agitation.pack.json"],
    "rp-brief-psych.html": ["_prototypes/brief-psych/rp-brief-psych.pack.json"],
    "rp-canon-quiz.html": ["07_Evidence_and_Reading/Landmark_Trials/quizzes.json"],
    "sp-interview.html": ["_prototypes/sp-interview/sp-interview.pack.json"],
}


class ToolDataTests(unittest.TestCase):
    """The data a shipped tool renders is an attested input of that tool."""

    def setUp(self):
        self.pages = {page["slug"]: page for page in shipped_pages.derive(ROOT)["pages"]}
        self.data = shipped_pages.tool_data_sources(ROOT)

    def fetched(self, page):
        text = (ROOT / page["source"]).read_text(encoding="utf-8")
        return {match.group(2) for match in FETCHED_DATA.finditer(text)}

    def test_the_real_registration_is_exactly_the_reviewed_one(self):
        actual = {
            slug: page["extraSources"]
            for slug, page in self.pages.items()
            if page["kind"] == "tool" and "extraSources" in page
        }
        self.assertEqual(actual, EXPECTED_TOOL_DATA)

    def test_every_data_file_a_tool_fetches_is_registered_or_exempt(self):
        """The direction that matters: a tool loading data no attestation covers."""
        exempt = shipped_pages.site_extras.TOOL_DATA_NOT_BOUND
        for slug, page in self.pages.items():
            if page["kind"] != "tool":
                continue
            served = set(self.data.get(slug, {}).values())
            for name in sorted(self.fetched(page) - served - set(exempt)):
                self.fail(
                    "%s fetches %s, which is neither registered for it in site_extras.py "
                    "nor listed in TOOL_DATA_NOT_BOUND -- its attestation does not cover "
                    "what it renders" % (slug, name)
                )

    def test_every_registered_data_file_is_fetched_by_its_tool(self):
        """A registration nothing loads would drift a tool for edits it never shows."""
        for slug, sources in self.data.items():
            fetched = self.fetched(self.pages[slug])
            for source, served in sorted(sources.items()):
                self.assertIn(
                    served, fetched,
                    "%s is registered as %s's %s, but the tool never loads that name"
                    % (source, slug, served),
                )

    def test_every_exemption_is_still_fetched_by_some_tool(self):
        fetched = set()
        for page in self.pages.values():
            if page["kind"] == "tool":
                fetched |= self.fetched(page)
        for name in shipped_pages.site_extras.TOOL_DATA_NOT_BOUND:
            self.assertIn(name, fetched, "%s is exempt but no shipped tool fetches it" % name)

    def test_no_promotion_registry_is_ever_an_attested_input(self):
        """Content-ness would make Gate B's L3 fail the registry's own attestations."""
        registries = {"13_Faculty_Resources/reviewed.json", *shipped_pages.site_extras.TOOL_DATA_NOT_BOUND}
        for page in self.pages.values():
            inputs = {page["source"], *page.get("extraSources", [])}
            self.assertFalse(inputs & registries, page["slug"])

    def test_every_attested_input_exists_and_is_not_lfs_media(self):
        for page in self.pages.values():
            for path in page.get("extraSources", []):
                self.assertTrue((ROOT / path).is_file(), "%s: %s is missing" % (page["slug"], path))
                self.assertFalse(
                    path.endswith((".mp3", ".m4a", ".wav", ".mp4")),
                    "%s: %s is Git-LFS media; the console would hash its pointer"
                    % (page["slug"], path),
                )

    def test_code_and_media_riders_stay_out(self):
        inputs = {path for page in self.pages.values() for path in page.get("extraSources", [])}
        for rider in (
            "_prototypes/sp-interview/sp-interview.voice.js",
            "_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4",
            "_prototypes/orientation-video/poster.jpg",
        ):
            self.assertNotIn(rider, inputs)

    def test_a_data_tool_asset_binds_to_the_tool_sharing_its_stem(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            manifest = root / "13_Faculty_Resources/_automation/site_build/site_manifest.json"
            document = json.loads(manifest.read_text(encoding="utf-8"))
            document["toolAssets"] = [
                ["04_Assessment/mse.pack.json", "mse.pack.json"],
                ["04_Assessment/mse.voice.js", "mse.voice.js"],
            ]
            manifest.write_text(json.dumps(document), encoding="utf-8")
            pages = {p["slug"]: p for p in shipped_pages.derive(root)["pages"]}
            self.assertEqual(pages["mse.html"]["extraSources"], ["04_Assessment/mse.pack.json"])

    def test_a_data_tool_asset_with_no_tool_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            manifest = root / "13_Faculty_Resources/_automation/site_build/site_manifest.json"
            document = json.loads(manifest.read_text(encoding="utf-8"))
            document["toolAssets"] = [["x/orphan.pack.json", "orphan.pack.json"]]
            manifest.write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaises(shipped_pages.ShippedPagesError):
                shipped_pages.derive(root)

    def test_declared_resident_packs_agree_with_the_tree(self):
        """resident_section.py ships a sibling pack IFF it exists; the declaration must agree.

        Both directions: a pack on disk that is not declared ships with no hash covering
        it; a declared pack that is missing names an input nobody can hash.
        """
        extras = shipped_pages.site_extras
        on_disk = {
            slug
            for source, slug, _title in extras.RESIDENT_PROTO_TOOLS
            if (ROOT / extras.resident_tool_pack(source)).is_file()
        }
        self.assertEqual(on_disk, set(extras.RESIDENT_TOOLS_WITH_PACK))

    def test_the_derivation_reads_producers_not_the_tree(self):
        """A root holding only the producer files derives the same tool data.

        tests/hooks.test.mjs builds exactly such a fixture to prove a stale producer is
        caught; a derivation that probed for pack files would read them as deleted there.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            self.assertFalse((root / "_prototypes").exists())
            pages = {p["slug"]: p for p in shipped_pages.derive(root)["pages"]}
            self.assertEqual(
                pages["rp-agitation.html"]["extraSources"],
                ["_prototypes/agitation-trainer/rp-agitation.pack.json"],
            )

    def test_a_declared_pack_on_a_tool_that_is_not_resident_raises(self):
        extras = shipped_pages.site_extras
        with mock.patch.object(extras, "RESIDENT_TOOLS_WITH_PACK", ("sp-interview.html",)):
            with self.assertRaisesRegex(shipped_pages.ShippedPagesError, "sp-interview.html"):
                shipped_pages.tool_data_sources(ROOT)

    def test_declared_data_for_a_tool_nothing_ships_raises(self):
        """A renamed tool must fail loudly, not silently lose its data binding."""
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            manifest = root / "13_Faculty_Resources/_automation/site_build/site_manifest.json"
            document = json.loads(manifest.read_text(encoding="utf-8"))
            document["tools"] = [t for t in document["tools"] if t[1] != "review.html"]
            manifest.write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaisesRegex(shipped_pages.ShippedPagesError, "review.html"):
                shipped_pages.derive(root)


class ModeTests(unittest.TestCase):
    def test_write_then_check_round_trips(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            self.assertEqual(run(root, "--write").returncode, 0)
            self.assertEqual(run(root, "--check").returncode, 0)

    def test_check_fails_with_a_diff_and_the_write_command_when_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            run(root, "--write")
            manifest = (
                root / "13_Faculty_Resources" / "_automation" / "site_build" / "site_manifest.json"
            )
            document = json.loads(manifest.read_text(encoding="utf-8"))
            document["md"].append(["01_Core/t_psychosis.md", "t_psychosis.md", "Psychosis"])
            manifest.write_text(json.dumps(document), encoding="utf-8")

            result = run(root, "--check")
            self.assertEqual(result.returncode, 1)
            self.assertIn("STALE", result.stdout)
            self.assertIn("shipped_pages.py --write", result.stdout)
            self.assertIn("t_psychosis.md", result.stdout)

    def test_check_build_fails_in_both_directions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            run(root, "--write")
            out = root / "_build" / "ms3"
            (out / "content").mkdir(parents=True)
            (out / "tools").mkdir(parents=True)

            tracked = shipped_pages.slugs_for_site(shipped_pages.load_shipped_pages(root), "ms3")

            # Nothing built yet: every tracked slug is missing.
            missing = run(root, "--check-build", str(out), "--site", "ms3")
            self.assertEqual(missing.returncode, 1)
            self.assertIn("not built", missing.stdout)

            for slug in tracked:
                target = (out / "tools" / slug) if slug.endswith(".html") else (out / "content" / slug)
                target.write_text("x", encoding="utf-8")
            self.assertEqual(
                run(root, "--check-build", str(out), "--site", "ms3").returncode, 0
            )

            # A page the build publishes that nothing tracks -- the direction that means
            # "this ships and no one can attest it".
            (out / "content" / "surprise.md").write_text("x", encoding="utf-8")
            extra = run(root, "--check-build", str(out), "--site", "ms3")
            self.assertEqual(extra.returncode, 1)
            self.assertIn("surprise.md", extra.stdout)
            self.assertIn("must be attestable", extra.stdout)

    def test_check_build_ignores_tool_sidecars_and_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            run(root, "--write")
            out = root / "_build" / "ms3"
            (out / "content").mkdir(parents=True)
            (out / "tools" / "vendor").mkdir(parents=True)
            for slug in shipped_pages.slugs_for_site(
                shipped_pages.load_shipped_pages(root), "ms3"
            ):
                target = (out / "tools" / slug) if slug.endswith(".html") else (out / "content" / slug)
                target.write_text("x", encoding="utf-8")
            for noise in ("mse.pack.json", "poster.jpg", "quizzes.json"):
                (out / "tools" / noise).write_text("x", encoding="utf-8")
            (out / "tools" / "vendor" / "react.min.js").write_text("x", encoding="utf-8")
            self.assertEqual(
                run(root, "--check-build", str(out), "--site", "ms3").returncode, 0
            )

    def test_check_build_requires_a_site(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            run(root, "--write")
            out = root / "_build" / "ms3"
            (out / "content").mkdir(parents=True)
            self.assertNotEqual(run(root, "--check-build", str(out)).returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=1)
