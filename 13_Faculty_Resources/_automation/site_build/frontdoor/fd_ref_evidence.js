/* "In the paper's own words" -- verified source excerpts under the references that cite them.

   A reference list names the paper a page leans on; it does not show what the paper says. Every
   source in evidence_annotations.json already carries a verbatim span that the evidence gate
   checks the library's claims against. The build projects those spans into
   evidence_excerpts.json (site_build/evidence_excerpts.py); this module finds each list item on
   a reading that cites a PMID or DOI the index knows and appends the span, collapsed, beneath it.

   What it never does: write teaching text. It shows the paper's words, their kind and the date
   they were checked, nothing the library paraphrased. A list item it cannot match exactly, or an
   index that fails to load (offline, an old cache), leaves the page exactly as it was. */

var FD_REF_EVIDENCE_URL='evidence_excerpts.json';
var FD_REF_EVIDENCE_KINDS={
  'abstract':'abstract',
  'fulltext':'full text',
  'guideline-statement':'guideline statement',
  'conclusion':'conclusions'
};

function fdRefEvidenceEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fdRefEvidenceDoi(raw){
  var doi=String(raw||'');
  try{ doi=decodeURIComponent(doi); }catch(_){ }
  return doi.replace(/[.,;:)\]]+$/,'').toLowerCase();
}

/* The identifiers one list item cites: PubMed links and "PMID: n" text, doi.org links and bare
   DOIs. `hrefs` are the item's link targets; `text` its visible text. Order is kept, duplicates
   dropped, so the first identifier the author wrote is the first one looked up. */
function fdRefEvidenceIds(text, hrefs){
  var pmids=[], dois=[], seenP={}, seenD={}, m, re;
  function addP(p){ if(p&&!seenP[p]){ seenP[p]=1; pmids.push(p); } }
  function addD(d){ d=fdRefEvidenceDoi(d); if(/^10\.\d{4,9}\/\S+$/.test(d)&&!seenD[d]){ seenD[d]=1; dois.push(d); } }
  var links=hrefs||[];
  for(var i=0;i<links.length;i++){
    var h=String(links[i]||'');
    if((m=h.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})(?:\/|$|[?#])/i))) addP(m[1]);
    if((m=h.match(/doi\.org\/(10\.\d{4,9}\/[^?#\s]+)/i))) addD(m[1]);
  }
  var t=String(text||'');
  re=/\bPMID:?\s*(\d{5,9})\b/gi;
  while((m=re.exec(t))) addP(m[1]);
  re=/\b(10\.\d{4,9}\/[^\s"<>]+)/g;
  while((m=re.exec(t))) addD(m[1]);
  return {pmids:pmids, dois:dois};
}

/* The one source an item cites, or null. An item whose identifiers point at two DIFFERENT
   sources is ambiguous (two papers in one bullet) and gets nothing rather than a guess. */
function fdRefEvidenceLookup(index, ids){
  if(!index||!index.sources||!ids) return null;
  var found=null, i, sid;
  var byP=index.byPmid||{}, byD=index.byDoi||{};
  var all=[];
  for(i=0;i<(ids.pmids||[]).length;i++) if(Object.prototype.hasOwnProperty.call(byP,ids.pmids[i])) all.push(byP[ids.pmids[i]]);
  for(i=0;i<(ids.dois||[]).length;i++) if(Object.prototype.hasOwnProperty.call(byD,ids.dois[i])) all.push(byD[ids.dois[i]]);
  for(i=0;i<all.length;i++){
    sid=all[i];
    if(found&&found!==sid) return null;
    found=sid;
  }
  if(!found||!Object.prototype.hasOwnProperty.call(index.sources,found)) return null;
  var src=index.sources[found];
  if(!src||typeof src.span!=='string'||!src.span) return null;
  return {sourceId:found, span:src.span, spanType:src.spanType||'', checked:src.checked||''};
}

function fdRefEvidenceHtml(entry){
  if(!entry) return '';
  var kind=FD_REF_EVIDENCE_KINDS[entry.spanType]||'source';
  var when=/^\d{4}-\d{2}-\d{2}$/.test(entry.checked||'')?' on '+fdRefEvidenceEsc(entry.checked):'';
  return '<details class="fd-ref-evidence" data-source="'+fdRefEvidenceEsc(entry.sourceId)+'">'+
    '<summary class="fd-ref-evidence__toggle">In the paper’s own words</summary>'+
    '<blockquote class="fd-ref-evidence__quote">'+fdRefEvidenceEsc(entry.span)+'</blockquote>'+
    '<p class="fd-ref-evidence__meta">Quoted word for word from the '+fdRefEvidenceEsc(kind)+
    ', checked against the source'+when+'. The words are the authors’; read the paper before you rely on a detail.</p>'+
    '</details>';
}

/* Every list item in the reading that cites something, with its identifiers. Items already
   carrying an excerpt (a re-mount) and items inside an excerpt are skipped. */
function fdRefEvidenceTargets(body){
  var out=[];
  if(!body||typeof body.querySelectorAll!=='function') return out;
  var items=body.querySelectorAll('li');
  for(var i=0;i<items.length;i++){
    var li=items[i];
    if(li.querySelector('.fd-ref-evidence')) continue;
    if(typeof li.closest==='function'&&li.closest('.fd-ref-evidence')) continue;
    var links=li.querySelectorAll('a[href]'), hrefs=[];
    for(var j=0;j<links.length;j++) hrefs.push(links[j].getAttribute('href'));
    var ids=fdRefEvidenceIds(li.textContent, hrefs);
    if(ids.pmids.length||ids.dois.length) out.push({el:li, ids:ids});
  }
  return out;
}

/* Append each match's excerpt. Returns how many were added; pure over the targets it is given. */
function fdRefEvidenceApply(targets, index){
  var added=0;
  for(var i=0;i<(targets||[]).length;i++){
    var entry=fdRefEvidenceLookup(index, targets[i].ids);
    if(!entry) continue;
    targets[i].el.insertAdjacentHTML('beforeend', fdRefEvidenceHtml(entry));
    added++;
  }
  return added;
}

var fdRefEvidenceIndexPromise=null;
function fdRefEvidenceLoad(){
  if(!fdRefEvidenceIndexPromise){
    fdRefEvidenceIndexPromise=(typeof fetch==='function'?fetch(FD_REF_EVIDENCE_URL)
      .then(function(r){ return r&&r.ok?r.json():null; }):Promise.resolve(null))
      .catch(function(){ return null; })
      .then(function(index){
        if(!index||index.schemaVersion!==1){ fdRefEvidenceIndexPromise=null; return null; }
        return index;
      });
  }
  return fdRefEvidenceIndexPromise;
}

/* Mount on a rendered reading. `load` is injectable for tests; the default fetches the index
   once per session and only when the page cites something. Returns a promise of the count. */
function fdMountRefEvidence(body, load){
  fdRefCiteBind(body);
  var targets=fdRefEvidenceTargets(body);
  if(!targets.length) return Promise.resolve(0);
  return Promise.resolve((load||fdRefEvidenceLoad)()).then(function(index){
    if(!index) return 0;
    if(typeof body.isConnected==='boolean'&&!body.isConnected) return 0;
    return fdRefEvidenceApply(fdRefEvidenceTargets(body), index);
  }).catch(function(){ return 0; });
}

/* Tappable in-text citations. A case page writes "[2,4]" and numbers its References list; on a
   phone the learner has to scroll the whole case to find reference 4 and then find their place
   again. fdRefCiteMarkup turns each bracketed number that names an entry in that list into a
   small button, and gives each entry an id; fdMountRefEvidence binds the jump. A bracket naming
   a number the list does not have stays plain text -- tests/reference-citations.test.mjs fails
   the source page instead, so a learner is never sent to the wrong paper.

   Pure string transform over marked() output: only text between tags is touched, never text
   inside a link, code, a button, a heading or a script, and never anything after the heading. */
var FD_REF_HEADING=/^\s*(?:references|sources|key references)\b/i;
var FD_REF_SKIP={a:1,code:1,pre:1,button:1,script:1,style:1,h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,textarea:1,select:1};

function fdRefCiteStrip(html){
  return String(html||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
}

/* The reference list a page ends with: the LAST heading named References/Sources and every ordered
   list after it up to the next heading (a page may split "cited" and "further reading" into two
   lists, the second starting at 9). Each entry carries its offset and the number markdown shows.
   Null when the page has no such list. */
function fdRefCiteList(html){
  var src=String(html||''), re=/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, m, heading=null;
  while((m=re.exec(src))) if(FD_REF_HEADING.test(fdRefCiteStrip(m[2]))) heading={start:m.index,end:re.lastIndex};
  if(!heading) return null;
  var rest=src.slice(heading.end), nextH=rest.search(/<h[1-6]\b/i);
  if(nextH>=0) rest=rest.slice(0,nextH);
  var items=[], olRe=/<ol\b[^>]*>/gi, ol;
  while((ol=olRe.exec(rest))){
    var startAttr=ol[0].match(/\bstart\s*=\s*"?(\d+)/i);
    var shown=startAttr?parseInt(startAttr[1],10):1;
    /* Walk this list's own items: nested lists inside an entry are not entries. */
    var tagRe=/<(\/?)(ol|ul|li)\b[^>]*>/gi, depth=0, tg, from=ol.index;
    tagRe.lastIndex=from;
    while((tg=tagRe.exec(rest))){
      var closing=tg[1]==='/', name=tg[2].toLowerCase();
      if(name==='li'){ if(!closing&&depth===1) items.push({at:heading.end+tg.index, shown:shown++}); continue; }
      depth+=closing?-1:1;
      if(depth===0) break;
    }
    olRe.lastIndex=Math.max(olRe.lastIndex,tagRe.lastIndex);
  }
  return items.length?{headingStart:heading.start, items:items}:null;
}

function fdRefCiteButton(n){
  return '<button type="button" class="fd-cite" data-ref-cite="'+n+'" aria-label="Reference '+n+'">'+n+'</button>';
}

/* The numbers the AUTHOR wrote on the page's closing reference list, in order, or null. Markdown
   renders "1. 2. 4. 5." as 1, 2, 3, 4 (only an ordered list's first number counts), so a case that
   keeps the Resident edition's numbering on its MS3 subset would show "3." beside the paper the
   text cites as [4]. Reading the source numbers lets the reader show and link the right ones. */
function fdRefCiteSourceNumbers(markdown){
  var text=String(markdown||''), re=/^#{1,4}[ \t]*(?:references|sources|key references)\b.*$/gim, m, at=-1;
  while((m=re.exec(text))) at=re.lastIndex;
  if(at<0) return null;
  var rest=text.slice(at), next=rest.search(/^#{1,4}\s/m);
  if(next>=0) rest=rest.slice(0,next);
  var nums=[], lm, lre=/^(\d{1,3})\.\s/gm;
  while((lm=lre.exec(rest))) nums.push(parseInt(lm[1],10));
  return nums.length?nums:null;
}

function fdRefCiteMarkup(html, markdown){
  var src=String(html||''), list=fdRefCiteList(src);
  if(!list) return src;
  var numbers=[], i;
  for(i=0;i<list.items.length;i++) numbers.push(list.items[i].shown);
  if(markdown!==undefined){
    var written=fdRefCiteSourceNumbers(markdown);
    /* Use the author's numbers only when they line up one-to-one with the rendered entries and
       rise strictly; anything else is a page the reader cannot number safely, so leave it be. */
    if(!written||written.length!==list.items.length) return src;
    for(i=1;i<written.length;i++) if(written[i]<=written[i-1]) return src;
    numbers=written;
  }
  var known={};
  for(i=0;i<numbers.length;i++) known[numbers[i]]=1;
  /* Ids (and, where the author skipped a number, the shown number) on the entries, back to front
     so earlier offsets stay valid. */
  var out=src;
  for(i=list.items.length-1;i>=0;i--){
    var at=list.items[i].at, shown=list.items[i].shown;
    out=out.slice(0,at)+'<li id="fd-ref-'+numbers[i]+'" tabindex="-1"'+
      (numbers[i]!==shown?' value="'+numbers[i]+'"':'')+out.slice(at+3);
  }
  var head=out.slice(0,list.headingStart), tail=out.slice(list.headingStart);
  var parts=head.split(/(<[^>]*>)/), skip=[], res=[];
  for(var p=0;p<parts.length;p++){
    var part=parts[p];
    if(p%2===1){
      var tm=part.match(/^<(\/?)([a-z0-9]+)\b/i);
      if(tm&&FD_REF_SKIP[tm[2].toLowerCase()]&&!/\/>$/.test(part)){
        if(tm[1]){ if(skip.length&&skip[skip.length-1]===tm[2].toLowerCase()) skip.pop(); }
        else skip.push(tm[2].toLowerCase());
      }
      res.push(part); continue;
    }
    if(skip.length||part.indexOf('[')<0){ res.push(part); continue; }
    res.push(part.replace(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g,function(whole,inner){
      var nums=inner.match(/\d+/g);
      for(var k=0;k<nums.length;k++) if(!known[parseInt(nums[k],10)]) return whole;
      return '['+inner.replace(/\d+/g,function(d){ return fdRefCiteButton(parseInt(d,10)); })+']';
    }));
  }
  return res.join('')+tail;
}

/* Jump to an entry: open its collapsed section if the page folded it, then scroll and focus. */
function fdRefCiteJump(body, n){
  var li=body&&body.querySelector?body.querySelector('#fd-ref-'+parseInt(n,10)):null;
  if(!li) return false;
  var sec=typeof li.closest==='function'?li.closest('.sec-c'):null;
  if(sec&&!sec.classList.contains('open')){
    var toggle=sec.querySelector('button[aria-expanded]');
    if(toggle&&typeof toggle.click==='function') toggle.click();
  }
  if(typeof li.scrollIntoView==='function') li.scrollIntoView({block:'center'});
  if(typeof li.focus==='function') li.focus({preventScroll:true});
  return true;
}

function fdRefCiteBind(body){
  if(!body||typeof body.addEventListener!=='function'||body.__fdCiteBound) return;
  body.__fdCiteBound=true;
  body.addEventListener('click',function(ev){
    var btn=ev&&ev.target&&typeof ev.target.closest==='function'?ev.target.closest('.fd-cite'):null;
    if(!btn||!body.contains(btn)) return;
    if(fdRefCiteJump(body, btn.getAttribute('data-ref-cite'))&&typeof ev.preventDefault==='function') ev.preventDefault();
  });
}
