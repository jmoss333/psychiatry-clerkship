#!/usr/bin/env python3
"""Render the "Everything on this topic" hub block onto each topic page at build time.

WHY THIS EXISTS. One clinical problem is reachable from several surfaces that do not
know about each other. Suicide risk, on 2026-10-17, lived on six: the pocket card
(pg_suicide.md), the full guide (suicide.md), the C-SSRS reference page (cssrs.html), two
Case-of-the-Week editions (Jul 23 and Oct 12), the Safety-kit row, and the `safety`
question-bank category -- and none of them listed the others. A learner had to already
know which surface they wanted. This block makes the full guide the one place that names
every other surface for its problem, generated from the registries the library already
keeps, so a new case or drill shows up here the week it ships without anyone remembering
to add a link.

WHAT IT DOES NOT DO. It never edits a source page: the block is injected into the BUILT
copy under _build/<site>/content/, so the attested source bytes -- and therefore every
contentHash in reviewed.json -- are unchanged (attestation_hash.py hashes the source file
and the topic_meta record, never the build output). It adds no clinical text: every line
is a title the registries already carry, plus a count. It never duplicates the page's
own practice panel: a registered sibling that the panel already offers (topic_meta
relatedTools, tool_registry relatedPages, a cta tool link) is dropped at render time, and
a drill or scenario already deep-linked from the page's topic_meta is dropped the same way.

REGISTRATION DATA, not governance: topic_hubs.json sits beside site_manifest.json and
cotw_registry.json and is validated the same way they are -- at build time, failing
closed. `resolve()` raises SystemExit on a hub or sibling that does not ship, a role the
registry does not define, or a cotwTopic no shipped case carries; a dangling link never
reaches a learner. Readers of "what ships" go through shipped_pages.load_shipped_pages()
(ADR-002), never the manifest or the COTW registry directly.

COLLAPSED BY DEFAULT, by the same reasoning as the pairings block (decision
`pairings-block-collapsible`, Dr. Moss, 2026-09-04): a page a learner skims is not made
longer by it, <details>/<summary> is natively keyboard-operable, and the summary still
names the topic when closed. It reuses the pairing block's class names so it inherits
whatever that block is styled with and adds no stylesheet of its own.

PLACEMENT. The block is inserted immediately before the page's hand-written
"Pair with" paragraph or heading when the page has one (14 of the 15 hubs do; it
extends that paragraph), otherwise appended at the end. A page that already carries a
rendered block has it REPLACED, which is what lets resident_section.py's sweep swap the
MS3 rendering the copytree inherited for the resident one: Case-of-the-Week twins differ
per site (cotw_<date>_<topic>_ms3.md vs _res.md) and some siblings ship on one site only.

DETERMINISM. Nothing here reads the clock. Same registries in, byte-identical block out,
which is what keeps the visual baselines stable from one build to the next.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:  # so an importer from outside site_build/ still resolves it
    sys.path.insert(0, HERE)

from shipped_pages import load_shipped_pages  # noqa: E402

REGISTRY = os.path.join(HERE, "topic_hubs.json")
SITES = ("ms3", "res")

# Copy ships to BOTH sites unrebranded (same rule as the Front Door): audience-neutral,
# no MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford in any string below.
BLURB = ("Other places this library covers the same ground — cards, cases, drills "
         "and questions. Listed from the registries; nothing here is new teaching.")
FOOTNOTE = "Suggested, not required. Every item already ships in this library."
LABEL_READ = "Read"
LABEL_COTW = "Case of the Week"
LABEL_REASON = "Reason it through"
LABEL_FAMILY = "Family & collateral"
LABEL_DRILL = "What do you say next?"
LABEL_QUESTIONS = "Practice questions"
EARLIER = "earlier edition"

COTW_SLUG_RE = re.compile(r"^cotw_(\d{8})_([a-z0-9]+)_(ms3|res)\.md$")
COTW_TITLE_SUFFIX_RE = re.compile(r"\s+—\s+(MS3|Resident)\s*$")
# Both spellings the teaching pages use: a bold lead-in ("**Pair with** -- ...", 13 hubs) and a
# heading ("## Pair with", agitation.md). psychopharm_primer.md has neither and gets the block
# at the end.
PAIR_WITH_RE = re.compile(r"^(?:\*\*Pair with\*\*|#{1,6}[ \t]*Pair with\b)", re.M)
BLOCK_RE = re.compile(
    r'<details class="pairing-block topic-hub" data-topic-hub="[^"]*">.*?</details>',
    re.S,
)
# The visible one-line Case-of-the-Week link (render_cotw_line), and where it goes.
LABEL_COTW_LINE = "Case of the Week for this topic"
COTW_INDEX = "cotw_index.md"
COTW_INDEX_LABEL = "all cases"
COTW_LINE_RE = re.compile(
    r'<p class="pairing-block cotw-for-topic" data-cotw-for="[^"]*">.*?</p>\n*', re.S)
H1_RE = re.compile(r"^# [^\n]*\n", re.M)
TOOL_HREF_RE = re.compile(r"[?&]tool=([a-z0-9_-]+\.html)")
CASE_HREF_RE = re.compile(r"[?&](?:case|scenario)=([A-Za-z0-9_-]+)")

TOOL_COMM = "communication-practice.html"
TOOL_FAMILY = "family-systems.html"
TOOL_REASON = "diagnostic-reasoning.html"
TOOL_QBANK = "question-bank-practice.html"


# ---------------------------------------------------------------------------------------
# loading
# ---------------------------------------------------------------------------------------

def _read_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def load(lib_root, registry_path=REGISTRY):
    """Load the registry and every registry the block joins against. Pure reads."""
    lib_root = os.fspath(lib_root)
    registry = _read_json(registry_path)
    shipped = {p["slug"]: p for p in load_shipped_pages(lib_root)["pages"]}
    topic_meta = _read_json(os.path.join(lib_root, "topic_meta.json"))
    tool_registry = _read_json(os.path.join(lib_root, "tool_registry.json")).get("tools", [])
    vocabulary = _read_json(os.path.join(lib_root, "vocabulary.json")).get("codes", [])
    qbank = _read_json(os.path.join(lib_root, "question_bank.json")).get("items", [])
    comm = _read_json(os.path.join(lib_root, "communication_cases.json")).get("cases", [])
    family = _read_json(os.path.join(lib_root, "family_systems_scenarios.json")).get("scenarios", [])
    reasoning = {"ms3": _read_json(os.path.join(lib_root, "reasoning_cases.json")).get("cases", [])}
    res_reasoning = os.path.join(lib_root, "reasoning_cases_resident.json")
    # resident_section.py ships reasoning_cases_resident.json AS reasoning_cases.json on the
    # resident site, so the resident block must list that file's cases, not the MS3 ones.
    reasoning["res"] = (_read_json(res_reasoning).get("cases", [])
                        if os.path.exists(res_reasoning) else reasoning["ms3"])
    return {
        "registry": registry,
        "shipped": shipped,
        "topic_meta": topic_meta,
        "tool_registry": tool_registry,
        "vocab_labels": {c.get("id"): c.get("label") for c in vocabulary
                         if isinstance(c, dict) and c.get("status") == "active"},
        "qbank": [q for q in qbank if isinstance(q, dict) and q.get("status") == "attested"],
        "comm": comm,
        "family": family,
        "reasoning": reasoning,
    }


# ---------------------------------------------------------------------------------------
# validation (fail closed at build)
# ---------------------------------------------------------------------------------------

def _cotw_pages(shipped):
    """{topic: {site: [(date, slug, title), ...] newest first}} from the shipped listing."""
    out = {}
    for slug, page in shipped.items():
        match = COTW_SLUG_RE.match(slug)
        if not match:
            continue
        date, topic, site = match.groups()
        title = COTW_TITLE_SUFFIX_RE.sub("", page.get("title") or slug)
        out.setdefault(topic, {}).setdefault(site, []).append((date, slug, title))
    for topic in out.values():
        for site in topic:
            topic[site].sort(key=lambda row: (row[0], row[1]), reverse=True)
    return out


def validate(data):
    """Every problem a learner could otherwise meet as a dead link, as a list of strings."""
    problems = []
    registry = data["registry"]
    shipped = data["shipped"]
    roles = registry.get("roles")
    hubs = registry.get("hubs")
    if not isinstance(roles, dict) or not roles:
        problems.append("topic_hubs.json: roles must be a non-empty object")
        roles = {}
    if not isinstance(hubs, list) or not hubs:
        problems.append("topic_hubs.json: hubs must be a non-empty list")
        hubs = []
    if not isinstance(registry.get("heading"), str) or not registry["heading"].strip():
        problems.append("topic_hubs.json: heading must be a non-empty string")
    cotw = _cotw_pages(shipped)
    seen_hubs = set()
    for index, hub in enumerate(hubs):
        where = "topic_hubs.json hubs[%d]" % index
        if not isinstance(hub, dict):
            problems.append("%s: must be an object" % where)
            continue
        ref = hub.get("ref")
        if not isinstance(ref, str) or not ref:
            problems.append("%s: ref must be a non-empty string" % where)
            continue
        where = "%s (%s)" % (where, ref)
        page = shipped.get(ref)
        if page is None:
            problems.append("%s: hub ref does not ship" % where)
        elif page.get("kind") != "page":
            problems.append("%s: hub ref must be a content page, not a tool" % where)
        if ref in seen_hubs:
            problems.append("%s: duplicate hub" % where)
        seen_hubs.add(ref)
        topic = hub.get("topic")
        if not isinstance(topic, str) or not topic.strip() or len(topic) > 60:
            problems.append("%s: topic must be a non-empty string of at most 60 characters" % where)
        siblings = hub.get("siblings")
        if not isinstance(siblings, list):
            problems.append("%s: siblings must be a list" % where)
            siblings = []
        seen_siblings = set()
        for sibling in siblings:
            if not isinstance(sibling, dict) or not isinstance(sibling.get("ref"), str):
                problems.append("%s: each sibling needs a string ref" % where)
                continue
            sref = sibling["ref"]
            if sref == ref:
                problems.append("%s: sibling '%s' is the hub itself" % (where, sref))
            if sref in seen_siblings:
                problems.append("%s: duplicate sibling '%s'" % (where, sref))
            seen_siblings.add(sref)
            if sref not in shipped:
                problems.append("%s: sibling '%s' does not ship on any site" % (where, sref))
            if sibling.get("role") not in roles:
                problems.append("%s: sibling '%s' has unknown role %r" % (where, sref, sibling.get("role")))
        topics = hub.get("cotwTopics")
        if not isinstance(topics, list):
            problems.append("%s: cotwTopics must be a list (empty is fine)" % where)
            topics = []
        for code in topics:
            if not isinstance(code, str) or code not in cotw:
                problems.append("%s: cotwTopic %r matches no shipped Case-of-the-Week page" % (where, code))
        if not siblings and not topics:
            problems.append("%s: a hub needs at least one sibling or cotwTopic" % where)
    return problems


def resolve(data):
    """Validate, or stop the build naming every problem."""
    problems = validate(data)
    if problems:
        raise SystemExit("topic hub registry:\n  - " + "\n  - ".join(problems))
    data["cotw"] = _cotw_pages(data["shipped"])
    return data


def hubs_for_site(data, site):
    """Hub refs that ship on `site`, in registry order."""
    return [hub["ref"] for hub in data["registry"]["hubs"]
            if site in (data["shipped"].get(hub["ref"]) or {}).get("sites", [])]


# ---------------------------------------------------------------------------------------
# model: what the block for (hub, site) contains, before any HTML
# ---------------------------------------------------------------------------------------

def _ships_on(data, ref, site):
    return site in (data["shipped"].get(ref) or {}).get("sites", [])


def _title(data, ref):
    return (data["shipped"].get(ref) or {}).get("title") or ref


def _meta(data, ref):
    meta = data["topic_meta"].get(ref)
    return meta if isinstance(meta, dict) else {}


def _panel_tools(data, ref):
    """Tools the page's own practice panel already offers (spa_index.html's reconciliation:
    tool_registry.relatedPages, topic_meta.relatedTools, and cta/workflow tool links)."""
    out = set()
    for tool in data["tool_registry"]:
        if isinstance(tool, dict) and ref in (tool.get("relatedPages") or []):
            out.add(tool.get("file"))
    meta = _meta(data, ref)
    for tool in meta.get("relatedTools") or []:
        out.add(tool)
    for href in _meta_hrefs(meta):
        match = TOOL_HREF_RE.search(href)
        if match:
            out.add(match.group(1))
    return out


def _meta_hrefs(meta):
    cta = meta.get("cta") or []
    if isinstance(cta, dict):
        cta = [cta]
    hrefs = [c.get("href", "") for c in cta if isinstance(c, dict)]
    workflow = meta.get("clinicalWorkflow") or {}
    for action in (workflow.get("actions") or []) if isinstance(workflow, dict) else []:
        if isinstance(action, dict):
            hrefs.append(action.get("href", ""))
    return [h for h in hrefs if isinstance(h, str)]


def _panel_cases(data, ref):
    """Drill/scenario/case ids the page already deep-links (topic_meta communicationCases
    and any cta/workflow href carrying case= or scenario=)."""
    meta = _meta(data, ref)
    out = set(meta.get("communicationCases") or [])
    for href in _meta_hrefs(meta):
        match = CASE_HREF_RE.search(href)
        if match:
            out.add(match.group(1))
    return out


def _linked(entries, ref, exclude):
    return [(e["id"], e.get("title") or e["id"]) for e in entries
            if isinstance(e, dict) and isinstance(e.get("id"), str)
            and ref in (e.get("linkedPages") or []) and e["id"] not in exclude]


def model(data, ref, site):
    """The block's content for one hub on one site, as plain data (tests read this)."""
    registry = data["registry"]
    hub = next(h for h in registry["hubs"] if h["ref"] == ref)
    roles = registry["roles"]
    panel_tools = _panel_tools(data, ref)
    panel_cases = _panel_cases(data, ref)

    siblings = []
    for sibling in hub.get("siblings") or []:
        sref = sibling["ref"]
        if not _ships_on(data, sref, site) or sref in panel_tools:
            continue
        kind = (data["shipped"].get(sref) or {}).get("kind")
        siblings.append({
            "ref": sref, "kind": kind, "title": _title(data, sref),
            "role": sibling["role"], "roleLabel": roles[sibling["role"]],
            "href": ("?tool=%s" if kind == "tool" else "?page=%s") % sref,
        })

    cotw = []
    for code in hub.get("cotwTopics") or []:
        for date, slug, title in data["cotw"].get(code, {}).get(site, []):
            cotw.append({"date": date, "slug": slug, "title": title, "href": "?page=%s" % slug})
    cotw.sort(key=lambda row: (row["date"], row["slug"]), reverse=True)

    reasoning = ([{"id": i, "title": t, "href": "?tool=%s&case=%s" % (TOOL_REASON, i)}
                  for i, t in _linked(data["reasoning"][site], ref, panel_cases)]
                 if _ships_on(data, TOOL_REASON, site) else [])
    family = ([{"id": i, "title": t, "href": "?tool=%s&scenario=%s" % (TOOL_FAMILY, i)}
               for i, t in _linked(data["family"], ref, panel_cases)]
              if _ships_on(data, TOOL_FAMILY, site) else [])
    drills = ([{"id": i, "title": t, "href": "?tool=%s&case=%s" % (TOOL_COMM, i)}
               for i, t in _linked(data["comm"], ref, panel_cases)]
              if _ships_on(data, TOOL_COMM, site) else [])

    cited = [q for q in data["qbank"] if ref in (q.get("pages") or [])]
    categories = {}
    for q in cited:
        categories[q.get("category")] = categories.get(q.get("category"), 0) + 1
    labels = data["vocab_labels"]
    ranked = sorted(categories.items(), key=lambda kv: (-kv[1], str(kv[0])))
    questions = None
    if cited and _ships_on(data, TOOL_QBANK, site):
        questions = {
            "count": len(cited),
            "categories": [labels.get(code) or code for code, _ in ranked],
            "href": "?tool=%s" % TOOL_QBANK,
        }

    return {
        "ref": ref, "site": site, "topic": hub["topic"], "heading": registry["heading"],
        "siblings": siblings, "cotw": cotw, "reasoning": reasoning,
        "family": family, "drills": drills, "questions": questions,
    }


# ---------------------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------------------

def _esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _attr(text):
    return _esc(text).replace('"', "&quot;")


def _link(href, title):
    return '<a href="%s">%s</a>' % (_attr(href), _esc(title))


def _li(label, body):
    return "  <li><strong>%s</strong> — %s</li>" % (_esc(label), body)


def render(data, ref, site):
    """The block for one hub on one site. Empty string when there is nothing to list,
    so a hub whose every item is already on the page adds no empty disclosure."""
    m = model(data, ref, site)
    items = []
    for s in m["siblings"]:
        items.append(_li(LABEL_READ, "%s <span class=\"pairing-src\">— %s</span>"
                         % (_link(s["href"], s["title"]), _esc(s["roleLabel"]))))
    if m["cotw"]:
        latest = m["cotw"][0]
        body = _link(latest["href"], latest["title"])
        earlier = m["cotw"][1:]
        if earlier:
            body += " <span class=\"pairing-src\">— %s: %s</span>" % (
                _esc(EARLIER if len(earlier) == 1 else EARLIER + "s"),
                ", ".join(_link(e["href"], e["title"]) for e in earlier))
        items.append(_li(LABEL_COTW, body))
    for r in m["reasoning"]:
        items.append(_li(LABEL_REASON, _link(r["href"], r["title"])))
    for f in m["family"]:
        items.append(_li(LABEL_FAMILY, _link(f["href"], f["title"])))
    for d in m["drills"]:
        items.append(_li(LABEL_DRILL, _link(d["href"], d["title"])))
    q = m["questions"]
    if q:
        noun = "item" if q["count"] == 1 else "items"
        items.append(_li(LABEL_QUESTIONS, "%s <span class=\"pairing-src\">— %s</span>" % (
            _link(q["href"], "%d question-bank %s cite this page" % (q["count"], noun)),
            _esc(", ".join(q["categories"])))))
    if not items:
        return ""
    return "\n".join(
        ['<details class="pairing-block topic-hub" data-topic-hub="%s">' % _attr(ref),
         "<summary><strong>%s</strong> — %s</summary>" % (_esc(m["heading"]), _esc(m["topic"])),
         '<p class="pairing-blurb"><em>%s</em></p>' % _esc(BLURB),
         '<ul class="pairing-items">']
        + items
        + ["</ul>",
           '<p class="pairing-note"><small>%s</small></p>' % _esc(FOOTNOTE),
           "</details>"]
    )


def render_cotw_line(data, ref, site):
    """One VISIBLE line naming this topic's Case of the Week (C2, 2026-10-17), or "".

    The hub block lists every edition, but it is collapsed and sits near the end of the page,
    so the weekly cases stayed effectively search-only. This line goes at the top of the built
    page, under its title: the newest edition for the topic on this site, how many there are,
    and the generated archive. Same sources and same guarantees as the block -- built output
    only (no source byte, no contentHash moves), titles the registries already carry, no
    clinical text, audience-neutral copy.
    """
    if ref not in hubs_for_site(data, site):
        return ""
    cotw = model(data, ref, site)["cotw"]
    if not cotw:
        return ""
    newest = cotw[0]
    more = len(cotw) - 1
    tail = ("%d more on this topic" % more if more else "")
    src = " · ".join(part for part in (tail, _link("?page=%s" % COTW_INDEX, COTW_INDEX_LABEL)) if part)
    return ('<p class="pairing-block cotw-for-topic" data-cotw-for="%s"><strong>%s:</strong> %s '
            '<span class="pairing-src">— %s</span></p>'
            % (_attr(ref), _esc(LABEL_COTW_LINE), _link(newest["href"], newest["title"]), src))


def _place_cotw_line(text, line):
    """Replace an inherited line in place (resident sweep), else insert under the page's H1."""
    if COTW_LINE_RE.search(text):
        return COTW_LINE_RE.sub(lambda _m: (line + "\n\n") if line else "", text, count=1)
    if not line:
        return text
    match = H1_RE.search(text)
    if match:
        return text[:match.end()].rstrip("\n") + "\n\n" + line + "\n\n" + text[match.end():].lstrip("\n")
    return line + "\n\n" + text


def inject_markdown(text, data, dst, site):
    """Place (or replace) the block on a built page. Returns (text, injected).

    Non-hub pages are returned untouched. A hub page that already carries a rendered block
    (the resident copytree inherits the MS3 one) has it replaced in place; otherwise the
    block goes immediately before the hand-written "**Pair with**" paragraph when the page
    has one, else at the end. The visible Case-of-the-Week line (render_cotw_line) is placed
    or replaced under the page title in the same pass.
    """
    slug = os.path.basename(dst)
    if slug not in hubs_for_site(data, site):
        return text, False
    placed = _place_cotw_line(text, render_cotw_line(data, slug, site))
    line_changed, text = placed != text, placed
    block = render(data, slug, site)
    if BLOCK_RE.search(text):
        if not block:
            return BLOCK_RE.sub("", text), True
        return BLOCK_RE.sub(lambda _m: block, text, count=1), True
    if not block:
        return text, line_changed
    match = PAIR_WITH_RE.search(text)
    if match:
        head, tail = text[:match.start()], text[match.start():]
        return head.rstrip("\n") + "\n\n" + block + "\n\n" + tail, True
    return text.rstrip("\n") + "\n\n" + block + "\n", True


# ---------------------------------------------------------------------------------------
# CLI + self-test
# ---------------------------------------------------------------------------------------

def _lib_root():
    return os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def _self_test():
    import copy
    import unittest

    lib = _lib_root()
    real = resolve(load(lib))

    class Tests(unittest.TestCase):
        def test_registry_resolves(self):
            self.assertEqual(validate(real), [])

        def test_dangling_sibling_fails_closed(self):
            data = copy.deepcopy(real)
            data["registry"]["hubs"][0]["siblings"].append({"ref": "nope.md", "role": "guide"})
            self.assertTrue(any("does not ship" in p for p in validate(data)))

        def test_unknown_role_fails_closed(self):
            data = copy.deepcopy(real)
            data["registry"]["hubs"][0]["siblings"][0]["role"] = "mystery"
            self.assertTrue(any("unknown role" in p for p in validate(data)))

        def test_unknown_cotw_topic_fails_closed(self):
            data = copy.deepcopy(real)
            data["registry"]["hubs"][0]["cotwTopics"].append("nosuchcase")
            self.assertTrue(any("matches no shipped" in p for p in validate(data)))

        def test_every_link_resolves_on_its_site(self):
            for site in SITES:
                for ref in hubs_for_site(real, site):
                    m = model(real, ref, site)
                    for row in m["siblings"] + m["cotw"]:
                        target = row.get("slug") or row["ref"]
                        self.assertTrue(_ships_on(real, target, site), (site, ref, target))
                    for row in m["cotw"]:
                        self.assertTrue(row["slug"].endswith("_%s.md" % site), (site, row["slug"]))

        def test_render_is_deterministic_and_never_links_the_hub_itself(self):
            for site in SITES:
                for ref in hubs_for_site(real, site):
                    once, twice = render(real, ref, site), render(real, ref, site)
                    self.assertEqual(once, twice)
                    self.assertNotIn('"?page=%s"' % ref, once)

        def test_sibling_already_on_panel_is_dropped(self):
            data = copy.deepcopy(real)
            hub = data["registry"]["hubs"][0]
            tool = next(s for s in hub["siblings"] if s["ref"].endswith(".html"))
            data["topic_meta"].setdefault(hub["ref"], {})["relatedTools"] = [tool["ref"]]
            refs = [s["ref"] for s in model(data, hub["ref"], "ms3")["siblings"]]
            self.assertNotIn(tool["ref"], refs)

        def test_inject_before_pair_with(self):
            ref = hubs_for_site(real, "ms3")[0]
            text = "# Title\n\nBody.\n\n**Pair with** — x.\n\n*footer*\n"
            out, did = inject_markdown(text, real, ref, "ms3")
            self.assertTrue(did)
            self.assertLess(out.index("topic-hub"), out.index("**Pair with**"))
            self.assertEqual(out.count('data-topic-hub="'), 1)

        def test_inject_before_pair_with_heading(self):
            ref = hubs_for_site(real, "ms3")[0]
            text = "# Title\n\nBody.\n\n## Pair with\n\nPair this with x.\n"
            out, did = inject_markdown(text, real, ref, "ms3")
            self.assertTrue(did)
            self.assertLess(out.index("topic-hub"), out.index("## Pair with"))

        def test_inject_appends_without_pair_with_and_replaces_in_place(self):
            ref = hubs_for_site(real, "res")[0]
            text = "# Title\n\nBody.\n"
            ms3, _ = inject_markdown(text, real, ref, "ms3")
            # The page's own text survives in order; only generated blocks are added around it.
            self.assertEqual(COTW_LINE_RE.sub("", BLOCK_RE.sub("", ms3)).split(), text.split())
            res, did = inject_markdown(ms3, real, ref, "res")
            self.assertTrue(did)
            self.assertEqual(res.count('data-topic-hub="%s"' % ref), 1)
            self.assertEqual(res, inject_markdown(res, real, ref, "res")[0])

        def test_cotw_line_under_title_per_site_and_replaced_not_duplicated(self):
            with_cotw = [r for r in hubs_for_site(real, "res") if model(real, r, "res")["cotw"]]
            self.assertTrue(with_cotw)
            for ref in with_cotw:
                text = "# Title\n\nBody.\n"
                ms3, _ = inject_markdown(text, real, ref, "ms3")
                if model(real, ref, "ms3")["cotw"]:
                    self.assertTrue(ms3.startswith("# Title\n\n" + '<p class="pairing-block cotw-for-topic"'))
                    self.assertIn("_ms3.md", COTW_LINE_RE.search(ms3).group(0))
                res, _ = inject_markdown(ms3, real, ref, "res")
                line = COTW_LINE_RE.search(res).group(0)
                self.assertEqual(len(COTW_LINE_RE.findall(res)), 1, ref)
                self.assertNotIn("_ms3.md", line, "resident line links resident twins only")
                newest = model(real, ref, "res")["cotw"][0]["slug"]
                self.assertIn("?page=%s" % newest, line)
                self.assertIn("?page=%s" % COTW_INDEX, line)

        def test_cotw_line_absent_without_a_case(self):
            for ref in hubs_for_site(real, "ms3"):
                if not model(real, ref, "ms3")["cotw"]:
                    self.assertEqual(render_cotw_line(real, ref, "ms3"), "")

        def test_non_hub_untouched(self):
            text = "# Not a hub\n"
            self.assertEqual(inject_markdown(text, real, "welcome.md", "ms3"), (text, False))

        def test_copy_is_audience_neutral(self):
            banned = re.compile(r"MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford", re.I)
            strings = [BLURB, FOOTNOTE, LABEL_READ, LABEL_COTW, LABEL_REASON, LABEL_FAMILY,
                       LABEL_DRILL, LABEL_QUESTIONS, EARLIER, real["registry"]["heading"],
                       LABEL_COTW_LINE, COTW_INDEX_LABEL]
            strings += list(real["registry"]["roles"].values())
            strings += [h["topic"] for h in real["registry"]["hubs"]]
            for s in strings:
                self.assertIsNone(banned.search(s), s)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Tests)
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


def main(argv):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="validate the registry and exit")
    parser.add_argument("--render", metavar="REF", help="print the block for one hub")
    parser.add_argument("--site", choices=SITES, default="ms3")
    parser.add_argument("--json", action="store_true", help="dump every hub's model for both sites")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()
    data = resolve(load(_lib_root()))
    if args.check:
        print("topic hubs: %d hubs OK" % len(data["registry"]["hubs"]))
        return 0
    if args.render:
        print(render(data, args.render, args.site))
        return 0
    if args.json:
        print(json.dumps({site: [model(data, ref, site) for ref in hubs_for_site(data, site)]
                          for site in SITES}, indent=1, ensure_ascii=False))
        return 0
    for site in SITES:
        for ref in hubs_for_site(data, site):
            print("---- %s / %s ----" % (site, ref))
            print(render(data, ref, site))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
