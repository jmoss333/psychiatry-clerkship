/* Library -- five columns, one link per shipped page. Once the redesign ships, the sidebar this
   repo has always browsed by is gone: the Library is what is left, so a page missing from it is a
   page a student cannot reach except by search. See CLASS-INVENTORY.md section 5 and the
   prototype's Library section (Front-Door-Hi-Fi-v2.dc.html, search "Library", line 332).

   Injected via /*__FD_LIBRARY__*\/ once a later plan registers the marker (see SNIPPET_MARKERS
   in common.py) -- this task does not register it or touch that file. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Pure: fdLibrary(index) -> string. No DOM, no browser storage, no clock -- index arrives fully
   resolved from fdBuildIndex (fd_data.js), so this file never touches curriculum.json,
   topic_meta.json, or tool_registry.json directly.

   Column order is curriculum.json's libraryColumns order, unmodified -- fdBuildIndex already
   preserves it (fd_data.js iterates cc in file order), so this file does not re-sort.

   Dot colour is keyed on the COLUMN's accent, not the item's kind. CLASS-INVENTORY documents
   exactly one modifier -- .fd-collink__dot.is-tool (teal); every other accent (safety, topic)
   renders the plain default dot (olive) -- there is no .is-safety class in frontdoor.css, so
   inventing one here would style nothing. In this repo's data the two happen to coincide (the
   "Interactive tools" column is 100% .html tool refs and every other column is 100% .md reads),
   but the design spec is explicit ("category dots by column accent") and the prototype's own
   accent field lived on the column, not the item -- so accent is what this file reads, matching
   the contract rather than a coincidence in today's data.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. Page slugs (e.g. shelf.md) are
   identifiers passed through data-fd-open and are fine -- the ban is on prose. The "press / to
   filter" hint reuses .fd-kbd, the same class fd_shell.js already uses for the header's ⌘K hint
   (CLASS-INVENTORY section 1) -- one class, two call sites, rather than a second key-hint style. */

function fdCollink(item, accent){
  var dotCls=(accent==='tool')?'fd-collink__dot is-tool':'fd-collink__dot';
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
  for(var i=0;i<items.length;i++){ out+=fdCollink(items[i], col.accent); }
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
