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
import hashlib
import json
import os
import re
import shutil
import sys

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
    return {k: sorted(syn[k]) for k in sorted(syn)}


def quiz_cache_bust(quizzes_path):
    """Content-hash cache-bust for quizzes.json.

    Replaces the int(time.time()) value that made every deploy byte-differ in
    review.html/shelf-mode.html and busted learner caches even when quizzes.json
    was unchanged. Same content -> same URL -> reproducible builds + honest caching.
    """
    with open(quizzes_path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Tool search keywords — union of the two forked tables, per key.
#
# Neither side was a superset: MS3 was richer for most keys that differed, but
# `review.html` and `shelf-mode.html` had resident-only terms ("rotation",
# "board review") that MS3 lacked. Union
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
            doc = {"t": title, "f": f, "k": k, "sec": section, "snip": clean[:170]}
            # Surface governance (risk-aware-publishing-warnings, Task 3): once nav
            # items carry a `.governance` triplet (annotate_navigation()), copy it
            # onto the matching search doc so the learner search UI can show the
            # same status without a second round-trip. Absent for nav that hasn't
            # been annotated (pre-governance builds, or tests exercising this
            # function directly) — nothing downstream requires the key to exist.
            governance = it.get("governance")
            if governance is not None:
                doc["governance"] = governance
            docs.append(doc)
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


def strip_claim_anchors(out_dir, known_ids):
    """Remove `[^source-id]` claim anchors from built markdown.

    Anchors bind an individual claim to the registry source that backs it, so a
    number can't sit unsourced beside sourced ones (see
    validate_claim_anchors.py). They are author- and reviewer-facing metadata and
    never ship — a learner should read the sentence, not the bookkeeping.

    Only anchors naming a REAL registry id are stripped. The validator uses a
    permissive pattern because it has to catch typos, but a build-time rewrite
    must never damage prose: `arr[^2]` and a regex sample like `[^a-z]` both
    match the permissive pattern, and both survive here untouched.
    """
    ids = sorted({i for i in (known_ids or []) if i}, key=len, reverse=True)
    if not ids:
        return 0
    pattern = re.compile(r"\[\^(?:%s)\]" % "|".join(re.escape(i) for i in ids))
    n = 0
    for f in glob.glob(os.path.join(out_dir, "content", "*.md")):
        t = open(f, encoding="utf-8").read()
        t2 = pattern.sub("", t)
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


def copy_required_sources(pairs, lib_root, dest_dir, label=""):
    """Copy (source_rel, dest_name) pairs into dest_dir, aborting on ANY missing source.

    The resident derived-twin build starts as a copytree of the finished MS3
    build, so a bare `if os.path.exists(...)` skip means a renamed resident-only
    source silently ships the inherited MS3 file under the resident nav title
    with every gate green (2026-08-01 audit, reproduced). Collect every missing
    source and abort, mirroring build_deploy.py's _abort_missing convention.
    """
    missing = [src for src, _ in pairs if not os.path.exists(os.path.join(lib_root, src))]
    if missing:
        print(
            "BUILD ABORTED — %d required source file(s) missing%s:"
            % (len(missing), " (" + label + ")" if label else "")
        )
        for src in missing:
            print("   -", src)
        raise SystemExit(1)
    for src, dst in pairs:
        shutil.copyfile(os.path.join(lib_root, src), os.path.join(dest_dir, dst))
    return len(pairs)


def apply_verified_replacements(text, substitutions, label=""):
    """Apply (needle, replacement) pairs in order; abort if ANY needle is absent.

    The resident rebrand previously used bare str.replace() chains, so a reword
    of the MS3 shell copy silently shipped MS3 branding and the MS3 audience
    disclaimer on the resident site. Every needle is checked at its application
    point (order matters: earlier replacements may legitimately consume later
    needles' context) and all failures are reported together.
    """
    stale = []
    for needle, replacement in substitutions:
        if needle in text:
            text = text.replace(needle, replacement)
        else:
            stale.append(needle)
    if stale:
        print(
            "BUILD ABORTED — %d rebrand needle(s) failed to match%s:"
            % (len(stale), " (" + label + ")" if label else "")
        )
        for needle in stale:
            print("   - %r" % (needle[:100],))
        raise SystemExit(1)
    return text


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


# ---------------------------------------------------------------------------
# Shared learner-logic snippets — single-sourced, build-injected.
# ---------------------------------------------------------------------------
# The SM-2 grader is learner-facing scheduling logic shared by three tools
# (question bank, family systems, daily review). Hand-synced copies drifted
# (2026-08 audit: review.html carried a third divergent variant). The canonical
# body lives in one .js file per marker; each consumer carries only the marker.
# tests/sm2-behavior.test.mjs pins the behaviour; tests/family-srs-parity.test.mjs
# pins consumer wiring; page_contract_failures() below turns a skipped injection
# into a hard build failure.
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
    "/*__PHI_HEURISTIC__*/": "phi_heuristic.js",
    "/*__SW_REGISTER__*/": "sw_register.js",
    "/*__CALIB_LOG__*/": "calib_log.js",
    "/*__PHASE_POLICY__*/": "phase_policy.js",
    "/*__SESS_CAPSULE__*/": "sess_capsule.js",
    "/*__FD_STATE__*/": "frontdoor/fd_state.js",
    "/*__FD_DATA__*/": "frontdoor/fd_data.js",
    "/*__FD_EDITION_CATALOG__*/": "frontdoor/fd_edition_catalog.js",
    "/*__FD_EDITION_CONTRACT__*/": "frontdoor/fd_edition_contract.js",
    "/*__FD_EDITION_PROJECT__*/": "frontdoor/fd_edition_project.js",
    "/*__FD_CURATOR__*/": "frontdoor/fd_curator.js",
    "/*__FD_EDITION_STUDENT__*/": "frontdoor/fd_edition_student.js",
    "/*__FD_TODAY__*/": "frontdoor/fd_today.js",
    "/*__FD_DUE__*/": "frontdoor/fd_due.js",
    "/*__FD_SHELL__*/": "frontdoor/fd_shell.js",
    "/*__FD_PATH__*/": "frontdoor/fd_path.js",
    "/*__FD_LIBRARY__*/": "frontdoor/fd_library.js",
    "/*__FD_READER__*/": "frontdoor/fd_reader.js",
    "/*__FD_SEARCH__*/": "frontdoor/fd_search.js",
    "/*__FD_SHEET__*/": "frontdoor/fd_sheet.js",
    "/*__FD_WIRE__*/": "frontdoor/fd_wire.js",
}


def inject_shared_snippets(path):
    """Replace shared-snippet markers with their canonical bodies. Idempotent."""
    t = open(path, encoding="utf-8").read()
    out = t
    for marker, fname in SNIPPET_MARKERS.items():
        if marker in out:
            snip = open(
                os.path.join(os.path.dirname(os.path.abspath(__file__)), fname),
                encoding="utf-8",
            ).read()
            out = out.replace(marker, snip)
    if out != t:
        open(path, "w", encoding="utf-8").write(out)
        return True
    return False


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
        inject_shared_snippets(p)
        apply_page_chrome(p, is_index=is_index)
        apply_dark_mode(p, is_index=is_index, cache_bust=cache_bust)
    return len(pages)


# ---------------------------------------------------------------------------
# Page contract — the postconditions that make the passes above verifiable.
# ---------------------------------------------------------------------------


def _snippet_signature(snippet_text):
    """A single stable line from a snippet body, safe to count occurrences of.

    Used to catch a snippet injected more than once — e.g. a consumer that
    pasted the marker twice, so `inject_shared_snippets()` (which replaces
    *all* marker occurrences) expands two live copies of the function. That's
    worse than an unexpanded marker: nothing about the page looks broken.
    """
    for line in snippet_text.splitlines():
        line = line.strip()
        if line.startswith("function "):
            return line
    return None


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

    snippet_signatures = {}
    for marker, fname in SNIPPET_MARKERS.items():
        snip = open(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), fname),
            encoding="utf-8",
        ).read()
        snippet_signatures[marker] = _snippet_signature(snip)

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
        for marker in SNIPPET_MARKERS:
            if marker in t:
                missing.append("unexpanded shared-snippet marker %s" % marker)
            else:
                sig = snippet_signatures.get(marker)
                if sig and t.count(sig) > 1:
                    missing.append(
                        "shared-snippet body for marker %s injected more than "
                        "once (%d copies) — a duplicated marker in the source "
                        "expands into duplicate function definitions"
                        % (marker, t.count(sig))
                    )

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


# ---------------------------------------------------------------------------
# Service worker emission — per-site precache manifest, embedded in sw_template.js.
#
# Emitted LAST in each build (build_deploy.py / resident_section.py), after tool
# governance, so the manifest reflects the completed, published-artifact file
# tree exactly — an sw.js built from an intermediate tree would precache stale
# or now-deleted paths.
#
# Media (audio/audio_oe/media/anki dirs, and .mp4/.vtt/.m4a/.mp3/.wav anywhere)
# is deliberately excluded from BOTH the manifest and the VERSION hash: media
# changes are Range-request/streamed by the browser, never precached (see
# `isMedia()` in sw_template.js), and must not move VERSION or every media
# re-encode would force-bust every learner's cache for no reason.
#
# tool-governance.json is excluded for the same reason as sw.js/robots.txt/
# 404.html, but the failure mode is subtler: it embeds `current_revision()` =
# `git rev-parse HEAD` (validate_tool_governance.py), so its bytes change on
# EVERY commit — including docs-only ones with zero content/tool changes.
# Left in the manifest it would churn VERSION (and force-bust the whole
# precache for every learner) on every single deploy. It is already served
# `Cache-Control: public, max-age=0, must-revalidate` via `_headers`, so
# precaching it buys no offline value anyway — the browser always revalidates
# it before use.
# ---------------------------------------------------------------------------

SW_EXCLUDE_PREFIXES = ("audio/", "audio_oe/", "media/", "anki/")
SW_EXCLUDE_EXTS = (".mp4", ".vtt", ".m4a", ".mp3", ".wav")
SW_EXCLUDE_NAMES = {"sw.js", "robots.txt", "404.html", "tool-governance.json"}
SW_PRECACHE_BUDGET_BYTES = 10 * 1024 * 1024
SW_TEMPLATE_NAME = "sw_template.js"
_SW_VERSION_ANCHOR = "VERSION='__VERSION__';"
_SW_KILL_ANCHOR = "KILL=__KILL__;"
_SW_PRECACHE_PLACEHOLDER = "/*__PRECACHE_START__*/[]/*__PRECACHE_END__*/"


def _sw_assert_anchor_once(template, anchor, template_path):
    """Fail loudly if a template edit duplicates (or drops) a substitution anchor.

    A silent `.replace()` on a repeated anchor only patches the first
    occurrence, shipping an sw.js with a literal unsubstituted `__VERSION__`/
    `__KILL__`/precache-marker token baked in — worse than a build failure,
    since nothing about it looks broken until a learner's browser chokes on it.
    """
    count = template.count(anchor)
    if count != 1:
        raise AssertionError(
            "sw_template.js anchor %r must appear exactly once in %s (found %d)"
            % (anchor, template_path, count)
        )


def _sw_precache_url(rel_posix):
    """out_dir-relative posix path -> the URL sw.js should key its cache entry by."""
    return "/" if rel_posix == "index.html" else "/" + rel_posix


def _sw_is_excluded(rel_posix):
    if rel_posix in SW_EXCLUDE_NAMES:
        return True
    if any(rel_posix.startswith(prefix) for prefix in SW_EXCLUDE_PREFIXES):
        return True
    if rel_posix.lower().endswith(SW_EXCLUDE_EXTS):
        return True
    return False


def emit_service_worker(out_dir, kill=None):
    """Walk `out_dir` and write a per-site `sw.js` with an embedded precache list.

    - Precached set = every shipped file EXCEPT media (by prefix + extension,
      never precached — Range semantics belong to the network), sw.js /
      robots.txt / 404.html, and tool-governance.json (embeds the git
      revision, so it churns every commit — see module docstring).
    - `index.html` maps to `"/"` — sw.js must never precache-key `/index.html`,
      or a navigation request for `/` won't hit the cached entry offline.
    - VERSION = sha256(one `path:sha256(bytes)` line per precached file, sorted,
      newline-joined)[:12] — deterministic and media-independent, so unrelated
      media re-encodes never bump the cache version (see module docstring).
    - Budget: sum of precached byte sizes must stay <= 10 MB, else the build
      aborts via `sys.exit` with the offending size — a runaway precache list
      would make first-load worse for the offline win it's meant to buy.
    - `kill` (or env `SW_KILL=="1"`) emits `var KILL=true;`, which makes the
      installed worker skip precache/fetch interception and unregister itself
      (see sw_template.js) — the rollback switch if the offline shell misbehaves
      in production.
    """
    entries = []
    for root, _dirs, files in os.walk(out_dir):
        for fname in files:
            abs_path = os.path.join(root, fname)
            rel_posix = os.path.relpath(abs_path, out_dir).replace(os.sep, "/")
            if _sw_is_excluded(rel_posix):
                continue
            entries.append((_sw_precache_url(rel_posix), abs_path))
    entries.sort(key=lambda e: e[0])

    total_bytes = 0
    hash_lines = []
    for url, abs_path in entries:
        data = open(abs_path, "rb").read()
        total_bytes += len(data)
        hash_lines.append("%s:%s" % (url, hashlib.sha256(data).hexdigest()))

    if total_bytes > SW_PRECACHE_BUDGET_BYTES:
        sys.exit(
            "sw precache budget exceeded: %d bytes precached > %d byte budget "
            "(trim the precache list or exclude the new asset as media)"
            % (total_bytes, SW_PRECACHE_BUDGET_BYTES)
        )

    version = hashlib.sha256("\n".join(hash_lines).encode("utf-8")).hexdigest()[:12]
    kill_flag = "true" if (kill or os.environ.get("SW_KILL") == "1") else "false"

    template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), SW_TEMPLATE_NAME)
    template = open(template_path, encoding="utf-8").read()

    precache_json = json.dumps([url for url, _ in entries], ensure_ascii=False)
    # Targeted, not blind global replace: sw_template.js's own header comment
    # mentions "__VERSION__" and "__KILL__" as plain text to document the
    # template mechanism, and a bare .replace("__VERSION__", ...) would mangle
    # that comment into nonsense in the shipped artifact. Each anchor is also
    # asserted unique before substitution — see _sw_assert_anchor_once.
    for anchor in (_SW_VERSION_ANCHOR, _SW_KILL_ANCHOR, _SW_PRECACHE_PLACEHOLDER):
        _sw_assert_anchor_once(template, anchor, template_path)

    out = template.replace(_SW_VERSION_ANCHOR, "VERSION='%s';" % version)
    out = out.replace(_SW_KILL_ANCHOR, "KILL=%s;" % kill_flag)
    out = out.replace(
        _SW_PRECACHE_PLACEHOLDER,
        "/*__PRECACHE_START__*/" + precache_json + "/*__PRECACHE_END__*/",
    )

    with open(os.path.join(out_dir, "sw.js"), "w", encoding="utf-8") as fh:
        fh.write(out)
    print("service worker: emitted sw.js — VERSION %s, %d precached file(s), %d bytes" % (
        version, len(entries), total_bytes
    ))
    return version
