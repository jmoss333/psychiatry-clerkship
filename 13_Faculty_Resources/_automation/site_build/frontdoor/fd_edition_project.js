/* Pure rotation-edition Path projector. Protected core surfaces remain canonical references. */
function fdEditionProjectFinding(path,message){
  return {code:'EDITION_PROJECT',path:path,message:message,blocking:true};
}

function fdEditionProjectFailure(path,message){
  return {ok:false,errors:[fdEditionProjectFinding(path,message)]};
}

function fdEditionProjectObject(value){
  var isArray=false;
  if(value===null||typeof value!=='object') return false;
  try{ isArray=Array.isArray(value); }catch(ignoreArray){ return false; }
  return !isArray;
}

function fdEditionProjectData(value,key){
  var descriptor;
  if(!fdEditionProjectObject(value)) return {ok:false,value:null};
  try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
  catch(ignoreDescriptor){ descriptor=null; }
  if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return {ok:false,value:null};
  return {ok:true,value:descriptor.value};
}

function fdEditionProjectArrayEntry(value,index){
  var descriptor;
  try{ descriptor=Object.getOwnPropertyDescriptor(value,String(index)); }
  catch(ignoreDescriptor){ descriptor=null; }
  if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return {ok:false,value:null};
  return {ok:true,value:descriptor.value};
}

function fdEditionProjectClone(value,seen,depth){
  var out,keys,i,key,entry,lengthDescriptor,length,isArray=false,descriptor;
  if(value===null||typeof value==='string'||typeof value==='boolean') return {ok:true,value:value};
  if(typeof value==='number'&&isFinite(value)) return {ok:true,value:value};
  if(typeof value!=='object'||depth>32||seen.indexOf(value)!==-1) return {ok:false,value:null};
  seen.push(value);
  try{ isArray=Array.isArray(value); }catch(ignoreArray){ seen.pop(); return {ok:false,value:null}; }
  if(isArray){
    try{ lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length'); }
    catch(ignoreLength){ lengthDescriptor=null; }
    if(!lengthDescriptor||typeof lengthDescriptor.value!=='number'||lengthDescriptor.value<0||
       Math.floor(lengthDescriptor.value)!==lengthDescriptor.value){ seen.pop(); return {ok:false,value:null}; }
    length=lengthDescriptor.value; out=[];
    try{ keys=Reflect.ownKeys(value); }
    catch(ignoreArrayKeys){ seen.pop(); return {ok:false,value:null}; }
    for(i=0;i<keys.length;i++){
      key=keys[i];
      if(key==='length') continue;
      if(typeof key!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(key)||Number(key)>=length){
        seen.pop(); return {ok:false,value:null};
      }
    }
    for(i=0;i<length;i++){
      entry=fdEditionProjectArrayEntry(value,i);
      if(!entry.ok){ seen.pop(); return {ok:false,value:null}; }
      entry=fdEditionProjectClone(entry.value,seen,depth+1);
      if(!entry.ok){ seen.pop(); return entry; }
      out.push(entry.value);
    }
    seen.pop(); return {ok:true,value:out};
  }
  try{ keys=Reflect.ownKeys(value); }
  catch(ignoreKeys){ seen.pop(); return {ok:false,value:null}; }
  out={};
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(typeof key!=='string'||key==='__proto__'||key==='constructor'||key==='prototype'){
      seen.pop(); return {ok:false,value:null};
    }
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
    catch(ignoreObjectDescriptor){ descriptor=null; }
    if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')){
      seen.pop(); return {ok:false,value:null};
    }
    entry=fdEditionProjectClone(descriptor.value,seen,depth+1);
    if(!entry.ok){ seen.pop(); return entry; }
    out[key]=entry.value;
  }
  seen.pop(); return {ok:true,value:out};
}

function fdEditionProjectHasProtectedLocalFields(localOrientation){
  var groups=['checklist','resources'],groupDescriptor,list,i,entry,g;
  for(g=0;g<groups.length;g++){
    groupDescriptor=fdEditionProjectData(localOrientation,groups[g]);
    if(!groupDescriptor.ok||!Array.isArray(groupDescriptor.value)) return true;
    list=groupDescriptor.value;
    for(i=0;i<list.length;i++){
      entry=fdEditionProjectArrayEntry(list,i);
      if(!entry.ok||!fdEditionProjectObject(entry.value)||
         Object.prototype.hasOwnProperty.call(entry.value,'governance')||
         Object.prototype.hasOwnProperty.call(entry.value,'attested')) return true;
    }
  }
  return false;
}

function fdProjectEdition(canonicalIndex,validatedEdition){
  var byRefData,pathData,weeksData,columnsData,kitData,configData,envelopeData,fingerprintData,errorsData;
  var pathIdData,weekCountData,audienceData,configPathData,pathItemsData,cardData,numberData;
  var revisionData,changeData,orientationData,expected,i,j,weekData,nData,titleData,themeData,focusData;
  var itemData,instanceData,refData,itemWeekData,orderData,priorityData,rationaleData,coreData,cloned;
  var seenIds=Object.create(null),seenOrders=Object.create(null),perWeek=[],projectedWeeks=[],ordered,projected,envelopeClone;
  try{
    byRefData=fdEditionProjectData(canonicalIndex,'byRef');
    pathData=fdEditionProjectData(canonicalIndex,'path');
    weeksData=fdEditionProjectData(canonicalIndex,'weeks');
    columnsData=fdEditionProjectData(canonicalIndex,'columns');
    kitData=fdEditionProjectData(canonicalIndex,'kit');
    if(!byRefData.ok||!fdEditionProjectObject(byRefData.value)||!pathData.ok||
       !weeksData.ok||!Array.isArray(weeksData.value)||!columnsData.ok||!Array.isArray(columnsData.value)||
       !kitData.ok||!Array.isArray(kitData.value))
      return fdEditionProjectFailure('/index','The canonical catalog is not valid for edition projection.');
    pathIdData=fdEditionProjectData(pathData.value,'id');
    weekCountData=fdEditionProjectData(pathData.value,'weekCount');
    if(!pathIdData.ok||typeof pathIdData.value!=='string'||!weekCountData.ok||
       typeof weekCountData.value!=='number'||Math.floor(weekCountData.value)!==weekCountData.value||
       weeksData.value.length!==weekCountData.value)
      return fdEditionProjectFailure('/index/path','The canonical path is inconsistent.');

    if(!fdEditionProjectObject(validatedEdition))
      return fdEditionProjectFailure('/edition','A successful validated edition is required.');
    var okData=fdEditionProjectData(validatedEdition,'ok');
    configData=fdEditionProjectData(validatedEdition,'config');
    envelopeData=fdEditionProjectData(validatedEdition,'envelope');
    fingerprintData=fdEditionProjectData(validatedEdition,'fingerprint');
    errorsData=fdEditionProjectData(validatedEdition,'errors');
    if(!okData.ok||okData.value!==true||!configData.ok||!fdEditionProjectObject(configData.value)||
       !envelopeData.ok||!fdEditionProjectObject(envelopeData.value)||!fingerprintData.ok||
       typeof fingerprintData.value!=='string'||!errorsData.ok||!Array.isArray(errorsData.value)||
       errorsData.value.length!==0||
       !/^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/.test(fingerprintData.value))
      return fdEditionProjectFailure('/edition','A successful validated edition is required.');
    var formatData=fdEditionProjectData(envelopeData.value,'format');
    var schemaData=fdEditionProjectData(envelopeData.value,'schemaVersion');
    var envelopeConfigData=fdEditionProjectData(envelopeData.value,'config');
    var digestData=fdEditionProjectData(envelopeData.value,'digest');
    if(!formatData.ok||formatData.value!=='cw-rotation-edition'||!schemaData.ok||schemaData.value!==1||
       !envelopeConfigData.ok||envelopeConfigData.value!==configData.value||!digestData.ok||
       typeof digestData.value!=='string'||!/^sha256-[A-Za-z0-9_-]{43}$/.test(digestData.value))
      return fdEditionProjectFailure('/edition/envelope','The validated edition envelope is inconsistent.');

    audienceData=fdEditionProjectData(configData.value,'audience');
    configPathData=fdEditionProjectData(configData.value,'pathId');
    pathItemsData=fdEditionProjectData(configData.value,'pathItems');
    cardData=fdEditionProjectData(configData.value,'card');
    numberData=fdEditionProjectData(configData.value,'editionNumber');
    revisionData=fdEditionProjectData(configData.value,'createdAgainstCoreRevision');
    changeData=fdEditionProjectData(configData.value,'changeNote');
    orientationData=fdEditionProjectData(configData.value,'localOrientation');
    expected=audienceData.value==='ms3'?{id:'ms3-six-week',weeks:6,code:'MS3'}:
      (audienceData.value==='resident'?{id:'resident-four-week',weeks:4,code:'RES'}:null);
    if(!audienceData.ok||!expected||!configPathData.ok||configPathData.value!==expected.id||
       pathIdData.value!==expected.id||weekCountData.value!==expected.weeks||
       !pathItemsData.ok||!Array.isArray(pathItemsData.value)||!cardData.ok||
       !fdEditionProjectObject(cardData.value)||!numberData.ok||typeof numberData.value!=='number'||
       Math.floor(numberData.value)!==numberData.value||numberData.value<1||!revisionData.ok||
       typeof revisionData.value!=='string'||!/^[0-9a-f]{40}$/.test(revisionData.value)||
       !changeData.ok||typeof changeData.value!=='string'||!orientationData.ok||
       !fdEditionProjectObject(orientationData.value)||
       fingerprintData.value.indexOf('-'+expected.code+'-')===-1||
       fdEditionProjectHasProtectedLocalFields(orientationData.value))
      return fdEditionProjectFailure('/edition/config','The validated edition does not match the canonical path.');
    envelopeClone=fdEditionProjectClone(envelopeData.value,[],0);
    if(!envelopeClone.ok)
      return fdEditionProjectFailure('/edition/envelope','The validated edition contains unsafe nested data.');

    for(i=0;i<weeksData.value.length;i++){
      weekData=fdEditionProjectArrayEntry(weeksData.value,i);
      if(!weekData.ok||!fdEditionProjectObject(weekData.value))
        return fdEditionProjectFailure('/index/weeks','The canonical weeks are inconsistent.');
      nData=fdEditionProjectData(weekData.value,'n');
      titleData=fdEditionProjectData(weekData.value,'title');
      themeData=fdEditionProjectData(weekData.value,'theme');
      focusData=fdEditionProjectData(weekData.value,'focusCategories');
      if(!nData.ok||nData.value!==i+1||!titleData.ok||typeof titleData.value!=='string'||
         !themeData.ok||typeof themeData.value!=='string'||!focusData.ok||!Array.isArray(focusData.value))
        return fdEditionProjectFailure('/index/weeks','The canonical weeks are inconsistent.');
      cloned=fdEditionProjectClone(focusData.value,[],0);
      if(!cloned.ok) return fdEditionProjectFailure('/index/weeks','The canonical week metadata cannot be cloned safely.');
      projectedWeeks.push({n:nData.value,title:titleData.value,theme:themeData.value,
        focusCategories:cloned.value,items:[]});
      perWeek.push([]);
    }

    for(i=0;i<pathItemsData.value.length;i++){
      itemData=fdEditionProjectArrayEntry(pathItemsData.value,i);
      if(!itemData.ok||!fdEditionProjectObject(itemData.value))
        return fdEditionProjectFailure('/edition/config/pathItems','The edition path items are inconsistent.');
      instanceData=fdEditionProjectData(itemData.value,'instanceId');
      refData=fdEditionProjectData(itemData.value,'ref');
      itemWeekData=fdEditionProjectData(itemData.value,'week');
      orderData=fdEditionProjectData(itemData.value,'order');
      priorityData=fdEditionProjectData(itemData.value,'priority');
      rationaleData=fdEditionProjectData(itemData.value,'rationale');
      if(!instanceData.ok||typeof instanceData.value!=='string'||!instanceData.value||
         !refData.ok||typeof refData.value!=='string'||!refData.value||
         !itemWeekData.ok||typeof itemWeekData.value!=='number'||Math.floor(itemWeekData.value)!==itemWeekData.value||
         itemWeekData.value<1||itemWeekData.value>expected.weeks||!orderData.ok||
         typeof orderData.value!=='number'||Math.floor(orderData.value)!==orderData.value||orderData.value<1||
         !priorityData.ok||['required','recommended','optional'].indexOf(priorityData.value)===-1||
         !rationaleData.ok||typeof rationaleData.value!=='string'||seenIds[instanceData.value]||
         seenOrders[String(itemWeekData.value)+':'+String(orderData.value)])
        return fdEditionProjectFailure('/edition/config/pathItems','The edition path items are inconsistent.');
      seenIds[instanceData.value]=true;
      seenOrders[String(itemWeekData.value)+':'+String(orderData.value)]=true;
      try{ coreData=Object.getOwnPropertyDescriptor(byRefData.value,refData.value); }
      catch(ignoreCoreDescriptor){ coreData=null; }
      if(!coreData||!Object.prototype.hasOwnProperty.call(coreData,'value')||
         !fdEditionProjectObject(coreData.value))
        return fdEditionProjectFailure('/edition/config/pathItems','An edition core reference is unavailable.');
      var coreRefData=fdEditionProjectData(coreData.value,'ref');
      if(!coreRefData.ok||coreRefData.value!==refData.value)
        return fdEditionProjectFailure('/edition/config/pathItems','An edition core reference is inconsistent.');
      perWeek[itemWeekData.value-1].push({order:orderData.value,core:coreData.value,
        instanceId:instanceData.value,priority:priorityData.value,rationale:rationaleData.value});
    }

    for(i=0;i<perWeek.length;i++){
      ordered=perWeek[i].slice().sort(function(a,b){return a.order-b.order;});
      for(j=0;j<ordered.length;j++){
        if(ordered[j].order!==j+1)
          return fdEditionProjectFailure('/edition/config/pathItems','Edition order must be contiguous within each week.');
        cloned=fdEditionProjectClone(ordered[j].core,[],0);
        if(!cloned.ok) return fdEditionProjectFailure('/index/byRef','A canonical item cannot be cloned safely.');
        cloned.value.editionInstanceId=ordered[j].instanceId;
        cloned.value.editionPriority=ordered[j].priority;
        cloned.value.editionRationale=ordered[j].rationale;
        projectedWeeks[i].items.push(cloned.value);
      }
    }

    projected={
      byRef:byRefData.value,
      path:pathData.value,
      weeks:projectedWeeks,
      columns:columnsData.value,
      kit:kitData.value,
      edition:{
        envelope:envelopeClone.value,
        fingerprint:fingerprintData.value,
        card:envelopeClone.value.config.card,
        editionNumber:numberData.value,
        createdAgainstCoreRevision:revisionData.value,
        changeNote:changeData.value,
        localOrientation:envelopeClone.value.config.localOrientation
      }
    };
    return {ok:true,index:projected};
  }catch(ignoreProjection){
    return fdEditionProjectFailure('/','The edition could not be projected safely.');
  }
}

function fdEditionIndexFingerprint(index){
  var editionData,fingerprintData;
  try{
    editionData=fdEditionProjectData(index,'edition');
    if(!editionData.ok||!fdEditionProjectObject(editionData.value)) return '';
    fingerprintData=fdEditionProjectData(editionData.value,'fingerprint');
    return fingerprintData.ok&&typeof fingerprintData.value==='string'&&
      /^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/.test(fingerprintData.value)
      ?fingerprintData.value:'';
  }catch(ignoreFingerprint){ return ''; }
}

function fdEditionCoreProgressRef(projectedItem){
  var refData;
  try{
    refData=fdEditionProjectData(projectedItem,'ref');
    return refData.ok&&typeof refData.value==='string'?refData.value:'';
  }catch(ignoreRef){ return ''; }
}
