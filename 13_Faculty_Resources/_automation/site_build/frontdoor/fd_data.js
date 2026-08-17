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
/* The LEGACY authored form, restored from the deleted shell's ctaHref(): a bare `tools/<slug>.html`
   path. It survives in exactly one place -- resident_section.py synthesises two resident-only CTAs
   with it ("Open the Agitation Ladder trainer", "Open Five Good Minutes"). All 104 checked-in cta
   hrefs and all 162 clinicalWorkflow.actions hrefs use the query form. Normalised rather than
   merely recognised: left as a raw path the link would leave the shell and load the tool
   standalone, without the front door's chrome, its governance notice, or a way back. */
var FD_CTA_LEGACY_RE=/^tools\/([^\/?#]+\.html)$/;

/* {ref, href} for a cta href, or null for a form this shell does not route (an absolute URL, a
   bare fragment, a query that names neither page nor tool). null means "not ours" and the entry is
   dropped rather than rendered as a link the front door cannot honour. The returned href is the
   ROUTABLE one -- identical to the input except for the legacy form above. */
function fdCtaHref(href){
  var s=String(href===null||href===undefined?'':href);
  var legacy=FD_CTA_LEGACY_RE.exec(s);
  if(legacy) return { ref: legacy[1], href: '?tool='+legacy[1] };
  var m=FD_CTA_HREF_RE.exec(s);
  if(!m) return null;
  var ref;
  try{ ref=decodeURIComponent(m[2]); }catch(_){ ref=m[2]; }
  return { ref: ref, href: s };
}

/* The slug alone, '' when the href is not routable. Kept as its own name because the workflow and
   drill renderers ask only this question. */
function fdCtaRef(href){
  var r=fdCtaHref(href);
  return r?r.ref:'';
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
    var r=fdCtaHref(e.href);
    if(!r) continue;
    out.push({ label:e.label, href:r.href, ref:r.ref });
  }
  return out;
}

/* A page with no topic_meta entry still has to render -- the Library carries every shipped page
   and not all of them are topic-template pages. Degrade to a titled row rather than throwing:
   renderHome()'s history in this repo is that one unguarded throw blanks the whole surface. */
function fdMakeItem(ref, kind, topicMeta, toolIndex, titleIndex, caseIndex){
  var m=topicMeta[ref]||{};
  var t=toolIndex[ref]||null;
  var fr=m.facultyReview||{};
  var isTool=(kind==='tool')||fdIsTool(ref);
  var cw=m.clinicalWorkflow||null;
  /* clinicalWorkflow.actions are cta by another name -- same {label, href} shape, same
     destinations, and the deleted shell merged them into one deduped list for exactly that
     reason (its buildPracticeTools kept a `seen` map keyed by href). Merged HERE, at the join,
     rather than in the renderer, so there is one list to render, dedupe and site-filter instead
     of two that can disagree. Authored `cta` comes first because it is the field a faculty
     author edits directly; workflow actions are attached to the workflow prose. */
  var cta=fdCtaList(m.cta).concat(fdCtaList(cw&&cw.actions));
  var seen={}, merged=[];
  for(var ci=0;ci<cta.length;ci++){
    if(Object.prototype.hasOwnProperty.call(seen, 'h:'+cta[ci].href)) continue;
    seen['h:'+cta[ci].href]=1;
    merged.push(cta[ci]);
  }
  /* Spoken drills. The id IS the payload -- communication_cases.json owns the title, and a case
     id the shipped pack does not carry is dropped rather than labelled with its own slug: the
     drill link would open communication-practice.html at a case that is not there. */
  var cases=[], cids=(m.communicationCases&&m.communicationCases.length)?m.communicationCases:[];
  for(var k=0;k<cids.length;k++){
    var title=(caseIndex||{})[cids[k]];
    if(!title) continue;
    cases.push({ id: cids[k], title: title,
      href: '?tool=communication-practice.html&case='+encodeURIComponent(cids[k]) });
  }
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
    cta: merged,
    cant: (typeof m.cant==='string')?m.cant:'',
    stages: (m.workflowStages&&m.workflowStages.length)?m.workflowStages:[],
    workflow: fdWorkflowRows(cw),
    ruleOut: (m.ruleOut&&m.ruleOut.length)?m.ruleOut:[],
    firstMove: (typeof m.firstMove==='string')?m.firstMove:'',
    cases: cases,
    quiz: fdQuiz(m),
    href: (isTool?'?tool=':'?page=')+ref
  };
}

/* ---- the rest of the topic template -----------------------------------------------------------
   Six more authored fields the front door dropped at the swap and this restores. They are read
   here rather than in the renderer so the reader gets ONE shape, exactly like `cta`:

     cant            one "can't miss" sentence
     stages          workflowStages -- the ordered stage chips
     workflow        clinicalWorkflow's seven prose fields (its `actions` fold into `cta`, below)
     ruleOut/firstMove  the rule-out chips and the first move under them
     cases           communicationCases -- spoken-drill ids
     quiz            the page's own question

   *** FOUR HARDCODED MAPS FROM THE DELETED SHELL ARE DELIBERATELY NOT RESTORED. *** It carried
   PRACTICE_LABELS/LAB (tool titles), PRACTICE_SAFE/SAFE (which tools are safety tools),
   PRACTICE_PAGE_TOOLS/PAGE_TOOLS (which tools belong to a page) and PRACTICE_CASE_LABELS/
   CASE_TITLES (drill titles) -- each declared TWICE in that file, and each a second source of
   truth for something a registry already owns. The front-door index owns all four properly:
   titles come from site_manifest via titleIndex, `risk` from tool_registry's riskLevel,
   page->tool from topic_meta's relatedTools, and drill titles from communication_cases.json,
   build-injected as FD_COMMUNICATION_CASES. The deleted CASE_TITLES had drifted to 10 of the 12
   real cases, which is what a second copy always does eventually. */
function fdWorkflowFields(){
  return [['ask','What to ask'],['mse','MSE focus'],['safety','Safety'],['say','What to say'],
          ['collateral','Family/collateral'],['rounds','Rounds'],['exam','Exam focus']];
}

/* The deleted shell's WF_STAGE_LABELS, unchanged -- workflowStages is a controlled vocabulary
   (topic_meta.schema.json) and these are its display names. A stage the map does not know renders
   its own slug rather than being dropped: an unknown code means the vocabulary grew, and showing
   it is more honest than hiding it. */
var FD_STAGE_LABELS={encounter:'Encounter',diagnosis:'Diagnosis',safety:'Safety',
  treatment:'Treatment',communication:'Communication',family:'Family',team:'Team',exam:'Exam'};

/* clinicalWorkflow's seven prose fields as [label, value] pairs, in the deleted shell's order --
   which is the order of an encounter, not alphabetical, and is worth preserving for that reason.
   Only the fields that carry text. `actions` is NOT here: it is a link list, and it is merged
   into the item's cta so the two cannot render the same href twice. */
function fdWorkflowRows(cw){
  var fields=fdWorkflowFields(), out=[];
  if(!cw||typeof cw!=='object') return out;
  for(var i=0;i<fields.length;i++){
    var v=cw[fields[i][0]];
    if(typeof v==='string'&&v) out.push({ label: fields[i][1], value: v });
  }
  return out;
}

/* A page's quiz, or null. Shape-checked rather than trusted: the renderer builds one button per
   option and reads `c` for correctness, so a quiz with no options array would render a question
   nobody can answer. topicHasQuiz() in the shell applies the SAME test -- that is not a
   coincidence and must not drift, because it is what decides whether an SRS card is seeded. */
function fdQuiz(m){
  var q=m&&m.quiz;
  if(!q||typeof q.q!=='string'||!q.q) return null;
  if(!q.o||!q.o.length) return null;
  var opts=[];
  for(var i=0;i<q.o.length;i++){
    var o=q.o[i];
    if(!o||typeof o.t!=='string') continue;
    opts.push({ text:o.t, correct: !!o.c });
  }
  if(!opts.length) return null;
  return { q:q.q, options:opts, why:(typeof q.why==='string')?q.why:'' };
}

function fdBuildIndex(curriculum, topicMeta, toolRegistry, siteManifest, communicationCases){
  var meta=topicMeta||{}, cur=curriculum||{};
  var toolIndex={}, list=(toolRegistry&&toolRegistry.tools)||[];
  for(var i=0;i<list.length;i++){ toolIndex[list[i].file]=list[i]; }

  /* site_manifest entries are [sourcePath, slug, title] triples for both md and tools. */
  var titleIndex={}, man=siteManifest||{};
  var groups=[man.tools||[], man.md||[]];
  for(var g=0;g<groups.length;g++){
    for(var e=0;e<groups[g].length;e++){ titleIndex[groups[g][e][1]]=groups[g][e][2]; }
  }

  /* communication_cases.json, build-injected. id -> title, and nothing else: this index exists to
     label a drill link, not to hold a second copy of the pack. */
  var caseIndex={}, cases=(communicationCases&&communicationCases.cases)||[];
  for(var cc=0;cc<cases.length;cc++){
    if(cases[cc]&&cases[cc].id&&cases[cc].title) caseIndex[cases[cc].id]=cases[cc].title;
  }

  var byRef={};
  function ensure(ref, kind){
    if(!byRef[ref]) byRef[ref]=fdMakeItem(ref, kind, meta, toolIndex, titleIndex, caseIndex);
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
