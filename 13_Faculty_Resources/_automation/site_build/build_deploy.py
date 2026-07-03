import os, shutil, json
# Session-portable paths (fixed 2026-07-01): derive from this script's own location instead of a
# hard-coded sandbox mount, so the build runs under any Cowork session or the real filesystem.
HERE=os.path.dirname(os.path.abspath(__file__))
LIB=os.path.abspath(os.path.join(HERE,"..","..",".."))   # .../Psychiatry-Clerkship-Library
ROOT=os.path.dirname(LIB)                                 # parent dir that holds the deploy repos
OUT=os.environ.get("OUT_DIR", os.path.join(ROOT,"clerkship-hub-deploy"))
SPA=os.path.join(HERE,"spa_index.html")                   # SPA shell (co-located with this script)
MARKED=os.path.join(HERE,"marked.min.js")                 # vendored marked (co-located)
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT+"/content"); os.makedirs(OUT+"/tools")

tools=[
 ("02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html","mse.html","Mental Status Exam"),
 ("02_Clinical_Skills/Interviewing/interview-circle.html","interview-circle.html","The Interview Circle"),
 ("04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html","capacity.html","Decisional Capacity"),
 ("02_Clinical_Skills/Oral_Presentations/oral-presentation-module.html","oral.html","Treatment Team Rounding Prep"),
 ("04_Acute_and_Safety/Violence_Risk/violence-risk-one-pager.html","violence.html","Violence Risk (FRST)"),
 ("04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html","cssrs.html","Columbia C-SSRS Screener"),
 ("02_Clinical_Skills/Screeners/screeners.html","screeners.html","Screeners: PHQ-9 & GAD-7"),
 ("03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html","withdrawal.html","Withdrawal: CIWA-Ar/COWS"),
 ("04_Acute_and_Safety/Decision_Aids/decision-aids.html","decision-aids.html","Algorithms & Decision Aids"),
 ("04_Acute_and_Safety/Catatonia/bfcrs.html","bfcrs.html","Bush-Francis Catatonia Scale (BFCRS)"),
 ("02_Clinical_Skills/Reflection_PIF/reflection-and-pif-set.html","reflection.html","Reflection & Identity"),
 ("07_Evidence_and_Reading/Landmark_Trials/active-recall.html","active-recall.html","Active Recall (Self-Test)"),
 ("07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html","shelf-mode.html","Shelf Mode — Exam Simulation"),
 ("07_Evidence_and_Reading/Landmark_Trials/review.html","review.html","Daily Review (Spaced Repetition)"),
 ("13_Faculty_Resources/Feedback/feedback.html","feedback.html","Improve this library — send feedback"),
]
for src,dst,_ in tools:
    shutil.copy2(os.path.join(LIB,src), OUT+"/tools/"+dst)

# ---- orientation video (MS3 "start here") ----
ORIENT_VIDEO=[
 ("_prototypes/orientation-video/orientation-video.html","orientation-video.html"),
 ("_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4","Inpatient_Psych_Orientation.mp4"),
 ("_prototypes/orientation-video/Inpatient_Psych_Orientation.vtt","Inpatient_Psych_Orientation.vtt"),
 ("_prototypes/orientation-video/poster.jpg","poster.jpg"),
]
for src,dst in ORIENT_VIDEO:
    p=os.path.join(LIB,src)
    if os.path.exists(p): shutil.copy2(p, OUT+"/tools/"+dst)
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

shutil.copy2(LIB+"/07_Evidence_and_Reading/Landmark_Trials/quizzes.json", OUT+"/tools/quizzes.json")
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
            _oemap[_key]={"audio":_fn,"audioDur":_r["duration"],"oe":_r["number"]}
    _qp=OUT+"/tools/quizzes.json"; _q=json.load(open(_qp,encoding="utf-8")); _na=0
    for _d in _q.get("decks",[]):
        _k=_re2.sub(r'[^a-z0-9]+',' ',(_d.get("title","")).lower()).strip()
        if _k in _oemap:
            _d["audio"]=_oemap[_k]["audio"]; _d["audioDur"]=_oemap[_k]["audioDur"]; _d["oe"]=_oemap[_k]["oe"]; _na+=1
    json.dump(_q, open(_qp,"w",encoding="utf-8"))
    print("OE audio: copied",len(_oemap),"files | deck-aligned",_na,"quiz decks")
_rv=LIB+"/13_Faculty_Resources/reviewed.json"
shutil.copy2(_rv, OUT+"/reviewed.json") if os.path.exists(_rv) else open(OUT+"/reviewed.json","w").write("{}")
_tm=LIB+"/topic_meta.json"
shutil.copy2(_tm, OUT+"/topic_meta.json") if os.path.exists(_tm) else open(OUT+"/topic_meta.json","w").write("{}")
shutil.copy2(LIB+"/13_Faculty_Resources/review-attest.html", OUT+"/tools/review-attest.html")
shutil.copy2(LIB+"/01_Six_Week_Curriculum/learning-path.html", OUT+"/tools/learning-path.html")

# md content: (source rel, out name, title)
md=[
 ("13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md","welcome.md","Welcome to the Rotation"),
 ("14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md","orientation.md","Orientation Packet"),
 ("14_Tracks/MS3/Student_Ready_Pack/core_reading_list.md","core_readings.md","Core Reading List"),
 ("01_Six_Week_Curriculum/Week_1_Foundations/README.md","week1.md","Week 1 — Foundations"),
 ("01_Six_Week_Curriculum/Week_2_Mood_Psychosis_Pharm/README.md","week2.md","Week 2 — Mood/Psychosis/Pharm"),
 ("01_Six_Week_Curriculum/Week_3_Psychotherapy_Personality/README.md","week3.md","Week 3 — Psychotherapy/Personality"),
 ("01_Six_Week_Curriculum/Week_4_Family_Systems_EE/README.md","week4.md","Week 4 — Family/Systems/EE"),
 ("01_Six_Week_Curriculum/Week_5_Acute_Emergency/README.md","week5.md","Week 5 — Acute/Emergency"),
 ("01_Six_Week_Curriculum/Week_6_Integration_Exam/README.md","week6.md","Week 6 — Integration/Exam"),
 ("02_Clinical_Skills/Differential_Diagnosis/inpatient_differential_scaffolds.md","ddx.md","Differential Dx Scaffolds"),
 ("03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md","t_mood.md","Mood Disorders"),
 ("03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md","t_psychosis.md","Psychotic Disorders"),
 ("03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md","t_anxiety.md","Anxiety/Trauma/OCD"),
 ("03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md","t_personality.md","Personality"),
 ("03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md","t_sud.md","Substance Use"),
 ("03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md","t_geri.md","Geriatric"),
 ("03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md","t_perinatal.md","Perinatal"),
 ("03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md","t_neurodev.md","Neurodevelopmental Disorders"),
 ("03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md","t_eating.md","Eating Disorders"),
 ("14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md","pg_interview.md","Interview & MSE Pocket Guide"),
 ("14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md","pg_formulation.md","Formulation & DDx Pocket Guide"),
 ("14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md","pg_suicide.md","Suicide Risk & Safety Card"),
 ("14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md","doc_oral.md","Documentation & Oral Presentation"),
 ("14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md","exp_consult.md","Capacity/Delirium/Catatonia/Withdrawal"),
 ("14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/treatment_basics_digest.md","exp_tx.md","Treatment Basics"),
 ("14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md","exp_family.md","Family & Discharge"),
 ("14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md","osce.md","OSCE Stations"),
 ("14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md","shelf.md","Shelf Review Guide"),
 ("14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md","reading_map.md","Weekly Reading Map"),
 ("14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/synthetic_practice_cases.md","cases.md","Practice Cases"),
 ("06_Family_and_Relational/family_therapy_modalities_inpatient.md","family_modalities.md","Family Therapy Modalities"),
 ("06_Family_and_Relational/family_meeting_playbook_90min.md","family_playbook.md","Family Meeting Playbook (90-min)"),
 ("04_Acute_and_Safety/Catatonia/catatonia_inpatient_teaching.md","catatonia.md","Catatonia"),
 ("04_Acute_and_Safety/Delirium/delirium_inpatient_teaching.md","delirium.md","Delirium"),
 ("04_Acute_and_Safety/Agitation_and_Restraint/agitation_restraint_inpatient_teaching.md","agitation.md","Agitation & Restraint"),
 ("05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md","psychopharm_primer.md","Psychopharmacology Primer"),
 ("05_Psychopharmacology/Protocol_Library/protocol_library_inpatient.md","protocol_library.md","Protocol Library"),
 ("07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md","book_library.md","MS3 Book Library"),
 ("12_Media/psychiatry_psychotherapy_podcast_library.md","podcast_library.md","Podcast Library (P&P)"),
 ("03_Core_Topics/Nutrition/nutrition_metabolic_inpatient_teaching.md","nutrition_metabolic.md","Nutrition & Metabolic Health"),
 ("03_Core_Topics/OMM_Resources/omm_in_psychiatry_resources.md","omm_resources.md","Osteopathic (OMM) Resources"),
 ("06_Family_and_Relational/motivational_interviewing_inpatient_teaching.md","motivational_interviewing.md","Motivational Interviewing"),
 ("02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md","brief_psychotherapy.md","Brief Psychotherapy on the Unit"),
 ("07_Evidence_and_Reading/Landmark_Trials/landmark_trials_page.md","landmark_trials.md","Landmark Trials — Listen & Test"),
 ("07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md","rounds_questions.md","High-Yield Rounds Questions"),
 ("07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md","evidence_inpatient.md","Evidence-Based Inpatient Psychiatry"),
]
missing=[]
for src,dst,_ in md:
    p=os.path.join(LIB,src)
    if os.path.exists(p): shutil.copy2(p, OUT+"/content/"+dst)
    else: missing.append(src)

nav=[
 {"section":"Start here","items":[{"t":"Orientation Video (start here)","f":"orientation-video.html","k":"tool"},{"t":"Welcome to the Rotation","f":"welcome.md","k":"md"},{"t":"Core Reading List","f":"core_readings.md","k":"md"},{"t":"Orientation Packet","f":"orientation.md","k":"md"}]},
 {"section":"Interactive tools","items":[{"t":n,"f":d,"k":"tool"} for s,d,n in tools]},
 {"section":"Six-Week Curriculum","items":[{"t":t,"f":f,"k":"md"} for f,(_,t) in [("week%d.md"%i,(0,["Week 1 — Foundations","Week 2 — Mood/Psychosis/Pharm","Week 3 — Psychotherapy/Personality","Week 4 — Family/Systems/EE","Week 5 — Acute/Emergency","Week 6 — Integration/Exam"][i-1])) for i in range(1,7)]]},
 {"section":"Core Topics","items":[{"t":"Differential Dx Scaffolds","f":"ddx.md","k":"md"},{"t":"Mood","f":"t_mood.md","k":"md"},{"t":"Psychosis","f":"t_psychosis.md","k":"md"},{"t":"Anxiety/Trauma/OCD","f":"t_anxiety.md","k":"md"},{"t":"Personality","f":"t_personality.md","k":"md"},{"t":"Substance Use","f":"t_sud.md","k":"md"},{"t":"Geriatric","f":"t_geri.md","k":"md"},{"t":"Perinatal","f":"t_perinatal.md","k":"md"},{"t":"Neurodevelopmental Disorders","f":"t_neurodev.md","k":"md"},{"t":"Eating Disorders","f":"t_eating.md","k":"md"},{"t":"Nutrition & Metabolic Health","f":"nutrition_metabolic.md","k":"md"},{"t":"Osteopathic (OMM) Resources","f":"omm_resources.md","k":"md"}]},
 {"section":"Acute & Safety","items":[{"t":"Catatonia","f":"catatonia.md","k":"md"},{"t":"Delirium","f":"delirium.md","k":"md"},{"t":"Agitation & Restraint","f":"agitation.md","k":"md"}]},
 {"section":"Psychopharmacology","items":[{"t":"Psychopharmacology Primer","f":"psychopharm_primer.md","k":"md"},{"t":"Protocol Library","f":"protocol_library.md","k":"md"}]},
 {"section":"Pocket guides","items":[{"t":"Interview & MSE","f":"pg_interview.md","k":"md"},{"t":"Formulation & DDx","f":"pg_formulation.md","k":"md"},{"t":"Suicide Risk & Safety","f":"pg_suicide.md","k":"md"}]},
 {"section":"Skills, cases & exam","items":[{"t":"Documentation & Oral Presentation","f":"doc_oral.md","k":"md"},{"t":"Capacity/Delirium/Catatonia/Withdrawal","f":"exp_consult.md","k":"md"},{"t":"Treatment Basics","f":"exp_tx.md","k":"md"},{"t":"Family & Discharge","f":"exp_family.md","k":"md"},{"t":"Family Therapy Modalities","f":"family_modalities.md","k":"md"},{"t":"Family Meeting Playbook (90-min)","f":"family_playbook.md","k":"md"},{"t":"Motivational Interviewing","f":"motivational_interviewing.md","k":"md"},{"t":"Brief Psychotherapy on the Unit","f":"brief_psychotherapy.md","k":"md"},{"t":"OSCE Stations","f":"osce.md","k":"md"},{"t":"Practice Cases","f":"cases.md","k":"md"},{"t":"COMAT & Shelf Review","f":"shelf.md","k":"md"},{"t":"High-Yield Rounds Questions","f":"rounds_questions.md","k":"md"}]},
 {"section":"Evidence & reading","items":[{"t":"Weekly Reading Map","f":"reading_map.md","k":"md"},{"t":"Landmark Trials — Listen & Test","f":"landmark_trials.md","k":"md"},{"t":"Evidence-Based Inpatient Psychiatry","f":"evidence_inpatient.md","k":"md"}]},
 {"section":"Books & Podcasts","items":[{"t":"MS3 Book Library","f":"book_library.md","k":"md"},{"t":"Podcast Library (Psychiatry & Psychotherapy)","f":"podcast_library.md","k":"md"}]},
 {"section":"Faculty","items":[{"t":"Review & Attest","f":"review-attest.html","k":"tool"}]},
]
_navorder=["Start here","Core Topics","Six-Week Curriculum","Interactive tools","Acute & Safety","Psychopharmacology","Pocket guides","Skills, cases & exam","Evidence & reading","Books & Podcasts","Faculty"]
nav=sorted(nav,key=lambda s:_navorder.index(s["section"]) if s["section"] in _navorder else 999)
open(OUT+"/nav.json","w").write(json.dumps(nav))
shutil.copy2(SPA, OUT+"/index.html")
shutil.copy2(MARKED, OUT+"/marked.min.js")  # vendored (ward-wifi: no CDN dependency)
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
     "capacity.html":"decisional capacity informed consent refusal four abilities understand appreciate reason communicate",
     "oral.html":"treatment team rounding prep rounds presentation oral one liner assessment plan handoff gather present practice timer",
     "violence.html":"violence risk aggression frst agitation safety prediction de-escalation",
     "cssrs.html":"columbia suicide severity rating scale cssrs suicidal ideation screening safety planning",
     "withdrawal.html":"withdrawal alcohol ciwa opioid cows detox benzodiazepine taper thiamine",
     "reflection.html":"reflection professional identity formation reflective writing pif",
     "screeners.html":"phq-9 phq9 gad-7 gad7 depression anxiety screener screening score severity validated instrument cutoff",
     "active-recall.html":"active recall self test quiz quizzes board review landmark trials flashcards spaced repetition questions practice",
     "shelf-mode.html":"shelf mode comat shelf exam simulation timed vignette question bank board review mixed blueprint mock test practice questions",
     "review.html":"daily review spaced repetition srs flashcards sm-2 retention schedule due cards study streak memory test enhanced learning forgetting curve anki",
     "feedback.html":"feedback improve library suggest resource report broken link error confusing helpful rating comment survey suggestion box contact",
     "decision-aids.html":"algorithms decision aids visual trees flowchart rule out first move escalation ladder agitation restraint nms serotonin syndrome hyperthermia alcohol withdrawal timeline delirium tremens ciwa score bands catatonia psychosis differential dark mode",
     "bfcrs.html":"bush francis catatonia rating scale bfcrs bfcsi catatonia screening immobility stupor mutism posturing catalepsy waxy flexibility negativism mitgehen gegenhalten echopraxia lorazepam challenge severity score",
     "learning-path.html":"learning path home dashboard six week progress streak daily review study plan start here",
     "orientation-video.html":"orientation video start here inpatient unit welcome introduction onboarding tour first day",
    }
    postings={}  # token -> {docid: weighted tf}
    docs=[]
    def addtok(docid,text,wt):
        for t in tok(text):
            d=postings.setdefault(t,{}); d[docid]=d.get(docid,0)+wt
    for sec in nav:
        for it in sec["items"]:
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
    _t=_t.replace('<head>','<head>\n<link rel="icon" href="/favicon.svg">',1)
    if _t!=_o: open(_f,"w",encoding="utf-8").write(_t)
_ih=open(OUT+"/index.html",encoding="utf-8").read()
if 'rel="icon"' not in _ih: open(OUT+"/index.html","w",encoding="utf-8").write(_ih.replace('<head>','<head>\n<link rel="icon" href="/favicon.svg">',1))
open(OUT+"/favicon.svg","w",encoding="utf-8").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#9f3f2a"/><text x="32" y="45" font-family="Georgia,serif" font-size="40" fill="#fff" text-anchor="middle">\u03c8</text></svg>')
open(OUT+"/robots.txt","w",encoding="utf-8").write("User-agent: *\nDisallow: /\n")
open(OUT+"/404.html","w",encoding="utf-8").write('<!doctype html><meta charset="utf-8"><title>Not found</title><meta name="robots" content="noindex,nofollow"><style>body{font-family:system-ui,sans-serif;background:#f6f3ee;color:#2f2924;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}a{color:#174d43}</style><div><h1 style="color:#9f3f2a">Page not found</h1><p><a href="/">Return to the clerkship hub</a></p></div>')
open(OUT+"/_headers","w",encoding="utf-8").write("/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n/content/*\n  Cache-Control: public, max-age=0, must-revalidate\n/audio/*\n  Cache-Control: public, max-age=604800\n/audio_oe/*\n  Cache-Control: public, max-age=604800\n/tools/quizzes.json\n  Cache-Control: public, max-age=86400\n/search-index.json\n  Cache-Control: public, max-age=86400\n/reviewed.json\n  Cache-Control: public, max-age=0, must-revalidate\n/favicon.svg\n  Cache-Control: public, max-age=604800\n")
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
    if '[data-theme="dark"]' not in _t and "</style>" in _t:
        _t=_t.replace("</style>", _DARK+"\n</style>", 1)
    if "cc-rise" not in _t and "</style>" in _t:
        _t=_t.replace("</style>", _MOTION+"\n</style>", 1)
    if not _f.endswith("/index.html") and "<!--ifn-->" not in _t and "</body>" in _t:
        _t=_t.replace("</body>", _IFRAMENAV+"\n</body>", 1)
    _t=_t.replace('"quizzes.json"','"quizzes.json?v='+_QV+'"').replace("'quizzes.json'","'quizzes.json?v="+_QV+"'")
    if _t!=_o: open(_f,"w",encoding="utf-8").write(_t)
print("dark-mode pass: tokens + init injected across tools + index")

build_search_index()
