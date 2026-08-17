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
  var isTool=(kind==='tool')||fdIsTool(ref);
  return {
    ref: ref,
    kind: isTool?'tool':'read',
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

  var byRef={};
  function ensure(ref, kind){
    if(!byRef[ref]) byRef[ref]=fdMakeItem(ref, kind, meta, toolIndex, manifestIndex);
    return byRef[ref];
  }

  var weeks=[], cw=cur.weeks||[];
  for(var w=0;w<cw.length;w++){
    var items=[], src=cw[w].items||[];
    for(var j=0;j<src.length;j++){ items.push(ensure(src[j].ref, src[j].kind)); }
    weeks.push({ n: cw[w].n, title: cw[w].title, theme: cw[w].theme, items: items });
  }

  var columns=[], cc=cur.libraryColumns||[];
  for(var c=0;c<cc.length;c++){
    var citems=[], refs=cc[c].refs||[];
    for(var r=0;r<refs.length;r++){ citems.push(ensure(refs[r], null)); }
    columns.push({ name: cc[c].name, accent: cc[c].accent, items: citems });
  }

  var kit=[], ck=cur.safetyKit||[];
  for(var k=0;k<ck.length;k++){ kit.push({ item: ensure(ck[k].ref, null), sub: ck[k].sub }); }

  return { byRef: byRef, weeks: weeks, columns: columns, kit: kit };
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
