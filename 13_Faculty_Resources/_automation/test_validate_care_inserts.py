#!/usr/bin/env python3
"""Behaviour tests for validate_care_inserts.py (PR A of the Care aftercare packet).

The validator is the only thing standing between a typo in a patient-facing phone number and a
printed handout, so each test names the production change that would make it fail. Fixtures are
built in code with obviously fake 555 numbers; the one test that reads the real data file is the
production-default-path test, deliberately (see CLAUDE.md: a flag every test passes and production
never passes is an untested production path).
"""

import contextlib
import copy
import io
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import validate_care_inserts as validator


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "data" / "care-inserts.v1.schema.json"
TODAY = date(2026, 10, 12)

CANON = ["intro", "week", "callback", "warning", "safety", "family",
         "national", "insurance", "meds", "rights", "card", "notes"]


def schema():
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def crisis_fixture():
    """Resources in the shape of crisis_resources.json, verified 77 days before TODAY."""
    def res(rid, name, contact):
        return {"id": rid, "name": name, "contact": contact, "verifiedOn": "2026-07-27",
                "verificationSource": "https://example.gov/" + rid}
    return {"resources": [
        res("lifeline_988", "988 Suicide & Crisis Lifeline", "Call or text 988"),
        res("maine_crisis_line", "Maine Crisis Line", "1-888-568-1112"),
        res("crisis_text_line", "Crisis Text Line", "Text HOME to 741741"),
        res("emergency_911", "Emergency", "911"),
        res("veterans_crisis_line", "Veterans Crisis Line", "Dial 988 then press 1"),
    ]}


def row(who="Example Helpline", number="1-800-555-0101", verified="2026-10-12"):
    return {"who": who, "number": number, "what": "Help with example things, 24/7",
            "source": "https://example.org/" + who.lower().replace(" ", "-"), "verifiedDate": verified}


def good():
    inserts = []
    for insert_id in CANON:
        inserts.append({"id": insert_id, "title": "Title " + insert_id, "core": insert_id == "intro",
                        "defaultOn": insert_id not in ("safety", "rights", "notes"),
                        "body": "A short plain sentence."})
    by_id = {insert["id"]: insert for insert in inserts}
    by_id["national"]["table"] = [row("Example Helpline", "1-800-555-0101"), row("Example Text Line", "211")]
    by_id["insurance"]["table"] = [row("Example Coverage Office", "1-800-555-0102")]
    def line(ref, label):
        return {"ref": ref, "label": label, "when": "When to use " + label + "."}
    return {"schemaVersion": 1, "generatedAt": "2026-10-12",
            "crisisCopy": {"heading": "If things feel unsafe, call right away",
                           "cardHeading": "If things feel unsafe",
                           "note": "You can call for someone else too."},
            "crisis": [line("lifeline_988", "Suicide and crisis line"), line("maine_crisis_line", "Maine Crisis Line"),
                       line("crisis_text_line", "Crisis text line"), line("emergency_911", "Emergency")],
            "inserts": inserts}


def run_check(data=None, crisis=None, today=TODAY):
    return validator.check(good() if data is None else data, schema(),
                           crisis_fixture() if crisis is None else crisis, today)


def insert(data, insert_id):
    return next(item for item in data["inserts"] if item["id"] == insert_id)


class Base(unittest.TestCase):
    def assertErrorMentions(self, report, *needles):
        text = "\n".join(report.errors)
        for needle in needles:
            self.assertIn(needle, text, "expected an error mentioning %r; got:\n%s" % (needle, text))

    def assertClean(self, report):
        self.assertEqual([], report.errors)
        self.assertEqual([], report.warnings)


class GoodDocument(Base):
    def test_a_valid_document_has_no_errors_and_no_warnings(self):
        self.assertClean(run_check())

    def test_the_report_states_what_it_examined(self):
        stats = run_check().stats
        self.assertEqual(12, stats["inserts"])
        self.assertEqual(3, stats["numbers"])
        self.assertEqual(4, stats["crisisRefs"])
        self.assertEqual("2026-07-27", stats["oldestVerified"])


class VerificationDates(Base):
    def test_a_row_without_verified_date_fails(self):
        data = good()
        del insert(data, "national")["table"][0]["verifiedDate"]
        self.assertErrorMentions(run_check(data), "verifiedDate")

    def test_an_impossible_calendar_date_fails(self):
        data = good()
        insert(data, "national")["table"][0]["verifiedDate"] = "2026-13-40"
        self.assertErrorMentions(run_check(data), "verifiedDate", "2026-13-40")

    def test_a_date_in_the_future_fails(self):
        data = good()
        insert(data, "national")["table"][0]["verifiedDate"] = (TODAY + timedelta(days=1)).isoformat()
        self.assertErrorMentions(run_check(data), "future")

    def test_exactly_180_days_old_is_not_stale(self):
        data = good()
        for item in ("national", "insurance"):
            for entry in insert(data, item)["table"]:
                entry["verifiedDate"] = (TODAY - timedelta(days=180)).isoformat()
        report = run_check(data)
        self.assertEqual([], report.errors)
        self.assertEqual([], report.warnings)

    def test_181_days_old_warns_and_is_not_an_error(self):
        data = good()
        insert(data, "national")["table"][0]["verifiedDate"] = (TODAY - timedelta(days=181)).isoformat()
        report = run_check(data)
        self.assertEqual([], report.errors)
        self.assertEqual(1, len(report.warnings))
        self.assertIn("181 days", report.warnings[0])
        self.assertIn("Example Helpline", report.warnings[0])

    def test_a_stale_crisis_resource_warns_through_the_reference(self):
        crisis = crisis_fixture()
        crisis["resources"][0]["verifiedOn"] = (TODAY - timedelta(days=200)).isoformat()
        report = run_check(crisis=crisis)
        self.assertEqual([], report.errors)
        self.assertEqual(1, len(report.warnings))
        self.assertIn("lifeline_988", report.warnings[0])


class CrisisSingleSource(Base):
    def test_an_unknown_reference_fails(self):
        data = good()
        data["crisis"].append({"ref": "no_such_line", "label": "x", "when": "y"})
        self.assertErrorMentions(run_check(data), "no_such_line")

    def test_dropping_the_988_reference_fails(self):
        data = good()
        data["crisis"] = [c for c in data["crisis"] if c["ref"] != "lifeline_988"]
        self.assertErrorMentions(run_check(data), "lifeline_988")

    def test_dropping_the_maine_crisis_line_reference_fails(self):
        data = good()
        data["crisis"] = [c for c in data["crisis"] if c["ref"] != "maine_crisis_line"]
        self.assertErrorMentions(run_check(data), "maine_crisis_line")

    def test_a_transcription_error_in_the_crisis_source_is_caught_here_too(self):
        crisis = crisis_fixture()
        crisis["resources"][1]["contact"] = "1-888-568-1121"
        self.assertErrorMentions(run_check(crisis=crisis), "1-888-568-1112")

    def test_a_duplicate_reference_fails(self):
        data = good()
        data["crisis"].append({"ref": "emergency_911", "label": "x", "when": "y"})
        self.assertErrorMentions(run_check(data), "emergency_911", "twice")

    def test_a_registered_crisis_number_typed_into_insert_text_fails(self):
        for text in ("Call 988 any time.", "Call 1-888-568-1112 now.", "Text HOME to 741741.", "or dial 9-1-1"):
            with self.subTest(text=text):
                data = good()
                insert(data, "family")["body"] = text
                self.assertErrorMentions(run_check(data), "crisis_resources.json")

    def test_a_short_crisis_code_inside_a_longer_number_is_not_a_false_positive(self):
        data = good()
        insert(data, "family")["body"] = "Room 19115 and page 9881 are not contacts."
        self.assertEqual([], run_check(data).errors)


class TextHygiene(Base):
    def assertRejects(self, text, *needles):
        data = good()
        insert(data, "meds")["body"] = text
        report = run_check(data)
        self.assertTrue(report.errors, "expected %r to be rejected" % text)
        self.assertErrorMentions(report, *needles)

    def test_dose_literals_fail(self):
        for text in ("Take 5 mg at night.", "Take 10mg daily.", "A 0.5 mg tablet.", "100 mcg", "5 mL"):
            with self.subTest(text=text):
                self.assertRejects(text, "dose")

    def test_verification_metadata_tokens_fail(self):
        for text in ("Verification due soon", "see verifiedDate", "reviewAfter 2027", "tier L2 content"):
            with self.subTest(text=text):
                self.assertRejects(text, "metadata")

    def test_markup_fails(self):
        self.assertRejects("Click <b>here</b>", "markup")

    def test_unknown_placeholder_tokens_fail(self):
        self.assertRejects("Call {{patientName}} today", "placeholder")

    def test_the_two_documented_placeholders_pass(self):
        data = good()
        insert(data, "intro")["body"] = "Call the unit at {{unitPhone}}. From the team on {{unitName}}."
        self.assertClean(run_check(data))

    def test_a_stray_brace_fails(self):
        self.assertRejects("Open { brace", "placeholder")

    def test_a_phone_number_in_free_text_fails_because_it_has_no_verified_date(self):
        for text in ("Call 207-555-0100", "Call (207) 555-0100", "Call 1 800 555 0100", "Call 2075550100"):
            with self.subTest(text=text):
                self.assertRejects(text, "verifiedDate")

    def test_text_in_every_text_bearing_field_is_scanned(self):
        # Break the scan for any one field and exactly that case goes unnoticed.
        def set_title(d): insert(d, "meds")["title"] = "5 mg"
        def set_tip(d): insert(d, "meds")["tip"] = "5 mg"
        def set_signoff(d): insert(d, "meds")["signoff"] = "5 mg"
        def set_bullets(d): insert(d, "meds")["bullets"] = ["fine", "5 mg"]
        def set_rows(d): insert(d, "meds")["rows"] = ["fine", "5 mg"]
        def set_group_heading(d): insert(d, "meds")["groups"] = [{"heading": "5 mg", "body": "ok"}]
        def set_group_body(d): insert(d, "meds")["groups"] = [{"heading": "ok", "body": "5 mg"}]
        def set_group_bullets(d): insert(d, "meds")["groups"] = [{"heading": "ok", "bullets": ["5 mg"]}]
        def set_group_rows(d): insert(d, "meds")["groups"] = [{"heading": "ok", "rows": ["5 mg"]}]
        def set_row_what(d): insert(d, "national")["table"][0]["what"] = "5 mg"
        def set_row_who(d): insert(d, "national")["table"][0]["who"] = "5 mg"
        for mutate in (set_title, set_tip, set_signoff, set_bullets, set_rows, set_group_heading,
                       set_group_body, set_group_bullets, set_group_rows, set_row_what, set_row_who):
            with self.subTest(field=mutate.__name__):
                data = good()
                mutate(data)
                self.assertErrorMentions(run_check(data), "dose")


class Structure(Base):
    def test_an_insert_with_no_content_fails(self):
        data = good()
        del insert(data, "notes")["body"]
        self.assertErrorMentions(run_check(data), "notes", "no content")

    def test_an_unknown_insert_id_fails(self):
        data = good()
        data["inserts"].append({"id": "surprise", "title": "x", "core": False, "defaultOn": False, "body": "x"})
        self.assertTrue(run_check(data).errors)

    def test_a_duplicate_insert_id_fails(self):
        data = good()
        data["inserts"].append(copy.deepcopy(insert(data, "notes")))
        self.assertErrorMentions(run_check(data), "notes", "twice")

    def test_a_missing_required_insert_fails(self):
        data = good()
        data["inserts"] = [i for i in data["inserts"] if i["id"] != "meds"]
        self.assertErrorMentions(run_check(data), "meds", "missing")

    def test_inserts_must_be_in_print_order(self):
        data = good()
        data["inserts"].reverse()
        self.assertErrorMentions(run_check(data), "order")

    def test_a_core_insert_cannot_default_off(self):
        data = good()
        insert(data, "intro")["defaultOn"] = False
        self.assertErrorMentions(run_check(data), "intro", "core")

    def test_extra_properties_fail_so_a_typo_does_not_silently_drop_content(self):
        data = good()
        insert(data, "meds")["bulets"] = ["typo for bullets"]
        self.assertTrue(run_check(data).errors)

    def test_an_empty_helpline_table_fails_rather_than_reporting_zero_numbers(self):
        for key in ("national", "insurance"):
            with self.subTest(insert=key):
                data = good()
                insert(data, key)["table"] = []
                self.assertTrue(run_check(data).errors)
        data = good()
        del insert(data, "national")["table"]
        self.assertErrorMentions(run_check(data), "national", "table")


class TableRows(Base):
    def test_number_format_is_checked(self):
        for bad in ("1-800-662-435", "800-555-0101", "21", "Dial 211", "1-800-FLOWERS", ""):
            with self.subTest(number=bad):
                data = good()
                insert(data, "national")["table"][0]["number"] = bad
                self.assertTrue(run_check(data).errors)

    def test_three_digit_and_two_toll_free_shapes_pass(self):
        for number in ("311", "1-800-555-0199", "(207) 555-0199"):
            with self.subTest(number=number):
                data = good()
                insert(data, "insurance")["table"][0]["number"] = number
                self.assertEqual([], run_check(data).errors)

    def test_a_lookalike_host_is_not_mistaken_for_an_aggregator(self):
        data = good()
        insert(data, "national")["table"][0]["source"] = "https://notwikipedia.org/page"
        self.assertEqual([], run_check(data).errors)

    def test_source_is_required_and_must_be_https(self):
        data = good()
        del insert(data, "national")["table"][0]["source"]
        self.assertErrorMentions(run_check(data), "source")
        data = good()
        insert(data, "national")["table"][0]["source"] = "http://example.org/x"
        self.assertTrue(run_check(data).errors)

    def test_aggregator_sources_are_not_provenance(self):
        for host in ("en.wikipedia.org", "www.healthline.com", "www.webmd.com"):
            with self.subTest(host=host):
                data = good()
                insert(data, "national")["table"][0]["source"] = "https://%s/page" % host
                self.assertErrorMentions(run_check(data), host)

    def test_one_number_listed_twice_must_carry_the_same_name_and_source(self):
        data = good()
        data["inserts"][5]["table"] = [row("Example Helpline", "1-800-555-0101")]
        self.assertEqual([], run_check(data).errors)
        data["inserts"][5]["table"][0]["who"] = "A different name"
        self.assertErrorMentions(run_check(data), "1-800-555-0101", "different")

    def test_numbers_counted_in_stats_include_repeats(self):
        data = good()
        data["inserts"][5]["table"] = [row("Example Helpline", "1-800-555-0101")]
        self.assertEqual(4, run_check(data).stats["numbers"])


class CrisisTokens(Base):
    """`{{crisis:<id>}}` lets prose say "call 911" without typing the number (single source)."""

    def with_body(self, text):
        data = good()
        insert(data, "family")["body"] = text
        return data

    def test_a_token_for_a_referenced_line_passes(self):
        self.assertClean(run_check(self.with_body("If they are in danger, call {{crisis:emergency_911}} now.")))

    def test_the_token_does_not_trip_the_registered_number_scan_by_containing_the_id(self):
        # "emergency_911" contains 911; the scan must read the prose, not the placeholder.
        self.assertEqual([], run_check(self.with_body("Call {{crisis:emergency_911}}.")).errors)

    def test_a_token_for_an_unknown_line_fails(self):
        self.assertErrorMentions(run_check(self.with_body("Call {{crisis:nobody}}.")), "nobody")

    def test_a_token_for_a_registered_line_that_is_not_in_crisis_fails(self):
        report = run_check(self.with_body("Call {{crisis:veterans_crisis_line}}."))
        self.assertErrorMentions(report, "veterans_crisis_line", "`crisis`")

    def test_a_malformed_crisis_token_fails(self):
        for text in ("Call {{crisis:}}.", "Call {{crisis}}.", "Call {{ crisis:emergency_911 }}.",
                     "Call {{crisis:EMERGENCY_911}}."):
            with self.subTest(text=text):
                self.assertTrue(run_check(self.with_body(text)).errors)

    def test_a_token_works_in_a_table_row_description(self):
        data = good()
        insert(data, "national")["table"][0]["what"] = "Hard to wake? Call {{crisis:emergency_911}} first."
        self.assertEqual([], run_check(data).errors)


class CrisisCopy(Base):
    def test_the_crisis_wording_is_scanned_like_any_other_prose(self):
        def heading(d): d["crisisCopy"]["heading"] = "5 mg"
        def card(d): d["crisisCopy"]["cardHeading"] = "5 mg"
        def note(d): d["crisisCopy"]["note"] = "5 mg"
        def label(d): d["crisis"][0]["label"] = "5 mg"
        def when(d): d["crisis"][0]["when"] = "5 mg"
        for mutate in (heading, card, note, label, when):
            with self.subTest(field=mutate.__name__):
                data = good()
                mutate(data)
                self.assertErrorMentions(run_check(data), "dose")

    def test_a_label_cannot_carry_the_number_it_belongs_to(self):
        data = good()
        data["crisis"][0]["label"] = "988 Lifeline"
        self.assertErrorMentions(run_check(data), "crisis_resources.json")

    def test_the_note_may_use_the_emergency_token(self):
        data = good()
        data["crisisCopy"]["note"] = "If you are in danger right now, call {{crisis:emergency_911}}."
        self.assertEqual([], run_check(data).errors)

    def test_crisis_copy_is_required(self):
        data = good()
        del data["crisisCopy"]
        self.assertErrorMentions(run_check(data), "crisisCopy")

    def test_every_crisis_line_needs_a_label_and_a_when(self):
        for key in ("label", "when"):
            with self.subTest(missing=key):
                data = good()
                del data["crisis"][0][key]
                self.assertErrorMentions(run_check(data), key)


class ScanSeesThroughDisguises(Base):
    """A pasted number is rarely ASCII: web and Word text carries non-breaking hyphens and spaces,
    zero-width characters and full-width digits."""

    def assertRejects(self, text, *needles, field="body"):
        data = good()
        insert(data, "meds")[field] = text
        report = run_check(data)
        self.assertTrue(report.errors, "expected %r to be rejected" % text)
        if needles:
            self.assertErrorMentions(report, *needles)

    def test_a_crisis_number_with_a_non_breaking_hyphen_is_still_a_crisis_number(self):
        self.assertRejects("Call 1‑888‑568‑1112 now.", "crisis_resources.json")

    def test_a_crisis_number_with_non_breaking_spaces_is_still_a_crisis_number(self):
        self.assertRejects("Call 1 888 568 1112 now.", "crisis_resources.json")

    def test_zero_width_characters_inside_digits_do_not_hide_a_number(self):
        self.assertRejects("Call 9​8​8 any time.", "crisis_resources.json")

    def test_full_width_digits_are_read_as_digits(self):
        self.assertRejects("Call ９８８ any time.", "crisis_resources.json")

    def test_the_maine_crisis_line_without_its_leading_one_is_still_caught(self):
        self.assertRejects("Call (888) 568-1112 now.", "crisis_resources.json")

    def test_a_seven_digit_local_number_in_prose_is_a_phone_number(self):
        self.assertRejects("Call 622-7083 for help.", "verifiedDate")

    def test_en_dash_and_slash_separators_do_not_hide_a_phone_number(self):
        for text in ("Call 207–555–0100", "Call 207/555/0100", "Call 207 - 555 - 0100"):
            with self.subTest(text=text):
                self.assertRejects(text, "verifiedDate")

    def test_ordinary_short_digit_runs_are_not_phone_numbers(self):
        data = good()
        insert(data, "meds")["body"] = "Open 8 a.m. to 4 p.m. on 2 days. Text START to 678-678 or 62640."
        self.assertEqual([], run_check(data).errors)

    def test_a_row_number_that_is_a_crisis_number_fails_in_any_format(self):
        for number in ("(888) 568-1112", "1-888-568-1112", "988", "911"):
            with self.subTest(number=number):
                data = good()
                insert(data, "national")["table"][0]["number"] = number
                self.assertTrue(run_check(data).errors)

    def test_a_valid_number_whose_exchange_happens_to_be_988_is_not_a_crisis_number(self):
        data = good()
        insert(data, "national")["table"][0]["number"] = "1-800-988-0199"
        self.assertEqual([], run_check(data).errors)


class DoseSpellings(Base):
    def assertRejects(self, text):
        data = good()
        insert(data, "meds")["body"] = text
        report = run_check(data)
        self.assertTrue(report.errors, "expected %r to be rejected" % text)
        self.assertErrorMentions(report, "dose")

    def test_hyphenated_and_spelled_out_units_fail(self):
        for text in ("a 5-mg tablet", "5 milligrams", "five milligrams", "10 micrograms", "0.5mg",
                     "10 µg", "10 mcg", "20 mL", "2 grams", "5 g", "10 cc", "20 mEq"):
            with self.subTest(text=text):
                self.assertRejects(text)

    def test_tablet_and_pill_counts_fail(self):
        for text in ("Take 2 tablets", "take two pills", "1 capsule at night"):
            with self.subTest(text=text):
                self.assertRejects(text)

    def test_ordinary_numbers_and_words_that_contain_unit_letters_pass(self):
        data = good()
        insert(data, "meds")["body"] = ("Wait 2 days. A million thanks. Pills and powders from the street can "
                                         "hold fentanyl. Call by 4 p.m. Open from 8 a.m. to 4 p.m.")
        self.assertClean(run_check(data))


class Housekeeping(Base):
    def test_blank_text_is_not_content(self):
        for mutate in (lambda d: insert(d, "notes").__setitem__("body", "   "),
                       lambda d: insert(d, "meds").__setitem__("title", " "),
                       lambda d: insert(d, "meds").__setitem__("groups", [{"heading": " ", "body": "ok"}]),
                       lambda d: insert(d, "national")["table"][0].__setitem__("who", "  ")):
            with self.subTest():
                data = good()
                mutate(data)
                self.assertErrorMentions(run_check(data), "blank")

    def test_a_blank_handwriting_row_is_allowed_because_it_is_a_line_to_write_on(self):
        data = good()
        insert(data, "notes")["rows"] = ["", "", ""]
        self.assertEqual([], run_check(data).errors)

    def test_the_welcome_insert_must_be_core_and_on(self):
        data = good()
        insert(data, "intro")["core"] = False
        self.assertErrorMentions(run_check(data), "intro", "core")

    def test_generated_at_must_be_a_real_date_not_in_the_future(self):
        for value in ("2026-02-30", (TODAY + timedelta(days=1)).isoformat()):
            with self.subTest(value=value):
                data = good()
                data["generatedAt"] = value
                self.assertErrorMentions(run_check(data), "generatedAt")

    def test_a_verification_date_before_the_project_existed_is_not_a_verification(self):
        data = good()
        insert(data, "national")["table"][0]["verifiedDate"] = "1970-01-01"
        self.assertErrorMentions(run_check(data), "verifiedDate", "before")

    def test_the_aggregator_check_survives_a_trailing_dot_and_a_port(self):
        for source in ("https://wikipedia.org./page", "https://en.wikipedia.org:443/page"):
            with self.subTest(source=source):
                data = good()
                insert(data, "national")["table"][0]["source"] = source
                self.assertErrorMentions(run_check(data), "not authoritative")

    def test_extra_sources_are_optional_https_urls_and_held_to_the_same_rule(self):
        data = good()
        insert(data, "national")["table"][0]["alsoSources"] = ["https://example.org/hours"]
        self.assertEqual([], run_check(data).errors)
        insert(data, "national")["table"][0]["alsoSources"] = ["http://example.org/hours"]
        self.assertTrue(run_check(data).errors)
        insert(data, "national")["table"][0]["alsoSources"] = ["https://www.webmd.com/x"]
        self.assertErrorMentions(run_check(data), "not authoritative")


class CrisisDatesAndNumbers(Base):
    def test_a_referenced_crisis_line_with_an_unreadable_date_fails_instead_of_being_skipped(self):
        crisis = crisis_fixture()
        crisis["resources"][1]["verifiedOn"] = "2026-13-40"
        self.assertErrorMentions(run_check(crisis=crisis), "maine_crisis_line", "calendar")

    def test_a_referenced_crisis_line_verified_in_the_future_fails(self):
        crisis = crisis_fixture()
        crisis["resources"][1]["verifiedOn"] = (TODAY + timedelta(days=1)).isoformat()
        self.assertErrorMentions(run_check(crisis=crisis), "maine_crisis_line", "future")

    def test_a_missing_crisis_date_fails(self):
        crisis = crisis_fixture()
        del crisis["resources"][1]["verifiedOn"]
        self.assertErrorMentions(run_check(crisis=crisis), "maine_crisis_line", "calendar")


class NumberRows(Base):
    def test_a_number_that_cannot_exist_fails(self):
        for number in ("1-800-000-0000", "1-155-555-0101", "(207) 155-0101", "(007) 555-0101", "111", "011"):
            with self.subTest(number=number):
                data = good()
                insert(data, "insurance")["table"][0]["number"] = number
                self.assertErrorMentions(run_check(data), "valid")

    def test_one_organisation_listed_with_two_numbers_fails(self):
        data = good()
        data["inserts"][5]["table"] = [row("Example Helpline", "1-800-555-0109")]
        self.assertErrorMentions(run_check(data), "Example Helpline", "different")

    def test_one_number_in_two_formats_under_two_names_fails(self):
        data = good()
        data["inserts"][5]["table"] = [row("Another Name", "(800) 555-0101")]
        self.assertErrorMentions(run_check(data), "different")

    def test_one_number_in_two_formats_under_one_name_passes(self):
        data = good()
        data["inserts"][5]["table"] = [row("Example Helpline", "1-800-555-0101")]
        data["inserts"][5]["table"][0]["number"] = "(800) 555-0101"
        self.assertEqual([], run_check(data).errors)


class BuildGateWiring(Base):
    """The validator only protects the handout while the build actually runs it."""
    GATE = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "build_and_check.sh"
    UNIT = 'python3 "$LIB/13_Faculty_Resources/_automation/test_validate_care_inserts.py"'
    CHECK = 'python3 "$LIB/13_Faculty_Resources/_automation/validate_care_inserts.py"'
    CRISIS = 'python3 "$LIB/13_Faculty_Resources/_automation/validate_crisis_resources.py"'

    def gate(self):
        return self.GATE.read_text(encoding="utf-8")

    def test_the_build_gate_runs_the_tests_and_the_validator_before_either_site_builds(self):
        gate = self.gate()
        site_builds = gate.index('case "$SITE" in')
        for command in (self.UNIT, self.CHECK):
            with self.subTest(command=command):
                self.assertIn(command, gate)
                self.assertLess(gate.index(command), site_builds)

    def test_the_validator_runs_after_the_crisis_source_it_resolves_against(self):
        gate = self.gate()
        self.assertLess(gate.index(self.CRISIS), gate.index(self.CHECK))

    def test_the_build_gate_is_not_strict_because_a_stale_number_must_not_block_a_safety_deploy(self):
        lines = [line for line in self.gate().splitlines() if "validate_care_inserts.py" in line
                 and "test_validate" not in line]
        self.assertEqual(1, len(lines), lines)
        self.assertNotIn("--strict", lines[0])


class CommandLine(Base):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.dir = Path(self._dir.name)

    def write(self, name, value):
        path = self.dir / name
        path.write_text(value if isinstance(value, str) else json.dumps(value), encoding="utf-8")
        return str(path)

    def run_main(self, data=None, crisis=None, *extra, data_text=None):
        argv = ["--data", self.write("d.json", data_text if data_text is not None else (data or good())),
                "--schema", str(SCHEMA_PATH),
                "--crisis", self.write("c.json", crisis or crisis_fixture()),
                "--today", TODAY.isoformat(), *extra]
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = validator.main(argv)
        return code, out.getvalue()

    def stale(self):
        data = good()
        insert(data, "national")["table"][0]["verifiedDate"] = (TODAY - timedelta(days=200)).isoformat()
        return data

    def test_clean_document_exits_zero_and_says_what_it_examined(self):
        code, out = self.run_main()
        self.assertEqual(0, code)
        self.assertIn("OK", out)
        self.assertIn("12 insert", out)
        self.assertIn("3 number", out)

    def test_stale_numbers_warn_but_exit_zero_by_default(self):
        code, out = self.run_main(self.stale())
        self.assertEqual(0, code)
        self.assertIn("WARNING", out)

    def test_strict_turns_stale_warnings_into_a_failure(self):
        code, out = self.run_main(self.stale(), None, "--strict")
        self.assertEqual(1, code)
        self.assertIn("WARNING", out)

    def test_a_hard_error_exits_one(self):
        data = good()
        del insert(data, "national")["table"][0]["verifiedDate"]
        code, out = self.run_main(data)
        self.assertEqual(1, code)
        self.assertIn("FAILED", out)

    def test_invalid_json_exits_one_with_a_location(self):
        code, out = self.run_main(data_text="{ not json")
        self.assertEqual(1, code)
        self.assertIn("line 1", out)

    def test_a_missing_file_exits_one(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = validator.main(["--data", str(self.dir / "nope.json"), "--schema", str(SCHEMA_PATH),
                                   "--crisis", self.write("c.json", crisis_fixture())])
        self.assertEqual(1, code)
        self.assertIn("MISSING", out.getvalue())

    def test_a_bad_today_is_an_argument_error_not_a_pass(self):
        with self.assertRaises(SystemExit) as caught, contextlib.redirect_stderr(io.StringIO()):
            validator.main(["--today", "yesterday"])
        self.assertNotEqual(0, caught.exception.code)


class ProductionDefaults(Base):
    """What the build actually runs: no flags, the real files, the real clock."""

    def test_parser_defaults_are_the_production_files(self):
        parser = validator.build_parser()
        self.assertEqual(validator.DATA, parser.get_default("data"))
        self.assertEqual(validator.SCHEMA, parser.get_default("schema"))
        self.assertEqual(validator.CRISIS, parser.get_default("crisis"))
        self.assertEqual(ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "data" / "care-inserts.v1.json",
                         validator.DATA)
        self.assertEqual(ROOT / "crisis_resources.json", validator.CRISIS)
        self.assertIsNone(parser.get_default("today"), "production reads the clock; tests inject it")

    def test_the_real_files_pass_with_no_arguments(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = validator.main([])
        self.assertEqual(0, code, out.getvalue())
        self.assertIn("OK", out.getvalue())

    def test_every_real_number_row_carries_a_verified_date_and_an_official_source(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        rows = [r for item in data["inserts"] for r in item.get("table", [])]
        self.assertGreaterEqual(len(rows), 10)
        for entry in rows:
            self.assertRegex(entry["verifiedDate"], r"^\d{4}-\d{2}-\d{2}$", entry["who"])
            self.assertTrue(entry["source"].startswith("https://"), entry["who"])

    def test_the_real_crisis_block_resolves_to_both_required_numbers(self):
        report = validator.check(json.loads(validator.DATA.read_text(encoding="utf-8")),
                                 json.loads(validator.SCHEMA.read_text(encoding="utf-8")),
                                 json.loads(validator.CRISIS.read_text(encoding="utf-8")), TODAY)
        self.assertEqual([], report.errors)
        self.assertIn("lifeline_988", report.stats["crisisResolved"])
        self.assertIn("maine_crisis_line", report.stats["crisisResolved"])

    def test_the_real_file_has_no_fictional_numbers_or_placeholder_hosts(self):
        text = validator.DATA.read_text(encoding="utf-8")
        self.assertNotRegex(text, r"555-01\d\d", "555-01xx is the reserved fictional range")
        self.assertNotIn("example.org", text)
        self.assertNotIn("example.com", text)

    def test_the_real_file_never_types_a_crisis_number_but_does_use_the_tokens(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        text = json.dumps(data)
        self.assertIn("{{crisis:emergency_911}}", text)
        self.assertIn("{{crisis:lifeline_988}}", text)

    def test_the_poison_row_sends_a_dangerous_overdose_to_emergency_help_first(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        poison = next(r for item in data["inserts"] for r in item.get("table", []) if r["who"] == "Poison Help")
        self.assertIn("{{crisis:emergency_911}}", poison["what"])
        self.assertLess(poison["what"].index("{{crisis:emergency_911}}"), poison["what"].index("POISON"))

    def test_the_warning_signs_name_suicide_and_say_what_to_do_in_three_tiers(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        warning = next(i for i in data["inserts"] if i["id"] == "warning")
        text = json.dumps(warning)
        self.assertRegex(text, r"(?i)suicide")
        for token in ("{{crisis:lifeline_988}}", "{{crisis:emergency_911}}"):
            self.assertIn(token, text)
        self.assertRegex(text, r"(?i)emergency room")

    def test_the_home_safety_insert_names_guns_and_overdose_response(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        text = json.dumps(next(i for i in data["inserts"] if i["id"] == "safety"))
        self.assertRegex(text, r"(?i)\bguns?\b")
        self.assertRegex(text, r"(?i)naloxone")
        self.assertIn("{{crisis:emergency_911}}", text)

    def test_the_helpline_heading_does_not_promise_every_line_is_always_open(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        title = next(i for i in data["inserts"] if i["id"] == "national")["title"]
        self.assertNotRegex(title, r"(?i)any time|24")


if __name__ == "__main__":
    unittest.main()
