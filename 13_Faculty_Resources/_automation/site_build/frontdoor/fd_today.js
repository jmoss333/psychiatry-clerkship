/* Today -- "What should I do now?" (one-thread redesign, Phase 1, 2026-10-04).

   Order, top to bottom (docs/superpowers/specs/one-thread-handoff/README.md, Screens §1):
     0. the active-testing line (owner decision D1: one row -- title · Details · Share feedback)
     1. place: eyebrow ("Week 2 of 6 · Thursday" + Change week), week-title H1, theme line
     2. the projected-week thread (.fd-thread) -- one node per week, each routing to that week on Path
     3. the Now card (.fd-now) -- ONE shell for every primary kind
     4. "Also today" -- the device-store rows that did not win, as flat rows with a status mark
     5. the preparation chooser (fdTodayPurpose; the shell owns its open state)
     6. "This week" -- the week's rows, with "N of M done" at the right
     7. "On the unit this week" -- derived from longitudinal_case.json, only where the tool ships
     8. the rail (desktop): Safety kit, Quick tools, Learning activity & review
   Removed from Today: the seven-day activity strip (D2 -- fdConsistency still renders, inside
   Learning activity & review), the daily pick (reachable from the Library), and the phone pills'
   order:-1 hoist.

   Both the desktop rail (.fd-rail) and the phone pill row (.fd-quicktools--pills) are ALWAYS
   emitted from the same quickTools list -- this file does not branch on a device/viewport flag.
   frontdoor.css ships the breakpoint that picks between them, so a single render is correct at
   any viewport and a live resize or tablet rotation needs no re-render. The same holds for the
   Learning activity & review link: once in the rail, once under the pills.

   Pure: no DOM, no browser storage, no reading the system clock directly. "Now" arrives as
   state.nowMs so the day name and the exam countdown are testable without depending on when the
   test happens to run -- see tests/fd-today.test.mjs. Injected via /*__FD_TODAY__*\/ (see
   SNIPPET_MARKERS in common.py). ES5 only: var/function, no const/let/arrow functions/template
   literals -- matches the other frontdoor/ modules.

   ---- Composition: what the shell hands in ----------------------------------------------------
   The device-store rows (the SRS due count, the question-bank capsule, the live timed block, the
   last opened reading, the capture list) read runtime stores this pure renderer cannot see. Until
   2026-10-04 the shell string-spliced them in at an HTML-comment marker after the lead card. That
   marker is gone: the shell (spa_index.html fdTodayLive) now resolves every runtime face and
   hands the RESULTS in on state, and this file composes the page in one place --
     state.primaryKind  which kind won (fdTodayPrimary); undefined keeps the pre-picker render
     state.nowHtml      the winning device-store face, when a device-store kind won
     state.alsoRows     [{mark, count, share, html}] the faces that did not win, in order
     state.purposeHtml  the preparation chooser (fdTodayPurpose, rendered by the shell)
     state.offlineHtml  the offline-readiness receipt
     state.statusHtml   a bare status line after the Also rows (the concept-count status, no due row)
     state.caseWeek     fdWeekCaseStep(...) -- this week's step of the longitudinal case, or null
   -- which is the same contract state.offlineHtml already used. Every field is optional, so a
   fixture that passes none of them renders Today exactly as a learner with empty stores sees it.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. The exam countdown comes verbatim from
   fdExamCountdown() (fd_state.js) rather than being reworded here, so this file never spells
   "Exam" itself. */

var FD_TODAY_DAYNAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* Pure progress arithmetic, split out because it is what the Now card's meta line, the "N of M
   done" label and the week-complete state all read -- three surfaces that must never disagree. */
function fdTodayProgress(items, doneMap){
  var done=0, next=null, d=doneMap||{}, list=items||[];
  for(var i=0;i<list.length;i++){
    if(d[list[i].ref]===true) done++;
    else if(!next) next=list[i];
  }
  return { done: done, total: list.length, pct: list.length?Math.round(done*100/list.length):0, next: next };
}

/* ---- One Thing First: the priority rule (2026-09-16) -------------------------------------
   Today shows exactly one primary action. fdTodayPrimary picks it as the first true row of
   FD_TODAY_PRIMARY_ORDER, top-down, from plain inputs the shell already derives (the question
   bank capsule, the live timed block, the SRS due count, this week's progress, the last opened
   item). Pure: no store, no clock -- the shell resolves every input, this file only ranks.

   The order is ONE array on purpose. Assumption A1 in the handoff -- "unfinished outranks
   reviews due" -- was approved on a preview, not answered directly; reversing it is a swap of
   two entries here plus the expected column of the picker table in tests/fd-today.test.mjs,
   and nothing else moves.

   Kinds: resume (a capsule with questions left), block (a live block with a next step), read
   (cw_last names an undone read in this week that is not already the Continue target), due
   (reviews due), week (Continue the week), ahead (week complete: look ahead), setup (no week).
   The first three are one row in the learner-facing rule ("Pick up where you left off"); they
   stay distinct here because each renders a different face inside the one Now-card shell. */
var FD_TODAY_PRIMARY_ORDER=['resume','block','read','due','week','ahead','setup'];

/* The four kinds whose face the SHELL renders (fd_due.js / fd_block.js over runtime stores) and
   hands in as state.nowHtml. The other three (week, ahead, setup) are this file's own lead card. */
var FD_TODAY_DEVICE_KINDS=['resume','block','read','due'];

function fdTodayPrimaryHolds(kind, inp){
  var wp=inp.weekProgress||{};
  if(kind==='resume') return typeof inp.capsuleLeft==='number'&&inp.capsuleLeft>0;
  if(kind==='block') return !!inp.blockNext;
  if(kind==='read'){
    var lr=inp.lastRead;
    return !!lr&&lr.kind==='read'&&lr.done!==true&&lr.isContinueTarget!==true;
  }
  if(kind==='due') return typeof inp.dueTotal==='number'&&inp.dueTotal>0;
  if(kind==='week') return inp.hasWeek===true&&!!wp.next;
  if(kind==='ahead') return inp.hasWeek===true&&typeof wp.total==='number'&&wp.total>0&&wp.done===wp.total;
  if(kind==='setup') return inp.hasWeek!==true;
  return false;
}

function fdTodayPrimary(inputs){
  var inp=inputs||{};
  for(var i=0;i<FD_TODAY_PRIMARY_ORDER.length;i++){
    if(fdTodayPrimaryHolds(FD_TODAY_PRIMARY_ORDER[i], inp)) return {kind:FD_TODAY_PRIMARY_ORDER[i]};
  }
  /* A week with no items: nothing is next and nothing is complete. Continue is still the honest
     lead -- it previews the next week. */
  return {kind:'week'};
}

/* Resolves the last opened ref against THIS week's items. Null when it is not a week item (a
   library read, a tool from the rail, nothing opened yet): the row is about picking the week
   back up, not a general history. done and isContinueTarget ride along so the picker's "read"
   row and the shell's Also-today list read one object. */
function fdTodayLastRead(ref, weekItems, progress, doneMap){
  if(typeof ref!=='string'||!ref) return null;
  var list=weekItems||[], d=doneMap||{}, it=null;
  for(var i=0;i<list.length;i++){ if(list[i]&&list[i].ref===ref){ it=list[i]; break; } }
  if(!it) return null;
  var target=(progress&&progress.next)?progress.next.ref:null;
  return {ref:it.ref, kind:it.kind, title:it.title, minutes:it.minutes,
    done:d[it.ref]===true, isContinueTarget:target===it.ref};
}

/* The type chip, shared by the row and the Continue card. A reading is the default kind, so it
   carries no chip -- its minutes say enough, and a "read" pill on every row was noise (2026-10-01
   design pass). Only the exceptions are labelled: a tool, and a rights reference, which is
   kind 'tool' but reads "reference". */
function fdKindChip(it){
  if(!it||it.kind!=='tool') return '';
  return '<span class="fd-chip is-tool">'+(it.rights?'reference':'tool')+'</span>';
}

/* Shared week-item row -- CLASS-INVENTORY's Shared Components section (.fd-row, .fd-check,
   .fd-chip, ...). The checkmark glyph is ALWAYS emitted; .fd-check's CSS toggles its colour
   (transparent vs filled) rather than the markup toggling the glyph itself, so a screenshot at
   any state still has the character to colour.

   ---- Why the glyph is aria-hidden and the state lives on the button --------------------------
   Same treatment, same reasoning as fd_sheet.js:157-176, which this row must not diverge from.
   Emitting the character in both states is right visually and a lie when announced: a screen
   reader reads it regardless of colour, so an UNDONE row announced as "✓ Page A" tells the user
   an item is finished when it is not, and the only thing distinguishing the two states was
   colour -- WCAG 1.4.1 and 4.1.2 both. So the glyph is decoration (aria-hidden="true") and the
   real state moves to aria-pressed on the button, which is the toggle. The glyph gains a bare
   wrapper span purely to have something to hang aria-hidden on -- it carries no class, so no rule
   matches it; .fd-check is display:flex and the character was already an anonymous flex item,
   which the span now simply names. The button keeps its accessible name from the title attribute
   it already had ("Mark done"), which the ✓ text content used to override.

   fd_path.js's detail card renders through this same function (compact=true), so Path inherits
   the fix rather than needing its own; tests/fd-path.test.mjs pins that it did.

   is-just-done is never applied here -- it is a transient "the user just clicked this" flag with
   no field in this renderer's state shape, and belongs to the DOM-side click handler, not this
   pure render. The row carries no per-row entrance delay any more (one-thread redesign: the
   stagger is removed from Today, and under prefers-reduced-motion there is no animation at
   all); idx stays in the signature so every caller and test is unchanged.

   compact is optional (falsy for every existing call site, so nothing else changes): fd_path.js's
   detail card uses the same row with the card treatment stripped (CLASS-INVENTORY's
   ".fd-row.is-compact"), and passes true rather than this file growing a second, drifting copy
   of the row markup. */
function fdRow(it, idx, doneMap, compact){
  var on=(doneMap||{})[it.ref]===true;
  var titleCls=on?'fd-row__title is-done':'fd-row__title';
  var checkCls=on?'fd-check is-done':'fd-check';
  /* A rights reference reads "reference": the page teaches administration and points at the
     official form. Calling it a tool is what sent a learner reaching for a scorer to a removal
     notice. The chip is the only thing that changes -- kind stays 'tool' so the page still loads
     from /tools/. */
  var minLabel=(it.kind!=='tool'&&typeof it.minutes==='number')?(it.minutes+' min'):'';
  var rowCls=compact?'fd-row is-compact':'fd-row';
  var editionMeta=fdEditionCoreMetaMarkup(it);
  /* The name carries the item and tracks the state, so nine toggles in a week list are nine
     distinct announcements ("Mark done: Interview & MSE") rather than "Mark done" nine times,
     and the name says what the NEXT press does rather than restating aria-pressed. */
  var toggleName=(on?'Mark undone: ':'Mark done: ')+it.title;
  return '<div class="'+rowCls+'">'+
    '<button type="button" class="'+checkCls+'" data-fd-toggle="'+fdEsc(it.ref)+'" '+
      'title="'+fdEsc(toggleName)+'" aria-pressed="'+(on?'true':'false')+'">'+
      '<span aria-hidden="true">✓</span></button>'+
    '<button type="button" class="fd-row__open" data-fd-open="'+fdEsc(it.ref)+'">'+
      '<span class="fd-row__content"><span class="'+titleCls+'">'+fdRowTitleMarkup(it.title)+'</span>'+editionMeta+'</span>'+
      '<span class="fd-row__meta">'+
        fdKindChip(it)+
        '<span class="fd-row__min">'+fdEsc(minLabel)+'</span>'+
      '</span>'+
    '</button>'+
  '</div>';
}

/* The Continue card. When the week is finished (progress.next is null but the week had items)
   the button re-targets to a preview of next week instead of an item, so it carries data-fd-tab
   + data-fd-view-week rather than data-fd-open. The view attribute is intentionally distinct from
   setup-only data-fd-week, so the two actions cannot collide. The next target comes from the
   projected path: its final week reviews itself rather than inventing another.

   Inside the Now card the whole card is the control, so its "one button" is a SPAN styled as the
   filled teal button (.fd-continue__cta) -- a <button> inside a <button> is invalid markup and the
   controller would see one click twice. The count and minutes-left line is the card's meta. */
function fdContinue(index, state, wk, progress, primary){
  /* primary===false demotes the card (a device-store row won Today's one primary slot);
     undefined means primary, so every caller and test that predates the picker renders exactly
     as before. */
  var isPrimary=primary!==false;
  var isComplete=progress.total>0&&progress.done===progress.total;
  var suggested=index.path&&index.path.id==='ms3-six-week';
  var kickerCls=isComplete?'fd-continue__kicker is-complete':'fd-continue__kicker';
  var kickerText=isComplete?('Week '+fdEsc(state.week)+(suggested?' activities complete':' complete')):('Continue · Week '+fdEsc(state.week));
  var titleText, openAttrs, chip='', dockLabel='Continue', ctaText='Continue →';
  if(progress.next){
    titleText=progress.next.title;
    openAttrs=' data-fd-open="'+fdEsc(progress.next.ref)+'"'+
      (progress.next.kind==='read'?' data-fd-reading-resume="1"':'');
    /* Same chip rule as fdRow: a rights reference reads "reference", never "tool". */
    chip=fdKindChip(progress.next);
  } else {
    var nextWeek=fdNextWeek(index,state.week);
    var target=nextWeek?nextWeek.n:state.week;
    titleText=(nextWeek?'Preview Week ':'Review Week ')+target;
    dockLabel=nextWeek?'Preview week':'Review week';
    ctaText=dockLabel+' →';
    openAttrs=' data-fd-tab="path" data-fd-view-week="'+fdEsc(target)+'"';
  }
  var done=fdProgressForWeek(index,state,state.week), leftMin=0;
  for(var i=0;i<wk.items.length;i++){
    if(done[wk.items[i].ref]!==true&&typeof wk.items[i].minutes==='number') leftMin+=wk.items[i].minutes;
  }
  var leftLabel=leftMin>0?('~'+leftMin+' min left'):'';
  /* The week as segments, one per activity, filled from the left as they are done (2026-10-01
     design pass). It replaces the "0%" ring: a percentage of a short list told the learner less
     than the list's own shape does. Decorative -- the count beside it is the accessible text. */
  var segs='';
  for(var s=0;s<progress.total;s++){
    segs+='<span class="fd-continue__seg'+(s<progress.done?' is-done':'')+'"></span>';
  }
  var out='<button type="button" class="'+(isPrimary?'fd-continue':'fd-continue is-secondary')+'"'+openAttrs+
    (isPrimary?' data-fd-dock-source="primary-'+(isComplete?'ahead':'week')+'" data-fd-dock-label="'+dockLabel+'"':'')+'>'+
    '<span class="fd-continue__body">'+
      '<span class="'+kickerCls+'">'+kickerText+'</span>'+
      '<span class="fd-continue__title">'+fdEsc(titleText)+chip+(isPrimary?'':' →')+'</span>'+
    '</span>'+
    (isPrimary?'<span class="fd-continue__cta" aria-hidden="true">'+fdEsc(ctaText)+'</span>':'')+
    '<span class="fd-continue__meta">'+
      '<span class="fd-continue__count">'+progress.done+' of '+progress.total+(suggested?' activities done':' done')+'</span>'+
      '<span class="fd-continue__left">'+leftLabel+'</span>'+
    '</span>'+
    (segs?'<span class="fd-continue__segs" aria-hidden="true">'+segs+'</span>':'')+
  '</button>';
  /* Week complete AND primary: the look-ahead card leads, and a learner with time left wants
     questions, not a preview. A sibling, never nested -- a button inside a button is invalid
     markup and the controller would see one click twice. */
  if(isComplete&&isPrimary){
    out+='<button type="button" class="fd-btn fd-btn--ghost fd-freshset" data-fd-open="question-bank-practice.html">Practice a fresh set →</button>';
  }
  return out;
}

/* The setup face of the Now card (no week set). Same kicker / title / button shape as every other
   face; the button is a span for the same reason as fdContinue's. */
function fdSetupCta(primary){
  return '<button type="button" class="fd-setupcta" data-fd-change-week'+
    (primary===false?'':' data-fd-dock-source="primary-setup" data-fd-dock-label="Set rotation week"')+'>'+
    '<span style="flex:1">'+
      '<span class="fd-setupcta__kicker">30-second setup</span>'+
      '<span class="fd-setupcta__title">Set your rotation week → get a real Today</span>'+
    '</span>'+
    '<span class="fd-setupcta__cta" aria-hidden="true">Set rotation week</span>'+
  '</button>';
}

/* .fd-quicktool is the same element in the rail and in the pill row (CLASS-INVENTORY's ⚠) --
   this is the one function that renders it, called from both branches in fdToday. */
/* A rail is ~250px wide, so a title with a subtitle after an em dash ("The Interview Room — AI
   Standardized Patient") always truncated mid-word. The rail shows the part before the dash; the
   full title stays on the button as its tooltip (2026-10-01 design pass). */
function fdQuickToolLabel(title){
  var t=String(title||''), cut=t.indexOf(' — ');
  return cut>0?t.slice(0,cut):t;
}

/* The same split for a week row's title, kept in the markup rather than cut: the subtitle sits in
   its own span that a phone hides visually (frontdoor.css, max-width 640px) but a screen reader
   still reads, so the row's name and textContent are the full title at every width. */
function fdRowTitleMarkup(title){
  var t=String(title||''), short=fdQuickToolLabel(t);
  return short===t?fdEsc(t):fdEsc(short)+'<span class="fd-row__sub">'+fdEsc(t.slice(short.length))+'</span>';
}

function fdQuickToolBtn(it){
  var label=fdQuickToolLabel(it.title);
  return '<button type="button" class="fd-quicktool" data-fd-open="'+fdEsc(it.ref)+'"'+
    (label!==it.title?' title="'+fdEsc(it.title)+'"':'')+'>'+
    '<span class="fd-quicktool__dot"></span>'+
    '<span class="fd-quicktool__label">'+fdEsc(label)+'</span>'+
  '</button>';
}

/* Kit cards open a protocol directly rather than the kit overview the header's Safety button
   opens, so data-fd-safety carries the item's ref as a payload here instead of standing bare the
   way it does on .fd-safetybtn -- same attribute, reused rather than inventing a second one. */
function fdKitCard(k){
  return '<button type="button" class="fd-kitcard" data-fd-safety="'+fdEsc(k.item.ref)+'">'+
    '<span style="flex:1;min-width:0">'+
      '<span class="fd-kitcard__title">'+fdEsc(k.item.title)+'</span>'+
      '<span class="fd-kitcard__sub">'+fdEsc(k.sub)+'</span>'+
    '</span>'+
  '</button>';
}

/* The Learning activity & review link. Emitted twice by fdToday -- once in the rail and once under
   the phone pills -- for the same CSS-decides reason as the quick tools; the two never render at
   the same width. */
function fdProgressAccess(){
  return '<button type="button" class="fd-progresscard" data-fd-progress>'+
    '<span class="fd-progresscard__title">Learning activity &amp; review</span>'+
    '<span class="fd-progresscard__meta">Coverage · blueprint · calibration →</span>'+
  '</button>';
}

/* Week-relevant tools first, then the rest of the library's tools (sorted by ref for
   determinism, matching fdLibraryOnlyReads' own tie-break) fill out to 5. The prototype pins two
   tools by an id this repo's data does not carry, so this is a re-derivation from the join index
   rather than a port of that exact list -- CLASS-INVENTORY's ×5 cap is what is actually
   contractual here, not the selection order past "this week's tools first". */
/* Rights references are excluded: Quick Tools is the reach-for-it-mid-shift rail, and a page
   whose purpose is to say the instrument is not reproduced here is the opposite of that. */
var FD_QUICKTOOLS_PREFERRED=['mse.html','capacity.html','withdrawal.html','violence.html','interaction-cards.html'];

function fdQuickTools(index, weekItems){
  var out=[], seen={}, i, ref;
  for(i=0;i<weekItems.length;i++){
    if(weekItems[i].kind==='tool'&&!weekItems[i].rights&&!seen[weekItems[i].ref]){ out.push(weekItems[i]); seen[weekItems[i].ref]=true; }
  }
  /* Fill to five from a short, fixed list of on-shift tools first (2026-09-26), then the rest by
     ref as before, so the fallback leads with bedside tools rather than with the alphabet. A ref a
     site does not ship is skipped, so one list serves both sites. */
  for(i=0;i<FD_QUICKTOOLS_PREFERRED.length&&out.length<5;i++){
    ref=FD_QUICKTOOLS_PREFERRED[i];
    var pick=index.byRef[ref];
    if(pick&&pick.kind==='tool'&&!pick.rights&&!pick.searchOnly&&!seen[ref]){ out.push(pick); seen[ref]=true; }
  }
  if(out.length<5){
    var all=[];
    for(ref in index.byRef){
      if(index.byRef[ref].kind==='tool'&&!index.byRef[ref].rights&&!index.byRef[ref].searchOnly) all.push(index.byRef[ref]);
    }
    all.sort(function(a,b){ return a.ref<b.ref?-1:(a.ref>b.ref?1:0); });
    for(i=0;i<all.length&&out.length<5;i++){
      if(!seen[all[i].ref]){ out.push(all[i]); seen[all[i].ref]=true; }
    }
  }
  return out.slice(0,5);
}

/* Seven-day activity strip. state.activityDays arrives pre-derived (fdActivityDays, fd_state.js:
   seven booleans, oldest first, ending today) so this stays a pure function of state + nowMs.
   Renders nothing until the learner has been active on at least one of the seven days: a fresh
   device gets no "0 of the last 7 days" line to be nagged by. The dots are decoration -- the
   sentence carries the meaning, so the wrapper is one image with the sentence as its name and
   the dot row is hidden from assistive tech (same treatment as the ✓ glyph in fdRow). Day
   letters are derived by walking back from nowMs with the local Date constructor, which keeps
   DST transitions from shifting a label.
   Owner decision D2 (2026-10-04): this no longer renders on Today. The shell mounts it at the top
   of Learning activity & review (spa_index.html fdProgressMarkup) instead, which is where the
   rest of the learner's own record already lives. */
function fdConsistency(activityDays, nowMs){
  var days=Object.prototype.toString.call(activityDays)==='[object Array]'?activityDays:[];
  if(days.length!==7) return '';
  var count=0, i;
  for(i=0;i<7;i++){ if(days[i]===true) count++; }
  if(count===0) return '';
  var base=new Date(nowMs), dots='';
  if(isNaN(base.getTime())) return '';
  for(i=0;i<7;i++){
    var d=new Date(base.getFullYear(), base.getMonth(), base.getDate()-(6-i));
    var letter=FD_TODAY_DAYNAMES[d.getDay()].charAt(0);
    dots+='<span class="fd-consistency__day">'+
      '<span class="fd-consistency__dot'+(days[i]===true?' is-on':'')+'"></span>'+
      '<span class="fd-consistency__label">'+letter+'</span>'+
    '</span>';
  }
  var text='Active '+count+' of the last 7 days';
  return '<div class="fd-consistency" role="img" aria-label="'+text+'">'+
    '<span class="fd-consistency__dots" aria-hidden="true">'+dots+'</span>'+
    '<span class="fd-consistency__text" aria-hidden="true">'+text+'</span>'+
  '</div>';
}

/* The active-testing line (owner decision D1, 2026-10-04): ONE row at the very top of Today --
   the existing title, a "Details" disclosure that reveals the existing sentence verbatim, and the
   existing "Share feedback" launcher. Copy and the no-PHI boundary are unchanged; nothing is
   removed, only folded. The pgfb-b class deliberately routes through the shell's existing private
   feedback launcher, while data-fb-context tells the form this came from Today rather than from
   a specific learning page. */
function fdPilotFeedback(){
  return '<section class="fd-pilot" aria-labelledby="fd-pilot-title">'+
    '<h2 class="fd-pilot__title" id="fd-pilot-title">This learning site is in active testing</h2>'+
    '<details class="fd-pilot__details"><summary class="fd-pilot__more">Details</summary>'+
      '<div class="fd-pilot__copy"><p>Use it alongside your official rotation materials and supervision. Tell us what helped, what was unclear, or what did not work.</p></div>'+
    '</details>'+
    '<button type="button" class="fd-pilot__button pgfb-b" data-fb-context="Today landing page">Share feedback</button>'+
  '</section>';
}

/* ---- The projected-week thread ----------------------------------------------------------------
   One node per projected week, in path order. A week is DONE only when every item in it is done
   for that week (fdProgressForWeek -- week-scoped, #949), never merely because it is in the past:
   the thread must not mark work complete that the learner has not done. The current week carries
   aria-current="step"; the node is a button that previews that week on Path through the same
   data-fd-tab + data-fd-view-week pair the completed Continue card already uses, so browsing the
   thread never changes the learner's week. Labels are the week titles; a phone shows only the
   current one (CSS). The connector after a done week is teal, otherwise the control line (CSS
   reads .is-done on the step). Renders nothing without a valid projected path. */
function fdThread(index, state){
  var idx=index||{}, st=state||{};
  if(!fdActivePathValid(idx)) return '';
  var weeks=idx.weeks, cur=(typeof st.week==='number'&&!isNaN(st.week))?st.week:null;
  var out='<nav class="fd-thread" aria-label="Rotation weeks"><ol class="fd-thread__list">';
  for(var i=0;i<weeks.length;i++){
    var w=weeks[i], items=fdItemsForWeek(idx,w.n);
    var p=fdTodayProgress(items,fdProgressForWeek(idx,st,w.n));
    var isDone=p.total>0&&p.done===p.total, isCur=cur===w.n;
    var cls='fd-thread__step'+(isDone?' is-done':'')+(isCur?' is-current':'');
    var name='Week '+w.n+': '+w.title+(isCur?' (current week)':(isDone?' (done)':''));
    out+='<li class="'+cls+'">'+
      '<button type="button" class="fd-thread__node" data-fd-tab="path" data-fd-view-week="'+fdEsc(w.n)+'"'+
        (isCur?' aria-current="step"':'')+' aria-label="'+fdEsc(name)+'">'+
        '<span class="fd-thread__mark" aria-hidden="true">'+(isDone?'✓':fdEsc(w.n))+'</span>'+
        '<span class="fd-thread__label" aria-hidden="true">'+fdEsc(w.title)+'</span>'+
      '</button></li>';
  }
  return out+'</ol></nav>';
}

/* ---- "On the unit this week" -----------------------------------------------------------------
   Pure derivation over longitudinal_case.json (read-only; the build inlines it as FD_CASE_ARC and
   the shell hands the parsed object in, so the section exists at first render). Returns this
   week's step of the longitudinal case, or null when the tool does not ship for the site, the week
   has no matching entry, or the data is not what the tool itself expects. Nothing here edits the
   case: the week title, learnerTask and handoff render verbatim, and the deep link is the tool's
   existing ?week=N. */
var FD_CASE_TOOL_REF='one-patient-six-weeks.html';

function fdWeekCaseStep(index, caseData, week){
  var tool=index&&index.byRef&&index.byRef[FD_CASE_TOOL_REF];
  if(!tool||tool.kind!=='tool') return null;
  if(typeof week!=='number'||isNaN(week)||week<1) return null;
  var weeks=caseData&&caseData.weeks;
  if(Object.prototype.toString.call(weeks)!=='[object Array]') return null;
  var w=weeks[week-1];
  if(!w||typeof w.title!=='string'||typeof w.learnerTask!=='string') return null;
  return {n:week, title:w.title, learnerTask:w.learnerTask,
    handoff:typeof w.handoff==='string'?w.handoff:'', ref:FD_CASE_TOOL_REF, governance:tool.governance};
}

function fdUnitWeek(step){
  if(!step) return '';
  var n=fdEsc(step.n);
  return '<section class="fd-unit" aria-labelledby="fd-unit-title">'+
    '<span class="fd-unit__line" aria-hidden="true"></span>'+
    '<div class="fd-unit__body">'+
      '<span class="fd-unit__kicker">On the unit this week · Case Journeys, week '+n+'</span>'+
      '<h2 class="fd-unit__title" id="fd-unit-title">'+fdEsc(step.title)+'</h2>'+
      governanceBadge(step.governance,{compact:true})+
      '<p class="fd-unit__task">'+fdEsc(step.learnerTask)+'</p>'+
      (step.handoff?'<p class="fd-unit__handoff"><strong>Carry it to rounds:</strong> '+fdEsc(step.handoff)+'</p>':'')+
      /* A real link, not a ref-only data-fd-open: the Front Door action drops query parameters,
         and the tool's week lives in ?week=N (same precedent as fdDueRow's lane link). */
      '<a class="fd-btn fd-btn--ghost fd-unit__open" href="?tool='+fdEsc(step.ref)+'&amp;week='+n+'">Open case week '+n+'</a>'+
    '</div></section>';
}

/* ---- "Also today": the device-store rows that did not win --------------------------------------
   Each row the shell hands in is wrapped with its status mark (spec "Status marks"): a due count in
   an olive ring, a partly filled teal ring for work in progress (share = the fraction done, as a
   custom property the CSS conic reads), a plain ring for not-started, "＋" for saved questions.
   The wrapper carries the mark; the face inside keeps its own markup (fd_due.js / fd_block.js)
   and frontdoor.css flattens it to a row under .fd-alsolist. */
function fdAlsoRow(row){
  var r=row||{}, mark=r.mark||'ring', attrs=' data-fd-mark="'+fdEsc(mark)+'"';
  if(typeof r.count==='number') attrs+=' data-fd-count="'+fdEsc(r.count)+'"';
  if(typeof r.share==='number') attrs+=' style="--mark-share:'+Math.max(0,Math.min(100,Math.round(r.share)))+'%"';
  return '<div class="fd-also__row"'+attrs+'>'+(r.html||'')+'</div>';
}

function fdToday(index, state){
  var st=state||{};
  var idx=index||{byRef:{}, weeks:[], columns:[], kit:[]};
  var nowMs=st.nowMs;
  var dayName=FD_TODAY_DAYNAMES[new Date(nowMs).getDay()];

  var wk=(typeof st.week==='number'&&!isNaN(st.week))?fdFindWeek(idx, st.week):null;
  var hasWeek=!!wk;
  var wItems=hasWeek?fdItemsForWeek(idx, st.week):[];
  var done=fdProgressForWeek(idx,st,st.week);
  var progress=fdTodayProgress(wItems, done);

  /* The heading is the week's theme-title, not a time-of-day greeting (2026-10-01): "Good evening"
     was the largest text on the page and told the learner nothing. Without a week it is "Today". */
  var heading=hasWeek?fdEsc(wk.title):'Today';
  var weekCount=(idx.weeks&&idx.weeks.length)||0;
  var sub=hasWeek
    ?('Week '+fdEsc(st.week)+(weekCount>=st.week?' of '+weekCount:'')+' · '+dayName)
    :(dayName+' · browsing — no week set');
  /* fdExamCountdown returns a bare fragment -- its separator dot included, its leading space NOT
     ('· exam in ~5 days'). The caller owns the join, so it must supply that space. Guarded rather
     than unconditional because the empty return is the common case, and ' '+'' would leave a
     trailing space on the eyebrow. fdPathExamCountdown is the audience gate in front of that
     arithmetic: no countdown on a path that does not end in an exam unless the learner stored a
     date (fd_state.js says why). */
  var countdown=fdPathExamCountdown(idx.path&&idx.path.id,st.week,idx.weeks,nowMs,st.rotationStart);
  if(countdown) sub+=' '+countdown;

  var out='<section class="fd-today">';
  /* 0. The active-testing line, at the very top on both sizes (D1). */
  out+=fdPilotFeedback();
  /* 1. Place. "Change week" reopens the existing week setup -- the same data-fd-change-week action
     the retired header pill dispatched, so focus restoration and the setupFrom:'app' Back path are
     unchanged. Only a learner WITH a week sees it; without one the Now card IS the setup action. */
  out+='<div class="fd-today__place">';
  /* No text space before the button: the eyebrow is a flex row and CSS owns the gap, so the text
     node stays exactly the joined sentence tests/fd-today.test.mjs reads. */
  out+='<p class="fd-today__sub">'+sub+
    (hasWeek?'<button type="button" class="fd-today__changeweek" data-fd-change-week>Change week</button>':'')+'</p>';
  out+='<h1 class="fd-today__h1">'+heading+'</h1>';
  if(hasWeek&&wk.theme) out+='<p class="fd-today__theme">'+fdEsc(wk.theme)+'</p>';
  out+='</div>';
  /* 2. The projected-week thread. */
  out+=fdThread(idx,st);

  out+='<div class="fd-today__cols"><div class="fd-today__main">';

  /* 3. The Now card. One Thing First: state.primaryKind arrives from the shell's picker. The lead
     card (Continue / setup) is primary unless a device-store row won; undefined keeps the
     pre-picker render. Exactly one .fd-now renders, and it is the first thing in the column, so
     the one filled teal button is first after the heading at every width. */
  var pk=st.primaryKind;
  var leadPrimary=(pk===undefined||pk==='week'||pk==='ahead'||pk==='setup');
  var leadHtml=hasWeek?fdContinue(idx,st, wk, progress, leadPrimary):fdSetupCta(leadPrimary);
  if(leadPrimary){
    var leadKind=hasWeek?((progress.total>0&&progress.done===progress.total)?'ahead':'week'):'setup';
    out+='<div class="fd-now fd-now--'+leadKind+'">'+leadHtml+'</div>';
  } else if(typeof st.nowHtml==='string'&&st.nowHtml){
    out+='<div class="fd-primary fd-now fd-now--'+fdEsc(pk)+'">'+st.nowHtml+'</div>';
  }
  if(st.offlineHtml)out+=st.offlineHtml;

  /* 4. Also today: the rows that did not win, in the shell's order, then -- when the lead lost --
     the week's own Continue as a flat row with a partly filled mark. The heading always renders:
     the preparation chooser sits under it even when no device-store row is waiting. */
  var rows=[], r;
  var shellRows=Object.prototype.toString.call(st.alsoRows)==='[object Array]'?st.alsoRows:[];
  for(r=0;r<shellRows.length;r++){ if(shellRows[r]&&shellRows[r].html) rows.push(fdAlsoRow(shellRows[r])); }
  if(!leadPrimary){
    var weekRow=fdAlsoRow({mark:hasWeek?'progress':'ring',share:hasWeek?progress.pct:0,html:leadHtml});
    /* Saved questions close the list (spec order: due · the week · saved questions), so the week
       row goes before a trailing capture row and after everything else. */
    var last=shellRows.length?shellRows[shellRows.length-1]:null;
    if(last&&last.mark==='plus') rows.splice(rows.length-1,0,weekRow); else rows.push(weekRow);
  }
  out+='<h2 class="fd-sectionhead fd-also">Also today</h2>';
  if(rows.length) out+='<div class="fd-alsolist">'+rows.join('')+'</div>';
  /* A bare status line the shell may hand in (the transient concept-count status when nothing is
     due); no row, no mark -- it comes and goes with a fetch. */
  if(st.statusHtml) out+=st.statusHtml;

  /* 5. The preparation chooser, open state owned by the shell. */
  if(st.purposeHtml) out+=st.purposeHtml;

  /* The exam-date nudge, below the Now card and the Also rows: One Thing First keeps its single
     primary action, and nothing here can push that card past the phone fold. The date has exactly
     one home, the settings panel's Pacing section (fd_sheet.js); this only nudges toward it, via
     the SAME data-fd-settings action the gear already exposes. fdExamDatePrompt (fd_state.js)
     decides whether to ask and names the field. */
  var examLabel=hasWeek?fdExamDatePrompt(idx.path&&idx.path.id,nowMs):'';
  if(examLabel){
    out+='<div class="fd-today__exam">'+
      '<p class="fd-today__examtext"><strong>'+fdEsc(examLabel)+'</strong> — set it once and Today paces your reviews toward it.</p>'+
      '<button type="button" class="fd-today__examcta" data-fd-settings>Set exam date</button></div>';
  }

  /* 6. This week, with "N of M done" at the right of the heading (the theme moved under the H1). */
  if(hasWeek){
    out+='<div class="fd-listhead"><h2 class="fd-sectionhead">'+(idx.path&&idx.path.id==='ms3-six-week'?'Suggested this week':'This week')+'</h2>'+
      '<span class="fd-listhead__count">'+progress.done+' of '+progress.total+' done</span></div>';
    out+='<div class="fd-list">';
    for(var i=0;i<wItems.length;i++){ out+=fdRow(wItems[i], i, done); }
    out+='</div>';
  }

  /* 7. On the unit this week -- only where the case tool ships and has this week. */
  if(hasWeek) out+=fdUnitWeek(st.caseWeek);

  var quickTools=fdQuickTools(idx, wItems);

  /* Phone pill row and desktop rail are both always emitted -- see the header comment. Same
     quickTools list feeds both, per the design's "both come from the same data". The pills follow
     the week (no order:-1 hoist any more), and the phone's Learning activity & review link sits
     under them. */
  out+='<div class="fd-quicktools--pills">';
  for(var q=0;q<quickTools.length;q++){ out+=fdQuickToolBtn(quickTools[q]); }
  out+='</div>';
  out+='<div class="fd-today__record">'+fdProgressAccess()+'</div>';

  out+='</div>'; /* .fd-today__main */

  /* 8. The rail. Safety kit first, Quick tools second: the rail order lines up with the header,
     where the red Safety button outranks the gear/search/tab controls -- so the rail reads as an
     extension of that button rather than a tools list with safety tacked on the end. */
  out+='<aside class="fd-rail">';
  /* One panel, one red rule, quiet rows (2026-10-01 design pass): five separately bordered red
     cards competed with each other, so none of them read as the one to grab. */
  out+='<div><h2 class="fd-sectionhead">Safety kit</h2><div class="fd-railkit">';
  for(var k=0;k<idx.kit.length;k++){ out+=fdKitCard(idx.kit[k]); }
  out+='</div></div>';
  out+='<div><h2 class="fd-sectionhead">Quick tools</h2>';
  for(var q2=0;q2<quickTools.length;q2++){ out+=fdQuickToolBtn(quickTools[q2]); }
  out+='</div>';
  out+=fdProgressAccess();
  out+='</aside>';

  out+='</div></section>'; /* .fd-today__cols, .fd-today */
  return out;
}


/* Optional session purpose shortcuts. The shell owns transient selection/disclosure state;
   this renderer neither stores the choice nor changes Today priority or the study plan. The
   Prepare-for-tomorrow invitation lives inside this chooser (one-thread redesign) rather than as a
   card of its own: it only exists on a site shipping the tool, and it is one more way of answering
   "what am I preparing for?". */
var FD_TODAY_PURPOSES=[
  {id:'rounds',label:'Before rounds',ref:'oral.html'},
  {id:'interview',label:'Interview',ref:'pg_interview.md'},
  {id:'family',label:'Family conversation',ref:'family_playbook.md'},
  {id:'study',label:'Study',ref:null}
];
function fdTodayPurposeOptions(index){
  var out=[], rows=(index&&index.byRef)||{};
  for(var i=0;i<FD_TODAY_PURPOSES.length;i++){
    var option=FD_TODAY_PURPOSES[i],item=option.ref?rows[option.ref]:null;
    if(option.ref&&(!item||item.rights||item.searchOnly))continue;
    out.push({id:option.id,label:option.label,ref:option.ref,title:item?item.title:'Use your study planner'});
  }
  return out;
}
function fdPrepareInvitation(index){
  var item=index&&index.byRef&&index.byRef['prepare-for-tomorrow.html'];
  if(!item||item.kind!=='tool') return '';
  return '<div class="fd-prepare">'+
    '<p class="fd-prepare__copy"><strong class="fd-prepare__title">'+fdEsc(item.title)+'</strong> · Choose a task and prepare in 5 or 15 minutes.</p>'+
    governanceBadge(item.governance,{compact:true})+
    '<button type="button" class="fd-btn fd-btn--ghost" data-fd-open="'+fdEsc(item.ref)+'">Choose tomorrow’s task</button></div>';
}
function fdTodayPurpose(index,id,isOpen){
  var options=fdTodayPurposeOptions(index),active=null,i;
  for(i=0;i<options.length;i++){if(options[i].id===id)active=options[i];}
  var h='<details class="fd-purpose"'+(isOpen?' open':'')+'>';
  h+='<summary class="fd-purpose__summary" data-today-purpose-toggle>What am I preparing for?</summary>';
  h+='<p class="fd-purpose__note">Optional. Your choice stays in this page session and resets on reload. Regular Today and your due-review plan stay unchanged.</p>';
  h+='<div class="fd-purpose__choices" role="group" aria-label="Preparation purpose">';
  for(i=0;i<options.length;i++){
    var o=options[i];
    h+='<button type="button" class="fd-btn fd-btn--ghost" data-today-purpose="'+o.id+'" aria-pressed="'+(active&&active.id===o.id?'true':'false')+'">'+fdEsc(o.label)+'</button>';
  }
  h+='<button type="button" class="fd-btn fd-btn--ghost" data-today-purpose="" aria-pressed="'+(!active?'true':'false')+'">Regular Today</button></div>';
  if(active){
    h+='<p class="fd-purpose__reason" role="status">Suggested because you chose '+fdEsc(active.label)+'.</p>';
    h+='<button type="button" class="fd-btn fd-btn--accent" '+(active.ref?'data-fd-open="'+fdEsc(active.ref)+'"':'data-today-planner')+'>'+fdEsc(active.title)+'</button>';
  }
  h+=fdPrepareInvitation(index);
  return h+'</details>';
}
