#!/usr/bin/env python3
"""DEV-ONLY: machine-transcribe served audio that has no text alternative (WP-16 step 2).

NOT part of the build, CI or bin/verify.sh. The build never transcribes anything: it only
renders the committed sidecars this tool writes (site_build/audio_transcripts.py). Run it
by hand on an Apple-silicon Mac, in a throwaway virtualenv that has mlx-whisper installed
(the only dependency; it is deliberately absent from requirements.txt):

    python3 -m venv <venv> && <venv>/bin/pip install mlx-whisper
    <venv>/bin/python 13_Faculty_Resources/_automation/transcribe_audio.py --dry-run
    <venv>/bin/python 13_Faculty_Resources/_automation/transcribe_audio.py

ffmpeg must be on PATH (mlx-whisper decodes audio through it). The first real run
downloads the model weights into the Hugging Face cache.

What it does
------------
Reads media_manifest.json and selects every `audio` entry that is served (`served: true`)
and lacks a text alternative (`captions` is not true and `textAlt` is empty). Each one is
mapped to its source bytes (SOURCE_DIRS) and transcribed with an explicit model id
(MODEL_ID) and language (LANGUAGE), and the transcript is written as a Markdown sidecar
next to the audio: 12_Media/audio_oe/OE-01_<...>.m4a -> 12_Media/audio_oe/transcripts/OE-01.md.

The output is a MACHINE transcript. Cleanup is limited to paragraph breaks; nothing is
corrected. Whisper can mishear a drug name, a number or a trial name, so every sidecar is
born `transcript-status: machine` and says "pending faculty spot-check" in its header.

Idempotent, and safe around human review
----------------------------------------
- An entry whose sidecar already exists is skipped. Re-running the tool is a no-op.
- `--force` re-transcribes an existing sidecar ONLY while it is still marked
  `<!-- transcript-status: machine -->`. A sidecar with any other status line
  (`reviewed`), or with no status line at all, is never overwritten — not even with
  `--force`. Marking a transcript reviewed is a two-line human edit: change that status
  comment to `reviewed`, and replace the "pending faculty spot-check" sentence in the
  visible header with who checked it and when.
- A source file that is a Git-LFS pointer stub (or missing) is an error for that entry,
  never transcribed: a stub would transcribe as silence and look like success.

It never edits media_manifest.json. Whether a transcript is REACHABLE by a learner is a
fact about the build (which renderer links it), not about this tool, so the manifest's
`textAlt` is set by hand where a learner-facing player links the transcript; the pairing
renderer's tests hold the two in agreement (site_build/test_pairings_block.py).

Exit status: 0 when every selected entry was written or skipped; 1 when any entry failed;
2 when the manifest or MANIFEST.csv cannot be read.
"""

import argparse
import csv
import datetime
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "media_manifest.json"

MODEL_ID = "mlx-community/whisper-large-v3-turbo"
MODEL_LABEL = "Whisper large-v3-turbo"
LANGUAGE = "en"
SAMPLE_RATE = 16000  # mlx_whisper.audio.load_audio() resamples to 16 kHz mono

# Manifest `file` prefix (the served path) -> source directory in this repo. Only the OE
# NotebookLM briefs are mapped: they are the only served audio without a text alternative.
SOURCE_DIRS = {"audio_oe/": ROOT / "12_Media" / "audio_oe"}
TRANSCRIPT_SUBDIR = "transcripts"
OE_ID_RE = re.compile(r"^(OE-\d{2})_")
CSV_NAME = "MANIFEST.csv"

# Provenance of the audio itself, from 12_Media/audio_oe/README.md (not inferred).
AUDIO_PROVENANCE = (
    "a NotebookLM brief audio summary of an OpenEvidence landmark psychiatry source "
    "(generated 2026-06-30), not a faculty recording"
)

STATUS_RE = re.compile(r"<!--\s*transcript-status:\s*([a-z-]+)\s*-->")
MACHINE_STATUS = "machine"
LFS_HEADER = b"version https://git-lfs"
MIN_REAL_BYTES = 4096

# Paragraphing (the only cleanup): break at a sentence end that follows a pause, once the
# paragraph has some length; force a break at a sentence end once it is long.
PARA_MIN_WORDS = 45
PARA_MAX_WORDS = 110
PARA_PAUSE_SECONDS = 0.45
SENTENCE_END = (".", "?", "!", '."', '?"', '!"')
# Whisper can emit text for a padded final window after the audio has ended. A segment
# that STARTS past the end of the audio cannot be speech in it; it is dropped and counted.
TAIL_TOLERANCE_SECONDS = 0.25
REPEAT_FLAG = 3  # the same segment text this many times in a row -> flagged for review


class TranscribeError(Exception):
    pass


def served_without_text_alternative(manifest):
    """Manifest audio entries that are served and have neither captions nor a textAlt."""
    out = []
    for entry in manifest.get("audio", []):
        if not isinstance(entry, dict) or entry.get("served") is not True:
            continue
        if entry.get("captions") is True:
            continue
        text_alt = entry.get("textAlt")
        if isinstance(text_alt, str) and text_alt.strip():
            continue
        out.append(entry)
    return out


def source_for(served_file):
    """(source audio path, OE id) for a manifest `file`, or raise TranscribeError."""
    for prefix, directory in SOURCE_DIRS.items():
        if served_file.startswith(prefix):
            name = served_file[len(prefix):]
            match = OE_ID_RE.match(name)
            if "/" in name or not match:
                raise TranscribeError("unrecognised audio name: %s" % served_file)
            return directory / name, match.group(1)
    raise TranscribeError("no source mapping for served path: %s" % served_file)


def sidecar_for(source):
    match = OE_ID_RE.match(source.name)
    return source.parent / TRANSCRIPT_SUBDIR / ("%s.md" % match.group(1))


def sidecar_status(path):
    """'machine', another status string, or None when the sidecar has no status line."""
    match = STATUS_RE.search(path.read_text(encoding="utf-8"))
    return match.group(1) if match else None


def load_csv_rows(directory):
    path = directory / CSV_NAME
    with open(path, encoding="utf-8") as handle:
        return {row["filename"]: row for row in csv.DictReader(handle)}


def require_real_media(path):
    if not path.is_file():
        raise TranscribeError("source audio missing: %s" % path.relative_to(ROOT))
    with open(path, "rb") as handle:
        head = handle.read(len(LFS_HEADER))
    if head == LFS_HEADER or path.stat().st_size < MIN_REAL_BYTES:
        raise TranscribeError(
            "source audio is a Git-LFS pointer stub, not media (run `git lfs pull`): %s"
            % path.relative_to(ROOT)
        )


def paragraphs(segments):
    """Group Whisper segments into paragraphs. Text is joined, never rewritten."""
    paras, current, words, prev_end = [], [], 0, None
    for segment in segments:
        text = " ".join(segment["text"].split())
        if not text:
            continue
        if current:
            gap = segment["start"] - prev_end if prev_end is not None else 0.0
            ended = current[-1].endswith(SENTENCE_END)
            if ended and (
                (words >= PARA_MIN_WORDS and gap >= PARA_PAUSE_SECONDS) or words >= PARA_MAX_WORDS
            ):
                paras.append(" ".join(current))
                current, words = [], 0
        current.append(text)
        words += len(text.split())
        prev_end = segment["end"]
    if current:
        paras.append(" ".join(current))
    return paras


def clean_segments(segments, duration):
    """Drop segments that start after the audio ends; flag runs of repeated text."""
    kept, dropped, flags = [], 0, []
    for segment in segments:
        if segment["start"] >= duration - TAIL_TOLERANCE_SECONDS:
            dropped += 1
            continue
        kept.append(segment)
    run = 1
    for before, after in zip(kept, kept[1:]):
        same = " ".join(before["text"].split()).lower() == " ".join(after["text"].split()).lower()
        run = run + 1 if same else 1
        if run == REPEAT_FLAG:
            flags.append("repeated segment text x%d at %.1fs" % (REPEAT_FLAG, after["start"]))
    if kept and kept[-1]["end"] > duration + 1.0:
        flags.append("last segment ends %.1fs past the audio" % (kept[-1]["end"] - duration))
    return kept, dropped, flags


def render_sidecar(oe_id, row, source, paras, date):
    """The committed Markdown sidecar. The header lines are what the build renders."""
    rel_audio = source.relative_to(ROOT).as_posix()
    lines = [
        "<!-- transcript-status: %s -->" % MACHINE_STATUS,
        "<!-- audio-file: %s -->" % rel_audio,
        "<!-- generated-by: 13_Faculty_Resources/_automation/transcribe_audio.py"
        " (mlx-whisper, %s, language %s, %s) -->" % (MODEL_ID, LANGUAGE, date),
        "",
        "# Transcript: %s" % row["source_title"].strip(),
        "",
        "**Landmark brief %s** · audio length %s" % (oe_id, row["duration"].strip()),
        "",
        "- **The audio is AI-generated:** %s." % AUDIO_PROVENANCE,
        "- **Machine transcript (%s, %s) — pending faculty spot-check.** Paragraph breaks"
        " were added; the wording has not been corrected, so a drug name, number or trial"
        " name may be misheard." % (MODEL_LABEL, date),
        "",
        "---",
        "",
    ]
    body = "\n\n".join(paras)
    return "\n".join(lines) + "\n" + body + "\n"


def transcribe(source):
    """(segments, duration seconds) for one audio file. Imports mlx-whisper lazily so
    --dry-run and --help work without it."""
    try:
        import mlx_whisper
        from mlx_whisper.audio import load_audio
    except ImportError as error:
        raise TranscribeError(
            "mlx-whisper is not importable from %s — run this with the virtualenv described "
            "in the module docstring" % sys.executable
        ) from error
    audio = load_audio(str(source))
    duration = audio.shape[0] / SAMPLE_RATE
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=MODEL_ID,
        language=LANGUAGE,
        verbose=None,
        # Conditioning on the previous window let one hallucination seed the next
        # (a looping sentence after the speech ended); off, the trial run was clean.
        condition_on_previous_text=False,
    )
    return result["segments"], duration


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--only", default="", help="comma-separated OE ids, e.g. OE-01,OE-13")
    parser.add_argument("--force", action="store_true",
                        help="re-transcribe sidecars still marked machine (never reviewed ones)")
    parser.add_argument("--dry-run", action="store_true", help="list the plan; write nothing")
    parser.add_argument("--date", default=datetime.date.today().isoformat(),
                        help="transcription date written into the header (default: today)")
    parser.add_argument("--timing-json", type=Path, default=None,
                        help="also write per-file timing and review flags to this JSON file")
    args = parser.parse_args(argv)

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        rows = {}
        for directory in SOURCE_DIRS.values():
            rows.update(load_csv_rows(directory))
    except (OSError, ValueError, KeyError) as error:
        print("cannot read inputs: %s" % error, file=sys.stderr)
        return 2
    only = {item.strip() for item in args.only.split(",") if item.strip()}

    selected = served_without_text_alternative(manifest)
    print("%d served audio entr%s without a text alternative"
          % (len(selected), "y" if len(selected) == 1 else "ies"))
    failures, report, started = 0, [], time.monotonic()
    for entry in selected:
        served = entry.get("file", "")
        try:
            source, oe_id = source_for(served)
            if only and oe_id not in only:
                continue
            sidecar = sidecar_for(source)
            if sidecar.exists():
                status = sidecar_status(sidecar)
                if status != MACHINE_STATUS:
                    print("  keep  %s (status %s — never overwritten)" % (oe_id, status or "none"))
                    continue
                if not args.force:
                    print("  skip  %s (sidecar exists)" % oe_id)
                    continue
            row = rows.get(source.name)
            if row is None:
                raise TranscribeError("%s is not in %s" % (source.name, CSV_NAME))
            require_real_media(source)
            if args.dry_run:
                print("  plan  %s -> %s" % (oe_id, sidecar.relative_to(ROOT)))
                continue
            clock = time.monotonic()
            segments, duration = transcribe(source)
            kept, dropped, flags = clean_segments(segments, duration)
            sidecar.parent.mkdir(parents=True, exist_ok=True)
            sidecar.write_text(
                render_sidecar(oe_id, row, source, paragraphs(kept), args.date), encoding="utf-8"
            )
            seconds = time.monotonic() - clock
            report.append({
                "id": oe_id, "seconds": round(seconds, 1), "audioSeconds": round(duration, 1),
                "segments": len(kept), "droppedPastEnd": dropped, "flags": flags,
            })
            print("  wrote %s (%.1fs for %.0fs of audio%s%s)" % (
                sidecar.relative_to(ROOT), seconds, duration,
                ", dropped %d past-end segment(s)" % dropped if dropped else "",
                "; FLAG: " + "; ".join(flags) if flags else "",
            ))
        except TranscribeError as error:
            failures += 1
            print("  FAIL  %s: %s" % (served, error), file=sys.stderr)
    total = time.monotonic() - started
    print("done in %.1fs: %d written, %d failed" % (total, len(report), failures))
    if args.timing_json and not args.dry_run:
        args.timing_json.write_text(
            json.dumps({"model": MODEL_ID, "language": LANGUAGE, "totalSeconds": round(total, 1),
                        "files": report}, indent=2) + "\n",
            encoding="utf-8",
        )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
