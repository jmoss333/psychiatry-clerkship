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

/* Readings-first view of the same resolved items. Section selection is transient navigation. */
function fdKitReading(item){
  return '<button type="button" class="fd-kit__reading" data-fd-open="'+fdEsc(item.ref)+'">'+
    '<span class="fd-kit__title">'+fdEsc(item.title)+'</span>'+governanceBadge(item.governance,{compact:true})+
    (item.summary?'<span class="fd-kit__summary">'+fdEsc(item.summary)+'</span>':'')+
    (item.minutes?'<span class="fd-kit__minutes">'+fdEsc(item.minutes)+' min</span>':'')+'</button>';
}
function fdKitIndexButton(key,label,count,selected){
  var active=selected===key;
  return '<button type="button" class="fd-kit__index-item'+(active?' is-active':'')+'" data-fd-kit-section="'+fdEsc(key)+'" aria-pressed="'+(active?'true':'false')+'">'+
    '<span>'+fdEsc(label)+'</span><span class="fd-kit__index-count">'+count+'</span></button>';
}
function fdKitToolShelf(tools, requested){
  var selected=tools[0], i;
  for(i=0;i<tools.length;i++) if(tools[i].ref===requested) selected=tools[i];
  var selectedIndex=tools.indexOf?tools.indexOf(selected):0;
  if(selectedIndex<0){
    selectedIndex=0;
    for(i=0;i<tools.length;i++) if(tools[i]===selected) selectedIndex=i;
  }
  var out='<div class="fd-kit__tool-switcher"><div class="fd-kit__tool-tabs" role="tablist" aria-label="Preview tools">';
  for(i=0;i<tools.length;i++){
    var active=tools[i]===selected;
    out+='<button type="button" id="fd-kit-tool-tab-'+i+'" class="fd-kit__tool-tab'+(active?' is-active':'')+'" role="tab" data-fd-kit-tool="'+fdEsc(tools[i].ref)+'" aria-selected="'+(active?'true':'false')+'" aria-controls="fd-kit-tool-preview" tabindex="'+(active?'0':'-1')+'">'+
      '<span class="fd-collink__dot is-tool" aria-hidden="true"></span><span>'+fdEsc(tools[i].title)+'</span></button>';
  }
  out+='</div><section id="fd-kit-tool-preview" class="fd-kit__tool-preview" role="tabpanel" aria-labelledby="fd-kit-tool-tab-'+selectedIndex+'">'+
    '<h3>'+fdEsc(selected.title)+'</h3>'+
    (selected.hint?'<p>'+fdEsc(selected.hint)+'</p>':'')+
    '<button type="button" class="fd-btn fd-btn--ghost" data-fd-open="'+fdEsc(selected.ref)+'" aria-label="Open '+fdEsc(selected.title)+'">Open tool</button></section></div>';
  return out;
}

function fdEssentialsTeaching(resources){
  var rows=Array.isArray(resources)?resources:[];
  if(!rows.length) return '';
  var out='<section class="fd-kit__teaching" aria-label="External teaching companion"><h3>Teaching companion</h3>';
  for(var i=0;i<rows.length;i++){
    out+='<a class="fd-teachinglink" data-teaching-resource="'+fdEsc(rows[i].id)+'" href="'+fdEsc(rows[i].url)+'" target="_blank" rel="noopener noreferrer">'+
      '<span class="fd-teachinglink__title">'+fdEsc(rows[i].title)+' <span aria-hidden="true">↗</span></span>'+
      '<span class="fd-teachinglink__description">'+fdEsc(rows[i].description)+'</span></a>'+
      '<p class="fd-teachinglink__note">'+fdEsc(rows[i].note)+'</p>';
  }
  return out+'</section>';
}
function fdEssentials(index, opts){
  var idx=index||{columns:[],essentials:[]}, cols=idx.essentials||[];
  var groups=[], tools=[], readings=0, pending=0, fullCount=0, all=idx.columns||[];
  /* Use the active Path's assignments, keyed by ref so repeated placements count once.
     The caller supplies the actual rotation week, never the week being browsed in Path. */
  var week=fdFindWeek(idx,opts&&opts.week), weekRefs=Object.create(null), weekCount=0;
  var weekItems=week&&Array.isArray(week.items)?week.items:[];
  for(var w=0;w<weekItems.length;w++) weekRefs[weekItems[w].ref]=true;
  for(var c=0;c<cols.length;c++){
    var items=cols[c].items||[], reads=[], weekReads=[];
    for(var j=0;j<items.length;j++){
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
  if(!readings&&!tools.length) return fdLibrary(idx);
  for(var f=0;f<all.length;f++) fullCount+=(all[f].items||[]).length;
  var selected=String(opts&&opts.kitSection||'all'), valid=selected==='all'||(selected==='tools'&&tools.length>0)||(selected==='week'&&weekCount>0);
  for(var v=0;v<groups.length;v++) if(groups[v].key===selected) valid=true;
  if(!valid) selected='all';
  var out='<section class="fd-library fd-kit">';
  out+='<div class="fd-library__head"><h1 class="fd-library__h1">Core readings</h1>'+
    '<span class="fd-library__count">'+readings+' readings · '+tools.length+' tools</span></div>';
  out+='<nav class="fd-kit__index" aria-label="Essentials sections"><div class="fd-kit__index-track">';
  out+=fdKitIndexButton('all','All',readings+tools.length,selected);
  if(weekCount) out+=fdKitIndexButton('week','This week',weekCount,selected);
  for(var o=0;o<groups.length;o++){
    out+=fdKitIndexButton(groups[o].key,groups[o].name,groups[o].items.length,selected);
  }
  if(tools.length) out+=fdKitIndexButton('tools','Tools',tools.length,selected);
  out+='</div></nav>';
  var resultLabel=selected==='all'?'Showing all '+(readings+tools.length)+' Essentials items.':
    selected==='week'?'Showing '+weekCount+' readings for this week.':
    selected==='tools'?'Showing '+tools.length+' tools.':'';
  if(!resultLabel){
    for(var q=0;q<groups.length;q++) if(groups[q].key===selected) resultLabel='Showing '+groups[q].items.length+' readings in '+groups[q].name+'.';
  }
  out+='<p class="fd-visually-hidden" role="status" aria-live="polite">'+fdEsc(resultLabel)+'</p>';
  if(pending) out+='<div class="fd-kit__review"><span>Faculty re-review in progress — '+pending+' of '+readings+' readings changed since they were last attested ·</span> '+
    '<details><summary>What that means</summary><p>These readings are marked pending review. Open a reading to see its full review notice.</p></details></div>';
  out+='<div class="fd-kit__layout'+(selected==='tools'?' fd-kit__layout--tools':'')+'">';
  if(selected!=='tools'){
    out+='<div class="fd-kit__readings">';
    for(var g=0;g<groups.length;g++){
      var group=groups[g], visibleItems=selected==='week'?group.weekItems:group.items;
      if((selected!=='all'&&selected!=='week'&&selected!==group.key)||!visibleItems.length) continue;
      out+='<details class="fd-kit__group" open><summary>'+fdEsc(group.name)+' <span class="fd-kit__group-count">'+visibleItems.length+' readings</span><span class="fd-kit__chevron" aria-hidden="true">⌄</span></summary>';
      for(var r=0;r<visibleItems.length;r++) out+=fdKitReading(visibleItems[r]);
      out+='</details>';
    }
    out+='</div>';
  }
  if((tools.length||(idx.teachingResources||[]).length)&&(selected==='all'||selected==='tools')){
    out+='<aside class="fd-kit__tools" aria-label="Tools">';
    if(tools.length) out+='<details class="fd-kit__group fd-kit__tool-group" open><summary>Tools <span class="fd-kit__group-count">'+tools.length+' tools</span><span class="fd-kit__chevron" aria-hidden="true">⌄</span></summary>'+
      fdKitToolShelf(tools,opts&&opts.kitToolPreview)+'</details>';
    out+=fdEssentialsTeaching(idx.teachingResources);
    out+='</aside>';
  }
  out+='</div><div class="fd-library__footer"><button type="button" class="fd-btn fd-btn--ghost" data-fd-library-view="full">Everything ('+fullCount+' pages) →</button></div></section>';
  return out;
}
