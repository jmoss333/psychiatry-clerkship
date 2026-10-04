/* Front door shell: header, tab row, first-run wizard, and the keyboard map.
   Renderers here are pure (state in, string out). Only Plan 3's wiring touches the DOM.

   Injected via /*__FD_SHELL__*\/ once a later plan registers the marker (see SNIPPET_MARKERS
   in common.py) -- this task does not register it or touch that file. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford (tests/fd-shell.test.mjs and, once wired,
   tests/shell-copy.test.mjs). "Inpatient Psychiatry" is the audience-neutral brand string
   spa_index.html already carries (rewritten to "MMC Psychiatry" for the resident build via
   RESIDENT_REBRAND in resident_section.py) -- reused here rather than inventing a second
   wordmark; per-site role copy instead comes from curriculum.json's roles lists (below), which
   IS build-injected per site.

   fdHeader() renders the tab row via an internal fdTabs() call rather than leaving the caller to
   splice the two together: CLASS-INVENTORY's shell section requires .fd-tabs to be a sibling of
   .fd-header__bar INSIDE .fd-header (position:sticky lives on .fd-header alone, and the rail's
   top:106px assumes bar+tabs are both part of the sticky element) -- two independently top-level
   fragments naively concatenated would land .fd-tabs outside <header> and silently break that.
   fdTabs stays separately exported/callable for anything that only needs to re-render the row. */

function fdAppMode(state){
  var s=state||{};
  return s.appMode===true||s.appInvite===true||s.roleId==='app'||s.role==='app';
}

function fdTabs(tab, appMode, libraryView){
  var cur=(tab==='path'||tab==='library'||tab==='care')?tab:'today';
  /* Both Library views share one app-level destination. */
  var defs=appMode
    ?[{id:'today',label:'On shift'},{id:'library',label:'Library'},
      {id:'care',label:'Patient care resources',short:'Care'}]
    :[{id:'today',label:'Today'},{id:'path',label:'Path'},
      {id:'library',label:'Library'},
      {id:'care',label:'Patient care resources',short:'Care'}];
  var out='<nav class="fd-tabs">';
  for(var i=0;i<defs.length;i++){
    var t=defs[i];
    var active=t.id===cur;
    var cls='fd-tab'+(t.id==='care'?' fd-tab--care':'')+(active?' is-active':'');
    out+='<button type="button" class="'+cls+'" data-fd-tab="'+t.id+'"'+
      (active?' aria-current="page"':'')+(t.short?' aria-label="'+fdEsc(t.label)+'"':'')+'>'+
      (t.short?'<span class="fd-tab__label" data-compact="'+fdEsc(t.short)+'">'+fdEsc(t.label)+'</span>':fdEsc(t.label))+'</button>';
  }
  out+='</nav>';
  return out;
}

/* The five-slot phone dock is a pure projection of the current audience, and EVERY slot has a
   fixed meaning (one-thread redesign, Phase 1, 2026-10-04): Today · Path · Library · Care · "＋ Ask".
   Two slots that used to change meaning under the learner are gone: the centre slot that
   mirrored the page's primary action (data-fd-dock-forward -- the same control the learner could
   already see in the page), and the Browse <details> that duplicated Essentials / Everything /
   Search (the Library tab reaches the first two and the header's own [data-fd-search] bar, which
   is position:sticky at every width, reaches the third). The four destinations are the same four
   the tab row carries, in the same order, so a learner moving between a phone and a desk finds
   nothing rearranged. "＋ Ask" opens the existing capture dialog through the same
   data-capture-open action the header's "＋ Ask a question" uses; the dock keeps its
   aria-haspopup / aria-expanded pair for the Capture open/close handler to update.
   data-fd-dock-source / data-fd-dock-label attributes stay on the surfaces that emit them --
   nothing in the dock renders from them any more. Rendering stays here so every dynamic value
   is escaped once. */
function fdDockModel(state){
  var s=state||{}, app=fdAppMode(s);
  /* APP has no Path (fdTabs), so its dock has four slots, not a fifth that repeats Library. */
  var items=[{id:'today',label:app?'On shift':'Today',attr:'data-fd-tab',value:'today'}];
  if(!app) items.push({id:'path',label:'Path',attr:'data-fd-tab',value:'path'});
  items.push({id:'library',label:'Library',attr:'data-fd-tab',value:'library'});
  items.push({id:'care',label:'Care',attr:'data-fd-tab',value:'care'});
  items.push({id:'capture',label:'＋ Ask',attr:'data-capture-open',value:''});
  return {items:items};
}

function fdDock(state){
  var model=fdDockModel(state);
  var out='<nav class="fd-dock'+(model.items.length===4?' fd-dock--four':'')+'" aria-label="Learning actions">';
  for(var i=0;i<model.items.length;i++){
    var item=model.items[i];
    out+='<button type="button" class="fd-dock__item" '+item.attr+'="'+
      fdEsc(item.value)+'"'+(item.id==='capture'?' aria-haspopup="dialog" aria-expanded="false"':'')+
      (item.id==='care'?' aria-label="Patient care resources"':'')+
      '>'+fdEsc(item.label)+'</button>';
  }
  out+='</nav>';
  return out;
}

/* Header actions (one-thread redesign, Phase 1, owner decision D4): the week pill is gone. The
   week is set from Today ("Change week" on the eyebrow), Path ("Set as my week") and first-run
   setup -- never from a control that sat on every screen regardless of what the screen was about.
   The APP identity chip is NOT a week control and stays; it reuses .fd-weekpill's chip recipe to
   say which workspace is active. "＋ Ask a question" is a standing header control that opens the
   existing capture dialog through the same data-capture-open action the dock's "＋ Ask" uses; it
   replaces the floating .fd-capture-launch--global launcher (spa_index.html fdRenderCapture no
   longer mounts one). .fd-carebtn is gone too: Care is a tab above 640px and a fixed dock slot
   below it, so the header shortcut was a third copy of one destination on the same screen. */
function fdHeader(state){
  var s=state||{};
  var appMode=fdAppMode(s);
  var out='<header class="fd-header"><div class="fd-header__bar">';
  out+='<button type="button" class="fd-brand" data-fd-home>'+
    '<span class="fd-logo">ψ</span>'+
    '<span class="fd-brand__name">Inpatient Psychiatry</span>'+
    '</button>';
  out+='<button type="button" class="fd-searchbtn" data-fd-search>'+
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '+
    'stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle>'+
    '<path d="M21 21l-4-4"></path></svg>'+
    /* Two spellings of one label: the sentence is the accessible name at every width; a phone
       (≤640px, frontdoor.css) clips it visually and shows the aria-hidden "Search" instead, so
       the one-row top bar fits 320px without the name changing underneath a screen reader. */
    '<span class="fd-searchbtn__label"><span class="fd-searchbtn__long">Search a symptom, drug, or task…</span>'+
    '<span class="fd-searchbtn__short" aria-hidden="true">Search</span></span>'+
    '<span class="fd-kbd">⌘K</span>'+
    '</button>';
  out+='<div class="fd-header__actions">'+
    (appMode?'<span class="fd-weekpill fd-weekpill--identity">APP</span>':'')+
    '<button type="button" class="fd-askbtn" data-capture-open="" '+
    'aria-haspopup="dialog" aria-expanded="false">＋ Ask a question</button>'+
    '<button type="button" class="fd-safetybtn" data-fd-safety>✚ Safety</button>'+
    '<button type="button" class="fd-settingsbtn" data-fd-settings '+
    'aria-label="Settings">⚙</button>'+
    '</div>';
  out+='</div>';
  out+=fdTabs(s.tab,appMode,s.libraryView);
  out+='</header>';
  return out;
}

/* Step 1 -- role. .fd-role siblings space themselves via `.fd-role + .fd-role` (frontdoor.css),
   so they are emitted as direct children with no per-role wrapper (CLASS-INVENTORY's ⚠ on
   adjacent-sibling spacing). The name+desc pair needs a grouping element so it stacks inside
   the row's flex layout instead of sitting beside the hint as a third flex item -- no class in
   frontdoor.css covers that grouping span, so it carries the same bare structural (not colour)
   inline style the prototype itself uses. The closing tip line reuses .fd-tip's colour/token but
   needs its own margin/font-size (prototype line 55 vs. the Reader hint .fd-tip alone is authored
   for at line 166), hence the `.fd-tip--setup` modifier rather than a bare `.fd-tip`. */
function fdSetupRole(roles){
  var list=roles||[];
  var out='<div class="fd-setup"><div class="fd-setup__inner">';
  out+='<div class="fd-setup__brand">'+
    '<span class="fd-logo">ψ</span>'+
    '<span class="fd-setup__brand-name">Inpatient Psychiatry</span>'+
    '</div>';
  out+='<h1 class="fd-h1">Who\'s this for?</h1>';
  out+='<p class="fd-sub">No account. Everything saves on this device.</p>';
  for(var i=0;i<list.length;i++){
    var r=list[i]||{};
    out+='<button type="button" class="fd-role" data-fd-role="'+fdEsc(r.id)+'">'+
      '<span style="flex:1;min-width:0">'+
      '<span class="fd-role__name">'+fdEsc(r.name)+'</span>'+
      '<span class="fd-role__desc">'+fdEsc(r.desc)+'</span>'+
      '</span>'+
      '<span class="fd-role__hint">'+fdEsc(r.hint)+'</span>'+
      '</button>';
  }
  out+='<p class="fd-tip fd-tip--setup">Tap once — the next question is the last one.</p>';
  out+='</div></div>';
  return out;
}

/* Step 2 -- week. roleName is the chosen role's display name, already resolved by the caller
   (fd_shell.js does not know curriculum.json's role list -- Plan 3's job); it is escaped here
   like any other interpolated value. The browse tile shares data-fd-week with the numbered
   tiles ("0" means "no week"), so the delegated handler only needs one attribute to watch. */
function fdSetupWeek(index, roleName){
  if(!fdActivePathValid(index)) return fdPathFallback('setup');
  var list=index.weeks;
  var out='<div class="fd-setup"><div class="fd-setup__inner fd-setup__inner--week">';
  out+='<div class="fd-setup__brand">'+
    '<button type="button" class="fd-setup__back" data-fd-back aria-label="Back">‹</button>'+
    '<span class="fd-setup__done">'+fdEsc(roleName)+' ✓</span>'+
    '</div>';
  out+='<h1 class="fd-h1">Where in the rotation?</h1>';
  /* "...from the top bar" until 2026-10-04: the header week pill is gone (D4), so the sentence
     now names the two places the week is actually changed from. */
  out+='<p class="fd-sub">This sets your Today. Change it anytime from Today or Path.</p>';
  out+='<div class="fd-weekgrid">';
  for(var i=0;i<list.length;i++){
    var w=list[i]||{};
    out+='<button type="button" class="fd-weektile" data-fd-week="'+fdEsc(w.n)+'">'+
      '<span class="fd-weektile__n">Week '+fdEsc(w.n)+'</span>'+
      '<span class="fd-weektile__title">'+fdEsc(w.title)+'</span>'+
      '</button>';
  }
  out+='</div>';
  out+='<button type="button" class="fd-weekgrid__browse" data-fd-week="0">'+
    'Not on rotation — just browse</button>';
  out+='</div></div>';
  return out;
}

/* Pure decision logic, deliberately taking a key NAME rather than an event, so every branch is
   testable without synthesising KeyboardEvents. Order matters: escape unwinds the topmost layer
   first, and nothing at all fires while the user is typing or still in first-run setup. */
function fdKeyAction(key, opts){
  var o=opts||{};
  if(o.typing) return null;
  if(o.screen!=='app') return null;
  if(key==='Escape'){ return (o.searchOpen||o.sheetOpen)?{type:'close'}:null; }
  /* Deliberately checked BEFORE the overlay guard below, not above it by accident: global search
     must stay reachable from anywhere -- including over an already-open search panel or the
     safety sheet -- which is the whole point of a ⌘K shortcut. This branch only ever OPENS
     search, so re-firing it while a surface is already open is a harmless no-op the caller can
     treat as "focus search"; escape (above) is what unwinds the layers, closing search before
     the sheet. Do not move this below the overlay guard -- see fd-shell.test.mjs's
     "search stays reachable over an open sheet" / "...when search is already open". */
  if(key==='/'||(key==='k'&&o.meta)) return {type:'search'};
  if(o.searchOpen||o.sheetOpen) return null;
  if(key==='ArrowLeft'||key==='ArrowRight'){
    if(!o.reading) return null;
    return {type:'nav', dir:(key==='ArrowLeft')?-1:1};
  }
  if(key==='1'||key==='2'||key==='3'||key==='4'){
    var tabs=o.appMode?['today','library','care']:['today','path','library','care'];
    if(parseInt(key,10)>tabs.length) return null;
    return {type:'tab', tab:tabs[parseInt(key,10)-1]};
  }
  return null;
}

/* Theme has three MODES the learner picks and two ATTRIBUTES the page paints. Storage holds the
   mode so 'system' survives a round trip and the panel can mark it active; documentElement holds
   the resolved attribute so CSS only ever sees light/dark. Collapsing the two -- storing the
   resolved value -- is what made "follow the OS" impossible to express before: the moment you
   write 'dark' you have lost the fact that the learner asked for "whatever my phone says".
   An unrecognised stored value reads as system rather than light: a device that never expressed
   a preference should follow its OS, which is the author's 2026-09-10 decision. */
function fdThemeMode(stored){
  return (stored==='light'||stored==='dark'||stored==='system')?stored:'system';
}

function fdThemeAttr(mode, prefersDark){
  if(mode==='light'||mode==='dark') return mode;
  return prefersDark?'dark':'light';
}
