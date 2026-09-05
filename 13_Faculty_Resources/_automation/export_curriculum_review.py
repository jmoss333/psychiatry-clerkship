#!/usr/bin/env python3
"""export_curriculum_review.py — assemble a complete, human-readable transcript of
everything a built site ships, one document set per audience, for external clinical review.

Reads the BUILT sites (_build/ms3, _build/res) rather than the NN_Category/ source tree, so
what a reviewer reads is exactly what a learner sees: nav order, audience-scoped page set,
resident overrides, build-injected crisis blocks and all. Source paths are back-mapped from
site_build/shipped_pages.json -- the one derived listing of what ships (ADR-002) -- plus the
resident overrides in site_extras.py, so every finding is actionable in git.

Usage
-----
  # build first (both sites; res derives from ms3)
  OUT_DIR=_build/ms3 python3 .../site_build/build_deploy.py
  MS3_DIR=_build/ms3 OUT_DIR=_build/res python3 .../site_build/resident_section.py

  python3 13_Faculty_Resources/_automation/export_curriculum_review.py
  python3 13_Faculty_Resources/_automation/export_curriculum_review.py --audience ms3

Outputs docs/curriculum-review/{ms3,resident}/ — a review brief, a navigation map, the
nav-ordered curriculum volumes (page prose + its topic_meta assertions + tool clinical
logic), the item-bank appendices, and one concatenated *_CURRICULUM_COMPLETE.md.

Report-only. Writes nothing outside --out and never touches the build or the source tree.
"""
from __future__ import annotations

import argparse
import html as _html
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIB = HERE.parent.parent                      # repo root
SITE_BUILD = HERE / "site_build"

# "What ships" comes from the one derived listing (ADR-002), not from site_manifest.json
# plus a private copy of the resident and Case-of-the-Week producers.
if str(SITE_BUILD) not in sys.path:
    sys.path.insert(0, str(SITE_BUILD))
import site_extras  # noqa: E402  (path set above)
from shipped_pages import load_shipped_pages  # noqa: E402  (path set above)

AUDIENCES = {
    "ms3": {
        "label": "MS3 — UNE medical students",
        "site": "une-ms3-psychiatry",
        "build": "ms3",
        "outdir": "ms3",
        "prefix": "MS3",
        "audience_note": (
            "Third-year medical students on a six-week adult inpatient psychiatry clerkship. "
            "Most have no prior psychiatry exposure. The terminal assessments are the NBME "
            "psychiatry shelf / COMAT and clerkship OSCE stations."
        ),
    },
    "resident": {
        "label": "Residents — MMC/Sanford psychiatry residents",
        "site": "mmc-psychiatry-residents-sanford",
        "build": "res",
        "outdir": "resident",
        "prefix": "RESIDENT",
        "audience_note": (
            "Psychiatry residents on an adult inpatient rotation. The resident site is derived "
            "from the MS3 build, then overridden: resident welcome/rotation pages, advanced "
            "psychopharmacology, systems & med-legal, supervision & teaching, the 200-paper "
            "canon, a C-L numbers reference, resident Case-of-the-Week variants, and three "
            "resident-only rehearsal tools (rp-*). Expectations are supervision-level: "
            "independent decisions, teaching others, and med-legal accountability."
        ),
    },
}

# One narrative volume ≈ this many characters, so each volume is reviewable in a single pass.
VOLUME_CHAR_TARGET = 115_000

# A hidden faculty utility (rotation-curator.html) embeds the whole front-door catalog as
# string literals — thousands of them, all duplicating metadata transcribed elsewhere in
# this document set. Cap per-tool extraction and say so rather than drowning a volume.
TOOL_STRING_CAP = 400


# ---------------------------------------------------------------- helpers

def _load(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def _git_sha() -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(LIB), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "unknown"


def _words(text: str) -> int:
    return len(text.split())


def _slug_source_map(aud_key: str = "ms3") -> dict[str, str]:
    """Built filename -> repo-relative source path, for one audience's build.

    Both halves come from site_build/shipped_pages.json: the set of shipped slugs and
    each slug's source path. Until 2026-09 this function re-assembled that set here --
    site_manifest.json, a hand-typed copy of resident_section.py's overrides, and a
    private copy of the Case-of-the-Week slug format string -- which is the reader
    pattern ADR-002 exists to end.

    Slugs are looked up bare, so shared slugs (welcome.md, cotw_index.md) must map to
    the file the *requested* audience actually builds from. The old audience-blind
    setdefault let the MS3 manifest win those collisions, so two resident surfaces
    carried MS3 Source lines (found by the 2026-09-01 review). shipped_pages.json holds
    ONE source per slug -- a resident override reuses a slug the manifest already ships,
    so it is not a separate shipped page and cannot carry its own source there -- and the
    overrides are therefore re-applied below from site_extras.py, the very lists
    resident_section.py copies from.
    """
    out: dict[str, str] = {
        page["slug"]: page["source"] for page in load_shipped_pages(LIB)["pages"]
    }
    if aud_key == "resident":
        # resident-only overrides WIN here (site_extras.py holds the lists
        # resident_section.py builds RES_EXTRA and PROTO_TOOLS from)
        for src, dst, _title in (
            site_extras.RESIDENT_EXTRA_PAGES + site_extras.RESIDENT_PROTO_TOOLS
        ):
            out[dst] = src
    # STALE, and preserved on purpose. orientation-video.html ships from
    # _prototypes/orientation-video/ (site_extras.MS3_EXTRA_TOOLS), which is what
    # shipped_pages.json records; this placeholder predates that and names the wrong
    # directory. ADR-002 Phase 2 proves each migration by byte-identical output, so
    # correcting a Source line is a separate change, not a side effect of this one.
    out["orientation-video.html"] = "_prototypes/video-library/ (build-generated shell)"
    return out


# ---------------------------------------------------------------- tool text extraction

_CSSISH = re.compile(r"(px|rem|em|vh|vw|%)\s*[;}]|:\s*var\(|@media|font-family|@keyframes|translate|cubic-bezier")


def tool_text(path: Path) -> tuple[list[str], list[str]]:
    """(visible HTML text lines, clinical strings recovered from inline JS).

    The clinical tools are single-file HTML that render everything from JS data literals,
    so stripping tags alone recovers almost nothing. We pull quoted string literals out of
    the script blocks and keep the ones that read as prose.
    """
    raw = path.read_text(encoding="utf-8", errors="replace")

    body = re.sub(r"<script[^>]*>.*?</script>", "", raw, flags=re.S)
    body = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.S)
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    visible = []
    for chunk in re.split(r"<(?:/p|/h[1-6]|/li|br\s*/?|/div|/section)>", body, flags=re.I):
        t = _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", chunk))).strip()
        if len(t) >= 3:
            visible.append(t)

    js: list[str] = []
    seen: set[str] = set()
    for script in re.findall(r"<script[^>]*>(.*?)</script>", raw, flags=re.S):
        for m in re.finditer(r'"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`', script):
            v = m.group(1) or m.group(2) or m.group(3) or ""
            v = v.replace("\\n", "\n").replace('\\"', '"').replace("\\'", "'").replace("\\`", "`")
            t = _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", v))).strip()
            if len(t) < 25 or " " not in t:
                continue
            if re.match(r"^[.#][A-Za-z0-9_-]", t) or _CSSISH.search(t):
                continue
            if t.startswith(("http://", "https://", "data:", "?page=", "?tool=")):
                continue
            if t in seen:
                continue
            seen.add(t)
            js.append(t)
    return visible, js


# ---------------------------------------------------------------- renderers

def md_escape_fence(text: str) -> str:
    """Keep page markdown readable inside the running document without breaking fences."""
    return text.replace("\r\n", "\n").rstrip() + "\n"


def render_governance(gov: dict | None) -> str:
    if not gov:
        return "_no governance record_"
    bits = [f"status=`{gov.get('status','?')}`"]
    if gov.get("riskKind"):
        bits.append(f"riskKind=`{gov['riskKind']}`")
    if gov.get("riskLevel"):
        bits.append(f"riskLevel=`{gov['riskLevel']}`")
    for k in ("reviewedBy", "reviewedOn", "note"):
        if gov.get(k):
            bits.append(f"{k}=`{gov[k]}`")
    return " · ".join(bits)


def render_quiz(q, label="Embedded check-for-understanding") -> list[str]:
    if not q:
        return []
    quizzes = q if isinstance(q, list) else [q]
    out = [f"**{label}**", ""]
    for i, item in enumerate(quizzes, 1):
        stem = item.get("q") or item.get("stem") or ""
        out.append(f"{i}. *Stem:* {stem}")
        for o in item.get("o", item.get("options", [])):
            if isinstance(o, str):
                out.append(f"   - {o}")
                continue
            mark = " **← keyed correct**" if o.get("c") else ""
            out.append(f"   - {o.get('t','')}{mark}")
            if o.get("fb"):
                out.append(f"     - *option feedback:* {o['fb']}")
        if item.get("why"):
            out.append(f"   - *Rationale:* {item['why']}")
        if item.get("pearl"):
            out.append(f"   - *Pearl:* {item['pearl']}")
        out.append("")
    return out


def render_choice_list(choices, indent="") -> list[str]:
    """Branching options shared by communication cases and reasoning-case steps."""
    out = []
    for ch in choices or []:
        if isinstance(ch, str):
            out.append(f"{indent}- {ch}")
            continue
        cid = ch.get("id", "")
        q = ch.get("quality", ch.get("score", ""))
        head = ch.get("text") or ch.get("t") or ""
        tag = f"  *(rated: **{q}**)*" if q != "" else ""
        out.append(f"{indent}- **({cid})** {head}{tag}" if cid else f"{indent}- {head}{tag}")
        for k in ("feedback", "why", "coach", "fb", "teaching", "rationale"):
            if ch.get(k):
                out.append(f"{indent}  - *{k}:* {ch[k]}")
        for k, v in ch.items():
            if k in ("id", "text", "t", "quality", "score", "feedback", "why",
                     "coach", "fb", "teaching", "rationale"):
                continue
            out.append(f"{indent}  - *{k}:* {json.dumps(v, ensure_ascii=False)}")
    return out


def render_labelled(items, bullet="- ") -> list[str]:
    """A list that may hold plain strings or {label,text} / {id,label} objects."""
    out = []
    for it in items or []:
        if isinstance(it, str):
            out.append(f"{bullet}{it}")
        elif isinstance(it, dict):
            lab = it.get("label") or it.get("title") or it.get("id") or ""
            txt = it.get("text") or it.get("prompt") or it.get("detail") or ""
            out.append(f"{bullet}**{lab}** — {txt}" if lab and txt
                       else f"{bullet}{lab or txt or json.dumps(it, ensure_ascii=False)}")
        else:
            out.append(f"{bullet}{json.dumps(it, ensure_ascii=False)}")
    return out


def render_stage_map(d: dict, heading: str) -> list[str]:
    """A {stage: [lines]} map — the shape family-systems scenarios and drills use."""
    out = [f"**{heading}**", ""]
    for k, v in d.items():
        out.append(f"- **{k}**")
        if isinstance(v, list):
            out += ["  - " + (x if isinstance(x, str) else json.dumps(x, ensure_ascii=False))
                    for x in v]
        elif isinstance(v, dict):
            out += [f"  - *{kk}:* " + (vv if isinstance(vv, str)
                                       else json.dumps(vv, ensure_ascii=False))
                    for kk, vv in v.items()]
        else:
            out.append(f"  - {v}")
    out.append("")
    return out


def render_topic_meta(slug: str, meta: dict) -> list[str]:
    """Render the structured clinical assertions the SPA overlays on a page."""
    if not meta:
        return []
    L = ["<!-- topic_meta overlay -->", "#### Structured metadata (`topic_meta.json` → this page)", ""]

    flags = []
    if meta.get("hy"):
        flags.append("flagged **high-yield**")
    if meta.get("read"):
        flags.append(f"est. read {meta['read']} min")
    if meta.get("safetyLevel"):
        flags.append(f"safetyLevel=`{meta['safetyLevel']}`")
    if meta.get("cotwLevel"):
        flags.append(f"cotwLevel=`{meta['cotwLevel']}` ({meta.get('cotwDate','')})")
    if flags:
        L += ["> " + " · ".join(flags), ""]

    if meta.get("tldr"):
        L += ["**TL;DR (shown above the page text):**", "", f"> {meta['tldr']}", ""]

    if meta.get("points"):
        L += ["**Key points (bulleted card):**", ""]
        L += [f"- {p}" for p in meta["points"]] + [""]

    if meta.get("cant"):
        cant = meta["cant"]
        L += ["**Can't-miss / red-flag line:**", ""]
        L += ([f"- {c}" for c in cant] if isinstance(cant, list) else [f"> {cant}"]) + [""]

    if meta.get("ruleOut"):
        L += ["**Rule-out list (differential the page forces):**", ""]
        L += [f"- {r}" for r in meta["ruleOut"]] + [""]

    if meta.get("firstMove"):
        L += ["**First move (the action the page tells the learner to take):**", "",
              f"> {meta['firstMove']}", ""]

    cw = meta.get("clinicalWorkflow")
    if cw:
        L += ["**Clinical-workflow narration (per-stage coaching text):**", ""]
        for k, v in cw.items():
            if isinstance(v, str):
                L.append(f"- **{k}** — {v}")
            elif isinstance(v, list):
                labels = [x.get("label", json.dumps(x, ensure_ascii=False))
                          if isinstance(x, dict) else str(x) for x in v]
                L.append(f"- **{k}** — " + "; ".join(labels))
            else:
                L.append(f"- **{k}** — " + json.dumps(v, ensure_ascii=False))
        L.append("")

    if meta.get("quiz"):
        L += render_quiz(meta["quiz"])

    if meta.get("familyOverlay"):
        L += [f"**Family overlay:** `{meta['familyOverlay']}`", ""]

    xref = []
    for k, lbl in (("relatedTools", "Related tools"), ("communicationCases", "Communication cases"),
                   ("evidenceIds", "Evidence sources"), ("workflowStages", "Workflow stages"),
                   ("workflowModes", "Workflow modes"), ("shelfBlueprint", "Shelf blueprint tags"),
                   ("epa", "EPA crosswalk")):
        if meta.get(k):
            xref.append(f"- **{lbl}:** " + ", ".join(f"`{x}`" for x in meta[k]))
    if meta.get("cta"):
        labels = [c.get("label", "") for c in meta["cta"] if isinstance(c, dict)]
        if labels:
            xref.append("- **Call-to-action buttons:** " + "; ".join(labels))
    fr = meta.get("facultyReview")
    if fr:
        xref.append("- **Faculty review:** " + (json.dumps(fr, ensure_ascii=False)
                                                if not isinstance(fr, str) else fr))
    if xref:
        L += ["**Cross-references and tagging:**", ""] + xref + [""]
    return L


# ---------------------------------------------------------------- document assembly

class Doc:
    def __init__(self, name: str, title: str):
        self.name, self.title = name, title
        self.lines: list[str] = []

    def add(self, *lines: str):
        self.lines.extend(lines)

    @property
    def text(self) -> str:
        return "\n".join(self.lines).rstrip() + "\n"

    @property
    def chars(self) -> int:
        return sum(len(x) + 1 for x in self.lines)


def build_audience(aud_key: str, out_root: Path, build_root: Path) -> dict:
    cfg = AUDIENCES[aud_key]
    B = build_root / cfg["build"]
    if not B.is_dir():
        raise SystemExit(f"missing build dir {B} — run build_and_check.sh {cfg['build']} first")

    outdir = out_root / cfg["outdir"]
    outdir.mkdir(parents=True, exist_ok=True)

    nav = _load(B / "nav.json")
    topic_meta = _load(B / "topic_meta.json", {})
    tool_registry = {t["file"]: t for t in _load(LIB / "tool_registry.json", {"tools": []})["tools"]}
    srcmap = _slug_source_map(aud_key)
    today = date.today().isoformat()
    sha = _git_sha()

    docs: list[Doc] = []
    stats = {"md": 0, "tools": 0, "words": 0, "sections": len(nav), "hidden": 0}

    # ---------------- navigation map -------------------------------------
    navdoc = Doc("01_NAVIGATION_MAP.md", "Navigation map — every surface this site ships")
    navdoc.add(f"# {cfg['prefix']} · Navigation map", "",
               f"Every item in the shipped sidebar, in site order. `hidden` items are reachable by "
               f"deep link but not listed in the sidebar. Generated {today} @ `{sha}`.", "")
    for sec in nav:
        navdoc.add(f"## {sec['section']}" + ("  *(pinned)*" if sec.get("pinned") else ""), "")
        navdoc.add("| # | Title | Slug | Type | Sidebar | Governance | Source path | Words |",
                   "|---|---|---|---|---|---|---|---|")
        for i, it in enumerate(nav_items(sec), 1):
            f = it["f"]
            kind = it.get("k", "md")
            p = (B / ("content" if kind == "md" else "tools")) / f
            wc = _words(p.read_text(encoding="utf-8", errors="replace")) if p.exists() and kind == "md" else ""
            src = srcmap.get(f, "—")
            navdoc.add("| %d | %s | `%s` | %s | %s | %s | `%s` | %s |" % (
                i, it["t"].replace("|", "\\|"), f, kind,
                "hidden" if it.get("hidden") else "listed",
                render_governance(it.get("governance")).replace("|", "\\|"),
                src, wc))
        navdoc.add("")
    docs.append(navdoc)

    # ---------------- curriculum volumes ---------------------------------
    # Render every nav item into its own block first, then pack blocks into volumes. Packing
    # after rendering keeps volumes evenly sized even when one surface (an AI-patient content
    # pack, say) is an order of magnitude larger than its neighbours.
    blocks: list[tuple[str, list[str]]] = []   # (section label for a continuation header, lines)

    for sec in nav:
        blocks.append((sec["section"], [
            "---", "",
            f"# SECTION: {sec['section']}" + ("  *(pinned in sidebar)*" if sec.get("pinned") else ""),
            "",
        ]))

        for it in nav_items(sec):
            f, kind, title = it["f"], it.get("k", "md"), it["t"]
            src = srcmap.get(f, "—")
            if it.get("hidden"):
                stats["hidden"] += 1

            L: list[str] = [
                "---", "", f"## {title}", "",
                f"- **Slug:** `{f}` · **Type:** {kind} · "
                f"**Sidebar:** {'hidden (deep link only)' if it.get('hidden') else 'listed'}",
                f"- **Source:** `{src}`",
                f"- **Governance:** {render_governance(it.get('governance'))}",
            ]

            if kind == "md":
                p_page = B / "content" / f
                if not p_page.exists():
                    L += ["", "> **MISSING** — nav references a page that is not in the build.", ""]
                    blocks.append((sec["section"], L))
                    continue
                text = p_page.read_text(encoding="utf-8", errors="replace")
                stats["md"] += 1
                stats["words"] += _words(text)
                L += [f"- **Length:** {_words(text):,} words", ""]
                L += render_topic_meta(f, topic_meta.get(f))
                L += ["#### Page text (as shipped)", "", md_escape_fence(text), ""]
            else:
                p_tool = B / "tools" / f
                if not p_tool.exists():
                    L += ["", "> **MISSING** — nav references a tool that is not in the build.", ""]
                    blocks.append((sec["section"], L))
                    continue
                stats["tools"] += 1
                reg = tool_registry.get(f, {})
                if reg:
                    L.append(f"- **Category:** {reg.get('category','—')} · "
                             f"**Risk level:** `{reg.get('riskLevel','—')}` · "
                             f"**Disclaimer:** `{reg.get('disclaimerType','—')}`")
                    if reg.get("evidenceIds"):
                        L.append("- **Evidence sources:** "
                                 + ", ".join(f"`{e}`" for e in reg["evidenceIds"]))
                    if reg.get("relatedPages"):
                        L.append("- **Related pages:** "
                                 + ", ".join(f"`{e}`" for e in reg["relatedPages"]))
                    if reg.get("storageKeys"):
                        L.append("- **Storage keys:** "
                                 + ", ".join(f"`{e}`" for e in reg["storageKeys"]))
                L.append("")
                L += render_topic_meta(f, topic_meta.get(f))
                if f.lower().endswith((".mp4", ".vtt", ".jpg", ".png")):
                    L += ["_Binary media asset — not transcribed here._", ""]
                    blocks.append((sec["section"], L))
                    continue
                visible, js = tool_text(p_tool)
                L += ["#### Tool — clinical content", "",
                      "_These tools are single-file HTML that render from inline JS data, so the "
                      "clinical text below is recovered from the tool's own string literals. "
                      "Ordering follows the file, not the runtime flow._", ""]
                if visible:
                    L += ["**Static shell text:**", ""]
                    L += [f"- {v}" for v in visible[:80]]
                    L.append("")
                if js:
                    shown, omitted = js[:TOOL_STRING_CAP], max(0, len(js) - TOOL_STRING_CAP)
                    L.append(f"**Authored clinical strings ({len(js)}"
                             + (f", first {TOOL_STRING_CAP} shown" if omitted else "") + "):**")
                    L.append("")
                    L.extend(f"- {t}" for t in shown)
                    if omitted:
                        L += ["", f"_{omitted} further strings omitted — this surface embeds the "
                              "build's front-door catalog (item summaries, key points, search "
                              "synonyms), which is transcribed in full elsewhere in this document "
                              "set._"]
                    L.append("")
                pack = p_tool.with_suffix(".pack.json")
                if pack.exists():
                    L += [f"**Content pack (`{pack.name}`) — the tool's authored clinical script:**",
                          "", "```json",
                          json.dumps(_load(pack), ensure_ascii=False, indent=1), "```", ""]

            blocks.append((sec["section"], L))

    def new_vol(n: int) -> Doc:
        d = Doc(f"02_CURRICULUM_V{n:02d}.md", f"Curriculum volume {n}")
        d.add(f"# {cfg['prefix']} · Curriculum content — volume {n}", "",
              "Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay "
              "(the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and "
              "workflow narration the SPA renders around the prose) followed by the page text "
              "exactly as shipped. Tools carry their registry metadata and their authored "
              "clinical strings.", "")
        return d

    vols: list[Doc] = []
    vol_n = 1
    cur = new_vol(vol_n)
    vols.append(cur)
    cur_section = None
    for sec_label, L in blocks:
        size = sum(len(x) + 1 for x in L)
        if cur.chars > 0 and cur.chars + size > VOLUME_CHAR_TARGET and cur.chars > VOLUME_CHAR_TARGET // 3:
            vol_n += 1
            cur = new_vol(vol_n)
            vols.append(cur)
            cur_section = None
        if cur_section != sec_label and not (L and L[0] == "---" and any(
                x.startswith("# SECTION: ") for x in L[:4])):
            cur.add(f"# SECTION (cont.): {sec_label}", "")
        cur_section = sec_label
        cur.add(*L)
    docs.extend(vols)


    # ---------------- A1 question bank -----------------------------------
    qb = _load(B / "question_bank.json", {"items": []})
    qdoc = Doc("A1_QUESTION_BANK.md", "Question bank")
    qdoc.add(f"# {cfg['prefix']} · Appendix A1 — Practice question bank", "",
             f"`question_bank.json` — {len(qb['items'])} items, shipped to the Practice Questions "
             f"tool and Shelf Mode. Keyed answers, rationales and pearls are shown; these are the "
             f"assertions a learner is graded against.", "")
    by_cat: dict[str, list] = {}
    for it in qb["items"]:
        by_cat.setdefault(it.get("category", "uncategorised"), []).append(it)
    for cat in sorted(by_cat):
        items = by_cat[cat]
        qdoc.add(f"## Category: {cat}  ({len(items)} items)", "")
        for it in items:
            tags = [f"id=`{it['id']}`", f"status=`{it.get('status','?')}`",
                    f"type=`{it.get('type','?')}`", f"difficulty=`{it.get('difficulty','?')}`"]
            if it.get("competency"):
                tags.append(f"competency=`{it['competency']}`")
            if it.get("hy"):
                tags.append("**high-yield**")
            qdoc.add(f"### {it['id']}", "", "- " + " · ".join(tags))
            if it.get("pages"):
                qdoc.add("- Linked pages: " + ", ".join(f"`{p}`" for p in it["pages"]))
            if it.get("evidence"):
                # question_bank.json stores evidence as a single string; joining a str
                # iterates characters (the A1 one-char-per-backtick garbage, 2026-09-01)
                _ev = it["evidence"]
                qdoc.add("- Evidence: " + ", ".join(f"`{e}`" for e in (_ev if isinstance(_ev, list) else [_ev])))
            qdoc.add("", f"**Stem.** {it.get('stem','')}", "")
            for o in it.get("options", []):
                if isinstance(o, str):
                    qdoc.add(f"- {o}")
                    continue
                qdoc.add(f"- {o.get('t','')}" + (" **← keyed correct**" if o.get("c") else ""))
                if o.get("fb"):
                    qdoc.add(f"  - *feedback:* {o['fb']}")
            qdoc.add("")
            if it.get("why"):
                qdoc.add(f"**Rationale.** {it['why']}", "")
            if it.get("pearl"):
                qdoc.add(f"**Pearl.** {it['pearl']}", "")
            if it.get("tier2"):
                qdoc.add("**Tier-2 / stretch.** " + json.dumps(it["tier2"], ensure_ascii=False), "")
    pre = _load(B / "pretest_pool.json", {"items": []})
    if pre.get("items"):
        qdoc.add(f"## Pre-test pool ({len(pre['items'])} items — the diagnostic learners see first)", "")
        for it in pre["items"]:
            qdoc.add(f"### {it['id']}  · category `{it.get('cat','?')}`", "",
                     f"**Stem.** {it.get('stem','')}", "")
            for o in it.get("options", []):
                qdoc.add(f"- {o.get('t','')}" + (" **← keyed correct**" if o.get("c") else ""))
            qdoc.add("")
            if it.get("why"):
                qdoc.add(f"**Rationale.** {it['why']}", "")
            if it.get("pearl"):
                qdoc.add(f"**Pearl.** {it['pearl']}", "")
    docs.append(qdoc)
    stats["qbank"] = len(qb["items"])

    # ---------------- A2 case simulations --------------------------------
    cdoc = Doc("A2_CASE_SIMULATIONS.md", "Case simulations and rehearsal banks")
    cdoc.add(f"# {cfg['prefix']} · Appendix A2 — Simulation and rehearsal content", "",
             "The branching content behind *What Do You Say Next?*, the Diagnostic Reasoning "
             "Workbench, Family Systems Practice, and *One Patient, Six Weeks*. Every branch, "
             "keyed response and coaching line is shown.", "")

    cc = _load(B / "communication_cases.json", {"cases": []})
    cdoc.add(f"## Communication cases — *What Do You Say Next?* ({len(cc['cases'])} cases)", "")
    for c in cc["cases"]:
        cdoc.add(f"### {c['id']} — {c['title']}", "",
                 f"- Topic `{c.get('topic','')}` · Setting: {c.get('setting','')}",
                 f"- Learner goal: {c.get('learnerGoal','')}")
        if c.get("skillTags"):
            cdoc.add("- Skill tags: " + ", ".join(f"`{t}`" for t in c["skillTags"]))
        if c.get("linkedPages"):
            cdoc.add("- Linked pages: " + ", ".join(f"`{t}`" for t in c["linkedPages"]))
        if c.get("evidenceIds"):
            cdoc.add("- Evidence: " + ", ".join(f"`{t}`" for t in c["evidenceIds"]))
        if c.get("facultyReview"):
            cdoc.add("- Faculty review: " + json.dumps(c["facultyReview"], ensure_ascii=False))
        cdoc.add("", f"**Prompt.** {c.get('prompt','')}", "")
        rd = c.get("rapidDrill")
        if isinstance(rd, dict):
            cdoc.add(f"**Rapid drill** (target {rd.get('targetSeconds','?')} s).", "")
            if rd.get("stance"):
                cdoc.add(f"- *Stance:* {rd['stance']}")
            if rd.get("starter"):
                cdoc.add(f"- *Starter:* {rd['starter']}")
            for k, lbl in (("mustInclude", "Must include"), ("avoid", "Avoid")):
                if rd.get(k):
                    cdoc.add(f"- *{lbl}:*")
                    cdoc.add(*[f"  - {x}" for x in rd[k]])
            cdoc.add("")
        elif rd:
            cdoc.add("**Rapid drill.** " + json.dumps(rd, ensure_ascii=False), "")
        cdoc.add("**Response options (what the learner picks between):**", "")
        cdoc.add(*render_choice_list(c.get("choices", [])))
        cdoc.add("")

    rc = _load(B / "reasoning_cases.json", {"cases": []})
    cdoc.add(f"## Diagnostic reasoning cases ({len(rc['cases'])} cases)", "")
    for c in rc["cases"]:
        cdoc.add(f"### {c['id']} — {c['title']}", "",
                 f"- Setting: {c.get('setting','')}",
                 f"- Learner goal: {c.get('learnerGoal','')}", "",
                 f"**Patient brief.** {c.get('patientBrief','')}", "")
        if c.get("facts"):
            cdoc.add("**Facts available to the learner:**", "")
            cdoc.add(*render_labelled(c["facts"]))
            cdoc.add("")
        for n, st in enumerate(c.get("steps", []), 1):
            if not isinstance(st, dict):
                cdoc.add(f"**Step {n}.** " + json.dumps(st, ensure_ascii=False), "")
                continue
            cdoc.add(f"**Step {n} — {st.get('title', st.get('id',''))}** "
                     f"(`{st.get('id','')}`)", "")
            if st.get("prompt"):
                cdoc.add(f"*Prompt.* {st['prompt']}", "")
            cdoc.add(*render_choice_list(st.get("choices", [])))
            for k in ("teachingPoint", "takeaway", "why", "summary"):
                if st.get(k):
                    cdoc.add("", f"*{k}:* {st[k]}")
            for k, v in st.items():
                if k in ("id", "title", "prompt", "choices", "teachingPoint",
                         "takeaway", "why", "summary"):
                    continue
                cdoc.add(f"- *{k}:* " + (v if isinstance(v, str)
                                         else json.dumps(v, ensure_ascii=False)))
            cdoc.add("")
        if c.get("biasChecks"):
            cdoc.add("**Bias checks the case forces:**", "")
            cdoc.add(*render_labelled(c["biasChecks"]))
            cdoc.add("")
        for k in ("linkedPages", "evidenceIds", "facultyReview"):
            if c.get(k):
                cdoc.add(f"- **{k}:** " + json.dumps(c[k], ensure_ascii=False))
        cdoc.add("")

    fs = _load(B / "family_systems_scenarios.json", {"scenarios": []})
    cdoc.add(f"## Family systems scenarios ({len(fs['scenarios'])} scenarios)", "")
    for s in fs["scenarios"]:
        cdoc.add(f"### {s['id']} — {s['title']}", "",
                 f"- Setting: {s.get('setting','')} · Time: {s.get('time','')}",
                 f"- Learner goal: {s.get('learnerGoal','')}", "",
                 f"**Opening.** {s.get('opening','')}", "")
        secs = s.get("sections")
        if isinstance(secs, dict):
            cdoc.add(*render_stage_map(secs, "Scripted content by stage"))
        elif secs:
            for sub in secs:
                cdoc.add("**Section.** " + json.dumps(sub, ensure_ascii=False, indent=1), "")
        if s.get("checks"):
            cdoc.add("**Completion checks:**", "")
            cdoc.add(*render_labelled(s["checks"]))
            cdoc.add("")
        for k in ("linkedPages", "communicationCases", "evidenceIds", "facultyReview"):
            if s.get(k):
                cdoc.add(f"- **{k}:** " + json.dumps(s[k], ensure_ascii=False))
        cdoc.add("")

    lc = _load(B / "longitudinal_case.json", {})
    if lc:
        cdoc.add("## Longitudinal case — *One Patient, Six Weeks*", "",
                 f"**{lc.get('title','')}** · setting: {lc.get('setting','')}", "",
                 f"> {lc.get('disclaimer','')}", "")
        pt = lc.get("patient", {})
        cdoc.add(f"**Patient.** {pt.get('displayName','')} — {pt.get('description','')}", "")
        if pt.get("frame"):
            cdoc.add(f"**Frame.** {pt['frame']}", "")
        for w in lc.get("weeks", []):
            cdoc.add(f"### {w.get('label','')} — {w.get('title','')}", "",
                     f"- Focus: {w.get('focus','')}", "",
                     f"**Patient state.** {w.get('patientState','')}", "",
                     f"**Learner task.** {w.get('learnerTask','')}", "")
            if w.get("checklist"):
                cdoc.add("**Checklist:**", "")
                for c2 in w["checklist"]:
                    cdoc.add("- " + (c2 if isinstance(c2, str) else json.dumps(c2, ensure_ascii=False)))
                cdoc.add("")
            for k, lbl in (("reflectionPrompt", "Reflection prompt"), ("handoff", "Handoff")):
                if w.get(k):
                    cdoc.add(f"**{lbl}.** " + (w[k] if isinstance(w[k], str)
                                               else json.dumps(w[k], ensure_ascii=False)), "")
    docs.append(cdoc)
    stats["comm_cases"] = len(cc["cases"])
    stats["reasoning_cases"] = len(rc["cases"])
    stats["family_scenarios"] = len(fs["scenarios"])

    # ---------------- A3 audio companion quizzes -------------------------
    qz = _load(B / "tools" / "quizzes.json", {"decks": []})
    adoc = Doc("A3_AUDIO_COMPANION_QUIZZES.md", "Audio companion quiz decks")
    adoc.add(f"# {cfg['prefix']} · Appendix A3 — Audio-companion quiz decks", "",
             f"`tools/quizzes.json` — {qz.get('deckCount', len(qz['decks']))} decks / "
             f"{qz.get('questionCount','?')} questions attached to the landmark-trial and "
             f"spine audio summaries (Landmark Trials · Daily Review · Shelf Mode). "
             f"Source: {qz.get('source','—')}.", "")
    for deck in qz.get("decks", []):
        adoc.add(f"## {deck.get('id','')} — {deck.get('title','')}  ({deck.get('n','?')} questions)", "")
        for i, q in enumerate(deck.get("questions", []), 1):
            adoc.add(f"{i}. **{q.get('q','')}**")
            for o in q.get("o", []):
                adoc.add(f"   - {o.get('t','')}" + (" **← keyed correct**" if o.get("c") else ""))
                if o.get("fb"):
                    adoc.add(f"     - *feedback:* {o['fb']}")
            adoc.add("")
    docs.append(adoc)
    stats["quiz_decks"] = len(qz.get("decks", []))
    stats["quiz_questions"] = qz.get("questionCount", 0)

    # ---------------- A4 evidence base -----------------------------------
    ev = _load(B / "evidence_registry.json", {"sources": []})
    ann = _load(LIB / "evidence_annotations.json", {"annotations": []})
    edoc = Doc("A4_EVIDENCE_BASE.md", "Evidence registry and verbatim source spans")
    edoc.add(f"# {cfg['prefix']} · Appendix A4 — Evidence base", "",
             f"{len(ev['sources'])} registered sources and {len(ann.get('annotations', []))} "
             "annotated claims. Each annotation stores the verbatim span from the paper that "
             "licenses the claim the library makes — the highest-value target for clinical "
             "review, because a claim that drifts from its span is a factual error with a "
             "citation attached.", "")
    if ann.get("policy"):
        edoc.add("**Annotation policy.** " + json.dumps(ann["policy"], ensure_ascii=False, indent=1), "")
    edoc.add("## Annotated claims (claim vs. the paper's own words)", "")
    for a in ann.get("annotations", []):
        va = a.get("verifiedAgainst", {})
        edoc.add(f"### `{a['sourceId']}`", "",
                 f"- span type `{va.get('spanType','')}` · retrieved {va.get('retrievedAt','')}"
                 f" · PMID {va.get('pmid','—')} · DOI {va.get('doi','') or '—'}", "",
                 "**Verbatim source span.**", "", f"> {va.get('sourceSpan','')}", "")
        for c in a.get("claims", []):
            edoc.add(f"**Claim `{c.get('claimId','')}`** (direction: `{c.get('direction','')}`, "
                     f"used by {', '.join(c.get('usedBy', [])) or '—'})", "",
                     f"> {c.get('claimText','')}", "")
            if c.get("claimTerms"):
                edoc.add("- claim terms: " + ", ".join(f"`{t}`" for t in c["claimTerms"]), "")
    edoc.add("## Full source registry", "", "| id | type | access | citation |", "|---|---|---|---|")
    for s in ev["sources"]:
        edoc.add("| `%s` | %s | %s | %s |" % (
            s.get("id", ""), s.get("type", ""), s.get("requiredAccess", ""),
            str(s.get("citation", "")).replace("|", "\\|")))
    docs.append(edoc)
    stats["evidence_sources"] = len(ev["sources"])
    stats["evidence_annotations"] = len(ann.get("annotations", []))

    # ---------------- A5 crosswalk matrices ------------------------------
    xdoc = Doc("A5_COVERAGE_MATRICES.md", "Coverage matrices")
    xdoc.add(f"# {cfg['prefix']} · Appendix A5 — Coverage matrices", "",
             "Where the curriculum claims coverage. Use these to spot a blueprint area or EPA "
             "asserted by tagging but thin in actual content, and to see which pages carry "
             "high-risk safety content.", "")
    shipped = {it["f"] for sec in nav for it in nav_items(sec)}
    blue: dict[str, list[str]] = {}
    epas: dict[str, list[str]] = {}
    safety: dict[str, list[str]] = {}
    for slug, meta in topic_meta.items():
        if slug == "_note" or slug not in shipped or not isinstance(meta, dict):
            continue
        for b in meta.get("shelfBlueprint", []):
            blue.setdefault(b, []).append(slug)
        for e in meta.get("epa", []):
            epas.setdefault(e, []).append(slug)
        if meta.get("safetyLevel"):
            safety.setdefault(meta["safetyLevel"], []).append(slug)
    for title, table in (("Shelf / COMAT blueprint tags", blue), ("EPA crosswalk", epas),
                         ("Safety level", safety)):
        xdoc.add(f"## {title}", "", "| tag | n | pages |", "|---|---|---|")
        for k in sorted(table, key=lambda x: (-len(table[x]), x)):
            xdoc.add("| `%s` | %d | %s |" % (k, len(table[k]),
                                             ", ".join(f"`{p}`" for p in sorted(table[k]))))
        xdoc.add("")
    untagged = sorted(s for s in shipped if s.endswith(".md")
                      and not topic_meta.get(s, {}).get("shelfBlueprint"))
    xdoc.add("## Shipped pages with no shelf-blueprint tag", "",
             ", ".join(f"`{p}`" for p in untagged) or "_none_", "")
    docs.append(xdoc)

    # ---------------- 00 review brief (written last: needs the stats) -----
    brief = Doc("00_REVIEW_BRIEF.md", "Review brief")
    brief.add(
        f"# {cfg['prefix']} curriculum — complete content transcript for clinical review", "",
        f"**Site:** `{cfg['site']}` · **Audience:** {cfg['label']}",
        f"**Generated:** {today} from build `{sha}` · exporter: "
        "`13_Faculty_Resources/_automation/export_curriculum_review.py`", "",
        "## Who this is for", "",
        cfg["audience_note"], "",
        "## What is in scope", "",
        "This transcript is assembled from the **built site**, not the source tree, so it is "
        "exactly what a learner can reach: sidebar order, audience-scoped page set, resident "
        "overrides, build-injected crisis blocks and all. Everything below is included in full — "
        "no summarisation, no truncation of clinical text.", "",
        "| Content | Count |", "|---|---|",
        f"| Sidebar sections | {stats['sections']} |",
        f"| Narrative pages (markdown) | {stats['md']} |",
        f"| Interactive tools | {stats['tools']} |",
        f"| Deep-link-only (hidden) surfaces | {stats['hidden']} |",
        f"| Words of narrative curriculum | {stats['words']:,} |",
        f"| Practice question-bank items | {stats['qbank']} |",
        f"| Audio-companion quiz decks / questions | {stats['quiz_decks']} / {stats['quiz_questions']} |",
        f"| Communication cases | {stats['comm_cases']} |",
        f"| Diagnostic reasoning cases | {stats['reasoning_cases']} |",
        f"| Family systems scenarios | {stats['family_scenarios']} |",
        f"| Registered evidence sources | {stats['evidence_sources']} |",
        f"| Annotated claims with verbatim source spans | {stats['evidence_annotations']} |",
        "",
        "## Document set", "",
        "| File | Contents |", "|---|---|",
    )
    for d in docs:
        brief.add(f"| `{d.name}` | {d.title} |")
    brief.add(
        "",
        f"`{cfg['prefix']}_CURRICULUM_COMPLETE.md` is every file above concatenated in order — "
        "the single running document. The split files exist so a reviewer can work one "
        "reviewable pass at a time.", "",
        "## Standing constraints a reviewer should know", "",
        "These are deliberate editorial policies, not omissions. Flag a violation; do not flag "
        "the policy itself.", "",
        "1. **The library teaches administration; it does not reproduce instruments.** Pages "
        "teach how to elicit and interpret a scale and link to the official form. Verbatim item "
        "stems, anchor ladders and fillable reproductions of copyrighted instruments are "
        "prohibited. (COWS anchors in `withdrawal.html` ship under a recorded interim waiver.)",
        "2. **Crisis contacts live only in `crisis_resources.json`** and are injected at build "
        "time into pages that opt in. A page doing risk work without a crisis block is a "
        "finding; a hard-coded 988 in page prose is also a finding.",
        "3. **No PHI.** All clinical material is synthetic or de-identified composite.",
        "4. **No dose literals in rehearsal tools** (`rp-*`, `*-trainer`). Narrative pages and "
        "reference pages may carry doses; the trainers may not.",
        "5. **Every claim about a paper must match that paper's own words.** Appendix A4 pairs "
        "each claim with the verbatim span that licenses it.", "",
        "## What a clinical review should return", "",
        "For each finding, please give: **location** (file + page slug or item id), "
        "**severity**, **the claim as written**, **what is wrong**, and **suggested replacement "
        "text**. Suggested severity rubric:", "",
        "| Severity | Meaning |", "|---|---|",
        "| **S1 — unsafe** | Following this would harm a patient (wrong drug/route/monitoring, "
        "a missed can't-miss, an unsafe first move, a risk assessment that licenses premature "
        "discharge). |",
        "| **S2 — wrong** | Factually incorrect but not directly dangerous (mis-stated criteria, "
        "wrong mechanism, a trial result mis-summarised, a mis-keyed question). |",
        "| **S3 — outdated / out of step** | True once, or true elsewhere, but not current "
        "practice or not how this is done on an adult inpatient unit. |",
        "| **S4 — misleading emphasis** | Accurate but framed so a learner will draw the wrong "
        "conclusion, or a nuance omitted that changes management. |",
        "| **S5 — level mismatch** | Correct but pitched wrong for this audience "
        f"({cfg['prefix']}) — too advanced, too thin, or a responsibility the learner does not "
        "actually hold. |", "",
        "High-yield places to concentrate: the `topic_meta` **can't-miss**, **rule-out** and "
        "**first move** fields (these are the site's most assertive clinical claims and they "
        "render as standalone cards, stripped of the page's hedging); the keyed answers and "
        "rationales in Appendices A1 and A3; the safety pages and their tools; and any place "
        "where the `topic_meta` overlay and the page prose beneath it disagree.", "",
    )
    docs.insert(0, brief)

    # ---------------- write ---------------------------------------------
    written = []
    for d in docs:
        (outdir / d.name).write_text(d.text, encoding="utf-8")
        written.append(outdir / d.name)

    master = outdir / f"{cfg['prefix']}_CURRICULUM_COMPLETE.md"
    parts = []
    for d in docs:
        parts.append(f"\n\n<!-- ==================== {d.name} ==================== -->\n\n" + d.text)
    master.write_text("".join(parts).lstrip(), encoding="utf-8")
    written.append(master)

    stats["files"] = [p.name for p in written]
    stats["master_bytes"] = master.stat().st_size
    return stats


def nav_items(section: dict) -> list[dict]:
    return [it for it in section.get("items", []) if isinstance(it, dict) and it.get("f")]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audience", choices=["ms3", "resident", "all"], default="all")
    ap.add_argument("--build-root", default=str(LIB / "_build"))
    ap.add_argument("--out", default=str(LIB / "docs" / "curriculum-review"))
    args = ap.parse_args()

    out_root = Path(args.out)
    build_root = Path(args.build_root)
    out_root.mkdir(parents=True, exist_ok=True)

    keys = ["ms3", "resident"] if args.audience == "all" else [args.audience]
    results = {}
    for k in keys:
        results[k] = build_audience(k, out_root, build_root)
        s = results[k]
        print(f"{k}: {s['md']} pages ({s['words']:,} words) · {s['tools']} tools · "
              f"{s['qbank']} qbank · {s['quiz_questions']} audio-quiz Q · "
              f"{len(s['files'])} files · master {s['master_bytes']:,} bytes")

    if len(keys) == 2:
        (out_root / "README.md").write_text(_readme(results), encoding="utf-8")
        print("wrote", out_root / "README.md")
    return 0


def _readme(results: dict) -> str:
    ms3, res = results["ms3"], results["resident"]
    return f"""# Curriculum content transcripts — for clinical review

Generated {date.today().isoformat()} from build `{_git_sha()}` by
`13_Faculty_Resources/_automation/export_curriculum_review.py`.

Two complete, human-readable transcripts of everything the two sites ship — one per audience.
Assembled from the **built** sites (`_build/ms3`, `_build/res`), so each reflects sidebar
order, the audience-scoped page set, resident overrides and build-injected blocks. Nothing is
summarised or truncated.

| | MS3 (`une-ms3-psychiatry`) | Residents (`mmc-psychiatry-residents-sanford`) |
|---|---|---|
| Narrative pages | {ms3['md']} | {res['md']} |
| Words of curriculum | {ms3['words']:,} | {res['words']:,} |
| Interactive tools | {ms3['tools']} | {res['tools']} |
| Question-bank items | {ms3['qbank']} | {res['qbank']} |
| Audio-companion questions | {ms3['quiz_questions']} | {res['quiz_questions']} |
| Communication cases | {ms3['comm_cases']} | {res['comm_cases']} |
| Reasoning cases | {ms3['reasoning_cases']} | {res['reasoning_cases']} |
| Family systems scenarios | {ms3['family_scenarios']} | {res['family_scenarios']} |
| Evidence sources / annotated claims | {ms3['evidence_sources']} / {ms3['evidence_annotations']} | {res['evidence_sources']} / {res['evidence_annotations']} |
| Complete transcript | `ms3/MS3_CURRICULUM_COMPLETE.md` ({ms3['master_bytes']:,} B) | `resident/RESIDENT_CURRICULUM_COMPLETE.md` ({res['master_bytes']:,} B) |

## How to use

`REVIEW_PROMPT.md` is the handoff prompt to give a reviewing model, plus the pass schedule that
orders these files by yield. Hand over **one file per pass** — the complete transcripts are
multi-megabyte, and handing over the whole thing buys a shallow read of everything instead of a
real read of the parts that matter.

`<audience>/00_REVIEW_BRIEF.md` states the audience, the inventory, the standing editorial
constraints a reviewer should not mistake for omissions, and the severity rubric findings should
come back in.

Then either hand over the single `*_CURRICULUM_COMPLETE.md`, or work the split files in order:

1. `01_NAVIGATION_MAP.md` — every shipped surface with its governance status and source path
2. `02_CURRICULUM_V*.md` — the curriculum itself, in sidebar order, each page paired with the
   `topic_meta` assertions the SPA renders around it
3. `A1_QUESTION_BANK.md` — practice items with keyed answers and rationales
4. `A2_CASE_SIMULATIONS.md` — communication, reasoning, family-systems and longitudinal cases
5. `A3_AUDIO_COMPANION_QUIZZES.md` — the landmark-trial / spine audio quiz decks
6. `A4_EVIDENCE_BASE.md` — every claim beside the verbatim source span that licenses it
7. `A5_COVERAGE_MATRICES.md` — blueprint, EPA and safety-level coverage

## Regenerating

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 13_Faculty_Resources/_automation/export_curriculum_review.py
```

The exporter is report-only: it reads the builds and the root registries and writes only into
`docs/curriculum-review/`.
"""


if __name__ == "__main__":
    sys.exit(main())
