"""Read-only, exact-revision production evidence for SP red-team receipts."""

from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen


PACK_PATH = "_prototypes/sp-interview/sp-interview.pack.json"
ROOT = Path(__file__).resolve().parents[3]
API_BASE = "https://api.netlify.com/api/v1"
_COMMIT = re.compile(r"[0-9a-f]{40}\Z")
_DEPLOY_ID = re.compile(r"[0-9a-f]{24}\Z")


class EvidenceUnavailable(RuntimeError):
    """A required production fact could not be independently established."""


def _git_read_env() -> dict:
    env = os.environ.copy()
    for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"):
        env.pop(key, None)
    return env


def netlify_get_json(url: str, token: str):
    if not token:
        raise EvidenceUnavailable("Netlify token unavailable")
    request = Request(url, headers={"Authorization": f"Bearer {token}",
                                    "Accept": "application/json"})
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response)
    except Exception as exc:
        raise EvidenceUnavailable("Netlify deploy API unavailable") from exc


def git_show_at_commit(commit: str, path: str) -> bytes:
    try:
        return subprocess.run(
            ["git", "show", f"{commit}:{path}"], check=True,
            cwd=ROOT, env=_git_read_env(),
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20,
        ).stdout
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise EvidenceUnavailable("pack source commit unavailable") from exc


def main_pack_commit() -> str:
    """Resolve the current reviewed pack source, which the proxy loads from main."""
    env = _git_read_env()
    try:
        subprocess.run(["git", "fetch", "--no-tags", "origin", "main"],
                       cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=60)
        commit = subprocess.run(["git", "rev-parse", "--verify", "FETCH_HEAD^{commit}"],
                                cwd=ROOT, env=env, check=True, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=20).stdout.strip()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise EvidenceUnavailable("current main pack revision unavailable") from exc
    if not _COMMIT.fullmatch(commit):
        raise EvidenceUnavailable("current main pack revision unavailable")
    return commit


def source_pack_bytes(source_commit: str, git_show=git_show_at_commit) -> bytes:
    if not isinstance(source_commit, str) or not _COMMIT.fullmatch(source_commit):
        raise EvidenceUnavailable("pack source commit invalid")
    try:
        data = git_show(source_commit, PACK_PATH)
    except Exception as exc:
        raise EvidenceUnavailable("pack source commit unavailable") from exc
    if not isinstance(data, bytes) or not data:
        raise EvidenceUnavailable("pack source commit unavailable")
    return data


def _site_config(config: dict) -> dict:
    try:
        sites = {site["name"]: site for site in config["sites"]}
        sites["proxy"] = config["spProxy"]
        if set(sites) != {"proxy", "ms3", "res"} or len(config["sites"]) != 2:
            raise ValueError("site set")
        if any(not site.get("siteId") or not site.get("baseUrl") for site in sites.values()):
            raise ValueError("site field")
        if len({site["siteId"] for site in sites.values()}) != 3:
            raise ValueError("duplicate site")
        return sites
    except (KeyError, TypeError, ValueError) as exc:
        raise EvidenceUnavailable("three configured sites required") from exc


def _normalize(record: dict, site: dict, listed_id: str) -> dict:
    if not isinstance(record, dict) or record.get("id") != listed_id:
        raise EvidenceUnavailable("deploy detail mismatch")
    if record.get("site_id") != site["siteId"]:
        raise EvidenceUnavailable("deploy site mismatch")
    if record.get("context") != "production":
        raise EvidenceUnavailable("deploy production context unverified")
    if record.get("state") != "ready":
        raise EvidenceUnavailable("production deploy not ready")
    commit = record.get("commit_ref")
    if not isinstance(commit, str) or not _COMMIT.fullmatch(commit):
        raise EvidenceUnavailable("deploy commit ref unavailable")
    published = record.get("published_at")
    try:
        dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            raise ValueError("missing offset")
    except (AttributeError, TypeError, ValueError) as exc:
        raise EvidenceUnavailable("deploy published time unavailable") from exc
    # Netlify's deploy_ssl_url can be the moving branch alias (main--/release--).
    # Its links.permalink is the immutable, deploy-ID-qualified URL.
    links = record.get("links")
    url = (links.get("permalink") if isinstance(links, dict) and "permalink" in links
           else record.get("deploy_ssl_url") or record.get("deploy_url"))
    try:
        base = urlsplit(site["baseUrl"])
        parsed = urlsplit(url or "")
        expected_host = f"{listed_id}--{base.hostname}"
        unexpected_port = parsed.port is not None
    except ValueError as exc:
        raise EvidenceUnavailable("immutable deploy permalink unavailable") from exc
    if (not _DEPLOY_ID.fullmatch(listed_id)
            or base.scheme != "https" or not base.hostname
            or parsed.scheme != "https" or parsed.hostname != expected_host
            or parsed.username or parsed.password or unexpected_port
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise EvidenceUnavailable("immutable deploy permalink unavailable")
    return {
        "siteId": site["siteId"], "deployId": listed_id, "commitRef": commit,
        "deployUrl": url, "publishedAt": published, "branch": record.get("branch"),
    }


def fetch_snapshot(config: dict, token: str,
                   get_json=netlify_get_json, git_show=git_show_at_commit,
                   source_commit=main_pack_commit) -> dict:
    """Fetch production deploys and the current main pack source independently."""
    if not token:
        raise EvidenceUnavailable("Netlify token unavailable")
    sites = _site_config(config)
    deployments = {}
    for key in ("proxy", "ms3", "res"):
        site = sites[key]
        site_id = quote(site["siteId"], safe="")
        listing_url = (f"{API_BASE}/sites/{site_id}/deploys?production=true"
                       "&latest-published=true&per_page=1")
        try:
            listing = get_json(listing_url, token)
        except Exception as exc:
            raise EvidenceUnavailable(f"{key} Netlify deploy lookup unavailable") from exc
        if not isinstance(listing, list) or len(listing) != 1 or not isinstance(listing[0], dict):
            raise EvidenceUnavailable(f"{key} has no published production deploy")
        deploy_id = listing[0].get("id")
        if not isinstance(deploy_id, str) or not _DEPLOY_ID.fullmatch(deploy_id):
            raise EvidenceUnavailable(f"{key} deploy ID unavailable")
        try:
            detail = get_json(f"{API_BASE}/deploys/{deploy_id}", token)
        except Exception as exc:
            raise EvidenceUnavailable(f"{key} Netlify deploy detail unavailable") from exc
        deployments[key] = _normalize(detail, site, deploy_id)
    commit = source_commit()
    data = source_pack_bytes(commit, git_show)
    try:
        pack = json.loads(data)
        version = pack["version"]
        model = pack["engine"]["modelPinned"]
        if not isinstance(version, str) or not version or not isinstance(model, str) or not model:
            raise ValueError("pack field")
    except (ValueError, KeyError, TypeError) as exc:
        raise EvidenceUnavailable("main pack metadata unavailable") from exc
    return {"deployments": deployments, "packSha256": sha256(data).hexdigest(),
            "packVersion": version, "model": model, "packSourceCommit": commit}
