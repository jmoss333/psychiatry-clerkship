/* Reader -- the article pane (reading / tool preview), its sticky week-navigator rail, the
   prev/next footer, and the mobile fixed action bar. See CLASS-INVENTORY.md section 6 and the
   prototype's reading-pane section (Front-Door-Hi-Fi-v2.dc.html, search "App shell", line ~108
   onward -- the prototype has no top-level "══" marker of its own; it lives inside the App
   shell block).

   Injected via /*__FD_READER__*\/ once a later plan registers the marker (see SNIPPET_MARKERS
   in common.py) -- this task does not register it or touch that file. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Pure: fdReader(index, state, bodyHtml) -> string. No DOM, no browser storage, no clock access
   -- state arrives fully resolved. state = {ref, week, fromTab, done, desk, toolExpanded}. `desk` is accepted
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

   *** .fd-article__body is the long-form content container. *** It follows the file's established
   `.fd-article__X` convention (matching .fd-article__head/__h1/__lead/__source/__actions) and
   sits in natural reading order after the lead. Task 3 defines its readable 16.5px/1.72/62ch
   treatment, descendant typography, and CLASS-INVENTORY entry so rendered markdown is not left
   with plain-text defaults.

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

var FD_READER_TAB_LABELS={ today:'Today', path:'Path', library:'Library', care:'Patient care resources' };

/* backLabel names whichever tab the reader was opened FROM (state.fromTab), not the item's own
   week -- a page can be reached from Today, Path, or Library, and "back" always means "return to
   that tab", which fd_shell.js's data-fd-back handler reads from state.fromTab directly (this
   file never needs to know the URL/routing mechanics, only the label). Defaults to 'Today',
   matching fd_shell.js's fdTabs() fallback for an unrecognised tab id. */
function fdReaderBackLabel(fromTab, roleId, appMode){
  if(fromTab==='today'&&(roleId==='app'||appMode===true)) return 'On shift';
  return FD_READER_TAB_LABELS[fromTab]||'Today';
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

/* Related tools open directly so a learner reaches the working controls in one action.
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
  return '<button type="button" class="fd-trynow" data-fd-open="'+fdEsc(item.toolRef)+'">'+
    '<span class="fd-trynow__icon">▶</span>'+
    '<span style="flex:1;min-width:0">'+
      '<span class="fd-trynow__title">Open tool · '+fdEsc(toolTitle)+'</span>'+
    '</span>'+
  '</button>';
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
   apply here: this row is a NAVIGATION control (data-fd-open, "go to that page"), not a toggle, and
   aria-pressed would announce it as a toggle button the click does not toggle. That would trade one
   false statement for another. A done rail row adds a visually-hidden `Completed` suffix, so its
   state is announced without misrepresenting a navigation control as a toggle. */
function fdReaderRailRow(it, curRef, doneMap){
  var isCur=(it.ref===curRef);
  var isDone=!!(doneMap||{})[it.ref];
  var rowCls=isCur?'fd-railnav__row is-current':'fd-railnav__row';
  var dotCls=isDone?'fd-railnav__dot is-done':'fd-railnav__dot';
  var titleCls=isDone?'fd-railnav__title is-done':'fd-railnav__title';
  return '<button type="button" class="'+rowCls+'" data-fd-open="'+fdEsc(it.ref)+'">'+
    '<span class="'+dotCls+'" aria-hidden="true">✓</span>'+
    '<span class="'+titleCls+'">'+fdEsc(it.title)+'</span>'+
    (isDone?'<span class="fd-visually-hidden">Completed</span>':'')+
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
function fdReaderActions(item, doneLabel, backLabel, isDone, nextLink){
  return '<div class="fd-article__actions">'+
    '<button type="button" class="fd-btn fd-btn--primary" data-fd-toggle="'+fdEsc(item.ref)+'" '+
      'aria-pressed="'+(isDone?'true':'false')+'">'+
      fdEsc(doneLabel)+'</button>'+
    (nextLink||'')+
    '<button type="button" class="fd-btn fd-btn--ghost" data-fd-back>'+fdEsc(backLabel)+'</button>'+
  '</div>';
}

/* One-thread redesign, Phase 3 -- the end of a focused page names "the next item" in its week as a
   plain navigation control beside "Mark done". It opens the POSITIONAL next item (the same one the
   prev/next footer and the → key reach), never marks anything, and is omitted when the page is not
   in the reader's week or is that week's last item. The primary keeps its existing label: with
   auto-advance on, marking done also navigates, and a bare "Mark done" would under-describe it. */
function fdReaderNextLink(next, weekN){
  if(!next) return '';
  return '<button type="button" class="fd-article__next" data-fd-open="'+fdEsc(next.ref)+'">'+
    'Next in week '+fdEsc(weekN)+': '+fdEsc(next.title)+' →</button>';
}

/* The leading governance notice the caller prefixes to bodyHtml (fd_wire.js fdOpenResource:
   `bar+body`). On a READING it is relocated, never rewritten: a reviewed receipt joins the one
   status line, and every other notice (pending-compact, pending-high with its role="alert",
   unavailable) moves above the H1. Its bytes are untouched -- the regex only finds where the
   renderGovernanceNotice() element ends, and that renderer never nests its own tag. Tools keep the
   notice where it is (above the frame): a tool's .fd-article__head is display:none at every
   width, so a receipt moved there would vanish. */
var FD_READER_NOTICE_RE=/^(\s*)(<(div|section) class="governance-notice[^"]*"[^>]*>[\s\S]*?<\/\3>)/;
function fdReaderSplitNotice(bodyHtml){
  var html=String(bodyHtml||''), m=FD_READER_NOTICE_RE.exec(html);
  if(!m) return {notice:'', receipt:false, body:html};
  return {
    notice:m[2],
    receipt:m[2].indexOf('<div class="governance-notice reviewed-receipt"')===0,
    body:html.slice(m[0].length)
  };
}

/* "Next in this thread" (one-thread redesign, Phase 3): where this page leads next, 0-3 rows built
   only from data the shell already holds -- the page's practice tool (its own toolRef, else the
   first `role:'practice'` pairing via fdPracticeWith), this week's Case Journeys step
   (fdWeekCaseStep over the read-only longitudinal_case.json; the case tool itself skips it), and
   the next item (in this week, else the first of next week). Titles are verbatim; the only new
   words are the row labels. `st.thread` = {caseArc, pairings, audience} rides on the live render
   state (spa_index.html fdLiveState); without it the practice-pairing and case rows are simply
   absent. Nothing here is stored. */
function fdReaderThreadRow(ref, name, meta, kind, extra){
  return '<li><button type="button" class="fd-nextthread__row" data-fd-open="'+fdEsc(ref)+'">'+
    '<span class="fd-nextthread__mark fd-nextthread__mark--'+(kind==='tool'?'tool':'read')+'" aria-hidden="true"></span>'+
    '<span class="fd-nextthread__text"><span class="fd-nextthread__name">'+fdEsc(name)+'</span>'+
    '<span class="fd-nextthread__meta">'+fdEsc(meta)+(extra||'')+'</span></span></button></li>';
}
function fdReaderThread(idx, st, item, readerWeek, inWeek, neighbours){
  var thread=st.thread||{}, rows='', seen={}, byRef=idx.byRef||{}, practice=null, i;
  var hasWeek=(typeof readerWeek==='number')&&!isNaN(readerWeek);
  seen[item.ref]=true;
  if(item.toolRef&&byRef[item.toolRef]) practice=byRef[item.toolRef];
  if(!practice&&typeof fdPracticeWith==='function'){
    var paired=fdPracticeWith(idx, thread.pairings, item.ref, thread.audience);
    for(i=0;i<paired.length&&!practice;i++){ if(!seen[paired[i].ref]) practice=paired[i]; }
  }
  if(practice&&!seen[practice.ref]){
    seen[practice.ref]=true;
    rows+=fdReaderThreadRow(practice.ref, 'Practice: '+practice.title, 'Tool · practice for this page', 'tool');
  }
  var caseRef=(typeof FD_CASE_TOOL_REF==='string')?FD_CASE_TOOL_REF:'one-patient-six-weeks.html';
  var step=(hasWeek&&!seen[caseRef]&&typeof fdWeekCaseStep==='function')
    ?fdWeekCaseStep(idx, thread.caseArc, readerWeek):null;
  if(step){
    var caseTitle=(byRef[caseRef]&&byRef[caseRef].title)||'Case Journeys';
    var badge=(typeof governanceBadge==='function')?governanceBadge(step.governance,{compact:true}):'';
    /* A real link, not data-fd-open: the action layer drops query parameters and the case week
       lives in ?week=N -- the same precedent as Today's "Open case week N" (fd_today.js). */
    rows+='<li><a class="fd-nextthread__row" href="?tool='+fdEsc(caseRef)+'&amp;week='+fdEsc(step.n)+'">'+
      '<span class="fd-nextthread__mark fd-nextthread__mark--tool" aria-hidden="true"></span>'+
      '<span class="fd-nextthread__text"><span class="fd-nextthread__name">'+fdEsc(caseTitle)+' · Week '+fdEsc(step.n)+' — '+fdEsc(step.title)+'</span>'+
      '<span class="fd-nextthread__meta">Tool · this week on the unit'+badge+'</span></span></a></li>';
    seen[caseRef]=true;
  }
  var next=null, nextMeta='';
  if(inWeek&&neighbours&&neighbours.next){
    next=neighbours.next; nextMeta='next in week '+readerWeek;
  } else if(hasWeek&&typeof fdNextWeek==='function'){
    var nw=fdNextWeek(idx, readerWeek), items=(nw&&nw.items)||[];
    for(i=0;i<items.length&&!next;i++){ if(!seen[items[i].ref]) next=items[i]; }
    if(next) nextMeta='week '+nw.n;
  }
  if(next&&!seen[next.ref]){
    var kind=next.kind==='tool'||fdIsTool(next.ref)?'tool':'read';
    rows+=fdReaderThreadRow(next.ref, next.title, (kind==='tool'?'Tool':'Reading')+' · '+nextMeta, kind);
  }
  if(!rows) return '';
  return '<nav class="fd-nextthread" aria-labelledby="fd-nextthread-title">'+
    '<h2 class="fd-nextthread__title" id="fd-nextthread-title">Next in this thread</h2>'+
    '<ul class="fd-nextthread__list">'+rows+'</ul></nav>';
}

/* "Beyond this page" (README_MEDIA.md M2, direction B): optional podcast and book picks after
   "Next in this thread", before the prev/next footer. Data is the build-inlined media index
   (media_index.py over media_map.json), riding on st.thread.media like the pairings do. Every
   title, author, description, link and guidance line is the libraries' own text, resolved at
   build time; the only words here are the labels below. Nothing is stored and nothing is counted:
   the block never reaches Today, the week list, due reviews or any progress state. A draft map
   inlines no pages, so the block is absent everywhere until the curator approves it.

   The audience switch is two buttons with aria-pressed (data-media-side), shown only when both
   sides exist; spa_index.html's delegated click handler flips them in place and moves focus to the
   first card, so the choice is transient (no state, no URL). "Bring to family meeting" reuses the
   existing capture dialog (data-capture-open) prefilled with titles and authors only
   (data-cap-prefill); nothing is saved until the learner presses Save. Library links carry
   data-media-anchor so the shell can scroll to the category heading on arrival.

   Placement is structural: the block follows the article body, so it can never sit above a
   build-injected crisis block or inside a governance notice. On a safety-kit page it renders as
   plain rows (fd-beyond--quiet), with no visual weight beyond the thread rows above it. */
var FD_MEDIA_PODCAST_NAME='Psychiatry & Psychotherapy Podcast';
function fdReaderMediaListen(entry, guidance){
  var out='<div class="fd-beyond__cards">', items=entry.listen||[], i, ep;
  for(i=0;i<items.length;i++){
    ep=items[i];
    out+='<div class="fd-beyond__card" tabindex="-1">'+
      '<p class="fd-beyond__kicker">For you</p>'+
      '<p class="fd-beyond__name">Episode '+fdEsc(ep.n)+': '+fdEsc(ep.title)+'</p>'+
      '<p class="fd-beyond__meta">'+fdEsc(FD_MEDIA_PODCAST_NAME)+' · '+fdEsc(ep.category)+'</p>'+
      '<a class="fd-beyond__link" href="'+fdEsc(ep.url)+'" target="_blank" rel="noopener noreferrer" '+
        'aria-label="Episode '+fdEsc(ep.n)+' on YouTube (opens in a new tab)">YouTube ↗</a>'+
    '</div>';
  }
  out+='</div>';
  if(guidance.listenSafety) out+='<p class="fd-beyond__note">'+fdEsc(guidance.listenSafety)+'</p>';
  if(entry.listenAll) out+='<p class="fd-beyond__all"><a href="?page='+fdEsc(entry.listenAll.ref)+
    '#'+fdEsc(entry.listenAll.anchor)+'" data-media-anchor="'+fdEsc(entry.listenAll.anchor)+'">All '+
    fdEsc(entry.listenAll.category)+' episodes</a></p>';
  return out;
}
function fdReaderMediaFamily(entry, guidance){
  var out='<div class="fd-beyond__cards">', items=entry.family||[], prefill=[], i, bk;
  for(i=0;i<items.length;i++){
    bk=items[i];
    prefill.push(bk.title+(bk.author?' — '+bk.author:''));
    out+='<div class="fd-beyond__card" tabindex="-1">'+
      '<p class="fd-beyond__kicker fd-beyond__kicker--family">For the family</p>'+
      '<p class="fd-beyond__name">'+fdEsc(bk.title)+
        (bk.author?' <span class="fd-beyond__by">· '+fdEsc(bk.author)+'</span>':'')+'</p>'+
      (bk.description?'<p class="fd-beyond__desc">'+fdEsc(bk.description)+'</p>':'')+
      '<a class="fd-beyond__link" href="?page=book_library.md#'+fdEsc(bk.anchor)+'" '+
        'data-media-anchor="'+fdEsc(bk.anchor)+'">In the Book Library</a>'+
    '</div>';
  }
  out+='</div>';
  if(guidance.familySay) out+='<div class="fd-beyond__offer"><strong>How to offer it:</strong> '+
    fdEsc(guidance.familySay)+'</div>';
  if(guidance.familySafety) out+='<p class="fd-beyond__safety">'+fdEsc(guidance.familySafety)+'</p>';
  out+='<div class="fd-beyond__actions">'+
    '<button type="button" class="fd-btn fd-btn--ghost fd-beyond__bring" data-capture-open '+
      'data-cap-prefill="'+fdEsc(prefill.join('; '))+'">＋ Bring to family meeting</button>'+
    (entry.practiceRef?'<a class="fd-beyond__practice" href="?tool='+fdEsc(entry.practiceRef)+'">'+
      'Practice the offer in Family Systems →</a>':'')+
  '</div>';
  if(entry.familyAll) out+='<p class="fd-beyond__all"><a href="?page='+fdEsc(entry.familyAll.ref)+
    '#'+fdEsc(entry.familyAll.anchor)+'" data-media-anchor="'+fdEsc(entry.familyAll.anchor)+'">All '+
    fdEsc(entry.familyAll.category)+' books</a></p>';
  return out;
}
function fdReaderMedia(media, ref, quiet){
  var pages=media&&media.pages, entry=pages&&Object.prototype.hasOwnProperty.call(pages, ref)?pages[ref]:null;
  if(!entry) return '';
  var guidance=media.guidance||{};
  var hasListen=!!(entry.listen&&entry.listen.length), hasFamily=!!(entry.family&&entry.family.length);
  if(!hasListen&&!hasFamily) return '';
  var both=hasListen&&hasFamily;
  var out='<section class="fd-beyond'+(quiet?' fd-beyond--quiet':'')+'" aria-labelledby="fd-beyond-title">'+
    '<div class="fd-beyond__head"><h2 class="fd-beyond__title" id="fd-beyond-title">Beyond this page</h2>'+
    '<span class="fd-beyond__tag">Suggested, not required</span></div>';
  if(both){
    out+='<div class="fd-beyond__switch" role="group" aria-label="Who it is for">'+
      '<button type="button" class="fd-beyond__opt" data-media-side="listen" aria-pressed="true" '+
        'aria-controls="fd-beyond-listen">For you · listen</button>'+
      '<button type="button" class="fd-beyond__opt" data-media-side="family" aria-pressed="false" '+
        'aria-controls="fd-beyond-family">For the family · read</button>'+
    '</div>';
  }
  if(hasListen) out+='<div class="fd-beyond__panel" id="fd-beyond-listen" data-media-panel="listen">'+
    fdReaderMediaListen(entry, guidance)+'</div>';
  if(hasFamily) out+='<div class="fd-beyond__panel" id="fd-beyond-family" data-media-panel="family"'+
    (both?' hidden':'')+'>'+fdReaderMediaFamily(entry, guidance)+'</div>';
  out+='</section>';
  return out;
}
function fdReaderIsSafetyPage(idx, ref){
  var kit=(idx&&idx.kit)||[];
  for(var i=0;i<kit.length;i++){ if(kit[i]&&kit[i].item&&kit[i].item.ref===ref) return true; }
  return false;
}

/* Mobile fixed bar -- ALWAYS emitted, sibling of .fd-reader (see header comment; this is the
   assertion tests/fd-reader.test.mjs pins hardest). CLASS-INVENTORY's ⚠ trap: the primary
   button's label MUST be wrapped in a bare <span> (`.fd-actionbar .fd-btn--primary span` supplies
   the overflow ellipsis) -- a text-only child overflows uncontained on narrow screens. */
function fdReaderActionBar(item, doneLabel, isDone, backLabel){
  return '<div class="fd-actionbar">'+
    '<button type="button" class="fd-btn fd-btn--ghost" data-fd-back aria-label="Back to '+fdEsc(backLabel)+'">‹</button>'+
    '<button type="button" class="fd-btn fd-btn--primary" data-fd-toggle="'+fdEsc(item.ref)+'" '+
      'aria-pressed="'+(isDone?'true':'false')+'" data-fd-dock-source="primary-reader" data-fd-dock-label="'+fdEsc(doneLabel)+'">'+
      '<span>'+fdEsc(doneLabel)+'</span></button>'+
  '</div>';
}

/* A view-mode toggle, not a disclosure: the tool stays mounted in both states. The label is
   deliberately stable while aria-pressed carries the state, following the ARIA toggle-button
   contract. It sits outside the iframe so every governed tool shares one implementation. */
function fdReaderToolToggle(expanded){
  return '<button type="button" class="fd-btn fd-btn--ghost" data-fd-expand-tool '+
    'aria-pressed="'+(expanded?'true':'false')+'" aria-controls="fd-tool-region">'+
    '<span>Expand tool</span><span aria-hidden="true">↗</span></button>';
}

/* ONE not-found surface for both ref kinds. Before this, an unknown ?page= left the dead slug in
   the address bar while the app showed something else (so a copied URL lied), and an unknown
   ?tool= rendered the raw filename as the page title and framed a 404 -- two different broken
   states for the same mistake (Fresh Eyes Audit A4).

   The governance line stays exactly as it was. Failing closed on review status is correct: the
   shell genuinely cannot vouch for a page it cannot identify, and saying so is the honest answer.
   Only the presentation around it was broken. */
function fdNotFound(ref){
  return '<article class="fd-reader fd-reader--notfound">'+
    '<button type="button" class="fd-reader__back" data-fd-back>‹ Back</button>'+
    '<div class="fd-reader__cols"><div class="fd-article">'+
    '<div class="fd-article__head"><span class="fd-eyebrow">Not found</span></div>'+
    '<h1 class="fd-article__h1">We couldn’t find that page</h1>'+
    '<p class="fd-article__lead">The link may be out of date, or the page may have been '+
    'retired. Search for it, or browse the Library.</p>'+
    '<div class="governance-notice unavailable">Review status unavailable—verify with faculty</div>'+
    '<div class="fd-article__source"><span>Requested:</span>'+
    '<span class="fd-src">'+fdEsc(ref||'')+'</span></div>'+
    '<div class="fd-article__actions">'+
    '<button type="button" class="fd-btn fd-btn--primary" data-fd-tab="today">Back to Today</button>'+
    '<button type="button" class="fd-btn fd-btn--ghost" data-fd-tab="library">Browse the Library</button>'+
    '</div>'+
    '</div></div></article>';
}

function fdReader(index, state, bodyHtml){
  var idx=index||{byRef:{}, weeks:[]};
  var st=state||{};
  /* A ref the site does not know at all gets the not-found surface rather than a reader built
     around a synthesized item whose title is the raw filename. Guarded on idx.known so this only
     applies to a fully-built index -- a caller passing a bare {byRef:{}} (tests, early boot)
     keeps the old degrade-gracefully path rather than showing every page as missing. */
  if(idx.known&&st.ref&&!idx.known[st.ref]) return fdNotFound(st.ref);
  var item=(idx.byRef&&idx.byRef[st.ref])||(typeof fdKnownItem==='function'?fdKnownItem(idx, st.ref):{
    ref: st.ref||'', kind:'read', title: st.ref||'', minutes:null, summary:'',
    points:[], attested:false, toolRef:null, risk:null, href:'',
  });
  /* Direct .html routes such as the rp-* tools can be intentionally absent from the
     Library projection while still being governed tool routes. Extension inference keeps the
     shared control literal across all tools instead of silently treating those routes as reads. */
  var isTool=item.kind==='tool'||fdIsTool(item.ref||st.ref);

  var readerWeek=fdProgressWeek(st,idx);
  var hasWeek=(typeof readerWeek==='number')&&!isNaN(readerWeek);
  var weekItems=hasWeek?fdItemsForWeek(idx, readerWeek):[];
  var doneMap=fdProgressForWeek(idx,st,readerWeek);
  var inWeek=false;
  for(var w=0;w<weekItems.length;w++){
    if(weekItems[w].ref===item.ref){ inWeek=true; break; }
  }

  var neighbours=fdReaderNeighbours(idx, item.ref, readerWeek);
  var nextAfter=inWeek?fdReaderNextUnread(weekItems, item.ref, doneMap):null;
  var isDone=!!doneMap[item.ref];
  var backLabel=fdReaderBackLabel(st.fromTab,st.roleId,st.appMode);
  var doneLabel=fdReaderDoneLabel(isDone, nextAfter, backLabel);
  var blockHandoff=typeof fdBlockPageHandoff==='function'
    ?fdBlockPageHandoff(st.block, item.ref, doneMap):null;
  if(blockHandoff) doneLabel=fdBlockHandoffLabel(blockHandoff);

  /* A rights reference keeps every TOOL MECHANIC below (it is still an .html artifact in the tool
     frame, with the same toolbar and expand control) but must not be LABELLED one: "Interactive
     tool · self-paced" over a page whose whole purpose is to say the instrument is not reproduced
     here is the contradiction A3 reported. isTool stays extension-derived for the mechanics; only
     the copy branches. */
  var isRights=(item.rights===true);
  var kindLabel=isRights?'Reference':(isTool?'Interactive tool':'Reading');
  var metaText=isRights?'instrument not reproduced here'
    :(isTool?'self-paced':((typeof item.minutes==='number')?(item.minutes+' min'):''));
  var weekPos=0;
  for(w=0;w<weekItems.length;w++){ if(weekItems[w].ref===item.ref){ weekPos=w+1; break; } }

  /* ONE status line (one-thread redesign, Phase 3): "Reading · 5 min · Week 2 · 2 of 5 ·
     ✓ faculty-attested · Reviewed by … · date". Every string is the one the reader already
     showed; only the arrangement changed. Each "·" only separates two present parts, so a read
     with no topic_meta.read entry never strands a dot. */
  var split=isTool?{notice:'', receipt:false, body:bodyHtml}:fdReaderSplitNotice(bodyHtml);
  var dot='<span class="fd-article__dot">·</span>';
  var head='<div class="fd-article__head"><span class="fd-eyebrow">'+kindLabel+'</span>'+
    (metaText?dot:'')+'<span class="fd-article__meta">'+fdEsc(metaText)+'</span>';
  if(inWeek) head+=dot+'<span class="fd-article__pos">Week '+fdEsc(readerWeek)+' · '+
    weekPos+' of '+weekItems.length+'</span>';
  if(item.attested) head+='<span class="fd-attested">✓ faculty-attested</span>';
  if(split.receipt) head+=split.notice;
  head+='</div>';

  /* The ref rides on the element (data-ref), not on screen: a learner has no use for a file name
     under the article (2026-09-29, the owner's call -- same rule as the protocol sheet's "From:"
     line), but the smoke crawler and faculty feedback still need to know which page is open.
     A pending or unavailable notice leads the article, above the status line and H1. */
  var article='<div class="fd-article" data-ref="'+fdEsc(item.ref)+'">'+
    (split.notice&&!split.receipt?split.notice:'')+head+
    '<h1 class="fd-article__h1">'+fdEsc(item.title)+'</h1>'+
    '<p class="fd-article__lead">'+fdEsc(item.summary)+'</p>';
  /* bodyHtml: verbatim, unescaped -- see header comment. Omitted entirely (no empty wrapper) when
     the caller has none, e.g. a render taken before Plan 3 wires marked() in. */
  if(split.body) article+='<div class="fd-article__body"'+
    (isTool?' id="fd-tool-region"':'')+'>'+split.body+'</div>';
  article+=fdReaderKeyPoints(item.points);
  article+=fdReaderTryNow(item, idx);
  if(!isTool&&st.readingPlaceEligible!==false){
    article+='<p class="fd-reading-place" data-fd-reading-status></p>'+
      '<button type="button" class="fd-reading-place__top" data-fd-reading-top hidden>Start at top</button>';
  }
  article+=fdReaderActions(item, doneLabel, backLabel, isDone,
    inWeek?fdReaderNextLink(neighbours.next, readerWeek):'');
  article+=fdReaderThread(idx, st, item, readerWeek, inWeek, neighbours);
  if(!isTool) article+=fdReaderMedia((st.thread||{}).media, item.ref, fdReaderIsSafetyPage(idx, item.ref));
  article+=fdReaderPrevNext(neighbours);
  article+='</div>'; /* .fd-article */

  var expanded=isTool&&st.toolExpanded===true;
  var out='<article class="fd-reader'+(isTool?' fd-reader--tool':'')+
    (expanded?' is-tool-expanded':'')+'">';
  var back='<button type="button" class="fd-reader__back" data-fd-back>‹ '+
    fdEsc(backLabel)+'</button>';
  if(isTool){
    out+='<div class="fd-reader__toolbar">'+back+fdReaderToolToggle(expanded)+'</div>';
  } else out+=back;
  out+='<div class="fd-reader__cols">';
  out+=article;
  if(inWeek) out+=fdReaderRailNav(weekItems, {ref:st.ref,done:doneMap}, readerWeek);
  out+='</div>';
  out+='<div class="fd-actionbar__spacer"></div>';
  out+='</article>';
  out+=fdReaderActionBar(item, doneLabel, isDone, backLabel);
  return out;
}
