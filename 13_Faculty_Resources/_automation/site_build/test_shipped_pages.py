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
import teaching_dependencies  # noqa: E402
sys.path.insert(0, str(HERE.parent))
from attestation_hash import digest_from_tree, project_effective_ledger  # noqa: E402

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
    # Real tool inputs, so dependency discovery exercises the same filesystem
    # contract as production (rather than silently skipping absent sources).
    for source in ["04_Assessment/mse.html"] + [
        row[0] for row in shipped_pages.site_extras.MS3_EXTRA_TOOLS
        + shipped_pages.site_extras.RESIDENT_PROTO_TOOLS
    ]:
        path = root / source
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("<html></html>", encoding="utf-8")
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

    def test_pack_only_edits_demote_reviewed_tools_without_rewriting_the_ledger(self):
        """The HTML can stay byte-identical while the teaching it loads changes."""
        document = shipped_pages.derive(ROOT)
        for slug, pack in (
            ("sp-interview.html", "_prototypes/sp-interview/sp-interview.pack.json"),
            ("rp-brief-psych.html", "_prototypes/brief-psych/rp-brief-psych.pack.json"),
            ("rp-agitation.html", "_prototypes/agitation-trainer/rp-agitation.pack.json"),
        ):
            with self.subTest(slug=slug), tempfile.TemporaryDirectory() as tmp:
                page = next(p for p in document["pages"] if p["slug"] == slug)
                self.assertIn(pack, page.get("extraSources", []))
                root = Path(tmp)
                for source in [page["source"]] + page.get("extraSources", []):
                    target = root / source
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(ROOT / source, target)
                digest = digest_from_tree(root, document, {}, slug)
                ledger = {slug: {"status": "reviewed", "by": "Test faculty",
                                 "at": "2026-09-24", "contentHash": digest}}
                before, _ = project_effective_ledger(root, ledger, document, {})
                self.assertEqual(before[slug]["status"], "reviewed")
                with (root / pack).open("a", encoding="utf-8") as handle:
                    handle.write("\n")
                after, report = project_effective_ledger(root, ledger, document, {})
                self.assertEqual(after[slug]["status"], "pending")
                self.assertIn(slug, report["stale"])
                self.assertEqual(ledger[slug]["status"], "reviewed")
                self.assertEqual(ledger[slug]["contentHash"], digest)

    def test_teaching_sources_follow_deployed_paths_and_both_audiences(self):
        pages = {p["slug"]: p for p in shipped_pages.derive(ROOT)["pages"]}
        # The prototype has a second quizzes.json, but the builder ships this one.
        self.assertEqual(pages["rp-canon-quiz.html"]["extraSources"],
                         ["07_Evidence_and_Reading/Landmark_Trials/quizzes.json"])
        self.assertEqual(pages["diagnostic-reasoning.html"]["extraSources"],
                         ["reasoning_cases.json", "reasoning_cases_resident.json"])
        self.assertNotIn("topic_meta.json", pages["review.html"]["extraSources"])

    def test_new_teaching_asset_is_discovered_without_a_page_allowlist(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            manifest_path = root / shipped_pages.MANIFEST_RELATIVE
            manifest = json.loads(manifest_path.read_text())
            manifest["toolAssets"] = [["04_Assessment/new-cases.json", "renamed.json"]]
            manifest_path.write_text(json.dumps(manifest))
            (root / "04_Assessment/new-cases.json").write_text('{"cases":[]}')
            (root / "04_Assessment/mse.html").write_text(
                '<script>fetch("./renamed.json?v=2#data");</script>')
            pages = {p["slug"]: p for p in shipped_pages.derive(root)["pages"]}
            self.assertEqual(pages["mse.html"]["extraSources"],
                             ["04_Assessment/new-cases.json"])

    def test_unmapped_teaching_asset_fails_instead_of_preserving_a_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            (root / "04_Assessment/mse.html").write_text(
                '<script>fetch("./forgotten.json")</script>')
            with self.assertRaisesRegex(shipped_pages.ShippedPagesError, "forgotten.json"):
                shipped_pages.derive(root)

    def test_missing_tool_source_cannot_silently_skip_dependency_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            (root / "04_Assessment/mse.html").unlink()
            with self.assertRaisesRegex(shipped_pages.ShippedPagesError, "mse.html"):
                shipped_pages.derive(root)

    def test_external_script_data_is_resolved_relative_to_the_document(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            manifest_path = root / shipped_pages.MANIFEST_RELATIVE
            manifest = json.loads(manifest_path.read_text())
            manifest["toolAssets"] = [
                ["04_Assessment/loader.mjs", "js/loader.mjs"],
                ["04_Assessment/cases.json", "cases.json"],
            ]
            manifest_path.write_text(json.dumps(manifest))
            (root / "04_Assessment/cases.json").write_text('{}')
            (root / "04_Assessment/loader.mjs").write_text(
                "const escaped = /'/g; fetch('./cases.json');")
            (root / "04_Assessment/mse.html").write_text(
                '<script src="./js/loader.mjs"></script>')
            pages = {p["slug"]: p for p in shipped_pages.derive(root)["pages"]}
            self.assertEqual(pages["mse.html"]["extraSources"],
                             ["04_Assessment/cases.json", "04_Assessment/loader.mjs"])

    def test_services_and_projected_review_metadata_do_not_become_teaching_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            (root / "04_Assessment/mse.html").write_text('''<script>
                fetch('/', {method:'POST'});
                fetch('https://example.test/service.json');
                fetch('//example.test/service.json'); fetch('../topic_meta.json');
                </script><script src="./vendor/react.min.js"></script>''')
            page = next(p for p in shipped_pages.derive(root)["pages"] if p["slug"] == "mse.html")
            self.assertNotIn("extraSources", page)

    def test_import_labels_and_download_names_are_not_module_or_teaching_loaders(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            (root / "04_Assessment/mse.html").write_text('''<script>
                var importSequence=0, message="An important point", filename="backup.json";
                button.getAttribute('data-curator-import');
                </script>''')
            page = next(p for p in shipped_pages.derive(root)["pages"] if p["slug"] == "mse.html")
            self.assertNotIn("extraSources", page)

    def test_unresolved_fetches_and_module_loaders_cannot_silently_drop_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            source = root / "04_Assessment/mse.html"
            for body in (
                '<script>const ext="json"; fetch("./cases." + ext)</script>',
                '<script>fetch(endpoint)</script>',
                '<script>fetch("./cases.json" + suffix)</script>',
                '<script>fetch("./cases.csv")</script>',
                '<script>fetch("./vendor/cases.json")</script>',
                '<script>const url="./cases.json"\n.replace("cases", "resident"); fetch(url)</script>',
                '<script>const url="./cases.json"; function load(url){return fetch(url)}; load(other)</script>',
                '<script type="module" src="./loader.js"></script>',
                '<script>import("./loader.js")</script>',
            ):
                with self.subTest(body=body):
                    source.write_text(body)
                    with self.assertRaises(shipped_pages.ShippedPagesError):
                        shipped_pages.derive(root)

    def test_missing_mapped_source_and_dynamic_template_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            source = root / "04_Assessment/mse.html"
            for script, error in (
                ("fetch('../reasoning_cases.json')", "missing teaching source"),
                ("fetch(`./${name}.json`)", "static"),
            ):
                with self.subTest(script=script):
                    source.write_text('<script>' + script + '</script>')
                    with self.assertRaisesRegex(shipped_pages.ShippedPagesError, error):
                        shipped_pages.derive(root)

    def test_quiz_audio_enrichment_cannot_hide_a_changed_teaching_answer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            quiz = root / "07_Evidence_and_Reading/Landmark_Trials/quizzes.json"
            quiz.parent.mkdir(parents=True)
            quiz.write_text(json.dumps({"decks": [{"title": "Test", "audio": "old.mp3",
                                                   "items": [{"answer": "old"}]}]}))
            source = root / "04_Assessment/mse.html"
            source.write_text('<script>fetch("./quizzes.json")</script>')
            out = root / "_build/ms3"
            (out / "tools").mkdir(parents=True)
            shutil.copyfile(source, out / "tools/mse.html")
            built = json.loads(quiz.read_text())
            built["decks"][0].update(audio="new.mp3", audioDur="1:00", oe="1")
            (out / "tools/quizzes.json").write_text(json.dumps(built))
            manifest = json.loads((root / shipped_pages.MANIFEST_RELATIVE).read_text())
            page = {"slug": "mse.html", "source": "04_Assessment/mse.html"}
            teaching_dependencies.discover(root, page, manifest, "ms3", out)
            built["decks"][0]["items"][0]["answer"] = "different"
            (out / "tools/quizzes.json").write_text(json.dumps(built))
            with self.assertRaisesRegex(teaching_dependencies.DependencyError, "differs from"):
                teaching_dependencies.discover(root, page, manifest, "ms3", out)

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
    def test_build_rejects_missing_wrong_and_untracked_teaching_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = synthetic_root(tmp)
            manifest_path = root / shipped_pages.MANIFEST_RELATIVE
            manifest = json.loads(manifest_path.read_text())
            manifest["toolAssets"] = [["04_Assessment/cases.json", "cases.json"]]
            manifest_path.write_text(json.dumps(manifest))
            (root / "04_Assessment/cases.json").write_text('{"cases":[]}')
            self.assertEqual(run(root, "--write").returncode, 0)
            out = root / "_build/ms3"
            (out / "tools").mkdir(parents=True)
            (out / "content").mkdir()
            for page in shipped_pages.load_shipped_pages(root)["pages"]:
                if "ms3" in page["sites"]:
                    folder = "tools" if page["kind"] == "tool" else "content"
                    (out / folder / page["slug"]).write_text("<html></html>")
            # A builder introduced a loader without changing the source page.
            (out / "tools/mse.html").write_text('<script>fetch("./cases.json")</script>')
            def check():
                return run(root, "--check-build", str(out), "--site", "ms3")
            missing = check()
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn("not built", missing.stdout)
            (out / "tools/cases.json").write_text('{"cases":[]}')
            untracked = check()
            self.assertNotEqual(untracked.returncode, 0)
            self.assertIn("untracked teaching", untracked.stdout)
            # Teach the source loader about this asset and regenerate the listing.
            shutil.copyfile(out / "tools/mse.html", root / "04_Assessment/mse.html")
            self.assertEqual(run(root, "--write").returncode, 0)
            self.assertEqual(check().returncode, 0)
            # The deployed filename is correct but an incorrect source was copied.
            (out / "tools/cases.json").write_text('{"cases":["wrong teaching"]}')
            mismatch = check()
            self.assertNotEqual(mismatch.returncode, 0)
            self.assertIn("differs from", mismatch.stdout)

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
