/* Front door route, action, and resource controller. The governed shell installs exactly one
   fdWire instance after the pure renderers. fdResolveState, fdDispatch, and fdResourceRequest are
   pure; browser effects live in fdWire and fdOpenResource behind explicit options so the same
   decisions can be tested without a DOM. */

var FD_HANDLED_ATTRS=[
  'data-fd-open','data-fd-sheet','data-fd-safety','data-fd-toggle','data-fd-tab',
  'data-fd-week','data-fd-view-week','data-fd-setweek','data-fd-role','data-fd-step',
  'data-fd-back','data-fd-home','data-fd-search','data-fd-change-week','data-fd-progress',
  'data-fd-theme','data-fd-close-search','data-fd-close-sheet','data-fd-close-nudge',
  'data-fd-try-now','data-fd-expand-tool'
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
  'data-fd-try-now':'preview related tool',
  'data-fd-expand-tool':'toggle saved tool workspace width'
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

function fdIsLegacyRouteAlias(ref){
  return ref==='__home__'||ref==='__path__'||ref==='__start__';
}

function fdLegacyRouteResult(ref, context, state){
  var c=context||{}, s=state||{};
  if(ref==='__home__'){
    return {
      patch:{tab:'today',openId:null,searchOpen:false,sheet:null},
      route:fdRouteForTab('today',c.search),history:'replace',effect:null
    };
  }
  if(ref==='__path__'){
    return {
      patch:{tab:'path',openId:null,searchOpen:false,sheet:null},
      route:fdRouteForTab('path',c.search),history:'replace',effect:null
    };
  }
  if(ref==='__start__'){
    if(s.screen==='app'){
      return {
        patch:{tab:'today',openId:'__progress__',fromTab:'today',searchOpen:false,sheet:null},
        route:fdRouteForRef('__progress__',c.search),history:'replace',
        effect:{type:'open-progress'}
      };
    }
    return {
      patch:{tab:'today',openId:null,searchOpen:false,sheet:null},
      route:fdRouteForTab('today',c.search),history:'replace',effect:null
    };
  }
  return null;
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
  if(src.toolExpanded!==undefined) out.toolExpanded=src.toolExpanded===true;

  var parsed, routedRef=null;
  try{ parsed=new URL(String(url||''),'https://frontdoor.invalid/'); }catch(_){ parsed=null; }
  if(parsed){
    var routedTab=parsed.searchParams.get('tab');
    routedRef=parsed.searchParams.get('page')||parsed.searchParams.get('tool');
    if(routedTab&&fdValidTab(routedTab)){
      out.tab=routedTab;
      delete out.openId;
    }
    if(routedRef&&!fdIsLegacyRouteAlias(routedRef)){
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
  if(routedRef&&fdIsLegacyRouteAlias(routedRef)){
    if(routedRef==='__home__'){
      out.tab='today';
      delete out.openId;
    } else if(routedRef==='__path__'){
      out.tab='path';
      delete out.openId;
    } else if(out.screen==='app'){
      out.tab='today';
      out.fromTab='today';
      out.openId='__progress__';
    } else {
      out.tab='today';
      delete out.openId;
    }
  }
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

function fdRouteForTab(tab, search){
  var params=fdParamsWithoutRoute(search), extra=params.toString();
  if(tab==='today') return extra?('/?'+extra):'/';
  return '?tab='+encodeURIComponent(tab)+(extra?'&'+extra:'');
}

function fdRouteForRef(ref, search){
  var key=/\.html$/.test(String(ref||''))?'tool':'page';
  return '?'+key+'='+encodeURIComponent(ref)+fdExtraSearch(search);
}

function fdNumberAttr(attrs,name){
  if(!fdOwn(attrs,name)) return null;
  var n=Number(attrs[name]);
  return isFinite(n)&&n%1===0?n:null;
}

function fdDispatchHasWeek(context, n){
  return !!fdFindWeek(context&&context.index,n);
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
    if(n===null||!fdDispatchHasWeek(c,n)) return {patch:{},route:null,effect:null};
    return {
      patch:{tab:'path',viewWeek:n,openId:null},
      route:fdRouteForTab('path',c.search),effect:null
    };
  }
  if(fdOwn(a,'data-fd-week')){
    n=fdNumberAttr(a,'data-fd-week');
    if(n===0){
      var firstWeek=(c.index&&c.index.weeks&&c.index.weeks[0])||{};
      return {
        patch:{week:null,tab:'library',viewWeek:firstWeek.n,screen:'app',openId:null},
        route:fdRouteForTab('library',c.search),effect:{type:'browse-without-rotation'}
      };
    }
    if(n===null||!fdDispatchHasWeek(c,n)) return {patch:{},route:null,effect:null};
    return {
      patch:{week:n,viewWeek:n,tab:'today',screen:'app',openId:null},
      route:fdRouteForTab('today',c.search),
      effect:{type:'set-rotation',start:fdRotationStartForWeek(n,c.index.weeks,c.nowMs)}
    };
  }
  if(fdOwn(a,'data-fd-setweek')){
    n=fdNumberAttr(a,'data-fd-setweek');
    if(n===null||!fdDispatchHasWeek(c,n)) return {patch:{},route:null,effect:null};
    return {
      patch:{week:n,viewWeek:n,screen:'app'},route:null,
      effect:{type:'set-rotation',start:fdRotationStartForWeek(n,c.index.weeks,c.nowMs)}
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
    if(fdIsLegacyRouteAlias(ref)) return fdLegacyRouteResult(ref,c,s);
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

  if(fdOwn(a,'data-fd-expand-tool')){
    if(!fdIsTool(s.openId||'')) return {patch:{},route:null,effect:null};
    return {
      patch:{toolExpanded:s.toolExpanded!==true},route:null,
      effect:{type:'toggle-tool-layout'}
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
      return {patch:patch,route:fdRouteForTab(tab,c.search),effect:effect};
    }
    return {patch:patch,route:null,effect:effect};
  }

  if(fdOwn(a,'data-fd-tab')){
    tab=String(a['data-fd-tab']||'');
    if(!fdValidTab(tab)) return {patch:{},route:null,effect:null};
    return {
      patch:{tab:tab,openId:null,searchOpen:false},
      route:fdRouteForTab(tab,c.search),effect:null
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
    return {patch:{openId:null,tab:tab},route:fdRouteForTab(tab,c.search),effect:null};
  }
  if(fdOwn(a,'data-fd-home')){
    return {
      patch:{tab:'today',openId:null,searchOpen:false,sheet:null},
      route:fdRouteForTab('today',c.search),effect:null
    };
  }
  if(fdOwn(a,'data-fd-search')){
    return {patch:{searchOpen:true},route:null,effect:{type:'focus-search'}};
  }
  if(fdOwn(a,'data-fd-change-week')){
    tab=s.openId&&fdValidTab(s.fromTab)?s.fromTab:(fdValidTab(s.tab)?s.tab:'today');
    return {
      patch:{screen:'setup-week',tab:tab,openId:null,searchOpen:false,sheet:null},
      route:fdRouteForTab(tab,c.search),history:'replace',effect:null
    };
  }
  if(fdOwn(a,'data-fd-progress')){
    tab=fdValidTab(s.tab)?s.tab:'today';
    return {
      patch:{openId:'__progress__',fromTab:tab,searchOpen:false,sheet:null},
      route:fdRouteForRef('__progress__',c.search),effect:{type:'open-progress'}
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
  var renderReader=o.renderReader||
    (typeof fdReader==='function'?fdReader:function(_i,_s,body){return body;});
  state.ref=ref;
  if(!state.fromTab) state.fromTab=state.tab||'today';

  function current(){ return !o.isCurrent||o.isCurrent(ref)!==false; }
  function currentRenderState(){
    var latest=typeof o.getState==='function'?o.getState():state;
    var mounted=fdClone(latest||{});
    mounted.ref=ref;
    if(!mounted.fromTab) mounted.fromTab=state.fromTab||mounted.tab||'today';
    return mounted;
  }
  function mount(body){
    if(!current()) return false;
    var bar=governance(legacy)||'';
    if(host) host.innerHTML=renderReader(index,currentRenderState(),bar+body);
    return true;
  }
  function fail(){
    if(!current()) return false;
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
  return fetcher(request.url,o.signal?{signal:o.signal}:undefined).then(function(response){
    if(!response||!response.ok) throw new Error('resource unavailable');
    return response.text();
  }).then(function(markdown){
    if(!current()) return false;
    var split=String(markdown||'').indexOf('\n## ');
    var head=split>-1?String(markdown).slice(0,split):String(markdown||'');
    var rest=split>-1?String(markdown).slice(split):'';
    var clean=head.replace(/^[ \t]*(Generated|Audience):.*$/gim,'')
      .replace(/\n{3,}/g,'\n\n')+rest;
    clean=clean.replace(/^\uFEFF?(?:[ \t]*\r?\n)*[ \t]*#[ \t]+[^\r\n]*(?:\r?\n|$)/,'');
    var ok=mount(parser(clean));
    if(ok&&o.previewStatus) o.previewStatus('ready','page');
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
  '[data-fd-try-now],[data-fd-expand-tool]';

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
  var state=fdClone(initialState||{}), invokers=[], nudgeTimer=null, navGeneration=0;
  var destroyed=false, registrations=[], startupPrepared=false, startupCommitted=false;
  var render=o.render||function(){};
  var renderTransient=o.renderTransient||function(next,detail){
    if(!detail.preserveResource) render(next,detail);
  };
  var setTimer=o.setTimer||(typeof setTimeout==='function'?setTimeout:null);
  var clearTimer=o.clearTimer||(typeof clearTimeout==='function'?clearTimeout:null);
  var index=o.index||fdDefaultIndex();
  var previewRouteBase=previewActive()?currentRoute():null;

  function overlayIdentity(value){
    var s=value||{};
    if(s.searchOpen) return 'search';
    if(s.sheet) return 'sheet:'+s.sheet;
    return '';
  }
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
    while(invokers.length){
      var el=invokers.pop();
      if(el&&el.isConnected!==false&&el.focus){
        try{el.focus();}catch(_){}
        return;
      }
    }
  }
  function previewActive(){
    if(typeof o.facultyPreview==='function') return !!o.facultyPreview();
    if(o.facultyPreview!==undefined) return !!o.facultyPreview;
    return typeof facultyPreviewRequest!=='undefined'&&!!facultyPreviewRequest;
  }
  function externalModalOpen(){
    if(typeof o.externalModalOpen==='function') return !!o.externalModalOpen();
    return !!o.externalModalOpen;
  }
  function lockPreview(){
    if(o.facultyPreviewLock){ o.facultyPreviewLock(); return; }
    if(typeof showFacultyPreviewLockNotice==='function') showFacultyPreviewLockNotice();
  }
  function meaningfulResult(result){
    var r=result||{}, patch=r.patch||{};
    for(var k in patch){ if(fdOwn(patch,k)) return true; }
    return !!r.route||!!(r.effect&&r.effect.type&&r.effect.type!=='set-theme');
  }
  function historySnapshot(){
    var keys=['tab','viewWeek','openId','fromTab'];
    var snap={};
    for(var i=0;i<keys.length;i++){
      if(state[keys[i]]!==undefined) snap[keys[i]]=state[keys[i]];
    }
    return {fd:true,state:snap};
  }
  function historyValue(){
    try{ return JSON.stringify(historySnapshot().state); }
    catch(_){ return ''; }
  }
  function replaceHistorySnapshot(){
    if(!win||!win.history||!win.history.replaceState) return false;
    try{
      win.history.replaceState(historySnapshot(),'',currentRoute());
      return true;
    }catch(_){ return false; }
  }
  function currentRoute(){
    if(!win||!win.location) return '/';
    return (win.location.pathname||'/')+(win.location.search||'');
  }
  function currentRoutedRef(){
    if(!win||!win.location) return '';
    try{
      var params=new URLSearchParams(win.location.search||'');
      return params.get('page')||params.get('tool')||'';
    }catch(_){ return ''; }
  }
  function sameRoute(route){
    if(!route||!win||!win.location) return false;
    try{
      var next=new URL(route,win.location.href||'https://frontdoor.invalid/');
      return next.pathname+(next.search||'')===currentRoute();
    }catch(_){ return route===currentRoute(); }
  }
  function freshResourceHost(){
    if(typeof o.resourceHost==='function') return o.resourceHost(state);
    if(o.resourceHost) return o.resourceHost;
    if(root&&root.matches&&root.matches('#content')) return root;
    return root&&root.querySelector?root.querySelector('#content'):null;
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
  function routeTo(route,replace){
    if(!route||sameRoute(route)) return false;
    if(o.route){ o.route(route,historySnapshot(),replace?'replace':'push'); return true; }
    if(win&&win.history){
      try{
        if(replace&&win.history.replaceState){
          win.history.replaceState(historySnapshot(),'',route);
          return true;
        }
        if(win.history.pushState){
          win.history.pushState(historySnapshot(),'',route);
          return true;
        }
      }catch(_){}
    }
    return false;
  }
  function baseValue(value, key){
    var raw=value&&value[key];
    if(key==='openId') return raw||null;
    return raw||'';
  }
  function baseChanged(before, after){
    var keys=['openId','tab','screen'];
    for(var i=0;i<keys.length;i++){
      if(baseValue(before,keys[i])!==baseValue(after,keys[i])) return true;
    }
    return false;
  }
  function transitionDetail(before, patch, effect, changedBase){
    var changed=[], surfaces={base:false,overlay:false,completion:false,chrome:false,layout:false};
    var overlayKeys={searchOpen:true,query:true,sheet:true,sheetFrom:true,stepsDone:true,nudge:true};
    var actionKeys={done:true,justDone:true};
    for(var key in patch){
      if(fdOwn(patch,key)&&before[key]!==state[key]){
        changed.push(key);
        if(key==='toolExpanded') surfaces.layout=true;
        else if(overlayKeys[key]) surfaces.overlay=true;
        else if(actionKeys[key]) surfaces.completion=true;
        else surfaces.base=true;
        if(key==='week'||key==='role') surfaces.chrome=true;
      }
    }
    var type=effect&&effect.type;
    if(type==='set-theme') surfaces.chrome=true;
    if(type==='focus-search'||type==='open-sheet'||type==='open-protocol'||
        type==='nudge-timeout'||type==='search-input') surfaces.overlay=true;
    if(type==='toggle-progress') surfaces.completion=true;
    if(type==='toggle-tool-layout') surfaces.layout=true;
    if(type==='set-rotation'||type==='browse-without-rotation') surfaces.base=true;
    var preserve=!!before.openId&&before.openId===state.openId&&!changedBase;
    if(surfaces.completion&&!preserve) surfaces.base=true;
    return {
      kind:changedBase?'base':'transient',changed:changed,surfaces:surfaces,
      baseChanged:changedBase,preserveResource:preserve,effect:effect||null
    };
  }
  function fdApplyEffect(effect, fromHistory, generation){
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
          fromHistory:!!fromHistory,host:freshResourceHost(),
          getState:function(){ return state; },
          isCurrent:function(){
            return !destroyed&&generation===navGeneration&&state.openId===effect.openRef;
          }
        });
      }
    } else if(effect.type==='set-theme'){
      if(doc&&doc.documentElement) doc.documentElement.setAttribute('data-theme',effect.theme);
      try{ localStorage.setItem('cw_theme',effect.theme); }catch(_){}
    } else if(effect.type==='nudge-timeout'&&setTimer){
      if(nudgeTimer&&clearTimer) clearTimer(nudgeTimer);
      nudgeTimer=setTimer(function(){
        if(destroyed) return;
        var before=fdClone(state);
        state.nudge=null;
        renderTransient(state,transitionDetail(
          before,{nudge:null},{type:'nudge-dismiss'},false
        ));
      },effect.delay);
    } else if(effect.type==='open-resource'){
      var opener=o.openResource||fdOpenResource;
      opener(effect.ref,{
        index:index,state:state,search:(win&&win.location&&win.location.search)||'',
        fromHistory:!!fromHistory,host:freshResourceHost(),
        getState:function(){ return state; },
        isCurrent:function(){
          return !destroyed&&generation===navGeneration&&state.openId===effect.ref;
        }
      });
    } else if(effect.type==='open-progress'){
      if(o.openProgress) o.openProgress(state,{fromHistory:!!fromHistory,host:freshResourceHost()});
      else if(typeof navClick==='function') navClick('__progress__');
    }
  }
  function focusPostTransition(before, result, changedBase){
    var effect=result&&result.effect;
    if(effect&&effect.type==='set-theme'){
      var themeControl=root&&root.querySelector?root.querySelector('[data-fd-theme]'):null;
      if(themeControl&&themeControl.focus) try{themeControl.focus();}catch(_){}
      return;
    }
    if(changedBase&&state.screen&&state.screen.indexOf('setup-')===0){
      var heading=root&&root.querySelector?root.querySelector('.fd-setup .fd-h1'):null;
      if(!heading) heading=freshResourceHost();
      if(heading&&heading.setAttribute) heading.setAttribute('tabindex','-1');
      if(heading&&heading.focus) try{heading.focus({preventScroll:true});}catch(_){try{heading.focus();}catch(__){}}
    }
  }
  function apply(result, invoker, fromHistory){
    if(destroyed) return state;
    if(previewActive()&&meaningfulResult(result)){
      lockPreview();
      return state;
    }
    var before=fdClone(state), beforeOverlay=overlayIdentity(state);
    var beforeHistory=historyValue();
    var patch=result.patch||{};
    var beforeHadOverlay=!!beforeOverlay;
    if(!beforeHadOverlay&&invoker) invokers.push(invoker);
    for(var k in patch){ if(fdOwn(patch,k)) state[k]=patch[k]; }
    var afterOverlay=overlayIdentity(state);
    if(!afterOverlay&&!beforeHadOverlay&&invokers.length) invokers.pop();
    var changedBase=baseChanged(before,state);
    var detail=transitionDetail(before,patch,result.effect,changedBase);
    var generation=navGeneration;
    if(changedBase||result.route||result.effect&&(result.effect.type==='open-resource'||
        result.effect.type==='open-progress'||result.effect.openRef)){
      navGeneration++;
      generation=navGeneration;
    }
    fdSave(state);
    if(!fromHistory){
      var pushed=routeTo(result.route,result.history==='replace');
      if(!pushed&&beforeHistory!==historyValue()) replaceHistorySnapshot();
    }
    if(changedBase) render(state,detail);
    else renderTransient(state,detail);
    fdApplyEffect(result.effect,fromHistory,generation);
    focusPostTransition(before,result,changedBase);
    if(afterOverlay&&afterOverlay!==beforeOverlay) focusDialog();
    else if(!afterOverlay&&beforeHadOverlay) restoreInvoker();
    return state;
  }
  function context(extra){
    var c={
      nowMs:Date.now(),theme:currentTheme(),
      search:(win&&win.location&&win.location.search)||'',
      progressRaw:progressRaw(),weekItems:fdItemsForWeek(index,state.week),index:index
    };
    var add=extra||{};
    for(var k in add){ if(fdOwn(add,k)) c[k]=add[k]; }
    return c;
  }
  function clickHandler(event){
    var target=event.target&&event.target.closest?event.target.closest(FD_ACTION_SELECTOR):null;
    if(!target) return;
    if(!startupCommitted){
      if(event.preventDefault) event.preventDefault();
      return;
    }
    var attrs=fdAttrsFromTarget(target);
    if(event.preventDefault) event.preventDefault();
    apply(fdDispatch(attrs,context({inSheet:!!state.sheet}),state),target,false);
  }
  function inputHandler(event){
    if(destroyed) return;
    var target=event.target;
    if(!target||!target.matches||!target.matches('.fd-searchpanel__input')) return;
    if(!startupCommitted){
      if(event.preventDefault) event.preventDefault();
      return;
    }
    var start=target.selectionStart, end=target.selectionEnd;
    var direction=target.selectionDirection;
    var before=fdClone(state);
    state.query=String(target.value||'');
    renderTransient(state,transitionDetail(
      before,{query:state.query},{type:'search-input'},false
    ));
    var fresh=root&&root.querySelector?root.querySelector('.fd-searchpanel__input'):null;
    if(fresh&&fresh.focus){
      try{fresh.focus();}catch(_){}
      if(fresh.setSelectionRange&&typeof start==='number'&&typeof end==='number'){
        try{fresh.setSelectionRange(start,end,direction||'none');}catch(_){}
      }
    }
  }
  function keyHandler(event){
    if(!startupCommitted){
      if(event.preventDefault) event.preventDefault();
      return;
    }
    if(externalModalOpen()) return;
    var d=dialog();
    if(d&&fdTrapFocus(event,d)) return;
    if(event.key==='Escape'&&(state.searchOpen||state.sheet)){
      if(event.preventDefault) event.preventDefault();
      apply(fdDispatch({close:true},context(),state),event.target,false);
      return;
    }
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
  function popstateHandler(event){
    if(destroyed||!win||!win.location) return;
    if(!startupCommitted){
      if(event&&event.preventDefault) event.preventDefault();
      return;
    }
    if(previewActive()){
      if(currentRoute()!==previewRouteBase) lockPreview();
      return;
    }
    var merged=fdClone(state), snap=event&&event.state&&event.state.fd&&event.state.state;
    merged.searchOpen=false;
    merged.query='';
    merged.sheet=null;
    merged.sheetFrom=null;
    merged.stepsDone={};
    if(snap){
      var routeKeys=['tab','viewWeek','openId','fromTab'];
      for(var routeIndex=0;routeIndex<routeKeys.length;routeIndex++){
        delete merged[routeKeys[routeIndex]];
      }
      for(var snapIndex=0;snapIndex<routeKeys.length;snapIndex++){
        var routeKey=routeKeys[snapIndex];
        if(fdOwn(snap,routeKey)) merged[routeKey]=snap[routeKey];
      }
    } else {
      merged.roles=o.roles||merged.roles;
      merged.rotationStart=o.rotationStart||merged.rotationStart;
      merged=fdResolveState(win.location.href,merged);
      var params=new URLSearchParams(win.location.search||'');
      if(!params.get('page')&&!params.get('tool')&&!params.get('tab')){
        merged.tab='today';
        delete merged.openId;
      }
    }
    state=merged;
    var legacyRef=currentRoutedRef();
    var legacyResult=fdIsLegacyRouteAlias(legacyRef)?fdLegacyRouteResult(
      legacyRef,{search:win.location.search||''},state
    ):null;
    if(legacyResult){
      var legacyPatch=legacyResult.patch||{};
      for(var legacyKey in legacyPatch){
        if(fdOwn(legacyPatch,legacyKey)) state[legacyKey]=legacyPatch[legacyKey];
      }
      routeTo(legacyResult.route,true);
    }
    /* Setup is canonical controller state, not history-owned state. If Back reaches an older
       reader snapshot after Change week, retire that entry in place instead of combining a
       page URL/openId with a setup surface. Route extras such as case/scenario still survive. */
    if(state.screen!=='app'&&state.openId){
      var setupTab=fdValidTab(state.fromTab)?state.fromTab:
        (fdValidTab(state.tab)?state.tab:'today');
      state.tab=setupTab;
      state.openId=null;
      routeTo(fdRouteForTab(setupTab,win.location.search||''),true);
    }
    navGeneration++;
    var generation=navGeneration;
    render(state,{
      kind:'base',changed:[],
      surfaces:{base:true,overlay:true,completion:true,chrome:false},
      baseChanged:true,preserveResource:false,effect:null
    });
    fdSave(state);
    if(legacyResult&&legacyResult.effect){
      fdApplyEffect(legacyResult.effect,true,generation);
    } else if(state.openId==='__progress__'){
      fdApplyEffect({type:'open-progress'},true,generation);
    } else if(state.openId){
      var opener=o.openResource||fdOpenResource;
      opener(state.openId,{
        index:index,state:state,search:win.location.search||'',fromHistory:true,
        host:freshResourceHost(),getState:function(){ return state; },
        isCurrent:function(){ return !destroyed&&generation===navGeneration; }
      });
    }
  }

  function removeRegistrations(){
    for(var i=registrations.length-1;i>=0;i--){
      var registration=registrations[i];
      try{
        Function.prototype.call.call(registration.remove,registration.target,
          registration.type,registration.handler,registration.capture);
      }catch(ignoreRemove){ }
    }
    registrations=[];
  }
  function listen(target,type,handler,capture){
    var add,remove;
    try{
      add=target&&target.addEventListener;
      remove=target&&target.removeEventListener;
    }catch(ignoreListenerAccess){ return false; }
    if(typeof add!=='function'||typeof remove!=='function') return false;
    registrations.push({target:target,type:type,handler:handler,capture:capture,remove:remove});
    try{ Function.prototype.call.call(add,target,type,handler,capture); }
    catch(ignoreListener){ return false; }
    return true;
  }
  function prepareStartup(){
    if(destroyed) return false;
    if(startupPrepared) return true;
    try{
      if(!previewActive()&&win&&win.history&&win.history.replaceState){
        var initialLegacyRef=currentRoutedRef();
        var initialLegacy=fdIsLegacyRouteAlias(initialLegacyRef)?fdLegacyRouteResult(
          initialLegacyRef,{search:win.location.search||''},state
        ):null;
        if(initialLegacy){
          if(!routeTo(initialLegacy.route,true)) return false;
          fdSave(state);
        }
        else if(!replaceHistorySnapshot()) return false;
      }
      if(o.releaseStartupGate&&o.releaseStartupGate()!==true) return false;
      startupPrepared=true;
      return true;
    }catch(ignoreInitialCommit){ return false; }
  }
  function commitStartup(acceptStartup){
    if(destroyed) return false;
    if(!startupPrepared){if(typeof acceptStartup==='function'||!prepareStartup())return false;}
    if(startupCommitted) return true;
    if(typeof acceptStartup==='function'&&acceptStartup()!==true)return false;
    startupCommitted=true;
    return true;
  }
  function controller(ok){
    return {
      ok:ok===true,
      getState:function(){ return state; },
      dispatch:function(attrs,c){
        if(destroyed||!startupCommitted) return state;
        return apply(fdDispatch(attrs,context(c),state),null,false);
      },
      prepareStartup:prepareStartup,
      commitStartup:commitStartup,
      startupCommitted:function(){ return startupCommitted; },
      destroy:function(){
        if(destroyed&&registrations.length===0) return;
        destroyed=true;
        navGeneration++;
        removeRegistrations();
        if(nudgeTimer&&clearTimer) try{clearTimer(nudgeTimer);}catch(ignoreTimer){ }
      }
    };
  }

  if(!listen(root,'click',clickHandler,false)||!listen(root,'input',inputHandler,false)||
     !listen(win,'keydown',keyHandler,false)||!listen(win,'popstate',popstateHandler,false)){
      removeRegistrations();
      destroyed=true;
      navGeneration++;
      return controller(false);
  }
  return controller(true);
}
