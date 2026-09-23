/* Pure route inventory and cache-response model. The worker, not this index, establishes
   whether a resource is actually present in the active device cache. */
var FD_OFFLINE_OWN=Object.prototype.hasOwnProperty;
var FD_OFFLINE_MAX=200;

function fdOfflineOwn(value,key){
  return !!value&&FD_OFFLINE_OWN.call(value,key);
}

function fdOfflineUrl(value){
  return typeof value==='string'&&(
    value==='/'||value==='/search-index.json'||
    /^\/(?:content\/[A-Za-z0-9][A-Za-z0-9._-]*\.md|tools\/[A-Za-z0-9][A-Za-z0-9._-]*\.html)$/.test(value));
}

function fdOfflineRef(ref,kind){
  if(typeof ref!=='string'||typeof kind!=='string')return '';
  if(kind==='read'&&/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(ref))return '/content/'+ref;
  if(kind==='tool'&&/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(ref))return '/tools/'+ref;
  return '';
}

function fdOfflineAppendOwnRefs(target,source){
  for(var i=0;i<source.length;i++){
    if(fdOfflineOwn(source,i))target.push(source[i]);
  }
}

function fdOfflineUrls(index,state){
  var idx=index||{},st=state||{},weeks=fdOfflineOwn(idx,'weeks')?idx.weeks:null;
  var byRef=fdOfflineOwn(idx,'byRef')?idx.byRef:null;
  var refs=[],pathway,bridge,bridges,activities,w,items,i,j,entry,ref,item,url;
  var out=['/','/search-index.json'],seen={'/':true,'/search-index.json':true};
  if(!byRef||typeof byRef!=='object')return [];
  if(fdOfflineOwn(st,'appMode')&&st.appMode===true){
    pathway=fdOfflineOwn(st,'appPathway')?st.appPathway:null;
    bridges=pathway&&fdOfflineOwn(pathway,'bridges')?pathway.bridges:null;
    if(!bridges||typeof bridges!=='object')return [];
    bridge=fdOfflineOwn(st,'appBridge')&&st.appBridge==='pmhnp'?'pmhnp':'pa';
    if(!fdOfflineOwn(bridges,bridge)||!bridges[bridge]||
       !fdOfflineOwn(bridges[bridge],'refs')||!Array.isArray(bridges[bridge].refs))return [];
    fdOfflineAppendOwnRefs(refs,bridges[bridge].refs);
    activities=pathway&&fdOfflineOwn(pathway,'activities')?pathway.activities:null;
    if(!Array.isArray(activities))return [];
    for(i=0;i<activities.length;i++){
      if(!fdOfflineOwn(activities,i)||!activities[i]||
         !fdOfflineOwn(activities[i],'refs')||!Array.isArray(activities[i].refs))return [];
      fdOfflineAppendOwnRefs(refs,activities[i].refs);
    }
  }else{
    if(!Array.isArray(weeks)||!fdOfflineOwn(st,'week')||
       typeof st.week!=='number'||!isFinite(st.week)||Math.floor(st.week)!==st.week)return [];
    for(w=0;w<weeks.length;w++){
      if(fdOfflineOwn(weeks,w)&&weeks[w]&&fdOfflineOwn(weeks[w],'n')&&weeks[w].n===st.week)break;
    }
    if(w===weeks.length)return [];
    items=fdOfflineOwn(weeks[w],'items')?weeks[w].items:null;
    if(!Array.isArray(items))return [];
    /* The week landing page is a separate Compass route, not one of week.items. */
    if(fdOfflineOwn(weeks[w],'landingRef'))refs.push(weeks[w].landingRef);
    for(i=0;i<items.length;i++){
      if(!fdOfflineOwn(items,i)||!items[i]||!fdOfflineOwn(items[i],'ref'))continue;
      refs.push(items[i].ref);
    }
  }
  for(j=0;j<refs.length;j++){
    if(!fdOfflineOwn(refs,j))continue;
    entry=refs[j];
    ref=typeof entry==='string'?entry:entry&&fdOfflineOwn(entry,'ref')?entry.ref:null;
    if(typeof ref!=='string'||!fdOfflineOwn(byRef,ref))continue;
    item=byRef[ref];
    if(!item||typeof item!=='object'||!fdOfflineOwn(item,'ref')||item.ref!==ref||
       !fdOfflineOwn(item,'kind')||item.rights===true)continue;
    url=fdOfflineRef(ref,item.kind);
    if(!url||!fdOfflineUrl(url)||fdOfflineOwn(seen,url))continue;
    seen[url]=true;
    out.push(url);
    if(out.length>FD_OFFLINE_MAX)return [];
  }
  return out.length>2?out:[];
}

function fdOfflineResponse(value,expected){
  var wanted={},found={},i,url,present,missing,ready,hasRouteResource=false;
  if(!value||typeof value!=='object'||Array.isArray(value)||
     !fdOfflineOwn(value,'version')||typeof value.version!=='string'||
     !/^[A-Za-z0-9._-]{1,128}$/.test(value.version)||
     !fdOfflineOwn(value,'ready')||typeof value.ready!=='boolean'||
     !fdOfflineOwn(value,'present')||!Array.isArray(value.present)||
     !fdOfflineOwn(value,'missing')||!Array.isArray(value.missing)||
     !Array.isArray(expected)||expected.length<1||expected.length>FD_OFFLINE_MAX)return null;
  for(i=0;i<expected.length;i++){
    if(!fdOfflineOwn(expected,i))return null;
    url=expected[i];
    if(!fdOfflineUrl(url)||fdOfflineOwn(wanted,url))return null;
    wanted[url]=true;
    if(url.indexOf('/content/')===0||url.indexOf('/tools/')===0)hasRouteResource=true;
  }
  if(!hasRouteResource)return null;
  present=value.present;
  missing=value.missing;
  if(present.length+missing.length!==expected.length)return null;
  for(i=0;i<present.length+missing.length;i++){
    if(i<present.length){
      if(!fdOfflineOwn(present,i))return null;
      url=present[i];
    }else{
      if(!fdOfflineOwn(missing,i-present.length))return null;
      url=missing[i-present.length];
    }
    if(!fdOfflineUrl(url)||!fdOfflineOwn(wanted,url)||fdOfflineOwn(found,url))return null;
    found[url]=true;
  }
  ready=missing.length===0;
  if(value.ready!==ready)return null;
  return {version:value.version,ready:ready,present:present.slice(),missing:missing.slice()};
}

/* A single bounded exchange with the active worker. The worker's response is untrusted until
   the exact requested set is accounted for by fdOfflineResponse. */
function fdCheckOffline(urls,options){
  var o=options||{},worker=o.controller,ServiceChannel=fdOfflineOwn(o,'MessageChannel')
    ?o.MessageChannel:(typeof MessageChannel==='function'?MessageChannel:null);
  var sw=o.serviceWorker||null,signal=o.signal||null;
  var seen={},i,url;
  var setTimer=o.setTimer||(typeof setTimeout==='function'?setTimeout:null);
  var clearTimer=o.clearTimer||(typeof clearTimeout==='function'?clearTimeout:null);
  var timeout=typeof o.timeoutMs==='number'&&isFinite(o.timeoutMs)&&o.timeoutMs>0
    ?o.timeoutMs:1500;
  if(!Array.isArray(urls)||urls.length<1||urls.length>FD_OFFLINE_MAX)
    return Promise.resolve({reason:'invalid-request'});
  for(i=0;i<urls.length;i++){
    if(!fdOfflineOwn(urls,i))return Promise.resolve({reason:'invalid-request'});
    url=urls[i];
    if(!fdOfflineUrl(url)||fdOfflineOwn(seen,url))
      return Promise.resolve({reason:'invalid-request'});
    seen[url]=true;
  }
  if(!worker||typeof worker.postMessage!=='function')return Promise.resolve({reason:'uncontrolled'});
  if(typeof ServiceChannel!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function')
    return Promise.resolve({reason:'unsupported'});
  return new Promise(function(resolve){
    var channel=null,timer=null,settled=false;
    function finish(value){
      if(settled)return;
      settled=true;
      if(timer!==null)try{clearTimer(timer);}catch(_){}
      if(channel){
        if(channel.port1){channel.port1.onmessage=null;channel.port1.onmessageerror=null;
          try{channel.port1.close();}catch(_){} }
        if(channel.port2)try{channel.port2.close();}catch(_){}
      }
      if(sw&&sw.removeEventListener)try{sw.removeEventListener('controllerchange',changed);}catch(_){}
      if(signal&&signal.removeEventListener)try{signal.removeEventListener('abort',aborted);}catch(_){}
      resolve(value);
    }
    function changed(){if(sw.controller!==worker)finish({reason:'uncontrolled'});}
    function aborted(){finish({reason:'cancelled'});}
    try{
      if(signal&&signal.aborted){finish({reason:'cancelled'});return;}
      channel=new ServiceChannel();
      if(!channel.port1||!channel.port2)throw new Error('MessageChannel unavailable');
      channel.port1.onmessage=function(event){
        if(sw&&sw.controller!==worker){finish({reason:'uncontrolled'});return;}
        var normalized=fdOfflineResponse(event&&event.data,urls);
        finish(normalized||{reason:'malformed'});
      };
      channel.port1.onmessageerror=function(){finish({reason:'malformed'});};
      if(channel.port1.start)channel.port1.start();
      if(sw&&sw.addEventListener)sw.addEventListener('controllerchange',changed);
      if(signal&&signal.addEventListener)signal.addEventListener('abort',aborted);
      timer=setTimer(function(){finish({reason:'timeout'});},timeout);
      worker.postMessage({type:'CW_OFFLINE_VERIFY',urls:urls.slice()},[channel.port2]);
    }catch(_){finish({reason:'post-failed'});}
  });
}

/* One visit-only route scope. Changing week, APP invitation, controller, or leaving Today
   invalidates the previous response before a late promise can paint it. */
function fdOfflineMonitor(options){
  var o=options||{},sw=o.serviceWorker||null,active=true,generation=0;
  var currentKey='',currentController=null,currentIndex=null,currentRoute=null;
  var currentStatus=null,cancel=null,unsubscribe=null;
  function notify(){if(typeof o.onChange==='function')try{o.onChange(currentStatus);}catch(_){} }
  function waiting(){try{return typeof o.getWaiting==='function'&&o.getWaiting()===true;}catch(_){return false;} }
  function stop(){
    generation++;
    if(cancel){cancel();cancel=null;}
  }
  function refreshWaiting(){
    if(!active||!currentKey||!currentStatus)return currentStatus;
    if((sw&&sw.controller||null)!==currentController)
      return sync(currentIndex,currentRoute,true);
    var hasWaiting=waiting();
    if(currentStatus.waiting!==hasWaiting){
      var next={expected:currentStatus.expected,waiting:hasWaiting};
      if(currentStatus.checking===true)next.checking=true;
      if(fdOfflineOwn(currentStatus,'response'))next.response=currentStatus.response;
      if(fdOfflineOwn(currentStatus,'reason'))next.reason=currentStatus.reason;
      currentStatus=next;notify();
    }
    return currentStatus;
  }
  function sync(index,route,force){
    if(!active)return null;
    currentIndex=index;currentRoute=route;
    var eligible=o.facultyPreview!==true&&route&&route.screen==='app'&&
      route.tab==='today'&&!route.openId;
    if(!eligible){
      if(currentKey||currentStatus){stop();currentKey='';currentController=null;currentStatus=null;notify();}
      return null;
    }
    var urls=fdOfflineUrls(index,route);
    if(!urls.length){
      stop();currentKey='';currentController=null;
      currentStatus={reason:'invalid-request',expected:[],waiting:false};notify();
      return currentStatus;
    }
    var controller=sw&&sw.controller||null;
    var key=String(route.roleId||route.role||'')+'|'+
      (route.appMode===true?'app:'+String(route.appBridge||'pa'):'week:'+String(route.week))+
      '|'+urls.join('|');
    var hasWaiting=waiting();
    if(force!==true&&currentKey===key&&currentController===controller){
      return refreshWaiting();
    }
    stop();
    currentKey=key;currentController=controller;
    var thisGeneration=generation;
    currentStatus={checking:true,expected:urls,waiting:hasWaiting};notify();
    var listeners=[],signal={aborted:false,
      addEventListener:function(type,handler){if(type==='abort')listeners.push(handler);},
      removeEventListener:function(type,handler){if(type==='abort'){
        var i=listeners.indexOf(handler);if(i>=0)listeners.splice(i,1);
      }}
    };
    cancel=function(){
      signal.aborted=true;
      listeners.slice().forEach(function(handler){handler();});
      listeners=[];
    };
    fdCheckOffline(urls,{
      controller:controller,serviceWorker:sw,signal:signal,
      MessageChannel:o.MessageChannel,setTimer:o.setTimer,clearTimer:o.clearTimer,
      timeoutMs:o.timeoutMs
    }).then(function(result){
      if(!active||thisGeneration!==generation)return;
      cancel=null;
      currentStatus={expected:urls,waiting:waiting()};
      if(result&&fdOfflineOwn(result,'reason'))currentStatus.reason=result.reason;
      else currentStatus.response=result;
      notify();
    });
    return currentStatus;
  }
  function controllerChanged(){sync(currentIndex,currentRoute,true);}
  if(sw&&sw.addEventListener)try{sw.addEventListener('controllerchange',controllerChanged);}catch(_){}
  if(o.facultyPreview!==true&&typeof o.subscribeWaiting==='function')
    try{unsubscribe=o.subscribeWaiting(refreshWaiting);}catch(_){}
  return {
    sync:sync,
    refreshWaiting:refreshWaiting,
    status:function(){return currentStatus;},
    destroy:function(){
      if(!active)return;
      active=false;stop();currentStatus=null;currentKey='';
      if(typeof unsubscribe==='function')try{unsubscribe();}catch(_){}
      if(sw&&sw.removeEventListener)try{sw.removeEventListener('controllerchange',controllerChanged);}catch(_){}
    }
  };
}

function fdOfflineStatus(input){
  var state=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  var response=fdOfflineResponse(fdOfflineOwn(state,'response')?state.response:null,
    fdOfflineOwn(state,'expected')?state.expected:null);
  var reason=fdOfflineOwn(state,'reason')?state.reason:null;
  if(fdOfflineOwn(state,'checking')&&state.checking===true)return {kind:'checking',label:'Checking',
    detail:'Checking this device’s current offline copy.',missing:[]};
  if(response&&response.ready){
    if(fdOfflineOwn(state,'waiting')&&state.waiting===true)return {kind:'update',label:'Update available',
      detail:'The current copy is ready on this device. A newer copy is available.',missing:[]};
    return {kind:'ready',label:'Ready',
      detail:'Verified current-route files are available from the current device cache.',missing:[]};
  }
  var detail='Could not verify every resource in this device’s current offline copy.';
  if(reason==='timeout')detail='The offline check timed out. Try again when the app responds.';
  else if(reason==='unsupported')detail='This browser does not support the offline check.';
  else if(reason==='uncontrolled')detail='This page is not controlled by an offline copy yet.';
  else if(reason==='invalid-request')detail='This route cannot be verified from the current resource list.';
  else if(reason==='post-failed')detail='The offline check could not reach this device’s cache.';
  else if(response&&response.missing.length)detail='Some current-route resources are missing from this device cache.';
  return {kind:'not-ready',label:'Not ready',detail:detail,
    missing:response?response.missing.slice():[]};
}

function fdOfflineEsc(value){
  return String(value===undefined||value===null?'':value).replace(/[&<>"']/g,function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function fdOfflineCount(urls,pattern){
  var count=0,list=Array.isArray(urls)?urls:[];
  for(var i=0;i<list.length;i++)if(fdOfflineOwn(list,i)&&pattern.test(list[i]))count++;
  return count;
}

function fdOfflineCard(state,routeLabel){
  var status=fdOfflineStatus(state),expected=state&&Array.isArray(state.expected)?state.expected:[];
  var response=state&&fdOfflineResponse(state.response,expected);
  var present=response?response.present:[],missing=response?response.missing:[];
  var reads=fdOfflineCount(present,/^\/content\//),tools=fdOfflineCount(present,/^\/tools\//);
  var out='<div class="fd-offline__inventory">'+
    '<p class="fd-offline__status" role="status">'+fdOfflineEsc(status.label)+'</p>'+
    '<p class="fd-offline__detail">'+fdOfflineEsc(status.detail)+'</p>'+
    '<p class="fd-offline__scope">Current route: '+fdOfflineEsc(routeLabel||'current learning route')+'</p>';
  if(response){
    out+='<p class="fd-offline__checked">Checked just now</p>'+
      '<p>'+present.length+' verified, '+missing.length+' missing of '+expected.length+' eligible files.</p>'+
      '<p>'+reads+' reading'+(reads===1?'':'s')+' and '+tools+' tool'+(tools===1?'':'s')+' present.</p>'+
      '<p>Shell and navigation: '+(present.indexOf('/')>=0?'present':'missing')+'. ' +
      'Search data: '+(present.indexOf('/search-index.json')>=0?'present':'missing')+'.</p>';
  }else{
    out+='<p>'+expected.length+' eligible files requested; none verified yet.</p>';
  }
  if(missing.length){
    out+='<p>Missing from this route:</p><ul>';
    for(var i=0;i<missing.length;i++)out+='<li>'+fdOfflineEsc(missing[i])+'</li>';
    out+='</ul>';
  }
  return out+'<p>Reading place and captured questions use device-only storage when saved; this cache check does not verify them.</p>'+
    '<p>Connection required: audio and video, live services including the Interview Room, external links, and actual email sending.</p>'+
    '</div>';
}

function fdOfflineEntry(state,routeLabel,open){
  var status=fdOfflineStatus(state),expanded=open===true;
  return '<section class="fd-offline is-'+status.kind+'" data-fd-offline-entry aria-label="Shift-ready check">'+
    '<button type="button" class="fd-offline__open" data-fd-offline-open aria-controls="fdOfflineDetails" aria-expanded="'+expanded+'">'+
      '<span>Shift-ready check</span><strong data-fd-offline-label role="status">'+fdOfflineEsc(status.label)+'</strong></button>'+
    '<div class="fd-offline__details" id="fdOfflineDetails"'+(expanded?'':' hidden')+'>'+
      '<div data-fd-offline-card>'+fdOfflineCard(state,routeLabel)+'</div>'+
      '<div class="fd-offline__actions">'+
        '<button type="button" class="fd-offline__refresh" data-fd-offline-refresh>Refresh offline copy</button>'+
        '<button type="button" class="fd-offline__close" data-fd-offline-close>Close details</button></div>'+
      '<p class="fd-offline__refresh-status" data-fd-offline-refresh-status role="status"></p>'+
    '</div></section>';
}

function fdOfflineRefreshMessage(online,verifiedOrSucceeded){
  if(online!==true)return verifiedOrSucceeded===true
    ?'Refresh needs a connection; your verified copy remains available.'
    :'Refresh needs a connection. This device has no verified current copy.';
  return verifiedOrSucceeded===true
    ?'Update check complete. If a newer copy is available, use the existing Refresh prompt when you are ready.'
    :'Could not check for a newer offline copy. Try again with a connection.';
}
