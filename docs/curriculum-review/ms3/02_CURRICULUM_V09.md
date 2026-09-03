# MS3 · Curriculum content — volume 9

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Practice and Exam Prep

---

## Practice Questions — Question Bank

- **Slug:** `question-bank-practice.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `13_Faculty_Resources/_automation/site_build/question-bank-practice.html`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Practice Questions — MS3 Question Bank Reviewed by Joshua Moss, MD on 2026-07-05
- Skip to content Practice Questions
- Loading question bank…

**Authored clinical strings (228):**

- s toolExtraFromParams passthrough (spa_index.html) — no shell change needed to reach this tool
- s next step. */ var BLOCK_REQUEST = (function(){ try{ var sp=new URLSearchParams(location.search); if(sp.get(
- ) return null; var n=parseInt(sp.get(
- ,10); if(!(n>=1&&n<=50)) n=5; var cat=sp.get(
- ; return {n:n, cat:/^[a-z]+$/.test(cat)?cat:
- }; }catch(_){ return null; } })(); var CAT_LABELS = { mood:
- }; var SUBTYPE_LABELS = {
- }; /* ---- utilities ---------------------------------------------------------------- */ function esc(s){ return String(s||
- ); } function shuffle(arr){ var a=arr.slice(),i=a.length,j,t; while(i--){j=Math.floor(Math.random()*(i+1));t=a[i];a[i]=a[j];a[j]=t;} return a; } function readReviewContext(){ var sp = new URLSearchParams(location.search); var reviewItem = sp.get(
- ; var reviewKey = sp.get(
- ; var reviewToken = sp.get(
- ).length !== 1 || sp.getAll(
- ).length !== 1) return null; if(!/^qb_[a-z]+_[0-9]{3}$/.test(reviewItem)) return null; if(reviewKey !==
- + reviewItem) return null; if(!/^[0-9a-f]{32}$/.test(reviewToken)) return null; return Object.freeze({reviewItem:reviewItem, reviewKey:reviewKey, reviewToken:reviewToken}); } function postReviewItemStatus(status){ if(!REVIEW_CONTEXT || [
- ].indexOf(status) < 0) return; window.parent.postMessage({ type:
- , reviewKey:REVIEW_CONTEXT.reviewKey, reviewToken:REVIEW_CONTEXT.reviewToken, reviewItem:REVIEW_CONTEXT.reviewItem, status:status, surface:
- }, location.origin); } /* ---- localStorage helpers ----------------------------------------------------- */ function lsGet(k){ try{return JSON.parse(localStorage.getItem(k)||
- );}catch(_){return null;} } function lsSet(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch(_){} } /* ---- cw_qb_v1 response store -------------------------------------------------- */ function qbLoad(){ return lsGet(
- )||{}; } function qbSave(data){ lsSet(
- ,data); } function qbRecord(item, key, tier2Key, confidence, correct, twoTierResult){ var data = qbLoad(); var prev = data[item.id]; var re = (prev && prev.ts && (new Date(prev.ts)).toDateString() === (new Date()).toDateString()) ? 1 : 0; var rec = { id: item.id, key: key, tier2Key: tier2Key||null, confidence: confidence, correct: correct, pages: item.pages||[], ts: Date.now() }; if(confidence===
- && !correct) rec.certWrong = true; data[item.id] = rec; qbSave(data); calibLog({s:
- ,id:item.id,pages:item.pages||[],p:confidence,a:correct?1:0,t2:twoTierResult||null,re:re,ts:Date.now()}); return rec; } /* ---- cw_srs_v1 SRS seeding + grading ----------------------------------------- */ function srsLoad(){ var s = lsGet(
- ); if(!s||s.v!==1){ s={v:1,cards:{},day:{lastDay:
- ,newToday:0}, stats:{streak:0,lastStudy:
- ,totalReviews:0,correct:0,seen:0}, settings:{newPerDay:12}}; } return s; } function srsSave(s){ lsSet(
- ,s); } function srsGrade(item, confidence, correct, twoTierResult){ /* Map confidence×correct to SM-2 grade, respecting two-tier shaky cap */ if(!correct) return
- ; /* cap: right answer, wrong reason */ if(confidence===
- ; /* guess + correct = Hard (lucky guess ≠ mastery) */ return
- ; } var DAY = 86400000; /* ==== Canonical SM-2 grader (build-injected — do not edit inside consumer files) ==== Source of truth: 13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js. Consumers carry a SM2_APPLY_GRADE marker comment that common.py
- s cw_srs_v1 writes stay aggregate/current-state only and are unaffected by that logging. */ /* Deterministic ±15% interval fuzz (opts.fuzzKey): de-synchronizes cohort-seeded cards so due-load avalanches spread out. No fuzzKey (legacy callers) = no fuzz. Also a no-op below ivl 3 d (too short to meaningfully fuzz). Always clamped to [1, 365] regardless of the input interval
- t drift between the two consumers; an expired or malformed per-tool entry is pruned from the store on load, not just hidden, so a stale slot never lingers past its own read. Consumers: question-bank-practice.html (checkpointSession/ tryResumeSession — writer + authoritative resume) and the shell
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
- ; return {html:h, marked:marked, next:next||null}; } function srsUpdate(item, confidence, correct, twoTierResult){ var s = srsLoad(); var cardId =
- +item.id; var card = s.cards[cardId]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0}; var grade = srsGrade(item, confidence, correct, twoTierResult); s.cards[cardId] = applyGrade(card, grade, {fuzzKey:cardId}); /* update aggregate stats */ s.stats.totalReviews = (s.stats.totalReviews||0)+1; if(correct) s.stats.correct=(s.stats.correct||0)+1; s.stats.seen=(s.stats.seen||0)+1; srsSave(s); return grade; } /* ---- queue building ----------------------------------------------------------- */ function buildQueue(items, catFilter, diffFilter, sizeLimit){ var q = items.filter(function(it){ if(catFilter!==
- && it.category!==catFilter) return false; if(diffFilter!==
- && String(it.difficulty)!==diffFilter) return false; return true; }); q = shuffle(q); if(sizeLimit!==
- ) q = q.slice(0, parseInt(sizeLimit,10)||20); return q; } /* Items eligible to serve to learners. Two gates: — Retired items (near-duplicate/redundant per question_bank.schema.json) are NEVER queued. — Un-attested items serve ONLY when the learner opts in via the setup-screen toggle (persisted as cw_qb_drafts_v1). The default pool is faculty-attested items only, and every surface that shows an included draft labels it — see renderMeta() and the .draft-notice callout in renderQuestion(). Policy history, because this has flipped before: the 2026-07-15 decision log recorded "serve drafts, marked" after a04a848 gated to attested-only by ACCIDENT — the pool fell 192->143 with no UI trace, and #284 restored serving. The 2026-08-20 Taplinger response plan (PLAN_Taplinger_Feedback_and_Therapy_Library_2026-08-20.md §A2 / WP-37, urgency per FEEDBACK_IMPACT_Taplinger_Verbatim_2026-08-20.md §3) reverses that decision deliberately now that an external course page links to the site: attested-only BY DEFAULT, drafts opt-in and labelled. Unlike a04a848, this flip is visible — the setup screen states the exclusion, shows the excluded count, and carries the toggle. Fail-safe direction: only an explicit status===
- reaches the default pool, so a new or misspelled status is withheld rather than served as reviewed (mirrors the label logic, which marks anything not attested). `status` is still the source of truth; nothing here mutates it, and attestation stays server-side. */ function includeDrafts(){ return lsGet(
- )===true; } function setIncludeDrafts(on){ lsSet(
- , !!on); } function activeItems(){ var inc = includeDrafts(); return (BANK && BANK.items ? BANK.items : []).filter(function(it){ if(it.retired) return false; if(!inc && it.status!==
- ) return false; return true; }); } /* Focus-mode presets, built from the learner
- s cw_qb_drafts_v1 opt-in is set (see the policy comment above). */ function missedItems(){ var records = qbLoad(); return activeItems().filter(function(it){ var rec = records[it.id]; return !!rec && rec.correct === false; }); } function certWrongItems(){ var records = qbLoad(); return activeItems().filter(function(it){ var rec = records[it.id]; return !!rec && rec.certWrong === true; }); } /* Due-first serving. This tool has WRITTEN QB# cards to cw_srs_v1 since SRS seeding landed, but nothing ever read the schedule — Daily Review serves TOPIC# cards only (the false "resurfaces in Daily Review" copy was corrected in #344). This makes the schedule real: cards that have come due return at the FRONT of the next practice session here, most-overdue first. Routed through activeItems(), so a since-retired item can never resurface no matter what its card says. */ function dueQbItems(){ var s = srsLoad(); if(!s || !s.cards) return []; var now = Date.now(), due = {}; Object.keys(s.cards).forEach(function(id){ if(id.indexOf(
- ) !== 0) return; var c = s.cards[id]; if(c && typeof c.due ===
- && c.due <= now) due[id.slice(3)] = c.due; }); return activeItems() .filter(function(it){ return Object.prototype.hasOwnProperty.call(due, it.id); }) .sort(function(a, b){ return due[a.id] - due[b.id]; }); } /* ---- rendering helpers -------------------------------------------------------- */ function diffDots(n){ var h=
- ; for(var i=1;i<=3;i++) h+=
- diff-dot'+(i<=n?' on':'')+'
- ; } function renderSetup(){ var items = activeItems(); var cats = {}; items.forEach(function(it){ cats[it.category]=1; }); var catOpts =
- ; Object.keys(CAT_LABELS).forEach(function(k){ if(cats[k]) catOpts+=
- ; }); var total = items.length; /* bankDraftCount is toggle-independent (all non-retired, non-attested items in the bank); draftCount is how many of those are in the SERVED pool right now. The note renders whenever the bank has drafts, in whichever wording matches the toggle — excluded-by-default (off) or labelled-in-pool (on). */ var draftsOn = includeDrafts(); var bankDraftCount = (BANK && BANK.items ? BANK.items : []).filter(function(it){ return !it.retired && it.status!==
- ; }).length; var draftCount = draftsOn ? bankDraftCount : 0; var missedCount = missedItems().length; var certWrongCount = certWrongItems().length; var dueCount = dueQbItems().length; return
- ; } function renderMeta(item){ var h =
- ; h += diffDots(item.difficulty); if(item.type===
- ; /* The glyph is decorative — the wording carries the meaning, so the label never depends on colour or on the icon being announced. */ if(item.status!==
- ; return h; } function renderConfidence(disabled){ var ds = disabled ?
- ; } function renderOptions(item, state){ /* state:
- — locked after answer. Letters come from DISPLAY position, not the authored key: 46 of 47 draft items are keyed A, so rendering opt.key after the shuffle both scrambled the letter sequence and let "A." follow the correct answer around the screen. data-key still carries the authored key for answer logic. A locked re-render reuses the session
- Select the best rationale — then see your full feedback.
- <button class="opt" data-tier2key="
- ✓ Right answer — shaky reasoning
- · Confidently wrong — flagged for review
- Right answer, wrong reason — your SRS interval is capped at Hard , so this item comes due again soon and will serve at the front of a future session here. The correct rationale:
- <a class="fb-link" href="
- target="_blank" rel="noopener"
- ⚠ Draft — not yet faculty-reviewed.
- This question and its explanation have not been checked by faculty. Practise with it,
- but verify anything you would act on against a primary source.
- s own. */ var certWrongList = responses.filter(function(r){return r.confidence===
- &&!r.correct;}); var certWrong = certWrongList.length; var guessRight = responses.filter(function(r){return r.confidence===
- &&r.correct;}).length; var wrong = total-correct; var headline = correct+
- )); var sub = certWrong ?
- ); var reread = []; responses.forEach(function(r){ if(r.correct && r.confidence!==
- ) return; if(reread.length>=5) return; var chosen = (r.item.options||[]).filter(function(o){ return o && o.key===r.key; })[0]; var trap = chosen && chosen.trap ? chosen.trap : null; var trapName = trap && trap.name ? trap.name : null; var page = (r.item.pages&&r.item.pages[0]) || null; reread.push({ tag: r.correct ?
- ), warn: !r.correct && r.confidence===
- , title: String(r.item.stem||
- ), ref: page, refTitle: page ? pageTitle(page) : null }); }); var stats = [ {label:
- , value:String(certWrong), tone:certWrong?
- , value:String(guessRight)}, {label:
- , value:String(wrong), tone:wrong?
- } ]; var receipt = cwReceipt({ /* Only a session the block itself opened (?block=1) may mark the block
- Calibration gap: You were certain
- Miscalibration on the wards is more dangerous than ignorance —
- replay your confidently-wrong items from this summary.
- s own link label when it points at that page, else a readable form of the file name (the tool has no nav registry of its own). */ function pageTitle(file){ var f=String(file||
- ); return f.replace(/^pg_/,
- ).replace(/\b\w/g,function(c){return c.toUpperCase();}); } /* ---- DOM helpers -------------------------------------------------------------- */ var root = document.getElementById(
- ); var progLabel = document.getElementById(
- ); var qprog = document.getElementById(
- ); var qprogFill = document.getElementById(
- ); function setRoot(html){ root.innerHTML=html; } function updateProgress(){ if(!SESSION) return; var idx=SESSION.idx, total=SESSION.queue.length; if(total===0) return; var pct=Math.round((idx/total)*100); progLabel.textContent =
- +total; qprog.hidden=false; qprogFill.style.width=pct+
- ; } /* ---- app state transitions ---------------------------------------------------- */ function showSetup(){ SESSION=null; progLabel.textContent=
- ; qprog.hidden=true; setRoot(renderSetup()); bindSetup(); } function bindSetup(){ var catSel=document.getElementById(
- ); var diffSel=document.getElementById(
- ); var sizeSel=document.getElementById(
- ); var countEl=document.getElementById(
- ); var startBtn=document.getElementById(
- ); var redoMissesBtn=document.getElementById(
- ); var certWrongBtn=document.getElementById(
- ); var dueBtn=document.getElementById(
- ); function updateCount(){ var cat=catSel?catSel.value:
- , diff=diffSel?diffSel.value:
- ; var n = activeItems().filter(function(it){ if(cat!==
- &&it.category!==cat) return false; if(diff!==
- &&String(it.difficulty)!==diff) return false; return true; }).length; var size=sizeSel?sizeSel.value:
- )?n:Math.min(n,parseInt(size,10)||20); if(countEl) countEl.textContent=(showing===n?n:showing+
- ; if(startBtn) startBtn.disabled=(n===0); } if(catSel) catSel.addEventListener(
- ,updateCount); if(diffSel) diffSel.addEventListener(
- ,updateCount); if(sizeSel) sizeSel.addEventListener(
- ,updateCount); updateCount(); if(startBtn) startBtn.addEventListener(
- ,function(){ var cat=catSel?catSel.value:
- ; var diff=diffSel?diffSel.value:
- ; var size=sizeSel?sizeSel.value:
- ; startSession(cat,diff,size); }); if(redoMissesBtn) redoMissesBtn.addEventListener(
- ,function(){ startSessionWithQueue(missedItems()); }); if(certWrongBtn) certWrongBtn.addEventListener(
- ,function(){ startSessionWithQueue(certWrongItems()); }); /* Deliberately NOT startSessionWithQueue: due cards keep most-overdue-first order rather than being shuffled — the schedule is the point of this focus mode. */ if(dueBtn) dueBtn.addEventListener(
- ,function(){ beginSession(dueQbItems()); }); /* Draft opt-in (WP-37). Persist, then re-render the whole setup so every count (pool size, match count, focus-mode buttons) reflects the new pool; refocus the toggle so keyboard users are not dropped at the top of the re-rendered screen. */ var draftToggle=document.getElementById(
- ); if(draftToggle) draftToggle.addEventListener(
- ,function(){ setIncludeDrafts(draftToggle.checked); showSetup(); var t=document.getElementById(
- ); if(t) t.focus(); }); } function startSession(catFilter, diffFilter, sizeLimit){ /* Due cards matching the same filters serve FIRST (most-overdue first, unshuffled — priority order is the point); the shuffled fresh selection fills the remainder of the size limit. A due card never appears twice in one queue. */ var due = dueQbItems().filter(function(it){ if(catFilter!==
- && String(it.difficulty)!==diffFilter) return false; return true; }); var cap = (sizeLimit===
- ) ? Infinity : (parseInt(sizeLimit,10)||20); due = due.slice(0, cap===Infinity ? due.length : cap); var dueIds = {}; due.forEach(function(it){ dueIds[it.id]=1; }); var rest = buildQueue(activeItems().filter(function(it){ return !dueIds[it.id]; }), catFilter, diffFilter,
- ); if(cap!==Infinity) rest = rest.slice(0, Math.max(0, cap-due.length)); beginSession(due.concat(rest)); } /* Focus-mode entry point: starts the exact queue passed in (shuffled), bypassing the category/difficulty/size filters entirely. */ function startSessionWithQueue(queue){ beginSession(shuffle(queue)); } function beginSession(queue){ if(!queue.length){ setRoot(
- ); return; } SESSION = { queue: queue, idx: 0, responses: [], confidence: null, tier1Key: null, displayOrder: [], tier2DisplayOrder: [], state:
- /* conf | tier2 | feedback */ }; showQuestion(); } function showReviewItem(item){ SESSION = { queue:[item], idx:0, responses:[], confidence:null, tier1Key:null, displayOrder:[], tier2DisplayOrder:[], state:
- , reviewOnly:true }; showQuestion(); postReviewItemStatus(
- ); } /* ---- session capsule (cw_sess_v1) — question-boundary checkpoint + resume -------- Written ONLY from advance(), and only when there is a next question to show — never mid-question. showQuestion() resets confidence/tier1Key/state/displayOrder/ tier2DisplayOrder on every entry (the option shuffles aren
- s queueIds filtered through activeItems() — an id removed or retired by a deploy between checkpoint and resume is silently dropped rather than crashing the restore (queueIds order is preserved). idx is RE-DERIVED by counting how many of the front (pre-checkpoint) queueIds survive that same filter, rather than trusted verbatim: trusting the stored idx directly would silently skip a still-unanswered question whenever a deploy retires/removes an item positioned BEFORE the checkpointed idx (the raw idx overshoots once the queue is filtered shorter). This exploits the invariant that responses.length === idx at every checkpoint — advance() checkpoints immediately after commitResponse() pushes a response, and this app has no skip-without-answering path, so counting surviving front ids gives the correct new position. Reconstructed responses are built from that identical surviving-front-id set, so the resumed summary population can never disagree with the resumed queue position. Absent/expired capsule (sessLoad owns load-validate-expire) or an empty resulting queue falls through to a normal setup start. Returns true iff a session was actually resumed. */ function tryResumeSession(){ var cap = sessLoad(
- , Date.now()); if(!cap || !cap.queueIds || !cap.queueIds.length) return false; var idMap = {}; activeItems().forEach(function(it){ idMap[it.id]=it; }); var queue = cap.queueIds.map(function(id){ return idMap[id]; }).filter(Boolean); if(!queue.length) return false; var capIdx = (typeof cap.idx===
- && cap.idx>=0) ? cap.idx : 0; var survivingFrontIds = cap.queueIds.slice(0, capIdx).filter(function(id){ return !!idMap[id]; }); var idx = survivingFrontIds.length; var respById = {}; (cap.responses||[]).forEach(function(r){ respById[r.id]=r; }); var responses = survivingFrontIds.map(function(id){ var r = respById[id]; if(!r) return null; return { item: idMap[id], key: null, tier2Key: null, confidence: r.confidence, correct: r.correct, twoTierResult: null, ts: cap.at }; }).filter(Boolean); SESSION = { queue: queue, idx: idx, responses: responses, confidence: null, tier1Key: null, displayOrder: [], tier2DisplayOrder: [], state:
- }; showQuestion(); return true; } function showQuestion(){ if(!SESSION || SESSION.idx >= SESSION.queue.length){ showSummary(); return; } SESSION.confidence = null; SESSION.tier1Key = null; SESSION.state =
- ; SESSION.displayOrder = []; SESSION.tier2DisplayOrder = []; updateProgress(); var item = SESSION.queue[SESSION.idx]; setRoot(renderQuestion(item)); bindQuestion(item); } function bindQuestion(item){ /* confidence buttons */ var confBtns = root.querySelectorAll(
- ); var confHint = document.getElementById(
- ); confBtns.forEach(function(btn){ btn.addEventListener(
- ,function(){ if(SESSION.state!==
- ) return; confBtns.forEach(function(b){ b.classList.remove(
- ); }); btn.classList.add(
- ); SESSION.confidence = btn.getAttribute(
- ); if(confHint) confHint.classList.remove(
- ); }); }); /* tier1 option buttons */ var optBtns = root.querySelectorAll(
- ); optBtns.forEach(function(btn){ btn.addEventListener(
- ) return; if(!SESSION.confidence){ if(confHint) confHint.classList.add(
- ); /* briefly shake the confidence section */ var cs=root.querySelector(
- ); if(cs){ cs.style.outline=
- ; setTimeout(function(){cs.style.outline=
- ;},600); } return; } var key = btn.getAttribute(
- ); onTier1Answer(item, key); }); }); } function onTier1Answer(item, key){ SESSION.tier1Key = key; var isCorrect = item.options.some(function(o){ return o.key===key && o.c; }); /* lock tier1 options and highlight */ var optBtns = root.querySelectorAll(
- ); optBtns.forEach(function(btn){ btn.disabled = true; btn.classList.add(
- ); var k = btn.getAttribute(
- ); if(k===key && isCorrect) btn.classList.add(
- ); else if(k===key && !isCorrect) btn.classList.add(
- ); else if(item.options.some(function(o){return o.key===k&&o.c;})) btn.classList.add(
- ); }); /* lock confidence buttons */ root.querySelectorAll(
- ).forEach(function(b){ b.disabled=true; }); if(item.type===
- && isCorrect){ /* show tier2 before feedback */ SESSION.state =
- ; var qcard = root.querySelector(
- ); if(qcard){ var t2html = renderTier2(item); qcard.insertAdjacentHTML(
- , t2html); bindTier2(item); } } else { /* for wrong tier1 on two-tier, still show tier2 (spec: "tier 2 still shown and answered — the feedback teaches against both selections") */ if(item.type===
- && !isCorrect){ SESSION.state =
- ; var qcard2 = root.querySelector(
- ); if(qcard2){ var t2html2 = renderTier2(item); qcard2.insertAdjacentHTML(
- , t2html2); bindTier2(item); } } else { /* sba / relational: show feedback directly */ SESSION.state =
- ; var twoTierResult = null; commitResponse(item, key, null, SESSION.confidence, isCorrect, twoTierResult); showFeedback(item, key, null, SESSION.confidence, isCorrect, null); } } } function bindTier2(item){ var t2Btns = root.querySelectorAll(
- ); t2Btns.forEach(function(btn){ btn.addEventListener(
- ) return; var tier2Key = btn.getAttribute(
- ); onTier2Answer(item, tier2Key); }); }); } function onTier2Answer(item, tier2Key){ SESSION.state =
- ; var tier1Key = SESSION.tier1Key; var tier1Correct = item.options.some(function(o){ return o.key===tier1Key && o.c; }); var tier2Correct = item.tier2.options.some(function(o){ return o.key===tier2Key && o.c; }); /* lock tier2 options + highlight */ var t2Btns = root.querySelectorAll(
- ); t2Btns.forEach(function(btn){ btn.disabled=true; btn.classList.add(
- ); var k=btn.getAttribute(
- ); if(k===tier2Key && tier2Correct) btn.classList.add(
- ); else if(k===tier2Key && !tier2Correct) btn.classList.add(
- ); else if(item.tier2.options.some(function(o){return o.key===k&&o.c;})) btn.classList.add(
- ); }); /* scoring: both right = correct; right answer/wrong reason = shaky; wrong tier1 = wrong */ var correct, twoTierResult; if(!tier1Correct){ correct=false; twoTierResult=
- ; } else if(tier2Correct){ correct=true; twoTierResult=
- ; } else { correct=true; twoTierResult=
- ; /* right answer, wrong reason — cap at Hard */ } commitResponse(item, tier1Key, tier2Key, SESSION.confidence, correct, twoTierResult); showFeedback(item, tier1Key, tier2Key, SESSION.confidence, correct, twoTierResult); } function commitResponse(item, key, tier2Key, confidence, correct, twoTierResult){ if(SESSION && SESSION.reviewOnly){ SESSION.responses.push({ item:item, key:key, tier2Key:tier2Key, confidence:confidence, correct:correct, twoTierResult:twoTierResult, ts:Date.now() }); return; } var rec = qbRecord(item, key, tier2Key, confidence, correct, twoTierResult); srsUpdate(item, confidence, correct, twoTierResult); SESSION.responses.push({ item: item, key: key, tier2Key: tier2Key, confidence: confidence, correct: correct, twoTierResult: twoTierResult, ts: rec.ts }); } function showFeedback(item, key, tier2Key, confidence, correct, twoTierResult){ var fbHtml = getFeedbackHtml(item, key, tier2Key, confidence, correct, twoTierResult); var qcard = root.querySelector(
- ); if(qcard){ /* remove any tier2 section first if it already exists */ var existing = qcard.querySelector(
- ); if(existing) existing.parentNode.removeChild(existing); qcard.insertAdjacentHTML(
- , fbHtml); var _live=document.getElementById(
- ); if(_live){ _live.textContent = (twoTierResult===
- ); } /* scroll feedback into view */ var fb = document.getElementById(
- ); if(fb) setTimeout(function(){ fb.scrollIntoView({behavior:
- }); },80); } if(SESSION && SESSION.reviewOnly) return; /* bind spa nav links */ root.querySelectorAll(
- ).forEach(function(a){ a.addEventListener(
- ,function(ev){ ev.preventDefault(); var href=a.getAttribute(
- ; try{ window.parent.postMessage({type:
- ); } catch(_){ window.location.href=href; } }); }); /* next button */ var nextBtn = document.getElementById(
- ); if(nextBtn) nextBtn.addEventListener(
- , advance); } function advance(){ if(!SESSION) return; SESSION.idx++; /* Checkpoint at this question boundary only when there is a next question to resume into — completion is handled by showSummary()
- s own button (data-cw-receipt-home); the receipt snippet routes it through the shell
- This question is not present on the current deployment
- Could not load question bank.
- question_bank.json was not found alongside this tool.
- Make sure the build ran successfully and question_bank.json is at the site root.

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

## Shelf Mode — Exam Simulation

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
- rigidity and bradyreflexia — not clonus/hyperreflexia."}, {t:"Anticholinergic toxicity",c:false,fb:"Anticholinergic toxidrome gives dry skin, absent bowel sounds, and normal reflexes — not diaphoresis with clonus."}, {t:"Malignant hyperthermia",c:false,fb:"Malignant hyperthermia is triggered by volatile anesthetics/succinylcholine, not oral serotonergics."}, {t:"Sympathomimetic intoxication",c:false,fb:"Stimulant toxicity can mimic this but lacks the prominent clonus/hyperreflexia and the clear serotonergic trigger."}], tp:"Serotonin syndrome = serotonergic trigger + hyperthermia + clonus/hyperreflexia (lower-limb predominant); NMS = dopamine blocker + rigidity + hyporeflexia over days."}, {topic:"Substance Use",diff:"easy",ref:"withdrawal.html", q:"A 52-year-old man admitted for pancreatitis becomes tremulous and diaphoretic on hospital day 2, with heart rate 116, blood pressure 168/98, and visual misperceptions. He reports drinking a pint of vodka daily until admission. Which of the following is the most appropriate management?", o:[{t:"Symptom-triggered benzodiazepine dosing with CIWA-Ar monitoring, plus thiamine",c:true,fb:"Correct — alcohol withdrawal: benzodiazepines (often CIWA-Ar–guided) are first-line, with thiamine to prevent Wernicke encephalopathy."}, {t:"Scheduled haloperidol",c:false,fb:"Antipsychotics lower the seizure threshold and do not treat the underlying GABA/glutamate dysregulation; they are at most adjunctive for agitation."}, {t:"Intravenous dextrose before any other intervention",c:false,fb:"Give thiamine before/with glucose in at-risk patients — a glucose load alone can precipitate Wernicke encephalopathy."}, {t:"Physical restraints and observation",c:false,fb:"Restraints do not treat withdrawal and can worsen autonomic arousal; pharmacologic treatment is needed."}, {t:"Clonidine monotherapy",c:false,fb:"Clonidine may blunt autonomic signs but does not prevent withdrawal seizures or delirium tremens."}], tp:"Alcohol withdrawal: benzodiazepines (CIWA-Ar–guided) first-line; give thiamine before or with glucose."}, {topic:"Delirium, Dementia & MCI",diff:"med",ref:"delirium.md", q:"A 78-year-old woman is inattentive and intermittently drowsy two days after hip surgery. Her family says she was cognitively intact at baseline; symptoms fluctuate and worsen at night. She is on oxycodone and diphenhydramine for sleep. Which of the following is the most appropriate first step?", o:[{t:"Identify and treat underlying causes and remove deliriogenic medications",c:true,fb:"Correct — acute, fluctuating inattention with altered arousal is delirium. First-line is to find and fix the cause (pain meds, anticholinergics, infection, metabolic) and use nonpharmacologic measures."}, {t:"Start a scheduled long-acting benzodiazepine",c:false,fb:"Benzodiazepines worsen delirium (except in alcohol/benzo withdrawal) and increase fall risk."}, {t:"Begin donepezil for cognitive decline",c:false,fb:"Cholinesterase inhibitors treat chronic dementia, not acute delirium, and have no role here."}, {t:"Obtain an outpatient neuropsychology referral",c:false,fb:"This is an acute medical problem requiring inpatient workup, not deferred testing."}, {t:"Reassure the family this is expected post-operative confusion and observe",c:false,fb:"Delirium signals an underlying disturbance and predicts poor outcomes; it requires active workup, not watchful waiting."}], tp:"Delirium is a medical emergency: treat the cause and stop deliriogenic drugs; avoid benzodiazepines unless withdrawal-related."}, {topic:"Psychiatric Emergencies",diff:"med",ref:"capacity.html", q:"A 60-year-old man with diabetes and a necrotic foot refuses a recommended amputation. He can describe the gangrene, the risk of fatal sepsis without surgery, the option of amputation, and explains he would rather risk death than lose his leg, citing consistent long-held values. He has no psychosis or cognitive deficit. Which of the following best describes his decision-making capacity?", o:[{t:"He has capacity to refuse the amputation",c:true,fb:"Correct — he demonstrates the four abilities (understanding, appreciation, reasoning, and a stable choice). Capacity is decision-specific; a
- choice with intact reasoning is still a capacitated refusal."}, {t:"He lacks capacity because the refusal is medically dangerous",c:false,fb:"Capacity is about the process of decision-making, not whether the choice matches the medical recommendation."}, {t:"He lacks capacity and a guardian should consent to surgery",c:false,fb:"There is no impairment in the four abilities; overriding a capacitated refusal would violate autonomy."}, {t:"Capacity cannot be assessed without neuropsychological testing",c:false,fb:"Capacity is a clinical, decision-specific bedside determination, not a test score."}, {t:"He has capacity only if he agrees to surgery",c:false,fb:"Capacity does not depend on agreeing with the team; that reasoning is circular."}], tp:"Capacity is decision-specific and rests on four abilities; a high-risk refusal with intact reasoning is still capacitated."} ]; function App(){ var d=useState(null),data=d[0],setData=d[1]; var er=useState(null),err=er[0],setErr=er[1]; var S=useState({view:"config",len:20,diff:"all",mode:"tutor",timed:true,topics:[], items:[],picks:[],flags:{},idx:0,secs:0,total:0,result:null,saved:false,preview:false,revFilter:"missed"}); var st=S[0],setS=S[1]; function set(p){setS(function(prev){return Object.assign({},prev,p);});} useEffect(function(){ fetch("../question_bank.json").then(function(r){return r.json()}).then(setData).catch(function(){setErr("Could not load the question bank (question_bank.json).");}); },[]); // derive pool + topics once data lands var pool=[], preview=false, topicsAll=[]; if(data){ pool=bankPool(data); if(pool.length===0){ pool=SAMPLE.slice(); preview=true; } var seen={}; pool.forEach(function(it){seen[it.topic]=(seen[it.topic]||0)+1;}); topicsAll=Object.keys(seen).sort(function(a,b){return orderRank(a)-orderRank(b);}).map(function(t){return {t:t,n:seen[t]};}); } // default-select all topics on first data load useEffect(function(){ if(data && st.topics.length===0 && topicsAll.length){ set({topics:topicsAll.map(function(x){return x.t;}), preview:preview}); } },[data]); // exam timer useEffect(function(){ if(st.view!=="exam") return; var id=setInterval(function(){ setS(function(p){ if(p.view!=="exam") return p; if(p.timed){ if(p.secs ="1" && ev.key =q.o.length) return p; if(p.mode==="tutor" && p.picks[p.idx]!=null) return p; // locked after answering in tutor mode var picks=p.picks.slice(); picks[p.idx]=oi; return Object.assign({},p,{picks:picks}); }); } function canAdvance(){ if(st.mode==="tutor") return st.picks[st.idx]!=null; return true; } function advance(){ setS(function(p){ if(p.idx+1 0?Object.assign({},p,{idx:p.idx-1}):p;}); } function toggleFlag(){ setS(function(p){var f=Object.assign({},p.flags);f[p.idx]=!f[p.idx];return Object.assign({},p,{flags:f});}); } function grade(p){ var correct=0, byTopic={}; p.items.forEach(function(q,i){ var ci=correctIdx(q.o), ok=(p.picks[i]===ci && ci>=0); if(ok) correct++; var bt=byTopic[q.topic]=byTopic[q.topic]||{c:0,n:0}; bt.n++; if(ok)bt.c++; }); var secsUsed = p.timed? (p.total-p.secs) : p.secs; var res={n:p.items.length,correct:correct,pct:Math.round(100*correct/Math.max(1,p.items.length)),byTopic:byTopic,secs:secsUsed}; return Object.assign({},p,{view:"result",result:res}); } // Persistent, unconditional live region: same DOM node across every view (config/exam/result), // so a screen reader binds to it once and hears only the CONTENT change when a result lands. var resultMsg = (st.view==="result" && st.result) ? resultMsgFor(st.result.pct) : ""; var liveRegion = e("div",{className:"visually-hidden","aria-live":"polite","aria-atomic":"true"}, (st.view==="result" && st.result) ? (st.result.correct+" of "+st.result.n+" correct, "+st.result.pct+" percent. "+resultMsg) : ""); if(err) return e("div",{className:"wrap"},liveRegion,e("h1",null,"Shelf Mode"),e("div",{className:"card"},err)); if(!data) return e("div",{className:"wrap"},liveRegion,e("div",{className:"loading"},"Loading the question bank…")); // ---------------- CONFIG ---------------- if(st.view==="config"){ var L=loadLS(); var recent=(L.attempts||[]).slice(0,3); var avail=pool.filter(function(it){ var dd=normDiff(it.diff); if(dd==="review")return false; if(st.diff!=="all"&&dd!==st.diff)return false; return st.topics.indexOf(it.topic)>=0; }).length; var lens=[10,20,40].filter(function(n){return true;}); return e("div",{className:"wrap"}, liveRegion, e("h1",null,"Shelf Mode"), e("span",{className:"opt-pill"},"Optional practice · exam simulation"), e("div",{className:"sub"},"A timed, blueprint-weighted vignette set that mirrors the psychiatry COMAT / shelf. Choose your length, topics, and pacing. Single best answer, with feedback and a teaching point on every item."), preview? e("div",{className:"banner"},e("strong",null,"Preview mode. "),"The attested question bank didn
- re back online for the full blueprint-weighted exam.") : null, e("div",{className:"card"}, e("div",{className:"field"}, e("label",{className:"h"},"Length"), e("div",{className:"seg"}, lens.map(function(n){ return e("button",{key:n,className:st.len===n?"on":"",onClick:function(){set({len:n})}}, n+" Q"); })) ), e("div",{className:"field"}, e("label",{className:"h"},"Difficulty"), e("div",{className:"seg"}, [["all","All"],["easy","Easy"],["med","Medium"],["hard","Hard"]].map(function(p){ return e("button",{key:p[0],className:st.diff===p[0]?"on":"",onClick:function(){set({diff:p[0]})}}, p[1]); })) ), e("div",{className:"field"}, e("label",{className:"h"},"Mode"), e("div",{className:"seg"}, e("button",{className:st.mode==="tutor"?"on":"",onClick:function(){set({mode:"tutor"})}},"Tutor — feedback after each"), e("button",{className:st.mode==="exam"?"on":"",onClick:function(){set({mode:"exam"})}},"Exam — feedback at end") ) ), e("div",{className:"field"}, e("label",{className:"h"},"Pacing"), e("div",{className:"seg"}, e("button",{className:st.timed?"on":"",onClick:function(){set({timed:true})}},"Timed · 1.5 min/Q"), e("button",{className:!st.timed?"on":"",onClick:function(){set({timed:false})}},"Untimed") ) ), e("div",{className:"field"}, e("label",{className:"h"},"Topics"), e("div",{className:"linkrow"}, e("button",{onClick:function(){set({topics:topicsAll.map(function(x){return x.t;})})}},"Select all"), e("button",{onClick:function(){set({topics:[]})}},"Clear") ), e("div",{className:"chips",style:{marginTop:"7px"}}, topicsAll.map(function(x){ var on=st.topics.indexOf(x.t)>=0; return e("button",{key:x.t,className:"chip"+(on?" on":""),onClick:function(){ var t=st.topics.slice(),i=t.indexOf(x.t); if(i>=0)t.splice(i,1); else t.push(x.t); set({topics:t}); }}, e("span",null,x.t), e("span",{className:"n"},x.n)); })) ), e("div",{className:"row between",style:{marginTop:"6px"}}, e("span",{className:"meta"}, avail+" item"+(avail===1?"":"s")+" available · drawing "+Math.min(st.len,avail)), e("button",{className:"btn primary",disabled:avail===0,onClick:startExam}, "Start "+Math.min(st.len,avail)+"-question set") ), e("div",{className:"kbd",style:{marginTop:"8px"}},"Tip: press 1–5 to answer, Enter to advance.") ), recent.length? e("div",{className:"card"}, e("label",{className:"h",style:{display:"block",marginBottom:"6px"}},"Recent attempts"), e("div",{className:"recent"}, recent.map(function(r,i){ return e("div",{className:"r",key:i}, e("span",null, r.at+" · "+(r.mode==="tutor"?"Tutor":"Exam")+(r.preview?" · sample":"")), e("span",null, r.correct+"/"+r.n+" ("+r.pct+"%)")); })) ):null, e("div",{className:"disc"},"Optional exam-prep simulation. Items are educational and use fictional composites only (no patient information). Verify management against current guidelines and your team. Progress is saved only in this browser. ",e("br"),"Joshua Moss, MD | Psychiatrist") ); } // ---------------- RESULT ---------------- if(st.view==="result"){ var R=st.result, msg=resultMsg; var bts=Object.keys(R.byTopic).sort(function(a,b){return orderRank(a)-orderRank(b);}); var revItems=st.items.map(function(q,i){return {q:q,i:i};}).filter(function(x){ if(st.revFilter==="all") return true; var ci=correctIdx(x.q.o); return st.picks[x.i]!==ci; }); if(!st.receipt){ var missedItems=st.items.map(function(q,i){return {q:q,i:i};}).filter(function(x){ var ci=correctIdx(x.q.o); return st.picks[x.i]!==ci; }); var weakTopic=null; bts.forEach(function(t){ var b=R.byTopic[t]; var pc=b.c/Math.max(1,b.n); if(b.n>=2&&(weakTopic===null||pc<weakTopic.pc)) weakTopic={t:t,pc:pc}; }); st.receipt=cwReceipt({ tool:
- Nothing to review — every item correct.
- Joshua Moss, MD | Psychiatrist · Educational simulation; fictional composites only. Verify management against current guidelines.
- End this set and discard progress?
- Educational simulation; fictional composites only (no patient information). Joshua Moss, MD | Psychiatrist

---

## COMAT & Shelf Review

- **Slug:** `shelf.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 742 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 5 min

**TL;DR (shown above the page text):**

> Use patients to organize exam review — for each patient, name the syndrome, write the differential, name one medical mimic, name first-line treatment, and name one safety or legal issue; the exam is patient-anchored, not topic-anchored.

**Key points (bulleted card):**

- Six COMAT/shelf exam traps to internalize: 'denies SI — low risk' (ask about means and preparatory behavior), 'psychosis means schizophrenia' (check substances, mood, and delirium first), and 'family support means discharge is safe' (family support is data, not a risk decision).
- The final week 9-item checklist covers mania vs. stimulant intoxication, delirium vs. psychosis, capacity in 4 abilities, chronic vs. acute risk formulation, catatonia red flags, antipsychotic adverse effects, lithium monitoring, alcohol withdrawal risk, and case presentation under 6 minutes.
- Legal and ethical questions anchor on decision-specific capacity, duty-to-protect jurisdictional variation, and voluntary vs. involuntary hospitalization — treat these as clinical reasoning problems, not rule memorization.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Turn each patient into an exam stem: age, time course, syndrome, key risk, mimic, and next best step.
- **mse** — Translate MSE into exam language: attention for delirium, psychomotor change for catatonia/mania, thought process/content for psychosis.
- **safety** — Shelf traps often hide safety in plain sight: means access, preparatory behavior, delirium, withdrawal, capacity, and adverse medication effects.
- **say** — My answer is..., because the discriminating feature is..., and the tempting wrong answer misses...
- **collateral** — Use collateral facts as exam discriminators: baseline, timeline, adherence, substance exposure, family safety, and follow-up feasibility.
- **rounds** — Rehearse one 20-second answer before rounds, then test the same concept in the question bank.
- **exam** — Study by patient problem, not topic list: syndrome, mimic, treatment, safety/legal, and disposition.
- **actions** — Open practice questions; Open shelf mode; Practice suicide wording

**Cross-references and tagging:**

- **Related tools:** `question-bank-practice.html`, `shelf-mode.html`, `review.html`, `diagnostic-reasoning.html`, `communication-practice.html`
- **Communication cases:** `suicide_direct_question_001`, `psychosis_validation_001`, `medication_ambivalence_001`
- **Workflow stages:** `exam`, `diagnosis`, `safety`
- **Workflow modes:** `shelf`, `5min`

#### Page text (as shipped)

# Psychiatry COMAT & Shelf Review Guide — Inpatient Rotation

Audience: MS3 students.

**Your exam is the COMAT.** UNE COM uses the **NBOME COMAT Clinical Psychiatry** subject exam (not the NBME shelf) for the Medical Knowledge grade. The high-yield content below serves both; for the official content blueprint and sample items, see the [COMAT Clinical Psychiatry page (NBOME)](https://www.nbome.org/assessments/comat/clinical-subject-exams/comat-clinical-psychiatry/).

## How To Study During The Rotation

Use patients to organize exam review:

- For each patient, identify the syndrome.
- Write the differential.
- Name one medical/substance mimic.
- Name first-line treatment.
- Name one safety or legal issue.
- Name one discharge barrier.

## High-Yield Domains

### Mood Disorders

Know:

- Major depressive episode criteria.
- Bipolar I vs bipolar II.
- Mixed features.
- Psychotic depression.
- Suicide risk assessment.
- Antidepressant-induced mania concern.

Clinical anchor:

- Sleep change and episodicity matter.

### Psychotic Disorders

Know:

- Schizophrenia spectrum timeline.
- Brief psychotic disorder, schizophreniform disorder, schizophrenia.
- Schizoaffective disorder vs mood disorder with psychotic features.
- Substance/medication-induced psychosis.
- Delirium as mimic.

Clinical anchor:

- Always ask about mood episodes, substances, medications, sleep, and medical symptoms.

### Anxiety, OCD, Trauma

Know:

- Panic disorder vs panic attack.
- GAD vs adjustment disorder.
- OCD obsessions/compulsions.
- PTSD intrusion, avoidance, negative mood/cognition, arousal.

Clinical anchor:

- Avoid forcing trauma details in the acute setting unless needed for safety.

### Personality Disorders

Know:

- Cluster A, B, C patterns.
- Borderline personality disorder criteria and self-harm risk.
- Splitting, idealization/devaluation, abandonment fears.

Clinical anchor:

- Describe behavior and context; avoid pejorative labels.

### Substance Use And Withdrawal

Know:

- Alcohol withdrawal timeline and seizure/DT risk.
- Opioid intoxication vs withdrawal.
- Stimulant intoxication and crash.
- Cannabis-associated anxiety/psychosis in vulnerable patients.

Clinical anchor:

- Last use and prior complicated withdrawal are essential.

### Neurocognitive And Medical Mimics

Know:

- Delirium: acute, fluctuating, inattentive.
- Dementia: chronic, progressive.
- Catatonia: motor/behavioral syndrome requiring urgent recognition.
- Medication effects: steroids, anticholinergics, dopaminergic agents, intoxication/withdrawal.

Clinical anchor:

- New confusion in hospital is delirium until proven otherwise.

### Psychopharmacology

Know broad classes:

- SSRIs/SNRIs.
- Mood stabilizers: lithium, valproate, carbamazepine, lamotrigine.
- Antipsychotics: first vs second generation, EPS, metabolic effects.
- Benzodiazepines: short-term use, withdrawal risk.
- Stimulants and non-stimulants for ADHD.

Clinical anchor:

- For inpatient psychiatry, monitoring and adverse effects are as important as starting dose.

### Legal/Ethical

Know:

- Capacity vs competence.
- Voluntary vs involuntary hospitalization basics.
- Duty to protect/warn varies by jurisdiction.
- Confidentiality and collateral.
- Emergency treatment principles.

Clinical anchor:

- Capacity is decision-specific and time-specific.

## Exam Traps (COMAT & Shelf)

| Trap | Better Thinking |
|---|---|
| "Patient denies SI, so low risk" | Ask about acute factors, means, preparatory behavior, collateral |
| "Psychosis means schizophrenia" | Check mood episodes, substances, delirium, medical causes |
| "Refusal means no capacity" | Assess four decision abilities |
| "Agitation means antipsychotic" | Consider delirium, withdrawal, pain, akathisia, trauma |
| "Family wants discharge, so discharge is safe" | Family support is data, not a substitute for risk reasoning |
| "Bizarre behavior is behavioral" | Consider catatonia, delirium, intoxication, neurologic illness |

## Weekly Exam Integration

| Week | Exam Focus |
|---|---|
| 1 | MSE, suicide assessment, psychiatric interview |
| 2 | DSM differentials and medical/substance mimics |
| 3 | Medication classes and psychotherapy basics |
| 4 | Emergency psychiatry, capacity, delirium, catatonia, withdrawal |
| 5 | Family, systems, discharge, ethics |
| 6 | Mixed practice questions and OSCE-style review |

## Practice Question Template

For each topic, make one question:

1. Stem: age, setting, symptoms, timeline.
2. Key clue: one detail that changes diagnosis or management.
3. Ask: diagnosis, next step, mechanism, adverse effect, risk, legal issue.
4. Explain why the wrong answers are tempting.

## Final Week Checklist

- Can I distinguish mania from stimulant intoxication?
- Can I distinguish delirium from psychosis?
- Can I explain capacity in four abilities?
- Can I write a chronic vs acute suicide risk formulation?
- Can I identify catatonia red flags?
- Can I name common antipsychotic adverse effects?
- Can I name lithium monitoring concerns?
- Can I describe alcohol withdrawal risk?
- Can I present a case in under 6 minutes?

Plain-English note: this guide links exam studying to real inpatient cases so
students do not treat test prep and clinical reasoning as separate tasks.


---

## Rapid Review — Buzzwords

- **Slug:** `rapid_review.md` · **Type:** md · **Sidebar:** listed
- **Source:** `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 989 words

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
- Confusion + ophthalmoplegia + ataxia in alcohol use → **Wernicke** → **thiamine before or with glucose** (never delay dextrose for true hypoglycemia). *(→ SUD)*
- Alcohol withdrawal peak 48–96 h, autonomic instability + confusion → **delirium tremens** → benzodiazepines — scheduled/front-loaded, titrated to light sedation (CIWA symptom-triggered dosing is for withdrawal *without* delirium). *(→ Withdrawal card)*
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

## OSCE Stations

- **Slug:** `osce.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 1,546 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 4 min

**TL;DR (shown above the page text):**

> Six OSCE stations covering the skills most tested on rounds — suicide risk with collateral, capacity with delirium recognition, catatonia, alcohol withdrawal, family meeting agenda, and oral case presentation — with entrustment anchors 1–4.

**Key points (bulleted card):**

- Each station specifies behaviors to practice, not answers to memorize — rater focus is on clinical reasoning, communication, and appropriate escalation, not on naming the correct drug first.
- Station 2 (capacity) and Station 3 (catatonia) test whether you avoid premature psychiatric labels when a medical mimic is present — both require recognizing the underlying driver before concluding behavior.
- Target entrustment level 3 by end of rotation: able to perform routine parts with indirect supervision and escalate appropriately — safe and organized, not yet independent.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — For each OSCE station, first identify the task: risk, capacity, catatonia, withdrawal, family meeting, or oral presentation.
- **mse** — Use observable MSE findings to justify your next step; stations reward saying what you saw, not only naming a diagnosis.
- **safety** — State when you would stop the station and get supervision, medical evaluation, or emergency support.
- **say** — I want to ask this directly because safety matters: have you had thoughts of killing yourself?
- **collateral** — Use collateral to test baseline, time course, risk, and discharge feasibility rather than asking for global impressions.
- **rounds** — Give a concise assessment, your immediate safety action, and the data that would change your plan.
- **exam** — Practice stations aloud: opening line, core questions, safety escalation, and summary.
- **actions** — Practice direct suicide question; Open reasoning workbench; Open rounding prep

**Cross-references and tagging:**

- **Related tools:** `communication-practice.html`, `diagnostic-reasoning.html`, `family-systems.html`, `oral.html`, `cssrs.html`, `capacity.html`
- **Communication cases:** `suicide_direct_question_001`, `family_meeting_opening_001`, `collateral_questions_001`
- **Workflow stages:** `encounter`, `safety`, `communication`, `team`, `exam`
- **Workflow modes:** `ward`, `safety`, `family`, `shelf`

#### Page text (as shipped)

# MS3 Psychiatry OSCE Station Set

Generated: 2026-06-27

All cases are synthetic. No real patient details are used.

## Station 1 - Suicide Risk With Collateral Hesitation

**Time:** 12 minutes encounter, 3 minutes summary, 10 minutes feedback.

**Student task**

Conduct a focused suicide risk assessment, ask permission for collateral, and
state an acute risk impression.

**Patient brief**

29-year-old retail worker admitted after sending a concerning text to a sibling.
The patient says the ED overreacted. Sleep has been 3-4 hours nightly. Cannabis
use increased. A goodbye letter exists but is not volunteered unless asked
directly. Firearm access is at a parent's home.

**Behaviors to practice**

- Opens with role and purpose.
- Asks directly about suicidal thoughts, plan, intent, preparation, past attempts.
- Asks about means access.
- Separates chronic and acute factors.
- Asks permission for collateral.
- Reflects the patient's worry about burdening family.
- Names one next step.

**Rater focus**

Risk formulation, means restriction, collateral consent, tone.

## Station 2 - Capacity To Refuse Medical Treatment

**Time:** 12 minutes encounter, 5 minutes oral capacity summary.

**Student task**

Assess decision-making capacity for a specific refusal.

**Patient brief**

67-year-old admitted to medicine with infection and new paranoia that IV
antibiotics are poison. The patient is intermittently inattentive and worse at
night. The medical team asks, "Does the patient have capacity to refuse?"

**Behaviors to practice**

- Identifies the exact decision.
- Assesses choice, understanding, appreciation, and reasoning.
- Screens attention and fluctuation.
- Considers delirium and psychosis.
- Avoids equating disagreement with incapacity.
- Presents which capacity ability is impaired.

**Rater focus**

Decision-specific reasoning and delirium recognition.

## Station 3 - Possible Catatonia

**Time:** 10 minutes observation/interview, 5 minutes team presentation.

**Student task**

Identify catatonia concern and escalate.

**Patient brief**

35-year-old with depression sits motionless, answers rarely, has eaten little,
and intermittently holds the same posture. Nursing reports the patient is
"refusing everything." Vital signs are stable but oral intake is poor.

**Behaviors to practice**

- Describes motor signs objectively.
- Asks about intake, mobility, autonomic signs, and medication exposure.
- Considers catatonia in differential.
- Avoids labeling behavior as "noncompliance."
- Escalates to resident/attending.

**Rater focus**

Recognition and language.

## Station 4 - Alcohol Withdrawal Risk On Psychiatry Unit

**Time:** 10 minutes encounter, 5 minutes presentation.

**Student task**

Screen for alcohol withdrawal risk and escalate appropriately.

**Patient brief**

48-year-old admitted for suicidal ideation after job loss. Reports drinking
"more than usual." Last drink was yesterday morning. Prior tremors and one
possible withdrawal seizure years ago, revealed only if asked.

**Behaviors to practice**

- Asks amount/frequency/last drink.
- Asks prior withdrawal, seizure, delirium tremens.
- Checks current symptoms and vitals.
- Recognizes alcohol withdrawal risk.
- Does not propose unsupervised management.

**Rater focus**

Withdrawal history and escalation.

## Station 5 - Family Meeting Agenda Before Discharge

**Time:** 15 minutes prep/presentation.

**Student task**

Prepare a family meeting agenda for a synthetic patient nearing discharge.

**Case brief**

22-year-old admitted for first manic episode. Sleep and agitation have improved.
Family is frightened and divided: one parent wants strict control, another wants
to avoid conflict. Patient wants discharge and refuses to discuss warning signs.

**Behaviors to practice**

- Names meeting goal.
- Defines student/team role.
- Includes patient voice.
- Covers warning signs, medication plan, sleep, means safety, follow-up.
- Avoids making family responsible for treatment adherence alone.
- Names one unresolved discharge barrier.

**Rater focus**

Structure, boundaries, patient autonomy, family support.

## Station 6 - Oral Presentation Of A New Admission

**Time:** 6-minute presentation, 4-minute questions.

**Student task**

Present a synthetic admission with differential, risk, formulation, and plan.

**Case brief**

40-year-old with insomnia, paranoia, weight loss, and new stimulant use. Family
history includes bipolar disorder. Patient has hypertension and recently started
a corticosteroid burst.

**Behaviors to practice**

- Organized timeline.
- Differential includes stimulant-induced psychosis, mania, steroid effect,
  primary psychosis, medical/neurologic contributors.
- MSE uses observable language.
- Risk is explicit.
- Plan matches differential and safety concerns.

**Rater focus**

Diagnostic reasoning and concision.

## Entrustment Anchors

| Level | Description |
|---|---|
| 1 | Needs full prompting; misses safety or diagnosis issue |
| 2 | Identifies main issue but needs direct supervision |
| 3 | Performs with indirect supervision for routine parts; escalates appropriately |
| 4 | Organized, safe, concise, anticipates next step |

## Shared Debrief Questions

- What information changed your risk or differential?
- What did you ask directly rather than imply?
- What patient/family emotion did you notice?
- What would you escalate immediately?
- What would you document in one sentence?

Plain-English note: these OSCEs practice what students actually do on an
inpatient unit: ask safety questions, recognize medical mimics, talk to families,
and present clearly.

---

## Scored Checklists & Critical-Fail Criteria

*Added 2026-07-04 — reviewed and attested by Joshua Moss, MD (2026-07-09). Each station is scored out of 10.
**A critical-fail auto-fails the station regardless of the numeric score** (mark the station "1" on the entrustment anchor and debrief the safety miss).*

**How to score.** Award the listed points for behaviors performed unprompted; give half credit if the examiner had to prompt. Pass = **≥ 7/10 AND no critical-fail**. Map the total to the entrustment anchors (≤4 → level 1; 5–6 → level 2; 7–8 → level 3; 9–10 → level 4).

### Station 1 — Suicide risk with collateral hesitation (10 pts)

- Introduces role, purpose, and the limits of confidentiality — 1
- Asks directly about ideation, **plan, intent, and preparatory acts** — 2
- Elicits the goodbye letter / preparation by asking directly (not volunteered) — 1
- Asks about **means access, including the firearm at the parent's home** — 2
- Separates chronic from acute risk factors; notes protective factors — 1
- Asks permission for collateral — 1
- Responds empathically to the "burden on family" worry — 1
- States an acute risk impression **and** one concrete next step — 1

**Critical-fail (auto-fail):** never asks about means/firearm access · never screens plan/intent/preparation · elicits an active plan yet states no protective step (means restriction, observation level, escalation).

### Station 2 — Capacity to refuse medical treatment (10 pts)

- Identifies the **exact decision** at stake (refuse IV antibiotics) — 2
- Assesses all four abilities — choice, understanding, appreciation, reasoning — 4 (1 each)
- Screens attention and fluctuation (delirium) — 1
- Considers delirium/psychosis as contributors — 1
- Names **which specific ability is impaired**; frames capacity as decision- and time-specific — 2

**Critical-fail:** equates disagreement/refusal alone with incapacity · misses delirium in a clearly fluctuating patient (no attention screen) · declares the patient globally "incompetent" rather than decision-specific.

### Station 3 — Possible catatonia (10 pts)

- Describes motor signs objectively (immobility, mutism, posturing, negativism) — 2
- Asks about intake, mobility, autonomic signs, medication exposure — 2
- Names **catatonia** in the differential — 2
- Recognizes escalation/benzodiazepine (lorazepam) challenge; does **not** reflexively give an antipsychotic — 1
- Avoids "noncompliance / refusing everything" language — 1
- Escalates to resident/attending — 1
- Flags malignant catatonia / NMS as the dangerous end — 1

**Critical-fail:** labels the patient "refusing/noncompliant" without considering catatonia · fails to escalate a patient with poor intake + motor signs · proposes an antipsychotic as the fix without recognizing catatonia/NMS risk.

### Station 4 — Alcohol withdrawal risk (10 pts)

- Asks amount / frequency / **last drink** — 2
- Asks about prior withdrawal, **seizure, and DTs** (revealed only if asked) — 2
- Checks current symptoms and vital signs — 2
- Recognizes elevated withdrawal/seizure risk — 2
- Escalates to a protocol (symptom-triggered benzodiazepine per team) and names **thiamine before or with glucose** — 1
- Does **not** propose unsupervised management — 1

**Critical-fail:** proposes unsupervised/self-directed management or discharge · never asks the withdrawal-seizure history (misses it) · fails to escalate a high-risk withdrawal.

### Station 5 — Family meeting agenda before discharge (10 pts)

- Names the meeting goal — 2
- Defines the student/team role and boundaries — 1
- Includes the patient's voice and protects autonomy — 2
- Covers warning signs, medication plan, sleep, **means safety**, and follow-up — 2
- Avoids making the family solely responsible for adherence — 1
- Holds the divided parents without taking a side — 1
- Names one unresolved discharge barrier — 1

**Critical-fail:** omits means-safety and warning-signs for a first-manic patient who refuses to discuss them · proposes a discharge decision beyond MS3 scope · sidelines patient autonomy.

### Station 6 — Oral presentation of a new admission (10 pts)

- Organized one-liner and timeline — 2
- Differential includes **stimulant-induced psychosis, mania, steroid effect, primary psychosis, and medical/neurologic** contributors — 3
- MSE in observable language — 1
- Risk stated explicitly — 2
- Plan matches the differential and safety concerns (includes medical workup) — 2

**Critical-fail:** anchors on a primary psychiatric diagnosis without the medical/substance/steroid differential · omits risk entirely · proposes management beyond MS3 scope without escalation.

---

**Examiner note.** The critical-fail list encodes the non-negotiable safety behaviors for each station — a student can be fluent and still fail if they miss one. Use the Shared Debrief Questions above to close every station, and always name the safety behavior that was missed.


---

## Practice Cases

- **Slug:** `cases.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/synthetic_practice_cases.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 849 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 6 min

**TL;DR (shown above the page text):**

> Eight synthetic composite cases spanning first-episode mania, suicide risk, withdrawal, delirium, catatonia, family dynamics, and discharge planning — each includes student tasks, hidden clinical detail that rewards direct questioning, and a case discussion template.

**Key points (bulleted card):**

- Each case contains hidden clinical detail that is only revealed when the student asks directly — the reward for thorough, non-assumption-based history-taking.
- Student tasks mirror the OSCE: build the differential, name the safety questions, draft an MSE, prepare a family meeting agenda, and identify the discharge barrier.
- The case discussion template asks: what would change the differential? what collateral is missing? what is the discharge barrier? what must be done before tomorrow? — use it after every case.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — For each case, ask what hidden detail would change diagnosis, risk, disposition, or family/system plan.
- **mse** — Document the MSE finding that most changes the differential and the one finding that could be misleading.
- **safety** — Name the safety question before the diagnosis question when the case includes suicide, violence, withdrawal, delirium, catatonia, or discharge risk.
- **say** — What is he like at baseline, what changed, when did it change, and what specific safety concerns have you noticed?
- **collateral** — Use collateral to define baseline, timeline, safety, adherence, supports, and discharge barriers.
- **rounds** — After the case, present problem representation, differential, risk formulation, collateral gap, and next action.
- **exam** — Synthetic cases are practice for illness scripts: syndrome, mimic, first-line treatment, safety/legal issue, and disposition.
- **actions** — Open reasoning workbench; Practice collateral questions; Open family systems practice

**Cross-references and tagging:**

- **Related tools:** `diagnostic-reasoning.html`, `communication-practice.html`, `family-systems.html`, `oral.html`, `decision-aids.html`
- **Communication cases:** `suicide_direct_question_001`, `collateral_questions_001`, `family_conflict_discharge_001`
- **Workflow stages:** `diagnosis`, `safety`, `family`, `team`, `exam`
- **Workflow modes:** `ward`, `safety`, `family`, `shelf`

#### Page text (as shipped)

# Synthetic Practice Cases

Generated: 2026-06-27

All cases are fictional composites for teaching. No real patient details are used.

## Case 1 - First-Episode Mania With Family Conflict

**Presentation**

22-year-old college student brought by family for 6 days of little sleep,
increased spending, pressured speech, grand plans, irritability, and paranoid
concerns about roommates. Urine toxicology is positive for cannabis only.

**Student tasks**

- Build differential.
- Identify safety questions.
- Draft MSE.
- Prepare family meeting agenda.
- Name discharge barriers.

**Teaching points**

- Mania vs substance-induced symptoms.
- Sleep as both symptom and treatment target.
- Family fear can become control; family support still matters.
- Discharge readiness requires more than reduced agitation.

## Case 2 - Depression, Alcohol Escalation, And Suicide Risk

**Presentation**

46-year-old admitted after telling a coworker, "I cannot do this anymore."
Reports 2 months of low mood, insomnia, guilt, and increased nightly alcohol
use. No prior psychiatric care. Initially denies a plan but later describes
stockpiled medication at home.

**Student tasks**

- Separate chronic and acute suicide risk.
- Ask withdrawal screening questions.
- Draft means-restriction plan for team review.
- Write one-paragraph formulation.

**Teaching points**

- "Denies SI" is not enough.
- Alcohol can increase acute risk and complicate treatment.
- If withdrawal risk or malnutrition is present, verify thiamine is given before or with glucose/carbohydrate when possible; true hypoglycemia still gets treated immediately.
- Means restriction must be concrete.
- Collateral can change risk formulation.

## Case 3 - Delirium Mistaken For Psychosis

**Presentation**

73-year-old on medical floor becomes paranoid overnight, sees insects, pulls at
IV line, and is calm by morning. Family says the patient was independent last
week. New medications include diphenhydramine for sleep.

**Student tasks**

- Identify delirium features.
- Perform brief attention screen.
- Build medical differential.
- Present consult question.

**Teaching points**

- Fluctuation and inattention are key.
- Visual hallucinations in an older hospitalized patient should trigger delirium concern.
- Medication review is part of psychiatric assessment.

## Case 4 - Possible Catatonia In Severe Depression

**Presentation**

38-year-old with severe depression is lying still, minimally speaking, eating
little, and holding odd postures. Staff describe "refusal." No fever. Recently
started antipsychotic for suspected psychotic depression.

**Student tasks**

- Describe motor findings objectively.
- Name catatonia in differential.
- Identify escalation triggers.
- Avoid stigmatizing documentation.

**Teaching points**

- Catatonia can be missed when behavior is framed as refusal.
- Poor intake and immobility are safety issues.
- Catatonia and delirium can overlap; ask for help early.

## Case 5 - Capacity To Refuse Treatment

**Presentation**

58-year-old with bipolar disorder and pneumonia refuses antibiotics, saying
"the hospital is experimenting on me." The patient can repeat the diagnosis but
cannot explain what might happen without treatment and becomes distracted
during questioning.

**Student tasks**

- State the exact decision.
- Assess choice, understanding, appreciation, reasoning.
- Screen attention.
- Present capacity summary.

**Teaching points**

- Capacity is decision-specific.
- Psychosis does not automatically remove capacity.
- Inattention raises delirium concern.

## Case 6 - Withdrawal Risk On Admission

**Presentation**

51-year-old admitted for suicidal ideation after divorce. Reports drinking "a
few" drinks nightly, then clarifies it is 10-12 drinks daily. Last drink was 18
hours ago. Prior withdrawal seizure 5 years ago.

**Student tasks**

- Ask alcohol withdrawal questions.
- Identify red flags.
- Escalate to team.
- Include withdrawal risk in formulation.

**Teaching points**

- Quantify "a few."
- Prior complicated withdrawal changes acuity.
- Thiamine before/with glucose is a safety check in alcohol withdrawal risk because carbohydrate loading can precipitate Wernicke encephalopathy in thiamine-depleted patients.
- Psychiatric units still manage medical risk.

## Case 7 - Discharge Barrier Hidden In Family System

**Presentation**

31-year-old admitted for psychosis is improved on medication. Patient wants to
return home. Parent says privately, "I cannot do this again," but tells patient
"of course you can come home."

**Student tasks**

- Identify mismatch between stated and actual support.
- Prepare family meeting agenda.
- Draft discharge barrier map.
- Name patient autonomy issue.

**Teaching points**

- Family agreement is not the same as viable discharge support.
- Discharge planning requires honest capacity of the support system.
- The patient should not be triangulated between team and family.

## Case 8 - Oral Presentation Integration

**Presentation**

40-year-old with insomnia, paranoia, weight loss, stimulant use, and recent
corticosteroid prescription. Family history of bipolar disorder. Medical workup
is incomplete.

**Student tasks**

- Give 6-minute admission presentation.
- Include differential.
- Name next diagnostic steps.
- Name immediate safety concerns.

**Teaching points**

- Psychosis has many causes.
- Timeline and medication exposure matter.
- Do not close on a primary psychiatric diagnosis too early.

## Case Discussion Template

For each case:

1. One-line summary.
2. Top three differential diagnoses.
3. What could be medically dangerous?
4. What safety questions are mandatory?
5. What collateral would help?
6. What would change discharge readiness?
7. What should the note say in one sentence?

Plain-English note: these cases let students practice reasoning without using
real patient details. They are deliberately common enough to teach patterns but
synthetic enough for safe reuse.
