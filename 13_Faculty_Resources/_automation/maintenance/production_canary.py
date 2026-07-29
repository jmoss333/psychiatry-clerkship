#!/usr/bin/env python3
"""Probe public learner sites and emit a content-free release twin."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import (
    HTTPRedirectHandler,
    Request,
    build_opener as urllib_build_opener,
)
from uuid import UUID


REPO_ROOT = Path(__file__).resolve().parents[3]
MEDIA_MANIFEST_PATH = REPO_ROOT / "media_manifest.json"
SP_PACK_PATH = REPO_ROOT / "_prototypes" / "sp-interview" / "sp-interview.pack.json"
DEFAULT_CONFIG_PATH = Path(__file__).with_name("maintenance_config.json")

RANGE_VALUE = "bytes=0-511"
RANGE_SIZE = 512
MAX_JSON_BYTES = 8_388_608
TIMEOUT_SECONDS = 30
KNOWN_PACK_STATUSES = {"draft-pending-attestation", "reviewed", "attested"}
LEARNER_READY_STATUSES = {"reviewed", "attested"}
MEDIA_PREFIXES = {"audio", "audio_oe", "media"}
MEDIA_CONTENT_TYPES = {
    ".mp3": {"audio/mpeg"},
    ".m4a": {"audio/mp4", "audio/m4a", "audio/x-m4a"},
    ".wav": {"audio/wav", "audio/wave", "audio/x-wav"},
    ".mp4": {"video/mp4"},
}
REQUIRED_CSP = {
    "default-src": {"'self'"},
    "img-src": {"'self'", "data:"},
    "media-src": {
        "'self'",
        "blob:",
        "https://sp-interview-proxy.netlify.app",
    },
    "style-src": {"'self'", "'unsafe-inline'"},
    "script-src": {"'self'", "'unsafe-inline'"},
    "connect-src": {
        "'self'",
        "https://sp-interview-proxy.netlify.app",
    },
    "frame-src": {"'self'"},
    "frame-ancestors": {
        "'self'",
        "https://clerkship-faculty-attest.netlify.app",
    },
}


class CanaryError(RuntimeError):
    """A public release contract failed closed."""


class NoRedirectHandler(HTTPRedirectHandler):
    """Reject redirects so probes cannot leave their validated origin."""

    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def build_opener():
    """Build the production opener with redirects disabled."""
    return urllib_build_opener(NoRedirectHandler())


def _require_nonempty_string(value, label):
    if not isinstance(value, str) or not value.strip():
        raise CanaryError(f"{label} must be a non-empty string")
    return value


def _validate_uuid(value, label):
    value = _require_nonempty_string(value, label)
    try:
        parsed = UUID(value)
    except (ValueError, AttributeError) as exc:
        raise CanaryError(f"{label} must be a UUID") from exc
    if str(parsed) != value:
        raise CanaryError(f"{label} must use canonical lowercase UUID form")
    return value


def _validate_https_url(value, label):
    value = _require_nonempty_string(value, label)
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise CanaryError(f"{label} must be a safe HTTPS URL") from exc
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/")
        or port is not None
    ):
        raise CanaryError(
            f"{label} must be an HTTPS URL without credentials, port, path, query, or fragment"
        )
    return value.rstrip("/")


def _validate_config(config):
    if not isinstance(config, dict):
        raise CanaryError("config must be an object")
    if set(config) != {"schemaVersion", "sites", "spProxy"}:
        raise CanaryError("config keys do not match schema version 1")
    if type(config.get("schemaVersion")) is not int or config["schemaVersion"] != 1:
        raise CanaryError("config schemaVersion must be 1")

    raw_sites = config.get("sites")
    if not isinstance(raw_sites, list) or not raw_sites:
        raise CanaryError("config sites must be a non-empty array")
    sites = []
    names = set()
    base_urls = set()
    site_ids = set()
    for index, site in enumerate(raw_sites):
        if not isinstance(site, dict) or set(site) != {"name", "baseUrl", "siteId"}:
            raise CanaryError(f"config sites[{index}] keys are invalid")
        name = _require_nonempty_string(site.get("name"), f"config sites[{index}].name")
        base_url = _validate_https_url(
            site.get("baseUrl"),
            f"config sites[{index}].baseUrl",
        )
        site_id = _validate_uuid(site.get("siteId"), f"config sites[{index}].siteId")
        if name in names or base_url in base_urls or site_id in site_ids:
            raise CanaryError("config learner sites must be unique")
        names.add(name)
        base_urls.add(base_url)
        site_ids.add(site_id)
        sites.append({"name": name, "baseUrl": base_url, "siteId": site_id})

    sp_proxy = config.get("spProxy")
    if not isinstance(sp_proxy, dict) or set(sp_proxy) != {"baseUrl", "siteId"}:
        raise CanaryError("config spProxy keys are invalid")
    _validate_https_url(sp_proxy.get("baseUrl"), "config spProxy.baseUrl")
    _validate_uuid(sp_proxy.get("siteId"), "config spProxy.siteId")
    return sites


def _parse_json_bytes(raw, label):
    try:
        return json.loads(
            raw,
            parse_constant=lambda value: (_ for _ in ()).throw(
                ValueError(f"invalid constant {value}")
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
        raise CanaryError(f"{label} is not valid JSON") from exc


def _read_json_file(path, label):
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise CanaryError(f"unable to read {label}") from exc
    return raw, _parse_json_bytes(raw, label)


def _validate_media_path(value):
    value = _require_nonempty_string(value, "media path")
    if (
        value.startswith("/")
        or "\\" in value
        or "%" in value
        or "|" in value
        or any(ord(char) < 32 or ord(char) == 127 for char in value)
    ):
        raise CanaryError(f"unsafe media path: {value!r}")
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise CanaryError(f"unsafe media path: {value!r}")
    parts = value.split("/")
    if (
        len(parts) < 2
        or parts[0] not in MEDIA_PREFIXES
        or any(part in ("", ".", "..") for part in parts)
    ):
        raise CanaryError(f"unsafe media path: {value!r}")
    suffix = Path(value).suffix.lower()
    if suffix not in MEDIA_CONTENT_TYPES:
        raise CanaryError(f"unsupported media path: {value!r}")
    return value


def _load_served_media():
    _, manifest = _read_json_file(MEDIA_MANIFEST_PATH, "media_manifest.json")
    if not isinstance(manifest, dict) or set(manifest) != {"_note", "audio", "video"}:
        raise CanaryError("media_manifest.json must contain _note, audio, and video")
    _require_nonempty_string(manifest.get("_note"), "media_manifest.json _note")

    seen = set()
    served = []
    for group in ("audio", "video"):
        items = manifest.get(group)
        if not isinstance(items, list):
            raise CanaryError(f"media_manifest.json {group} must be an array")
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise CanaryError(f"media_manifest.json {group}[{index}] must be an object")
            if item.get("served") is not True:
                continue
            if "file" not in item:
                raise CanaryError(f"media_manifest.json {group}[{index}] requires file")
            path = _validate_media_path(item["file"])
            if path in seen:
                raise CanaryError(f"duplicate media path: {path}")
            seen.add(path)
            served.append(path)
    if not served:
        raise CanaryError("media_manifest.json has no served media")
    return sorted(served)


def _load_expected_sp():
    raw, pack = _read_json_file(SP_PACK_PATH, "SP pack")
    if not isinstance(pack, dict):
        raise CanaryError("SP pack must be an object")
    version = _require_nonempty_string(pack.get("version"), "SP pack version")
    status = _require_nonempty_string(pack.get("status"), "SP pack status")
    if status not in KNOWN_PACK_STATUSES:
        raise CanaryError("SP pack status is unknown")
    engine = pack.get("engine")
    if not isinstance(engine, dict):
        raise CanaryError("SP pack engine must be an object")
    model = _require_nonempty_string(engine.get("modelPinned"), "SP pack modelPinned")
    return {
        "packSha256": sha256(raw).hexdigest(),
        "packVersion": version,
        "packStatus": status,
        "learnerReady": status in LEARNER_READY_STATUSES,
        "actorModel": model,
        "evaluatorModel": model,
    }


def _single_header(response, name):
    headers = getattr(response, "headers", None)
    if headers is None:
        return ""
    get_all = getattr(headers, "get_all", None)
    values = get_all(name) if callable(get_all) else None
    if values is not None:
        if len(values) != 1:
            raise CanaryError(f"{name} must occur exactly once")
        value = values[0]
    else:
        value = headers.get(name)
    return value.strip() if isinstance(value, str) else ""


def _status(response):
    status = getattr(response, "status", None)
    if status is None:
        getter = getattr(response, "getcode", None)
        status = getter() if callable(getter) else None
    return status


def _parse_cache_control(value, label):
    if not value:
        raise CanaryError(f"{label} Cache-Control header is missing")
    parsed = {}
    for raw_token in value.split(","):
        token = raw_token.strip().lower()
        if not token:
            raise CanaryError(f"{label} Cache-Control is malformed")
        name = token.split("=", 1)[0]
        if name in parsed:
            raise CanaryError(f"{label} Cache-Control has duplicate {name}")
        parsed[name] = token
    return parsed


def _require_cache(response, label, max_age, *, must_revalidate=False):
    directives = _parse_cache_control(_single_header(response, "Cache-Control"), label)
    if directives.get("public") != "public" or directives.get("max-age") != (
        f"max-age={max_age}"
    ):
        raise CanaryError(f"{label} Cache-Control contract failed")
    if must_revalidate and directives.get("must-revalidate") != "must-revalidate":
        raise CanaryError(f"{label} Cache-Control contract failed")


def _require_content_type(response, label, allowed):
    raw = _single_header(response, "Content-Type")
    media_type = raw.split(";", 1)[0].strip().lower()
    if media_type not in allowed:
        raise CanaryError(f"{label} Content-Type is invalid")


def _parse_csp(value):
    if not value:
        raise CanaryError("root CSP header is missing")
    directives = {}
    for raw_directive in value.split(";"):
        parts = raw_directive.strip().split()
        if not parts:
            continue
        name = parts[0].lower()
        if name in directives:
            raise CanaryError(f"root CSP has duplicate {name}")
        directives[name] = set(parts[1:])
    for name, tokens in REQUIRED_CSP.items():
        if name not in directives or not tokens.issubset(directives[name]):
            raise CanaryError(f"root CSP is missing required {name} tokens")


def _request(url, *, ranged=False):
    headers = {
        "Accept": "*/*",
        "User-Agent": "psychiatry-clerkship-production-canary/1",
    }
    if ranged:
        headers["Range"] = RANGE_VALUE
    return Request(url, headers=headers, method="GET")


def _open_response(opener, request, label):
    try:
        return opener.open(request, timeout=TIMEOUT_SECONDS)
    except HTTPError as exc:
        try:
            exc.close()
        finally:
            raise CanaryError(f"{label} HTTP {exc.code}") from exc
    except (URLError, OSError, TimeoutError) as exc:
        raise CanaryError(f"{label} request failed") from exc


def _read_bounded_json_body(response, label):
    declared_length = _single_header(response, "Content-Length")
    if declared_length:
        if re.fullmatch(r"[0-9]+", declared_length) is None:
            raise CanaryError(f"{label} Content-Length is invalid")
        if int(declared_length) > MAX_JSON_BYTES:
            raise CanaryError(f"{label} response is too large")
    body = response.read(MAX_JSON_BYTES + 1)
    if len(body) > MAX_JSON_BYTES:
        raise CanaryError(f"{label} response is too large")
    return body


def _probe_root(base_url, opener):
    response = _open_response(opener, _request(f"{base_url}/"), "root")
    try:
        if _status(response) != 200:
            raise CanaryError(f"root HTTP {_status(response)}")
        _require_content_type(response, "root", {"text/html"})
        _require_cache(response, "root", 0, must_revalidate=True)
        if _single_header(response, "X-Content-Type-Options").lower() != "nosniff":
            raise CanaryError("root X-Content-Type-Options header is invalid")
        if (
            _single_header(response, "Referrer-Policy").lower()
            != "strict-origin-when-cross-origin"
        ):
            raise CanaryError("root Referrer-Policy header is invalid")
        _parse_csp(_single_header(response, "Content-Security-Policy"))
    finally:
        response.close()


def _fetch_json(base_url, filename, opener, *, max_age, must_revalidate=False):
    label = filename
    response = _open_response(opener, _request(f"{base_url}/{filename}"), label)
    try:
        if _status(response) != 200:
            raise CanaryError(f"{label} HTTP {_status(response)}")
        _require_content_type(response, label, {"application/json"})
        _require_cache(
            response,
            label,
            max_age,
            must_revalidate=must_revalidate,
        )
        body = _read_bounded_json_body(response, label)
    finally:
        response.close()
    return body, _parse_json_bytes(body, label)


def _validate_nav(nav):
    if not isinstance(nav, list) or not nav:
        raise CanaryError("nav.json must be a non-empty array")
    count = 0
    for section_index, section in enumerate(nav):
        if not isinstance(section, dict):
            raise CanaryError(f"nav.json section {section_index} must be an object")
        _require_nonempty_string(
            section.get("section"),
            f"nav.json section {section_index} name",
        )
        items = section.get("items")
        if not isinstance(items, list):
            raise CanaryError(f"nav.json section {section_index} items must be an array")
        for item_index, item in enumerate(items):
            if not isinstance(item, dict):
                raise CanaryError(
                    f"nav.json section {section_index} item {item_index} must be an object"
                )
            for field in ("t", "f", "k"):
                _require_nonempty_string(
                    item.get(field),
                    f"nav.json section {section_index} item {item_index} {field}",
                )
        count += len(items)
    if count == 0:
        raise CanaryError("nav.json must contain at least one item")
    return count


def _validate_search(search):
    if not isinstance(search, dict):
        raise CanaryError("search-index.json must be an object")
    for key in ("version", "n", "docs", "synonyms", "postings", "df"):
        if key not in search:
            raise CanaryError(f"search-index.json is missing {key}")
    if type(search["version"]) is not int or search["version"] != 1:
        raise CanaryError("search-index.json version must be 1")
    if type(search["n"]) is not int or search["n"] <= 0:
        raise CanaryError("search-index.json n must be a positive integer")
    docs = search["docs"]
    if (
        not isinstance(docs, list)
        or not docs
        or any(not isinstance(doc, dict) for doc in docs)
    ):
        raise CanaryError("search-index.json docs must be a non-empty object array")
    for index, doc in enumerate(docs):
        for field in ("t", "f", "k", "sec"):
            _require_nonempty_string(
                doc.get(field),
                f"search-index.json docs[{index}] {field}",
            )
        if "snip" not in doc or not isinstance(doc["snip"], str):
            raise CanaryError(f"search-index.json docs[{index}] snip must be a string")
    if search["n"] != len(docs):
        raise CanaryError("search-index.json n does not match docs")

    synonyms = search["synonyms"]
    if not isinstance(synonyms, dict):
        raise CanaryError("search-index.json synonyms must be an object")
    for term, related_terms in synonyms.items():
        if not isinstance(term, str) or not term.strip():
            raise CanaryError("search-index.json synonym terms must be non-blank strings")
        if not isinstance(related_terms, list) or not related_terms:
            raise CanaryError(
                f"search-index.json synonyms[{term!r}] must be a non-empty array"
            )
        if any(
            not isinstance(related, str) or not related.strip()
            for related in related_terms
        ):
            raise CanaryError(
                f"search-index.json synonyms[{term!r}] values must be non-blank strings"
            )

    postings = search["postings"]
    if not isinstance(postings, dict) or not postings:
        raise CanaryError("search-index.json postings must be a non-empty object")
    posting_counts = {}
    for term, rows in postings.items():
        if not isinstance(term, str) or not term.strip():
            raise CanaryError("search-index.json posting terms must be non-blank strings")
        if not isinstance(rows, list) or not rows:
            raise CanaryError(
                f"search-index.json postings[{term!r}] must be a non-empty array"
            )
        previous_document_id = -1
        for row in rows:
            if not isinstance(row, list) or len(row) != 2:
                raise CanaryError(
                    f"search-index.json postings[{term!r}] entries must be [doc_id, tf]"
                )
            document_id, term_frequency = row
            if (
                type(document_id) is not int
                or document_id < 0
                or document_id >= search["n"]
            ):
                raise CanaryError(
                    f"search-index.json postings[{term!r}] has invalid document id"
                )
            if document_id <= previous_document_id:
                raise CanaryError(
                    f"search-index.json postings[{term!r}] document ids must be unique and ascending"
                )
            if type(term_frequency) is not int or term_frequency <= 0:
                raise CanaryError(
                    f"search-index.json postings[{term!r}] term frequency must be a positive integer"
                )
            previous_document_id = document_id
        posting_counts[term] = len(rows)

    document_frequencies = search["df"]
    if not isinstance(document_frequencies, dict) or set(document_frequencies) != set(
        postings
    ):
        raise CanaryError("search-index.json df must be a non-empty count object")
    for term, count in document_frequencies.items():
        if type(count) is not int or count <= 0 or count != posting_counts[term]:
            raise CanaryError(
                f"search-index.json df[{term!r}] must equal its unique posting count"
            )


def _validate_etag(response):
    value = _single_header(response, "ETag")
    if (
        not value
        or value.lower().startswith("w/")
        or re.fullmatch(r'"[^"\r\n]+"', value) is None
    ):
        raise CanaryError("media ETag must be one non-empty quoted strong ETag")
    opaque_tag = value[1:-1]
    if "|" in opaque_tag or any(
        unicodedata.category(char) == "Cc" for char in opaque_tag
    ):
        raise CanaryError("media ETag contains an unsafe aggregate delimiter or control")
    return value


def _probe_media(base_url, path, opener):
    url = f"{base_url}/{quote(path, safe='/-._~')}"
    response = _open_response(opener, _request(url, ranged=True), f"media {path}")
    try:
        status = _status(response)
        if status not in (200, 206):
            raise CanaryError(f"media HTTP {status}")
        suffix = Path(path).suffix.lower()
        _require_content_type(
            response,
            "media",
            MEDIA_CONTENT_TYPES[suffix],
        )
        _require_cache(response, "media", 604800)
        content_range = _single_header(response, "Content-Range")
        matched = re.fullmatch(r"bytes 0-511/([0-9]+)", content_range)
        if matched is None or int(matched.group(1)) <= RANGE_SIZE:
            raise CanaryError("media Content-Range must be bytes 0-511/total with total > 512")
        full_length = int(matched.group(1))
        etag = _validate_etag(response)
        prefix = response.read(RANGE_SIZE)
        if prefix.startswith(b"version https://git-lfs.github.com/spec/v1"):
            raise CanaryError(f"Git LFS pointer served for media path {path}")
        if len(prefix) != RANGE_SIZE:
            raise CanaryError("media response did not return the requested 512-byte prefix")
    finally:
        response.close()
    return f"{path}|{full_length}|{etag}|{sha256(prefix).hexdigest()}"


def _validate_generated_at(now):
    value = now() if callable(now) else now
    value = _require_nonempty_string(value, "generatedAt")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CanaryError("generatedAt must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise CanaryError("generatedAt must be UTC")
    return value


def _validate_release_twin(receipt):
    if set(receipt) != {"schemaVersion", "generatedAt", "sourceSha", "sites", "expectedSp"}:
        raise CanaryError("release twin has keys outside schema version 1")
    site_keys = {
        "name",
        "baseUrl",
        "navSha256",
        "searchSha256",
        "navItemCount",
        "mediaChecked",
        "mediaIntegrityAggregateSha256",
    }
    if any(set(site) != site_keys for site in receipt["sites"]):
        raise CanaryError("release twin site has keys outside schema version 1")
    expected_sp_keys = {
        "packSha256",
        "packVersion",
        "packStatus",
        "learnerReady",
        "actorModel",
        "evaluatorModel",
    }
    if set(receipt["expectedSp"]) != expected_sp_keys:
        raise CanaryError("release twin expectedSp has keys outside schema version 1")


def probe(config, opener, now, source_sha):
    """Probe configured public sites and return a deterministic schema-v1 receipt."""
    if not isinstance(source_sha, str) or re.fullmatch(r"[0-9a-f]{40}", source_sha) is None:
        raise CanaryError("source SHA must be exactly 40 lowercase hexadecimal characters")
    generated_at = _validate_generated_at(now)
    sites = _validate_config(config)
    media_paths = _load_served_media()
    expected_sp = _load_expected_sp()
    opener = opener or build_opener()

    site_receipts = []
    for site in sites:
        base_url = site["baseUrl"]
        _probe_root(base_url, opener)
        nav_bytes, nav = _fetch_json(
            base_url,
            "nav.json",
            opener,
            max_age=0,
            must_revalidate=True,
        )
        search_bytes, search = _fetch_json(
            base_url,
            "search-index.json",
            opener,
            max_age=86400,
        )
        nav_item_count = _validate_nav(nav)
        _validate_search(search)
        media_records = [
            _probe_media(base_url, path, opener) for path in media_paths
        ]
        media_aggregate = sha256("\n".join(sorted(media_records)).encode()).hexdigest()
        site_receipts.append(
            {
                "name": site["name"],
                "baseUrl": base_url,
                "navSha256": sha256(nav_bytes).hexdigest(),
                "searchSha256": sha256(search_bytes).hexdigest(),
                "navItemCount": nav_item_count,
                "mediaChecked": len(media_records),
                "mediaIntegrityAggregateSha256": media_aggregate,
            }
        )

    receipt = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "sourceSha": source_sha,
        "sites": site_receipts,
        "expectedSp": expected_sp,
    }
    _validate_release_twin(receipt)
    return receipt


def _load_config(path):
    _, config = _read_json_file(path, "maintenance config")
    if not isinstance(config, dict):
        raise CanaryError("maintenance config must be an object")
    return {
        key: config.get(key)
        for key in ("schemaVersion", "sites", "spProxy")
    }


def _utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-sha", default=os.environ.get("GITHUB_SHA"))
    args = parser.parse_args(argv)
    try:
        receipt = probe(
            _load_config(args.config),
            opener=build_opener(),
            now=_utc_now,
            source_sha=args.source_sha,
        )
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except CanaryError as exc:
        print(f"production canary failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
