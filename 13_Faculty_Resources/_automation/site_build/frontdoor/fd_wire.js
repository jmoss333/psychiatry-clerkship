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
       tiles and carries 0 (fd_shell.js's own note).

       *** IT SETS NO WEEK AND CLEARS NONE. *** An earlier version returned setWeek:null, which
       DELETES cw_rotation_start. Spec §5's "lands on Library with no week set" is about browsing
       not REQUIRING a week, not about destroying one already stored -- and step 2 is reachable at
       any time from the header week pill, so a student on day three who taps it to look at the
       list and then chooses "just browse" would have lost their rotation week, their Today, their
       Continue card and their exam countdown in one tap, with no undo and no warning. Controller
       ruling, 2026-08-16. The consequence, stated rather than hidden: nothing in the front door
       clears a rotation week now. That is the correct trade — a wrong week is one tap from being
       corrected on this very screen, while a deleted one has to be remembered. */
    if(!n) return {setup:'', tab:'library', openId:''};
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
  /* Re-firing the shortcut over an ALREADY-OPEN panel must not wipe what has been typed into it.
     fd_shell.js checks '/' and cmd-K before its overlay guard on purpose, so that search stays
     reachable from anywhere -- and says the caller may treat the repeat as "focus search". Taking
     it literally and resetting the query destroyed a half-typed search whenever focus happened to
     be outside the input. The patch still carries searchOpen:true, which is what fdApply reads to
     move focus into the box. */
  if(a.type==='search') return st.searchOpen?{searchOpen:true}:{searchOpen:true, query:''};
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
                   stepsDone:{}, nudgeRef:'', quiz:null };

/* Restore EVERY transient field to its starting value -- the single place that knows what
   "no overlays, no wizard" is. It exists because the first version of popstate reset a subset
   inline and omitted `setup`: the wizard is full-viewport and its step is not routed, so opening
   a page (pushState), tapping the header week pill (no push) and pressing Back moved the address
   while the wizard sat on top of it, the same "back appears not to work" class as the fdApply
   ordering defect. This is still a hand-written list, so tests/fd-wire.test.mjs asserts it covers
   every key in FD_TRANSIENT -- add a field there without adding it here and that goes red.
   stepsDone is rebuilt rather than shared, because callers mutate their own copy. */
function fdResetTransient(){
  FD_TRANSIENT.setup=''; FD_TRANSIENT.searchOpen=false; FD_TRANSIENT.query='';
  FD_TRANSIENT.sheet=null; FD_TRANSIENT.sheetFrom=null; FD_TRANSIENT.stepsDone={};
  FD_TRANSIENT.nudgeRef=''; FD_TRANSIENT.quiz=null;
  FD_SHEET_INVOKER=null; FD_SEARCH_INVOKER=null;
}

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

/* The ward-capture controls and the two Progress actions. Kept OUT of FD_CLICK_SELECTOR and
   matched first, because none of them is a state patch:
     data-cap-*      each is TWO acts -- navigate AND mark the capture triaged, or schedule AND
                     mark it triaged. fdDispatch's data-fd-open branch would do only the first,
                     leaving the question sitting in the triage list forever. This is the same
                     reason the deleted card refused to emit data-f at all
                     (tests/ward-capture-store.test.mjs T12a).
     data-fd-capture opens a dialog that lives outside the front door's render entirely
                     (capOpen(), spa_index.html) and owns its own focus trap.
     data-fd-practice writes the cw_qb_focus handoff key that question-bank-practice.html reads
                     and clears on load, THEN navigates.
     data-fd-studyexport
                     calls window.exportStudy(), which builds a Blob and clicks an <a>.
                     *** ONE COMPOUND WORD, ON PURPOSE. *** tests/fd-wire.test.mjs keeps this
                     file ES5 by scanning it for a module-boundary keyword followed by a space,
                     and a hyphen counts as a word boundary — so the hyphenated spelling would
                     match that scan from inside a comment. Do not rename it apart. */
var FD_CAPTURE_SELECTOR='[data-fd-capture],[data-cap-open],[data-cap-review],[data-cap-drop],'+
  '[data-cap-copy]';
/*     data-fd-quiz    grading is two acts and neither is a state patch: it writes cw_quiz_v1 (the
                       store masteryByBlueprint reads) and it sets a transient per-render answer.
                       fdDispatch returns patches over routed state and has no business writing a
                       learner store. */
var FD_ACTION_SELECTOR='[data-fd-practice],[data-fd-studyexport],[data-fd-quiz]';

/* The three DOM contexts that disambiguate a reused attribute -- see the header. Each names the
   element the emitting module actually renders, so the ambiguity is resolved against the class
   contract (CLASS-INVENTORY.md) rather than against a mount id this file happens to know. */
var FD_SEL_SHEET='.fd-sheet';
var FD_SEL_READER_ACTIONS='.fd-article__actions,.fd-actionbar';
var FD_SEL_SETUP='.fd-setup';

var FD_NUDGE_MS=8000, FD_NUDGE_TIMER=null;

/* Focus bookkeeping. Each is {el, key} -- the element AND a selector that finds its re-rendered
   twin, because #content is rebuilt wholesale on every render and the element alone goes stale
   within one click (see fdFocusKey). FD_LAST_INVOKER is the control the CURRENT action came
   from: set by the click listener, cleared by the keyboard one, so a surface opened with cmd-K
   has no invoker and correctly falls back to #content instead of jumping to a stale click. */
var FD_LAST_INVOKER=null, FD_SHEET_INVOKER=null, FD_SEARCH_INVOKER=null;

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

/* ---- runtime-store reads for the two Today surfaces fd_due.js renders --------------------
   fd_due.js is pure over already-read data; these are the reads. They live here rather than in
   fdCurrentState() (spa_index.html) because this file is the declared impure layer for stores,
   and fdCurrentState composes what these return alongside the reads it already does. Each fails
   to a safe shape rather than throwing: a corrupt store must degrade Today, not blank it. */
function fdDueState(){
  try{ return dueBreakdown(); }catch(_){ return null; }
}

/* A captured question is a SENTENCE, and fdSearchResults' matcher is a substring test tuned for a
   TYPED QUERY of one or two terms: fd_search.js counts any expanded word longer than one
   character appearing anywhere in title+ref+summary as a hit. Hand it "why do we give lorazepam
   for catatonia?" and "for" matches half the library — and because the safety protocols are
   merged FIRST by design (crisis-first search is right for the search box), the top hit for
   almost any sentence became a safety protocol. Observed while driving the page: that exact
   capture offered to open the suicide-risk card.

   So the sentence is reduced to the words that could plausibly BE the topic: five characters or
   more, or an all-caps acronym — psychiatry is full of short ones (CIWA, COWS, MSE, ECT, SSRI)
   and a learner types those in caps. Deliberately NOT a stop-word list: a list is a thing to
   maintain, to get wrong, and to disagree with the search box about. Returns '' when nothing
   survives, which the caller reads as "do not attempt a match" — never as an empty query, which
   fdSearchResults answers with the whole safety kit. */
function fdCaptureQuery(text){
  var words=String(text||'').split(/[^A-Za-z0-9]+/), out=[], i, w;
  for(i=0;i<words.length;i++){
    w=words[i];
    if(!w) continue;
    if(w.length>=5||(w.length>=2&&w===w.toUpperCase()&&/[A-Z]/.test(w))) out.push(w);
  }
  return out.join(' ');
}

/* The re-point the deleted capTriageHtml() asked for by name. It matched a capture to a page
   through the legacy runSearch(), which needed the ~475 KB search-index.json fetch this build no
   longer performs — so with SI permanently null it rendered its degraded branch forever. The
   front door's own index is build-injected, so matching works again with no second download.

   `matching:false` is reserved for the matcher actually THROWING. A capture with no topical word
   in it, or one nothing matched, is not a broken matcher — it is a question worth taking to
   supervision as it stands, and it still renders with its dismiss control. */
function fdCaptureState(st){
  var read, i, items=[], matching=true;
  try{ read=capRead(); }catch(_){ read=null; }
  if(!read||!read.items) return { items: [], matching: true, purpose: '' };
  var idx=fdIndexSafe(), syn=(FD_CURRICULUM&&FD_CURRICULUM.synonyms)||{};
  for(i=0;i<read.items.length;i++){
    var it=read.items[i];
    if(it.triaged) continue;
    var hit=null, q=fdCaptureQuery(it.text);
    if(q){
      try{
        var res=fdSearchResults(idx, q, syn, st);
        if(res.length){
          hit={ ref: res[0].item.ref, title: res[0].item.title, quiz: fdCaptureHasQuiz(res[0].item.ref) };
        }
      }catch(_){ matching=false; }
    }
    items.push({ id: it.id, text: it.text, hit: hit });
  }
  return { items: items, matching: matching, purpose: CAP_PURPOSE };
}

/* topicHasQuiz lives in the first script and is only defined once TOPIC_META is assigned. Wrapped
   so a page whose quiz cannot be determined simply does not offer the review control, rather than
   offering one that seedSRS() would silently ignore. */
function fdCaptureHasQuiz(ref){
  try{ return !!topicHasQuiz(ref); }catch(_){ return false; }
}

/* The exam date, read for the Progress page's field, which is its only writer. Named "exam"
   rather than after its store key: the key is cw_shelf_date and cannot change (phasePolicy() and
   fdExamCountdown() both read it), but "shelf" is a banned token in anything that reaches the
   rendered page, and this name travels straight into state and onto an id attribute. */
function fdExamDate(){
  try{ return localStorage.getItem('cw_shelf_date')||''; }catch(_){ return ''; }
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

/* The one reserved, NOT-SHIPPED ref the front door routes to. Progress & mastery is spec §1's
   "Port, demoted -- a reading-pane page, not a fourth tab", so it travels as an OPEN ITEM
   (?page=__progress__) rather than as a fourth tab. The '__name__' vocabulary is the deleted
   shell's own -- announceRoute() in spa_index.html still carries its __progress__ branch, which
   is why the announcement reads "Progress loaded" with no further wiring -- so this reuses that
   name rather than minting a second one for the same thing.

   k:'special' is the load-bearing half. It is what stops capCtx() from filing a ward capture
   against a slug that does not exist, stops refreshGovernanceNotice() from asking the review
   ledger about a page that was never shipped, and stops fdFetchBody() from fetching
   content/__progress__ and 404ing. All three read `k`, all three predate this task. */
var FD_REF_PROGRESS='__progress__';
function fdIsSpecialRef(ref){ return ref===FD_REF_PROGRESS; }
/* The index is the first authority and the EXTENSION is the fallback, not the other way round.
   A ref the index does not carry is still a shipped tool if it ends in .html — curriculum.json
   drives the index, and a tool that no week and no library column happens to reference would
   otherwise be classified 'md', rendered as an article shell, and have content/<slug>.html
   fetched for it. That is exactly the shape of the defect this task exists to fix, one layer
   down; found by driving a faculty preview at a ref the index does not list, which reported no
   status at all and left the console waiting. fdIsTool (fd_data.js) is the same test the join
   layer uses, so the two cannot disagree. */
function fdRouteKind(ref, it){
  if(fdIsSpecialRef(ref)) return 'special';
  if(it) return (it.kind==='tool')?'tool':'md';
  return fdIsTool(ref)?'tool':'md';
}
function fdRouteTitle(ref){ return fdIsSpecialRef(ref)?'Progress':ref; }

/* The legacy {f,k,t} item shape setRoute()/pageTitle()/announceRoute()/capCtx() all read. Built
   here rather than carried in front-door state so the two vocabularies meet at exactly one
   place.

   *** MEMOISED PER REF, AND THE IDENTITY IS LOAD-BEARING. *** loadFacultyPreviewTool() and
   failFacultyPreviewTool() (spa_index.html) both guard with `currentItem!==item` to drop a tool
   load whose route was navigated away from while its preflight fetch was in flight. currentItem
   is assigned from this function, so while it built a fresh object on every call that guard was
   TRUE unconditionally and the faculty preview could never mount at all. Caching by ref makes
   the comparison mean what it says: same open ref, same object; different ref, different object.

   Keys are prefixed so no ref can address Object.prototype ('r:'+ref rather than ref). Memoising
   unconditionally, including the not-in-index fallback, because "this ref is not a shipped item"
   is itself a stable answer over build-injected data that cannot change at runtime. */
var FD_ROUTE_ITEMS={};
function fdRouteItem(ref){
  var key='r:'+ref;
  if(fdOwns(FD_ROUTE_ITEMS, key)) return FD_ROUTE_ITEMS[key];
  var it=(fdIndexSafe().byRef||{})[ref]||null;
  FD_ROUTE_ITEMS[key]={ f: ref, k: fdRouteKind(ref, it), t: (it&&it.title)||fdRouteTitle(ref) };
  return FD_ROUTE_ITEMS[key];
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

/* ---- focus and announcement for the overlays -----------------------------------------------
   fdMount replaces innerHTML wholesale, so every surface the student was standing in is
   destroyed and rebuilt on each render and focus silently falls to <body>. announceRoute() only
   runs on ROUTE changes, and opening a sheet is not one -- so before this, opening the safety
   protocol moved no focus, said nothing, and returned nothing on close. For a student using a
   screen reader that is silence on the surface where silence costs most.

   *** SCOPE LINE, DELIBERATE. *** What is here is the EVENT half: move focus in, restore it on
   close, announce the open. The MARKUP half -- role="dialog", aria-modal, aria-labelledby on
   .fd-sheet -- lives in fd_sheet.js and is already named in the plan's Task 8 step 3, so it is
   not taken here. Two consequences worth stating rather than discovering:
     - There is no Tab TRAP. A trap belongs with aria-modal, not before it: trapping Tab inside a
       region the a11y tree has not been told is modal leaves a user held somewhere they were
       never told they were. Escape closes, and the close button is reachable, so nobody is stuck.
     - fdFocusSheet sets tabindex="-1" at runtime because the panel needs to be focusable and its
       markup does not say so. That line should MOVE INTO fd_sheet.js when Task 8 adds the dialog
       role, not be duplicated there. */

/* The live region the shell already owns. Deliberately NOT announceRoute(), which also moves
   focus to #content -- calling it for a sheet would fight the focus move two lines later. */
function fdSay(text){
  try{
    var rs=document.getElementById('routeStatus');
    if(rs) rs.textContent=String(text||'');
  }catch(_){ }
}

/* Focus the PANEL, not its first button. Landing on .fd-sheet__close would announce "Close --
   you'll land exactly where you were" as the first thing a student hears from a protocol sheet;
   landing on the container announces the panel and lets the reader run from the title down. */
function fdFocusSheet(announce){
  try{
    var panel=document.querySelector(FD_SEL_SHEET);
    if(!panel) return;
    panel.setAttribute('tabindex', '-1');
    panel.focus();
    if(!announce) return;
    var title=panel.querySelector('.fd-sheet__title');
    if(title) fdSay(title.textContent+' opened');
  }catch(_){ }
}

function fdFocusLost(){
  var a=document.activeElement;
  return !a||a===document.body||a===document.documentElement;
}

/* Restore to the control that opened the surface -- the house shape the deleted shell's
   closeSheet() used and tests/spa-shell-a11y.test.mjs pinned: only when the surface being torn
   down still OWNED focus (a student who has since clicked or tabbed into the page behind must
   not be yanked back), and only to an invoker still connected and visible. `owned` is computed
   BEFORE the re-render, because afterwards the surface is already gone.

   Three attempts, narrowing to a place a keyboard can always continue from: the original element
   if it somehow survived, its re-rendered twin (the usual case -- see fdFocusKey), then #content.
   Never <body>, which is a dead end for keyboard and screen-reader users alike. */
function fdRestoreFocus(inv, owned){
  if(!owned) return;
  var i=inv||{};
  try{
    if(i.el&&i.el.isConnected&&i.el.offsetParent!==null){ i.el.focus(); return; }
    var twin=fdFindVisible(i.key);
    if(twin){ twin.focus(); return; }
    var content=document.getElementById('content');
    if(content){ try{ content.focus({preventScroll:true}); }catch(_){ content.focus(); } }
  }catch(_){ }
}

/* A selector that finds the re-rendered TWIN of a control -- because an element reference does
   not survive here. fdMount replaces #content wholesale on every render, so the header button
   that opened a sheet is a detached node by the time the sheet closes, and an invoker stored as
   an element restores focus to nothing. Storing what identifies it instead means the twin is
   found in whatever markup exists now.

   The value is always written out, even when empty: `[data-fd-safety=""]` matches the header's
   bare Safety button and NOT Today's kit cards, which carry a ref. A bare `[data-fd-safety]`
   matches both, and which one wins would be document order -- accidental, and the accident would
   silently send focus to the wrong control. */
function fdFocusKey(el){
  if(!el||!el.getAttribute||!el.hasAttribute) return '';
  var names=['data-fd-toggle','data-fd-step','data-fd-quiz','data-fd-safety','data-fd-open',
             'data-fd-week','data-fd-setweek','data-fd-tab','data-fd-role','data-fd-search',
             'data-fd-change-week','data-fd-home','data-fd-back'];
  for(var i=0;i<names.length;i++){
    if(el.hasAttribute(names[i])){
      var v=el.getAttribute(names[i])||'';
      if(/["\\]/.test(v)) return '';   /* not worth escaping; a ref never contains these */
      return '['+names[i]+'="'+v+'"]';
    }
  }
  return '';
}

/* First VISIBLE match, because several controls are rendered twice by design -- the reader emits
   the same data-fd-toggle in the desktop pair and the mobile action bar, and frontdoor.css hides
   one of them at every width. Focusing the hidden twin is indistinguishable from losing focus. */
function fdFindVisible(key){
  if(!key) return null;
  try{
    var all=document.querySelectorAll(key);
    for(var i=0;i<all.length;i++){
      if(all[i].offsetParent!==null) return all[i];
    }
  }catch(_){ }
  return null;
}

/* Put focus back on the control the student just used. Without this, ticking a checkbox or a
   protocol step drops focus to <body> every single time -- the same innerHTML-replacement cause
   as the sheet case above, on a surface a keyboard user hits far more often. Skipped whenever
   focus has already been placed somewhere real (a route change, an overlay opening), and the
   FIRST VISIBLE match wins because the reader renders the same data-fd-toggle twice: the desktop
   pair and the mobile action bar, one of which is always display:none. */
function fdRestoreActivated(key){
  if(!key||!fdFocusLost()) return;
  var el=fdFindVisible(key);
  if(el){ try{ el.focus(); }catch(_){ } }
}

/* The shell owns focusGovernanceNotice (it reads GOVERNANCE, facultyPreviewRequest and
   currentItem, none of which this module has). Guarded by typeof so that the front door still
   renders if the modules are ever evaluated without the shell around them -- which is exactly how
   tests/fd-wire.test.mjs evaluates this file. */
function fdFocusGovernance(){
  try{ if(typeof focusGovernanceNotice==='function') focusGovernanceNotice(); }catch(_){ }
}

/* One decision point for where focus goes after a render, so the branches cannot fight. Order is
   the layering: the sheet is above search, which is above the page. */
function fdFocusAfterRender(before, wasInSheet, wasInSearch, routed, key){
  var sheetWas=before.sheet||'', sheetNow=FD_TRANSIENT.sheet||'';
  var searchWas=!!before.searchOpen, searchNow=!!FD_TRANSIENT.searchOpen;

  /* Covers kit -> protocol -> kit as well as opening: each is a full rebuild of the panel, so
     the element that had focus no longer exists in any of them. */
  if(sheetNow&&sheetNow!==sheetWas){
    if(!sheetWas) FD_SHEET_INVOKER=FD_LAST_INVOKER;
    fdFocusSheet(true);
    return;
  }
  if(!sheetNow&&sheetWas){
    var inv=FD_SHEET_INVOKER; FD_SHEET_INVOKER=null;
    fdRestoreFocus(inv, wasInSheet);
    return;
  }
  if(searchNow&&!searchWas) FD_SEARCH_INVOKER=FD_LAST_INVOKER;
  if(searchNow){ fdFocusSearch(); return; }
  if(!searchNow&&searchWas){
    var sinv=FD_SEARCH_INVOKER; FD_SEARCH_INVOKER=null;
    fdRestoreFocus(sinv, wasInSearch);
    return;
  }
  /* announceRoute has already moved focus to #content. The ONE thing allowed to take it from
     there is a high-risk pending-review warning, which lives in #governanceNotice -- OUTSIDE and
     BEFORE #content, so a student sent into #content has been sent past it. focusGovernanceNotice
     is a no-op for every other ledger state, during a faculty preview, and while governance.json
     is still in flight (it defers, and refreshGovernanceNotice completes the take when the fetch
     settles). Its full rationale, including why this is the only correct call site, is in
     spa_index.html above the function. */
  if(routed){ fdFocusGovernance(); return; }
  fdRestoreActivated(key);
  /* Last resort. A re-render inside a still-open sheet that left focus on <body> anyway -- the
     activated control had no identifying attribute, or its replacement is gone -- puts the
     student back on the panel rather than behind it. Silent: the sheet did not open again, so
     re-announcing it would be a second claim about an unchanged surface. */
  if(sheetNow&&wasInSheet&&fdFocusLost()) fdFocusSheet(false);
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
  /* Read BEFORE anything renders: after fdRerender the surface that owned focus is already gone,
     so "did it own focus?" can only be answered now. */
  var active=document.activeElement;
  var wasInSheet=fdIn(active, FD_SEL_SHEET);
  var wasInSearch=fdIn(active, '.fd-search');
  var focusKey=fdFocusKey(active);

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
  /* A quiz answer belongs to the page it was answered on. It is not in FD_PERSIST and it is not
     reset by fdResetTransient on this path (only popstate calls that), so without this it would
     travel to the next page and mark whichever option shares its index as answered. */
  if(next.openId!==before.openId) FD_TRANSIENT.quiz=null;
  if(routed) fdRoute(next, false);
  fdRerender();
  if(routed){
    fdAnnounce(next);
    try{ window.scrollTo(0, 0); }catch(_){ }
  }
  fdFocusAfterRender(before, wasInSheet, wasInSearch, routed, focusKey);
  if(FD_TRANSIENT.nudgeRef) fdNudgeSchedule();
}

/* ---- in-content links -------------------------------------------------------------------------
   An <a href="?page=…"> or <a href="?tool=…&case=…"> rendered INSIDE the page: fd_reader.js's
   authored .fd-cta list, and every such link inside a markdown body that marked() turns into an
   anchor. Restored from the deleted shell's own contentEl link handler (spa_index.html @098ad50,
   the tail of the .pgfb-b/.markrev/.tyo listener), which Task 3 deleted with that listener.

   Without it these links still WORK — they are real URLs and the boot path resolves them — but as
   a full document reload, which throws away the front door and rebuilds it to move one page. With
   it they route like every other navigation.

   *** THE SUFFIX IS THE WHOLE REASON THIS TAKES THE TROUBLE. *** fdDispatch({open:ref}) carries a
   ref and nothing else, so a naive intercept would open family-systems.html at its front page and
   drop `&scenario=…` silently. FD_TOOL_EXTRA is what the tool mount reads, and the shell's comment
   on it says it is captured "once at boot … the only point at which the original address is still
   known". A clicked link is a SECOND such point — the address is right there in the href — so it
   is captured here on the same terms, keyed to the ref the link named and no other. It is written
   even when empty, so a plain link to a tool CLEARS a suffix left over from an earlier one rather
   than replaying somebody else's case.

   Four kinds of click are deliberately left to the browser:
     - modified clicks and non-primary buttons — cmd/ctrl/shift/alt is "open it over there", and
       preventDefault on those is how a site breaks new-tab.
     - anything already handled (defaultPrevented). The faculty-preview lock is a CAPTURE-phase
       listener that stops propagation, so it never reaches here at all; this is the belt.
     - a target other than _self.
     - a ref THIS SITE does not ship. topic_meta.json is shared by both sites, so a cross-site
       authored link exists; fd_data.js filters those out of .fd-cta, but a markdown body can
       still carry one, and a full navigation to a real 404 is a better answer than a click that
       silently does nothing. */
function fdLinkClick(ev, a){
  if(ev.defaultPrevented) return;
  if(ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey||ev.button) return;
  var target=a.getAttribute('target')||'';
  if(target&&target!=='_self') return;
  var href=a.getAttribute('href')||'';
  var m=/[?&](page|tool)=([^&#]+)/.exec(href);
  if(!m) return;
  var ref;
  try{ ref=decodeURIComponent(m[2]); }catch(_){ ref=m[2]; }
  if(!fdOwns(fdIndexSafe().byRef||{}, ref)) return;
  if(m[1]==='tool'){
    var extra='';
    try{ extra=toolExtraFromParams(new URL(href, location.href).searchParams); }catch(_){ }
    FD_TOOL_EXTRA_REF=ref; FD_TOOL_EXTRA=extra;
  }
  ev.preventDefault();
  /* No invoker: the link is inside #content and #content is rebuilt by the navigation, so there
     is nothing to restore focus to. announceRoute places focus instead. */
  FD_LAST_INVOKER=null;
  fdApply(fdDispatch({open:ref}, fdCurrentState()));
}

/* A ward-capture control. Ported from the deleted capTriageClick() (spa_index.html @098ad50),
   with navClick() replaced by the front door's own dispatch and the two in-place re-render calls
   replaced by fdRerender() -- specialRefresh() already defers to it, so this is the same path the
   capture DIALOG takes when it saves.

   Marking triaged happens BEFORE navigating on the open branch, not after: the old code did the
   same, and the reason is that navigation re-renders, so a mark applied afterwards would be
   written to a store the surface has already read. */
function fdCaptureClick(el){
  if(el.hasAttribute('data-fd-capture')){ try{ capOpen(el); }catch(_){ } return; }
  if(el.hasAttribute('data-cap-copy')){
    var payload='';
    try{ payload=capClipboardText(); }catch(_){ }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(payload).then(
        function(){ el.textContent='Copied ✓'; },
        function(){ el.textContent='Copy failed'; });
    } else { el.textContent='Copy unavailable'; }
    return;
  }
  var f=el.getAttribute('data-cap-f');
  var id=el.getAttribute('data-cap-open')||el.getAttribute('data-cap-review')
    ||el.getAttribute('data-cap-drop');
  if(!id) return;
  if(el.hasAttribute('data-cap-review')&&f){
    try{ seedSRS(f); }catch(_){ }
    capMarkTriaged(id); fdRerender(); return;
  }
  if(el.hasAttribute('data-cap-drop')){ capRemove(id); fdRerender(); return; }
  if(el.hasAttribute('data-cap-open')&&f){
    capMarkTriaged(id);
    fdApply(fdDispatch({open:f}, fdCurrentState()));
  }
}

/* ---- "Test yourself" -----------------------------------------------------------------------
   Ported from the deleted shell's `.tyo` handler (spa_index.html @098ad50, inside the contentEl
   click listener). Same three effects, same store shape:
     - reveal which option was correct, and mark the picked one if it was not;
     - bump cw_quiz_v1[<slug>] = {seen, wrong, last} -- the shape masteryByBlueprint() reads to
       fold page questions into blueprint accuracy. Changing it silently changes Progress;
     - once per render only.

   Three deliberate differences from the deleted handler:
   1. The answered flag is TRANSIENT STATE, not a `data-done` attribute on the DOM node. fdMount
      replaces #content wholesale, so an attribute written onto the rendered markup is erased by
      the very re-render that shows the result -- the old shell got away with it because it
      mutated classes in place and never re-rendered.
   2. The options stay FOCUSABLE and carry aria-disabled rather than `disabled`. Grading
      re-renders, so a `disabled` twin cannot take focus back and the keyboard user is dropped to
      <body> at the moment they most want to read what happened. The guard against
      double-counting is the state check below, not the attribute.
   3. The explanation is rendered only after answering (fd_reader.js), so it is never sitting in
      the DOM as an answer key.

   Deliberately NOT done: seedSRS() is not called here. Seeding belongs to marking a page read,
   which is where it already happens, and answering a question is not a statement that the page
   has been worked through. */
function fdQuizClick(el){
  var picked=parseInt(el.getAttribute('data-fd-quiz'), 10);
  if(isNaN(picked)) return;
  if(FD_TRANSIENT.quiz&&typeof FD_TRANSIENT.quiz.picked==='number') return;   /* already graded */
  var st=fdCurrentState(), ref=st.openId;
  var item=(fdIndexSafe().byRef||{})[ref];
  var quiz=item&&item.quiz;
  if(!quiz||!quiz.options[picked]) return;

  FD_TRANSIENT.quiz={ picked: picked };
  var right=!!quiz.options[picked].correct;
  try{
    var all=JSON.parse(localStorage.getItem('cw_quiz_v1')||'{}');
    var e=all[ref]||{seen:0, wrong:0};
    e.seen=(e.seen||0)+1;
    if(!right) e.wrong=(e.wrong||0)+1;
    /* localDayStr (phase_policy.js), not the deleted handler's UTC toISOString().slice(0,10):
       every other date this shell writes is the LOCAL day, and a stamp that flips at 8pm Eastern
       is the drift class fd_wire.js:398 already records for cw_progress_v1. */
    e.last=localDayStr(Date.now());
    all[ref]=e;
    localStorage.setItem('cw_quiz_v1', JSON.stringify(all));
  }catch(_){ }
  fdRerender();
  /* fdRerender does not run fdFocusAfterRender, so focus is restored here or not at all. The twin
     is found by the same attribute the click came from -- which is why data-fd-quiz is in
     fdFocusKey's list too, for the paths that DO go through fdApply. */
  fdRestoreActivated('[data-fd-quiz="'+picked+'"]');
}

/* The two Progress actions. Neither is a state patch: one writes a handoff key and then routes,
   the other downloads a file and writes its own status line into #studyMsg. */
function fdActionClick(el){
  if(el.hasAttribute('data-fd-quiz')){ fdQuizClick(el); return; }
  var cat=el.getAttribute('data-fd-practice');
  if(cat){
    /* Read and REMOVED by question-bank-practice.html on load, so it is a one-shot handoff, not
       a preference -- writing it without navigating would leave it to fire on some later visit. */
    try{ localStorage.setItem('cw_qb_focus', cat); }catch(_){ }
    fdApply(fdDispatch({open:'question-bank-practice.html'}, fdCurrentState()));
    return;
  }
  try{ if(window.exportStudy) window.exportStudy(); }catch(_){ }
}

/* Four delegated listeners for the whole front door (click, keydown, change, popstate), plus one
   scoped to the search panel and one for messages from an embedded tool.

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
    var reach=(ev.target&&ev.target.closest)?ev.target:null;
    if(!reach) return;
    var cap=reach.closest(FD_CAPTURE_SELECTOR);
    if(cap){ FD_LAST_INVOKER=null; fdCaptureClick(cap); return; }
    var act=reach.closest(FD_ACTION_SELECTOR);
    if(act){ FD_LAST_INVOKER=null; fdActionClick(act); return; }
    var el=reach.closest(FD_CLICK_SELECTOR);
    if(!el){
      /* Last, and only when nothing above matched: an authored .fd-cta or a link inside a
         rendered markdown body. Every front-door control is a <button> carrying data-fd-*, so
         this branch can never shadow one. */
      var link=reach.closest('a[href]');
      if(link) fdLinkClick(ev, link);
      return;
    }
    FD_LAST_INVOKER={ el: el, key: fdFocusKey(el) };
    fdApply(fdDispatch(fdWireTarget(el), fdCurrentState()));
  });

  /* The fourth listener, and the only `change` one. The exam-date field is the sole writer of
     cw_shelf_date; delegated on document because #content is rebuilt on every render, which
     would drop an element-bound handler on the first tab switch.

     It deliberately does NOT re-render. A `change` on a date input fires when the value is
     committed, and re-rendering rebuilds #content wholesale -- which would take focus out of the
     field the student is still standing in. The countdown on Today reads the key on its next
     render, which is the next thing they do. */
  document.addEventListener('change', function(ev){
    var el=ev.target;
    if(!el||!el.hasAttribute||!el.hasAttribute('data-fd-examdate')) return;
    try{ localStorage.setItem('cw_shelf_date', String(el.value||'')); }catch(_){ }
  });

  window.addEventListener('keydown', function(ev){
    var key=ev.key, typing=fdIsTyping(ev.target);
    /* A surface opened from the keyboard has no invoking control, so closing it falls back to
       #content rather than restoring focus to whatever was last clicked, possibly minutes ago. */
    FD_LAST_INVOKER=null;
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

  /* ---- messages from an embedded tool -------------------------------------------------------
     Restored with the tool surface (Plan 3 Task 5). This listener was deleted in Task 3 along
     with the nav.json block that happened to host it, which took four shipped affordances with
     it. Senders in this tree, as of the learning-path.html retirement (Plan 3 Task 6):

       openPage    question-bank-practice.html (twice -- one of them f:'__home__'),
                   "Tool Launcher Badges.html"
       openLibrary NO tool sender left -- learning-path.html was the only one, and it was
       search      retired with this swap. Both branches are kept anyway: they are part of the
                   published host contract that HANDOFF_tool-launcher.md documents for tools
                   built outside this repo, and the preview LOCK on them is still exercised
                   (tests/smoke/faculty-console.spec.js posts openLibrary at a locked preview;
                   tests/fd-tool.test.mjs pins the guard's source). Deleting them would drop a
                   documented affordance and a security-relevant guard to save nine lines.
       theme       question-bank-practice.html, review.html
       faculty-preview-question-status
                   question-bank-practice.html. The faculty console's QUESTION preview cannot
                   resolve without this relay: only the tool itself knows whether the item under
                   review rendered, and only the shell can answer the console.

     NOT restored: 'ic-size' (interview-circle.html). It posts only when its OWN url carries
     ?embed=1, which the tool frame has never passed, and .fd-toolframe now fills its pane by
     layout -- an explicit pixel height would fight flex rather than help it.

     The preview lock comes first for every NAVIGATING type, matching the deleted handler and
     tests/smoke/faculty-console.spec.js, which posts all three at a locked preview and asserts
     the frame stayed put. 'theme' is deliberately exempt: it changes no route, and a reviewer's
     frame going dark is not an escape from the item under review.

     An unknown openPage ref is ignored rather than opened. The deleted handler looked the slug
     up among the nav buttons and silently did nothing when it was absent; opening it anyway
     would render an article shell titled with the raw slug over a 404. */
  window.addEventListener('message', function(ev){
    var d=ev.data||{};
    if(d.type==='faculty-preview-question-status'){
      if(facultyPreviewRequest&&facultyPreviewRequest.surface==='question'
          &&ev.origin===location.origin
          &&currentToolFrame&&ev.source===currentToolFrame.contentWindow
          &&currentItem&&currentItem.f==='question-bank-practice.html'
          &&d.reviewItem===facultyPreviewRequest.reviewItem
          &&d.reviewKey===facultyPreviewRequest.reviewKey
          &&d.reviewToken===facultyPreviewRequest.reviewToken
          &&d.surface==='question'
          &&['ready','not_found','error'].indexOf(d.status)>=0
          &&Object.keys(d).sort().join(',')==='reviewItem,reviewKey,reviewToken,status,surface,type'){
        postFacultyPreviewStatus(d.status, 'question');
      }
      return;
    }
    if(d.type==='theme'&&(d.mode==='dark'||d.mode==='light')){
      document.documentElement.setAttribute('data-theme', d.mode);
      try{ localStorage.setItem('cw_theme', d.mode); }catch(_){ }
      fdRerender();
      return;
    }
    if(d.type!=='openPage'&&d.type!=='openLibrary'&&d.type!=='search') return;
    if(facultyPreviewRequest){ showFacultyPreviewLockNotice(); return; }
    /* No invoking control: focus must not be restored to whatever was last clicked. */
    FD_LAST_INVOKER=null;
    if(d.type==='openLibrary'){
      fdApply({tab:'library', openId:'', sheet:null, sheetFrom:null, searchOpen:false});
      return;
    }
    if(d.type==='search'){ fdApply({searchOpen:true, query:String(d.q||'')}); return; }
    if(!d.f) return;
    /* '__home__' is the deleted shell's name for Today and question-bank-practice.html still
       sends it. It is a TAB here, not an item -- there has never been a __home__ page to open. */
    if(d.f==='__home__'){
      fdApply({tab:'today', openId:'', sheet:null, sheetFrom:null, searchOpen:false});
      return;
    }
    if(!(fdIndexSafe().byRef||{})[d.f]) return;
    fdApply(fdDispatch({open:String(d.f)}, fdCurrentState()));
  });

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
    fdResetTransient();
    var now=fdCurrentState();
    currentItem=now.openId?fdRouteItem(now.openId):null;
    document.title=pageTitle(currentItem);
    fdRerender();
    fdAnnounce(now);
    try{ window.scrollTo(0, 0); }catch(_){ }
  });
}
