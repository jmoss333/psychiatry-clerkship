# Derive the MMC resident variant from the already-built MS3 deploy (run AFTER build_deploy.py).
import os, shutil, json, re, glob

# Session-portable paths (fixed 2026-07-01): derive from this script's own location.
HERE=os.path.dirname(os.path.abspath(__file__))
LIB=os.path.abspath(os.path.join(HERE,"..","..",".."))   # .../Psychiatry-Clerkship-Library
ROOT=os.path.dirname(LIB)                                 # parent dir that holds the deploy repos
MS3=os.environ.get("MS3_DIR", os.path.join(ROOT,"clerkship-hub-deploy"))
OUT=os.environ.get("OUT_DIR", os.path.join(ROOT,"mmc-resident-deploy"))

if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(MS3, OUT)   # start as a full copy of the polished/dark/motion MS3 build

# ---- orientation video is MS3-scoped (its own narration says "clerkship") — strip the 4 files
# that rode along via the MS3 copytree above; resident gets its own prototypes only (below).
for _f in ["orientation-video.html","Inpatient_Psych_Orientation.mp4","Inpatient_Psych_Orientation.vtt","poster.jpg"]:
    _p=os.path.join(OUT,"tools",_f)
    if os.path.exists(_p): os.remove(_p)

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
# vendor React (shared across all three rp-* tools; files are byte-for-byte identical)
_vendor_src=os.path.join(LIB,"_prototypes/agitation-trainer/vendor")
_vendor_dst=OUT+"/tools/vendor"
if os.path.isdir(_vendor_src) and not os.path.exists(_vendor_dst):
    shutil.copytree(_vendor_src, _vendor_dst)

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

# ---- resident nav ----
TOOLS=[("mse.html","Mental Status Exam"),("interview-circle.html","The Interview Circle"),("capacity.html","Decisional Capacity"),("oral.html","Treatment Team Rounding Prep"),
 ("violence.html","Violence Risk (FRST)"),("cssrs.html","Columbia C-SSRS Screener"),("screeners.html","Screeners: PHQ-9 & GAD-7"),
 ("withdrawal.html","Withdrawal: CIWA-Ar/COWS"),("decision-aids.html","Algorithms & Decision Aids"),
 ("bfcrs.html","Bush-Francis Catatonia Scale (BFCRS)"),("reflection.html","Reflection & Identity"),
 ("active-recall.html","Active Recall (Self-Test)"),("shelf-mode.html","Board-Style Question Bank"),
 ("review.html","Daily Review (Spaced Repetition)"),
 ("feedback.html","Improve this library — send feedback")]
nav=[
 {"section":"Start here","items":[
   {"t":"Welcome — Resident Rotation","f":"welcome.md","k":"md"},
   {"t":"4-Week Rotation Plan","f":"rotation.md","k":"md"},
   {"t":"Core Reading List","f":"core_readings.md","k":"md"}]},
 {"section":"Resident depth","items":[
   {"t":"Advanced Psychopharmacology","f":"adv_psychopharm.md","k":"md"},
   {"t":"Inpatient Systems & Med-Legal","f":"systems_medlegal.md","k":"md"},
   {"t":"Supervision, EPAs & Teaching","f":"supervision_teaching.md","k":"md"},
   {"t":"The Psychiatry Canon (200)","f":"canon_200.md","k":"md"}]},
 {"section":"Interactive tools","items":[{"t":n,"f":f,"k":"tool"} for f,n in TOOLS]},
 {"section":"Core Topics","items":[{"t":"Differential Dx Scaffolds","f":"ddx.md","k":"md"},{"t":"Mood","f":"t_mood.md","k":"md"},{"t":"Psychosis","f":"t_psychosis.md","k":"md"},{"t":"Anxiety/Trauma/OCD","f":"t_anxiety.md","k":"md"},{"t":"Personality","f":"t_personality.md","k":"md"},{"t":"Substance Use","f":"t_sud.md","k":"md"},{"t":"Geriatric","f":"t_geri.md","k":"md"},{"t":"Perinatal","f":"t_perinatal.md","k":"md"},{"t":"Neurodevelopmental Disorders","f":"t_neurodev.md","k":"md"},{"t":"Eating Disorders","f":"t_eating.md","k":"md"},{"t":"Nutrition & Metabolic Health","f":"nutrition_metabolic.md","k":"md"}]},
 {"section":"Acute & Safety","items":[{"t":"Catatonia","f":"catatonia.md","k":"md"},{"t":"Delirium","f":"delirium.md","k":"md"},{"t":"Agitation & Restraint","f":"agitation.md","k":"md"},{"t":"C-L: Emergencies, Tox & Capacity (Numbers)","f":"cl_reference.md","k":"md"},{"t":"Agitation Ladder — PRN Trainer","f":"rp-agitation.html","k":"tool"}]},
 {"section":"Psychopharmacology","items":[{"t":"Psychopharmacology Primer","f":"psychopharm_primer.md","k":"md"},{"t":"Advanced Psychopharmacology","f":"adv_psychopharm.md","k":"md"},{"t":"Protocol Library","f":"protocol_library.md","k":"md"}]},
 {"section":"Skills & reference","items":[{"t":"Interview & MSE","f":"pg_interview.md","k":"md"},{"t":"Formulation & DDx","f":"pg_formulation.md","k":"md"},{"t":"Suicide Risk & Safety","f":"pg_suicide.md","k":"md"},{"t":"Documentation & Oral Presentation","f":"doc_oral.md","k":"md"},{"t":"Consult: Capacity/Delirium/Catatonia/Withdrawal","f":"exp_consult.md","k":"md"},{"t":"Family & Discharge","f":"exp_family.md","k":"md"},{"t":"Family Therapy Modalities","f":"family_modalities.md","k":"md"},{"t":"Family Meeting Playbook (90-min)","f":"family_playbook.md","k":"md"},{"t":"Motivational Interviewing","f":"motivational_interviewing.md","k":"md"},{"t":"Brief Psychotherapy on the Unit","f":"brief_psychotherapy.md","k":"md"},{"t":"High-Yield Rounds Questions","f":"rounds_questions.md","k":"md"},{"t":"Five Good Minutes — Brief Psych Coach","f":"rp-brief-psych.html","k":"tool"}]},
 {"section":"Evidence & reading","items":[{"t":"Evidence-Based Inpatient Psychiatry","f":"evidence_inpatient.md","k":"md"},{"t":"Landmark Trials — Listen & Test","f":"landmark_trials.md","k":"md"},{"t":"The Psychiatry Canon (200)","f":"canon_200.md","k":"md"},{"t":"Canon Quiz — 200-Paper Spine","f":"rp-canon-quiz.html","k":"tool"}]},
 {"section":"Books & Podcasts","items":[{"t":"Book Library","f":"book_library.md","k":"md"},{"t":"Podcast Library (Psychiatry & Psychotherapy)","f":"podcast_library.md","k":"md"}]},
 {"section":"Faculty","items":[{"t":"Review & Attest","f":"review-attest.html","k":"tool"}]},
]
_navorder=["Start here","Resident depth","Core Topics","Interactive tools","Acute & Safety","Psychopharmacology","Skills & reference","Evidence & reading","Books & Podcasts","Faculty"]
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
TOOLKW={"mse.html":"mental status exam appearance behavior speech mood affect thought","interview-circle.html":"interview circle radial domain map intake history hpi substance family social mental status safety conversation interviewing checklist","capacity.html":"decisional capacity informed consent four abilities","oral.html":"rounding presentation oral assessment plan handoff timer","violence.html":"violence risk aggression frst de-escalation","cssrs.html":"columbia suicide severity rating scale ideation safety planning","withdrawal.html":"withdrawal alcohol ciwa opioid cows benzodiazepine thiamine","reflection.html":"reflection professional identity formation","screeners.html":"phq-9 gad-7 depression anxiety screener cutoff","active-recall.html":"active recall self test quiz board review flashcards","shelf-mode.html":"board style question bank exam simulation vignette mixed blueprint mock test","decision-aids.html":"algorithms decision aids trees escalation ladder nms serotonin withdrawal timeline ciwa catatonia","bfcrs.html":"bush francis catatonia rating scale immobility mutism posturing waxy flexibility lorazepam challenge","review.html":"daily review spaced repetition srs flashcards retention due cards streak board review test enhanced learning forgetting curve","feedback.html":"feedback improve library suggest resource report broken link error confusing helpful comment suggestion box","learning-path.html":"learning path home dashboard rotation progress daily review","rp-agitation.html":"agitation ladder prn trainer restraint de-escalation seclusion intramuscular haloperidol lorazepam olanzapine decision escalation","rp-brief-psych.html":"five good minutes brief psychotherapy coach supportive bedside therapeutic conversation skills","rp-canon-quiz.html":"canon quiz 200 paper spine landmark trials evidence self test board review recall"}
postings={}; docs=[]
def addtok(docid,text,wt):
    for x in tok(text):
        d=postings.setdefault(x,{}); d[docid]=d.get(docid,0)+wt
for sec in nav:
    for it in sec["items"]:
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
