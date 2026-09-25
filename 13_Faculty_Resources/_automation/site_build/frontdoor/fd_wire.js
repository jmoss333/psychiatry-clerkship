/* Front door route, action, and resource controller. The governed shell installs exactly one
   fdWire instance after the pure renderers. fdResolveState, fdDispatch, and fdResourceRequest are
   pure; browser effects live in fdWire and fdOpenResource behind explicit options so the same
   decisions can be tested without a DOM. */

/* Every attribute the controller gives a meaning to. The exam-date input commits on change and
   is deliberately absent from FD_ACTION_SELECTOR below. */
var FD_HANDLED_ATTRS=[
  'data-fd-open','data-fd-sheet','data-fd-safety','data-fd-toggle','data-fd-tab',
  'data-fd-week','data-fd-view-week','data-fd-setweek','data-fd-role','data-fd-step',
  'data-fd-back','data-fd-home','data-fd-search','data-fd-change-week','data-fd-progress',
  'data-fd-theme','data-fd-settings','data-fd-analytics','data-fd-exam-date',
  'data-fd-app-bridge','data-fd-app-shift','data-fd-app-start','data-fd-app-reflect','data-fd-app-reset',
  'data-fd-app-practice-open','data-fd-app-practice-reveal','data-fd-app-practice-classify',
  'data-fd-app-practice-question','data-fd-app-practice-reset','data-fd-app-practice-close',
  'data-fd-clear-ask','data-fd-clear-cancel','data-fd-clear-confirm',
  'data-fd-close-search','data-fd-close-sheet','data-fd-close-nudge','data-fd-dock-forward',
  'data-fd-try-now','data-fd-expand-tool','data-fd-library-view','data-fd-kit-section','data-fd-kit-tool',
  'data-fd-reading-top','data-fd-care-intent','data-fd-care-clear',
  'data-fd-care-pack','data-fd-care-pack-clear',
  'data-fd-care-pack-print',
  'data-fd-offline-open','data-fd-offline-close','data-fd-offline-refresh'
];

var FD_ACTION_SEMANTICS={
  'data-fd-open':'open routed resource',
  'data-fd-sheet':'modify open into preview sheet',
  'data-fd-safety':'open safety kit or protocol',
  'data-fd-toggle':'toggle governed progress',
  'data-fd-tab':'open top-level tab',
  'data-fd-library-view':'choose Library view',
  'data-fd-kit-section':'filter Essentials sections',
  'data-fd-kit-tool':'preview an Essentials tool',
  'data-fd-care-intent':'choose a transient Care navigator task',
  'data-fd-care-clear':'clear the transient Care navigator task',
  'data-fd-care-pack':'toggle a transient patient resource pack item',
  'data-fd-care-pack-clear':'clear the transient patient resource pack',
  'data-fd-care-pack-print':'print the transient patient resource pack',
  'data-fd-offline-open':'show verified shift readiness details',
  'data-fd-offline-close':'close verified shift readiness details',
  'data-fd-offline-refresh':'check for a newer offline copy',
  'data-fd-week':'select setup week',
  'data-fd-view-week':'preview path week',
  'data-fd-setweek':'adopt previewed week',
  'data-fd-role':'choose learner role',
  'data-fd-step':'toggle session protocol step',
  'data-fd-back':'return to originating tab',
  'data-fd-home':'return to Today',
  'data-fd-search':'open search dialog',
  'data-fd-change-week':'reopen week setup',
  'data-fd-progress':'open Progress and mastery',
  'data-fd-theme':'set saved color theme',
  'data-fd-settings':'open settings panel',
  'data-fd-analytics':'set usage measurement',
  'data-fd-exam-date':'set exam date',
  'data-fd-app-bridge':'choose APP starting route',
  'data-fd-app-shift':'choose APP work task',
  'data-fd-app-start':'open APP preparation resource',
  'data-fd-app-reflect':'choose private APP reflection',
  'data-fd-app-reset':'reset private APP reflection',
  'data-fd-app-practice-open':'open private APP change rehearsal',
  'data-fd-app-practice-reveal':'reveal one APP practice change',
  'data-fd-app-practice-classify':'classify APP practice statement',
  'data-fd-app-practice-question':'choose APP practice supervision question',
  'data-fd-app-practice-reset':'reset APP change rehearsal',
  'data-fd-app-practice-close':'close APP change rehearsal',
  'data-fd-clear-ask':'arm device data erase',
  'data-fd-clear-cancel':'cancel device data erase',
  'data-fd-clear-confirm':'erase device data',
  'data-fd-close-search':'close search dialog',
  'data-fd-close-sheet':'close side sheet',
  'data-fd-close-nudge':'dismiss protocol nudge',
  'data-fd-dock-forward':'forward contextual dock action',
  'data-fd-try-now':'preview related tool',
  'data-fd-expand-tool':'toggle saved tool workspace width',
  'data-fd-reading-top':'clear this reading place and focus the article heading'
};

function fdActionSemantic(attr){
  return FD_ACTION_SEMANTICS[attr]||null;
}

function fdOwn(o,k){ return !!o&&Object.prototype.hasOwnProperty.call(o,k); }

function fdValidTab(tab){ return tab==='path'||tab==='library'||tab==='care'||tab==='today'; }

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
        route:fdRouteForRef('__progress__',c.search,false,{tab:'today',libraryView:s.libraryView==='full'?'essentials':undefined}),history:'replace',
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

function fdResolveState(url, stored, options){
  var src=stored||{}, opts=options||{}, out={};
  if(typeof src.role==='string'&&src.role) out.role=src.role;
  if(src.appBridge==='pa'||src.appBridge==='pmhnp') out.appBridge=src.appBridge;
  out.tab=fdValidTab(src.tab)?src.tab:'today';
  out.libraryView='essentials';
  out.kitSection='all';
  if(typeof src.openId==='string'&&src.openId) out.openId=src.openId;
  if(fdValidTab(src.fromTab)) out.fromTab=src.fromTab;
  if(typeof src.week==='number'&&!isNaN(src.week)) out.week=src.week;
  if(typeof src.viewWeek==='number'&&!isNaN(src.viewWeek)) out.viewWeek=src.viewWeek;
  else if(typeof out.week==='number'&&!isNaN(out.week)) out.viewWeek=out.week;
  else out.viewWeek=1;
  out.autoAdvance=src.autoAdvance!==false;
  if(src.toolExpanded!==undefined) out.toolExpanded=src.toolExpanded===true;
  if(src.browsing===true) out.browsing=true;
  /* The offset recorded when a resource opened (#427). Without this a reload while reading
     persisted the offset and then dropped it here, so the one return that most needs it -- an
     interrupted read -- scrolled to the top. */
  if(typeof src.scrollPos==='number'&&isFinite(src.scrollPos)&&src.scrollPos>=0) out.scrollPos=src.scrollPos;
  if(src.readingPlaces!==undefined) out.readingPlaces=fdReadingPlaces(src.readingPlaces);

  var parsed, routedRef=null;
  try{ parsed=new URL(String(url||''),'https://frontdoor.invalid/'); }catch(_){ parsed=null; }
  if(parsed){
    var audienceValues=parsed.searchParams.getAll('audience');
    if(opts.allowAppInvite===true&&audienceValues.length===1&&audienceValues[0]==='app'){
      out.appInvite=true;
    }
    var routedTab=parsed.searchParams.get('tab');
    routedRef=parsed.searchParams.get('page')||parsed.searchParams.get('tool');
    if(parsed.searchParams.get('library')==='full'&&(!fdValidTab(routedTab)||routedTab==='library')){
      out.tab='library';
      out.libraryView='full';
      delete out.openId;
    }
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
  /* Guest deep link (2026-09-16): a routed page or tool with no stored role renders the resource
     without asking who the reader is, and assigns NO role -- so the next plain visit still runs
     the wizard from step 1. The flag is per-boot state, never persisted (see FD_KEYS). Only a
     real page or tool admits a guest: the legacy aliases and every other __name__ pseudo-route
     (__progress__ is the device's own dashboard) keep the setup gate below. */
  if(out.appInvite===true) out.screen='app';
  else if(!out.role&&routedRef&&!fdIsLegacyRouteAlias(routedRef)&&routedRef.indexOf('__')!==0){ out.guest=true; out.screen='app'; }
  else if(!out.role) out.screen='setup-role';
  else if(fdAppMode(out)||src.rotationStart||typeof out.week==='number'||src.browsing||out.tab==='library'||out.tab==='care') out.screen='app';
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
  if(fdAppMode(out)&&out.tab==='path') out.tab='today';
  return out;
}

function fdParamsWithoutRoute(search){
  var params;
  try{ params=new URLSearchParams(String(search||'').replace(/^\?/,'')); }
  catch(_){ return new URLSearchParams(); }
  params.delete('page');
  params.delete('tool');
  params.delete('tab');
  params.delete('library');
  /* Passage context belongs to the current reading, never the next activity iframe. */
  params.delete('guideFind');
  params.delete('guideSection');
  return params;
}

function fdExtraSearch(search){
  var params=fdParamsWithoutRoute(search);
  var q=params.toString();
  return q?'&'+q:'';
}

function fdSearchOutsideBlock(search){
  var params=new URLSearchParams(String(search||'').replace(/^\?/,''));
  if(params.has('block')){
    params.delete('block'); params.delete('n'); params.delete('limit'); params.delete('cat');
  }
  return params.toString();
}

function fdRouteForTab(tab, search, libraryView){
  var params=fdParamsWithoutRoute(fdSearchOutsideBlock(search));
  if(tab==='library'&&libraryView==='full') params.set('library','full');
  var extra=params.toString();
  if(tab==='today') return extra?('/?'+extra):'/';
  return '?tab='+encodeURIComponent(tab)+(extra?'&'+extra:'');
}

function fdRouteForRef(ref, search, blockNavigation, origin){
  var key=/\.html$/.test(String(ref||''))?'tool':'page';
  var params=fdParamsWithoutRoute(blockNavigation===true?search:fdSearchOutsideBlock(search));
  var previous=new URLSearchParams(String(search||'').replace(/^\?/,''));
  var tab=origin&&fdValidTab(origin.tab)?origin.tab:previous.get('tab');
  var view=origin?origin.libraryView:previous.get('library');
  if(tab==='library'&&view==='full'){
    params.set('tab','library'); params.set('library','full');
  } else if(fdValidTab(tab)&&((origin&&origin.libraryView&&(tab!=='today'||previous.get('library')==='full'))||fdValidTab(previous.get('tab')))){ params.set('tab',tab); }
  var extra=params.toString();
  return '?'+key+'='+encodeURIComponent(ref)+(extra?'&'+extra:'');
}

function fdNumberAttr(attrs,name){
  if(!fdOwn(attrs,name)) return null;
  var n=Number(attrs[name]);
  return isFinite(n)&&n%1===0?n:null;
}

function fdDispatchHasWeek(context, n){
  return !!fdFindWeek(context&&context.index,n);
}

/* Which sheet values name a safety protocol page -- the only ones the unread nudge applies to.
   'settings' is a shell surface, not curriculum: it has no ref in the index and no read state, so
   closing it must not queue a nudge for it the way closing an unread protocol does. */
function fdProtocolRef(sheet){
  if(!sheet||sheet==='kit'||sheet==='settings'||String(sheet).indexOf('item:')===0) return null;
  return String(sheet);
}

/* settingsConfirmClear is reset here as well as at the panel's opening, and the two are not
   redundant. This one is the near guarantee: it covers the ✕, the backdrop and Escape, which are
   the routes a learner uses to back out of a confirm they did not mean to arm, and it clears the
   flag at the moment they back out rather than at some later visit. The opening reset is the
   complete one, because the panel can also be left by controls that patch sheet:null without
   coming through here. */
function fdCloseSheet(state){
  var ref=fdProtocolRef(state&&state.sheet);
  var unread=!!ref&&!((state.done||{})[ref]===true);
  return {
    patch:{sheet:null,sheetFrom:null,stepsDone:{},nudge:unread?ref:null,settingsConfirmClear:false},
    route:null,
    effect:unread?{type:'nudge-timeout',delay:8000}:null
  };
}

function fdDispatch(attrs, context, state){
  var a=attrs||{}, c=context||{}, s=state||{}, ref, n, patch, done, raw, next, tab, picked;

  if(fdOwn(a,'close')){
    if(s.searchOpen) return {patch:{searchOpen:false,query:''},route:null,effect:null};
    if(s.sheet) return fdCloseSheet(s);
    if(s.nudge) return {patch:{nudge:null},route:null,effect:null};
    return {patch:{},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-close-search')){
    return {patch:{searchOpen:false,query:''},route:null,effect:null};
  }
  /* The settings panel closes through here too -- it has no close action of its own. When that
     panel grows a destructive confirmation, its armed flag has to be reset in fdCloseSheet, or an
     armed "erase everything" survives the close and the panel reopens still armed. */
  if(fdOwn(a,'data-fd-close-sheet')) return fdCloseSheet(s);
  if(fdOwn(a,'data-fd-close-nudge')){
    return {patch:{nudge:null},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-offline-open')){
    return s.screen==='app'&&s.tab==='today'&&!s.openId
      ?{patch:{offlineOpen:true},route:null,effect:null}:{patch:{},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-offline-close')){
    return {patch:{offlineOpen:false},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-offline-refresh')){
    return s.screen==='app'&&s.tab==='today'&&!s.openId&&s.offlineOpen===true
      ?{patch:{},route:null,effect:{type:'refresh-offline'}}:{patch:{},route:null,effect:null};
  }

  if(fdOwn(a,'data-fd-app-bridge')){
    picked=String(a['data-fd-app-bridge']||'');
    if(picked!=='pa'&&picked!=='pmhnp') return {patch:{},route:null,effect:null};
    return {patch:{appBridge:picked,appActivity:null,appReflection:null,appPractice:null},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-app-shift')){
    picked=String(a['data-fd-app-shift']||'');
    if(picked!=='initial-evaluation'&&picked!=='medication-follow-through'&&picked!=='collateral-transition'){
      return {patch:{},route:null,effect:null};
    }
    return {patch:{appActivity:picked,appReflection:null},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-app-reflect')){
    picked=String(a['data-fd-app-reflect']||'');
    if(picked!=='revisit'&&picked!=='supervisor'&&picked!=='another'){
      return {patch:{},route:null,effect:null};
    }
    return {patch:{appReflection:picked},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-app-reset')){
    return {patch:{appActivity:null,appReflection:null,appPractice:null},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-app-practice-open')){
    picked=String(a['data-fd-app-practice-open']||'');
    var pack=fdAppPracticeFind(c.appPracticePacks,picked);
    if(!pack) return {patch:{},route:null,effect:null};
    try{return {patch:{appPractice:fdAppPracticeStart(pack)},route:null,effect:null};}
    catch(ignorePracticeOpen){return {patch:{},route:null,effect:null};}
  }
  if(fdOwn(a,'data-fd-app-practice-reveal')){
    try{return {patch:{appPractice:fdAppPracticeReveal(s.appPractice)},route:null,effect:null};}
    catch(ignorePracticeReveal){return {patch:{},route:null,effect:null};}
  }
  if(fdOwn(a,'data-fd-app-practice-classify')){
    picked=String(a['data-fd-app-practice-classify']||'');
    var split=picked.indexOf(':');
    if(split<1) return {patch:{},route:null,effect:null};
    try{return {patch:{appPractice:fdAppPracticeClassify(
      s.appPractice,picked.slice(0,split),picked.slice(split+1))},route:null,effect:null};}
    catch(ignorePracticeClassify){return {patch:{},route:null,effect:null};}
  }
  if(fdOwn(a,'data-fd-app-practice-question')){
    try{return {patch:{appPractice:fdAppPracticeChooseQuestion(
      s.appPractice,String(a['data-fd-app-practice-question']||''))},route:null,effect:null};}
    catch(ignorePracticeQuestion){return {patch:{},route:null,effect:null};}
  }
  if(fdOwn(a,'data-fd-app-practice-reset')){
    try{return {patch:{appPractice:fdAppPracticeReset(s.appPractice)},route:null,effect:null};}
    catch(ignorePracticeReset){return {patch:{},route:null,effect:null};}
  }
  if(fdOwn(a,'data-fd-app-practice-close')){
    return {patch:{appPractice:null},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-app-start')){
    return fdDispatch({'data-fd-open':String(a['data-fd-app-start']||'')},c,s);
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
      /* "Not on rotation -- just browse" is a choice, not an absence (#425). week:null alone was
         undone on the very next render: fdLiveState re-derives the week from cw_rotation_start,
         so a returning learner who chose browse kept seeing the week they had left. The effect
         removes that key and browsing:true is persisted (FD_KEYS) so a reload on any tab still
         resolves to the app rather than asking for a week again. */
      var firstWeek=(c.index&&c.index.weeks&&c.index.weeks[0])||{};
      patch={week:null,tab:'library',libraryView:'essentials',kitSection:'all',viewWeek:firstWeek.n,screen:'app',openId:null,browsing:true};
      if(s.setupFrom) patch.setupFrom=null;
      return {
        patch:patch,
        route:fdRouteForTab('library',c.search),effect:{type:'browse-without-rotation'}
      };
    }
    if(n===null||!fdDispatchHasWeek(c,n)) return {patch:{},route:null,effect:null};
    /* Leaving browse mode and the Change-week origin are patched only when set, so the
       transition detail of an ordinary week choice stays exactly what it was. */
    patch={week:n,viewWeek:n,tab:'today',screen:'app',openId:null};
    if(s.browsing===true) patch.browsing=false;
    if(s.setupFrom) patch.setupFrom=null;
    return {
      patch:patch,
      route:fdRouteForTab('today',c.search),
      effect:{type:'set-rotation',start:fdRotationStartForWeek(n,c.index.weeks,c.nowMs)}
    };
  }
  if(fdOwn(a,'data-fd-setweek')){
    n=fdNumberAttr(a,'data-fd-setweek');
    if(n===null||!fdDispatchHasWeek(c,n)) return {patch:{},route:null,effect:null};
    patch={week:n,viewWeek:n,screen:'app'};
    if(s.browsing===true) patch.browsing=false;
    return {
      patch:patch,route:null,
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
    var resourceRoute=fdRouteForRef(ref,c.search,c.blockNavigation,s);
    if(s.searchOpen&&s.query&&!fdIsTool(ref)){
      resourceRoute+='&guideFind='+encodeURIComponent(String(s.query).trim().slice(0,160));
    }
    return {
      patch:{openId:ref,fromTab:tab,searchOpen:false,sheet:null},
      route:resourceRoute,effect:{type:'open-resource',ref:ref}
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
    var progressWeek=fdProgressWeek(s,c.index);
    var progressRaw=c.progressRaw||s.progressRaw||{};
    done=c.index?fdProgressDoneMap(progressRaw,c.index,progressWeek):fdClone(s.done);
    var blockHandoff=s.openId===ref&&!c.inSheet&&typeof fdBlockPageHandoff==='function'
      ?fdBlockPageHandoff(c.block,ref,done):null;
    var mark=!!blockHandoff||done[ref]!==true;
    if(mark) done[ref]=true;
    else delete done[ref];
    raw=fdProgressToggle(progressRaw,ref,mark,c.nowMs,c.index,progressWeek);
    if(c.index) done=fdProgressDoneMap(raw,c.index,progressWeek);
    patch={done:done,justDone:mark?ref:null};
    if(c.index) patch.progressRaw=raw;
    var effect={type:'toggle-progress',ref:ref,done:mark,raw:raw};
    if(blockHandoff){
      next=blockHandoff.next;
      if(next){
        patch.openId=next.ref;
        patch.navDir=1;
        effect.openRef=next.ref;
        return {patch:patch,route:fdBlockRouteForStep(next),effect:effect};
      }
      patch.openId=null;
      patch.tab='today';
      return {patch:patch,route:fdRouteForTab('today',fdSearchOutsideBlock(c.search)),effect:effect};
    }
    if(mark&&s.openId===ref&&s.autoAdvance!==false){
      next=fdReaderNextUnread(c.weekItems||[],ref,done);
      if(next){
        patch.openId=next.ref;
        patch.navDir=1;
        effect.openRef=next.ref;
        return {patch:patch,route:fdRouteForRef(next.ref,c.search,false,s),effect:effect};
      }
      tab=fdValidTab(s.fromTab)?s.fromTab:'today';
      patch.openId=null;
      patch.tab=tab;
      return {patch:patch,route:fdRouteForTab(tab,c.search,s.libraryView),effect:effect};
    }
    return {patch:patch,route:null,effect:effect};
  }

  if(fdOwn(a,'data-fd-kit-section')){
    return {patch:{kitSection:String(a['data-fd-kit-section']||'all')},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-kit-tool')){
    return {patch:{kitToolPreview:String(a['data-fd-kit-tool']||'')},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-care-intent')){
    var careIntent=typeof a['data-fd-care-intent']==='string'
      ?a['data-fd-care-intent']:'';
    var careChoice=typeof fdCareNavigatorSelection==='function'
      ?fdCareNavigatorSelection(c.index||{},careIntent):null;
    return {patch:{careIntentId:careChoice?careChoice.id:''},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-care-clear')){
    return {patch:{careIntentId:''},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-care-pack')){
    return {patch:{carePackIds:fdCarePackToggle(
      c.index||{},s.carePackIds||[],a['data-fd-care-pack'])},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-care-pack-clear')){
    return {patch:{carePackIds:[]},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-care-pack-print')){
    var printablePackIds=fdCarePackIds(c.index||{},s.carePackIds||[]);
    return {patch:{},route:null,effect:s.tab==='care'&&!s.openId&&printablePackIds.length
      ?{type:'print-care-pack'}:null};
  }
  if(fdOwn(a,'data-fd-library-view')){
    var view=String(a['data-fd-library-view']||'');
    if(view!=='essentials'&&view!=='full') return {patch:{},route:null,effect:null};
    return {
      patch:{tab:'library',libraryView:view,kitSection:'all',openId:null,searchOpen:false,sheet:null,nudge:null},
      route:fdRouteForTab('library',c.search,view),effect:null
    };
  }
  if(fdOwn(a,'data-fd-tab')){
    tab=String(a['data-fd-tab']||'');
    if(!fdValidTab(tab)) return {patch:{},route:null,effect:null};
    patch={tab:tab,openId:null,searchOpen:false};
    if(tab!=='care'){ patch.careIntentId=''; patch.carePackIds=[]; }
    if(tab==='library'){ patch.libraryView='essentials'; patch.kitSection='all'; }
    return {patch:patch,route:fdRouteForTab(tab,c.search),effect:null};
  }
  if(fdOwn(a,'data-fd-role')){
    /* Two emitters, two meanings. In the wizard this is step 1 of 2 and must advance; in the
       settings panel the learner is changing a setting, and advancing would throw them out of the
       panel and back into a first-run flow that asks again for a week they already chose. Only
       the wizard reaches here with screen==='setup-role', so that is the fork -- and leaving the
       rest of the state alone is what keeps the panel open on the chip it just filled. */
    picked=String(a['data-fd-role']||'');
    if(picked==='app'){
      return {
        patch:{role:'app',screen:'app',tab:'today',week:null,browsing:true,openId:null,searchOpen:false},
        route:fdRouteForTab('today',c.search),effect:{type:'browse-without-rotation'}
      };
    }
    if(s.screen==='setup-role'){
      return {patch:{role:picked,screen:'setup-week'},route:null,effect:null};
    }
    return {patch:{role:picked},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-step')){
    n=fdNumberAttr(a,'data-fd-step');
    patch=fdClone(s.stepsDone);
    if(n!==null) patch[n]=!patch[n];
    return {patch:{stepsDone:patch},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-back')){
    if(s.screen==='setup-week'){
      /* Two learners reach this screen. First run: the role was chosen a moment ago, so Back
         un-chooses it. A returning learner arrived through Change week (setupFrom:'app') and
         already has a role and a rotation or a browse choice; for them Back is "never mind",
         and clearing the role while the rotation stayed stored left a half-state that asked
         "Who's this for?" over a live rotation (#425). */
      if(s.setupFrom==='app'){
        return {patch:{screen:'app',setupFrom:null},route:null,effect:null};
      }
      return {patch:{role:null,screen:'setup-role'},route:null,effect:null};
    }
    tab=fdValidTab(s.fromTab)?s.fromTab:(fdValidTab(s.tab)?s.tab:'today');
    return {patch:{openId:null,tab:tab,kitSection:'all'},route:fdRouteForTab(tab,c.search,s.libraryView),effect:null};
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
      patch:{screen:'setup-week',tab:tab,openId:null,searchOpen:false,sheet:null,setupFrom:'app'},
      route:fdRouteForTab(tab,c.search,s.libraryView),history:'replace',effect:null
    };
  }
  if(fdOwn(a,'data-fd-progress')){
    tab=fdValidTab(s.tab)?s.tab:'today';
    return {
      patch:{openId:'__progress__',fromTab:tab,searchOpen:false,sheet:null},
      route:fdRouteForRef('__progress__',c.search,false,s),effect:{type:'open-progress'}
    };
  }
  if(fdOwn(a,'data-fd-settings')){
    /* Settings is a sheet so it inherits backdrop, dialog semantics, the close button and the
       Escape unwind from fdKeyAction. sheetFrom is not set: settings has no "back to kit" path.

       settingsConfirmClear:false is the COMPLETE half of the disarm guarantee, and it is here
       rather than spread across the exits for a reason. fdCloseSheet covers the ✕, the backdrop
       and Escape; it does not cover data-fd-progress -- the Your-data section's own export link,
       which sits directly above the armed confirm and patches sheet:null on its own -- nor
       data-fd-home, nor data-fd-change-week, nor a reload. Enumerating those is the shape of
       check that reports success over a smaller set than it claims, and the list would have to be
       re-derived every time a control learns to close the panel. This branch is the only producer
       of sheet:'settings' in the file, and fdResolveState cannot restore the key (FD_KEYS does
       not persist a sheet key), so resetting the flag on the way IN covers every way out that
       exists or ever will. */
    return {patch:{sheet:'settings',searchOpen:false,settingsConfirmClear:false},
      route:null,effect:null};
  }
  /* The two-tap erase. The arming tap changes one boolean and nothing else -- no route, no
     effect, no storage -- so the state that decides whether a destructive control is on screen is
     the same kind of thing as the state that decides which theme segment is filled, and it is
     testable without a DOM. The confirming tap disarms itself in the same patch it fires on, so a
     re-render after the erase (or a reload that outruns it) can never find the panel primed. */
  if(fdOwn(a,'data-fd-clear-ask')){
    return {patch:{settingsConfirmClear:true},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-clear-cancel')){
    return {patch:{settingsConfirmClear:false},route:null,effect:null};
  }
  if(fdOwn(a,'data-fd-clear-confirm')){
    return {patch:{settingsConfirmClear:false},route:null,effect:{type:'clear-device-data'}};
  }
  if(fdOwn(a,'data-fd-theme')){
    /* The value is the MODE, not the painted attribute -- fdApplyEffect resolves it. A missing or
       unknown value reads as 'system' rather than toggling, because this control is a three-way
       segmented control now: there is no "other one" to flip to. */
    return {patch:{},route:null,
      effect:{type:'set-theme',mode:fdThemeMode(String(a['data-fd-theme']||''))}};
  }
  if(fdOwn(a,'data-fd-analytics')){
    /* The value is the posture the segment STANDS FOR, not a flip of the current one: the Usage
       control is a pair of segments (see fdSettingsUsage), so each carries a fixed value and
       pressing the already-active one re-states it rather than reversing it. Patches nothing --
       the emitter's own key is the single home and fdLiveState re-reads it for every render. */
    return {patch:{},route:null,
      effect:{type:'set-analytics',on:String(a['data-fd-analytics']||'')==='on'}};
  }
  if(fdOwn(a,'data-fd-exam-date')){
    /* Patches nothing, for the same reason set-theme patches nothing: the stored key is the one
       home, and fdLiveState re-reads it for every render. A mirrored copy on controller state
       would be a second home that only LOOKS free, because nothing renders from it.

       Only an ISO calendar date or the empty string reaches storage. The key is read by
       phase_policy.js -- the repo's single sanctioned local-midnight parse site -- and anything
       else there makes the date NaN, which silently disables pacing rather than failing visibly.
       An <input type="date"> already hands back either shape; a learner with an older browser
       that degrades it to a text box does not. */
    var examRaw=String(a['data-fd-exam-date']||'');
    var examDate=/^\d{4}-\d{2}-\d{2}$/.test(examRaw)?examRaw:'';
    return {patch:{},route:null,effect:{type:'set-exam-date',date:examDate}};
  }
  return {patch:{},route:null,effect:null};
}

/* Erase everything this device holds for the front door, and nothing else.

   COLLECTS FIRST, DELETES SECOND. removeItem() reindexes the store, so key(i) after a delete
   returns what key(i+1) would have: deleting inside a forward walk skips every other match. On a
   small fixture that still looks like it worked, which is why tests/fd-wire.test.mjs runs it over
   twelve keys as well as over four.

   THE PREFIX SCAN IS THE POINT, and it is not a style preference. A list of the keys reachable as
   literals today would miss every key any feature adds next month while the panel still reported
   "cleared" -- a privacy defect that reports success, which is the class
   docs/SILENT_SHRINK_CHECKLIST.md exists to catalogue. The test that makes the difference real
   seeds a cw_* key that appears in no source file. localStorage.clear() is rejected for the
   opposite reason: it reaches past the two namespaces the storage-namespaces decision governs and
   would take a co-hosted page's keys with it.

   The store arrives as an argument so the sweep can be driven over a fake that reindexes exactly
   as a real one does. One consequence is worth recording rather than discovering: the removal
   below is written against the PARAMETER, so check-static-site.mjs's 5c scan -- which greps the
   global's own name followed by a dot -- does not see this call at all, and it costs no soft
   finding. (Nor would it cost a baseline entry if it did: that scan raises ONE finding per file
   however many computed keys it finds, and the shell already raises it.) What replaces the scan
   here is the source-level assertion in tests/fd-wire.test.mjs that this function names no key of
   its own -- stricter than the grep it forgoes, because the grep counts indirection while the
   test forbids the thing indirection could hide.
   That comment is also why this paragraph spells no scannable call: the scan reads shipped bytes,
   comments included, so prose naming the pattern would report an indirection that is not there.

   Every failure mode is swallowed on purpose. Storage can throw on the read (a browser with site
   data blocked) or part-way through the writes (a private window raising on quota); an exception
   escaping into apply() would skip the reload that follows and leave the panel sitting over a
   half-erased device, reporting nothing. */
function fdClearDeviceData(store){
  var doomed=[], i, k;
  try{
    for(i=0;i<store.length;i++){
      k=store.key(i);
      if(typeof k==='string'&&(k.indexOf('cw_')===0||k.indexOf('rp_')===0)) doomed.push(k);
    }
    for(i=0;i<doomed.length;i++) store.removeItem(doomed[i]);
  }catch(_){ }
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

/* Embedded-tool frame contract (2026-09-19). A tool page is one <iframe class="toolframe">.
   Until now that frame was a viewport-height box inside a page that also scrolled: two nested
   scroll surfaces, worst on a phone, where the inner scrollbar was the tool's only way down.
   The default is now CONTENT: the shell sizes the frame to the tool document and the page is
   the only thing that scrolls. A tool that lays itself out against its OWN viewport -- a fixed
   bottom bar, a sticky panel, a transcript with its own scroll -- declares
   <meta name="cw-frame" content="viewport"> in its <head> and keeps the viewport-height frame.
   Both helpers are pure over a document so tests/tool-frame.test.mjs drives them with plain
   objects; the DOM half (load listener, ResizeObserver) is fdSizeToolFrame in spa_index.html.
   An unknown or missing declaration is the default, never an error: a tool cannot break its own
   frame by misspelling the opt-out, it can only fail to opt out. */
function fdToolFrameMode(doc){
  var meta=null;
  try{ meta=(doc&&typeof doc.querySelector==='function')?doc.querySelector('meta[name="cw-frame"]'):null; }
  catch(_){ meta=null; }
  var value=(meta&&typeof meta.getAttribute==='function')?String(meta.getAttribute('content')||''):'';
  return value.trim().toLowerCase()==='viewport'?'viewport':'content';
}

/* The html element's OWN box (offsetHeight), not documentElement.scrollHeight: scrollHeight is
   max(viewport, content), so read from a frame that is already tall it can never allow the
   frame to shrink -- the classic auto-height iframe trap. With height:auto (every shipped tool; surveyed
   2026-09-19 for html/body height and overflow) the html box IS the content, whatever the frame
   currently measures. The body is the fallback for a document whose html reports nothing. */
function fdToolFrameHeight(doc){
  if(!doc) return 0;
  var el=doc.documentElement, body=doc.body, h=0;
  if(el&&typeof el.offsetHeight==='number') h=el.offsetHeight;
  if(!(h>0)&&body&&typeof body.scrollHeight==='number') h=body.scrollHeight;
  return h>0?Math.ceil(h):0;
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
  var item=(index.byRef||{})[ref]||(typeof fdKnownItem==='function'?fdKnownItem(index,ref,request.kind):{
    ref:ref,kind:request.kind,title:ref,minutes:null,summary:'',points:[],attested:false
  });
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

  /* Genuine navigation lands at the top of the new resource; back/forward keeps whatever
     position the browser restores. Injectable so the contract is testable without a DOM --
     same pattern as host/governanceNotice/renderReader above. */
  var scrollReset=o.scrollReset||function(){
    if(typeof window!=='undefined'&&window.scrollTo) window.scrollTo(0,0);
  };
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
    if(!o.fromHistory) scrollReset();
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

  /* A ref the site does not know never reaches the network. fdReader already renders the
     not-found surface for it, but for a .md ref that render was immediately overwritten: the
     fetch of content/<ref> 404s, fail() replaces the surface with "Page unavailable",
     fdOpenInitialResource reports not-ok and startup THROWS -- which is why a dead ?page= link
     bounced to Today with no explanation, while a dead ?tool= link (an iframe, mounted
     synchronously) showed the surface correctly. Same input, two different broken states: the
     exact defect Fresh Eyes Audit A4 asked to collapse into one surface.

     mount('') lets fdReader own the whole render, and returning TRUE is the point: showing
     "we couldn't find that page" is the correct outcome for this input, not a failure to be
     recovered from. Guarded on index.known so a caller without a built index keeps the old
     fetch-and-fail path rather than declaring every page missing. */
  if(index&&index.known&&!index.known[ref]){
    return Promise.resolve(mount(''));
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

/* The delegated click path's selector. It is NOT the whole of FD_HANDLED_ATTRS and must not be
   "completed" to match it: 'data-fd-exam-date' is missing on purpose. Add it and a click on the
   settings panel's date field starts running clickHandler, which preventDefaults the gesture that
   opens the native picker and -- the attribute being valueless in the markup -- dispatches an
   empty value, so a learner clicking their own date input ERASES the date they had. It is
   committed on a change event instead; see changeHandler. */
var FD_ACTION_SELECTOR='[data-fd-open],[data-fd-safety],[data-fd-toggle],[data-fd-tab],[data-fd-library-view],[data-fd-kit-section],[data-fd-kit-tool],'+
  '[data-fd-care-intent],[data-fd-care-clear],[data-fd-care-pack],[data-fd-care-pack-clear],[data-fd-care-pack-print],'+
  '[data-fd-offline-open],[data-fd-offline-close],[data-fd-offline-refresh],'+
  '[data-fd-app-bridge],[data-fd-app-shift],[data-fd-app-start],[data-fd-app-reflect],[data-fd-app-reset],'+
  '[data-fd-app-practice-open],[data-fd-app-practice-reveal],[data-fd-app-practice-classify],'+
  '[data-fd-app-practice-question],[data-fd-app-practice-reset],[data-fd-app-practice-close],'+
  '[data-fd-week],[data-fd-view-week],[data-fd-setweek],[data-fd-role],[data-fd-step],'+
  '[data-fd-back],[data-fd-home],[data-fd-search],[data-fd-change-week],[data-fd-progress],'+
  '[data-fd-theme],[data-fd-settings],[data-fd-analytics],'+
  '[data-fd-clear-ask],[data-fd-clear-cancel],[data-fd-clear-confirm],'+
  '[data-fd-close-search],[data-fd-close-sheet],[data-fd-close-nudge],'+
  '[data-fd-try-now],[data-fd-expand-tool],[data-fd-dock-forward],[data-fd-reading-top]';

function fdDockSource(root){
  var el=root&&root.querySelector?root.querySelector('[data-fd-dock-source]'):null;
  if(!el||el.isConnected===false) return null;
  var id=el.getAttribute('data-fd-dock-source');
  var label=el.getAttribute('data-fd-dock-label');
  return id&&label?{id:id,label:label}:null;
}

function fdForwardDockAction(root,id){
  if(!id) return false;
  var nodes=root&&root.querySelectorAll?root.querySelectorAll('[data-fd-dock-source]'):[], i, el;
  for(i=0;i<nodes.length;i++){
    el=nodes[i];
    if(el.getAttribute('data-fd-dock-source')===id&&
       el.isConnected!==false&&typeof el.click==='function'){
      el.click();
      return true;
    }
  }
  return false;
}

function fdAttrsFromTarget(target){
  var out={};
  for(var i=0;i<FD_HANDLED_ATTRS.length;i++){
    var name=FD_HANDLED_ATTRS[i];
    if(target&&target.hasAttribute&&target.hasAttribute(name)) out[name]=target.getAttribute(name)||'';
  }
  return out;
}

/* Focus belongs to the live foreground surface, not to a stale Continue intent. */
function fdReadingFocusAllowed(state,context){
  var s=state||{}, c=context||{};
  return s.screen==='app'&&!s.searchOpen&&!s.sheet&&!c.facultyPreview&&!c.externalModal&&
    !c.pendingHigh&&c.readerConnected===true&&!!c.ref&&c.currentRef===c.ref;
}

var FD_READING_ANCHORS='.fd-article > .fd-article__h1,.fd-guide-header > .fd-article__h1,'+
  '.fd-article__body h2,.fd-article__body h3,.fd-article__body h4,'+
  '.fd-article__body .fd-guide-lead > strong:first-child,.fd-article__body .fd-guide-lead > b:first-child';

/* The rendered reader owns this lease; its listeners are removed before the next resource.
   restore:false keeps saving but leaves arrival to its owner: a guide passage link or a return
   from practice decides where the page opens, and a saved place must not scroll over it. */
function fdInstallReadingPlace(reader,ref,state,options){
  var o=options||{}, win=o.window||(typeof window!=='undefined'?window:null);
  var status=reader&&reader.querySelector?reader.querySelector('[data-fd-reading-status]'):null;
  var top=reader&&reader.querySelector?reader.querySelector('[data-fd-reading-top]'):null;
  /* A lead-promoted guide (fd_guide.js) moves the H1 into its header and anchors each section on
     the bold label, never the whole paragraph, so an edit to the prose keeps a saved place. */
  var nodes=reader&&reader.querySelectorAll?Array.prototype.slice.call(reader.querySelectorAll(FD_READING_ANCHORS)):[];
  var save=o.save||fdSave, now=o.now||Date.now;
  var timerSet=o.setTimer||setTimeout, timerClear=o.clearTimer||clearTimeout;
  var frame=o.requestAnimationFrame||(win&&win.requestAnimationFrame?function(fn){win.requestAnimationFrame(fn);}:function(fn){timerSet(fn,0);});
  var active=true, timer=null, ready=false, suppressedY=null, resizeSeq=0, baselineY=0, pendingPosition=null, anchors, authored={}, i;
  function empty(){ }
  if(!status||!top||!nodes.length||!win||!fdReadingRef(ref))return {destroy:empty,startAtTop:empty};
  anchors=fdReadingHeadingIds(nodes.map(function(node){return node.textContent||'';}));
  for(i=0;i<nodes.length;i++)if(nodes[i].id)authored[nodes[i].id]=true;
  for(i=0;i<nodes.length;i++){
    nodes[i].setAttribute('data-fd-reading-anchor',anchors[i]);
    /* Keep component ids (and aria-labelledby / fragment links) intact. A heading without one
       may retain the generated DOM id unless it would collide with authored content. */
    if(!nodes[i].id&&!authored[anchors[i]]&&
       (!nodes[i].ownerDocument||!nodes[i].ownerDocument.getElementById(anchors[i])))nodes[i].id=anchors[i];
  }
  function anchor(node){return node.getAttribute('data-fd-reading-anchor');}
  function availableAnchors(){return nodes.map(anchor);}
  function scrollY(){return typeof win.scrollY==='number'&&isFinite(win.scrollY)?Math.max(0,win.scrollY):0;}
  function absoluteTop(node){return node.getBoundingClientRect().top+scrollY();}
  function current(){
    var y=scrollY(), chosen=nodes[0], pos=absoluteTop(chosen), j, next;
    for(j=1;j<nodes.length;j++){
      next=absoluteTop(nodes[j]);
      if(next<=y&&next>=pos){chosen=nodes[j];pos=next;}
    }
    return {heading:anchor(chosen),offset:Math.max(0,y-pos)};
  }
  function write(places){
    state.readingPlaces=places;
    var ok=false;
    try{ok=save(state)===true;}catch(_){ok=false;}
    status.textContent=ok?'Reading place saved on this device only':
      'Reading place could not be saved on this device';
  }
  function capture(){
    if(!active||!ready||suppressedY!==null)return;
    if(Math.abs(scrollY()-baselineY)<=4){pendingPosition=null;return;}
    var position=pendingPosition||current();
    pendingPosition=null;
    write(fdReadingPlaceUpdate(state.readingPlaces,ref,position.heading,position.offset,now()));
    baselineY=scrollY();
  }
  function onScroll(){
    if(!active||!ready)return;
    if(suppressedY!==null){
      if(Math.abs(scrollY()-suppressedY)<=4)return;
      suppressedY=null;
    }
    if(Math.abs(scrollY()-baselineY)<=4){
      if(timer!==null){timerClear(timer);timer=null;}
      pendingPosition=null;
      return;
    }
    pendingPosition=current();
    if(timer!==null)timerClear(timer);
    timer=timerSet(function(){timer=null;capture();},150);
  }
  function onPagehide(){
    if(timer!==null){timerClear(timer);timer=null;}
    capture();
  }
  function onResize(){
    if(!active||!ready)return;
    if(timer!==null){timerClear(timer);timer=null;capture();}
    ready=false;
    var sequence=++resizeSeq;
    frame(function(){
      if(!active||sequence!==resizeSeq)return;
      var place=state.readingPlaces&&state.readingPlaces[ref];
      var resolved=place&&fdReadingResume(place,availableAnchors()), target=null, j;
      if(resolved){
        for(j=0;j<nodes.length;j++)if(anchor(nodes[j])===resolved.heading){target=nodes[j];break;}
        if(target){win.scrollTo(0,absoluteTop(target)+resolved.offset);suppressedY=scrollY();baselineY=scrollY();}
      }
      ready=true;
    });
  }
  function destroy(){
    if(!active)return;
    if(timer!==null){timerClear(timer);timer=null;}
    capture();
    active=false;
    win.removeEventListener('scroll',onScroll);
    win.removeEventListener('pagehide',onPagehide);
    win.removeEventListener('resize',onResize);
  }
  function startAtTop(){
    if(!active||!ready||top.hidden)return;
    if(timer!==null){timerClear(timer);timer=null;}
    pendingPosition=null;
    win.scrollTo(0,absoluteTop(nodes[0]));
    suppressedY=scrollY();
    baselineY=scrollY();
    write(fdReadingPlaceDrop(state.readingPlaces,ref));
    top.hidden=true;
    nodes[0].setAttribute('tabindex','-1');
    try{nodes[0].focus({preventScroll:true});}catch(_){nodes[0].focus();}
  }
  if(o.allowStorage!==true){
    status.textContent='Reading place could not be saved on this device';
    return {destroy:destroy,startAtTop:startAtTop};
  }
  frame(function(){
    if(!active)return;
    state.readingPlaces=fdReadingPlaces(state.readingPlaces);
    var place=state.readingPlaces[ref], resolved=place&&fdReadingResume(place,availableAnchors()), target=null;
    if(o.restore===false){
      baselineY=scrollY();
      write(state.readingPlaces);
    }else if(place&&!resolved){
      win.scrollTo(0,0);
      suppressedY=scrollY();
      baselineY=scrollY();
      write(fdReadingPlaceDrop(state.readingPlaces,ref));
    }else{
      if(resolved){
        for(var j=0;j<nodes.length;j++)if(anchor(nodes[j])===resolved.heading){target=nodes[j];break;}
        win.scrollTo(0,absoluteTop(target)+resolved.offset);
        suppressedY=scrollY();
        top.hidden=false;
        if(o.focusOnRestore===true&&(!o.canFocusOnRestore||o.canFocusOnRestore()===true)){
          target.setAttribute('tabindex','-1');
          try{target.focus({preventScroll:true});}catch(_){target.focus();}
        }
      }
      ready=true;
      baselineY=scrollY();
      write(state.readingPlaces);
      if(o.focusOnRestore!==true&&(!o.canFocusOnRestore||o.canFocusOnRestore()===true)){
        nodes[0].setAttribute('tabindex','-1');
        try{nodes[0].focus({preventScroll:true});}catch(_){nodes[0].focus();}
      }
    }
    ready=true;
    win.addEventListener('scroll',onScroll);
    win.addEventListener('pagehide',onPagehide);
    win.addEventListener('resize',onResize);
  });
  return {destroy:destroy,startAtTop:startAtTop};
}

function fdWire(root, initialState, opts){
  var o=opts||{}, win=o.window||(typeof window!=='undefined'?window:null);
  var doc=o.document||(typeof document!=='undefined'?document:null);
  var state=fdClone(initialState||{}), invokers=[], nudgeTimer=null, navGeneration=0;
  var destroyed=false, registrations=[], startupPrepared=false, startupCommitted=false;
  var offlineRefreshPending=false,offlineRefreshTimer=null,offlineRefreshGeneration=0;
  var baseStale=false;
  var render=o.render||function(){};
  var renderTransient=o.renderTransient||function(next,detail){
    if(!detail.preserveResource) render(next,detail);
  };
  var setTimer=o.setTimer||(typeof setTimeout==='function'?setTimeout:null);
  var clearTimer=o.clearTimer||(typeof clearTimeout==='function'?clearTimeout:null);
  var index=o.index||fdDefaultIndex();
  var previewRouteBase=previewActive()?currentRoute():null;

  function offlineRefreshScope(value){
    var s=value||{};
    if(s.screen!=='app'||s.tab!=='today'||s.openId||s.offlineOpen!==true)return '';
    return [String(s.roleId||s.role||''),String(s.week),String(s.rotationStart||''),
      s.appMode===true?'app':'week',String(s.appBridge||'')].join('|');
  }
  function cancelOfflineRefresh(){
    offlineRefreshGeneration++;
    offlineRefreshPending=false;
    if(offlineRefreshTimer!==null&&clearTimer)try{clearTimer(offlineRefreshTimer);}catch(_){}
    offlineRefreshTimer=null;
  }

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
  /* THE EQUIVALENT of a control that is gone: the one live element carrying the same action
     attribute AND the same value, inside the given scope. That pairing is the whole of it -- two
     controls with the same attribute and value do the same thing, which is why focus may move to
     one when the other is destroyed, and why this needs no per-control special case. A value that
     cannot go in a selector safely is skipped rather than escaped: these are ids and modes, and a
     bail is cheaper to trust than an escaper nobody re-reads.

     Two callers, two scopes, and the scope is the whole difference between them: refocusInvoker
     searches the OPEN DIALOG (a control that repainted its own overlay), restoreInvoker the ROOT
     (the invoker that opened the overlay lives outside it, and by then the dialog is gone). */
  function equivalentControl(invoker, scope){
    if(!scope||!scope.querySelector||!invoker||!invoker.hasAttribute||!invoker.getAttribute){
      return null;
    }
    for(var i=0;i<FD_HANDLED_ATTRS.length;i++){
      var name=FD_HANDLED_ATTRS[i];
      if(!invoker.hasAttribute(name)) continue;
      var value=String(invoker.getAttribute(name)||'');
      if(/["\\]/.test(value)) continue;
      var el=scope.querySelector('['+name+'="'+value+'"]');
      if(el) return el;
    }
    return null;
  }
  /* The third overlay case, and until this existed the only one with no branch. focusDialog fires
     when the overlay IDENTITY changes and restoreInvoker when it closes; a control that re-renders
     its own overlay IN PLACE matched neither, and fdRenderOverlays replaces the whole overlay
     mount's innerHTML on every render -- so the element the learner just activated was destroyed
     and focus fell to <body>. From there fdTrapFocus returns false and the next Tab walks straight
     out of an aria-modal dialog, behind its own backdrop. Worse where a control's aria-pressed IS
     its only feedback: the settings panel ships no toast by decision, so a screen-reader user got
     no signal at all that their own click had landed. Scoped to the open dialog, so it can only
     ever move focus inside the overlay that was just repainted. */
  function refocusInvoker(invoker){
    var el=equivalentControl(invoker,dialog());
    if(el&&el.focus){ try{el.focus();}catch(_){} return true; }
    return false;
  }
  /* The invoker stack holds ELEMENT references across renders, and a render can destroy the
     element it holds. The gear is the standing case: the header is chrome, a theme change marks
     chrome dirty, and the shell reassigns the header mount's innerHTML -- so opening the panel,
     choosing a mode and closing it used to leave focus on <body>, where fdTrapFocus bails and the
     next Tab restarts at the top of the document. Falling back to the equivalent control in the
     ROOT (not the dialog -- by now it is closed, and the control lives outside it anyway) applies
     refocusInvoker's own rule one layer out. A disconnected invoker with no equivalent still
     falls through to the next entry on the stack, as it always did. */
  function restoreInvoker(){
    while(invokers.length){
      var el=invokers.pop();
      if(el&&el.isConnected===false) el=equivalentControl(el,root);
      if(el&&el.focus){
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
    var keys=['tab','viewWeek','openId','fromTab','libraryView'];
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
  /* Reports the stored MODE, not the painted attribute. Reading documentElement here (as this
     did before the three-way control) cannot distinguish "system, resolving to dark" from
     "explicitly dark", so the panel would never show system as active. Storage is the only place
     the distinction survives, which is why nothing falls back to the DOM here: a browser that
     blocks storage has no stored mode to report, and 'system' is the honest answer there. */
  function currentTheme(){
    try{ return fdThemeMode(localStorage.getItem('cw_theme')); }catch(_){ return 'system'; }
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
    var keys=['openId','tab','screen','libraryView','kitSection','kitToolPreview','careIntentId','carePackIds','offlineOpen'];
    for(var i=0;i<keys.length;i++){
      if(baseValue(before,keys[i])!==baseValue(after,keys[i])) return true;
    }
    return false;
  }
  function transitionDetail(before, patch, effect, changedBase){
    var changed=[], surfaces={base:false,overlay:false,completion:false,chrome:false,layout:false};
    /* settingsConfirmClear belongs here because arming the erase changes the PANEL and nothing
       under it. Left out, it falls to the else branch and is classed as a base change, so every
       arm and every cancel rebuilds contentEl.innerHTML beneath an open sheet. */
    var overlayKeys={searchOpen:true,query:true,sheet:true,sheetFrom:true,stepsDone:true,
      nudge:true,settingsConfirmClear:true};
    var actionKeys={done:true,justDone:true,progressRaw:true};
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
        type==='nudge-timeout'||type==='search-input'||
        type==='set-analytics') surfaces.overlay=true;
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
  /* Debt left by a commit that deliberately rendered nothing -- today only the settings panel's
     date field. "Renders nothing" is a decision about the PANEL and must not become one about the
     app: three surfaces outside the panel derive from that key (Progress's signpost, the plan's
     intensity line, Today's countdown through fdExamCountdown), and closing the sheet does not
     cover any of them, because fdCloseSheet patches only overlay keys and transitionDetail
     classes every one of them as overlay. So the commit records that the base surface is owed a
     render and a later render pays it. The panel is still never rebuilt at commit time, which is
     what the segment-cursor reasoning in changeHandler depends on.

     THREE settlement sites, and they are exhaustive because the debt has exactly one creator.
     Only changeHandler sets it, from one of two fields of the same type: the panel's, or Today's
     prompt (fd_today.js, shown on the exam path until a date is stored). From the panel's field:
     the panel can be left only through
     apply() (its close control, the backdrop, Escape) or through history, and the nudge timeout
     is the one other render a learner can reach while it is still open -- fdCloseSheet schedules
     it for 8s, long enough to open the gear and set a date. From Today's field no overlay is
     open, so the learner's next apply() or history step pays it, and until then the prompt keeps
     showing the date just chosen -- the same feedback the panel's field gives. inputHandler is deliberately NOT a
     site: reaching it needs search open, opening search is an apply(), and the gear patches
     searchOpen:false, so the two overlays cannot coexist. A call there would have been a line
     that looks load-bearing and can never run.

     preserveResource is overridden ONLY where the Progress PAGE is what is mounted. It exists to
     stop a transient render replacing a LOADED reader with fdBaseMarkup's "Loading…" shell --
     true of a page, false of the Progress page itself, which fdBaseMarkup renders in full
     (fdProgressMarkup -> renderProgress) and whose preserve branch is a pure no-op anyway, since
     fdPatchCompletion returns early on __progress__.

     The openId alone is NOT that test, and treating it as one is data loss. The shell mounts the
     plan, the placement form and its results straight into contentEl from its own delegated
     listener while openId stays '__progress__', so the controller never learns they are there:
     overriding on the openId replaces a half-answered placement with the Progress page, and the
     only route back (startPretest) resets its answers. Leaving a sub-view alone is safe because
     renderPlanCards reads the live key -- it re-derives on next entry rather than carrying the
     frozen snapshot this task removed. */
  function progressPageMounted(){
    return !!(root&&root.querySelector&&root.querySelector('#pgRoot'));
  }
  function absorbStaleBase(detail){
    if(!baseStale) return detail;
    detail.surfaces.base=true;
    if(state.openId==='__progress__'&&progressPageMounted()) detail.preserveResource=false;
    /* Cleared only when the render about to run will REALLY rebuild the base. A preserved reader
       render does not touch contentEl at all, so clearing there would retire the debt against a
       render that paid none of it -- the same shape of bug as a check reporting success over a
       smaller set than it claims. Leaving a reader always changes openId, so the debt is paid by
       the full render that follows. */
    if(!detail.preserveResource) baseStale=false;
    return detail;
  }
  function fdApplyEffect(effect, fromHistory, generation, focusOnRestore){
    if(!effect) return;
    /* set-rotation and browse-without-rotation write their key in apply(), ABOVE the render --
       see the comment there. Nothing is left for them to do once the page has painted. */
    if(effect.type==='toggle-progress'){
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
      /* Paints only. The cw_theme write is hoisted above the render in apply() -- see the comment
         there; the settings panel re-reads that key while it is open. */
      var prefersDark=!!(win&&win.matchMedia&&
        win.matchMedia('(prefers-color-scheme: dark)').matches);
      if(doc&&doc.documentElement)
        doc.documentElement.setAttribute('data-theme',fdThemeAttr(effect.mode,prefersDark));
    } else if(effect.type==='clear-device-data'){
      /* The reload is half of the erase, not a courtesy. apply() has already run fdSave(state),
         so the store is cleared with the controller's own key in it -- but the controller still
         holds that state in memory, and the learner's next tap would fdSave it straight back,
         restoring role, week and route with no second confirmation. Reloading is what makes the
         page agree with the store. It follows the render deliberately: whether the browser
         honours it or not, nothing is left on screen claiming data that is gone. */
      if(o.disposeReadingPlace)o.disposeReadingPlace();
      fdClearDeviceData(localStorage);
      if(win&&win.location&&win.location.reload) win.location.reload();
    } else if(effect.type==='set-exam-date'){
      /* Delegated to fd_state.js, next to fdExamCountdown which reads the same key. The key
         itself cannot be named in this file: the controller's copy rule bans its audience token
         file-wide (tests/fd-action-contract.test.mjs), comments included. */
      fdStoreExamDate(effect.date);
    } else if(effect.type==='print-care-pack'){
      if(win&&typeof win.print==='function') try{win.print();}catch(_){}
    } else if(effect.type==='refresh-offline'){
      if(offlineRefreshPending)return;
      var report=typeof o.reportOfflineRefresh==='function'?o.reportOfflineRefresh:function(){};
      var scope=offlineRefreshScope(state);
      if(!scope)return;
      var current=typeof o.offlineStatus==='function'?o.offlineStatus():null;
      var model=typeof fdOfflineStatus==='function'?fdOfflineStatus(current):{kind:'not-ready'};
      var verified=model.kind==='ready'||model.kind==='update';
      var online=typeof o.online==='function'?o.online():!!(win&&win.navigator&&win.navigator.onLine!==false);
      if(!online){report(fdOfflineRefreshMessage(false,verified));return;}
      if(!setTimer||!clearTimer){report(fdOfflineRefreshMessage(true,false));return;}
      var timeoutMs=typeof o.offlineRefreshTimeoutMs==='number'&&isFinite(o.offlineRefreshTimeoutMs)&&
        o.offlineRefreshTimeoutMs>0?o.offlineRefreshTimeoutMs:8000;
      var token=++offlineRefreshGeneration;
      function finish(success,timedOut){
        if(token!==offlineRefreshGeneration)return;
        offlineRefreshGeneration++;
        offlineRefreshPending=false;
        if(offlineRefreshTimer!==null)try{clearTimer(offlineRefreshTimer);}catch(_){}
        offlineRefreshTimer=null;
        if(destroyed||offlineRefreshScope(state)!==scope)return;
        report(timedOut===true?'Update check timed out. Try again with a connection.':
          fdOfflineRefreshMessage(true,success===true));
      }
      offlineRefreshPending=true;
      report('Checking for a newer offline copy…');
      try{offlineRefreshTimer=setTimer(function(){finish(false,true);},timeoutMs);}
      catch(_){finish(false,false);return;}
      var update=typeof o.requestSWUpdate==='function'?o.requestSWUpdate:function(){return Promise.resolve(false);};
      var updateResult;
      try{updateResult=update();}catch(_){finish(false,false);return;}
      Promise.resolve(updateResult).then(function(success){
        finish(success===true,false);
      },function(){
        finish(false,false);
      });
    } else if(effect.type==='nudge-timeout'&&setTimer){
      if(nudgeTimer&&clearTimer) clearTimer(nudgeTimer);
      nudgeTimer=setTimer(function(){
        if(destroyed) return;
        var before=fdClone(state);
        state.nudge=null;
        renderTransient(state,absorbStaleBase(transitionDetail(
          before,{nudge:null},{type:'nudge-dismiss'},false
        )));
      },effect.delay);
    } else if(effect.type==='open-resource'){
      var opener=o.openResource||fdOpenResource;
      opener(effect.ref,{
        index:index,state:state,search:(win&&win.location&&win.location.search)||'',
        fromHistory:!!fromHistory,host:freshResourceHost(),focusOnRestore:focusOnRestore===true,
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
  /* Theme used to have its own branch here -- query [data-fd-theme="<mode>"] and focus it -- added
     because the earlier code focused the FIRST control in the group and so moved focus off the
     learner's choice on every selection. refocusInvoker keeps that outcome by construction (the
     invoker is the chosen segment, so its own attribute value is what gets re-queried) and keeps
     it for every other control in the panel too, which a per-effect branch could not. */
  function currentScrollY(){
    var y=win?(typeof win.scrollY==='number'?win.scrollY:win.pageYOffset):0;
    return typeof y==='number'&&y>=0?y:0;
  }
  /* Which of the duplicates the learner actually activated. Today renders Quick Tools twice (a
     hidden pill row and the desktop rail, from the same list), and a week item can also sit in
     the rail, so "the first [data-fd-open=ref]" is often a display:none copy -- and focusing a
     hidden element moves nothing. Recorded at open time from the click's own target; per-boot,
     never persisted, so a reload falls back to the first duplicate that is actually shown. */
  var originOpener=null;
  function openersFor(ref){
    if(!root||!ref) return [];
    var sel=ref==='__progress__'?'[data-fd-progress]':'[data-fd-open="'+String(ref).replace(/["\\]/g,'\\$&')+'"]';
    try{
      if(root.querySelectorAll){ var list=root.querySelectorAll(sel); return list?Array.prototype.slice.call(list):[]; }
      if(root.querySelector){ var one=root.querySelector(sel); return one?[one]:[]; }
    }catch(_){}
    return [];
  }
  function isShown(el){
    if(!el) return false;
    if(typeof el.getClientRects==='function'){ try{ return el.getClientRects().length>0; }catch(_){} }
    if('offsetParent' in el) return el.offsetParent!==null;
    return true; /* no layout information (a test stub): treat as shown */
  }
  function rememberOpener(ref, invoker){
    originOpener=null;
    if(!invoker) return;
    var dup=openersFor(ref), k=dup.indexOf(invoker);
    if(k<0&&invoker.closest){ try{ k=dup.indexOf(invoker.closest('[data-fd-open],[data-fd-progress]')); }catch(_){ k=-1; } }
    if(k>=0) originOpener={ref:ref,index:k};
  }
  /* Focus goes back only to a control we can name with confidence: the one the learner
     activated, re-found by position among the duplicates that carry its ref; failing that the
     ONLY shown control for the ref; failing that a shown control inside Today's primary (the one
     thing the learner was pointed at). Anything less certain leaves the render's own landmark
     focus in place -- a resource opened by a plain link (the Resume card is an <a href>) never
     passed through apply(), and a wrong guess among week rows and rail copies is worse than
     main#content. The One Thing First contract (front-door.spec.js A1/A2) pins that fallback. */
  function openerFor(ref){
    var all=openersFor(ref), shown=[], i, el;
    for(i=0;i<all.length;i++) if(isShown(all[i])) shown.push(all[i]);
    if(originOpener&&originOpener.ref===ref&&originOpener.index>=0){
      el=all[originOpener.index];
      if(el&&isShown(el)) return el;
    }
    if(shown.length===1) return shown[0];
    for(i=0;i<shown.length;i++){
      if(shown[i].closest){ try{ if(shown[i].closest('.fd-primary')) return shown[i]; }catch(_){} }
    }
    return null;
  }
  function keepFocusedOpenerVisible(el){
    if(state.tab!=='library'||state.libraryView!=='essentials') return;
    if(!el||!el.getBoundingClientRect||!el.scrollIntoView||!win||typeof win.innerHeight!=='number') return;
    var top=0,bottom=win.innerHeight, box, chrome, style;
    try{
      chrome=root&&root.querySelector?root.querySelector('.fd-header'):null;
      style=chrome&&win.getComputedStyle?win.getComputedStyle(chrome):null;
      if(chrome&&chrome.getBoundingClientRect&&style&&(style.position==='sticky'||style.position==='fixed')){
        box=chrome.getBoundingClientRect();
        if(box.top<=0&&box.bottom>0) top=box.bottom;
      }
      chrome=root&&root.querySelector?root.querySelector('.fd-tabs'):null;
      style=chrome&&win.getComputedStyle?win.getComputedStyle(chrome):null;
      if(chrome&&chrome.getBoundingClientRect&&style&&style.position==='fixed'){
        box=chrome.getBoundingClientRect();
        if(box.bottom>=win.innerHeight-1&&box.top<bottom) bottom=box.top;
      }
      box=el.getBoundingClientRect();
      if(box.top<top||box.bottom>bottom) el.scrollIntoView({block:'center',inline:'nearest'});
    }catch(_){}
  }
  /* Returning from a resource lands the learner where they left the originating tab (#427): the
     list scrolled back to the offset recorded when the resource opened, and focus on the control
     that opened it, so a keyboard or screen-reader user resumes from the link they chose rather
     than from the top of the main region. Runs AFTER the render's own focus (announceRoute puts
     focus on the main region) and deliberately overrides it -- only when the control is really
     there: a different tab, an open search panel or sheet, or a retired ref means there is nothing
     to return to, and the render's focus stands. Scroll is restored even then only for the
     originating tab, since the offset belongs to that list. */
  function restoreOrigin(before){
    if(state.screen!=='app'||state.tab!==before.fromTab||state.searchOpen||state.sheet) return null;
    var y=typeof before.scrollPos==='number'&&before.scrollPos>=0?before.scrollPos:0;
    if(win&&win.scrollTo) try{ win.scrollTo(0,y); }catch(_){}
    var el=openerFor(before.openId);
    if(el&&el.focus){
      try{ el.focus({preventScroll:true}); }catch(_){ try{ el.focus(); }catch(__){} }
      keepFocusedOpenerVisible(el);
    }
    return el;
  }
  function focusPostTransition(before, result, changedBase){
    if(changedBase&&state.screen&&state.screen.indexOf('setup-')===0){
      var heading=root&&root.querySelector?root.querySelector('.fd-setup .fd-h1'):null;
      if(!heading) heading=freshResourceHost();
      if(heading&&heading.setAttribute) heading.setAttribute('tabindex','-1');
      if(heading&&heading.focus) try{heading.focus({preventScroll:true});}catch(_){try{heading.focus();}catch(__){}}
    }
  }
  /* APP practice repaints its whole visit-only player. Keep keyboard focus at the next step,
     or on the equivalent rebuilt control, so Tab continues where the learner left off. */
  function focusAppPractice(invoker,before){
    if(!invoker||!invoker.hasAttribute||!root||!root.querySelector) return;
    var selector='',target=null,pack,id;
    if(invoker.hasAttribute('data-fd-app-practice-open')||
       invoker.hasAttribute('data-fd-app-practice-reset')){
      selector='[data-fd-app-practice-reveal]';
    } else if(invoker.hasAttribute('data-fd-app-practice-reveal')){
      selector='[data-fd-app-practice-classify]';
    } else if(invoker.hasAttribute('data-fd-app-practice-classify')||
              invoker.hasAttribute('data-fd-app-practice-question')){
      target=equivalentControl(invoker,root);
    } else if(invoker.hasAttribute('data-fd-app-practice-close')){
      pack=before.appPractice&&before.appPractice.pack;
      id=pack&&pack.id;
      if(typeof id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)){
        selector='[data-fd-app-practice-open="'+id+'"]';
      }
    }
    if(!target&&selector) target=root.querySelector(selector);
    if(target&&target.focus) try{target.focus();}catch(_){}
  }
  function apply(result, invoker, fromHistory){
    if(destroyed) return state;
    if(previewActive()&&meaningfulResult(result)){
      lockPreview();
      return state;
    }
    var before=fdClone(state), beforeOverlay=overlayIdentity(state);
    var beforeRefreshScope=offlineRefreshScope(state);
    var beforeHistory=historyValue();
    var patch=result.patch||{};
    var beforeHadOverlay=!!beforeOverlay;
    if(!beforeHadOverlay&&invoker) invokers.push(invoker);
    for(var k in patch){ if(fdOwn(patch,k)) state[k]=patch[k]; }
    if(state.screen!=='app'||state.tab!=='today'||state.openId)state.offlineOpen=false;
    if(beforeRefreshScope&&beforeRefreshScope!==offlineRefreshScope(state))cancelOfflineRefresh();
    if(state.tab!=='care'||state.openId){
      state.careIntentId='';
      if(state.carePackIds&&state.carePackIds.length) state.carePackIds=[];
    }
    /* Where the learner was when they opened a resource (#427). Recorded by the controller, not
       by fdDispatch: the scroll offset is a browser fact and dispatch stays pure. A reader that
       opens another reader keeps the origin -- "back" still means the tab it all started from. */
    if(!before.openId&&state.openId){ state.scrollPos=currentScrollY(); rememberOpener(state.openId,invoker); }
    var afterOverlay=overlayIdentity(state);
    if(!afterOverlay&&!beforeHadOverlay&&invokers.length) invokers.pop();
    /* An explicit Essentials visit also reopens native groups when All was already selected. */
    if(before.openId&&!state.openId&&state.tab==='library') state.kitSection='all';
    var changedBase=baseChanged(before,state)||fdOwn(patch,'kitSection');
    var detail=absorbStaleBase(transitionDetail(before,patch,result.effect,changedBase));
    var generation=navGeneration;
    if(changedBase||result.route||result.effect&&(result.effect.type==='open-resource'||
        result.effect.type==='open-progress'||result.effect.openRef)){
      navGeneration++;
      generation=navGeneration;
    }
    /* Live renderers reload canonical progress to include receipts written by a tool iframe.
       Persist this toggle before rendering for the same reason; resource opening and the
       remaining effects still follow render, when their fresh host exists. */
    if(result.effect&&result.effect.type==='toggle-progress'){
      try{ localStorage.setItem('cw_progress_v1',JSON.stringify(result.effect.raw)); }catch(_){}
    }
    /* Same shape, same reason. The settings panel's Appearance section renders from cw_theme --
       fdLiveState re-reads it on every render -- and the panel is open by definition when this
       fires, because fdSettingsSeg is the only thing that emits data-fd-theme. Written after the
       render, the page painted the new theme while the panel kept the PREVIOUS segment filled and
       aria-pressed="true", and focusPostTransition then focused the clicked button: "Dark, button,
       not pressed", with a different segment claiming to be pressed. The PAINT stays in
       fdApplyEffect; only the read-back is order-sensitive. */
    if(result.effect&&result.effect.type==='set-theme'){
      try{ localStorage.setItem('cw_theme',result.effect.mode); }catch(_){}
    }
    /* Same shape again for the rotation start (#425). fdLiveState re-derives the week from
       cw_rotation_start on EVERY render when the state carries none, and browse mode carries none
       by definition: removed after the render, the header and Today painted the old week once
       more before the key went, and the smoke test read "Week 1" on a learner who had just chosen
       browse. The write for a chosen week is hoisted with it so the two stay one rule. */
    if(result.effect&&result.effect.type==='set-rotation'){
      try{ localStorage.setItem('cw_rotation_start',result.effect.start); }catch(_){}
    } else if(result.effect&&result.effect.type==='browse-without-rotation'){
      try{ localStorage.removeItem('cw_rotation_start'); }catch(_){}
    }
    /* Same shape and the same reason as the theme write above, one delegation further out. The
       Usage section renders from what the emitter reports -- fdLiveState calls enabled(), which
       re-reads its key on every render -- and the panel is open by definition when this fires,
       because fdSettingsUsage is the only thing that emits data-fd-analytics. Run this from
       fdApplyEffect, after the render, and the segment the learner just pressed comes back
       unpressed with the one they left still filled and aria-pressed="true".

       Delegated rather than written here, and the key is deliberately not named in this file:
       the usage emitter is the one definition of what a stored opt-out and an absent one mean, a
       second writer is how the two drift, and a grep for that key returning exactly one file is
       what keeps the ownership checkable. The emitter swallows its own storage failures; the
       catch is for the object itself, so a preference can never stop the render after it. */
    if(result.effect&&result.effect.type==='set-analytics'){
      try{
        if(win&&win.cwAnalytics){
          if(result.effect.on) win.cwAnalytics.optIn();
          else win.cwAnalytics.optOut();
        }
      }catch(_){}
    }
    /* A section-only filter belongs just to this Essentials visit. Other navigation patches also
       reset kitSection to All; those still carry durable route state and must be saved normally. */
    var visitOnly=fdOwn(patch,'kitSection')||fdOwn(patch,'kitToolPreview')||
      fdOwn(patch,'careIntentId')||fdOwn(patch,'carePackIds')||fdOwn(patch,'offlineOpen')||
      !!(result.effect&&result.effect.type==='refresh-offline');
    for(var saveKey in patch){
      if(fdOwn(patch,saveKey)&&saveKey!=='kitSection'&&saveKey!=='kitToolPreview'&&
         saveKey!=='careIntentId'&&saveKey!=='carePackIds'&&saveKey!=='offlineOpen') visitOnly=false;
    }
    if(!visitOnly) fdSave(state);
    if(!fromHistory){
      var pushed=routeTo(result.route,result.history==='replace');
      if(!pushed&&beforeHistory!==historyValue()) replaceHistorySnapshot();
    }
    if(changedBase) render(state,detail);
    else renderTransient(state,detail);
    fdApplyEffect(result.effect,fromHistory,generation,
      !!(invoker&&invoker.getAttribute&&invoker.getAttribute('data-fd-reading-resume')==='1'));
    focusPostTransition(before,result,changedBase);
    if(fdOwn(patch,'appPractice')&&!afterOverlay&&!beforeHadOverlay){
      focusAppPractice(invoker,before);
    }
    /* The Essentials rail rebuilds with the filtered results. Keep keyboard focus on the exact
       section button the learner chose, which also scrolls a clipped phone rail into view. */
    if((fdOwn(patch,'kitSection')||fdOwn(patch,'kitToolPreview'))&&!afterOverlay&&!beforeHadOverlay){
      var rebuiltFilter=equivalentControl(invoker,root);
      if(rebuiltFilter&&rebuiltFilter.focus) try{rebuiltFilter.focus();}catch(_){}
    }
    if(fdOwn(patch,'careIntentId')&&!afterOverlay&&!beforeHadOverlay&&root&&root.querySelector){
      var careFocus=state.careIntentId
        ?root.querySelector('[data-fd-care-intent="'+state.careIntentId+'"]')
        :root.querySelector('[data-fd-care-intent]');
      if(careFocus&&careFocus.focus) try{careFocus.focus();}catch(_){}
    }
    if(fdOwn(patch,'carePackIds')&&!afterOverlay&&!beforeHadOverlay&&root&&root.querySelector){
      var packFocus=invoker&&invoker.hasAttribute&&invoker.hasAttribute('data-fd-care-pack-clear')
        ?root.querySelector('[data-fd-care-pack]'):equivalentControl(invoker,root);
      if(packFocus&&packFocus.focus) try{packFocus.focus();}catch(_){}
    }
    if(fdOwn(patch,'offlineOpen')&&!afterOverlay&&!beforeHadOverlay&&root&&root.querySelector){
      var offlineFocus=root.querySelector(state.offlineOpen?'[data-fd-offline-close]':'[data-fd-offline-open]');
      if(offlineFocus&&offlineFocus.focus)try{offlineFocus.focus();}catch(_){}
    }
    if(before.openId&&!state.openId) restoreOrigin(before);
    if(afterOverlay&&afterOverlay!==beforeOverlay) focusDialog();
    else if(!afterOverlay&&beforeHadOverlay) restoreInvoker();
    /* The fallback exists because refocusInvoker's premise -- the equivalent control is still
       there after the render -- is true of every control in the panel except one. The two-tap
       erase REPLACES itself: arming swaps the single "clear" button for a cancel/confirm pair, so
       the invoker's own attribute matches nothing in the rebuilt DOM, refocusInvoker declines, and
       focus falls to <body>. From there fdTrapFocus bails and the next Tab walks out of an
       aria-modal dialog, behind its own backdrop -- the exact defect refocusInvoker was added to
       fix, landing on the one control that can destroy something. Keeping focus at the dialog's
       own entry point is not as good as landing on the successor control, and it is the most a
       generic rule can promise about a control that no longer exists. What tells the learner the
       erase is armed is the live region the armed copy carries, not this.

       Gated on there BEING an invoker, which is not belt-and-braces. controller.dispatch() passes
       null, and the shell dispatches that way from a tool frame's postMessage -- 'openLibrary'
       patches no sheet key, so the overlay identity is unchanged and this branch is reached with
       an open panel nobody touched. Focus belongs wherever the learner left it there; the
       fallback is for the element that was destroyed under their finger. */
    else if(afterOverlay&&afterOverlay===beforeOverlay){
      if(!refocusInvoker(invoker)&&invoker) focusDialog();
    }
    return state;
  }
  function context(extra){
    var c={
      nowMs:Date.now(),theme:currentTheme(),
      search:(win&&win.location&&win.location.search)||'',
      progressRaw:progressRaw(),weekItems:fdItemsForWeek(index,fdProgressWeek(state,index)),index:index,
      appPracticePacks:o.appPracticePacks||[]
    };
    var add=extra||{};
    for(var k in add){ if(fdOwn(add,k)) c[k]=add[k]; }
    if(!previewActive()&&o.loadBlock&&new URLSearchParams(c.search||'').get('block')==='1'){
      try{ c.block=o.loadBlock(c.nowMs); }catch(ignoreBlock){ c.block=null; }
    }
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
    var retainPathFocus=target.hasAttribute&&target.hasAttribute('data-fd-view-week');
    if(event.preventDefault) event.preventDefault();
    if(fdOwn(attrs,'data-fd-reading-top')){
      if(previewActive()){lockPreview();return;}
      var readingSession=o.readingPlaceSession&&o.readingPlaceSession();
      if(readingSession)readingSession.startAtTop();
      return;
    }
    if(fdOwn(attrs,'data-fd-dock-forward')){
      if(fdForwardDockAction(root,attrs['data-fd-dock-forward'])) return;
      apply(fdDispatch({'data-fd-tab':'library'},context(),state),target,false);
      return;
    }
    apply(fdDispatch(attrs,context({inSheet:!!state.sheet}),state),target,false);
    /* Path rerenders its route and detail together, so the activated tab no longer exists after
       apply(). Restore its equivalent without scrolling the learner away from the route. */
    if(retainPathFocus){
      var rebuiltPath=equivalentControl(target,root);
      if(rebuiltPath&&rebuiltPath.focus){
        try{rebuiltPath.focus({preventScroll:true});}catch(_){try{rebuiltPath.focus();}catch(__){}}
      }
    }
  }
  function pathKeyHandler(event){
    if(destroyed||!startupCommitted||previewActive()) return;
    var target=event&&event.target&&event.target.closest?event.target.closest('.fd-pathroute [data-fd-view-week]'):null;
    if(!target) return;
    var next=fdPathMoveWeek(index,state.viewWeek,event.key);
    if(next===null) return;
    if(event.preventDefault) event.preventDefault();
    var control=root&&root.querySelector?root.querySelector('.fd-pathroute [data-fd-view-week="'+next+'"]'):null;
    if(control&&control.click) control.click();
  }
  /* Chromium can focus a partly visible button in either horizontal Essentials strip without
     scrolling it fully into view. Move only that strip, preserving the page and route. */
  function focusHandler(event){
    if(destroyed||!startupCommitted||previewActive()) return;
    var target=event&&event.target;
    var control=target&&target.closest?target.closest('.fd-kit__tool-tabs [data-fd-kit-tool],.fd-kit__index-track [data-fd-kit-section]'):null;
    if(!control) return;
    var strip=control.closest('.fd-kit__tool-tabs,.fd-kit__index-track');
    if(!strip||!strip.getBoundingClientRect||!control.getBoundingClientRect) return;
    var frame=strip.getBoundingClientRect(), box=control.getBoundingClientRect();
    var style=win&&win.getComputedStyle?win.getComputedStyle(strip):null;
    var focusStyle=win&&win.getComputedStyle?win.getComputedStyle(control):null;
    var ring=focusStyle?(parseFloat(focusStyle.outlineWidth)||0)+(parseFloat(focusStyle.outlineOffset)||0):0;
    var left=frame.left+(strip.clientLeft||0)+Math.max(style?parseFloat(style.paddingLeft)||0:0,ring);
    var right=frame.left+(strip.clientLeft||0)+strip.clientWidth-Math.max(style?parseFloat(style.paddingRight)||0:0,ring);
    if(box.left<left) strip.scrollLeft-=left-box.left;
    else if(box.right>right) strip.scrollLeft+=box.right-right;
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
  /* The settings panel's one non-button control -- and Today's exam-date prompt, which renders the
     same field type -- and the only action in the file that does not go
     through apply(). Three deliberate differences from the click path, each of which is a defect
     if it is "made consistent":

     1. A change event, not a click. FD_ACTION_SELECTOR deliberately omits this attribute, so
        clickHandler never sees the field. If it did it would preventDefault() the gesture that
        opens the native picker, and -- the attribute being valueless in the markup -- dispatch
        an empty value: clicking your own date input would erase the date you had.
     2. No render HERE -- which is a statement about this moment, not about the app. Read the
        next paragraph before taking it as "nothing needs rendering".
        fdRenderOverlays replaces the whole overlay mount, so a render at commit time destroys
        the input mid-entry. A rebuilt native date input has a fresh segment cursor, so editing a
        set date to November by typing "1" then "1" yields January twice: the second keystroke
        starts a new month entry in a new element. Nothing in the PANEL derives from this value
        -- the field's own DOM already shows what was typed -- so a render buys the panel nothing
        and costs the interaction. That is also why refocusInvoker (the panel's generic focus
        restore) must not run: there is no rebuilt equivalent to restore focus TO, and pulling
        focus back into a field the learner is still using is worse than the bug it prevents.
        THREE SURFACES OUTSIDE THE PANEL DO DERIVE FROM IT -- Progress's signpost, the plan's
        intensity line, and Today's countdown through fdExamCountdown -- and closing the sheet
        does not cover any of them on its own: fdCloseSheet patches only overlay keys. So the
        commit marks the base surface stale and a later render pays that debt -- at one of the
        three settlement sites absorbStaleBase enumerates, not at just any render.
        Deferring is what keeps the panel untouched; skipping it altogether is how a learner could
        set a date, close the panel, and still read "Not set" on the page underneath.
     3. No history entry and no fdSave. The result carries no route and no controller-state key;
        fdStoreExamDate's one store is the whole of what changes. (That indirection is not style:
        the key's own name carries an audience token this file may not contain at all, comments
        included, so fd_state.js names it -- beside fdExamCountdown, which reads it.)

     The decision about WHAT to store still belongs to fdDispatch, which is where its shape is
     validated and where it is unit-testable without a DOM. */
  function changeHandler(event){
    if(destroyed) return;
    var target=event&&event.target;
    if(!target||!target.hasAttribute) return;
    if(!target.hasAttribute('data-fd-exam-date')) return;
    /* No preventDefault() on the pre-commit bail, unlike the click and key handlers: a change
       event is not cancelable, so calling it would only look like a guard. Dropping the write is
       the guard, and the field keeps showing what the learner typed either way. */
    if(!startupCommitted) return;
    if(previewActive()){ lockPreview(); return; }
    var result=fdDispatch(
      {'data-fd-exam-date':String(target.value||'')},context(),state
    );
    fdApplyEffect(result.effect,false,navGeneration);
    baseStale=true;
  }
  function keyHandler(event){
    if(!startupCommitted){
      if(event.preventDefault) event.preventDefault();
      return;
    }
    if(externalModalOpen()) return;
    var d=dialog();
    if(d&&fdTrapFocus(event,d)) return;
    var toolTab=event.target&&event.target.closest?event.target.closest('[data-fd-kit-tool]'):null;
    if(toolTab&&(event.key==='ArrowRight'||event.key==='ArrowDown'||event.key==='ArrowLeft'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End')){
      var toolTabs=root&&root.querySelectorAll?root.querySelectorAll('[data-fd-kit-tool]'):[], current=-1, ti;
      for(ti=0;ti<toolTabs.length;ti++) if(toolTabs[ti]===toolTab) current=ti;
      if(current>=0&&toolTabs.length){
        var next=current;
        if(event.key==='Home') next=0;
        else if(event.key==='End') next=toolTabs.length-1;
        else if(event.key==='ArrowRight'||event.key==='ArrowDown') next=(current+1)%toolTabs.length;
        else next=(current+toolTabs.length-1)%toolTabs.length;
        if(event.preventDefault) event.preventDefault();
        apply(fdDispatch({'data-fd-kit-tool':toolTabs[next].getAttribute('data-fd-kit-tool')},context(),state),toolTabs[next],false);
      }
      return;
    }
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
        if(first.kind==='care'){
          var careId=first.item&&first.item.id;
          var careLink=careId&&root&&root.querySelector?
            root.querySelector('.fd-result.is-care[data-care-resource="'+careId+'"]'):null;
          if(event.preventDefault) event.preventDefault();
          if(careLink&&careLink.click) careLink.click();
          return;
        }
        if(first.kind==='protocol') attrs['data-fd-safety']=first.item.ref;
        else{
          attrs['data-fd-open']=first.item.ref;
        }
        if(event.preventDefault) event.preventDefault();
        apply(fdDispatch(attrs,context(),state),event.target,false);
      }
      return;
    }
    var action=fdKeyAction(event.key,{
      typing:fdIsTypingTarget(event.target),screen:state.screen||'app',
      searchOpen:!!state.searchOpen,sheetOpen:!!state.sheet,reading:!!state.openId,
      meta:!!(event.metaKey||event.ctrlKey),appMode:fdAppMode(state)
    });
    if(!action) return;
    var attrs={};
    if(action.type==='close') attrs.close=true;
    else if(action.type==='search') attrs['data-fd-search']='';
    else if(action.type==='tab') attrs['data-fd-tab']=action.tab;
    else if(action.type==='nav'){
      var neighbours=fdReaderNeighbours(index,state.openId,fdProgressWeek(state,index));
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
    cancelOfflineRefresh();
    /* Flush the outgoing reader while its state is still current. The next save clones this map. */
    if(o.disposeReadingPlace)o.disposeReadingPlace();
    var before=fdClone(state);
    var merged=fdClone(state), snap=event&&event.state&&event.state.fd&&event.state.state;
    merged.careIntentId='';
    merged.carePackIds=[];
    merged.offlineOpen=false;
    merged.searchOpen=false;
    merged.query='';
    merged.sheet=null;
    merged.sheetFrom=null;
    merged.stepsDone={};
    if(snap){
      var routeKeys=['tab','viewWeek','openId','fromTab','libraryView'];
      for(var routeIndex=0;routeIndex<routeKeys.length;routeIndex++){
        delete merged[routeKeys[routeIndex]];
      }
      for(var snapIndex=0;snapIndex<routeKeys.length;snapIndex++){
        var routeKey=routeKeys[snapIndex];
        if(fdOwn(snap,routeKey)) merged[routeKey]=snap[routeKey];
      }
      if(merged.libraryView!=='full') merged.libraryView='essentials';
      merged.kitSection='all';
    } else {
      merged.roles=o.roles||merged.roles;
      merged.rotationStart=o.rotationStart||merged.rotationStart;
      merged=fdResolveState(win.location.href,merged,{allowAppInvite:o.allowAppInvite===true});
      var params=new URLSearchParams(win.location.search||'');
      if(!params.get('page')&&!params.get('tool')&&!params.get('tab')&&params.get('library')!=='full'){
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
      routeTo(fdRouteForTab(setupTab,win.location.search||'',state.libraryView),true);
    }
    navGeneration++;
    var generation=navGeneration;
    /* This render really does rebuild the base, so it settles any outstanding debt. Routed
       through absorbStaleBase rather than clearing the flag by hand, so one function stays the
       only thing that knows how the debt is paid. */
    render(state,absorbStaleBase({
      kind:'base',changed:[],
      surfaces:{base:true,overlay:true,completion:true,chrome:false},
      baseChanged:true,preserveResource:false,effect:null
    }));
    fdSave(state);
    /* Browser Back out of a resource is the same return as the in-app control (#427). */
    if(before.openId&&!state.openId){
      var restoredOpener=restoreOrigin(before);
      /* Persisted scroll state is restored after popstate listeners finish. Recheck at the end of
         the event loop so native restoration cannot strand a focused Essentials opener. */
      if(restoredOpener&&setTimer){
        setTimer(function(){
          if(!destroyed&&generation===navGeneration&&!state.openId) keepFocusedOpenerVisible(restoredOpener);
        },0);
      }
    }
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
        cancelOfflineRefresh();
        navGeneration++;
        removeRegistrations();
        if(nudgeTimer&&clearTimer) try{clearTimer(nudgeTimer);}catch(ignoreTimer){ }
      }
    };
  }

  if(!listen(root,'click',clickHandler,false)||!listen(root,'input',inputHandler,false)||
     !listen(root,'change',changeHandler,false)||!listen(root,'focusin',focusHandler,false)||
     !listen(root,'keydown',pathKeyHandler,false)||
     !listen(win,'keydown',keyHandler,false)||!listen(win,'popstate',popstateHandler,false)){
      removeRegistrations();
      destroyed=true;
      navGeneration++;
      return controller(false);
  }
  return controller(true);
}
