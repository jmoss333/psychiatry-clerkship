# RESIDENT · Curriculum content — volume 9

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Practice and Exam Prep

---

## Daily Review (Spaced Repetition)

- **Slug:** `review.html` · **Type:** tool · **Sidebar:** hidden (deep link only)
- **Source:** `07_Evidence_and_Reading/Landmark_Trials/review.html`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Daily Review — Spaced Repetition Reviewed by Joshua Moss, MD on 2026-07-05
- Skip to content

**Authored clinical strings (42):**

- t lean on position memory. Letters are display-position-derived (String.fromCharCode(65+pos)), so relabeling is automatic. */ /* FNV-1a seed + xorshift32 steps — NOT a bare LCG: an LCG
- s inject_shared_snippets() expands at build time (same mechanism as crisis blocks). Grades are the strings
- . Semantics: ease floor 1.3, Easy ease ceiling 4.0, interval cap 365 d, lapse halves the interval (min 1 d) and re-dues the card immediately. Requires `var DAY = 86400000` in scope. Behaviour is pinned by tests/sm2-behavior.test.mjs; consumer wiring is pinned by tests/family-srs-parity.test.mjs. applyGrade(card, grade, opts) — opts is optional; opts.fuzzKey (string, usually the card id) enables deterministic ±15% interval fuzz (see sm2Fuzz below) so cohort-seeded cards de-synchronize instead of avalanching due on the same day. Omitting opts (or fuzzKey) is byte-identical to the pre-fuzz grader — every existing caller keeps its exact legacy schedule until it opts in. cw_srs_v1 STATS CONTRACT — who may write stats.seen / stats.correct: - question-bank-practice.html srsUpdate(): YES (ground-truth correctness). - review.html grade(): YES (ground-truth correctness). - family-systems-practice.html srsGradeFamily(): NO — cards only. A self-rating has no ground truth, and review.html renders Retention as correct/seen. - Practice sims write cw_practice_events_v1 instead — never cw_srs_v1.stats. Per-event history (chosen grade vs. suggested grade, requeue flag) is a separate concern logged to cw_calib_v1 via calibLog() (build-injected from calib_log.js, the CALIB_LOG marker) — this file
- s own bounds. */ function sm2Fuzz(ivl, key, reps){ if(ivl < 3 || !key) return ivl; var h = 2166136261, s = key +
- + reps; for(var i=0;i >> 0; } var f = ((h % 2001) / 1000) - 1; /* [-1, 1] */ return Math.min(365, Math.max(1, Math.round(ivl + ivl * 0.15 * f))); } function applyGrade(card, grade, opts){ /* SM-2 variant: ease floor 1.3, interval cap 365 d */ var c = Object.assign({}, card); var fuzzKey = opts && opts.fuzzKey; c.reps = (c.reps||0) + 1; if(c.ivl===0){ /* first encounter */ if(grade===
- ){ c.lapses=(c.lapses||0)+1; c.ivl=1; c.due=Date.now(); } else if(grade===
- ){ c.ivl=1; c.due=Date.now()+DAY; } else if(grade===
- ){ c.ivl=1; c.due=Date.now()+DAY; } else { c.ivl=sm2Fuzz(4, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } /* Easy */ } else { if(grade===
- ){ /* Again is never fuzzed — lapses re-due immediately regardless of fuzzKey. */ c.lapses=(c.lapses||0)+1; c.ease=Math.max(1.3, (c.ease||2.5)-0.2); c.ivl=Math.max(1, Math.round(c.ivl*0.5)); c.due=Date.now(); } else if(grade===
- ){ c.ease=Math.max(1.3, (c.ease||2.5)-0.15); c.ivl=Math.max(1, Math.round(c.ivl*1.2)); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+Math.min(365,c.ivl)*DAY; } else if(grade===
- ){ c.ivl=Math.max(1, Math.round(c.ivl*(c.ease||2.5))); c.ivl=Math.min(365,c.ivl); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } else { /* Easy */ c.ease=Math.min(4, (c.ease||2.5)+0.15); c.ivl=Math.max(1, Math.round(c.ivl*(c.ease)*1.3)); c.ivl=Math.min(365,c.ivl); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } } c.last=Date.now(); return c; } /* Calibration ledger cw_calib_v1 — append-only judgment-vs-outcome history. Enum fields + existing ids ONLY; no free text ever (PHI firewall is structural). cw_qb_v1 stays the current-state store; this is the history store; no reader joins both into one number (spec: 2026-08-05-shared-state-spine-design.md). Writers: qbank qbRecord (re flag), review.html grade() (sug/rq). cw_practice_events_v1 remains reserved for sim process events — a different thing. */ function calibLog(evt){ try{ var S={qb:[
- ]}; if(!evt || !S[evt.s] || S[evt.s].indexOf(evt.p)<0) return; var d=null; try{ d=JSON.parse(localStorage.getItem(
- ); }catch(_e){ d=null; } if(!d || d.v!==1 || !Array.isArray(d.qb) || !Array.isArray(d.rev)) d={v:1,qb:[],rev:[]}; var ring=d[evt.s===
- ]; ring.push(evt); while(ring.length>400) ring.shift(); localStorage.setItem(
- , JSON.stringify(d)); }catch(_){ } } function calibRead(){ try{ var d=JSON.parse(localStorage.getItem(
- ); if(d && d.v===1 && Array.isArray(d.qb) && Array.isArray(d.rev)) return d; }catch(_){ } return {v:1,qb:[],rev:[]}; } function calibClear(){ try{ localStorage.removeItem(
- ); }catch(_){ } } /* Rotation phase policy — cw_shelf_date finally governs the study diet. shelfDaysUntil() is THE local-midnight date helper: spa_index.html
- s range. Copy rule: labels ship to both sites — audience-neutral, "Exam", never "Shelf". */ function shelfDaysUntil(shelfStr, nowMs){ if(!shelfStr) return null; var t=new Date(shelfStr+
- ).getTime(); if(isNaN(t)) return null; return Math.ceil((t-(nowMs||Date.now()))/86400000); } function phasePolicy(nowMs){ var shelf=null; try{ shelf=localStorage.getItem(
- ); }catch(_){ } var days=shelfDaysUntil(shelf, nowMs); if(days===null) return {phase:
- }; if(days<0) return {phase:
- }; if(days<=7) return {phase:
- }; if(days<=14)return {phase:
- }; if(days<=28)return {phase:
- }; } /* localDayStr()/localDayIndex() are the front door
- s queue-build call — patching only one leaves the other unthrottled. An explicit learner choice (setNewPerDay, which sets settings.userSet) always wins over the rotation-phase cap; phasePolicy() itself never throws, but the try/catch keeps this helper safe even if that contract ever changes. */ function effectiveNewPerDay(s){ var set=(s.settings&&s.settings.newPerDay)||12; if(s.settings&&s.settings.userSet) return set; /* explicit choice always wins */ var cap=12; try{ cap=phasePolicy().newPerDayCap; }catch(_){ } return Math.min(set, cap); } var gradedThisSession={}; // session-local: has card.id already been graded once this session? (a requeued Again-card
- s rq flag). Reset in start(). function maturity(st){if(!st||!st.reps)return "new";if(st.ivl>=21)return "mature";if(st.lapses&&st.ivl 0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;} /* ---------- theme ---------- */ function toggleTheme(setTheme){var nx=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",nx);try{localStorage.setItem("cw_theme",nx);}catch(_){ } setTheme(nx); if(framed){try{window.parent.postMessage({type:"theme",mode:nx},"*");}catch(_){ }}} function App(){ var ld=useState(null),cards=ld[0],setCards=ld[1]; var er=useState(false),err=er[0],setErr=er[1]; var sv=useState(loadS()),store=sv[0],setStore=sv[1]; var ses=useState(null),sess=ses[0],setSess=ses[1]; // {queue,pos,chosen,revealed,reviewed,correct,fresh} var th=useState((document.documentElement.getAttribute("data-theme")==="dark")?"dark":"light"),theme=th[0],setTheme=th[1]; var tick=useState(0),setTick=tick[1]; var sessRef=useRef(null); sessRef.current=sess; useEffect(function(){ Promise.all([ fetch("quizzes.json?v=f01d67b4b5f1").then(function(r){return r.ok?r.json():{decks:[]};}).catch(function(){return {decks:[]};}), fetch("../topic_meta.json").then(function(r){return r.ok?r.json():{};}).catch(function(){return {};}) ]).then(function(res){ var j=res[0]||{}, tm=res[1]||{}, out=[]; (j.decks||[]).forEach(function(d){ (d.questions||[]).forEach(function(q,i){ if(!q||!q.q||!q.o)return; out.push({id:d.id+"#"+i,deck:d.id,deckTitle:d.title||d.id,q:q.q,o:q.o,audio:d.audio||null,audioDur:d.audioDur||null}); }); }); function pretty(k){ return k.replace(/^t_/,"").replace(/\.md$/,"").replace(/_/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();}); } Object.keys(tm).forEach(function(k){ if(k.charAt(0)==="_")return; var m=tm[k]; if(m&&m.quiz&&m.quiz.q&&m.quiz.o&&m.quiz.o.length){ out.push({id:"TOPIC#"+k,deck:"TOPIC",deckTitle:"Topic · "+pretty(k),q:m.quiz.q,o:m.quiz.o.map(function(o){return {t:o.t,c:!!o.c,fb:(o.c?(m.quiz.why||""):"")};})}); } }); if(!out.length){ setErr(true); return; } setCards(out); }).catch(function(){setErr(true);}); },[]); useEffect(function(){ function onMsg(ev){var d=ev.data||{};if(d.type==="theme"&&(d.mode==="dark"||d.mode==="light")){document.documentElement.setAttribute("data-theme",d.mode);setTheme(d.mode);}} window.addEventListener("message",onMsg); return function(){window.removeEventListener("message",onMsg);}; },[]); useEffect(function(){ function onKey(ev){ var s=sessRef.current; if(!s)return; var k=ev.key; if(!s.revealed){ var n=parseInt(k,10); if(n>=1&&n<=s.card.o.length){choose(optOrder(s.card)[n-1]);} } else { if(k==="1")grade(0); else if(k==="2")grade(1); else if(k==="3")grade(2); else if(k==="4")grade(3); } } window.addEventListener("keydown",onKey); return function(){window.removeEventListener("keydown",onKey);}; },[]); function persist(s){saveS(s);setStore(Object.assign({},s));} /* dashboard metrics */ function metrics(){ var now=Date.now(),due=0,neu=0,learn=0,young=0,mature=0,seen=0; if(cards){ var s=rollDay(loadS()); cards.forEach(function(c){var st=s.cards[c.id]; if(!st){neu++;return;} seen++; var m=maturity(st); if(m==="mature")mature++; else if(m==="young")young++; else learn++; if(st.due<=now)due++; }); } var newRemain=cards?Math.max(0,effectiveNewPerDay(store)-(rollDay(loadS()).day.newToday||0)):0; return {due:due,neu:neu,newRemain:Math.min(newRemain,neu),learn:learn,young:young,mature:mature,seen:seen}; } function start(ahead){ var s=rollDay(loadS()); var now=Date.now(); var due=[],neu=[],fut=[]; cards.forEach(function(c){var st=s.cards[c.id]; if(!st)neu.push(c); else if(st.due<=now)due.push(c); else fut.push([c,st.due]);}); /* Overdue-first: sort by how overdue each card is (ratio, not raw days) so long-interval cards that are only slightly late don
- Reset all spaced-repetition progress? This clears your review schedule and streak. This also clears your calibration history. Reading progress elsewhere is unaffected.
- Spaced repetition · Joshua Moss, MD
- Could not load the question bank (quizzes.json). Open this tool from the hub so it can find its data, then try again.
- Loading the question bank…
- s calibLog event via closure var fbOpt=c.o[sess.chosen]||{}; var corrOpt=c.o[ci]||{}; var isNew=!loadS().cards[c.id]; return e("div",{className:"wrap"},head, e("div",{className:"sess"}, e("div",{className:"sbar"},e("i",{style:{width:pctp+"%"}})), e("div",{className:"sinner"}, e("div",{className:"smeta"}, e("span",{className:"deckchip"+(isNew?" snew":"")}, isNew?"New":"Review"), e("span",{className:"deckchip",style:{background:"var(--bg-alt)",color:"var(--text-light)"}}, c.deckTitle.length>42?c.deckTitle.slice(0,40)+"…":c.deckTitle), e("span",{className:"scount"}, (sess.pos+1)+" / "+sess.total)), e("div",{className:"qtext"}, c.q), c.audio? e("details",{className:"oeaudio"}, e("summary",null,"🎧 Listen — paper overview"+(c.audioDur?(" · "+c.audioDur):"")), e("audio",{controls:true,preload:"none",src:"../audio_oe/"+c.audio,"aria-label":"Paper overview audio"})) : null, e("div",{className:"opts"}, optOrder(c).map(function(oi,pos){ var o=c.o[oi]; var cls="opt"; if(sess.revealed){ if(oi===ci)cls+=" correct"; else if(oi===sess.chosen)cls+=" wrong"; else cls+=" dim"; } return e("button",{key:oi,className:cls,disabled:sess.revealed,onClick:function(){choose(oi);}}, e("span",{className:"kx"}, String.fromCharCode(65+pos)), e("span",null,o.t)); })), sess.revealed? e("div",{className:"fb"}, e("b",null, gotIt?"✓ Correct. ":"✗ Not quite. "), (fbOpt.fb||corrOpt.fb||"") ) : null, e("div",{className:"visually-hidden","aria-live":"polite","aria-atomic":"true"}, sess.revealed ? (gotIt?"Correct. ":"Not quite. ")+(fbOpt.fb||corrOpt.fb||"") : ""), sess.revealed? e("div",{className:"grades"}, e("button",{className:"gr again"+(sug===
- ?" sug":""),onClick:function(){grade(0);}},"Again",e("span",{className:"gk"},"<10m")), e("button",{className:"gr hard",onClick:function(){grade(1);}},"Hard",e("span",{className:"gk"},"1")), e("button",{className:"gr good"+(sug===
- Missed items can only be graded Again or Hard
- Pick the best answer (or press 1–
- Nothing is due right now and you’ve hit today’s new-card limit. Come back tomorrow, or study ahead below.
- Spaced repetition schedules each board-style question to return just before you’d forget it. A few minutes a day beats cramming. Grade yourself honestly.
- Each question carries its own schedule. Answer, then grade:
- (missed — comes back this session),
- . Correct, confident cards stretch further out; missed ones come back soon. Questions are drawn from the hub’s board-style bank (
- Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.
- Spacing schedule is stored only in this browser.

---

## Board-Style Question Bank

- **Slug:** `shelf-mode.html` · **Type:** tool · **Sidebar:** hidden (deep link only)
- **Source:** `07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Shelf Mode — Exam Simulation Reviewed by Joshua Moss, MD on 2026-07-05
- Skip to content

**Authored clinical strings (73):**

- Strong — exam-ready range.
- Solid — tighten the misses.
- Passing range — keep drilling.
- Psychopharm & Med Emergencies
- t label a draft mid-block without breaking the simulation, so the conservative subset is the attested 142. Categories map onto the existing BLUEPRINT topic regexes. */ var CAT_TOPIC={mood:"Mood",psychosis:"Psychosis",anxiety:"Anxiety, OCD & Trauma",substance:"Substance Use",pharm:"Psychopharm & Med Emergencies",neurocog:"Delirium, Dementia & MCI",personality:"Personality",childdev:"Child & Adolescent",otherdx:"Somatic & Related",safety:"Psychiatric Emergencies",ethics:"Interview, Ethics & Law",relational:"Relational & Family"}; function bankPool(data){ var out=[]; (((data&&data.items)||[])).forEach(function(it){ if(it.status!=="attested") return; if(!it.stem||!Array.isArray(it.options)||it.options.length<2) return; var hasCorrect=false; it.options.forEach(function(op){ if(op&&op.c)hasCorrect=true; }); if(!hasCorrect) return; /* Options are shuffled ONCE here (bank storage order is authoring order — the draft pool is known to lean on first-position answers) and letters relabel automatically because every render site derives them from array index (KEYS[i]). Correct option explains via the item
- A 26-year-old woman is admitted after 5 days of decreased need for sleep, rapid speech, increased spending, and a belief that she has been chosen to reform the hospital. She has had two prior depressive episodes treated with sertraline. On exam she is irritable with pressured speech and flight of ideas. Which of the following is the most appropriate next step?
- Continue sertraline and add cognitive behavioral therapy
- Antidepressant monotherapy can sustain or worsen mania; the priority is to stop it and start an antimanic agent.
- Discontinue sertraline and start a mood stabilizer or second-generation antipsychotic
- Correct — acute mania (bipolar I): stop the antidepressant, begin lithium/valproate or an SGA, and protect sleep.
- Start fluoxetine for treatment-resistant depression
- The presentation is mania, not depression; an antidepressant is contraindicated.
- Obtain brain MRI before initiating any treatment
- Classic mania with prior mood episodes does not require imaging before treatment; do not delay antimanic therapy.
- Begin lorazepam as monotherapy
- A benzodiazepine is adjunctive for agitation/sleep but does not treat the manic episode.
- Acute mania: stop the antidepressant, start a mood stabilizer or SGA, and protect sleep.
- A 30-year-old man on fluoxetine is brought in 8 hours after a friend gave him tramadol for back pain. He is agitated and diaphoretic. Temperature is 39.1°C, heart rate 124. Exam shows hyperreflexia and inducible clonus, greater in the lower extremities. Which of the following is the most likely diagnosis?
- Correct — rapid onset after adding a serotonergic agent (tramadol), with hyperthermia, autonomic instability, and neuromuscular hyperexcitability (clonus, hyperreflexia). Stop the agents, supportive care, consider cyproheptadine.
- Neuroleptic malignant syndrome
- NMS follows dopamine antagonists, evolves over days, and features 'lead-pipe' rigidity and bradyreflexia — not clonus/hyperreflexia.
- Anticholinergic toxidrome gives dry skin, absent bowel sounds, and normal reflexes — not diaphoresis with clonus.
- Malignant hyperthermia is triggered by volatile anesthetics/succinylcholine, not oral serotonergics.
- Sympathomimetic intoxication
- Stimulant toxicity can mimic this but lacks the prominent clonus/hyperreflexia and the clear serotonergic trigger.
- Serotonin syndrome = serotonergic trigger + hyperthermia + clonus/hyperreflexia (lower-limb predominant); NMS = dopamine blocker + rigidity + hyporeflexia over days.
- A 52-year-old man admitted for pancreatitis becomes tremulous and diaphoretic on hospital day 2, with heart rate 116, blood pressure 168/98, and visual misperceptions. He reports drinking a pint of vodka daily until admission. Which of the following is the most appropriate management?
- Symptom-triggered benzodiazepine dosing with CIWA-Ar monitoring, plus thiamine
- Correct — alcohol withdrawal: benzodiazepines (often CIWA-Ar–guided) are first-line, with thiamine to prevent Wernicke encephalopathy.
- Antipsychotics lower the seizure threshold and do not treat the underlying GABA/glutamate dysregulation; they are at most adjunctive for agitation.
- Intravenous dextrose before any other intervention
- Give thiamine before/with glucose in at-risk patients — a glucose load alone can precipitate Wernicke encephalopathy.
- Physical restraints and observation
- Restraints do not treat withdrawal and can worsen autonomic arousal; pharmacologic treatment is needed.
- Clonidine may blunt autonomic signs but does not prevent withdrawal seizures or delirium tremens.
- Alcohol withdrawal: benzodiazepines (CIWA-Ar–guided) first-line; give thiamine before glucose.
- A 78-year-old woman is inattentive and intermittently drowsy two days after hip surgery. Her family says she was cognitively intact at baseline; symptoms fluctuate and worsen at night. She is on oxycodone and diphenhydramine for sleep. Which of the following is the most appropriate first step?
- Identify and treat underlying causes and remove deliriogenic medications
- Correct — acute, fluctuating inattention with altered arousal is delirium. First-line is to find and fix the cause (pain meds, anticholinergics, infection, metabolic) and use nonpharmacologic measures.
- Start a scheduled long-acting benzodiazepine
- Benzodiazepines worsen delirium (except in alcohol/benzo withdrawal) and increase fall risk.
- Begin donepezil for cognitive decline
- Cholinesterase inhibitors treat chronic dementia, not acute delirium, and have no role here.
- Obtain an outpatient neuropsychology referral
- This is an acute medical problem requiring inpatient workup, not deferred testing.
- Reassure the family this is expected post-operative confusion and observe
- Delirium signals an underlying disturbance and predicts poor outcomes; it requires active workup, not watchful waiting.
- Delirium is a medical emergency: treat the cause and stop deliriogenic drugs; avoid benzodiazepines unless withdrawal-related.
- A 60-year-old man with diabetes and a necrotic foot refuses a recommended amputation. He can describe the gangrene, the risk of fatal sepsis without surgery, the option of amputation, and explains he would rather risk death than lose his leg, citing consistent long-held values. He has no psychosis or cognitive deficit. Which of the following best describes his decision-making capacity?
- He has capacity to refuse the amputation
- Correct — he demonstrates the four abilities (understanding, appreciation, reasoning, and a stable choice). Capacity is decision-specific; a 'wrong-seeming' choice with intact reasoning is still a capacitated refusal.
- He lacks capacity because the refusal is medically dangerous
- Capacity is about the process of decision-making, not whether the choice matches the medical recommendation.
- He lacks capacity and a guardian should consent to surgery
- There is no impairment in the four abilities; overriding a capacitated refusal would violate autonomy.
- Capacity cannot be assessed without neuropsychological testing
- Capacity is a clinical, decision-specific bedside determination, not a test score.
- He has capacity only if he agrees to surgery
- Capacity does not depend on agreeing with the team; that reasoning is circular.
- Capacity is decision-specific and rests on four abilities; a high-risk refusal with intact reasoning is still capacitated.
- Could not load the question bank (question_bank.json).
- Loading the question bank…
- Optional practice · exam simulation
- A timed, blueprint-weighted vignette set that mirrors the psychiatry COMAT / shelf. Choose your length, topics, and pacing. Single best answer, with feedback and a teaching point on every item.
- The attested question bank didn't load, so this is running on a small set of sample items so you can see how it works. Reload when you're back online for the full blueprint-weighted exam.
- Tutor — feedback after each
- Tip: press 1–5 to answer, Enter to advance.
- Optional exam-prep simulation. Items are educational and use fictional composites only (no patient information). Verify management against current guidelines and your team. Progress is saved only in this browser.
- Joshua Moss, MD | Psychiatrist
- Nothing to review — every item correct.
- Joshua Moss, MD | Psychiatrist · Educational simulation; fictional composites only. Verify management against current guidelines.
- End this set and discard progress?
- Educational simulation; fictional composites only (no patient information). Joshua Moss, MD | Psychiatrist

---

## Canon Quiz — 200-Paper Spine

- **Slug:** `rp-canon-quiz.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `_prototypes/canon-quiz/rp-canon-quiz.html`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Canon Quiz — 200-Paper Spine Reviewed by Joshua Moss, MD on 2026-07-05
- Skip to content ◐

**Authored clinical strings (10):**

- Audio unavailable offline / outside the site.
- Could not load the question bank (quizzes.json). This tool runs on the site (served over HTTP); opened directly from disk, the browser blocks the data fetch — use the served version or the preview build.
- Evidence & reading · Canon spine
- Canon Quiz — the 200-Paper Spine
- Work the landmark canon by paper: listen to the summary, then drill the deck. Surfaces the existing question bank (
- decks). Educational; confirm any clinical specifics against current guidance and local policy.
- · progress saved on this device only
- The Psychiatry Canon (200)
- . Spaced-repetition review lives in the Daily Review tool.
- Perfect set — nicely done.

---

## Rapid Review — Buzzwords

- **Slug:** `rapid_review.md` · **Type:** md · **Sidebar:** listed
- **Source:** `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 968 words

#### Page text (as shipped)

# Rapid Review — Buzzwords & One-Liners


**How to use this.** A dense, night-before recall sheet: the classic association on the left, the answer and next move on the right. It is a *recall* tool, not a substitute for the topic pages — each line points back to where the reasoning lives. Confirm any dose or threshold against the primary page and institutional references before acting.

## Mood
- Depression ≥2 weeks, ≥5 SIGECAPS incl. mood or anhedonia → **major depressive episode** → SSRI + therapy. *(→ Mood)*
- Manic ≥1 week (or any duration if hospitalized), elevated/irritable + DIGFAST → **bipolar I** → mood stabilizer/SGA; **antidepressant monotherapy contraindicated**. *(→ Mood)*
- Antidepressant "works" but patient becomes activated/grandiose → uncovered **bipolar** → screen for bipolarity before any antidepressant.
- Severe, psychotic, catatonic, food-refusing, or pregnant + high suicide risk → **ECT**. *(→ ECT)*
- Grief-specific yearning/preoccupation >12 months, impairing → **prolonged grief disorder (DSM-5-TR)** — not normal bereavement.

## Psychosis
- Psychosis <1 mo → **brief psychotic**; 1–6 mo → **schizophreniform**; ≥6 mo → **schizophrenia**. *(→ Psychosis)*
- ≥2 wk psychosis *without* mood symptoms + mood episodes most of illness → **schizoaffective**; psychosis only during mood episodes → **mood disorder with psychotic features**.
- Two failed adequate antipsychotic trials → **treatment-resistant** → **clozapine** (ANC monitoring per prescribing info; REMS eliminated 2025). *(→ Psychosis, Med Monitoring)*
- Clozapine + fever/chest pain early → **myocarditis**; + abdominal distension → **ileus**. *(→ Psychosis)*
- First-episode psychosis → **coordinated specialty care (RAISE)** — meds + family + psychosocial.

## Anxiety / OCD / Trauma
- Chronic worry ≥6 mo, multiple domains → **GAD** → SSRI/SNRI + CBT. *(→ Anxiety)*
- Recurrent unexpected attacks + worry about attacks → **panic disorder** → SSRI + CBT; benzo bridge only.
- Ego-dystonic obsessions + rituals → **OCD** → SSRI (higher dose) + **ERP**; clomipramine 2nd-line.
- Trauma + re-experiencing/avoidance/hyperarousal → **PTSD** → trauma-focused therapy ± SSRI/SNRI; prazosin for nightmares; **avoid benzodiazepines**.
- Anxiety only when performing → **performance-type social anxiety** → PRN beta-blocker.

## Personality
- Warm to nights, hostile to days → **splitting (BPD)** → team consistency. *(→ Personality)*
- Recurrent self-harm + emptiness + unstable relationships → **BPD** → **DBT** first-line; meds adjunctive.
- Pervasive lifelong distrust, no frank psychosis → **paranoid PD** (Cluster A).
- Odd beliefs/magical thinking + persistent social discomfort → **schizotypal**; no desire for relationships → **schizoid**; wants but fears rejection → **avoidant**.
- Ego-syntonic perfectionism/control, no true obsessions → **OCPD** (not OCD).
- ≥18 + conduct disorder before 15 → **antisocial PD**.

## Substance / Withdrawal
- Confusion + ophthalmoplegia + ataxia in alcohol use → **Wernicke** → **thiamine before glucose**. *(→ SUD)*
- Alcohol withdrawal peak 48–96 h, autonomic instability + confusion → **delirium tremens** → benzodiazepines (CIWA-driven). *(→ Withdrawal card)*
- Opioid withdrawal → track with **COWS**; start buprenorphine only when objective withdrawal present (COWS ≈ 8–12). *(→ SUD)*
- AUD maintenance → **naltrexone or acamprosate** first-line; disulfiram adherence-dependent.
- Opioid overdose → **naloxone**; MOUD (buprenorphine/methadone/naltrexone) reduces mortality.

## Neurocognitive / Delirium / Mimics
- Acute, fluctuating, inattentive → **delirium** → find and treat the cause; avoid benzodiazepines (except alcohol/sedative withdrawal). *(→ Delirium)*
- New "psychiatric" symptoms in an older/medically ill patient → **delirium/medical until proven otherwise**. *(→ Medical Workup)*
- Visual hallucinations + fluctuating cognition + parkinsonism → **Lewy body dementia** → **neuroleptic sensitivity** (avoid antipsychotics). *(→ Neurocognitive)*
- Stepwise decline + vascular risk → **vascular dementia**; early behavior/personality change → **frontotemporal**.
- Psychosis + movement disorder + seizures/autonomic instability → **anti-NMDA-receptor encephalitis**.

## Safety / Toxidromes
- Dopamine blocker + **lead-pipe rigidity + hyporeflexia** + high CK → **NMS** → stop antipsychotic; dantrolene/bromocriptine. *(→ Toxidromes)*
- Serotonergic agent + **clonus + hyperreflexia (legs)** + diaphoresis → **serotonin syndrome** → cyproheptadine.
- **Dry, flushed, mydriasis, retention** → **anticholinergic toxicity**.
- Waxy flexibility/posturing/mutism → **catatonia** → **lorazepam challenge**; malignant/refractory → **ECT**. *(→ Catatonia)*
- Strongest suicide risk factor = **prior attempt**; highest-yield prevention = **means restriction (firearms)**; highest-risk window = **post-discharge**. *(→ Suicide)*
- Strongest predictor of violence = **past violence**; treat **dynamic** factors (psychosis, intoxication, agitation). *(→ Violence)*

## Psychopharmacology / Monitoring
- Lithium level = **12-h trough, ~5 days after change**; NSAIDs/thiazides/ACE raise it; teratogen (Ebstein). *(→ Med Monitoring)*
- Valproate → LFTs/platelets; **teratogen (neural tube)** — avoid in childbearing potential.
- Antipsychotic → baseline + ongoing **metabolic** panel; watch QTc, EPS, tardive dyskinesia.
- Akathisia → reduce/switch → **propranolol**; SSRI overdose relatively safe; **TCA overdose → wide QRS** (sodium bicarbonate).
- MAOI + tyramine → **hypertensive crisis**; MAOI + serotonergic → serotonin syndrome (wait washout).

## Child / Development
- Inattention/hyperactivity, before age 12, ≥2 settings → **ADHD** → **stimulants** first-line. *(→ Neurodevelopmental)*
- Social-communication deficits **+ restricted/repetitive behaviors**, early → **autism**.
- Defiant/argumentative, no rights-violations → **ODD**; aggression/destruction/deceit/serious violations → **conduct disorder**.
- Motor **and** vocal tics >1 yr, onset <18 → **Tourette**.
- Nocturnal enuresis (age ≥5) → **enuresis alarm** first-line.

## Ethics / Legal
- Involuntary hold = **mental illness + danger to self/others or grave disability**. *(→ Ethics & Law)*
- **Capacity** = clinical, decision-specific, can fluctuate; **competence** = legal/court.
- Capacitated patient may **refuse even life-sustaining treatment**.
- Identifiable threatened victim → **duty to protect (Tarasoff)**.
- No advance directive → surrogate uses **substituted judgment**, then best interest.
- Emergency + can't consent + no surrogate → **implied consent**.

## Other high-yield
- Deliberate illness for the sick role, no external gain → **factitious**; for external gain → **malingering**; not intentional → **somatic symptom disorder**.
- Refeeding a severely malnourished patient → watch **hypophosphatemia** (refeeding syndrome). *(→ Nutrition)*
- Serotonergic + poor sleep + weight/BMI tracking on antipsychotics = routine metabolic vigilance.

*Joshua Moss, MD | Psychiatrist · High-yield recall aid; confirm every threshold/dose against the linked topic page and institutional references. Educational; fictional composites only, no PHI.*


---

## Landmark Trials — Listen & Test

- **Slug:** `landmark_trials.md` · **Type:** md · **Sidebar:** listed
- **Source:** `07_Evidence_and_Reading/Landmark_Trials/landmark_trials_page.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 881 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 6 min

**TL;DR (shown above the page text):**

> Fifty landmark papers as 90–120 second audio overviews with board-style self-test in Shelf Mode and Daily Review — listen to the four Foundations papers first (Engel, Rosenhan, Robins-Guze, Insel), then follow your patients to the theme that fits.

**Key points (bulleted card):**

- Each audio is 90–120 seconds — short enough for the walk between the unit and the staff room, not a dedicated study block.
- The Acute & Safety cluster (6 papers) covers Appelbaum capacity, Bush-Francis catatonia, lithium-suicide (Cipriani 2013), safety planning (Stanley 2012), and the limits of risk-factor prediction (Franklin 2017) — the most rotation-relevant papers.
- The same trials feed the board-style questions in Shelf Mode and Daily Review, which extend beyond the individual trial into the broader clinical question — pair the audio with those for shelf preparation.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Choose the paper that answers the clinical problem in front of you: capacity, catatonia, lithium-suicide, safety planning, or diagnostic validity.
- **mse** — Separate what the study measured from what you observed at bedside; do not let a trial result replace the individual assessment.
- **safety** — Use safety papers to support supervision and documentation, not to independently clear or detain a patient.
- **say** — Translate one landmark finding into a plain-language explanation only when it helps shared decision-making.
- **collateral** — Use paper themes to guide collateral questions about timeline, prior response, safety environment, and treatment adherence.
- **rounds** — Offer a 20-second evidence pearl when it changes the differential, risk formulation, or next step.
- **exam** — Pair each audio with board-style self-test in Shelf Mode or Daily Review, then answer one question bank item on the same concept.
- **actions** — Open question bank practice

**Cross-references and tagging:**

- **Related tools:** `review.html`, `question-bank-practice.html`, `oral.html`
- **Evidence sources:** `appelbaum-grisso-1988-capacity`, `border-2019-candidate-gene`, `brown-1972-expressed-emotion`, `bush-1996-catatonia-rating-scale`, `caspi-2003-5htt-stress`, `engel-1977-biopsychosocial-model`, `felitti-1998-ace`, `franklin-2017-suicide-risk-meta-analysis`, `lieberman-2005-catie`, `linehan-1991-dbt`, `march-2004-tads`, `pharoah-2010-family-intervention`, `rosenhan-1973-sane-places`, `rush-2006-stard`, `stanley-brown-2012-safety-planning`, `volkow-2016-addiction-brain-disease`, `wampold-1997-bona-fide-psychotherapies`
- **Workflow stages:** `exam`, `diagnosis`, `safety`, `treatment`
- **Workflow modes:** `ward`, `5min`, `shelf`
- **Shelf blueprint tags:** `pharm`
- **EPA crosswalk:** `EPA7`

#### Page text (as shipped)

# Landmark Psychiatry — Listen & Test

> 50 landmark papers as ~2-minute audio overviews (NotebookLM), grouped by theme. Where a DOI is verified, open the paper. Shelf Mode and Daily Review draw board-style questions from these papers plus additional high-yield topics. Suggested, not required. Educational; verify against primary sources.

## Foundations  (4)
**Engel 1977 - Biopsychosocial**  ·  _1:47_
<audio controls preload="none" src="audio/40_LM_41_Engel_1977_Biopsychosocial_1_47.m4a"></audio>
<a href="https://doi.org/10.1126/science.847460" target="_blank" rel="noopener">Paper (DOI)</a>

**Insel 2010 - RDoC**  ·  _1:44_
<audio controls preload="none" src="audio/49_LM_50_Insel_2010_RDoC_1_44.m4a"></audio>
<a href="https://doi.org/10.1176/appi.ajp.2010.09091379" target="_blank" rel="noopener">Paper (DOI)</a>

**Robins-Guze 1970 - Diagnostic Validity**  ·  _1:54_
<audio controls preload="none" src="audio/44_LM_42_Robins_Guze_1970_Diagnostic_Validity_1_54.m4a"></audio>
<a href="https://doi.org/10.1176/ajp.126.7.983" target="_blank" rel="noopener">Paper (DOI)</a>

**Rosenhan 1973 - Pseudopatients**  ·  _1:50_
<audio controls preload="none" src="audio/26_LM_26_Rosenhan_1973_Pseudopatients_1_50.m4a"></audio>
<a href="https://doi.org/10.1126/science.179.4070.250" target="_blank" rel="noopener">Paper (DOI)</a>


## Mood  (5)
**Cipriani 2018 - Antidepressant NMA**  ·  _1:52_
<audio controls preload="none" src="audio/05_LM_05_Cipriani_2018_Antidepressant_NMA_1_52.m4a"></audio>
<a href="https://doi.org/10.1016/S0140-6736(17)32802-7" target="_blank" rel="noopener">Paper (DOI)</a>

**Geddes 2010 - BALANCE**  ·  _1:36_
<audio controls preload="none" src="audio/06_LM_06_Geddes_2010_BALANCE_1_36.m4a"></audio>
<a href="https://doi.org/10.1016/S0140-6736(09)61828-6" target="_blank" rel="noopener">Paper (DOI)</a>

**Miklowitz 2003 - FFT Bipolar**  ·  _1:53_
<audio controls preload="none" src="audio/15_LM_15_Miklowitz_2003_FFT_Bipolar_1_53.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.60.9.904" target="_blank" rel="noopener">Paper (DOI)</a>

**Rush 2006 - STAR*D**  ·  _1:44_
<audio controls preload="none" src="audio/02_LM_02_Rush_2006_STAR_D_1_44.m4a"></audio>
<a href="https://doi.org/10.1176/appi.ajp.163.11.1905" target="_blank" rel="noopener">Paper (DOI)</a>

**Sachs 2007 - STEP-BD**  ·  _1:34_
<audio controls preload="none" src="audio/03_LM_03_Sachs_2007_STEP_BD_1_34.m4a"></audio>
<a href="https://doi.org/10.1056/NEJMoa064135" target="_blank" rel="noopener">Paper (DOI)</a>


## Psychosis  (3)
**Kane 1988 - Clozapine**  ·  _1:50_
<audio controls preload="none" src="audio/04_LM_04_Kane_1988_Clozapine_1_50.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1988.01800330013001" target="_blank" rel="noopener">Paper (DOI)</a>

**Leucht 2013 - Antipsychotic NMA**  ·  _2:00_
<audio controls preload="none" src="audio/07_LM_08_Leucht_2013_Antipsychotic_NMA_2_00.m4a"></audio>
<a href="https://doi.org/10.1016/S0140-6736(12)60239-6" target="_blank" rel="noopener">Paper (DOI)</a>

**Lieberman 2005 - CATIE Trial**  ·  _1:38_
<audio controls preload="none" src="audio/01_LM_01_Lieberman_2005_CATIE_Trial_1_38.m4a"></audio>
<a href="https://doi.org/10.1056/NEJMoa051688" target="_blank" rel="noopener">Paper (DOI)</a>


## Acute & Safety  (6)
**Appelbaum 1988 - Capacity**  ·  _1:49_
<audio controls preload="none" src="audio/27_LM_27_Appelbaum_1988_Capacity_1_49.m4a"></audio>
<a href="https://doi.org/10.1056/nejm198812223192504" target="_blank" rel="noopener">Paper (DOI)</a>

**Bush-Francis 1996 - Catatonia**  ·  _1:35_
<audio controls preload="none" src="audio/28_LM_28_Bush_Francis_1996_Catatonia_1_35.m4a"></audio>
<a href="https://doi.org/10.1111/j.1600-0447.1996.tb09814.x" target="_blank" rel="noopener">Paper (DOI)</a>

**Cipriani 2013 - Lithium-Suicide**  ·  _1:50_
<audio controls preload="none" src="audio/08_LM_07_Cipriani_2013_Lithium_Suicide_1_50.m4a"></audio>
<a href="https://doi.org/10.1136/bmj.f3646" target="_blank" rel="noopener">Paper (DOI)</a>

**Franklin 2017 - Risk Factors**  ·  _1:38_
<audio controls preload="none" src="audio/35_LM_35_Franklin_2017_Risk_Factors_1_38.m4a"></audio>
<a href="https://doi.org/10.1037/bul0000084" target="_blank" rel="noopener">Paper (DOI)</a>

**Mann 2005 - Suicide Prevention**  ·  _1:38_
<audio controls preload="none" src="audio/31_LM_33_Mann_2005_Suicide_Prevention_1_38.m4a"></audio>
<a href="https://doi.org/10.1001/jama.294.16.2064" target="_blank" rel="noopener">Paper (DOI)</a>

**Stanley 2012 - Safety Planning**  ·  _1:50_
<audio controls preload="none" src="audio/34_LM_34_Stanley_2012_Safety_Planning_1_50.m4a"></audio>
<a href="https://doi.org/10.1001/jamapsychiatry.2018.1776" target="_blank" rel="noopener">Paper (DOI)</a>


## Psychopharmacology  (2)
**Kellner 2006 - Continuation ECT**  ·  _1:48_
<audio controls preload="none" src="audio/09_LM_09_Kellner_2006_Continuation_ECT_1_48.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.63.12.1337" target="_blank" rel="noopener">Paper (DOI)</a>

**Moncrieff 2022 - Antidepressant Withdrawal**  ·  _1:37_
<audio controls preload="none" src="audio/10_LM_10_Moncrieff_2022_Antidepressant_Withdrawal_1_37.m4a"></audio>


## Personality  (5)
**Bateman 1999 - MBT**  ·  _2:02_
<audio controls preload="none" src="audio/21_LM_22_Bateman_1999_MBT_2_02.m4a"></audio>
<a href="https://doi.org/10.1176/ajp.156.10.1563" target="_blank" rel="noopener">Paper (DOI)</a>

**Gunderson 2018 - BPD Review**  ·  _1:46_
<audio controls preload="none" src="audio/33_LM_32_Gunderson_2018_BPD_Review_1_46.m4a"></audio>
<a href="https://doi.org/10.1038/nrdp.2018.29" target="_blank" rel="noopener">Paper (DOI)</a>

**Kernberg 1984 - Personality Org**  ·  _1:56_
<audio controls preload="none" src="audio/39_LM_39_Kernberg_1984_Personality_Org_1_56.m4a"></audio>

**Linehan 1991 - DBT**  ·  _1:54_
<audio controls preload="none" src="audio/24_LM_21_Linehan_1991_DBT_1_54.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1991.01810360024003" target="_blank" rel="noopener">Paper (DOI)</a>

**Zanarini 2005 - BPD Remission**  ·  _1:48_
<audio controls preload="none" src="audio/32_LM_31_Zanarini_2005_BPD_Remission_1_48.m4a"></audio>
<a href="https://doi.org/10.1521/pedi.2005.19.5.505" target="_blank" rel="noopener">Paper (DOI)</a>


## Family & Systems  (9)
**Brown 1962 - Expressed Emotion**  ·  _2:02_
<audio controls preload="none" src="audio/11_LM_11_Brown_1962_Expressed_Emotion_2_02.m4a"></audio>
<a href="https://doi.org/10.1136/jech.16.2.55" target="_blank" rel="noopener">Paper (DOI)</a>

**Diamond 2010 - ABFT**  ·  _1:53_
<audio controls preload="none" src="audio/19_LM_16_Diamond_2010_ABFT_1_53.m4a"></audio>
<a href="https://doi.org/10.1016/j.jaac.2009.11.002" target="_blank" rel="noopener">Paper (DOI)</a>

**Falloon 1982 - Family Management**  ·  _1:57_
<audio controls preload="none" src="audio/14_LM_13_Falloon_1982_Family_Management_1_57.m4a"></audio>
<a href="https://doi.org/10.1056/nejm198206173062401" target="_blank" rel="noopener">Paper (DOI)</a>

**Leff 1982 - Family Intervention**  ·  _1:35_
<audio controls preload="none" src="audio/12_LM_12_Leff_1982_Family_Intervention_1_35.m4a"></audio>
<a href="https://doi.org/10.1192/bjp.141.2.121" target="_blank" rel="noopener">Paper (DOI)</a>

**Leff 2000 - Couple Therapy Depression**  ·  _1:45_
<audio controls preload="none" src="audio/16_LM_19_Leff_2000_Couple_Therapy_Depression_1_45.m4a"></audio>
<a href="https://doi.org/10.1192/bjp.177.2.95" target="_blank" rel="noopener">Paper (DOI)</a>

**McFarlane 1995 - Multifamily**  ·  _1:52_
<audio controls preload="none" src="audio/13_LM_14_McFarlane_1995_Multifamily_1_52.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1995.03950200069016" target="_blank" rel="noopener">Paper (DOI)</a>

**Minuchin 1978 - Psychosomatic Families**  ·  _1:50_
<audio controls preload="none" src="audio/18_LM_18_Minuchin_1978_Psychosomatic_Families_1_50.m4a"></audio>
<a href="https://doi.org/10.4159/harvard.9780674418233" target="_blank" rel="noopener">Paper (DOI)</a>

**Pharoah 2010 - Cochrane Family**  ·  _1:35_
<audio controls preload="none" src="audio/20_LM_20_Pharoah_2010_Cochrane_Family_1_35.m4a"></audio>
<a href="https://doi.org/10.1002/14651858.cd000088.pub3" target="_blank" rel="noopener">Paper (DOI)</a>

**Pinsof 1995 - Systemic Meta**  ·  _2:00_
<audio controls preload="none" src="audio/17_LM_17_Pinsof_1995_Systemic_Meta_2_00.m4a"></audio>
<a href="https://doi.org/10.1111/j.1752-0606.1995.tb00179.x" target="_blank" rel="noopener">Paper (DOI)</a>


## Substance Use  (2)
**Project MATCH 1997**  ·  _1:53_
<audio controls preload="none" src="audio/42_LM_45_Project_MATCH_1997_1_53.m4a"></audio>
<a href="https://doi.org/10.1111/j.1530-0277.1998.tb03912.x" target="_blank" rel="noopener">Paper (DOI)</a>

**Volkow 2016 - Addiction**  ·  _1:53_
<audio controls preload="none" src="audio/47_LM_46_Volkow_2016_Addiction_1_53.m4a"></audio>
<a href="https://doi.org/10.1056/nejmra1511480" target="_blank" rel="noopener">Paper (DOI)</a>


## Child  (3)
**Bridge 2007 - Pediatric SSRI**  ·  _1:41_
<audio controls preload="none" src="audio/45_LM_48_Bridge_2007_Pediatric_SSRI_1_41.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.63.3.332" target="_blank" rel="noopener">Paper (DOI)</a>

**MTA 1999 - ADHD**  ·  _1:45_
<audio controls preload="none" src="audio/46_LM_47_MTA_1999_ADHD_1_45.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.56.12.1073" target="_blank" rel="noopener">Paper (DOI)</a>

**TADS 2004 - Adolescent Depression**  ·  _1:44_
<audio controls preload="none" src="audio/30_LM_30_TADS_2004_Adolescent_Depression_1_44.m4a"></audio>
<a href="https://doi.org/10.1001/jama.292.7.807" target="_blank" rel="noopener">Paper (DOI)</a>


## Neuroscience  (3)
**Border 2019 - Non-Replication**  ·  _1:36_
<audio controls preload="none" src="audio/37_LM_37_Border_2019_Non_Replication_1_36.m4a"></audio>
<a href="https://doi.org/10.1176/appi.ajp.2018.18070881" target="_blank" rel="noopener">Paper (DOI)</a>

**Caspi 2003 - 5-HTTLPR**  ·  _1:47_
<audio controls preload="none" src="audio/51_LM_36_Caspi_2003_5_HTTLPR_1_47.m4a"></audio>
<a href="https://doi.org/10.1126/science.1083968" target="_blank" rel="noopener">Paper (DOI)</a>

**Sekar 2016 - C4 Schizophrenia**  ·  _1:50_
<audio controls preload="none" src="audio/36_LM_38_Sekar_2016_C4_Schizophrenia_1_50.m4a"></audio>
<a href="https://doi.org/10.1038/nature16549" target="_blank" rel="noopener">Paper (DOI)</a>


## Trauma  (1)
**Felitti 1998 - ACE Study**  ·  _1:52_
<audio controls preload="none" src="audio/41_LM_44_Felitti_1998_ACE_Study_1_52.m4a"></audio>
<a href="https://doi.org/10.1016/s0749-3797(98)00017-8" target="_blank" rel="noopener">Paper (DOI)</a>


## Systems  (1)
**Stein-Test 1980 - ACT**  ·  _1:54_
<audio controls preload="none" src="audio/43_LM_43_Stein_Test_1980_ACT_1_54.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1980.01780170034003" target="_blank" rel="noopener">Paper (DOI)</a>


## Skills  (4)
**Gabbard 1995 - Boundaries**  ·  _1:46_
<audio controls preload="none" src="audio/38_LM_40_Gabbard_1995_Boundaries_1_46.m4a"></audio>
<a href="https://doi.org/10.1176/ajp.150.2.188" target="_blank" rel="noopener">Paper (DOI)</a>

**Norcross 2011 - Alliance**  ·  _1:44_
<audio controls preload="none" src="audio/25_LM_25_Norcross_2011_Alliance_1_44.m4a"></audio>
<a href="https://doi.org/10.1037/pst0000172" target="_blank" rel="noopener">Paper (DOI)</a>

**Shedler 2010 - Psychodynamic**  ·  _1:43_
<audio controls preload="none" src="audio/23_LM_24_Shedler_2010_Psychodynamic_1_43.m4a"></audio>
<a href="https://doi.org/10.1037/a0018378" target="_blank" rel="noopener">Paper (DOI)</a>

**Wampold 2001 - Common Factors**  ·  _1:42_
<audio controls preload="none" src="audio/22_LM_23_Wampold_2001_Common_Factors_1_42.m4a"></audio>


## Anxiety  (1)
**Foa 2005 - Prolonged Exposure**  ·  _1:42_
<audio controls preload="none" src="audio/29_LM_29_Foa_2005_Prolonged_Exposure_1_42.m4a"></audio>
<a href="https://doi.org/10.1037/0022-006X.70.4.867" target="_blank" rel="noopener">Paper (DOI)</a>


## Geriatric  (1)
**Inouye 1999 - Delirium**  ·  _1:59_
<audio controls preload="none" src="audio/48_LM_49_Inouye_1999_Delirium_1_59.m4a"></audio>
<a href="https://doi.org/10.1056/NEJM199903043400901" target="_blank" rel="noopener">Paper (DOI)</a>


*Joshua Moss, MD | Psychiatrist · Audio overviews via NotebookLM; reviewed and attested by Joshua Moss, MD (2026-07-09); no PHI.*


---

## Anki Flashcard Decks

- **Slug:** `anki.md` · **Type:** md · **Sidebar:** listed
- **Source:** `09_Exam_Prep/anki_export/anki.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 310 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 2 min

**TL;DR (shown above the page text):**

> Download the clerkship's attested question bank and high-yield concepts as Anki spaced-repetition decks; suspend all cards, then unsuspend by topic as the rotation covers each block.

**Key points (bulleted card):**

- Two decks, both built only from attested content: the Question Bank (vignette cards) and Concepts (topic one-liners + high-yield pearls, with author-bolded facts as cloze deletions).
- Import the combined .apkg for one file with both subdecks; every card is tagged by topic, source page, high-yield, and attestation status for the suspend/unsuspend workflow.
- Decks regenerate automatically on each site rebuild, so they stay in sync with the library.

**Cross-references and tagging:**

- **Related tools:** `question-bank-practice.html`, `shelf-mode.html`, `review.html`
- **Workflow stages:** `exam`
- **Workflow modes:** `shelf`, `5min`

#### Page text (as shipped)

# Anki Flashcard Decks


**In one line** — Download the clerkship library as [Anki](https://apps.ankiweb.net/) spaced-repetition decks and review the high-yield material the same way you review everything else on your phone.

**What you get** — Two decks, both built straight from this site's attested material:

- **Question Bank** — every attested board-style item as a vignette card (best answer, the trap in each distractor, the teaching point, and a link back to the source page). Two-tier items include a second card for the mechanism.
- **Concepts** — the "in one line" summary for each topic plus every high-yield pearl. Where a pearl has a **bolded** fact, that fact is the cloze deletion.

## Download

<p>
<a href="anki/psychiatry_clerkship_library_ALL.apkg" download><strong>⬇ Complete deck (recommended)</strong></a> — one file, two subdecks (Question Bank + Concepts).
</p>
<p>
<a href="anki/psychiatry_clerkship_library.apkg" download>⬇ Question Bank only</a> ·
<a href="anki/psychiatry_clerkship_concepts.apkg" download>⬇ Concepts only</a> ·
<a href="anki/psychiatry_clerkship_library.csv" download>⬇ Question Bank as CSV</a>
</p>

## How to use it

1. Install Anki (desktop is free; **AnkiMobile** on iOS / **AnkiDroid** on Android is free on Android).
2. Open the downloaded `.apkg` — it imports as **Psychiatry Clerkship Library (Moss)** with the two subdecks.
3. **Suspend everything, then unsuspend by topic** as the rotation covers each block. Every card is tagged `Psychiatry::<topic>`, `Source::<page>`, `HighYield`, and `Status::attested`, so you can browse to exactly the block you want.
4. Cap new cards around 20–30/day and review daily — the schedule does the rest.

**Pair with** — the [Practice Questions tool](?tool=question-bank-practice.html) for timed, exam-style practice of the same items, and the [COMAT & Shelf Review](?page=shelf.md) guide for the blueprint.

**Attested content only** — a topic page contributes cards only once it carries a review sign-off, so the decks grow as more of the library is attested. Decks refresh automatically when the site rebuilds.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*


---

# SECTION: Case of the Week

---

## Index — All Cases

- **Slug:** `cotw_index.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/index_ms3.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 422 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 2 min · safetyLevel=`moderate`

**TL;DR (shown above the page text):**

> The rotating weekly teaching case - one de-identified synthetic vignette a week, with guided discussion questions, a ranked differential, and a workup-and-management ladder.

**Key points (bulleted card):**

- A new case is added each week; the current one sits at the top of the Case of the Week sidebar.
- ~20-30 minute small-group discussion - no pre-reading required.
- Every case ships in matched MS3 and resident versions.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Pick the week you want from the sidebar and work its stem cold - your own history, your own differential, your own next step - before reading any teaching point.
- **mse** — Each case asks you to say what its exam findings rule in and rule out; that discrimination between look-alike syndromes is the recurring skill across the series.
- **safety** — Safety content across every case is oriented to recognition, escalation, and safety planning, never to method detail. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Every case includes at least one moment to rehearse out loud what you would actually say to the patient or family.
- **collateral** — A recurring question in the series: what collateral would change this differential, and who would you have to call to get it?
- **rounds** — Cases are built for a ~20-30 minute small-group discussion; the facilitator notes in each one are written for whoever is running the session.
- **exam** — Matched MS3 and resident versions of every case: MS3 at Step 2 CK level, resident level assuming DSM-5-TR fluency and going deeper on mechanism, guidelines, and evidence quality.
- **actions** — Medication monitoring reference

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-11"}

#### Page text (as shipped)

# Case of the Week — Resident


**What this is.** A rotating weekly psychiatry teaching case at the resident level — assumes DSM-5-TR fluency and goes deeper on differential breadth, mechanism and pharmacology nuance, and guideline- and evidence-level reasoning. Each case is a de-identified synthetic vignette with guided discussion questions and teaching points, a reconsidered differential, a workup-and-management sequence, facilitator notes, and a fuller reference list. Built for a ~20–30 minute discussion — no pre-reading required.

**How to use it.** Pick the current week from the sidebar under **Case of the Week**. Reason through the stem and each question before reading the teaching point; use the facilitator notes if you're running the session. Safety content stays oriented to structured risk formulation, means-safety, and escalation.

**This term's line-up (most recent first):**

- **Catatonia — Recognition, Workup & Treatment** (Aug 31) — disentangling NMS from malignant catatonia, high-dose lorazepam strategy, early ECT triggers, the serum + CSF autoimmune workup, and the catatonia–delirium overlap.
- **Borderline Personality Disorder — Presentation & Management** (Aug 27) — the meta-analytic evidence in real numbers, deprescribing the inherited five-drug regimen, chronic vs. acute-on-chronic risk documentation, splitting and the milieu, and GPM when DBT is waitlisted.
- **Panic Disorder — Differential Precision & Pharmacologic Optimization** (Aug 10) — the pseudopheochromocytoma phenotype, benzodiazepine interdose rebound as an iatrogenic driver, and reconciling the Cochrane and BMJ network meta-analyses.
- **Lithium — Monitoring, Toxicity & Interactions** (Aug 3) — two-compartment kinetics and post-dialysis rebound, SILENT, nephrogenic DI vs. lithium nephropathy, and preconception counselling with effect sizes.
- **Opioid Use Disorder — Intoxication, Withdrawal & MOUD** (Jul 27) — buprenorphine-precipitated withdrawal in the fentanyl era, low-dose initiation, acute pain on MOUD, and reading X:BOT.
- **Alcohol Withdrawal & Delirium Tremens** (Jul 26) — GABA-A remodeling and kindling, benzodiazepine-resistant withdrawal, and the phenobarbital evidence.
- **Suicide Risk Assessment & Safety Planning** (Jul 23) — risk formulation over category, the evidence on stratification limits, safety planning, and acute pharmacology.
- **MDD — Treatment Selection, Sequencing & Augmentation** (Jul 20) — VAST-D, augmentation agent selection, pharmacogenomics, and esketamine sequencing.
- **Bipolar Mania — Recognition & Acute Management** (Jul 20) — mixed features, secondary mania, and maintenance planning.
- **Acute Agitation & Delirium in the ED** (Jul 13) — hyperactive vs. hypoactive delirium, workup, and pharmacologic strategy.
- **Serotonin Syndrome vs. NMS** (Jul 9) — mechanism, time course, and management of the two hyperthermic syndromes.

New cases are added weekly. A matching MS3-level version of each case lives on the UNE MS3 site.

*Joshua Moss, MD | Psychiatrist*


---

## Catatonia (Aug 31)

- **Slug:** `cotw_20260831_catatonia_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-31_catatonia-recognition-workup-treatment_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 2,182 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-08-31)

**TL;DR (shown above the page text):**

> A mute, motionless patient is an emergency until proven otherwise - screen with the BFCRS, test-and-treat with the lorazepam challenge, hold the antipsychotics, and know the malignant-catatonia triggers that mean early ECT.

**Key points (bulleted card):**

- ~20-30 minute small-group discussion - no pre-reading required.
- De-identified synthetic case; each discussion question is paired with a teaching point.
- Resident level. Facilitator notes are kept separate from the learner-facing stem.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Work the stem cold: take your own history, commit to a differential, and name your next step before reading a single teaching point. The guided questions are written to be answered, not skimmed.
- **mse** — Say out loud what each exam finding in the vignette rules in and rules out — the discrimination between look-alike syndromes is what the case is drilling.
- **safety** — Safety content in every case is oriented to recognition, escalation, and safety planning. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Before moving on, rehearse one sentence you would actually say to this patient or family, in plain language and out loud.
- **collateral** — Ask yourself what collateral would change your differential here, and who you would have to call to get it.
- **rounds** — If you are running the session, the facilitator notes flag the errors this case most often surfaces and the evidence-quality distinctions worth naming out loud.
- **exam** — Teaching takeaway: A mute, motionless patient is an emergency until proven otherwise - screen with the BFCRS, test-and-treat with the lorazepam challenge, hold the antipsychotics, and know the malignant-catatonia triggers that mean early ECT.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `neurocog`, `safety`, `pharm`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA3`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-31"}

#### Page text (as shipped)

# Case of the Week — August 31, 2026 (Resident Version)

## Catatonia: Recognition, Workup, and Treatment

**Learner level:** Psychiatry residents (PGY-2–4; well suited to the C-L service)
**Format:** Facilitator-led discussion, ~20–30 minutes. Assumes DSM-5-TR fluency.
**Note:** This is a fully synthetic, de-identified teaching case. It describes no real patient; any resemblance to a real person is coincidental.

---

## Learner-facing case stem

You are the consultation-liaison resident. Medicine consults you for a 46-year-old man admitted two days ago with "altered mental status and failure to thrive." He has a history of bipolar I disorder, off all medications for about a year. Per his sister, he had a flu-like illness roughly three weeks ago, then over two weeks became progressively withdrawn, near-mute, and stopped eating reliably; for the last five days he has barely taken anything by mouth. In the emergency department three days ago he was "agitated and resistive" and received **haloperidol 5 mg IM twice**. The primary team reports he has since seemed "stiffer and more shut down."

On exam he is awake, eyes open, with fixed staring and almost no spontaneous movement. He does not speak beyond occasional repetition of the same short phrase (**verbigeration**). He holds his head several inches off the pillow for minutes at a time (**psychological pillow**, a form of posturing). Passive movement reveals **gegenhalten** (oppositional paratonia — resistance proportional to the force applied) and intermittent **waxy flexibility**; he mirrors some of your movements (**echopraxia**). He resists mouth opening and eye examination (**negativism**). There is mild diffuse rigidity without cogwheeling and no tremor or clonus.

Vitals: T 37.6 °C, HR 104, BP 142/88 (nurse notes readings from 108/70 to 150/92 today), RR 16, SpO₂ 98%. Labs: Na 148, BUN/Cr 32/1.3, CK 850 U/L, WBC 11.2; TSH and glucose normal; urine toxicology negative. BFCRS screening is positive at 8 of 14 screening items.

---

## Guided discussion questions

**Q1. Make the syndromic diagnosis precisely. How do DSM-5-TR, ICD-11, and the BFCRS each frame catatonia, and why does the framing matter?**

*Teaching point:* He easily meets DSM-5-TR criteria (≥3 of 12 signs — here mutism/verbigeration, posturing, waxy flexibility, negativism, echopraxia, staring on the BFCRS). DSM-5 moved catatonia out from under schizophrenia to a **specifier** applicable across mood, psychotic, and medical conditions, reflecting that mood disorders are the most common psychiatric context [5]. ICD-11 now recognizes catatonia as an **independent diagnostic entity** (since 2022) [3]. The **BFCRS** remains the workhorse instrument: 23-item severity scale, 14-item screen (positive at ≥2), standardized exam, inter-rater reliability ~0.93 [4]. Framing matters clinically: prevalence is roughly **5–18% on psychiatric inpatient units and ~3.3% on medical units** [3], and unrecognized catatonia is what kills — via VTE, aspiration, dehydration, and progression to malignant catatonia.

**Q2. What in this stem demands a workup for secondary (medical) catatonia, and what exactly do you send?**

*Teaching point:* Red flags: first catatonic episode at 46, subacute course after a **viral prodrome**, dysautonomia out of proportion to psychiatric history, and admission to a medical service. The BAP guideline's assessment framework: careful history and physical/neurological exam, then **neuroimaging (MRI preferred), EEG, and neuronal autoantibody testing in serum and CSF** — anti-NMDA-receptor encephalitis is the paradigmatic mimic/cause and can present catatonic [1,2]. Add here: CMP with Ca/Mg/phosphate, LFTs, B12, HIV and syphilis serology, serial CK, and an LP with cell count, protein, oligoclonal bands, and autoimmune panel. EEG also screens for **nonconvulsive status epilepticus**, which belongs on this differential. Delirium and catatonia are *not* mutually exclusive — they frequently co-occur in the medically ill, and both should be coded and tracked [3,6].

**Q3. Haloperidol was given, and he worsened. Disentangle NMS, antipsychotic-worsened catatonia, and malignant catatonia — conceptually and practically.**

*Teaching point:* Many authors treat **NMS as a drug-induced (malignant) variant of catatonia** — the phenotypes overlap almost completely (rigidity, mutism, autonomic instability, elevated CK) [2,6]. Practical synthesis for the bedside: (a) his catatonic signs **predated** haloperidol, so this is primary catatonia **worsened by a dopamine antagonist**, a well-described phenomenon and the reason antipsychotics — especially high-potency D2 blockers — are relatively contraindicated in active catatonia [2]; (b) whatever the label, T 37.6 with labile BP, HR 104, rigidity, and CK 850 means he is **evolving toward malignant catatonia**, which is life-threatening and can be fatal untreated [6]; (c) management converges: **stop dopamine blockers, start lorazepam, escalate monitoring, and mobilize ECT early** [1,2,6]. The BAP guideline gives specific regard to malignant catatonia, NMS, and antipsychotic-induced catatonia as special situations [1].

**Q4. Design the benzodiazepine trial: challenge, titration, endpoints, and what response rates you should quote.**

*Teaching point:* **Lorazepam challenge** (typically 1–2 mg IV in a monitored medical setting; IV is preferred for reliability of effect and because PO absorption is uncertain with poor intake), re-examine with the BFCRS within ~15–60 minutes; video or documented serial exams make response objective. If positive (often dramatic), convert to **scheduled dosing with structured uptitration** — effective regimens frequently exceed conventional anxiolytic dosing, and the BAP guideline explicitly notes lorazepam is "sometimes used in very high doses"; catatonic patients often tolerate these with surprisingly little sedation [1,2]. Titrate to BFCRS resolution, not to sedation. Quote honestly: benzodiazepines are first-line, but **up to ~27% of catatonia fails to respond to benzodiazepines alone** [8] — a pre-committed escalation plan is part of the initial order set. Mechanistically, GABA-A hypofunction is the leading model, consistent with benzodiazepine response and with premotor/motor-network dysfunction on imaging [3,5]. The α1-selective GABA-A agonist **zolpidem** has case-level evidence as an alternative challenge or augmentation agent when lorazepam response is equivocal [8].

**Q5. When does ECT enter, and how do you operationalize it on a medical service?**

*Teaching point:* **ECT is first-line together with benzodiazepines**, and is the treatment of choice for **malignant catatonia, benzodiazepine-refractory catatonia, and when a rapid response is needed** (e.g., no oral intake, dysautonomia) [1,2,6]. Operationally: early ECT consultation (do not wait for a completed benzodiazepine failure if malignant features progress), anesthesia review, capacity assessment — catatonic patients usually lack capacity, so involve surrogate consent per jurisdiction, and know your local emergency-treatment pathway. Discuss with learners: continuing lorazepam during an ECT course is common practice (with attention to seizure threshold and timing of doses) — an excellent point for residents to argue from first principles and local protocol.

**Q6. The patient cannot get ECT quickly and has only partially responded to lorazepam. What are your evidence-informed adjuncts and their cautions?**

*Teaching point:* The adjunct evidence base is largely observational — case series and systematic reviews of cases — which the guideline authors themselves flag as the field's main limitation [1,2]. Best-supported alternatives: **NMDA-receptor antagonists (amantadine, memantine)**, with anti-epileptic drugs and certain atypical antipsychotics also described [3,7]. If psychosis demands antipsychotic treatment, prefer agents with lower D2 antagonism — **clozapine and aripiprazole are effective in some populations** [3] — introduced cautiously after catatonia is improving, with benzodiazepine cover and serial BFCRS/CK monitoring. Never re-challenge with high-potency agents in someone whose catatonia worsened on them.

**Q7. Write the safety-and-systems plan: complications, monitoring, disposition, and prognosis.**

*Teaching point:* Catatonia's morbidity is mostly **medical**: VTE (immobility — prophylaxis from day one), aspiration pneumonia (swallow evaluation before PO; NG feeding if intake fails), dehydration, AKI and electrolyte derangement (already present: Na 148, BUN/Cr 32/1.3), rhabdomyolysis (serial CK), pressure injuries, and contractures. Orders: continuous or q4h vitals with autonomic-instability parameters, strict I/O, daily BFCRS by a consistent examiner, DVT prophylaxis, PT/OT. Escalation triggers to ICU: temperature rise, worsening autonomic lability, CK trajectory, or declining arousal. Prognosis framing for the team and family: with early recognition and appropriate treatment (benzodiazepines/ECT), most catatonia responds well; delayed recognition drives the high morbidity and mortality [3]. As his mood episode declares itself during recovery, complete structured suicide-risk assessment and safety planning before stepping down observation — keep this at the level of recognition, structured assessment, and escalation.

---

## Ranked differential diagnosis (with discriminators)

1. **Catatonia in the context of a bipolar I mood episode, worsened by antipsychotic exposure** — prior bipolar I, subacute psychomotor decline, classic signs predating haloperidol, deterioration after D2 blockade [2,5].
2. **Catatonia due to another medical condition — autoimmune (anti-NMDA-receptor) encephalitis first among them** — viral-like prodrome, first presentation this severe at 46, dysautonomia; requires MRI, EEG, serum + CSF autoantibodies to exclude [1,2].
3. **Evolving malignant catatonia** — low-grade fever, labile BP, tachycardia, rigidity, CK 850; this is a trajectory, not a separate box, and it changes tempo of care [6].
4. **Neuroleptic malignant syndrome** — haloperidol exposure with rigidity and CK elevation; argued against by clear pre-exposure catatonic syndrome and only modest fever/CK; management overlaps with #3 regardless [2,6].
5. **Catatonia–delirium comorbidity / hypoactive delirium** — medically ill, dehydrated, fluctuating vitals; screen attention (e.g., months backward), CAM-ICU-style assessment; the two co-occur and both matter [3,6].
6. **Nonconvulsive status epilepticus** — staring, mutism, minimal movement; EEG is the only way to know.
7. **Serotonin syndrome** — no serotonergic exposure, no clonus/hyperreflexia; include to teach the toxidrome grid (drug history + neuromuscular exam distinguish SS, NMS, and malignant catatonia).
8. **Structural/metabolic akinetic mutism** (frontal or mesodiencephalic lesions, severe hypernatremia contribution) — imaging plus correction of Na 148 and reassessment.

---

## Workup & management summary

**Tier 1 (today):** stop all dopamine antagonists; BFCRS-scored standardized exam and daily re-scoring; CBC, CMP + Ca/Mg/Phos, LFTs, serial CK, TSH, B12, HIV/RPR, blood cultures if febrile; ECG; IV fluids for hypernatremia/prerenal azotemia; VTE prophylaxis; NPO pending swallow evaluation with NG plan; q4h vitals with autonomic parameters.

**Tier 2 (this admission, expedited):** MRI brain, EEG (rule out NCSE; encephalitis patterns), LP with CSF cell count/protein/oligoclonal bands and neuronal autoantibody panel in serum and CSF [1,2].

**Treatment ladder:** lorazepam challenge 1–2 mg IV → scheduled lorazepam with structured uptitration titrated to BFCRS response [1,2] → **early ECT** for malignant features, benzodiazepine failure (up to ~27% [8]), or need for rapid response [1,2,6] → adjuncts where ECT/benzodiazepines are unavailable or insufficient: amantadine/memantine; cautious clozapine or aripiprazole if psychosis requires treatment [3,7]; zolpidem as challenge/augmentation alternative [8].

**Do not:** start or resume high-potency antipsychotics during active catatonia; attribute the syndrome to "noncompliance with bipolar meds" before the secondary workup is done; forget that the mortality lives in the supportive-care column.

---
---

## Facilitator notes — keep separate; not for learner distribution

**Flow (20–30 min):** 3–4 min stem → Q1 briefly (they should nail it) → spend the session's core on Q3, Q4, and Q5 (the NMS/malignant-catatonia disentangling and the treatment ladder are the highest-yield resident content) → Q7 as rapid-fire order-writing → close with evidence-quality caveat.

**Points to press residents on:** Have them defend *why* antipsychotics are held (D2 blockade worsening catatonia/precipitating malignant conversion) rather than reciting the rule. Ask what specifically they would document to make a lorazepam response objective (serial BFCRS, timed video with consent, nursing observations). Ask who consents for ECT when the patient lacks capacity in your state, and what the emergency pathway is. Push on the catatonia–delirium overlap: what does a CAM-positive, BFCRS-positive patient get treated with first, and why (treat catatonia with lorazepam while treating delirium's cause; avoid reflexive antipsychotics).

**Evidence-quality caveat to state explicitly:** the BAP guideline recommendations rest mainly on small observational studies, case series, and case reports — clinical trials are uncommon [1,2]; the zolpidem literature is case-level with likely reporting bias [8]. Model calibrated language for trainees.

**Anticipated wrong turns:** treating this as pure NMS and stopping at "supportive care + dantrolene" (redirect: benzodiazepines/ECT treat the underlying catatonic process); waiting for the full autoimmune panel before any treatment (lorazepam trial and workup proceed in parallel); dosing lorazepam 0.5 mg BID and calling it a failed trial.

**Optional extension (if >30 min):** assign one resident to argue for early ECT and another for maximizing pharmacotherapy first, then debrief using the malignant-features trajectory as the deciding variable.

**Safety framing:** all suicide-risk content stays at recognition, structured assessment, observation, and escalation — no method-level detail in discussion or documentation examples.

---

## References

Based on articles retrieved from PubMed (National Library of Medicine). Citation fields below (journal, year, volume/pages, DOI) were verified against PubMed records on 2026-08-31.

1. Rogers JP, Oldham MA, Fricchione G, et al. Evidence-based consensus guidelines for the management of catatonia: Recommendations from the British Association for Psychopharmacology. *J Psychopharmacol*. 2023;37(4):327-369. [DOI: 10.1177/02698811231158232](https://doi.org/10.1177/02698811231158232)
2. Rogers JP, Zandi MS, David AS. The diagnosis and treatment of catatonia. *Clin Med (Lond)*. 2023;23(3):242-245. [DOI: 10.7861/clinmed.2023-0113](https://doi.org/10.7861/clinmed.2023-0113)
3. Hirjak D, Rogers JP, Wolf RC, et al. Catatonia. *Nat Rev Dis Primers*. 2024;10(1):49. [DOI: 10.1038/s41572-024-00534-w](https://doi.org/10.1038/s41572-024-00534-w)
4. Bush G, Fink M, Petrides G, Dowling F, Francis A. Catatonia. I. Rating scale and standardized examination. *Acta Psychiatr Scand*. 1996;93(2):129-136. [DOI: 10.1111/j.1600-0447.1996.tb09814.x](https://doi.org/10.1111/j.1600-0447.1996.tb09814.x)
5. Walther S, Stegmayer K, Wilson JE, Heckers S. Structure and neural mechanisms of catatonia. *Lancet Psychiatry*. 2019;6(7):610-619. [DOI: 10.1016/S2215-0366(18)30474-7](https://doi.org/10.1016/S2215-0366(18)30474-7)
6. Connell J, Oldham M, Pandharipande P, et al. Malignant Catatonia: A Review for the Intensivist. *J Intensive Care Med*. 2022;38(2):137-150. [DOI: 10.1177/08850666221114303](https://doi.org/10.1177/08850666221114303)
7. Beach SR, Gomez-Bernal F, Huffman JC, Fricchione GL. Alternative treatment strategies for catatonia: A systematic review. *Gen Hosp Psychiatry*. 2017;48:1-19. [DOI: 10.1016/j.genhosppsych.2017.06.011](https://doi.org/10.1016/j.genhosppsych.2017.06.011)
8. Gunther M, Tran N, Jiang S. Zolpidem for the Management of Catatonia: A Systematic Review. *J Acad Consult Liaison Psychiatry*. 2024;66(1):49-56. [DOI: 10.1016/j.jaclp.2024.10.004](https://doi.org/10.1016/j.jaclp.2024.10.004)


---

## Borderline Personality Disorder (Aug 27)

- **Slug:** `cotw_20260827_bpd_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-27_borderline-personality-disorder_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 2,452 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-08-27)

**TL;DR (shown above the page text):**

> A third admission, a five-drug regimen, and a 'treatment-resistant bipolar' label that was never right - BPD is diagnosed from the longitudinal pattern, treated definitively with psychotherapy, and managed on a chronic vs. acute-on-chronic risk frame.

**Key points (bulleted card):**

- ~20-30 minute small-group discussion - no pre-reading required.
- De-identified synthetic case; each discussion question is paired with a teaching point.
- Resident level. Facilitator notes are kept separate from the learner-facing stem.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Work the stem cold: take your own history, commit to a differential, and name your next step before reading a single teaching point. The guided questions are written to be answered, not skimmed.
- **mse** — Say out loud what each exam finding in the vignette rules in and rules out — the discrimination between look-alike syndromes is what the case is drilling.
- **safety** — Safety content in every case is oriented to recognition, escalation, and safety planning. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Before moving on, rehearse one sentence you would actually say to this patient or family, in plain language and out loud.
- **collateral** — Ask yourself what collateral would change your differential here, and who you would have to call to get it.
- **rounds** — If you are running the session, the facilitator notes flag the errors this case most often surfaces and the evidence-quality distinctions worth naming out loud.
- **exam** — Teaching takeaway: A third admission, a five-drug regimen, and a 'treatment-resistant bipolar' label that was never right - BPD is diagnosed from the longitudinal pattern, treated definitively with psychotherapy, and managed on a chronic vs. acute-on-chronic risk frame.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `communication`, `team`, `exam`
- **Shelf blueprint tags:** `personality`, `safety`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-27"}

#### Page text (as shipped)

# Case of the Week — August 27, 2026 (Resident Edition)

## Borderline Personality Disorder: Presentation & Management

> **De-identified synthetic teaching case.** This case is a fictional composite created for teaching. It contains no real patient details. Citations below are based on articles retrieved from PubMed; DOI links are provided in the reference list.
>
> **Learner level:** Psychiatry residents (PGY-1–3) · **Format:** ~25–30 minute guided discussion · **Assumes:** DSM-5-TR fluency, familiarity with common agents

---

# PART 1 — LEARNER-FACING CASE

## Case Stem

Ms. R is a 24-year-old graduate student admitted overnight to the inpatient unit after presenting with escalating suicidal ideation in the context of a rupture with her thesis advisor, whom she describes as "the only person who ever believed in me — until he abandoned me like everyone else." This is her third psychiatric presentation in 14 months; prior discharge diagnoses include "bipolar II, treatment-refractory," "recurrent MDD," and "unspecified mood disorder."

Her current regimen, accumulated across these episodes, is quetiapine 300 mg qHS, lamotrigine 200 mg daily, sertraline 150 mg daily, and lorazepam 1 mg TID PRN, of which she takes "two or three most days." She reports mood shifts measured in hours, nearly always triggered by perceived rejection; chronic emptiness "since middle school"; a string of intense relationships with idealization–devaluation cycles; recurrent superficial self-injury during states of dissociative numbness ("to feel something again"); and stress-related episodes of feeling that people are conspiring against her, lasting hours and resolving with reassurance. She meets no criteria for a current or past hypomanic episode on careful longitudinal review. She reports nightmares and hypervigilance dating to childhood emotional abuse, and drinks to intoxication 2–3 nights weekly, more during crises.

Overnight she was described by night staff as "the most insightful patient on the unit"; by morning she has filed a complaint against her assigned nurse and requested a different treatment team. On rounds she is articulate and engaging, then abruptly hostile when her attending mentions discharge planning, stating, "If you discharge me, whatever happens is on you." She later apologizes tearfully, saying she was terrified of being "thrown away again." She denies current intent or plan; she wants "a medication that finally works."

## Discussion Questions (learner version)

1. Walk through the discriminating features between BPD and bipolar II disorder in this history. Why does the distinction keep getting missed, and what are the costs of the mislabel?
2. How would you formally establish the diagnosis and severity, and how do you handle the co-occurring PTSD and alcohol use in your formulation?
3. Appraise the psychotherapy evidence base for BPD: what do the major meta-analyses actually show, which modalities have the strongest support, and how robust are those effects?
4. Critically evaluate her medication regimen against the pharmacotherapy evidence. Design a concrete deprescribing plan, including sequencing and what you tell her.
5. She says, "If you discharge me, whatever happens is on you." Formulate her suicide risk (chronic vs. acute-on-chronic), and describe how you document and manage risk around discharge, including safety planning.
6. The overnight/day-shift split and the team complaint are already fracturing the milieu. What is happening psychodynamically, and what concrete team-level interventions prevent iatrogenic harm?
7. No DBT program has openings for five months. What does generalist, evidence-informed management (e.g., Good Psychiatric Management) look like as a bridge, and what do you tell her about prognosis?

---

# PART 2 — FACILITATOR GUIDE (not for learner distribution)

## Discussion Questions with Teaching Points

**Q1. BPD vs. bipolar II: discrimination and the cost of mislabeling.**
*Teaching point:* Push residents past the checklist to the **longitudinal architecture**: episode duration (hours–days, interpersonally indexed vs. ≥4-day sustained hypomania), phenomenology of "highs" (relief/excitement within relationships vs. autonomous drive states with decreased need for sleep), inter-episode baseline (chronic emptiness and identity diffusion vs. euthymic intervals), and reactivity signature (rejection-cued vs. spontaneous or seasonal). Stress-related paranoid ideation and dissociation lasting hours are BPD criterion-9 phenomena, not psychotic-spectrum or mixed features. The cost of mislabeling: years of ineffective polypharmacy, escalating regimens each crisis, foreclosed access to the psychotherapies that actually work, and reinforcement of an externalizing illness model ("my meds aren't working") that undermines agency [1,2].

**Q2. Formal diagnosis, severity, and comorbidity in the formulation.**
*Teaching point:* Establish DSM-5-TR criteria via semistructured assessment (e.g., SCID-5-PD module; MSI-BPD as a screen), anchored in longitudinal course and collateral. Expect comorbidity as the rule — mood disorders ~83%, anxiety disorders ~85%, SUD ~78% [1] — and formulate hierarchically: BPD as the organizing diagnosis explaining the pattern; PTSD and AUD as co-primary targets, not afterthoughts. Etiologically, integrate gene–environment interplay: heritable emotional sensitivity plus adverse childhood experiences (her emotional abuse history) shaping rejection hypersensitivity [1,2]. Naming the diagnosis explicitly, with psychoeducation, is guideline-consistent care — concealment predicts treatment incoherence. Severity staging (self-injury frequency, hospitalization pattern, functioning) sets the outcome metrics for everything that follows.

**Q3. What the psychotherapy evidence actually shows.**
*Teaching point:* Residents should be able to cite the numbers, not just the slogan "therapy works." The 2020 Cochrane review (75 RCTs, n=4507): psychotherapy vs. TAU reduces BPD severity with SMD −0.52 (95% CI −0.70 to −0.33; moderate certainty) — the only primary outcome crossing the minimal clinically relevant difference — with smaller, low-certainty effects on self-harm (SMD −0.32) and suicide-related outcomes (SMD −0.34); DBT and MBT are the best-studied modalities, and subgroup analyses show **no clear superiority of any specific brand** vs. TAU [3]. The focused 2022 re-analysis of adult trials: DBT reduced self-harm (SMD −0.54) and improved psychosocial functioning; MBT reduced self-harm (RR 0.51) and suicide-related outcomes (RR 0.10); adjunctive DBT skills training carried moderate-certainty benefit for BPD severity (SMD −0.66) [4]. Cristea et al.'s independent meta-analysis (33 RCTs): borderline-relevant outcomes g≈0.32–0.40, durable at follow-up (g=0.45), with DBT and psychodynamic approaches the only clusters beating controls — but effects are **small-to-moderate, inflated by risk of bias and publication bias, and unstable at follow-up** [5]. Honest synthesis: structured, BPD-specific therapy is clearly better than unstructured care; brand loyalty is weakly supported; common factors (coherent frame, hierarchy of targets, therapist stance) likely carry much of the effect [3,4,5].

**Q4. Pharmacotherapy appraisal and deprescribing design.**
*Teaching point:* The evidence is stark: the 2022 Cochrane review (46 RCTs, n=2769) found **no medication class beat placebo on any primary outcome** — BPD severity, self-harm, suicide-related outcomes, psychosocial functioning — with mostly very-low-certainty evidence; secondary signals are thin (SGAs: slight reduction in interpersonal problems, SMD −0.21; mood stabilizers: interpersonal problems SMD −0.58, low certainty) [6]. Gartlehner et al. similarly: of ~87 agents in clinical use, trials exist for nine; anticonvulsants may improve anger/affective lability on low-certainty, mostly single-study evidence — this against a backdrop where up to 96% of patients with BPD receive psychotropics [7]. No agent is FDA-approved for BPD; guideline-consistent practice reserves medication for discrete comorbid disorders and time-limited crisis use (low-dose antipsychotic or sedative antihistamine preferred; **benzodiazepines avoided** — disinhibition, misuse liability, and she is already using lorazepam daily with alcohol) [1,6,7].
*Deprescribing plan for Ms. R:* (1) Frame first — "we are un-burying you from medications that were never going to treat this" — tie every step to the illness model so taper ≠ abandonment. (2) **Lorazepam first**: it is the active harm (daily use + AUD + disinhibition); convert to scheduled taper with withdrawal monitoring given concurrent alcohol use. (3) Reassess sertraline against a *cleanly established* comorbid MDD or PTSD indication — it may earn its place; if retained, retain deliberately. (4) Taper quetiapine next (metabolic burden, sedation masquerading as mood benefit), possibly retaining a brief low-dose crisis-only plan. (5) Lamotrigine last and slowly. One change at a time, defined outcome metrics (self-injury frequency, crisis presentations), explicit relapse plan, and documentation that this is evidence-based de-escalation, not withdrawal of care.

**Q5. "Whatever happens is on you": risk formulation and discharge management.**
*Teaching point:* Formulate explicitly in the **chronic vs. acute-on-chronic** framework: her chronic risk is elevated at baseline (recurrent SI, self-injury, AUD, trauma history); the assessment question is whether acute-on-chronic elevation persists (intent, plan, preparatory behavior, command phenomena, intoxication, recent severe loss without stabilization). The statement on rounds is best understood functionally — an attachment-driven bid to prevent abandonment — and is managed by **naming the fear, not capitulating or counter-threatening**: validate the terror of discharge, restate the shared plan, and involve her in criteria-based discharge planning. Prolonged nonspecific admission reinforces crisis-contingent care and is itself iatrogenic; brief, goal-defined admission with a structured landing is the evidence-informed middle path [1,2]. Before discharge: collaborative **safety plan** (warning signs → internal coping → social contacts → professional contacts → environment safety with lethal-means counseling → crisis lines/988), sobriety-contingent elements given AUD, collateral engagement, and near-term follow-up. **Documentation:** record the chronic/acute-on-chronic formulation, protective factors, the functional analysis of the statement, capacity, the risk-benefit reasoning for discharge *including the risks of continued hospitalization*, and the contingency plan. This is both good care and the correct medicolegal posture.

**Q6. Splitting and the milieu: team-level management.**
*Teaching point:* The night/day discrepancy and the complaint are textbook **splitting** — but teach it as a two-person phenomenon: the patient's unintegrated self- and object-representations *recruit* real staff disagreements (projective identification), and teams then enact the split ("she's manipulative" vs. "she's misunderstood"). Interventions are structural, not exhortative: a single voice for the plan (one attending communicates decisions), brief daily staff huddle to surface and metabolize countertransference, explicit behavioral frame shared with the patient, complaint handled through the normal process without either punitive drift or special exception, and supervision that names staff feelings as diagnostic data rather than failings. "Manipulative" is reframed as *the best available strategy of a person with rejection hypersensitivity and few regulation skills* — this single reframe measurably changes team behavior [1,2].

**Q7. Bridging without DBT: generalist management and prognosis.**
*Teaching point:* Brand-name therapy scarcity is the norm, and the trial literature justifies a generalist alternative: **Good Psychiatric Management (GPM)** — case management plus psychodynamically informed supportive therapy, organized around the interpersonal hypersensitivity model: psychoeducation and explicit diagnostic disclosure, "life outside treatment" focus (work/school before intense affect exploration), conservative prescribing with deprescribing, chronic-vs-acute risk frame, and defined intersession contact expectations. GPM performed comparably to DBT in the principal head-to-head trial and is designed for dissemination to general psychiatrists and residents [8]. Weekly GPM-informed individual contact + adjunctive DBT skills group (moderate-certainty adjunctive evidence [4]) + AUD treatment (motivational interviewing ± naltrexone) + trauma-focused therapy sequenced once stabilized is a defensible, evidence-informed bridge. **Prognosis:** communicate honest hope — longitudinal cohorts show most patients achieve symptomatic remission over 5–10 years with low relapse, while *functional* recovery lags and tracks with structured treatment; early intervention in adolescence/young adulthood improves trajectory [1,2].

## Ranked Differential Diagnosis

1. **Borderline personality disorder** — criterion-level fit across all four sectors (interpersonal, identity, affective, behavioral) with criterion-9 stress-related paranoid ideation/dissociation; longitudinal course diagnostic.
2. **PTSD (comorbid, probable)** — childhood emotional abuse, nightmares, hypervigilance; co-primary treatment target, and dissociative self-injury overlaps both constructs.
3. **Alcohol use disorder (comorbid, active)** — 2–3×/week intoxication escalating with crises; independent driver of impulsivity, suicide risk, and benzodiazepine harm.
4. **Bipolar II disorder** — the standing mislabel; excluded on careful longitudinal review (no sustained hypomania, no autonomous episodes); keep on the differential formally given diagnostic stickiness, revisit if course changes.
5. **Recurrent MDD** — discrete episodes may supervene on BPD; requires clean cross-sectional criteria during a period of interpersonal stability to call.
6. **Complex PTSD (ICD-11 frame)** — worth discussing as a formulation alternative; overlapping disturbances of self-organization, but BPD-specific features (abandonment panic, idealization–devaluation) argue for BPD as primary.

## Workup & Management Summary

- **Diagnostics:** SCID-5-PD (BPD module) or equivalent; MSI-BPD screen; PCL-5 and trauma history; AUDIT; longitudinal mood timeline with collateral; CIWA monitoring if withdrawal risk; baseline labs/metabolic panel (quetiapine), LFTs (AUD).
- **Inpatient phase:** Goal-defined brief admission; diagnostic disclosure + psychoeducation; begin lorazepam consolidation/taper; single-voice team frame; safety plan built collaboratively before discharge day.
- **Bridge phase:** GPM-informed weekly individual follow-up; DBT skills group referral (adjunctive evidence moderate [4]); AUD intervention ± naltrexone; deprescribing sequence per Q4; defined crisis pathway (what she does, whom she calls, what the ED does) to break the admission-contingent cycle.
- **Definitive phase:** Full structured psychotherapy (DBT, MBT, TFP, or schema-based per availability) [3,4,5]; sequenced trauma-focused work; medication list minimized to indicated agents only.

## Facilitator Notes

- **Timing (30 min):** Stem 3 min → Q1–Q2 ~7 min (diagnosis/formulation) → Q3–Q4 ~9 min (evidence appraisal — make them cite numbers) → Q5–Q6 ~8 min (risk, milieu) → Q7 ~3 min (systems/prognosis).
- **Level calibration:** PGY-1s: prioritize Q1, Q2, Q5. PGY-2/3s: press hardest on Q3–Q4 (critical appraisal — certainty of evidence, MIREDIF, publication bias) and Q6 (countertransference articulacy).
- **Common resident pitfalls:** (1) accepting the inherited bipolar label; (2) deprescribing abruptly or moralistically; (3) documenting "contracted for safety" instead of a risk formulation; (4) meeting the discharge threat with defensiveness or capitulation rather than functional analysis; (5) letting "manipulative" stand unchallenged in team discourse.
- **Safety framing:** Keep all suicide/self-harm discussion at the level of recognition, formulation, escalation, documentation, and safety planning. Do not discuss methods or lethality specifics; redirect if learners drift there.
- **Discussion spice (if time):** Is the psychotherapy evidence base's brand-agnosticism (Cochrane subgroup null [3]) an argument for common-factors training over expensive certification pipelines? Good 5-minute debate.

---

## References

Based on articles retrieved from PubMed. Citation fields (journal, year, volume/issue/pages, PMID, DOI) verified via PubMed metadata.

1. Leichsenring F, Heim N, Leweke F, Spitzer C, Steinert C, Kernberg OF. Borderline Personality Disorder: A Review. *JAMA*. 2023;329(8):670-679. PMID: 36853245. [DOI: 10.1001/jama.2023.0589](https://doi.org/10.1001/jama.2023.0589)
2. Bohus M, Stoffers-Winterling J, Sharp C, Krause-Utz A, Schmahl C, Lieb K. Borderline personality disorder. *Lancet*. 2021;398(10310):1528-1540. PMID: 34688371. [DOI: 10.1016/S0140-6736(21)00476-1](https://doi.org/10.1016/S0140-6736(21)00476-1)
3. Storebø OJ, Stoffers-Winterling JM, Völlm BA, et al. Psychological therapies for people with borderline personality disorder. *Cochrane Database Syst Rev*. 2020;5(5):CD012955. PMID: 32368793. [DOI: 10.1002/14651858.CD012955.pub2](https://doi.org/10.1002/14651858.CD012955.pub2)
4. Stoffers-Winterling JM, Storebø OJ, Kongerslev MT, et al. Psychotherapies for borderline personality disorder: a focused systematic review and meta-analysis. *Br J Psychiatry*. 2022;221(3):538-552. PMID: 35088687. [DOI: 10.1192/bjp.2021.204](https://doi.org/10.1192/bjp.2021.204)
5. Cristea IA, Gentili C, Cotet CD, Palomba D, Barbui C, Cuijpers P. Efficacy of Psychotherapies for Borderline Personality Disorder: A Systematic Review and Meta-analysis. *JAMA Psychiatry*. 2017;74(4):319-328. PMID: 28249086. [DOI: 10.1001/jamapsychiatry.2016.4287](https://doi.org/10.1001/jamapsychiatry.2016.4287)
6. Stoffers-Winterling JM, Storebø OJ, Pereira Ribeiro J, et al. Pharmacological interventions for people with borderline personality disorder. *Cochrane Database Syst Rev*. 2022;11(11):CD012956. PMID: 36375174. [DOI: 10.1002/14651858.CD012956.pub2](https://doi.org/10.1002/14651858.CD012956.pub2)
7. Gartlehner G, Crotty K, Kennedy S, et al. Pharmacological Treatments for Borderline Personality Disorder: A Systematic Review and Meta-Analysis. *CNS Drugs*. 2021;35(10):1053-1067. PMID: 34495494. [DOI: 10.1007/s40263-021-00855-4](https://doi.org/10.1007/s40263-021-00855-4)
8. Links PS, Ross J. Good Psychiatric Management of Borderline Personality Disorder: Foundations and Future Challenges. *Am J Psychother*. 2024;78(1):4-10. PMID: 38952224. [DOI: 10.1176/appi.psychotherapy.20230044](https://doi.org/10.1176/appi.psychotherapy.20230044)

---

*Prepared for the Psychiatry Clerkship / Residency teaching series — Case of the Week. Joshua Moss, MD | Psychiatrist*
