#!/usr/bin/env python3
"""Validate faculty attestation consistency across source registries.

The faculty console commits review decisions to reviewed.json. Some high-risk
or workflow-rich pages also carry topic_meta.facultyReview metadata. This guard
keeps those two review ledgers from disagreeing silently.
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REVIEWED = os.path.join(ROOT, "13_Faculty_Resources", "reviewed.json")
TOPIC_META = os.path.join(ROOT, "topic_meta.json")
MANIFEST = os.path.join(ROOT, "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def norm_status(value):
    return str(value or "unreviewed")


def main():
    reviewed = load(REVIEWED)
    topic_meta = load(TOPIC_META)
    manifest = load(MANIFEST)
    manifest_md_entries = manifest.get("md", [])
    manifest_md = {slug for _src, slug, _title in manifest_md_entries}
    manifest_tools = {slug for _src, slug, _title in manifest.get("tools", [])}
    manifest_items = manifest_md | manifest_tools

    errors = []

    for slug in sorted(manifest_items):
        if slug not in reviewed:
            errors.append("%s: missing reviewed.json entry" % slug)

    for src, slug, _title in manifest_md_entries:
        ledger_status = norm_status(reviewed.get(slug, {}).get("status"))
        if ledger_status != "reviewed":
            continue
        source_path = os.path.join(ROOT, src)
        try:
            with open(source_path, encoding="utf-8") as f:
                source_head = "\n".join(f.read().splitlines()[:8])
        except FileNotFoundError:
            errors.append("%s: source file listed in manifest is missing (%s)" % (slug, src))
            continue
        if re.search(r"pending.*review|pending.*attestation|AI-drafted", source_head, re.I):
            errors.append("%s: reviewed.json says reviewed but source banner still says pending review" % slug)

    for slug in sorted(manifest_md):
        meta = topic_meta.get(slug)
        if not isinstance(meta, dict):
            continue
        faculty = meta.get("facultyReview")
        if not isinstance(faculty, dict):
            continue
        ledger = reviewed.get(slug, {})
        ledger_status = norm_status(ledger.get("status"))
        faculty_status = norm_status(faculty.get("status"))
        if ledger_status == "reviewed" and faculty_status != "reviewed":
            errors.append("%s: reviewed.json says reviewed but topic_meta.facultyReview.status is %s" % (slug, faculty_status))
        if ledger_status != "reviewed" and faculty_status == "reviewed":
            errors.append("%s: topic_meta says reviewed but reviewed.json status is %s" % (slug, ledger_status))
        if ledger_status == "reviewed":
            if not faculty.get("lastReviewed"):
                errors.append("%s: reviewed topic_meta entry is missing facultyReview.lastReviewed" % slug)
            if not faculty.get("reviewer") or faculty.get("reviewer") == "Pending faculty review":
                errors.append("%s: reviewed topic_meta entry is missing an attesting reviewer" % slug)

    if errors:
        print("attestation consistency INVALID — %d issue(s):" % len(errors))
        for err in errors:
            print("  -", err)
        return 1

    faculty_count = sum(
        1
        for slug in manifest_md
        if isinstance(topic_meta.get(slug), dict)
        and isinstance(topic_meta.get(slug, {}).get("facultyReview"), dict)
    )
    noun = "entry" if faculty_count == 1 else "entries"
    print("attestation consistency OK — %d manifest item(s), %d topic facultyReview %s aligned." % (len(manifest_items), faculty_count, noun))
    return 0


if __name__ == "__main__":
    sys.exit(main())
