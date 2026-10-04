#!/usr/bin/env python3
"""Behavior tests for check_label_drift.py, offline: every network call is a fake.

Each verdict is proved by producing it from a synthetic label pair, and the committed pins
are held to the committed receipt (the step CI runs is `--offline`, pinned here too).
"""

import contextlib
import copy
import datetime
import io
import hashlib
import subprocess
import json
import os
import sys
import tempfile
import unittest
from unittest import mock
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import check_label_drift as drift  # noqa: E402
sys.path.insert(0, str(HERE.parents[2] / "bin"))
from _git_env import scrub_inherited_git_env
scrub_inherited_git_env()
import what_needs_josh as owner

SET_ID = "11111111-2222-3333-4444-555555555555"
DOSING = "Titrate to response. Dosages above the usual range may be appropriate for some patients."


def section(code, title, body, children="", excerpt=""):
    return (
        '<component><section><code code="%s" displayName="%s"/>%s%s<text><paragraph>%s</paragraph></text>%s</section></component>'
        % (code, (title or "SECTION").upper(), "<title>%s</title>" % title if title is not None else "",
           "<excerpt><highlight><text>%s</text></highlight></excerpt>" % excerpt if excerpt else "",
           body, children))


def spl(version, date, dosing=DOSING, warnings="Watch for sedation.", medguide="Read this guide.",
        package="Carton 30 films", boxed=None):
    sections = [
        section("34066-1", "WARNING: RISK", boxed) if boxed else "",
        section("34067-9", "1 INDICATIONS AND USAGE", "Indicated for opioid dependence."),
        section("34068-7", "2 DOSAGE AND ADMINISTRATION", "",
                children=section("42229-5", "2.4 Maintenance", dosing,
                                 children=section("42229-5", None, "An untitled block folds in."))),
        section("43685-7", "5 WARNINGS AND PRECAUTIONS", "",
                children=section("42229-5", "5.1 Sedation", warnings), excerpt="Highlights text."),
        section("43682-4", "12.3 Pharmacokinetics", "",
                children=section("42229-5", "Absorption", "Absorbed sublingually.")),
        section("42231-1", "MEDICATION GUIDE", medguide),
        section("48780-1", None, "PRODUCT DATA"),
        section("51945-4", "PACKAGE LABEL", package),
    ]
    return ('<?xml version="1.0"?><document xmlns="urn:hl7-org:v3"><setId root="%s"/>'
            '<versionNumber value="%d"/><effectiveTime value="%s"/><component><structuredBody>%s'
            '</structuredBody></component></document>'
            % (SET_ID, version, date.replace("-", ""), "".join(sections))).encode("utf-8")


def receipt(date="2026-01-01"):
    return {"schemaVersion": 1, "agents": {"testdrug": {"reference": {"setId": SET_ID, "effectiveDate": date}}}}


def label_page(versions):
    """A DailyMed label page whose archive table lists the given versions (archive id 1000+v)."""
    rows = "".join(
        '<tr><td>Jan 1, 2026</td><td>\n %d %s\n</td><td><a download class="download-link" '
        'href="/dailymed/getArchivalFile.cfm?archive_id=%d">download</a></td></tr>'
        % (v, "(current)" if v == max(versions) else "", 1000 + v) for v in versions)
    return ('<html><a href="/dailymed/getArchivalFile.cfm?archive_id=1">outside the modal</a>'
            '<div id="modal-label-archives"><table class="modal"><tbody><tr><th>Published Date</th>'
            '<th>Version</th><th>Files</th></tr>%s</tbody></table></div></html>' % rows).encode()


def zipped(xml):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as bundle:
        bundle.writestr("image.jpg", b"not xml")
        bundle.writestr("label.xml", xml)
    return buffer.getvalue()


class FakeDailyMed:
    """Serves one current SPL, its version history and (optionally) archived versions."""

    def __init__(self, xml, fail=False, archive=None):
        self.xml, self.fail, self.calls = xml, fail, []
        self.archive = archive or {}

    def __call__(self, url):
        self.calls.append(url)
        if self.fail:
            raise drift.CouldNotCheck("network down")
        if "drugInfo.cfm" in url:
            return label_page(sorted(self.archive) or [1])
        if "getArchivalFile.cfm" in url:
            version = int(url.rsplit("=", 1)[1]) - 1000
            return zipped(self.archive[version]) if version in self.archive else None
        if url.endswith("/history.json"):
            version = drift.parse_spl(self.xml)["version"]
            # the shape DailyMed serves (2026-10-03): newest first, versions as integers
            rows = [{"spl_version": v, "published_date": "x"} for v in range(version, 0, -1)]
            return json.dumps({"data": {"spl": {"setid": SET_ID}, "history": rows}}).encode()
        return self.xml


class Workspace:
    def __init__(self, test, receipt_doc, pins_doc=None):
        self.dir = tempfile.TemporaryDirectory()
        test.addCleanup(self.dir.cleanup)
        root = Path(self.dir.name)
        self.receipt, self.pins = root / "receipt.json", root / "pins.json"
        self.receipt.write_text(json.dumps(receipt_doc))
        if pins_doc is not None:
            self.pins.write_text(json.dumps(pins_doc))

    def run(self, *argv, get):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = drift.main(list(argv) + ["--receipt", str(self.receipt), "--pins", str(self.pins),
                                            "--pause", "0"], get=get)
        return code, out.getvalue() + err.getvalue()

    def pins_doc(self):
        return json.loads(self.pins.read_text())


class ParseTest(unittest.TestCase):
    def test_sections_are_keyed_by_number_and_unkeyed_children_fold_in(self):
        parsed = drift.parse_spl(spl(3, "2026-01-01", boxed="Serious risk."))
        self.assertEqual(parsed["version"], 3)
        self.assertEqual(parsed["effectiveDate"], "2026-01-01")
        keys = set(parsed["sections"])
        self.assertTrue({"BW", "1", "2", "2.4", "5", "5.1", "12.3", "MEDICATION GUIDE"} <= keys, keys)
        self.assertIn("An untitled block folds in.", parsed["sections"]["2.4"]["text"])
        self.assertIn("Absorbed sublingually.", parsed["sections"]["12.3"]["text"])
        self.assertNotIn(DOSING, parsed["sections"]["2"]["text"])  # a keyed child reports alone

    def test_highlights_product_data_and_package_panel_are_not_hashed(self):
        parsed = drift.parse_spl(spl(3, "2026-01-01"))
        text = " ".join(s["text"] for s in parsed["sections"].values())
        for absent in ("Highlights text.", "PRODUCT DATA", "Carton 30 films"):
            self.assertNotIn(absent, text)

    def test_a_label_without_a_header_could_not_be_checked(self):
        with self.assertRaises(drift.CouldNotCheck):
            drift.parse_spl(b'<document xmlns="urn:hl7-org:v3"/>')
        with self.assertRaises(drift.CouldNotCheck):
            drift.parse_spl(b"not xml")


class CompareTest(unittest.TestCase):
    def pin(self, quotes=()):
        entry, problems = drift.pin_entry(drift.parse_spl(spl(3, "2026-01-01")), list(quotes), "2026-10-03")
        self.assertEqual(problems, [])
        return entry

    def test_unchanged_label_needs_nothing(self):
        result = drift.compare(self.pin(), drift.parse_spl(spl(4, "2026-02-01")))
        self.assertEqual((result["changed"], result["added"], result["removed"]), ([], [], []))
        self.assertFalse(result["needsReview"])

    def test_a_changed_dosing_subsection_flags_the_dosing_field(self):
        new = drift.parse_spl(spl(4, "2026-02-01", dosing=DOSING + " Higher doses may be needed."))
        result = drift.compare(self.pin(), new)
        self.assertEqual(result["changed"], ["2.4"])
        self.assertEqual(result["fields"], ["dosing"])
        self.assertTrue(result["needsReview"])

    def test_fields_are_limited_to_those_the_card_carries(self):
        new = drift.parse_spl(spl(4, "2026-02-01", warnings="Watch for sedation and falls."))
        self.assertEqual(drift.compare(self.pin(), new)["fields"], ["adverseEffects", "flags", "monitoring"])
        card = {"flags": [], "dosing": {}}
        self.assertEqual(drift.compare(self.pin(), new, card)["fields"], ["flags"])

    def test_a_medication_guide_change_is_reported_but_needs_no_review(self):
        new = drift.parse_spl(spl(4, "2026-02-01", medguide="Read this new guide."))
        result = drift.compare(self.pin(), new)
        self.assertEqual(result["unmapped"], ["MEDICATION GUIDE"])
        self.assertFalse(result["needsReview"])

    def test_a_package_panel_change_is_invisible(self):
        result = drift.compare(self.pin(), drift.parse_spl(spl(4, "2026-02-01", package="Carton 90")))
        self.assertEqual(result["changed"] + result["unmapped"], [])

    def test_a_pinned_quote_is_dose_masked_and_must_survive_the_new_version(self):
        quote = {"section": "5.1", "text": "Watch for   sedation."}
        pin = self.pin([quote])
        self.assertEqual(pin["quotes"], [{"section": "5.1", "text": "Watch for sedation."}])
        intact = drift.compare(pin, drift.parse_spl(spl(4, "2026-02-01", medguide="New guide.")))
        self.assertEqual(intact["quotesBroken"], [])
        gone = drift.compare(pin, drift.parse_spl(spl(4, "2026-02-01", warnings="Monitor closely.")))
        self.assertEqual(len(gone["quotesBroken"]), 1)
        self.assertTrue(gone["needsReview"])

    def test_a_quote_that_is_not_in_the_label_cannot_be_pinned(self):
        parsed = drift.parse_spl(spl(3, "2026-01-01"))
        _, problems = drift.pin_entry(parsed, [{"section": "5.1", "text": "Not in the label."}], "x")
        self.assertTrue(problems)
        _, problems = drift.pin_entry(parsed, [{"section": "9.9", "text": "Watch"}], "x")
        self.assertTrue(problems)

    def test_pinned_quotes_never_store_a_dose(self):
        parsed = drift.parse_spl(spl(3, "2026-01-01", dosing="Do not exceed 24 mg daily."))
        entry, problems = drift.pin_entry(parsed, [{"section": "2.4", "text": "Do not exceed 24 mg daily."}], "x")
        self.assertEqual(problems, [])
        self.assertEqual(entry["quotes"][0]["text"], "Do not exceed [dose] daily.")


class MainTest(unittest.TestCase):
    def test_pin_then_check_an_unchanged_label(self):
        ws = Workspace(self, receipt())
        code, out = ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        self.assertEqual(code, 0, out)
        self.assertEqual(ws.pins_doc()["agents"]["testdrug"]["version"], 3)
        fake = FakeDailyMed(spl(3, "2026-01-01"))
        code, out = ws.run(get=fake)
        self.assertEqual(code, 0, out)
        self.assertIn("examined 1/1", out)
        self.assertTrue(all(url.endswith("/history.json") for url in fake.calls))  # no SPL download

    def test_a_newer_label_that_changes_dosing_exits_1_and_names_the_field(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        code, out = ws.run(get=FakeDailyMed(spl(4, "2026-02-01", dosing="Rewritten dosing.")))
        self.assertEqual(code, 1, out)
        self.assertIn("REVIEW", out)
        self.assertIn("2.4", out)
        self.assertIn("re-review fields: dosing", out)

    def test_a_version_bump_with_no_content_change_exits_0_and_asks_for_a_re_pin(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        code, out = ws.run(get=FakeDailyMed(spl(4, "2026-02-01", package="New carton")))
        self.assertEqual(code, 0, out)
        self.assertIn("re-pin", out)

    def test_json_report(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        code, out = ws.run("--json", get=FakeDailyMed(spl(4, "2026-02-01", dosing="Rewritten.")))
        report = json.loads(out[out.index("{"):])
        self.assertEqual((code, report["examined"], report["needsReview"]), (1, 1, ["testdrug"]))

    def test_pin_refuses_a_label_already_newer_than_the_receipt(self):
        ws = Workspace(self, receipt(date="2025-06-01"))
        code, out = ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        self.assertEqual(code, 1, out)
        pins = ws.pins_doc()
        self.assertNotIn("testdrug", pins["agents"])
        self.assertIn("verify_pharmacy_labels.py", pins["unpinned"]["testdrug"])
        # ...and the unpinned agent is a finding everywhere, never a silent skip (Codex P1 #954).
        code, out = ws.run("--offline", get=FakeDailyMed(b"", fail=True))
        self.assertEqual(code, 1, out)
        self.assertIn("testdrug: unpinned", out)
        code, out = ws.run(get=FakeDailyMed(spl(3, "2026-01-01")))
        self.assertEqual(code, 1, out)
        self.assertIn("testdrug: unpinned", out)

    def test_network_failure_could_not_check(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        code, out = ws.run(get=FakeDailyMed(b"", fail=True))
        self.assertEqual(code, 2, out)

    def test_a_receipt_agent_with_no_pin_could_not_check(self):  # never a pass over fewer labels
        ws = Workspace(self, receipt(), pins_doc={"schemaVersion": 1, "agents": {}})
        code, out = ws.run(get=FakeDailyMed(spl(3, "2026-01-01")))
        self.assertEqual(code, 2, out)
        self.assertIn("testdrug", out)
        code, out = ws.run("--offline", get=FakeDailyMed(spl(3, "2026-01-01")))
        self.assertEqual(code, 2, out)

    def test_an_unreadable_history_could_not_check(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        for body in (b"{}", b'{"data": []}', b'{"data": {"history": []}}', b"<html>"):
            with self.subTest(body=body):
                code, out = ws.run(get=lambda url, body=body: body if url.endswith(".json") else b"")
                self.assertEqual(code, 2, out)

    def test_offline_never_touches_the_network(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        fake = FakeDailyMed(b"", fail=True)
        code, out = ws.run("--offline", get=fake)
        self.assertEqual((code, fake.calls), (0, []), out)

    def test_offline_fails_a_pin_the_receipt_has_moved_past(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        ws.receipt.write_text(json.dumps(receipt(date="2026-02-01")))
        code, out = ws.run("--offline", get=FakeDailyMed(b"", fail=True))
        self.assertEqual(code, 1, out)
        moved = receipt()
        moved["agents"]["testdrug"]["reference"]["setId"] = "99999999-0000-0000-0000-000000000000"
        ws.receipt.write_text(json.dumps(moved))
        code, out = ws.run("--offline", get=FakeDailyMed(b"", fail=True))
        self.assertEqual(code, 2, out)

    def test_offline_fails_a_dose_in_a_pinned_quote(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        pins = ws.pins_doc()
        pins["agents"]["testdrug"]["quotes"] = [{"section": "2.4", "text": "Give 10 mg."}]
        ws.pins.write_text(json.dumps(pins))
        code, out = ws.run("--offline", get=FakeDailyMed(b"", fail=True))
        self.assertEqual(code, 1, out)


class LedgerTest(unittest.TestCase):
    """--record: the local, append-only record bin/what_needs_josh.py reads."""

    def setUp(self):
        self.ws = Workspace(self, receipt())
        self.ledger = Path(self.ws.dir.name) / "state" / "ledger.json"
        self.ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))

    def ledger_doc(self):
        return json.loads(self.ledger.read_text())

    def test_a_drift_is_recorded_once_and_a_later_clean_run_never_erases_it(self):
        moved = FakeDailyMed(spl(4, "2026-02-01", dosing="Rewritten dosing."))
        code, out = self.ws.run("--record", "--ledger", str(self.ledger), get=moved)
        self.assertEqual(code, 1, out)
        doc = self.ledger_doc()
        self.assertEqual(len(doc["drifts"]), 1)
        drift_row = doc["drifts"][0]
        self.assertEqual((drift_row["agent"], drift_row["toVersion"], drift_row["fields"]),
                         ("testdrug", 4, ["dosing"]))
        self.assertEqual(doc["lastChecked"], drift_row["observedOn"])
        self.ws.run("--record", "--ledger", str(self.ledger), get=moved)       # same drift again
        self.assertEqual(len(self.ledger_doc()["drifts"]), 1)
        # Re-verify and re-pin to the new label: the next run is clean, the drift stays owed.
        self.ws.receipt.write_text(json.dumps(receipt(date="2026-02-01")))
        self.ws.run("--pin", get=moved)
        code, out = self.ws.run("--record", "--ledger", str(self.ledger), get=moved)
        self.assertEqual(code, 0, out)
        self.assertEqual(len(self.ledger_doc()["drifts"]), 1)

    def test_a_content_free_bump_is_not_recorded(self):
        self.ws.run("--record", "--ledger", str(self.ledger),
                    get=FakeDailyMed(spl(4, "2026-02-01", package="New carton")))
        self.assertEqual(self.ledger_doc()["drifts"], [])
        self.assertIsNotNone(self.ledger_doc()["lastChecked"])

    def test_a_partial_run_never_refreshes_last_checked(self):  # SILENT_SHRINK: fewer labels
        two = receipt()
        two["agents"]["otherdrug"] = copy.deepcopy(two["agents"]["testdrug"])
        self.ws.receipt.write_text(json.dumps(two))
        self.ws.run("--pin", get=FakeDailyMed(spl(3, "2026-01-01")))
        code, out = self.ws.run("--record", "--only", "testdrug", "--ledger", str(self.ledger),
                                get=FakeDailyMed(spl(3, "2026-01-01")))
        self.assertEqual(code, 0, out)
        self.assertIsNone(self.ledger_doc()["lastChecked"])
        self.assertIn("partial run", out)

    def test_a_failed_check_records_nothing(self):
        code, _ = self.ws.run("--record", "--ledger", str(self.ledger), get=FakeDailyMed(b"", fail=True))
        self.assertEqual(code, 2)
        self.assertFalse(self.ledger.exists())

    def test_an_unreadable_ledger_could_not_check_and_is_left_alone(self):
        self.ledger.parent.mkdir(parents=True)
        self.ledger.write_text("{not json")
        code, out = self.ws.run("--record", "--ledger", str(self.ledger),
                                get=FakeDailyMed(spl(3, "2026-01-01")))
        self.assertEqual(code, 2, out)
        self.assertEqual(self.ledger.read_text(), "{not json")

    def test_the_card_review_state_at_observation_is_recorded(self):  # Codex P1 on #955
        row = {"agent": "lithium", "status": "review", "fromVersion": 13, "toVersion": 14,
               "fromDate": "a", "toDate": "b", "changed": ["5.3"], "added": [], "removed": [],
               "fields": ["flags"], "quotesBroken": []}
        cards = {"lithium": {"facultyReview": {"status": "reviewed", "lastReviewed": "2026-09-29"}}}
        drift.record(self.ledger, [row], True, "2026-10-10", cards)
        self.assertEqual(self.ledger_doc()["drifts"][0]["cardReviewedOn"], "2026-09-29")
        drift.record(self.ledger, [dict(row, agent="quetiapine")], True, "2026-10-10",
                     {"quetiapine": {"facultyReview": {"status": "pending"}}})
        self.assertIsNone(self.ledger_doc()["drifts"][1]["cardReviewedOn"])

    def test_an_interrupted_write_leaves_the_ledger_whole(self):  # Codex P2 on #955
        moved = FakeDailyMed(spl(4, "2026-02-01", dosing="Rewritten dosing."))
        self.ws.run("--record", "--ledger", str(self.ledger), get=moved)
        before = self.ledger.read_text()
        original = drift.os.replace
        drift.os.replace = lambda *a: (_ for _ in ()).throw(OSError("disk full"))
        try:
            with self.assertRaises(OSError):
                drift.record(self.ledger, [], True, "2026-10-11")
        finally:
            drift.os.replace = original
        self.assertEqual(self.ledger.read_text(), before)
        self.assertEqual(sorted(p.name for p in self.ledger.parent.iterdir()), [self.ledger.name])

    def test_the_ledger_lives_outside_the_repository_and_the_cli_defaults_to_it(self):
        saved = {k: os.environ.pop(k, None) for k in ("CLERKSHIP_LABEL_DRIFT_LEDGER", "XDG_STATE_HOME")}
        try:
            default = drift.ledger_path()
            self.assertEqual(default, Path.home() / ".local" / "state" / "clerkship" / drift.LEDGER_NAME)
            repo = HERE.parents[2]
            self.assertNotIn(repo, default.parents)
            os.environ["XDG_STATE_HOME"] = "/x"
            self.assertEqual(drift.ledger_path(), Path("/x/clerkship") / drift.LEDGER_NAME)
            os.environ["CLERKSHIP_LABEL_DRIFT_LEDGER"] = "/y/l.json"
            self.assertEqual(drift.ledger_path(), Path("/y/l.json"))
            # Production passes no --ledger: the parser's default must BE ledger_path().
            seen = {}
            original = drift.record
            drift.record = lambda path, *a: seen.setdefault("path", path) and 0
            try:
                self.ws.run("--record", get=FakeDailyMed(spl(3, "2026-01-01")))
            finally:
                drift.record = original
            self.assertEqual(seen.get("path"), Path("/y/l.json"))
        finally:
            for key, value in saved.items():
                os.environ.pop(key, None)
                if value is not None:
                    os.environ[key] = value


V3 = spl(3, "2026-01-01")
V4_DOSING = spl(4, "2026-02-01", dosing="Titrate to response. Dosages above 24 mg daily may be appropriate.")


class DiffTest(unittest.TestCase):
    """The changed sections as a word diff against the exact text that was pinned."""

    def pin(self):
        entry, _ = drift.pin_entry(drift.parse_spl(V3), [], "2026-10-03")
        return entry

    def test_archive_ids_reads_only_the_archive_table(self):
        self.assertEqual(drift.archive_ids(label_page([2, 3])), {2: "1002", 3: "1003"})
        self.assertEqual(drift.archive_ids(b"<html>no archive table</html>"), {})
        self.assertEqual(drift.archive_ids(None), {})

    def test_archived_spl_returns_that_version_or_none(self):
        fake = FakeDailyMed(V4_DOSING, archive={3: V3})
        self.assertEqual(drift.archived_spl(SET_ID, 3, fake)["version"], 3)
        self.assertIsNone(drift.archived_spl(SET_ID, 2, fake))           # not archived
        broken = FakeDailyMed(V4_DOSING, archive={3: V3})
        broken.archive = {3: b"x"}
        broken.__class__ = type("Broken", (FakeDailyMed,), {"__call__": lambda self, url:
                                b"not a zip" if "getArchivalFile" in url else FakeDailyMed.__call__(self, url)})
        self.assertIsNone(drift.archived_spl(SET_ID, 3, broken))

    def test_old_text_is_shown_only_when_it_hashes_to_the_pin(self):
        new = drift.parse_spl(V4_DOSING)
        texts = drift.section_texts(self.pin(), drift.parse_spl(V3), new, ["2.4"])
        self.assertEqual(texts["2.4"]["oldStatus"], "verified")
        self.assertIn(DOSING, texts["2.4"]["old"])
        impostor = drift.parse_spl(spl(3, "2026-01-01", dosing="Some other text."))
        texts = drift.section_texts(self.pin(), impostor, new, ["2.4"])
        self.assertEqual((texts["2.4"]["oldStatus"], texts["2.4"]["old"]), ("mismatch", None))
        self.assertEqual(drift.section_texts(self.pin(), None, new, ["2.4"])["2.4"]["oldStatus"], "unavailable")
        added = drift.parse_spl(spl(4, "2026-02-01", boxed="New boxed warning."))
        self.assertEqual(drift.section_texts(self.pin(), None, added, ["BW"])["BW"]["oldStatus"], "absent")

    def test_word_diff_marks_changes_and_elides_far_context(self):
        old = " ".join("w%d" % i for i in range(60))
        new = old.replace("w30", "W30*").replace("w45 ", "")
        hunks = drift.word_diff(old, new, context=3)
        self.assertEqual(hunks, ["w27 w28 w29 ~~w30~~ **W30\\***  w31 w32 w33".replace("  ", " "),
                                 "w42 w43 w44 ~~w45~~ w46 w47 w48"])
        self.assertNotIn("w10", " ".join(hunks))
        self.assertEqual(drift.word_diff("same words", "same   words"), [])
        long_add = drift.word_diff("a", "a " + "x " * 400, limit=20)[0]
        self.assertIn("**" + " ".join(["x"] * 20) + " …** (+380 words)", long_add)

    def test_a_long_replacement_keeps_both_halves_and_closes_every_delimiter(self):  # Codex P2 #961
        old = " ".join("old%d" % i for i in range(300))
        new = " ".join("new%d" % i for i in range(300))
        (hunk,) = drift.word_diff(old, new, limit=10)
        self.assertEqual(hunk.count("~~"), 2)
        self.assertEqual(hunk.count("**"), 2)
        self.assertIn("new0", hunk)                                  # the added half survives
        self.assertIn("…~~ (+290 words)", hunk)
        self.assertTrue(hunk.endswith("…** (+290 words)"))

    def test_record_stores_verified_texts_and_json_stays_slim(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(V3))
        ledger = Path(ws.dir.name) / "ledger.json"
        code, out = ws.run("--record", "--json", "--ledger", str(ledger),
                           get=FakeDailyMed(V4_DOSING, archive={3: V3, 4: V4_DOSING}))
        self.assertEqual(code, 1, out)
        self.assertNotIn('"texts"', out)
        stored = json.loads(ledger.read_text())["drifts"][0]["texts"]["2.4"]
        self.assertEqual(stored["oldStatus"], "verified")
        self.assertIn("24 mg daily", stored["new"])           # faculty-only and local: unmasked

    def test_diff_cli(self):
        ws = Workspace(self, receipt())
        ws.run("--pin", get=FakeDailyMed(V3))
        code, out = ws.run("--diff", "testdrug", get=FakeDailyMed(V3, archive={3: V3}))
        self.assertEqual(code, 0, out)
        self.assertIn("nothing has changed since the pin", out)
        code, out = ws.run("--diff", "testdrug", get=FakeDailyMed(V4_DOSING, archive={3: V3, 4: V4_DOSING}))
        self.assertEqual(code, 1, out)
        self.assertIn("**§2.4**", out)
        self.assertIn("~~the usual range~~", out)
        self.assertIn("**24 mg daily**", out)
        code, out = ws.run("--diff", "testdrug", get=FakeDailyMed(V4_DOSING, archive={4: V4_DOSING}))
        self.assertIn("old text not archived by DailyMed", out)
        code, out = ws.run("--diff", "nodrug", get=FakeDailyMed(V3))
        self.assertEqual(code, 2, out)


class PacketTest(unittest.TestCase):
    """render_review_packet.py section 0: what moved since the card's review."""

    @classmethod
    def setUpClass(cls):
        import render_review_packet as packet
        cls.packet = packet
        cls.pharmacy = json.loads(drift.PHARMACY.read_text(encoding="utf-8"))
        cls.receipt = json.loads(drift.RECEIPT.read_text(encoding="utf-8"))

    def card(self, last_reviewed):
        record = copy.deepcopy(next(r for r in self.pharmacy["records"] if r["id"] == "lithium"))
        record["facultyReview"] = ({"status": "reviewed", "lastReviewed": last_reviewed}
                                   if last_reviewed else {"status": "pending"})
        return record

    def ledger(self, last_checked="2026-10-10"):
        pin, _ = drift.pin_entry(drift.parse_spl(V3), [], "x")
        texts = drift.section_texts(pin, drift.parse_spl(V3), drift.parse_spl(V4_DOSING), ["2.4"])
        return {"schemaVersion": 1, "lastChecked": last_checked, "drifts": [{
            "agent": "lithium", "observedOn": "2026-10-10", "fromVersion": 13, "toVersion": 14,
            "fromDate": "2026-08-24", "toDate": "2026-10-06", "sections": ["2.4"],
            "fields": ["dosing"], "quotesBroken": 0, "texts": texts}]}

    def render(self, record, ledger, today="2026-10-12"):
        return self.packet.render([record], self.receipt, ledger, datetime.date.fromisoformat(today))

    def test_a_card_reviewed_before_the_drift_opens_with_the_diff(self):
        text = self.render(self.card("2026-09-29"), self.ledger())
        self.assertIn("### 0. Label changed since your review on 2026-09-29", text)
        self.assertIn("Card fields to re-review: dosing", text)
        self.assertIn("~~the usual range~~", text)
        self.assertLess(text.index("### 0."), text.index("### 1. Decide"))

    def test_a_later_review_date_without_bound_evidence_does_not_close_it(self):
        self.assertIn("### 0.", self.render(self.card("2026-10-10"), self.ledger()))

    def test_a_pending_card_shows_changes_since_it_was_drafted(self):
        self.assertIn("### 0. Label changed since this card was drafted",
                      self.render(self.card(None), self.ledger()))

    def test_a_missing_or_stale_ledger_is_said_out_loud(self):
        self.assertIn("Label drift: not checked on this machine", self.render(self.card("2026-09-29"), None))
        stale = self.render(self.card("2026-09-29"), self.ledger(last_checked="2026-09-01"))
        self.assertIn("last full check 2026-09-01 (41 days ago)", stale)
        self.assertIn("never checked over every pinned label",
                      self.render(self.card("2026-09-29"), self.ledger(last_checked=None)))

    def test_deterministic(self):
        record, ledger = self.card("2026-09-29"), self.ledger()
        self.assertEqual(self.render(record, ledger), self.render(record, ledger))


class CommittedPinsTest(unittest.TestCase):
    """The committed label_pins.json against the committed label_receipt.json (CI's step)."""

    def test_production_defaults(self):
        self.assertEqual(drift.PINS, HERE / "label_pins.json")
        self.assertEqual(drift.RECEIPT, HERE / "label_receipt.json")
        self.assertIs(drift.main.__defaults__[-1], drift.fetch)

    def test_committed_pins_agree_with_the_receipt(self):
        receipt_doc = json.loads(drift.RECEIPT.read_text(encoding="utf-8"))
        pins_doc = json.loads(drift.PINS.read_text(encoding="utf-8"))
        findings, missing = drift.offline_check(receipt_doc, pins_doc)
        self.assertEqual((findings, missing), ([], []))

    def test_committed_pins_are_not_vacuous(self):
        receipt_doc = json.loads(drift.RECEIPT.read_text(encoding="utf-8"))
        pins_doc = json.loads(drift.PINS.read_text(encoding="utf-8"))
        pinned = pins_doc.get("agents", {})
        self.assertEqual(set(pinned) | set(pins_doc.get("unpinned", {})), set(receipt_doc["agents"]))
        self.assertGreaterEqual(len(pinned), 40)
        for agent, entry in pinned.items():
            with self.subTest(agent=agent):
                self.assertGreaterEqual(len(entry["sections"]), 5)


# Synthetic committed-Git evidence contracts; all ledgers and approvals are fixtures.
TOOLS = Path('13_Faculty_Resources/_automation/pharmacy')


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode('utf-8')).hexdigest()


class LabelEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        self.git('init', '-q')
        self.git('config', 'user.name', 'Synthetic Fixture')
        self.git('config', 'user.email', 'fixture@example.test')
        self.today = datetime.date(2026, 3, 2)
        self.ledger_path = self.root / 'ledger.json'
        for patcher in (mock.patch.object(drift, 'ROOT', self.root, create=True),
                        mock.patch.object(owner, 'ROOT', self.root),
                        mock.patch.object(owner, 'PHARMACY', self.root / 'pharmacy.json'),
                        mock.patch.object(owner, '_today', lambda: self.today),
                        mock.patch.dict(os.environ, {'CLERKSHIP_LABEL_DRIFT_LEDGER': str(self.ledger_path)})):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.card = {'id': 'lithium', 'dailymedSetId': SET_ID, 'labelVersionDate': '2026-01-01',
                     'mechanism': 'Synthetic café statement.',
                     'provenance': {'fieldClasses': {'mechanism': 'J'}},
                     'facultyReview': {'status': 'pending'}}
        self.source(1, '2026-01-01')
        self.obligation = {'agent': 'lithium', 'setId': SET_ID, 'observedOn': '2026-02-02',
                           'fromVersion': 1, 'toVersion': 2, 'fromDate': '2026-01-01',
                           'toDate': '2026-02-01', 'fields': ['mechanism']}

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], env=self.env,
                                       stderr=subprocess.PIPE, text=True).strip()

    def source(self, version, date):
        self.card['labelVersionDate'] = date
        self.pin = {'setId': SET_ID, 'version': version, 'effectiveDate': date,
                    'sections': {'1': 'a' * 16}, 'note': 'Synthetic café pin'}
        self.receipt = {'reference': {'setId': SET_ID, 'effectiveDate': date}, 'notes': ['Synthetic café receipt']}
        for path, document in [('pharmacy.json', {'records': [self.card]}),
                               (TOOLS / 'label_pins.json', {'agents': {'lithium': self.pin}}),
                               (TOOLS / 'label_receipt.json', {'agents': {'lithium': self.receipt}})]:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(document, ensure_ascii=False))
        self.git('add', 'pharmacy.json', str(TOOLS))
        self.git('commit', '-qm', 'Synthetic source version ' + str(version))
        self.revision = self.git('rev-parse', 'HEAD')

    def reviewed(self):
        result = copy.deepcopy(self.card)
        result['facultyReview'] = {'status': 'reviewed', 'reviewer': 'Synthetic Faculty',
                                  'lastReviewed': '2026-03-01', 'reviewedFieldsHash': drift.vp.j_hash(result),
                                  'labelEvidence': {'schemaVersion': 1, 'sourceRevision': self.revision,
                                                    'setId': SET_ID, 'version': self.pin['version'],
                                                    'effectiveDate': self.pin['effectiveDate'],
                                                    'pinHash': canonical_hash(self.pin),
                                                    'receiptHash': canonical_hash(self.receipt)}}
        return result

    def assert_consumers(self, card, rows, expected):
        ledger = {'schemaVersion': 1, 'lastChecked': str(self.today), 'drifts': rows}
        self.ledger_path.write_text(json.dumps(ledger))
        (self.root / 'pharmacy.json').write_text(json.dumps({'records': [card]}))
        before = self.ledger_path.read_bytes()
        self.assertEqual(drift.drifts_since_review(ledger, card), expected)
        owed, _ = owner._label_drift_owed()
        # The owner queue counts cards; a card stays owed if ANY transition remains.
        self.assertEqual(bool(owed), bool(expected))
        if owed:
            self.assertIn(owed[0], expected)
        self.assertEqual(self.ledger_path.read_bytes(), before)

    def test_authentic_later_review_of_old_source_does_not_clear_new_label(self):
        self.assert_consumers(self.reviewed(), [self.obligation], [self.obligation])

    def test_exact_committed_new_evidence_clears_only_matching_transition(self):
        self.source(2, '2026-02-01')
        self.assert_consumers(self.reviewed(), [self.obligation], [])

    def test_missing_legacy_and_malformed_evidence_remain_owed(self):
        self.source(2, '2026-02-01')
        for evidence in (None, {}, [], {'schemaVersion': 1}):
            with self.subTest(evidence=evidence):
                card = self.reviewed()
                card['facultyReview']['labelEvidence'] = evidence
                self.assert_consumers(card, [self.obligation], [self.obligation])

    def test_wrong_identity_version_date_hash_or_revision_remains_owed(self):
        old_revision = self.revision
        self.source(2, '2026-02-01')
        for key, value in [('schemaVersion', 2), ('version', True), ('version', 1),
                           ('setId', 'another-label'), ('effectiveDate', '2026-01-01'),
                           ('pinHash', 'b' * 64), ('receiptHash', 'c' * 64),
                           ('sourceRevision', 'f' * 40), ('sourceRevision', old_revision),
                           ('sourceRevision', '--help'), ('pinHash', 'A' * 64)]:
            with self.subTest(key=key, value=value):
                card = self.reviewed()
                card['facultyReview']['labelEvidence'][key] = value
                self.assert_consumers(card, [self.obligation], [self.obligation])

    def test_pending_bad_hash_missing_reviewer_or_future_date_remains_owed(self):
        self.source(2, '2026-02-01')
        for key, value in [('status', 'pending'), ('reviewedFieldsHash', 'b' * 64),
                           ('reviewer', ''), ('lastReviewed', '2099-01-01'),
                           ('lastReviewed', 'not-a-date')]:
            with self.subTest(key=key):
                card = self.reviewed()
                card['facultyReview'][key] = value
                self.assert_consumers(card, [self.obligation], [self.obligation])

    def test_source_objects_must_match_record_and_have_section_hashes(self):
        self.source(2, '2026-02-01')
        card = self.reviewed()
        card['mechanism'] = 'Changed synthetic clinical statement.'
        card['facultyReview']['reviewedFieldsHash'] = drift.vp.j_hash(card)
        self.assert_consumers(card, [self.obligation], [self.obligation])
        self.pin['sections'] = {}
        (self.root / TOOLS / 'label_pins.json').write_text(json.dumps({'agents': {'lithium': self.pin}}))
        self.git('add', str(TOOLS)); self.git('commit', '-qm', 'Malformed synthetic pin')
        self.revision = self.git('rev-parse', 'HEAD')
        self.assert_consumers(self.reviewed(), [self.obligation], [self.obligation])

    def test_working_tree_objects_do_not_substitute_for_committed_evidence(self):
        self.source(2, '2026-02-01')
        (self.root / TOOLS / 'label_pins.json').write_text('{}')
        self.assert_consumers(self.reviewed(), [self.obligation], [])

    def test_existing_nonancestor_source_is_not_accepted(self):
        original = self.revision
        self.source(2, '2026-02-01')
        card = self.reviewed()
        self.git('checkout', '--detach', original)
        self.assert_consumers(card, [self.obligation], [self.obligation])

    def test_committed_receipt_mismatch_is_not_fixed_by_rehashing(self):
        self.source(2, '2026-02-01')
        self.receipt['reference']['setId'] = 'different-synthetic-label'
        (self.root / TOOLS / 'label_receipt.json').write_text(
            json.dumps({'agents': {'lithium': self.receipt}}))
        self.git('add', str(TOOLS))
        self.git('commit', '-qm', 'Mismatched synthetic receipt')
        self.revision = self.git('rev-parse', 'HEAD')
        self.assert_consumers(self.reviewed(), [self.obligation], [self.obligation])

    def test_newest_review_does_not_clear_older_unresolved_transition(self):
        self.source(3, '2026-02-15')
        newer = dict(self.obligation, fromVersion=2, toVersion=3, toDate='2026-02-15', observedOn='2026-02-16')
        self.assert_consumers(self.reviewed(), [self.obligation, newer], [self.obligation])

    def test_legacy_obligation_without_label_identity_is_not_assumed_matching(self):
        self.source(2, '2026-02-01')
        legacy = dict(self.obligation); del legacy['setId']
        self.assert_consumers(self.reviewed(), [legacy], [legacy])

    def test_writer_unsupported_numbers_cannot_clear_even_with_matching_hashes(self):
        for number in (0.5, 9007199254740992):
            with self.subTest(number=number):
                self.source(2, '2026-02-01')
                self.pin['extension'] = {'nested': [number]}
                (self.root / TOOLS / 'label_pins.json').write_text(
                    json.dumps({'agents': {'lithium': self.pin}}))
                self.git('add', str(TOOLS))
                self.git('commit', '-qm', 'Unsupported synthetic number')
                self.revision = self.git('rev-parse', 'HEAD')
                self.assert_consumers(self.reviewed(), [self.obligation], [self.obligation])

    def test_committed_resolution_stays_resolved_after_next_review(self):
        self.source(2, '2026-02-01')
        card = self.reviewed()
        self.assert_consumers(card, [self.obligation], [])
        self.git('add', 'pharmacy.json')
        self.git('commit', '-qm', 'Synthetic faculty approval of version 2')
        self.source(3, '2026-02-15')
        newer = dict(self.obligation, fromVersion=2, toVersion=3,
                     toDate='2026-02-15', observedOn='2026-02-16')
        self.assert_consumers(self.reviewed(), [self.obligation, newer], [])

    def test_record_preserves_distinct_label_sets_dates_and_legacy_rows(self):
        self.source(2, '2026-02-01')
        approved = self.reviewed()
        self.assert_consumers(approved, [self.obligation], [])
        self.git('add', 'pharmacy.json')
        self.git('commit', '-qm', 'Synthetic approval for first label set')
        report = dict(self.obligation, status='review', setId='new-synthetic-label',
                      changed=['1'], added=[], removed=[], quotesBroken=[])
        self.assertEqual(drift.record(self.ledger_path, [report, report], True,
                                      '2026-03-02', {'lithium': approved}), 1)
        rows = json.loads(self.ledger_path.read_text())['drifts']
        self.assert_consumers(approved, rows, [rows[1]])
        # The same set/version with a different target date is also distinct.
        report['toDate'] = '2026-02-03'
        self.assertEqual(drift.record(self.ledger_path, [report], True, '2026-03-02'), 1)
        # An old row lacking setId cannot suppress a newly identifiable observation.
        legacy = dict(self.obligation)
        del legacy['setId']
        self.ledger_path.write_text(json.dumps({'drifts': [legacy]}))
        report.update(setId=SET_ID, toDate='2026-02-01')
        self.assertEqual(drift.record(self.ledger_path, [report], True, '2026-03-02'), 1)
        self.assertEqual(json.loads(self.ledger_path.read_text())['drifts'][0], legacy)


if __name__ == "__main__":
    unittest.main(verbosity=2)
