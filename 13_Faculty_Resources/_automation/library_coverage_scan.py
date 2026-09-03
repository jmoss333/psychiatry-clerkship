#!/usr/bin/env python3
"""Report which clerkship topics have a shipped BOOK, PODCAST or AUDIO surface.

Report-only. Never edits, never gates a build, never runs on Netlify — the same posture as
export_curriculum_review.py. It exists so the coverage table in
docs/superpowers/plans/2026-09-03-library-gap-scan-podcasts-books-audiobooks.md is
reproducible rather than asserted.

WHY IT SCANS FOUR SURFACES, NOT TWO
-----------------------------------
The first pass of that gap scan looked only at the podcast and book pages and therefore
reported the acute inpatient spine as having "no audio". That was wrong in a way that could
have sent faculty looking for audio the library already ships: 12_Media/audio_oe/ carries 50
NotebookLM landmark briefs — including delirium, catatonia, ECT, lithium and clozapine — and
07_Evidence_and_Reading/.../landmark_trials.md publishes them. Codex flagged it on PR #478.
So every surface that can satisfy "is there something to read or listen to on this topic"
is scanned here, and the verdict column names the surfaces that are actually empty.

LIMITATION, STATED RATHER THAN HIDDEN
-------------------------------------
This is a keyword scan over titles and list text, so it measures FINDABILITY, not coverage.
A topic reads as absent when no title on that surface contains its words, even if an episode
covers it under different words: Puder Ep 37 "How to Treat Violent Patients" bears on
agitation, but "agitation" appears in no title, so Agitation scores 0 on the podcast surface
while Violence scores 6. Findability is the thing a student searching the page experiences,
which is why it is worth measuring — but do not read a 0 as "nothing exists".
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PODCAST = "12_Media/psychiatry_psychotherapy_podcast_library.md"
BOOKS = "07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md"
AUDIO_OE = "12_Media/audio_oe/MANIFEST.csv"
MANIFEST = "13_Faculty_Resources/_automation/site_build/site_manifest.json"

# Clerkship topic -> regex alternatives. Word-boundaried on purpose: an early version counted
# "ect" inside "affect"/"connect"/"select" and reported 10 ECT hits on a page with one.
TOPICS = {
    "Delirium": [r"deliri\w*"],
    "Catatonia": [r"cataton\w*"],
    "Agitation / restraint": [r"agitat\w*", r"restraint\w*", r"seclusion", r"de-escalat\w*"],
    "Violence risk": [r"violen\w*", r"aggress\w*"],
    "Toxidromes / withdrawal": [r"withdrawal", r"toxidrome\w*", r"intoxicat\w*",
                                r"serotonin syndrome", r"neuroleptic malignant"],
    "Decisional capacity": [r"\bcapacity\b", r"competen\w*"],
    "Involuntary commitment": [r"involuntary", r"commitment", r"\bholds?\b", r"conservator\w*"],
    "ECT / neuromodulation": [r"\bect\b", r"electroconvuls\w*", r"\btms\b", r"neuromodulation"],
    "Clozapine": [r"clozapine"],
    "Lithium": [r"lithium"],
    "Metabolic / med monitoring": [r"monitoring", r"metabolic"],
    "Medical workup / mimics": [r"workup", r"medical mimic\w*", r"\blabs\b"],
    "Consult-liaison": [r"consult\w*[- ]liaison", r"general hospital"],
    "Suicide / self-harm": [r"suicid\w*", r"self-harm"],
    "Documentation / oral pres": [r"documentation", r"oral present\w*", r"progress note\w*"],
    "Case formulation": [r"formulation"],
    "Differential diagnosis": [r"differential"],
    "Motivational interviewing": [r"motivational interview\w*"],
    "Shelf / COMAT exam": [r"\bshelf\b", r"\bcomat\b", r"usmle", r"step 2"],
    "Discharge / disposition": [r"discharge", r"disposition", r"aftercare"],
    "Geriatric / dementia": [r"geriatric", r"dementia", r"alzheimer\w*"],
    "Perinatal": [r"perinatal", r"postpartum", r"pregnan\w*"],
    "Eating disorders": [r"eating disorder\w*", r"anorexi\w*", r"bulimi\w*"],
    "Sleep": [r"\bsleep\w*", r"insomnia"],
    "Ethics / med-legal": [r"\bethic\w*", r"\blegal\b", r"goldwater"],
}


def read_text(rel):
    path = ROOT / rel
    if not path.exists():
        sys.exit("missing surface: %s" % rel)
    return path.read_text(encoding="utf-8").lower()


def read_audio_titles():
    """Landmark-brief titles from the audio_oe manifest — a shipped listening surface."""
    path = ROOT / AUDIO_OE
    if not path.exists():
        sys.exit("missing surface: %s" % AUDIO_OE)
    with path.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    return " ".join(
        "%s %s" % (r.get("source_title", ""), r.get("audio_card_title", "")) for r in rows
    ).lower(), len(rows)


def hits(text, patterns):
    return sum(len(re.findall(p, text)) for p in patterns)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    args = parser.parse_args()

    pod = read_text(PODCAST)
    book = read_text(BOOKS)
    audio, brief_count = read_audio_titles()

    registered = {row[1] for row in json.loads((ROOT / MANIFEST).read_text(encoding="utf-8"))["md"]}
    landmark_shipped = "landmark_trials.md" in registered

    rows = []
    for topic, patterns in TOPICS.items():
        p, b, a = hits(pod, patterns), hits(book, patterns), hits(audio, patterns)
        empty = [name for name, n in (("podcast", p), ("book", b), ("audio", a)) if n == 0]
        rows.append({"topic": topic, "podcast": p, "book": b, "audio": a,
                     "empty_surfaces": empty, "unserved_everywhere": len(empty) == 3})

    if args.json:
        print(json.dumps({"briefs": brief_count, "landmark_page_shipped": landmark_shipped,
                          "rows": rows}, indent=2))
        return 0

    print("Surfaces scanned: podcast page · book page · %d audio_oe landmark briefs"
          " · landmark_trials.md registered: %s" % (brief_count, landmark_shipped))
    print("Counts are keyword hits per surface. Findability, not coverage — see the docstring.\n")
    print("%-28s%5s%6s%6s   %s" % ("CLERKSHIP TOPIC", "POD", "BOOK", "AUDIO", "EMPTY SURFACES"))
    print("-" * 78)
    for r in rows:
        note = "ALL THREE EMPTY" if r["unserved_everywhere"] else ", ".join(r["empty_surfaces"])
        print("%-28s%5d%6d%6d   %s" % (r["topic"], r["podcast"], r["book"], r["audio"], note))

    nowhere = [r["topic"] for r in rows if r["unserved_everywhere"]]
    nobook = [r["topic"] for r in rows if r["book"] == 0]
    noaudio = [r["topic"] for r in rows if r["podcast"] == 0 and r["audio"] == 0]
    print("\nUNSERVED ON ALL THREE SURFACES (%d): %s" % (len(nowhere), "; ".join(nowhere) or "none"))
    print("\nNO BOOK (%d): %s" % (len(nobook), "; ".join(nobook)))
    print("\nNO AUDIO OF ANY KIND (%d): %s" % (len(noaudio), "; ".join(noaudio)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
