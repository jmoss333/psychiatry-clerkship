#!/usr/bin/env python3
"""Interview Room rotation turnover in one command, run from the owner's Mac.

Does the owner's Netlify visit for a new rotation block, then proves it worked:

  1. SP_ROTATION_ID      -> the block's opaque ID, in every context that has the variable
  2. SP_ALLOWED_ORIGINS  -> loopback / plain-http entries removed; both learner sites kept
  3. SP_OPERATIONS_KEY   -> a new random key (production), saved FIRST to the macOS Keychain
  4. redeploy            -> a fresh production build of sp-interview-proxy, because Netlify
                            Functions read environment variables from the deploy snapshot
  5. verify, live        -> the new key is accepted; every earlier key this Mac holds, a
                            wrong key and no key are refused (401); both learner sites get
                            CORS and localhost does not; managed voice is still off
  6. record              -> a content-free summary comment on the rotation readiness issue

Usage (from the repository root, on the Mac where `netlify` and `gh` are logged in):

    python3 bin/rotation_turnover.py            # dry run: plan + live verification, changes nothing
    python3 bin/rotation_turnover.py --apply    # do it

Idempotent. A step that is already done is skipped: the key is not rotated again inside the
same block unless you pass --rotate-key (suspected exposure), and the proxy is not redeployed
(15 Netlify credits) unless a variable changed after the live deploy was built. Re-running
after a partial failure therefore finishes the job instead of repeating it.

What it never does:
  - touch SP_STUDENT_PASSCODE. DECISION: passcode-fixed -- the learner passcode is fixed and
    non-rotating; only the separate operations credential rotates at turnover.
  - print a credential. The new key goes to the Keychain (service
    "sp-interview-proxy SP_OPERATIONS_KEY", account = the block ID) and to Netlify; every
    message this script prints, and the issue comment, is scrubbed of it. The key does pass
    through the argv of `security` and `netlify` for well under a second on this single-user
    Mac; that is the supported interface of both tools.
  - enable managed or real-time voice, edit the repository, or attest anything.

Exit codes: 0 = everything verified; 1 = not everything verified -- read the FAIL lines (after
--apply, the changes listed as "changed" were made, and the old deploy may still be live);
2 = refused or could not start, nothing was changed.
"""
from __future__ import annotations

import argparse
import json
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAINT = ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"
CONFIG = MAINT / "maintenance_config.json"
BLOCKS = MAINT / "rotation_blocks.json"
sys.path.insert(0, str(MAINT))

from rotation_readiness import (  # noqa: E402
    RotationConfigError,
    evaluate_rotation,
    validate_rotation_config,
)

KEYCHAIN_SERVICE = "sp-interview-proxy SP_OPERATIONS_KEY"
# The only variables this script may write. The learner passcode is deliberately absent.
WRITABLE = frozenset({"SP_ROTATION_ID", "SP_ALLOWED_ORIGINS", "SP_OPERATIONS_KEY"})
LOOPBACK_PREFIXES = ("http://localhost", "http://127.0.0.1", "http://[::1]")
TURNOVER_WINDOW_DAYS = 7          # the readiness passport opens the issue 7 days out
DEPLOY_TIMEOUT_S = 300
PROPAGATION_TIMEOUT_S = 60


class Refused(Exception):
    """A precondition failed before anything was changed (exit 2)."""


# --------------------------------------------------------------------------- the world
class System:
    """Everything that touches the outside world. Tests replace it with a fake."""

    def run(self, argv, stdin=None):
        proc = subprocess.run(argv, input=stdin, capture_output=True, text=True)
        return proc.returncode, proc.stdout, proc.stderr

    def http(self, method, url, headers=None):
        req = urllib.request.Request(url, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
        except urllib.error.HTTPError as err:
            return err.code, {k.lower(): v for k, v in err.headers.items()}, err.read()
        except (urllib.error.URLError, TimeoutError, OSError):
            return 0, {}, b""        # unreachable reads as status 0, which no check accepts

    def now(self):
        return datetime.now(timezone.utc)

    def sleep(self, seconds):
        time.sleep(seconds)

    def new_key(self):
        return secrets.token_hex(32)


class Turnover:
    def __init__(self, system, out=print, config=CONFIG, blocks=BLOCKS):
        self.sys = system
        self.config_path, self.blocks_path = Path(config), Path(blocks)
        self._out = out
        self.secrets = set()          # every credential value seen; scrubbed from all output
        self.results = []             # (ok: bool|None, label, evidence) for the summary
        self.changed = []             # human-readable list of changes actually made

    # ---- output that can never leak a credential
    def scrub(self, text):
        text = str(text)
        for value in self.secrets:
            if value:
                text = text.replace(value, "***")
        return text

    def say(self, text=""):
        self._out(self.scrub(text))

    def record(self, ok, label, evidence):
        self.results.append((ok, label, self.scrub(evidence)))
        mark = {True: "PASS", False: "FAIL", None: "note"}[ok]
        self.say(f"  {mark:4}  {label} — {evidence}")

    # ---- tool wrappers
    def netlify(self, method, data):
        rc, out, err = self.sys.run(["netlify", "api", method, "--data", json.dumps(data)])
        if rc != 0:
            raise RuntimeError(f"netlify api {method} failed: {self.scrub((err or out).strip())[:300]}")
        try:
            return json.loads(out) if out.strip() else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"netlify api {method} returned non-JSON") from exc

    def keychain_get(self, account):
        rc, out, _ = self.sys.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE,
                                   "-a", account, "-w"])
        if rc != 0:
            return None
        value = out.strip()
        if value:
            self.secrets.add(value)
        return value or None

    def keychain_set(self, account, value):
        self.secrets.add(value)
        rc, _, err = self.sys.run([
            "security", "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", account,
            "-l", f"SP_OPERATIONS_KEY (Interview Room proxy, rotation {account})",
            "-j", f"Set {self.sys.now().date().isoformat()} by bin/rotation_turnover.py; production "
                  "context of Netlify site sp-interview-proxy.",
            "-w", value])
        if rc != 0:
            raise RuntimeError(f"Keychain write failed: {self.scrub(err.strip())[:200]}")
        if self.keychain_get(account) != value:
            raise RuntimeError("Keychain read-back did not match; Netlify was NOT changed")

    # ---- inputs
    def load_inputs(self, block_override):
        config = json.loads(self.config_path.read_text(encoding="utf-8"))
        proxy = config.get("spProxy") or {}
        site_id, base = proxy.get("siteId"), str(proxy.get("baseUrl") or "").rstrip("/")
        if not site_id or not base.startswith("https://"):
            raise Refused("maintenance_config.json has no spProxy siteId/baseUrl")
        learners = sorted(str(s["baseUrl"]).rstrip("/") for s in config.get("sites", []) if s.get("baseUrl"))
        if len(learners) < 2 or not all(u.startswith("https://") for u in learners):
            raise Refused("maintenance_config.json does not name both learner sites over https")

        blocks = validate_rotation_config(json.loads(self.blocks_path.read_text(encoding="utf-8")))
        today = self.sys.now().date()
        if block_override:
            block = next((b for b in blocks if b["id"] == block_override), None)
            if block is None:
                raise Refused(f"--block {block_override} is not in rotation_blocks.json")
        else:
            passport = evaluate_rotation(blocks, today)
            if passport["state"] not in {"due", "overdue", "active"}:
                raise Refused(
                    f"no block is due for turnover (readiness state `{passport['state']}`); "
                    "turnover opens 7 days before a block starts. Pass --block ID to force.")
            block = next(b for b in blocks if b["id"] == passport["blockId"])
        earlier = [b for b in blocks if b["startsOn"] < block["startsOn"]]
        previous = earlier[-1]["id"] if earlier else None
        return site_id, base, learners, block, previous

    def env_vars(self, account_id, site_id):
        rows = self.netlify("getEnvVars", {"account_id": account_id, "site_id": site_id})
        return {row["key"]: row for row in rows}

    # ---- the run
    def execute(self, apply, block_override=None, rotate_key=False, comment=True):
        try:
            return self._execute(apply, block_override, rotate_key, comment)
        except (RuntimeError, OSError, KeyError, TypeError, ValueError) as exc:
            self.say(f"FAIL — stopped: {exc}")
            for line in self.changed:
                self.say(f"  changed before the stop: {line}")
            return 1 if self.changed else 2

    def _execute(self, apply, block_override, rotate_key, comment):
        try:
            site_id, base, learners, block, previous = self.load_inputs(block_override)
        except (Refused, RotationConfigError, OSError, json.JSONDecodeError, KeyError) as exc:
            self.say(f"REFUSED — {exc}")
            return 2
        block_id = block["id"]
        self.say(f"Interview Room rotation turnover — block {block_id} "
                 f"({block['startsOn']} → {block['endsOn']}), {'APPLY' if apply else 'dry run'}")

        # --- preflight (read-only). Anything wrong here stops the run before a change.
        try:
            site = self.netlify("getSite", {"site_id": site_id})
            account_id = site["account_id"]
            env = self.env_vars(account_id, site_id)
        except (RuntimeError, KeyError, TypeError) as exc:
            self.say(f"REFUSED — cannot read the proxy site from Netlify (is `netlify login` done?): {exc}")
            return 2
        missing = sorted(k for k in WRITABLE | {"SP_MANAGED_VOICE_ENABLED"} if k not in env)
        if missing:
            self.say(f"REFUSED — Netlify variable(s) missing: {', '.join(missing)}. Create them once "
                     "by hand (sp-proxy/README.md, Environment variables); this script only updates.")
            return 2
        if comment and apply:
            rc, _, _ = self.sys.run(["gh", "auth", "status"])
            if rc != 0:
                self.say("REFUSED — `gh` is not logged in; log in or pass --no-comment.")
                return 2

        plan = []
        # 1. rotation ID, every context that carries it
        rid_values = env["SP_ROTATION_ID"].get("values", [])
        stale_contexts = [v["context"] for v in rid_values if v.get("value") != block_id]
        if stale_contexts:
            plan.append(("SP_ROTATION_ID", f"set to {block_id} in {', '.join(stale_contexts)}"))
        # 2. origins
        origin_updates = []
        for value in env["SP_ALLOWED_ORIGINS"].get("values", []):
            entries = [e.strip() for e in str(value.get("value") or "").split(",") if e.strip()]
            kept = [e for e in entries if not e.startswith(LOOPBACK_PREFIXES) and e.startswith("https://")]
            absent = [u for u in learners if u not in kept]
            if absent:
                self.say(f"REFUSED — SP_ALLOWED_ORIGINS ({value['context']}) lacks {', '.join(absent)}; "
                         "this script removes entries, it never invents them.")
                return 2
            if kept != entries:
                removed = [e for e in entries if e not in kept]
                origin_updates.append((value["context"], ",".join(kept)))
                plan.append(("SP_ALLOWED_ORIGINS", f"remove {', '.join(removed)} ({value['context']})"))
        # 3. operations key
        prior_keys = {}
        for account in (block_id, previous):
            if account:
                value = self.keychain_get(account)
                if value:
                    prior_keys[account] = value
        ops = env["SP_OPERATIONS_KEY"]
        ops_contexts = [v["context"] for v in ops.get("values", [])]
        if "production" not in ops_contexts:
            self.say("REFUSED — SP_OPERATIONS_KEY has no production value in Netlify.")
            return 2
        window_opens = datetime.combine(
            date.fromisoformat(block["startsOn"]) - timedelta(days=TURNOVER_WINDOW_DAYS),
            datetime.min.time(), tzinfo=timezone.utc)
        ops_updated = _ts(ops.get("updated_at"))
        already = block_id in prior_keys and ops_updated is not None and ops_updated >= window_opens
        do_rotate = rotate_key or not already
        if do_rotate:
            plan.append(("SP_OPERATIONS_KEY", "new random key → Keychain, then Netlify (production)"
                         + (" — forced by --rotate-key" if already else "")))
        # 4. redeploy is decided after the writes (it depends on what changed)
        published = site.get("published_deploy") or {}
        live_built = _ts(published.get("created_at"))

        self.say("\nPlan:")
        for name, what in plan or [("—", "nothing to change; this block's turnover is already done")]:
            self.say(f"  {name:20} {what}")
        if not apply:
            self.say("  (dry run — nothing will be changed; re-run with --apply)")

        # --- apply
        wrote_at = []
        if apply and plan:
            try:
                for ctx in stale_contexts:
                    self.set_env(account_id, site_id, "SP_ROTATION_ID", ctx, block_id)
                    self.changed.append(f"SP_ROTATION_ID → {block_id} ({ctx})")
                for ctx, joined in origin_updates:
                    self.set_env(account_id, site_id, "SP_ALLOWED_ORIGINS", ctx, joined)
                    self.changed.append(f"SP_ALLOWED_ORIGINS tightened ({ctx})")
                if do_rotate:
                    key = self.sys.new_key()
                    self.secrets.add(key)
                    self.keychain_set(block_id, key)          # Keychain FIRST
                    self.set_env(account_id, site_id, "SP_OPERATIONS_KEY", "production", key)
                    self.changed.append("SP_OPERATIONS_KEY rotated (production; value in Keychain)")
            except RuntimeError as exc:
                self.say(f"\nFAIL — {exc}")
                self.say("Nothing past this point ran. Earlier changes (if any) are listed below; "
                         "re-run the command to finish.")
                for line in self.changed:
                    self.say(f"  changed: {line}")
                return 1 if self.changed else 2
            env = self.env_vars(account_id, site_id)
            wrote_at = [t for t in (_ts(env[k].get("updated_at")) for k in WRITABLE) if t]

        # --- redeploy when the live deploy was built before the newest variable change
        newest_var = max([t for t in (_ts(env[k].get("updated_at")) for k in WRITABLE) if t] + wrote_at,
                         default=None)
        # Anything this run wrote forces a redeploy outright; the timestamp comparison only
        # catches a change made earlier (a partial run, or by hand) that no deploy picked up.
        # `>=`, not `>`: a variable written in the same second the build began may be missing
        # from its snapshot, and a spare deploy is cheaper than a key that is not live.
        needs_deploy = (bool(self.changed) or live_built is None
                        or (newest_var is not None and newest_var >= live_built))
        self.say("")
        if needs_deploy and not apply:
            self.say("  note  the live deploy predates a variable change; --apply would redeploy")
        if needs_deploy and apply:
            code = self.redeploy(site_id)
            if code:
                return code
            site = self.netlify("getSite", {"site_id": site_id})
        elif not needs_deploy:
            self.record(True, "live deploy is newer than every variable it depends on",
                        f"deploy {(site.get('published_deploy') or {}).get('id')} built "
                        f"{(site.get('published_deploy') or {}).get('created_at')}")

        # --- verify (read-only, always)
        self.say("\nVerification:")
        self.verify(base, learners, block_id, prior_keys, env, apply)

        failed = [r for r in self.results if r[0] is False]
        if apply and comment:
            self.post_comment(block_id, base)
        self.say("")
        if failed:
            self.say(f"NOT VERIFIED — {len(failed)} check(s) failed. Read the FAIL lines above.")
            return 1
        self.say("ROTATION TURNOVER VERIFIED" if apply else "Dry run clean — current state verified.")
        return 0

    def set_env(self, account_id, site_id, key, context, value):
        if key not in WRITABLE:                     # the passcode can never get here
            raise RuntimeError(f"refusing to write {key}")
        self.netlify("setEnvVarValue", {"account_id": account_id, "key": key, "site_id": site_id,
                                        "body": {"context": context, "value": value}})

    def redeploy(self, site_id):
        # clear_cache makes CACHED_COMMIT_REF unset, so netlify_ignore_scoped.sh BUILDS even when
        # main has not moved since the last deploy (it would otherwise skip a same-commit build).
        build = self.netlify("createSiteBuild", {"site_id": site_id, "body": {"clear_cache": True}})
        deploy_id = build.get("deploy_id")
        if not deploy_id:
            self.say("FAIL — Netlify did not return a deploy id for the build")
            return 1
        self.say(f"  ....  redeploying sp-interview-proxy (deploy {deploy_id})")
        waited = 0
        while True:
            deploy = self.netlify("getDeploy", {"deploy_id": deploy_id})
            state = deploy.get("state")
            if state == "ready":
                break
            if state in {"error", "rejected"} or waited >= DEPLOY_TIMEOUT_S:
                self.record(False, "redeploy", f"deploy {deploy_id} ended `{state}`: "
                            f"{deploy.get('error_message') or 'timed out'} — the OLD deploy is still "
                            "live with the OLD environment; fix and re-run")
                return 1
            self.sys.sleep(5)
            waited += 5
        site = self.netlify("getSite", {"site_id": site_id})
        live = (site.get("published_deploy") or {}).get("id")
        self.record(live == deploy_id, "redeploy published",
                    f"deploy {deploy_id} ({(deploy.get('commit_ref') or '')[:7]}) is "
                    f"{'the live deploy' if live == deploy_id else f'NOT live (live is {live})'}")
        self.changed.append(f"redeployed sp-interview-proxy ({deploy_id})")
        return 0 if live == deploy_id else 1

    def verify(self, base, learners, block_id, prior_keys, env, apply):
        usage = f"{base}/api/sp/voice?op=usage"

        def usage_status(key):
            headers = {"x-operations-key": key} if key is not None else {}
            status, _, body = self.sys.http("GET", usage, headers)
            return status, body

        current = self.keychain_get(block_id)
        if current is None:
            self.record(False, "operations key in Keychain", f"no item for account {block_id}")
        else:
            waited, (status, body) = 0, usage_status(current)
            while status == 401 and waited < PROPAGATION_TIMEOUT_S:
                self.sys.sleep(5)
                waited += 5
                status, body = usage_status(current)
            code = ""
            try:
                code = (json.loads(body or b"{}").get("error") or {}).get("code", "")
            except (ValueError, AttributeError):
                pass
            accepted = status == 200 or (status == 503 and code == "invalid_configuration")
            self.record(accepted, "Keychain key is the live operations key",
                        f"usage route answered {status}{' ' + code if code else ''}"
                        + (" (authenticated; 503 is expected while managed voice is off)" if status == 503 else ""))
        for account, old in prior_keys.items():
            if old == current:
                continue
            status, _ = usage_status(old)
            self.record(status == 401, f"earlier key ({account}) is refused", f"usage route answered {status}")
        if not any(v != current for v in prior_keys.values()):
            self.record(None, "earlier keys", "this Mac holds no earlier key to test; the wrong-key check stands in")
        wrong = self.sys.new_key()
        self.secrets.add(wrong)
        status, _ = usage_status(wrong)
        self.record(status == 401, "a wrong key is refused", f"usage route answered {status}")
        status, _ = usage_status(None)
        self.record(status == 401, "no key is refused", f"usage route answered {status}")

        preflight = {"Access-Control-Request-Method": "POST",
                     "Access-Control-Request-Headers": "content-type,x-student-key"}
        for origin in learners + ["http://localhost:8888"]:
            status, headers, _ = self.sys.http("OPTIONS", f"{base}/api/sp", {"Origin": origin, **preflight})
            acao = headers.get("access-control-allow-origin")
            if origin in learners:
                self.record(acao == origin, f"CORS allows {origin}", f"ACAO={acao!r}")
            else:
                self.record(acao is None, f"CORS refuses {origin}", f"ACAO={acao!r}")

        rid = {v["context"]: v.get("value") for v in env["SP_ROTATION_ID"].get("values", [])}
        self.record(bool(rid) and all(v == block_id for v in rid.values()),
                    "SP_ROTATION_ID matches the block", ", ".join(f"{c}={v}" for c, v in sorted(rid.items())))
        voice = {v["context"]: v.get("value") for v in env["SP_MANAGED_VOICE_ENABLED"].get("values", [])}
        off = voice.get("production", voice.get("all")) == "false"
        self.record(True if off else None, "managed voice remains disabled",
                    f"SP_MANAGED_VOICE_ENABLED={voice}"
                    + ("" if off else " — ON: confirm every external activation gate is recorded"))

    def post_comment(self, block_id, base):
        rc, out, err = self.sys.run(["gh", "issue", "list", "--state", "all", "--search",
                                     f"{block_id} in:title", "--json", "number,title,state,body",
                                     "--limit", "10"])
        marker = f"<!-- maintenance:rotation:id={block_id} -->"
        issues = []
        if rc == 0:
            try:
                issues = [i for i in json.loads(out) if marker in (i.get("body") or "")]
            except json.JSONDecodeError:
                issues = []
        if not issues:
            self.say(f"  note  no rotation readiness issue carries {marker}; summary printed only")
            return
        issue = sorted(issues, key=lambda i: (i.get("state") != "OPEN", -int(i["number"])))[0]
        body = self.summary_markdown(block_id, base)
        if any(s and s in body for s in self.secrets):   # belt and braces: never post a credential
            self.say("  FAIL  refusing to post: the summary contained a credential")
            return
        rc, out, err = self.sys.run(["gh", "issue", "comment", str(issue["number"]), "--body-file", "-"],
                                    stdin=body)
        self.say(f"  {'note' if rc == 0 else 'FAIL'}  summary {'posted to' if rc == 0 else 'NOT posted to'} "
                 f"#{issue['number']}{'' if rc == 0 else ': ' + self.scrub(err.strip())[:200]}")

    def summary_markdown(self, block_id, base):
        mark = {True: "✅", False: "❌", None: "ℹ️"}
        lines = [f"Rotation turnover for `{block_id}` — `bin/rotation_turnover.py --apply`, "
                 f"{self.sys.now().strftime('%Y-%m-%d %H:%MZ')}. No credential values appear here.", ""]
        if self.changed:
            lines += ["**Changed:**", *[f"- {c}" for c in self.changed], ""]
        else:
            lines += ["**Changed:** nothing — this block's turnover was already done.", ""]
        lines += ["| | Check | Evidence |", "|---|---|---|"]
        lines += [f"| {mark[ok]} | {label} | {evidence} |" for ok, label, evidence in self.results]
        lines += ["", f"The new operations key is in the owner's macOS Keychain "
                      f"(service `{KEYCHAIN_SERVICE}`, account `{block_id}`). The learner passcode "
                      "was not touched (decision `passcode-fixed`)."]
        return self.scrub("\n".join(lines))


def _ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def main(argv=None, system=None, out=print):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="make the changes (default: dry run)")
    parser.add_argument("--block", help="rotation block ID to turn over (default: the one due now)")
    parser.add_argument("--rotate-key", action="store_true",
                        help="rotate the operations key even if it was already rotated for this block")
    parser.add_argument("--no-comment", action="store_true", help="do not post the summary to GitHub")
    args = parser.parse_args(argv)
    runner = Turnover(system or System(), out=out)
    return runner.execute(apply=args.apply, block_override=args.block,
                          rotate_key=args.rotate_key, comment=not args.no_comment)


if __name__ == "__main__":
    raise SystemExit(main())
