import os, shutil, json, sys
from pathlib import Path
# Shared, audience-neutral assembly logic (tokenizer, synonyms, tool keywords,
# search index, HTML polish/dark passes, page contract). Extracted 2026-07-26 —
# see common.py's module docstring. resident_section.py imports the same module,
# so these no longer exist as two drifting copies.
import common
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
# OE NotebookLM brief audio is a hard deploy input (live /audio_oe/ media).
# Fail closed below: a moved or missing source dir must abort the build, not
# silently ship a site with no OE audio (the pre-2026-08 Handoffs/ path was
# nearly deleted as stale precisely because this block used to skip silently).
_oedir=LIB+"/12_Media/audio_oe"
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
else:
    _abort_missing([_oedir+"/MANIFEST.csv"])
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
# Per-case topic_meta is DERIVED from the same registry at build time (cotw_meta.py) rather
# than hand-added every week — that is what keeps `metadata missing (topic_meta)` from
# reappearing, and what puts cases on the shelfBlueprint crosswalk. Hand-written entries win.
import cotw_meta as _cotw_meta
_cm_add,_cm_skip,_,_cm_untagged=_cotw_meta.inject(OUT,_cotw_weeks,"ms3")
print("cotw topic_meta: %d derived, %d hand-written kept"%(_cm_add,_cm_skip))
if _cm_untagged: print("  NOTE no 'blueprint' in cotw_registry.json (case absent from the crosswalk): "+", ".join(_cm_untagged))
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

# ---------- POLISH + A11Y + DARK-MODE PASS (shared with the resident build) ----------
# Every page transform lives in common.py so both audience builds apply the identical
# set. Previously these were two hand-maintained copies, and the resident-only rp-*
# tools bypassed them entirely. assert_page_contract() at the end of this file
# hard-fails any shipped page a transform silently missed.
import glob as _glob
common.strip_review_banners(OUT)
# [^source-id] is reviewer bookkeeping, not learner text. Pass the real ids so a
# regex sample or array index that looks like an anchor is left alone.
common.strip_claim_anchors(OUT, [s.get("id") for s in _canonical_evidence.get("sources", [])])
common.apply_contrast_fix(
    _glob.glob(OUT+"/content/*.md")+_glob.glob(OUT+"/tools/*.html")+[OUT+"/index.html"]
)
_QV=common.quiz_cache_bust(OUT+"/tools/quizzes.json")   # content-hash cache-bust (reproducible)
common.apply_full_page_pass(OUT, cache_bust=_QV)


open(OUT+"/favicon.svg","w",encoding="utf-8").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#9f3f2a"/><text x="32" y="45" font-family="Georgia,serif" font-size="40" fill="#fff" text-anchor="middle">\u03c8</text></svg>')
open(OUT+"/robots.txt","w",encoding="utf-8").write("User-agent: *\nDisallow: /\n")
open(OUT+"/404.html","w",encoding="utf-8").write('<!doctype html><meta charset="utf-8"><title>Not found</title><meta name="robots" content="noindex,nofollow"><style>body{font-family:system-ui,sans-serif;background:#f6f3ee;color:#2f2924;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}a{color:#174d43}</style><div><h1 style="color:#9f3f2a">Page not found</h1><p><a href="/">Return to the clerkship hub</a></p></div>')
open(OUT+"/_headers","w",encoding="utf-8").write("/*\n  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(), camera=(), microphone=(self)\n  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self' blob: https://sp-interview-proxy.netlify.app; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://sp-interview-proxy.netlify.app; frame-src 'self'; frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app\n/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n/content/*\n  Cache-Control: public, max-age=0, must-revalidate\n/audio/*\n  Cache-Control: public, max-age=604800\n/audio_oe/*\n  Cache-Control: public, max-age=604800\n/media/*\n  Cache-Control: public, max-age=604800\n/tools/quizzes.json\n  Cache-Control: public, max-age=86400\n/search-index.json\n  Cache-Control: public, max-age=86400\n/evidence_registry.json\n  Cache-Control: public, max-age=0, must-revalidate\n/tool_registry.json\n  Cache-Control: public, max-age=0, must-revalidate\n/tool-governance.json\n  Cache-Control: public, max-age=0, must-revalidate\n/communication_cases.json\n  Cache-Control: public, max-age=0, must-revalidate\n/reasoning_cases.json\n  Cache-Control: public, max-age=0, must-revalidate\n/family_systems_scenarios.json\n  Cache-Control: public, max-age=0, must-revalidate\n/reviewed.json\n  Cache-Control: public, max-age=0, must-revalidate\n/favicon.svg\n  Cache-Control: public, max-age=604800\n/sw.js\n  Cache-Control: public, max-age=0, must-revalidate\n")
print("polish pass: banners stripped, contrast darkened, <main>+favicon on tools, robots/404/_headers written")


# ---------- MEDIA GUARD: drop <video> embeds whose asset was never exported ----------
# Keeps per-week / per-tool embeds from shipping as broken players when only the reels exist.
from media_guard import strip_missing_media
strip_missing_media(OUT)

common.build_search_index(nav, OUT, label="ms3")

# Postcondition gate (architecture review rec 1.3): prove every shipped page actually
# received the chrome/dark transforms rather than silently missing them.
common.assert_page_contract(OUT, label="ms3")

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

# ---------- SERVICE WORKER ----------
# Last artifact step: the precache manifest must reflect the completed,
# published-artifact file tree, not an intermediate one.
common.emit_service_worker(OUT)
