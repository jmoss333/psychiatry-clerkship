"""The one definition of a page's attested inputs, pinned against git itself.

Every expected hash in this file was produced by `git hash-object --stdin`, not by the
module under test, so the tests fail if the digest ever stops being reproducible with
a plain git command. That reproducibility is the point: an attestation that nobody can
re-derive by hand is not evidence of anything.

Fixture tree (mirrors the shapes the real repo has): two sources, a one-source slug
that also owns a topic_meta record, and a two-source slug (the resident-override shape
welcome.md and cotw_index.md have) that owns none.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from attestation_hash import (  # noqa: E402
    LEDGER_ONLY_LEGACY,
    PENDING_SENTINEL,
    STALE_REASON,
    AttestationHashError,
    blob_sha,
    canonical_record,
    canonical_topic_meta_record,
    digest,
    digest_from_tree,
    ledger_hash_report,
    manifest_for_slug,
    project_effective_ledger,
    project_topic_meta_faculty_review,
    registry_row_from_tree,
    sources_for_slug,
)


# printf 'alpha\n' | git hash-object --stdin
ALPHA_SHA = "4a58007052a65fbc2fc3f910f2855f45a4058e74"
# printf 'beta\n' | git hash-object --stdin
BETA_SHA = "65b2df87f7df3aeedef04be96703e55ac19c2cfb"
# printf '%s' '{"tldr":"t — é"}' | git hash-object --stdin
TOPIC_RECORD_SHA = "e51494b9a628601e078505913ea6ff67d2039bad"

X_MANIFEST = f"a.md {ALPHA_SHA}\ntopic_meta {TOPIC_RECORD_SHA}\n"
W_MANIFEST = f"a.md {ALPHA_SHA}\nb.md {BETA_SHA}\n"
# printf '%s' "$manifest" | git hash-object --stdin
X_DIGEST = "db984f185269b4c643c8248b46df67ca265ff0b2"
W_DIGEST = "47a375e31a4046e83f91ca65c3055d0c8edcf83b"

LEGACY_SLUG = "learning-path.html"


def shipped_document():
    """A shipped_pages.json document: one one-source slug, one two-source slug."""
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


def topic_meta_document():
    return {
        "x.md": {
            "tldr": "t — é",
            "facultyReview": {
                "status": "reviewed",
                "reviewer": "Joshua Moss, MD",
                "lastReviewed": "2026-07-01",
            },
        }
    }


def reviewed_entry(content_hash):
    entry = {
        "status": "reviewed",
        "risk": {"kind": "clinical", "level": "moderate"},
        "at": "2026-07-01",
        "by": "Joshua Moss, MD",
    }
    if content_hash is not None:
        entry["contentHash"] = content_hash
    return entry


class FixtureTreeTestCase(unittest.TestCase):
    """A tmp working tree with a.md and b.md, plus the two registries as data."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        (self.root / "a.md").write_bytes(b"alpha\n")
        (self.root / "b.md").write_bytes(b"beta\n")
        self.shipped = shipped_document()
        self.topic_meta = topic_meta_document()


class BlobShaTest(unittest.TestCase):
    def test_matches_git_hash_object(self):
        self.assertEqual(blob_sha(b"alpha\n"), ALPHA_SHA)
        self.assertEqual(blob_sha(b"beta\n"), BETA_SHA)


class CanonicalTopicMetaRecordTest(unittest.TestCase):
    def test_drops_faculty_review_sorts_keys_and_emits_no_whitespace(self):
        record = {
            "tldr": "t — é",
            "hy": True,
            "facultyReview": {"status": "reviewed", "lastReviewed": "2026-07-01"},
            "points": ["second", "first"],
        }
        self.assertEqual(
            canonical_topic_meta_record(record),
            '{"hy":true,"points":["second","first"],"tldr":"t — é"}'.encode("utf-8"),
        )

    def test_non_ascii_stays_raw_utf8(self):
        canonical = canonical_topic_meta_record(topic_meta_document()["x.md"])
        self.assertIn("é".encode("utf-8"), canonical)
        self.assertIn("—".encode("utf-8"), canonical)
        self.assertNotIn(b"\\u", canonical)
        self.assertEqual(blob_sha(canonical), TOPIC_RECORD_SHA)


class SourcesForSlugTest(unittest.TestCase):
    def setUp(self):
        self.shipped = shipped_document()

    def test_single_source(self):
        self.assertEqual(sources_for_slug(self.shipped, "x.md"), ["a.md"])

    def test_extra_sources_are_included(self):
        self.assertEqual(sources_for_slug(self.shipped, "w.md"), ["a.md", "b.md"])

    def test_unshipped_slug_has_no_sources(self):
        self.assertEqual(sources_for_slug(self.shipped, "nope.md"), [])


class RealShippedPagesSourcesTest(unittest.TestCase):
    """The tracked listing really does carry both files of a resident override.

    The fixture above proves sources_for_slug READS extraSources; nothing there proves
    the real shipped_pages.json WRITES them. Without that, welcome.md and cotw_index.md
    would hash only their MS3 source and the resident text every resident actually
    reads would sit outside the attestation that claims to cover the page.
    """

    SHIPPED = (
        ROOT
        / "13_Faculty_Resources"
        / "_automation"
        / "site_build"
        / "shipped_pages.json"
    )

    def setUp(self):
        self.document = json.loads(self.SHIPPED.read_text(encoding="utf-8"))

    def test_cotw_index_hashes_both_audience_sources(self):
        self.assertEqual(
            sources_for_slug(self.document, "cotw_index.md"),
            [
                "08_Cases_and_Simulation/case-of-the-week/index_ms3.md",
                "08_Cases_and_Simulation/case-of-the-week/index_resident.md",
            ],
        )

    def test_welcome_hashes_both_audience_sources(self):
        self.assertEqual(
            sources_for_slug(self.document, "welcome.md"),
            [
                "13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md",
                "14_Tracks/Resident/resident_welcome.md",
            ],
        )

    def test_no_other_shipped_page_carries_extra_sources(self):
        self.assertEqual(
            sorted(
                page["slug"]
                for page in self.document["pages"]
                if "extraSources" in page
            ),
            ["cotw_index.md", "welcome.md"],
        )


class ManifestForSlugTest(unittest.TestCase):
    def test_one_source_plus_topic_meta_record(self):
        manifest = manifest_for_slug("x.md", {"a.md": b"alpha\n"}, topic_meta_document()["x.md"])
        self.assertEqual(manifest, X_MANIFEST)

    def test_two_sources_without_a_record_are_sorted_by_path(self):
        manifest = manifest_for_slug("w.md", {"b.md": b"beta\n", "a.md": b"alpha\n"}, None)
        self.assertEqual(manifest, W_MANIFEST)

    def test_a_slug_with_no_sources_is_refused_rather_than_digested_over_nothing(self):
        with self.assertRaises(AttestationHashError) as caught:
            manifest_for_slug("nope.md", {}, None)
        self.assertIn("nope.md", str(caught.exception))

    def test_a_record_that_is_not_a_mapping_is_no_record_rather_than_a_crash(self):
        # A value that is not a mapping is not a record: there is nothing to
        # canonicalise, so the manifest carries no topic_meta line and the digest is
        # exactly the no-record one. It is NOT reported as a malformed contentHash --
        # the ledger row is fine and topic_meta.json is the thing at fault, which
        # topic_meta.schema.json (every value must be an object) already fails.
        sources = {"a.md": b"alpha\n", "b.md": b"beta\n"}
        for record in ("not-a-dict", 7, ["x.md"], b"bytes"):
            with self.subTest(record=record):
                self.assertEqual(manifest_for_slug("w.md", sources, record), W_MANIFEST)
                self.assertEqual(digest("w.md", sources, record), W_DIGEST)


class DigestTest(FixtureTreeTestCase):
    def from_tree(self, slug):
        return digest_from_tree(self.root, self.shipped, self.topic_meta, slug)

    def test_digest_is_the_blob_sha_of_the_manifest(self):
        record = self.topic_meta["x.md"]
        computed = digest("x.md", {"a.md": b"alpha\n"}, record)
        self.assertEqual(computed, blob_sha(X_MANIFEST.encode("utf-8")))
        self.assertEqual(computed, X_DIGEST)

    def test_digest_from_tree_reads_working_tree_bytes(self):
        self.assertEqual(self.from_tree("x.md"), X_DIGEST)
        self.assertEqual(self.from_tree("w.md"), W_DIGEST)

    def test_digest_from_tree_raises_on_a_missing_source(self):
        (self.root / "b.md").unlink()
        with self.assertRaises(FileNotFoundError):
            self.from_tree("w.md")


class LedgerHashReportTest(FixtureTreeTestCase):
    def report(self, ledger):
        return ledger_hash_report(self.root, ledger, self.shipped, self.topic_meta)

    def test_a_correct_hash_is_bound(self):
        report = self.report({"x.md": reviewed_entry(X_DIGEST)})
        self.assertEqual(report["bound"], {"x.md": X_DIGEST})
        self.assertEqual(report["stale"], {})

    def test_editing_a_source_makes_the_entry_stale(self):
        (self.root / "a.md").write_bytes(b"alpha, revised\n")
        report = self.report({"x.md": reviewed_entry(X_DIGEST)})
        self.assertEqual(report["bound"], {})
        drift = report["stale"]["x.md"]
        self.assertEqual(drift["stored"], X_DIGEST)
        self.assertEqual(drift["at"], "2026-07-01")
        self.assertNotEqual(drift["actual"], X_DIGEST)
        self.assertEqual(
            drift["actual"],
            digest_from_tree(self.root, self.shipped, self.topic_meta, "x.md"),
        )
        self.assertEqual(blob_sha(drift["manifest"].encode("utf-8")), drift["actual"])

    def test_editing_the_topic_meta_record_makes_the_entry_stale(self):
        self.topic_meta["x.md"]["tldr"] = "t — é, revised"
        report = self.report({"x.md": reviewed_entry(X_DIGEST)})
        self.assertEqual(report["bound"], {})
        self.assertIn("x.md", report["stale"])

    def test_editing_only_faculty_review_leaves_the_entry_bound(self):
        self.topic_meta["x.md"]["facultyReview"] = {
            "status": "pending",
            "reviewer": "Someone Else, MD",
            "lastReviewed": "2026-09-18",
        }
        report = self.report({"x.md": reviewed_entry(X_DIGEST)})
        self.assertEqual(report["bound"], {"x.md": X_DIGEST})

    def test_reviewed_without_a_hash_is_unbound(self):
        report = self.report({"x.md": reviewed_entry(None)})
        self.assertEqual(report["unbound"], ["x.md"])
        self.assertEqual(report["bound"], {})

    def test_a_non_hex_hash_is_malformed(self):
        report = self.report({"x.md": reviewed_entry("zz")})
        self.assertEqual(report["malformed"], ["x.md"])

    def test_a_sha256_length_hash_is_malformed(self):
        report = self.report({"x.md": reviewed_entry("d" * 64)})
        self.assertEqual(report["malformed"], ["x.md"])

    def test_pending_entries_are_ignored(self):
        ledger = {
            "x.md": {"status": "pending", "at": "2026-07-01", "by": PENDING_SENTINEL},
            "w.md": {"status": "pending", "at": "2026-07-01", "by": PENDING_SENTINEL},
        }
        report = self.report(ledger)
        self.assertEqual(report["bound"], {})
        self.assertEqual(report["unbound"], [])
        self.assertEqual(report["unshipped_unlisted"], [])

    def test_an_empty_hash_is_malformed_not_unbound(self):
        # The key is present, so something wrote a hash and got it wrong; the backfill binds
        # unbound rows and would silently skip this one if it classified as unbound.
        report = self.report({"x.md": reviewed_entry("")})
        self.assertEqual(report["malformed"], ["x.md"])
        self.assertEqual(report["unbound"], [])

    def test_a_non_dict_topic_meta_record_reports_rather_than_crashing(self):
        # The report walks the LEDGER, but the digest also reads topic_meta.json, and a
        # value there that is not an object used to reach record.items() and raise. One
        # bad record must not abort the whole report -- the same posture the non-dict
        # ledger row below already has.
        self.topic_meta = {"x.md": "not a record", "w.md": ["nor is this"]}
        report = self.report(
            {"x.md": reviewed_entry(X_DIGEST), "w.md": reviewed_entry(W_DIGEST)}
        )
        # x.md's stored hash covers a real record, so losing the record is drift;
        # w.md never had one, so it stays bound.
        self.assertEqual(report["bound"], {"w.md": W_DIGEST})
        self.assertIn("x.md", report["stale"])
        self.assertEqual(report["malformed"], [])

    def test_a_non_dict_entry_is_malformed_rather_than_a_crash(self):
        report = self.report({"x.md": "reviewed", "w.md": None})
        self.assertEqual(report["malformed"], ["w.md", "x.md"])
        self.assertEqual(report["bound"], {})

    def test_a_named_ledger_only_slug_is_legacy(self):
        self.assertIn(LEGACY_SLUG, LEDGER_ONLY_LEGACY)
        report = self.report({LEGACY_SLUG: reviewed_entry(None)})
        self.assertEqual(report["legacy"], [LEGACY_SLUG])
        self.assertEqual(report["unbound"], [])

    def test_an_unlisted_unshipped_slug_is_reported(self):
        report = self.report({"ghost.md": reviewed_entry(X_DIGEST)})
        self.assertEqual(report["unshipped_unlisted"], ["ghost.md"])
        self.assertEqual(report["bound"], {})

    def test_a_deleted_source_is_unresolvable(self):
        (self.root / "b.md").unlink()
        report = self.report({"w.md": reviewed_entry(W_DIGEST)})
        self.assertEqual(report["unresolvable"], {"w.md": ["b.md"]})
        self.assertEqual(report["bound"], {})


class LedgerOnlyLegacyTest(unittest.TestCase):
    """The exemption list is pinned so it can only shrink.

    `LEDGER_ONLY_LEGACY` is the one place a reviewed row escapes the requirement to be
    bound to shipped text, so a slug added to it is a slug that stops being checked. The
    module's comment says MAY ONLY SHRINK; this is what makes that enforceable — growing it
    fails here, in the same diff that grew it, and each entry must carry a reason a human
    can read rather than an empty placeholder.
    """

    def test_the_exempt_set_is_exactly_these_three(self):
        self.assertEqual(
            sorted(LEDGER_ONLY_LEGACY),
            ["learning-path.html", "qbank-attest.html", "review-attest.html"],
        )

    def test_every_exemption_carries_a_reason(self):
        for slug, reason in LEDGER_ONLY_LEGACY.items():
            self.assertIsInstance(reason, str, slug)
            self.assertTrue(reason.strip(), "%s: empty reason" % slug)


class ProjectEffectiveLedgerTest(FixtureTreeTestCase):
    def project(self, ledger):
        return project_effective_ledger(self.root, ledger, self.shipped, self.topic_meta)

    def test_a_stale_entry_renders_pending_without_mutating_the_input(self):
        # Only w.md lists b.md, so this drifts w.md and leaves x.md bound.
        (self.root / "b.md").write_bytes(b"beta, revised\n")
        ledger = {"x.md": reviewed_entry(X_DIGEST), "w.md": reviewed_entry(W_DIGEST)}
        before = json.dumps(ledger, sort_keys=True)

        effective, report = self.project(ledger)

        self.assertEqual(json.dumps(ledger, sort_keys=True), before)
        self.assertEqual(
            effective["w.md"],
            {
                "status": "pending",
                "risk": {"kind": "clinical", "level": "moderate"},
                "at": "2026-07-01",
                "by": PENDING_SENTINEL,
                "contentHash": W_DIGEST,
                "reason": STALE_REASON.format(at="2026-07-01"),
            },
        )
        self.assertIn("2026-07-01", effective["w.md"]["reason"])
        self.assertEqual(effective["x.md"], ledger["x.md"])
        self.assertEqual(sorted(report["stale"]), ["w.md"])
        self.assertEqual(report["bound"], {"x.md": X_DIGEST})

    def test_a_bound_ledger_passes_through_unchanged(self):
        ledger = {"x.md": reviewed_entry(X_DIGEST)}
        effective, report = self.project(ledger)
        self.assertEqual(effective, ledger)
        self.assertEqual(report["bound"], {"x.md": X_DIGEST})

    def assert_refuses(self, ledger, slug, class_word):
        with self.assertRaises(AttestationHashError) as caught:
            self.project(ledger)
        message = str(caught.exception)
        self.assertIn(slug, message)
        self.assertIn(class_word, message)

    def test_an_unbound_entry_is_refused(self):
        self.assert_refuses({"x.md": reviewed_entry(None)}, "x.md", "unbound")

    def test_a_malformed_hash_is_refused(self):
        self.assert_refuses({"x.md": reviewed_entry("d" * 64)}, "x.md", "malformed")

    def test_an_unresolvable_source_is_refused(self):
        (self.root / "b.md").unlink()
        self.assert_refuses({"w.md": reviewed_entry(W_DIGEST)}, "w.md", "unresolvable")

    def test_an_unlisted_unshipped_slug_is_refused(self):
        self.assert_refuses({"ghost.md": reviewed_entry(X_DIGEST)}, "ghost.md", "unshipped")


# printf 'gamma\n' | git hash-object --stdin
GAMMA_SHA = "af17f6cc87e4d5e4adec0018cbb73d3e2bd008c8"
# printf '%s' '{"date":"2026-08-31","tldr":"t — é","topic":"cat"}' | git hash-object --stdin
CAT_ROW_SHA = "0c69f8613c830d50018a4527400de69edda2af76"
C_MANIFEST = f"c.md {GAMMA_SHA}\ncotw_registry {CAT_ROW_SHA}\n"
# printf '%s' "$C_MANIFEST" | git hash-object --stdin
C_DIGEST = "7a8497e3482dfcd61ef5391ca7aefcf5c9e6c4bc"

REGISTRY = "cases/cotw_registry.json"
CAT_ROW = {"date": "2026-08-31", "topic": "cat", "tldr": "t — é"}
DOG_ROW = {"date": "2026-09-07", "topic": "dog", "tldr": "other"}


class RegistryRowTest(unittest.TestCase):
    """A page whose metadata is DERIVED from one row of a shared registry.

    Case-of-the-Week pages have no topic_meta.json record; the build derives one from
    their row of cotw_registry.json, and the row's `tldr` is the sentence learners read
    as the page's lead. Hashing only the case's markdown left that sentence unbound, and
    hashing the whole registry would drift every case each time a week is added. So the
    page binds ITS OWN row, found by the `registryRow` spec shipped_pages.json carries.
    """

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        (self.root / "c.md").write_bytes(b"gamma\n")
        (self.root / "cases").mkdir()
        self.write_registry([CAT_ROW, DOG_ROW])
        self.shipped = {
            "version": 1,
            "pages": [
                {
                    "kind": "page",
                    "slug": "c.md",
                    "source": "c.md",
                    "sites": ["ms3"],
                    "registryRow": {
                        "path": REGISTRY,
                        "list": "weeks",
                        "match": {"date": "2026-08-31", "topic": "cat"},
                    },
                }
            ],
        }

    def write_registry(self, weeks, indent=2):
        (self.root / REGISTRY).write_text(
            json.dumps({"weeks": weeks}, indent=indent, ensure_ascii=False), encoding="utf-8"
        )

    def digest(self):
        return digest_from_tree(self.root, self.shipped, {}, "c.md")

    def test_the_row_line_is_named_for_its_registry_and_pinned_by_git(self):
        self.assertEqual(
            manifest_for_slug("c.md", {"c.md": b"gamma\n"}, None, ("cotw_registry", CAT_ROW)),
            C_MANIFEST,
        )
        self.assertEqual(self.digest(), C_DIGEST)

    def test_the_row_line_sits_between_the_sources_and_topic_meta(self):
        manifest = manifest_for_slug(
            "c.md", {"c.md": b"gamma\n"}, {"tldr": "t — é"}, ("cotw_registry", CAT_ROW)
        )
        self.assertEqual(
            [line.split(" ")[0] for line in manifest.splitlines()],
            ["c.md", "cotw_registry", "topic_meta"],
        )

    def test_the_row_canonicalises_like_a_topic_meta_record(self):
        self.assertEqual(canonical_record(CAT_ROW), canonical_topic_meta_record(CAT_ROW))
        self.write_registry([DOG_ROW, dict(reversed(list(CAT_ROW.items())))], indent=None)
        self.assertEqual(self.digest(), C_DIGEST, "formatting and row order are not content")

    def test_adding_a_week_does_not_drift_an_existing_case(self):
        self.write_registry([{"date": "2026-09-14", "topic": "new", "tldr": "x"}, CAT_ROW, DOG_ROW])
        self.assertEqual(self.digest(), C_DIGEST)

    def test_editing_another_row_does_not_drift_this_case(self):
        self.write_registry([CAT_ROW, dict(DOG_ROW, tldr="rewritten")])
        self.assertEqual(self.digest(), C_DIGEST)

    def test_editing_this_row_drifts_this_case(self):
        self.write_registry([dict(CAT_ROW, tldr="hold nothing"), DOG_ROW])
        self.assertNotEqual(self.digest(), C_DIGEST)

    def test_a_page_with_no_spec_has_no_row(self):
        self.shipped["pages"][0].pop("registryRow")
        self.assertIsNone(registry_row_from_tree(self.root, self.shipped, "c.md"))
        self.assertEqual(self.digest(), blob_sha(f"c.md {GAMMA_SHA}\n".encode("utf-8")))

    def test_a_missing_registry_is_unresolvable_never_a_shorter_digest(self):
        (self.root / REGISTRY).unlink()
        with self.assertRaises(FileNotFoundError):
            self.digest()
        report = ledger_hash_report(
            self.root, {"c.md": reviewed_entry(C_DIGEST)}, self.shipped, {}
        )
        self.assertEqual(report["unresolvable"], {"c.md": [REGISTRY]})

    def test_no_matching_row_or_two_is_unresolvable(self):
        for weeks in ([DOG_ROW], [CAT_ROW, dict(CAT_ROW, tldr="twin")]):
            with self.subTest(rows=len(weeks)):
                self.write_registry(weeks)
                with self.assertRaises(AttestationHashError):
                    self.digest()
                report = ledger_hash_report(
                    self.root, {"c.md": reviewed_entry(C_DIGEST)}, self.shipped, {}
                )
                self.assertEqual(list(report["unresolvable"]), ["c.md"])
                self.assertEqual(report["bound"], {})

    def test_the_ledger_report_binds_and_drifts_on_the_row(self):
        ledger = {"c.md": reviewed_entry(C_DIGEST)}
        self.assertEqual(ledger_hash_report(self.root, ledger, self.shipped, {})["bound"],
                         {"c.md": C_DIGEST})
        self.write_registry([dict(CAT_ROW, tldr="hold nothing"), DOG_ROW])
        stale = ledger_hash_report(self.root, ledger, self.shipped, {})["stale"]
        self.assertEqual(list(stale), ["c.md"])
        self.assertIn("cotw_registry ", stale["c.md"]["manifest"])


class RealRegistryRowsTest(unittest.TestCase):
    """Every Case-of-the-Week page in the real listing resolves to exactly one row."""

    def test_every_cotw_page_binds_exactly_one_row_of_the_registry(self):
        shipped = json.loads(
            (ROOT / "13_Faculty_Resources/_automation/site_build/shipped_pages.json")
            .read_text(encoding="utf-8")
        )
        cotw = [page for page in shipped["pages"] if page["producer"] == "cotw_registry"]
        self.assertGreater(len(cotw), 0)
        for page in cotw:
            label, row = registry_row_from_tree(ROOT, shipped, page["slug"])
            self.assertEqual(label, "cotw_registry", page["slug"])
            self.assertTrue(page["source"].endswith(row["ms3_src"] if page["slug"].endswith(
                "_ms3.md") else row["res_src"]), page["slug"])
        others = [page for page in shipped["pages"]
                  if page["producer"] != "cotw_registry" and "registryRow" in page]
        self.assertEqual(others, [])


class ProjectTopicMetaFacultyReviewTest(unittest.TestCase):
    def test_a_stale_slug_is_demoted_and_keeps_its_review_history(self):
        topic_meta = topic_meta_document()
        self.assertEqual(project_topic_meta_faculty_review(topic_meta, ["x.md"]), 1)
        self.assertEqual(
            topic_meta["x.md"]["facultyReview"],
            {
                "status": "pending",
                "reviewer": "Joshua Moss, MD",
                "lastReviewed": "2026-07-01",
            },
        )

    def test_a_slug_with_no_faculty_review_block_is_left_alone(self):
        topic_meta = {"w.md": {"tldr": "no governance block here"}}
        self.assertEqual(project_topic_meta_faculty_review(topic_meta, ["w.md", "absent.md"]), 0)
        self.assertEqual(topic_meta, {"w.md": {"tldr": "no governance block here"}})


if __name__ == "__main__":
    unittest.main()
