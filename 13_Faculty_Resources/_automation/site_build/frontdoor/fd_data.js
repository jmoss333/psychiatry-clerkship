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

/* ---- authored calls-to-action ---------------------------------------------------------------
   topic_meta.json's `cta` is faculty-authored NAVIGATION -- "Practice caregiver
   baseline/adaptations", "Open collateral workflow" -- carried on 65 of the 72 topics, 104 links
   in all. Every href is already a `?page=<slug>` or `?tool=<slug>` form, and 16 of them carry a
   `&case=` / `&scenario=` suffix. *** THE SUFFIX IS THE PART THAT LOOKS OPTIONAL AND IS NOT ***
   (the same warning spa_index.html's tool surface carries): it is what makes "practice THIS case"
   land on that case rather than on the tool's front page, so `href` is kept whole here and the
   ref is derived ALONGSIDE it rather than replacing it.

   The ref is derived for exactly one reason -- the membership filter at the bottom of
   fdBuildIndex -- and the href is what actually ships to the browser. */
var FD_CTA_HREF_RE=/^\?(page|tool)=([^&#]+)/;

/* The slug a cta href names, or '' for a form this shell does not route (an absolute URL, a bare
   fragment, a query that names neither page nor tool). '' means "not ours" and the entry is
   dropped rather than rendered as a link the front door cannot honour. */
function fdCtaRef(href){
  var m=FD_CTA_HREF_RE.exec(String(href===null||href===undefined?'':href));
  if(!m) return '';
  try{ return decodeURIComponent(m[2]); }catch(_){ return m[2]; }
}

/* topic_meta authors write `cta` as either one {label, href} object or an array of them (43 and
   22 topics respectively -- both shapes are live, so both are read). Anything without BOTH
   strings is skipped: a half-authored entry would otherwise render an empty link. */
function fdCtaList(cta){
  if(!cta) return [];
  var src=(Object.prototype.toString.call(cta)==='[object Array]')?cta:[cta];
  var out=[];
  for(var i=0;i<src.length;i++){
    var e=src[i];
    if(!e||typeof e!=='object') continue;
    if(typeof e.label!=='string'||!e.label) continue;
    if(typeof e.href!=='string'||!e.href) continue;
    var ref=fdCtaRef(e.href);
    if(!ref) continue;
    out.push({ label:e.label, href:e.href, ref:ref });
  }
  return out;
}

/* A page with no topic_meta entry still has to render -- the Library carries every shipped page
   and not all of them are topic-template pages. Degrade to a titled row rather than throwing:
   renderHome()'s history in this repo is that one unguarded throw blanks the whole surface. */
function fdMakeItem(ref, kind, topicMeta, toolIndex, titleIndex){
  var m=topicMeta[ref]||{};
  var t=toolIndex[ref]||null;
  var fr=m.facultyReview||{};
  var isTool=(kind==='tool')||fdIsTool(ref);
  return {
    ref: ref,
    kind: isTool?'tool':'read',
    /* Title comes from site_manifest.json, the registry of shipped pages. topic_meta has no
       title field on any entry -- it describes a page's content, not its identity -- so reading
       one there would silently degrade every .md row to its raw slug. Falling back to the ref is
       for a page the manifest does not list, which the curriculum validator already rejects. */
    title: titleIndex[ref]||ref,
    minutes: (typeof m.read==='number')?m.read:null,
    summary: m.tldr||'',
    points: (m.points&&m.points.length)?m.points:[],
    attested: fr.status==='reviewed',
    toolRef: (m.relatedTools&&m.relatedTools.length)?m.relatedTools[0]:null,
    risk: (t&&t.riskLevel)||m.safetyLevel||null,
    /* Filtered to what THIS site ships by fdBuildIndex's last pass -- see there. */
    cta: fdCtaList(m.cta),
    href: (isTool?'?tool=':'?page=')+ref
  };
}

function fdBuildIndex(curriculum, topicMeta, toolRegistry, siteManifest){
  var meta=topicMeta||{}, cur=curriculum||{};
  var toolIndex={}, list=(toolRegistry&&toolRegistry.tools)||[];
  for(var i=0;i<list.length;i++){ toolIndex[list[i].file]=list[i]; }

  /* site_manifest entries are [sourcePath, slug, title] triples for both md and tools. */
  var titleIndex={}, man=siteManifest||{};
  var groups=[man.tools||[], man.md||[]];
  for(var g=0;g<groups.length;g++){
    for(var e=0;e<groups[g].length;e++){ titleIndex[groups[g][e][1]]=groups[g][e][2]; }
  }

  var byRef={};
  function ensure(ref, kind){
    if(!byRef[ref]) byRef[ref]=fdMakeItem(ref, kind, meta, toolIndex, titleIndex);
    return byRef[ref];
  }

  var weeks=[], cw=cur.weeks||[];
  for(var w=0;w<cw.length;w++){
    var items=[], src=cw[w].items||[];
    for(var j=0;j<src.length;j++){ items.push(ensure(src[j].ref, src[j].kind)); }
    weeks.push({ n: cw[w].n, title: cw[w].title, theme: cw[w].theme, items: items });
  }

  /* A library ref is either a bare slug (a page every site ships) or an object carrying
     per-site membership. The SITE FILTER already ran -- common.py's fd_curriculum_for_site()
     resolves it at build time, so each site's index.html carries only its own refs and this
     file needs no notion of a site. What survives here is the object's `title`: those refs are
     the per-site pages site_manifest.json does not register, so curriculum.json is their only
     title source and titleIndex would otherwise degrade them to the raw slug.
     Anything that is neither a string nor an object with a string ref is skipped rather than
     thrown on -- one unguarded throw in this join blanks the whole surface.

     *** ORDER COUPLING, DO NOT REORDER: the title must land in titleIndex BEFORE ensure() runs
     for that ref. *** ensure() memoises fdMakeItem()'s output, which reads titleIndex once, so a
     ref already built by the weeks loop above would keep whatever title it was built with and
     ignore the one written here. Today that is unreachable -- validate_curriculum.py requires a
     week item to be a page EVERY site ships, and only the per-site pages carry a title here, so
     no titled ref can appear in a week. If that rule is ever relaxed, this loop stops being
     enough on its own: build the title map in a first pass over all columns, then ensure(). */
  var columns=[], cc=cur.libraryColumns||[];
  for(var c=0;c<cc.length;c++){
    var citems=[], refs=cc[c].refs||[];
    for(var r=0;r<refs.length;r++){
      var entry=refs[r], eref=entry, etitle=null;
      if(entry&&typeof entry==='object'){ eref=entry.ref; etitle=entry.title||null; }
      if(typeof eref!=='string'||!eref) continue;
      if(etitle&&!titleIndex[eref]) titleIndex[eref]=etitle;  /* must precede ensure() -- see above */
      citems.push(ensure(eref, null));
    }
    columns.push({ name: cc[c].name, accent: cc[c].accent, items: citems });
  }

  var kit=[], ck=cur.safetyKit||[];
  for(var k=0;k<ck.length;k++){ kit.push({ item: ensure(ck[k].ref, null), sub: ck[k].sub }); }

  /* *** LAST PASS, AND IT MUST BE LAST: drop any cta whose target this SITE does not ship. ***
     topic_meta.json is shared by both sites; curriculum.json's per-site membership is not. One
     authored link is already cross-site today -- cl_reference.md offers "?page=adv_psychopharm.md",
     a resident-only page -- and on the other site that is a link to nothing. Rendering it would
     undo the per-site scoping the Library was given for exactly this reason.

     It runs here rather than inside fdMakeItem because membership is only knowable once every ref
     has been ensure()d: an item built early cannot yet see a target built later. hasOwnProperty
     rather than a truth test -- a cta pointing at "constructor" would otherwise pass. */
  for(var ref in byRef){
    if(!Object.prototype.hasOwnProperty.call(byRef, ref)) continue;
    var item=byRef[ref], keep=[], cs=item.cta||[];
    for(var q=0;q<cs.length;q++){
      if(Object.prototype.hasOwnProperty.call(byRef, cs[q].ref)) keep.push(cs[q]);
    }
    item.cta=keep;
  }

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
