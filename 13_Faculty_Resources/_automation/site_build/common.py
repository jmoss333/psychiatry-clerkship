"""Shared assembly logic for both audience builds (ms3 + resident).

Extracted 2026-07-26 (architecture review §3 rec 1.1/1.3). Before this module,
`build_deploy.py` and `resident_section.py` each carried their own copy of the
tokenizer, stopword set, synonym table, tool-keyword table, inverted-index
builder, and HTML polish/dark-mode passes. Those copies had measurably drifted:
22 of 37 synonym groups and 15 of 20 shared tool-keyword values differed between
the two sites. Everything both audiences need now lives here, once.

Two rules for anything added to this module:

1. **Audience-neutral only.** Anything that differs between ms3 and resident
   (nav, branding, which pages ship) stays in the caller. This module holds the
   machinery, not the content.
2. **Transforms must be verifiable.** Every HTML mutation here has a matching
   postcondition in `page_contract_failures()`. A transform that silently
   no-ops on a page authored slightly differently is the failure mode this
   module exists to eliminate — see the `rp-*` tools, which shipped without
   `clinical-warm.css`, the motion CSS, and the iframe link shim because they
   bypassed the pass entirely.

Deliberately NOT moved here: the `_headers` payload in `build_deploy.py`.
`tests/faculty-console-handler.test.mjs` regex-extracts that string literal from
the build script's source to assert the learner CSP, so it must remain a single
statically-inspectable literal in that file.
"""

import glob
import json
import os
import re

# ---------------------------------------------------------------------------
# Tokenizer (was duplicated: build_deploy.py + resident_section.py)
# ---------------------------------------------------------------------------

STOP = set(
    "a an and are as at be by for from has in is it of on or that the to was with you your".split()
)


def tok(text):
    """Lowercase → alnum-split → drop stopwords and 1-char tokens."""
    return [
        w
        for w in re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split()
        if len(w) >= 2 and w not in STOP
    ]


# ---------------------------------------------------------------------------
# Synonym groups — union of the two previously-forked tables.
#
# MERGE POLICY: concatenate + dedupe, do NOT transitively merge groups that
# share a token. `build_synonyms()` already gives each token the union of every
# group it appears in, so overlapping groups compose correctly without being
# fused. Fusing them would be actively harmful: ["sud","alcohol","opioid",...]
# and ["cows","opioid withdrawal"] share "opioid", and merging would make a
# search for "cows" (opioid withdrawal) surface alcohol-withdrawal pages.
#
# Because this is a pure union, every synonym either site had before is still
# present — `check_search_quality.py`'s REQUIRED_SYNONYMS can only still pass.
# ---------------------------------------------------------------------------

# Groups that were present on the MS3 build.
_GROUPS_MS3 = [
    ["bpd", "borderline", "borderline personality", "emotionally unstable", "eupd"],
    ["anxiety", "panic", "panic attack", "generalized anxiety", "gad", "worry"],
    ["depression", "depressed", "mdd", "major depressive", "low mood", "hopeless"],
    ["bipolar", "manic", "mania", "bipolar disorder", "mood stabilizer"],
    ["ptsd", "trauma", "post traumatic", "complex trauma", "cptsd"],
    ["psychosis", "psychotic", "hallucination", "delusion", "thought disorder", "schizophrenia"],
    ["sud", "substance", "addiction", "alcohol", "drugs", "substance use", "opioid"],
    ["si", "suicide", "suicidal", "self harm", "nssi", "safety planning"],
    ["sleep", "insomnia"],
    ["adolescent", "teen", "teenager", "youth", "child", "children", "minor", "pediatric"],
    ["geriatric", "elderly", "older adult", "senior", "dementia"],
    ["perinatal", "pregnant", "postpartum", "maternal", "pregnancy"],
    ["discharge", "transition", "aftercare", "follow up", "disposition"],
    ["referral", "consult", "consultation", "handoff"],
    ["crisis", "emergency", "urgent", "acute"],
    ["assessment", "screening", "evaluation", "screen"],
    ["safety", "safety plan", "stanley brown", "crisis plan"],
    ["medication", "med", "rx", "prescription", "drug", "pharmacology"],
    ["family", "caregiver", "parent", "partner", "spouse", "relational"],
    ["mse", "mental status exam", "mental status"],
    ["ciwa", "alcohol withdrawal"],
    ["cows", "opioid withdrawal"],
    ["cssrs", "columbia", "suicide severity"],
    ["frst", "violence", "aggression", "violence risk"],
    ["ee", "expressed emotion"],
    ["ddx", "differential", "differential diagnosis"],
    ["capacity", "decisional capacity", "consent", "informed consent"],
    ["catatonia", "lorazepam", "bush francis"],
    ["delirium", "confusion", "encephalopathy", "inattention"],
    ["agitation", "restraint", "de-escalation", "seclusion"],
    ["nms", "neuroleptic malignant"],
    ["antipsychotic", "neuroleptic", "clozapine"],
    ["lithium", "valproate", "lamotrigine"],
    ["ss", "serotonin syndrome"],
    ["td", "tardive dyskinesia", "tardive"],
    ["ama", "against medical advice", "discharge ama"],
    ["dts", "delirium tremens"],
    ["wke", "wernicke", "wernicke encephalopathy"],
    ["aws", "alcohol withdrawal"],
    ["eps", "extrapyramidal", "extrapyramidal symptoms"],
    ["eating", "eating disorder", "anorexia", "bulimia", "binge eating", "refeeding", "arfid"],
]

# Groups the resident build had that MS3 did not. Most of the resident table was
# a narrower restatement of the MS3 groups above (already covered by the union);
# these are the genuinely resident-originated clinical concepts, and they are now
# available to BOTH sites.
_GROUPS_RES_ONLY = [
    ["ect", "neuromodulation", "tms"],
    ["commitment", "involuntary", "blue paper", "hold"],
    ["supervision", "epa", "milestone", "teaching", "feedback"],
    ["clozapine", "trs", "treatment resistant"],
    ["catatonia", "lorazepam", "bush francis", "bfcrs"],
]


def _dedupe_groups(*group_lists):
    seen, out = set(), []
    for groups in group_lists:
        for g in groups:
            key = frozenset(g)
            if key not in seen:
                seen.add(key)
                out.append(list(g))
    return out


SYNONYM_GROUPS = _dedupe_groups(_GROUPS_MS3, _GROUPS_RES_ONLY)


def build_synonyms(groups=None):
    """token -> sorted list of co-group tokens. Bidirectional within each group."""
    syn = {}
    for g in groups if groups is not None else SYNONYM_GROUPS:
        toks = set()
        for term in g:
            toks.update(tok(term))
        for t in toks:
            syn.setdefault(t, set()).update(toks - {t})
    return {k: sorted(v) for k, v in syn.items()}


# ---------------------------------------------------------------------------
# Tool search keywords — union of the two forked tables, per key.
#
# Neither side was a superset: MS3 was richer for 12 of the 15 keys that
# differed, but `learning-path.html`, `review.html`, and `shelf-mode.html` each
# had resident-only terms ("rotation", "board review") that MS3 lacked. Union
# preserves both. Resident-only tools (rp-*) are included and are simply never
# referenced by the MS3 nav, so they cost that build nothing.
#
# NOTE (follow-on, architecture review rec 1.2): this table's real home is a
# `searchKeywords` field on `tool_registry.json`, which already exists and has a
# schema. Keeping it here for now so this change stays a pure de-duplication.
# ---------------------------------------------------------------------------

_TOOLKW_MS3 = {
    "mse.html": "mental status exam appearance behavior speech mood affect thought process content perception cognition insight judgment interview",
    "interview-circle.html": "interview circle radial domain map psychiatric intake history hpi chief complaint substance family social mental status safety risk non-linear conversation clinical skills interviewing not a checklist",
    "communication-practice.html": "what do you say next communication practice branching dialogue rapid spoken drill say it out loud rehearsal timer 20 second suicide psychosis validation rupture repair medication ambivalence family meeting collateral motivational interviewing relational skills",
    "diagnostic-reasoning.html": "diagnostic reasoning workbench differential diagnosis problem representation illness script bayesian updating diagnostic humility anchoring premature closure syndrome formulation inpatient psychiatry case practice delirium catatonia mania psychosis substance trauma personality",
    "family-systems.html": "family systems practice collateral call family meeting discharge barrier map expressed emotion psychoeducation confidentiality boundaries means safety caregiver support inpatient psychiatry",
    "one-patient-six-weeks.html": "one patient six weeks longitudinal case arc six week rotation timeline alliance interview mental status exam differential diagnosis medical rule out medication ambivalence family collateral safety suicide discharge handoff reflection",
    "capacity.html": "decisional capacity informed consent refusal four abilities understand appreciate reason communicate",
    "oral.html": "treatment team rounding prep rounds presentation oral one liner assessment plan handoff gather present practice timer collateral update 30 second sixty 60 second micro update",
    "violence.html": "violence risk aggression frst agitation safety prediction de-escalation",
    "cssrs.html": "columbia suicide severity rating scale cssrs suicidal ideation screening safety planning",
    "withdrawal.html": "withdrawal alcohol ciwa opioid cows detox benzodiazepine taper thiamine",
    "reflection.html": "reflection professional identity formation reflective writing pif",
    "screeners.html": "phq-9 phq9 gad-7 gad7 depression anxiety screener screening score severity validated instrument cutoff",
    "shelf-mode.html": "shelf mode comat shelf exam simulation timed vignette question bank board review mixed blueprint mock test practice questions",
    "review.html": "daily review spaced repetition srs flashcards sm-2 retention schedule due cards study streak memory test enhanced learning forgetting curve anki",
    "feedback.html": "feedback improve library suggest resource report broken link error confusing helpful rating comment survey suggestion box contact",
    "decision-aids.html": "algorithms decision aids visual trees flowchart rule out first move escalation ladder agitation restraint nms serotonin syndrome hyperthermia alcohol withdrawal timeline delirium tremens ciwa score bands catatonia psychosis differential dark mode",
    "bfcrs.html": "bush francis catatonia rating scale bfcrs bfcsi catatonia screening immobility stupor mutism posturing catalepsy waxy flexibility negativism mitgehen gegenhalten echopraxia lorazepam challenge severity score",
    "learning-path.html": "learning path home dashboard six week progress streak daily review study plan start here",
    "question-bank-practice.html": "practice questions question bank comat shelf exam vignette single best answer sba two-tier confidence calibration trap feedback spaced repetition category filter mood psychosis anxiety substance neurocognitive pharmacology safety personality relational ethics",
}

_TOOLKW_RES = {
    "mse.html": "mental status exam appearance behavior speech mood affect thought",
    "interview-circle.html": "interview circle radial domain map intake history hpi substance family social mental status safety conversation interviewing checklist",
    "capacity.html": "decisional capacity informed consent four abilities",
    "oral.html": "rounding presentation oral assessment plan handoff timer collateral update 30 second sixty 60 second micro update",
    "violence.html": "violence risk aggression frst de-escalation",
    "cssrs.html": "columbia suicide severity rating scale ideation safety planning",
    "withdrawal.html": "withdrawal alcohol ciwa opioid cows benzodiazepine thiamine",
    "reflection.html": "reflection professional identity formation",
    "screeners.html": "phq-9 gad-7 depression anxiety screener cutoff",
    "shelf-mode.html": "board style question bank exam simulation vignette mixed blueprint mock test",
    "decision-aids.html": "algorithms decision aids trees escalation ladder nms serotonin withdrawal timeline ciwa catatonia",
    "bfcrs.html": "bush francis catatonia rating scale immobility mutism posturing waxy flexibility lorazepam challenge",
    "review.html": "daily review spaced repetition srs flashcards retention due cards streak board review test enhanced learning forgetting curve",
    "feedback.html": "feedback improve library suggest resource report broken link error confusing helpful comment suggestion box",
    "learning-path.html": "learning path home dashboard rotation progress daily review",
    "rp-agitation.html": "agitation ladder prn trainer restraint de-escalation seclusion intramuscular haloperidol lorazepam olanzapine decision escalation",
    "rp-brief-psych.html": "five good minutes brief psychotherapy coach supportive bedside therapeutic conversation skills",
    "rp-canon-quiz.html": "canon quiz 200 paper spine landmark trials evidence self test board review recall",
}


def _merge_keywords(primary, secondary):
    """Union tokens per key, primary order first, then secondary-only tokens."""
    out = dict(primary)
    for key, extra in secondary.items():
        if key not in out:
            out[key] = extra
            continue
        have = out[key].split()
        seen = set(have)
        out[key] = " ".join(have + [w for w in extra.split() if w not in seen and not seen.add(w)])
    return out


TOOL_KEYWORDS = _merge_keywords(_TOOLKW_MS3, _TOOLKW_RES)


# ---------------------------------------------------------------------------
# Search index (was duplicated verbatim)
# ---------------------------------------------------------------------------


def build_search_index(nav, out_dir, tool_keywords=None, label=""):
    """Pre-tokenized inverted index + bidirectional synonyms → search-index.json.

    Weights: title 4, section 2, markdown headings 2, body 1. Hidden nav items
    are excluded from the index (they stay reachable by direct link).
    """
    keywords = TOOL_KEYWORDS if tool_keywords is None else tool_keywords
    postings, docs = {}, []

    def addtok(docid, text, wt):
        for t in tok(text):
            d = postings.setdefault(t, {})
            d[docid] = d.get(docid, 0) + wt

    for sec in nav:
        for it in sec["items"]:
            if it.get("hidden"):
                continue
            f, k, title, section = it["f"], it["k"], it["t"], sec["section"]
            heads = body = ""
            if k == "md":
                p = os.path.join(out_dir, "content", f)
                raw = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
                btxt = []
                for ln in raw.split("\n"):
                    s = ln.strip()
                    if s.startswith("#"):
                        heads += " " + s.lstrip("#").strip()
                    else:
                        btxt.append(s)
                body = " ".join(btxt)
            else:
                body = keywords.get(f, "")
            docid = len(docs)
            clean = re.sub(r"[#>*_`|\[\]()/-]+", " ", body)
            clean = re.sub(r"\s+", " ", clean).strip()
            docs.append({"t": title, "f": f, "k": k, "sec": section, "snip": clean[:170]})
            addtok(docid, title, 4)
            addtok(docid, section, 2)
            addtok(docid, heads, 2)
            addtok(docid, body, 1)

    post, df = {}, {}
    for t, dd in postings.items():
        post[t] = [[docid, tf] for docid, tf in sorted(dd.items())]
        df[t] = len(dd)
    syn = build_synonyms()
    idx = {"version": 1, "n": len(docs), "synonyms": syn, "docs": docs, "postings": post, "df": df}
    with open(os.path.join(out_dir, "search-index.json"), "w", encoding="utf-8") as fh:
        fh.write(json.dumps(idx, ensure_ascii=False))
    print(
        "search-index%s: docs %d | tokens %d | synonym-keys %d"
        % (" (" + label + ")" if label else "", len(docs), len(post), len(syn))
    )
    return idx


# ---------------------------------------------------------------------------
# HTML passes
#
# Each transform below has a matching assertion in `page_contract_failures()`.
# ---------------------------------------------------------------------------

# Legacy mid-tone that failed WCAG AA against the warm surface.
CONTRAST_FIX = ("#87786a", "#665a4f")

SKIP_LINK = '<a class="skip-link" href="#root">Skip to content</a>'
# A-5: coarse pointers get 44px minimum hit targets (WCAG 2.1 AA 2.5.5 Target Size).
# Ships in the same <style> block as the skip-link so one injection covers both.
SKIP_LINK_CSS = (
    "<style>.skip-link{position:absolute;left:-999px;top:0;"
    "background:var(--surface,#fff);color:var(--primary-dark,#a84830);"
    "padding:8px 12px;z-index:1000}.skip-link:focus{left:8px}"
    "@media(pointer:coarse){.chip,.tab,.btn,.seg,button,"
    '[role="tab"],[role="button"]{min-height:44px}}</style>'
)
FAVICON_LINK = '<link rel="icon" href="/favicon.svg">'
CLINICAL_CSS_LINK = '<link rel="stylesheet" href="/clinical-warm.css">'

# Pre-paint theme init: runs before first paint so dark mode never flashes.
THEME_INIT = (
    "<script>(function(){try{var t=localStorage.getItem('cw_theme');"
    "if(t!=='dark'&&t!=='light'){t='light';}"
    "document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>"
)

MOTION_CSS = (
    "@media(prefers-reduced-motion:no-preference){"
    "@keyframes ccRise{from{transform:translateY(10px)}to{transform:none}}"
    ".cc-rise{animation:ccRise .28s ease both}}"
    "button:active,a.btn:active,.btn:active,.tab:active,.opt:active,.tyo:active,"
    ".tile:active,.chip:active,.navitem:active,.navsec:active,.qbtn:active,"
    ".deckbtn:active,.thmbtn:active{transform:scale(.975)}"
    "html{-webkit-tap-highlight-color:transparent}"
)

# In-iframe link interceptor: when a tool runs inside the SPA shell, route its
# index.html?page=/?tool= links to the parent so they open in-app rather than
# nesting a second SPA or dead-ending in a new tab.
IFRAME_NAV = (
    "<!--ifn--><script>(function(){if(window.self===window.top)return;"
    "document.addEventListener('click',function(ev){"
    "var a=ev.target&&ev.target.closest&&ev.target.closest('a[href]');if(!a)return;"
    "var m=(a.getAttribute('href')||'').match(/index\\.html\\?(page|tool)=([^&#\"']+)/);"
    "if(m){ev.preventDefault();try{window.parent.postMessage("
    "{type:'openPage',f:decodeURIComponent(m[2])},'*');}catch(_){}}}, true);})();</script>"
)


def strip_review_banners(out_dir):
    """Remove learner-facing '> **Review status:**' blockquotes from built markdown."""
    n = 0
    for f in glob.glob(os.path.join(out_dir, "content", "*.md")):
        t = open(f, encoding="utf-8").read()
        t2 = re.sub(r"(?m)^> \*\*Review status:\*\*.*\n?", "", t)
        if t2 != t:
            open(f, "w", encoding="utf-8").write(t2)
            n += 1
    return n


def apply_contrast_fix(paths):
    """Darken the legacy mid-tone so it clears WCAG AA."""
    old, new = CONTRAST_FIX
    n = 0
    for f in paths:
        if not os.path.exists(f):
            continue
        t = open(f, encoding="utf-8").read()
        t2 = t.replace(old, new)
        if t2 != t:
            open(f, "w", encoding="utf-8").write(t2)
            n += 1
    return n


def apply_page_chrome(path, is_index=False):
    """Skip-link, root anchor, favicon. Idempotent."""
    t = open(path, encoding="utf-8").read()
    o = t

    if not is_index:
        t = t.replace('<div id="root"></div>', '<main id="root"></main>')
        # Some tool sources already ship a <main> wrapper but no id — give the
        # skip-link a resolvable #root target without duplicating an existing id.
        if 'id="root"' not in t and "<main" in t:
            t = re.sub(r"<main(?![^>]*\bid=)", '<main id="root"', t, count=1)

    if "rel=\"icon\"" not in t and "<head>" in t:
        t = t.replace("<head>", "<head>\n" + FAVICON_LINK, 1)

    # The SPA shell ships its own skip-link (href="#content") — never double-inject.
    if 'class="skip-link"' not in t and "<body" in t:
        t = re.sub(r"(<body[^>]*>)", r"\1\n" + SKIP_LINK, t, count=1)
    if ".skip-link{" not in t and "</head>" in t:
        t = t.replace("</head>", SKIP_LINK_CSS + "\n</head>", 1)

    # WP-03: bare accent text (--primary #c25a3c) is ~3.9:1 on the light backgrounds and
    # fails WCAG AA for normal-size text. Repoint to --primary-dark; the literal fallback
    # covers tools whose light :root lacks the token, and clinical-warm.css overrides
    # --primary-dark to #dd9277 in dark mode, which also passes. The closing paren in the
    # pattern leaves --primary-dark/--primary-light alone, and only text colour is
    # rewritten — backgrounds and borders keep the brand accent.
    # check-static-site.mjs hard-fails on any bare occurrence surviving into the build.
    # Tool pages only — the SPA shell is deliberately excluded, matching the pre-refactor
    # pass. The pattern also matches `border-color:var(--primary)`, so widening it to the
    # index would silently restyle shell borders as well as text.
    if not is_index:
        t = re.sub(r"color:\s*var\(--primary\)", "color:var(--primary-dark,#a84830)", t)

    if t != o:
        open(path, "w", encoding="utf-8").write(t)
    return t != o


def apply_dark_mode(path, is_index=False, cache_bust=None):
    """Theme init, dark tokens via clinical-warm.css, motion CSS, iframe nav shim."""
    t = open(path, encoding="utf-8").read()
    o = t

    if "--on-brand:#" not in t:
        t = t.replace("--surface:#ffffff;", "--surface:#ffffff; --on-brand:#ffffff;", 1)
    t = re.sub(r"(background(?:-color)?)\s*:\s*#(?:fff|ffffff)\b", r"\1:var(--surface)", t)
    t = re.sub(r"color\s*:\s*#(?:fff|ffffff)\b", "color:var(--on-brand)", t)

    if "cw_theme" not in t and "<head>" in t:
        t = t.replace("<head>", "<head>\n" + THEME_INIT, 1)

    # Dark tokens come from the linked stylesheet — one file, not N inline copies.
    if '[data-theme="dark"]' not in t and "clinical-warm.css" not in t and "</head>" in t:
        t = t.replace("</head>", CLINICAL_CSS_LINK + "\n</head>", 1)

    if "cc-rise" not in t and "</style>" in t:
        t = t.replace("</style>", MOTION_CSS + "\n</style>", 1)

    if not is_index and "<!--ifn-->" not in t and "</body>" in t:
        t = t.replace("</body>", IFRAME_NAV + "\n</body>", 1)

    if cache_bust:
        t = t.replace('"quizzes.json"', '"quizzes.json?v=' + cache_bust + '"').replace(
            "'quizzes.json'", "'quizzes.json?v=" + cache_bust + "'"
        )

    if t != o:
        open(path, "w", encoding="utf-8").write(t)
    return t != o


def apply_full_page_pass(out_dir, cache_bust=None):
    """Run chrome + dark-mode over every shipped HTML page in a build.

    Safe to re-run: every transform is idempotent. Callers that write additional
    HTML after the main pass (e.g. resident-only tools) should call this again
    rather than hand-rolling a subset — hand-rolled subsets are exactly how the
    rp-* tools ended up shipping without clinical-warm.css and the iframe shim.
    """
    pages = sorted(glob.glob(os.path.join(out_dir, "tools", "*.html")))
    index = os.path.join(out_dir, "index.html")
    if os.path.exists(index):
        pages.append(index)
    for p in pages:
        is_index = os.path.abspath(p) == os.path.abspath(index)
        apply_page_chrome(p, is_index=is_index)
        apply_dark_mode(p, is_index=is_index, cache_bust=cache_bust)
    return len(pages)


# ---------------------------------------------------------------------------
# Page contract — the postconditions that make the passes above verifiable.
# ---------------------------------------------------------------------------


def page_contract_failures(out_dir):
    """Return [(relative_path, [unmet requirement, ...]), ...] for shipped HTML.

    This is the check that converts a silently-skipped transform into a build
    failure. Before it existed, a tool authored with `<div id='root'>` instead of
    `<div id="root">`, or with a different CDN path, simply received nothing from
    the polish pass and shipped degraded.
    """
    failures = []
    index_abs = os.path.abspath(os.path.join(out_dir, "index.html"))
    pages = sorted(glob.glob(os.path.join(out_dir, "tools", "*.html")))
    if os.path.exists(index_abs):
        pages.append(index_abs)

    for p in pages:
        t = open(p, encoding="utf-8").read()
        is_index = os.path.abspath(p) == index_abs
        missing = []

        if 'class="skip-link"' not in t:
            missing.append("skip-to-content link")
        # The SPA shell targets #content; tools target #root.
        if not is_index and 'id="root"' not in t:
            missing.append('#root anchor for the skip link')
        if "cw_theme" not in t:
            missing.append("pre-paint theme init (cw_theme)")
        if "clinical-warm.css" not in t and '[data-theme="dark"]' not in t:
            missing.append("dark-mode tokens (clinical-warm.css link or inline block)")
        if 'rel="icon"' not in t:
            missing.append("favicon link")
        if not is_index and "<!--ifn-->" not in t:
            missing.append("in-iframe link interceptor")

        if missing:
            failures.append((os.path.relpath(p, out_dir), missing))
    return failures


def assert_page_contract(out_dir, label=""):
    """Hard-fail the build if any shipped page missed a transform."""
    failures = page_contract_failures(out_dir)
    if failures:
        print(
            "BUILD ABORTED — %d shipped page(s) failed the page contract%s:"
            % (len(failures), " (" + label + ")" if label else "")
        )
        for rel, missing in failures:
            print("   -", rel)
            for m in missing:
                print("       missing:", m)
        raise SystemExit(1)
    n = len(glob.glob(os.path.join(out_dir, "tools", "*.html"))) + (
        1 if os.path.exists(os.path.join(out_dir, "index.html")) else 0
    )
    print("page contract%s: %d page(s) verified" % (" (" + label + ")" if label else "", n))
