# RESIDENT · Curriculum content — volume 9

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Practice and Exam Prep

---

## One Patient, Six Weeks

- **Slug:** `one-patient-six-weeks.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/one-patient-six-weeks.html`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Category:** longitudinal-simulation · **Risk level:** `moderate` · **Disclaimer:** `fictional-simulation-supervision`
- **Related pages:** `pg_interview.md`, `ddx.md`, `medical_workup.md`, `psychopharm_primer.md`, `med_monitoring.md`, `collateral_workflow.md`, `family_playbook.md`, `exp_family.md`, `pg_suicide.md`, `agitation.md`, `doc_oral.md`, `shelf.md`, `evidence_inpatient.md`
- **Storage keys:** `cw_longitudinal_v1`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- One Patient, Six Weeks Reviewed by Joshua Moss, MD on 2026-08-11
- Skip to content Longitudinal case arc
- One Patient, Six Weeks
- Follow one fictional inpatient across changing information, relationships, safety questions, treatment conversations, and the final handoff.
- Boundary: fictional composite only. Do not enter patient information. This is a learning simulation, not a clinical decision tool or substitute for supervision and local policy.
- Loading the longitudinal case...
- If someone is in crisis
- On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
- 988 Suicide & Crisis Lifeline — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
- Crisis Text Line — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
- Maine Crisis Line — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
- Veterans Crisis Line — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
- Emergency services — 911. 24/7. For imminent danger to life.
- Contacts verified 2026-07-27 against official sources. Maintained in crisis_resources.json ; do not edit these numbers inline.

**Authored clinical strings (22):**

- ]/g,function(c){return {'&':'&',' ':'>','"':'"'}[c];});} function requestedWeek(){try{var n=parseInt(new URLSearchParams(location.search).get('week')||'1',10);return Math.max(0,Math.min(5,n-1));}catch(_){return 0;}} function loadProgress(){try{var p=JSON.parse(localStorage.getItem('cw_longitudinal_v1')||'{}');return p&&p.version===1?p:{version:1,current:0,completed:{}};}catch(_){return {version:1,current:0,completed:{}};}} function saveProgress(){try{localStorage.setItem('cw_longitudinal_v1',JSON.stringify(state.progress));}catch(_){} } function week(){return state.caseData.weeks[state.current];} function record(id){return state.progress.completed[id]||{checks:{}};} function complete(w){var r=record(w.id);return (w.checklist||[]).length>0&&(w.checklist||[]).every(function(_,i){return !!r.checks['c'+i];});} function completedCount(){return state.caseData.weeks.filter(complete).length;} function setWeek(i){state.current=Math.max(0,Math.min(state.caseData.weeks.length-1,i));state.progress.current=state.current;saveProgress();try{history.replaceState(null,'','?week='+(state.current+1));}catch(_){}render();} function weekList(){return '<div class=
- >'+state.caseData.weeks.map(function(w,i){var on=i===state.current,done=complete(w);return '<button type=
- ;} function sidebar(){var done=completedCount(),total=state.caseData.weeks.length,pct=Math.round(done*100/total);return
- Longitudinal case progress
- ;} function patientCard(){var p=state.caseData.patient;return
- ;} function checklist(w){ var r=record(w.id); return
- +w.checklist.map(function(item,i){ var key=
- +i; var on=!!r.checks[key]; var inputId=
- checkitem'+(on?' done':'')+'
- ; } function links(w){return
- +w.links.map(function(link){var param=link.kind===
- ;} function weekCard(w){var done=complete(w);var r=record(w.id);return
- status'+(done?' done':'')+'
- +links(w);} function render(){if(!state.caseData){app.innerHTML=
- ;return;}var w=week();app.innerHTML=
- ,function(ev){var weekButton=ev.target.closest&&ev.target.closest(
- )){state.progress={version:1,current:0,completed:{}};setWeek(0);}}}); app.addEventListener(
- ,function(ev){var input=ev.target.closest&&ev.target.closest(
- );if(!input)return;var w=week(),r=record(w.id);r.checks=r.checks||{};r.checks[input.getAttribute(
- )]=!!input.checked;r.at=new Date().toISOString().slice(0,10);state.progress.completed[w.id]=r;saveProgress();render();}); fetch(
- ).then(function(r){if(!r.ok)throw new Error(
- );return r.json();}).then(function(data){state.caseData=data;state.current=Math.max(0,Math.min(data.weeks.length-1,state.progress.current||state.current));render();}).catch(function(){app.innerHTML=

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

**Authored clinical strings (83):**

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
- s progress on Today) and by the session receipt inside a tool (to mark the step that just finished and offer the next one). Injected via /*__BLOCK_STORE__*\/ so the shell and every tool share one implementation. Shape: {v:1, minutes, createdAt, steps:[{kind:
- , ref, title, min, n?, cat?, done?, doneAt?}]}. A page step is never marked here — its done state is derived from cw_progress_v1 at render time, so ticking the page anywhere counts. A block older than CW_BLOCK_TTL_MS is pruned on load: a plan built for one morning
- s own primary (spec.actions) beside "Back to Today"; 3. marks the tool
- s openPage message — a plain href would be caught by the in-iframe interceptor and lose its query, so the delegated listener below posts the full route instead; outside an iframe it falls back to a real navigation. */ function cwReceiptEsc(s){ return String(s===undefined||s===null?
- ); } function cwReceiptLocalDay(nowMs){ var d=new Date(nowMs), m=d.getMonth()+1, day=d.getDate(); return d.getFullYear()+
- )+day; } /* Writes the legacy {done:true,at} entry the front door reads. Returns true only when this call changed the store, so "Marked done on Today" is said once, not on every re-render. */ function cwReceiptMarkDone(ref, nowMs){ if(!ref) return false; try{ var p=JSON.parse(localStorage.getItem(
- ) p={}; if(p[ref]&&p[ref].done===true) return false; p[ref]={done:true,at:cwReceiptLocalDay(nowMs)}; localStorage.setItem(
- , JSON.stringify(p)); return true; }catch(_){ return false; } } function cwReceiptStepRoute(step){ var s=step||{}; if(s.kind===
- +encodeURIComponent(String(s.n||1)); if(s.kind===
- )); } function cwReceiptNextStep(block, doneMap){ var b=block||{}, list=b.steps||[], d=doneMap||{}, i, s, done=0; var next=null; for(i=0;i<list.length;i++){ s=list[i]||{}; var isDone=(s.kind===
- )?(d[s.ref]===true):(s.done===true); if(isDone) done++; else if(!next) next=s; } return {next:next, done:done, total:list.length}; } function cwReceiptDoneMap(){ var out={}; try{ var p=JSON.parse(localStorage.getItem(
- ){ for(var k in p){ if(Object.prototype.hasOwnProperty.call(p,k)&&p[k]&&p[k].done===true) out[k]=true; } } }catch(_){ } return out; } var CW_RECEIPT_CSS=
- ; function cwReceiptEnsureStyle(){ try{ if(typeof document===
- )) return; var st=document.createElement(
- ; st.textContent=CW_RECEIPT_CSS; document.head.appendChild(st); }catch(_){ } } var cwReceiptWired=false; function cwReceiptNavigate(ref, search){ var framed=false; try{ framed=(typeof window!==
- )&&window.self!==window.top; }catch(_){ framed=true; } if(framed){ try{ window.parent.postMessage({type:
- ); return; }catch(_){ } } try{ location.href=
- +encodeURIComponent(ref)))); }catch(_){ } } function cwReceiptWire(){ if(cwReceiptWired||typeof document===
- ) return; cwReceiptWired=true; document.addEventListener(
- , function(ev){ var t=ev.target&&ev.target.closest?ev.target.closest(
- ):null; if(!t) return; ev.preventDefault(); if(t.hasAttribute(
- ); return; } cwReceiptNavigate(t.getAttribute(
- ); }, true); } function cwReceipt(spec){ var s=spec||{}, nowMs=(typeof s.nowMs===
- )?s.nowMs:Date.now(), i; cwReceiptEnsureStyle(); cwReceiptWire(); var marked=cwReceiptMarkDone(s.ref, nowMs); var block=null, progress=null; if(typeof blockLoad===
- ){ if(s.blockKind&&typeof blockMarkStep===
- ) blockMarkStep(s.blockKind, nowMs); block=blockLoad(nowMs); if(block) progress=cwReceiptNextStep(block, cwReceiptDoneMap()); } var h=
- ; var stats=s.stats||[]; if(stats.length){ h+=
- ; for(i=0;i<stats.length;i++){ var st=stats[i]||{}, tone=st.tone===
- ; } var reread=s.reread||[]; if(reread.length){ h+=
- ; for(i=0;i<reread.length;i++){ var r=reread[i]||{}; h+=
- cw-receipt__tag'+(r.warn?' is-warn':'')+'
- ; var next=progress&&progress.next; if(next){ var route=cwReceiptStepRoute(next); h+=
- cw-receipt__btn is-primary
- ; }else{ var acts=s.actions||[]; for(i=0;i<acts.length;i++){ var a=acts[i]||{}; h+=
- cw-receipt__btn'+(a.primary?' is-primary':'')+'
- ; if(!next&&typeof blockClear===
- ; return {html:h, marked:marked, next:next||null}; } /* effectiveNewPerDay: the single helper BOTH the metrics() display and start()
- s 2nd grade sets calibLog
- t out-rank short- interval cards that are badly late. Shuffle only within bands of 5 to keep light variety without undoing the ordering. */ function ratio(c){var st=s.cards[c.id]; return (now-st.due)/((st.ivl||1)*DAY);} due.sort(function(a,b){ return ratio(b)-ratio(a); }); for(var i=0;i<due.length;i+=5){ var band=due.slice(i,i+5); shuffle(band); for(var j=0;j<band.length;j++) due[i+j]=band[j]; } shuffle(neu); var newRemain=Math.max(0,effectiveNewPerDay(s)-(s.day.newToday||0)); var q=due.concat(neu.slice(0,newRemain)); if(ahead){ fut.sort(function(a,b){return a[1]-b[1];}); q=q.concat(fut.map(function(x){return x[0];})); } if(!q.length){ setSess({empty:true}); return; } /* A timed block asks for a bounded slice (?block=1&limit=N) — most-overdue first, as above. */ var limit=blockLimit.current; blockLimit.current=null; var fromBlock=(typeof limit===
- &&limit>=1); if(fromBlock&&limit Again or Hard only; the buttons disable to match, and this guard also covers the keyboard shortcuts (keys 3/4). */ if(g>1 && s.chosen!==correctIdx(s.card)) return; var st=loadS(); st=rollDay(st); var card=s.card; var existed=!!st.cards[card.id]; var was=st.cards[card.id]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0}; st.cards[card.id]=applyGrade(was,GRADE_NAMES[g],{fuzzKey:card.id}); if(!existed){ st.day.newToday=(st.day.newToday||0)+1; } bumpStreak(st); st.stats.totalReviews=(st.stats.totalReviews||0)+1; var ci=correctIdx(card); var gotIt=(s.chosen===ci); st.stats.seen=(st.stats.seen||0)+1; if(gotIt)st.stats.correct=(st.stats.correct||0)+1; saveS(st); setStore(Object.assign({},st)); var rq=gradedThisSession[card.id]?1:0; gradedThisSession[card.id]=1; calibLog({s:
- ,id:card.id,p:GRADE_NAMES[g]||g,sug:sug,a:gotIt?1:0,rq:rq,ts:Date.now()}); // advance queue var q=s.queue.slice(); var pos=s.pos; if(g===0){ q.push(card); } // requeue lapses to end of this session var nextPos=pos+1; var reviewed=s.reviewed+1, correct=s.correct+(gotIt?1:0); var misses=(s.misses||[]).slice(); if(!gotIt&&!misses.some(function(m){return m.id===card.id;})) misses.push({id:card.id,deckTitle:card.deckTitle,q:card.q}); if(nextPos>=q.length){ setSess({finished:true,reviewed:reviewed,correct:correct,misses:misses,fromBlock:!!s.fromBlock}); return; } setSess({queue:q,pos:nextPos,card:q[nextPos],chosen:-1,revealed:false,reviewed:reviewed,correct:correct,total:s.total,misses:misses,fromBlock:!!s.fromBlock}); } function endSession(){ setSess(null); setTick(function(x){return x+1;}); } function setNewPerDay(v){ var s=loadS(); s.settings.newPerDay=v; s.settings.userSet=true; persist(s); } function resetAll(){ if(!window.confirm("Reset all spaced-repetition progress? This clears your review schedule and streak. This also clears your calibration history. Reading progress elsewhere is unaffected."))return; try{localStorage.removeItem(KEY);}catch(_){ } calibClear(); setStore(freshStore()); setSess(null); setTick(function(x){return x+1;}); } var head=e("div",{className:"topline"}, e("div",{className:"logo"},"ψ"), e("div",null,e("div",{className:"ttl"},"Daily Review"),e("div",{className:"by"},"Spaced repetition · Joshua Moss, MD")), e("button",{className:"thmbtn",onClick:function(){toggleTheme(setTheme);},title:"Toggle dark mode","aria-label":"Toggle dark mode"}, theme==="dark"?"☀":"☾")); if(err) return e("div",{className:"wrap"},head,e("div",{className:"err"},"Could not load the question bank (quizzes.json). Open this tool from the hub so it can find its data, then try again.")); if(!cards) return e("div",{className:"wrap"},head,e("div",{className:"panel muted"},"Loading the question bank…")); /* ---- active session ---- */ if(sess && sess.queue){ var c=sess.card, ci=correctIdx(c), pctp=Math.round(100*sess.pos/Math.max(1,sess.total)); var gotIt=(sess.chosen===ci); var sug=gotIt?
- ; // single source of truth: feeds the
- className below AND grade()
- 🎧 Listen — paper overview
- Missed items can only be graded Again or Hard
- Pick the best answer (or press 1–
- One card came back for another look.
- cards came back for another look.
- A miss here is scheduled sooner, not scored — it returns within the day so the second pass is the one that sticks.
- Held cards move out; the next pass is further away.
- -day streak in Daily Review.
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

**Authored clinical strings (47):**

- Strong — exam-ready range.
- Solid — tighten the misses.
- Passing range — keep drilling.
- Psychopharm & Med Emergencies
- t label a draft mid-block without breaking the simulation, so the conservative subset is the attested 142. Categories map onto the existing BLUEPRINT topic regexes. */ var CAT_TOPIC={mood:"Mood",psychosis:"Psychosis",anxiety:"Anxiety, OCD & Trauma",substance:"Substance Use",pharm:"Psychopharm & Med Emergencies",neurocog:"Delirium, Dementia & MCI",personality:"Personality",childdev:"Child & Adolescent",otherdx:"Somatic & Related",safety:"Psychiatric Emergencies",ethics:"Interview, Ethics & Law",relational:"Relational & Family"}; function bankPool(data){ var out=[]; (((data&&data.items)||[])).forEach(function(it){ if(it.status!=="attested") return; if(!it.stem||!Array.isArray(it.options)||it.options.length<2) return; var hasCorrect=false; it.options.forEach(function(op){ if(op&&op.c)hasCorrect=true; }); if(!hasCorrect) return; /* Options are shuffled ONCE here (bank storage order is authoring order — the draft pool is known to lean on first-position answers) and letters relabel automatically because every render site derives them from array index (KEYS[i]). Correct option explains via the item
- s own primary (spec.actions) beside "Back to Today"; 3. marks the tool
- s openPage message — a plain href would be caught by the in-iframe interceptor and lose its query, so the delegated listener below posts the full route instead; outside an iframe it falls back to a real navigation. */ function cwReceiptEsc(s){ return String(s===undefined||s===null?
- ); } function cwReceiptLocalDay(nowMs){ var d=new Date(nowMs), m=d.getMonth()+1, day=d.getDate(); return d.getFullYear()+
- )+day; } /* Writes the legacy {done:true,at} entry the front door reads. Returns true only when this call changed the store, so "Marked done on Today" is said once, not on every re-render. */ function cwReceiptMarkDone(ref, nowMs){ if(!ref) return false; try{ var p=JSON.parse(localStorage.getItem(
- ) p={}; if(p[ref]&&p[ref].done===true) return false; p[ref]={done:true,at:cwReceiptLocalDay(nowMs)}; localStorage.setItem(
- , JSON.stringify(p)); return true; }catch(_){ return false; } } function cwReceiptStepRoute(step){ var s=step||{}; if(s.kind===
- +encodeURIComponent(String(s.n||1)); if(s.kind===
- )); } function cwReceiptNextStep(block, doneMap){ var b=block||{}, list=b.steps||[], d=doneMap||{}, i, s, done=0; var next=null; for(i=0;i<list.length;i++){ s=list[i]||{}; var isDone=(s.kind===
- )?(d[s.ref]===true):(s.done===true); if(isDone) done++; else if(!next) next=s; } return {next:next, done:done, total:list.length}; } function cwReceiptDoneMap(){ var out={}; try{ var p=JSON.parse(localStorage.getItem(
- ){ for(var k in p){ if(Object.prototype.hasOwnProperty.call(p,k)&&p[k]&&p[k].done===true) out[k]=true; } } }catch(_){ } return out; } var CW_RECEIPT_CSS=
- ; function cwReceiptEnsureStyle(){ try{ if(typeof document===
- )) return; var st=document.createElement(
- ; st.textContent=CW_RECEIPT_CSS; document.head.appendChild(st); }catch(_){ } } var cwReceiptWired=false; function cwReceiptNavigate(ref, search){ var framed=false; try{ framed=(typeof window!==
- )&&window.self!==window.top; }catch(_){ framed=true; } if(framed){ try{ window.parent.postMessage({type:
- ); return; }catch(_){ } } try{ location.href=
- +encodeURIComponent(ref)))); }catch(_){ } } function cwReceiptWire(){ if(cwReceiptWired||typeof document===
- ) return; cwReceiptWired=true; document.addEventListener(
- , function(ev){ var t=ev.target&&ev.target.closest?ev.target.closest(
- ):null; if(!t) return; ev.preventDefault(); if(t.hasAttribute(
- ); return; } cwReceiptNavigate(t.getAttribute(
- ); }, true); } function cwReceipt(spec){ var s=spec||{}, nowMs=(typeof s.nowMs===
- )?s.nowMs:Date.now(), i; cwReceiptEnsureStyle(); cwReceiptWire(); var marked=cwReceiptMarkDone(s.ref, nowMs); var block=null, progress=null; if(typeof blockLoad===
- ){ if(s.blockKind&&typeof blockMarkStep===
- ) blockMarkStep(s.blockKind, nowMs); block=blockLoad(nowMs); if(block) progress=cwReceiptNextStep(block, cwReceiptDoneMap()); } var h=
- ; var stats=s.stats||[]; if(stats.length){ h+=
- ; for(i=0;i<stats.length;i++){ var st=stats[i]||{}, tone=st.tone===
- ; } var reread=s.reread||[]; if(reread.length){ h+=
- ; for(i=0;i<reread.length;i++){ var r=reread[i]||{}; h+=
- cw-receipt__tag'+(r.warn?' is-warn':'')+'
- ; var next=progress&&progress.next; if(next){ var route=cwReceiptStepRoute(next); h+=
- cw-receipt__btn is-primary
- ; }else{ var acts=s.actions||[]; for(i=0;i<acts.length;i++){ var a=acts[i]||{}; h+=
- cw-receipt__btn'+(a.primary?' is-primary':'')+'
- ; if(!next&&typeof blockClear===
- ; return {html:h, marked:marked, next:next||null}; } function refHref(ref){ if(!ref) return null; return /\.html(\?|#|$)/.test(ref)? ("./"+ref) : ("../index.html?page="+encodeURIComponent(ref)); } function correctIdx(o){for(var i=0;i<o.length;i++){if(o[i]&&o[i].c)return i;}return -1;} // ---- Sample preview items (original, classic teaching points). Only used when no SHELF-* decks exist yet. // Clearly labeled as preview; NOT scored content for assessment until the faculty-reviewed bank lands. var SAMPLE=[ {topic:"Mood",diff:"easy",ref:"t_mood.md", q:"A 26-year-old woman is admitted after 5 days of decreased need for sleep, rapid speech, increased spending, and a belief that she has been chosen to reform the hospital. She has had two prior depressive episodes treated with sertraline. On exam she is irritable with pressured speech and flight of ideas. Which of the following is the most appropriate next step?", o:[{t:"Continue sertraline and add cognitive behavioral therapy",c:false,fb:"Antidepressant monotherapy can sustain or worsen mania; the priority is to stop it and start an antimanic agent."}, {t:"Discontinue sertraline and start a mood stabilizer or second-generation antipsychotic",c:true,fb:"Correct — acute mania (bipolar I): stop the antidepressant, begin lithium/valproate or an SGA, and protect sleep."}, {t:"Start fluoxetine for treatment-resistant depression",c:false,fb:"The presentation is mania, not depression; an antidepressant is contraindicated."}, {t:"Obtain brain MRI before initiating any treatment",c:false,fb:"Classic mania with prior mood episodes does not require imaging before treatment; do not delay antimanic therapy."}, {t:"Begin lorazepam as monotherapy",c:false,fb:"A benzodiazepine is adjunctive for agitation/sleep but does not treat the manic episode."}], tp:"Acute mania: stop the antidepressant, start a mood stabilizer or SGA, and protect sleep."}, {topic:"Psychopharm & Med Emergencies",diff:"med",ref:"psychopharm_primer.md", q:"A 30-year-old man on fluoxetine is brought in 8 hours after a friend gave him tramadol for back pain. He is agitated and diaphoretic. Temperature is 39.1°C, heart rate 124. Exam shows hyperreflexia and inducible clonus, greater in the lower extremities. Which of the following is the most likely diagnosis?", o:[{t:"Serotonin syndrome",c:true,fb:"Correct — rapid onset after adding a serotonergic agent (tramadol), with hyperthermia, autonomic instability, and neuromuscular hyperexcitability (clonus, hyperreflexia). Stop the agents, supportive care, consider cyproheptadine."}, {t:"Neuroleptic malignant syndrome",c:false,fb:"NMS follows dopamine antagonists, evolves over days, and features
- rigidity and bradyreflexia — not clonus/hyperreflexia."}, {t:"Anticholinergic toxicity",c:false,fb:"Anticholinergic toxidrome gives dry skin, absent bowel sounds, and normal reflexes — not diaphoresis with clonus."}, {t:"Malignant hyperthermia",c:false,fb:"Malignant hyperthermia is triggered by volatile anesthetics/succinylcholine, not oral serotonergics."}, {t:"Sympathomimetic intoxication",c:false,fb:"Stimulant toxicity can mimic this but lacks the prominent clonus/hyperreflexia and the clear serotonergic trigger."}], tp:"Serotonin syndrome = serotonergic trigger + hyperthermia + clonus/hyperreflexia (lower-limb predominant); NMS = dopamine blocker + rigidity + hyporeflexia over days."}, {topic:"Substance Use",diff:"easy",ref:"withdrawal.html", q:"A 52-year-old man admitted for pancreatitis becomes tremulous and diaphoretic on hospital day 2, with heart rate 116, blood pressure 168/98, and visual misperceptions. He reports drinking a pint of vodka daily until admission. Which of the following is the most appropriate management?", o:[{t:"Symptom-triggered benzodiazepine dosing with CIWA-Ar monitoring, plus thiamine",c:true,fb:"Correct — alcohol withdrawal: benzodiazepines (often CIWA-Ar–guided) are first-line, with thiamine to prevent Wernicke encephalopathy."}, {t:"Scheduled haloperidol",c:false,fb:"Antipsychotics lower the seizure threshold and do not treat the underlying GABA/glutamate dysregulation; they are at most adjunctive for agitation."}, {t:"Intravenous dextrose before any other intervention",c:false,fb:"Give thiamine before/with glucose in at-risk patients — a glucose load alone can precipitate Wernicke encephalopathy."}, {t:"Physical restraints and observation",c:false,fb:"Restraints do not treat withdrawal and can worsen autonomic arousal; pharmacologic treatment is needed."}, {t:"Clonidine monotherapy",c:false,fb:"Clonidine may blunt autonomic signs but does not prevent withdrawal seizures or delirium tremens."}], tp:"Alcohol withdrawal: benzodiazepines (CIWA-Ar–guided) first-line; give thiamine before glucose."}, {topic:"Delirium, Dementia & MCI",diff:"med",ref:"delirium.md", q:"A 78-year-old woman is inattentive and intermittently drowsy two days after hip surgery. Her family says she was cognitively intact at baseline; symptoms fluctuate and worsen at night. She is on oxycodone and diphenhydramine for sleep. Which of the following is the most appropriate first step?", o:[{t:"Identify and treat underlying causes and remove deliriogenic medications",c:true,fb:"Correct — acute, fluctuating inattention with altered arousal is delirium. First-line is to find and fix the cause (pain meds, anticholinergics, infection, metabolic) and use nonpharmacologic measures."}, {t:"Start a scheduled long-acting benzodiazepine",c:false,fb:"Benzodiazepines worsen delirium (except in alcohol/benzo withdrawal) and increase fall risk."}, {t:"Begin donepezil for cognitive decline",c:false,fb:"Cholinesterase inhibitors treat chronic dementia, not acute delirium, and have no role here."}, {t:"Obtain an outpatient neuropsychology referral",c:false,fb:"This is an acute medical problem requiring inpatient workup, not deferred testing."}, {t:"Reassure the family this is expected post-operative confusion and observe",c:false,fb:"Delirium signals an underlying disturbance and predicts poor outcomes; it requires active workup, not watchful waiting."}], tp:"Delirium is a medical emergency: treat the cause and stop deliriogenic drugs; avoid benzodiazepines unless withdrawal-related."}, {topic:"Psychiatric Emergencies",diff:"med",ref:"capacity.html", q:"A 60-year-old man with diabetes and a necrotic foot refuses a recommended amputation. He can describe the gangrene, the risk of fatal sepsis without surgery, the option of amputation, and explains he would rather risk death than lose his leg, citing consistent long-held values. He has no psychosis or cognitive deficit. Which of the following best describes his decision-making capacity?", o:[{t:"He has capacity to refuse the amputation",c:true,fb:"Correct — he demonstrates the four abilities (understanding, appreciation, reasoning, and a stable choice). Capacity is decision-specific; a
- choice with intact reasoning is still a capacitated refusal."}, {t:"He lacks capacity because the refusal is medically dangerous",c:false,fb:"Capacity is about the process of decision-making, not whether the choice matches the medical recommendation."}, {t:"He lacks capacity and a guardian should consent to surgery",c:false,fb:"There is no impairment in the four abilities; overriding a capacitated refusal would violate autonomy."}, {t:"Capacity cannot be assessed without neuropsychological testing",c:false,fb:"Capacity is a clinical, decision-specific bedside determination, not a test score."}, {t:"He has capacity only if he agrees to surgery",c:false,fb:"Capacity does not depend on agreeing with the team; that reasoning is circular."}], tp:"Capacity is decision-specific and rests on four abilities; a high-risk refusal with intact reasoning is still capacitated."} ]; function App(){ var d=useState(null),data=d[0],setData=d[1]; var er=useState(null),err=er[0],setErr=er[1]; var S=useState({view:"config",len:20,diff:"all",mode:"tutor",timed:true,topics:[], items:[],picks:[],flags:{},idx:0,secs:0,total:0,result:null,saved:false,preview:false,revFilter:"missed"}); var st=S[0],setS=S[1]; function set(p){setS(function(prev){return Object.assign({},prev,p);});} useEffect(function(){ fetch("../question_bank.json").then(function(r){return r.json()}).then(setData).catch(function(){setErr("Could not load the question bank (question_bank.json).");}); },[]); // derive pool + topics once data lands var pool=[], preview=false, topicsAll=[]; if(data){ pool=bankPool(data); if(pool.length===0){ pool=SAMPLE.slice(); preview=true; } var seen={}; pool.forEach(function(it){seen[it.topic]=(seen[it.topic]||0)+1;}); topicsAll=Object.keys(seen).sort(function(a,b){return orderRank(a)-orderRank(b);}).map(function(t){return {t:t,n:seen[t]};}); } // default-select all topics on first data load useEffect(function(){ if(data && st.topics.length===0 && topicsAll.length){ set({topics:topicsAll.map(function(x){return x.t;}), preview:preview}); } },[data]); // exam timer useEffect(function(){ if(st.view!=="exam") return; var id=setInterval(function(){ setS(function(p){ if(p.view!=="exam") return p; if(p.timed){ if(p.secs ="1" && ev.key =q.o.length) return p; if(p.mode==="tutor" && p.picks[p.idx]!=null) return p; // locked after answering in tutor mode var picks=p.picks.slice(); picks[p.idx]=oi; return Object.assign({},p,{picks:picks}); }); } function canAdvance(){ if(st.mode==="tutor") return st.picks[st.idx]!=null; return true; } function advance(){ setS(function(p){ if(p.idx+1 0?Object.assign({},p,{idx:p.idx-1}):p;}); } function toggleFlag(){ setS(function(p){var f=Object.assign({},p.flags);f[p.idx]=!f[p.idx];return Object.assign({},p,{flags:f});}); } function grade(p){ var correct=0, byTopic={}; p.items.forEach(function(q,i){ var ci=correctIdx(q.o), ok=(p.picks[i]===ci && ci>=0); if(ok) correct++; var bt=byTopic[q.topic]=byTopic[q.topic]||{c:0,n:0}; bt.n++; if(ok)bt.c++; }); var secsUsed = p.timed? (p.total-p.secs) : p.secs; var res={n:p.items.length,correct:correct,pct:Math.round(100*correct/Math.max(1,p.items.length)),byTopic:byTopic,secs:secsUsed}; return Object.assign({},p,{view:"result",result:res}); } // Persistent, unconditional live region: same DOM node across every view (config/exam/result), // so a screen reader binds to it once and hears only the CONTENT change when a result lands. var resultMsg = (st.view==="result" && st.result) ? resultMsgFor(st.result.pct) : ""; var liveRegion = e("div",{className:"visually-hidden","aria-live":"polite","aria-atomic":"true"}, (st.view==="result" && st.result) ? (st.result.correct+" of "+st.result.n+" correct, "+st.result.pct+" percent. "+resultMsg) : ""); if(err) return e("div",{className:"wrap"},liveRegion,e("h1",null,"Shelf Mode"),e("div",{className:"card"},err)); if(!data) return e("div",{className:"wrap"},liveRegion,e("div",{className:"loading"},"Loading the question bank…")); // ---------------- CONFIG ---------------- if(st.view==="config"){ var L=loadLS(); var recent=(L.attempts||[]).slice(0,3); var avail=pool.filter(function(it){ var dd=normDiff(it.diff); if(dd==="review")return false; if(st.diff!=="all"&&dd!==st.diff)return false; return st.topics.indexOf(it.topic)>=0; }).length; var lens=[10,20,40].filter(function(n){return true;}); return e("div",{className:"wrap"}, liveRegion, e("h1",null,"Shelf Mode"), e("span",{className:"opt-pill"},"Optional practice · exam simulation"), e("div",{className:"sub"},"A timed, blueprint-weighted vignette set that mirrors the psychiatry COMAT / shelf. Choose your length, topics, and pacing. Single best answer, with feedback and a teaching point on every item."), preview? e("div",{className:"banner"},e("strong",null,"Preview mode. "),"The attested question bank didn
- re back online for the full blueprint-weighted exam.") : null, e("div",{className:"card"}, e("div",{className:"field"}, e("label",{className:"h"},"Length"), e("div",{className:"seg"}, lens.map(function(n){ return e("button",{key:n,className:st.len===n?"on":"",onClick:function(){set({len:n})}}, n+" Q"); })) ), e("div",{className:"field"}, e("label",{className:"h"},"Difficulty"), e("div",{className:"seg"}, [["all","All"],["easy","Easy"],["med","Medium"],["hard","Hard"]].map(function(p){ return e("button",{key:p[0],className:st.diff===p[0]?"on":"",onClick:function(){set({diff:p[0]})}}, p[1]); })) ), e("div",{className:"field"}, e("label",{className:"h"},"Mode"), e("div",{className:"seg"}, e("button",{className:st.mode==="tutor"?"on":"",onClick:function(){set({mode:"tutor"})}},"Tutor — feedback after each"), e("button",{className:st.mode==="exam"?"on":"",onClick:function(){set({mode:"exam"})}},"Exam — feedback at end") ) ), e("div",{className:"field"}, e("label",{className:"h"},"Pacing"), e("div",{className:"seg"}, e("button",{className:st.timed?"on":"",onClick:function(){set({timed:true})}},"Timed · 1.5 min/Q"), e("button",{className:!st.timed?"on":"",onClick:function(){set({timed:false})}},"Untimed") ) ), e("div",{className:"field"}, e("label",{className:"h"},"Topics"), e("div",{className:"linkrow"}, e("button",{onClick:function(){set({topics:topicsAll.map(function(x){return x.t;})})}},"Select all"), e("button",{onClick:function(){set({topics:[]})}},"Clear") ), e("div",{className:"chips",style:{marginTop:"7px"}}, topicsAll.map(function(x){ var on=st.topics.indexOf(x.t)>=0; return e("button",{key:x.t,className:"chip"+(on?" on":""),onClick:function(){ var t=st.topics.slice(),i=t.indexOf(x.t); if(i>=0)t.splice(i,1); else t.push(x.t); set({topics:t}); }}, e("span",null,x.t), e("span",{className:"n"},x.n)); })) ), e("div",{className:"row between",style:{marginTop:"6px"}}, e("span",{className:"meta"}, avail+" item"+(avail===1?"":"s")+" available · drawing "+Math.min(st.len,avail)), e("button",{className:"btn primary",disabled:avail===0,onClick:startExam}, "Start "+Math.min(st.len,avail)+"-question set") ), e("div",{className:"kbd",style:{marginTop:"8px"}},"Tip: press 1–5 to answer, Enter to advance.") ), recent.length? e("div",{className:"card"}, e("label",{className:"h",style:{display:"block",marginBottom:"6px"}},"Recent attempts"), e("div",{className:"recent"}, recent.map(function(r,i){ return e("div",{className:"r",key:i}, e("span",null, r.at+" · "+(r.mode==="tutor"?"Tutor":"Exam")+(r.preview?" · sample":"")), e("span",null, r.correct+"/"+r.n+" ("+r.pct+"%)")); })) ):null, e("div",{className:"disc"},"Optional exam-prep simulation. Items are educational and use fictional composites only (no patient information). Verify management against current guidelines and your team. Progress is saved only in this browser. ",e("br"),"Joshua Moss, MD | Psychiatrist") ); } // ---------------- RESULT ---------------- if(st.view==="result"){ var R=st.result, msg=resultMsg; var bts=Object.keys(R.byTopic).sort(function(a,b){return orderRank(a)-orderRank(b);}); var revItems=st.items.map(function(q,i){return {q:q,i:i};}).filter(function(x){ if(st.revFilter==="all") return true; var ci=correctIdx(x.q.o); return st.picks[x.i]!==ci; }); if(!st.receipt){ var missedItems=st.items.map(function(q,i){return {q:q,i:i};}).filter(function(x){ var ci=correctIdx(x.q.o); return st.picks[x.i]!==ci; }); var weakTopic=null; bts.forEach(function(t){ var b=R.byTopic[t]; var pc=b.c/Math.max(1,b.n); if(b.n>=2&&(weakTopic===null||pc<weakTopic.pc)) weakTopic={t:t,pc:pc}; }); st.receipt=cwReceipt({ tool:
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
<a href="https://doi.org/10.1016/S0140-6736(13)60733-3" target="_blank" rel="noopener">Paper (DOI)</a>

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
<a href="https://doi.org/10.1016/j.cbpra.2011.01.001" target="_blank" rel="noopener">Paper (DOI)</a>


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
<a href="https://pubmed.ncbi.nlm.nih.gov/8979210/" target="_blank" rel="noopener">Paper (PubMed)</a>

**Volkow 2016 - Addiction**  ·  _1:53_
<audio controls preload="none" src="audio/47_LM_46_Volkow_2016_Addiction_1_53.m4a"></audio>
<a href="https://doi.org/10.1056/nejmra1511480" target="_blank" rel="noopener">Paper (DOI)</a>


## Child  (3)
**Bridge 2007 - Pediatric SSRI**  ·  _1:41_
<audio controls preload="none" src="audio/45_LM_48_Bridge_2007_Pediatric_SSRI_1_41.m4a"></audio>
<a href="https://doi.org/10.1001/jama.297.15.1683" target="_blank" rel="noopener">Paper (DOI)</a>

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
**Gutheil-Gabbard 1993 - Boundaries**  ·  _1:46_
<audio controls preload="none" src="audio/38_LM_40_Gabbard_1995_Boundaries_1_46.m4a"></audio>
<a href="https://doi.org/10.1176/ajp.150.2.188" target="_blank" rel="noopener">Paper (DOI)</a>

**Norcross 2011 - Alliance**  ·  _1:44_
<audio controls preload="none" src="audio/25_LM_25_Norcross_2011_Alliance_1_44.m4a"></audio>
<a href="https://doi.org/10.1037/a0022180" target="_blank" rel="noopener">Paper (DOI)</a>

**Shedler 2010 - Psychodynamic**  ·  _1:43_
<audio controls preload="none" src="audio/23_LM_24_Shedler_2010_Psychodynamic_1_43.m4a"></audio>
<a href="https://doi.org/10.1037/a0018378" target="_blank" rel="noopener">Paper (DOI)</a>

**Wampold 2001 - Common Factors**  ·  _1:42_
<audio controls preload="none" src="audio/22_LM_23_Wampold_2001_Common_Factors_1_42.m4a"></audio>


## Anxiety  (1)
**Foa 2005 - Prolonged Exposure**  ·  _1:42_
<audio controls preload="none" src="audio/29_LM_29_Foa_2005_Prolonged_Exposure_1_42.m4a"></audio>
<a href="https://doi.org/10.1037/0022-006X.73.5.953" target="_blank" rel="noopener">Paper (DOI)</a>


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
- **Source:** `08_Cases_and_Simulation/case-of-the-week/index_resident.md`
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
