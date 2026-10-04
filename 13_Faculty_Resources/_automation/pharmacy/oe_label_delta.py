#!/usr/bin/env python3
"""Ask OpenEvidence which card claims a label change contradicts -- and check its answer.

A drifted card (check_label_drift.py --record) tells the reviewer WHICH label sections moved
and, in the review packet, the word diff. This turns that into the reviewer's real question --
"which lines on this card does the new text make wrong?" -- asked of OpenEvidence with the
card's claims and only the label sentences that changed attached, then verified so an OE answer cannot invent
support: every verdict that cites the label must quote the NEW label text verbatim.

    python3 oe_label_delta.py prompt ID [--ledger PATH]
        Print the prompt for the newest drift of ID in the ledger: each card claim with a stable
        id (its field path), the changed sections' new text (and the pinned old text where it
        was verified), and the strict answer format below. Paste it into OpenEvidence.

    python3 oe_label_delta.py check ID ANSWER.md [--ledger PATH] [--save]
        Parse OpenEvidence's answer and verify it:
          * one verdict line per claim id the prompt listed -- none missing, none invented;
          * CONTRADICTED / NARROWED / SUPPORTED must quote ONE sentence that appears verbatim
            (whitespace- and quote-mark-normalised) among the NEW sentences the prompt showed;
            no ellipsis stitching;
          * SILENT carries no quote.
        Prints the review checklist, contradicted lines first. --save stores the verified
        verdicts beside the ledger (oe_label_delta/<id>-v<to>.json) so render_review_packet.py
        shows them in section 0.

Answer format (one line per claim, anything else is ignored):
    CLAIM <id> | CONTRADICTED | "<verbatim sentence from the new label text>"
    CLAIM <id> | NARROWED | "<verbatim sentence>"
    CLAIM <id> | SUPPORTED | "<verbatim sentence>"
    CLAIM <id> | SILENT

What "verified" means and does not: a verbatim quote proves the sentence is in the new label
text the prompt showed, not that it is about the claim. CONTRADICTED and NARROWED come first,
as unticked boxes, because those are the lines to edit; SUPPORTED carries no checkbox.

Exit 0 a complete, verified answer; 1 the answer cannot be trusted as it stands (a claim
missing, an unknown id, a quote not in the new text, a stitched quote) -- the checklist still
prints, flagged; 2 could not check (no ledger, no drift for ID, no captured text, unreadable
answer). Dev-only and offline: OpenEvidence itself is run by hand or by the browser agent.
"""

import argparse
import difflib
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import check_label_drift as drift  # noqa: E402  (ledger, records, section texts)

VERDICTS = ("CONTRADICTED", "NARROWED", "SUPPORTED", "SILENT")
# Fields that are identifiers, links or bookkeeping -- never a clinical claim.
NOT_CLAIMS = {
    "id", "generic", "brands", "group", "rxcui", "dailymedSetId", "labelVersionDate",
    "labelLink", "sourcePage", "perinatalSnapshotRef", "handoutRef", "evidenceIds", "qbankIds",
    "interactionCardIds", "oeAudioIds", "retrieval", "provenance", "facultyReview",
    "safetyLevel", "present",
}
LINE_RE = re.compile(
    r"^\W*CLAIM\W+([A-Za-z][\w.\[\]]*)\W*\|\s*\**\s*(%s)\s*\**\s*(?:\|\s*(.+?))?\s*$" % "|".join(VERDICTS))
ORDER = {v: i for i, v in enumerate(VERDICTS)}


class CouldNotCheck(Exception):
    pass


def claims(record):
    """[(claim id, text)] -- every string leaf of the card's classified fields, in path order.

    A claim id is the field path with list positions dotted: adverseEffects.dangerous.0.firstMove.
    """
    out = []

    def walk(value, path):
        if isinstance(value, str):
            if value.strip():
                out.append((path, " ".join(value.split())))
        elif isinstance(value, list):
            for index, child in enumerate(value):
                # dotted, never [i]: OpenEvidence renders "[0]" as a citation marker and drops
                # it, which turned five distinct claim ids into one (live run, 2026-10-03)
                walk(child, "%s.%d" % (path, index))
        elif isinstance(value, dict):
            for key in sorted(value):
                if key not in NOT_CLAIMS:
                    walk(value[key], "%s.%s" % (path, key) if path else key)

    classes = (record.get("provenance") or {}).get("fieldClasses", {})
    for field in sorted(classes):
        if field.split(".")[-1] in NOT_CLAIMS or field.split(".")[0] in NOT_CLAIMS:
            continue
        value = record
        for part in field.split("."):
            value = value.get(part) if isinstance(value, dict) else None
        if value is not None:
            walk(value, field)
    return out


def latest_drift(ledger, agent):
    rows = [d for d in (ledger or {}).get("drifts", []) if d["agent"] == agent]
    if not rows:
        raise CouldNotCheck("no drift for %s in the ledger" % agent)
    row = rows[-1]
    if not row.get("texts"):
        raise CouldNotCheck("the %s drift has no captured text: run check_label_drift.py --diff %s"
                            % (agent, agent))
    return row


def build_prompt(record, row):
    lines = [
        "You are checking a teaching card about %s against a change in its FDA label (DailyMed "
        "set id %s, version %s -> %s, effective %s)." % (
            record.get("generic", record["id"]), record.get("dailymedSetId"),
            row["fromVersion"], row["toVersion"], row["toDate"]),
        "",
        "For EVERY claim below, decide what the NEW label text says about it:",
        "- CONTRADICTED: the new text says something incompatible with the claim.",
        "- NARROWED: the new text adds a limit, warning or exception the claim leaves out.",
        "- SUPPORTED: the new text states what the claim says.",
        "- SILENT: the new text does not address it.",
        "",
        "Rules: judge ONLY against the NEW label text given below, not other sources. Quote exactly "
        "ONE sentence, copied character for character from the NEW text; never join sentences or "
        "use an ellipsis. Answer with one line per claim and nothing else, in this exact form:",
        'CLAIM <id> | CONTRADICTED | "<sentence>"',
        'CLAIM <id> | NARROWED | "<sentence>"',
        'CLAIM <id> | SUPPORTED | "<sentence>"',
        "CLAIM <id> | SILENT",
        "",
        "CLAIMS:",
    ]
    lines += ["- %s: %s" % (cid, text) for cid, text in claims(record)]
    lines += ["", "WHAT CHANGED IN THE LABEL (quote only from the NEW sentences):"]
    for key in prompt_sections(row):
        added, removed = changed_sentences(row["texts"][key])
        if not added and not removed:
            continue
        lines += ["", "§%s" % key]
        lines += ["NEW: %s" % t for t in added] or ["NEW: (none -- text was only removed)"]
        lines += ["REMOVED (context only, never quote): %s" % t for t in removed]
    return "\n".join(lines) + "\n"


def quotable_text(row):
    """The NEW sentences the prompt showed -- the only text a verdict may quote."""
    return " ".join(_norm(t) for key in prompt_sections(row)
                    for t in changed_sentences(row["texts"][key])[0])


SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(\[])")


def sentences(text):
    return [t for t in (x.strip() for x in SENTENCE_RE.split(" ".join((text or "").split()))) if t]


def changed_sentences(entry):
    """(new sentences that changed, old sentences that went) for one section, sentence-level.

    Only what moved is sent: a whole label is tens of thousands of characters, and the card
    was already checked against the text that did not change. Without a verified old text
    every new sentence counts as changed.
    """
    new = sentences(entry.get("new"))
    if entry.get("oldStatus") != "verified":
        return new, []
    old = sentences(entry.get("old"))
    added, removed = [], []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=old, b=new, autojunk=False).get_opcodes():
        if tag in ("replace", "insert"):
            added += new[j1:j2]
        if tag in ("replace", "delete"):
            removed += old[i1:i2]
    return added, removed


def prompt_sections(row):
    """The changed sections a claim can be judged against: the boxed warning and the numbered
    prescribing-information sections. The Medication Guide, instructions for use and the
    recent-major-changes index restate those for patients or as pointers, so they are left out."""
    return [k for k in sorted(row["texts"], key=drift._section_order)
            if k == drift.BOXED or k[0].isdigit()]


def _norm(text):
    text = html.unescape(text or "")
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return " ".join(text.split())


def parse_answer(text):
    """[(claim id, verdict, quote or None)] from the lines that match the format."""
    rows = []
    for raw in text.splitlines():
        line = raw.strip().replace("`", "").replace("**CLAIM", "CLAIM")
        match = LINE_RE.match(line)
        if not match:
            continue
        cid, verdict, quote = match.group(1), match.group(2), match.group(3)
        if quote:
            quote = _norm(quote).strip().strip('*').strip()
            if len(quote) >= 2 and quote[0] == '"' and quote[-1] == '"':
                quote = quote[1:-1].strip()
        rows.append((cid, verdict, quote or None))
    return rows


def verify(record, row, answer_rows):
    """(verdicts, problems): verified rows sorted for the reviewer, and why the answer fails."""
    expected = dict(claims(record))
    new_text = quotable_text(row)
    problems, verdicts, seen = [], [], set()
    for cid, verdict, quote in answer_rows:
        if cid not in expected:
            problems.append("unknown claim id %s" % cid)
            continue
        if cid in seen:
            problems.append("claim %s answered twice" % cid)
            continue
        seen.add(cid)
        ok = True
        if verdict == "SILENT":
            if quote:
                problems.append("claim %s is SILENT but quotes the label" % cid)
                ok = False
        elif not quote:
            problems.append("claim %s is %s without a quote" % (cid, verdict))
            ok = False
        elif "..." in quote or "…" in quote:
            problems.append("claim %s quote is stitched with an ellipsis" % cid)
            ok = False
        elif quote not in new_text:
            problems.append("claim %s quote is not verbatim in the new label text: %r" % (cid, quote[:80]))
            ok = False
        verdicts.append({"claim": cid, "text": expected[cid], "verdict": verdict,
                         "quote": quote, "verified": ok})
    for cid in expected:
        if cid not in seen:
            problems.append("claim %s has no verdict" % cid)
    verdicts.sort(key=lambda v: (ORDER[v["verdict"]], v["claim"]))
    return verdicts, problems


def checklist(record, row, verdicts, problems):
    out = ["## %s: card claims against label v%s (%s)" % (record["id"], row["toVersion"], row["toDate"]), ""]
    for v in verdicts:
        if v["verdict"] == "SILENT":
            continue
        flag = "" if v["verified"] else " **(unverified)**"
        if v["verdict"] in ("CONTRADICTED", "NARROWED"):
            out.append("- [ ] **%s** `%s`%s: %s" % (v["verdict"], v["claim"], flag, v["text"]))
        else:
            # No checkbox: a verbatim quote proves the sentence is in the label, not that it is
            # about the claim (live run: "SL" was "SUPPORTED" by a naloxone sentence).
            out.append("- supported `%s`%s: %s" % (v["claim"], flag, v["text"]))
        if v["quote"]:
            out.append("    - label: \"%s\"" % v["quote"])
    silent = sum(1 for v in verdicts if v["verdict"] == "SILENT")
    out += ["", "%d claim(s) the new text does not address." % silent]
    if problems:
        out += ["", "**This answer cannot be trusted as it stands:**"] + ["- %s" % p for p in problems]
    return "\n".join(out) + "\n"


def results_path(ledger_file, agent, to_version):
    return Path(ledger_file).parent / "oe_label_delta" / ("%s-v%s.json" % (agent, to_version))


def load_context(args):
    try:
        ledger = json.loads(Path(args.ledger).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CouldNotCheck("no label-drift ledger at %s" % args.ledger)
    except ValueError as error:
        raise CouldNotCheck("ledger unreadable: %s" % error)
    record = drift.records_by_id().get(args.id)
    if record is None:
        raise CouldNotCheck("no card %s in pharmacy.json" % args.id)
    return record, latest_drift(ledger, args.id)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("prompt", "check"):
        command = sub.add_parser(name)
        command.add_argument("id")
        if name == "check":
            command.add_argument("answer", type=Path)
            command.add_argument("--save", action="store_true")
        command.add_argument("--ledger", type=Path, default=drift.ledger_path())
    args = parser.parse_args(argv)
    try:
        record, row = load_context(args)
        if args.command == "prompt":
            sys.stdout.write(build_prompt(record, row))
            return 0
        try:
            answer = args.answer.read_text(encoding="utf-8")
        except OSError as error:
            raise CouldNotCheck("answer unreadable: %s" % error)
        parsed = parse_answer(answer)
        if not parsed:
            raise CouldNotCheck("no CLAIM lines in the answer")
        verdicts, problems = verify(record, row, parsed)
        sys.stdout.write(checklist(record, row, verdicts, problems))
        if args.save:
            target = results_path(args.ledger, record["id"], row["toVersion"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps({"agent": record["id"], "toVersion": row["toVersion"],
                                          "complete": not problems, "problems": problems,
                                          "verdicts": verdicts}, indent=1) + "\n", encoding="utf-8")
            print("saved %s" % target, file=sys.stderr)
        return 1 if problems else 0
    except CouldNotCheck as error:
        print("could not check: %s" % error, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
