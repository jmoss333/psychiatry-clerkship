# Derive the MMC resident variant from the already-built MS3 deploy (run AFTER build_deploy.py).
import os, shutil, json, re, glob, sys
from pathlib import Path

# Session-portable paths (fixed 2026-07-01): derive from this script's own location.
HERE=os.path.dirname(os.path.abspath(__file__))
LIB=os.path.abspath(os.path.join(HERE,"..","..",".."))   # .../Psychiatry-Clerkship-Library
ROOT=os.path.dirname(LIB)                                 # parent dir that holds the deploy repos
MS3=os.environ.get("MS3_DIR", os.path.join(ROOT,"clerkship-hub-deploy"))
OUT=os.environ.get("OUT_DIR", os.path.join(ROOT,"mmc-resident-deploy"))

if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(MS3, OUT)   # start as a full copy of the polished/dark/motion MS3 build
_copied_governance=os.path.join(OUT,"tool-governance.json")
if os.path.exists(_copied_governance): os.remove(_copied_governance)

# ---- orientation video is MS3-scoped (its own narration says "clerkship") — strip the 4 files
# that rode along via the MS3 copytree above; resident gets its own prototypes only (below).
for _f in ["orientation-video.html","Inpatient_Psych_Orientation.mp4","Inpatient_Psych_Orientation.vtt","poster.jpg"]:
    _p=os.path.join(OUT,"tools",_f)
    if os.path.exists(_p): os.remove(_p)

# ---- Case of the Week: the MS3 case pages ride along via the MS3 copytree above; strip them so
# the resident site shows only the resident versions (added via RES_EXTRA below). The shared
# cotw_index.md is intentionally kept and then overwritten with the resident index in RES_EXTRA.
for _f in glob.glob(OUT+"/content/cotw_*_ms3.md"): os.remove(_f)

# ---- resident onboarding trailer ("Yours to Run.", ~87s, silent/kinetic-text) — resident-only,
# so it's copied here rather than added to build_deploy.py's VIDEO_MEDIA (which would also ship it,
# unused, on the MS3 site). Embed lives in resident_welcome.md -> welcome.md.
RESIDENT_VIDEO_MEDIA=["resident-onboarding.mp4","resident-onboarding-poster.jpg"]
_rvidsrc=os.path.join(LIB,"_prototypes","video-library")
os.makedirs(OUT+"/media",exist_ok=True)
for _rvf in RESIDENT_VIDEO_MEDIA:
    _rp=os.path.join(_rvidsrc,_rvf)
    if os.path.exists(_rp): shutil.copy2(_rp, OUT+"/media/"+_rvf)
    else: print("  WARN: resident onboarding video asset missing from source:",_rvf)

# ---- resident-only pages (welcome overrides the MS3 welcome.md) ----
RES_EXTRA=[
 ("08_Cases_and_Simulation/case-of-the-week/index_resident.md","cotw_index.md"),
 ("08_Cases_and_Simulation/case-of-the-week/2026-07-09_serotonin-syndrome-vs-nms_Resident.md","cotw_20260709_ssnms_res.md"),
 ("08_Cases_and_Simulation/case-of-the-week/2026-07-13_acute-agitation-delirium_Resident.md","cotw_20260713_agitation_res.md"),
 ("08_Cases_and_Simulation/case-of-the-week/2026-07-20_bipolar-mania_Resident.md","cotw_20260720_bipolar_res.md"),
 ("08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_Resident.md","cotw_20260720_mdd_res.md"),
 ("14_Tracks/Resident/resident_welcome.md","welcome.md"),
 ("14_Tracks/Resident/resident_curriculum.md","rotation.md"),
 ("14_Tracks/Resident/adv_psychopharmacology.md","adv_psychopharm.md"),
 ("14_Tracks/Resident/systems_medlegal.md","systems_medlegal.md"),
 ("14_Tracks/Resident/supervision_teaching.md","supervision_teaching.md"),
 ("14_Tracks/Resident/canon_200.md","canon_200.md"),
 ("14_Tracks/Resident/cl_reference.md","cl_reference.md"),
]
for src,dst in RES_EXTRA:
    p=os.path.join(LIB,src)
    if os.path.exists(p):
        t=open(p,encoding="utf-8").read()
        t=re.sub(r'(?m)^> \*\*Review status:\*\*.*\n?','',t)   # strip learner-facing banner
        t=t.replace("#87786a","#665a4f")
        open(OUT+"/content/"+dst,"w",encoding="utf-8").write(t)

# ---- resident-only prototype tools (reconciled into source build 2026-07-02) ----
# Previously hand-copied straight into the deploy dir (source/deploy drift); now built from
# git-tracked _prototypes/ so build-on-push keeps them live. Copied raw to match live (no polish pass).
PROTO_TOOLS=[
 ("_prototypes/agitation-trainer/rp-agitation.html","rp-agitation.html"),
 ("_prototypes/brief-psych/rp-brief-psych.html","rp-brief-psych.html"),
 ("_prototypes/canon-quiz/rp-canon-quiz.html","rp-canon-quiz.html"),
]
os.makedirs(OUT+"/tools",exist_ok=True)
for src,dst in PROTO_TOOLS:
    p=os.path.join(LIB,src)
    if os.path.exists(p): shutil.copyfile(p,OUT+"/tools/"+dst)
    else: print("  WARN: prototype tool missing from source:",src)
    # sibling content pack (tools/<name>.pack.json convention — see _TEMPLATE.html);
    # the tool's own fetch() 404s at runtime if this doesn't ride along with the .html.
    pack_src=p[:-len(".html")]+".pack.json"
    if os.path.exists(pack_src):
        shutil.copyfile(pack_src, OUT+"/tools/"+dst[:-len(".html")]+".pack.json")
    # WP-05: these 3 rp-* tools bypass build_deploy.py's polish pass entirely (raw copy, above),
    # so they'd otherwise ship without the skip-to-content link every other built page gets.
    # All 3 already carry <main id="root">, so only the skip-link + its CSS need injecting here.
    _dp=OUT+"/tools/"+dst
    if os.path.exists(_dp):
        _t=open(_dp,encoding="utf-8").read(); _o=_t
        if 'class="skip-link"' not in _t and '<body' in _t:
            _t=re.sub(r'(<body[^>]*>)', r'\1\n<a class="skip-link" href="#root">Skip to content</a>', _t, count=1)
        if '.skip-link{' not in _t and '</head>' in _t:
            _t=_t.replace('</head>', '<style>.skip-link{position:absolute;left:-999px;top:0;background:var(--surface,#fff);color:var(--primary-dark,#a84830);padding:8px 12px;z-index:1000}.skip-link:focus{left:8px}</style>\n</head>', 1)
        if _t!=_o: open(_dp,"w",encoding="utf-8").write(_t)
# vendor React (shared across all three rp-* tools; files are byte-for-byte identical)
_vendor_src=os.path.join(LIB,"_prototypes/agitation-trainer/vendor")
_vendor_dst=OUT+"/tools/vendor"
if os.path.isdir(_vendor_src) and not os.path.exists(_vendor_dst):
    shutil.copytree(_vendor_src, _vendor_dst)

# ---- QA-gate source map: resident = MS3's wired sources (this build starts as a copytree
# of the MS3 build) + resident-only extras. Written next to the build dir, never inside it;
# consumed by check-static-site.mjs's orphaned-source check.
_ms3map=MS3.rstrip("/\\")+".source-map.json"
_srcs=set(json.load(open(_ms3map,encoding="utf-8"))["sources"]) if os.path.exists(_ms3map) else set()
_srcs|={s for s,_ in RES_EXTRA}|{s for s,_ in PROTO_TOOLS}
if os.path.exists(os.path.join(LIB,"reasoning_cases_resident.json")):
    _srcs.add("reasoning_cases_resident.json")
open(OUT.rstrip("/\\")+".source-map.json","w",encoding="utf-8").write(json.dumps({"sources":sorted(_srcs)}))

# ---- rebrand index.html (copied, already dark/motion/polished) ----
ix=open(OUT+"/index.html",encoding="utf-8").read()
ix=ix.replace('<div class="by">MS3 Clerkship · Joshua Moss, MD</div>','<div class="by">Resident Rotation · Sanford BHU · Joshua Moss, MD</div>')
ix=ix.replace('<h1>Inpatient Psychiatry</h1>','<h1>MMC Psychiatry</h1>')
ix=ix.replace('MS3 Psychiatry Clerkship','MMC Psychiatry Residency')
ix=ix.replace('MS3 Clerkship','Resident Rotation')
ix=ix.replace('Private teaching site for the MS3 inpatient psychiatry rotation. Educational use; fictional composites only, no PHI. Some pages are pending faculty review.',
              'Private teaching site for the MMC general-psychiatry resident inpatient rotation at the Sanford Behavioral Health Unit. Educational use; fictional composites only, no PHI. Pending faculty attestation.')
ix=ix.replace('A private learning hub for the third-year inpatient psychiatry clerkship.',
              'A private learning hub for the MMC general-psychiatry resident inpatient rotation (Sanford BHU).')
open(OUT+"/index.html","w",encoding="utf-8").write(ix)

# ---- rebrand learning-path (Path-mode home) ----
lp=OUT+"/tools/learning-path.html"
if os.path.exists(lp):
    s=open(lp,encoding="utf-8").read()
    s=s.replace("Inpatient Psychiatry — Learning Path","MMC Psychiatry — Learning Path")
    s=s.replace("MS3 Clerkship · Joshua Moss, MD","Resident Rotation · Joshua Moss, MD")
    open(lp,"w",encoding="utf-8").write(s)

# ---- resident-level reasoning cases: same tool, harder audience-specific payload ----
_resident_reasoning=os.path.join(LIB,"reasoning_cases_resident.json")
if os.path.exists(_resident_reasoning):
    shutil.copy2(_resident_reasoning, OUT+"/reasoning_cases.json")
else:
    print("  WARN: resident reasoning cases missing from source:",_resident_reasoning)

# ---- resident nav ----
TOOLS=[("mse.html","Mental Status Exam"),("interview-circle.html","The Interview Circle"),("communication-practice.html","What Do You Say Next?"),("diagnostic-reasoning.html","Diagnostic Reasoning Workbench"),("family-systems.html","Family Systems Practice"),("capacity.html","Decisional Capacity"),("oral.html","Treatment Team Rounding Prep"),
 ("violence.html","Violence Risk (FRST)"),("cssrs.html","Columbia C-SSRS Screener"),("screeners.html","Screeners: PHQ-9 & GAD-7"),
 ("withdrawal.html","Withdrawal: CIWA-Ar/COWS"),("decision-aids.html","Algorithms & Decision Aids"),
 ("bfcrs.html","Bush-Francis Catatonia Scale (BFCRS)"),("reflection.html","Reflection & Identity"),
 ("shelf-mode.html","Board-Style Question Bank"),
 ("question-bank-practice.html","Practice Questions — Question Bank"),
 ("one-patient-six-weeks.html","One Patient, Six Weeks"),
 ("review.html","Daily Review (Spaced Repetition)"),
 ("feedback.html","Improve this library — send feedback")]
# Hidden from the sidebar list + search per Dr. Moss's request (2026-07-06) — superseded by the
# question bank practice tool. Files still ship (inherited via the MS3 copytree above) and stay
# fully reachable by direct link / the home "Start review" card / per-page tool docks (all look
# items up by filename, not by sidebar visibility) — see the `hidden` flag on the nav item below.
HIDDEN_TOOLS={"shelf-mode.html","review.html"}
_HIDDEN_INHERITED=[
  {"t":"Orientation Packet","f":"orientation.md","k":"md","hidden":True},
  {"t":"Week 1 — Foundations","f":"week1.md","k":"md","hidden":True},
  {"t":"Week 2 — Mood/Psychosis/Pharm","f":"week2.md","k":"md","hidden":True},
  {"t":"Week 3 — Psychotherapy/Personality","f":"week3.md","k":"md","hidden":True},
  {"t":"Week 4 — Family/Systems/EE","f":"week4.md","k":"md","hidden":True},
  {"t":"Week 5 — Acute/Emergency","f":"week5.md","k":"md","hidden":True},
  {"t":"Week 6 — Integration/Exam","f":"week6.md","k":"md","hidden":True},
  {"t":"Culture, Disparities & Formulation","f":"cultural_psychiatry.md","k":"md","hidden":True},
  {"t":"Ethics & the Law","f":"ethics_legal.md","k":"md","hidden":True},
  {"t":"Treatment Basics","f":"exp_tx.md","k":"md","hidden":True},
  {"t":"ECT & Neuromodulation","f":"ect_neuromodulation.md","k":"md","hidden":True},
  {"t":"Osteopathic (OMM) Resources","f":"omm_resources.md","k":"md","hidden":True},
  {"t":"Neurocognitive (Dementia)","f":"t_neurocog.md","k":"md","hidden":True},
  {"t":"Somatic Symptom & Related","f":"t_somatic.md","k":"md","hidden":True},
  {"t":"Sleep-Wake Disorders","f":"t_sleep.md","k":"md","hidden":True},
  {"t":"Dissociative Disorders","f":"t_dissociative.md","k":"md","hidden":True},
  {"t":"Sexual, Paraphilic & Gender","f":"t_sexual.md","k":"md","hidden":True},
  {"t":"Impulse-Control & Conduct","f":"t_impulse.md","k":"md","hidden":True},
  {"t":"Adjustment Disorders","f":"t_adjustment.md","k":"md","hidden":True},
  {"t":"Weekly Reading Map","f":"reading_map.md","k":"md","hidden":True},
  {"t":"COMAT & Shelf Review","f":"shelf.md","k":"md","hidden":True},
  {"t":"OSCE Stations","f":"osce.md","k":"md","hidden":True},
  {"t":"Practice Cases","f":"cases.md","k":"md","hidden":True},
]
nav=[
 {"section":"Welcome and Orientation","pinned":True,"items":[
   {"t":"Welcome — Resident Rotation","f":"welcome.md","k":"md"},
   {"t":"4-Week Rotation Plan","f":"rotation.md","k":"md"},
   {"t":"Core Reading List","f":"core_readings.md","k":"md"},
   {"t":"Supervision, EPAs & Teaching","f":"supervision_teaching.md","k":"md"},
   {"t":"Learning Path","f":"learning-path.html","k":"tool","hidden":True}]},
 {"section":"Start the Encounter","items":[{"t":"Interview & MSE","f":"pg_interview.md","k":"md"},{"t":"Mental Status Exam","f":"mse.html","k":"tool"},{"t":"The Interview Circle","f":"interview-circle.html","k":"tool"},{"t":"The Interview Room — AI Standardized Patient","f":"sp-interview.html","k":"tool"},{"t":"Screeners: PHQ-9 & GAD-7","f":"screeners.html","k":"tool"}]},
 {"section":"Understand the Problem","items":[{"t":"Differential Dx Scaffolds","f":"ddx.md","k":"md"},{"t":"Diagnostic Reasoning Workbench","f":"diagnostic-reasoning.html","k":"tool"},{"t":"Formulation & DDx","f":"pg_formulation.md","k":"md"},{"t":"Case Formulation","f":"case_formulation.md","k":"md"},{"t":"Medical Workup & Mimics","f":"medical_workup.md","k":"md"},{"t":"Mood","f":"t_mood.md","k":"md"},{"t":"Psychosis","f":"t_psychosis.md","k":"md"},{"t":"Anxiety/Trauma/OCD","f":"t_anxiety.md","k":"md"},{"t":"Personality","f":"t_personality.md","k":"md"},{"t":"Substance Use","f":"t_sud.md","k":"md"},{"t":"Geriatric","f":"t_geri.md","k":"md"},{"t":"Perinatal","f":"t_perinatal.md","k":"md"},{"t":"Neurodevelopmental Disorders","f":"t_neurodev.md","k":"md"},{"t":"Eating Disorders","f":"t_eating.md","k":"md"}]},
 {"section":"Assess Safety and Acuity","pinned":True,"items":[{"t":"Suicide Risk & Safety","f":"pg_suicide.md","k":"md"},{"t":"Suicide Risk & Safety Planning","f":"suicide.md","k":"md"},{"t":"Columbia C-SSRS Screener","f":"cssrs.html","k":"tool"},{"t":"Violence Risk","f":"violence.md","k":"md"},{"t":"Violence Risk (FRST)","f":"violence.html","k":"tool"},{"t":"Agitation & Restraint","f":"agitation.md","k":"md"},{"t":"Agitation Ladder — PRN Trainer","f":"rp-agitation.html","k":"tool"},{"t":"Catatonia","f":"catatonia.md","k":"md"},{"t":"Bush-Francis Catatonia Scale (BFCRS)","f":"bfcrs.html","k":"tool"},{"t":"Hyperthermia & Toxidromes","f":"toxidromes.md","k":"md"},{"t":"Delirium","f":"delirium.md","k":"md"},{"t":"Withdrawal: CIWA-Ar/COWS","f":"withdrawal.html","k":"tool"},{"t":"Decisional Capacity","f":"capacity.html","k":"tool"},{"t":"Consult Questions: Capacity, Delirium, Catatonia, Withdrawal","f":"exp_consult.md","k":"md"},{"t":"C-L: Emergencies, Tox & Capacity (Numbers)","f":"cl_reference.md","k":"md"},{"t":"Inpatient Systems & Med-Legal","f":"systems_medlegal.md","k":"md"}]},
 {"section":"Make a Plan","items":[{"t":"Psychopharmacology Primer","f":"psychopharm_primer.md","k":"md"},{"t":"Advanced Psychopharmacology","f":"adv_psychopharm.md","k":"md"},{"t":"Medication Monitoring & Labs","f":"med_monitoring.md","k":"md"},{"t":"Protocol Library","f":"protocol_library.md","k":"md"},{"t":"Algorithms & Decision Aids","f":"decision-aids.html","k":"tool"},{"t":"Nutrition & Metabolic Health","f":"nutrition_metabolic.md","k":"md"}]},
 {"section":"Communicate with Patients","items":[{"t":"What Do You Say Next?","f":"communication-practice.html","k":"tool"},{"t":"Psychotherapies at a Glance","f":"psychotherapy.md","k":"md"},{"t":"Motivational Interviewing","f":"motivational_interviewing.md","k":"md"},{"t":"Brief Psychotherapy on the Unit","f":"brief_psychotherapy.md","k":"md"},{"t":"Five Good Minutes — Brief Psych Coach","f":"rp-brief-psych.html","k":"tool"},{"t":"Reflection & Identity","f":"reflection.html","k":"tool"}]},
 {"section":"Work with Family and Systems","items":[{"t":"Family Systems Practice","f":"family-systems.html","k":"tool"},{"t":"I Need Collateral: 10-Minute Workflow","f":"collateral_workflow.md","k":"md"},{"t":"Family & Discharge","f":"exp_family.md","k":"md"},{"t":"Family Meeting Playbook (90-min)","f":"family_playbook.md","k":"md"},{"t":"Family Therapy Modalities","f":"family_modalities.md","k":"md"}]},
 {"section":"Present and Work with the Team","items":[{"t":"Documentation & Oral Presentation","f":"doc_oral.md","k":"md"},{"t":"Treatment Team Rounding Prep","f":"oral.html","k":"tool"},{"t":"High-Yield Rounds Questions","f":"rounds_questions.md","k":"md"}]},
 {"section":"Practice and Exam Prep","items":[{"t":"Practice Questions — Question Bank","f":"question-bank-practice.html","k":"tool"},{"t":"One Patient, Six Weeks","f":"one-patient-six-weeks.html","k":"tool"},{"t":"Daily Review (Spaced Repetition)","f":"review.html","k":"tool","hidden":True},{"t":"Board-Style Question Bank","f":"shelf-mode.html","k":"tool","hidden":True},{"t":"Canon Quiz — 200-Paper Spine","f":"rp-canon-quiz.html","k":"tool"},{"t":"Rapid Review — Buzzwords","f":"rapid_review.md","k":"md"},{"t":"Landmark Trials — Listen & Test","f":"landmark_trials.md","k":"md"},{"t":"Anki Flashcard Decks","f":"anki.md","k":"md"}]},
 {"section":"Case of the Week","items":[{"t":"Index — All Cases","f":"cotw_index.md","k":"md"},{"t":"MDD — Treatment Selection (Jul 20)","f":"cotw_20260720_mdd_res.md","k":"md"},{"t":"Bipolar Mania (Jul 20)","f":"cotw_20260720_bipolar_res.md","k":"md"},{"t":"Acute Agitation & Delirium (Jul 13)","f":"cotw_20260713_agitation_res.md","k":"md"},{"t":"Serotonin Syndrome vs NMS (Jul 9)","f":"cotw_20260709_ssnms_res.md","k":"md"}]},
 {"section":"Evidence and Reference","items":[{"t":"Evidence-Based Inpatient Psychiatry","f":"evidence_inpatient.md","k":"md"},{"t":"The Psychiatry Canon (200)","f":"canon_200.md","k":"md"},{"t":"Book Library","f":"book_library.md","k":"md"},{"t":"Podcast Library (Psychiatry & Psychotherapy)","f":"podcast_library.md","k":"md"}]+_HIDDEN_INHERITED},
 {"section":"Feedback","items":[{"t":"Improve this library — send feedback","f":"feedback.html","k":"tool"}]},
]
_navorder=["Welcome and Orientation","Start the Encounter","Understand the Problem","Assess Safety and Acuity","Make a Plan","Communicate with Patients","Work with Family and Systems","Present and Work with the Team","Practice and Exam Prep","Case of the Week","Evidence and Reference","Feedback"]
nav=sorted(nav,key=lambda s:_navorder.index(s["section"]) if s["section"] in _navorder else 999)
open(OUT+"/nav.json","w").write(json.dumps(nav))

# ---- resident search index (same engine as MS3, over the resident nav) ----
STOP=set("a an and are as at be by for from has in is it of on or that the to was with you your".split())
def tok(t): return [w for w in re.sub(r'[^a-z0-9]+',' ',(t or "").lower()).split() if len(w)>=2 and w not in STOP]
GROUPS=[["bpd","borderline","borderline personality"],["anxiety","panic","gad","worry"],["depression","depressed","mdd","major depressive"],["bipolar","manic","mania","mood stabilizer"],["ptsd","trauma","post traumatic"],["psychosis","psychotic","hallucination","delusion","schizophrenia"],["sud","substance","addiction","alcohol","opioid"],["si","suicide","suicidal","self harm","safety planning"],["geriatric","elderly","older adult","dementia"],["perinatal","pregnant","postpartum"],["discharge","disposition","aftercare"],["consult","consultation","handoff"],["capacity","decisional capacity","consent"],["catatonia","lorazepam","bush francis","bfcrs"],["delirium","confusion","inattention"],["agitation","restraint","de-escalation","seclusion"],["nms","neuroleptic malignant"],["antipsychotic","neuroleptic","clozapine"],["lithium","valproate","lamotrigine"],["ect","neuromodulation","tms"],["commitment","involuntary","blue paper","hold"],["supervision","epa","milestone","teaching","feedback"],["clozapine","trs","treatment resistant"],["mse","mental status exam"],["ciwa","alcohol withdrawal"],["cows","opioid withdrawal"],["cssrs","columbia"],["frst","violence"],["ddx","differential","differential diagnosis"],["ss","serotonin syndrome"],["td","tardive dyskinesia","tardive"],["ama","against medical advice","discharge ama"],["dts","delirium tremens"],["wke","wernicke","wernicke encephalopathy"],["aws","alcohol withdrawal"],["eps","extrapyramidal","extrapyramidal symptoms"],["eating","eating disorder","anorexia","bulimia","binge eating","refeeding","arfid"]]
syn={}
for g in GROUPS:
    tt=set()
    for term in g: tt.update(tok(term))
    for x in tt: syn.setdefault(x,set()).update(tt-{x})
syn={k:sorted(v) for k,v in syn.items()}
TOOLKW={"mse.html":"mental status exam appearance behavior speech mood affect thought","interview-circle.html":"interview circle radial domain map intake history hpi substance family social mental status safety conversation interviewing checklist","communication-practice.html":"what do you say next communication practice branching dialogue rapid spoken drill say it out loud rehearsal timer 20 second suicide psychosis validation rupture repair medication ambivalence family meeting collateral motivational interviewing relational skills","diagnostic-reasoning.html":"diagnostic reasoning workbench differential diagnosis problem representation illness script bayesian updating diagnostic humility anchoring premature closure syndrome formulation inpatient psychiatry case practice delirium catatonia mania psychosis substance trauma personality","family-systems.html":"family systems practice collateral call family meeting discharge barrier map expressed emotion psychoeducation confidentiality boundaries means safety caregiver support inpatient psychiatry","capacity.html":"decisional capacity informed consent four abilities","oral.html":"rounding presentation oral assessment plan handoff timer collateral update 30 second sixty 60 second micro update","violence.html":"violence risk aggression frst de-escalation","cssrs.html":"columbia suicide severity rating scale ideation safety planning","withdrawal.html":"withdrawal alcohol ciwa opioid cows benzodiazepine thiamine","reflection.html":"reflection professional identity formation","screeners.html":"phq-9 gad-7 depression anxiety screener cutoff","shelf-mode.html":"board style question bank exam simulation vignette mixed blueprint mock test","decision-aids.html":"algorithms decision aids trees escalation ladder nms serotonin withdrawal timeline ciwa catatonia","bfcrs.html":"bush francis catatonia rating scale immobility mutism posturing waxy flexibility lorazepam challenge","review.html":"daily review spaced repetition srs flashcards retention due cards streak board review test enhanced learning forgetting curve","feedback.html":"feedback improve library suggest resource report broken link error confusing helpful comment suggestion box","learning-path.html":"learning path home dashboard rotation progress daily review","rp-agitation.html":"agitation ladder prn trainer restraint de-escalation seclusion intramuscular haloperidol lorazepam olanzapine decision escalation","rp-brief-psych.html":"five good minutes brief psychotherapy coach supportive bedside therapeutic conversation skills","rp-canon-quiz.html":"canon quiz 200 paper spine landmark trials evidence self test board review recall",
"question-bank-practice.html":"practice questions question bank comat shelf exam vignette single best answer sba two-tier confidence calibration trap feedback spaced repetition category filter mood psychosis anxiety substance neurocognitive pharmacology safety personality relational ethics","one-patient-six-weeks.html":"one patient six weeks longitudinal case arc six week rotation timeline alliance interview mental status exam differential diagnosis medical rule out medication ambivalence family collateral safety suicide discharge handoff reflection"}
# ---------- resident-only inline tool CTAs (topic_meta is shared, so patch OUT's copy) ----------
# agitation.md keeps its Decision Aids link and gains the Agitation Ladder trainer;
# brief_psychotherapy.md gains the Five Good Minutes coach. MS3's topic_meta is untouched.
_tmp=OUT+"/topic_meta.json"
if os.path.exists(_tmp):
    _tm=json.load(open(_tmp,encoding="utf-8"))
    def _addcta(key,cta):
        e=_tm.get(key,{})
        cur=e.get("cta")
        lst=cur if isinstance(cur,list) else ([cur] if cur else [])
        if not any(c.get("href")==cta["href"] for c in lst): lst.append(cta)
        e["cta"]=lst; _tm[key]=e
    _addcta("agitation.md",{"label":"Open the Agitation Ladder trainer","href":"tools/rp-agitation.html"})
    _addcta("brief_psychotherapy.md",{"label":"Open Five Good Minutes","href":"tools/rp-brief-psych.html"})
    open(_tmp,"w",encoding="utf-8").write(json.dumps(_tm,ensure_ascii=False))
# ---------- MEDIA GUARD: drop <video> embeds whose asset was never exported (resident build) ----------
# Resident inherits ms3's already-guarded pages via copytree, but re-writes some content from
# source and adds its own media — so guard the final OUT before indexing.
from media_guard import strip_missing_media
strip_missing_media(OUT)

postings={}; docs=[]
def addtok(docid,text,wt):
    for x in tok(text):
        d=postings.setdefault(x,{}); d[docid]=d.get(docid,0)+wt
for sec in nav:
    for it in sec["items"]:
        if it.get("hidden"): continue
        f=it["f"]; k=it["k"]; title=it["t"]; section=sec["section"]; heads=""; body=""
        if k=="md":
            p=OUT+"/content/"+f
            raw=open(p,encoding="utf-8").read() if os.path.exists(p) else ""
            btxt=[]
            for ln in raw.split("\n"):
                ss=ln.strip()
                if ss.startswith("#"): heads+=" "+ss.lstrip("#").strip()
                else: btxt.append(ss)
            body=" ".join(btxt)
        else: body=TOOLKW.get(f,"")
        docid=len(docs)
        clean=re.sub(r'[#>*_`|\[\]()/-]+',' ',body); clean=re.sub(r'\s+',' ',clean).strip()
        docs.append({"t":title,"f":f,"k":k,"sec":section,"snip":clean[:170]})
        addtok(docid,title,4); addtok(docid,section,2); addtok(docid,heads,2); addtok(docid,body,1)
post={}; df={}
for x,dd in postings.items():
    post[x]=[[i,tf] for i,tf in sorted(dd.items())]; df[x]=len(dd)
open(OUT+"/search-index.json","w",encoding="utf-8").write(json.dumps({"version":1,"n":len(docs),"synonyms":syn,"docs":docs,"postings":post,"df":df},ensure_ascii=False))
print("RESIDENT build: pages",len(docs),"| out",OUT)
print(" sections:",[s["section"] for s in nav])

# ---------- TOOL GOVERNANCE ----------
# Build from canonical sources, then verify the final resident tools exactly match its IDs.
sys.path.insert(0, os.path.dirname(HERE))
from validate_tool_governance import (
    GovernanceError,
    build_governance_document,
    validate_built_tool_inventory,
    write_atomic_json,
)

try:
    _governance, _governance_warnings = build_governance_document(
        Path(LIB), "resident", enforce_expected_count=True
    )
    validate_built_tool_inventory(_governance, Path(OUT) / "tools", site="resident")
    write_atomic_json(Path(OUT) / "tool-governance.json", _governance)
except GovernanceError as error:
    raise SystemExit(f"tool governance INVALID — {error}") from error
for _warning in _governance_warnings:
    print(_warning)
print("tool governance: emitted", len(_governance["items"]), "items")
