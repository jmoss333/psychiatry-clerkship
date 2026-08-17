/* Front door route, action, and resource controller. This file is injected after every pure
   renderer, but the current shell deliberately does not call fdWire yet. Keeping installation
   opt-in lets this controller be verified before the later atomic shell cutover.

   fdResolveState, fdDispatch, and fdResourceRequest are pure. Browser effects live in fdWire and
   fdOpenResource behind explicit options so the same decisions can be tested without a DOM. */

var FD_HANDLED_ATTRS=[
  'data-fd-open','data-fd-sheet','data-fd-safety','data-fd-toggle','data-fd-tab',
  'data-fd-week','data-fd-view-week','data-fd-setweek','data-fd-role','data-fd-step',
  'data-fd-back','data-fd-home','data-fd-search','data-fd-change-week','data-fd-progress',
  'data-fd-theme','data-fd-close-search','data-fd-close-sheet','data-fd-close-nudge',
  'data-fd-try-now'
];

var FD_ACTION_SEMANTICS={
  'data-fd-open':'open routed resource',
  'data-fd-sheet':'modify open into preview sheet',
  'data-fd-safety':'open safety kit or protocol',
  'data-fd-toggle':'toggle governed progress',
  'data-fd-tab':'open top-level tab',
  'data-fd-week':'select setup week',
  'data-fd-view-week':'preview path week',
  'data-fd-setweek':'adopt previewed week',
  'data-fd-role':'select setup role',
  'data-fd-step':'toggle session protocol step',
  'data-fd-back':'return to originating tab',
  'data-fd-home':'return to Today',
  'data-fd-search':'open search dialog',
  'data-fd-change-week':'reopen week setup',
  'data-fd-progress':'open Progress and mastery',
  'data-fd-theme':'toggle saved color theme',
  'data-fd-close-search':'close search dialog',
  'data-fd-close-sheet':'close side sheet',
  'data-fd-close-nudge':'dismiss protocol nudge',
  'data-fd-try-now':'preview related tool'
};

function fdActionSemantic(attr){
  return FD_ACTION_SEMANTICS[attr]||null;
}

function fdOwn(o,k){ return !!o&&Object.prototype.hasOwnProperty.call(o,k); }

function fdValidTab(tab){ return tab==='path'||tab==='library'||tab==='today'; }

function fdClone(o){
  var out={}, src=o||{};
  for(var k in src){ if(fdOwn(src,k)) out[k]=src[k]; }
  return out;
}

function fdResolveState(url, stored){
  var src=stored||{}, out={};
  if(typeof src.role==='string'&&src.role) out.role=src.role;
  out.tab=fdValidTab(src.tab)?src.tab:'today';
  if(typeof src.openId==='string'&&src.openId) out.openId=src.openId;
  if(fdValidTab(src.fromTab)) out.fromTab=src.fromTab;
  if(typeof src.week==='number'&&!isNaN(src.week)) out.week=src.week;
  if(typeof src.viewWeek==='number'&&!isNaN(src.viewWeek)) out.viewWeek=src.viewWeek;
  else if(typeof out.week==='number'&&!isNaN(out.week)) out.viewWeek=out.week;
  else out.viewWeek=1;
  out.autoAdvance=src.autoAdvance!==false;

  var parsed;
  try{ parsed=new URL(String(url||''),'https://frontdoor.invalid/'); }catch(_){ parsed=null; }
  if(parsed){
    var routedTab=parsed.searchParams.get('tab');
    var routedRef=parsed.searchParams.get('page')||parsed.searchParams.get('tool');
    if(routedTab&&fdValidTab(routedTab)){
      out.tab=routedTab;
      delete out.openId;
    }
    if(routedRef){
      out.fromTab=out.tab;
      out.openId=routedRef;
    }
  }

  if(!out.role&&src.rotationStart&&src.roles&&src.roles.length){
    var first=src.roles[0]||{};
    if(first.id) out.role=first.id;
  }
  if(!out.role) out.screen='setup-role';
  else if(src.rotationStart||typeof out.week==='number'||src.browsing||out.tab==='library') out.screen='app';
  else out.screen='setup-week';
  return out;
}

function fdParamsWithoutRoute(search){
  var params;
  try{ params=new URLSearchParams(String(search||'').replace(/^\?/,'')); }
  catch(_){ return new URLSearchParams(); }
  params.delete('page');
  params.delete('tool');
  params.delete('tab');
  return params;
}

function fdExtraSearch(search){
  var params=fdParamsWithoutRoute(search);
  var q=params.toString();
  return q?'&'+q:'';
}

function fdRouteForTab(tab){ return tab==='today'?'/':('?tab='+encodeURIComponent(tab)); }

function fdRouteForRef(ref, search){
  var key=/\.html$/.test(String(ref||''))?'tool':'page';
  return '?'+key+'='+encodeURIComponent(ref)+fdExtraSearch(search);
}

function fdNumberAttr(attrs,name){
  if(!fdOwn(attrs,name)) return null;
  var n=Number(attrs[name]);
  return isFinite(n)&&n%1===0?n:null;
}

function fdProtocolRef(sheet){
  if(!sheet||sheet==='kit'||String(sheet).indexOf('item:')===0) return null;
  return String(sheet);
}

function fdCloseSheet(state){
  var ref=fdProtocolRef(state&&state.sheet);
  var unread=!!ref&&!((state.done||{})[ref]===true);
  return {
    patch:{sheet:null,sheetFrom:null,stepsDone:{},nudge:unread?ref:null},
    route:null,
    effect:unread?{type:'nudge-timeout',delay:8000}:null
  };
}

function fdDispatch(attrs, context, state){
  var a=attrs||{}, c=context||{}, s=state||{}, ref, n, patch, done, raw, next, tab;

  if(fdOwn(a,'close')){
    if(s.searchOpen) return {patch:{searchOpen:false,query:''},route:null,effect:null};
    if(s.sheet) return fdCloseSheet(s);
    if(s.nudge) return {patch:{nudge:null},route:null,effect:null};
    return {patch:{},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-close-search')){
    return {patch:{searchOpen:false,query:''},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-close-sheet')) return fdCloseSheet(s);
  if(fdOwn(a,'data-fd-close-nudge')){
    return {patch:{nudge:null},route:null,effect:null};
  }

  if(fdOwn(a,'data-fd-view-week')){
    n=fdNumberAttr(a,'data-fd-view-week');
    if(n===null) return {patch:{},route:null,effect:null};
    return {patch:{tab:'path',viewWeek:n,openId:null},route:'?tab=path',effect:null};
  }
  if(fdOwn(a,'data-fd-week')){
    n=fdNumberAttr(a,'data-fd-week');
    if(n===0){
      return {
        patch:{week:null,tab:'library',viewWeek:1,screen:'app',openId:null},
        route:'?tab=library',effect:{type:'browse-without-rotation'}
      };
    }
    if(n===null||n<1||n>6) return {patch:{},route:null,effect:null};
    return {
      patch:{week:n,viewWeek:n,tab:'today',screen:'app',openId:null},route:'/',
      effect:{type:'set-rotation',start:fdRotationStartForWeek(n,c.nowMs)}
    };
  }
  if(fdOwn(a,'data-fd-setweek')){
    n=fdNumberAttr(a,'data-fd-setweek');
    if(n===null||n<1||n>6) return {patch:{},route:null,effect:null};
    return {
      patch:{week:n,viewWeek:n,screen:'app'},route:null,
      effect:{type:'set-rotation',start:fdRotationStartForWeek(n,c.nowMs)}
    };
  }

  if(fdOwn(a,'data-fd-safety')){
    ref=a['data-fd-safety'];
    if(ref){
      return {
        patch:{sheet:String(ref),sheetFrom:c.inSheet?'kit':null,stepsDone:{},searchOpen:false},
        route:null,effect:{type:'open-protocol',ref:String(ref)}
      };
    }
    return {
      patch:{sheet:'kit',sheetFrom:null,stepsDone:{},searchOpen:false},
      route:null,effect:{type:'open-sheet',ref:null}
    };
  }

  if(fdOwn(a,'data-fd-try-now')){
    ref=String(a['data-fd-try-now']||'');
    return {
      patch:{sheet:'item:'+ref,sheetFrom:null,stepsDone:{},searchOpen:false},
      route:null,effect:{type:'open-sheet',ref:ref}
    };
  }
  if(fdOwn(a,'data-fd-open')){
    ref=String(a['data-fd-open']||'');
    if(fdOwn(a,'data-fd-sheet')){
      return {
        patch:{sheet:'item:'+ref,sheetFrom:null,stepsDone:{},searchOpen:false},
        route:null,effect:{type:'open-sheet',ref:ref}
      };
    }
    tab=fdValidTab(s.tab)?s.tab:'today';
    return {
      patch:{openId:ref,fromTab:tab,searchOpen:false,sheet:null},
      route:fdRouteForRef(ref,c.search),effect:{type:'open-resource',ref:ref}
    };
  }

  if(fdOwn(a,'data-fd-toggle')){
    ref=String(a['data-fd-toggle']||'');
    done=fdClone(s.done);
    var mark=done[ref]!==true;
    if(mark) done[ref]=true;
    else delete done[ref];
    raw=fdProgressToggle(c.progressRaw||s.progressRaw||{},ref,mark,c.nowMs);
    patch={done:done,justDone:mark?ref:null};
    var effect={type:'toggle-progress',ref:ref,done:mark,raw:raw};
    if(mark&&s.openId===ref&&s.autoAdvance!==false){
      next=fdReaderNextUnread(c.weekItems||[],ref,done);
      if(next){
        patch.openId=next.ref;
        patch.navDir=1;
        effect.openRef=next.ref;
        return {patch:patch,route:fdRouteForRef(next.ref,c.search),effect:effect};
      }
      tab=fdValidTab(s.fromTab)?s.fromTab:'today';
      patch.openId=null;
      patch.tab=tab;
      return {patch:patch,route:fdRouteForTab(tab),effect:effect};
    }
    return {patch:patch,route:null,effect:effect};
  }

  if(fdOwn(a,'data-fd-tab')){
    tab=String(a['data-fd-tab']||'');
    if(!fdValidTab(tab)) return {patch:{},route:null,effect:null};
    return {
      patch:{tab:tab,openId:null,searchOpen:false},route:fdRouteForTab(tab),effect:null
    };
  }
  if(fdOwn(a,'data-fd-role')){
    return {
      patch:{role:String(a['data-fd-role']||''),screen:'setup-week'},route:null,effect:null
    };
  }
  if(fdOwn(a,'data-fd-step')){
    n=fdNumberAttr(a,'data-fd-step');
    patch=fdClone(s.stepsDone);
    if(n!==null) patch[n]=!patch[n];
    return {patch:{stepsDone:patch},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-back')){
    if(s.screen==='setup-week'){
      return {patch:{role:null,screen:'setup-role'},route:null,effect:null};
    }
    tab=fdValidTab(s.fromTab)?s.fromTab:(fdValidTab(s.tab)?s.tab:'today');
    return {patch:{openId:null,tab:tab},route:fdRouteForTab(tab),effect:null};
  }
  if(fdOwn(a,'data-fd-home')){
    return {patch:{tab:'today',openId:null,searchOpen:false,sheet:null},route:'/',effect:null};
  }
  if(fdOwn(a,'data-fd-search')){
    return {patch:{searchOpen:true},route:null,effect:{type:'focus-search'}};
  }
  if(fdOwn(a,'data-fd-change-week')){
    return {
      patch:{screen:'setup-week',searchOpen:false,sheet:null},route:null,effect:null
    };
  }
  if(fdOwn(a,'data-fd-progress')){
    tab=fdValidTab(s.tab)?s.tab:'today';
    return {
      patch:{openId:'__progress__',fromTab:tab,searchOpen:false,sheet:null},
      route:'?page=__progress__',effect:{type:'open-progress'}
    };
  }
  if(fdOwn(a,'data-fd-theme')){
    var theme=c.theme==='dark'?'light':'dark';
    return {patch:{},route:null,effect:{type:'set-theme',theme:theme}};
  }
  return {patch:{},route:null,effect:null};
}

function fdResourceRequest(ref, search){
  var r=String(ref||''), kind=/\.html$/.test(r)?'tool':'read';
  var params=fdParamsWithoutRoute(search);
  var toolExtra='';
  if(kind==='tool'){
    if(typeof toolExtraFromParams==='function') toolExtra=toolExtraFromParams(params);
    else{
      var raw=params.toString();
      toolExtra=raw?'&'+raw:'';
    }
  }
  var suffix='';
  if(kind==='tool'){
    if(typeof toolFrameSuffixWithGovernance==='function'){
      suffix=toolFrameSuffixWithGovernance(toolExtra);
    } else {
      params.set('governed','1');
      suffix='?'+params.toString();
    }
  }
  return {
    kind:kind,url:(kind==='tool'?'tools/':'content/')+encodeURIComponent(r),
    frameSuffix:suffix,toolExtra:toolExtra
  };
}

function fdWireEsc(s){
  return String(s===null||s===undefined?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fdLegacyItem(item, ref, kind){
  var it=item||{};
  return {f:ref,t:it.title||ref,k:kind==='tool'?'tool':'md'};
}

function fdDefaultIndex(){
  if(typeof fdBuildIndex==='function'&&typeof FD_CURRICULUM!=='undefined'){
    return fdBuildIndex(FD_CURRICULUM,FD_TOPIC_META,FD_TOOL_REGISTRY,FD_SITE_MANIFEST);
  }
  return {byRef:{},weeks:[],columns:[],kit:[]};
}

function fdOpenResource(ref, opts){
  var o=opts||{}, index=o.index||fdDefaultIndex(), state=fdClone(o.state||{});
  var search=o.search;
  if(search===undefined&&typeof location!=='undefined') search=location.search;
  var request=fdResourceRequest(ref,search||'');
  var item=(index.byRef||{})[ref]||{
    ref:ref,kind:request.kind,title:ref,minutes:null,summary:'',points:[],attested:false
  };
  var legacy=fdLegacyItem(item,ref,request.kind);
  var host=o.host||(typeof contentEl!=='undefined'?contentEl:null);
  var facultyMatch=o.facultyPreviewMatches||
    (typeof facultyPreviewMatchesItem==='function'?facultyPreviewMatchesItem:null);
  var facultyLock=o.facultyPreviewLock||
    (typeof showFacultyPreviewLockNotice==='function'?showFacultyPreviewLockNotice:null);
  if(facultyMatch&&facultyMatch(legacy,{toolExtra:request.toolExtra})===false){
    if(facultyLock) facultyLock();
    return Promise.resolve(false);
  }

  /* The existing preview route owns its preflight, exact query validation, status receipt, and
     navigation lock. Delegate that path whole rather than creating a more permissive twin. */
  if(typeof facultyPreviewRequest!=='undefined'&&facultyPreviewRequest&&typeof show==='function'){
    return Promise.resolve(show(legacy,null,{
      fromHistory:!!o.fromHistory,toolExtra:request.toolExtra
    })!==false);
  }

  var governance=o.governanceNotice||
    (typeof renderGovernanceNotice==='function'?renderGovernanceNotice:function(){return '';});
  var bar=governance(legacy)||'';
  var renderReader=o.renderReader||
    (typeof fdReader==='function'?fdReader:function(_i,_s,body){return body;});
  state.ref=ref;
  if(!state.fromTab) state.fromTab=state.tab||'today';

  function mount(body){
    if(host) host.innerHTML=renderReader(index,state,bar+body);
    return true;
  }
  function fail(){
    if(host){
      host.innerHTML='<div class="fd-fallback" role="alert"><h1>Page unavailable</h1>'+
        '<p>This resource could not load. Check your connection and try again.</p></div>';
    }
    if(o.previewStatus) o.previewStatus('error',request.kind==='tool'?'tool':'page');
    return false;
  }

  if(request.kind==='tool'){
    var src=fdWireEsc(request.url+request.frameSuffix);
    var frame='<iframe class="toolframe" src="'+src+'" title="'+
      fdWireEsc(item.title||ref)+'"></iframe>';
    try{ return Promise.resolve(mount(frame)); }catch(_){ return Promise.resolve(fail()); }
  }

  var fetcher=o.fetcher||(typeof fetch==='function'?fetch:null);
  var parser=o.parseMarkdown||
    (typeof marked!=='undefined'&&marked&&typeof marked.parse==='function'?marked.parse:null);
  if(!fetcher||!parser) return Promise.resolve(fail());
  return fetcher(request.url).then(function(response){
    if(!response||!response.ok) throw new Error('resource unavailable');
    return response.text();
  }).then(function(markdown){
    var split=String(markdown||'').indexOf('\n## ');
    var head=split>-1?String(markdown).slice(0,split):String(markdown||'');
    var rest=split>-1?String(markdown).slice(split):'';
    var clean=head.replace(/^[ \t]*(Generated|Audience):.*$/gim,'')
      .replace(/\n{3,}/g,'\n\n')+rest;
    var ok=mount(parser(clean));
    if(o.previewStatus) o.previewStatus('ready','page');
    return ok;
  }).catch(function(){ return fail(); });
}

function fdIsTypingTarget(target){
  if(!target) return false;
  var tag=String(target.tagName||'').toUpperCase();
  return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||target.isContentEditable===true;
}

function fdFocusable(dialog){
  if(!dialog||!dialog.querySelectorAll) return [];
  var all=dialog.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])');
  var out=[];
  for(var i=0;i<all.length;i++){
    if(!all[i].disabled&&all[i].getAttribute&&all[i].getAttribute('aria-hidden')!=='true') out.push(all[i]);
    else if(!all[i].disabled&&!all[i].getAttribute) out.push(all[i]);
  }
  return out;
}

function fdTrapFocus(event, dialog){
  if(!event||event.key!=='Tab'||!dialog) return false;
  var focusable=fdFocusable(dialog);
  if(!focusable.length){ if(event.preventDefault) event.preventDefault(); return true; }
  var first=focusable[0], last=focusable[focusable.length-1];
  if(event.shiftKey&&event.target===first){
    if(event.preventDefault) event.preventDefault();
    if(last.focus) last.focus();
    return true;
  }
  if(!event.shiftKey&&event.target===last){
    if(event.preventDefault) event.preventDefault();
    if(first.focus) first.focus();
    return true;
  }
  return false;
}

var FD_ACTION_SELECTOR='[data-fd-open],[data-fd-safety],[data-fd-toggle],[data-fd-tab],'+
  '[data-fd-week],[data-fd-view-week],[data-fd-setweek],[data-fd-role],[data-fd-step],'+
  '[data-fd-back],[data-fd-home],[data-fd-search],[data-fd-change-week],[data-fd-progress],'+
  '[data-fd-theme],[data-fd-close-search],[data-fd-close-sheet],[data-fd-close-nudge],'+
  '[data-fd-try-now]';

function fdAttrsFromTarget(target){
  var out={};
  for(var i=0;i<FD_HANDLED_ATTRS.length;i++){
    var name=FD_HANDLED_ATTRS[i];
    if(target&&target.hasAttribute&&target.hasAttribute(name)) out[name]=target.getAttribute(name)||'';
  }
  return out;
}

function fdWire(root, initialState, opts){
  var o=opts||{}, win=o.window||(typeof window!=='undefined'?window:null);
  var doc=o.document||(typeof document!=='undefined'?document:null);
  var state=fdClone(initialState||{}), invokers=[], nudgeTimer=null;
  var render=o.render||function(){};
  var setTimer=o.setTimer||(typeof setTimeout==='function'?setTimeout:null);
  var clearTimer=o.clearTimer||(typeof clearTimeout==='function'?clearTimeout:null);
  var index=o.index||fdDefaultIndex();

  function dialog(){
    if(!root||!root.querySelector) return null;
    if(state.searchOpen) return root.querySelector('.fd-search[role="dialog"]');
    if(state.sheet) return root.querySelector('.fd-sheet[role="dialog"]');
    return null;
  }
  function focusDialog(){
    var d=dialog();
    if(!d) return;
    var first=(d.querySelector&&d.querySelector('.fd-searchpanel__input'))||fdFocusable(d)[0]||d;
    if(first&&first.focus) try{first.focus();}catch(_){}
  }
  function restoreInvoker(){
    var el=invokers.pop();
    if(el&&el.isConnected!==false&&el.focus) try{el.focus();}catch(_){}
  }
  function currentTheme(){
    if(doc&&doc.documentElement&&doc.documentElement.getAttribute){
      return doc.documentElement.getAttribute('data-theme')||'light';
    }
    return 'light';
  }
  function progressRaw(){
    try{ return JSON.parse(localStorage.getItem('cw_progress_v1')||'{}')||{}; }
    catch(_){ return {}; }
  }
  function routeTo(route){
    if(!route) return;
    if(o.route){ o.route(route); return; }
    if(typeof facultyPreviewRequest!=='undefined'&&facultyPreviewRequest){
      if(typeof showFacultyPreviewLockNotice==='function') showFacultyPreviewLockNotice();
      return;
    }
    if(win&&win.history&&win.history.pushState){
      try{ win.history.pushState({},'',route); }catch(_){}
    }
  }
  function fdApplyEffect(effect, fromHistory){
    if(!effect) return;
    if(effect.type==='set-rotation'){
      try{ localStorage.setItem('cw_rotation_start',effect.start); }catch(_){}
    } else if(effect.type==='toggle-progress'){
      try{ localStorage.setItem('cw_progress_v1',JSON.stringify(effect.raw)); }catch(_){}
      if(effect.done&&typeof seedSRS==='function') try{seedSRS(effect.ref);}catch(_){}
      if(effect.openRef){
        var progressOpener=o.openResource||fdOpenResource;
        progressOpener(effect.openRef,{
          index:index,state:state,search:(win&&win.location&&win.location.search)||'',
          fromHistory:!!fromHistory
        });
      }
    } else if(effect.type==='set-theme'){
      if(doc&&doc.documentElement) doc.documentElement.setAttribute('data-theme',effect.theme);
      try{ localStorage.setItem('cw_theme',effect.theme); }catch(_){}
    } else if(effect.type==='nudge-timeout'&&setTimer){
      if(nudgeTimer&&clearTimer) clearTimer(nudgeTimer);
      nudgeTimer=setTimer(function(){
        state.nudge=null;
        render(state);
      },effect.delay);
    } else if(effect.type==='open-resource'){
      var opener=o.openResource||fdOpenResource;
      opener(effect.ref,{
        index:index,state:state,search:(win&&win.location&&win.location.search)||'',
        fromHistory:!!fromHistory
      });
    } else if(effect.type==='open-progress'){
      if(o.openProgress) o.openProgress();
      else if(typeof navClick==='function') navClick('__progress__');
    }
  }
  function apply(result, invoker, fromHistory){
    var beforeOverlay=!!(state.searchOpen||state.sheet);
    var patch=result.patch||{};
    var opening=(!state.searchOpen&&patch.searchOpen===true)||(!state.sheet&&!!patch.sheet);
    var closing=(state.searchOpen&&patch.searchOpen===false)||(state.sheet&&patch.sheet===null);
    if(opening&&invoker) invokers.push(invoker);
    for(var k in patch){ if(fdOwn(patch,k)) state[k]=patch[k]; }
    fdSave(state);
    if(!fromHistory) routeTo(result.route);
    fdApplyEffect(result.effect,fromHistory);
    render(state);
    if(opening) focusDialog();
    else if(closing&&beforeOverlay) restoreInvoker();
    return state;
  }
  function context(extra){
    var c={
      nowMs:Date.now(),theme:currentTheme(),
      search:(win&&win.location&&win.location.search)||'',
      progressRaw:progressRaw(),weekItems:fdItemsForWeek(index,state.week)
    };
    var add=extra||{};
    for(var k in add){ if(fdOwn(add,k)) c[k]=add[k]; }
    return c;
  }
  function clickHandler(event){
    var target=event.target&&event.target.closest?event.target.closest(FD_ACTION_SELECTOR):null;
    if(!target) return;
    var attrs=fdAttrsFromTarget(target);
    if(event.preventDefault) event.preventDefault();
    apply(fdDispatch(attrs,context({inSheet:!!state.sheet}),state),target,false);
  }
  function inputHandler(event){
    var target=event.target;
    if(!target||!target.matches||!target.matches('.fd-searchpanel__input')) return;
    state.query=String(target.value||'');
    render(state);
  }
  function keyHandler(event){
    var d=dialog();
    if(d&&fdTrapFocus(event,d)) return;
    if(event.key==='Enter'&&state.searchOpen&&fdIsTypingTarget(event.target)){
      var searcher=o.searchResults||fdSearchResults;
      var results=searcher(index,state.query||'',o.synonyms||{},state)||[];
      if(results.length){
        var first=results[0], attrs={};
        if(first.kind==='protocol') attrs['data-fd-safety']=first.item.ref;
        else{
          attrs['data-fd-open']=first.item.ref;
          attrs['data-fd-sheet']='';
        }
        if(event.preventDefault) event.preventDefault();
        apply(fdDispatch(attrs,context(),state),event.target,false);
      }
      return;
    }
    var action=fdKeyAction(event.key,{
      typing:fdIsTypingTarget(event.target),screen:state.screen||'app',
      searchOpen:!!state.searchOpen,sheetOpen:!!state.sheet,reading:!!state.openId,
      meta:!!(event.metaKey||event.ctrlKey)
    });
    if(!action) return;
    var attrs={};
    if(action.type==='close') attrs.close=true;
    else if(action.type==='search') attrs['data-fd-search']='';
    else if(action.type==='tab') attrs['data-fd-tab']=action.tab;
    else if(action.type==='nav'){
      var neighbours=fdReaderNeighbours(index,state.openId,state.week);
      var item=action.dir<0?neighbours.prev:neighbours.next;
      if(!item) return;
      attrs['data-fd-open']=item.ref;
    }
    if(event.preventDefault) event.preventDefault();
    apply(fdDispatch(attrs,context(),state),event.target,false);
  }
  function popstateHandler(){
    if(!win||!win.location) return;
    var merged=fdClone(state);
    merged.roles=o.roles||merged.roles;
    merged.rotationStart=o.rotationStart||merged.rotationStart;
    state=fdResolveState(win.location.href,merged);
    render(state);
    fdSave(state);
    if(state.openId){
      var opener=o.openResource||fdOpenResource;
      opener(state.openId,{
        index:index,state:state,search:win.location.search||'',fromHistory:true
      });
    }
  }

  if(root&&root.addEventListener){
    root.addEventListener('click',clickHandler);
    root.addEventListener('input',inputHandler);
  }
  if(win&&win.addEventListener){
    win.addEventListener('keydown',keyHandler);
    win.addEventListener('popstate',popstateHandler);
  }

  return {
    getState:function(){ return state; },
    dispatch:function(attrs,c){ return apply(fdDispatch(attrs,context(c),state),null,false); },
    destroy:function(){
      if(root&&root.removeEventListener){
        root.removeEventListener('click',clickHandler);
        root.removeEventListener('input',inputHandler);
      }
      if(win&&win.removeEventListener){
        win.removeEventListener('keydown',keyHandler);
        win.removeEventListener('popstate',popstateHandler);
      }
      if(nudgeTimer&&clearTimer) clearTimer(nudgeTimer);
    }
  };
}
