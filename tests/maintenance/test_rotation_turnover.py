"""bin/rotation_turnover.py -- the owner's rotation-start Netlify visit as one command.

Every test drives the real Turnover code against a fake world: a Netlify whose Functions
read environment variables from the DEPLOY SNAPSHOT (so a changed key does nothing until a
redeploy -- the property the command exists to respect), a Keychain, and `gh`. No network.

What is pinned, and why:
  * a dry run writes nothing anywhere;
  * the Keychain is written BEFORE Netlify, so the live key is never one the owner lacks;
  * no credential ever reaches stdout or the issue comment;
  * the learner passcode is unwritable (decision passcode-fixed);
  * a re-run is a no-op (no second rotation, no 15-credit redeploy);
  * an earlier key is PROVEN refused after the redeploy, and a deploy that did not pick up
    the new environment is caught, not reported as done;
  * every refusal happens before the first change.
"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin"))

import rotation_turnover as RT  # noqa: E402

PROXY = "https://sp-interview-proxy.netlify.app"
MS3 = "https://une-ms3-psychiatry.netlify.app"
RES = "https://mmc-psychiatry-residents-sanford.netlify.app"
PREV = "rot-2026-hx-dd33705841771469"
NEXT = "rot-2026-hx-ac7db15dabcc0835"
LATER = "rot-2027-hx-c395e776a460ba2f"


class FakeWorld:
    def __init__(self, now="2026-09-25T12:00:00+00:00", origins=f"{MS3},{RES},http://localhost:8888"):
        self.clock = datetime.fromisoformat(now)
        self.env = {
            "SP_ROTATION_ID": {c: PREV for c in ("dev", "branch-deploy", "deploy-preview", "production")},
            "SP_ALLOWED_ORIGINS": {"all": origins},
            "SP_OPERATIONS_KEY": {"production": "old-ops-key-0001"},
            "SP_MANAGED_VOICE_ENABLED": {"production": "false"},
            "SP_STUDENT_PASSCODE": {"production": "learner-passcode-fixed"},
        }
        self.updated = {k: "2026-07-21T23:33:38+00:00" for k in self.env}
        self.keychain = {PREV: "old-ops-key-0001"}
        self.snapshot = self._snap()
        self.live_created = "2026-09-20T00:00:00+00:00"
        self.deploys = {}
        self.calls = []
        self.comments = []
        self.keys = iter(f"{n:064x}" for n in range(10**6, 10**6 + 50))
        self.build_outcome = "ready"
        self.snapshot_on_build = True
        self.keychain_readback_ok = True

    def _snap(self):
        return {k: dict(v) for k, v in self.env.items()}

    # --- System interface
    def now(self):
        return self.clock

    def sleep(self, seconds):
        self.clock = datetime.fromtimestamp(self.clock.timestamp() + seconds, timezone.utc)

    def new_key(self):
        return next(self.keys)

    def run(self, argv, stdin=None):
        self.calls.append(list(argv))
        tool = argv[0]
        if tool == "netlify":
            return self._netlify(argv[2], json.loads(argv[4]))
        if tool == "security":
            account = argv[argv.index("-a") + 1]
            if argv[1] == "find-generic-password":
                if account not in self.keychain:
                    return 44, "", "not found"
                value = self.keychain[account]
                return 0, (value if self.keychain_readback_ok else "garbled") + "\n", ""
            self.keychain[account] = argv[argv.index("-w") + 1]
            return 0, "", ""
        if tool == "gh":
            if argv[1:3] == ["auth", "status"]:
                return 0, "", ""
            if argv[1:3] == ["issue", "list"]:
                return 0, json.dumps([{"number": 723, "state": "OPEN",
                                       "title": f"maintenance: rotation readiness {NEXT}",
                                       "body": f"<!-- maintenance:rotation:id={NEXT} -->\n# Rotation"}]), ""
            if argv[1:3] == ["issue", "comment"]:
                self.comments.append((argv[3], stdin))
                return 0, "", ""
        raise AssertionError(f"unexpected command {argv}")

    def _netlify(self, method, data):
        if method == "getSite":
            return 0, json.dumps({"account_id": "acct", "published_deploy": {
                "id": self.deploys.get("live", "d0"), "created_at": self.live_created}}), ""
        if method == "getEnvVars":
            rows = [{"key": k, "updated_at": self.updated[k], "is_secret": k in ("SP_OPERATIONS_KEY", "SP_STUDENT_PASSCODE"),
                     "values": [{"context": c, "value": v} for c, v in ctxs.items()]} for k, ctxs in self.env.items()]
            return 0, json.dumps(rows), ""
        if method == "setEnvVarValue":
            key, ctx, value = data["key"], data["body"]["context"], data["body"]["value"]
            self.env[key][ctx] = value
            self.updated[key] = self.clock.isoformat()
            self.sleep(1)
            return 0, json.dumps({"key": key}), ""
        if method == "createSiteBuild":
            assert data["body"] == {"clear_cache": True}
            self.sleep(2)
            self.deploys["pending"] = ("d1", self.clock.isoformat())
            return 0, json.dumps({"id": "b1", "deploy_id": "d1"}), ""
        if method == "getDeploy":
            if self.build_outcome != "ready":
                return 0, json.dumps({"state": "error", "error_message": "Canceled build due to no content change"}), ""
            if self.snapshot_on_build:
                self.snapshot = self._snap()
            self.deploys["live"] = "d1"
            self.live_created = self.deploys["pending"][1]
            return 0, json.dumps({"state": "ready", "commit_ref": "a" * 40}), ""
        raise AssertionError(f"unexpected netlify method {method}")

    def http(self, method, url, headers=None):
        headers = headers or {}
        if url.endswith("/api/sp/voice?op=usage"):
            if headers.get("x-operations-key") == self.snapshot["SP_OPERATIONS_KEY"]["production"]:
                return 503, {}, b'{"error":{"code":"invalid_configuration","message":"Managed voice is not configured."}}'
            return 401, {}, b'{"error":{"code":"unauthorized"}}'
        if method == "OPTIONS" and url.endswith("/api/sp"):
            allowed = self.snapshot["SP_ALLOWED_ORIGINS"]["all"].split(",")
            origin = headers.get("Origin")
            return 204, ({"access-control-allow-origin": origin} if origin in allowed else {}), b""
        raise AssertionError(f"unexpected http {method} {url}")

    # --- helpers for assertions
    def writes(self):
        return [c for c in self.calls
                if (c[0] == "netlify" and c[2] in ("setEnvVarValue", "createSiteBuild"))
                or (c[0] == "security" and c[1] == "add-generic-password")
                or (c[0] == "gh" and c[1:3] == ["issue", "comment"])]


class TurnoverTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        d = Path(self.tmp.name)
        self.config = d / "maintenance_config.json"
        self.config.write_text(json.dumps({
            "sites": [{"name": "ms3", "baseUrl": MS3}, {"name": "res", "baseUrl": RES}],
            "spProxy": {"baseUrl": PROXY, "siteId": "site-proxy"}}))
        self.blocks = d / "rotation_blocks.json"
        self.blocks.write_text(json.dumps({"schemaVersion": 1, "blocks": [
            {"id": PREV, "startsOn": "2026-08-17", "endsOn": "2026-09-27", "status": "active"},
            {"id": NEXT, "startsOn": "2026-09-28", "endsOn": "2026-11-08", "status": "planned"},
            {"id": LATER, "startsOn": "2027-01-04", "endsOn": "2027-02-14", "status": "planned"}]}))

    def run_cmd(self, world, *argv):
        lines = []
        runner = RT.Turnover(world, out=lines.append, config=self.config, blocks=self.blocks)
        args = RT.argparse.Namespace(apply="--apply" in argv, block=None,
                                     rotate_key="--rotate-key" in argv, no_comment="--no-comment" in argv)
        code = runner.execute(apply=args.apply, block_override=args.block,
                              rotate_key=args.rotate_key, comment=not args.no_comment)
        return code, "\n".join(lines)

    def all_output(self, world, text):
        return text + "\n" + "\n".join(body for _, body in world.comments)

    def test_dry_run_changes_nothing_and_names_the_plan(self):
        world = FakeWorld()
        code, out = self.run_cmd(world)
        self.assertEqual(world.writes(), [], "a dry run wrote something")
        self.assertIn(f"block {NEXT}", out)
        self.assertIn("SP_ROTATION_ID", out)
        self.assertIn("remove http://localhost:8888", out)
        self.assertIn("new random key", out)
        self.assertIn("dry run", out)
        self.assertEqual(code, 1, "the turnover has not happened yet, so the dry run must not read as verified")

    def test_apply_does_the_turnover_and_verifies_it(self):
        world = FakeWorld()
        code, out = self.run_cmd(world, "--apply")
        self.assertEqual(code, 0, out)
        self.assertTrue(all(v == NEXT for v in world.env["SP_ROTATION_ID"].values()))
        self.assertEqual(world.env["SP_ALLOWED_ORIGINS"]["all"], f"{MS3},{RES}")
        new_key = world.keychain[NEXT]
        self.assertEqual(world.env["SP_OPERATIONS_KEY"]["production"], new_key)
        self.assertEqual(world.deploys["live"], "d1", "the proxy was not redeployed")
        self.assertIn("PASS  earlier key (" + PREV + ") is refused", out)
        self.assertIn("PASS  CORS refuses http://localhost:8888", out)
        self.assertIn("ROTATION TURNOVER VERIFIED", out)
        self.assertEqual(len(world.comments), 1)
        self.assertEqual(world.comments[0][0], "723")

    def test_keychain_is_written_before_netlify_gets_the_key(self):
        world = FakeWorld()
        self.run_cmd(world, "--apply")
        order = [i for i, c in enumerate(world.calls)
                 if (c[0] == "security" and c[1] == "add-generic-password")
                 or (c[0] == "netlify" and c[2] == "setEnvVarValue" and '"SP_OPERATIONS_KEY"' in c[4])]
        kinds = [world.calls[i][0] for i in order]
        self.assertEqual(kinds, ["security", "netlify"])

    def test_no_credential_reaches_stdout_or_the_issue(self):
        world = FakeWorld()
        code, out = self.run_cmd(world, "--apply")
        text = self.all_output(world, out)
        for secret in (world.keychain[NEXT], "old-ops-key-0001", "learner-passcode-fixed"):
            self.assertNotIn(secret, text)
        self.assertNotIn("0" * 20, text, "no key-shaped hex run in the output")

    def test_the_learner_passcode_is_never_written(self):
        world = FakeWorld()
        self.run_cmd(world, "--apply")
        self.assertEqual(world.env["SP_STUDENT_PASSCODE"], {"production": "learner-passcode-fixed"})
        self.assertNotIn("SP_STUDENT_PASSCODE", RT.WRITABLE)
        runner = RT.Turnover(world, out=lambda _: None, config=self.config, blocks=self.blocks)
        with self.assertRaises(RuntimeError):
            runner.set_env("acct", "site-proxy", "SP_STUDENT_PASSCODE", "production", "x")

    def test_a_rerun_is_a_no_op(self):
        world = FakeWorld()
        self.run_cmd(world, "--apply")
        world.calls.clear()
        world.comments.clear()
        key_before = world.keychain[NEXT]
        code, out = self.run_cmd(world, "--apply", "--no-comment")
        self.assertEqual(code, 0, out)
        self.assertEqual(world.writes(), [], "a re-run rotated or redeployed again")
        self.assertEqual(world.keychain[NEXT], key_before)
        self.assertIn("nothing to change", out)

    def test_rotate_key_forces_a_second_rotation_and_proves_the_first_key_dead(self):
        world = FakeWorld()
        self.run_cmd(world, "--apply", "--no-comment")
        first = world.keychain[NEXT]
        code, out = self.run_cmd(world, "--apply", "--rotate-key", "--no-comment")
        self.assertEqual(code, 0, out)
        self.assertNotEqual(world.keychain[NEXT], first)
        self.assertIn(f"PASS  earlier key ({NEXT}) is refused", out)

    def test_a_deploy_that_kept_the_old_environment_is_caught(self):
        world = FakeWorld()
        world.snapshot_on_build = False       # Netlify published, but Functions still hold the old env
        code, out = self.run_cmd(world, "--apply", "--no-comment")
        self.assertEqual(code, 1, out)
        self.assertIn("FAIL  Keychain key is the live operations key", out)
        self.assertIn("NOT VERIFIED", out)

    def test_a_skipped_build_says_the_old_deploy_is_still_live(self):
        world = FakeWorld()
        world.build_outcome = "error"
        code, out = self.run_cmd(world, "--apply", "--no-comment")
        self.assertEqual(code, 1, out)
        self.assertIn("the OLD deploy is still live", out)

    def test_origins_missing_a_learner_site_refuse_before_any_change(self):
        world = FakeWorld(origins=f"{MS3},http://localhost:8888")
        code, out = self.run_cmd(world, "--apply")
        self.assertEqual(code, 2, out)
        self.assertIn("REFUSED", out)
        self.assertEqual(world.writes(), [])

    def test_no_block_due_refuses(self):
        world = FakeWorld(now="2026-10-15T12:00:00+00:00")   # mid-block, next block months away
        code, out = self.run_cmd(world, "--apply")
        # Mid-block the passport is `active`: turning over the CURRENT block is allowed (a
        # suspected exposure), and its rotation ID is not the one set, so it plans work.
        self.assertIn(f"block {NEXT}", out)
        world2 = FakeWorld(now="2027-03-01T12:00:00+00:00")
        self.blocks.write_text(json.dumps({"schemaVersion": 1, "blocks": [
            {"id": PREV, "startsOn": "2026-08-17", "endsOn": "2026-09-27", "status": "completed"}]}))
        code2, out2 = self.run_cmd(world2, "--apply")
        self.assertEqual(code2, 2, out2)
        self.assertIn("no block is due", out2)
        self.assertEqual(world2.writes(), [])

    def test_a_keychain_that_does_not_read_back_stops_before_netlify_gets_the_key(self):
        world = FakeWorld()
        world.keychain_readback_ok = False
        code, out = self.run_cmd(world, "--apply", "--no-comment")
        self.assertEqual(code, 1, out)
        self.assertEqual(world.env["SP_OPERATIONS_KEY"]["production"], "old-ops-key-0001")
        self.assertIn("Keychain read-back did not match", out)
        self.assertFalse(any(c[0] == "netlify" and c[2] == "createSiteBuild" for c in world.calls))

    def test_the_command_line_is_the_same_code_path(self):
        # main() must build the real System when none is injected -- the injection is a
        # Python parameter for tests, never a command-line flag production would not pass.
        self.assertIsNone(RT.main.__defaults__[1])
        self.assertTrue(callable(RT.System().new_key))
        self.assertEqual(len(RT.System().new_key()), 64)


class RotationIssuePointsAtTheCommandTests(unittest.TestCase):
    def test_the_rotation_issue_names_a_command_that_exists(self):
        # The readiness issue is where the owner looks a week before a block; it must name the
        # command, and the command it names must be this file (a rename would strand it).
        sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))
        from maintenance.maintenance_issue import _rotation_body
        _, _, body = _rotation_body(
            {"state": "due", "blockId": NEXT, "startsOn": "2026-09-28", "endsOn": "2026-11-08",
             "daysUntilStart": 7}, "https://github.com/o/r/actions/runs/1", None)
        self.assertIn("python3 bin/rotation_turnover.py", body)
        self.assertTrue((ROOT / "bin" / "rotation_turnover.py").is_file())


if __name__ == "__main__":
    unittest.main()
