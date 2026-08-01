import os, shutil, json, sys
from pathlib import Path
# Session-portable paths (fixed 2026-07-01): derive from this script's own location instead of a
# hard-coded sandbox mount, so the build runs under any Cowork session or the real filesystem.
HERE=os.path.dirname(os.path.abspath(__file__))
LIB=os.path.abspath(os.path.join(HERE,"..","..",".."))   # .../Psychiatry-Clerkship-Library
ROOT=os.path.dirname(LIB)                                 # parent dir that holds the deploy repos
OUT=os.environ.get("OUT_DIR", os.path.join(ROOT,"clerkship-hub-deploy"))
SPA=os.path.join(HERE,"spa_index.html")                   # SPA shell (co-located with this script)
MARKED=os.path.join(HERE,"marked.min.js")                 # vendored marked (co-located)
MANIFEST=os.path.join(HERE,"site_manifest.json")          # content/tool build manifest
CLINICAL_CSS=os.path.join(HERE,"clinical-warm.css")       # shared dark-mode tokens

def _relpath(p):
    for base in (LIB,HERE):
        try:
            r=os.path.relpath(p,base)
            if not r.startswith(".."): return r
        except ValueError:
            pass
    return p

def _abort_missing(missing):
    if not missing: return
    print("BUILD ABORTED — %d required source asset(s) missing:" % len(missing))
    for p in missing: print("   -", _relpath(p))
    raise SystemExit(1)

def _copy_required(src,dst,missing):
    if os.path.exists(src):
        shutil.copy2(src,dst)
    else:
        missing.append(src)

_bootstrap_missing=[p for p in [MANIFEST,SPA,MARKED,CLINICAL_CSS] if not os.path.exists(p)]
_abort_missing(_bootstrap_missing)
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT+"/content"); os.makedirs(OUT+"/tools")

# Source→slug map: data-driven since 2026-07-05 (was ~73 literal tuples inline).
# site_manifest.json (co-located) is the single source of truth for what ships;
# the QA gate's orphaned-source check audits the NN_Category/ tree against it.
# New content pages: register in site_manifest.json AND in nav[] below to ship.
_manifest=json.load(open(MANIFEST,encoding="utf-8"))
tools=[tuple(x) for x in _manifest["tools"]]
tool_assets=[tuple(x) for x in _manifest.get("toolAssets",[])]
# Hidden from the sidebar list + search per Dr. Moss's request (2026-07-06) — superseded by the
# question bank practice tool. Files still ship (still in `tools` above) and stay fully reachable
# by direct link / the home "Start review" card / per-page tool docks (all look items up by
# filename, not by sidebar visibility) — see the `hidden` flag on the nav item below.
HIDDEN_TOOLS={"shelf-mode.html","review.html"}

# ---- pre-flight: verify every REQUIRED source asset exists BEFORE we build ----
# (added 2026-07-03) A renamed/missing required source used to throw FileNotFoundError
# mid-build and fail the Netlify deploy for BOTH sites with a bare traceback. Fail fast
# here with the COMPLETE list of missing assets so the fix is obvious.
_required=[os.path.join(LIB,src) for src,_,_ in tools]+[
    os.path.join(LIB,src) for src,_ in tool_assets
]+[
    LIB+"/07_Evidence_and_Reading/Landmark_Trials/quizzes.json",
    LIB+"/01_Six_Week_Curriculum/learning-path.html",
    LIB+"/question_bank.json",
]+[os.path.join(LIB,"_prototypes","agitation-trainer","vendor",f) for f in ["react.min.js","react-dom.min.js"]]
_abort_missing([p for p in _required if not os.path.exists(p)])

_missing_req=[]
for src,dst,_ in tools:
    _copy_required(os.path.join(LIB,src), OUT+"/tools/"+dst, _missing_req)
for src,dst in tool_assets:
    _copy_required(os.path.join(LIB,src), OUT+"/tools/"+dst, _missing_req)
_abort_missing(_missing_req)

# ---- orientation video (MS3 "start here") ----
ORIENT_VIDEO=[
 ("_prototypes/orientation-video/orientation-video.html","orientation-video.html"),
 ("_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4","Inpatient_Psych_Orientation.mp4"),
 ("_prototypes/orientation-video/Inpatient_Psych_Orientation.vtt","Inpatient_Psych_Orientation.vtt"),
 ("_prototypes/orientation-video/poster.jpg","poster.jpg"),
]
for src,dst in ORIENT_VIDEO:
    p=os.path.join(LIB,src)
    if os.path.exists(p):
        out_p=OUT+"/tools/"+dst
        shutil.copy2(p, out_p)
        os.chmod(out_p, 0o644)   # source MP4 arrives with mode 400 (LFS/download artifact); world-readable required
    else: print("  WARN: orientation video asset missing from source:",src)

# ---- video library (intro trailer, day-in-the-life, week stingers, tool spotlights) ----
# Design source: Clerkship_video_handoff package (2026-07-02/03). Each .mp4 is exported by hand
# from the design tool (Cowork can't click "Export"); until a file lands in _prototypes/video-library/,
# its entry below is a silent no-op and the page embed referencing it just won't play yet.
# See _prototypes/video-library/README.md for the exact export filenames + placement map.
VIDEO_MEDIA=[
 "intro-trailer.mp4","intro-trailer-poster.jpg","day-in-the-life.mp4",
 "week-intro-1.mp4","week-intro-2.mp4","week-intro-3.mp4","week-intro-4.mp4","week-intro-5.mp4","week-intro-6.mp4",
 "tool-spotlight-interview-circle.mp4","tool-spotlight-capacity.mp4","tool-spotlight-violence.mp4",
 "tool-spotlight-withdrawal.mp4","tool-spotlight-bfcrs.mp4","tool-spotlight-decision-aids.mp4",
 "tool-spotlight-reel.mp4","week-stingers-reel.mp4",
]
_vidsrc=LIB+"/_prototypes/video-library"
_vidfound=0
if os.path.isdir(_vidsrc):
    os.makedirs(OUT+"/media",exist_ok=True)
    for _vf in VIDEO_MEDIA:
        _p=os.path.join(_vidsrc,_vf)
        if os.path.exists(_p): shutil.copy2(_p, OUT+"/media/"+_vf); _vidfound+=1
print("video library:",_vidfound,"of",len(VIDEO_MEDIA),"assets found in _prototypes/video-library/")

_missing_req=[]
_copy_required(LIB+"/07_Evidence_and_Reading/Landmark_Trials/quizzes.json", OUT+"/tools/quizzes.json", _missing_req)
_abort_missing(_missing_req)
_aud=LIB+"/07_Evidence_and_Reading/Landmark_Trials/audio"
if os.path.isdir(_aud): shutil.copytree(_aud, OUT+"/audio")

# ---- OE NotebookLM brief audio: copy + deck-align into quizzes.json (exact-title join) ----
import csv as _csv, re as _re2
_oedir=LIB+"/13_Faculty_Resources/Handoffs/openevidence_notebooklm_brief_audio_2026-06-30"
if os.path.isdir(_oedir) and os.path.exists(_oedir+"/MANIFEST.csv"):
    os.makedirs(OUT+"/audio_oe", exist_ok=True)
    _oemap={}
    for _r in _csv.DictReader(open(_oedir+"/MANIFEST.csv",encoding="utf-8")):
        _fn=_r["filename"]; _src=os.path.join(_oedir,_fn)
        if os.path.exists(_src):
            shutil.copy2(_src, OUT+"/audio_oe/"+_fn)
            _key=_re2.sub(r'[^a-z0-9]+',' ',_r["source_title"].lower()).strip()
            # audio_card_title is faculty-side NotebookLM promo copy (MANIFEST.csv) — NOT
            # attested clinical content. C1 fix: do not surface it to learners (see
            # media_manifest.json for the corrected accessibility note).
            _oemap[_key]={"audio":_fn,"audioDur":_r["duration"],"oe":_r["number"]}
    _qp=OUT+"/tools/quizzes.json"; _q=json.load(open(_qp,encoding="utf-8")); _na=0
    for _d in _q.get("decks",[]):
        _k=_re2.sub(r'[^a-z0-9]+',' ',(_d.get("title","")).lower()).strip()
        if _k in _oemap:
            _d["audio"]=_oemap[_k]["audio"]; _d["audioDur"]=_oemap[_k]["audioDur"]; _d["oe"]=_oemap[_k]["oe"]
            _na+=1
    json.dump(_q, open(_qp,"w",encoding="utf-8"))
    print("OE audio: copied",len(_oemap),"files | deck-aligned",_na,"quiz decks")
_rv=LIB+"/13_Faculty_Resources/reviewed.json"
shutil.copy2(_rv, OUT+"/reviewed.json") if os.path.exists(_rv) else open(OUT+"/reviewed.json","w").write("{}")
_tm=LIB+"/topic_meta.json"
shutil.copy2(_tm, OUT+"/topic_meta.json") if os.path.exists(_tm) else open(OUT+"/topic_meta.json","w").write("{}")
_evidence_tools=os.path.join(LIB,"tools","evidence_registry")
if _evidence_tools not in sys.path:
    sys.path.insert(0,_evidence_tools)
from registry import build_public_projection, load_evidence_registry
_canonical_evidence=load_evidence_registry(Path(LIB)/"evidence_registry.json")
with open(os.path.join(OUT,"evidence_registry.json"),"w",encoding="utf-8") as _fh:
    json.dump(build_public_projection(_canonical_evidence),_fh,indent=2,sort_keys=True)
    _fh.write("\n")
for _jn, _fallback in [
    ("tool_registry.json", '{"tools":[]}'),
    ("communication_cases.json", '{"cases":[]}'),
    ("reasoning_cases.json", '{"cases":[]}'),
    ("family_systems_scenarios.json", '{"scenarios":[]}'),
    ("longitudinal_case.json", '{"weeks":[]}')
]:
    _jp=os.path.join(LIB,_jn)
    if os.path.exists(_jp): shutil.copy2(_jp, OUT+"/"+_jn)
    else: open(OUT+"/"+_jn,"w",encoding="utf-8").write(_fallback)
# question_bank.json: served at site root so both qbank-attest.html and question-bank-practice.html can fetch ../question_bank.json
_missing_req=[]
_copy_required(LIB+"/question_bank.json", OUT+"/question_bank.json", _missing_req)
_copy_required(LIB+"/01_Six_Week_Curriculum/learning-path.html", OUT+"/tools/learning-path.html", _missing_req)
_abort_missing(_missing_req)

# ---- diagnostic pretest pool (adaptive engine v2): 1 attested, scoreable item per
# blueprint category. Slim pool so the SPA home never loads the full bank. Selection:
# prefer difficulty-2, then high-yield, then lowest id (deterministic). ----
_PRETEST_CATS=["mood","psychosis","anxiety","substance","neurocog","pharm",
               "safety","personality","childdev","otherdx","ethics","relational"]
try:
    _qb=json.load(open(LIB+"/question_bank.json",encoding="utf-8"))
    def _one_correct(it): return sum(1 for o in it.get("options",[]) if o.get("c") is True)==1
    _pool=[]
    for _cat in _PRETEST_CATS:
        _cand=[i for i in _qb.get("items",[]) if i.get("category")==_cat
               and i.get("status")=="attested" and _one_correct(i)]
        if not _cand: continue
        _cand.sort(key=lambda i:(abs((i.get("difficulty") or 2)-2), 0 if i.get("hy") else 1, i.get("id","")))
        _it=_cand[0]
        _pool.append({"id":_it["id"],"cat":_cat,"pages":_it.get("pages",[]),
            "stem":_it.get("stem",""),
            "options":[{"key":o.get("key"),"t":o.get("t",""),"c":bool(o.get("c"))}
                       for o in _it.get("options",[])],
            "why":_it.get("why",""),"pearl":_it.get("pearl","")})
    json.dump({"v":1,"generated":"build","items":_pool},
              open(OUT+"/pretest_pool.json","w",encoding="utf-8"))
    print("pretest pool:",len(_pool),"of",len(_PRETEST_CATS),"categories")
except Exception as _e:
    open(OUT+"/pretest_pool.json","w",encoding="utf-8").write('{"v":1,"items":[]}')
    print("pretest pool: WARN could not build (%s)" % _e)

# ---- local tool runtime vendor: no bedside CDN dependency ----
# Several React-based tools historically loaded React from cdnjs and went blank when ward
# Wi-Fi blocked public CDNs. Reuse the already-tracked UMD bundles from the resident
# prototype and rewrite shipped tool pages to relative files under /tools/vendor/.
VENDOR_SRC=os.path.join(LIB,"_prototypes","agitation-trainer","vendor")
VENDOR_DST=os.path.join(OUT,"tools","vendor")
_vendor_files=["react.min.js","react-dom.min.js"]
os.makedirs(VENDOR_DST,exist_ok=True)
_missing_req=[]
for _vf in _vendor_files:
    _copy_required(os.path.join(VENDOR_SRC,_vf), os.path.join(VENDOR_DST,_vf), _missing_req)
_abort_missing(_missing_req)

def _rewrite_tool_vendor_deps(_path):
    _t=open(_path,encoding="utf-8").read()
    _o=_t
    _t=_t.replace("https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js","vendor/react.min.js")
    _t=_t.replace("https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js","vendor/react-dom.min.js")
    if _t!=_o:
        open(_path,"w",encoding="utf-8").write(_t)

for _tool_html in [os.path.join(OUT,"tools",_f) for _f in os.listdir(os.path.join(OUT,"tools")) if _f.endswith(".html")]:
    _rewrite_tool_vendor_deps(_tool_html)

# ---- CRISIS-CONTACT BLOCK -------------------------------------------------------------
# 988 and the other crisis contacts live in ONE place: crisis_resources.json (derived from
# the ReConnect Psychiatry System crisis dataset, independently re-verified against official
# sources). crisis_block.py renders it; pages opt in with a marker comment. No crisis number
# is ever hand-maintained in a content page or tool.
# Required targets are asserted below — a safety surface can never silently lose the block.
sys.path.insert(0,HERE)
import crisis_block as _crisis
_crisis_data=_crisis.load(LIB)
# Required surfaces = where a learner is plausibly DOING risk work (assessing, rehearsing, or
# planning disposition around self-harm/violence), not merely reading about it. Reference and
# reading pages are deliberately excluded so the block stays meaningful rather than wallpaper.
_CRISIS_REQUIRED_TOOLS={
    "cssrs.html","sp-interview.html","communication-practice.html",
    "family-systems.html","one-patient-six-weeks.html",
}
_CRISIS_REQUIRED_MD={
    # direct risk assessment & acute safety
    "suicide.md","pg_suicide.md","violence.md","agitation.md","ethics_legal.md",
    # populations where self-harm risk is core to the page's own teaching
    "t_mood.md","t_personality.md","t_psychosis.md","t_sud.md","t_geri.md",
    "t_eating.md","t_dissociative.md","t_adjustment.md","t_perinatal.md",
    # bedside work & disposition — the peri-discharge transition is the highest-risk window
    "brief_psychotherapy.md","exp_family.md","family_playbook.md","collateral_workflow.md",
}
_crisis_tools_done=set()
for _tool_html in [os.path.join(OUT,"tools",_f) for _f in os.listdir(os.path.join(OUT,"tools")) if _f.endswith(".html")]:
    _t=open(_tool_html,encoding="utf-8").read()
    _t,_did=_crisis.inject_html(_t,_crisis_data)
    if _did:
        open(_tool_html,"w",encoding="utf-8").write(_t)
        _crisis_tools_done.add(os.path.basename(_tool_html))

# md content pages: [source rel, out name, title] — see site_manifest.json
md=[tuple(x) for x in _manifest["md"]]
# ---- Case of the Week: per-week pages are registry-driven (single source of truth:
# 08_Cases_and_Simulation/case-of-the-week/cotw_registry.json). The weekly automation only
# prepends one entry there + drops two source files — no edits to this script or the manifest.
_COTW_DIR="08_Cases_and_Simulation/case-of-the-week"
_cotw_weeks=json.load(open(os.path.join(LIB,_COTW_DIR,"cotw_registry.json"),encoding="utf-8")).get("weeks",[])
def _cotw_slug(w,level):  # level: "ms3" | "res"
    return "cotw_%s_%s_%s.md"%(w["date"].replace("-",""),w["topic"],level)
md+=[(os.path.join(_COTW_DIR,w["ms3_src"]),_cotw_slug(w,"ms3"),w["label"]) for w in _cotw_weeks]
missing=[]
_crisis_md_done=set()
for src,dst,_ in md:
    p=os.path.join(LIB,src)
    if os.path.exists(p):
        shutil.copy2(p, OUT+"/content/"+dst)
        _t=open(p,encoding="utf-8").read()
        _t,_did=_crisis.inject_markdown(_t,_crisis_data)
        if _did:
            open(OUT+"/content/"+dst,"w",encoding="utf-8").write(_t)
            _crisis_md_done.add(dst)
    else: missing.append(src)

# Fail the build if a required safety surface lost its crisis block (marker deleted, page
# renamed, or dropped from the manifest). Silent loss of 988 is the failure this prevents.
_crisis_gap=sorted((_CRISIS_REQUIRED_MD-_crisis_md_done)|(_CRISIS_REQUIRED_TOOLS-_crisis_tools_done))
if _crisis_gap:
    print("BUILD ABORTED — crisis-contact block missing from required safety surface(s):")
    for _g in _crisis_gap: print("   -",_g,"(expected the crisis-block marker in its source)")
    raise SystemExit(1)
print("crisis block injected:",len(_crisis_md_done),"content page(s) +",len(_crisis_tools_done),"tool(s)")

# ---- QA-gate source map: every source path this build knows about, written NEXT TO the
# build dir (<OUT>.source-map.json), never inside it — nothing ships. check-static-site.mjs
# reads it to hard-fail any content-convention markdown in the source tree that the build
# ignores (the "10 pages dropped at git cutover" failure class).
_srcmap=sorted({s for s,_,_ in tools}|{s for s,_ in tool_assets}|{s for s,_,_ in md})
open(OUT.rstrip("/\\")+".source-map.json","w",encoding="utf-8").write(json.dumps({"sources":_srcmap}))

_tool_titles={d:n for _,d,n in tools}
def _md(t,f,hidden=False):
    return dict({"t":t,"f":f,"k":"md"},**({"hidden":True} if hidden else {}))
def _tool(f,t=None,hidden=None):
    return dict({"t":t or _tool_titles.get(f,f),"f":f,"k":"tool"},**({"hidden":True} if (hidden if hidden is not None else f in HIDDEN_TOOLS) else {}))
_week_items=[_md(t,f,True) for f,t in [("week%d.md"%i,["Week 1 — Foundations","Week 2 — Mood/Psychosis/Pharm","Week 3 — Psychotherapy/Personality","Week 4 — Family/Systems/EE","Week 5 — Acute/Emergency","Week 6 — Integration/Exam"][i-1]) for i in range(1,7)]]
nav=[
 {"section":"Welcome and Orientation","pinned":True,"items":[_md("Welcome to the Rotation","welcome.md"),_md("Orientation Packet","orientation.md"),_md("Core Reading List","core_readings.md"),_tool("learning-path.html","Learning Path",True),_tool("orientation-video.html","Orientation Video",True)]+_week_items},
 {"section":"Start the Encounter","items":[_md("Interview & MSE","pg_interview.md"),_tool("mse.html","Mental Status Exam"),_tool("interview-circle.html","The Interview Circle"),_tool("sp-interview.html","The Interview Room — AI Standardized Patient"),_tool("screeners.html","Screeners: PHQ-9 & GAD-7")]},
 {"section":"Understand the Problem","items":[_md("Differential Dx Scaffolds","ddx.md"),_tool("diagnostic-reasoning.html","Diagnostic Reasoning Workbench"),_md("Formulation & DDx","pg_formulation.md"),_md("Case Formulation","case_formulation.md"),_md("Medical Workup & Mimics","medical_workup.md"),_md("Mood","t_mood.md"),_md("Psychosis","t_psychosis.md"),_md("Anxiety/Trauma/OCD","t_anxiety.md"),_md("Personality","t_personality.md"),_md("Substance Use","t_sud.md"),_md("Geriatric","t_geri.md"),_md("Perinatal","t_perinatal.md"),_md("Neurodevelopmental Disorders","t_neurodev.md"),_md("Eating Disorders","t_eating.md"),_md("Neurocognitive (Dementia)","t_neurocog.md"),_md("Somatic Symptom & Related","t_somatic.md"),_md("Sleep-Wake Disorders","t_sleep.md"),_md("Dissociative Disorders","t_dissociative.md"),_md("Sexual, Paraphilic & Gender","t_sexual.md"),_md("Impulse-Control & Conduct","t_impulse.md"),_md("Adjustment Disorders","t_adjustment.md"),_md("Culture, Disparities & Formulation","cultural_psychiatry.md")]},
 {"section":"Assess Safety and Acuity","pinned":True,"items":[_md("Suicide Risk & Safety","pg_suicide.md"),_md("Suicide Risk & Safety Planning","suicide.md"),_tool("cssrs.html","Columbia C-SSRS Screener"),_md("Violence Risk","violence.md"),_tool("violence.html","Violence Risk (FRST)"),_md("Agitation & Restraint","agitation.md"),_md("Catatonia","catatonia.md"),_tool("bfcrs.html","Bush-Francis Catatonia Scale (BFCRS)"),_md("Hyperthermia & Toxidromes","toxidromes.md"),_md("Delirium","delirium.md"),_tool("withdrawal.html","Withdrawal: CIWA-Ar/COWS"),_tool("capacity.html","Decisional Capacity"),_md("Consult Questions: Capacity, Delirium, Catatonia, Withdrawal","exp_consult.md"),_md("Ethics & the Law: Confidentiality, Tarasoff, Reporting","ethics_legal.md")]},
 {"section":"Make a Plan","items":[_md("Psychopharmacology Primer","psychopharm_primer.md"),_md("Medication Monitoring & Labs","med_monitoring.md"),_md("Protocol Library","protocol_library.md"),_md("ECT & Neuromodulation","ect_neuromodulation.md"),_md("Treatment Basics","exp_tx.md"),_tool("decision-aids.html","Algorithms & Decision Aids"),_md("Nutrition & Metabolic Health","nutrition_metabolic.md"),_md("Osteopathic (OMM) Resources","omm_resources.md")]},
 {"section":"Communicate with Patients","items":[_tool("communication-practice.html","What Do You Say Next?"),_md("Psychotherapies at a Glance","psychotherapy.md"),_md("Motivational Interviewing","motivational_interviewing.md"),_md("Brief Psychotherapy on the Unit","brief_psychotherapy.md"),_tool("reflection.html","Reflection & Identity")]},
 {"section":"Work with Family and Systems","items":[_tool("family-systems.html","Family Systems Practice"),_md("I Need Collateral: 10-Minute Workflow","collateral_workflow.md"),_md("Family & Discharge","exp_family.md"),_md("Family Meeting Playbook (90-min)","family_playbook.md"),_md("Family Therapy Modalities","family_modalities.md")]},
 {"section":"Present and Work with the Team","items":[_md("Documentation & Oral Presentation","doc_oral.md"),_tool("oral.html","Treatment Team Rounding Prep"),_md("High-Yield Rounds Questions","rounds_questions.md")]},
 {"section":"Practice and Exam Prep","items":[_tool("question-bank-practice.html","Practice Questions — Question Bank"),_tool("one-patient-six-weeks.html","One Patient, Six Weeks"),_tool("review.html","Daily Review (Spaced Repetition)"),_tool("shelf-mode.html","Shelf Mode — Exam Simulation"),_md("COMAT & Shelf Review","shelf.md"),_md("Rapid Review — Buzzwords","rapid_review.md"),_md("OSCE Stations","osce.md"),_md("Practice Cases","cases.md"),_md("Landmark Trials — Listen & Test","landmark_trials.md"),_md("Anki Flashcard Decks","anki.md")]},
 {"section":"Case of the Week","items":[_md("Index — All Cases","cotw_index.md")]+[_md(w["label"],_cotw_slug(w,"ms3")) for w in _cotw_weeks]},
 {"section":"Evidence and Reference","items":[_md("Weekly Reading Map","reading_map.md"),_md("Evidence-Based Inpatient Psychiatry","evidence_inpatient.md"),_md("MS3 Book Library","book_library.md"),_md("Podcast Library (Psychiatry & Psychotherapy)","podcast_library.md")]},
 {"section":"Feedback","items":[_tool("feedback.html","Improve this library — send feedback")]},
]
_navorder=["Welcome and Orientation","Start the Encounter","Understand the Problem","Assess Safety and Acuity","Make a Plan","Communicate with Patients","Work with Family and Systems","Present and Work with the Team","Practice and Exam Prep","Case of the Week","Evidence and Reference","Feedback"]
nav=sorted(nav,key=lambda s:_navorder.index(s["section"]) if s["section"] in _navorder else 999)
open(OUT+"/nav.json","w").write(json.dumps(nav))
_missing_req=[]
_copy_required(SPA, OUT+"/index.html", _missing_req)
_copy_required(MARKED, OUT+"/marked.min.js", _missing_req)  # vendored (ward-wifi: no CDN dependency)
_copy_required(CLINICAL_CSS, OUT+"/clinical-warm.css", _missing_req)  # shared dark-mode tokens (linked into tools below)
_abort_missing(_missing_req)
print("tools:",len(tools)," md copied:",len(md)-len(missing)," missing:",missing)

# ---------- SEARCH INDEX (mirrors rc-search foundation: pre-tokenized inverted index + bidirectional synonyms) ----------
def build_search_index():
    import re
    STOP=set("a an and are as at be by for from has in is it of on or that the to was with you your".split())
    def tok(t):
        return [w for w in re.sub(r'[^a-z0-9]+',' ',(t or "").lower()).split() if len(w)>=2 and w not in STOP]
    # Synonym groups: ReConnect clinical groups (search-synonyms.json) + hub-specific abbreviations. Bidirectional.
    GROUPS=[
     ["bpd","borderline","borderline personality","emotionally unstable","eupd"],
     ["anxiety","panic","panic attack","generalized anxiety","gad","worry"],
     ["depression","depressed","mdd","major depressive","low mood","hopeless"],
     ["bipolar","manic","mania","bipolar disorder","mood stabilizer"],
     ["ptsd","trauma","post traumatic","complex trauma","cptsd"],
     ["psychosis","psychotic","hallucination","delusion","thought disorder","schizophrenia"],
     ["sud","substance","addiction","alcohol","drugs","substance use","opioid"],
     ["si","suicide","suicidal","self harm","nssi","safety planning"],
     ["sleep","insomnia"],
     ["adolescent","teen","teenager","youth","child","children","minor","pediatric"],
     ["geriatric","elderly","older adult","senior","dementia"],
     ["perinatal","pregnant","postpartum","maternal","pregnancy"],
     ["discharge","transition","aftercare","follow up","disposition"],
     ["referral","consult","consultation","handoff"],
     ["crisis","emergency","urgent","acute"],
     ["assessment","screening","evaluation","screen"],
     ["safety","safety plan","stanley brown","crisis plan"],
     ["medication","med","rx","prescription","drug","pharmacology"],
     ["family","caregiver","parent","partner","spouse","relational"],
     ["mse","mental status exam","mental status"],
     ["ciwa","alcohol withdrawal"],
     ["cows","opioid withdrawal"],
     ["cssrs","columbia","suicide severity"],
     ["frst","violence","aggression","violence risk"],
     ["ee","expressed emotion"],
     ["ddx","differential","differential diagnosis"],
     ["capacity","decisional capacity","consent","informed consent"],
     ["catatonia","lorazepam","bush francis"],
     ["delirium","confusion","encephalopathy","inattention"],
     ["agitation","restraint","de-escalation","seclusion"],
     ["nms","neuroleptic malignant"],
     ["antipsychotic","neuroleptic","clozapine"],
     ["lithium","valproate","lamotrigine"],
     ["ss","serotonin syndrome"],
     ["td","tardive dyskinesia","tardive"],
     ["ama","against medical advice","discharge ama"],
     ["dts","delirium tremens"],
     ["wke","wernicke","wernicke encephalopathy"],
     ["aws","alcohol withdrawal"],
     ["eps","extrapyramidal","extrapyramidal symptoms"],
     ["eating","eating disorder","anorexia","bulimia","binge eating","refeeding","arfid"],
    ]
    syn={}
    for g in GROUPS:
        toks=set()
        for term in g: toks.update(tok(term))
        for t in toks:
            syn.setdefault(t,set()).update(toks-{t})
    syn={k:sorted(v) for k,v in syn.items()}
    TOOLKW={
     "mse.html":"mental status exam appearance behavior speech mood affect thought process content perception cognition insight judgment interview",
     "interview-circle.html":"interview circle radial domain map psychiatric intake history hpi chief complaint substance family social mental status safety risk non-linear conversation clinical skills interviewing not a checklist",
     "communication-practice.html":"what do you say next communication practice branching dialogue rapid spoken drill say it out loud rehearsal timer 20 second suicide psychosis validation rupture repair medication ambivalence family meeting collateral motivational interviewing relational skills",
     "diagnostic-reasoning.html":"diagnostic reasoning workbench differential diagnosis problem representation illness script bayesian updating diagnostic humility anchoring premature closure syndrome formulation inpatient psychiatry case practice delirium catatonia mania psychosis substance trauma personality",
     "family-systems.html":"family systems practice collateral call family meeting discharge barrier map expressed emotion psychoeducation confidentiality boundaries means safety caregiver support inpatient psychiatry",
     "one-patient-six-weeks.html":"one patient six weeks longitudinal case arc six week rotation timeline alliance interview mental status exam differential diagnosis medical rule out medication ambivalence family collateral safety suicide discharge handoff reflection",
     "capacity.html":"decisional capacity informed consent refusal four abilities understand appreciate reason communicate",
     "oral.html":"treatment team rounding prep rounds presentation oral one liner assessment plan handoff gather present practice timer collateral update 30 second sixty 60 second micro update",
     "violence.html":"violence risk aggression frst agitation safety prediction de-escalation",
     "cssrs.html":"columbia suicide severity rating scale cssrs suicidal ideation screening safety planning",
     "withdrawal.html":"withdrawal alcohol ciwa opioid cows detox benzodiazepine taper thiamine",
     "reflection.html":"reflection professional identity formation reflective writing pif",
     "screeners.html":"phq-9 phq9 gad-7 gad7 depression anxiety screener screening score severity validated instrument cutoff",
     "shelf-mode.html":"shelf mode comat shelf exam simulation timed vignette question bank board review mixed blueprint mock test practice questions",
     "review.html":"daily review spaced repetition srs flashcards sm-2 retention schedule due cards study streak memory test enhanced learning forgetting curve anki",
     "feedback.html":"feedback improve library suggest resource report broken link error confusing helpful rating comment survey suggestion box contact",
     "decision-aids.html":"algorithms decision aids visual trees flowchart rule out first move escalation ladder agitation restraint nms serotonin syndrome hyperthermia alcohol withdrawal timeline delirium tremens ciwa score bands catatonia psychosis differential dark mode",
     "bfcrs.html":"bush francis catatonia rating scale bfcrs bfcsi catatonia screening immobility stupor mutism posturing catalepsy waxy flexibility negativism mitgehen gegenhalten echopraxia lorazepam challenge severity score",
     "learning-path.html":"learning path home dashboard six week progress streak daily review study plan start here",
     "question-bank-practice.html":"practice questions question bank comat shelf exam vignette single best answer sba two-tier confidence calibration trap feedback spaced repetition category filter mood psychosis anxiety substance neurocognitive pharmacology safety personality relational ethics",
    }
    postings={}  # token -> {docid: weighted tf}
    docs=[]
    def addtok(docid,text,wt):
        for t in tok(text):
            d=postings.setdefault(t,{}); d[docid]=d.get(docid,0)+wt
    for sec in nav:
        for it in sec["items"]:
            if it.get("hidden"): continue
            f=it["f"]; k=it["k"]; title=it["t"]; section=sec["section"]
            heads=""; body=""
            if k=="md":
                p=OUT+"/content/"+f
                raw=open(p,encoding="utf-8").read() if os.path.exists(p) else ""
                btxt=[]
                for ln in raw.split("\n"):
                    s=ln.strip()
                    if s.startswith("#"): heads+=" "+s.lstrip("#").strip()
                    else: btxt.append(s)
                body=" ".join(btxt)
            else:
                body=TOOLKW.get(f,"")
            docid=len(docs)
            clean=re.sub(r'[#>*_`|\[\]()/-]+',' ',body); clean=re.sub(r'\s+',' ',clean).strip()
            docs.append({"t":title,"f":f,"k":k,"sec":section,"snip":clean[:170]})
            addtok(docid,title,4); addtok(docid,section,2); addtok(docid,heads,2); addtok(docid,body,1)
    post={}; df={}
    for t,dd in postings.items():
        post[t]=[[docid,tf] for docid,tf in sorted(dd.items())]; df[t]=len(dd)
    idx={"version":1,"n":len(docs),"synonyms":syn,"docs":docs,"postings":post,"df":df}
    open(OUT+"/search-index.json","w",encoding="utf-8").write(json.dumps(idx,ensure_ascii=False))
    print("search-index: docs",len(docs),"| tokens",len(post),"| synonym-keys",len(syn))


# ---------- A11Y / POLISH PASS (audit response) ----------
import re as _re, glob as _glob
for _f in _glob.glob(OUT+"/content/*.md"):
    _t=open(_f,encoding="utf-8").read()
    _t=_re.sub(r'(?m)^> \*\*Review status:\*\*.*\n?','',_t)
    open(_f,"w",encoding="utf-8").write(_t)
for _f in _glob.glob(OUT+"/content/*.md")+_glob.glob(OUT+"/tools/*.html")+[OUT+"/index.html"]:
    _t=open(_f,encoding="utf-8").read(); _t2=_t.replace("#87786a","#665a4f")
    if _t2!=_t: open(_f,"w",encoding="utf-8").write(_t2)
for _f in _glob.glob(OUT+"/tools/*.html"):
    _t=open(_f,encoding="utf-8").read(); _o=_t
    _t=_t.replace('<div id="root"></div>','<main id="root"></main>')
    if 'id="root"' not in _t and '<main' in _t:
        # WP-05 gap: 2/20 tool sources (family-systems-practice, one-patient-six-weeks) already
        # ship a <main> wrapper but no id — give the skip-link below a resolvable #root anchor
        # without duplicating an id= that's already present on the tag.
        _t=_re.sub(r'<main(?![^>]*\bid=)', '<main id="root"', _t, count=1)
    _t=_t.replace('<head>','<head>\n<link rel="icon" href="/favicon.svg">',1)
    # WP-05: skip-to-content link (WCAG 2.1 AA 2.4.1 Bypass Blocks) — first focusable element in body.
    if 'class="skip-link"' not in _t and '<body' in _t:
        _t=_re.sub(r'(<body[^>]*>)', r'\1\n<a class="skip-link" href="#root">Skip to content</a>', _t, count=1)
    if '.skip-link{' not in _t and '</head>' in _t:
        _t=_t.replace('</head>', '<style>.skip-link{position:absolute;left:-999px;top:0;background:var(--surface,#fff);color:var(--primary-dark,#a84830);padding:8px 12px;z-index:1000}.skip-link:focus{left:8px}@media(pointer:coarse){.chip,.tab,.btn,.seg,button,[role="tab"],[role="button"]{min-height:44px}}</style>\n</head>', 1)
    # WP-03 remainder: bare accent text (--primary #c25a3c) is ~3.9:1 on the light
    # backgrounds — fails WCAG AA for normal-size text. Repoint to --primary-dark:
    # the literal fallback covers tools whose light :root lacks the token, and the
    # dark theme (clinical-warm.css) overrides --primary-dark to #dd9277, which passes.
    # The closing paren in the pattern leaves --primary-dark/--primary-light alone;
    # only text color is rewritten (backgrounds/borders keep the brand accent).
    _t=_re.sub(r'color:\s*var\(--primary\)', 'color:var(--primary-dark,#a84830)', _t)
    if _t!=_o: open(_f,"w",encoding="utf-8").write(_t)
_ih=open(OUT+"/index.html",encoding="utf-8").read(); _ih_o=_ih
if 'rel="icon"' not in _ih: _ih=_ih.replace('<head>','<head>\n<link rel="icon" href="/favicon.svg">',1)
# Shell (spa_index.html) already ships its own skip-link (href="#content") — guard so the build
# never double-injects a second one into the SPA index.
if 'class="skip-link"' not in _ih and '<body' in _ih:
    _ih=_re.sub(r'(<body[^>]*>)', r'\1\n<a class="skip-link" href="#root">Skip to content</a>', _ih, count=1)
if '.skip-link{' not in _ih and '</head>' in _ih:
    _ih=_ih.replace('</head>', '<style>.skip-link{position:absolute;left:-999px;top:0;background:var(--surface,#fff);color:var(--primary-dark,#a84830);padding:8px 12px;z-index:1000}.skip-link:focus{left:8px}@media(pointer:coarse){.chip,.tab,.btn,.seg,button,[role="tab"],[role="button"]{min-height:44px}}</style>\n</head>', 1)
if _ih!=_ih_o: open(OUT+"/index.html","w",encoding="utf-8").write(_ih)
open(OUT+"/favicon.svg","w",encoding="utf-8").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#9f3f2a"/><text x="32" y="45" font-family="Georgia,serif" font-size="40" fill="#fff" text-anchor="middle">\u03c8</text></svg>')
open(OUT+"/robots.txt","w",encoding="utf-8").write("User-agent: *\nDisallow: /\n")
open(OUT+"/404.html","w",encoding="utf-8").write('<!doctype html><meta charset="utf-8"><title>Not found</title><meta name="robots" content="noindex,nofollow"><style>body{font-family:system-ui,sans-serif;background:#f6f3ee;color:#2f2924;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}a{color:#174d43}</style><div><h1 style="color:#9f3f2a">Page not found</h1><p><a href="/">Return to the clerkship hub</a></p></div>')
open(OUT+"/_headers","w",encoding="utf-8").write("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(), camera=(), microphone=(self)\n  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self' blob: https://sp-interview-proxy.netlify.app; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://sp-interview-proxy.netlify.app; frame-src 'self'; frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app\n/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n/content/*\n  Cache-Control: public, max-age=0, must-revalidate\n/audio/*\n  Cache-Control: public, max-age=604800\n/audio_oe/*\n  Cache-Control: public, max-age=604800\n/tools/quizzes.json\n  Cache-Control: public, max-age=86400\n/search-index.json\n  Cache-Control: public, max-age=86400\n/evidence_registry.json\n  Cache-Control: public, max-age=0, must-revalidate\n/tool_registry.json\n  Cache-Control: public, max-age=0, must-revalidate\n/tool-governance.json\n  Cache-Control: public, max-age=0, must-revalidate\n/communication_cases.json\n  Cache-Control: public, max-age=0, must-revalidate\n/reasoning_cases.json\n  Cache-Control: public, max-age=0, must-revalidate\n/family_systems_scenarios.json\n  Cache-Control: public, max-age=0, must-revalidate\n/reviewed.json\n  Cache-Control: public, max-age=0, must-revalidate\n/favicon.svg\n  Cache-Control: public, max-age=604800\n")
print("polish pass: banners stripped, contrast darkened, <main>+favicon on tools, robots/404/_headers written")

# ---------- DARK MODE PASS (Slice 2): inject dark tokens + pre-paint theme init across every page ----------
_DARK='[data-theme="dark"]{--bg:#1a1816;--bg-alt:#211d1a;--bg2:#211d1a;--surface:#2a2520;--surface2:#332e28;--hover:#3d3630;--border:#3d3630;--border2:#2f2a25;--text:#e8e2da;--text-mid:#b3a596;--mid:#b3a596;--text-light:#8a7c6e;--light:#8a7c6e;--primary:#d4896e;--primary-dark:#dd9277;--primary-d:#dd9277;--primary-light:rgba(212,137,110,.16);--primary-l:rgba(212,137,110,.16);--primary-ink:#e6a98f;--accent:#5aad9a;--accent-dark:#6cbcaa;--accent-d:#6cbcaa;--accent-light:rgba(90,173,154,.16);--accent-l:rgba(90,173,154,.16);--success:#5aad8e;--success-light:rgba(90,173,142,.16);--success-l:rgba(90,173,142,.16);--good:#5aad8e;--good-bg:rgba(90,173,142,.16);--warning:#c4a45c;--warning-light:rgba(196,164,92,.16);--warning-l:rgba(196,164,92,.16);--warn:#c4a45c;--warn-bg:rgba(196,164,92,.16);--danger:#d46858;--danger-light:rgba(212,104,88,.16);--danger-l:rgba(212,104,88,.16);--bad:#d46858;--bad-bg:rgba(212,104,88,.16);--info:#7a9ec4;--info-light:rgba(122,158,196,.16);--info-l:rgba(122,158,196,.16);--on-brand:#211d1a;--focus:#7aa2ff;--shadow:0 1px 3px rgba(0,0,0,.35);--shadow-sm:0 1px 3px rgba(0,0,0,.35);--shadow-md:0 2px 10px rgba(0,0,0,.4);--shadow-lg:0 8px 28px rgba(0,0,0,.45);}'
_INIT="<script>(function(){try{var t=localStorage.getItem('cw_theme');if(t!=='dark'&&t!=='light'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>"
_MOTION='@media(prefers-reduced-motion:no-preference){@keyframes ccRise{from{transform:translateY(10px)}to{transform:none}}.cc-rise{animation:ccRise .28s ease both}}button:active,a.btn:active,.btn:active,.tab:active,.opt:active,.tyo:active,.tile:active,.chip:active,.navitem:active,.navsec:active,.qbtn:active,.deckbtn:active,.thmbtn:active{transform:scale(.975)}html{-webkit-tap-highlight-color:transparent}'
# In-iframe link interceptor: when a tool runs inside the SPA shell, route its index.html?page=/?tool= links to the parent so they open in-app (no nested SPA / no dead-end new tab).
_IFRAMENAV="<!--ifn--><script>(function(){if(window.self===window.top)return;document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href]');if(!a)return;var m=(a.getAttribute('href')||'').match(/index\\.html\\?(page|tool)=([^&#\"']+)/);if(m){ev.preventDefault();try{window.parent.postMessage({type:'openPage',f:decodeURIComponent(m[2])},'*');}catch(_){}}}, true);})();</script>"
import time as _time
_QV=str(int(_time.time()))
for _f in _glob.glob(OUT+"/tools/*.html")+[OUT+"/index.html"]:
    _t=open(_f,encoding="utf-8").read(); _o=_t
    if "--on-brand:#" not in _t:
        _t=_t.replace("--surface:#ffffff;","--surface:#ffffff; --on-brand:#ffffff;",1)
    _t=_re.sub(r'(background(?:-color)?)\s*:\s*#(?:fff|ffffff)\b', r'\1:var(--surface)', _t)
    _t=_re.sub(r'color\s*:\s*#(?:fff|ffffff)\b', 'color:var(--on-brand)', _t)
    if "cw_theme" not in _t:
        _t=_t.replace("<head>", "<head>\n"+_INIT, 1)
    if '[data-theme="dark"]' not in _t and 'clinical-warm.css' not in _t and "</head>" in _t:
        # shared dark tokens now come from the linked clinical-warm.css (one file, not 34 inline copies)
        _t=_t.replace("</head>", '<link rel="stylesheet" href="/clinical-warm.css">\n</head>', 1)
    if "cc-rise" not in _t and "</style>" in _t:
        _t=_t.replace("</style>", _MOTION+"\n</style>", 1)
    if not _f.endswith("/index.html") and "<!--ifn-->" not in _t and "</body>" in _t:
        _t=_t.replace("</body>", _IFRAMENAV+"\n</body>", 1)
    _t=_t.replace('"quizzes.json"','"quizzes.json?v='+_QV+'"').replace("'quizzes.json'","'quizzes.json?v="+_QV+"'")
    if _t!=_o: open(_f,"w",encoding="utf-8").write(_t)
print("dark-mode pass: tokens + init injected across tools + index")

# ---------- MEDIA GUARD: drop <video> embeds whose asset was never exported ----------
# Keeps per-week / per-tool embeds from shipping as broken players when only the reels exist.
from media_guard import strip_missing_media
strip_missing_media(OUT)

build_search_index()

# ---------- TOOL GOVERNANCE ----------
# Source hashes remain over canonical source files; this final comparison proves the emitted
# inventory exactly covers the completed built tools directory before publishing the artifact.
sys.path.insert(0, os.path.dirname(HERE))
from validate_tool_governance import (
    GovernanceError,
    build_governance_document,
    validate_built_tool_inventory,
    write_atomic_json,
)

try:
    _governance, _governance_warnings = build_governance_document(
        Path(LIB), "ms3", enforce_expected_count=True
    )
    validate_built_tool_inventory(_governance, Path(OUT) / "tools", site="ms3")
    write_atomic_json(Path(OUT) / "tool-governance.json", _governance)
except GovernanceError as error:
    raise SystemExit(f"tool governance INVALID — {error}") from error
for _warning in _governance_warnings:
    print(_warning)
print("tool governance: emitted", len(_governance["items"]), "items")
