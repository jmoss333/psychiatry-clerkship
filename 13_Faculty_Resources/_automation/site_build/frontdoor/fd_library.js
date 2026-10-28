/* Library -- "Where can I find this?" (one-thread redesign, Phase 2; spec
   docs/superpowers/specs/one-thread-handoff/README.md section 2, visual reference
   "Screen Library.dc.html"). One shell for both views:

     Library                                   <- H1, one sentence
     [Essentials · N | Everything · M] [filter] <- segmented control + filter field
     status line (role="status")
     section index | grouped rows | preview    <- 200px | 1fr | 320px on desktop

   Essentials (the curator's sections, from curriculum.essentials) and Everything (every page
   placed in curriculum.libraryColumns) are two views of ONE Library: both resolve through
   fdBuildIndex (fd_data.js), so this file never reads curriculum.json, topic_meta.json or
   tool_registry.json directly, and the Essentials items are the very objects the Everything
   columns hold (fd_data.js reuses them). A page missing from Everything is a page a learner
   cannot reach except by search, so the Everything count is load-bearing (fd-library.test.mjs).

   Pure: fdLibrary(index, opts) / fdEssentials(index, opts) -> string. No DOM, no browser
   storage, no clock. Everything a render depends on arrives in `opts` from the shell:
     kitSection      the selected section key ('all', 'week', 'tools', or a group index)
     kitToolPreview  the previewed ref (Essentials, desktop only; widened to readings in Phase 2)
     filter          the filter query, matched against titles and hints in the current view
     libraryTask     'all' | 'interview' | 'rounds', a curated navigation shortlist
     week            the actual rotation week (drives "This week"), never the Path's browsed week
     caseArc         longitudinal_case.json (READ-ONLY) for "Case week N" / "Where it is used"
     pairings        pairings.json (READ-ONLY) for "Practice with"
     audience        'ms3' | 'resident', so pairings scoped to one audience stay there
   All of section, filter and preview are transient shell state (fd_wire.js): never persisted,
   never in the URL; section and filter ride on the Library's history entry (owner decision D3).

   Injected via the frontdoor snippet markers (see SNIPPET_MARKERS in common.py). ES5 only:
   var/function, no arrow functions, no template literals -- matches the other frontdoor/ modules.

   Clinical strings render verbatim: a row's summary is topic_meta's tldr byte-for-byte, a tool's
   hint is curriculum.libraryHints byte-for-byte, and the governance badge is the shared
   governanceBadge() helper (spa_index.html) -- "Pending review" / "Pending review · High risk"
   -- on every row it applies to. `<mark>` highlighting wraps the matched run but never changes
   the characters inside it; fdLibraryMark escapes each segment exactly as fdEsc would.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. Page slugs (e.g. shelf.md) are
   identifiers passed through data-fd-open and are fine -- the ban is on prose. The "/" key hint
   reuses .fd-kbd, the class fd_shell.js already uses for the header's ⌘K hint. */

var FD_LIBRARY_LEDE='Everything the rotation uses. Essentials is the short list; Everything is the full catalogue.';
var FD_LIBRARY_FILTER_PLACEHOLDER='Filter by title or topic — e.g. delirium, family meeting';

/* The filter compares one lowercased, whitespace-collapsed phrase as a substring. One phrase
   rather than per-word matching so "family meeting" finds the Family Meeting Playbook and not
   every page that mentions a family; the synonym-expanded, per-word engine is global Search,
   which the zero-results state and the filtered footer hand the same query to. */
function fdLibraryQuery(q){
  return String(q||'').replace(/\s+/g,' ').trim();
}

/* Escaped text with every case-insensitive occurrence of `query` wrapped in <mark>. The
   segments are escaped one at a time so the characters the learner reads are exactly the
   source string's; only the tags are added. An empty query returns fdEsc(text). */
function fdLibraryMark(text, query){
  var src=String(text===null||text===undefined?'':text), q=fdLibraryQuery(query).toLowerCase();
  if(!q) return fdEsc(src);
  var hay=src.toLowerCase(), out='', from=0, at=hay.indexOf(q,from);
  while(at!==-1){
    out+=fdEsc(src.slice(from,at))+'<mark>'+fdEsc(src.slice(at,at+q.length))+'</mark>';
    from=at+q.length;
    at=hay.indexOf(q,from);
  }
  return out+fdEsc(src.slice(from));
}

/* Titles and hints only, in the current view (spec section 2). A reading has no hint, so a
   reading matches on its title alone; summaries are clinical prose, not navigation, and are
   left to Search. */
function fdLibraryMatches(item, query){
  var q=fdLibraryQuery(query).toLowerCase();
  if(!q) return true;
  return String(item.title||'').toLowerCase().indexOf(q)!==-1||
    String(item.hint||'').toLowerCase().indexOf(q)!==-1;
}

/* "Week 1" / "Weeks 1 and 5" / "Weeks 1, 3 and 5". `label` is the singular noun. */
function fdLibraryWeeksLabel(nums, label){
  var n=(nums||[]).length;
  if(!n) return '';
  if(n===1) return label+' '+nums[0];
  var head=nums.slice(0,n-1).join(', ');
  return label+'s '+head+' and '+nums[n-1];
}

/* Row meta: "Reading|Tool|Reference · N min · Safety kit · Week N · Case week N". Every part is
   omitted when absent, so a bare page reads "Reading". */
function fdLibraryMeta(item, used, inKit){
  var parts=[item.rights?'Reference':(item.kind==='tool'?'Tool':'Reading')];
  if(typeof item.minutes==='number') parts.push(item.minutes+' min');
  if(inKit) parts.push('Safety kit');
  var u=used||{weeks:[],caseWeeks:[]}, caseNums=[], i;
  var weekLabel=fdLibraryWeeksLabel(u.weeks||[],'Week');
  if(weekLabel) parts.push(weekLabel);
  for(i=0;i<(u.caseWeeks||[]).length;i++) caseNums.push(u.caseWeeks[i].n);
  var caseLabel=fdLibraryWeeksLabel(caseNums,'Case week');
  if(caseLabel) parts.push(caseLabel);
  return parts.join(' · ');
}

/* Which refs are safety content: the safety kit's pages plus tools the registry files under
   acute-safety (fd_data.js `safety`). Red is reserved for these (spec colour rules). */
function fdLibrarySafetyRefs(index){
  var out={}, kit=(index&&index.kit)||[];
  for(var i=0;i<kit.length;i++){ if(kit[i]&&kit[i].item) out[kit[i].item.ref]=true; }
  return out;
}

/* The depth chip on Everything rows (Library re-cut, 2026-10-17): the slug prefix already says
   how deep a reading goes -- pg_ is a pocket card, exp_ a short module -- and the row said
   nothing, so pg_suicide.md and suicide.md looked identical until opened. Same rule as the week
   rows' fdKindChip (fd_today.js): only the exceptions are labelled; a guide, the common case,
   carries no chip, and a tool keeps its own tool / reference chip. Pure over the ref. */
function fdDepthChip(item){
  var ref=(item&&typeof item.ref==='string')?item.ref:'';
  if(!item||item.kind==='tool') return '';
  if(ref.indexOf('pg_')===0) return '<span class="fd-chip is-card">card</span>';
  if(ref.indexOf('exp_')===0) return '<span class="fd-chip is-module">module</span>';
  return '';
}

/* One row, both views. Essentials rows (`fd-kit__reading`) use the serif title; Everything rows
   (`fd-collink`) use the compact sans title. The row itself opens the page (data-fd-open, the
   established convention); in Essentials a second, desktop-only control selects the row for the
   preview pane (data-fd-kit-tool, the existing transient preview action, now for readings too).
   The row's NAME comes first in the markup so assistive tech reads it before the badge, the
   summary and the meta. */
function fdLibraryRow(item, ctx){
  var c=ctx||{}, kit=c.kit||{}, inKit=!!kit[item.ref];
  var safety=inKit||item.safety===true;
  var used=fdUsedIn(c.index,c.caseArc,item.ref);
  var rowCls=c.compact?'fd-collink':'fd-kit__reading';
  var titleCls=c.compact?'fd-collink__label':'fd-kit__title';
  var selected=!c.compact&&c.selectedRef&&c.selectedRef===item.ref;
  /* Essentials rows read the summary (a reading's tldr) or, for a tool, its hint; Everything rows
     are compact and show only the hint. A tool without a hint keeps its summary fallback.
     The hint is what the filter matches, so it is visible and marked even when a tool has a summary. */
  var summary=(c.compact||(item.kind==='tool'&&item.hint))?'':(item.summary||''), text=summary||item.hint||'';
  var out='<div class="fd-kit__item'+(selected?' is-selected':'')+'">';
  out+='<button type="button" class="'+rowCls+'" data-fd-open="'+fdEsc(item.ref)+'">'+
    '<span class="fd-kit__titlerow">'+
      (safety?'<span class="fd-kit__safety" role="img" aria-label="Safety"></span>':'')+
      '<span class="'+titleCls+'">'+fdLibraryMark(item.title,c.query)+'</span>'+
      (item.kind==='tool'?'<span class="fd-chip is-tool">'+(item.rights?'reference':'tool')+'</span>':(c.compact?fdDepthChip(item):''))+
      governanceBadge(item.governance)+
    '</span>'+
    (text?'<span class="fd-kit__summary">'+(summary?fdEsc(text):fdLibraryMark(text,c.query))+'</span>':'')+
    '<span class="fd-kit__meta">'+fdEsc(fdLibraryMeta(item,used,inKit))+'</span>'+
  '</button>';
  if(c.preview){
    out+='<button type="button" class="fd-kit__peek" data-fd-kit-tool="'+fdEsc(item.ref)+'" aria-pressed="'+(selected?'true':'false')+'" aria-label="Preview '+fdEsc(item.title)+'">Preview</button>';
  }
  /* The desktop Essentials pane keeps its Preview action. At compact widths, and in
     Everything at every width, pilot rows offer a separate dialog without changing title taps. */
  if(fdResourcePreviewCopy(item.ref)){
    out+='<button type="button" class="fd-library__details" data-fd-library-details="'+fdEsc(item.ref)+'" aria-haspopup="dialog" aria-label="Details for '+fdEsc(item.title)+'">Details</button>';
  }
  if(typeof fdToolPinAllowed==='function'&&fdToolPinAllowed(c.index,item.ref)){
    var pinned=(c.toolPins||[]).indexOf(item.ref)!==-1;
    out+='<button type="button" class="fd-library__pin" data-fd-tool-pin="'+fdEsc(item.ref)+'" aria-pressed="'+(pinned?'true':'false')+'" aria-label="'+(pinned?'Unpin ':'Pin ')+fdEsc(item.title)+'">'+(pinned?'Unpin':'Pin')+'</button>';
  }
  return out+'</div>';
}

/* Independent of catalogue filters: these are the learner's existing saved positions and pins,
   not additional matches. Keeping this after the grid protects the first phone reading. */
function fdLibraryContinuity(index,opts){
  var o=opts||{}, recent=typeof fdReadingRecentItems==='function'?fdReadingRecentItems(index,o.readingPlaces,o.done):[];
  var pins=typeof fdToolPinsSelect==='function'?fdToolPinsSelect(index,o.toolPins||[],[]):[];
  var out='<section class="fd-continuity" aria-labelledby="fd-continuity-title">'+
    '<h2 class="fd-continuity__title" id="fd-continuity-title" tabindex="-1">On this device</h2>'+
    '<p class="fd-continuity__intro">Your saved places and pinned tools, separate from the filters above. Saved in this browser.</p>'+
    '<p class="fd-continuity__notice" role="status" aria-live="polite">'+fdEsc(o.continuityNotice||'')+'</p>'+
    '<div class="fd-continuity__columns"><div class="fd-continuity__group"><h3>Continue reading</h3>'+
    '<p>Your last three unfinished readings with a saved place. Removing a place keeps your completion record.</p>';
  if(!recent.length)out+='<p>No unfinished reading places saved yet.</p>';
  for(var i=0;i<recent.length;i++){
    var item=recent[i];
    out+='<div class="fd-continuity__row"><button type="button" class="fd-continuity__open" data-fd-open="'+fdEsc(item.ref)+'" data-fd-reading-resume="1">Continue '+fdEsc(item.title)+governanceBadge(item.governance)+'</button>'+
      '<button type="button" class="fd-continuity__remove" data-fd-reading-place-remove="'+fdEsc(item.ref)+'" aria-label="Forget saved place for '+fdEsc(item.title)+'">Remove</button></div>';
  }
  if(o.readingPlaces&&Object.keys(o.readingPlaces).length)out+='<button type="button" class="fd-continuity__clear" data-fd-reading-places-clear>Clear saved places</button>';
  out+='</div><div class="fd-continuity__group"><h3>Pinned tools</h3><p>Choose up to five tools using Pin in the Library. They appear first in Today’s Quick tools.</p>';
  if(!pins.length)out+='<p>No tools pinned yet.</p>';
  for(var p=0;p<pins.length;p++){
    var tool=pins[p];
    out+='<div class="fd-continuity__row"><button type="button" class="fd-continuity__open" data-fd-open="'+fdEsc(tool.ref)+'">'+fdEsc(tool.title)+governanceBadge(tool.governance)+'</button>'+
      '<button type="button" class="fd-continuity__remove" data-fd-tool-pin="'+fdEsc(tool.ref)+'" aria-pressed="true" aria-label="Unpin '+fdEsc(tool.title)+'">Unpin</button></div>';
  }
  if(pins.length)out+='<button type="button" class="fd-continuity__clear" data-fd-tool-pins-clear>Clear pins</button>';
  return out+'</div></div></section>';
}

/* Group heading "Name · count" plus its rows. Every group starts open: the section index is the
   way to narrow, and a collapsed group would hide rows the inventory tests count as reachable. */
function fdLibraryGroup(name, items, ctx, sub){
  var out='<details class="fd-kit__group" open><summary><span class="fd-kit__group-name">'+fdEsc(name)+'</span>'+
    '<span class="fd-kit__group-count">· '+items.length+'</span><span class="fd-kit__chevron" aria-hidden="true">⌄</span></summary>';
  /* Sub-groups (curriculum.libraryColumns[].groups, Library re-cut 2026-10-17): plain headings
     inside the one open group, never nested disclosure -- a collapsed sub-group would hide rows
     the inventory tests count as reachable. `sub` arrives already filtered and non-empty. */
  var subs=Object.prototype.toString.call(sub)==='[object Array]'?sub:null, i, j;
  if(subs&&subs.length){
    for(i=0;i<subs.length;i++){
      out+='<h3 class="fd-kit__subhead">'+fdEsc(subs[i].name)+'<span class="fd-kit__subcount"> · '+subs[i].items.length+'</span></h3>';
      for(j=0;j<subs[i].items.length;j++) out+=fdLibraryRow(subs[i].items[j],ctx);
    }
    return out+'</details>';
  }
  for(i=0;i<items.length;i++) out+=fdLibraryRow(items[i],ctx);
  return out+'</details>';
}

/* Local view controls keep the same routes on desktop and phone (PR 950's segmented control). */
function fdLibraryViews(view, counts){
  var c=counts||{};
  var out='<nav class="fd-library__views" aria-label="Library views">';
  var views=[{id:'essentials',label:'Essentials',count:c.essentials},{id:'full',label:'Everything',count:c.full}];
  for(var i=0;i<views.length;i++){
    var item=views[i], active=item.id===view;
    var count=(typeof item.count==='number')?'<span class="fd-library__view-count"> · '+item.count+'</span>':'';
    out+='<button type="button" class="fd-library__view'+(active?' is-active':'')+'" data-fd-library-view="'+item.id+'" aria-pressed="'+(active?'true':'false')+'">'+item.label+count+'</button>';
  }
  return out+'</nav>';
}

function fdLibraryTasks(task){
  var choices=[{id:'all',label:'All'},{id:'interview',label:'Interview'},{id:'rounds',label:'Rounds'}];
  var out='<div class="fd-library__tasks" role="group" aria-label="Library tasks"><span>Prepare for</span>';
  for(var i=0;i<choices.length;i++){
    var choice=choices[i], active=task===choice.id;
    out+='<button type="button" class="fd-library__task'+(active?' is-active':'')+'" data-fd-library-task="'+choice.id+'" aria-pressed="'+(active?'true':'false')+'">'+choice.label+'</button>';
  }
  return out+'</div>';
}

function fdLibraryTaskEmpty(query, label){
  var q=fdLibraryQuery(query);
  return '<section class="fd-library__empty" aria-labelledby="fd-library-empty-h">'+
    '<h2 class="fd-library__empty-h" id="fd-library-empty-h">No resources match these filters</h2>'+
    '<p class="fd-library__empty-p">'+fdEsc(label)+' is a small shortlist. Try another section, clear a filter, or search the whole library.</p>'+
    '<div class="fd-library__empty-actions">'+
      '<button type="button" class="fd-btn fd-btn--primary" data-fd-search data-fd-search-query="'+fdEsc(q)+'">Search the library</button>'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-library-task="all">Clear task</button>'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-kit-section="all">All sections</button>'+
      (q?'<button type="button" class="fd-btn fd-btn--ghost" data-fd-library-filter-clear>Clear filter</button>':'')+
    '</div></section>';
}

/* The filter field. The "/" chip shows only while there is no query and only on desktop (CSS);
   "Clear" takes its place once there is one. The value is re-rendered from state on every
   keystroke -- fd_wire.js restores the caret after the repaint, as it does for Search. */
function fdLibraryFilter(query){
  var q=String(query||'');
  var out='<div class="fd-library__filter" role="search">';
  out+='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" '+
    'stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle>'+
    '<path d="M21 21l-4-4"></path></svg>';
  out+='<input type="text" class="fd-library__filter-input" data-fd-library-filter value="'+fdEsc(q)+'" '+
    'aria-label="Filter the Library by title or topic" placeholder="'+FD_LIBRARY_FILTER_PLACEHOLDER+'" autocomplete="off" spellcheck="false">';
  if(fdLibraryQuery(q)) out+='<button type="button" class="fd-library__filter-clear" data-fd-library-filter-clear>Clear</button>';
  else out+='<span class="fd-kbd fd-library__filter-key" aria-hidden="true">/</span>';
  return out+'</div>';
}

function fdKitIndexButton(key,label,count,selected){
  var active=selected===key;
  return '<button type="button" class="fd-kit__index-item'+(active?' is-active':'')+'" data-fd-kit-section="'+fdEsc(key)+'" aria-pressed="'+(active?'true':'false')+'">'+
    '<span>'+fdEsc(label)+'</span><span class="fd-kit__index-count">'+count+'</span></button>';
}

/* The companion sits in the readings column between the page h1 and the preview pane h2, so it is
   announced at level 2 (axe heading-order, 2026-10-07: h1 -> h3). aria-level keeps the h3 styling
   and the essentials visual baselines unchanged; tests/a11y-heading-level.test.mjs pins it. */
function fdEssentialsTeaching(resources){
  var rows=Array.isArray(resources)?resources:[];
  if(!rows.length) return '';
  var out='<section class="fd-kit__teaching" aria-label="External teaching companion"><h3 aria-level="2">Teaching companion</h3>';
  for(var i=0;i<rows.length;i++){
    out+='<a class="fd-teachinglink" data-teaching-resource="'+fdEsc(rows[i].id)+'" href="'+fdEsc(rows[i].url)+'" target="_blank" rel="noopener noreferrer">'+
      '<span class="fd-teachinglink__title">'+fdEsc(rows[i].title)+' <span class="fd-visually-hidden">(opens in a new tab)</span> <span aria-hidden="true">↗</span></span>'+
      '<span class="fd-teachinglink__description">'+fdEsc(rows[i].description)+'</span></a>'+
      '<p class="fd-teachinglink__note">'+fdEsc(rows[i].note)+'</p>';
  }
  return out+'</section>';
}

/* The desktop Essentials preview pane -- the existing transient tool-preview pane, extended to
   readings (spec section 2). "Where it is used" is derived from curriculum.json's weeks and the
   case weeks whose links name the ref; "Practice with" from pairings.json's practice items. The
   attestation line reads the manifest's governance projection: pending shows the shared badge
   verbatim, reviewed shows "✓ faculty-attested", and an unprojected index (no governance) falls
   back to topic_meta's own facultyReview flag. Nothing here is saved -- the note says so. */
function fdLibraryPreview(item, ctx){
  var c=ctx||{}, kit=c.kit||{}, inKit=!!kit[item.ref];
  var used=fdUsedIn(c.index,c.caseArc,item.ref);
  var practice=fdPracticeWith(c.index,c.pairings,item.ref,c.audience);
  var kind=item.rights?'Reference':(item.kind==='tool'?'Tool':'Reading');
  var kicker=kind+((typeof item.minutes==='number')?' · '+item.minutes+' min':'');
  var text=item.kind==='tool'?(item.hint||item.summary||''):(item.summary||item.hint||'');
  var out='<aside class="fd-kit__tool-preview" id="fd-kit-tool-preview" aria-label="Preview">';
  out+='<p class="fd-kit__preview-kicker">'+fdEsc(kicker)+'</p>';
  out+='<h2 class="fd-kit__preview-title">'+fdEsc(item.title)+'</h2>';
  if(text) out+='<p class="fd-kit__preview-summary">'+fdEsc(text)+'</p>';
  var where=[], i, week;
  for(i=0;i<used.weeks.length;i++){
    week=fdFindWeek(c.index,used.weeks[i]);
    where.push('Week '+used.weeks[i]+(week&&week.title?' · '+week.title:''));
  }
  for(i=0;i<used.caseWeeks.length;i++){
    where.push('Case Journeys · Week '+used.caseWeeks[i].n+(used.caseWeeks[i].title?' — '+used.caseWeeks[i].title:''));
  }
  if(inKit) where.push('Safety kit');
  if(where.length){
    out+='<h3 class="fd-kit__preview-h">Where it is used</h3><ul class="fd-kit__preview-list">';
    for(i=0;i<where.length;i++) out+='<li>'+fdEsc(where[i])+'</li>';
    out+='</ul>';
  }
  if(practice.length){
    out+='<h3 class="fd-kit__preview-h">Practice with</h3>';
    for(i=0;i<practice.length;i++){
      out+='<p class="fd-kit__preview-practice"><strong>'+fdEsc(practice[i].title)+'</strong> · '+
        (practice[i].rights?'reference':(practice[i].kind==='tool'?'tool':'reading'))+
        (practice[i].hint?' — '+fdEsc(practice[i].hint):'')+governanceBadge(practice[i].governance)+'</p>';
    }
  }
  var g=item.governance;
  if(g&&g.status==='pending') out+='<p class="fd-kit__preview-status">'+governanceBadge(g)+'</p>';
  else if((g&&g.status==='reviewed')||(!g&&item.attested===true)) out+='<p class="fd-kit__preview-status fd-kit__preview-attested">✓ faculty-attested</p>';
  out+='<button type="button" class="fd-btn fd-btn--primary fd-kit__preview-open" data-fd-open="'+fdEsc(item.ref)+'" aria-label="Open '+fdEsc(item.title)+'">'+
    (item.kind==='tool'&&!item.rights?'Open tool':'Open reading')+'</button>';
  out+='<p class="fd-kit__preview-note">Preview is not saved. Reload returns to the list.</p>';
  return out+'</aside>';
}

/* Zero results hand the same query to global Search (data-fd-search-query rides on the ordinary
   data-fd-search action; fd_wire.js seeds the dialog with it). */
function fdLibraryEmpty(query){
  var q=fdLibraryQuery(query);
  return '<section class="fd-library__empty" aria-labelledby="fd-library-empty-h">'+
    '<h2 class="fd-library__empty-h" id="fd-library-empty-h">No titles match “'+fdEsc(q)+'”</h2>'+
    '<p class="fd-library__empty-p">This filter checks titles and tool descriptions in the current view. Search also checks summaries and related terms across the library.</p>'+
    '<div class="fd-library__empty-actions">'+
      '<button type="button" class="fd-btn fd-btn--primary" data-fd-search data-fd-search-query="'+fdEsc(q)+'">Search the library</button>'+
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-library-filter-clear>Clear filter</button>'+
    '</div>'+
    '<p class="fd-library__empty-note">Still unsure? <strong>＋ Ask a question</strong> saves it on this device for supervision.</p>'+
  '</section>';
}

function fdLibraryFooter(query){
  var q=fdLibraryQuery(query);
  return '<p class="fd-library__footer">Not seeing it? <button type="button" class="fd-library__searchlink" data-fd-search data-fd-search-query="'+fdEsc(q)+'">Search the library for “'+fdEsc(q)+'” →</button></p>';
}

/* The one shell both views render through. `model` is built by fdLibrary / fdEssentials:
     view        'essentials' | 'full'
     counts      {essentials, full} for the segmented control (live totals, never filtered)
     sections    [{key,label,count}] for the index, in display order
     groups      [{key,name,items}] in display order, ALREADY scoped to the selected section
     selected    the valid section key
     total       items in scope before the filter (the M of "N of M")
     readings    reading count and `pending` pending-reading count for the review banner
     noun        'items' (Essentials) | 'pages' (Everything), as the status line says them
     preview     the previewed item, or null (Essentials desktop only)
     after       markup after the groups (the teaching companion), '' when none */
function fdLibraryShell(model, opts){
  var m=model, o=opts||{}, query=fdLibraryQuery(o.filter), i, g;
  var taskRefs=fdLibraryTaskRefs(o.libraryTask,o.audience), task=taskRefs?o.libraryTask:'all';
  var taskLabel=task==='interview'?'Interview':'Rounds';
  var taskSet={}, scopedTask={}, taskTotal=0, preview=m.preview;
  for(i=0;taskRefs&&i<taskRefs.length;i++) taskSet[taskRefs[i]]=true;
  function matches(item){ return (!taskRefs||taskSet[item.ref]===true)&&fdLibraryMatches(item,query); }
  var ctx={index:m.index,kit:fdLibrarySafetyRefs(m.index),caseArc:o.caseArc,query:query,
    compact:m.view==='full',preview:!!m.preview,selectedRef:m.preview?m.preview.ref:'',toolPins:o.toolPins||[]};
  /* Apply the filter to the scoped groups; sections count their own matches while a query is
     live so the index says where the matches are. */
  var visible=[], matched=0, sectionMatches={};
  for(i=0;i<m.groups.length;i++){
    g=m.groups[i];
    var keep=[];
    for(var j=0;j<g.items.length;j++){
      var item=g.items[j];
      if(taskRefs&&taskSet[item.ref]) scopedTask[item.ref]=item;
      if(matches(item)) keep.push(item);
    }
    matched+=keep.length;
    /* A grouped column keeps its sub-groups through the filter: each sub-group keeps its own
       matches and an emptied sub-group drops with its heading. Items are the same objects as
       g.items, so the counts above are not affected. */
    var keepSub=null;
    if(keep.length&&Object.prototype.toString.call(g.sub)==='[object Array]'){
      keepSub=[];
      for(var s=0;s<g.sub.length;s++){
        var subKeep=[];
        for(var u=0;u<g.sub[s].items.length;u++){ if(matches(g.sub[s].items[u])) subKeep.push(g.sub[s].items[u]); }
        if(subKeep.length) keepSub.push({name:g.sub[s].name,items:subKeep});
      }
    }
    if(keep.length) visible.push({key:g.key,name:g.name,items:keep,sub:keepSub});
  }
  /* Task order spans the original groups: safety must precede the interview reading AND
     its tool, even when Everything places tools before safety. Membership stays scoped. */
  if(taskRefs){
    var taskItems=[];
    for(i=0;i<taskRefs.length;i++){
      var member=scopedTask[taskRefs[i]];
      if(member){ taskTotal++; if(fdLibraryMatches(member,query)) taskItems.push(member); }
    }
    matched=taskItems.length;
    visible=matched?[{key:task,name:taskLabel,items:taskItems}]:[];
    if(m.view==='essentials'){
      preview=null;
      for(i=0;i<taskItems.length;i++) if(taskItems[i].ref===o.kitToolPreview) preview=taskItems[i];
      if(!preview&&matched) preview=taskItems[0];
    }
    ctx.preview=!!preview; ctx.selectedRef=preview?preview.ref:'';
  }
  if(query||taskRefs){
    for(i=0;i<m.sections.length;i++){
      var s=m.sections[i], n=0;
      for(var k=0;k<(s.items||[]).length;k++){ if(matches(s.items[k])) n++; }
      sectionMatches[s.key]=n;
    }
  }
  var status;
  if(taskRefs){
    var sectionLabel='';
    for(i=0;i<m.sections.length;i++) if(m.sections[i].key===m.selected&&m.selected!=='all') sectionLabel=' in '+m.sections[i].label;
    status=query?matched+' of '+taskTotal+' '+taskLabel+' resources'+sectionLabel+' match “'+query+'”.':
      'Showing '+matched+' '+taskLabel+' resources'+sectionLabel+'.';
  } else if(query){
    status=matched?(matched+' of '+m.total+' '+m.noun+' match “'+query+'”.'):('No titles match “'+query+'”.');
  } else status=m.status;

  var out='<section class="fd-library'+(m.view==='essentials'?' fd-kit':'')+'">';
  out+='<div class="fd-library__head"><div class="fd-library__titlebar"><h1 class="fd-library__h1">Library</h1>'+
    '<button type="button" class="fd-library__continuity" data-fd-continuity-show>On this device</button></div>'+
    '<p class="fd-library__lede">'+FD_LIBRARY_LEDE+'</p></div>';
  /* With nothing in curriculum.essentials there is no Essentials to switch to (fdEssentials falls
     back to this view), so the segmented control is withheld rather than offering a dead option. */
  var views=(m.counts&&m.counts.essentials)||m.view==='essentials'?fdLibraryViews(m.view,m.counts):'';
  out+='<div class="fd-library__controls">'+views+fdLibraryFilter(o.filter)+'</div>';
  out+=fdLibraryTasks(task);
  out+='<p class="fd-library__status" role="status" aria-live="polite">'+fdEsc(status)+'</p>';
  var showPreview=!!preview&&!(query&&!matched);
  out+='<div class="fd-library__body'+(showPreview?' has-preview':'')+'">';
  out+='<nav class="fd-kit__index" aria-label="'+(m.view==='essentials'?'Essentials sections':'Catalogue sections')+'"><div class="fd-kit__index-track">';
  for(i=0;i<m.sections.length;i++){
    var sec=m.sections[i];
    out+=fdKitIndexButton(sec.key,sec.label,(query||taskRefs)?sectionMatches[sec.key]:sec.count,m.selected);
  }
  out+='</div></nav>';
  out+='<div class="fd-kit__readings">';
  var review=m.readings;
  if(taskRefs){
    review={total:0,pending:0};
    for(i=0;i<taskItems.length;i++) if(taskItems[i].kind!=='tool'){
      review.total++; if(taskItems[i].governance&&taskItems[i].governance.status==='pending') review.pending++;
    }
  }
  if(review.pending) out+='<div class="fd-kit__review"><details><summary>Faculty re-review · '+review.pending+' of '+review.total+' readings</summary>'+
    '<p>These readings changed since they were last attested and are marked pending review. Open a reading to see its full review notice.</p></details></div>';
  if((query||taskRefs)&&!matched){
    out+=taskRefs?fdLibraryTaskEmpty(query,taskLabel):fdLibraryEmpty(query);
  } else {
    for(i=0;i<visible.length;i++) out+=fdLibraryGroup(visible[i].name,visible[i].items,ctx,visible[i].sub);
    if(query) out+=fdLibraryFooter(query);
    else if(!taskRefs) out+=m.after||'';
  }
  out+='</div>';
  if(showPreview) out+=fdLibraryPreview(preview,{index:m.index,kit:ctx.kit,caseArc:o.caseArc,pairings:o.pairings,audience:o.audience});
  out+='</div>'+fdLibraryContinuity(m.index,o)+'</section>';
  return out;
}

function fdLibraryCounts(index){
  var idx=index||{}, cols=idx.columns||[], ess=idx.essentials||[], full=0, essentials=0, c;
  for(c=0;c<cols.length;c++) full+=(cols[c].items||[]).length;
  for(c=0;c<ess.length;c++) essentials+=(ess[c].items||[]).length;
  return {full:full,essentials:essentials};
}

/* Everything: every page placed in curriculum.json's libraryColumns, one row each, in column
   order (fd_data.js preserves it). Sections are the libraryColumns names. */
function fdLibrary(index, opts){
  var idx=index||{columns:[]}, o=opts||{}, cols=idx.columns||[], groups=[], sections=[], i;
  var total=0, readings=0, pending=0;
  for(i=0;i<cols.length;i++){
    var items=cols[i].items||[];
    total+=items.length;
    for(var j=0;j<items.length;j++){
      if(items[j].kind!=='tool'){ readings++; if(items[j].governance&&items[j].governance.status==='pending') pending++; }
    }
    groups.push({key:String(i),name:cols[i].name,items:items,sub:cols[i].groups||null});
  }
  var selected=String(o.kitSection||'all'), valid=selected==='all';
  for(i=0;i<groups.length;i++) if(groups[i].key===selected&&groups[i].items.length) valid=true;
  if(!valid) selected='all';
  var all=[];
  for(i=0;i<groups.length;i++) all=all.concat(groups[i].items);
  sections.push({key:'all',label:'All',count:total,items:all});
  for(i=0;i<groups.length;i++) sections.push({key:groups[i].key,label:groups[i].name,count:groups[i].items.length,items:groups[i].items});
  var scoped=[], scopedTotal=total, status='Showing all '+total+' pages.';
  for(i=0;i<groups.length;i++){
    if(selected==='all'||groups[i].key===selected) scoped.push(groups[i]);
    if(groups[i].key===selected){ scopedTotal=groups[i].items.length; status='Showing '+groups[i].items.length+' pages in '+groups[i].name+'.'; }
  }
  return fdLibraryShell({
    index:idx,view:'full',counts:fdLibraryCounts(idx),sections:sections,groups:scoped,selected:selected,
    total:scopedTotal,status:status,readings:{total:readings,pending:pending},noun:'pages',preview:null,after:''
  },o);
}

/* Essentials: the curator's sections (readings), "This week" (the rotation week's readings), and
   a Tools group. Falls back to Everything when nothing in curriculum.essentials resolves, so a
   stale kit never blanks the Library. */
function fdEssentials(index, opts){
  var idx=index||{columns:[],essentials:[]}, o=opts||{}, cols=idx.essentials||[];
  var groups=[], tools=[], readings=0, pending=0, c, j;
  /* Use the active Path's assignments, keyed by ref so repeated placements count once.
     The caller supplies the actual rotation week, never the week being browsed in Path. */
  var week=fdFindWeek(idx,o.week), weekRefs=Object.create(null), weekCount=0;
  var weekItems=week&&Array.isArray(week.items)?week.items:[];
  for(var w=0;w<weekItems.length;w++) weekRefs[weekItems[w].ref]=true;
  for(c=0;c<cols.length;c++){
    var items=cols[c].items||[], reads=[], weekReads=[];
    for(j=0;j<items.length;j++){
      var item=items[j];
      if(item.kind==='tool') tools.push(item);
      else{
        reads.push(item); readings++;
        if(weekRefs[item.ref]){ weekReads.push(item); weekCount++; }
        if(item.governance&&item.governance.status==='pending') pending++;
      }
    }
    if(reads.length) groups.push({key:String(c),name:cols[c].name,items:reads,weekItems:weekReads});
  }
  if(!readings&&!tools.length) return fdLibrary(idx,o);
  var selected=String(o.kitSection||'all'), valid=selected==='all'||(selected==='tools'&&tools.length>0)||(selected==='week'&&weekCount>0);
  for(var v=0;v<groups.length;v++) if(groups[v].key===selected) valid=true;
  if(!valid) selected='all';
  var total=readings+tools.length, all=[], weekAll=[], sections=[], i;
  for(i=0;i<groups.length;i++){ all=all.concat(groups[i].items); weekAll=weekAll.concat(groups[i].weekItems); }
  all=all.concat(tools);
  sections.push({key:'all',label:'All',count:total,items:all});
  if(weekCount) sections.push({key:'week',label:'This week',count:weekCount,items:weekAll});
  for(i=0;i<groups.length;i++) sections.push({key:groups[i].key,label:groups[i].name,count:groups[i].items.length,items:groups[i].items});
  if(tools.length) sections.push({key:'tools',label:'Tools',count:tools.length,items:tools});
  var scoped=[], scopedTotal=total, status='Showing all '+total+' Essentials items.';
  if(selected==='week'){
    for(i=0;i<groups.length;i++) if(groups[i].weekItems.length) scoped.push({key:groups[i].key,name:groups[i].name,items:groups[i].weekItems});
    scopedTotal=weekCount; status='Showing '+weekCount+' readings for this week.';
  } else if(selected==='tools'){
    scoped.push({key:'tools',name:'Tools',items:tools});
    scopedTotal=tools.length; status='Showing '+tools.length+' tools.';
  } else {
    for(i=0;i<groups.length;i++){
      if(selected==='all'||groups[i].key===selected) scoped.push({key:groups[i].key,name:groups[i].name,items:groups[i].items});
      if(groups[i].key===selected){ scopedTotal=groups[i].items.length; status='Showing '+groups[i].items.length+' readings in '+groups[i].name+'.'; }
    }
    if(selected==='all'&&tools.length) scoped.push({key:'tools',name:'Tools',items:tools});
  }
  /* The preview follows the selected row; with nothing selected it shows the first tool, as the
     retired tool shelf did, so the pane is never empty on desktop. An unknown ref is ignored. */
  var preview=null, requested=String(o.kitToolPreview||'');
  for(i=0;i<all.length;i++) if(requested&&all[i].ref===requested) preview=all[i];
  if(!preview) preview=tools.length?tools[0]:(all.length?all[0]:null);
  var after=(selected==='all'||selected==='tools')?fdEssentialsTeaching(idx.teachingResources):'';
  return fdLibraryShell({
    index:idx,view:'essentials',counts:fdLibraryCounts(idx),sections:sections,groups:scoped,selected:selected,
    total:scopedTotal,status:status,readings:{total:readings,pending:pending},noun:'items',preview:preview,after:after
  },o);
}
