"""bin/check_attestation_delivery.py -- is every signature actually in front of learners?

Driven through the real `check()` against a fake GitHub + fake learner sites. Pinned:
  * the 2026-09-28 morning (Interview Room signed on attest/pending, no PR, site pending)
    is RED once past the 30-minute grace, and names where it is stuck;
  * each stage (stranded / in-review-pr / unpublished / not-shown) is told apart;
  * a fresh signature inside its grace period is reported but not red;
  * a page whose text changed after signing (not bound) is NOT a delivery gap;
  * a site that cannot be read is COULD NOT CHECK (exit 2), never a clean pass.
"""
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin"))

import check_attestation_delivery as D  # noqa: E402

NOW = datetime(2026, 9, 28, 14, 0, tzinfo=timezone.utc)
R = "r" * 40
SITES = [{"name": "ms3", "baseUrl": "https://ms3.example"}, {"name": "res", "baseUrl": "https://res.example"}]


def row(at, h):
    return {"status": "reviewed", "at": at, "by": "Joshua Moss, MD", "contentHash": h}


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


class FakeWorld:
    repo = "synthetic/clerkship"

    def __init__(self, *, main, pending=None, at_r=None, served=None, prs=(), head_at=NOW - timedelta(hours=2),
                 revision_at=NOW - timedelta(hours=3), main_touches=(), down=()):
        self.ledgers = {"main": main, "attest/pending": pending or main, R: at_r or main}
        self.ahead = 1 if pending is not None else 0
        self.served_items = served
        self.prs = list(prs)
        self.head_at, self.revision_at, self.main_touches = head_at, revision_at, list(main_touches)
        self.down = set(down)

    def now(self):
        return NOW

    def api(self, path, raw=False):
        if path.startswith("/compare/"):
            return {"ahead_by": self.ahead, "commits": [{"commit": {"committer": {"date": iso(self.head_at)}}}]}
        if path.startswith("/pulls?"):
            return self.prs
        if path.startswith("/contents/"):
            ref = path.split("ref=")[1]
            return json.dumps(self.ledgers[ref]).encode()
        if path == f"/commits/{R}":
            return {"commit": {"committer": {"date": iso(self.revision_at)}}}
        if path.startswith("/commits?"):
            return [{"commit": {"committer": {"date": iso(t)}}} for t in self.main_touches]
        raise AssertionError(path)

    def served(self, url):
        base = url.rsplit("/", 1)[0]
        if base in self.down:
            raise D.CouldNotCheck(f"{url} answered 503")
        if url.endswith("/tool-governance.json"):
            return {"items": [{"source": {"revision": R}}]}
        return {"items": self.served_items}


BOUND = lambda ledger: {s for s, r in ledger.items() if str(r.get("contentHash", "")).startswith("good")}  # noqa: E731


class DeliveryTests(unittest.TestCase):
    def run_check(self, world):
        return D.check(world, SITES, world.ledgers["main"], bound=BOUND)

    def test_delivered_everywhere_is_clean(self):
        main = {"a.md": row("2026-09-27", "good-a"), "sp-interview.html": row("2026-09-26", "good-sp")}
        served = {"a.md": {"status": "reviewed", "reviewedAt": "2026-09-27"},
                  "sp-interview.html": {"status": "reviewed", "reviewedAt": "2026-09-26"}}
        report = self.run_check(FakeWorld(main=main, served=served))
        self.assertEqual(report["gaps"], [])
        self.assertEqual(report["red"], [])
        self.assertEqual(report["sites"]["ms3"]["signaturesChecked"], 2)

    def test_the_2026_09_28_morning_is_red_and_says_stranded(self):
        main = {"sp-interview.html": row("2026-09-26", "old-sp")}          # stale at main: the restyle
        pending = {"sp-interview.html": row("2026-09-28", "good-sp")}      # the re-attestation
        served = {"sp-interview.html": {"status": "needs-review", "reviewedAt": "2026-09-26"}}
        report = self.run_check(FakeWorld(main=main, pending=pending, served=served, prs=[]))
        self.assertTrue(report["red"])
        self.assertIn("no open rolling PR", report["red"][0])
        self.assertEqual({g["stage"] for g in report["gaps"]}, {"stranded"})
        self.assertIn("sp-interview.html", "\n".join(report["red"]))

    def test_a_fresh_signature_inside_its_grace_is_reported_not_red(self):
        main = {"sp-interview.html": row("2026-09-26", "old-sp")}
        pending = {"sp-interview.html": row("2026-09-28", "good-sp")}
        served = {"sp-interview.html": {"status": "needs-review", "reviewedAt": "2026-09-26"}}
        report = self.run_check(FakeWorld(main=main, pending=pending, served=served, prs=[],
                                          head_at=NOW - timedelta(minutes=5)))
        self.assertEqual(report["red"], [])
        self.assertEqual(report["gaps"][0]["late"], False)

    def test_an_open_rolling_pr_is_in_review_until_six_hours(self):
        main = {"a.md": row("2026-09-26", "old")}
        pending = {"a.md": row("2026-09-28", "good-a")}
        served = {"a.md": {"status": "pending"}}
        pr = [{"html_url": "https://github.com/x/pull/1"}]
        early = self.run_check(FakeWorld(main=main, pending=pending, served=served, prs=pr, head_at=NOW - timedelta(hours=1)))
        self.assertEqual({g["stage"] for g in early["gaps"]}, {"in-review-pr"})
        self.assertEqual(early["red"], [])
        late = self.run_check(FakeWorld(main=main, pending=pending, served=served, prs=pr, head_at=NOW - timedelta(hours=7)))
        self.assertTrue(late["red"])

    def test_merged_but_unpublished_goes_red_after_a_day(self):
        main = {"a.md": row("2026-09-27", "good-a")}
        at_r = {"a.md": row("2026-09-20", "old")}
        served = {"a.md": {"status": "reviewed", "reviewedAt": "2026-09-20"}}   # older signature shown
        fresh = self.run_check(FakeWorld(main=main, at_r=at_r, served=served,
                                         main_touches=[NOW - timedelta(hours=5)]))
        self.assertEqual({g["stage"] for g in fresh["gaps"]}, {"unpublished"})
        self.assertEqual(fresh["red"], [])
        stale = self.run_check(FakeWorld(main=main, at_r=at_r, served=served,
                                         revision_at=NOW - timedelta(hours=40),
                                         main_touches=[NOW - timedelta(hours=30)]))
        self.assertTrue(stale["red"])

    def test_published_but_not_shown_is_red_at_once(self):
        main = {"a.md": row("2026-09-27", "good-a")}
        served = {"a.md": {"status": "pending"}}
        report = self.run_check(FakeWorld(main=main, served=served))
        self.assertEqual({g["stage"] for g in report["gaps"]}, {"not-shown"})
        self.assertTrue(report["red"])

    def test_a_page_changed_after_signing_is_owner_work_not_a_delivery_gap(self):
        main = {"a.md": row("2026-09-20", "old-a")}   # not bound at main's text
        served = {"a.md": {"status": "pending"}}
        report = self.run_check(FakeWorld(main=main, served=served))
        self.assertEqual(report["gaps"], [])
        self.assertEqual(report["red"], [])

    def test_a_stranded_branch_is_red_even_when_its_signatures_are_not_current(self):
        main = {"a.md": row("2026-09-20", "old-a")}
        pending = {"a.md": row("2026-09-28", "also-stale")}
        served = {"a.md": {"status": "pending"}}
        report = self.run_check(FakeWorld(main=main, pending=pending, served=served, prs=[]))
        self.assertTrue(report["red"], "a branch ahead of main with no PR is stuck whatever it carries")

    def test_an_unreadable_site_is_could_not_check(self):
        main = {"a.md": row("2026-09-27", "good-a")}
        served = {"a.md": {"status": "reviewed", "reviewedAt": "2026-09-27"}}
        with self.assertRaises(D.CouldNotCheck):
            self.run_check(FakeWorld(main=main, served=served, down={"https://res.example"}))

    def test_a_site_serving_none_of_the_signed_pages_is_could_not_check(self):
        main = {"a.md": row("2026-09-27", "good-a")}
        with self.assertRaises(D.CouldNotCheck):
            self.run_check(FakeWorld(main=main, served={"unrelated.md": {"status": "reviewed"}}))

    def test_main_exit_codes(self):
        class Boom(FakeWorld):
            def api(self, path, raw=False):
                raise D.CouldNotCheck("GitHub /compare answered 502")
        self.assertEqual(D.main([], world=Boom(main={})), 2)

    def test_production_uses_attestation_hash_for_binding(self):
        # The injected `bound` exists for tests only; production's default must be the
        # function that asks attestation_hash, and it must run on the real tree.
        self.assertIs(D.check.__defaults__[0], D.bound_at_main)
        self.assertEqual(D.bound_at_main({}), set())


if __name__ == "__main__":
    unittest.main()
