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
            choices = case.get("choices", []) if isinstance(case, dict) else []
            if sum(1 for ch in choices if isinstance(ch, dict) and ch.get("quality") == "best") != 1:
                print("communication_cases.json INVALID — %s must have exactly one best choice" % cid)
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

topics = [k for k in d if k != "_note"]
if errs:
    print("topic_meta.json INVALID — %d issue(s) across %d topics:" % (len(errs), len(topics)))
    for e in errs: print("  -", e)
    sys.exit(1)
print("topic_meta.json OK — %d topics, contract satisfied." % len(topics))
