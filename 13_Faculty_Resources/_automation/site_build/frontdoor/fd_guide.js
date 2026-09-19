/* Clinical field guide. ES5, learner DOM enhancement only; no authored text or storage writes.
 * The existing reader remains the content/governance authority. Dispose global listeners when
 * its mount is replaced; preserveResource transitions must leave this mount and live tools alone.
 */
function fdGuideNormalize(text){
  return String(text||'').toLowerCase().replace(/[\u2010-\u2015\u2018-\u201f]/g,' ')
    .replace(/[^a-z0-9\u00c0-\uffff]+/g,' ').trim();
}
function fdGuideSlug(text){
  return fdGuideNormalize(text).replace(/\s+/g,'-').slice(0,110)||'section';
}
function fdGuideMount(body,options){
  var o=options||{}, reader=body&&body.closest('.fd-reader');
  if(!reader||reader.classList.contains('fd-reader--tool'))return null;
  /* Embedded components may contain their own headings (the orientation Compass does).
     Only the reader's top-level teaching sections opt into this layout. */
  if(![].some.call(body.children,function(node){
    return node.tagName==='H2'||(node.classList.contains('sec-c')&&node.querySelector('.sec-h'));
  }))return null;
  var doc=body.ownerDocument, win=doc.defaultView, ref=o.ref;
  var disposed=false, frame=0, printOpened=[], tableModes=[], invokers=[];
  function el(tag,cls,text){
    var node=doc.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function button(text,cls){var b=el('button',cls,text);b.type='button';return b;}
  function each(nodes,fn){[].forEach.call(nodes,fn);}
  function desktop(){return win.matchMedia('(min-width:1000px)').matches;}
  function headingText(h){return h.textContent.replace(/^[\s▸]+/,'').trim();}
  reader.classList.add('fd-reader--guide');

  /* Wrap direct headings without collapsing. This includes all crisis-bearing pages, which
     makeCollapsible deliberately leaves completely expanded. Move original nodes, never copy
     or paraphrase their clinical prose. Existing optional disclosures retain their mechanics. */
  var group=null;
  each([].slice.call(body.children),function(node){
    if(node.classList.contains('crisis-block-hook')||node.querySelector('.crisis-block-hook')){
      group=null;
    }else if(node.tagName==='H2'){
      group=el('section','fd-guide-section');body.insertBefore(group,node);group.appendChild(node);
    }else if(group){group.appendChild(node);}
  });
  var headings=[].slice.call(body.querySelectorAll('.fd-guide-section>h2,.sec-c>.sec-h'));
  var used={};
  headings.forEach(function(h){
    var text=headingText(h), id=h.id||('guide-'+fdGuideSlug(text)), base=id, n=1;
    while(used[id])id=base+'-'+(++n);
    used[id]=true;h.id=id;h.tabIndex=-1;
    var section=h.closest('.fd-guide-section,.sec-c');
    if(!section)return;
    /* These are typographic roles from explicit headings, not clinical judgments. */
    if(/^(objectives|in \d+ seconds|at a glance|learning objectives)/i.test(text))section.classList.add('fd-guide-orientation');
    if(/\b(references|bibliography)\b/i.test(text))section.classList.add('fd-guide-references');
    if(/\b(cautions?|pitfalls?|what not to do)\b/i.test(text))section.classList.add('fd-guide-caution');
    if(/\b(examples?|vignette)\b/i.test(text))section.classList.add('fd-guide-example');
  });

  var margin=el('aside','fd-guide-margin');
  var contents=el('details','fd-guide-contents'), wide=desktop();contents.open=wide;
  contents.appendChild(el('summary','','On this page'));
  var nav=el('nav');nav.setAttribute('aria-label','On this page');contents.appendChild(nav);
  var navLinks=[];
  function passageURL(id,query){
    var u=new URL(win.location.href);
    u.hash='';u.searchParams.delete('tool');u.searchParams.set('page',ref);
    u.searchParams.delete('guideFind');u.searchParams.delete('guideSection');
    if(id)u.searchParams.set('guideSection',id.replace(/^guide-/,''));
    if(query)u.searchParams.set('guideFind',query);
    return u.pathname+u.search;
  }
  function replaceURL(id,query){
    try{win.history.replaceState(win.history.state,'',passageURL(id,query));}catch(_){}
  }
  function expose(target){
    var node=target;
    while(node&&node!==body){
      if(node.tagName==='DETAILS')node.open=true;
      if(node.classList&&node.classList.contains('sec-c')){
        node.classList.add('open');
        var toggle=node.querySelector('.sec-h button');
        if(toggle)toggle.setAttribute('aria-expanded','true');
      }
      node=node.parentElement;
    }
    tableModes.forEach(function(mode){if(mode.viewport.contains(target))mode.set(false);});
  }
  function go(target,highlight){
    if(!target)return;
    expose(target);
    each(body.querySelectorAll('.fd-guide-match'),function(n){n.classList.remove('fd-guide-match');});
    if(highlight)target.classList.add('fd-guide-match');
    if(!desktop())contents.open=false;
    target.tabIndex=-1;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start',behavior:'instant'});
    updateCurrent();
  }
  headings.forEach(function(h){
    var a=el('a','',headingText(h));a.href=passageURL(h.id,'');a.setAttribute('data-guide-section',h.id);
    a.addEventListener('click',function(event){
      event.stopPropagation();
      if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();replaceURL(h.id,'');go(h,false);
    });
    nav.appendChild(a);navLinks.push(a);
  });
  margin.appendChild(contents);
  var form=el('form','fd-guide-find');form.setAttribute('role','search');
  var label=el('label','','Find in this guide');label.htmlFor='fd-guide-query';
  var input=el('input');input.type='search';input.id='fd-guide-query';input.maxLength=160;
  input.autocomplete='off';input.placeholder='Word or phrase';
  var submit=button('Find passages','fd-btn fd-btn--ghost');submit.type='submit';
  form.appendChild(label);form.appendChild(input);form.appendChild(submit);margin.appendChild(form);
  var status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  var results=el('div','fd-guide-results');results.hidden=true;results.appendChild(status);margin.appendChild(results);
  var print=button('Print guide','fd-btn fd-btn--ghost');print.addEventListener('click',function(){win.print();});margin.appendChild(print);
  var practice=reader.querySelector('.fd-trynow[data-fd-open]');
  if(practice){
    var shortcut=button('Practice: '+((practice.querySelector('.fd-trynow__title')||practice).textContent.trim().replace(/^Open tool · /,'')),'fd-guide-practice fd-btn fd-btn--ghost');
    shortcut.setAttribute('data-fd-open',practice.getAttribute('data-fd-open'));
    margin.insertBefore(shortcut,contents);
  }
  var columns=reader.querySelector('.fd-reader__cols'), article=reader.querySelector('.fd-article');
  var guideHeader=el('header','fd-guide-header');
  each([].slice.call(article.children),function(node){
    if(node.matches('.fd-article__head,.fd-article__h1,.fd-article__lead'))guideHeader.appendChild(node);
  });
  columns.insertBefore(guideHeader,article);columns.insertBefore(margin,article);

  /* A second view is offered only for simple rectangular tables. Both views come from the same
     original cells. Complex tables keep their original accessible, scrollable representation. */
  each(body.querySelectorAll('.table-scroll'),function(shell,index){
    var viewport=shell.querySelector('.table-scroll-viewport'), table=viewport&&viewport.querySelector('table');
    if(!table)return;
    var headers=table.querySelectorAll('thead th'), rows=table.querySelectorAll('tbody tr');
    if(headers.length<2||!rows.length||table.querySelector('[rowspan],[colspan],input,button,textarea,select'))return;
    var valid=true;
    each(rows,function(row){if(row.cells.length!==headers.length)valid=false;});
    if(!valid)return;
    each(headers,function(h){if(!h.hasAttribute('scope'))h.setAttribute('scope','col');});
    var controls=el('div','fd-guide-table-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','Table reading view');
    var compare=button('Compare columns'), byRow=button('Read by row');
    controls.appendChild(compare);controls.appendChild(byRow);shell.insertBefore(controls,shell.firstChild);
    var stack=el('div','fd-guide-table-rows');stack.id='fd-guide-rows-'+index;
    viewport.id='fd-guide-table-'+index;
    compare.setAttribute('aria-controls',viewport.id);byRow.setAttribute('aria-controls',stack.id);
    each(rows,function(row){
      var dl=el('dl');
      each(row.cells,function(cell,j){
        dl.appendChild(el('dt','',headers[j].textContent));
        var dd=el('dd');
        each(cell.childNodes,function(child){dd.appendChild(child.cloneNode(true));});
        /* Cloned IDs must not create a second target for any authored fragment link. */
        each(dd.querySelectorAll('[id]'),function(node){node.removeAttribute('id');});
        dl.appendChild(dd);
      });stack.appendChild(dl);
    });
    shell.appendChild(stack);
    var mode={viewport:viewport,rows:stack,set:function(stacked){
      viewport.hidden=stacked;stack.hidden=!stacked;
      shell.classList.toggle('is-scrollable',!stacked&&viewport.scrollWidth>viewport.clientWidth+1);
      compare.setAttribute('aria-pressed',String(!stacked));byRow.setAttribute('aria-pressed',String(stacked));
      var hint=shell.querySelector('.table-scroll-hint');if(hint)hint.hidden=stacked;
    }};
    compare.onclick=function(){mode.set(false);};byRow.onclick=function(){mode.set(true);};mode.set(false);tableModes.push(mode);
    viewport.addEventListener('keydown',function(event){
      if(event.target!==viewport)return;
      var delta=event.key==='ArrowRight'?80:(event.key==='ArrowLeft'?-80:0);
      if(delta){event.preventDefault();event.stopPropagation();viewport.scrollLeft+=delta;}
      else if(event.key==='Home'||event.key==='End'){
        event.preventDefault();event.stopPropagation();viewport.scrollLeft=event.key==='Home'?0:viewport.scrollWidth;
      }
    });
  });

  var candidates=[].slice.call(body.querySelectorAll('p,li,tr,h3')).filter(function(node){
    return !node.closest('.fd-guide-table-rows,.governance-notice,.pgfb,.tpl')&&
      !(node.tagName==='P'&&node.closest('li'))&&node.textContent.trim().length>2;
  });
  var cue=null;
  function arrival(text,target){
    if(cue)cue.remove();
    cue=el('div','fd-guide-arrival');cue.appendChild(el('p','',text));
    if(target){var jump=button('Go to matching passage');jump.onclick=function(){go(target,true);};cue.appendChild(jump);}
    var notice=body.querySelector('.governance-notice');
    if(notice&&notice.parentNode===body)notice.insertAdjacentElement('afterend',cue);
    else body.insertBefore(cue,body.firstChild);
  }
  function find(query,autoFocus){
    query=String(query||'').trim().slice(0,160);input.value=query;
    each(body.querySelectorAll('.fd-guide-match'),function(node){node.classList.remove('fd-guide-match');});
    if(cue){cue.remove();cue=null;}
    var words=fdGuideNormalize(query).split(/\s+/).filter(Boolean), matches=[];
    if(words.length)candidates.forEach(function(node){
      var text=fdGuideNormalize(node.textContent);
      if(words.every(function(word){return text.indexOf(word)!==-1;}))matches.push(node);
    });
    /* Lead-in matches (e.g. a named micro-intervention) precede incidental mentions in an
       objective or reference. Stable document order breaks ties; this is page-local only. */
    var phrase=fdGuideNormalize(query);
    matches.sort(function(a,b){
      var aa=fdGuideNormalize(a.textContent).indexOf(phrase)===0?1:0;
      var bb=fdGuideNormalize(b.textContent).indexOf(phrase)===0?1:0;
      return bb-aa||candidates.indexOf(a)-candidates.indexOf(b);
    });
    while(results.children.length>1)results.removeChild(results.lastChild);
    results.hidden=false;
    status.textContent=!words.length?'Enter a word or phrase.':
      (matches.length?matches.length+' matching passage'+(matches.length===1?'':'s')+' in this guide.':'No matching passage in this guide.');
    matches.slice(0,20).forEach(function(node){
      var excerpt=node.textContent.replace(/\s+/g,' ').trim();
      var section=node.closest('.fd-guide-section,.sec-c'), h=section&&section.querySelector('h2');
      var b=button((h?headingText(h)+' — ':'')+excerpt.slice(0,180)+(excerpt.length>180?'…':''));
      b.onclick=function(){go(node,true);};results.appendChild(b);
    });
    if(matches.length>20)results.appendChild(el('p','','Showing the first 20. Refine your phrase for fewer results.'));
    if(words.length)arrival(status.textContent+' Search: “'+query+'”.',matches[0]);
    if(autoFocus&&matches.length)go(matches[0],true);
    return matches;
  }
  form.addEventListener('submit',function(event){event.preventDefault();replaceURL('',input.value.trim().slice(0,160));find(input.value,true);});

  function updateCurrent(){
    if(disposed)return;
    var current=headings[0];
    headings.forEach(function(h){if(h.getBoundingClientRect().top<=165)current=h;});
    navLinks.forEach(function(a){
      if(a.getAttribute('data-guide-section')===current.id)a.setAttribute('aria-current','location');
      else a.removeAttribute('aria-current');
    });
  }
  function onScroll(){if(!frame)frame=win.requestAnimationFrame(function(){frame=0;updateCurrent();});}
  function onResize(){
    var nextWide=desktop();
    if(nextWide!==wide){wide=nextWide;contents.open=wide;}
    updateCurrent();
  }
  function beforePrint(){
    printOpened=[];each(body.querySelectorAll('details:not([open])'),function(d){printOpened.push(d);d.open=true;});
  }
  function afterPrint(){printOpened.forEach(function(d){d.open=false;});printOpened=[];}
  win.addEventListener('scroll',onScroll,{passive:true});win.addEventListener('resize',onResize);
  win.addEventListener('beforeprint',beforePrint);win.addEventListener('afterprint',afterPrint);
  /* Index only stable resource controls, after table generation. No durable learner state. */
  invokers=[].slice.call(reader.querySelectorAll('a[href],[data-fd-open],[data-tool],[data-f]'));
  function capturePractice(event){
    var control=event.target.closest&&event.target.closest('a[href],[data-fd-open],[data-tool],[data-f]');
    if(!control||!reader.contains(control)||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    var target=control.getAttribute('data-fd-open')||control.getAttribute('data-tool')||control.getAttribute('data-f');
    if(!target&&control.tagName==='A'){
      var u;try{u=new URL(control.href,win.location.href);}catch(_){return;}
      if(u.origin!==win.location.origin||u.pathname!==win.location.pathname)return;
      target=u.searchParams.get('tool')||u.searchParams.get('page');
    }
    if(!target||!o.isPractice||!o.isPractice(target)||!o.onPractice)return;
    o.onPractice({ref:ref,target:target,search:win.location.search,scroll:win.scrollY,
      invoker:invokers.indexOf(control),
      sections:[].map.call(body.querySelectorAll('.sec-c'),function(s){return s.classList.contains('open');}),
      tables:tableModes.map(function(m){return !m.rows.hidden;})});
  }
  reader.addEventListener('click',capturePractice,true);updateCurrent();
  return {
    arrive:function(search,focusAllowed){
      var params=new URLSearchParams(search||''), query=params.get('guideFind'), id=params.get('guideSection');
      if(id&&id.length>130)id=null;
      if(query)find(query,focusAllowed);
      else if(id){
        var h=headings.filter(function(node){return node.id===id||node.id==='guide-'+id;})[0];
        if(h){arrival('Opened at “'+headingText(h)+'”.',h);if(focusAllowed)go(h,false);}
      }
    },
    restore:function(bookmark,focusAllowed){
      /* Ordinary navigation strips passage context. A return to this same guide restores
         it in the URL as well as the UI, so reload and copied links keep the passage. */
      var params=new URLSearchParams(bookmark.search||'');
      var section=(params.get('guideSection')||'').slice(0,130);
      /* The saved value is already serialized; restore the prefix that passageURL removes. */
      replaceURL(section?'guide-'+section:'',(params.get('guideFind')||'').slice(0,160));
      each(body.querySelectorAll('.sec-c'),function(s,i){
        var open=bookmark.sections[i]!==false;s.classList.toggle('open',open);
        var b=s.querySelector('.sec-h button');if(b)b.setAttribute('aria-expanded',String(open));
      });
      tableModes.forEach(function(m,i){m.set(bookmark.tables[i]===true);});
      if(!focusAllowed)return;
      var control=invokers[bookmark.invoker];
      if(control){expose(control);control.focus({preventScroll:true});}
      win.scrollTo(0,bookmark.scroll);
      win.requestAnimationFrame(function(){if(!disposed){win.scrollTo(0,bookmark.scroll);updateCurrent();}});
    },
    destroy:function(){
      disposed=true;if(frame)win.cancelAnimationFrame(frame);afterPrint();
      win.removeEventListener('scroll',onScroll);win.removeEventListener('resize',onResize);
      win.removeEventListener('beforeprint',beforePrint);win.removeEventListener('afterprint',afterPrint);
      reader.removeEventListener('click',capturePractice,true);
    }
  };
}
