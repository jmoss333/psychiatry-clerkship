/* Front door shell: header, tab row, first-run wizard, and the keyboard map.
   Renderers here are pure (state in, string out). Only Plan 3's wiring touches the DOM.

   Injected via /*__FD_SHELL__*\/ -- registered in SNIPPET_MARKERS (common.py) and wired
   into the shell by Plan 3 Task 1. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford (tests/fd-shell.test.mjs and, once wired,
   tests/shell-copy.test.mjs) -- with EXACTLY ONE exception, .fd-attrib below, which is rebranded
   per site by a RESIDENT_REBRAND needle and is therefore allowed to name its audience. See the
   comment at its emission site before touching it. "Inpatient Psychiatry" is the audience-neutral
   brand string
   spa_index.html already carries (rewritten to "MMC Psychiatry" for the resident build via
   RESIDENT_REBRAND in resident_section.py) -- reused here rather than inventing a second
   wordmark; per-site role copy instead comes from curriculum.json's roles lists (below), which
   IS build-injected per site.

   fdHeader() renders the tab row via an internal fdTabs() call rather than leaving the caller to
   splice the two together: CLASS-INVENTORY's shell section requires .fd-tabs to be a sibling of
   .fd-header__bar INSIDE .fd-header (position:sticky lives on .fd-header alone, and the rail's
   top:106px assumes bar+tabs are both part of the sticky element) -- two independently top-level
   fragments naively concatenated would land .fd-tabs outside <header> and silently break that.
   fdTabs stays separately exported/callable for anything that only needs to re-render the row.

   The theme toggle is the one control here with no counterpart in the prototype -- the handoff
   ships a light palette only. It is in the header anyway because the shell's cw_theme/data-theme
   pair is inherited by all 21 clinical tools through clinical-warm.css, and the old shell's only
   toggle lived inside the sidebar that Plan 3 deletes; shipping the front door with the control
   unreachable would leave dark-mode users no way back. It reads state.theme rather than the DOM
   (this file touches neither DOM nor storage), so the caller resolves the current theme and the
   button's label/pressed state can never disagree with the document. */

function fdTabs(tab){
  var cur=(tab==='path'||tab==='library')?tab:'today';
  var defs=[{id:'today',label:'Today'},{id:'path',label:'Path'},{id:'library',label:'Library'}];
  var out='<nav class="fd-tabs">';
  for(var i=0;i<defs.length;i++){
    var t=defs[i];
    var active=(t.id===cur);
    var cls=active?'fd-tab is-active':'fd-tab';
    out+='<button type="button" class="'+cls+'" data-fd-tab="'+t.id+'"'+
      (active?' aria-current="page"':'')+'>'+t.label+'</button>';
  }
  out+='</nav>';
  return out;
}

function fdHeader(state){
  var s=state||{};
  var weekLabel=(typeof s.week==='number'&&!isNaN(s.week))?('Week '+fdEsc(s.week)):'Set week';
  var dark=(s.theme==='dark');
  var out='<header class="fd-header"><div class="fd-header__bar">';
  out+='<button type="button" class="fd-brand" data-fd-home>'+
    '<span class="fd-logo">ψ</span>'+
    '<span class="fd-brand__name">Inpatient Psychiatry</span>'+
    '</button>';
  /* *** THIS IS THE ONE STRING IN THIS FILE THAT IS NOT AUDIENCE-NEUTRAL, AND THAT IS CORRECT. ***
     The attribution restores the line the deleted sidebar carried under its wordmark. It contains
     "MS3" and "Clerkship", both on tests/shell-copy.test.mjs's banned-token list -- but that ban
     governs copy shipping to BOTH sites UNREBRANDED, and this string is rebranded per site by a
     RESIDENT_REBRAND needle in resident_section.py (anchored on `class="fd-attrib"`, exactly as the
     old `<div class="by">` needle was anchored on its own class).

     *** DO NOT ADD THIS STRING TO extractShellCopy() IN tests/shell-copy.test.mjs. *** That
     extractor collects only the shared-and-unrebranded copy; adding this one would go red and read
     like a genuine audience-leak, and the obvious "fix" -- neutering the text -- would silently
     delete the resident site's attribution instead. If it must be covered, assert that the needle
     exists in resident_section.py, not that the string is audience-neutral here.

     Emitted as a SIBLING of .fd-brand, not a second line inside it, for two reasons: the brand is a
     <button> and stacking text inside it would fold the attribution into that button's accessible
     name, and a two-line brand would grow .fd-header past the height .fd-rail/.fd-railnav's
     `top:106px` sticky offset assumes (CLASS-INVENTORY's ⚠ on the shell section). */
  out+='<span class="fd-attrib">MS3 Clerkship · Joshua Moss, MD</span>';
  out+='<button type="button" class="fd-searchbtn" data-fd-search>'+
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '+
    'stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle>'+
    '<path d="M21 21l-4-4"></path></svg>'+
    '<span class="fd-searchbtn__label">Search a symptom, drug, or task…</span>'+
    '<span class="fd-kbd">⌘K</span>'+
    '</button>';
  /* Theme first so the prototype's weekpill+safety pair stays adjacent and the emphasised
     (filled) safety button keeps the rightmost slot it has in the handoff. aria-pressed rather
     than a bare label because this is a toggle whose current state is otherwise only visible. */
  out+='<div class="fd-header__actions">'+
    '<button type="button" class="fd-themebtn" data-fd-theme'+
    ' aria-pressed="'+(dark?'true':'false')+'"'+
    ' aria-label="'+(dark?'Switch to light mode':'Switch to dark mode')+'"'+
    ' title="'+(dark?'Switch to light mode':'Switch to dark mode')+'">'+
    (dark?'☀':'☾')+'</button>'+
    '<button type="button" class="fd-weekpill" data-fd-change-week title="Change week">'+
    weekLabel+' ▾</button>'+
    '<button type="button" class="fd-safetybtn" data-fd-safety>✚ Safety</button>'+
    '</div>';
  out+='</div>';
  out+=fdTabs(s.tab);
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
function fdSetupWeek(weeks, roleName){
  var list=weeks||[];
  var out='<div class="fd-setup"><div class="fd-setup__inner fd-setup__inner--week">';
  out+='<div class="fd-setup__brand">'+
    '<button type="button" class="fd-setup__back" data-fd-back aria-label="Back">‹</button>'+
    '<span class="fd-setup__done">'+fdEsc(roleName)+' ✓</span>'+
    '</div>';
  out+='<h1 class="fd-h1">Where in the rotation?</h1>';
  out+='<p class="fd-sub">This sets your Today. Change it anytime from the top bar.</p>';
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
  if(key==='1'||key==='2'||key==='3'){
    var tabs=['today','path','library'];
    return {type:'tab', tab:tabs[parseInt(key,10)-1]};
  }
  return null;
}
