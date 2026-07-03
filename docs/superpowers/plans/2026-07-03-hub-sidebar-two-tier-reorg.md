# Hub Sidebar Two-Tier Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse both teaching sites' single-tier sidebar (11–12 flat sections) into a two-tier accordion of ~7 top-level super-categories, consolidate all resident learner tools under one Practice section, and pair the Canon as a read→test unit.

**Architecture:** The sidebar shell `spa_index.html` is shared by both sites. A backward-compatible `group` tag on each nav section drives a new outer accordion tier in the renderer; sections without a `group` render top-level exactly as today. Each site's nav generator (`build_deploy.py` for MS3, `resident_section.py` for resident) emits its own group mapping. The search-index builder and QA gate keep iterating the flat section array unchanged.

**Tech Stack:** Python 3 (build scripts), vanilla JS + CSS in a single HTML shell (no framework), Node 18 (QA harness `check-static-site.mjs`), bash build wrapper.

## Global Constraints

- Indentation: match each file's existing style — the Python build scripts use terse 1-space/no-space idioms; keep new lines consistent with their neighbors. Do NOT reformat surrounding code.
- No new runtime dependencies. No CDN. The sites must run offline on ward wifi.
- localStorage keys must be `cw_*`-namespaced (enforced HARD by the QA gate for tools; follow the same convention for the new nav-group key: `cw_navgroup_v1`).
- Verification for every task is: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh <ms3|res>` exits 0 (QA gate passes, `hard:0`) PLUS the task's specific `nav.json` assertions. Browser checks are recommended where noted but the automated assertions are the gate.
- Both sites ship together; MS3 is not yet in active student use, so no staggered rollout.
- Commit after each task. Branch is `claude/dreamy-hugle-539db9` (already checked out in this worktree). Do NOT create a PR per task — one PR at the end.
- End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

**Paths (relative to repo root):**
- Renderer/shell: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- MS3 nav: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Resident nav: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- QA gate: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs`
- Build wrapper: `13_Faculty_Resources/_automation/site_build/build_and_check.sh`
- Build outputs (git-ignored): `_build/ms3`, `_build/res`

---

## Task 1: Two-tier accordion renderer in `spa_index.html`

Adds the outer group tier. Backward-compatible: with no `group` tags on any section (current state of both nav generators), the rail renders exactly as today. This task is verified against the **current** MS3 build (which has no group tags yet) to prove it changes nothing until data is added.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` (CSS block ~lines 40–52; nav render loop ~lines 379–398; `show()` open-path ~line 354)

**Interfaces:**
- Consumes: `nav.json` section objects, each `{section, items, group?, pinned?}`. `group` (string, optional) nests the section under a named outer accordion; `pinned` (bool, optional) defaults a top-level section to open.
- Produces: DOM structure `.navgroup-wrap > (.navgroupsec + .navgroupbody > .navsec-wrap*)` for grouped sections; ungrouped sections stay `.navsec-wrap` directly under `#nav`. Group open state persists in localStorage key `cw_navgroup_v1` (object `{groupName: bool}`).

- [ ] **Step 1: Add group CSS**

In the `<style>` block, immediately AFTER the existing `.navsec-wrap{margin-top:4px}` rule (currently line 40), insert:

```css
  .navgroup-wrap{margin-top:8px}
  .navgroupsec{display:flex;align-items:center;gap:7px;width:100%;text-align:left;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--text-mid);font-weight:800;padding:8px 6px;border-radius:6px}
  .navgroupsec:hover{background:var(--primary-light);color:var(--text)}
  .navgroupsec .chev{display:inline-block;font-size:.62rem;transition:transform .15s;flex:0 0 auto}
  .navgroup-wrap.open>.navgroupsec .chev{transform:rotate(90deg)}
  .navgroupbody{display:none;padding-left:8px;border-left:1px solid var(--border);margin-left:6px}
  .navgroup-wrap.open>.navgroupbody{display:block}
```

- [ ] **Step 2: Add the group-container helper and route sections into groups**

In the `fetch('nav.json')` handler, the current render loop is (lines ~379–398):

```javascript
  fetch('nav.json').then(function(r){return r.json()}).then(function(data){
    var navOpen=(function(){try{return JSON.parse(localStorage.getItem('cw_nav_v1'))||{}}catch(_){return {}}})();
    data.unshift({section:'Overview',items:[{t:'Home',f:'__home__',k:'special'},{t:'Start here',f:'__start__',k:'special'}]});
    data.forEach(function(sec){
      var wrap=document.createElement('div'); wrap.className='navsec-wrap';
      var h=document.createElement('button'); h.className='navsec'; h.type='button';
      h.innerHTML='<span class="chev" aria-hidden="true">▸</span><span class="navsec-t"></span>';
      h.querySelector('.navsec-t').textContent=sec.section;
      var grp=document.createElement('div'); grp.className='navgroup';
      sec.items.forEach(function(it){
        var b=document.createElement('button'); b.className='navitem';
        b.innerHTML=it.t+(it.k==='tool'?' <span class="tool-tag">tool</span>':'');
        b.setAttribute('data-f',it.f); b._item=it; b.onclick=function(){show(it,b)}; grp.appendChild(b);
      });
      var open = Object.prototype.hasOwnProperty.call(navOpen,sec.section) ? !!navOpen[sec.section] : (sec.section==='Start here'||sec.section==='Overview');
      wrap.classList.toggle('open',open); h.setAttribute('aria-expanded',String(open));
      h.onclick=function(){ var o=!wrap.classList.contains('open'); wrap.classList.toggle('open',o); h.setAttribute('aria-expanded',String(o));
        var st=(function(){try{return JSON.parse(localStorage.getItem('cw_nav_v1'))||{}}catch(_){return {}}})(); st[sec.section]=o; try{localStorage.setItem('cw_nav_v1',JSON.stringify(st))}catch(_){ } };
      wrap.appendChild(h); wrap.appendChild(grp); navEl.appendChild(wrap);
    });
```

Replace that entire block with (adds `navGroupOpen`, `GROUP_DEFAULT_OPEN`, `groupWraps`, the `groupBody()` helper, `pinned` default, and routes each `wrap` to its group body instead of always `navEl`):

```javascript
  fetch('nav.json').then(function(r){return r.json()}).then(function(data){
    var navOpen=(function(){try{return JSON.parse(localStorage.getItem('cw_nav_v1'))||{}}catch(_){return {}}})();
    var navGroupOpen=(function(){try{return JSON.parse(localStorage.getItem('cw_navgroup_v1'))||{}}catch(_){return {}}})();
    var GROUP_DEFAULT_OPEN={'Get oriented':true};
    var groupWraps={};
    function groupBody(name){
      if(groupWraps[name]) return groupWraps[name];
      var gw=document.createElement('div'); gw.className='navgroup-wrap';
      var gh=document.createElement('button'); gh.className='navgroupsec'; gh.type='button';
      gh.innerHTML='<span class="chev" aria-hidden="true">▸</span><span class="navsec-t"></span>';
      gh.querySelector('.navsec-t').textContent=name;
      var gb=document.createElement('div'); gb.className='navgroupbody';
      var gopen = Object.prototype.hasOwnProperty.call(navGroupOpen,name) ? !!navGroupOpen[name] : !!GROUP_DEFAULT_OPEN[name];
      gw.classList.toggle('open',gopen); gh.setAttribute('aria-expanded',String(gopen));
      gh.onclick=function(){ var o=!gw.classList.contains('open'); gw.classList.toggle('open',o); gh.setAttribute('aria-expanded',String(o));
        var st=(function(){try{return JSON.parse(localStorage.getItem('cw_navgroup_v1'))||{}}catch(_){return {}}})(); st[name]=o; try{localStorage.setItem('cw_navgroup_v1',JSON.stringify(st))}catch(_){ } };
      gw.appendChild(gh); gw.appendChild(gb); navEl.appendChild(gw);
      groupWraps[name]=gb; return gb;
    }
    data.unshift({section:'Overview',items:[{t:'Home',f:'__home__',k:'special'},{t:'Start here',f:'__start__',k:'special'}]});
    data.forEach(function(sec){
      var wrap=document.createElement('div'); wrap.className='navsec-wrap';
      var h=document.createElement('button'); h.className='navsec'; h.type='button';
      h.innerHTML='<span class="chev" aria-hidden="true">▸</span><span class="navsec-t"></span>';
      h.querySelector('.navsec-t').textContent=sec.section;
      var grp=document.createElement('div'); grp.className='navgroup';
      sec.items.forEach(function(it){
        var b=document.createElement('button'); b.className='navitem';
        b.innerHTML=it.t+(it.k==='tool'?' <span class="tool-tag">tool</span>':'');
        b.setAttribute('data-f',it.f); b._item=it; b.onclick=function(){show(it,b)}; grp.appendChild(b);
      });
      var open = Object.prototype.hasOwnProperty.call(navOpen,sec.section) ? !!navOpen[sec.section] : (sec.section==='Start here'||sec.section==='Overview'||!!sec.pinned);
      wrap.classList.toggle('open',open); h.setAttribute('aria-expanded',String(open));
      h.onclick=function(){ var o=!wrap.classList.contains('open'); wrap.classList.toggle('open',o); h.setAttribute('aria-expanded',String(o));
        var st=(function(){try{return JSON.parse(localStorage.getItem('cw_nav_v1'))||{}}catch(_){return {}}})(); st[sec.section]=o; try{localStorage.setItem('cw_nav_v1',JSON.stringify(st))}catch(_){ } };
      wrap.appendChild(h); wrap.appendChild(grp);
      (sec.group ? groupBody(sec.group) : navEl).appendChild(wrap);
    });
```

- [ ] **Step 3: Extend the `show()` open-path to open the enclosing group**

The current line (line ~354) is:

```javascript
    if(btn){ var _w=btn.closest&&btn.closest('.navsec-wrap'); if(_w){ _w.classList.add('open'); var _hh=_w.querySelector('.navsec'); if(_hh) _hh.setAttribute('aria-expanded','true'); } }
```

Replace it with (also opens the containing `.navgroup-wrap` so a search hit or deep-link inside a collapsed group reveals itself):

```javascript
    if(btn){ var _w=btn.closest&&btn.closest('.navsec-wrap'); if(_w){ _w.classList.add('open'); var _hh=_w.querySelector('.navsec'); if(_hh) _hh.setAttribute('aria-expanded','true'); var _gw=_w.closest&&_w.closest('.navgroup-wrap'); if(_gw){ _gw.classList.add('open'); var _gh=_gw.querySelector('.navgroupsec'); if(_gh) _gh.setAttribute('aria-expanded','true'); } } }
```

- [ ] **Step 4: Rebuild MS3 (no group tags yet) and confirm the renderer is inert**

Run:
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
```
Expected: ends with `✓ PASS (hard:0 ...)`. Because MS3 nav has no `group` tags yet, `groupBody()` is never called — the rail renders identically to before.

- [ ] **Step 5: (Recommended) Browser smoke-check backward-compat**

Serve and eyeball that the MS3 rail is unchanged:
```bash
python3 -m http.server 8935 --directory _build/ms3
```
Open `http://localhost:8935/`, confirm the sidebar still shows the same flat sections and they expand/collapse. Stop the server (Ctrl-C). (No group headers should appear — there are no group tags yet.)

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html
git commit -m "feat(sidebar): two-tier accordion renderer (inert until nav sections carry group tags)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Regroup the resident nav + consolidate tools + pair the Canon (`resident_section.py`)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py` (the `nav=[...]` array ~lines 96–128 and `_navorder` ~line 132)

**Interfaces:**
- Consumes: the `TOOLS` list already defined above the nav array (15 `(file, title)` tuples).
- Produces: `_build/res/nav.json` with 10 sections tagged so the renderer shows 7 top-level entries; all 18 learner tools live in the `Practice` section; `rp-canon-quiz` also cross-listed under `Evidence & the Canon`; `canon_200.md` appears once.

- [ ] **Step 1: Replace the resident `nav` array**

Find the `nav=[` block (starts ~line 96, ends at the closing `]` before `_navorder`). Replace the WHOLE array with the following. Changes: `group`/`pinned` tags added; `canon_200.md` removed from "Resident depth"; "Interactive tools" renamed "Practice" with the 3 `rp-*` tools appended; `rp-agitation` removed from "Acute & Safety"; `rp-brief-psych` removed from "Skills & reference"; "Evidence & reading" renamed "Evidence & the Canon" (keeps `rp-canon-quiz` as the cross-listed test half).

```python
nav=[
 {"section":"Start here","group":"Get oriented","items":[
   {"t":"Welcome — Resident Rotation","f":"welcome.md","k":"md"},
   {"t":"4-Week Rotation Plan","f":"rotation.md","k":"md"},
   {"t":"Core Reading List","f":"core_readings.md","k":"md"}]},
 {"section":"Resident depth","group":"Get oriented","items":[
   {"t":"Advanced Psychopharmacology","f":"adv_psychopharm.md","k":"md"},
   {"t":"Inpatient Systems & Med-Legal","f":"systems_medlegal.md","k":"md"},
   {"t":"Supervision, EPAs & Teaching","f":"supervision_teaching.md","k":"md"}]},
 {"section":"Core Topics","group":"Learn the topics","items":[{"t":"Differential Dx Scaffolds","f":"ddx.md","k":"md"},{"t":"Mood","f":"t_mood.md","k":"md"},{"t":"Psychosis","f":"t_psychosis.md","k":"md"},{"t":"Anxiety/Trauma/OCD","f":"t_anxiety.md","k":"md"},{"t":"Personality","f":"t_personality.md","k":"md"},{"t":"Substance Use","f":"t_sud.md","k":"md"},{"t":"Geriatric","f":"t_geri.md","k":"md"},{"t":"Perinatal","f":"t_perinatal.md","k":"md"},{"t":"Neurodevelopmental Disorders","f":"t_neurodev.md","k":"md"},{"t":"Eating Disorders","f":"t_eating.md","k":"md"},{"t":"Nutrition & Metabolic Health","f":"nutrition_metabolic.md","k":"md"}]},
 {"section":"Psychopharmacology","group":"Learn the topics","items":[{"t":"Psychopharmacology Primer","f":"psychopharm_primer.md","k":"md"},{"t":"Advanced Psychopharmacology","f":"adv_psychopharm.md","k":"md"},{"t":"Protocol Library","f":"protocol_library.md","k":"md"}]},
 {"section":"Skills & reference","group":"Learn the topics","items":[{"t":"Interview & MSE","f":"pg_interview.md","k":"md"},{"t":"Formulation & DDx","f":"pg_formulation.md","k":"md"},{"t":"Suicide Risk & Safety","f":"pg_suicide.md","k":"md"},{"t":"Documentation & Oral Presentation","f":"doc_oral.md","k":"md"},{"t":"Consult: Capacity/Delirium/Catatonia/Withdrawal","f":"exp_consult.md","k":"md"},{"t":"Family & Discharge","f":"exp_family.md","k":"md"},{"t":"Family Therapy Modalities","f":"family_modalities.md","k":"md"},{"t":"Family Meeting Playbook (90-min)","f":"family_playbook.md","k":"md"},{"t":"Motivational Interviewing","f":"motivational_interviewing.md","k":"md"},{"t":"Brief Psychotherapy on the Unit","f":"brief_psychotherapy.md","k":"md"},{"t":"High-Yield Rounds Questions","f":"rounds_questions.md","k":"md"}]},
 {"section":"Practice","items":[{"t":n,"f":f,"k":"tool"} for f,n in TOOLS]+[
   {"t":"Agitation Ladder — PRN Trainer","f":"rp-agitation.html","k":"tool"},
   {"t":"Five Good Minutes — Brief Psych Coach","f":"rp-brief-psych.html","k":"tool"},
   {"t":"Canon Quiz — 200-Paper Spine","f":"rp-canon-quiz.html","k":"tool"}]},
 {"section":"Acute & Safety","pinned":True,"items":[{"t":"Catatonia","f":"catatonia.md","k":"md"},{"t":"Delirium","f":"delirium.md","k":"md"},{"t":"Agitation & Restraint","f":"agitation.md","k":"md"},{"t":"C-L: Emergencies, Tox & Capacity (Numbers)","f":"cl_reference.md","k":"md"}]},
 {"section":"Evidence & the Canon","items":[{"t":"Evidence-Based Inpatient Psychiatry","f":"evidence_inpatient.md","k":"md"},{"t":"Landmark Trials — Listen & Test","f":"landmark_trials.md","k":"md"},{"t":"The Psychiatry Canon (200)","f":"canon_200.md","k":"md"},{"t":"Canon Quiz — 200-Paper Spine","f":"rp-canon-quiz.html","k":"tool"}]},
 {"section":"Books & Podcasts","group":"Reference","items":[{"t":"Book Library","f":"book_library.md","k":"md"},{"t":"Podcast Library (Psychiatry & Psychotherapy)","f":"podcast_library.md","k":"md"}]},
 {"section":"Faculty","group":"Reference","items":[{"t":"Review & Attest","f":"review-attest.html","k":"tool"}]},
]
```

- [ ] **Step 2: Replace `_navorder` to match the new top-level order**

Find the `_navorder=[...]` line (~line 132) and replace it with:

```python
_navorder=["Start here","Resident depth","Core Topics","Psychopharmacology","Skills & reference","Practice","Acute & Safety","Evidence & the Canon","Books & Podcasts","Faculty"]
```

- [ ] **Step 3: Build the resident site**

Run:
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```
Expected: ends with `✓ PASS (hard:0 ...)`. (Building `res` also rebuilds the `ms3` base first — that's expected.)

- [ ] **Step 4: Assert the resident nav structure**

Run:
```bash
python3 - <<'PY'
import json
nav=json.load(open('_build/res/nav.json'))
secs=[s['section'] for s in nav]
groups=[]
for s in nav:
    g=s.get('group')
    if g and (not groups or groups[-1]!=g): groups.append(g)
top=[]  # reconstruct top-level entries: each ungrouped section + each group (at first appearance)
seen=set()
for s in nav:
    g=s.get('group')
    if g:
        if g not in seen: seen.add(g); top.append('['+g+']')
    else: top.append(s['section'])
practice=[s for s in nav if s['section']=='Practice'][0]['items']
tools=[i['f'] for i in practice if i['k']=='tool']
allfiles=[i['f'] for s in nav for i in s['items']]
# nav.json holds 6 top-level entries; the renderer prepends a client-side "Overview" → 7 rendered.
assert len(top)==6, f"expected 6 nav.json top-level entries (7 rendered w/ Overview), got {len(top)}: {top}"
assert len(tools)==18, f"expected 18 tools in Practice, got {len(tools)}"
for t in ('rp-agitation.html','rp-brief-psych.html','rp-canon-quiz.html'):
    assert t in tools, f"{t} missing from Practice"
assert allfiles.count('canon_200.md')==1, "canon_200.md must appear exactly once"
assert allfiles.count('review-attest.html')==1 and [s for s in nav if s['section']=='Faculty'][0]['items'][0]['f']=='review-attest.html', "review-attest must be Faculty-only"
# canon read immediately precedes quiz in Evidence & the Canon
ec=[s for s in nav if s['section']=='Evidence & the Canon'][0]['items']
fs=[i['f'] for i in ec]
assert fs.index('canon_200.md')+1==fs.index('rp-canon-quiz.html'), "Canon(200) must immediately precede Canon Quiz"
# no tool stranded in Acute & Safety / Skills & reference
for name in ('Acute & Safety','Skills & reference'):
    sec=[s for s in nav if s['section']==name][0]
    assert all(i['k']!='tool' for i in sec['items']), f"{name} should carry no tools"
print("RES nav OK — 7 top-level:", top)
PY
```
Expected: prints `RES nav OK — 6 top-level: [...]` with no AssertionError. The 6 entries are the three groups (bracketed) plus Practice / Acute & Safety / Evidence & the Canon (bare); the rendered rail adds the client-side Overview for 7 visible.

- [ ] **Step 5: (Recommended) Browser check**

```bash
python3 -m http.server 8936 --directory _build/res
```
Open `http://localhost:8936/`. Confirm: three group headers (Get oriented, Learn the topics, Reference) plus standalone Practice / Acute & Safety / Evidence & the Canon; Get oriented expanded, Acute & Safety expanded; Practice lists all 18 tools; clicking a tool inside a collapsed group opens the group + section. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/resident_section.py
git commit -m "feat(sidebar): regroup resident nav, consolidate tools under Practice, pair the Canon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Regroup the MS3 nav (`build_deploy.py`)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py` (the `nav=[...]` array lines ~164–177 and `_navorder` line ~178)

**Interfaces:**
- Consumes: the `tools` list already defined above the nav array (used by the Interactive-tools list comprehension).
- Produces: `_build/ms3/nav.json` tagged so the renderer shows 7 top-level entries. No tool moves, no dedup, no Canon — MS3's tools are already consolidated.

- [ ] **Step 1: Add group/pinned tags and rename "Interactive tools" → "Practice"**

Replace the MS3 `nav=[` array (lines 164–177) with the following. Only two kinds of change: a `group`/`pinned` key added per section, and the "Interactive tools" section renamed to "Practice". Item lists are otherwise identical to the current file.

```python
nav=[
 {"section":"Start here","group":"Get oriented","items":[{"t":"Orientation Video (start here)","f":"orientation-video.html","k":"tool"},{"t":"Welcome to the Rotation","f":"welcome.md","k":"md"},{"t":"Core Reading List","f":"core_readings.md","k":"md"},{"t":"Orientation Packet","f":"orientation.md","k":"md"}]},
 {"section":"Six-Week Curriculum","group":"Get oriented","items":[{"t":t,"f":f,"k":"md"} for f,(_,t) in [("week%d.md"%i,(0,["Week 1 — Foundations","Week 2 — Mood/Psychosis/Pharm","Week 3 — Psychotherapy/Personality","Week 4 — Family/Systems/EE","Week 5 — Acute/Emergency","Week 6 — Integration/Exam"][i-1])) for i in range(1,7)]]},
 {"section":"Core Topics","group":"Learn the topics","items":[{"t":"Differential Dx Scaffolds","f":"ddx.md","k":"md"},{"t":"Mood","f":"t_mood.md","k":"md"},{"t":"Psychosis","f":"t_psychosis.md","k":"md"},{"t":"Anxiety/Trauma/OCD","f":"t_anxiety.md","k":"md"},{"t":"Personality","f":"t_personality.md","k":"md"},{"t":"Substance Use","f":"t_sud.md","k":"md"},{"t":"Geriatric","f":"t_geri.md","k":"md"},{"t":"Perinatal","f":"t_perinatal.md","k":"md"},{"t":"Neurodevelopmental Disorders","f":"t_neurodev.md","k":"md"},{"t":"Eating Disorders","f":"t_eating.md","k":"md"},{"t":"Neurocognitive (Dementia)","f":"t_neurocog.md","k":"md"},{"t":"Somatic Symptom & Related","f":"t_somatic.md","k":"md"},{"t":"Sleep-Wake Disorders","f":"t_sleep.md","k":"md"},{"t":"Dissociative Disorders","f":"t_dissociative.md","k":"md"},{"t":"Sexual, Paraphilic & Gender","f":"t_sexual.md","k":"md"},{"t":"Impulse-Control & Conduct","f":"t_impulse.md","k":"md"},{"t":"Adjustment Disorders","f":"t_adjustment.md","k":"md"},{"t":"Nutrition & Metabolic Health","f":"nutrition_metabolic.md","k":"md"},{"t":"Osteopathic (OMM) Resources","f":"omm_resources.md","k":"md"}]},
 {"section":"Psychopharmacology","group":"Learn the topics","items":[{"t":"Psychopharmacology Primer","f":"psychopharm_primer.md","k":"md"},{"t":"Protocol Library","f":"protocol_library.md","k":"md"},{"t":"ECT & Neuromodulation","f":"ect_neuromodulation.md","k":"md"}]},
 {"section":"Ethics, Law & Culture","group":"Learn the topics","items":[{"t":"Ethics & the Law: Confidentiality, Tarasoff, Reporting","f":"ethics_legal.md","k":"md"},{"t":"Culture, Disparities & Formulation","f":"cultural_psychiatry.md","k":"md"}]},
 {"section":"Practice","items":[{"t":n,"f":d,"k":"tool"} for s,d,n in tools]},
 {"section":"Acute & Safety","pinned":True,"items":[{"t":"Catatonia","f":"catatonia.md","k":"md"},{"t":"Delirium","f":"delirium.md","k":"md"},{"t":"Agitation & Restraint","f":"agitation.md","k":"md"}]},
 {"section":"Pocket guides","group":"Skills & exam","items":[{"t":"Interview & MSE","f":"pg_interview.md","k":"md"},{"t":"Formulation & DDx","f":"pg_formulation.md","k":"md"},{"t":"Suicide Risk & Safety","f":"pg_suicide.md","k":"md"}]},
 {"section":"Skills, cases & exam","group":"Skills & exam","items":[{"t":"Documentation & Oral Presentation","f":"doc_oral.md","k":"md"},{"t":"Capacity/Delirium/Catatonia/Withdrawal","f":"exp_consult.md","k":"md"},{"t":"Treatment Basics","f":"exp_tx.md","k":"md"},{"t":"Family & Discharge","f":"exp_family.md","k":"md"},{"t":"Family Therapy Modalities","f":"family_modalities.md","k":"md"},{"t":"Family Meeting Playbook (90-min)","f":"family_playbook.md","k":"md"},{"t":"Motivational Interviewing","f":"motivational_interviewing.md","k":"md"},{"t":"Brief Psychotherapy on the Unit","f":"brief_psychotherapy.md","k":"md"},{"t":"OSCE Stations","f":"osce.md","k":"md"},{"t":"Practice Cases","f":"cases.md","k":"md"},{"t":"COMAT & Shelf Review","f":"shelf.md","k":"md"},{"t":"High-Yield Rounds Questions","f":"rounds_questions.md","k":"md"}]},
 {"section":"Evidence & reading","group":"Evidence & reference","items":[{"t":"Weekly Reading Map","f":"reading_map.md","k":"md"},{"t":"Landmark Trials — Listen & Test","f":"landmark_trials.md","k":"md"},{"t":"Evidence-Based Inpatient Psychiatry","f":"evidence_inpatient.md","k":"md"}]},
 {"section":"Books & Podcasts","group":"Evidence & reference","items":[{"t":"MS3 Book Library","f":"book_library.md","k":"md"},{"t":"Podcast Library (Psychiatry & Psychotherapy)","f":"podcast_library.md","k":"md"}]},
 {"section":"Faculty","group":"Evidence & reference","items":[{"t":"Review & Attest","f":"review-attest.html","k":"tool"}]},
]
```

- [ ] **Step 2: Replace `_navorder`**

Replace the `_navorder=[...]` line (line ~178) with:

```python
_navorder=["Start here","Six-Week Curriculum","Core Topics","Psychopharmacology","Ethics, Law & Culture","Practice","Acute & Safety","Pocket guides","Skills, cases & exam","Evidence & reading","Books & Podcasts","Faculty"]
```

- [ ] **Step 3: Build MS3**

Run:
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
```
Expected: `✓ PASS (hard:0 ...)`.

- [ ] **Step 4: Assert the MS3 nav structure**

Run:
```bash
python3 - <<'PY'
import json
nav=json.load(open('_build/ms3/nav.json'))
top=[]; seen=set()
for s in nav:
    g=s.get('group')
    if g:
        if g not in seen: seen.add(g); top.append('['+g+']')
    else: top.append(s['section'])
# grouped sections must be contiguous (a group name can't restart after being interrupted)
runs=[]; prev=None
for s in nav:
    g=s.get('group')
    if g!=prev: runs.append(g); prev=g
assert len([g for g in runs if g is not None])==len(set(g for g in runs if g)), "group sections not contiguous"
# nav.json holds 6 top-level entries; the renderer prepends a client-side "Overview" → 7 rendered.
assert len(top)==6, f"expected 6 nav.json top-level entries (7 rendered w/ Overview), got {len(top)}: {top}"
assert [s for s in nav if s['section']=='Practice'], "Interactive tools must be renamed Practice"
assert any(s.get('pinned') and s['section']=='Acute & Safety' for s in nav), "Acute & Safety must be pinned"
print("MS3 nav OK — 6 top-level:", top)
PY
```
Expected: prints `MS3 nav OK — 7 top-level: [...]`, no AssertionError.

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_deploy.py
git commit -m "feat(sidebar): regroup MS3 nav into super-categories, rename Interactive tools → Practice

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Resident inline tool CTAs + multi-CTA template support + QA guard

Adds "Open the trainer →" buttons on the resident agitation and brief-psychotherapy pages, without breaking MS3 (which has no `rp-*` tools). `topic_meta.json` is a single shared file inherited by both sites, so the resident-only CTAs are injected into the resident build in `resident_section.py`, not the shared source. `buildTpl` is extended to render multiple CTAs so the existing agitation → Decision Aids link is preserved alongside the new trainer link.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` (`buildTpl` `m.cta` render, one line ~334)
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py` (add a topic_meta patch block after the content copy, before the search-index build ~line 135)
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` (add a `topic_meta.json` cta-target existence check)

**Interfaces:**
- Consumes: `_build/res/topic_meta.json` (inherited from the MS3 build via `copytree`).
- Produces: resident `topic_meta.json` where `agitation.md.cta` is a list `[decision-aids, rp-agitation]` and `brief_psychotherapy.md.cta` is `[rp-brief-psych]`. `buildTpl` renders each as a `.toolcta` button. QA gate HARD-fails if any `topic_meta` cta href points to a missing tool.

- [ ] **Step 1: Make `buildTpl` render one-or-many CTAs**

In `spa_index.html`, find this fragment inside `buildTpl` (line ~334):

```javascript
if(m.cta&&m.cta.href){ h+='<a class="toolcta" href="'+esc(m.cta.href)+'" target="_blank" rel="noopener">'+esc(m.cta.label||'Open tool')+' →</a>'; }
```

Replace it with (accepts a single cta object OR an array of them; existing single-object entries keep working):

```javascript
if(m.cta){ var _cx=Array.isArray(m.cta)?m.cta:[m.cta]; for(var _ci=0;_ci<_cx.length;_ci++){ var _c=_cx[_ci]; if(_c&&_c.href){ h+='<a class="toolcta" href="'+esc(_c.href)+'" target="_blank" rel="noopener">'+esc(_c.label||'Open tool')+' →</a>'; } } }
```

- [ ] **Step 2: Inject resident-only CTAs into the resident `topic_meta.json`**

In `resident_section.py`, immediately BEFORE the media-guard block (the line `# ---------- MEDIA GUARD: ...`, ~line 135), insert:

```python
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
```

- [ ] **Step 3: Add a topic_meta cta-target check to the QA gate**

In `check-static-site.mjs`, find the section-4 block that ends with the `reviewed.json` loop (the `rvPath` block, ~lines 102–106). Immediately AFTER that block, insert:

```javascript
/* ---------- 4b. topic_meta.json cta hrefs must resolve to a shipped tool/page ---------- */
if (existsSync(tmPath) && parsed[tmPath]) {
  for (const [key, m] of Object.entries(parsed[tmPath])) {
    if (!m || typeof m !== 'object' || !m.cta) continue;
    const ctas = Array.isArray(m.cta) ? m.cta : [m.cta];
    for (const c of ctas) {
      if (!c || !c.href) continue;
      const rel = c.href.replace(/^\.?\//, '');
      if (!existsSync(p(rel))) H(`topic_meta cta for ${key} → missing target: ${c.href}`);
    }
  }
}
```

(`tmPath` and `parsed` are already defined earlier in the file; this reuses them.)

- [ ] **Step 4: Rebuild both sites and confirm the QA gate passes**

Run:
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```
Expected: both end `✓ PASS (hard:0 ...)`. The new cta check confirms MS3's `agitation.md` cta (Decision Aids) still resolves and the resident build's added `rp-agitation.html` / `rp-brief-psych.html` targets exist.

- [ ] **Step 5: Assert the resident CTAs landed and MS3 is untouched**

Run:
```bash
python3 - <<'PY'
import json
res=json.load(open('_build/res/topic_meta.json'))
ms3=json.load(open('_build/ms3/topic_meta.json'))
def hrefs(m,k):
    c=m.get(k,{}).get('cta'); c=c if isinstance(c,list) else ([c] if c else [])
    return [x['href'] for x in c]
assert 'tools/rp-agitation.html' in hrefs(res,'agitation.md'), "resident agitation trainer CTA missing"
assert 'tools/decision-aids.html' in hrefs(res,'agitation.md'), "resident agitation must keep Decision Aids CTA"
assert 'tools/rp-brief-psych.html' in hrefs(res,'brief_psychotherapy.md'), "resident brief-psych CTA missing"
assert 'tools/rp-agitation.html' not in hrefs(ms3,'agitation.md'), "MS3 must NOT get the resident-only trainer CTA"
print("CTA patch OK — res agitation:", hrefs(res,'agitation.md'))
PY
```
Expected: prints `CTA patch OK ...`, no AssertionError.

- [ ] **Step 6: (Recommended) Browser check the CTA**

Serve `_build/res`, open the Agitation & Restraint page (Acute & Safety → Agitation & Restraint), confirm two CTA buttons render ("Open the Decision Aids →" and "Open the Agitation Ladder trainer →") and the trainer button opens the tool.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/resident_section.py 13_Faculty_Resources/_automation/site_build/check-static-site.mjs
git commit -m "feat(sidebar): resident inline tool CTAs (multi-cta template + topic_meta patch + QA guard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full-site integration verification

Final gate across both sites together — no new code, just confirm the whole reorg holds end to end and nothing regressed.

**Files:** none (verification only).

- [ ] **Step 1: Clean rebuild both sites through the QA gate**

Run:
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && \
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```
Expected: both end `✓ PASS (hard:0 ...)`.

- [ ] **Step 2: Confirm no nav item points at a missing target on either site**

Run:
```bash
python3 - <<'PY'
import json, os
for site in ('ms3','res'):
    root=f'_build/{site}'
    nav=json.load(open(f'{root}/nav.json'))
    for s in nav:
        for it in s['items']:
            if it['k']=='special': continue
            sub='tools' if it['k']=='tool' else 'content'
            assert os.path.exists(f'{root}/{sub}/{it["f"]}'), f'{site}: nav → missing {it["f"]}'
    print(site, "nav targets all resolve")
PY
```
Expected: `ms3 nav targets all resolve` / `res nav targets all resolve`.

- [ ] **Step 3: (Recommended) Cross-site browser parity check**

Serve each build in turn; confirm both rails show 7 top-level entries, groups expand/collapse and persist across reload (toggle a group, reload, it stays), Acute & Safety is open by default on both, and a search hit inside a collapsed group reveals its group + section. Resident only: the Agitation page shows both CTAs.

- [ ] **Step 4: Final commit (only if Step 3 surfaced a doc note; otherwise skip)**

If nothing changed, there is nothing to commit — the task's deliverable is the green verification above.

---

## Notes for the executor

- **Order matters:** Task 1 (renderer) must land before Tasks 2–3 (which add the `group` tags the renderer consumes). Tasks 2 and 3 are independent of each other. Task 4 depends on Task 1's `buildTpl` change living in the same file — do Task 4 after Task 1.
- **Do not touch** `_build/**` by hand — it is a build artifact, regenerated by the build scripts and git-ignored.
- **The two `rp-canon-quiz.html` nav entries in the resident nav are intentional** (once in Practice, once as the Canon "test" half) — this is the approved cross-listing, not a bug.
- If any `build_and_check.sh` run prints `✗ FAIL` with a HARD finding, read the finding, fix the offending file, and re-run the same command before committing — the QA gate is the publish gate.
