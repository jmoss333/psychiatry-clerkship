# RESIDENT · Curriculum content — volume 9

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

**Authored clinical strings (146):**

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
- s parameters; ordinary practice leaves a saved block alone. Pure apart from those two writes: returns {html, marked, next}. Copy is audience-neutral (no MS3/clerkship/student/shelf/resident tokens) because it ships to both sites. Navigation inside a tool iframe goes through the shell
- > Session receipt '; if(s.context) h+=' '+cwReceiptEsc(s.context)+' '; h+=' '; if(s.headline) h+='<h2 class=
- >'+cwReceiptEsc(s.headline)+' '; if(s.sub) h+='<p class=
- >'+cwReceiptEsc(s.sub)+' '; var stats=s.stats||[]; if(stats.length){ h+='<div class=
- >'; for(i=0;i<stats.length;i++){ var st=stats[i]||{}, tone=st.tone==='warn'?' is-warn':(st.tone==='good'?' is-good':''); h+='<div class=
- >'+cwReceiptEsc(st.label)+' <span class=
- >'+cwReceiptEsc(st.value)+' '; } h+=' '; } var reread=s.reread||[]; if(reread.length){ h+='<div class=
- >Worth a second look '; for(i=0;i<reread.length;i++){ var r=reread[i]||{}; h+='<div class=
- >'; if(r.tag) h+='<span class=
- >'+cwReceiptEsc(r.tag)+' '; h+='<span style=
- >'+cwReceiptEsc(r.title)+' '; if(r.note) h+='<span class=
- >'+cwReceiptEsc(r.note)+' '; if(r.ref) h+='<a class=
- data-cw-receipt-next data-cw-receipt-ref=
- >Re-read: '+cwReceiptEsc(r.refTitle||r.ref)+' → '; h+=' '; } } if(marked){ var practiceWeek=cwReceiptPracticeWeek(); h+='<div class=
- >✓ '+(practiceWeek?'Week '+practiceWeek+' practice recorded:':'Activity recorded:')+' '+cwReceiptEsc(s.refTitle||s.ref)+'. '; } h+='<div class=
- >'; var next=progress&&progress.next; if(next){ var route=cwReceiptStepRoute(next); h+='<button type=
- >Next in your block: '+cwReceiptEsc(next.title)+(next.min?' ~'+cwReceiptEsc(next.min)+' min ':'')+' '; }else{ var acts=s.actions||[]; for(i=0;i<acts.length;i++){ var a=acts[i]||{}; h+='<button type=
- ':'')+'>'+cwReceiptEsc(a.label)+' '; } } h+='<button type=
- data-cw-receipt-home'+(s.homeId?' id=
- ':'')+'>Back to Today '; if(progress){ h+='<span class=
- >'+(next?('Block · '+progress.done+' of '+progress.total+' done'):('Block complete · '+progress.total+' of '+progress.total+' done'))+' '; if(!next&&typeof blockClear==='function') blockClear(); } h+=' '; return {html:h, marked:marked, next:next||null}; } function srsUpdate(item, confidence, correct, twoTierResult){ var s = srsLoad(); var cardId = 'QB#'+item.id; var card = s.cards[cardId]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0}; var grade = srsGrade(item, confidence, correct, twoTierResult); s.cards[cardId] = applyGrade(card, grade, {fuzzKey:cardId}); /* update aggregate stats */ s.stats.totalReviews = (s.stats.totalReviews||0)+1; if(correct) s.stats.correct=(s.stats.correct||0)+1; s.stats.seen=(s.stats.seen||0)+1; srsSave(s); return grade; } /* ---- queue building ----------------------------------------------------------- */ function buildQueue(items, catFilter, diffFilter, sizeLimit){ var q = items.filter(function(it){ if(catFilter!=='all' && it.category!==catFilter) return false; if(diffFilter!=='all' && String(it.difficulty)!==diffFilter) return false; return true; }); q = shuffle(q); if(sizeLimit!=='all') q = q.slice(0, parseInt(sizeLimit,10)||20); return q; } /* Items eligible to serve to learners. Two gates: — Retired items (near-duplicate/redundant per question_bank.schema.json) are NEVER queued. — Un-attested items serve ONLY when the learner opts in via the setup-screen toggle (persisted as cw_qb_drafts_v1). The default pool is faculty-attested items only, and every surface that shows an included draft labels it — see renderMeta() and the .draft-notice callout in renderQuestion(). Policy history, because this has flipped before: the 2026-07-15 decision log recorded
- after a04a848 gated to attested-only by ACCIDENT — the pool fell 192->143 with no UI trace, and #284 restored serving. The 2026-08-20 Taplinger response plan (PLAN_Taplinger_Feedback_and_Therapy_Library_2026-08-20.md §A2 / WP-37, urgency per FEEDBACK_IMPACT_Taplinger_Verbatim_2026-08-20.md §3) reverses that decision deliberately now that an external course page links to the site: attested-only BY DEFAULT, drafts opt-in and labelled. Unlike a04a848, this flip is visible — the setup screen states the exclusion, shows the excluded count, and carries the toggle. Fail-safe direction: only an explicit status==='attested' reaches the default pool, so a new or misspelled status is withheld rather than served as reviewed (mirrors the label logic, which marks anything not attested). `status` is still the source of truth; nothing here mutates it, and attestation stays server-side. */ function includeDrafts(){ return lsGet('cw_qb_drafts_v1')===true; } function setIncludeDrafts(on){ lsSet('cw_qb_drafts_v1', !!on); } function activeItems(){ var inc = includeDrafts(); return (BANK && BANK.items ? BANK.items : []).filter(function(it){ if(it.retired) return false; if(!inc && it.status!=='attested') return false; return true; }); } /* Focus-mode presets, built from the learner's own cw_qb_v1 history. Both start from activeItems(), so a leftover record for a since-retired item (or one dropped from the bank entirely) can never surface here — the item has to still be servable today. That same routing applies the draft rule: a record for a draft item surfaces only while the learner's cw_qb_drafts_v1 opt-in is set (see the policy comment above). */ function missedItems(){ var records = qbLoad(); return activeItems().filter(function(it){ var rec = records[it.id]; return !!rec && rec.correct === false; }); } function certWrongItems(){ var records = qbLoad(); return activeItems().filter(function(it){ var rec = records[it.id]; return !!rec && rec.certWrong === true; }); } /* Due-first serving. This tool has WRITTEN QB# cards to cw_srs_v1 since SRS seeding landed, but nothing ever read the schedule — Daily Review serves TOPIC# cards only (the false
- copy was corrected in #344). This makes the schedule real: cards that have come due return at the FRONT of the next practice session here, most-overdue first. Routed through activeItems(), so a since-retired item can never resurface no matter what its card says. */ function dueQbItems(){ var s = srsLoad(); if(!s || !s.cards) return []; var now = Date.now(), due = {}; Object.keys(s.cards).forEach(function(id){ if(id.indexOf('QB#') !== 0) return; var c = s.cards[id]; if(c && typeof c.due === 'number' && c.due <= now) due[id.slice(3)] = c.due; }); return activeItems() .filter(function(it){ return Object.prototype.hasOwnProperty.call(due, it.id); }) .sort(function(a, b){ return due[a.id] - due[b.id]; }); } /* ---- rendering helpers -------------------------------------------------------- */ function diffDots(n){ var h='<div class=
- >'; for(var i=1;i<=3;i++) h+='<span class=
- > '; return h+' '; } function renderSetup(){ var items = activeItems(); var cats = {}; items.forEach(function(it){ cats[it.category]=1; }); var catOpts = '<option value=
- >All categories '; Object.keys(CAT_LABELS).forEach(function(k){ if(cats[k]) catOpts+='<option value=
- >'+CAT_LABELS[k]+' '; }); var total = items.length; /* bankDraftCount is toggle-independent (all non-retired, non-attested items in the bank); draftCount is how many of those are in the SERVED pool right now. The note renders whenever the bank has drafts, in whichever wording matches the toggle — excluded-by-default (off) or labelled-in-pool (on). */ var draftsOn = includeDrafts(); var bankDraftCount = (BANK && BANK.items ? BANK.items : []).filter(function(it){ return !it.retired && it.status!=='attested'; }).length; var draftCount = draftsOn ? bankDraftCount : 0; var missedCount = missedItems().length; var certWrongCount = certWrongItems().length; var dueCount = dueQbItems().length; return '<div class=
- >' +' Practice bank ' +'<p class=
- >'+total+' items across 12 categories. Select filters, then start. ' +'Retired near-duplicates are excluded. ' +(bankDraftCount ? '<p class=
- >⚠ Draft — not yet faculty-reviewed ' +(draftsOn ? draftCount+' of these '+total+' questions carry this label. They have not yet been ' +'reviewed by faculty, so treat their answers and explanations as unverified — check them ' +'against a primary source before relying on them clinically. Every draft is labelled again ' +'on the question itself. ' : bankDraftCount+' draft question'+(bankDraftCount===1?' is':'s are')+' not served by default — ' +'this bank serves only faculty-reviewed questions unless you include drafts. ') +'<label class=
- '+(draftsOn?' checked':'')+'> ' +'Include draft questions ' : '') +'<div class=
- >Focus modes ' +'<p class=
- >Jump straight into a targeted set, skipping the filters below. ' +'<div class=
- '+(dueCount?'':' disabled')+'>Due for review ('+dueCount+') ' +'<button class=
- '+(missedCount?'':' disabled')+'>Redo my misses ('+missedCount+') ' +'<button class=
- '+(certWrongCount?'':' disabled')+'>Confidently wrong ('+certWrongCount+') ' +' ' +' ' +'<div class=
- >'+catOpts+' ' +'<div class=
- >All levels <option value=
- >1 — Recognition <option value=
- >2 — Shelf-standard <option value=
- >3 — Stretch ' +'<div class=
- >Session size <select id=
- >10 questions <option value=
- selected>20 questions <option value=
- >All matching ' +' ' +'<div class=
- >Start practice ' +'<span class=
- >'+total+' questions match ' +' ' +' '; } function renderMeta(item){ var h = '<div class=
- >'+esc(CAT_LABELS[item.category]||item.category)+' '; h += diffDots(item.difficulty); if(item.type==='two-tier') h+='<span class=
- >Two-tier '; if(item.type==='relational') h+='<span class=
- >Relational '; if(item.hy) h+='<span class=
- >★ High-yield '; /* The glyph is decorative — the wording carries the meaning, so the label never depends on colour or on the icon being announced. */ if(item.status!=='attested') h+='<span class=
- >⚠ Draft — not yet faculty-reviewed '; h += ' '; return h; } function renderConfidence(disabled){ var ds = disabled ? ' disabled' : ''; return '<div class=
- >Your confidence — select before answering ' +'<div class=
- '+ds+'>Guess <small style=
- >uncertain ' +'<button class=
- '+ds+'>Likely <small style=
- >confident ' +'<button class=
- '+ds+'>Certain <small style=
- >no doubt ' +' ' +'<div class=
- >Select your confidence level first. ' +' '; } function renderOptions(item, state){ /* state: 'active'|'locked' — locked after answer. Letters come from DISPLAY position, not the authored key: 46 of 47 draft items are keyed A, so rendering opt.key after the shuffle both scrambled the letter sequence and let
- follow the correct answer around the screen. data-key still carries the authored key for answer logic. A locked re-render reuses the session's stored order — reshuffling at lock would visibly jump the options mid-question. */ var displayOrder = (state==='locked' && SESSION.displayOrder && SESSION.displayOrder.length) ? SESSION.displayOrder : shuffle(item.options.slice()); SESSION.displayOrder = displayOrder; var h = '<div class=
- >'; displayOrder.forEach(function(opt, i){ var letter = String.fromCharCode(65+i); var cls = 'opt'; if(state==='locked') cls += ' locked'; h += '<button class=
- ' + (state==='locked'?'disabled ':'')+' aria-label=
- >'+letter+'. '+esc(opt.t) + ' '; }); h += ' '; return h; } function renderTier2(item){ var t2 = item.tier2; var displayOrder = shuffle(t2.options.slice()); SESSION.tier2DisplayOrder = displayOrder; var h = '<div class=
- >Now the reason ' +'<p class=
- >'+esc(t2.q)+' ' +'<p class=
- >Select the best rationale — then see your full feedback. ' +'<div class=
- >'; displayOrder.forEach(function(opt, i){ var letter = String.fromCharCode(65+i); h += '<button class=
- >'+letter+'. '+esc(opt.t)+' '; }); h += ' '; return h; } function getFeedbackHtml(item, selectedKey, tier2Key, confidence, correct, twoTierResult){ var reviewOnly = SESSION && SESSION.reviewOnly; var h = '<div class=
- >'; /* verdict */ var verdClass, verdText; if(twoTierResult==='shaky'){ verdClass='shaky'; verdText='✓ Right answer — shaky reasoning'; } else if(correct){ verdClass='correct'; verdText='✓ Correct'; if(confidence==='certain') verdText+=' · Nailed it'; else if(confidence==='guess') verdText+=' · Lucky — review soon'; } else { verdClass='wrong'; verdText='✗ Incorrect'; if(confidence==='certain') verdText+=' · Confidently wrong — flagged for review'; } h += '<div class=
- >'+verdText+' '; /* trap feedback for wrong answers */ if(!correct){ var wrongOpt = item.options.filter(function(o){return o.key===selectedKey;})[0]; if(wrongOpt&&wrongOpt.trap){ h += '<div class=
- >You fell for: '+esc(wrongOpt.trap.name)+' ' +'<div class=
- >'+esc(wrongOpt.trap.note)+' ' +' '; } /* reveal correct option — letter must match what the learner SAW (display position), not the authored key */ var correctOpt = item.options.filter(function(o){return o.c;})[0]; if(correctOpt){ var cIdx = (SESSION.displayOrder||[]).indexOf(correctOpt); var cLetter = cIdx>=0 ? String.fromCharCode(65+cIdx) : correctOpt.key; h += '<div class=
- >Correct answer ' + ' '+esc(cLetter)+'. '+esc(correctOpt.t)+' '; } } /* shaky reason feedback */ if(twoTierResult==='shaky'){ var correctT2 = item.tier2.options.filter(function(o){return o.c;})[0]; h += '<div class=
- >Right answer, wrong reason — your SRS interval is capped at Hard , so this item comes due again soon and will serve at the front of a future session here. The correct rationale: '+esc(correctT2?correctT2.t:'—')+' '; h += '<div class=
- >Why that rationale '+esc(item.tier2.why)+' '; } /* standard why / pearl / evidence */ h += '<div class=
- >Why '+esc(item.why)+' '; h += '<div class=
- >Pearl '+esc(item.pearl)+' '; h += '<div class=
- >Source '+esc(item.evidence)+' '; /* deep link */ if(!reviewOnly && item.link&&item.link.href){ var linkHref = item.link.href; /* route through SPA shell if running inside iframe */ var isSPA = (window.self!==window.top); if(isSPA && linkHref.indexOf('?page=')===-1 && linkHref.indexOf('?tool=')===-1){ linkHref = '?tool='+encodeURIComponent(linkHref); } h += '<a class=
- ')+'>' + esc(item.link.label||'Continue reading')+(isSPA?'':' →')+' '; } if(!reviewOnly){ h += '<div class=
- >Next question → ' + ' '; } h += ' '; return h; } /* Un-attested items are served (2026-07-15 decision) but never served silently: the meta chip above marks them at a glance, and this callout states plainly what
- means before the learner reads the stem. role=
- so it is reachable as its own region and is not mistaken for part of the question. */ function renderDraftNotice(item){ if(item.status==='attested') return ''; return '<div class=
- >⚠ Draft — not yet faculty-reviewed. ' +'This question and its explanation have not been checked by faculty. Practise with it, ' +'but verify anything you would act on against a primary source.' +' '; } function renderQuestion(item){ var h = '<div class=
- >'; h += renderMeta(item); h += renderDraftNotice(item); h += '<div class=
- >'; if(item.type==='relational'&&item.subtype){ h += '<span class=
- >'+esc(SUBTYPE_LABELS[item.subtype]||item.subtype)+' '; } h += esc(item.stem); h += ' '; h += renderConfidence(false); h += renderOptions(item, 'active'); h += ' '; return h; } /* ---- render session summary -------------------------------------------------- */ function renderSummary(){ var responses = SESSION.responses; var total = responses.length; var correct = responses.filter(function(r){return r.correct;}).length; var pct = total ? Math.round(correct/total*100) : 0; /* calibration: certain answers that were correct */ var certTotal=0, certCorrect=0; responses.forEach(function(r){ if(r.confidence==='certain'){ certTotal++; if(r.correct) certCorrect++; } }); var certPct = certTotal ? Math.round(certCorrect/certTotal*100) : null; /* calibration by category */ var byCat={}; responses.forEach(function(r){ var c=r.item.category; if(!byCat[c]) byCat[c]={cert:0,certC:0}; if(r.confidence==='certain'){ byCat[c].cert++; if(r.correct)byCat[c].certC++; } }); /* The shared session receipt carries the headline, the stat grid, the
- list and the next action; the calibration analysis that follows is this tool's own. */ var certWrongList = responses.filter(function(r){return r.confidence==='certain'&&!r.correct;}); var certWrong = certWrongList.length; var guessRight = responses.filter(function(r){return r.confidence==='guess'&&r.correct;}).length; var wrong = total-correct; var headline = correct+' of '+total+(certWrong?(' — and '+(certWrong===1?'one':certWrong)+' you were sure about.'):(wrong?'.':' — clean set.')); var sub = certWrong ? 'The score matters less than the '+(certWrong===1?'item':'items')+' below: you marked Certain and were wrong. Those are the ones an exam catches.' : (guessRight?'You got '+guessRight+' right while guessing — a re-read turns a guess into a rule you own.':'Every miss is scheduled to come back in Daily Review.'); var reread = []; responses.forEach(function(r){ if(r.correct && r.confidence!=='guess') return; if(reread.length>=5) return; var chosen = (r.item.options||[]).filter(function(o){ return o && o.key===r.key; })[0]; var trap = chosen && chosen.trap ? chosen.trap : null; var trapName = trap && trap.name ? trap.name : null; var page = (r.item.pages&&r.item.pages[0]) || null; reread.push({ tag: r.correct ? 'Guess · right' : (r.confidence==='certain' ? 'Certain · wrong' : 'Wrong'), warn: !r.correct && r.confidence==='certain', title: String(r.item.stem||'').slice(0,140)+(String(r.item.stem||'').length>140?'…':''), note: trapName ? ('Trap: '+trapName+(trap.note?' — '+trap.note:'')) : (r.item.pearl||''), ref: page, refTitle: page ? pageTitle(page) : null }); }); var stats = [ {label:'Correct', value:correct+' / '+total}, {label:'Certain & wrong', value:String(certWrong), tone:certWrong?'warn':'plain'}, {label:'Guess & right', value:String(guessRight)}, {label:'Sent to review', value:String(wrong), tone:wrong?'good':'plain'} ]; var receipt = cwReceipt({ /* Only a session the block itself opened (?block=1) may mark the block's question step — a one-question sitting in an unrelated category must not tick it. */ tool:'qbank', ref:'question-bank-practice.html', refTitle:'Practice Questions', blockKind:(SESSION&&SESSION.fromBlock)?'qb':null, context: total+' question'+(total!==1?'s':'')+(SESSION.catLabel?' · '+SESSION.catLabel:''), headline: headline, sub: sub, stats: stats, reread: reread, actions: [{id:'practiceMoreBtn', label:'Practice more', primary:true}], homeId:'goHomeBtn' }); var h = '<div class=
- >' + receipt.html; /* calibration warning */ if(certTotal>=3 && certPct!==null && certPct<80){ h += '<div class=
- >' + ' Calibration gap: You were certain '+certTotal+' time'+(certTotal!==1?'s':'') + ' but only '+certPct+'% accurate when certain. ' + 'Miscalibration on the wards is more dangerous than ignorance — ' + 'replay your confidently-wrong items from this summary. '; } /* per-category calibration bars */ var catKeys = Object.keys(byCat).filter(function(k){ return byCat[k].cert>=2; }); if(catKeys.length){ h += '<div class=
- > Calibration by category '; catKeys.forEach(function(k){ var d=byCat[k], p=Math.round(d.certC/d.cert*100); h += '<div class=
- >'+esc(CAT_LABELS[k]||k)+' ' +'<span class=
- >'+p+'% '; }); h += ' '; } h += ' '; return h; } /* Page title for a re-read link: the bank's own link label when it points at that page, else a readable form of the file name (the tool has no nav registry of its own). */ function pageTitle(file){ var f=String(file||''); return f.replace(/^pg_/,'').replace(/^t_/,'').replace(/\.md$/,'').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();}); } /* ---- DOM helpers -------------------------------------------------------------- */ var root = document.getElementById('root'); var progLabel = document.getElementById('progLabel'); var qprog = document.getElementById('qprog'); var qprogFill = document.getElementById('qprogFill'); function setRoot(html){ root.innerHTML=html; } function updateProgress(){ if(!SESSION) return; var idx=SESSION.idx, total=SESSION.queue.length; if(total===0) return; var pct=Math.round((idx/total)*100); progLabel.textContent = 'Question '+(idx+1)+' of '+total; qprog.hidden=false; qprogFill.style.width=pct+'%'; } /* ---- app state transitions ---------------------------------------------------- */ function showSetup(){ SESSION=null; progLabel.textContent=''; qprog.hidden=true; setRoot(renderSetup()); bindSetup(); } function bindSetup(){ var catSel=document.getElementById('f-cat'); var diffSel=document.getElementById('f-diff'); var sizeSel=document.getElementById('f-size'); var countEl=document.getElementById('itemCount'); var startBtn=document.getElementById('startBtn'); var redoMissesBtn=document.getElementById('redoMissesBtn'); var certWrongBtn=document.getElementById('certWrongBtn'); var dueBtn=document.getElementById('dueBtn'); function updateCount(){ var cat=catSel?catSel.value:'all', diff=diffSel?diffSel.value:'all'; var n = activeItems().filter(function(it){ if(cat!=='all'&&it.category!==cat) return false; if(diff!=='all'&&String(it.difficulty)!==diff) return false; return true; }).length; var size=sizeSel?sizeSel.value:'20'; var showing = (size==='all')?n:Math.min(n,parseInt(size,10)||20); if(countEl) countEl.textContent=(showing===n?n:showing+' of '+n)+' question'+(n!==1?'s':'')+' match'; if(startBtn) startBtn.disabled=(n===0); } if(catSel) catSel.addEventListener('change',updateCount); if(diffSel) diffSel.addEventListener('change',updateCount); if(sizeSel) sizeSel.addEventListener('change',updateCount); updateCount(); if(startBtn) startBtn.addEventListener('click',function(){ var cat=catSel?catSel.value:'all'; var diff=diffSel?diffSel.value:'all'; var size=sizeSel?sizeSel.value:'20'; startSession(cat,diff,size); }); if(redoMissesBtn) redoMissesBtn.addEventListener('click',function(){ startSessionWithQueue(missedItems()); }); if(certWrongBtn) certWrongBtn.addEventListener('click',function(){ startSessionWithQueue(certWrongItems()); }); /* Deliberately NOT startSessionWithQueue: due cards keep most-overdue-first order rather than being shuffled — the schedule is the point of this focus mode. */ if(dueBtn) dueBtn.addEventListener('click',function(){ beginSession(dueQbItems()); }); /* Draft opt-in (WP-37). Persist, then re-render the whole setup so every count (pool size, match count, focus-mode buttons) reflects the new pool; refocus the toggle so keyboard users are not dropped at the top of the re-rendered screen. */ var draftToggle=document.getElementById('draftToggle'); if(draftToggle) draftToggle.addEventListener('change',function(){ setIncludeDrafts(draftToggle.checked); showSetup(); var t=document.getElementById('draftToggle'); if(t) t.focus(); }); } function startSession(catFilter, diffFilter, sizeLimit){ /* Due cards matching the same filters serve FIRST (most-overdue first, unshuffled — priority order is the point); the shuffled fresh selection fills the remainder of the size limit. A due card never appears twice in one queue. */ var due = dueQbItems().filter(function(it){ if(catFilter!=='all' && it.category!==catFilter) return false; if(diffFilter!=='all' && String(it.difficulty)!==diffFilter) return false; return true; }); var cap = (sizeLimit==='all') ? Infinity : (parseInt(sizeLimit,10)||20); due = due.slice(0, cap===Infinity ? due.length : cap); var dueIds = {}; due.forEach(function(it){ dueIds[it.id]=1; }); var rest = buildQueue(activeItems().filter(function(it){ return !dueIds[it.id]; }), catFilter, diffFilter, 'all'); if(cap!==Infinity) rest = rest.slice(0, Math.max(0, cap-due.length)); beginSession(due.concat(rest)); } /* Focus-mode entry point: starts the exact queue passed in (shuffled), bypassing the category/difficulty/size filters entirely. */ function startSessionWithQueue(queue){ beginSession(shuffle(queue)); } function beginSession(queue){ if(!queue.length){ setRoot('<div class=
- >No questions match the selected filters. '); return; } SESSION = { queue: queue, idx: 0, responses: [], confidence: null, tier1Key: null, displayOrder: [], tier2DisplayOrder: [], state: 'conf' /* conf | tier2 | feedback */ }; showQuestion(); } function showReviewItem(item){ SESSION = { queue:[item], idx:0, responses:[], confidence:null, tier1Key:null, displayOrder:[], tier2DisplayOrder:[], state:'conf', reviewOnly:true }; showQuestion(); postReviewItemStatus('ready'); } /* ---- session capsule (cw_sess_v1) — question-boundary checkpoint + resume -------- Written ONLY from advance(), and only when there is a next question to show — never mid-question. showQuestion() resets confidence/tier1Key/state/displayOrder/ tier2DisplayOrder on every entry (the option shuffles aren't reconstructable), so a mid-question restore would be structurally broken and is not attempted; the checkpoint is deleted instead, in showSummary(), on session completion. Never written for a reviewOnly (faculty-preview) session. Grading state is never duplicated here — qbRecord()/srsUpdate() already persist each answer per-interaction (commitResponse); the capsule stores position + session bookkeeping only, so a resumed showSummary() covers the WHOLE session without a second write against the SM-2 stats contract. */ function checkpointSession(){ if(!SESSION || SESSION.reviewOnly) return; var now = Date.now(); sessSave('qbank', { at: now, expiresAt: now + DAY, queueIds: SESSION.queue.map(function(it){ return it.id; }), idx: SESSION.idx, responses: SESSION.responses.map(function(r){ return { id: r.item.id, correct: r.correct, confidence: r.confidence }; }) }); } /* Resume path for ?resume=1. Rebuilds the queue from the capsule's queueIds filtered through activeItems() — an id removed or retired by a deploy between checkpoint and resume is silently dropped rather than crashing the restore (queueIds order is preserved). idx is RE-DERIVED by counting how many of the front (pre-checkpoint) queueIds survive that same filter, rather than trusted verbatim: trusting the stored idx directly would silently skip a still-unanswered question whenever a deploy retires/removes an item positioned BEFORE the checkpointed idx (the raw idx overshoots once the queue is filtered shorter). This exploits the invariant that responses.length === idx at every checkpoint — advance() checkpoints immediately after commitResponse() pushes a response, and this app has no skip-without-answering path, so counting surviving front ids gives the correct new position. Reconstructed responses are built from that identical surviving-front-id set, so the resumed summary population can never disagree with the resumed queue position. Absent/expired capsule (sessLoad owns load-validate-expire) or an empty resulting queue falls through to a normal setup start. Returns true iff a session was actually resumed. */ function tryResumeSession(){ var cap = sessLoad('qbank', Date.now()); if(!cap || !cap.queueIds || !cap.queueIds.length) return false; var idMap = {}; activeItems().forEach(function(it){ idMap[it.id]=it; }); var queue = cap.queueIds.map(function(id){ return idMap[id]; }).filter(Boolean); if(!queue.length) return false; var capIdx = (typeof cap.idx==='number' && cap.idx>=0) ? cap.idx : 0; var survivingFrontIds = cap.queueIds.slice(0, capIdx).filter(function(id){ return !!idMap[id]; }); var idx = survivingFrontIds.length; var respById = {}; (cap.responses||[]).forEach(function(r){ respById[r.id]=r; }); var responses = survivingFrontIds.map(function(id){ var r = respById[id]; if(!r) return null; return { item: idMap[id], key: null, tier2Key: null, confidence: r.confidence, correct: r.correct, twoTierResult: null, ts: cap.at }; }).filter(Boolean); SESSION = { queue: queue, idx: idx, responses: responses, confidence: null, tier1Key: null, displayOrder: [], tier2DisplayOrder: [], state: 'conf' }; showQuestion(); return true; } function showQuestion(){ if(!SESSION || SESSION.idx >= SESSION.queue.length){ showSummary(); return; } SESSION.confidence = null; SESSION.tier1Key = null; SESSION.state = 'conf'; SESSION.displayOrder = []; SESSION.tier2DisplayOrder = []; updateProgress(); var item = SESSION.queue[SESSION.idx]; setRoot(renderQuestion(item)); bindQuestion(item); } function bindQuestion(item){ /* confidence buttons */ var confBtns = root.querySelectorAll('.conf-btn'); var confHint = document.getElementById('confHint'); confBtns.forEach(function(btn){ btn.addEventListener('click',function(){ if(SESSION.state!=='conf') return; confBtns.forEach(function(b){ b.classList.remove('on'); }); btn.classList.add('on'); SESSION.confidence = btn.getAttribute('data-conf'); if(confHint) confHint.classList.remove('show'); }); }); /* tier1 option buttons */ var optBtns = root.querySelectorAll('#optsList .opt'); optBtns.forEach(function(btn){ btn.addEventListener('click',function(){ if(SESSION.state!=='conf') return; if(!SESSION.confidence){ if(confHint) confHint.classList.add('show'); /* briefly shake the confidence section */ var cs=root.querySelector('.conf-section'); if(cs){ cs.style.outline='2px solid var(--danger)'; cs.style.borderRadius='8px'; setTimeout(function(){cs.style.outline='';cs.style.borderRadius='';},600); } return; } var key = btn.getAttribute('data-key'); onTier1Answer(item, key); }); }); } function onTier1Answer(item, key){ SESSION.tier1Key = key; var isCorrect = item.options.some(function(o){ return o.key===key && o.c; }); /* lock tier1 options and highlight */ var optBtns = root.querySelectorAll('#optsList .opt'); optBtns.forEach(function(btn){ btn.disabled = true; btn.classList.add('locked'); var k = btn.getAttribute('data-key'); if(k===key && isCorrect) btn.classList.add('selected-correct'); else if(k===key && !isCorrect) btn.classList.add('selected-wrong'); else if(item.options.some(function(o){return o.key===k&&o.c;})) btn.classList.add('correct-reveal'); }); /* lock confidence buttons */ root.querySelectorAll('.conf-btn').forEach(function(b){ b.disabled=true; }); if(item.type==='two-tier' && isCorrect){ /* show tier2 before feedback */ SESSION.state = 'tier2'; var qcard = root.querySelector('.qcard'); if(qcard){ var t2html = renderTier2(item); qcard.insertAdjacentHTML('beforeend', t2html); bindTier2(item); } } else { /* for wrong tier1 on two-tier, still show tier2 (spec:
- ) */ if(item.type==='two-tier' && !isCorrect){ SESSION.state = 'tier2'; var qcard2 = root.querySelector('.qcard'); if(qcard2){ var t2html2 = renderTier2(item); qcard2.insertAdjacentHTML('beforeend', t2html2); bindTier2(item); } } else { /* sba / relational: show feedback directly */ SESSION.state = 'feedback'; var twoTierResult = null; commitResponse(item, key, null, SESSION.confidence, isCorrect, twoTierResult); showFeedback(item, key, null, SESSION.confidence, isCorrect, null); } } } function bindTier2(item){ var t2Btns = root.querySelectorAll('#tier2Opts .opt'); t2Btns.forEach(function(btn){ btn.addEventListener('click',function(){ if(SESSION.state!=='tier2') return; var tier2Key = btn.getAttribute('data-tier2key'); onTier2Answer(item, tier2Key); }); }); } function onTier2Answer(item, tier2Key){ SESSION.state = 'feedback'; var tier1Key = SESSION.tier1Key; var tier1Correct = item.options.some(function(o){ return o.key===tier1Key && o.c; }); var tier2Correct = item.tier2.options.some(function(o){ return o.key===tier2Key && o.c; }); /* lock tier2 options + highlight */ var t2Btns = root.querySelectorAll('#tier2Opts .opt'); t2Btns.forEach(function(btn){ btn.disabled=true; btn.classList.add('locked'); var k=btn.getAttribute('data-tier2key'); if(k===tier2Key && tier2Correct) btn.classList.add('selected-correct'); else if(k===tier2Key && !tier2Correct) btn.classList.add('selected-wrong'); else if(item.tier2.options.some(function(o){return o.key===k&&o.c;})) btn.classList.add('correct-reveal'); }); /* scoring: both right = correct; right answer/wrong reason = shaky; wrong tier1 = wrong */ var correct, twoTierResult; if(!tier1Correct){ correct=false; twoTierResult='wrong'; } else if(tier2Correct){ correct=true; twoTierResult='both_right'; } else { correct=true; twoTierResult='shaky'; /* right answer, wrong reason — cap at Hard */ } commitResponse(item, tier1Key, tier2Key, SESSION.confidence, correct, twoTierResult); showFeedback(item, tier1Key, tier2Key, SESSION.confidence, correct, twoTierResult); } function commitResponse(item, key, tier2Key, confidence, correct, twoTierResult){ if(SESSION && SESSION.reviewOnly){ SESSION.responses.push({ item:item, key:key, tier2Key:tier2Key, confidence:confidence, correct:correct, twoTierResult:twoTierResult, ts:Date.now() }); return; } var rec = qbRecord(item, key, tier2Key, confidence, correct, twoTierResult); srsUpdate(item, confidence, correct, twoTierResult); SESSION.responses.push({ item: item, key: key, tier2Key: tier2Key, confidence: confidence, correct: correct, twoTierResult: twoTierResult, ts: rec.ts }); } function showFeedback(item, key, tier2Key, confidence, correct, twoTierResult){ var fbHtml = getFeedbackHtml(item, key, tier2Key, confidence, correct, twoTierResult); var qcard = root.querySelector('.qcard'); if(qcard){ /* remove any tier2 section first if it already exists */ var existing = qcard.querySelector('.feedback'); if(existing) existing.parentNode.removeChild(existing); qcard.insertAdjacentHTML('beforeend', fbHtml); var _live=document.getElementById('qb-live'); if(_live){ _live.textContent = (twoTierResult==='shaky'?'Right answer, shaky reasoning. ':correct?'Correct. ':'Incorrect. ') + (item.pearl||''); } /* scroll feedback into view */ var fb = document.getElementById('feedbackPanel'); if(fb) setTimeout(function(){ fb.scrollIntoView({behavior:'smooth',block:'nearest'}); },80); } if(SESSION && SESSION.reviewOnly) return; /* bind spa nav links */ root.querySelectorAll('.fb-link[data-spa-nav=
- ]').forEach(function(a){ a.addEventListener('click',function(ev){ ev.preventDefault(); var href=a.getAttribute('href')||''; try{ window.parent.postMessage({type:'openPage',f:decodeURIComponent(href.replace(/^\?(?:page|tool)=/,''))},'*'); } catch(_){ window.location.href=href; } }); }); /* next button */ var nextBtn = document.getElementById('nextBtn'); if(nextBtn) nextBtn.addEventListener('click', advance); } function advance(){ if(!SESSION) return; SESSION.idx++; /* Checkpoint at this question boundary only when there is a next question to resume into — completion is handled by showSummary()'s sessClear instead. */ if(SESSION.idx < SESSION.queue.length) checkpointSession(); showQuestion(); } function showSummary(){ /* Session complete (or a resume landed exactly at the end) — clear the capsule so a stale slot never lingers past its own session. Never touched for reviewOnly, which never reaches this function via advance() (no Next button is rendered for a faculty-preview session — see getFeedbackHtml/showFeedback). */ if(!(SESSION && SESSION.reviewOnly)) sessClear('qbank'); progLabel.textContent='Session complete'; qprog.hidden=false; qprogFill.style.width='100%'; setRoot(renderSummary()); var moreBtn=document.getElementById('practiceMoreBtn'); if(moreBtn) moreBtn.addEventListener('click',showSetup); /*
- is the receipt's own button (data-cw-receipt-home); the receipt snippet routes it through the shell's openPage message, exactly as goHomeBtn used to. */ } /* ---- init --------------------------------------------------------------------- */ (function init(){ /* try relative path (built: /tools/question-bank-practice.html → /question_bank.json) */ fetch('../question_bank.json') .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }) .then(function(data){ BANK = data; if(REVIEW_CONTEXT){ var reviewItem = (data.items || []).find(function(item){ return item && item.id === REVIEW_CONTEXT.reviewItem && item.retired !== true; }); if(!reviewItem){ root.innerHTML = '<div class=
- > This question is not present on the current deployment '; postReviewItemStatus('not_found'); return; } showReviewItem(reviewItem); return; } if(RESUME_REQUESTED && tryResumeSession()) return; if(BLOCK_REQUEST){ var _blockCat = (BLOCK_REQUEST.cat!=='all' && CAT_LABELS[BLOCK_REQUEST.cat]) ? BLOCK_REQUEST.cat : 'all'; startSession(_blockCat, 'all', String(BLOCK_REQUEST.n)); if(SESSION){ SESSION.catLabel = _blockCat==='all' ? '' : (CAT_LABELS[_blockCat]||''); SESSION.fromBlock = true; } return; } showSetup(); /* adaptive engine handoff: home may set cw_qb_focus to a blueprint category so the learner lands in their weakest area with the filter preselected. */ try{ var _focus=localStorage.getItem('cw_qb_focus'); if(_focus){ localStorage.removeItem('cw_qb_focus'); var _cs=document.getElementById('f-cat'); if(_cs){ for(var _i=0;_i<_cs.options.length;_i++){ if(_cs.options[_i].value===_focus){ _cs.value=_focus; break; } } var _cnt=document.getElementById('itemCount'), _n=activeItems().filter(function(it){return it.category===_focus;}).length; if(_cnt) _cnt.textContent=_n+' question'+(_n!==1?'s':'')+' match'; } } }catch(_){ } }) .catch(function(err){ root.innerHTML='<div class=
- >' +' Could not load question bank. ' +'question_bank.json was not found alongside this tool. ' +'Make sure the build ran successfully and question_bank.json is at the site root.' +' <small style=
- ); }); /* handle filter count updates before bank loads */ root.addEventListener(
- ,function(ev){ var t=ev.target; if(t&&(t.id===
- )){ var catSel=document.getElementById(
- ); if(!BANK||!countEl) return; var cat=catSel?catSel.value:
- ; var n=activeItems().filter(function(it){ return (cat===
- ||String(it.difficulty)===diff); }).length; var size=sizeSel?sizeSel.value:
- )?n:Math.min(n,parseInt(size,10)||20); countEl.textContent=(showing===n?n:showing+
- ; } }); /* dark mode sync from parent SPA */ window.addEventListener(
- ,function(ev){ var d=ev.data||{}; if(d.type===
- )){ document.documentElement.setAttribute(
- ,d.mode); try{localStorage.setItem(
- ,d.mode);}catch(_){} } }); try{ var t=localStorage.getItem(
- ) document.documentElement.setAttribute(

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

**Authored clinical strings (111):**

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
- s parameters; ordinary practice leaves a saved block alone. Pure apart from those two writes: returns {html, marked, next}. Copy is audience-neutral (no MS3/clerkship/student/shelf/resident tokens) because it ships to both sites. Navigation inside a tool iframe goes through the shell
- > Session receipt '; if(s.context) h+=' '+cwReceiptEsc(s.context)+' '; h+=' '; if(s.headline) h+='<h2 class=
- >'+cwReceiptEsc(s.headline)+' '; if(s.sub) h+='<p class=
- >'+cwReceiptEsc(s.sub)+' '; var stats=s.stats||[]; if(stats.length){ h+='<div class=
- >'; for(i=0;i<stats.length;i++){ var st=stats[i]||{}, tone=st.tone==='warn'?' is-warn':(st.tone==='good'?' is-good':''); h+='<div class=
- >'+cwReceiptEsc(st.label)+' <span class=
- >'+cwReceiptEsc(st.value)+' '; } h+=' '; } var reread=s.reread||[]; if(reread.length){ h+='<div class=
- >Worth a second look '; for(i=0;i<reread.length;i++){ var r=reread[i]||{}; h+='<div class=
- >'; if(r.tag) h+='<span class=
- >'+cwReceiptEsc(r.tag)+' '; h+='<span style=
- >'+cwReceiptEsc(r.title)+' '; if(r.note) h+='<span class=
- >'+cwReceiptEsc(r.note)+' '; if(r.ref) h+='<a class=
- data-cw-receipt-next data-cw-receipt-ref=
- >Re-read: '+cwReceiptEsc(r.refTitle||r.ref)+' → '; h+=' '; } } if(marked){ var practiceWeek=cwReceiptPracticeWeek(); h+='<div class=
- >✓ '+(practiceWeek?'Week '+practiceWeek+' practice recorded:':'Activity recorded:')+' '+cwReceiptEsc(s.refTitle||s.ref)+'. '; } h+='<div class=
- >'; var next=progress&&progress.next; if(next){ var route=cwReceiptStepRoute(next); h+='<button type=
- >Next in your block: '+cwReceiptEsc(next.title)+(next.min?' ~'+cwReceiptEsc(next.min)+' min ':'')+' '; }else{ var acts=s.actions||[]; for(i=0;i<acts.length;i++){ var a=acts[i]||{}; h+='<button type=
- ':'')+'>'+cwReceiptEsc(a.label)+' '; } } h+='<button type=
- data-cw-receipt-home'+(s.homeId?' id=
- ':'')+'>Back to Today '; if(progress){ h+='<span class=
- >'+(next?('Block · '+progress.done+' of '+progress.total+' done'):('Block complete · '+progress.total+' of '+progress.total+' done'))+' '; if(!next&&typeof blockClear==='function') blockClear(); } h+=' '; return {html:h, marked:marked, next:next||null}; } /* Family retrieval prompts — the one definition of what a FAM# card ASKS and what it reveals. Injected via the shared-snippet marker into BOTH consumers: family-systems-practice.html, which authors these cards and grades them beside their scenario, and review.html, which serves the due ones in the daily queue. It has to be shared rather than copied because the card id embeds the prompt id (famCardId) — two drifting copies of this list would file one schedule under a prompt the learner never saw, which is exactly the silent id-collision failure the repo's storage rule warns about. Reveal content is always the scenario's own authored text — its opening line or one of its authored sections. This file introduces no clinical wording of its own, so nothing here needs faculty attestation that family_systems_scenarios.json has not already had. Pure: no DOM, no storage, no clock, no escaping (each consumer escapes for its own renderer). ES5 only, matching the other injected snippets. */ var FAM_DEFAULT_RETRIEVAL=[ {id:'opening',prompt:'Say your opening line for this family out loud.',revealFrom:'opening'}, {id:'ask',prompt:'Name the collateral questions you would ask — out loud or on scratch.',revealFrom:'ask'}, {id:'avoid',prompt:'Name the trap here: what would you deliberately NOT do?',revealFrom:'avoid'}, {id:'handoff',prompt:'Say the rounds handoff for this family — what must it separate?',revealFrom:'handoff'}, {id:'safety',prompt:'When do you stop ordinary information-gathering and escalate — and to whom?',revealFrom:'safety'} ]; /* The card id both tools schedule under. Scenario id and prompt id are joined with the same separator the QB#/TOPIC# namespaces use, so srsBucket keeps reading FAM# as the family bucket. */ function famCardId(scenarioId,promptId){return 'FAM#'+scenarioId+'#'+promptId;} /* What a prompt reveals: an explicit revealText when the scenario authors one, else the scenario's opening line, else the named section. null means the scenario cannot answer this prompt, and famRetrievalFor drops it rather than showing an empty panel. */ function famRevealContent(it,rp){ if(!it||!rp)return null; if(rp.revealText)return rp.revealText; if(rp.revealFrom==='opening')return it.opening||null; var sec=(it.sections||{})[rp.revealFrom]; return (sec&&sec.length)?sec:null; } /* The prompts a given scenario actually supports, in authored order. A scenario may carry its own `retrieval` array to override the defaults wholesale. */ function famRetrievalFor(it){ if(!it)return []; if(Object.prototype.toString.call(it.retrieval)==='[object Array]'&&it.retrieval.length)return it.retrieval; var out=[],i; for(i=0;i<FAM_DEFAULT_RETRIEVAL.length;i++){ if(famRevealContent(it,FAM_DEFAULT_RETRIEVAL[i])!=null) out.push(FAM_DEFAULT_RETRIEVAL[i]); } return out; } /* Readable label for a content ref (
- ). Shared by the topic-card titles and the receipt's re-read links so one page never gets two spellings. */ function prettyRef(k){ return String(k||
- ).replace(/\b\w/g,function(c){return c.toUpperCase();}); } /* Family retrieval cards for the daily queue — the third card source, after the landmark decks and the per-topic quizzes. One card per authored prompt per scenario, under the SAME ids family-systems-practice.html writes (famCardId, injected above), so a prompt graded in either place moves one schedule rather than two. The reveal text is the scenario's own authored content; nothing clinical originates here. These cards are why the queue needed a second shape: a family prompt has no options to pick, so it is answered aloud and then self-rated against the model. See card.kind below. */ function famRecallCards(data){ var list=(data&&data.scenarios)||[], out=[], i, j; if(Object.prototype.toString.call(list)!=='[object Array]') return out; for(i=0;i<list.length;i++){ var it=list[i]; if(!it||!it.id) continue; var prompts=famRetrievalFor(it); for(j=0;j<prompts.length;j++){ var rp=prompts[j]; if(!rp||!rp.id||!rp.prompt) continue; var reveal=famRevealContent(it,rp); if(reveal==null) continue; out.push({ id:famCardId(it.id,rp.id), deck:
- +(it.title||it.id), kind:
- , seededOnly:true, q:rp.prompt, reveal:reveal, page:(it.linkedPages&&it.linkedPages[0])||null }); } } return out; } /* Which cards this tool may put in front of a learner. A card marked `seededOnly` qualifies only once it already has a schedule — i.e. the learner has met it in the tool that authored it. That is deliberate on both ends: the due row counts DUE cards, which by definition already have a schedule, so serving exactly those closes the counted-but-never-served gap; and every seededOnly card is written to be answered with its own tool's context on screen (a family prompt beside its scenario, a reasoning step beside its patient brief), not sprung cold as a new card here. So this page reviews what the tools taught; it never introduces. The flag is per-card and not per-kind: the family cards are `recall` and the communication and reasoning cards are `choice`, but all three are seeded by their own tool. Decks and topic quizzes carry no flag and remain the only sources feeding the daily new-card allowance. */ function queueable(card, cardState){ return !card || !card.seededOnly || !!cardState; } /* Map a tool's authored choices onto the queue's option shape. Both tools grade an option by `quality` rather than a boolean, so `best` becomes the correct answer and the option's own feedback becomes its explanation. Rejecting anything but exactly one `best` is the point of the guard, not a formality: correctIdx() takes the FIRST option flagged correct, so a case authored with two bests would score a learner who picked the second one wrong, and one authored with none would mark every answer wrong. Returning null drops that case from the queue instead — the tools themselves still teach it, and the schema validators still see it. */ function choiceOptions(choices){ var arr=(Object.prototype.toString.call(choices)==='[object Array]')?choices:[], out=[], best=0, i; for(i=0;i<arr.length;i++){ var ch=arr[i]; if(!ch||typeof ch.text!=='string'||!ch.text) return null; var isBest=(ch.quality==='best'); if(isBest) best++; out.push({t:ch.text, c:isBest, fb:typeof ch.feedback==='string'?ch.feedback:
- }); } return (out.length>1&&best===1)?out:null; } /* Communication cards — one per case, under the SAME ids communication-practice.html writes. The case prompt is self-contained (it quotes the patient), so it needs no stem. What the review cannot reproduce is that tool's twenty-second spoken rep before the choices appear; this is recognition practice on a line the learner has already tried to say. */ function commChoiceCards(data){ var list=(data&&data.cases)||[], out=[], i; if(Object.prototype.toString.call(list)!=='[object Array]') return out; for(i=0;i<list.length;i++){ var c=list[i]; if(!c||!c.id||!c.prompt) continue; var opts=choiceOptions(c.choices); if(!opts) continue; out.push({ id:
- , seededOnly:true, q:c.prompt, o:opts, stem:c.setting||null }); } return out; } /* Reasoning cards — one per STEP, under the same ids diagnostic-reasoning.html writes. A case's steps test different moves and a learner can be solid on one and lost on the next, so they schedule separately. The patient brief rides along as the card's stem because it is NOT optional context: a step asks things like
- , which is unanswerable without the case. In the tool the brief is on screen throughout; a step without it here would be a different, harder, and unfair question. A step whose case has no brief is dropped rather than served bare. */ function reasonChoiceCards(data){ var list=(data&&data.cases)||[], out=[], i, j; if(Object.prototype.toString.call(list)!=='[object Array]') return out; for(i=0;i<list.length;i++){ var c=list[i]; if(!c||!c.id||!c.patientBrief) continue; var steps=(Object.prototype.toString.call(c.steps)==='[object Array]')?c.steps:[]; for(j=0;j<steps.length;j++){ var st=steps[j]; if(!st||!st.id||!st.prompt) continue; var opts=choiceOptions(st.choices); if(!opts) continue; out.push({ id:
- +(st.title||st.id), kind:
- , seededOnly:true, q:st.prompt, o:opts, stem:c.patientBrief }); } } return out; } /* A reveal is either the scenario's opening line (a string) or one of its authored sections (a list). Rendered as text, never as markup. */ function revealNodes(reveal){ if(typeof reveal==='string') return e(
- }, reveal); var arr=(Object.prototype.toString.call(reveal)==='[object Array]')?reveal:[]; return e(
- }, arr.map(function(x,i){ return e(
- ,{key:i}, x); })); } /* effectiveNewPerDay: the single helper BOTH the metrics() display and start()'s queue-build call — patching only one leaves the other unthrottled. An explicit learner choice (setNewPerDay, which sets settings.userSet) always wins over the rotation-phase cap; phasePolicy() itself never throws, but the try/catch keeps this helper safe even if that contract ever changes. */ function effectiveNewPerDay(s){ var set=(s.settings&&s.settings.newPerDay)||12; if(s.settings&&s.settings.userSet) return set; /* explicit choice always wins */ var cap=12; try{ cap=phasePolicy().newPerDayCap; }catch(_){ } return Math.min(set, cap); } var gradedThisSession={}; // session-local: has card.id already been graded once this session? (a requeued Again-card's 2nd grade sets calibLog's rq flag). Reset in start(). function maturity(st){if(!st||!st.reps)return
- ;} function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;} /* ---------- theme ---------- */ function toggleTheme(setTheme){var nx=document.documentElement.getAttribute(
- ,nx);}catch(_){ } setTheme(nx); if(framed){try{window.parent.postMessage({type:
- );}catch(_){ }}} function App(){ var ld=useState(null),cards=ld[0],setCards=ld[1]; var er=useState(false),err=er[0],setErr=er[1]; var sv=useState(loadS()),store=sv[0],setStore=sv[1]; var ses=useState(null),sess=ses[0],setSess=ses[1]; // {queue,pos,chosen,revealed,reviewed,correct,fresh} var th=useState((document.documentElement.getAttribute(
- ),theme=th[0],setTheme=th[1]; var tick=useState(0),setTick=tick[1]; var sessRef=useRef(null); sessRef.current=sess; var blockAutoStart=useRef(null), blockLimit=useRef(null); useEffect(function(){ if(cards&&blockAutoStart.current&&!sess){ blockLimit.current=blockAutoStart.current; blockAutoStart.current=null; start(false); } },[cards]); useEffect(function(){ Promise.all([ fetch(
- ).then(function(r){return r.ok?r.json():{decks:[]};}).catch(function(){return {decks:[]};}), fetch(
- ).then(function(r){return r.ok?r.json():{};}).catch(function(){return {};}), fetch(
- ).then(function(r){return r.ok?r.json():{scenarios:[]};}).catch(function(){return {scenarios:[]};}), fetch(
- ).then(function(r){return r.ok?r.json():{cases:[]};}).catch(function(){return {cases:[]};}), /* the res build overwrites this file with reasoning_cases_resident.json, so one path serves the right audience without the page knowing which site it is on */ fetch(
- ).then(function(r){return r.ok?r.json():{cases:[]};}).catch(function(){return {cases:[]};}) ]).then(function(res){ /* One builder per source, concatenated into the single queue. A source that fails to load contributes nothing and the rest still runs; another source later is a builder plus a fetch. Order matters only for which cards a same-due-time tie serves first — the queue is sorted by due date below. */ var j=res[0]||{}, tm=res[1]||{}, fam=res[2]||{}, comm=res[3]||{}, reason=res[4]||{}, out=[]; (j.decks||[]).forEach(function(d){ (d.questions||[]).forEach(function(q,i){ if(!q||!q.q||!q.o)return; out.push({id:d.id+
- ,q:q.q,o:q.o,audio:d.audio||null,audioDur:d.audioDur||null}); }); }); Object.keys(tm).forEach(function(k){ if(k.charAt(0)===
- )return; var m=tm[k]; if(m&&m.quiz&&m.quiz.q&&m.quiz.o&&m.quiz.o.length){ out.push({id:
- ,q:m.quiz.q,o:m.quiz.o.map(function(o){return {t:o.t,c:!!o.c,fb:(o.c?(m.quiz.why||
- )};})}); } }); out=out.concat(famRecallCards(fam)); out=out.concat(commChoiceCards(comm)); out=out.concat(reasonChoiceCards(reason)); if(!out.length){ setErr(true); return; } setCards(out); /* ?block=1&limit=N — a timed block step from Today starts straight into a bounded session. */ try{ var bp=new URLSearchParams(location.search); if(bp.get(
- ){ var lim=parseInt(bp.get(
- ,10); blockAutoStart.current=(lim>=1&&lim<=50)?lim:5; } }catch(_){ } }).catch(function(){setErr(true);}); },[]); useEffect(function(){ function onMsg(ev){var d=ev.data||{};if(d.type===
- ,d.mode);setTheme(d.mode);}} window.addEventListener(
- ,onMsg); return function(){window.removeEventListener(
- ,onMsg);}; },[]); useEffect(function(){ function onKey(ev){ var s=sessRef.current; if(!s||!s.card)return; var k=ev.key; if(!s.revealed){ if(s.card.kind==='recall'){ if(k===
- )revealCard(); } else { var n=parseInt(k,10); if(s.card.o&&n>=1&&n<=s.card.o.length){choose(optOrder(s.card)[n-1]);} } } else { if(k===
- )grade(3); } } window.addEventListener(
- ,onKey); return function(){window.removeEventListener(
- ,onKey);}; },[]); function persist(s){saveS(s);setStore(Object.assign({},s));} /* dashboard metrics */ function metrics(){ var now=Date.now(),due=0,neu=0,learn=0,young=0,mature=0,seen=0; if(cards){ var s=rollDay(loadS()); cards.forEach(function(c){var st=s.cards[c.id]; if(!queueable(c,st))return; if(!st){neu++;return;} seen++; var m=maturity(st); if(m===
- )young++; else learn++; if(st.due =1); if(fromBlock&&limit Again or Hard only; the buttons disable to match, and this guard also covers the keyboard shortcuts (keys 3/4). A recall card has no objective outcome — the learner is rating their own answer against the model — so all four grades stand and the grade itself is what
- means. */ if(!isRecall && g>1 && s.chosen!==correctIdx(s.card)) return; var st=loadS(); st=rollDay(st); var card=s.card; var existed=!!st.cards[card.id]; var was=st.cards[card.id]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0}; st.cards[card.id]=applyGrade(was,GRADE_NAMES[g],{fuzzKey:card.id}); if(!existed){ st.day.newToday=(st.day.newToday||0)+1; } bumpStreak(st); st.stats.totalReviews=(st.stats.totalReviews||0)+1; var ci=correctIdx(card); var gotIt=isRecall?(g>=2):(s.chosen===ci); st.stats.seen=(st.stats.seen||0)+1; if(gotIt)st.stats.correct=(st.stats.correct||0)+1; saveS(st); setStore(Object.assign({},st)); var rq=gradedThisSession[card.id]?1:0; gradedThisSession[card.id]=1; calibLog({s:'rev',id:card.id,p:GRADE_NAMES[g]||g,sug:sug,a:gotIt?1:0,rq:rq,ts:Date.now()}); // advance queue var q=s.queue.slice(); var pos=s.pos; if(g===0){ q.push(card); } // requeue lapses to end of this session var nextPos=pos+1; var reviewed=s.reviewed+1, correct=s.correct+(gotIt?1:0); var misses=(s.misses||[]).slice(); if(!gotIt&&!misses.some(function(m){return m.id===card.id;})) misses.push({id:card.id,deckTitle:card.deckTitle,q:card.q,page:card.page||null}); if(nextPos>=q.length){ setSess({finished:true,reviewed:reviewed,correct:correct,misses:misses,fromBlock:!!s.fromBlock}); return; } setSess({queue:q,pos:nextPos,card:q[nextPos],chosen:-1,revealed:false,reviewed:reviewed,correct:correct,total:s.total,misses:misses,fromBlock:!!s.fromBlock}); } function endSession(){ setSess(null); setTick(function(x){return x+1;}); } function setNewPerDay(v){ var s=loadS(); s.settings.newPerDay=v; s.settings.userSet=true; persist(s); } function resetAll(){ if(!window.confirm(
- ))return; try{localStorage.removeItem(KEY);}catch(_){ } calibClear(); setStore(freshStore()); setSess(null); setTick(function(x){return x+1;}); } var head=e(
- )); /* ---- active session ---- */ if(sess && sess.queue){ var c=sess.card, isRecall=(c.kind==='recall'); var ci=correctIdx(c), pctp=Math.round(100*sess.pos/Math.max(1,sess.total)); var gotIt=(!isRecall&&sess.chosen===ci); /* single source of truth: feeds the 'sug' className below AND grade()'s calibLog event via closure. A recall card suggests nothing — there is no outcome to suggest from. */ var sug=isRecall?'':(gotIt?'Good':'Again'); var fbOpt=(!isRecall&&c.o[sess.chosen])||{}; var corrOpt=(!isRecall&&c.o[ci])||{}; var isNew=!loadS().cards[c.id]; return e(
- }}, c.deckTitle.length>42?c.deckTitle.slice(0,40)+
- +sess.total)), /* Context the card cannot be answered without (a reasoning case's patient brief). Rendered above the question and visually subordinate to it, so the eye still lands on what is being asked. Text only — never markup. */ c.stem? e(
- })) : null, isRecall ? (sess.revealed ? e(
- ), revealNodes(c.reveal)) : e(
- }, optOrder(c).map(function(oi,pos){ var o=c.o[oi]; var cls=
- ; if(sess.revealed){ if(oi===ci)cls+=
- ; else if(oi===sess.chosen)cls+=
- ,{key:oi,className:cls,disabled:sess.revealed,onClick:function(){choose(oi);}}, e(
- }, String.fromCharCode(65+pos)), e(
- ,null,o.t)); })), (!isRecall&&sess.revealed)? e(
- ), (fbOpt.fb||corrOpt.fb||
- }, sess.revealed ? (isRecall ?
- )) ))); } /* ---- session finished / empty ---- */ if(sess && sess.finished){ var rt=sess.reviewed?Math.round(100*sess.correct/sess.reviewed):0; var missed=(sess.misses||[]).length; if(!sess.receipt){ /* Built once per finished session: cwReceipt writes (block step, never a page here) and must not re-run on every re-render of this screen. */ sess.receipt=cwReceipt({ tool:'review', ref:null, blockKind:sess.fromBlock?'review':null, context: sess.reviewed+
- , headline: missed? (missed===1?
- }], reread:(sess.misses||[]).slice(0,5).map(function(m){ var topic=/^TOPIC#/.test(m.id)?m.id.slice(6):null; var ref=topic||m.page||null; return {tag:
- ,warn:true,title:m.q,note:m.deckTitle,ref:ref,refTitle:ref?prettyRef(ref):null}; }), actions:[{id:
- ,primary:true}] }); } return e(
- ,onClick:function(ev){ var t=ev.target&&ev.target.closest?ev.target.closest(
- ):null; if(t){ ev.preventDefault(); endSession(); } }, dangerouslySetInnerHTML:{__html:sess.receipt.html}}))); } if(sess && sess.empty){ return e(
- )))); } /* ---- dashboard ---- */ var m=metrics(); var pp=phasePolicy(); var canStart=(m.due+m.newRemain)>0; return e(
- ,disabled:!canStart,onClick:function(){start(false);}}, canStart?(
- ,min:5,max:30,step:1,value:store.settings.newPerDay||12,onChange:function(ev){setNewPerDay(+ev.target.value);}}), e(
- ,null,store.settings.newPerDay||12)), e(
- ) ); } ReactDOM.createRoot(document.getElementById(

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

**Authored clinical strings (91):**

- Strong — exam-ready range.
- Solid — tighten the misses.
- Passing range — keep drilling.
- Psychopharm & Med Emergencies
- t label a draft mid-block without breaking the simulation, so the conservative subset is the attested 142. Categories map onto the existing BLUEPRINT topic regexes. */ var CAT_TOPIC={mood:"Mood",psychosis:"Psychosis",anxiety:"Anxiety, OCD & Trauma",substance:"Substance Use",pharm:"Psychopharm & Med Emergencies",neurocog:"Delirium, Dementia & MCI",personality:"Personality",childdev:"Child & Adolescent",otherdx:"Somatic & Related",safety:"Psychiatric Emergencies",ethics:"Interview, Ethics & Law",relational:"Relational & Family"}; function bankPool(data){ var out=[]; (((data&&data.items)||[])).forEach(function(it){ if(it.status!=="attested") return; if(!it.stem||!Array.isArray(it.options)||it.options.length<2) return; var hasCorrect=false; it.options.forEach(function(op){ if(op&&op.c)hasCorrect=true; }); if(!hasCorrect) return; /* Options are shuffled ONCE here (bank storage order is authoring order — the draft pool is known to lean on first-position answers) and letters relabel automatically because every render site derives them from array index (KEYS[i]). Correct option explains via the item
- s own primary (spec.actions) beside "Back to Today"; 3. marks the tool
- s parameters; ordinary practice leaves a saved block alone. Pure apart from those two writes: returns {html, marked, next}. Copy is audience-neutral (no MS3/clerkship/student/shelf/resident tokens) because it ships to both sites. Navigation inside a tool iframe goes through the shell
- > Session receipt '; if(s.context) h+=' '+cwReceiptEsc(s.context)+' '; h+=' '; if(s.headline) h+='<h2 class=
- >'+cwReceiptEsc(s.headline)+' '; if(s.sub) h+='<p class=
- >'+cwReceiptEsc(s.sub)+' '; var stats=s.stats||[]; if(stats.length){ h+='<div class=
- >'; for(i=0;i<stats.length;i++){ var st=stats[i]||{}, tone=st.tone==='warn'?' is-warn':(st.tone==='good'?' is-good':''); h+='<div class=
- >'+cwReceiptEsc(st.label)+' <span class=
- >'+cwReceiptEsc(st.value)+' '; } h+=' '; } var reread=s.reread||[]; if(reread.length){ h+='<div class=
- >Worth a second look '; for(i=0;i<reread.length;i++){ var r=reread[i]||{}; h+='<div class=
- >'; if(r.tag) h+='<span class=
- >'+cwReceiptEsc(r.tag)+' '; h+='<span style=
- >'+cwReceiptEsc(r.title)+' '; if(r.note) h+='<span class=
- >'+cwReceiptEsc(r.note)+' '; if(r.ref) h+='<a class=
- data-cw-receipt-next data-cw-receipt-ref=
- >Re-read: '+cwReceiptEsc(r.refTitle||r.ref)+' → '; h+=' '; } } if(marked){ var practiceWeek=cwReceiptPracticeWeek(); h+='<div class=
- >✓ '+(practiceWeek?'Week '+practiceWeek+' practice recorded:':'Activity recorded:')+' '+cwReceiptEsc(s.refTitle||s.ref)+'. '; } h+='<div class=
- >'; var next=progress&&progress.next; if(next){ var route=cwReceiptStepRoute(next); h+='<button type=
- >Next in your block: '+cwReceiptEsc(next.title)+(next.min?' ~'+cwReceiptEsc(next.min)+' min ':'')+' '; }else{ var acts=s.actions||[]; for(i=0;i<acts.length;i++){ var a=acts[i]||{}; h+='<button type=
- ':'')+'>'+cwReceiptEsc(a.label)+' '; } } h+='<button type=
- data-cw-receipt-home'+(s.homeId?' id=
- ':'')+'>Back to Today '; if(progress){ h+='<span class=
- >'+(next?('Block · '+progress.done+' of '+progress.total+' done'):('Block complete · '+progress.total+' of '+progress.total+' done'))+' '; if(!next&&typeof blockClear==='function') blockClear(); } h+=' '; return {html:h, marked:marked, next:next||null}; } function refHref(ref){ if(!ref) return null; return /\.html(\?|#|$)/.test(ref)? (
- +encodeURIComponent(ref)); } function correctIdx(o){for(var i=0;i<o.length;i++){if(o[i]&&o[i].c)return i;}return -1;} // ---- Sample preview items (original, classic teaching points). Only used when no SHELF-* decks exist yet. // Clearly labeled as preview; NOT scored content for assessment until the faculty-reviewed bank lands. var SAMPLE=[ {topic:
- } ]; function App(){ var d=useState(null),data=d[0],setData=d[1]; var er=useState(null),err=er[0],setErr=er[1]; var S=useState({view:
- ,timed:true,topics:[], items:[],picks:[],flags:{},idx:0,secs:0,total:0,result:null,saved:false,preview:false,revFilter:
- }); var st=S[0],setS=S[1]; function set(p){setS(function(prev){return Object.assign({},prev,p);});} useEffect(function(){ fetch(
- ).then(function(r){return r.json()}).then(setData).catch(function(){setErr(
- );}); },[]); // derive pool + topics once data lands var pool=[], preview=false, topicsAll=[]; if(data){ pool=bankPool(data); if(pool.length===0){ pool=SAMPLE.slice(); preview=true; } var seen={}; pool.forEach(function(it){seen[it.topic]=(seen[it.topic]||0)+1;}); topicsAll=Object.keys(seen).sort(function(a,b){return orderRank(a)-orderRank(b);}).map(function(t){return {t:t,n:seen[t]};}); } // default-select all topics on first data load useEffect(function(){ if(data && st.topics.length===0 && topicsAll.length){ set({topics:topicsAll.map(function(x){return x.t;}), preview:preview}); } },[data]); // exam timer useEffect(function(){ if(st.view!==
- ) return; var id=setInterval(function(){ setS(function(p){ if(p.view!==
- ) return p; if(p.timed){ if(p.secs<=1){ return grade(Object.assign({},p,{secs:0})); } return Object.assign({},p,{secs:p.secs-1}); } return Object.assign({},p,{secs:p.secs+1}); }); },1000); return function(){clearInterval(id);}; },[st.view,st.timed]); // persist a finished attempt useEffect(function(){ if(st.view===
- && !st.saved && st.result){ try{var L=loadLS(); L.attempts=(L.attempts||[]); L.attempts.unshift({at:new Date().toISOString().slice(0,10),n:st.result.n,correct:st.result.correct, pct:st.result.pct,mode:st.mode,timed:st.timed,secs:st.result.secs,preview:st.preview}); L.attempts=L.attempts.slice(0,20); localStorage.setItem(LS,JSON.stringify(L));}catch(_){} set({saved:true}); } },[st.view,st.saved]); // keyboard: 1-5 choose, Enter advance useEffect(function(){ if(st.view!==
- ) return; function onKey(ev){ var q=st.items[st.idx]; if(!q) return; if(ev.key>=
- && ev.key<=String(Math.min(9,q.o.length))){ choose(parseInt(ev.key,10)-1); } else if(ev.key===
- ){ if(canAdvance()) advance(); } } window.addEventListener(
- ,onKey); return function(){window.removeEventListener(
- ,onKey);}; }); function startExam(){ var items=buildExam(pool, st.topics, st.len, st.diff); if(!items.length) return; set({view:
- ,items:items,picks:items.map(function(){return null;}),flags:{},idx:0, secs: st.timed? items.length*PER_Q : 0, total:items.length*PER_Q, result:null, saved:false, preview:preview}); } function choose(oi){ setS(function(p){ var q=p.items[p.idx]; if(!q||oi>=q.o.length) return p; if(p.mode===
- && p.picks[p.idx]!=null) return p; // locked after answering in tutor mode var picks=p.picks.slice(); picks[p.idx]=oi; return Object.assign({},p,{picks:picks}); }); } function canAdvance(){ if(st.mode===
- ) return st.picks[st.idx]!=null; return true; } function advance(){ setS(function(p){ if(p.idx+1 0?Object.assign({},p,{idx:p.idx-1}):p;}); } function toggleFlag(){ setS(function(p){var f=Object.assign({},p.flags);f[p.idx]=!f[p.idx];return Object.assign({},p,{flags:f});}); } function grade(p){ var correct=0, byTopic={}; p.items.forEach(function(q,i){ var ci=correctIdx(q.o), ok=(p.picks[i]===ci && ci>=0); if(ok) correct++; var bt=byTopic[q.topic]=byTopic[q.topic]||{c:0,n:0}; bt.n++; if(ok)bt.c++; }); var secsUsed = p.timed? (p.total-p.secs) : p.secs; var res={n:p.items.length,correct:correct,pct:Math.round(100*correct/Math.max(1,p.items.length)),byTopic:byTopic,secs:secsUsed}; return Object.assign({},p,{view:
- ,result:res}); } // Persistent, unconditional live region: same DOM node across every view (config/exam/result), // so a screen reader binds to it once and hears only the CONTENT change when a result lands. var resultMsg = (st.view===
- && st.result) ? resultMsgFor(st.result.pct) :
- && st.result) ? (st.result.correct+
- },err)); if(!data) return e(
- )); // ---------------- CONFIG ---------------- if(st.view===
- ){ var L=loadLS(); var recent=(L.attempts||[]).slice(0,3); var avail=pool.filter(function(it){ var dd=normDiff(it.diff); if(dd===
- )return false; if(st.diff!==
- &&dd!==st.diff)return false; return st.topics.indexOf(it.topic)>=0; }).length; var lens=[10,20,40].filter(function(n){return true;}); return e(
- t load, so this is running on a small set of sample items so you can see how it works. Reload when you
- }, lens.map(function(n){ return e(
- ,onClick:function(){set({len:n})}}, n+
- ]].map(function(p){ return e(
- ,onClick:function(){set({diff:p[0]})}}, p[1]); })) ), e(
- ,{onClick:function(){set({topics:topicsAll.map(function(x){return x.t;})})}},
- }}, topicsAll.map(function(x){ var on=st.topics.indexOf(x.t)>=0; return e(
- ),onClick:function(){ var t=st.topics.slice(),i=t.indexOf(x.t); if(i>=0)t.splice(i,1); else t.push(x.t); set({topics:t}); }}, e(
- +Math.min(st.len,avail)), e(
- }, recent.map(function(r,i){ return e(
- ) ); } // ---------------- RESULT ---------------- if(st.view===
- ){ var R=st.result, msg=resultMsg; var bts=Object.keys(R.byTopic).sort(function(a,b){return orderRank(a)-orderRank(b);}); var revItems=st.items.map(function(q,i){return {q:q,i:i};}).filter(function(x){ if(st.revFilter===
- ) return true; var ci=correctIdx(x.q.o); return st.picks[x.i]!==ci; }); if(!st.receipt){ var missedItems=st.items.map(function(q,i){return {q:q,i:i};}).filter(function(x){ var ci=correctIdx(x.q.o); return st.picks[x.i]!==ci; }); var weakTopic=null; bts.forEach(function(t){ var b=R.byTopic[t]; var pc=b.c/Math.max(1,b.n); if(b.n>=2&&(weakTopic===null||pc<weakTopic.pc)) weakTopic={t:t,pc:pc}; }); st.receipt=cwReceipt({ tool:'shelf', ref:null, blockKind:null, context: R.n+
- +fmt(R.secs), headline: R.correct+
- +msg) : msg, stats:[{label:
- }], reread: missedItems.slice(0,5).map(function(x){ var ref=x.q.ref&&!/\.html/.test(x.q.ref)?x.q.ref:null; return {tag:x.q.topic||
- ):null}; }), actions:[{id:
- ,primary:true}] }); } return e(
- ,{onClick:function(ev){ var t=ev.target&&ev.target.closest?ev.target.closest(
- ):null; if(t){ ev.preventDefault(); set({view:
- ,saved:false}); } },dangerouslySetInnerHTML:{__html:st.receipt.html}}), e(
- ,null, bts.map(function(t){ var b=R.byTopic[t], p=Math.round(100*b.c/Math.max(1,b.n)); return e(
- ) ) ), revItems.length? revItems.map(function(x){ var q=x.q, ci=correctIdx(q.o), pick=st.picks[x.i]; return e(
- +q.o[ci].t), (pick!=null && pick!==ci)? e(
- +q.o[pick].t) : (pick==null? e(
- ) ); } // ---------------- EXAM ---------------- var q=st.items[st.idx], pick=st.picks[st.idx], ci=correctIdx(q.o); var revealed = (st.mode===
- && pick!=null); var answeredCount = st.picks.filter(function(p){return p!=null;}).length; var low = st.timed && st.secs<=Math.max(30, st.total*0.1); return e(
- )}, st.timed? fmt(st.secs) : fmt(st.secs)+
- +normDiff(q.diff)}), normDiff(q.diff)===
- }, q.o.map(function(o,oi){ var cls=
- ; if(revealed){ if(oi===ci) cls+=
- ; else if(oi===pick) cls+=
- ; } else if(oi===pick) cls+=
- ,{key:oi,className:cls,disabled:revealed,onClick:function(){choose(oi)}}, e(
- ,null,o.t), revealed&&o.fb? e(
- },o.fb):null)); })), revealed? e(
- ,onClick:toggleFlag}, st.flags[st.idx]?
- ,disabled:!canAdvance(),onClick:advance}, st.idx+1<st.items.length?
- ) ); } ReactDOM.createRoot(document.getElementById(

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
- **Length:** 996 words

#### Page text (as shipped)

# Rapid Review — Buzzwords & One-Liners


**How to use this.** A dense, night-before recall sheet: the classic association on the left, the answer and next move on the right. It is a *recall* tool, not a substitute for the topic pages — each line points back to where the reasoning lives. Confirm any dose or threshold against the primary page and institutional references before acting.

## Mood
- Depression ≥2 weeks, ≥5 SIGECAPS incl. mood or anhedonia → **major depressive episode** → SSRI + therapy. *(→ Mood)*
- Manic ≥1 week (or any duration if hospitalized), elevated/irritable + DIGFAST → **bipolar I** → mood stabilizer/SGA; **antidepressant monotherapy contraindicated**. *(→ Mood)*
- Antidepressant "works" but patient becomes activated/grandiose → uncovered **bipolar** → screen for bipolarity before any antidepressant.
- Severe, psychotic, catatonic, food-refusing, or high suicide risk → **ECT** (and preferred over drugs when that patient is pregnant). *(→ ECT)*
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
