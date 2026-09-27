"""Exact Netlify deploy evidence for the Interview Room red-team workflow."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit
from unittest import mock

AUTOMATION = Path(__file__).resolve().parents[2] / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))
sys.path.insert(0, str(AUTOMATION.parents[1] / "bin"))
from _git_env import scrub_inherited_git_env  # noqa: E402

scrub_inherited_git_env()

import maintenance.red_team_deploys as deploys  # noqa: E402

from maintenance.red_team_deploys import (  # noqa: E402
    EvidenceUnavailable,
    source_pack_bytes,
    fetch_snapshot,
    main_pack_commit,
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
SOURCE_COMMIT = "4" * 40
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
    assert (commit, path) == (SOURCE_COMMIT, PACK_PATH)
    return PACK_BYTES


def snapshot(config=None, records=None, git_show=git_fake):
    return fetch_snapshot(config or fixture_config(), "fixture-token",
                          api_fake(records or fixture_records()), git_show,
                          source_commit=lambda: SOURCE_COMMIT)


class DeploySnapshotTests(unittest.TestCase):
    def test_main_pack_source_refreshes_a_stale_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            remote, author, reader = (base / name for name in
                                      ("remote.git", "author", "reader"))

            def git(*args, cwd=base):
                return subprocess.run(["git", *args], cwd=cwd, check=True,
                                      capture_output=True, text=True).stdout.strip()

            git("init", "-q", "--bare", str(remote))
            author.mkdir()
            git("init", "-q", cwd=author)
            path = author / PACK_PATH
            path.parent.mkdir(parents=True)
            path.write_bytes(b'{"version":"old"}')
            git("add", ".", cwd=author)
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                "commit", "-qm", "old pack", cwd=author)
            git("branch", "-M", "main", cwd=author)
            git("remote", "add", "origin", str(remote), cwd=author)
            git("push", "-q", "origin", "main", cwd=author)
            git("clone", "-q", "-b", "main", str(remote), str(reader))
            old = git("rev-parse", "HEAD", cwd=reader)
            path.write_bytes(PACK_BYTES)
            git("add", ".", cwd=author)
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                "commit", "-qm", "new pack", cwd=author)
            git("push", "-q", "origin", "main", cwd=author)
            with mock.patch.object(deploys, "ROOT", reader):
                fresh = main_pack_commit()
                data = source_pack_bytes(fresh)
            self.assertNotEqual(fresh, old)
            self.assertEqual(data, PACK_BYTES)
            self.assertEqual(git("rev-parse", "HEAD", cwd=reader), old)

    def test_snapshot_hashes_current_main_pack_not_older_proxy_commit(self):
        observed = snapshot()
        self.assertEqual(observed["packSha256"], sha256(PACK_BYTES).hexdigest())
        self.assertEqual(observed["packVersion"], "fixture-v2")
        self.assertEqual(observed["model"], "fixture-model")
        self.assertEqual(observed["packSourceCommit"], SOURCE_COMMIT)
        self.assertEqual(set(observed["deployments"]), {"proxy", "ms3", "res"})
        self.assertEqual(observed["deployments"]["proxy"]["commitRef"], COMMITS["proxy"])
        self.assertEqual(
            observed["deployments"]["ms3"]["deployUrl"],
            f"https://{DEPLOY_IDS['ms3']}--une-ms3-psychiatry.netlify.app",
        )
        self.assertNotEqual(observed["deployments"]["proxy"]["commitRef"],
                            observed["packSourceCommit"])

    def test_netlify_branch_alias_is_ignored_when_immutable_permalink_is_present(self):
        records = fixture_records()
        for key in records:
            immutable = records[key]["deploy_ssl_url"]
            records[key]["deploy_ssl_url"] = f"https://{records[key]['branch']}--{SITE_NAMES[key]}.netlify.app"
            records[key]["links"] = {"permalink": immutable}
        observed = snapshot(records=records)
        self.assertEqual(observed["deployments"]["proxy"]["deployUrl"],
                         f"https://{DEPLOY_IDS['proxy']}--sp-interview-proxy.netlify.app")
        records["proxy"]["links"]["permalink"] = "https://main--sp-interview-proxy.netlify.app"
        with self.assertRaisesRegex(EvidenceUnavailable, "immutable deploy permalink"):
            snapshot(records=records)

    def test_missing_latest_published_deploy_is_unverified(self):
        with self.assertRaisesRegex(EvidenceUnavailable, "no published production deploy"):
            fetch_snapshot(fixture_config(), "fixture-token",
                           api_fake(fixture_records(), empty_site="res"), git_fake,
                           source_commit=lambda: SOURCE_COMMIT)

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
                    snapshot(records=records)

    def test_missing_configured_site_and_missing_git_object_fail_closed(self):
        config = fixture_config()
        config["sites"] = config["sites"][:1]
        with self.assertRaisesRegex(EvidenceUnavailable, "three configured sites"):
            snapshot(config=config)

        def missing_git(_commit, _path):
            raise FileNotFoundError("synthetic missing object")

        with self.assertRaisesRegex(EvidenceUnavailable, "pack source commit unavailable"):
            snapshot(git_show=missing_git)

        with self.assertRaisesRegex(EvidenceUnavailable, "pack source commit invalid"):
            fetch_snapshot(fixture_config(), "fixture-token", api_fake(fixture_records()),
                           git_fake, source_commit=lambda: "not-a-commit")

    def test_source_pack_bytes_never_uses_checkout(self):
        self.assertEqual(source_pack_bytes(SOURCE_COMMIT, git_fake), PACK_BYTES)


if __name__ == "__main__":
    unittest.main()
