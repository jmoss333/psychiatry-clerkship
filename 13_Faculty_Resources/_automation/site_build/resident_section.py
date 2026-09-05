# Derive the MMC resident variant from the already-built MS3 deploy (run AFTER build_deploy.py).
import os, shutil, json, re, glob, sys
from datetime import date
# Shared, audience-neutral assembly logic — the same module build_deploy.py uses.
# Extracted 2026-07-26; before that this file carried its own drifted copies of the
# tokenizer, synonym table, tool keywords, index builder, and skip-link injection.
import common
import crisis_block as _crisis
import frontdoor_catalog
import welcome_compass
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
# Surface governance (risk-aware-publishing-warnings): same reasoning as the
# tool-governance.json removal above — the copytree inherits MS3's ALREADY-WRITTEN
# governance.json. If resident's own build_site_document()/write_site_document()
# call below raises partway through, an inherited-but-stale MS3 governance.json
# must not be left behind wearing the resident site's name; remove it now so any
# partial failure ships with none rather than a wrong one.
_copied_surface_governance=os.path.join(OUT,"governance.json")
if os.path.exists(_copied_surface_governance): os.remove(_copied_surface_governance)

# ---- orientation video is MS3-scoped (its own narration says "clerkship") — strip the files
# that rode along via the MS3 copytree above; resident gets its own prototypes only (below).
# The package is declared once in site_extras.py, so this strip cannot drift from the copy.
from site_extras import MS3_ORIENT_VIDEO
for _src,_f,_t in MS3_ORIENT_VIDEO:
    _p=os.path.join(OUT,"tools",_f)
    if os.path.exists(_p): os.remove(_p)

# ---- Case of the Week: the MS3 case pages ride along via the MS3 copytree above; strip them so
# the resident site shows only the resident versions (added via RES_EXTRA below). The shared
# cotw_index.md is intentionally kept and then overwritten with the resident index in RES_EXTRA.
for _f in glob.glob(OUT+"/content/cotw_*_ms3.md"): os.remove(_f)

# ---- resident onboarding trailer ("Yours to Run.", ~87s, silent/kinetic-text) — resident-only,
# so it's copied here rather than added to build_deploy.py's VIDEO_MEDIA (which would also ship it,
# unused, on the MS3 site). Embed lives in resident_welcome.md -> welcome.md.
from site_extras import RESIDENT_ONBOARDING_MEDIA
os.makedirs(OUT+"/media",exist_ok=True)
# Fail closed (2026-09-05 review): assert_resident_output hard-requires these two files at
# the end of the build, so a silent WARN here only delayed the same failure by a full build.
common.copy_required_sources(RESIDENT_ONBOARDING_MEDIA, LIB, OUT+"/media", label="resident onboarding media")

# ---- resident-only pages (welcome overrides the MS3 welcome.md) ----
# ---- Case of the Week: resident per-week pages are registry-driven (single source of truth:
# 08_Cases_and_Simulation/case-of-the-week/cotw_registry.json). The shared cotw_index.md is
# overwritten here with the resident index; per-week resident pages are appended below.
_COTW_DIR="08_Cases_and_Simulation/case-of-the-week"
_cotw_weeks=json.load(open(os.path.join(LIB,_COTW_DIR,"cotw_registry.json"),encoding="utf-8")).get("weeks",[])
# The slug formula and the resident-only source lists are shared (site_build/cotw_slug.py,
# site_build/site_extras.py) rather than restated here. Nothing outside this script could
# enumerate the resident-only pages while they were literals inside it — and this script
# cannot be imported to ask (it deletes and rebuilds a directory at import time). See ADR-002.
from cotw_slug import cotw_slug as _cotw_slug
from site_extras import RESIDENT_COTW_INDEX, RESIDENT_TRACK_PAGES
RES_EXTRA=[
 (src,dst) for src,dst,_t in RESIDENT_COTW_INDEX
]+[(os.path.join(_COTW_DIR,w["res_src"]),_cotw_slug(w,"res")) for w in _cotw_weeks]+[
 (src,dst) for src,dst,_t in RESIDENT_TRACK_PAGES
]
# Fail closed (2026-08-01 audit): the copytree base means a missing resident-only
# source would silently ship the inherited MS3 file under the resident nav title.
common.copy_required_sources(RES_EXTRA, LIB, OUT+"/content", label="resident content")

# ---- CRISIS-CONTACT BLOCK on resident-only markdown ----------------------------------
# The pages inherited via the MS3 copytree already carry the RENDERED block, because
# build_deploy.py injected it as it copied them. RES_EXTRA pages do not: they are written
# fresh from source above, by a path that never called crisis_block.inject_markdown. Until
# 2026-09-02 nothing caught that, only because no resident-only source had yet opted in —
# the first `<!-- crisis-block -->` added to one would have shipped as an invisible HTML
# comment with no contacts at all, on a page that asked for them.
#
# Sweep every content page rather than just RES_EXTRA: injection consumes the marker, so
# the already-injected MS3 pages are a no-op, and any future resident-only page added by
# some other path is covered too. Runs BEFORE the strip/contrast passes so the rendered
# block gets the same treatment its MS3 counterpart did.
_crisis_res_data=_crisis.load(LIB)
_crisis_res_done=set()

# ---- WEEK-PAGE PAIRING BLOCK on the resident side -----------------------------------
# The resident site is shutil.copytree(MS3, OUT), so the six week pages arrive with the
# MS3 pairing ALREADY RENDERED and their marker consumed — this sweep is a deliberate
# no-op on them. It exists for the same reason the crisis sweep does: any resident-only
# page written fresh by RES_EXTRA (or by some future path) that opts into the marker
# would otherwise ship an invisible HTML comment. P1 ships ONE pairing set for both
# audiences, so a resident page cannot yet diverge; when it should, the divergence needs
# an unconsumed resident-specific marker, not a skip on the MS3 side. Runs BEFORE the
# strip/contrast passes so a resident-rendered block gets the same treatment its MS3
# counterpart did.
import pairings_block as _pairings
_pair_res_data=_pairings.resolve(_pairings.load(LIB), LIB)
_pair_res_done=set()

for _md_path in sorted(glob.glob(OUT+"/content/*.md")):
    _t=open(_md_path,encoding="utf-8").read()
    _t,_did=_crisis.inject_markdown(_t,_crisis_res_data)
    _t,_pdid=_pairings.inject_markdown(_t,_pair_res_data,os.path.basename(_md_path),"res")
    if _did or _pdid:
        open(_md_path,"w",encoding="utf-8").write(_t)
    if _did: _crisis_res_done.add(os.path.basename(_md_path))
    if _pdid: _pair_res_done.add(os.path.basename(_md_path))
if _pair_res_done:
    print("pairing block injected (resident-only pages):",len(_pair_res_done))

# Resident-only safety surfaces that must carry the block, same contract build_deploy.py
# enforces for MS3: a marker deleted, a page renamed, or a source dropped from RES_EXTRA
# fails the build instead of silently shipping a risk page with no crisis contacts. MS3
# surfaces are not re-listed here — they arrive pre-injected and are gated on that side.
_CRISIS_REQUIRED_RES_MD={
    # Q7 walks the resident through risk assessment, structured screening, and
    # collaborative safety planning (RV09-F002) — risk work under the scope rule.
    "cotw_20260810_panic_res.md",
    # Q5 has the resident formulating chronic vs acute-on-chronic suicide risk, building
    # the safety plan, and making the discharge call (RV09-F001) — the same scope rule.
    "cotw_20260827_bpd_res.md",
    # The suicide-risk case itself: assessment, safety planning, and disposition throughout.
    "cotw_20260723_suiciderisk_res.md",
}
_crisis_res_gap=sorted(_CRISIS_REQUIRED_RES_MD-_crisis_res_done)
if _crisis_res_gap:
    print("BUILD ABORTED — crisis-contact block missing from required resident safety surface(s):")
    for _g in _crisis_res_gap: print("   -",_g,"(expected the crisis-block marker in its source)")
    raise SystemExit(1)
print("crisis block injected (resident-only pass):",len(_crisis_res_done),"content page(s)")

# Resident-only markdown is written fresh above (not inherited via the copytree), so it
# needs the same banner-strip + contrast fix every MS3 content page already received.
common.strip_review_banners(OUT)
# RES_EXTRA pages are copied from source AFTER the MS3 strip, so they need their own.
_evidence_ids=[s.get("id") for s in json.load(open(OUT+"/evidence_registry.json",encoding="utf-8")).get("sources",[])]
common.strip_claim_anchors(OUT, _evidence_ids)
common.apply_contrast_fix(glob.glob(OUT+"/content/*.md"))

# ---- resident-only prototype tools (reconciled into source build 2026-07-02) ----
# Previously hand-copied straight into the deploy dir (source/deploy drift); now built from
# git-tracked _prototypes/ so build-on-push keeps them live. Copied raw to match live (no polish pass).
# Same reasoning as RES_EXTRA above: these three DO ship (_build/res/tools/), so
# shipped_pages.py has to be able to enumerate them without running this script.
from site_extras import RESIDENT_PROTO_TOOLS as PROTO_TOOLS
os.makedirs(OUT+"/tools",exist_ok=True)
for src,dst,_title in PROTO_TOOLS:
    p=os.path.join(LIB,src)
    if os.path.exists(p): shutil.copyfile(p,OUT+"/tools/"+dst)
    else: print("  WARN: prototype tool missing from source:",src)
    # sibling content pack (tools/<name>.pack.json convention — see _TEMPLATE.html);
    # the tool's own fetch() 404s at runtime if this doesn't ride along with the .html.
    pack_src=p[:-len(".html")]+".pack.json"
    if os.path.exists(pack_src):
        shutil.copyfile(pack_src, OUT+"/tools/"+dst[:-len(".html")]+".pack.json")

# Apply the full shared page pass over the resident build. Idempotent, so the pages
# inherited from the MS3 copytree are untouched and only the newly-written rp-* tools
# actually change. This replaces the hand-rolled skip-link-only subset that shipped
# these three tools without the motion CSS and the in-iframe link interceptor.
common.apply_full_page_pass(OUT)
# vendor React (shared across all three rp-* tools; files are byte-for-byte identical)
_vendor_src=os.path.join(LIB,"_prototypes/agitation-trainer/vendor")
_vendor_dst=OUT+"/tools/vendor"
if os.path.isdir(_vendor_src):
    os.makedirs(_vendor_dst,exist_ok=True)
    for _vf in os.listdir(_vendor_src):
        _vdst=os.path.join(_vendor_dst,_vf)
        if not os.path.exists(_vdst):
            shutil.copyfile(os.path.join(_vendor_src,_vf), _vdst)

# ---- QA-gate source map: resident = MS3's wired sources (this build starts as a copytree
# of the MS3 build) + resident-only extras. Written next to the build dir, never inside it;
# consumed by check-static-site.mjs's orphaned-source check.
_ms3map=MS3.rstrip("/\\")+".source-map.json"
_srcs=set(json.load(open(_ms3map,encoding="utf-8"))["sources"]) if os.path.exists(_ms3map) else set()
_srcs|={s for s,_ in RES_EXTRA}|{s for s,_,_ in PROTO_TOOLS}
_srcs.add("reasoning_cases_resident.json")   # required — build aborts below if missing
open(OUT.rstrip("/\\")+".source-map.json","w",encoding="utf-8").write(json.dumps({"sources":sorted(_srcs)}))

# ---- rebrand index.html (copied, already dark/motion/polished) ----
# Data-driven, verified rebrand: every needle must match spa_index's current copy
# or the build aborts (previously six bare replace() calls that silently no-oped
# after any shell reword, reverting resident branding to MS3 text).
RESIDENT_REBRAND=[
 ('<span class="fd-brand__name">Inpatient Psychiatry</span>','<span class="fd-brand__name">MMC Psychiatry</span>'),
 ('<span class="fd-setup__brand-name">Inpatient Psychiatry</span>','<span class="fd-setup__brand-name">MMC Psychiatry</span>'),
 ('MS3 Psychiatry Clerkship','MMC Psychiatry Residency'),
 ('MS3 Clerkship','Resident Rotation'),
 ('A private learning hub for the third-year inpatient psychiatry clerkship.',
  'A private learning hub for the MMC general-psychiatry resident inpatient rotation (Sanford BHU).'),
]
ix=open(OUT+"/index.html",encoding="utf-8").read()
ix=common.apply_verified_replacements(ix, RESIDENT_REBRAND, label="resident index rebrand")
_resident_shell_required=(
 '<span class="fd-brand__name">MMC Psychiatry</span>',
 '<span class="fd-setup__brand-name">MMC Psychiatry</span>',
 '<title>Inpatient Psychiatry — Resident Rotation</title>',
 'MMC Psychiatry Residency',
 'A private learning hub for the MMC general-psychiatry resident inpatient rotation (Sanford BHU).',
)
_resident_shell_stale=(
 '<span class="fd-brand__name">Inpatient Psychiatry</span>',
 '<span class="fd-setup__brand-name">Inpatient Psychiatry</span>',
 'MS3 Psychiatry Clerkship',
 'MS3 Clerkship',
)
_missing_shell=[needle for needle in _resident_shell_required if needle not in ix]
_stale_shell=[needle for needle in _resident_shell_stale if needle in ix]
if _missing_shell or _stale_shell:
    print("BUILD ABORTED — resident Front Door branding assertion failed")
    for needle in _missing_shell: print("   - missing:",repr(needle))
    for needle in _stale_shell: print("   - stale:",repr(needle))
    raise SystemExit(1)
open(OUT+"/index.html","w",encoding="utf-8").write(ix)

# ---- resident-level reasoning cases: same tool, harder audience-specific payload ----
_resident_reasoning=os.path.join(LIB,"reasoning_cases_resident.json")
if not os.path.exists(_resident_reasoning):
    # Silent MS3 downgrade guard: the copytree base means a missing resident payload
    # ships MS3-level cases under the resident site with every gate green.
    print("BUILD ABORTED — resident reasoning cases missing from source:",_resident_reasoning)
    raise SystemExit(1)
shutil.copy2(_resident_reasoning, OUT+"/reasoning_cases.json")

# ---- resident nav ----
# NOTE: the former TOOLS list and HIDDEN_TOOLS set lived here. Both were dead code —
# declared but never read (the nav below hardcodes "hidden":True inline). Removed
# 2026-07-26; site_manifest.json is the source of truth for what ships.
# The six inherited week pages take their titles from curriculum.json through the same
# formula the MS3 nav and the Compass use, so the two sites never label one page two ways.
from shipped_pages import ShippedPagesError as _ShippedPagesError, load_shipped_pages as _load_shipped_pages
try:
    _week_cards=welcome_compass.prepare_cards(
        json.load(open(LIB+"/curriculum.json",encoding="utf-8"))["learningPaths"]["ms3"]["weeks"],
        _load_shipped_pages(LIB))
except (
    OSError,
    UnicodeError,
    json.JSONDecodeError,
    KeyError,
    TypeError,
    welcome_compass.CompassContractError,
    _ShippedPagesError,
) as _week_error:
    print("BUILD ABORTED — week nav titles:",_week_error)
    raise SystemExit(1)
_HIDDEN_WEEKS=[{"t":welcome_compass.week_nav_title(_c),"f":_c.landing_ref,"k":"md","hidden":True} for _c in _week_cards]
_HIDDEN_INHERITED=[
  {"t":"Orientation Packet","f":"orientation.md","k":"md","hidden":True},
  *_HIDDEN_WEEKS,
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
 {"section":"Orientation","pinned":True,"items":[
   {"t":"Welcome — Resident Rotation","f":"welcome.md","k":"md"},
   {"t":"4-Week Rotation Plan","f":"rotation.md","k":"md"},
   {"t":"Core Reading List","f":"core_readings.md","k":"md"},
   {"t":"Supervision, EPAs & Teaching","f":"supervision_teaching.md","k":"md"}]},
 {"section":"Start the Encounter","items":[{"t":"Interview & MSE","f":"pg_interview.md","k":"md"},{"t":"Mental Status Exam","f":"mse.html","k":"tool"},{"t":"The Interview Circle","f":"interview-circle.html","k":"tool"},{"t":"The Interview Room — AI Standardized Patient","f":"sp-interview.html","k":"tool"},{"t":"Screeners: PHQ-9 & GAD-7","f":"screeners.html","k":"tool"}]},
 {"section":"Understand the Problem","items":[{"t":"Differential Dx Scaffolds","f":"ddx.md","k":"md"},{"t":"Diagnostic Reasoning Workbench","f":"diagnostic-reasoning.html","k":"tool"},{"t":"Formulation & DDx","f":"pg_formulation.md","k":"md"},{"t":"Case Formulation","f":"case_formulation.md","k":"md"},{"t":"Medical Workup & Mimics","f":"medical_workup.md","k":"md"},{"t":"Mood","f":"t_mood.md","k":"md"},{"t":"Psychosis","f":"t_psychosis.md","k":"md"},{"t":"Anxiety/Trauma/OCD","f":"t_anxiety.md","k":"md"},{"t":"Personality","f":"t_personality.md","k":"md"},{"t":"Substance Use","f":"t_sud.md","k":"md"},{"t":"Geriatric","f":"t_geri.md","k":"md"},{"t":"Perinatal","f":"t_perinatal.md","k":"md"},{"t":"Neurodevelopmental Disorders","f":"t_neurodev.md","k":"md"},{"t":"Eating Disorders","f":"t_eating.md","k":"md"}]},
 {"section":"Assess Safety and Acuity","pinned":True,"items":[{"t":"Suicide Risk & Safety","f":"pg_suicide.md","k":"md"},{"t":"Suicide Risk & Safety Planning","f":"suicide.md","k":"md"},{"t":"Columbia C-SSRS — Official Form & Training","f":"cssrs.html","k":"tool"},{"t":"Violence Risk","f":"violence.md","k":"md"},{"t":"Violence Risk (FRST)","f":"violence.html","k":"tool"},{"t":"Agitation & Restraint","f":"agitation.md","k":"md"},{"t":"Agitation Ladder — PRN Trainer","f":"rp-agitation.html","k":"tool"},{"t":"Catatonia","f":"catatonia.md","k":"md"},{"t":"Bush-Francis Catatonia Scale (BFCRS) — Official Form & Training","f":"bfcrs.html","k":"tool"},{"t":"Hyperthermia & Toxidromes","f":"toxidromes.md","k":"md"},{"t":"Delirium","f":"delirium.md","k":"md"},{"t":"Withdrawal: COWS Tool · CIWA-Ar Official Form & Training","f":"withdrawal.html","k":"tool"},{"t":"Decisional Capacity","f":"capacity.html","k":"tool"},{"t":"Consult Questions: Capacity, Delirium, Catatonia, Withdrawal","f":"exp_consult.md","k":"md"},{"t":"C-L: Emergencies, Tox & Capacity (Numbers)","f":"cl_reference.md","k":"md"},{"t":"Inpatient Systems & Med-Legal","f":"systems_medlegal.md","k":"md"}]},
 {"section":"Make a Plan","items":[{"t":"Psychopharmacology Primer","f":"psychopharm_primer.md","k":"md"},{"t":"Advanced Psychopharmacology","f":"adv_psychopharm.md","k":"md"},{"t":"Medication Monitoring & Labs","f":"med_monitoring.md","k":"md"},{"t":"Protocol Library","f":"protocol_library.md","k":"md"},{"t":"Algorithms & Decision Aids","f":"decision-aids.html","k":"tool"},{"t":"Interaction Cards — One Action","f":"interaction-cards.html","k":"tool"},{"t":"Nutrition & Metabolic Health","f":"nutrition_metabolic.md","k":"md"}]},
 {"section":"Communicate with Patients","items":[{"t":"What Do You Say Next?","f":"communication-practice.html","k":"tool"},{"t":"Psychotherapies at a Glance","f":"psychotherapy.md","k":"md"},{"t":"Motivational Interviewing","f":"motivational_interviewing.md","k":"md"},{"t":"Brief Psychotherapy on the Unit","f":"brief_psychotherapy.md","k":"md"},{"t":"Therapy on the Unit","f":"therapy_on_the_unit.md","k":"md"},{"t":"Five Good Minutes — Brief Psych Coach","f":"rp-brief-psych.html","k":"tool"},{"t":"Reflection & Identity","f":"reflection.html","k":"tool"}]},
 {"section":"Work with Family and Systems","items":[{"t":"Family Systems Practice","f":"family-systems.html","k":"tool"},{"t":"I Need Collateral: 10-Minute Workflow","f":"collateral_workflow.md","k":"md"},{"t":"Family & Discharge","f":"exp_family.md","k":"md"},{"t":"Family Meeting Playbook (90-min)","f":"family_playbook.md","k":"md"},{"t":"Family Therapy Modalities","f":"family_modalities.md","k":"md"}]},
 {"section":"Present and Work with the Team","items":[{"t":"Documentation & Oral Presentation","f":"doc_oral.md","k":"md"},{"t":"Treatment Team Rounding Prep","f":"oral.html","k":"tool"},{"t":"High-Yield Rounds Questions","f":"rounds_questions.md","k":"md"},{"t":"Post-Event Learning Huddle (2 min)","f":"rp-post-event-huddle.html","k":"tool"}]},
 {"section":"Practice and Exam Prep","items":[{"t":"Practice Questions — Question Bank","f":"question-bank-practice.html","k":"tool"},{"t":"One Patient, Six Weeks","f":"one-patient-six-weeks.html","k":"tool"},{"t":"Daily Review (Spaced Repetition)","f":"review.html","k":"tool","hidden":True},{"t":"Board-Style Question Bank","f":"shelf-mode.html","k":"tool","hidden":True},{"t":"Canon Quiz — 200-Paper Spine","f":"rp-canon-quiz.html","k":"tool"},{"t":"Rapid Review — Buzzwords","f":"rapid_review.md","k":"md"},{"t":"Landmark Trials — Listen & Test","f":"landmark_trials.md","k":"md"},{"t":"Anki Flashcard Decks","f":"anki.md","k":"md"}]},
 {"section":"Case of the Week","items":[{"t":"Index — All Cases","f":"cotw_index.md","k":"md"}]+[{"t":w["label"],"f":_cotw_slug(w,"res"),"k":"md"} for w in _cotw_weeks]},
 {"section":"Evidence and Reference","items":[{"t":"Evidence-Based Inpatient Psychiatry","f":"evidence_inpatient.md","k":"md"},{"t":"The Therapy Reading Room","f":"therapy_reading_room.md","k":"md"},{"t":"The Psychiatry Canon (200)","f":"canon_200.md","k":"md"},{"t":"Book Library","f":"book_library.md","k":"md"},{"t":"Podcast Library (Psychiatry & Psychotherapy)","f":"podcast_library.md","k":"md"}]+_HIDDEN_INHERITED},
 {"section":"Feedback","items":[{"t":"Improve this library — send feedback","f":"feedback.html","k":"tool"},{"t":"Faculty: Curate a rotation edition","f":"rotation-curator.html","k":"tool","hidden":True}]},
]
_navorder=["Orientation","Start the Encounter","Understand the Problem","Assess Safety and Acuity","Make a Plan","Communicate with Patients","Work with Family and Systems","Present and Work with the Team","Practice and Exam Prep","Case of the Week","Evidence and Reference","Feedback"]
nav=sorted(nav,key=lambda s:_navorder.index(s["section"]) if s["section"] in _navorder else 999)
welcome_compass.assert_nav_projection(nav,_week_cards,label="resident")

# ---------- SURFACE GOVERNANCE: nav annotation (resident) ----------
# Built from the SAME canonical ledger as MS3, but scoped to THIS site's own nav
# (site="resident") — resident's tool set differs from MS3's (drops the
# orientation video, adds the rp-* prototypes), so the document below only ever
# requires ledger records / built tool files for what resident actually ships.
sys.path.insert(0, os.path.dirname(HERE))
from surface_governance import (
    load_validated_ledger,
    build_site_document,
    annotate_navigation,
    apply_tool_status,
    write_site_document,
)

_ledger = load_validated_ledger(Path(LIB))
_surface_governance = build_site_document(_ledger, nav, "resident")
nav = annotate_navigation(nav, _surface_governance)
open(OUT + "/nav.json", "w", encoding="utf-8").write(
    json.dumps(nav, ensure_ascii=False)
)

# ---------- resident-only inline tool CTAs (topic_meta is shared, so patch OUT's copy) ----------
# agitation.md keeps its Decision Aids link and gains the Agitation Ladder trainer;
# brief_psychotherapy.md gains the Five Good Minutes coach. MS3's topic_meta is untouched.
_tmp=OUT+"/topic_meta.json"
if os.path.exists(_tmp):
    _tm=json.load(open(_tmp,encoding="utf-8"))
    try:
        _tm = welcome_compass.project_resident_welcome(_tm, welcome_compass.load_resident_welcome_overlay(LIB))
    except welcome_compass.CompassContractError as _overlay_error:
        print("BUILD ABORTED — resident Welcome overlay:", _overlay_error)
        raise SystemExit(1)
    def _addcta(key,cta):
        e=_tm.get(key,{})
        cur=e.get("cta")
        lst=cur if isinstance(cur,list) else ([cur] if cur else [])
        if not any(c.get("href")==cta["href"] for c in lst): lst.append(cta)
        e["cta"]=lst; _tm[key]=e
    _addcta("agitation.md",{"label":"Open the Agitation Ladder trainer","href":"tools/rp-agitation.html"})
    _addcta("agitation.md",{"label":"Run a 2-minute Post-Event Learning Huddle","href":"tools/rp-post-event-huddle.html"})
    _addcta("systems_medlegal.md",{"label":"Run a 2-minute Post-Event Learning Huddle","href":"tools/rp-post-event-huddle.html"})
    _addcta("brief_psychotherapy.md",{"label":"Open Five Good Minutes","href":"tools/rp-brief-psych.html"})
    open(_tmp,"w",encoding="utf-8").write(json.dumps(_tm,ensure_ascii=False))
# Per-case cotw topic_meta, derived from cotw_registry.json (see cotw_meta.py). Resident
# inherits the MS3 tree wholesale, so this also prunes the inherited *_ms3.md cotw keys.
import cotw_meta as _cotw_meta
_cm_add,_cm_skip,_cm_prune,_cm_untagged=_cotw_meta.inject(OUT,_cotw_weeks,"res")
print("cotw topic_meta: %d derived, %d hand-written kept, %d ms3 keys pruned"%(_cm_add,_cm_skip,_cm_prune))
if _cm_untagged: print("  NOTE no 'blueprint' in cotw_registry.json (case absent from the crosswalk): "+", ".join(_cm_untagged))

# The resident build begins as a copy of MS3, so replace every Front Door global only after
# resident extras, nav metadata, and topic-meta overlays are all complete. Reusing the copied
# MS3 literals would silently hide resident-only browse paths behind student data.
sys.path.insert(0, os.path.dirname(HERE))
from validate_tool_governance import (
    GovernanceError,
    build_governance_document,
    current_revision,
    validate_built_tool_inventory,
    write_atomic_json,
)
from validate_rotation_edition_catalog import (
    build_audience_projection as _build_rotation_projection,
    load_catalog as _load_rotation_catalog,
    load_governance as _load_rotation_governance,
    validate_catalog as _validate_rotation_catalog,
)
try:
    _core_revision=current_revision(Path(LIB))
except GovernanceError as error:
    raise SystemExit(f"tool governance INVALID — {error}") from error
try:
    _rotation_catalog=_load_rotation_catalog(Path(LIB))
    _rotation_governance=_load_rotation_governance(Path(LIB))
    _validate_rotation_catalog(_rotation_catalog,_rotation_governance,today=date.today())
    _rotation_projection=_build_rotation_projection(_rotation_catalog,_rotation_governance,"resident")
    _fd_payload=frontdoor_catalog.build_frontdoor_payload(
        "resident", json.load(open(LIB+"/curriculum.json",encoding="utf-8")), nav, _core_revision,
        _rotation_projection)
    _frontdoor_destinations=(OUT+"/index.html", OUT+"/tools/rotation-curator.html")
    for _frontdoor_destination in _frontdoor_destinations:
        frontdoor_catalog.inject_frontdoor_payload(
            _frontdoor_destination, _fd_payload,
            json.load(open(OUT+"/topic_meta.json",encoding="utf-8")),
            json.load(open(OUT+"/tool_registry.json",encoding="utf-8")))
        frontdoor_catalog.assert_catalog_resolver_injected(_frontdoor_destination, _rotation_projection["revision"])
except ValueError as _fd_error:
    print("BUILD ABORTED — Front Door payload:", _fd_error)
    raise SystemExit(1)
print("frontdoor payload:",sum(len(c["refs"]) for c in _fd_payload["curriculum"]["libraryColumns"]),"placed refs (resident)")
# ---------- MEDIA GUARD: drop <video> embeds whose asset was never exported (resident build) ----------
# Resident inherits ms3's already-guarded pages via copytree, but re-writes some content from
# source and adds its own media — so guard the final OUT before indexing.
from media_guard import strip_missing_media
strip_missing_media(OUT)

# ---- resident search index: same engine, same synonyms, same tool keywords as MS3 ----
common.build_search_index(nav, OUT, label="resident",
                          reachable_refs=frontdoor_catalog.reachable_refs(_fd_payload))

# Resident starts from the expanded MS3 artifact, then rebrands and replaces its Front Door
# payload. Prove none of those later transforms reacquired an unexpanded shell marker.
_crisis.assert_no_html_marker_file(OUT+"/index.html", "final resident Front Door shell index")

# Postcondition gate (architecture review rec 1.3): the rp-* tools used to bypass the
# page pass entirely and ship degraded. This makes that impossible to reintroduce.
common.assert_page_contract(OUT, label="resident")

# ---------- SURFACE GOVERNANCE: direct-tool status + public artifact (resident) ----------
# apply_tool_status() strips any prior injected block before writing its own — the
# copytree above inherited MS3's ALREADY-injected shared tools (e.g. mse.html)
# byte-for-byte, so this call replaces those inherited blocks with resident's own
# rather than stacking a second one alongside them. rp-* tools (never touched by
# the MS3 build) simply receive a fresh injection. Scoped to resident's OWN
# document (built from resident's OWN nav, above), so it only expects tool files
# this build actually ships.
apply_tool_status(Path(OUT) / "tools", _surface_governance)
write_site_document(Path(OUT) / "governance.json", _surface_governance)
print("surface governance: emitted", len(_surface_governance["items"]), "items (resident)")

print("RESIDENT build: out",OUT)
print(" sections:",[s["section"] for s in nav])

# ---------- TOOL GOVERNANCE ----------
# Build from canonical sources, then verify the final resident tools exactly match its IDs.
try:
    _governance, _governance_warnings = build_governance_document(
        Path(LIB), "resident", revision=_core_revision, enforce_expected_count=True
    )
    validate_built_tool_inventory(_governance, Path(OUT) / "tools", site="resident")
    write_atomic_json(Path(OUT) / "tool-governance.json", _governance)
except GovernanceError as error:
    raise SystemExit(f"tool governance INVALID — {error}") from error
for _warning in _governance_warnings:
    print(_warning)
print("tool governance: emitted", len(_governance["items"]), "items")

# ---------- SERVICE WORKER ----------
# Very end of the artifact steps: the resident build starts as a copytree of
# the finished MS3 build (which already has its own sw.js precaching MS3
# paths/tools), so this call MUST run last to overwrite the inherited ms3
# sw.js with a resident-specific manifest (rp-* tools, resident content tree).
common.emit_service_worker(OUT)
try:
    welcome_compass.assert_resident_output(OUT)
except welcome_compass.CompassContractError as _compass_error:
    print("BUILD ABORTED — resident Compass isolation:", _compass_error)
    raise SystemExit(1)
