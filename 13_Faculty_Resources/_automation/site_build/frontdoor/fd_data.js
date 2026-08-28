/* Front door join layer. curriculum.json holds STRUCTURE (which pages, which week, which column);
   topic_meta.json holds the FACTS about each page (minutes, summary, key points, attestation);
   tool_registry.json holds tool identity and risk. Nothing is duplicated across those three, so
   something has to join them -- this is that something, done once, so the six renderers downstream
   read one shape.

   Pure: no DOM, no storage, no clock. Injected via a marker Plan 3 registers. */
function fdEsc(s){
  if(s===null||s===undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fdIsTool(ref){ return /\.html$/.test(ref); }

/* A page with no topic_meta entry still has to render -- the Library carries every shipped page
   and not all of them are topic-template pages. Degrade to a titled row rather than throwing:
   renderHome()'s history in this repo is that one unguarded throw blanks the whole surface. */
function fdMakeItem(ref, kind, topicMeta, toolIndex, manifestIndex){
  var m=topicMeta[ref]||{};
  var t=toolIndex[ref]||null;
  var fr=m.facultyReview||{};
  var manifest=manifestIndex[ref]||{};
  /* 'rights' OVERRIDES the extension heuristic, and must: fdIsTool is /\.html$/, so a retired
     instrument's stub page (cssrs.html, bfcrs.html) would otherwise stay a "tool" no matter what
     the nav declares -- a learner reaching for a scorer mid-shift gets a removal notice instead.
     A rights page is a reference ABOUT an instrument this library does not reproduce: it never
     enters Quick Tools, never wears the tool chip, and never lists as an interactive tool. */
  var isRights=(kind==='rights');
  var isTool=!isRights&&((kind==='tool')||fdIsTool(ref));
  return {
    ref: ref,
    kind: isRights?'rights':(isTool?'tool':'read'),
    /* Title comes from site_manifest.json, the registry of shipped pages. topic_meta has no
       title field on any entry -- it describes a page's content, not its identity -- so reading
       one there would silently degrade every .md row to its raw slug. Falling back to the ref is
       for a page the manifest does not list, which the curriculum validator already rejects. */
    title: manifest.title||ref,
    minutes: (typeof m.read==='number')?m.read:null,
    summary: m.tldr||'',
    points: (m.points&&m.points.length)?m.points:[],
    attested: fr.status==='reviewed',
    toolRef: (m.relatedTools&&m.relatedTools.length)?m.relatedTools[0]:null,
    risk: (t&&t.riskLevel)||m.safetyLevel||null,
    governance: manifest.governance||null,
    href: (isTool?'?tool=':'?page=')+ref
  };
}

function fdBuildIndex(curriculum, topicMeta, toolRegistry, siteManifest){
  var meta=topicMeta||{}, cur=curriculum||{};
  var toolIndex={}, list=(toolRegistry&&toolRegistry.tools)||[];
  for(var i=0;i<list.length;i++){ toolIndex[list[i].file]=list[i]; }

  /* Canonical site_manifest entries are [sourcePath, slug, title] triples. The private build
     projection adds governance as element 3; direct callers with canonical triples get null. */
  var manifestIndex={}, man=siteManifest||{};
  var groups=[man.tools||[], man.md||[]];
  for(var g=0;g<groups.length;g++){
    for(var e=0;e<groups[g].length;e++){
      var entry=groups[g][e];
      manifestIndex[entry[1]]={title:entry[2],governance:entry.length===4?entry[3]:null};
    }
  }

  /* Rights references are a property of the PAGE, not of where it happens to be linked from, so
     the lookup has to be global rather than per-call-site. ensure() memoises by ref and the first
     caller wins: cssrs.html is a week item on ms3 (kind 'rights') but reaches the resident index
     only through a library column, which passes kind null -- so without this the same page was a
     "tool" on one site and a reference on the other. The list is derived from
     instrument_rights.json and validate_curriculum.py fails if the two disagree. */
  var rightsRefs={}, rr=cur.rightsReferences||[];
  for(var rq=0;rq<rr.length;rq++){ rightsRefs[rr[rq]]=true; }

  var byRef={};
  function ensure(ref, kind){
    if(!byRef[ref]) byRef[ref]=fdMakeItem(ref, rightsRefs[ref]?'rights':kind, meta, toolIndex, manifestIndex);
    return byRef[ref];
  }

  var weeks=[], cw=cur.weeks||[];
  for(var w=0;w<cw.length;w++){
    var items=[], src=cw[w].items||[];
    for(var j=0;j<src.length;j++){ items.push(ensure(src[j].ref, src[j].kind)); }
    weeks.push({
      n:cw[w].n,
      title:cw[w].title,
      theme:cw[w].theme,
      focusCategories:(cw[w].focusCategories||[]).slice(),
      items:items
    });
  }

  var columns=[], cc=cur.libraryColumns||[];
  for(var c=0;c<cc.length;c++){
    var citems=[], refs=cc[c].refs||[];
    for(var r=0;r<refs.length;r++){ citems.push(ensure(refs[r], null)); }
    columns.push({ name: cc[c].name, accent: cc[c].accent, items: citems });
  }

  /* triggers is the protocol's crisis vocabulary (curriculum.json), copied rather than aliased so
     a consumer cannot mutate the source array. fd_search.js matches it against the padded raw
     query; without it the safety kit is reachable only by stopword accident. */
  var kit=[], ck=cur.safetyKit||[];
  for(var k=0;k<ck.length;k++){
    kit.push({ item: ensure(ck[k].ref, null), sub: ck[k].sub, triggers: (ck[k].triggers||[]).slice() });
  }

  var sourcePath=cur.path||{};
  var pathInfo={
    id:(typeof sourcePath.id==='string')?sourcePath.id:'',
    weekCount:sourcePath.weekCount
  };

  /* known = "this ref names a real page on this site", which is NOT the same as "byRef has it".
     libraryExclude registers pages that ship and are reachable but are deliberately absent from
     the Library projection -- orientation-video.html ("surfaced from the Start-here card"), the
     week*.md pages, the rp-* tools. Treating those as unknown would send a working link to a
     not-found surface, so the reader needs both sets to tell a valid direct route apart from a
     dead slug (Fresh Eyes Audit A4). */
  var known={}, kr;
  for(kr in byRef){ known[kr]=true; }
  var lx=cur.libraryExclude||[];
  for(var lxi=0;lxi<lx.length;lxi++){
    if(lx[lxi]&&typeof lx[lxi].ref==='string') known[lx[lxi].ref]=true;
  }

  return { byRef:byRef, path:pathInfo, weeks:weeks, columns:columns, kit:kit, known:known };
}

/* The browser receives exactly one projected path. Treat that small object as untrusted at the
   rendering boundary: build validation normally prevents malformed projections, but a partial
   asset/cache response must show the standard fallback rather than invent a learner plan. */
function fdActivePathValid(index){
  var path=index&&index.path, weeks=index&&index.weeks;
  if(!path||typeof path.id!=='string'||!path.id||!Array.isArray(weeks)||!weeks.length||
     path.weekCount!==weeks.length) return false;
  for(var i=0;i<weeks.length;i++){
    var week=weeks[i];
    if(!week||typeof week.n!=='number'||!isFinite(week.n)||Math.floor(week.n)!==week.n||
       week.n!==i+1||typeof week.title!=='string'||!week.title||
       !Array.isArray(week.focusCategories)) return false;
  }
  return true;
}

function fdPathFallback(surface){
  return '<div class="fd-fallback" data-fd-fallback="'+fdEsc(surface)+'" role="alert">'+
    'This section could not load. Try reloading, or use another tab.</div>';
}

function fdItemsForWeek(index, n){
  for(var i=0;i<index.weeks.length;i++){ if(index.weeks[i].n===n) return index.weeks[i].items; }
  return [];
}

/* Week-metadata lookup (title, theme, items) by week number. Shared by fd_today.js (the
   student's current week) and fd_path.js (whichever week is being viewed) -- hoisted here,
   the join layer both already depend on, rather than living in either renderer, so there is
   one lookup instead of two copies that can drift (found in Task 5 review). */
function fdFindWeek(index, n){
  var weeks=(index&&index.weeks)||[];
  for(var i=0;i<weeks.length;i++){ if(weeks[i].n===n) return weeks[i]; }
  return null;
}

function fdPathWeekCount(index){
  return fdActivePathValid(index)?index.weeks.length:0;
}

function fdNextWeek(index, n){
  var weeks=(index&&index.weeks)||[];
  for(var i=0;i<weeks.length;i++){
    if(weeks[i].n===n) return (i+1<weeks.length)?weeks[i+1]:null;
  }
  return null;
}

/* Candidates for the daily pick: reads that belong to no week, so the pick surfaces library
   breadth rather than re-suggesting this week's list. */
function fdLibraryOnlyReads(index){
  var inWeek={};
  for(var w=0;w<index.weeks.length;w++){
    for(var i=0;i<index.weeks[w].items.length;i++){ inWeek[index.weeks[w].items[i].ref]=true; }
  }
  var out=[];
  for(var ref in index.byRef){
    var it=index.byRef[ref];
    if(it.kind==='read'&&!inWeek[ref]) out.push(it);
  }
  out.sort(function(a,b){ return a.ref<b.ref?-1:(a.ref>b.ref?1:0); });
  return out;
}
