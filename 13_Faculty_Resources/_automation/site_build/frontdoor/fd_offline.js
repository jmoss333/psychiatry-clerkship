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
  return out;
}

function fdOfflineResponse(value,expected){
  var wanted={},found={},i,url,present,missing,ready;
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
  }
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
      detail:'Verified readings and tools are available from the current device cache.',missing:[]};
  }
  var detail='Could not verify every resource in this device’s current offline copy.';
  if(reason==='timeout')detail='The offline check timed out. Try again when the app responds.';
  else if(reason==='unsupported')detail='This browser does not support the offline check.';
  else if(reason==='uncontrolled')detail='This page is not controlled by an offline copy yet.';
  else if(response&&response.missing.length)detail='Some current-route resources are missing from this device cache.';
  return {kind:'not-ready',label:'Not ready',detail:detail,
    missing:response?response.missing.slice():[]};
}

function fdOfflineCard(state){
  var status=fdOfflineStatus(state);
  return '<section class="fd-offline is-'+status.kind+'" aria-label="Shift-ready check">'+
    '<p class="fd-offline__status" role="status">'+status.label+'</p>'+
    '<p>'+status.detail+'</p>'+
    '<p>Device-only saved state is separate from this offline check.</p>'+
    '<p>Connection required: audio, video, live services, external links, and email sending.</p>'+
    '</section>';
}
