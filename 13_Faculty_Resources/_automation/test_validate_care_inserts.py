#!/usr/bin/env python3
"""Behaviour tests for validate_care_inserts.py (PR A of the Care aftercare packet).

The validator is the only thing standing between a typo in a patient-facing phone number and a
printed handout, so each test names the production change that would make it fail. Fixtures are
built in code with obviously fake 555 numbers; the one test that reads the real data file is the
production-default-path test, deliberately (see CLAUDE.md: a flag every test passes and production
never passes is an untested production path).
"""

import ast
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
DATA_DIR = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "data"
SCHEMA_PATH = DATA_DIR / "care-inserts.v1.schema.json"
PROFILES_SCHEMA_PATH = DATA_DIR / "care-unit-profiles.v1.schema.json"
RESIDENT_SECTION = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "resident_section.py"
TODAY = date(2026, 10, 12)

# The wallet card is a separate print (the top-level `card`), not an insert.
CANON = ["intro", "week", "callback", "warning", "safety", "family",
         "national", "insurance", "meds", "rights", "notes"]
# The owner's default set (packet design, direction 1): the welcome, the first week, warning signs and medicines.
DEFAULT_ON = ("intro", "week", "warning", "meds")


def schema():
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def profiles_schema():
    return json.loads(PROFILES_SCHEMA_PATH.read_text(encoding="utf-8"))


def crisis_fixture():
    """Resources in the shape of crisis_resources.json, verified 77 days before TODAY."""
    def res(rid, name, contact, also=None):
        out = {"id": rid, "name": name, "contact": contact, "availability": "24/7, free",
               "verifiedOn": "2026-07-27", "verificationSource": "https://example.gov/" + rid}
        if also:
            out["alsoAvailable"] = also
        return out
    return {"resources": [
        res("lifeline_988", "988 Suicide & Crisis Lifeline", "Call or text 988", "Chat at chat.988lifeline.org"),
        res("maine_crisis_line", "Maine Crisis Line", "1-888-568-1112"),
        res("crisis_text_line", "Crisis Text Line", "Text HOME to 741741"),
        res("emergency_911", "Emergency", "911"),
        res("veterans_crisis_line", "Veterans Crisis Line", "Dial 988 then press 1", "Text 838255"),
    ]}


def registered(length=None):
    """A registered crisis number read from the fixture at run time (never typed into a test)."""
    numbers = validator.registered_crisis_digits(crisis_fixture())
    return next(n for n in numbers if length is None or len(n) == length)


def row(who="Example Helpline", number="1-800-555-0101", verified="2026-10-12"):
    return {"who": who, "number": number, "what": "Help with example things, 24/7",
            "source": "https://www.samhsa.gov/" + who.lower().replace(" ", "-"), "verifiedDate": verified}


def good():
    inserts = []
    for insert_id in CANON:
        inserts.append({"id": insert_id, "title": "Title " + insert_id, "core": insert_id == "intro",
                        "defaultOn": insert_id in DEFAULT_ON,
                        "body": "A short plain sentence."})
    by_id = {insert["id"]: insert for insert in inserts}
    by_id["intro"]["body"] = "A short plain sentence. Call the unit at {{unitPhone}} if you need help."
    by_id["national"]["table"] = [row("Example Helpline", "1-800-555-0101"), row("Example Text Line", "211")]
    by_id["insurance"]["table"] = [row("Example Coverage Office", "1-800-555-0102")]
    def line(ref):
        return {"ref": ref, "when": "When to use this line."}
    return {"schemaVersion": 1, "generatedAt": "2026-10-12",
            "crisisCopy": {"heading": "If things feel unsafe, call right away",
                           "cardHeading": "If things feel unsafe",
                           "note": "You can call for someone else too."},
            "crisis": [line("lifeline_988"), line("maine_crisis_line"), line("crisis_text_line"), line("emergency_911")],
            "card": {"title": "Wallet crisis card", "body": "Cut along the dashed lines.", "mineTitle": "My numbers",
                     "rows": ["My person (name and phone)", "My clinic (name and phone)"]},
            "inserts": inserts}


def run_check(data=None, crisis=None, today=TODAY):
    return validator.check(good() if data is None else data, schema(),
                           crisis_fixture() if crisis is None else crisis, today)


def profile(**overrides):
    """A candidate profile with fictional contacts and actual-check provenance, never owner approval."""
    checked_on = overrides.pop("checkedOn", "2026-10-01")
    checked_by = overrides.pop("checkedBy", "unit charge nurse")
    out = {"id": "test-unit", "label": "Test unit", "org": "Test Org", "brandingApproved": True,
           "unitName": "Test Unit 4 East", "unitPhone": "(207) 555-0142", "unitPurpose": "questions about your discharge papers",
           "unitHours": "Monday to Friday, 9 a.m. to 5 p.m.", "callbackProgram": True,
           "callbackTeam": "Test follow-up team", "callbackPhone": "(207) 555-0143",
           "callbackHours": "Monday to Friday, 9 a.m. to 5 p.m.",
           "callbackFallback": "follow the contact instructions in your After Visit Summary"}
    out.update(overrides)
    fields = ["identity", "contact"] + (["callback"] if out["callbackProgram"] else []) + (["branding"] if out["brandingApproved"] else [])
    out.setdefault("verification", [{"field": field, "checkedOn": checked_on, "checkedBy": checked_by,
                                     "evidence": "Direct confirmation with the responsible unit team"} for field in fields])
    return out


def run_profiles(profiles=None, crisis=None, data=None, today=TODAY, doc=None):
    if doc is None:
        doc = {"schemaVersion": 1, "profiles": [profile()] if profiles is None else profiles}
    return validator.check_profiles(doc, profiles_schema(), crisis_fixture() if crisis is None else crisis,
                                    good() if data is None else data, today)


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
        self.assertEqual(11, stats["inserts"])
        self.assertEqual(len(DEFAULT_ON), stats["onByDefault"])
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
        data["crisis"].append({"ref": "no_such_line", "when": "y"})
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

    def test_988_must_be_the_whole_contact_number_not_a_segment_of_another_number(self):
        crisis = crisis_fixture()
        crisis["resources"][0]["contact"] = "Call 1-800-988-0199"
        self.assertErrorMentions(run_check(crisis=crisis), "lifeline_988", "988")

    def test_the_chat_address_in_also_available_cannot_stand_in_for_the_contact_number(self):
        crisis = crisis_fixture()
        crisis["resources"][0]["contact"] = "Call 1-800-988-0199"
        crisis["resources"][0]["alsoAvailable"] = "Chat at chat.988lifeline.org"
        self.assertErrorMentions(run_check(crisis=crisis), "lifeline_988")

    def test_the_maine_line_must_be_exact_not_a_longer_number_that_starts_with_it(self):
        for contact in ("1-888-568-11122", "11-888-568-1112", "Call 1-800-568-1112"):
            with self.subTest(contact=contact):
                crisis = crisis_fixture()
                crisis["resources"][1]["contact"] = contact
                self.assertErrorMentions(run_check(crisis=crisis), "maine_crisis_line", "1-888-568-1112")

    def test_the_real_registered_phrasing_still_passes(self):
        crisis = crisis_fixture()
        crisis["resources"][0]["contact"] = "Call or text 988"
        crisis["resources"][1]["contact"] = "Call 1-888-568-1112 or dial 711"
        self.assertEqual([], run_check(crisis=crisis).errors)

    def test_a_duplicate_reference_fails(self):
        data = good()
        data["crisis"].append({"ref": "emergency_911", "when": "y"})
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

    def test_the_print_order_and_the_schema_name_the_same_inserts(self):
        # Rewritten from the old twelve-insert contract: the card left the packet pages.
        self.assertEqual(CANON, list(validator.PRINT_ORDER))
        self.assertEqual(CANON, schema()["definitions"]["insert"]["properties"]["id"]["enum"])

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

    def test_source_is_required_and_must_be_https(self):
        data = good()
        del insert(data, "national")["table"][0]["source"]
        self.assertErrorMentions(run_check(data), "source")
        data = good()
        insert(data, "national")["table"][0]["source"] = "http://example.org/x"
        self.assertTrue(run_check(data).errors)

    def test_only_approved_source_hosts_count_as_provenance(self):
        for source in ("https://samhsa.example/x", "https://notsamhsa.gov/x", "https://evil.com/samhsa.gov",
                       "https://samhsa.gov.evil.com/x", "https://samhsa.gov@evil.com/x", "https://example.org/x",
                       "https://en.wikipedia.org/wiki/SAMHSA", "https://www.healthline.com/x", "https://www.webmd.com/x"):
            with self.subTest(source=source):
                data = good()
                insert(data, "national")["table"][0]["source"] = source
                self.assertErrorMentions(run_check(data), "approved source")

    def test_the_approved_hosts_and_their_subdomains_pass_including_odd_but_equivalent_spellings(self):
        for source in ("https://www.samhsa.gov/find-help", "https://samhsa.gov/x", "https://samhsa.gov./x",
                       "https://SAMHSA.GOV:443/x", "https://www.maine.gov/dhhs/ofi", "https://211maine.org/",
                       "https://www.nnepc.org/about"):
            with self.subTest(source=source):
                data = good()
                insert(data, "national")["table"][0]["source"] = source
                self.assertEqual([], run_check(data).errors)

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
        # `label` was retired (direction 7): the card's own fields take its place in this scan.
        def heading(d): d["crisisCopy"]["heading"] = "5 mg"
        def card(d): d["crisisCopy"]["cardHeading"] = "5 mg"
        def note(d): d["crisisCopy"]["note"] = "5 mg"
        def when(d): d["crisis"][0]["when"] = "5 mg"
        def card_title(d): d["card"]["title"] = "5 mg"
        def card_body(d): d["card"]["body"] = "5 mg"
        def card_mine(d): d["card"]["mineTitle"] = "5 mg"
        def card_rows(d): d["card"]["rows"] = ["fine", "5 mg"]
        for mutate in (heading, card, note, when, card_title, card_body, card_mine, card_rows):
            with self.subTest(field=mutate.__name__):
                data = good()
                mutate(data)
                self.assertErrorMentions(run_check(data), "dose")

    def test_a_when_line_cannot_carry_the_number_it_belongs_to(self):
        # Rewritten from the retired `label` test: the line's words still may not type its number.
        data = good()
        data["crisis"][0]["when"] = "Call %s for help." % registered(3)
        self.assertErrorMentions(run_check(data), "crisis_resources.json")

    def test_a_crisis_line_label_is_rejected_because_the_official_name_comes_from_the_governed_record(self):
        data = good()
        data["crisis"][0]["label"] = "Suicide and crisis line"
        self.assertErrorMentions(run_check(data), "label")

    def test_the_note_may_use_the_emergency_token(self):
        data = good()
        data["crisisCopy"]["note"] = "If you are in danger right now, call {{crisis:emergency_911}}."
        self.assertEqual([], run_check(data).errors)

    def test_crisis_copy_is_required(self):
        data = good()
        del data["crisisCopy"]
        self.assertErrorMentions(run_check(data), "crisisCopy")

    def test_every_crisis_line_needs_a_ref_and_a_when(self):
        for key in ("ref", "when"):
            with self.subTest(missing=key):
                data = good()
                del data["crisis"][0][key]
                self.assertErrorMentions(run_check(data), key)

    def test_every_referenced_line_must_be_governed_as_24_7_because_the_welcome_says_they_answer_any_time(self):
        for availability in ("Weekdays, 8 a.m. to 8 p.m.", "", "Most of the day, 24/7 on weekends"):
            with self.subTest(availability=availability):
                crisis = crisis_fixture()
                crisis["resources"][2]["availability"] = availability
                self.assertErrorMentions(run_check(crisis=crisis), "crisis_text_line", "24/7")
        crisis = crisis_fixture()
        del crisis["resources"][2]["availability"]
        self.assertErrorMentions(run_check(crisis=crisis), "crisis_text_line", "24/7")

    def test_a_24_7_availability_in_any_case_or_with_more_words_passes(self):
        for availability in ("24/7", "24/7, free, confidential", " 24/7 ", "24/7 except holidays"):
            with self.subTest(availability=availability):
                crisis = crisis_fixture()
                crisis["resources"][2]["availability"] = availability
                self.assertEqual([], run_check(crisis=crisis).errors)

    def test_a_registered_line_the_packet_does_not_reference_is_not_held_to_it(self):
        crisis = crisis_fixture()
        crisis["resources"][4]["availability"] = "Weekdays"
        self.assertEqual([], run_check(crisis=crisis).errors)


class WalletCard(Base):
    """The card is a separate, optional one-sided print (direction 5), built from the top-level `card`."""

    def test_the_card_object_is_required(self):
        data = good()
        del data["card"]
        self.assertErrorMentions(run_check(data), "card")

    def test_every_card_field_is_required(self):
        for key in ("title", "body", "mineTitle", "rows"):
            with self.subTest(missing=key):
                data = good()
                del data["card"][key]
                self.assertErrorMentions(run_check(data), key)

    def test_an_unknown_card_field_fails(self):
        data = good()
        data["card"]["heading"] = "typo"
        self.assertTrue(run_check(data).errors)

    def test_the_card_text_limits_hold(self):
        for key, length in (("title", 81), ("body", 201), ("mineTitle", 41)):
            with self.subTest(field=key):
                data = good()
                data["card"][key] = "x" * length
                self.assertTrue(run_check(data).errors)
                data["card"][key] = "x" * (length - 1)
                self.assertEqual([], run_check(data).errors)

    def test_the_card_holds_one_to_four_non_blank_write_in_rows_of_sixty_characters_or_fewer(self):
        for rows in ([], ["a", "b", "c", "d", "e"], ["fine", "   "], ["fine", ""], ["x" * 61]):
            with self.subTest(rows=rows):
                data = good()
                data["card"]["rows"] = rows
                self.assertTrue(run_check(data).errors)
        for rows in (["a"], ["a", "b", "c", "d"], ["x" * 60]):
            with self.subTest(rows=rows):
                data = good()
                data["card"]["rows"] = rows
                self.assertEqual([], run_check(data).errors)

    def test_the_card_is_no_longer_a_packet_insert(self):
        data = good()
        data["inserts"].insert(10, {"id": "card", "title": "Wallet crisis card", "core": False, "defaultOn": False,
                                    "body": "Cut here."})
        self.assertTrue(run_check(data).errors)
        self.assertNotIn("card", validator.PRINT_ORDER)

    def test_the_card_text_is_held_to_the_number_and_markup_rules(self):
        for mutate, needle in ((lambda d: d["card"].__setitem__("body", "Call %s." % registered(3)), "crisis_resources.json"),
                               (lambda d: d["card"].__setitem__("rows", ["Clinic 207-555-0100"]), "phone number"),
                               (lambda d: d["card"].__setitem__("title", "Card <b>"), "markup")):
            with self.subTest(needle=needle):
                data = good()
                mutate(data)
                self.assertErrorMentions(run_check(data), needle)

    def test_the_card_holds_at_most_five_crisis_lines(self):
        crisis = crisis_fixture()
        crisis["resources"].append(dict(crisis["resources"][2], id="sixth_line", name="Sixth line"))
        data = good()
        data["crisis"].append({"ref": "veterans_crisis_line", "when": "When to use this line."})
        self.assertEqual([], run_check(data, crisis).errors, "five lines fit")
        data["crisis"].append({"ref": "sixth_line", "when": "When to use this line."})
        report = run_check(data, crisis)
        self.assertErrorMentions(report, "wallet card", "5")
        self.assertEqual(1, len(report.errors), report.errors)


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

    def test_spelled_out_quantities_fail_for_every_unit_not_only_the_long_ones(self):
        for text in ("five mg", "take five mg", "five grams", "twenty mEq", "twenty-five mg", "one hundred mcg",
                     "half a gram", "ten ml", "two g", "fifty cc", "thirty-five micrograms", "Seven IU"):
            with self.subTest(text=text):
                self.assertRejects(text)

    def test_number_words_beside_ordinary_words_do_not_trip_the_dose_rule(self):
        data = good()
        insert(data, "meds")["body"] = ("Call one person you trust. Wait two days. Ten minutes of rest helps. "
                                         "A great plan, five good habits, one great day, twenty questions.")
        self.assertEqual([], run_check(data).errors)

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

    def test_the_welcome_insert_must_keep_a_unit_token(self):
        # The always-on welcome page is what makes every Final copy name the unit, and so need a confirmed unit profile. Removing its
        # tokens would quietly lift that requirement. Fails if the validator stops requiring a token on the always-on page.
        data = good()
        intro = insert(data, "intro")
        intro["body"] = intro["body"].replace("{{unitPhone}}", "the unit")
        intro["signoff"] = "With care, from the team"
        self.assertErrorMentions(run_check(data), "intro", "unitPhone")
        data = good()
        intro = insert(data, "intro")
        intro["signoff"] = "With care, from the team"
        self.assertEqual([e for e in run_check(data).errors if "must carry" in e], [], "one token is enough")

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

    def test_the_host_check_survives_a_trailing_dot_and_a_port_on_an_unapproved_host(self):
        for source in ("https://wikipedia.org./page", "https://en.wikipedia.org:443/page"):
            with self.subTest(source=source):
                data = good()
                insert(data, "national")["table"][0]["source"] = source
                self.assertErrorMentions(run_check(data), "approved source")

    def test_extra_sources_are_optional_https_urls_and_held_to_the_same_rule(self):
        data = good()
        insert(data, "national")["table"][0]["alsoSources"] = ["https://www.samhsa.gov/hours"]
        self.assertEqual([], run_check(data).errors)
        insert(data, "national")["table"][0]["alsoSources"] = ["http://www.samhsa.gov/hours"]
        self.assertTrue(run_check(data).errors)
        insert(data, "national")["table"][0]["alsoSources"] = ["https://www.webmd.com/x"]
        self.assertErrorMentions(run_check(data), "approved source")


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


class UnitWording(Base):
    """Direction 3: never imply the unit gives round-the-clock cover, and every 'the unit' carries the unit's token so
    the confirmed-phone rule can see the promise (packet design, Revision 2)."""

    def with_text(self, text, field="body", insert_id="family"):
        data = good()
        insert(data, insert_id)[field] = text
        return data

    def test_a_sentence_that_refers_to_the_unit_may_not_promise_availability(self):
        for text in ("Reach out to us or to a crisis line, any time.",
                     "We answer 24/7.",
                     "Our team is here day or night.",
                     "Call our team anytime.",
                     "The phone is ours, around the clock.",
                     "Call the unit at {{unitPhone}} at all hours.",
                     "{{unitName}} answers round the clock.",
                     "Call {{unitPhone}}; someone answers 24 hours a day.",
                     "WE ANSWER ANY TIME."):
            with self.subTest(text=text):
                self.assertErrorMentions(run_check(self.with_text(text)), "availability")

    def test_availability_without_the_unit_and_the_unit_without_availability_pass(self):
        for text in ("If you feel worse instead of better, do not wait. Call or text one of the numbers in the box "
                     "below. They answer any time, day or night.",
                     "Call us. The crisis lines answer any time.",
                     "Trust your gut. Business hours vary, and the helpline is open 24/7.",
                     "Call the unit at {{unitPhone}} and we will help you find another way.",
                     "Someone from our team will call to see how the first days are going."):
            with self.subTest(text=text):
                self.assertEqual([], run_check(self.with_text(text)).errors)

    def test_every_patient_readable_field_is_held_to_the_availability_rule(self):
        def body(d): insert(d, "family")["body"] = "We answer any time."
        def tip(d): insert(d, "family")["tip"] = "We answer any time."
        def signoff(d): insert(d, "intro")["signoff"] = "We answer any time."
        def bullet(d): insert(d, "meds")["bullets"] = ["We answer any time."]
        def row_label(d): insert(d, "week")["rows"] = ["We answer any time"]
        def group(d): insert(d, "warning")["groups"] = [{"heading": "Help", "bullets": ["We answer any time."]}]
        def table_what(d): insert(d, "national")["table"][0]["what"] = "We answer any time."
        def when(d): d["crisis"][0]["when"] = "We answer any time."
        def note(d): d["crisisCopy"]["note"] = "We answer any time."
        def card_body(d): d["card"]["body"] = "We answer any time."
        def card_row(d): d["card"]["rows"] = ["We answer any time"]
        def title(d): insert(d, "callback")["title"] = "We answer any time"
        def heading(d): insert(d, "warning")["groups"] = [{"heading": "We answer any time", "body": "Fine."}]
        for mutate in (body, tip, signoff, bullet, row_label, group, table_what, when, note, card_body, card_row,
                       title, heading):
            with self.subTest(field=mutate.__name__):
                data = good()
                mutate(data)
                self.assertErrorMentions(run_check(data), "availability")

    def test_a_sentence_that_says_the_unit_must_carry_the_units_token(self):
        for text in ("Call the unit.",
                     "If you cannot pay for a medicine, call the unit before you go without it.",
                     "Call the unit. Its number is {{unitPhone}}.",
                     "Ask THE UNIT for help.",
                     "The unit's nurses can help."):
            with self.subTest(text=text):
                self.assertErrorMentions(run_check(self.with_text(text)), "the unit", "{{unitPhone}}")

    def test_a_sentence_that_says_the_unit_with_a_token_passes(self):
        for text in ("Call the unit at {{unitPhone}}.",
                     "The team on {{unitName}} is the unit you stayed on.",
                     "Unit phone: {{unitPhone}}.",
                     "The units nearby can help."):
            with self.subTest(text=text):
                self.assertEqual([], run_check(self.with_text(text)).errors)

    def test_titles_and_headings_are_exempt_from_the_token_rule(self):
        def title(d): insert(d, "rights")["title"] = "Reaching the unit and your rights"
        def heading(d): insert(d, "warning")["groups"] = [{"heading": "Calling the unit", "body": "Fine."}]
        def crisis_heading(d): d["crisisCopy"]["heading"] = "Before you call the unit"
        def card_title(d): d["card"]["title"] = "The unit card"
        def mine_title(d): d["card"]["mineTitle"] = "Not the unit"
        for mutate in (title, heading, crisis_heading, card_title, mine_title):
            with self.subTest(field=mutate.__name__):
                data = good()
                mutate(data)
                self.assertEqual([], run_check(data).errors)

    def test_body_text_rows_and_card_lines_are_not_exempt_from_the_token_rule(self):
        def tip(d): insert(d, "meds")["tip"] = "Call the unit."
        def row_label(d): insert(d, "week")["rows"] = ["The unit's nurse"]
        def card_body(d): d["card"]["body"] = "Show this to the unit."
        def card_row(d): d["card"]["rows"] = ["The unit"]
        def when(d): d["crisis"][0]["when"] = "If the unit is closed."
        for mutate in (tip, row_label, card_body, card_row, when):
            with self.subTest(field=mutate.__name__):
                data = good()
                mutate(data)
                self.assertErrorMentions(run_check(data), "the unit")


class RegisteredCrisisDigits(Base):
    """The payload's `crisisNumbers`: every registered crisis number, so the browser sees the set this validator scans
    prose against. The oracle here is computed independently of crisis_numbers()."""

    @staticmethod
    def independent(crisis):
        import re
        out = set()
        for resource in crisis["resources"]:
            for field in ("contact", "alsoAvailable"):
                for token in re.findall(r"\d[\d\-\s().]*\d", str(resource.get(field) or "")):
                    digits = re.sub(r"\D", "", token)
                    if len(digits) == 11 and digits[0] == "1":
                        digits = digits[1:]
                    if len(digits) >= 3:
                        out.add(digits)
        return sorted(out)

    def test_the_list_is_every_registered_number_sorted_once_each(self):
        crisis = crisis_fixture()
        digits = validator.registered_crisis_digits(crisis)
        self.assertEqual(self.independent(crisis), digits)
        self.assertEqual(sorted(set(digits)), digits)

    def test_a_number_registered_only_in_also_available_is_listed(self):
        crisis = crisis_fixture()
        contact_only = self.independent({"resources": [{"contact": r["contact"]} for r in crisis["resources"]]})
        extra = set(validator.registered_crisis_digits(crisis)) - set(contact_only)
        self.assertTrue(extra, "the fixture registers a number in alsoAvailable alone (else this test is vacuous)")

    def test_a_leading_one_is_dropped_and_a_keypad_step_is_not_a_number(self):
        digits = validator.registered_crisis_digits(crisis_fixture())
        self.assertTrue(all(len(d) >= 3 for d in digits))
        self.assertFalse(any(len(d) == 11 for d in digits))

    def test_the_real_governed_record_matches_the_independent_reading(self):
        crisis = json.loads(validator.CRISIS.read_text(encoding="utf-8"))
        self.assertEqual(self.independent(crisis), validator.registered_crisis_digits(crisis))


class UnitProfiles(Base):
    """care-unit-profiles.v1.json: a confirmed unit profile is data, validated at build time (Revision 2)."""

    def test_a_valid_profile_and_an_empty_list_pass(self):
        self.assertClean(run_profiles())
        self.assertClean(run_profiles([]))
        self.assertEqual(1, run_profiles().stats["profiles"])

    def test_the_shape_is_closed_and_complete(self):
        for key in profile():
            with self.subTest(missing=key):
                p = profile()
                del p[key]
                self.assertErrorMentions(run_profiles([p]), key)
        self.assertTrue(run_profiles([profile(extra="x")]).errors)
        self.assertTrue(run_profiles([profile(id="Test Unit")]).errors)
        self.assertTrue(run_profiles([profile(id="x" * 41)]).errors)
        self.assertTrue(run_profiles([profile(id="unit-%d" % n, unitPhone="(207) 555-01%02d" % n)
                                      for n in range(13)]).errors, "at most twelve profiles")
        self.assertTrue(run_profiles(doc={"schemaVersion": 1}).errors)
        self.assertTrue(run_profiles(doc={"schemaVersion": 2, "profiles": []}).errors)

    def test_two_profiles_with_one_id_fail(self):
        report = run_profiles([profile(), profile(unitPhone="(207) 555-0143")])
        self.assertErrorMentions(report, "test-unit", "twice")

    def test_the_unit_phone_takes_the_usual_shapes(self):
        for phone in ("(207) 555-0142", "207-555-0142", "1-207-555-0142", "207.555.0142", "+1 207 555 0142",
                      "2075550142"):
            with self.subTest(phone=phone):
                self.assertClean(run_profiles([profile(unitPhone=phone)]))

    def test_a_unit_phone_that_is_not_a_ten_digit_number_patients_can_call_fails(self):
        for phone in ("555-0142", "(207) 555-014", "(207) 555-01423", "(207) 411-0142", "(211) 555-0142",
                      "(107) 555-0142", "(207) 155-0142", "207-555-0142 ext 5", "Call 207-555-0142",
                      "2-0-7-5-5-5", "22075550142"):
            with self.subTest(phone=phone):
                self.assertErrorMentions(run_profiles([profile(unitPhone=phone)]), "unitPhone")

    def test_a_registered_crisis_number_is_never_the_unit_phone(self):
        number = registered(10)
        for phone in (number, "1-%s-%s-%s" % (number[:3], number[3:6], number[6:])):
            with self.subTest(phone=phone):
                self.assertErrorMentions(run_profiles([profile(unitPhone=phone)]), "unitPhone", "crisis")

    def test_no_registered_ten_digit_crisis_number_in_the_real_record_can_be_the_unit_phone(self):
        crisis = json.loads(validator.CRISIS.read_text(encoding="utf-8"))
        tens = [d for d in validator.registered_crisis_digits(crisis) if len(d) == 10]
        self.assertTrue(tens, "the real record registers a ten-digit line (else this test is vacuous)")
        for number in tens:
            with self.subTest(number=number):
                self.assertErrorMentions(run_profiles([profile(unitPhone=number)], crisis=crisis), "crisis")

    def test_a_helpline_table_number_is_never_the_unit_phone(self):
        number = insert(good(), "insurance")["table"][0]["number"]
        self.assertErrorMentions(run_profiles([profile(unitPhone=number)]), "unitPhone", "helpline")

    def test_the_confirmation_date_is_a_real_past_date_after_the_project_began(self):
        for value, needle in (("2026-02-30", "calendar"), ((TODAY + timedelta(days=1)).isoformat(), "future"),
                              ("2025-12-31", "before"), ("1970-01-01", "before")):
            with self.subTest(value=value):
                self.assertErrorMentions(run_profiles([profile(checkedOn=value)]), "checkedOn", needle)
        self.assertTrue(run_profiles([profile(checkedOn="12 Oct 2026")]).errors)
        self.assertClean(run_profiles([profile(checkedOn=TODAY.isoformat())]))

    def test_a_confirmation_over_the_freshness_limit_warns_and_is_not_an_error(self):
        self.assertClean(run_profiles([profile(checkedOn=(TODAY - timedelta(days=89)).isoformat())]))
        report = run_profiles([profile(checkedOn=(TODAY - timedelta(days=90)).isoformat())])
        self.assertEqual([], report.errors)
        self.assertEqual(1, len(report.warnings))
        self.assertIn("90 days", report.warnings[0])
        self.assertIn("test-unit", report.warnings[0])

    def test_the_confirmer_is_a_role_never_a_number_or_an_email(self):
        for role in ("nurse 2", "Jo at 207-555-0100", "x@example.org", "nurse＠ward", "   ", "nurse ３"):
            with self.subTest(role=role):
                self.assertErrorMentions(run_profiles([profile(checkedBy=role)]), "checkedBy")
        for role in ("unit charge nurse", "nurse manager", "unit clerk"):
            with self.subTest(role=role):
                self.assertClean(run_profiles([profile(checkedBy=role)]))

    def test_the_printed_names_are_held_to_the_sheet_rules(self):
        crisis_code = registered(3)
        cases = (("4 East <b>", "markup"), ("{{unitName}}", "brace"), ("4 East\u0007", "control"),
                 ("4​East", "control"), ("Call 207 555 0100", "phone"), ("Unit " + crisis_code, "crisis"),
                 ("5 mg Unit", "dose"), ("Verification due unit", "metadata"), ("Verified unit", "verif"),
                 ("24/7 Crisis Unit", "availability"), ("   ", "blank"))
        for key in ("label", "org", "unitName"):
            for value, needle in cases:
                with self.subTest(field=key, value=value):
                    self.assertErrorMentions(run_profiles([profile(**{key: value})]), key, needle)

    def test_no_name_carries_a_phrase_the_resident_build_rewrites(self):
        # A needle with markup is already refused as markup; one longer than a name field cannot fit in it.
        text_needles = [n for n in validator.RESIDENT_REBRAND_NEEDLES if "<" not in n and len(n) <= 58]
        self.assertGreaterEqual(len(text_needles), 2)
        for key in ("label", "org", "unitName"):
            for needle in text_needles:
                value = "x " + needle
                with self.subTest(field=key, needle=needle):
                    self.assertErrorMentions(run_profiles([profile(**{key: value})]), key, "resident")
        self.assertErrorMentions(run_profiles([profile(label="ms3 clerkship unit")]), "label", "resident")

    def test_the_rebrand_phrases_mirror_the_resident_builds_own_list(self):
        # resident_section.py rebuilds a directory at import time, so the list is read from its source, not imported.
        tree = ast.parse(RESIDENT_SECTION.read_text(encoding="utf-8"))
        node = next(n for n in ast.walk(tree) if isinstance(n, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == "RESIDENT_REBRAND" for t in n.targets))
        needles = tuple(needle for needle, _replacement in ast.literal_eval(node.value))
        self.assertEqual(needles, validator.RESIDENT_REBRAND_NEEDLES)

    def test_approved_branding_needs_the_organization_it_approves(self):
        self.assertErrorMentions(run_profiles([profile(brandingApproved=True, org=None)]), "brandingApproved", "org")
        self.assertClean(run_profiles([profile(brandingApproved=False, org=None)]))
        self.assertErrorMentions(run_profiles([profile(brandingApproved=False, org="Test Org")]), "brandingApproved", "org")
        self.assertTrue(run_profiles([profile(org="")]).errors, "an empty org is not null")


class ProfileSafetyContract(Base):
    def test_required_verification_categories_are_exact_unique_and_conditional(self):
        for field in ("identity", "contact", "callback", "branding"):
            p = profile()
            p["verification"] = [entry for entry in p["verification"] if entry["field"] != field]
            self.assertErrorMentions(run_profiles([p]), "verification", field)
        p = profile()
        p["verification"][-1] = copy.deepcopy(p["verification"][0])
        self.assertErrorMentions(run_profiles([p]), "verification", "twice")
        p = profile(brandingApproved=False, org=None, callbackProgram=False,
                    callbackTeam="", callbackPhone="", callbackHours="", callbackFallback="")
        self.assertClean(run_profiles([p]))
        p["verification"].append({"field": "branding", "checkedOn": "2026-10-01",
                                  "checkedBy": "unit manager", "evidence": "Direct confirmation"})
        self.assertErrorMentions(run_profiles([p]), "verification", "branding")

    def test_no_callback_program_means_no_callback_claims(self):
        for field in ("callbackTeam", "callbackPhone", "callbackHours", "callbackFallback"):
            p = profile(callbackProgram=False, callbackTeam="", callbackPhone="", callbackHours="", callbackFallback="")
            p[field] = profile()[field]
            self.assertErrorMentions(run_profiles([p]), field, "callbackProgram")

    def test_callback_program_needs_all_four_operational_fields(self):
        for field in ("callbackTeam", "callbackPhone", "callbackHours", "callbackFallback"):
            self.assertErrorMentions(run_profiles([profile(**{field: ""})]), field)
        self.assertErrorMentions(run_profiles([profile(callbackPhone=registered(10))]), "callbackPhone", "crisis")
        self.assertErrorMentions(run_profiles([profile(callbackFallback="call someone.")]), "callbackFallback", "punctuation")

    def test_contact_purpose_and_staffed_hours_are_required_plain_text(self):
        for field in ("unitPurpose", "unitHours", "callbackTeam", "callbackHours", "callbackFallback"):
            for bad in (" ", "<b>Help</b>", "{{unitPhone}}", "help\u0007", "take 5 mg", "Call " + registered(3)):
                self.assertErrorMentions(run_profiles([profile(**{field: bad})]), field)

    def test_verified_all_day_staffed_hours_are_allowed_in_both_hours_fields(self):
        for field in ("unitHours", "callbackHours"):
            for hours in ("24/7", "24 hours a day, 7 days a week"):
                with self.subTest(field=field, hours=hours):
                    self.assertClean(run_profiles([profile(**{field: hours})]))

    def test_all_day_hours_still_require_the_applicable_verification(self):
        for field, group in (("unitHours", "contact"), ("callbackHours", "callback")):
            with self.subTest(field=field, group=group):
                p = profile(**{field: "24/7"})
                p["verification"] = [entry for entry in p["verification"] if entry["field"] != group]
                self.assertErrorMentions(run_profiles([p]), "verification", group)

    def test_all_day_availability_is_still_refused_outside_staffed_hours(self):
        for field in ("label", "org", "unitName", "unitPurpose", "callbackTeam", "callbackFallback"):
            for value in ("24/7", "24 hours a day"):
                with self.subTest(field=field, value=value):
                    self.assertErrorMentions(run_profiles([profile(**{field: value})]), field, "availability")

    def test_all_day_hours_keep_the_other_patient_text_guards(self):
        cases = (("24/7; call 207-555-0100", "phone"), ("24/7; take 5 mg", "dose"),
                 ("<b>24/7</b>", "markup"), ("24/7 {{unitName}}", "brace"),
                 ("24/7\u0007", "control"), ("24/7; call " + registered(3), "crisis"),
                 ("24/7; Verification due", "metadata"))
        for field in ("unitHours", "callbackHours"):
            for value, needle in cases:
                with self.subTest(field=field, value=value):
                    self.assertErrorMentions(run_profiles([profile(**{field: value})]), field, needle)

    def test_verification_evidence_is_not_blank_and_cannot_claim_approval(self):
        p = profile()
        p["verification"][0]["evidence"] = " "
        self.assertErrorMentions(run_profiles([p]), "evidence")
        p = profile()
        p["verification"][0]["approved"] = True
        self.assertErrorMentions(run_profiles([p]), "approved")
        self.assertErrorMentions(run_profiles([profile(approved=True)]), "approved")

    def test_oldest_actual_check_controls_the_ninety_calendar_day_window(self):
        p = profile(checkedOn="2026-10-12")
        p["verification"][0]["checkedOn"] = "2026-07-14"
        report = run_profiles([p])
        self.assertEqual("2026-07-14", report.stats.get("oldestConfirmed"))
        self.assertEqual(1, len(report.warnings), "day 90 has expired even when the other checks are newer")
        self.assertEqual("2026-10-11", validator.usable_through(date(2026, 7, 14)))
        self.assertEqual("2026-10-12", validator.expires_on(date(2026, 7, 14)))
        self.assertEqual(180, validator.STALE_AFTER_DAYS, "the unrelated helpline policy does not change")


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

    def run_main(self, data=None, crisis=None, *extra, data_text=None, profiles=None):
        argv = ["--data", self.write("d.json", data_text if data_text is not None else (data or good())),
                "--schema", str(SCHEMA_PATH),
                "--crisis", self.write("c.json", crisis or crisis_fixture()),
                "--profiles", self.write("p.json", {"schemaVersion": 1,
                                                    "profiles": [profile()] if profiles is None else profiles}),
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
        self.assertIn("11 insert", out)
        self.assertIn("3 number", out)
        self.assertIn("p.json: OK - 1 candidate unit profile", out)

    def test_an_empty_profiles_file_is_reported_not_skipped(self):
        code, out = self.run_main(profiles=[])
        self.assertEqual(0, code)
        self.assertIn("p.json: OK - 0 candidate unit profile", out)

    def test_a_bad_profile_fails_the_run_and_names_the_profiles_file(self):
        code, out = self.run_main(profiles=[profile(unitPhone="(207) 411-0142")])
        self.assertEqual(1, code)
        self.assertIn("p.json: FAILED", out)
        self.assertIn("unitPhone", out)

    def test_a_stale_profile_warns_and_strict_fails_it(self):
        old = [profile(checkedOn=(TODAY - timedelta(days=200)).isoformat())]
        code, out = self.run_main(profiles=old)
        self.assertEqual(0, code)
        self.assertIn("WARNING", out)
        code, out = self.run_main(None, None, "--strict", profiles=old)
        self.assertEqual(1, code)

    def test_a_missing_profiles_file_exits_one(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = validator.main(["--data", self.write("d.json", good()), "--schema", str(SCHEMA_PATH),
                                   "--crisis", self.write("c.json", crisis_fixture()),
                                   "--profiles", str(self.dir / "nope.json"), "--today", TODAY.isoformat()])
        self.assertEqual(1, code)
        self.assertIn("nope.json: MISSING", out.getvalue())

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
        self.assertEqual(validator.PROFILES, parser.get_default("profiles"))
        self.assertEqual(validator.PROFILES_SCHEMA, parser.get_default("profiles_schema"))
        self.assertEqual(DATA_DIR / "care-inserts.v1.json", validator.DATA)
        self.assertEqual(DATA_DIR / "care-unit-profiles.v1.json", validator.PROFILES)
        self.assertEqual(PROFILES_SCHEMA_PATH, validator.PROFILES_SCHEMA)
        self.assertEqual(ROOT / "crisis_resources.json", validator.CRISIS)
        self.assertIsNone(parser.get_default("today"), "production reads the clock; tests inject it")

    def test_the_real_profiles_file_passes_and_carries_no_test_fixture(self):
        doc = json.loads(validator.PROFILES.read_text(encoding="utf-8"))
        report = validator.check_profiles(doc, profiles_schema(),
                                          json.loads(validator.CRISIS.read_text(encoding="utf-8")),
                                          json.loads(validator.DATA.read_text(encoding="utf-8")), TODAY)
        self.assertEqual([], report.errors)
        text = validator.PROFILES.read_text(encoding="utf-8")
        self.assertNotRegex(text, r"555\D{0,3}01\d\d", "555-01xx is the reserved fictional range")
        self.assertNotIn("fixture", text.lower())

    def test_the_real_crisis_lines_carry_no_label_and_the_card_is_a_separate_print(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        self.assertTrue(all(sorted(line) == ["ref", "when"] for line in data["crisis"]), data["crisis"])
        self.assertNotIn("card", [item["id"] for item in data["inserts"]])
        self.assertEqual(["body", "mineTitle", "rows", "title"], sorted(data["card"]))
        self.assertLessEqual(len(data["crisis"]), validator.CARD_MAX_CRISIS_LINES)

    def test_the_real_defaults_are_the_owners_set(self):
        data = json.loads(validator.DATA.read_text(encoding="utf-8"))
        on = [item["id"] for item in data["inserts"] if item["defaultOn"]]
        self.assertEqual(list(DEFAULT_ON), on)
        self.assertEqual(["intro"], [item["id"] for item in data["inserts"] if item["core"]])

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
