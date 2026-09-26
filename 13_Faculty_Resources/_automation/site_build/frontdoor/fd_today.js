/* Today -- greeting, Continue card + ring, this-week list, daily pick, and the quick-tools /
   safety-kit rail.

   Both the desktop rail (.fd-rail) and the mobile pill-chip row (.fd-quicktools--pills) for
   quick tools are ALWAYS emitted, unconditionally, from the same quickTools list -- this file
   does not branch on a device/viewport flag. frontdoor.css already ships the breakpoint that
   picks between them (display:none / display:flex swap at 1000px: frontdoor.css:270, 281-283,
   548-552), so letting CSS decide instead of JS means a single render is correct at any
   viewport and a live resize or tablet rotation needs no re-render to stay correct. An earlier
   version of this file branched on state.desk; that was wrong for exactly this reason (caught in
   review) and state.desk has been removed from the state shape below since nothing here reads it
   anymore -- a parameter a renderer ignores is a trap for whoever passes it.

   Pure: no DOM, no browser storage, no reading the system clock directly. "Now" arrives as
   state.nowMs so the greeting and the exam countdown are testable without depending on when the
   test happens to run -- see tests/fd-today.test.mjs. state.role and state.ringPct both arrive
   pre-resolved by the caller: role is already the short display label the greeting interpolates
   (this file never touches curriculum.json's role list to derive one from a full name, e.g.
   "Core rotation"), and ringPct is already the current animated percentage (this file never
   computes it from progress -- that is fdRingStep in fd_state.js). Injected via
   /*__FD_TODAY__*\/ once a later plan registers the marker (see SNIPPET_MARKERS in common.py) --
   this task does not register it. ES5 only: var/function, no const/let/arrow functions/template
   literals -- matches the other frontdoor/ modules.

   Scope note for whoever reads this next to the design doc: the due row (SRS due counts) and
   capture triage (the ward-capture note list) are NOT rendered here even though the design
   doc's decision table (Sec 1) marks both "Port, prominent". frontdoor.css has no styling rules
   for either -- neither appears anywhere in Front-Door-Hi-Fi-v2.dc.html's Today section either,
   so there was never a class contract or a prototype structure to build against. They also read
   from runtime stores (the spaced-rotation review queue and the ward-note capture list) that sit
   outside the curriculum/topic_meta item index every Plan 2 renderer (this one included) is a
   pure function over. This is a scope correction made before this task was implemented, not an
   omission: the existing shell markup for both moves across and gets restyled onto --fd-*
   tokens during Plan 3's wiring, where those stores are actually readable.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. The exam countdown comes verbatim from
   fdExamCountdown() (fd_state.js) rather than being reworded here, so this file never spells
   "Exam" itself. */

var FD_TODAY_DAYNAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* Pure progress arithmetic, split out because it is what the ring, the "X of Y done" label and the
   week-complete state all read -- three surfaces that must never disagree. */
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
   stay distinct here because each renders a different card. */
var FD_TODAY_PRIMARY_ORDER=['resume','block','read','due','week','ahead','setup'];

/* The shell splices the secondary section at this marker -- directly after the lead card
   (Continue or the setup CTA) -- so a Continue card that won stays first in the column and one
   that lost sits below the demoted device-store rows. An HTML comment is invisible to the
   learner and to every selector; fdTodayLive removes or replaces it. */
var FD_TODAY_LEAD_END='<!--fd-lead-end-->';

var FD_TODAY_WHY='First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.';

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
   row and the shell's secondary list read one object. */
function fdTodayLastRead(ref, weekItems, progress, doneMap){
  if(typeof ref!=='string'||!ref) return null;
  var list=weekItems||[], d=doneMap||{}, it=null;
  for(var i=0;i<list.length;i++){ if(list[i]&&list[i].ref===ref){ it=list[i]; break; } }
  if(!it) return null;
  var target=(progress&&progress.next)?progress.next.ref:null;
  return {ref:it.ref, kind:it.kind, title:it.title, minutes:it.minutes,
    done:d[it.ref]===true, isContinueTarget:target===it.ref};
}

function fdTodayWhy(){
  return '<p class="fd-primary__why">'+FD_TODAY_WHY+'</p>';
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
   colour (frontdoor.css:231/233) -- WCAG 1.4.1 and 4.1.2 both. So the glyph is decoration
   (aria-hidden="true") and the real state moves to aria-pressed on the button, which is the
   toggle. The glyph gains a bare wrapper span purely to have something to hang aria-hidden on --
   it carries no class, so no rule matches it; .fd-check is display:flex and the character was
   already an anonymous flex item, which the span now simply names. The render is unchanged, and
   the button keeps its accessible name from the title attribute it already had ("Mark done"),
   which the ✓ text content used to override.

   fd_path.js's detail card renders through this same function (compact=true), so Path inherits
   the fix rather than needing its own; tests/fd-path.test.mjs pins that it did.

   is-just-done is never applied here -- it is a
   transient "the user just clicked this" flag with no field in this renderer's state shape, and
   belongs to the DOM-side click handler, not this pure render. idx staggers the fade-in the
   design specifies (35ms per row); frontdoor.css's .fd-row animation has no built-in stagger, so
   the delay is the one non-colour inline style this row carries, same precedent as fd_shell.js's
   grouping spans.

   compact is optional (falsy for every existing call site, so nothing else changes): fd_path.js's
   detail card uses the same row with the card treatment stripped (CLASS-INVENTORY's
   ".fd-row.is-compact"), and passes true rather than this file growing a second, drifting copy
   of the row markup (found in Task 5 review -- fdRow and fd_path.js's old fdPathDetailRow were
   identical but for this one class token). */
function fdRow(it, idx, doneMap, compact){
  var on=(doneMap||{})[it.ref]===true;
  var titleCls=on?'fd-row__title is-done':'fd-row__title';
  var checkCls=on?'fd-check is-done':'fd-check';
  var typeCls=(it.kind==='tool')?'fd-chip is-tool':'fd-chip';
  /* A rights reference reads "reference": the page teaches administration and points at the
     official form. Calling it a tool is what sent a learner reaching for a scorer to a removal
     notice. The chip is the only thing that changes -- kind stays 'tool' so the page still loads
     from /tools/. */
  var typeLabel=it.rights?'reference':((it.kind==='tool')?'tool':'read');
  var minLabel=(it.kind!=='tool'&&typeof it.minutes==='number')?(it.minutes+' min'):'';
  var rowCls=compact?'fd-row is-compact':'fd-row';
  var editionMeta=fdEditionCoreMetaMarkup(it);
  /* The name carries the item and tracks the state, so nine toggles in a week list are nine
     distinct announcements ("Mark done: Interview & MSE") rather than "Mark done" nine times,
     and the name says what the NEXT press does rather than restating aria-pressed. */
  var toggleName=(on?'Mark undone: ':'Mark done: ')+it.title;
  return '<div class="'+rowCls+'" style="animation-delay:'+(idx*35)+'ms">'+
    '<button type="button" class="'+checkCls+'" data-fd-toggle="'+fdEsc(it.ref)+'" '+
      'title="'+fdEsc(toggleName)+'" aria-pressed="'+(on?'true':'false')+'">'+
      '<span aria-hidden="true">✓</span></button>'+
    '<button type="button" class="fd-row__open" data-fd-open="'+fdEsc(it.ref)+'">'+
      '<span class="fd-row__content"><span class="'+titleCls+'">'+fdEsc(it.title)+'</span>'+editionMeta+'</span>'+
      '<span class="fd-row__meta">'+
        '<span class="'+typeCls+'">'+typeLabel+'</span>'+
        '<span class="fd-row__min">'+fdEsc(minLabel)+'</span>'+
      '</span>'+
    '</button>'+
  '</div>';
}

/* The Continue card. When the week is finished (progress.next is null but the week had items)
   the button re-targets to a preview of next week instead of an item, so it carries data-fd-tab
   + data-fd-view-week rather than data-fd-open. The view attribute is intentionally distinct from
   setup-only data-fd-week, so the two actions cannot collide. The next target comes from the
   projected path: its final week reviews itself rather than inventing another. */
function fdContinue(index, state, wk, progress, primary){
  /* primary===false demotes the card (a device-store row won Today's one primary slot);
     undefined means primary, so every caller and test that predates the picker renders exactly
     as before. */
  var isPrimary=primary!==false;
  var isComplete=progress.total>0&&progress.done===progress.total;
  var suggested=index.path&&index.path.id==='ms3-six-week';
  var kickerCls=isComplete?'fd-continue__kicker is-complete':'fd-continue__kicker';
  var kickerText=isComplete?('Week '+fdEsc(state.week)+(suggested?' activities complete':' complete')):('Continue · Week '+fdEsc(state.week));
  var ringPct=(typeof state.ringPct==='number'&&!isNaN(state.ringPct))?state.ringPct:0;
  var titleText, openAttrs, chip='', dockLabel='Continue';
  if(progress.next){
    titleText=progress.next.title;
    openAttrs=' data-fd-open="'+fdEsc(progress.next.ref)+'"'+
      (progress.next.kind==='read'?' data-fd-reading-resume="1"':'');
    /* Same chip rule as fdRow: a rights reference reads "reference", never "tool". */
    var nx=progress.next;
    chip='<span class="'+((nx.kind==='tool')?'fd-chip is-tool':'fd-chip')+'">'+
      (nx.rights?'reference':((nx.kind==='tool')?'tool':'read'))+'</span>';
  } else {
    var nextWeek=fdNextWeek(index,state.week);
    var target=nextWeek?nextWeek.n:state.week;
    titleText=(nextWeek?'Preview Week ':'Review Week ')+target;
    dockLabel=nextWeek?'Preview week':'Review week';
    openAttrs=' data-fd-tab="path" data-fd-view-week="'+fdEsc(target)+'"';
  }
  var done=fdProgressForWeek(index,state,state.week), leftMin=0;
  for(var i=0;i<wk.items.length;i++){
    if(done[wk.items[i].ref]!==true&&typeof wk.items[i].minutes==='number') leftMin+=wk.items[i].minutes;
  }
  var leftLabel=leftMin>0?('~'+leftMin+' min left'):'';
  var out='<button type="button" class="'+(isPrimary?'fd-continue':'fd-continue is-secondary')+'"'+openAttrs+
    (isPrimary?' data-fd-dock-source="primary-'+(isComplete?'ahead':'week')+'" data-fd-dock-label="'+dockLabel+'"':'')+'>'+
    '<span class="fd-ring" style="--fd-ring-pct:'+ringPct+'%">'+
      '<span class="fd-ring__inner">'+ringPct+'%</span>'+
    '</span>'+
    '<span>'+
      '<span class="'+kickerCls+'">'+kickerText+'</span>'+
      '<span class="fd-continue__title">'+fdEsc(titleText)+chip+' →</span>'+
    '</span>'+
    '<span class="fd-continue__meta">'+
      '<span class="fd-continue__count">'+progress.done+' of '+progress.total+(suggested?' activities done':' done')+'</span>'+
      '<span class="fd-continue__left">'+leftLabel+'</span>'+
    '</span>'+
  '</button>';
  /* Week complete AND primary: the look-ahead card leads, and a learner with time left wants
     questions, not a preview. A sibling, never nested -- a button inside a button is invalid
     markup and the controller would see one click twice. */
  if(isComplete&&isPrimary){
    out+='<button type="button" class="fd-btn fd-btn--ghost fd-freshset" data-fd-open="question-bank-practice.html">Practice a fresh set →</button>';
  }
  return out;
}

function fdSetupCta(primary){
  return '<button type="button" class="fd-setupcta" data-fd-change-week'+
    (primary===false?'':' data-fd-dock-source="primary-setup" data-fd-dock-label="Set rotation week"')+'>'+
    '<span style="flex:1">'+
      '<span class="fd-setupcta__kicker">30-second setup</span>'+
      '<span class="fd-setupcta__title">Set your rotation week → get a real Today</span>'+
    '</span>'+
  '</button>';
}

function fdPick(item){
  var min=(typeof item.minutes==='number')?item.minutes:0;
  return '<button type="button" class="fd-pick" data-fd-open="'+fdEsc(item.ref)+'">'+
    '<span class="fd-pick__dot"></span>'+
    '<span style="flex:1;min-width:0">'+
      '<span class="fd-pick__kicker">Daily pick · ~'+min+' min</span>'+
      '<span class="fd-pick__title">'+fdEsc(item.title)+'</span>'+
    '</span>'+
  '</button>';
}

/* .fd-quicktool is the same element in the rail and in the pill row (CLASS-INVENTORY's ⚠) --
   this is the one function that renders it, called from both branches in fdToday. */
function fdQuickToolBtn(it){
  return '<button type="button" class="fd-quicktool" data-fd-open="'+fdEsc(it.ref)+'">'+
    '<span class="fd-quicktool__dot"></span>'+
    '<span class="fd-quicktool__label">'+fdEsc(it.title)+'</span>'+
  '</button>';
}

/* Kit cards open a protocol directly rather than the kit overview the header's Safety button
   opens, so data-fd-safety carries the item's ref as a payload here instead of standing bare the
   way it does on .fd-safetybtn -- same attribute, reused rather than inventing a second one. */
function fdKitCard(k){
  return '<button type="button" class="fd-kitcard" data-fd-safety="'+fdEsc(k.item.ref)+'">'+
    '<span class="fd-kitcard__dot"></span>'+
    '<span style="flex:1;min-width:0">'+
      '<span class="fd-kitcard__title">'+fdEsc(k.item.title)+'</span>'+
      '<span class="fd-kitcard__sub">'+fdEsc(k.sub)+'</span>'+
    '</span>'+
  '</button>';
}

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
function fdQuickTools(index, weekItems){
  var out=[], seen={}, i, ref;
  for(i=0;i<weekItems.length;i++){
    if(weekItems[i].kind==='tool'&&!weekItems[i].rights&&!seen[weekItems[i].ref]){ out.push(weekItems[i]); seen[weekItems[i].ref]=true; }
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
   DST transitions from shifting a label. */
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

/* Shared pilot invitation. The pgfb-b class deliberately routes through the shell's existing
   private feedback launcher, while data-fb-context tells the form this came from Today rather
   than from a specific learning page. */
function fdPilotFeedback(){
  return '<section class="fd-pilot" aria-labelledby="fd-pilot-title">'+
    '<span class="fd-pilot__eyebrow">Active testing</span>'+
    '<div class="fd-pilot__copy">'+
      '<h2 class="fd-pilot__title" id="fd-pilot-title">This learning site is in active testing</h2>'+
      '<p>Use it alongside your official rotation materials and supervision. Tell us what helped, what was unclear, or what did not work.</p>'+
    '</div>'+
    '<button type="button" class="fd-btn fd-btn--ghost fd-pilot__button pgfb-b" data-fb-context="Today landing page">Share feedback</button>'+
  '</section>';
}

function fdToday(index, state){
  var st=state||{};
  var idx=index||{byRef:{}, weeks:[], columns:[], kit:[]};
  var nowMs=st.nowMs;
  var hour=new Date(nowMs).getHours();
  var dayName=FD_TODAY_DAYNAMES[new Date(nowMs).getDay()];
  var roleShort=st.role||'there';
  var period=hour<12?'Morning':(hour<18?'Afternoon':'Evening');
  /* No trailing em dash. The prototype's "Evening, Alex —" led into the line below with a dash
     after a NAME; with a role label the same dash read as a truncated sentence ("Evening, Core
     rotation —"), and at 375px it wrapped onto a line of its own (2026-09-18 critique). It had
     already been made aria-hidden so a screen reader stopped announcing "dash"; now it is gone
     for sighted readers too. The subhead below carries the week and the day. */
  var greeting=period+', '+fdEsc(roleShort);

  var wk=(typeof st.week==='number'&&!isNaN(st.week))?fdFindWeek(idx, st.week):null;
  var hasWeek=!!wk;
  var wItems=hasWeek?fdItemsForWeek(idx, st.week):[];
  var done=fdProgressForWeek(idx,st,st.week);
  var progress=fdTodayProgress(wItems, done);

  var sub=hasWeek
    ?('Week '+fdEsc(st.week)+' · '+fdEsc(wk.title)+' · '+dayName)
    :(dayName+' · browsing — no week set');
  /* fdExamCountdown returns a bare fragment -- its separator dot included, its leading space NOT
     ('· exam in ~5 days'). The caller owns the join, so it must supply that space: concatenating the fragment
     directly printed "Sunday· exam in ~5 days" through the final two path weeks, on the single most-read line
     of the front door. Guarded rather than unconditional because the empty return is the common
     case (every week outside the final two, and after the exam), and ' '+'' would leave a trailing space on
     the subhead for all of them. tests/fd-state.test.mjs pins the fragment's shape at one end and
     tests/fd-today.test.mjs pins this joined output at the other.

     The subhead no longer carries the Daily-Review-only streak clause; the seven-day
     activity strip rendered by fdConsistency directly below it replaced that clause (see
     fdActivityDays in fd_state.js for why). */
  /* fdPathExamCountdown is the audience gate in front of that arithmetic: no countdown on a path
     that does not end in an exam unless the learner stored a date (fd_state.js says why). */
  var countdown=fdPathExamCountdown(idx.path&&idx.path.id,st.week,idx.weeks,nowMs,st.rotationStart);
  if(countdown) sub+=' '+countdown;

  var out='<section class="fd-today">';
  out+='<h1 class="fd-today__h1">'+greeting+'</h1>';
  out+='<p class="fd-today__sub">'+sub+'</p>';
  out+=fdPilotFeedback();
  out+=fdConsistency(st.activityDays, nowMs);
  out+='<button type="button" class="fd-care-entry" data-fd-tab="care">Patient care resources<span aria-hidden="true">→</span></button>';
  out+='<div class="fd-today__cols"><div class="fd-today__main">';

  /* One Thing First: state.primaryKind arrives from the shell's picker. The lead card is
     primary unless a device-store row won; undefined keeps the pre-picker render. The marker
     that follows is where the shell splices the secondary section (see FD_TODAY_LEAD_END). */
  var pk=st.primaryKind;
  var leadPrimary=(pk===undefined||pk==='week'||pk==='ahead'||pk==='setup');
  out+=hasWeek?fdContinue(idx,st, wk, progress, leadPrimary):fdSetupCta(leadPrimary);
  out+=FD_TODAY_LEAD_END;
  if(st.offlineHtml)out+=st.offlineHtml;

  /* The exam-date nudge, BELOW the lead card: One Thing First keeps its single primary action, and
     nothing here can push that card past the phone fold. It used to duplicate the settings panel's
     own <input type=date> field inline; the date now has exactly one home, the panel's Pacing
     section (fd_sheet.js), and this is only a nudge toward it. Its one control reopens Settings via
     the SAME data-fd-settings action the gear already exposes -- a second TRIGGER for one action,
     not a second action. fd_wire.js's equivalentControl already restores focus to the gear once an
     invoker is gone (any live control sharing the same action attribute and value stands in for it),
     so this element disappearing the instant the date is saved needs no new fallback code.
     fdExamDatePrompt (fd_state.js) decides whether to ask and names the field. */
  var examLabel=hasWeek?fdExamDatePrompt(idx.path&&idx.path.id,nowMs):'';
  if(examLabel){
    out+='<div class="fd-today__exam">'+
      '<p class="fd-today__examtext"><strong>'+fdEsc(examLabel)+'</strong> — set it once and Today paces your reviews toward it.</p>'+
      '<button type="button" class="fd-today__examcta" data-fd-settings>Set exam date</button></div>';
  }


  if(hasWeek){
    out+='<div class="fd-listhead"><h2 class="fd-sectionhead">'+(idx.path&&idx.path.id==='ms3-six-week'?'Suggested this week':'This week')+'</h2>'+
      '<span class="fd-listhead__theme">'+fdEsc(wk.theme)+'</span></div>';
    out+='<div class="fd-list">';
    for(var i=0;i<wItems.length;i++){ out+=fdRow(wItems[i], i, done); }
    out+='</div>';
  }

  var daily=fdDailyPick(fdLibraryOnlyReads(idx), done, nowMs);
  if(daily) out+=fdPick(daily);

  out+=fdProgressAccess();

  var quickTools=fdQuickTools(idx, wItems);

  /* Mobile pill row and desktop rail are both always emitted -- see the header comment. Same
     quickTools list feeds both, per the design's "both come from the same data". */
  out+='<div class="fd-quicktools--pills">';
  for(var q=0;q<quickTools.length;q++){ out+=fdQuickToolBtn(quickTools[q]); }
  out+='</div>';

  out+='</div>'; /* .fd-today__main */

  /* Safety kit first, Quick tools second: the rail order lines up with the header, where the red
     Safety button outranks the gear/search/tab controls -- so the rail reads as an extension of
     that button rather than a tools list with safety tacked on the end (2026-09-26). */
  out+='<aside class="fd-rail">';
  out+='<div><h2 class="fd-sectionhead">Safety kit</h2>';
  for(var k=0;k<idx.kit.length;k++){ out+=fdKitCard(idx.kit[k]); }
  out+='</div>';
  out+='<div><h2 class="fd-sectionhead">Quick tools</h2>';
  for(var q2=0;q2<quickTools.length;q2++){ out+=fdQuickToolBtn(quickTools[q2]); }
  out+='</div>';
  out+='</aside>';

  out+='</div></section>'; /* .fd-today__cols, .fd-today */
  return out;
}
