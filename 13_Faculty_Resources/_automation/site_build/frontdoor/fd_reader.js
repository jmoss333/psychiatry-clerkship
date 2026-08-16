/* Reader -- the article pane (reading / tool preview), its sticky week-navigator rail, the
   prev/next footer, and the mobile fixed action bar. See CLASS-INVENTORY.md section 6 and the
   prototype's reading-pane section (Front-Door-Hi-Fi-v2.dc.html, search "App shell", line ~108
   onward -- the prototype has no top-level "══" marker of its own; it lives inside the App
   shell block).

   Injected via /*__FD_READER__*\/ -- registered in SNIPPET_MARKERS (common.py) and wired
   into the shell by Plan 3 Task 1. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Pure: fdReader(index, state, bodyHtml) -> string. No DOM, no browser storage, no clock access
   -- state arrives fully resolved. state = {ref, week, fromTab, done, desk}. `desk` is accepted
   (the interface brief's shape) but never read: the desktop primary/ghost pair
   (.fd-article__actions) and the mobile fixed bar (.fd-actionbar) are BOTH always emitted,
   unconditionally, with frontdoor.css's existing 1000px breakpoint deciding which one shows --
   the same ruling Task 4 settled for the Today rail vs. pill row. A JS branch on state.desk was
   considered and rejected: see the CLASS-INVENTORY.md responsive-visibility table and
   frontdoor.css's `@media (max-width:999px)` block, both of which now carry
   `.fd-article__actions{display:none}` and the scoped `.fd-article .fd-tip{display:none}` added
   alongside it -- CLASS-INVENTORY previously annotated both "(>=1000px)" on the outline with no
   matching rule anywhere in frontdoor.css, an aspirational note this task's implementer caught
   and the controller had fix before this file was written (see progress.md, Task 7).

   *** bodyHtml is injected VERBATIM AND UNESCAPED. *** Every other interpolated value in this
   file goes through fdEsc; bodyHtml does not, and that is deliberate -- it is the caller's
   already-rendered article markup (Plan 3 passes `marked()` output over the page's real
   markdown), not user input this module receives raw. Escaping it here would double-encode
   entities and print literal tags instead of rendering them. Do not "fix" this by wrapping it in
   fdEsc.

   *** .fd-article__body HAS a rule in frontdoor.css / CLASS-INVENTORY.md (Task 2, 2026-08-16;
   fix round 1 added table/th/td/hr on measured evidence -- 17/67 and 5/67 shipped pages). ***
   Neither the prototype nor CLASS-INVENTORY's Reader section models a container for real
   long-form page content -- the prototype only ever shows a one-paragraph summary
   (.fd-article__lead), because its fixture data never included a full markdown body. bodyHtml
   needed *some* element to live in, so this file names one following the file's own established
   `.fd-article__X` convention (matching .fd-article__head/__h1/__lead/__source/__actions), placed
   in natural reading order right after the lead paragraph. This was flagged to the controller
   rather than silently invented as final: per the repo's "stop and tell me rather than invent a
   class" rule, the class name was invented here but the matching frontdoor.css rule was
   deliberately left for Task 2 to add (comment corrected once it did; this file's own render
   logic did not need to change).

   The mobile action bar (.fd-actionbar) is emitted as a SIBLING of the animated .fd-reader
   element, never a descendant -- CLASS-INVENTORY's ⚠ trap, design handoff §6. .fd-reader carries
   the fdFadeUp/fdSlideL/fdSlideR animation, which creates a new stacking/transform context; a
   position:fixed descendant of a transformed ancestor stops being fixed to the *viewport* and
   becomes fixed to that ancestor instead, so the action bar would scroll away on exactly the
   phones it exists for. tests/fd-reader.test.mjs pins this by asserting on string order and
   containment, not just presence, so a future edit that nests the two back together fails loudly
   even though both classes would still be "there". `.fd-actionbar__spacer` is the opposite: it
   MUST be the last child *inside* `.fd-reader` (reserves scroll room so the fixed bar never
   covers real content), per the same CLASS-INVENTORY note.

   Reuses rather than reimplements: fdEsc / fdItemsForWeek (fd_data.js, Task 1) and
   fdTodayProgress (fd_today.js, Task 4) -- the rail's "Week N · X of Y done" header is built
   from fdTodayProgress specifically so the reader and Today can never disagree about how many
   items are done (per the task brief). is-current / is-done state on the rail rows and the
   done/not-done branch of the primary button's label both key off state.done and state.ref,
   the same map/field Today and Path already read.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. */

var FD_READER_TAB_LABELS={ today:'Today', path:'Path', library:'Library' };

/* backLabel names whichever tab the reader was opened FROM (state.fromTab), not the item's own
   week -- a page can be reached from Today, Path, or Library, and "back" always means "return to
   that tab", which fd_shell.js's data-fd-back handler reads from state.fromTab directly (this
   file never needs to know the URL/routing mechanics, only the label). Defaults to 'Today',
   matching fd_shell.js's fdTabs() fallback for an unrecognised tab id. */
function fdReaderBackLabel(fromTab){
  return FD_READER_TAB_LABELS[fromTab]||'Today';
}

/* The top-of-pane back link, extracted so the TOOL pane (Plan 3 Task 5, rendered in
   spa_index.html's fdRender because it composes the governance notice, which is not pure) uses
   this exact element rather than a second copy that could drift. A tool fills the viewport with
   an iframe; without this the only way back is the header, and the header does not name the tab
   the student came from. */
function fdReaderBackButton(backLabel){
  return '<button type="button" class="fd-reader__back" data-fd-back>‹ '+fdEsc(backLabel)+'</button>';
}

/* Pins the prev/next arithmetic the design brief calls out by name: the same lookup drives both
   the footer buttons AND the (later, wiring-layer) left/right arrow-key handler, so they cannot
   disagree about what "next" means. A ref not present in the named week's item list -- a
   library-only page with no week, or a stale/mismatched week number -- yields {prev:null,
   next:null} rather than throwing; that is the correct answer, not a degraded one, for a page
   with nothing to page through. */
function fdReaderNeighbours(index, ref, week){
  var items=fdItemsForWeek(index, week);
  var pos=-1;
  for(var i=0;i<items.length;i++){
    if(items[i].ref===ref){ pos=i; break; }
  }
  if(pos===-1) return { prev: null, next: null };
  return {
    prev: pos>0 ? items[pos-1] : null,
    next: (pos<items.length-1) ? items[pos+1] : null,
  };
}

/* The next UNREAD item in the week after the current one, wrapping to the first unread item
   overall (excluding the current one) if everything after it is already done -- matches the
   prototype's own doneLabel/auto-advance formula exactly (list.slice(idx+1).find(unread) ||
   list.find(unread-and-not-self) || null). Returns null when ref is not in items (no week, or a
   stale week number) so callers never need a second not-in-week branch. */
function fdReaderNextUnread(items, ref, done){
  var d=done||{}, pos=-1, i;
  for(i=0;i<items.length;i++){
    if(items[i].ref===ref){ pos=i; break; }
  }
  if(pos===-1) return null;
  for(i=pos+1;i<items.length;i++){
    if(!d[items[i].ref]) return items[i];
  }
  for(i=0;i<items.length;i++){
    if(i!==pos&&!d[items[i].ref]) return items[i];
  }
  return null;
}

/* Raw (unescaped) label text -- fdEsc is applied once, by the caller, at the point this string is
   spliced into HTML. Escaping nextAfter.title here AND again at the embed site would double-
   encode entities; escaping only here and never at the embed site would leave the surrounding
   literal words (" of ", "Mark done", the arrow) never escaped at all, which happens to be safe
   for those specific literals but is the wrong general pattern to establish in this file.

   Deliberate deviation from the prototype: the prototype's done-and-nothing-left branch is the
   literal string 'Back to Today' (line 871), regardless of which tab the reader was opened from.
   That is a prototype bug, not a convention worth porting -- its OWN markDone handler navigates
   to st.fromTab, so a page opened from Library would show a primary button reading "Back to
   Today" beside a ghost button reading "Library", visibly contradicting itself. The design spec
   governs behaviour (the handoff README makes prototype *visuals* normative, not this), and it
   says the back affordance names the originating tab -- so this uses the SAME backLabel the ghost
   button and the top-of-page back link already show, not a second hardcoded tab name. */
function fdReaderDoneLabel(isDone, nextAfter, backLabel){
  if(isDone){
    return nextAfter ? ('Next: '+nextAfter.title+' →') : ('Back to '+backLabel);
  }
  return nextAfter ? ('Mark done · Next: '+nextAfter.title+' →') : 'Mark done';
}

function fdReaderKeyPoints(points){
  var list=points||[];
  if(!list.length) return '';
  var out='<div class="fd-keypoints"><div class="fd-keypoints__label">Key points</div>';
  for(var i=0;i<list.length;i++){
    out+='<div class="fd-keypoints__item"><span class="fd-keypoints__bullet">·</span>'+
      '<span>'+fdEsc(list[i])+'</span></div>';
  }
  out+='</div>';
  return out;
}

/* data-fd-open="<ref>" plus the bare data-fd-sheet modifier -- the branch contract fd_search.js
   (header note, "Sheet-vs-navigate signalling") states and fd_sheet.js's attribute table repeats:
   data-fd-open alone NAVIGATES to the page; the same attribute with a bare data-fd-sheet beside it
   means "open that ref as a preview side sheet instead". This button must carry the modifier,
   because its own sub-copy one line below promises the page stays put, and because the prototype
   opens Try-it-now as a sheet unconditionally while a list row's data-fd-open navigates.

   An earlier version of this file left the modifier off and justified it by saying the wiring
   layer could infer the sheet presentation from the click having come from .fd-trynow. That
   rationale is deleted, not merely superseded: a second, undocumented mechanism for one decision
   is exactly how this button came to promise one thing and encode another. The attribute is now
   the only signal, and tests/fd-reader.test.mjs pins it.

   toolTitle falls back to the raw ref for a toolRef that resolves to nothing in the index -- the
   same missing-entry degradation fd_data.js already uses for titles, rather than throwing on a
   dangling reference. */
function fdReaderTryNow(item, index){
  if(!item.toolRef) return '';
  var idx=index||{byRef:{}};
  var tool=(idx.byRef||{})[item.toolRef];
  var toolTitle=tool?tool.title:item.toolRef;
  /* The grouping span carries flex:1;min-width:0 (prototype line 136) so a long unbreakable tool
     title cannot overflow the button -- the same structural, non-colour inline style fd_shell.js
     uses for the analogous .fd-role grouping span (fd_shell.js:84). No class in frontdoor.css
     covers this bare grouping, same as that precedent. */
  return '<button type="button" class="fd-trynow" data-fd-open="'+fdEsc(item.toolRef)+'" '+
    'data-fd-sheet>'+
    '<span class="fd-trynow__icon">▶</span>'+
    '<span style="flex:1;min-width:0">'+
      '<span class="fd-trynow__title">Try it now · '+fdEsc(toolTitle)+'</span>'+
      '<span class="fd-trynow__sub">Opens as a side sheet — this page stays put.</span>'+
    '</span>'+
  '</button>';
}

/* ---- authored calls-to-action ---------------------------------------------------------------
   topic_meta.json's `cta` list, joined and site-filtered by fd_data.js's fdCtaList/fdBuildIndex.
   This is faculty-AUTHORED navigation, not decoration: 104 links across 65 topics, and 16 of them
   carry the `&case=` / `&scenario=` suffix that makes "practice this exact case" land on that case
   instead of the tool's front page. So the href ships WHOLE -- the ref is never re-derived here
   and re-serialised, because that is precisely how a suffix goes missing.

   *** REAL <a href>, NOT a data-fd-open button, and that is deliberate. *** Three reasons, in
   order of weight:
     1. data-fd-open carries a REF and nothing else. fdDispatch would open the tool at its front
        page and drop the case with no error -- the silent failure the tool surface's own comment
        warns about at length.
     2. fdWire() is wrapped in try/catch so a wiring failure leaves a readable page. A link still
        navigates with no JS at all; a button is inert.
     3. Copy-link-address, middle-click and cmd-click are what a student does with a link they
        want to keep. fd_wire.js's link handler declines all of those on purpose.
   fd_wire.js intercepts the plain left click and routes it client-side WITH the suffix; without
   that interception the link still works, as a full page load.

   Both label and href are faculty-authored free text reaching innerHTML, so both go through
   fdEsc -- the href in particular, since a `"` in it would otherwise close the attribute. */
function fdReaderCtas(item){
  var list=(item&&item.cta)||[];
  if(!list.length) return '';
  var out='<div class="fd-ctas">';
  for(var i=0;i<list.length;i++){
    out+='<a class="fd-cta" href="'+fdEsc(list[i].href)+'">'+fdEsc(list[i].label)+' →</a>';
  }
  out+='</div>';
  return out;
}

/* The whole prevnext+tip block is omitted together when neither neighbour exists (a library-only
   item opened outside any week) -- an empty footer with nothing to page through is not useful
   chrome, it is a bug. Each button is independently optional inside that: the first item in a
   week has no prev, the last has no next, and CLASS-INVENTORY requires no breakpoint hide either
   side, so no display:none branch is needed here the way it is for .fd-article__actions. */
function fdReaderPrevNext(neighbours){
  var n=neighbours||{prev:null, next:null};
  if(!n.prev&&!n.next) return '';
  var out='<div class="fd-prevnext">';
  if(n.prev){
    out+='<button type="button" class="fd-prevnext__btn" data-fd-open="'+fdEsc(n.prev.ref)+'">'+
      '<span class="fd-prevnext__label">‹ Prev</span>'+
      '<span class="fd-prevnext__title">'+fdEsc(n.prev.title)+'</span>'+
    '</button>';
  }
  if(n.next){
    out+='<button type="button" class="fd-prevnext__btn is-next" data-fd-open="'+fdEsc(n.next.ref)+'">'+
      '<span class="fd-prevnext__label">Next ›</span>'+
      '<span class="fd-prevnext__title">'+fdEsc(n.next.title)+'</span>'+
    '</button>';
  }
  out+='</div>';
  /* Keyboard-shortcut hint -- meaningless without a keyboard, so frontdoor.css hides THIS
     instance below 1000px via the scoped `.fd-article .fd-tip` selector (not a bare `.fd-tip`
     rule, which would also blank the first-run wizard's unrelated .fd-tip--setup line). No JS
     branch needed here either; the class is emitted unconditionally like everything else in this
     block, exactly like .fd-article__actions below. */
  out+='<p class="fd-tip">Tip: ← → move between items · 1/2/3 switch tabs</p>';
  return out;
}

/* .fd-railnav is emitted only when the open item actually belongs to the named week (inWeek) --
   a library-only item has nothing to navigate between, so a rail with one entry (or a rail for a
   week the item is not even part of) would misinform rather than orient. frontdoor.css hides
   .fd-railnav below 1000px unconditionally (CLASS-INVENTORY, backed rule) regardless of this
   gate, so no second desk-branch is layered on top of the inWeek one.

   The ✓ dot carries aria-hidden="true" for the reason fd_sheet.js:157-176 sets out at length: the
   glyph is emitted in BOTH states and .fd-railnav__dot's CSS colours it (transparent vs filled),
   so a screen reader announces "✓ Page B" for an UNREAD row -- a statement that is false. Hiding
   the character from the a11y tree removes the false claim while keeping the render byte-identical
   (the colour, not the character, is what conveys state visually).

   The other half of fd_sheet.js's treatment -- aria-pressed on the button -- deliberately does NOT
   apply here, and that has not changed: this row is a NAVIGATION control (data-fd-open, "go to
   that page"), not a toggle, and aria-pressed would announce it as a toggle button the click does
   not toggle. That would trade one false statement for another, and tests/fd-reader.test.mjs
   still forbids it.

   *** THE RESIDUE THAT ATTRIBUTE LEFT IS NOW CLOSED (Plan 3 Task 5). *** Until this change a done
   rail row differed from an unread one by DOT COLOUR ALONE (WCAG 1.4.1), because the glyph is
   emitted in both states and correctly aria-hidden. The state now reaches the accessible name
   instead, as a visually-hidden suffix: "Page A, done". That is the third option the previous
   note said was needed and could not be taken while frontdoor.css was frozen for Plan 2 --
   .fd-vh now exists, and it is deliberately a name suffix rather than an ARIA state, because the
   control genuinely is not a toggle.

   The suffix is a SIBLING of .fd-railnav__title, not a child: the title carries
   overflow:hidden/text-overflow:ellipsis, and a hidden node inside it is one CSS edit away from
   being clipped out of existence for everyone. */
function fdReaderRailRow(it, curRef, doneMap){
  var isCur=(it.ref===curRef);
  var isDone=!!(doneMap||{})[it.ref];
  var rowCls=isCur?'fd-railnav__row is-current':'fd-railnav__row';
  var dotCls=isDone?'fd-railnav__dot is-done':'fd-railnav__dot';
  var titleCls=isDone?'fd-railnav__title is-done':'fd-railnav__title';
  return '<button type="button" class="'+rowCls+'" data-fd-open="'+fdEsc(it.ref)+'">'+
    '<span class="'+dotCls+'" aria-hidden="true">✓</span>'+
    '<span class="'+titleCls+'">'+fdEsc(it.title)+'</span>'+
    (isDone?'<span class="fd-vh">, done</span>':'')+
  '</button>';
}

function fdReaderRailNav(weekItems, state, weekN){
  var progress=fdTodayProgress(weekItems, state.done);
  var out='<aside class="fd-railnav">';
  out+='<div class="fd-railnav__label">Week '+fdEsc(weekN)+' · '+progress.done+' of '+progress.total+' done</div>';
  out+='<div class="fd-railnav__list">';
  for(var i=0;i<weekItems.length;i++){ out+=fdReaderRailRow(weekItems[i], state.ref, state.done); }
  out+='</div>';
  out+='</aside>';
  return out;
}

/* Desktop primary/ghost pair -- ALWAYS emitted (see the header comment on state.desk). Reuses
   data-fd-toggle (the established "mark done" action, fd_today.js's row check button) rather
   than a new "mark done" attribute: the auto-advance behaviour the design spec describes (open
   the next unread item, or return to fromTab, after marking done) is wiring-layer logic that can
   key off the SAME attribute by noticing the click happened inside .fd-article__actions /
   .fd-actionbar rather than a list row -- this pure renderer does not need to encode that
   distinction itself. The ghost button reuses data-fd-back, same as the top-of-page back link.

   aria-pressed carries the done state, mirroring fd_sheet.js's step button: THIS is the reader's
   genuine toggle (data-fd-toggle keyed by ref), so the attribute is a true statement here in a way
   it would not be on the navigating rail row above. Its visible label already changes with state
   ("Mark done" vs "Next: …"), but that is prose a caller could reword; the pressed state is the
   machine-readable half, and the mobile bar's twin button below carries the same value so the two
   renderings of one control can never disagree. */
function fdReaderActions(item, doneLabel, backLabel, isDone){
  return '<div class="fd-article__actions">'+
    '<button type="button" class="fd-btn fd-btn--primary" data-fd-toggle="'+fdEsc(item.ref)+'" '+
      'aria-pressed="'+(isDone?'true':'false')+'">'+
      fdEsc(doneLabel)+'</button>'+
    '<button type="button" class="fd-btn fd-btn--ghost" data-fd-back>'+fdEsc(backLabel)+'</button>'+
  '</div>';
}

/* Mobile fixed bar -- ALWAYS emitted, sibling of .fd-reader (see header comment; this is the
   assertion tests/fd-reader.test.mjs pins hardest). CLASS-INVENTORY's ⚠ trap: the primary
   button's label MUST be wrapped in a bare <span> (`.fd-actionbar .fd-btn--primary span` supplies
   the overflow ellipsis) -- a text-only child overflows uncontained on narrow screens. */
function fdReaderActionBar(item, doneLabel, isDone){
  return '<div class="fd-actionbar">'+
    '<button type="button" class="fd-btn fd-btn--ghost" data-fd-back>‹</button>'+
    '<button type="button" class="fd-btn fd-btn--primary" data-fd-toggle="'+fdEsc(item.ref)+'" '+
      'aria-pressed="'+(isDone?'true':'false')+'">'+
      '<span>'+fdEsc(doneLabel)+'</span></button>'+
  '</div>';
}

function fdReader(index, state, bodyHtml){
  var idx=index||{byRef:{}, weeks:[]};
  var st=state||{};
  var item=(idx.byRef&&idx.byRef[st.ref])|| {
    ref: st.ref||'', kind:'read', title: st.ref||'', minutes:null, summary:'',
    points:[], attested:false, toolRef:null, risk:null, cta:[], href:'',
  };

  var hasWeek=(typeof st.week==='number')&&!isNaN(st.week);
  var weekItems=hasWeek?fdItemsForWeek(idx, st.week):[];
  var inWeek=false;
  for(var w=0;w<weekItems.length;w++){
    if(weekItems[w].ref===item.ref){ inWeek=true; break; }
  }

  var neighbours=fdReaderNeighbours(idx, item.ref, st.week);
  var nextAfter=inWeek?fdReaderNextUnread(weekItems, item.ref, st.done):null;
  var isDone=!!(st.done||{})[item.ref];
  var backLabel=fdReaderBackLabel(st.fromTab);
  var doneLabel=fdReaderDoneLabel(isDone, nextAfter, backLabel);

  var kindLabel=(item.kind==='tool')?'Interactive tool':'Reading';
  var eyebrowText=inWeek?('Week '+fdEsc(st.week)+' · '+kindLabel):kindLabel;
  var metaText=(item.kind==='tool')?'self-paced':((typeof item.minutes==='number')?(item.minutes+' min'):'');

  /* The "·" dot only separates the eyebrow from the meta text, so it is emitted only when there
     IS meta text -- a read with no topic_meta.read entry has metaText==='', and a dot with
     nothing after it is a stranded separator, not a degraded-but-honest render. */
  var head='<div class="fd-article__head">'+
    '<span class="fd-eyebrow">'+eyebrowText+'</span>';
  if(metaText) head+='<span class="fd-article__dot">·</span>';
  head+='<span class="fd-article__meta">'+fdEsc(metaText)+'</span>';
  if(item.attested) head+='<span class="fd-attested">✓ faculty-attested</span>';
  head+='</div>';

  var article='<div class="fd-article">'+head+
    '<h1 class="fd-article__h1">'+fdEsc(item.title)+'</h1>'+
    '<p class="fd-article__lead">'+fdEsc(item.summary)+'</p>';
  /* bodyHtml: verbatim, unescaped -- see header comment. Omitted entirely (no empty wrapper) when
     the caller has none, e.g. a render taken before Plan 3 wires marked() in. */
  if(bodyHtml) article+='<div class="fd-article__body">'+bodyHtml+'</div>';
  article+=fdReaderKeyPoints(item.points);
  article+=fdReaderTryNow(item, idx);
  /* After Try-it-now and before the Source line: both are "where to go next" affordances, and the
     single relatedTools[0] button reads as the headline one while the authored list is the rest. */
  article+=fdReaderCtas(item);
  article+='<div class="fd-article__source"><span>Source:</span>'+
    '<span class="fd-src">'+fdEsc(item.ref)+'</span></div>';
  article+=fdReaderActions(item, doneLabel, backLabel, isDone);
  article+=fdReaderPrevNext(neighbours);
  article+='</div>'; /* .fd-article */

  var out='<article class="fd-reader">';
  out+=fdReaderBackButton(backLabel);
  out+='<div class="fd-reader__cols">';
  out+=article;
  if(inWeek) out+=fdReaderRailNav(weekItems, st, st.week);
  out+='</div>';
  out+='<div class="fd-actionbar__spacer"></div>';
  out+='</article>';
  out+=fdReaderActionBar(item, doneLabel, isDone);
  return out;
}
