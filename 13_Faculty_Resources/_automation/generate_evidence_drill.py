#!/usr/bin/env python3
"""Generate an evidence-literacy drill from claim anchors.

WHY THIS EXISTS
---------------
Three batches of the 2026-08-08 safety-level audit each surfaced the same
failure at faculty level: a citation attached to a claim it does not support.

  * Lima 2004 cited as "the strongest evidence" for propranolol in akathisia,
    when the review concludes there are insufficient data.
  * McKeith's DLB consensus report has a decoy at PMID 29438029 — a one-page
    "Author response" with a near-identical title that resolves cleanly.
  * The fluoxetine label backs the >=5 week washout but NOT the ">=2 weeks for
    most SSRIs" class statement sitting in the same sentence.

Each was caught by reading the source rather than trusting the citation. That
discrimination is a teachable skill, and the curriculum has never taught it —
the evidence work has improved the pages but never reached the question bank.

Claim anchors changed what is possible. `[^source-id]` is a machine-readable map
of which claims are load-bearing and what backs each one, so the drill can be
generated rather than written: the stem is the anchored claim, the answer is the
source it is bound to, and the explanation is that source's `identity.note` —
including the scope note recording what it does NOT support.

WHAT IT DOES NOT DO
-------------------
It does not write into question_bank.json. These are a different genre from the
clinical vignettes there, and generated items must not reach a learner without
faculty review — every item is emitted `status: "draft"` for exactly that reason.

Deterministic: same anchors and registry in, byte-identical file out. Safe to
regenerate and diff.

Usage:  python3 generate_evidence_drill.py [repo_root] [--check]
        --check exits non-zero if the committed file is stale.
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(os.path.abspath(__file__)).parent
sys.path.insert(0, str(HERE))
import validate_claim_anchors as anchors  # noqa: E402  (path set above)

OUT_REL = "13_Faculty_Resources/_automation/generated/evidence_drill.json"
# Hand-maintained by drill_review_serve.py. Generated content is disposable;
# a faculty decision about it is not, so the decisions live in their own file
# and survive every later regeneration.
REVIEW_REL = "13_Faculty_Resources/_automation/generated/evidence_drill_review.json"

USAGE_NOTICE = (
    "Generated from claim anchors. An item is a draft until a faculty decision "
    "in evidence_drill_review.json says otherwise; cut items are omitted."
)

# A claim is the sentence the anchor sits in. Markdown bullets and table cells
# are both common, so split on sentence enders and on cell boundaries.
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\s*\|\s*")
_MD_NOISE = re.compile(r"\[\^[a-z0-9][a-z0-9-]*\]|\*\*|\*|`|<[^>]+>")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")


def clean_claim(text):
    text = _LINK.sub(r"\1", text)
    text = _MD_NOISE.sub("", text)
    text = re.sub(r"^\s*[-*]\s*", "", text)
    return re.sub(r"\s+", " ", text).strip()


def claim_for(line, anchor_id):
    """The sentence containing the anchor, stripped of markdown."""
    token = "[^%s]" % anchor_id
    idx = line.find(token)
    if idx < 0:
        return clean_claim(line)
    pieces, cursor = [], 0
    for part in _SENTENCE_SPLIT.split(line):
        start = line.find(part, cursor)
        if start < 0:
            continue
        cursor = start + len(part)
        pieces.append((start, cursor, part))
    for start, end, part in pieces:
        if start <= idx < end + len(token):
            cleaned = clean_claim(part)
            if cleaned:
                return cleaned
    return clean_claim(line)


def short_citation(source):
    c = source.get("citation") or {}
    authors = c.get("authors") or []
    if authors:
        who = authors[0].get("family") or ""
        if len(authors) > 1:
            who += " et al."
    else:
        who = c.get("organization") or ""
    bits = [b for b in (who, str(c.get("year") or ""), c.get("journal") or "") if b]
    return " · ".join(bits) or c.get("title", "")[:70]


def scope_sentence(note):
    """The part of identity.note that records what the source does NOT support."""
    for sentence in re.split(r"(?<=\.)\s+", note or ""):
        low = sentence.lower()
        if "scope note" in low or "does not" in low or "do not cite" in low:
            return sentence.strip()
    return ""


def pick_distractors(correct_id, page_ids, all_ids, want=3):
    """Deterministic and plausible: prefer other sources on the same page."""
    pool = [i for i in page_ids if i != correct_id]
    rest = sorted(i for i in all_ids if i != correct_id and i not in pool)
    seed = int(hashlib.sha256(correct_id.encode()).hexdigest()[:8], 16)
    while len(pool) < want and rest:
        pool.append(rest.pop(seed % len(rest)))
        seed //= 7 or 1
        seed = seed or 1
    return pool[:want]


def load_decisions(repo_root):
    """Faculty keep/cut decisions, if any have been recorded yet.

    Absent or unreadable means "nothing reviewed" — the drill is then all
    drafts, which is the safe state. A malformed file must not silently
    promote items, so anything that does not parse is treated as empty.
    """
    path = Path(repo_root) / REVIEW_REL
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        k: v
        for k, v in data.items()
        if isinstance(v, dict) and v.get("decision") in ("keep", "cut")
    }


def build(repo_root):
    repo_root = Path(repo_root).resolve()
    anchors.REPO_ROOT = repo_root
    anchors.TOPIC_META = repo_root / "topic_meta.json"
    anchors.REGISTRY = repo_root / "evidence_registry.json"
    anchors.MANIFEST = repo_root / "13_Faculty_Resources/_automation/site_build/site_manifest.json"
    anchors.RESIDENT_SECTION = repo_root / "13_Faculty_Resources/_automation/site_build/resident_section.py"

    registry = json.loads((repo_root / "evidence_registry.json").read_text(encoding="utf-8"))
    by_id = {s["id"]: s for s in registry.get("sources", [])}
    topics = json.loads((repo_root / "topic_meta.json").read_text(encoding="utf-8"))
    sources = anchors.shipped_name_to_source()
    decisions = load_decisions(repo_root)

    items = []
    for page in sorted(topics):
        meta = topics.get(page)
        if page == "_note" or not isinstance(meta, dict):
            continue
        src_rel = sources.get(page)
        if not src_rel or not (repo_root / src_rel).exists():
            continue
        text = (repo_root / src_rel).read_text(encoding="utf-8")
        page_ids = [i for i in (meta.get("evidenceIds") or []) if i in by_id]

        seen = set()
        for line in text.splitlines():
            for aid in anchors.ANCHOR_RE.findall(line):
                if aid not in by_id or (page, aid) in seen:
                    continue
                seen.add((page, aid))
                source = by_id[aid]
                note = (source.get("identity") or {}).get("note") or ""
                correct = short_citation(source)
                options = [{"t": correct, "c": True, "sourceId": aid}]
                for did in pick_distractors(aid, page_ids, list(by_id)):
                    options.append({"t": short_citation(by_id[did]), "sourceId": did})
                options.sort(key=lambda o: o["sourceId"])
                for key, opt in zip("ABCD", options):
                    opt["key"] = key

                item_id = "ed_%s_%s" % (page.replace(".md", ""), aid)
                decision = decisions.get(item_id) or {}
                if decision.get("decision") == "cut":
                    continue

                items.append(
                    {
                        "id": item_id,
                        "status": "attested" if decision.get("decision") == "keep" else "draft",
                        "review": {
                            "reviewer": decision.get("reviewer", ""),
                            "date": decision.get("date", ""),
                            "note": decision.get("note", ""),
                        }
                        if decision.get("decision") == "keep"
                        else None,
                        "page": page,
                        "sourceId": aid,
                        "claim": claim_for(line, aid),
                        "stem": (
                            "This claim on %s is bound to one source in the evidence "
                            "registry. Which one — and what does that source not "
                            "support?" % page
                        ),
                        "options": options,
                        "why": note,
                        "pearl": scope_sentence(note)
                        or "Check what a source concludes, not what it is remembered for.",
                        "citation": {
                            "title": (source.get("citation") or {}).get("title", ""),
                            "doi": (source.get("citation") or {}).get("doi", ""),
                            "pmid": (source.get("citation") or {}).get("pmid", ""),
                            "url": (source.get("citation") or {}).get("url", ""),
                        },
                    }
                )

    items.sort(key=lambda i: i["id"])
    return {"_note": USAGE_NOTICE, "version": 1, "items": items}


def _by_page(item_ids, items):
    """'toxidromes ×3, med_monitoring ×1' — grouped, most-changed first."""
    lookup = {i["id"]: i for i in items}
    counts = {}
    for item_id in item_ids:
        page = lookup[item_id]["page"].replace(".md", "")
        counts[page] = counts.get(page, 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return ", ".join("%s ×%d" % (page, n) for page, n in ordered)


def changelog(old_items, new_items):
    """One line describing what moved, so a stale drill doesn't mean a 234-line diff.

    Four kinds of change, and they mean different things:
      added / removed   an anchor appeared or went away
      reworded          the anchored sentence on the page changed
      re-noted          the source's identity.note changed — an evidence-record
                        edit, which matters more than a wording tweak
    """
    old = {i["id"]: i for i in old_items}
    new = {i["id"]: i for i in new_items}
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    shared = sorted(set(old) & set(new))
    reworded = [i for i in shared if old[i]["claim"] != new[i]["claim"]]
    renoted = [i for i in shared if old[i]["why"] != new[i]["why"]]

    if not (added or removed or reworded or renoted):
        return "no change"

    parts = []
    if added:
        parts.append("+%d item(s) (%s)" % (len(added), _by_page(added, new_items)))
    if removed:
        parts.append("-%d item(s) (%s)" % (len(removed), _by_page(removed, old_items)))
    if reworded:
        parts.append("%d reworded (%s)" % (len(reworded), _by_page(reworded, new_items)))
    if renoted:
        parts.append("%d re-noted (%s)" % (len(renoted), _by_page(renoted, new_items)))
    return " · ".join(parts)


def _committed_items(out):
    if not out.exists():
        return None
    try:
        return json.loads(out.read_text(encoding="utf-8")).get("items", [])
    except (json.JSONDecodeError, OSError):
        return None


def main():
    argv = [a for a in sys.argv[1:] if a != "--check"]
    check = "--check" in sys.argv
    root = Path(argv[0]).resolve() if argv else HERE.parent.parent
    payload = build(root)
    text = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
    out = root / OUT_REL
    previous = _committed_items(out)

    if check:
        if previous is None:
            print("evidence drill STALE — %s is missing or unreadable; run the generator." % OUT_REL)
            return 1
        if out.read_text(encoding="utf-8") != text:
            print(
                "evidence drill STALE — %s does not match the current anchors.\n"
                "  Changed: %s\n"
                "  Run: python3 13_Faculty_Resources/_automation/generate_evidence_drill.py"
                % (OUT_REL, changelog(previous, payload["items"]))
            )
            return 1
        print("evidence drill OK — %d draft item(s), regenerates identically." % len(payload["items"]))
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    delta = changelog(previous, payload["items"]) if previous is not None else "initial generation"
    print(
        "evidence drill written — %d draft item(s) → %s\n  %s"
        % (len(payload["items"]), OUT_REL, delta)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
