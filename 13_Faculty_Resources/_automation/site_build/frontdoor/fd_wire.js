/* Front door wiring -- the ONE impure module under frontdoor/. Every other module in this
   directory is a pure function of state; this one owns the listeners, the history entries, and
   the stores, so the others never have to.

   Injected via /*__FD_WIRE__*\/ -- registered in SNIPPET_MARKERS (common.py) and placed after
   /*__FD_SHEET__*\/ in spa_index.html, because it calls into every renderer above it. ES5 only:
   var/function, no arrow functions or template literals -- matches the other frontdoor/ modules.

   ---- The two halves, and why the fence between them matters ---------------------------------
   Everything between the `pure` markers reads nothing ambient: no DOM, no storage, no clock, no
   address bar. That is what makes the decision logic testable directly (tests/fd-wire.test.mjs)
   instead of through a synthesised DOM, and the fence is scanned by that suite so the boundary
   cannot erode one convenience read at a time.

     fdResolveState(url, stored) -- spec §2.1's precedence rule, stated once: a URL carrying
       page/tool/tab wins; the stored blob is the fallback for a bare URL. Wrong precedence is
       invisible in a browser (a page still renders, just not the one the link named).
     fdDispatch(target, state)   -- what a clicked element's data-fd-* attributes mean. `target`
       is a plain DESCRIPTOR of strings and booleans, NOT an Element: fdWireTarget() below reads
       the attributes off the DOM and hands this function the bag.
     fdKeyPatch(action, state)   -- the same, for fdKeyAction()'s (fd_shell.js) decisions, so a
       keyboard shortcut and the click it mirrors can never produce different state.

   ---- Three attributes are reused across surfaces; the SURFACE disambiguates them -------------
   Each of these is a deliberate reuse the emitting module argues for in its own comments, not an
   accident, so the wiring resolves them by DOM context rather than by inventing new attributes:

     data-fd-safety="<ref>"  .fd-kitcard (fd_today.js) and .fd-result (fd_search.js) open a
                             protocol with NO origin; .fd-kitrow (fd_sheet.js), which lives
                             inside the sheet itself, opens one with sheetFrom:'kit'. Only the
                             second gets fd_sheet.js's "< kit" back button, and when this is
                             wrong the affordance simply never renders -- nothing throws, nothing
                             logs. The plan's attribute table flags it as the one to get wrong.
     data-fd-toggle="<ref>"  a list row's .fd-check is a checkbox; the reader's primary button
                             (.fd-article__actions / .fd-actionbar) marks done and auto-advances.
                             fd_reader.js reuses the attribute and says the wiring layer is
                             expected to notice where the click came from.
     data-fd-week="<n>"      the first-run wizard's tiles adopt the rotation week; Path's
                             timeline rows only change which week is being VIEWED. Browsing ahead
                             on Path must never move a student's real week.

   ---- What this file may and may not persist -------------------------------------------------
   fdSave() (fd_state.js) whitelists its own keys, so cw_frontdoor_v1 cannot grow a field here.
   Everything else has an existing home and is written to it: item progress to cw_progress_v1 via
   progSave(), the rotation week to cw_rotation_start as a DATE (rotationWeek() derives the
   number), the theme to cw_theme by the shell's own toggle. Session-only state (the wizard step,
   search, the sheet, step checks, the nudge) lives in FD_TRANSIENT below and is deliberately
   persisted nowhere -- spec §2.1 lists it as never routed and never stored.

   Copy rule: this file renders nothing, so it ships no learner-facing strings at all. */

/* ---- pure ---- */

var FD_TABS={today:1, path:1, library:1};

/* Kept across two lines deliberately: common.py's _snippet_signature() takes the FIRST line
   beginning with "function " as this snippet's double-injection probe, and test_common.py caps
   that line at 60 characters (a long one silently degrades to a no-op when the file is
   rewrapped). Re-inlining this body goes red there, not here. */
function fdOwns(o, k){
  return Object.prototype.hasOwnProperty.call(o, k);
}

/* '' for anything that is not one of the three tabs, so callers can write `fdNormTab(x)||'today'`
   and a junk value degrades to the default rather than rendering an empty surface. hasOwnProperty
   rather than a plain truth test: '?tab=constructor' would otherwise pass. */
function fdNormTab(t){ return (t&&fdOwns(FD_TABS, t))?String(t):''; }

function fdDecodeParam(s){
  try{ return decodeURIComponent(String(s).replace(/\+/g,' ')); }catch(_){ return String(s); }
}

/* Query parse over a plain string. Deliberately not URLSearchParams over an ambient address:
   this has to answer "what does THIS string mean" for the boot, for a history restore, and for a
   unit test that passes '?page=a.md' with no origin at all. First value wins for a repeated key,
   matching URLSearchParams.get. */
function fdQueryOf(url){
  var s=String(url||''), out={}, i;
  var hash=s.indexOf('#'); if(hash>-1) s=s.slice(0, hash);
  var q=s.indexOf('?'); if(q===-1) return out;
  var parts=s.slice(q+1).split('&');
  for(i=0;i<parts.length;i++){
    if(!parts[i]) continue;
    var eq=parts[i].indexOf('=');
    var k=fdDecodeParam(eq===-1?parts[i]:parts[i].slice(0, eq));
    var v=fdDecodeParam(eq===-1?'':parts[i].slice(eq+1));
    if(!fdOwns(out, k)) out[k]=v;
  }
  return out;
}

/* THE precedence rule (spec §2.1). Three cases, and the third is the one that is easy to miss:

     ?page=/?tool=  the URL names a page  -> that page opens, whatever this device had open.
     ?tab=          the URL names a TAB   -> that tab opens AND no stored page is layered over
                                             it. A shared link to the Library must show the
                                             Library, not the article this device was reading.
     bare           the URL names nothing -> the stored route is restored, so a returning
                                             student resumes where they were.

   Only tab and openId are routed. role, viewWeek, fromTab and scrollPos have no URL form and
   always come from storage. Nothing here is derived from a clock or a store -- week, done and
   streak are added by the caller (fdCurrentState in spa_index.html), which is why they are
   absent from the shape below. */
function fdResolveState(url, stored){
  var s=stored||{};
  var q=fdQueryOf(url);
  var deep=q.page||q.tool||'';
  var urlTab=fdNormTab(q.tab);
  var tab=urlTab||fdNormTab(s.tab)||'today';
  var openId;
  if(deep) openId=deep;
  else if(urlTab) openId='';
  else openId=s.openId||'';
  return {
    role: s.role||'',
    tab: tab,
    openId: openId,
    fromTab: fdNormTab(s.fromTab)||tab,
    viewWeek: (typeof s.viewWeek==='number'&&!isNaN(s.viewWeek))?s.viewWeek:undefined,
    scrollPos: s.scrollPos
  };
}

/* An attribute that is present and non-empty. getAttribute() returns null when absent and '' for
   a bare attribute, and the difference carries meaning: data-fd-safety bare opens the kit, while
   data-fd-safety="<ref>" opens that protocol. */
function fdHasVal(v){ return v!==null&&v!==undefined&&v!==''; }

/* A clicked element's attributes to a state patch, or null when the element means nothing here.
   The patch may also carry INTENTS -- toggle/fromReader, setWeek, navDir -- which name something
   only the impure layer can do (write a store, look an item up in the index). fdApply() consumes
   and removes them; they are never merged into state.

   Branch order is the contract, not an accident. Nothing in the codebase emits two of these on
   one element except .fd-continue (data-fd-tab + data-fd-week, deliberately, so its
   preview-next-week action needs no attribute of its own), but stating the order means a future
   combination resolves predictably instead of by source position. */
function fdDispatch(target, state){
  var t=target||{}, st=state||{}, k;

  /* Overlay dismissals first: they are the cheapest reading of any click and can never be what
     a payload-carrying attribute on the same element meant. */
  if(t.closeNudge) return {nudgeRef:''};
  if(t.closeSearch) return {searchOpen:false, query:''};
  if(t.closeSheet) return {sheet:null, sheetFrom:null, stepsDone:{}};

  /* A protocol step check. Session-only and keyed by POSITION, which is exactly why fd_sheet.js
     refused to overload data-fd-toggle for it: a numeric key in the persisted progress map would
     collide with a page slug. Copied rather than mutated -- this function is pure. */
  if(fdHasVal(t.step)){
    var steps={};
    for(k in (st.stepsDone||{})){ if(fdOwns(st.stepsDone, k)) steps[k]=st.stepsDone[k]; }
    steps[t.step]=!steps[t.step];
    return {stepsDone: steps};
  }

  /* OPEN BEHAVIOUR 1 of 3 -- the protocol sheet. Checked before data-fd-open so that a safety
     surface can never be out-competed by another attribute if one is ever added beside it. */
  if(t.safety!==null&&t.safety!==undefined){
    if(!t.safety) return {sheet:'kit', sheetFrom:null, stepsDone:{}, searchOpen:false};
    /* inSheet is the kit-row-vs-kit-card distinction. sheetFrom:'kit' is the ONLY thing that
       makes fd_sheet.js render its "< kit" back button, and a protocol reached from Today's rail
       or a search hit has no kit behind it to go back to. */
    return {sheet:String(t.safety), sheetFrom:(t.inSheet?'kit':null),
            stepsDone:{}, searchOpen:false};
  }

  /* Mark done. The ref alone is not enough: in a list row this is a checkbox, and in the reader
     it is a primary button whose own label reads "Next: ..." once the item is done. fdApply()
     resolves that against the week list. */
  if(fdHasVal(t.toggle)) return {toggle:String(t.toggle), fromReader:!!t.inReader};

  if(fdHasVal(t.open)){
    /* OPEN BEHAVIOUR 2 of 3 -- the preview sheet. The bare data-fd-sheet modifier beside
       data-fd-open, which fd_search.js's result rows and fd_reader.js's "Try it now" both carry,
       and which both promise in their own visible sub-copy: the page underneath stays put. */
    if(t.sheet){
      return {sheet:FD_SHEET_ITEM_PREFIX+String(t.open), sheetFrom:null,
              stepsDone:{}, searchOpen:false};
    }
    /* OPEN BEHAVIOUR 3 of 3 -- navigate. fromTab is the tab the reader was opened FROM, and it
       must survive reading onward: prev/next, the week rail, the nudge and the sheet's "Open the
       full page" all navigate while a reader is already open, and rewriting the origin there
       would make the back button point at whichever tab happens to be behind the article. */
    return {openId:String(t.open),
            fromTab: st.openId?(fdNormTab(st.fromTab)||'today'):(fdNormTab(st.tab)||'today'),
            sheet:null, sheetFrom:null, searchOpen:false, nudgeRef:''};
  }

  /* Tab, optionally with a week: .fd-continue emits both when the week is complete, so its
     button previews the next week on Path. Previewing is not adopting -- no setWeek here. */
  if(fdHasVal(t.tab)){
    var tabPatch={tab:fdNormTab(t.tab)||'today', openId:'',
                  sheet:null, sheetFrom:null, searchOpen:false};
    if(fdHasVal(t.week)) tabPatch.viewWeek=parseInt(t.week, 10);
    return tabPatch;
  }

  /* Path's explicit "Set as my week". Its own attribute precisely because adopting a week is a
     different act from viewing one. */
  if(fdHasVal(t.setweek)){
    var adopt=parseInt(t.setweek, 10);
    return {setWeek:adopt, viewWeek:adopt, tab:'today', openId:'',
            setup:'', sheet:null, searchOpen:false};
  }

  if(fdHasVal(t.week)){
    var n=parseInt(t.week, 10);
    /* Path's timeline. The narrowest patch in this function, on purpose. */
    if(!t.inSetup) return {viewWeek:n};
    /* The wizard's "Not on rotation -- just browse" tile shares data-fd-week with the numbered
       tiles and carries 0 (fd_shell.js's own note). setWeek:null clears the rotation date, which
       is what "no week set" means when the state is a date rather than a number -- the prototype
       and spec §5 both say the choice lands on Library with no week. */
    if(!n) return {setWeek:null, setup:'', tab:'library', openId:''};
    return {setWeek:n, viewWeek:n, setup:'', tab:'today', openId:''};
  }

  if(fdHasVal(t.role)) return {role:String(t.role), setup:'week'};

  if(t.back){
    /* Wizard step 2. "Back" means the role question for someone still setting up, and "never
       mind" for someone who arrived from the header week pill and already has a week -- the same
       branch the prototype's backFromWeek makes. */
    if(t.inSetup){
      return (typeof st.week==='number'&&!isNaN(st.week))?{setup:''}:{setup:'role'};
    }
    return {openId:'', tab:fdNormTab(st.fromTab)||'today',
            sheet:null, sheetFrom:null, searchOpen:false};
  }
  if(t.home) return {tab:'today', openId:'', sheet:null, sheetFrom:null, searchOpen:false};
  if(t.search) return {searchOpen:true, query:''};
  if(t.changeWeek) return {setup:'week'};
  return null;
}

/* fdKeyAction (fd_shell.js) decides WHETHER a key does anything; this decides what state that
   means, in the same vocabulary fdDispatch uses, so 1/2/3 and a tab click cannot drift apart.
   'close' unwinds one layer per press -- search first, then the sheet -- which is why
   fdKeyAction can return one undifferentiated {type:'close'} and leave the order here. */
function fdKeyPatch(action, state){
  var a=action||{}, st=state||{};
  if(a.type==='close'){
    if(st.searchOpen) return {searchOpen:false, query:''};
    if(st.sheet) return {sheet:null, sheetFrom:null, stepsDone:{}};
    return null;
  }
  if(a.type==='search') return {searchOpen:true, query:''};
  if(a.type==='tab'){
    return {tab:fdNormTab(a.tab)||'today', openId:'',
            sheet:null, sheetFrom:null, searchOpen:false};
  }
  /* An intent, not a destination: which item is next depends on the week list, which lives in
     the index. fdApply() resolves it and does nothing at all when there is no neighbour. */
  if(a.type==='nav') return {navDir:(a.dir<0)?-1:1};
  return null;
}

/* ---- end pure ---- */

/* Session-only state. Every field here is on spec §2.1's "transient (never routed)" list, and
   none of them is in fdSave()'s whitelist, so none can reach storage even by accident.
   `setup` is the first-run wizard's step: '' (the app), 'role', or 'week'. It is transient
   because the wizard is a transition, not a place -- a reload mid-wizard drops a student into
   the app, where fd_today.js's own "30-second setup" card offers the same question again. */
var FD_TRANSIENT={ setup:'', searchOpen:false, query:'', sheet:null, sheetFrom:null,
                   stepsDone:{}, nudgeRef:'' };

/* The subset of FD_KEYS (fd_state.js) this file writes. scrollPos is deliberately absent: it is
   whitelisted for persistence but nothing restores a scroll position yet, so it is carried
   through fdResolveState untouched rather than being rewritten with a value nobody computes. */
var FD_PERSIST=['role','tab','viewWeek','openId','fromTab'];

/* One selector, every attribute in the plan's contract table. A missing entry is a control that
   silently does nothing: fdDispatch would handle it correctly and never be called.
   data-fd-theme is the one deliberate omission -- the shell's own delegated toggle owns it,
   because it existed before this file and touches the document element, not front-door state. */
var FD_CLICK_SELECTOR='[data-fd-open],[data-fd-safety],[data-fd-toggle],[data-fd-tab],'+
  '[data-fd-week],[data-fd-setweek],[data-fd-role],[data-fd-step],[data-fd-back],'+
  '[data-fd-home],[data-fd-search],[data-fd-change-week],[data-fd-close-sheet],'+
  '[data-fd-close-search],[data-fd-close-nudge]';

/* The three DOM contexts that disambiguate a reused attribute -- see the header. Each names the
   element the emitting module actually renders, so the ambiguity is resolved against the class
   contract (CLASS-INVENTORY.md) rather than against a mount id this file happens to know. */
var FD_SEL_SHEET='.fd-sheet';
var FD_SEL_READER_ACTIONS='.fd-article__actions,.fd-actionbar';
var FD_SEL_SETUP='.fd-setup';

var FD_NUDGE_MS=8000, FD_NUDGE_TIMER=null;

/* A deep link's extra params (&case=, &scenario=, &resume=1 -- communicationHref()/familyAction()
   ship all three). Kept only for the ref the link named: carrying them onto a DIFFERENT tool
   would hand it another tool's arguments. Filled by the boot in spa_index.html, which is where
   toolExtraFromParams() lives. */
var FD_TOOL_EXTRA='', FD_TOOL_EXTRA_REF='';

function fdIn(el, sel){ try{ return !!(el.closest&&el.closest(sel)); }catch(_){ return false; } }

/* The one place DOM attributes become the plain descriptor fdDispatch reads. Keys mirror the
   data-fd-* names one for one, so a new attribute is a one-line change in two adjacent places. */
function fdWireTarget(el){
  return {
    open: el.getAttribute('data-fd-open'),
    sheet: el.hasAttribute('data-fd-sheet'),
    safety: el.getAttribute('data-fd-safety'),
    toggle: el.getAttribute('data-fd-toggle'),
    tab: el.getAttribute('data-fd-tab'),
    week: el.getAttribute('data-fd-week'),
    setweek: el.getAttribute('data-fd-setweek'),
    role: el.getAttribute('data-fd-role'),
    step: el.getAttribute('data-fd-step'),
    back: el.hasAttribute('data-fd-back'),
    home: el.hasAttribute('data-fd-home'),
    search: el.hasAttribute('data-fd-search'),
    changeWeek: el.hasAttribute('data-fd-change-week'),
    closeSheet: el.hasAttribute('data-fd-close-sheet'),
    closeSearch: el.hasAttribute('data-fd-close-search'),
    closeNudge: el.hasAttribute('data-fd-close-nudge'),
    inSheet: fdIn(el, FD_SEL_SHEET),
    inReader: fdIn(el, FD_SEL_READER_ACTIONS),
    inSetup: fdIn(el, FD_SEL_SETUP)
  };
}

/* fdIndex() memoises fdBuildIndex over build-injected data; the guard mirrors fdRender's own,
   for the same reason it gives there -- an unusable curriculum degrades every surface to its
   empty state instead of throwing out of a click handler. */
function fdIndexSafe(){
  try{ return fdIndex(); }catch(_){ return {byRef:{}, weeks:[], columns:[], kit:[]}; }
}

/* cw_progress_v1's record shape is the one the deleted "Mark as read" control wrote --
   {done:true, at:'YYYY-MM-DD'} keyed by shipped slug, the entry removed outright when un-marked
   -- so existing progress stays readable and no migration is needed. The stamp is the LOCAL day
   (localDayStr, phase_policy.js) rather than the old UTC toISOString().slice(0,10): every other
   day boundary in the front door is local (spec §2.3), and a UTC stamp files an evening session
   under tomorrow for anyone west of Greenwich.
   seedSRS() is called on the way through exactly as the old handler did: marking a page read is
   what schedules its quiz card, and dropping the call would quietly stop the review queue from
   ever growing again. */
function fdSetDone(ref, on){
  var p=progLoad();
  if(on){
    p[ref]={done:true, at:localDayStr(Date.now())};
    try{ seedSRS(ref); }catch(_){ }
  } else {
    delete p[ref];
  }
  progSave(p);
}

/* The rotation week is stored as a DATE, never as a number: rotationWeek() derives the number
   from cw_rotation_start so it advances on its own as the rotation runs. Rotations always begin
   on a Monday (repo owner, 2026-08-15) and fd_state.js's exam countdown depends on that
   alignment, so the date written is the Monday of the current week minus (n-1) weeks.
   Day arithmetic goes through setDate() from a midday anchor rather than subtracting
   milliseconds: a 7*86400000 subtraction across a daylight-saving boundary lands on 23:00 the
   previous day and silently writes a date one off. Formatting only -- localDayStr() parses
   nothing, so this file never spells a midnight suffix (banned by tests/phase-chip.test.mjs in
   code and comments alike).
   n of null clears the key: that is what the wizard's "just browse" tile means when the stored
   fact is a date rather than a number. */
function fdSetRotationWeek(n, nowMs){
  if(n===null||n===undefined||isNaN(n)){
    try{ localStorage.removeItem('cw_rotation_start'); }catch(_){ }
    return;
  }
  var d=new Date(nowMs||Date.now());
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate()-(((d.getDay()+6)%7)+(n-1)*7));
  try{ localStorage.setItem('cw_rotation_start', localDayStr(d.getTime())); }catch(_){ }
}

/* Auto-advance after Mark done (spec §5). The done map is copied with the just-marked item
   forced true, because the store write and this lookup would otherwise race on whichever
   fdCurrentState() snapshot was taken first. */
function fdNextUnreadRef(st, ref){
  if(typeof st.week!=='number'||isNaN(st.week)) return '';
  var done={}, k;
  for(k in (st.done||{})){ if(fdOwns(st.done, k)) done[k]=st.done[k]; }
  done[ref]=true;
  var next=fdReaderNextUnread(fdItemsForWeek(fdIndexSafe(), st.week), ref, done);
  return next?next.ref:'';
}

/* Left/right arrows move within the week, using fd_reader.js's own neighbour lookup so the keys
   and the prev/next footer buttons can never disagree about what "next" is. */
function fdNeighbourRef(st, dir){
  var n=fdReaderNeighbours(fdIndexSafe(), st.openId, st.week);
  var to=(dir<0)?n.prev:n.next;
  return to?to.ref:'';
}

/* Closing a PROTOCOL sheet over a page the student has not read raises the nudge toast. Only a
   protocol: the kit list and an item preview have no single page behind them. */
function fdNudgeRefFor(st){
  var sheet=st.sheet;
  if(!sheet||sheet==='kit') return '';
  if(String(sheet).indexOf(FD_SHEET_ITEM_PREFIX)===0) return '';
  if(!fdSheetKitEntry(fdIndexSafe(), sheet)) return '';
  return (st.done||{})[sheet]?'':String(sheet);
}

function fdNudgeSchedule(){
  try{ if(FD_NUDGE_TIMER) clearTimeout(FD_NUDGE_TIMER); }catch(_){ }
  FD_NUDGE_TIMER=setTimeout(function(){
    FD_NUDGE_TIMER=null;
    if(!FD_TRANSIENT.nudgeRef) return;
    FD_TRANSIENT.nudgeRef='';
    fdRerender();
  }, FD_NUDGE_MS);
}

/* The legacy {f,k,t} item shape setRoute()/pageTitle()/announceRoute()/capCtx() all read. Built
   here rather than carried in front-door state so the two vocabularies meet at exactly one
   place. */
function fdRouteItem(ref){
  var it=(fdIndexSafe().byRef||{})[ref]||null;
  return { f: ref, k: (it&&it.kind==='tool')?'tool':'md', t: (it&&it.title)||ref };
}

/* setRoute() owns ?page=/?tool= -- including the faculty-preview guard that pins a reviewer's
   route -- and has no notion of a tab, so the tab-only case is written here with the same guard:
   a preview frame must not be able to push history either. 'today' is the default and is written
   as a bare path (spec §2.1: "omitted for the default"). */
function fdRouteTab(tab, replace){
  if(facultyPreviewRequest){
    restoreFacultyPreviewRoute();
    document.title=pageTitle(null);
    return;
  }
  var search=(tab&&tab!=='today')?('?tab='+encodeURIComponent(tab)):'';
  var url=search||location.pathname;
  try{
    if(replace) history.replaceState({f:null}, '', url);
    else if(location.search!==search) history.pushState({f:null}, '', url);
  }catch(_){ }
  document.title=pageTitle(null);
}

function fdRoute(st, replace){
  if(st.openId){
    var it=fdRouteItem(st.openId);
    currentItem=it;
    var extra=(FD_TOOL_EXTRA&&FD_TOOL_EXTRA_REF===st.openId)?FD_TOOL_EXTRA:'';
    setRoute(it, replace, extra?{toolExtra:extra}:undefined);
  } else {
    currentItem=null;
    fdRouteTab(st.tab, replace);
  }
}

/* #routeStatus is the shell's single aria-live channel and announceRoute() is its only writer.
   Tab switches get fd_reader.js's own tab-label map so the announcement and the reader's back
   link cannot call the same tab two different things. */
function fdAnnounce(st){
  try{
    if(st.openId) announceRoute(fdRouteItem(st.openId));
    else announceRoute({f:'__tab__', t:fdReaderBackLabel(st.tab)});
  }catch(_){ }
}

function fdFocusSearch(){
  try{
    var el=document.querySelector('.fd-searchpanel__input');
    if(!el) return;
    el.focus();
    var v=el.value; el.value=''; el.value=v;   /* caret to the end, not over the text */
  }catch(_){ }
}

/* Results are redrawn WITHOUT rebuilding the panel: fdRender's fdMount would replace the whole
   overlay, destroying the input element and taking focus and caret with it mid-keystroke. The
   markup is still fd_search.js's -- the overlay is rendered into a detached element and only its
   body is transplanted -- so nothing here duplicates a row template or the empty state. */
function fdSearchRedrawBody(){
  try{
    var live=document.querySelector('.fd-searchpanel__body');
    if(!live) return;
    var st=fdCurrentState();
    var tmp=document.createElement('div');
    tmp.innerHTML=fdSearchOverlay(fdIndexSafe(), st.query||'',
      (FD_CURRICULUM&&FD_CURRICULUM.synonyms)||{}, st);
    var fresh=tmp.querySelector('.fd-searchpanel__body');
    if(fresh) live.innerHTML=fresh.innerHTML;
  }catch(_){ }
}

/* Enter picks the first result (spec §5). Routed back through fdDispatch with a synthetic
   descriptor rather than reimplementing the branch, so the keyboard cannot open something the
   mouse would have opened differently -- a protocol hit opens its sheet, an item hit opens the
   preview sheet, and neither navigates. */
function fdSearchPickFirst(st){
  var results=fdSearchResults(fdIndexSafe(), st.query||'',
    (FD_CURRICULUM&&FD_CURRICULUM.synonyms)||{}, st);
  if(!results.length) return null;
  var r=results[0];
  return fdDispatch((r.kind==='protocol')
    ? {safety:r.item.ref}
    : {open:r.item.ref, sheet:true}, st);
}

function fdIsTyping(el){
  if(!el) return false;
  var tag=String(el.tagName||'').toUpperCase();
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return true;
  return !!el.isContentEditable;
}

/* fdKeyAction refuses to act unless screen==='app', which is what keeps 1/2/3 from switching
   tabs behind the first-run wizard. */
function fdScreen(st){ return (!st.role||st.setup)?'setup':'app'; }

/* Apply a patch: run its intents, split the rest between the store and the session, then route,
   render, announce.

   *** THE ORDER IS THE WHOLE FUNCTION. *** fdCurrentState() resolves the address bar FIRST
   (spec §2.1), so between a store write and the matching history write the two disagree and the
   stale address wins. The next route is therefore computed from the PATCH -- never by
   recomposing state -- and written to history BEFORE fdRerender. Composing instead was the first
   version of this function, and it made every tab switch away from a routed tab a no-op: the
   patch said 'today', storage said 'today', and ?tab=library out-ranked both, so the click
   appeared simply not to work. tests/fd-wire.test.mjs pins the call order for that reason. */
function fdApply(patch){
  if(!patch) return;
  var before=fdCurrentState(), p={}, k, i;
  for(k in patch){ if(fdOwns(patch, k)) p[k]=patch[k]; }

  if(p.toggle!==undefined){
    var ref=p.toggle, fromReader=!!p.fromReader;
    delete p.toggle; delete p.fromReader;
    /* In the reader the primary button's own label reads "Mark done - Next: ..." and then
       "Next: ..." once done, so it marks idempotently and advances; it never un-marks. In a list
       row the same attribute is a checkbox and flips. (Residue: fd_reader.js still puts
       aria-pressed on that button, which announces a toggle this click does not toggle -- a
       carry-in the plan already records, and one only fd_reader.js can close.) */
    fdSetDone(ref, fromReader?true:!before.done[ref]);
    if(fromReader){
      var next=fdNextUnreadRef(before, ref);
      if(next){ p.openId=next; }
      else { p.openId=''; p.tab=fdNormTab(before.fromTab)||'today'; }
    }
  }
  if(p.setWeek!==undefined){ fdSetRotationWeek(p.setWeek, before.nowMs); delete p.setWeek; }
  if(p.navDir!==undefined){
    var to=fdNeighbourRef(before, p.navDir);
    delete p.navDir;
    if(!to) return;   /* nothing to move to: do nothing, rather than re-render identically */
    p.openId=to;
  }
  /* A closing sheet may raise the nudge. Skipped when the same patch navigates (the student is
     going to the page anyway) or already decided the nudge for itself. */
  if(p.sheet===null&&before.sheet&&p.openId===undefined&&p.nudgeRef===undefined){
    var nudge=fdNudgeRefFor(before);
    if(nudge) p.nudgeRef=nudge;
  }

  for(k in FD_TRANSIENT){
    if(fdOwns(FD_TRANSIENT, k)&&p[k]!==undefined) FD_TRANSIENT[k]=p[k];
  }
  var blob=fdLoad(), touched=false;
  for(i=0;i<FD_PERSIST.length;i++){
    if(p[FD_PERSIST[i]]!==undefined){ blob[FD_PERSIST[i]]=p[FD_PERSIST[i]]; touched=true; }
  }
  if(touched) fdSave(blob);

  var next={
    openId: (p.openId!==undefined)?String(p.openId):before.openId,
    tab: (p.tab!==undefined)?(fdNormTab(p.tab)||'today'):before.tab
  };
  var routed=(next.openId!==before.openId)||(next.tab!==before.tab);
  if(routed) fdRoute(next, false);
  fdRerender();
  if(routed){
    fdAnnounce(next);
    try{ window.scrollTo(0, 0); }catch(_){ }
  }
  if(p.searchOpen===true) fdFocusSearch();
  if(FD_TRANSIENT.nudgeRef) fdNudgeSchedule();
}

/* Three listeners for the whole front door, plus one scoped to the search panel.

   The click listener is on `document`, NOT on #content: the sheet, the search overlay and the
   nudge are portalled into their own mounts as SIBLINGS of #content (so an open overlay is not
   destroyed when the body behind it re-renders), and a listener bound to #content would never
   see a click on any of them -- the kit rows, the sheet's close button, and every search result
   included. `document` is also where the shell's two existing delegated listeners live (the
   theme toggle and the faculty-preview link interceptor), so this adds no new pattern.

   The `input` listener is the exception to "three", and it is scoped to the search panel rather
   than delegated from document deliberately: a document-level input handler would also fire for
   the ward-capture textarea, which has nothing to do with the front door and whose keystrokes
   must not re-render anything. */
function fdWire(){
  document.addEventListener('click', function(ev){
    var el=(ev.target&&ev.target.closest)?ev.target.closest(FD_CLICK_SELECTOR):null;
    if(!el) return;
    fdApply(fdDispatch(fdWireTarget(el), fdCurrentState()));
  });

  window.addEventListener('keydown', function(ev){
    var key=ev.key, typing=fdIsTyping(ev.target);
    /* Bail before composing state for the overwhelmingly common case: a keystroke inside an
       input that cannot mean anything. Escape and Enter survive because the search panel needs
       them even while the caret is in its box. */
    if(typing&&key!=='Escape'&&key!=='Enter') return;
    var st=fdCurrentState();
    if(typing&&st.searchOpen){
      /* fdKeyAction's first guard is `if(o.typing) return null`, so its Escape branch cannot
         reach a student who is typing in the search box -- which is the one place Escape is most
         expected to work. Handled here rather than by loosening fd_shell.js's guard, which
         exists to stop "1" in an input from switching tabs. */
      if(key==='Escape'){ ev.preventDefault(); fdApply({searchOpen:false, query:''}); return; }
      if(key==='Enter'){ ev.preventDefault(); fdApply(fdSearchPickFirst(st)); return; }
    }
    var patch=fdKeyPatch(fdKeyAction(key, {
      typing: typing,
      screen: fdScreen(st),
      searchOpen: !!st.searchOpen,
      sheetOpen: !!st.sheet,
      reading: !!st.openId,
      meta: !!(ev.metaKey||ev.ctrlKey)
    }), st);
    if(!patch) return;
    ev.preventDefault();   /* '/' opens the browser find bar and cmd-K the address bar */
    fdApply(patch);
  });

  var panel=document.getElementById('fdSearch');
  if(panel){
    panel.addEventListener('input', function(ev){
      var el=ev.target;
      if(!el||String(el.className||'').indexOf('fd-searchpanel__input')===-1) return;
      FD_TRANSIENT.query=String(el.value||'');
      fdSearchRedrawBody();
    });
  }

  window.addEventListener('popstate', function(){
    /* URL-first, with NO stored fallback for the route: a back press from ?page=x to the bare
       path would otherwise restore x out of storage and the button would appear not to work.
       Storage is then re-synced to the address, because "where I was" is exactly what it holds.
       Overlays are dismissed -- a back press must not leave a sheet floating over a different
       page -- and the route is not re-pushed, since the browser already moved it. */
    var blob=fdLoad();
    var st=fdResolveState(location.href, {
      role: blob.role, fromTab: blob.fromTab, viewWeek: blob.viewWeek, scrollPos: blob.scrollPos
    });
    blob.tab=st.tab; blob.openId=st.openId;
    fdSave(blob);
    FD_TRANSIENT.sheet=null; FD_TRANSIENT.sheetFrom=null; FD_TRANSIENT.stepsDone={};
    FD_TRANSIENT.searchOpen=false; FD_TRANSIENT.query=''; FD_TRANSIENT.nudgeRef='';
    var now=fdCurrentState();
    currentItem=now.openId?fdRouteItem(now.openId):null;
    document.title=pageTitle(currentItem);
    fdRerender();
    fdAnnounce(now);
    try{ window.scrollTo(0, 0); }catch(_){ }
  });
}
