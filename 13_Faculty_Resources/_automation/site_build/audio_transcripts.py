#!/usr/bin/env python3
"""Publish the OE landmark-brief transcripts next to the audio (WP-16 step 2).

Source: 12_Media/audio_oe/transcripts/OE-NN.md — one committed Markdown sidecar per brief,
written by the dev-only _automation/transcribe_audio.py (a machine transcript, born
`<!-- transcript-status: machine -->` and saying "pending faculty spot-check" in its
visible header). This module never transcribes; the build only renders what is committed.

Output: <site>/audio_oe/transcripts/OE-NN.html — a standalone, readable page (lang,
viewport, the sidecar's own heading as <title>, light/dark via the browser's system colors).
build_deploy.py writes it into the MS3 build beside the copied audio, and the resident
build inherits it through its copytree of MS3, so both sites serve the same bytes.

Why HTML and not the raw .md: a text alternative a learner cannot comfortably read is not
much of one. Netlify serves .md as text/markdown, which some browsers download instead of
showing, and a bare text file renders unscaled on a phone. The Markdown is rendered with
the same vendored Marked parser the learner reader uses (welcome_compass.py's rule: never a
regex approximation), in one node process for the whole set.

Why under /audio_oe/: the transcript lives next to the audio it transcribes, and that
prefix is already outside the service worker's precache and fetch handling (common.py
SW_EXCLUDE_PREFIXES, sw_template.js isMedia) — a text file there is fetched from the
network like its audio, never cached into a stale offline copy.

What links to a transcript is decided elsewhere: pairings_block.py links one beside every
audio player it renders and refuses to render a paired brief whose sidecar is missing.
review.html also plays these briefs but is a shipped, attested tool that this work leaves
untouched, so a brief heard only there has a published transcript that no player links;
media_manifest.json records that honestly (textAlt null) rather than claiming it.

Tests: site_build/test_pairings_block.py (TranscriptTests). Nothing globs
site_build/test_*.py, so a separate test file would never run in CI or bin/verify.sh.

Determinism: nothing here reads the clock. Same sidecars in, byte-identical pages out.
"""

import json
import os
import re
import subprocess
from html import escape

SOURCE_DIR = "12_Media/audio_oe/transcripts"
OUT_DIR = "audio_oe/transcripts"
ID_RE = re.compile(r"^OE-\d{2}$")
STATUS_RE = re.compile(r"<!--\s*transcript-status:\s*([a-z-]+)\s*-->")
TITLE_RE = re.compile(r"^# (.+)$", re.M)

HERE = os.path.dirname(os.path.abspath(__file__))
MARKED = os.path.join(HERE, "marked.min.js")

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:1.0625rem/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:42rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.5rem;line-height:1.3;margin:0 0 .75rem}
li{margin:.35rem 0}
hr{margin:1.5rem 0}
</style>
</head>
<body>
<main>
%(body)s
</main>
</body>
</html>
"""


class TranscriptError(SystemExit):
    """A malformed sidecar aborts the build, like every other registry error here."""


def transcript_id(number):
    """MANIFEST.csv `number` ("7" or "07") -> "OE-07"."""
    text = str(number).strip()
    if not text.isdigit():
        raise TranscriptError("transcripts: not a brief number: %r" % (number,))
    return "OE-%02d" % int(text)


def source_path(lib_root, tid):
    return os.path.join(lib_root, SOURCE_DIR, tid + ".md")


def served_path(tid):
    """Site-root-relative URL of the rendered page, as a content page links it."""
    return "%s/%s.html" % (OUT_DIR, tid)


def exists(lib_root, tid):
    return os.path.isfile(source_path(lib_root, tid))


def status(markdown):
    """The sidecar's `transcript-status` value, or None when it has none."""
    match = STATUS_RE.search(markdown)
    return match.group(1) if match else None


def title(markdown):
    match = TITLE_RE.search(markdown)
    return match.group(1).strip() if match else None


def discover(lib_root):
    """Sorted transcript ids with a sidecar on disk. Anything else in the dir is an error:
    a stray file there is either a typo'd id no player could ever link or a draft that
    would ship without anyone noticing."""
    directory = os.path.join(lib_root, SOURCE_DIR)
    if not os.path.isdir(directory):
        return []
    ids = []
    for name in sorted(os.listdir(directory)):
        stem, ext = os.path.splitext(name)
        if ext != ".md" or not ID_RE.match(stem):
            raise TranscriptError(
                "transcripts: unexpected file %s/%s (expected OE-NN.md)" % (SOURCE_DIR, name)
            )
        ids.append(stem)
    return ids


def render_markdown_batch(texts):
    """Render a list of Markdown strings with the vendored Marked, in one node process."""
    if not texts:
        return []
    script = (
        "const fs=require('fs');const marked=require(process.argv[1]);"
        "const docs=JSON.parse(fs.readFileSync(0,'utf8'));"
        "process.stdout.write(JSON.stringify(docs.map(d=>marked.parse(d))));"
    )
    try:
        result = subprocess.run(
            ["node", "-e", script, MARKED],
            input=json.dumps(texts), text=True, capture_output=True, check=True,
        )
        return json.loads(result.stdout)
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        raise TranscriptError("transcripts: Markdown could not be rendered: %s" % error)


def render_page(markdown, body_html):
    heading = title(markdown)
    return PAGE % {"title": escape(heading, quote=False), "body": body_html.strip()}


def validate(tid, markdown):
    """Every sidecar must carry the two things a reader and a re-run depend on."""
    if title(markdown) is None:
        raise TranscriptError("transcripts: %s has no '# ' heading" % tid)
    if status(markdown) is None:
        raise TranscriptError(
            "transcripts: %s has no <!-- transcript-status: ... --> line "
            "(machine or reviewed)" % tid
        )


def publish(lib_root, out_dir):
    """Render every sidecar into <out_dir>/audio_oe/transcripts/. Returns the ids written."""
    ids = discover(lib_root)
    texts = []
    for tid in ids:
        with open(source_path(lib_root, tid), encoding="utf-8") as handle:
            text = handle.read()
        validate(tid, text)
        texts.append(text)
    target = os.path.join(out_dir, OUT_DIR)
    if ids:
        os.makedirs(target, exist_ok=True)
    for tid, text, body in zip(ids, texts, render_markdown_batch(texts)):
        with open(os.path.join(target, tid + ".html"), "w", encoding="utf-8") as handle:
            handle.write(render_page(text, body))
    return ids
