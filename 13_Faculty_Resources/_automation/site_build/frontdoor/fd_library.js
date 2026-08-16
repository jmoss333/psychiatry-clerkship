/* Library -- one link per shipped page, grouped into curriculum.json's columns (five in the
   prototype; a sixth, "Week guides", was added in fix round 1 of Plan 3 Task 6 to give the six
   week overview pages the route they lost with the sidebar). Once the redesign ships, the sidebar
   this repo has always browsed by is gone: the Library is what is left, so a page missing from it
   is a page a student cannot reach AT ALL -- not even by search, because the front-door search
   walks index.byRef and a page in no column and no week never enters it. curriculum.json's
   libraryExclude is empty for exactly that reason. See CLASS-INVENTORY.md section 5 and the
   prototype's Library section (Front-Door-Hi-Fi-v2.dc.html, search "Library", line 332).
   .fd-library__grid is repeat(auto-fill,minmax(196px,1fr)), so the column count is not pinned by
   the CSS -- adding a column reflows rather than overflowing.

   Injected via /*__FD_LIBRARY__*\/ -- registered in SNIPPET_MARKERS (common.py) and wired
   into the shell by Plan 3 Task 1. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Pure: fdLibrary(index) -> string. No DOM, no browser storage, no clock -- index arrives fully
   resolved from fdBuildIndex (fd_data.js), so this file never touches curriculum.json,
   topic_meta.json, or tool_registry.json directly.

   Column order is curriculum.json's libraryColumns order, unmodified -- fdBuildIndex already
   preserves it (fd_data.js iterates cc in file order), so this file does not re-sort.

   Dot colour is keyed on the ITEM's kind, not the column's accent (fix round 1 review, 2026-08-16
   -- an earlier version of this file keyed off column accent; that was wrong). CLASS-INVENTORY
   defines .fd-collink__dot.is-tool as "item is a tool, not a read" -- an item-level semantic --
   and the prototype's own dot logic is `it.t === 'tool' ? teal : c.accent`: the teal branch is
   gated on the ITEM's type, with the column's accent only a fallback shade CLASS-INVENTORY never
   implemented (there is no .is-safety class in frontdoor.css). The sibling renderer fd_today.js
   keys the analogous .fd-chip.is-tool off it.kind for the same reason, and fd_data.js already
   computes that field per item. In this repo's data item.kind and column accent still
   coincide 100% (the "Interactive tools" column is all .html tool refs -- including feedback.html
   and orientation-video.html, placed there in fix round 1 precisely to keep that true; every other
   column is all .md reads), but keying on kind is what stays correct the first time a .md page
   lands in the Interactive tools column or a tool lands elsewhere.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. Page slugs (e.g. shelf.md) are
   identifiers passed through data-fd-open and are fine -- the ban is on prose. The "press / to
   filter" hint reuses .fd-kbd, the same class fd_shell.js already uses for the header's ⌘K hint
   (CLASS-INVENTORY section 1) -- one class, two call sites, rather than a second key-hint style. */

function fdCollink(item){
  var dotCls=(item.kind==='tool')?'fd-collink__dot is-tool':'fd-collink__dot';
  return '<button type="button" class="fd-collink" data-fd-open="'+fdEsc(item.ref)+'">'+
    '<span class="'+dotCls+'"></span>'+
    '<span class="fd-collink__label">'+fdEsc(item.title)+'</span>'+
  '</button>';
}

/* .fd-col carries no CSS rule of its own (CLASS-INVENTORY ⚠, "known; deferred by review") but is
   still required markup: it is the grid child .fd-library__grid's align-items:start acts on, and
   the one wrapper that groups a heading with its own links so a reader can tell the two apart. */
function fdLibraryCol(col){
  var items=col.items||[];
  var out='<div class="fd-col">';
  out+='<div class="fd-col__name">'+fdEsc(col.name)+'</div>';
  for(var i=0;i<items.length;i++){ out+=fdCollink(items[i]); }
  out+='</div>';
  return out;
}

function fdLibrary(index){
  var idx=index||{columns:[]};
  var cols=idx.columns||[];
  var count=0;
  for(var c=0;c<cols.length;c++){ count+=(cols[c].items||[]).length; }

  var out='<section class="fd-library">';
  out+='<div class="fd-library__head">';
  out+='<h1 class="fd-library__h1">Everything, one screen</h1>';
  out+='<span class="fd-library__count">'+count+' pages · press <span class="fd-kbd">/</span> to filter</span>';
  out+='</div>';
  out+='<div class="fd-library__grid">';
  for(var i=0;i<cols.length;i++){ out+=fdLibraryCol(cols[i]); }
  out+='</div>';
  out+='</section>';
  return out;
}
