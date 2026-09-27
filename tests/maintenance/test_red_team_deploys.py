"""Exact Netlify deploy evidence for the Interview Room red-team workflow."""

import copy
import json
import sys
import unittest
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

AUTOMATION = Path(__file__).resolve().parents[2] / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))

from maintenance.red_team_deploys import (  # noqa: E402
    EvidenceUnavailable,
    deployed_pack_bytes,
    fetch_snapshot,
)


SITE_IDS = {
    "proxy": "455d2740-4020-4d9c-b9f8-82f72f4b2897",
    "ms3": "94717a39-679b-4c78-ae02-7b19e809592e",
    "res": "af64d5d4-e0b5-4f03-9857-be40e3b48329",
}
SITE_NAMES = {
    "proxy": "sp-interview-proxy",
    "ms3": "une-ms3-psychiatry",
    "res": "mmc-psychiatry-residents-sanford",
}
DEPLOY_IDS = {"proxy": "a" * 24, "ms3": "b" * 24, "res": "c" * 24}
COMMITS = {"proxy": "1" * 40, "ms3": "2" * 40, "res": "3" * 40}
PACK_BYTES = b'{"version":"fixture-v2","engine":{"modelPinned":"fixture-model"}}'
PACK_PATH = "_prototypes/sp-interview/sp-interview.pack.json"


def fixture_config():
    return {
        "sites": [
            {"name": key, "siteId": SITE_IDS[key],
             "baseUrl": f"https://{SITE_NAMES[key]}.netlify.app"}
            for key in ("ms3", "res")
        ],
        "spProxy": {"siteId": SITE_IDS["proxy"],
                    "baseUrl": "https://sp-interview-proxy.netlify.app"},
    }


def fixture_records():
    return {
        key: {
            "id": DEPLOY_IDS[key],
            "site_id": SITE_IDS[key],
            "state": "ready",
            "context": "production",
            "branch": "main" if key == "proxy" else "release",
            "commit_ref": COMMITS[key],
            "published_at": "2026-09-27T01:00:00Z",
            "deploy_ssl_url": f"https://{DEPLOY_IDS[key]}--{SITE_NAMES[key]}.netlify.app",
        }
        for key in ("proxy", "ms3", "res")
    }


def api_fake(records, *, empty_site=None):
    def get_json(url, token):
        assert token == "fixture-token"
        parsed = urlsplit(url)
        assert parsed.hostname == "api.netlify.com"
        parts = parsed.path.split("/")
        if "sites" in parts:
            site_id = parts[parts.index("sites") + 1]
            key = next(key for key, value in SITE_IDS.items() if value == site_id)
            return [] if key == empty_site else [copy.deepcopy(records[key])]
        deploy_id = parts[-1]
        key = next(key for key, value in DEPLOY_IDS.items() if value == deploy_id)
        return copy.deepcopy(records[key])
    return get_json


def git_fake(commit, path):
    assert (commit, path) == (COMMITS["proxy"], PACK_PATH)
    return PACK_BYTES


class DeploySnapshotTests(unittest.TestCase):
    def test_snapshot_hashes_pack_at_proxy_commit_not_checkout(self):
        snapshot = fetch_snapshot(
            fixture_config(), "fixture-token", api_fake(fixture_records()), git_fake
        )
        self.assertEqual(snapshot["packSha256"], sha256(PACK_BYTES).hexdigest())
        self.assertEqual(snapshot["packVersion"], "fixture-v2")
        self.assertEqual(snapshot["model"], "fixture-model")
        self.assertEqual(set(snapshot["deployments"]), {"proxy", "ms3", "res"})
        self.assertEqual(snapshot["deployments"]["proxy"]["commitRef"], COMMITS["proxy"])
        self.assertEqual(
            snapshot["deployments"]["ms3"]["deployUrl"],
            f"https://{DEPLOY_IDS['ms3']}--une-ms3-psychiatry.netlify.app",
        )
        self.assertNotEqual(snapshot["deployments"]["proxy"]["commitRef"],
                            snapshot["deployments"]["ms3"]["commitRef"])

    def test_missing_latest_published_deploy_is_unverified(self):
        with self.assertRaisesRegex(EvidenceUnavailable, "no published production deploy"):
            fetch_snapshot(
                fixture_config(), "fixture-token",
                api_fake(fixture_records(), empty_site="res"), git_fake,
            )

    def test_wrong_site_preview_missing_commit_and_missing_publication_fail(self):
        changes = (
            ("site_id", SITE_IDS["res"], "site mismatch"),
            ("context", "deploy-preview", "production context"),
            ("commit_ref", None, "commit ref"),
            ("published_at", None, "published time"),
        )
        for field, value, message in changes:
            with self.subTest(field=field):
                records = fixture_records()
                records["proxy"][field] = value
                with self.assertRaisesRegex(EvidenceUnavailable, message):
                    fetch_snapshot(
                        fixture_config(), "fixture-token", api_fake(records), git_fake
                    )

    def test_missing_configured_site_and_missing_git_object_fail_closed(self):
        config = fixture_config()
        config["sites"] = config["sites"][:1]
        with self.assertRaisesRegex(EvidenceUnavailable, "three configured sites"):
            fetch_snapshot(config, "fixture-token", api_fake(fixture_records()), git_fake)

        def missing_git(_commit, _path):
            raise FileNotFoundError("synthetic missing object")

        with self.assertRaisesRegex(EvidenceUnavailable, "proxy commit pack unavailable"):
            fetch_snapshot(
                fixture_config(), "fixture-token", api_fake(fixture_records()), missing_git
            )

    def test_deployed_pack_bytes_never_uses_checkout(self):
        self.assertEqual(deployed_pack_bytes(COMMITS["proxy"], git_fake), PACK_BYTES)


if __name__ == "__main__":
    unittest.main()
