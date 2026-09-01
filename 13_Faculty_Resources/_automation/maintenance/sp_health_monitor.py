#!/usr/bin/env python3
"""Monitor the public, content-free Interview Room health receipt."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener


PUBLIC_STATUS_URL = (
    "https://sp-interview-proxy.netlify.app/api/sp/health-status"
)
MAX_BODY_BYTES = 65_536
MAX_AGE = timedelta(hours=8)
SLOT_JITTER = timedelta(minutes=10)
TIMEOUT_SECONDS = 15
SHA256 = frozenset("0123456789abcdef")
FAILURE_CODES = {
    "configuration",
    "timeout",
    "transport",
    "http_status",
    "content_type",
    "invalid_json",
    "contract",
    "receipt_write",
    # Second-leg codes: the canary's live mode:converse probe. See
    # sp-proxy/netlify/functions/_shared/sp-health-receipt.mjs for what each
    # one points at. actor_budget is the canary spending the rotation cap it
    # shares with learners; it is not a provider outage.
    "actor_timeout",
    "actor_status",
    "actor_budget",
    "actor_contract",
}
SUCCESS_KEYS = {
    "schemaVersion",
    "state",
    "learnerReady",
    "actorReady",
    "replyLatencyBucket",
    "caseCount",
    "checkedAt",
    "nextRun",
    "contractSha256",
    # Identity of the pack CONTENT that was serving. packVersion does not move
    # when scoring does -- the D12/D13 wave changed 70 lines and left it at
    # 0.1.0 -- and the proxy fetches the pack from main at runtime, so student-
    # facing behaviour can change with no deploy. This is the durable record.
    "packSha256",
}
# Coarse on purpose -- see the note beside LATENCY_BUCKETS in
# sp-proxy/netlify/functions/_shared/sp-health-receipt.mjs. Drift from "fast"
# toward "slow" across days is the earliest signal of provider degradation.
LATENCY_BUCKETS = {"fast", "normal", "slow", "not-probed"}
FAILURE_KEYS = {
    "schemaVersion",
    "state",
    "failureCode",
    "checkedAt",
}
MINIMAL_FAILURE_STATES = {"missing", "malformed", "unavailable"}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _utc_now():
    return datetime.now(timezone.utc)


def _as_utc(value):
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("timestamp must be timezone-aware")
    return value.astimezone(timezone.utc)


def _parse_timestamp(value):
    if not isinstance(value, str) or not value or len(value) > 40:
        raise ValueError("invalid timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError("timestamp must be UTC")
    return parsed.astimezone(timezone.utc)


def _timestamp(value):
    return _as_utc(value).isoformat(timespec="seconds")


def _base(now, state, gate):
    return {
        "schemaVersion": 1,
        "gate": gate,
        "state": state,
        "checkedAt": _timestamp(now),
    }


def _valid_sha256(value):
    return (
        isinstance(value, str)
        and len(value) == 64
        and set(value).issubset(SHA256)
    )


def evaluate_status(payload, *, now):
    """Normalize a public status response without retaining untrusted values."""
    now = _as_utc(now)
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        return _base(now, "malformed", "blocked")
    state = payload.get("state")

    if state in {"success", "stale", "late-slot"}:
        if (
            set(payload) != SUCCESS_KEYS
            or type(payload.get("learnerReady")) is not bool
            or type(payload.get("actorReady")) is not bool
            # A pack learners can reach must have answered. learnerReady
            # without actorReady is the contradiction this monitor exists to
            # catch -- it is the shape the health surface had while the
            # Interview Room was mute. The reverse is honest: a draft pack
            # refuses POSTs by design, so nothing was probed. The pre-probe
            # seven-key receipt fails the key-set check above either way.
            or (payload["learnerReady"] and payload["actorReady"] is not True)
            or payload.get("replyLatencyBucket") not in LATENCY_BUCKETS
            # The bucket and the readiness flag are two views of one fact and
            # can never disagree: a turn that completed has a timing, one that
            # was never sent has none.
            or payload["actorReady"] != (payload["replyLatencyBucket"] != "not-probed")
            or type(payload.get("caseCount")) is not int
            or payload["caseCount"] <= 0
            or payload["caseCount"] > 10_000
            or not _valid_sha256(payload.get("contractSha256"))
            or not _valid_sha256(payload.get("packSha256"))
        ):
            return _base(now, "malformed", "blocked")
        try:
            receipt_checked = _parse_timestamp(payload["checkedAt"])
            next_run = _parse_timestamp(payload["nextRun"])
        except (KeyError, ValueError):
            return _base(now, "malformed", "blocked")
        if now < receipt_checked or next_run < receipt_checked:
            return _base(now, "malformed", "blocked")

        normalized_state = state
        gate = "blocked"
        if state == "success":
            if now - receipt_checked > MAX_AGE:
                normalized_state = "stale"
            elif now > next_run + SLOT_JITTER:
                normalized_state = "late-slot"
            else:
                gate = "ready"
        return {
            **_base(now, normalized_state, gate),
            "receiptCheckedAt": payload["checkedAt"],
            "nextRun": payload["nextRun"],
            "learnerReady": payload["learnerReady"],
            "actorReady": payload["actorReady"],
            "replyLatencyBucket": payload["replyLatencyBucket"],
            "caseCount": payload["caseCount"],
            "contractSha256": payload["contractSha256"],
            "packSha256": payload["packSha256"],
        }

    if state == "failed":
        if (
            set(payload) != FAILURE_KEYS
            or payload.get("failureCode") not in FAILURE_CODES
        ):
            return _base(now, "malformed", "blocked")
        try:
            _parse_timestamp(payload["checkedAt"])
        except (KeyError, ValueError):
            return _base(now, "malformed", "blocked")
        return {
            **_base(now, "failed", "blocked"),
            "failureCode": payload["failureCode"],
            "receiptCheckedAt": payload["checkedAt"],
        }

    if state in MINIMAL_FAILURE_STATES and set(payload) == {
        "schemaVersion",
        "state",
    }:
        return _base(now, state, "blocked")
    return _base(now, "malformed", "blocked")


def _status(response):
    value = getattr(response, "status", None)
    if value is not None:
        return value
    getter = getattr(response, "getcode", None)
    return getter() if callable(getter) else None


def probe_status(url=PUBLIC_STATUS_URL, *, opener=None, now=_utc_now):
    """Perform one credential-free GET and return a normalized receipt."""
    checked_at = _as_utc(now())
    if url != PUBLIC_STATUS_URL:
        return _base(checked_at, "configuration", "blocked")

    client = opener or build_opener(_NoRedirect())
    request = Request(
        PUBLIC_STATUS_URL,
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        response = client.open(request, timeout=TIMEOUT_SECONDS)
        try:
            if _status(response) != 200:
                return _base(checked_at, "http_status", "blocked")
            headers = getattr(response, "headers", {})
            content_type = headers.get("Content-Type", "")
            if content_type.split(";", 1)[0].strip().lower() != "application/json":
                return _base(checked_at, "content_type", "blocked")
            raw = response.read(MAX_BODY_BYTES + 1)
            if not isinstance(raw, bytes) or len(raw) > MAX_BODY_BYTES:
                return _base(checked_at, "malformed", "blocked")
        finally:
            response.close()
    except HTTPError:
        return _base(checked_at, "http_status", "blocked")
    except Exception:
        return _base(checked_at, "unavailable", "blocked")

    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _base(checked_at, "malformed", "blocked")
    return evaluate_status(payload, now=checked_at)


def main(argv=None, *, opener=None, now=_utc_now):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=PUBLIC_STATUS_URL)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    receipt = probe_status(args.url, opener=opener, now=now)
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except OSError:
        return 2
    return 0 if receipt["gate"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
