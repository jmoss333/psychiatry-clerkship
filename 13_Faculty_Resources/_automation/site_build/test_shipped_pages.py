#!/usr/bin/env python3
"""Unit tests for the shipped_pages derivation (ADR-002).

The gates that matter most run against the real repository: --check in CI and the
hook, --check-build against the actual build output. These cover the properties
those gates rely on and that a synthetic root can exercise directly -- determinism,
the override rule, and that --check-build fails in BOTH directions.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

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
    (build / "site_manifest.json").write_text(
        json.dumps(
            {
                "md": [["01_Core/t_mood.md", "t_mood.md", "Mood"]],
                "tools": [["04_Assessment/mse.html", "mse.html", "MSE"]],
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
