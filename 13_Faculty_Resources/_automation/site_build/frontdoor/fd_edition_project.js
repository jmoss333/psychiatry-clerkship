/* Trusted v2 rotation-edition projector. Protected core graphs are cloned byte-for-byte. */
function fdEditionProjectFinding(path){
  return {code:'EDITION_PROJECT',path:path,message:'The rotation edition cannot be projected.',blocking:true};
}

function fdEditionProjectFailure(path){ return {ok:false,errors:[fdEditionProjectFinding(path||'/')]}; }

function fdEditionProjectObject(value){
  var proto,isArray;
  if(!value||typeof value!=='object') return false;
  try{ isArray=Array.isArray(value);proto=Object.getPrototypeOf(value); }catch(ignore){ return false; }
  return !isArray&&(proto===Object.prototype||proto===null);
}

function fdEditionProjectClone(value,seen,depth){
  var proto,isArray,keys,lengthDescriptor,length,out,i,key,descriptor;
  if(value===null||typeof value==='string'||typeof value==='boolean') return value;
  if(typeof value==='number'){ if(!isFinite(value)) throw new Error('invalid');return value; }
  if(!value||typeof value!=='object'||depth>64||seen.indexOf(value)>=0) throw new Error('invalid');
  seen.push(value);
  try{ isArray=Array.isArray(value);proto=Object.getPrototypeOf(value); }catch(ignoreShape){ throw new Error('invalid'); }
  if(isArray){
    if(proto!==Array.prototype) throw new Error('invalid');
    try{ lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length');keys=Reflect.ownKeys(value); }catch(ignoreArray){ throw new Error('invalid'); }
    if(!lengthDescriptor||!Object.prototype.hasOwnProperty.call(lengthDescriptor,'value')||typeof lengthDescriptor.value!=='number'||Math.floor(lengthDescriptor.value)!==lengthDescriptor.value||lengthDescriptor.value<0||keys.length!==lengthDescriptor.value+1) throw new Error('invalid');
    length=lengthDescriptor.value;out=[];
    for(i=0;i<keys.length;i++){ key=keys[i];if(typeof key!=='string'||(key!=='length'&&(!/^(?:0|[1-9][0-9]*)$/.test(key)||Number(key)>=length))) throw new Error('invalid'); }
    for(i=0;i<length;i++){
      try{ descriptor=Object.getOwnPropertyDescriptor(value,String(i)); }catch(ignoreEntry){ descriptor=null; }
      if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')) throw new Error('invalid');
      out.push(fdEditionProjectClone(descriptor.value,seen,depth+1));
    }
  }else{
    if(proto!==Object.prototype&&proto!==null) throw new Error('invalid');
    try{ keys=Reflect.ownKeys(value); }catch(ignoreKeys){ throw new Error('invalid'); }
    out={};
    for(i=0;i<keys.length;i++){
      key=keys[i];if(typeof key!=='string'||key==='__proto__'||key==='constructor'||key==='prototype') throw new Error('invalid');
      try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }catch(ignoreDescriptor){ descriptor=null; }
      if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')) throw new Error('invalid');
      out[key]=fdEditionProjectClone(descriptor.value,seen,depth+1);
    }
  }
  seen.pop();return out;
}

function fdEditionProjectCopy(value){ return fdEditionProjectClone(value,[],0); }

function fdProjectEdition(coreIndex,trustedValidatedEdition){
  var trusted,index,config,display,pathRule,seenIds=Object.create(null),orders=Object.create(null),i,item,displayItem,core,placement,weekItems;
  try{
    if(typeof fdEditionTrustedSnapshot!=='function') throw new Error('trust');
    trusted=fdEditionTrustedSnapshot(trustedValidatedEdition);if(!trusted) throw new Error('trust');
    if(!fdEditionProjectObject(trusted)||!fdEditionProjectObject(trusted.envelope)||trusted.envelope.schemaVersion!==2||!fdEditionProjectObject(trusted.config)||!fdEditionProjectObject(trusted.envelope.config)||typeof fdEditionCanonicalJson!=='function'||fdEditionCanonicalJson(trusted.envelope.config)!==fdEditionCanonicalJson(trusted.config)) throw new Error('trust');
    config=trusted.config;display=trusted.displayModel;
    if(!fdEditionProjectObject(display)||!fdEditionProjectObject(display.card)||display.card.fingerprint!==trusted.fingerprint||!Array.isArray(display.pathItems)||display.pathItems.length!==config.pathItems.length) throw new Error('trust');
    index=fdEditionProjectCopy(coreIndex);
    pathRule=config.audience==='ms3'?{id:'ms3-six-week',weeks:6}:config.audience==='resident'?{id:'resident-four-week',weeks:4}:null;
    if(!pathRule||!fdEditionProjectObject(index.path)||index.path.id!==pathRule.id||index.path.weekCount!==pathRule.weeks||!Array.isArray(index.weeks)||index.weeks.length!==pathRule.weeks||!fdEditionProjectObject(index.byRef)||config.pathId!==pathRule.id) throw new Error('core');
    for(i=0;i<index.weeks.length;i++){ if(!fdEditionProjectObject(index.weeks[i])||index.weeks[i].n!==i+1)throw new Error('core');index.weeks[i].items=[]; }
    for(i=0;i<config.pathItems.length;i++){
      item=config.pathItems[i];displayItem=display.pathItems[i];
      if(!fdEditionProjectObject(item)||!fdEditionProjectObject(displayItem)||typeof item.instanceId!=='string'||seenIds[item.instanceId]||typeof item.ref!=='string'||!fdEditionProjectObject(index.byRef[item.ref])||index.byRef[item.ref].ref!==item.ref||!Number.isInteger(item.week)||item.week<1||item.week>pathRule.weeks||!Number.isInteger(item.order)||item.order<1||!['required','recommended','optional'].includes(item.priority)||displayItem.instanceId!==item.instanceId||displayItem.ref!==item.ref||displayItem.week!==item.week||displayItem.order!==item.order||displayItem.priority!==item.priority||displayItem.title!==index.byRef[item.ref].title) throw new Error('edition');
      seenIds[item.instanceId]=true;weekItems=orders[item.week]||(orders[item.week]=Object.create(null));if(weekItems[item.order])throw new Error('edition');weekItems[item.order]=true;
      core=fdEditionProjectCopy(index.byRef[item.ref]);placement=core;placement.instanceId=item.instanceId;placement.priority=item.priority;
      if(Object.prototype.hasOwnProperty.call(displayItem,'reasonText')){ if(typeof displayItem.reasonText!=='string')throw new Error('edition');placement.reasonText=displayItem.reasonText; }
      index.weeks[item.week-1].items.push({order:item.order,value:placement});
    }
    for(i=0;i<index.weeks.length;i++){
      index.weeks[i].items.sort(function(left,right){return left.order-right.order;});
      index.weeks[i].items.forEach(function(entry,offset){if(entry.order!==offset+1)throw new Error('edition');});
      index.weeks[i].items=index.weeks[i].items.map(function(entry){return entry.value;});
    }
    index.edition=trusted.displayModel;
    return {ok:true,index:index};
  }catch(ignoreProjection){ return fdEditionProjectFailure('/'); }
}

function fdEditionIndexFingerprint(index){
  try{ return fdEditionProjectObject(index)&&fdEditionProjectObject(index.edition)&&fdEditionProjectObject(index.edition.card)&&typeof index.edition.card.fingerprint==='string'&&/^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/.test(index.edition.card.fingerprint)?index.edition.card.fingerprint:''; }
  catch(ignore){ return ''; }
}

function fdEditionCoreProgressRef(projectedItem){
  try{ return fdEditionProjectObject(projectedItem)&&typeof projectedItem.ref==='string'?projectedItem.ref:''; }
  catch(ignore){ return ''; }
}
