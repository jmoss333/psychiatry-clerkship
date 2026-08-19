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
  var typeLabel=(it.kind==='tool')?'tool':'read';
  var minLabel=(it.kind!=='tool'&&typeof it.minutes==='number')?(it.minutes+' min'):'';
  var rowCls=compact?'fd-row is-compact':'fd-row';
  var editionMeta=fdEditionCoreMetaMarkup(it);
  return '<div class="'+rowCls+'" style="animation-delay:'+(idx*35)+'ms">'+
    '<button type="button" class="'+checkCls+'" data-fd-toggle="'+fdEsc(it.ref)+'" '+
      'title="Mark done" aria-pressed="'+(on?'true':'false')+'">'+
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
function fdContinue(index, state, wk, progress){
  var isComplete=progress.total>0&&progress.done===progress.total;
  var kickerCls=isComplete?'fd-continue__kicker is-complete':'fd-continue__kicker';
  var kickerText=isComplete?('Week '+fdEsc(state.week)+' complete'):('Continue · Week '+fdEsc(state.week));
  var ringPct=(typeof state.ringPct==='number'&&!isNaN(state.ringPct))?state.ringPct:0;
  var titleText, openAttrs;
  if(progress.next){
    titleText=progress.next.title;
    openAttrs=' data-fd-open="'+fdEsc(progress.next.ref)+'"';
  } else {
    var nextWeek=fdNextWeek(index,state.week);
    var target=nextWeek?nextWeek.n:state.week;
    titleText=(nextWeek?'Preview Week ':'Review Week ')+target;
    openAttrs=' data-fd-tab="path" data-fd-view-week="'+fdEsc(target)+'"';
  }
  var done=state.done||{}, leftMin=0;
  for(var i=0;i<wk.items.length;i++){
    if(done[wk.items[i].ref]!==true&&typeof wk.items[i].minutes==='number') leftMin+=wk.items[i].minutes;
  }
  var leftLabel=leftMin>0?('~'+leftMin+' min left'):'';
  return '<button type="button" class="fd-continue"'+openAttrs+'>'+
    '<span class="fd-ring" style="--fd-ring-pct:'+ringPct+'%">'+
      '<span class="fd-ring__inner">'+ringPct+'%</span>'+
    '</span>'+
    '<span>'+
      '<span class="'+kickerCls+'">'+kickerText+'</span>'+
      '<span class="fd-continue__title">'+fdEsc(titleText)+' →</span>'+
    '</span>'+
    '<span class="fd-continue__meta">'+
      '<span class="fd-continue__count">'+progress.done+' of '+progress.total+' done</span>'+
      '<span class="fd-continue__left">'+leftLabel+'</span>'+
    '</span>'+
  '</button>';
}

function fdSetupCta(){
  return '<button type="button" class="fd-setupcta" data-fd-change-week>'+
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
    '<span class="fd-progresscard__title">Progress &amp; mastery</span>'+
    '<span class="fd-progresscard__meta">Coverage · blueprint · calibration →</span>'+
  '</button>';
}

/* Week-relevant tools first, then the rest of the library's tools (sorted by ref for
   determinism, matching fdLibraryOnlyReads' own tie-break) fill out to 5. The prototype pins two
   tools by an id this repo's data does not carry, so this is a re-derivation from the join index
   rather than a port of that exact list -- CLASS-INVENTORY's ×5 cap is what is actually
   contractual here, not the selection order past "this week's tools first". */
function fdQuickTools(index, weekItems){
  var out=[], seen={}, i, ref;
  for(i=0;i<weekItems.length;i++){
    if(weekItems[i].kind==='tool'&&!seen[weekItems[i].ref]){ out.push(weekItems[i]); seen[weekItems[i].ref]=true; }
  }
  if(out.length<5){
    var all=[];
    for(ref in index.byRef){
      if(index.byRef[ref].kind==='tool') all.push(index.byRef[ref]);
    }
    all.sort(function(a,b){ return a.ref<b.ref?-1:(a.ref>b.ref?1:0); });
    for(i=0;i<all.length&&out.length<5;i++){
      if(!seen[all[i].ref]){ out.push(all[i]); seen[all[i].ref]=true; }
    }
  }
  return out.slice(0,5);
}

function fdToday(index, state){
  var st=state||{};
  var idx=index||{byRef:{}, weeks:[], columns:[], kit:[]};
  var nowMs=st.nowMs;
  var hour=new Date(nowMs).getHours();
  var dayName=FD_TODAY_DAYNAMES[new Date(nowMs).getDay()];
  var roleShort=st.role||'there';
  var period=hour<12?'Morning':(hour<18?'Afternoon':'Evening');
  var greeting=period+', '+fdEsc(roleShort)+' —';

  var wk=(typeof st.week==='number'&&!isNaN(st.week))?fdFindWeek(idx, st.week):null;
  var hasWeek=!!wk;
  var wItems=hasWeek?fdItemsForWeek(idx, st.week):[];
  var progress=fdTodayProgress(wItems, st.done);

  var sub=hasWeek
    ?('Week '+fdEsc(st.week)+' · '+fdEsc(wk.title)+' · '+dayName)
    :(dayName+' · browsing — no week set');
  if((st.streak||0)>=2) sub+=' · '+fdEsc(st.streak)+' days in a row';
  /* fdExamCountdown returns a bare fragment -- its separator dot included, its leading space NOT
     ('· exam in ~5 days'), the same split the streak clause above uses when it supplies its own
     ' · '. The caller owns the join, so it must supply that space: concatenating the fragment
     directly printed "Sunday· exam in ~5 days" through the final two path weeks, on the single most-read line
     of the front door. Guarded rather than unconditional because the empty return is the common
     case (every week outside the final two, and after the exam), and ' '+'' would leave a trailing space on
     the subhead for all of them. tests/fd-state.test.mjs pins the fragment's shape at one end and
     tests/fd-today.test.mjs pins this joined output at the other. */
  var countdown=fdExamCountdown(st.week,idx.weeks,nowMs,st.rotationStart);
  if(countdown) sub+=' '+countdown;

  var out='<section class="fd-today">';
  out+='<h1 class="fd-today__h1">'+greeting+'</h1>';
  out+='<p class="fd-today__sub">'+sub+'</p>';
  out+='<div class="fd-today__cols"><div class="fd-today__main">';

  out+=hasWeek?fdContinue(idx,st, wk, progress):fdSetupCta();

  if(idx.edition){
    out+=fdEditionCardMarkup(idx.edition,st.currentCoreRevision);
    out+=fdEditionLocalOrientationMarkup(idx.edition,st.localProgress);
  }

  if(hasWeek){
    out+='<div class="fd-listhead"><h2 class="fd-sectionhead">This week</h2>'+
      '<span class="fd-listhead__theme">'+fdEsc(wk.theme)+'</span></div>';
    out+='<div class="fd-list">';
    for(var i=0;i<wItems.length;i++){ out+=fdRow(wItems[i], i, st.done); }
    out+='</div>';
    if(idx.edition) out+=fdEditionWeekResourcesMarkup(idx.edition,st.week,st.localProgress);
  }

  var daily=fdDailyPick(fdLibraryOnlyReads(idx), st.done, nowMs);
  if(daily) out+=fdPick(daily);

  out+=fdProgressAccess();

  var quickTools=fdQuickTools(idx, wItems);

  /* Mobile pill row and desktop rail are both always emitted -- see the header comment. Same
     quickTools list feeds both, per the design's "both come from the same data". */
  out+='<div class="fd-quicktools--pills">';
  for(var q=0;q<quickTools.length;q++){ out+=fdQuickToolBtn(quickTools[q]); }
  out+='</div>';

  out+='</div>'; /* .fd-today__main */

  out+='<aside class="fd-rail">';
  out+='<div><h2 class="fd-sectionhead">Quick tools</h2>';
  for(var q2=0;q2<quickTools.length;q2++){ out+=fdQuickToolBtn(quickTools[q2]); }
  out+='</div>';
  out+='<div><h2 class="fd-sectionhead">Safety kit</h2>';
  for(var k=0;k<idx.kit.length;k++){ out+=fdKitCard(idx.kit[k]); }
  out+='</div>';
  out+='</aside>';

  out+='</div></section>'; /* .fd-today__cols, .fd-today */
  return out;
}
