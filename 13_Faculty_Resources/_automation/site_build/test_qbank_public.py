"""Controlled publication fixtures; no dependency on faculty's current review queue."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


def bank_fixture():
    def item(identifier, status="attested", **extra):
        return {"id": identifier, "status": status, "type": "sba", "competency": ["dx"],
                "category": "anxiety", "difficulty": 2,
                "stem": identifier + " synthetic question?", "options": [
                    {"key": "A", "t": "First", "c": True},
                    {"key": "B", "t": "Second", "trap": {"name": "Trap", "note": "Reason"}},
                    {"key": "C", "t": "Third", "trap": {"name": "Trap", "note": "Reason"}},
                    {"key": "D", "t": "Fourth", "trap": {"name": "Trap", "note": "Reason"}}],
                "why": identifier + " explanation", "pearl": "Teaching point", "evidence": "Synthetic evidence",
                "pages": ["topic.md"], **extra}
    return {"_note": "Internal review note", "version": 1, "internal": "PRIVATE_ROOT",
            "items": [item("qb_anx_001"), item("qb_anx_002", "draft"),
                      item("qb_anx_003", "draft", retired=True), item("qb_anx_004", retired=False)]}


class PublicBankTests(unittest.TestCase):
    def module(self):
        path = Path(__file__).with_name("qbank_public.py")
        self.assertTrue(path.is_file(), "Learner publication needs an approved-only projection")
        spec = importlib.util.spec_from_file_location("qbank_public", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_exact_approved_set_without_mutating_source_or_exporting_editorial_fields(self):
        module = self.module()
        bank = bank_fixture()
        bank["items"][0]["reviewNotes"] = "PRIVATE_ITEM"
        bank["items"][0]["options"][0]["reviewNotes"] = "PRIVATE_OPTION"
        before = copy.deepcopy(bank)
        projected = module.project_question_bank(bank)
        self.assertEqual([i["id"] for i in projected["items"]], ["qb_anx_001", "qb_anx_004"])
        self.assertEqual(bank, before)
        self.assertNotIn("PRIVATE", json.dumps(projected))
        self.assertNotIn("Internal review note", json.dumps(projected))
        self.assertEqual(module.project_question_bank(projected), projected)

    def test_invalid_status_and_retired_flags_fail_even_on_withheld_items(self):
        module = self.module()
        for field, value in [("status", None), ("status", "approved"), ("status", True),
                             ("retired", "false"), ("retired", 0), ("id", ""), ("id", 9)]:
            with self.subTest(field=field, value=value):
                bank = bank_fixture()
                bank["items"][2][field] = value
                with self.assertRaises(ValueError):
                    module.project_question_bank(bank)
        bank = bank_fixture()
        del bank["items"][1]["status"]
        with self.assertRaises(ValueError):
            module.project_question_bank(bank)

    def test_malformed_containers_and_duplicate_ids_fail(self):
        module = self.module()
        for bank in [None, [], {}, {"version": 1, "_note": "x", "items": {}},
                     {"version": True, "_note": "x", "items": [{}]}]:
            with self.subTest(bank=bank), self.assertRaises(ValueError):
                module.project_question_bank(bank)
        bank = bank_fixture()
        bank["items"].append(copy.deepcopy(bank["items"][0]))
        with self.assertRaises(ValueError):
            module.project_question_bank(bank)

    def test_no_eligible_items_is_explicit_empty_publication(self):
        module = self.module()
        bank = bank_fixture()
        for item in bank["items"]:
            item["status"] = "draft"
        self.assertEqual(module.project_question_bank(bank)["items"], [])

    def test_malformed_question_content_never_enters_a_standalone_export(self):
        module = self.module()
        for field, value in [("stem", ""), ("options", []), ("pages", []), ("difficulty", "2")]:
            bank = bank_fixture()
            bank["items"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                module.project_question_bank(bank)

    def test_schema_valid_three_option_second_tier_is_published_intact(self):
        module = self.module()
        bank = bank_fixture()
        item = bank["items"][0]
        item["type"] = "two-tier"
        item["tier2"] = {"q": "Which synthetic explanation fits?", "why": "Synthetic explanation.",
                         "options": [{"key": "A", "t": "First", "c": True},
                                     {"key": "B", "t": "Second"}, {"key": "C", "t": "Third"}]}
        public = module.project_question_bank(bank)
        self.assertEqual(public["items"][0]["tier2"], item["tier2"])

    def test_duplicate_second_tier_keys_still_fail(self):
        module = self.module()
        bank = bank_fixture()
        bank["items"][0]["type"] = "two-tier"
        bank["items"][0]["tier2"] = {"q": "Which synthetic explanation fits?", "why": "Synthetic explanation.",
                                    "options": [{"key": "A", "t": "First", "c": True},
                                                {"key": "B", "t": "Second"}, {"key": "B", "t": "Third"}]}
        with self.assertRaises(ValueError):
            module.project_question_bank(bank)

    def artifacts(self, module, root):
        bank = bank_fixture()
        public = module.project_question_bank(bank)
        (root / "tools").mkdir()
        (root / "question_bank.json").write_text(json.dumps(public))
        (root / "pretest_pool.json").write_text(json.dumps(module.pretest_pool(public)))
        (root / "index.html").write_text('var RELEASED_QB_IDS=["qb_anx_001","qb_anx_004"];')
        (root / "tools/review.html").write_text('<script id="cw-review-qb-inventory" type="application/json">'
            '[{"id":"qb_anx_001","retired":false},{"id":"qb_anx_004","retired":false}]</script>')
        return bank

    def test_publication_guard_accepts_complete_output(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bank = self.artifacts(module, root)
            module.verify_publication(root, bank)

    def test_publication_guard_rejects_only_bank_item_omissions(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bank = self.artifacts(module, root)
            baseline = json.loads((root / "question_bank.json").read_text())
            for remaining in [0, 1]:
                changed = copy.deepcopy(baseline)
                changed["items"] = changed["items"][:remaining]
                (root / "question_bank.json").write_text(json.dumps(changed))
                with self.subTest(remaining=remaining), self.assertRaisesRegex(ValueError, "learner JSON differs"):
                    module.verify_publication(root, bank)

    def test_publication_guard_rejects_only_added_draft_or_retired_items(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bank = self.artifacts(module, root)
            baseline = json.loads((root / "question_bank.json").read_text())
            for source_index in [1, 2]:
                changed = copy.deepcopy(baseline)
                changed["items"].append(copy.deepcopy(bank["items"][source_index]))
                (root / "question_bank.json").write_text(json.dumps(changed))
                with self.subTest(source_index=source_index), self.assertRaisesRegex(ValueError, "learner JSON differs"):
                    module.verify_publication(root, bank)

    def test_publication_guard_rejects_missing_bank_item_fields(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bank = self.artifacts(module, root)
            changed = json.loads((root / "question_bank.json").read_text())
            del changed["items"][0]["stem"]
            (root / "question_bank.json").write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "learner JSON differs"):
                module.verify_publication(root, bank)

    def test_publication_guard_rejects_only_placement_item_omission_or_leak(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bank = self.artifacts(module, root)
            baseline = json.loads((root / "pretest_pool.json").read_text())
            for mutation in ["omit", "draft"]:
                changed = copy.deepcopy(baseline)
                if mutation == "omit":
                    changed["items"] = []
                else:
                    draft = bank["items"][1]
                    for field in ("id", "pages", "stem", "why", "pearl"):
                        changed["items"][0][field] = copy.deepcopy(draft[field])
                (root / "pretest_pool.json").write_text(json.dumps(changed))
                with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "placement questions differ"):
                    module.verify_publication(root, bank)

    def test_publication_guard_rejects_missing_placement_item_fields(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bank = self.artifacts(module, root)
            changed = json.loads((root / "pretest_pool.json").read_text())
            del changed["items"][0]["stem"]
            (root / "pretest_pool.json").write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "placement questions differ"):
                module.verify_publication(root, bank)

    def test_publication_guard_rejects_hidden_raw_copy_and_draft_restore_inventory(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bank = self.artifacts(module, root)
            leak = root / "hidden.json"
            leak.write_text(json.dumps(bank))
            with self.assertRaisesRegex(ValueError, "withheld"):
                module.verify_publication(root, bank)
            leak.unlink()
            (root / "tools/review.html").write_text('<script id="cw-review-qb-inventory" type="application/json">'
                '[{"id":"qb_anx_002","retired":false}]</script>')
            with self.assertRaises(ValueError):
                module.verify_publication(root, bank)


def blueprint_fixture(per_category=4, drafts=True):
    """Every blueprint category, `per_category` attested SBA items each, plus a draft and a
    two-tier item per category that the pre/post forms must never draw."""
    prefixes = {"mood": "mood", "psychosis": "psy", "anxiety": "anx", "substance": "sud",
                "neurocog": "cog", "pharm": "pha", "safety": "saf", "personality": "per",
                "childdev": "cdev", "otherdx": "oth", "ethics": "eth", "relational": "rel"}
    base = bank_fixture()["items"][0]
    items = []
    for category, prefix in prefixes.items():
        for n in range(1, per_category + 1):
            item = copy.deepcopy(base)
            item.update({"id": "qb_%s_%03d" % (prefix, n), "category": category,
                         "difficulty": 2 if n % 2 else 1, "stem": "%s %d synthetic?" % (category, n)})
            items.append(item)
        if drafts:
            draft = copy.deepcopy(base)
            draft.update({"id": "qb_%s_900" % prefix, "category": category, "status": "draft"})
            items.append(draft)
    return {"_note": "fixture", "version": 1, "items": items}


class PrePostFormTests(unittest.TestCase):
    """DRAFT pre/post forms (L8 outcomes design). Controlled fixtures only."""

    module = PublicBankTests.module

    def test_two_disjoint_twelve_item_forms_one_per_category(self):
        module = self.module()
        bank = blueprint_fixture()
        result = module.prepost_forms(bank)
        a, b = result["forms"]["A"], result["forms"]["B"]
        self.assertEqual(result["status"], "draft")
        self.assertEqual(len(a), 12)
        self.assertEqual(len(b), 12)
        self.assertEqual([x["cat"] for x in a], list(module.PRETEST_CATEGORIES))
        self.assertEqual([x["cat"] for x in b], list(module.PRETEST_CATEGORIES))
        ids_a, ids_b = {x["id"] for x in a}, {x["id"] for x in b}
        self.assertFalse(ids_a & ids_b)
        placement = {x["id"] for x in module.pretest_pool(bank)["items"]}
        self.assertFalse((ids_a | ids_b) & placement)
        self.assertFalse(any(i.endswith("_900") for i in ids_a | ids_b), "a draft item was drawn")
        for x in a + b:
            self.assertEqual(sorted(x), ["cat", "id", "options", "stem"], "no explanation or pearl ships")
            self.assertEqual(sum(o["c"] for o in x["options"]), 1)

    def test_deterministic_and_does_not_mutate_the_source(self):
        module = self.module()
        bank = blueprint_fixture()
        before = copy.deepcopy(bank)
        self.assertEqual(module.prepost_forms(bank), module.prepost_forms(bank))
        self.assertEqual(bank, before)

    def test_a_category_without_two_eligible_items_fails_closed(self):
        module = self.module()
        bank = blueprint_fixture(per_category=2, drafts=False)  # one goes to placement
        with self.assertRaisesRegex(ValueError, "fewer than two eligible"):
            module.prepost_forms(bank)

    def test_publication_guard_checks_forms_only_when_shipped(self):
        module = self.module()
        bank = blueprint_fixture()
        public = module.project_question_bank(bank)
        ids = sorted(item["id"] for item in public["items"])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "tools").mkdir()
            (root / "question_bank.json").write_text(json.dumps(public))
            (root / "pretest_pool.json").write_text(json.dumps(module.pretest_pool(public)))
            (root / "index.html").write_text("var RELEASED_QB_IDS=%s;" % json.dumps(ids))
            (root / "tools/review.html").write_text(
                '<script id="cw-review-qb-inventory" type="application/json">%s</script>'
                % json.dumps([{"id": item["id"], "retired": False} for item in public["items"]]))
            module.verify_publication(root, bank)  # off build: no forms file, still valid
            forms = module.prepost_forms(public)
            (root / "prepost_forms.json").write_text(json.dumps(forms))
            module.verify_publication(root, bank)
            forms["forms"]["A"][0]["id"] = "qb_mood_900"
            (root / "prepost_forms.json").write_text(json.dumps(forms))
            with self.assertRaisesRegex(ValueError, "pre/post forms differ|withheld"):
                module.verify_publication(root, bank)


if __name__ == "__main__":
    unittest.main()
