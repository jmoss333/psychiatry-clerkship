#!/usr/bin/env python3
"""Validate topic_meta.json against the ReConnect topic-template contract.

Enforces the rules the renderer + rubric assume, so a shape error can't ship:
  - each topic is an object; 'read'/'tldr' are strings; 'points' is a list
  - 'ruleOut' (if present) is a non-empty list of strings
  - 'firstMove' NEVER appears without 'ruleOut'   (TOPIC_META_RUBRIC.md)
  - 'quiz' (if present) has 'q' (str), 'o' (>=2 options each with 't'),
    exactly ONE correct option (c:true), and 'why' (str)

Exits non-zero and prints every violation.
Usage:  python3 validate_topic_meta.py [path/to/topic_meta.json]
"""
import json, os, re, sys
from pathlib import Path

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "topic_meta.json")

if not os.path.exists(path):
    print("topic_meta.json not found at %s — nothing to validate (skipping)." % path)
    sys.exit(0)

d = json.load(open(path, encoding="utf-8"))
repo_root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
evidence_tools = os.path.join(repo_root, "tools", "evidence_registry")
if evidence_tools not in sys.path:
    sys.path.insert(0, evidence_tools)
from registry import index_sources, load_evidence_registry
topic_keys = {k for k in d if k != "_note"}
def require_unique(label, values):
    seen = set()
    dup = []
    for val in values:
        if val in seen:
            dup.append(val)
        seen.add(val)
    if dup:
        print("%s INVALID — duplicate id(s): %s" % (label, ", ".join(sorted(set(dup)))))
        sys.exit(1)

evidence_path = os.path.join(repo_root, "evidence_registry.json")
evidence_ids = set()
try:
    evidence_ids = set(index_sources(load_evidence_registry(Path(evidence_path))))
    if not evidence_ids:
        raise ValueError("evidence registry contains no sources")
except Exception as exc:
    print("evidence_registry.json INVALID — %s" % exc)
    sys.exit(1)
tool_registry_path = os.path.join(repo_root, "tool_registry.json")
if os.path.exists(tool_registry_path):
    try:
        tr = json.load(open(tool_registry_path, encoding="utf-8"))
        require_unique("tool_registry.json", [x.get("file") for x in tr.get("tools", []) if isinstance(x, dict) and x.get("file")])
        for tool in tr.get("tools", []):
            ids = tool.get("evidenceIds", []) if isinstance(tool, dict) else []
            for eid in ids:
                if eid not in evidence_ids:
                    print("tool_registry.json INVALID — %s references unknown evidence id %s" % (tool.get("file"), eid))
                    sys.exit(1)
    except Exception as exc:
        print("tool_registry.json INVALID — %s" % exc)
        sys.exit(1)
communication_cases_path = os.path.join(repo_root, "communication_cases.json")
communication_case_ids = set()
if os.path.exists(communication_cases_path):
    try:
        cc = json.load(open(communication_cases_path, encoding="utf-8"))
        communication_case_id_list = [x.get("id") for x in cc.get("cases", []) if isinstance(x, dict) and x.get("id")]
        require_unique("communication_cases.json", communication_case_id_list)
        communication_case_ids = set(communication_case_id_list)
        for case in cc.get("cases", []):
            cid = case.get("id")
            choice_sets = [(cid, case.get("choices", []))]
            if "secondPass" in case:
                choice_sets.append((cid + "/secondPass", case["secondPass"].get("choices", [])))
            for label, choices in choice_sets:
                require_unique("communication_cases.json " + label,
                               [ch.get("id") for ch in choices if isinstance(ch, dict)])
                if sum(1 for ch in choices if isinstance(ch, dict) and ch.get("quality") == "best") != 1:
                    print("communication_cases.json INVALID — %s must have exactly one best choice" % label)
                    sys.exit(1)
            linked_pages = case.get("linkedPages", []) if isinstance(case, dict) else []
            if not (isinstance(linked_pages, list) and all(isinstance(x, str) for x in linked_pages)):
                print("communication_cases.json INVALID — %s linkedPages must be a list of strings" % cid)
                sys.exit(1)
            for page in linked_pages:
                if page not in topic_keys:
                    print("communication_cases.json INVALID — %s references unknown linked page %s" % (cid, page))
                    sys.exit(1)
            ids = case.get("evidenceIds", []) if isinstance(case, dict) else []
            for eid in ids:
                if eid not in evidence_ids:
                    print("communication_cases.json INVALID — %s references unknown evidence id %s" % (cid, eid))
                    sys.exit(1)
    except Exception as exc:
        print("communication_cases.json INVALID — %s" % exc)
        sys.exit(1)
def validate_reasoning_cases(reasoning_cases_path):
    try:
        rc = json.load(open(reasoning_cases_path, encoding="utf-8"))
        label = os.path.basename(reasoning_cases_path)
        require_unique(label, [x.get("id") for x in rc.get("cases", []) if isinstance(x, dict) and x.get("id")])
        for case in rc.get("cases", []):
            steps = case.get("steps", []) if isinstance(case, dict) else []
            if not steps:
                print("%s INVALID — %s must have at least one step" % (label, case.get("id")))
                sys.exit(1)
            for step in steps:
                choices = step.get("choices", []) if isinstance(step, dict) else []
                if sum(1 for ch in choices if isinstance(ch, dict) and ch.get("quality") == "best") != 1:
                    print("%s INVALID — %s/%s must have exactly one best choice" % (label, case.get("id"), step.get("id")))
                    sys.exit(1)
            ids = case.get("evidenceIds", []) if isinstance(case, dict) else []
            for eid in ids:
                if eid not in evidence_ids:
                    print("%s INVALID — %s references unknown evidence id %s" % (label, case.get("id"), eid))
                    sys.exit(1)
    except Exception as exc:
        print("%s INVALID — %s" % (os.path.basename(reasoning_cases_path), exc))
        sys.exit(1)
for reasoning_cases_path in (
    os.path.join(repo_root, "reasoning_cases.json"),
    os.path.join(repo_root, "reasoning_cases_resident.json"),
):
    if os.path.exists(reasoning_cases_path):
        validate_reasoning_cases(reasoning_cases_path)
family_systems_path = os.path.join(repo_root, "family_systems_scenarios.json")
family_scenario_ids = set()
if os.path.exists(family_systems_path):
    try:
        fs = json.load(open(family_systems_path, encoding="utf-8"))
        family_scenario_id_list = [x.get("id") for x in fs.get("scenarios", []) if isinstance(x, dict) and x.get("id")]
        require_unique("family_systems_scenarios.json", family_scenario_id_list)
        family_scenario_ids = set(family_scenario_id_list)
        required_sections = ("prepare", "ask", "say", "avoid", "handoff", "safety")
        for scenario in fs.get("scenarios", []):
            sid = scenario.get("id")
            sections = scenario.get("sections", {}) if isinstance(scenario, dict) else {}
            if not isinstance(sections, dict):
                print("family_systems_scenarios.json INVALID — %s sections must be an object" % sid)
                sys.exit(1)
            for section in required_sections:
                val = sections.get(section)
                if not (isinstance(val, list) and val and all(isinstance(x, str) for x in val)):
                    print("family_systems_scenarios.json INVALID — %s sections.%s must be a non-empty list of strings" % (sid, section))
                    sys.exit(1)
            checks = scenario.get("checks", []) if isinstance(scenario, dict) else []
            if not (isinstance(checks, list) and checks):
                print("family_systems_scenarios.json INVALID — %s must have checklist items" % sid)
                sys.exit(1)
            require_unique("family_systems_scenarios.json %s checks" % sid, [x.get("id") for x in checks if isinstance(x, dict) and x.get("id")])
            for check in checks:
                if not isinstance(check, dict) or not isinstance(check.get("id"), str) or not isinstance(check.get("label"), str):
                    print("family_systems_scenarios.json INVALID — %s checks must have string id and label" % sid)
                    sys.exit(1)
            linked_pages = scenario.get("linkedPages", []) if isinstance(scenario, dict) else []
            if not (isinstance(linked_pages, list) and all(isinstance(x, str) for x in linked_pages)):
                print("family_systems_scenarios.json INVALID — %s linkedPages must be a list of strings" % sid)
                sys.exit(1)
            for page in linked_pages:
                if page not in topic_keys:
                    print("family_systems_scenarios.json INVALID — %s references unknown linked page %s" % (sid, page))
                    sys.exit(1)
            linked_cases = scenario.get("communicationCases", []) if isinstance(scenario, dict) else []
            if not (isinstance(linked_cases, list) and all(isinstance(x, str) for x in linked_cases)):
                print("family_systems_scenarios.json INVALID — %s communicationCases must be a list of strings" % sid)
                sys.exit(1)
            for cid in linked_cases:
                if communication_case_ids and cid not in communication_case_ids:
                    print("family_systems_scenarios.json INVALID — %s references unknown communication case %s" % (sid, cid))
                    sys.exit(1)
            ids = scenario.get("evidenceIds", []) if isinstance(scenario, dict) else []
            for eid in ids:
                if eid not in evidence_ids:
                    print("family_systems_scenarios.json INVALID — %s references unknown evidence id %s" % (sid, eid))
                    sys.exit(1)
    except Exception as exc:
        print("family_systems_scenarios.json INVALID — %s" % exc)
        sys.exit(1)
errs = []
def bad(k, msg): errs.append("%s: %s" % (k, msg))

# safetyTree (2026-10-10 safety-drawer spec §4.3): the branching view of a safety-kit protocol.
# It carries the page's attestation like safetySteps, so its shape is checked here, where a bad
# tree fails the build before it reaches the one surface that must be right under pressure.
# Rules that need curriculum.json (kit membership, `see` targets) live in validate_curriculum.py.
TREE_ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,23}$")
TREE_BLANK_RE = re.compile(r"\[[^\[\]]{1,80}\]")
# Mirrors DOSE_RE in .claude/hooks/clerkship_guards.py (itself mirroring check-static-site.mjs).
TREE_DOSE_RE = re.compile(r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg/kg)\b", re.I)
# Three or more digits in a row covers every crisis line and phone number. Crisis contacts live
# in crisis_resources.json only; a tree states none.
TREE_DIGITS_RE = re.compile(r"\d{3,}")
# validate_curriculum.py's ROLE_AUDIENCE_TOKEN_RE with word boundaries: the bare form fires on
# "unexplained" and "autoimmune" (UNE), and a tree is clinical prose where both can occur.
TREE_AUDIENCE_RE = re.compile(r"\b(?:MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford)\b", re.I)
TREE_SCRIPT_KEYS = ("label", "identify", "situation", "background", "assessment",
                    "recommendation", "readBack")
TREE_MAX_QUESTIONS = 5
TREE_CAPS = {"ask": 140, "hint": 160, "label": 60, "title": 80, "act": 160,
             "script": 240, "scriptLabel": 60}
TREE_QUESTION_KEYS = {"id", "ask", "hint", "options"}
TREE_ACTION_KEYS = {"id", "title", "tone", "act", "escalate", "see"}


def tree_text_problems(text, cap, allow_blanks):
    """Problems with one tree string, as message fragments; empty when it is fine."""
    if not isinstance(text, str) or not text.strip():
        return ["must be a non-empty string"]
    out = []
    if len(text) > cap:
        out.append("is %d characters (max %d)" % (len(text), cap))
    if TREE_DOSE_RE.search(text):
        out.append("contains a dose literal")
    if TREE_DIGITS_RE.search(text):
        out.append("contains a run of 3+ digits (crisis contacts live in crisis_resources.json)")
    if TREE_AUDIENCE_RE.search(text):
        out.append("contains an audience-specific token")
    rest = TREE_BLANK_RE.sub("", text) if allow_blanks else text
    if "[" in rest or "]" in rest:
        out.append("has a bracket outside a [blank]" if allow_blanks
                   else "has a [blank]; blanks belong in scripts only")
    return out


def check_safety_tree(k, v):
    tree = v.get("safetyTree")
    if not isinstance(tree, dict):
        bad(k, "'safetyTree' must be an object")
        return
    if "safetySteps" not in v:
        bad(k, "'safetyTree' requires 'safetySteps' and 'safetyDoc' (the checklist is its fallback)")
    extra = set(tree) - {"start", "nodes", "scripts"}
    if extra:
        bad(k, "safetyTree has unknown key(s): %s" % ", ".join(sorted(extra)))
    scripts = tree.get("scripts")
    if not isinstance(scripts, dict) or "now" not in scripts:
        bad(k, "safetyTree.scripts must be an object with a 'now' script")
        scripts = scripts if isinstance(scripts, dict) else {}
    for key in sorted(scripts):
        script, label = scripts[key], "safetyTree.scripts.%s" % key
        if key not in ("now", "soon"):
            bad(k, "%s: script keys are 'now' and 'soon' only" % label)
            continue
        if not isinstance(script, dict) or set(script) != set(TREE_SCRIPT_KEYS):
            bad(k, "%s must have exactly the keys %s" % (label, ", ".join(TREE_SCRIPT_KEYS)))
            continue
        for part in TREE_SCRIPT_KEYS:
            cap = TREE_CAPS["scriptLabel"] if part == "label" else TREE_CAPS["script"]
            for problem in tree_text_problems(script[part], cap, part != "label"):
                bad(k, "%s.%s %s" % (label, part, problem))
    nodes = tree.get("nodes")
    if not isinstance(nodes, list) or len(nodes) < 2:
        bad(k, "safetyTree.nodes must be a list of at least 2 nodes")
        return
    by_id = {}
    for i, node in enumerate(nodes):
        nid = node.get("id") if isinstance(node, dict) else None
        if not isinstance(nid, str) or not TREE_ID_RE.match(nid):
            bad(k, "safetyTree.nodes[%d] needs an id matching %s" % (i, TREE_ID_RE.pattern))
        elif nid in by_id:
            bad(k, "safetyTree: duplicate node id %r" % nid)
        else:
            by_id[nid] = node
    for nid, node in by_id.items():
        label, keys = "safetyTree node %r" % nid, set(node)
        if "ask" in node:
            if keys - TREE_QUESTION_KEYS:
                bad(k, "%s mixes question and action keys: %s"
                    % (label, ", ".join(sorted(keys - TREE_QUESTION_KEYS))))
                continue
            for problem in tree_text_problems(node["ask"], TREE_CAPS["ask"], False):
                bad(k, "%s ask %s" % (label, problem))
            if "hint" in node:
                for problem in tree_text_problems(node["hint"], TREE_CAPS["hint"], False):
                    bad(k, "%s hint %s" % (label, problem))
            options = node.get("options")
            if not isinstance(options, list) or not 2 <= len(options) <= 4:
                bad(k, "%s needs 2-4 options" % label)
                continue
            for j, opt in enumerate(options):
                if not isinstance(opt, dict) or set(opt) != {"label", "next"}:
                    bad(k, "%s option %d must be {label, next}" % (label, j))
                    continue
                for problem in tree_text_problems(opt["label"], TREE_CAPS["label"], False):
                    bad(k, "%s option %d label %s" % (label, j, problem))
                if opt["next"] not in by_id:
                    bad(k, "%s option %d points at unknown node %r" % (label, j, opt["next"]))
            continue
        if keys - TREE_ACTION_KEYS or not {"title", "tone", "act", "escalate"} <= keys:
            bad(k, "%s must be a question {ask, options} or an action {title, tone, act, escalate}"
                % label)
            continue
        for problem in tree_text_problems(node["title"], TREE_CAPS["title"], False):
            bad(k, "%s title %s" % (label, problem))
        if node["tone"] not in ("danger", "first"):
            bad(k, "%s tone must be 'danger' or 'first'" % label)
        acts = node["act"]
        if not isinstance(acts, list) or not 1 <= len(acts) <= 4:
            bad(k, "%s needs 1-4 actions" % label)
        else:
            for j, act in enumerate(acts):
                for problem in tree_text_problems(act, TREE_CAPS["act"], False):
                    bad(k, "%s act %d %s" % (label, j, problem))
        if node["escalate"] not in scripts:
            bad(k, "%s escalates to missing script %r" % (label, node["escalate"]))
        if "see" in node:
            see = node["see"]
            if (not isinstance(see, list) or not 1 <= len(see) <= 2
                    or not all(isinstance(s, str) and s for s in see)):
                bad(k, "%s see must list 1-2 page refs" % label)
            elif k in see:
                bad(k, "%s see must not name its own page" % label)
    start = tree.get("start")
    if start not in by_id:
        bad(k, "safetyTree.start %r names no node" % (start,))
        return
    # Walk every path from start: no cycle, no unreachable node, no path past the budget.
    reached, found = set(), set()

    def walk(nid, asked, on_path):
        reached.add(nid)
        node = by_id[nid]
        if "ask" not in node:
            return
        if nid in on_path:
            found.add("safetyTree has a cycle through node %r" % nid)
            return
        if asked >= TREE_MAX_QUESTIONS:
            found.add("safetyTree: a path from start asks more than %d questions"
                      % TREE_MAX_QUESTIONS)
            return
        options = node.get("options")
        for opt in options if isinstance(options, list) else []:
            if isinstance(opt, dict) and opt.get("next") in by_id:
                walk(opt["next"], asked + 1, on_path | {nid})

    walk(start, 0, frozenset())
    for message in sorted(found):
        bad(k, message)
    for nid in sorted(set(by_id) - reached):
        bad(k, "safetyTree node %r is unreachable from start" % nid)

def hrefs_from_cta(cta):
    if isinstance(cta, dict):
        href = cta.get("href")
        return [href] if isinstance(href, str) else []
    if isinstance(cta, list):
        hrefs = []
        for item in cta:
            if isinstance(item, dict) and isinstance(item.get("href"), str):
                hrefs.append(item["href"])
        return hrefs
    return []

def validate_practice_href(topic, href):
    if not isinstance(href, str):
        return
    for sid in re.findall(r"[?&]tool=family-systems\.html&scenario=([a-z0-9_]+)", href):
        if family_scenario_ids and sid not in family_scenario_ids:
            bad(topic, "href references unknown family scenario '%s'" % sid)
    for cid in re.findall(r"[?&]tool=communication-practice\.html&case=([a-z0-9_]+)", href):
        if communication_case_ids and cid not in communication_case_ids:
            bad(topic, "href references unknown communication case '%s'" % cid)

for k, v in d.items():
    if k == "_note":
        continue
    if not isinstance(v, dict):
        bad(k, "not an object"); continue
    if "read" in v and not isinstance(v["read"], (int, str)): bad(k, "'read' must be an integer (minutes) or string")
    if not isinstance(v.get("tldr", ""), str): bad(k, "'tldr' must be a string")
    if "points" in v and not isinstance(v["points"], list): bad(k, "'points' must be a list")
    if "ruleOut" in v:
        ro = v["ruleOut"]
        if not (isinstance(ro, list) and ro and all(isinstance(x, str) for x in ro)):
            bad(k, "'ruleOut' must be a non-empty list of strings")
    if "firstMove" in v and "ruleOut" not in v:
        bad(k, "'firstMove' without 'ruleOut' (rubric: never emit firstMove alone)")
    if "quiz" in v:
        q = v["quiz"]
        if not isinstance(q, dict):
            bad(k, "'quiz' must be an object")
        else:
            if not isinstance(q.get("q", ""), str) or not q.get("q"): bad(k, "quiz missing 'q'")
            o = q.get("o")
            if not (isinstance(o, list) and len(o) >= 2):
                bad(k, "quiz needs >=2 options in 'o'")
            else:
                nc = sum(1 for x in o if isinstance(x, dict) and x.get("c") is True)
                if nc != 1: bad(k, "quiz must have exactly one correct option (found %d)" % nc)
                if any(not isinstance(x, dict) or not x.get("t") for x in o):
                    bad(k, "a quiz option is missing 't'")
            if not isinstance(q.get("why", ""), str) or not q.get("why"): bad(k, "quiz missing 'why'")
    for name in ("evidenceIds", "relatedTools", "workflowModes", "workflowStages", "communicationCases"):
        if name in v and not (isinstance(v[name], list) and all(isinstance(x, str) for x in v[name])):
            bad(k, "'%s' must be a list of strings" % name)
    # curriculum crosswalk (see CROSSWALK_TAXONOMY.md): controlled-vocab lists
    SHELF_VOCAB = {"mood", "psychosis", "anxiety", "substance", "neurocog", "pharm",
                   "safety", "personality", "childdev", "otherdx", "ethics", "relational"}
    EPA_VOCAB = {"EPA%d" % i for i in range(1, 14)}
    if "shelfBlueprint" in v:
        sb = v["shelfBlueprint"]
        if not (isinstance(sb, list) and sb and all(isinstance(x, str) for x in sb)):
            bad(k, "'shelfBlueprint' must be a non-empty list of strings")
        else:
            for c in sb:
                if c not in SHELF_VOCAB: bad(k, "'shelfBlueprint' has unknown code '%s'" % c)
    if "epa" in v:
        ep = v["epa"]
        if not (isinstance(ep, list) and ep and all(isinstance(x, str) for x in ep)):
            bad(k, "'epa' must be a non-empty list of strings")
        else:
            for c in ep:
                if c not in EPA_VOCAB: bad(k, "'epa' has unknown code '%s'" % c)
    for cid in v.get("communicationCases", []) if isinstance(v.get("communicationCases"), list) else []:
        if communication_case_ids and cid not in communication_case_ids:
            bad(k, "communicationCases references unknown case '%s'" % cid)
    allowed_stages = {"encounter", "diagnosis", "safety", "treatment", "communication", "family", "team", "exam"}
    for stage in v.get("workflowStages", []) if isinstance(v.get("workflowStages"), list) else []:
        if stage not in allowed_stages:
            bad(k, "workflowStages contains unknown stage '%s'" % stage)
    if "clinicalWorkflow" in v:
        cw = v["clinicalWorkflow"]
        allowed_cw = {"ask", "mse", "safety", "say", "collateral", "rounds", "exam", "actions"}
        if not isinstance(cw, dict):
            bad(k, "'clinicalWorkflow' must be an object")
        else:
            for ck, cv in cw.items():
                if ck not in allowed_cw:
                    bad(k, "clinicalWorkflow contains unknown key '%s'" % ck)
                elif ck == "actions":
                    if not isinstance(cv, list):
                        bad(k, "clinicalWorkflow.actions must be a list")
                    else:
                        for idx, action in enumerate(cv):
                            if not isinstance(action, dict) or not isinstance(action.get("label"), str) or not isinstance(action.get("href"), str):
                                bad(k, "clinicalWorkflow.actions[%d] must have string label and href" % idx)
                            elif isinstance(action.get("href"), str):
                                validate_practice_href(k, action["href"])
                elif not isinstance(cv, str):
                    bad(k, "clinicalWorkflow.%s must be a string" % ck)
    for href in hrefs_from_cta(v.get("cta")):
        validate_practice_href(k, href)
    if "familyOverlay" in v and not isinstance(v["familyOverlay"], str):
        bad(k, "'familyOverlay' must be a string")
    if isinstance(v.get("familyOverlay"), str):
        if "family-systems.html" not in (v.get("relatedTools") or []):
            bad(k, "familyOverlay pages must include family-systems.html in relatedTools")
    if "safetyLevel" in v and v["safetyLevel"] not in ("low", "moderate", "high"):
        bad(k, "'safetyLevel' must be one of low, moderate, high")
    if "facultyReview" in v:
        fr = v["facultyReview"]
        if not isinstance(fr, dict):
            bad(k, "'facultyReview' must be an object")
        elif fr.get("status") not in ("draft", "pending", "reviewed", "retired"):
            bad(k, "'facultyReview.status' must be draft, pending, reviewed, or retired")
    for eid in v.get("evidenceIds", []) if isinstance(v.get("evidenceIds"), list) else []:
        if eid not in evidence_ids:
            bad(k, "evidenceIds references unknown source '%s'" % eid)
    if v.get("safetyLevel") == "high":
        if not v.get("evidenceIds"):
            bad(k, "high-risk page requires non-empty evidenceIds")
        fr = v.get("facultyReview")
        if not isinstance(fr, dict) or not fr.get("status") or not fr.get("lastReviewed"):
            bad(k, "high-risk page requires facultyReview.status and facultyReview.lastReviewed")
    # safetySteps: the ordered ACTIONS a protocol sheet walks (distinct from 'points',
    # which are facts). Lives here rather than in curriculum.json so protocol content
    # inherits faculty attestation and this contract — the safety kit is the one surface
    # whose whole purpose is being correct at 2am.
    if "safetySteps" in v:
        ss = v["safetySteps"]
        if not isinstance(ss, list) or not (3 <= len(ss) <= 5):
            bad(k, "'safetySteps' must be a list of 3-5 steps")
        elif any(not isinstance(s, str) or not s.strip() for s in ss):
            bad(k, "'safetySteps' entries must be non-empty strings")
        if not isinstance(v.get("safetyDoc"), str) or not v.get("safetyDoc", "").strip():
            bad(k, "'safetySteps' requires a non-empty 'safetyDoc' documentation line")
    if "safetyTree" in v:
        check_safety_tree(k, v)

topics = [k for k in d if k != "_note"]
if errs:
    print("topic_meta.json INVALID — %d issue(s) across %d topics:" % (len(errs), len(topics)))
    for e in errs: print("  -", e)
    sys.exit(1)
print("topic_meta.json OK — %d topics, contract satisfied." % len(topics))
