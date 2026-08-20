/* Closed v2 rotation-edition trust boundary. No DOM, storage, clock, or network access. */
var FD_EDITION_RULES=(function(){
  var value={
    format:'cw-rotation-edition',schemaVersion:2,maxConfigBytes:12288,maxUrlChars:16000,maxQrChars:1800,
    maxPathItems:96,maxChecklist:24,maxResources:12,priorities:['required','recommended','optional'],
    changeKinds:['initial','edition-context','curriculum-selection','curriculum-priority','curriculum-reason','schedule','arrival','workflow','access','contacts','checklist','resources'],
    paths:{ms3:{id:'ms3-six-week',weeks:6,code:'MS3'},resident:{id:'resident-four-week',weeks:4,code:'RES'}}
  },key;
  function freeze(item){ var keys,i;if(item&&typeof item==='object'&&!Object.isFrozen(item)){keys=Object.keys(item);for(i=0;i<keys.length;i++)freeze(item[keys[i]]);Object.freeze(item);}return item; }
  for(key in value.paths) if(Object.prototype.hasOwnProperty.call(value.paths,key)) Object.freeze(value.paths[key]);
  return freeze(value);
}());

var FD_EDITION_KEY=/^[a-z0-9][a-z0-9._:-]{0,126}@v[1-9][0-9]{0,5}$/;
var FD_EDITION_DIGEST=/^sha256-[A-Za-z0-9_-]{43}$/;
var FD_EDITION_REVISION=/^[0-9a-f]{40}$/;
var FD_EDITION_ID=/^[\x21-\x7e]{1,160}$/;
var FD_EDITION_TIME=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
var FD_EDITION_LOCATION=/^[A-Z0-9]{2,8}$/;
var FD_EDITION_LOCAL_CATEGORIES=['arrival','schedule','rounds','presentation','documentation','attendance','feedback','accessItems','contacts','checklistItems','resources'];
var FD_EDITION_OWN=Object.prototype.hasOwnProperty;
var FD_EDITION_TRUST=typeof WeakMap==='function'?new WeakMap():null;
var FD_EDITION_CATALOG_RESOLVE=typeof fdEditionCatalogResolve==='function'?fdEditionCatalogResolve:null;

function fdEditionFinding(code,path,message){
  return {code:code,path:path,message:message,blocking:true};
}

function fdEditionFailure(code,path){
  return {ok:false,envelope:null,payload:null,config:null,resolved:null,displayModel:null,referenceSetDigest:'',contentDigest:'',fingerprint:'',canonicalBytes:0,errors:[fdEditionFinding(code||'EDITION_SCHEMA',path||'/','The rotation edition is invalid.')],warnings:[]};
}

function fdEditionIsPlainObject(value){
  var proto,isArray;
  if(!value||typeof value!=='object') return false;
  try{ isArray=Array.isArray(value);proto=Object.getPrototypeOf(value); }catch(ignoreShape){ return false; }
  return !isArray&&(proto===Object.prototype||proto===null);
}

function fdEditionPlainCopy(value,seen,depth){
  var proto,isArray,keys,lengthDescriptor,length,out,i,key,descriptor;
  if(value===null||typeof value==='string'||typeof value==='boolean') return value;
  if(typeof value==='number'){ if(!isFinite(value)||Math.floor(value)!==value) throw new Error('invalid'); return value; }
  if(!value||typeof value!=='object'||depth>64||seen.indexOf(value)>=0) throw new Error('invalid');
  seen.push(value);
  try{ isArray=Array.isArray(value);proto=Object.getPrototypeOf(value); }catch(ignorePrototype){ throw new Error('invalid'); }
  if(isArray){
    if(proto!==Array.prototype) throw new Error('invalid');
    try{ lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length');keys=Reflect.ownKeys(value); }catch(ignoreArray){ throw new Error('invalid'); }
    if(!lengthDescriptor||!FD_EDITION_OWN.call(lengthDescriptor,'value')||typeof lengthDescriptor.value!=='number'||Math.floor(lengthDescriptor.value)!==lengthDescriptor.value||lengthDescriptor.value<0||lengthDescriptor.value>4096||keys.length!==lengthDescriptor.value+1) throw new Error('invalid');
    length=lengthDescriptor.value;out=[];
    for(i=0;i<keys.length;i++){ key=keys[i];if(typeof key!=='string'||(key!=='length'&&(!/^(?:0|[1-9][0-9]*)$/.test(key)||Number(key)>=length))) throw new Error('invalid'); }
    for(i=0;i<length;i++){
      try{ descriptor=Object.getOwnPropertyDescriptor(value,String(i)); }catch(ignoreEntry){ descriptor=null; }
      if(!descriptor||!descriptor.enumerable||!FD_EDITION_OWN.call(descriptor,'value')) throw new Error('invalid');
      out.push(fdEditionPlainCopy(descriptor.value,seen,depth+1));
    }
  }else{
    if(proto!==Object.prototype&&proto!==null) throw new Error('invalid');
    try{ keys=Reflect.ownKeys(value); }catch(ignoreKeys){ throw new Error('invalid'); }
    if(keys.length>128) throw new Error('invalid');
    out={};
    for(i=0;i<keys.length;i++){
      key=keys[i];
      if(typeof key!=='string'||key==='__proto__'||key==='constructor'||key==='prototype') throw new Error('invalid');
      try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }catch(ignoreDescriptor){ descriptor=null; }
      if(!descriptor||!descriptor.enumerable||!FD_EDITION_OWN.call(descriptor,'value')) throw new Error('invalid');
      out[key]=fdEditionPlainCopy(descriptor.value,seen,depth+1);
    }
  }
  seen.pop();return out;
}

function fdEditionCopy(value){ return fdEditionPlainCopy(value,[],0); }

function fdEditionCanonicalJson(value){
  var copied=fdEditionCopy(value);
  function encode(current){
    var keys,out=[],i;
    if(current===null||typeof current==='string'||typeof current==='boolean'||typeof current==='number') return JSON.stringify(current);
    if(Array.isArray(current)){ for(i=0;i<current.length;i++) out.push(encode(current[i]));return '['+out.join(',')+']'; }
    keys=Object.keys(current).sort();
    for(i=0;i<keys.length;i++) out.push(JSON.stringify(keys[i])+':'+encode(current[keys[i]]));
    return '{'+out.join(',')+'}';
  }
  return encode(copied);
}

function fdEditionUtf8(text){
  var out=[],i=0,code,next;
  while(i<text.length){
    code=text.charCodeAt(i++);
    if(code>=0xd800&&code<=0xdbff){ if(i>=text.length) throw new Error('invalid');next=text.charCodeAt(i++);if(next<0xdc00||next>0xdfff) throw new Error('invalid');code=0x10000+((code-0xd800)<<10)+(next-0xdc00); }
    else if(code>=0xdc00&&code<=0xdfff) throw new Error('invalid');
    if(code<=0x7f) out.push(code);
    else if(code<=0x7ff) out.push(0xc0|(code>>6),0x80|(code&63));
    else if(code<=0xffff) out.push(0xe0|(code>>12),0x80|((code>>6)&63),0x80|(code&63));
    else out.push(0xf0|(code>>18),0x80|((code>>12)&63),0x80|((code>>6)&63),0x80|(code&63));
  }
  return new Uint8Array(out);
}

function fdEditionBase64urlEncode(bytes){
  var binary='',i;
  if(!bytes||typeof bytes.length!=='number') throw new Error('invalid');
  for(i=0;i<bytes.length;i++) binary+=String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function fdEditionBase64urlDecode(text,maxBytes){
  var padded,binary,out,i;
  if(typeof text!=='string'||!text||!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1) throw new Error('invalid');
  padded=text.replace(/-/g,'+').replace(/_/g,'/');while(padded.length%4) padded+='=';
  binary=atob(padded);if(typeof maxBytes==='number'&&binary.length>maxBytes) throw new Error('invalid');
  out=new Uint8Array(binary.length);for(i=0;i<binary.length;i++) out[i]=binary.charCodeAt(i);
  if(fdEditionBase64urlEncode(out)!==text) throw new Error('invalid');return out;
}

function fdEditionDigest(value,subtle){
  var method,request,bytes;
  try{ method=subtle&&subtle.digest;bytes=fdEditionUtf8(fdEditionCanonicalJson(value)); }catch(ignoreInput){ return Promise.reject(new Error('invalid')); }
  if(typeof method!=='function') return Promise.reject(new Error('invalid'));
  try{ request=method.call(subtle,'SHA-256',bytes); }catch(ignoreCall){ return Promise.reject(new Error('invalid')); }
  return Promise.resolve(request).then(function(buffer){
    var getter,length,view;
    try{ getter=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;length=getter.call(buffer);view=new Uint8Array(buffer); }catch(ignoreBuffer){ throw new Error('invalid'); }
    if(length!==32||view.byteLength!==32) throw new Error('invalid');
    return 'sha256-'+fdEditionBase64urlEncode(view);
  });
}

function fdEditionDigestEqual(left,right){
  var a,b,diff=0,i;
  try{ a=fdEditionBase64urlDecode(left.slice(7),32);b=fdEditionBase64urlDecode(right.slice(7),32); }catch(ignore){ return false; }
  if(!FD_EDITION_DIGEST.test(left)||!FD_EDITION_DIGEST.test(right)||a.length!==32||b.length!==32) return false;
  for(i=0;i<32;i++) diff|=a[i]^b[i];return diff===0;
}

function fdEditionFingerprint(locationCode,audience,contentDigest,referenceSetDigest,subtle){
  var token=audience==='ms3'?'MS3':audience==='resident'?'RES':'',alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  if(typeof locationCode!=='string'||!FD_EDITION_LOCATION.test(locationCode)||!token||typeof contentDigest!=='string'||!FD_EDITION_DIGEST.test(contentDigest)||typeof referenceSetDigest!=='string'||!FD_EDITION_DIGEST.test(referenceSetDigest)) return Promise.resolve('');
  return fdEditionDigest({contentDigest:contentDigest,referenceSetDigest:referenceSetDigest},subtle).then(function(result){
    var bytes,value,suffix='',i;
    try{ bytes=fdEditionBase64urlDecode(result.slice(7),32); }catch(ignoreBytes){ return ''; }
    value=Math.floor((bytes[0]*16777216+bytes[1]*65536+bytes[2]*256+bytes[3])/4);
    for(i=5;i>=0;i--) suffix+=alphabet.charAt(Math.floor(value/Math.pow(32,i))%32);
    return locationCode+'-'+token+'-'+suffix;
  },function(){ return ''; });
}

function fdEditionExact(value,required,optional){
  var allowed=Object.create(null),keys,i;
  if(!fdEditionIsPlainObject(value)) return false;
  for(i=0;i<required.length;i++) allowed[required[i]]=true;
  for(i=0;i<optional.length;i++) allowed[optional[i]]=true;
  keys=Object.keys(value);for(i=0;i<keys.length;i++) if(!allowed[keys[i]]) return false;
  for(i=0;i<required.length;i++) if(!FD_EDITION_OWN.call(value,required[i])) return false;
  return true;
}

function fdEditionOneOf(value,values){ return values.indexOf(value)>=0; }
function fdEditionInteger(value,min,max){ return typeof value==='number'&&Math.floor(value)===value&&value>=min&&value<=max; }

function fdEditionRealDate(value){
  var parts,year,month,day,leap,days;
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  parts=value.split('-');year=Number(parts[0]);month=Number(parts[1]);day=Number(parts[2]);
  leap=year%4===0&&(year%100!==0||year%400===0);days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return month>=1&&month<=12&&day>=1&&day<=days[month-1];
}

function fdEditionTimeMinutes(value){ return typeof value==='string'&&FD_EDITION_TIME.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null; }

function fdEditionCoreContext(index,config,siteContext){
  var path,weeks,byRef,i,item,descriptor,titles=Object.create(null),requested=Object.create(null),keys;
  function data(object,key){ var value;try{value=Object.getOwnPropertyDescriptor(object,key);}catch(ignore){return null;}return value&&value.enumerable&&FD_EDITION_OWN.call(value,'value')?value.value:null; }
  if(!fdEditionIsPlainObject(index)||!fdEditionIsPlainObject(siteContext)||siteContext.audience!==config.audience) return null;
  path=data(index,'path');weeks=data(index,'weeks');byRef=data(index,'byRef');
  if(!fdEditionIsPlainObject(path)||!Array.isArray(weeks)||!fdEditionIsPlainObject(byRef)) return null;
  if(data(path,'id')!==config.pathId||data(path,'weekCount')!==(config.audience==='ms3'?6:4)||weeks.length!==data(path,'weekCount')) return null;
  for(i=0;i<weeks.length;i++){ item=data(weeks,String(i));if(!fdEditionIsPlainObject(item)||data(item,'n')!==i+1) return null; }
  for(i=0;i<config.pathItems.length;i++) requested[config.pathItems[i].ref]=true;
  keys=Object.keys(requested);
  for(i=0;i<keys.length;i++){
    try{ descriptor=Object.getOwnPropertyDescriptor(byRef,keys[i]); }catch(ignoreRef){ descriptor=null; }
    if(!descriptor||!descriptor.enumerable||!FD_EDITION_OWN.call(descriptor,'value')||!fdEditionIsPlainObject(descriptor.value)||data(descriptor.value,'ref')!==keys[i]||typeof data(descriptor.value,'title')!=='string') return null;
    titles[keys[i]]=data(descriptor.value,'title');
  }
  return {titles:titles};
}

function fdEditionValidateLocalPlan(plan,maxWeek,ids){
  var keys,i,row,value,start,tuple,scheduleIds=Object.create(null),tuples=Object.create(null),seen=Object.create(null),count;
  function key(value){ return typeof value==='string'&&FD_EDITION_KEY.test(value); }
  function identifier(value){ return typeof value==='string'&&FD_EDITION_ID.test(value); }
  function uniqueId(value){ if(!identifier(value)||ids[value]) throw new Error('invalid');ids[value]=true; }
  function priority(value){ if(!fdEditionOneOf(value,FD_EDITION_RULES.priorities)) throw new Error('invalid'); }
  function list(value,min,max){ return Array.isArray(value)&&value.length>=min&&value.length<=max; }
  if(!fdEditionIsPlainObject(plan)) throw new Error('invalid');keys=Object.keys(plan);
  for(i=0;i<keys.length;i++) if(!fdEditionOneOf(keys[i],FD_EDITION_LOCAL_CATEGORIES)) throw new Error('invalid');
  if(FD_EDITION_OWN.call(plan,'arrival')){
    value=plan.arrival;if(!fdEditionExact(value,['timingCode','time','placeKey','checkInRoleKey'],['linkKey'])||!fdEditionOneOf(value.timingCode,['at','by'])||fdEditionTimeMinutes(value.time)===null||!key(value.placeKey)||!key(value.checkInRoleKey)||(FD_EDITION_OWN.call(value,'linkKey')&&!key(value.linkKey))) throw new Error('invalid');
  }
  if(FD_EDITION_OWN.call(plan,'schedule')){
    value=plan.schedule;if(!fdEditionExact(value,['dayStart','dayEnd','endQualifierCode','events'],[])||!fdEditionOneOf(value.endQualifierCode,['at','about','no-later-than'])||fdEditionTimeMinutes(value.dayStart)===null||fdEditionTimeMinutes(value.dayEnd)===null||fdEditionTimeMinutes(value.dayStart)>=fdEditionTimeMinutes(value.dayEnd)||!list(value.events,1,24)) throw new Error('invalid');
    for(i=0;i<value.events.length;i++){
      row=value.events[i];if(!fdEditionExact(row,['instanceId','daySetKey','startTime','activityKey','priority'],['endTime','placeKey'])) throw new Error('invalid');
      uniqueId(row.instanceId);scheduleIds[row.instanceId]=true;start=fdEditionTimeMinutes(row.startTime);
      if(start===null||(FD_EDITION_OWN.call(row,'endTime')&&(fdEditionTimeMinutes(row.endTime)===null||fdEditionTimeMinutes(row.endTime)<=start))||!key(row.daySetKey)||!key(row.activityKey)||(FD_EDITION_OWN.call(row,'placeKey')&&!key(row.placeKey))) throw new Error('invalid');
      priority(row.priority);tuple=[row.daySetKey,row.startTime,row.endTime||'',row.activityKey,row.placeKey||''].join('\u0000');if(tuples[tuple]) throw new Error('invalid');tuples[tuple]=true;
    }
  }
  if(FD_EDITION_OWN.call(plan,'rounds')){ value=plan.rounds;if(!fdEditionExact(value,['preparationKey','participationKey','followUpKey'],[])||!key(value.preparationKey)||!key(value.participationKey)||!key(value.followUpKey)) throw new Error('invalid'); }
  if(FD_EDITION_OWN.call(plan,'presentation')){
    value=plan.presentation;if(!fdEditionExact(value,['formatKey','timingKey','elementKeys'],[])||!key(value.formatKey)||!key(value.timingKey)||!list(value.elementKeys,1,8)) throw new Error('invalid');seen=Object.create(null);
    for(i=0;i<value.elementKeys.length;i++){ if(!key(value.elementKeys[i])||seen[value.elementKeys[i]]) throw new Error('invalid');seen[value.elementKeys[i]]=true; }
  }
  if(FD_EDITION_OWN.call(plan,'documentation')){ value=plan.documentation;if(!fdEditionExact(value,['workflowKey','timingKey'],['policyLinkKey'])||!key(value.workflowKey)||!key(value.timingKey)||(FD_EDITION_OWN.call(value,'policyLinkKey')&&!key(value.policyLinkKey))) throw new Error('invalid'); }
  if(FD_EDITION_OWN.call(plan,'attendance')){
    value=plan.attendance;if(!fdEditionExact(value,['eventInstanceIds','absenceRoleKey'],['policyLinkKey'])||!list(value.eventInstanceIds,1,24)||!key(value.absenceRoleKey)||(FD_EDITION_OWN.call(value,'policyLinkKey')&&!key(value.policyLinkKey))) throw new Error('invalid');seen=Object.create(null);
    for(i=0;i<value.eventInstanceIds.length;i++){ if(!identifier(value.eventInstanceIds[i])||seen[value.eventInstanceIds[i]]||!scheduleIds[value.eventInstanceIds[i]]) throw new Error('invalid');seen[value.eventInstanceIds[i]]=true; }
  }
  if(FD_EDITION_OWN.call(plan,'feedback')){ value=plan.feedback;if(!fdEditionExact(value,['cadenceKey','initiatorKey','settingKey'],[])||!key(value.cadenceKey)||!key(value.initiatorKey)||!key(value.settingKey)) throw new Error('invalid'); }
  function rows(category,min,max,required,optional,validate){
    var values=plan[category],j;if(!list(values,min,max)) throw new Error('invalid');
    for(j=0;j<values.length;j++){ row=values[j];if(!fdEditionExact(row,required,optional)) throw new Error('invalid');uniqueId(row.instanceId);validate(row); }
  }
  if(FD_EDITION_OWN.call(plan,'accessItems')) rows('accessItems',1,12,['instanceId','itemKey','dueKey'],['linkKey'],function(item){if(!key(item.itemKey)||!key(item.dueKey)||(FD_EDITION_OWN.call(item,'linkKey')&&!key(item.linkKey)))throw new Error('invalid');});
  if(FD_EDITION_OWN.call(plan,'contacts')) rows('contacts',1,8,['instanceId','roleKey'],['linkKey'],function(item){if(!key(item.roleKey)||(FD_EDITION_OWN.call(item,'linkKey')&&!key(item.linkKey)))throw new Error('invalid');});
  if(FD_EDITION_OWN.call(plan,'checklistItems')) rows('checklistItems',1,24,['instanceId','itemKey','priority'],[],function(item){if(!key(item.itemKey))throw new Error('invalid');priority(item.priority);});
  if(FD_EDITION_OWN.call(plan,'resources')) rows('resources',1,12,['instanceId','linkKey','priority','week'],['reasonKey'],function(item){if(!key(item.linkKey)||(FD_EDITION_OWN.call(item,'reasonKey')&&!key(item.reasonKey))||!fdEditionInteger(item.week,1,maxWeek))throw new Error('invalid');priority(item.priority);});
  count=(FD_EDITION_OWN.call(plan,'arrival')?1:0)+(plan.accessItems?plan.accessItems.length:0)+(plan.checklistItems?plan.checklistItems.length:0);if(count>24) throw new Error('invalid');
}

function fdEditionValidateConfigShape(config,coreIndex,siteContext,validationContext){
  var path,maxWeek,ids=Object.create(null),orders=Object.create(null),counts=Object.create(null),lastWeek=0,lastOrder=0,i,item,key,codeIndex=-1,currentIndex,core,bytes;
  if(!fdEditionExact(config,['audience','pathId','editionNumber','createdAgainstCoreRevision','createdAgainstLocalCatalogRevision','context','phraseSetKey','pathItems','localPlan','changeSummary'],[])) throw new Error('invalid');
  path=FD_EDITION_RULES.paths[config.audience];if(!path||config.pathId!==path.id) throw new Error('invalid');maxWeek=path.weeks;
  if(!fdEditionInteger(config.editionNumber,1,2147483647)||typeof config.createdAgainstCoreRevision!=='string'||!FD_EDITION_REVISION.test(config.createdAgainstCoreRevision)||typeof config.createdAgainstLocalCatalogRevision!=='string'||!FD_EDITION_DIGEST.test(config.createdAgainstLocalCatalogRevision)||typeof config.phraseSetKey!=='string'||!FD_EDITION_KEY.test(config.phraseSetKey)) throw new Error('invalid');
  if(!fdEditionExact(config.context,['trainingLocationKey','curatorProfileKey','rotationStart','rotationEnd','editionCheckedOn'],[])||!FD_EDITION_KEY.test(config.context.trainingLocationKey)||!FD_EDITION_KEY.test(config.context.curatorProfileKey)||!fdEditionRealDate(config.context.rotationStart)||!fdEditionRealDate(config.context.rotationEnd)||config.context.rotationEnd<config.context.rotationStart||!fdEditionRealDate(config.context.editionCheckedOn)) throw new Error('invalid');
  if(!fdEditionExact(validationContext,['mode','generationDate'],[])||(validationContext.mode!=='builder'&&validationContext.mode!=='learner')||(validationContext.mode==='builder'&&(!fdEditionRealDate(validationContext.generationDate)||config.context.editionCheckedOn>validationContext.generationDate))||(validationContext.mode==='learner'&&validationContext.generationDate!=='')) throw new Error('invalid');
  if(!Array.isArray(config.pathItems)||config.pathItems.length<1||config.pathItems.length>96) throw new Error('invalid');
  for(i=0;i<config.pathItems.length;i++){
    item=config.pathItems[i];if(!fdEditionExact(item,['instanceId','ref','week','order','priority'],['reasonKey'])||typeof item.instanceId!=='string'||!FD_EDITION_ID.test(item.instanceId)||typeof item.ref!=='string'||!FD_EDITION_ID.test(item.ref)||FD_EDITION_KEY.test(item.ref)||ids[item.instanceId]||!fdEditionInteger(item.week,1,maxWeek)||!fdEditionInteger(item.order,1,96)||!fdEditionOneOf(item.priority,FD_EDITION_RULES.priorities)||(FD_EDITION_OWN.call(item,'reasonKey')&&!FD_EDITION_KEY.test(item.reasonKey))) throw new Error('invalid');
    ids[item.instanceId]=true;if(item.week<lastWeek||(item.week===lastWeek&&item.order<=lastOrder)) throw new Error('invalid');lastWeek=item.week;lastOrder=item.order;key=String(item.week);if(!orders[key])orders[key]=Object.create(null);if(orders[key][item.order])throw new Error('invalid');orders[key][item.order]=true;counts[key]=(counts[key]||0)+1;
  }
  Object.keys(counts).forEach(function(week){ var order;for(order=1;order<=counts[week];order++)if(!orders[week][order])throw new Error('invalid'); });
  fdEditionValidateLocalPlan(config.localPlan,maxWeek,ids);
  if(!fdEditionExact(config.changeSummary,['kindCodes','changedItemCount'],[])||!Array.isArray(config.changeSummary.kindCodes)||config.changeSummary.kindCodes.length<1||config.changeSummary.kindCodes.length>12||!fdEditionInteger(config.changeSummary.changedItemCount,0,255)) throw new Error('invalid');
  for(i=0;i<config.changeSummary.kindCodes.length;i++){ currentIndex=FD_EDITION_RULES.changeKinds.indexOf(config.changeSummary.kindCodes[i]);if(currentIndex<0||currentIndex<=codeIndex)throw new Error('invalid');codeIndex=currentIndex; }
  if(config.editionNumber===1){if(config.changeSummary.kindCodes.length!==1||config.changeSummary.kindCodes[0]!=='initial'||config.changeSummary.changedItemCount!==0)throw new Error('invalid');}
  else if(config.changeSummary.kindCodes[0]==='initial'||config.changeSummary.changedItemCount<1) throw new Error('invalid');
  bytes=fdEditionUtf8(fdEditionCanonicalJson(config)).length;if(bytes>FD_EDITION_RULES.maxConfigBytes) throw new Error('size');
  core=fdEditionCoreContext(coreIndex,config,siteContext);if(!core) throw new Error('core');return {config:config,core:core,canonicalBytes:bytes};
}

function fdEditionResolvedDisplay(config,core,catalogResult){
  var model=fdEditionCopy(catalogResult.displayModel),i,item,resolved;
  if(!fdEditionIsPlainObject(model)||!fdEditionIsPlainObject(model.card)||!Array.isArray(model.pathItems)||model.pathItems.length!==config.pathItems.length) throw new Error('invalid');
  for(i=0;i<config.pathItems.length;i++){
    item=config.pathItems[i];resolved=model.pathItems[i];
    if(!fdEditionExact(resolved,['instanceId','ref','week','order','priority','priorityLabel'],FD_EDITION_OWN.call(item,'reasonKey')?['reasonText']:[])||resolved.instanceId!==item.instanceId||resolved.ref!==item.ref||resolved.week!==item.week||resolved.order!==item.order||resolved.priority!==item.priority||typeof resolved.priorityLabel!=='string'||(FD_EDITION_OWN.call(item,'reasonKey')&&typeof resolved.reasonText!=='string')) throw new Error('invalid');
    resolved.title=core.titles[item.ref];
  }
  return model;
}

function fdEditionValidateConfig(config,coreIndex,catalogSnapshot,siteContext,validationContext,subtle){
  var value,validation,context,site;
  try{ value=fdEditionCopy(config);context=fdEditionCopy(validationContext);site=fdEditionCopy(siteContext);validation=fdEditionValidateConfigShape(value,coreIndex,site,context); }
  catch(error){ return Promise.resolve(fdEditionFailure(error&&error.message==='size'?'EDITION_SIZE':error&&error.message==='core'?'EDITION_REF':'EDITION_SCHEMA','/config')); }
  if(!FD_EDITION_CATALOG_RESOLVE) return Promise.resolve(fdEditionFailure('EDITION_CATALOG','/config'));
  return Promise.resolve(FD_EDITION_CATALOG_RESOLVE(value,catalogSnapshot,context.mode,site,subtle)).then(function(result){
    var copied,model;
    try{
      copied=fdEditionCopy(result);
      if(!fdEditionExact(copied,['ok','resolved','referenceSetDigest','displayModel','errors'],[])||copied.ok!==true||!fdEditionIsPlainObject(copied.resolved)||typeof copied.referenceSetDigest!=='string'||!FD_EDITION_DIGEST.test(copied.referenceSetDigest)||!Array.isArray(copied.errors)||copied.errors.length!==0) throw new Error('invalid');
      model=fdEditionResolvedDisplay(value,validation.core,copied);
      return {ok:true,envelope:null,payload:null,config:value,resolved:copied.resolved,displayModel:model,referenceSetDigest:copied.referenceSetDigest,contentDigest:'',fingerprint:'',canonicalBytes:validation.canonicalBytes,errors:[],warnings:[]};
    }catch(ignoreResult){ return fdEditionFailure('EDITION_CATALOG','/config'); }
  },function(){ return fdEditionFailure('EDITION_CATALOG','/config'); });
}

function fdEditionBrand(result){
  var snapshot;
  if(!FD_EDITION_TRUST||!result||result.ok!==true) return result;
  try{
    snapshot={envelope:result.envelope,config:result.config,resolved:result.resolved,displayModel:result.displayModel,referenceSetDigest:result.referenceSetDigest,fingerprint:result.fingerprint};
    FD_EDITION_TRUST.set(result,fdEditionCanonicalJson(snapshot));
  }catch(ignoreBrand){}
  return result;
}

function fdEditionFinish(checked,envelope,contentDigest,subtle){
  var location;
  try{ location=checked.resolved.location.locationCode;if(typeof location!=='string'||!FD_EDITION_LOCATION.test(location)) throw new Error('invalid'); }
  catch(ignoreLocation){ return Promise.resolve(fdEditionFailure('EDITION_CATALOG','/config/context/trainingLocationKey')); }
  return fdEditionFingerprint(location,checked.config.audience,contentDigest,checked.referenceSetDigest,subtle).then(function(fingerprint){
    var model,result,payload;
    if(!fingerprint) return fdEditionFailure('EDITION_DIGEST','/digest');
    try{ model=fdEditionCopy(checked.displayModel);model.card.fingerprint=fingerprint;payload=fdEditionBase64urlEncode(fdEditionUtf8(fdEditionCanonicalJson(envelope))); }
    catch(ignoreModel){ return fdEditionFailure('EDITION_SCHEMA','/'); }
    result={ok:true,envelope:envelope,payload:payload,config:envelope.config,resolved:checked.resolved,displayModel:model,referenceSetDigest:checked.referenceSetDigest,contentDigest:contentDigest,fingerprint:fingerprint,canonicalBytes:checked.canonicalBytes,errors:[],warnings:[]};
    return fdEditionBrand(result);
  });
}

function fdEditionCreateEnvelope(config,coreIndex,catalogSnapshot,siteContext,validationContext,subtle){
  return fdEditionValidateConfig(config,coreIndex,catalogSnapshot,siteContext,validationContext,subtle).then(function(checked){
    var pre;if(!checked.ok)return checked;pre={format:FD_EDITION_RULES.format,schemaVersion:2,config:checked.config};
    return fdEditionDigest(pre,subtle).then(function(contentDigest){ return fdEditionFinish(checked,{format:pre.format,schemaVersion:pre.schemaVersion,config:pre.config,digest:contentDigest},contentDigest,subtle); },function(){ return fdEditionFailure('EDITION_DIGEST','/digest'); });
  });
}

function fdEditionValidateEnvelope(envelope,coreIndex,catalogSnapshot,siteContext,validationContext,subtle){
  var value;
  try{ value=fdEditionCopy(envelope);if(!fdEditionExact(value,['format','schemaVersion','config','digest'],[])||value.format!==FD_EDITION_RULES.format||value.schemaVersion!==2||typeof value.digest!=='string'||!FD_EDITION_DIGEST.test(value.digest)) throw new Error('invalid'); }
  catch(ignoreEnvelope){ return Promise.resolve(fdEditionFailure('EDITION_SCHEMA','/')); }
  return fdEditionValidateConfig(value.config,coreIndex,catalogSnapshot,siteContext,validationContext,subtle).then(function(checked){
    if(!checked.ok)return checked;
    return fdEditionDigest({format:value.format,schemaVersion:value.schemaVersion,config:checked.config},subtle).then(function(actual){
      var normalized;if(!fdEditionDigestEqual(value.digest,actual))return fdEditionFailure('EDITION_DIGEST','/digest');
      normalized={format:value.format,schemaVersion:value.schemaVersion,config:checked.config,digest:value.digest};return fdEditionFinish(checked,normalized,value.digest,subtle);
    },function(){ return fdEditionFailure('EDITION_DIGEST','/digest'); });
  });
}

function fdEditionDecodePayload(payload,coreIndex,catalogSnapshot,siteContext,validationContext,subtle,totalUrlLength){
  var bytes,text,envelope;
  if(!fdEditionInteger(totalUrlLength,0,FD_EDITION_RULES.maxUrlChars)||typeof payload!=='string'||payload.length>totalUrlLength||payload.length>FD_EDITION_RULES.maxUrlChars) return Promise.resolve(fdEditionFailure('EDITION_URL','/'));
  try{ bytes=fdEditionBase64urlDecode(payload,FD_EDITION_RULES.maxUrlChars);text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);envelope=JSON.parse(text); }
  catch(ignorePayload){ return Promise.resolve(fdEditionFailure('EDITION_SCHEMA','/')); }
  return fdEditionValidateEnvelope(envelope,coreIndex,catalogSnapshot,siteContext,validationContext,subtle);
}

function fdEditionDeepFreeze(value){ var keys,i;if(value&&typeof value==='object'&&!Object.isFrozen(value)){keys=Object.keys(value);for(i=0;i<keys.length;i++)fdEditionDeepFreeze(value[keys[i]]);Object.freeze(value);}return value; }

function fdEditionTrustedSnapshot(result){
  var canonical,snapshot;
  if(!FD_EDITION_TRUST||!result||(typeof result!=='object'&&typeof result!=='function')) return null;
  try{ canonical=FD_EDITION_TRUST.get(result);if(!canonical)return null;snapshot=JSON.parse(canonical);return fdEditionDeepFreeze(snapshot); }
  catch(ignoreTrust){ return null; }
}

function fdEditionSemanticConfig(config){
  var value;
  try{ value=fdEditionCopy(config);delete value.editionNumber;delete value.changeSummary;delete value.createdAgainstCoreRevision;delete value.createdAgainstLocalCatalogRevision;return fdEditionCanonicalJson(value); }
  catch(ignoreConfig){ return ''; }
}

function fdEditionGenerateChangeSummary(baseConfig,currentConfig){
  var base,current,kinds=Object.create(null),count=0;
  function same(left,right){ if(typeof left==='undefined'&&typeof right==='undefined')return true;try{return fdEditionCanonicalJson(left)===fdEditionCanonicalJson(right);}catch(ignore){return false;} }
  function add(kind,amount){ kinds[kind]=true;count=Math.min(255,count+(amount||1)); }
  function field(left,right,kind){ if(!same(left,right))add(kind,1); }
  function rows(left,right,kind){
    var a=Object.create(null),b=Object.create(null),keys=Object.create(null),i,total=0,list;
    left=left||[];right=right||[];for(i=0;i<left.length;i++){a[left[i].instanceId]=left[i];keys[left[i].instanceId]=true;}for(i=0;i<right.length;i++){b[right[i].instanceId]=right[i];keys[right[i].instanceId]=true;}
    list=Object.keys(keys);for(i=0;i<list.length;i++)if(!a[list[i]]||!b[list[i]]||!same(a[list[i]],b[list[i]]))total+=1;if(total)add(kind,total);
  }
  if(baseConfig===null||typeof baseConfig==='undefined') return {kindCodes:['initial'],changedItemCount:0};
  try{ base=fdEditionCopy(baseConfig);current=fdEditionCopy(currentConfig); }catch(ignoreCopy){ return null; }
  ['audience','pathId','phraseSetKey'].forEach(function(key){field(base[key],current[key],'edition-context');});
  ['trainingLocationKey','curatorProfileKey','rotationStart','rotationEnd','editionCheckedOn'].forEach(function(key){field(base.context[key],current.context[key],'edition-context');});
  (function(){
    var a=Object.create(null),b=Object.create(null),keys=Object.create(null),i,id,left,right,list;
    for(i=0;i<base.pathItems.length;i++){a[base.pathItems[i].instanceId]=base.pathItems[i];keys[base.pathItems[i].instanceId]=true;}
    for(i=0;i<current.pathItems.length;i++){b[current.pathItems[i].instanceId]=current.pathItems[i];keys[current.pathItems[i].instanceId]=true;}
    list=Object.keys(keys);
    for(i=0;i<list.length;i++){ id=list[i];left=a[id];right=b[id];if(!left||!right){add('curriculum-selection',1);continue;}var changed=false;if(left.ref!==right.ref){kinds['curriculum-selection']=true;changed=true;}if(left.priority!==right.priority){kinds['curriculum-priority']=true;changed=true;}if((left.reasonKey||'')!==(right.reasonKey||'')){kinds['curriculum-reason']=true;changed=true;}if(left.week!==right.week||left.order!==right.order){kinds.schedule=true;changed=true;}if(changed)count=Math.min(255,count+1); }
  }());
  field(base.localPlan.arrival,current.localPlan.arrival,'arrival');
  (function(){ var left=base.localPlan.schedule,right=current.localPlan.schedule;if(!left&&!right)return;left=left||{};right=right||{};if(!same([left.dayStart||null,left.dayEnd||null,left.endQualifierCode||null],[right.dayStart||null,right.dayEnd||null,right.endQualifierCode||null]))add('schedule',1);rows(left.events,right.events,'schedule'); }());
  ['rounds','presentation','documentation','attendance','feedback'].forEach(function(key){field(base.localPlan[key],current.localPlan[key],'workflow');});
  rows(base.localPlan.accessItems,current.localPlan.accessItems,'access');rows(base.localPlan.contacts,current.localPlan.contacts,'contacts');rows(base.localPlan.checklistItems,current.localPlan.checklistItems,'checklist');rows(base.localPlan.resources,current.localPlan.resources,'resources');
  return {kindCodes:FD_EDITION_RULES.changeKinds.filter(function(kind){return kind!=='initial'&&kinds[kind];}),changedItemCount:count};
}

function fdEditionStorageKeys(audience){
  if(audience==='ms3') return {edition:'cw_rotation_edition_ms3_v2',local:'cw_rotation_local_progress_ms3_v2',curator:'cw_curator_draft_ms3_v2'};
  if(audience==='resident') return {edition:'rp_rotation_edition_resident_v2',local:'rp_rotation_local_progress_resident_v2',curator:'rp_curator_draft_resident_v2'};
  return null;
}

function fdEditionDiagnostic(result,siteContext){
  var trusted=fdEditionTrustedSnapshot(result),code='EDITION_SCHEMA',revision='',version=null;
  try{if(result&&Array.isArray(result.errors)&&result.errors.length&&typeof result.errors[0].code==='string')code=result.errors[0].code;else if(trusted)code='EDITION_OK';if(result&&result.envelope&&result.envelope.schemaVersion===2)version=2;if(siteContext&&typeof siteContext.coreRevision==='string'&&FD_EDITION_REVISION.test(siteContext.coreRevision))revision=siteContext.coreRevision;}catch(ignore){}
  return {code:code,schemaVersion:version,fingerprint:trusted?trusted.fingerprint:'',currentCoreRevision:revision};
}
