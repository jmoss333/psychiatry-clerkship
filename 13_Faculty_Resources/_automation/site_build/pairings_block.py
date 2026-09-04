#!/usr/bin/env python3
"""Render the week-page pairing block from pairings.json.

The join this exists to make: the library deploys 50 OpenEvidence landmark briefs to
/audio_oe/ on BOTH sites (build_deploy.py treats the directory as a hard deploy input,
and the files serve 200 audio/mp4 in production) — and, as of 2026-09-04, NOT ONE
content page linked to any of them. Only tools/review.html referenced the directory.
07_Evidence_and_Reading/Landmark_Trials/landmark_trials_page.md publishes a DIFFERENT
50-file set under /audio/ (the LM-* recordings; see LM_crosswalk.csv for the LM<->OE
mapping), so the audio a learner can reach and the audio this pairing surfaces are not
the same shipped asset. A pairing is the cheapest way to make the OE briefs reachable
from where the curriculum actually is.

P1 scope: internal items only — page, tool, audio_oe. All three resolve against shipped
registries, so validate_registry_schemas.py can hard-fail a dangling reference at build
time rather than shipping a dead link to a learner. External kinds (book/audiobook/
podcast) are schema-supported but carry a verifiedOn/verifiedBy stamp and are P2, gated
on the link check in the gap scan's §6 step 1.

Collapsible by faculty decision (Dr. Moss, 2026-09-04): the block ships as a <details>
element collapsed by default, so a week page a learner skims is not made longer by it,
while the <summary> still names the week's topic. <details>/<summary> is natively
keyboard-operable and exposed to screen readers, so the collapse costs no accessibility.
Week pages carry fewer than four <h2>s, so spa_index.html's makeCollapsible() never fires
on them — this block controls its own disclosure and does not interact with that pass.

Determinism: nothing here reads the clock. Same registry in, byte-identical markdown out,
which is what keeps tests/smoke/ visual baselines stable. crisis_block.py documents the
same rule for the same reason.
"""

import csv
import json
import os

MARKER = "<!-- pairing-block -->"

HEADING = "This week's pairing"
FOOTNOTE = "Suggested, not required. Every item already ships in this library."

# Roles render in this order regardless of the order they appear in the registry, so a
# reordered registry cannot change the rendered bytes.
ROLE_ORDER = ("read", "listen", "practice", "deeper")
ROLE_LABEL = {
    "read": "Read",
    "listen": "Listen",
    "practice": "Practice",
    "deeper": "Go deeper",
}

AUDIO_DIR = "12_Media/audio_oe"
MANIFEST = "MANIFEST.csv"
SITE_MANIFEST = "13_Faculty_Resources/_automation/site_build/site_manifest.json"


def load(lib_root):
    """Load and lightly sanity-check the pairings registry."""
    path = os.path.join(lib_root, "pairings.json")
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not data.get("pairings"):
        raise SystemExit("pairings.json: no pairings defined")
    return data


def load_audio_index(lib_root):
    """Map audio_oe brief number -> row from MANIFEST.csv.

    Keyed on the string form of `number` with leading zeros stripped, so a registry may
    write "38" or "038" and mean the same brief.
    """
    path = os.path.join(lib_root, AUDIO_DIR, MANIFEST)
    index = {}
    with open(path, encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            number = (row.get("number") or "").strip()
            if number:
                index[number.lstrip("0") or "0"] = row
    if not index:
        raise SystemExit("%s/%s: no briefs found" % (AUDIO_DIR, MANIFEST))
    return index


def load_site_titles(lib_root):
    """Map md slug and tool filename -> the human title site_manifest.json ships.

    Reading the label from the manifest rather than prettifying the slug means the
    pairing block and the nav can never disagree about what a page is called.
    """
    path = os.path.join(lib_root, SITE_MANIFEST)
    with open(path, encoding="utf-8") as handle:
        manifest = json.load(handle)
    titles = {}
    for entry in manifest.get("md", []):
        if len(entry) >= 3:
            titles[("page", entry[1])] = entry[2]
    for entry in manifest.get("tools", []):
        if len(entry) >= 3:
            titles[("tool", entry[1])] = entry[2]
    return titles


def resolve(data, lib_root):
    """Attach audio_oe titles/durations/filenames and page/tool display titles.

    Returns a NEW dict; the caller's data is not mutated, so repeated calls are safe.
    """
    audio = load_audio_index(lib_root)
    titles = load_site_titles(lib_root)
    pairings = []
    for pairing in data["pairings"]:
        items = []
        for item in pairing["items"]:
            item = dict(item)
            if item.get("kind") in ("page", "tool") and not item.get("title"):
                key = (item["kind"], item.get("ref", ""))
                if key not in titles:
                    raise SystemExit(
                        "pairings.json: %s references %s %r, which is not in %s"
                        % (pairing["id"], item["kind"], item.get("ref"), SITE_MANIFEST)
                    )
                item["title"] = titles[key]
            if item.get("kind") == "audio_oe":
                key = str(item.get("ref", "")).strip().lstrip("0") or "0"
                row = audio.get(key)
                if row is None:
                    raise SystemExit(
                        "pairings.json: %s references audio_oe brief %r, which is not in "
                        "%s/%s" % (pairing["id"], item.get("ref"), AUDIO_DIR, MANIFEST)
                    )
                item["_title"] = row.get("audio_card_title") or row.get("source_title") or ""
                item["_source_title"] = row.get("source_title") or ""
                item["_duration"] = (row.get("duration") or "").strip()
                item["_filename"] = row.get("filename") or ""
            items.append(item)
        pairing = dict(pairing)
        pairing["items"] = items
        pairings.append(pairing)
    out = dict(data)
    out["pairings"] = pairings
    return out


def _esc(text):
    """Escape for HTML text nodes."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _attr(text):
    """Escape for a double-quoted HTML attribute value."""
    return _esc(text).replace('"', "&quot;")


def _ordered_items(pairing):
    """Items in canonical role order; unknown roles keep registry order at the end."""
    known = [
        item
        for role in ROLE_ORDER
        for item in pairing["items"]
        if item.get("role") == role
    ]
    rest = [item for item in pairing["items"] if item.get("role") not in ROLE_ORDER]
    return known + rest


def _render_item(item):
    """One pairing item as an <li>. Link conventions match the rest of the library:
    pages use ?page=<slug>, tools use tools/<file> in a new tab, and audio plays inline
    rather than navigating — the same shape landmark_trials_page.md uses for /audio/."""
    kind = item.get("kind")
    label = ROLE_LABEL.get(item.get("role"), item.get("role", ""))

    if kind == "page":
        return '<li><strong>%s</strong> — <a href="?page=%s">%s</a></li>' % (
            _esc(label),
            _attr(item["ref"]),
            _esc(item.get("title") or item["ref"]),
        )

    if kind == "tool":
        return (
            '<li><strong>%s</strong> — <a href="tools/%s" target="_blank" '
            'rel="noopener">%s</a></li>'
            % (
                _esc(label),
                _attr(item["ref"]),
                _esc(item.get("title") or item["ref"]),
            )
        )

    if kind == "audio_oe":
        duration = (" (%s)" % item["_duration"]) if item.get("_duration") else ""
        return (
            '<li><strong>%s%s</strong> — %s <span class="pairing-src">— landmark brief: '
            "%s</span><br>"
            '<audio controls preload="none" src="audio_oe/%s" '
            'aria-label="Landmark brief: %s"></audio></li>'
            % (
                _esc(label),
                _esc(duration),
                _esc(item.get("_title", "")),
                _esc(item.get("_source_title", "")),
                _attr(item.get("_filename", "")),
                _attr(item.get("_source_title", "")),
            )
        )

    # External kinds (P2). Rendered with their verification stamp visible, never bare.
    bits = []
    if kind in ("book", "audiobook"):
        bits.append("<em>%s</em>" % _esc(item.get("title", "")))
        if item.get("author"):
            bits.append(_esc(item["author"]))
    else:  # podcast
        bits.append(_esc(item.get("show", "")))
        if item.get("episode"):
            bits.append("<em>%s</em>" % _esc(item["episode"]))
    text = " — ".join(b for b in bits if b)
    if item.get("url"):
        text = '<a href="%s" target="_blank" rel="noopener">%s</a>' % (
            _attr(item["url"]),
            text,
        )
    stamp = ""
    if item.get("verifiedBy") == "search-attested":
        stamp = ' <span class="pairing-unverified">(link not yet opened)</span>'
    note = (" %s" % _esc(item["note"])) if item.get("note") else ""
    return "<li><strong>%s</strong> — %s%s%s</li>" % (_esc(label), text, stamp, note)


# DECISION: pairings-block-collapsible  (decisions.json)
def render_markdown(pairing, render_mode="collapsible"):
    """Render one pairing as a self-contained HTML block for a content page.

    render_mode "collapsible" wraps the body in <details> collapsed by default (the
    faculty default); "open" emits the same body in a plain <section>.
    """
    body = [
        '<p class="pairing-blurb"><em>%s</em></p>' % _esc(pairing["blurb"])
        if pairing.get("blurb")
        else "",
        '<ul class="pairing-items">',
    ]
    body.extend("  " + _render_item(item) for item in _ordered_items(pairing))
    body.append("</ul>")
    body.append('<p class="pairing-note"><small>%s</small></p>' % _esc(FOOTNOTE))
    body = [line for line in body if line]

    if render_mode == "open":
        return "\n".join(
            ['<section class="pairing-block">', "<h3>%s — %s</h3>" % (_esc(HEADING), _esc(pairing["topic"]))]
            + body
            + ["</section>"]
        )
    return "\n".join(
        [
            '<details class="pairing-block">',
            "<summary><strong>%s</strong> — %s</summary>"
            % (_esc(HEADING), _esc(pairing["topic"])),
        ]
        + body
        + ["</details>"]
    )


WEEK_SLUGS = {"week%d.md" % n: n for n in range(1, 7)}


def pairing_for(data, week, audience):
    """The single pairing that renders for (week, audience).

    Deterministic when several match: registry order wins, and the semantic gate in
    validate_registry_schemas.py already requires at least one per week/audience.
    """
    for pairing in data["pairings"]:
        if week in pairing.get("weeks", []) and audience in pairing.get("audiences", []):
            return pairing
    return None


def inject_markdown(text, data, dst, audience):
    """Replace the marker with the rendered block. Returns (text, injected).

    Leaves text untouched when the marker is absent, so non-week pages are never
    modified and the resident second pass is a no-op on pages the MS3 pass already
    consumed — the same marker-consumption contract crisis_block.py relies on.
    """
    if MARKER not in text:
        return text, False
    week = WEEK_SLUGS.get(os.path.basename(dst))
    if week is None:
        raise SystemExit(
            "pairing marker found on %s, which is not one of the six week pages" % dst
        )
    pairing = pairing_for(data, week, audience)
    if pairing is None:
        raise SystemExit(
            "pairings.json: no pairing for week %d / audience %r (page %s)"
            % (week, audience, dst)
        )
    rendered = render_markdown(pairing, data.get("renderMode", "collapsible"))
    return text.replace(MARKER, rendered), True


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    lib = os.path.abspath(os.path.join(here, "..", "..", ".."))
    _data = resolve(load(lib), lib)
    for _n in range(1, 7):
        print("---- week%d.md ----" % _n)
        print(render_markdown(pairing_for(_data, _n, "ms3"), _data.get("renderMode")))
