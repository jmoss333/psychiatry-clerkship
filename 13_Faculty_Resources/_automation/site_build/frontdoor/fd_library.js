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

   Dot colour is keyed on the ITEM's kind, not the column's accent (fix round 1 review, 2026-08-16
   -- an earlier version of this file keyed off column accent; that was wrong). CLASS-INVENTORY
   defines .fd-collink__dot.is-tool as "item is a tool, not a read" -- an item-level semantic --
   and the prototype's own dot logic is `it.t === 'tool' ? teal : c.accent`: the teal branch is
   gated on the ITEM's type, with the column's accent only a fallback shade CLASS-INVENTORY never
   implemented (there is no .is-safety class in frontdoor.css). The sibling renderer fd_today.js
   keys the analogous .fd-chip.is-tool off it.kind for the same reason, and fd_data.js already
   computes that field per item. In this repo's data item.kind and column accent happen to
   coincide 100% today (the "Interactive tools" column is all .html tool refs; every other column
   is all .md reads), but keying on kind is what stays correct the first time a .md page lands in
   the Interactive tools column or a tool lands elsewhere.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. Page slugs (e.g. shelf.md) are
   identifiers passed through data-fd-open and are fine -- the ban is on prose. The "press / to
   filter" hint reuses .fd-kbd, the same class fd_shell.js already uses for the header's ⌘K hint
   (CLASS-INVENTORY section 1) -- one class, two call sites, rather than a second key-hint style. */

function fdCollink(item){
  /* A rights reference keeps kind 'tool' (it loads from /tools/) but must not wear the tool dot:
     the dot is the Library's "this is an interactive tool" signal, and these pages reproduce
     nothing (Fresh Eyes Audit A3). */
  var dotCls=(item.kind==='tool'&&!item.rights)?'fd-collink__dot is-tool':'fd-collink__dot';
  /* The hint is the row's one-line "use this when…" (curriculum.libraryHints, joined by
     fd_data.js). Emitted after the label and badge so the row's NAME still comes first for
     assistive tech, and omitted outright -- not as an empty span -- when the item has none,
     so a read's row renders exactly as it always has. */
  var hint=item.hint?('<span class="fd-collink__hint">'+fdEsc(item.hint)+'</span>'):'';
  return '<button type="button" class="fd-collink" data-fd-open="'+fdEsc(item.ref)+'">'+
    '<span class="'+dotCls+'"></span>'+
    '<span class="fd-collink__label">'+fdEsc(item.title)+'</span>'+
    governanceBadge(item.governance)+
    hint+
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
  var hasEssentials=false;
  for(var e=0;e<(idx.essentials||[]).length;e++){ if((idx.essentials[e].items||[]).length) hasEssentials=true; }
  if(hasEssentials) out+='<button type="button" class="fd-btn fd-btn--ghost" data-fd-library-view="essentials">← The Essentials</button>';
  out+='<h1 class="fd-library__h1">Everything, one screen</h1>';
  out+='<span class="fd-library__count">'+count+' pages<span class="fd-library__shortcut"> · press <span class="fd-kbd">/</span> to filter</span></span>';
  out+='</div>';
  out+='<div class="fd-library__grid">';
  for(var i=0;i<cols.length;i++){ out+=fdLibraryCol(cols[i]); }
  out+='</div>';
  out+='</section>';
  return out;
}

/* Readings-first view of the same resolved items. Section selection is an input only. */
function fdKitReading(item){
  return '<button type="button" class="fd-kit__reading" data-fd-open="'+fdEsc(item.ref)+'">'+
    '<span class="fd-kit__title">'+fdEsc(item.title)+'</span>'+governanceBadge(item.governance,{compact:true})+
    (item.summary?'<span class="fd-kit__summary">'+fdEsc(item.summary)+'</span>':'')+
    (item.minutes?'<span class="fd-kit__minutes">'+fdEsc(item.minutes)+' min</span>':'')+'</button>';
}
function fdEssentials(index, opts){
  var idx=index||{columns:[],essentials:[]}, cols=idx.essentials||[];
  var groups=[], tools=[], readings=0, pending=0, fullCount=0, all=idx.columns||[];
  for(var c=0;c<cols.length;c++){
    var items=cols[c].items||[], reads=[];
    for(var j=0;j<items.length;j++){
      var item=items[j];
      if(item.kind==='tool') tools.push(item);
      else{
        reads.push(item); readings++;
        if(item.governance&&item.governance.status==='pending') pending++;
      }
    }
    if(reads.length) groups.push({key:String(c),name:cols[c].name,items:reads});
  }
  if(!readings&&!tools.length) return fdLibrary(idx);
  for(var f=0;f<all.length;f++) fullCount+=(all[f].items||[]).length;
  var selected=String(opts&&opts.kitSection||'all'), valid=selected==='all'||(selected==='tools'&&tools.length>0);
  for(var v=0;v<groups.length;v++) if(groups[v].key===selected) valid=true;
  if(!valid) selected='all';
  var out='<section class="fd-library fd-kit">';
  out+='<div class="fd-library__head"><h1 class="fd-library__h1">Core readings</h1>'+
    '<span class="fd-library__count">'+readings+' readings · '+tools.length+' tools</span></div>';
  out+='<div class="fd-kit__filter"><label for="fd-kit-section">Section</label> '+
    '<select id="fd-kit-section" data-fd-kit-section><option value="all"'+(selected==='all'?' selected':'')+'>All sections · '+(readings+tools.length)+'</option>';
  for(var o=0;o<groups.length;o++){
    out+='<option value="'+fdEsc(groups[o].key)+'"'+(selected===groups[o].key?' selected':'')+'>'+fdEsc(groups[o].name)+' · '+groups[o].items.length+'</option>';
  }
  if(tools.length) out+='<option value="tools"'+(selected==='tools'?' selected':'')+'>Tools · '+tools.length+'</option>';
  out+='</select></div>';
  if(pending) out+='<div class="fd-kit__review"><span>Faculty re-review in progress — '+pending+' of '+readings+' readings changed since they were last attested ·</span> '+
    '<details><summary>What that means</summary><p>These readings are marked pending review. Open a reading to see its full review notice.</p></details></div>';
  out+='<div class="fd-kit__layout'+(selected==='tools'?' fd-kit__layout--tools':'')+'">';
  if(selected!=='tools'){
    out+='<div class="fd-kit__readings">';
    for(var g=0;g<groups.length;g++){
      var group=groups[g];
      if(selected!=='all'&&selected!==group.key) continue;
      out+='<details class="fd-kit__group" open><summary>'+fdEsc(group.name)+' <span class="fd-kit__group-count">'+group.items.length+' readings</span><span class="fd-kit__chevron" aria-hidden="true">⌄</span></summary>';
      for(var r=0;r<group.items.length;r++) out+=fdKitReading(group.items[r]);
      out+='</details>';
    }
    out+='</div>';
  }
  if(tools.length&&(selected==='all'||selected==='tools')){
    out+='<aside class="fd-kit__tools" aria-label="Tools"><details class="fd-kit__group fd-kit__tool-group" open><summary>Tools <span class="fd-kit__group-count">'+tools.length+' tools</span><span class="fd-kit__chevron" aria-hidden="true">⌄</span></summary><div class="fd-kit__tool-list">';
    for(var t=0;t<tools.length;t++){
      out+='<button type="button" class="fd-collink" data-fd-open="'+fdEsc(tools[t].ref)+'"><span class="fd-collink__dot is-tool" aria-hidden="true"></span><span class="fd-collink__label">'+fdEsc(tools[t].title)+'</span></button>';
    }
    out+='</div></details></aside>';
  }
  out+='</div><div class="fd-library__footer"><button type="button" class="fd-btn fd-btn--ghost" data-fd-library-view="full">Everything ('+fullCount+' pages) →</button></div></section>';
  return out;
}
