/* Curator-only parser for intentionally bounded v1 backup salvage. */
var fdEditionV1ValidateForSalvage;
var fdEditionV1Salvage;
(function(){
  'use strict';
  var own=Object.prototype.hasOwnProperty;
  var trusted=new WeakMap();
  var MAX_BYTES=65536,MAX_ARRAY=12288;
  var priorities=['required','recommended','optional'];
  var contextFields=['trainingLocationKey','curatorProfileKey','rotationStart','rotationEnd','editionCheckedOn'];
  var affirmationFields=['publicSafe','officialLinks','previewsReviewed','forwardable'];
  var orientationFields=['firstDayArrival','dailySchedule','roundsWorkflow','presentationExpectations','documentationExpectations','attendanceExpectations','feedbackProcess','accessPreparation'];

  function failure(code){return {ok:false,code:code};}
  function salvageFailure(){return {ok:false,code:'V1_SALVAGE_INVALID',draft:null,droppedReferenceCount:0};}
  function exact(value,required){
    var keys,i,key,descriptor,allowed=Object.create(null);
    if(value===null||typeof value!=='object'||Array.isArray(value))return false;
    for(i=0;i<required.length;i++)allowed[required[i]]=true;
    try{keys=Reflect.ownKeys(value);}catch(ignoreKeys){return false;}
    if(keys.length!==required.length)return false;
    for(i=0;i<keys.length;i++){
      key=keys[i];if(typeof key!=='string'||!allowed[key])return false;
      try{descriptor=Object.getOwnPropertyDescriptor(value,key);}catch(ignoreDescriptor){return false;}
      if(!descriptor||!descriptor.enumerable||!own.call(descriptor,'value'))return false;
    }
    return true;
  }
  function array(value,max){
    var descriptor,keys,i,key;
    if(!Array.isArray(value))return false;
    try{descriptor=Object.getOwnPropertyDescriptor(value,'length');}catch(ignoreLength){return false;}
    if(!descriptor||!own.call(descriptor,'value')||!Number.isInteger(descriptor.value)||descriptor.value<0||descriptor.value>max)return false;
    try{keys=Reflect.ownKeys(value);}catch(ignoreKeys){return false;}
    if(keys.length!==descriptor.value+1)return false;
    for(i=0;i<descriptor.value;i++){
      key=String(i);if(keys.indexOf(key)<0)return false;
      try{descriptor=Object.getOwnPropertyDescriptor(value,key);}catch(ignoreDescriptor){return false;}
      if(!descriptor||!descriptor.enumerable||!own.call(descriptor,'value'))return false;
    }
    return true;
  }
  function text(value,min,max){return typeof value==='string'&&Array.from(value).length>=min&&Array.from(value).length<=max&&!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(value);}
  function identifier(value){return typeof value==='string'&&value.length>0&&value.length<=160&&/^[\x21-\x7e]+$/.test(value);}
  function date(value){
    var parts,stamp;
    if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return false;
    parts=value.split('-').map(Number);stamp=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    return stamp.getUTCFullYear()===parts[0]&&stamp.getUTCMonth()===parts[1]-1&&stamp.getUTCDate()===parts[2];
  }
  function url(value){
    var parsed;
    if(typeof value!=='string'||value.length>2048||!/^https:\/\/[^\s]+$/i.test(value))return false;
    try{parsed=new URL(value);}catch(ignoreUrl){return false;}
    return parsed.protocol==='https:'&&!!parsed.hostname&&!parsed.username&&!parsed.password;
  }
  function canonical(value){
    var keys,i,out=[];
    if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
    if(typeof value==='number'){if(!isFinite(value))throw new Error('number');return JSON.stringify(value);}
    if(Array.isArray(value)){if(!array(value,MAX_ARRAY))throw new Error('array');return '['+value.map(canonical).join(',')+']';}
    if(!value||typeof value!=='object')throw new Error('value');
    keys=Reflect.ownKeys(value);for(i=0;i<keys.length;i++)if(typeof keys[i]!=='string')throw new Error('key');
    keys.sort();for(i=0;i<keys.length;i++){
      var descriptor=Object.getOwnPropertyDescriptor(value,keys[i]);
      if(!descriptor||!descriptor.enumerable||!own.call(descriptor,'value'))throw new Error('descriptor');
      out.push(JSON.stringify(keys[i])+':'+canonical(descriptor.value));
    }
    return '{'+out.join(',')+'}';
  }
  function encode64(bytes){
    var binary='',i;for(i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function digest(value,subtle){
    var method,bytes,request;
    try{method=subtle&&subtle.digest;bytes=new TextEncoder().encode(canonical(value));if(typeof method!=='function')throw new Error('method');request=method.call(subtle,'SHA-256',bytes);}catch(ignore){return Promise.reject(new Error('digest'));}
    return Promise.resolve(request).then(function(buffer){var view=new Uint8Array(buffer);if(view.byteLength!==32)throw new Error('digest');return 'sha256-'+encode64(view);});
  }
  function validConfig(config,site){
    var card,plan,i,item,seen=Object.create(null),orders=Object.create(null),weekCount=site.audience==='ms3'?6:4,orientation,j;
    if(!exact(config,['audience','pathId','editionNumber','createdAgainstCoreRevision','card','pathItems','localOrientation','changeNote'])||
       config.audience!==site.audience||config.pathId!==site.pathId||!Number.isInteger(config.editionNumber)||config.editionNumber<1||
       typeof config.createdAgainstCoreRevision!=='string'||!/^[0-9a-f]{40}$/.test(config.createdAgainstCoreRevision)||!text(config.changeNote,0,280))return false;
    card=config.card;
    if(!exact(card,['title','locationName','locationCode','curatorName','curatorRole','rotationStart','rotationEnd','lastVerified'])||
       !text(card.title,1,100)||!text(card.locationName,1,100)||typeof card.locationCode!=='string'||!/^[A-Z0-9]{2,8}$/.test(card.locationCode)||
       !text(card.curatorName,1,100)||!text(card.curatorRole,1,100)||!date(card.rotationStart)||!date(card.rotationEnd)||card.rotationEnd<card.rotationStart||!date(card.lastVerified))return false;
    plan=config.pathItems;if(!array(plan,MAX_ARRAY))return false;
    for(i=0;i<plan.length;i++){
      item=plan[i];if(!exact(item,['instanceId','ref','week','order','priority','rationale'])||!identifier(item.instanceId)||!identifier(item.ref)||seen[item.instanceId]||
         !Number.isInteger(item.week)||item.week<1||item.week>weekCount||!Number.isInteger(item.order)||item.order<1||priorities.indexOf(item.priority)<0||!text(item.rationale,0,280))return false;
      seen[item.instanceId]=true;if(!orders[item.week])orders[item.week]=Object.create(null);if(orders[item.week][item.order])return false;orders[item.week][item.order]=true;
    }
    for(i=1;i<=weekCount;i++)if(orders[i])for(j=1;j<=Object.keys(orders[i]).length;j++)if(!orders[i][j])return false;
    orientation=config.localOrientation;
    if(!exact(orientation,orientationFields.concat(['contacts','checklist','resources'])))return false;
    for(i=0;i<orientationFields.length;i++)if(!text(orientation[orientationFields[i]],0,600))return false;
    if(!array(orientation.contacts,MAX_ARRAY)||!array(orientation.checklist,24)||!array(orientation.resources,12))return false;
    for(i=0;i<orientation.contacts.length;i++){item=orientation.contacts[i];if(!exact(item,['role','directoryUrl'])||!text(item.role,1,100)||!url(item.directoryUrl))return false;}
    for(i=0;i<orientation.checklist.length;i++){item=orientation.checklist[i];if(!exact(item,['id','label','priority'])||!identifier(item.id)||!text(item.label,1,100)||priorities.indexOf(item.priority)<0)return false;}
    for(i=0;i<orientation.resources.length;i++){item=orientation.resources[i];if(!exact(item,['id','title','url','priority','week','rationale'])||!identifier(item.id)||!text(item.title,1,100)||!url(item.url)||priorities.indexOf(item.priority)<0||!Number.isInteger(item.week)||item.week<1||item.week>weekCount||!text(item.rationale,0,280))return false;}
    return true;
  }
  function siteValue(index,siteContext){
    var path,site,weeks,byRef;
    try{
      if(!exact(siteContext,['audience','pathId','coreRevision','localCatalogRevision','rotationEditionV2'])||
         ['ms3','resident'].indexOf(siteContext.audience)<0||siteContext.pathId!==(siteContext.audience==='ms3'?'ms3-six-week':'resident-four-week')||
         !/^[0-9a-f]{40}$/.test(siteContext.coreRevision)||!/^sha256-[A-Za-z0-9_-]{43}$/.test(siteContext.localCatalogRevision)||
         ['enabled','disabled'].indexOf(siteContext.rotationEditionV2)<0)return null;
      path=Object.getOwnPropertyDescriptor(index,'path');weeks=Object.getOwnPropertyDescriptor(index,'weeks');byRef=Object.getOwnPropertyDescriptor(index,'byRef');
      if(!path||!own.call(path,'value')||!weeks||!own.call(weeks,'value')||!byRef||!own.call(byRef,'value'))return null;
      path=path.value;if(!path||path.id!==siteContext.pathId||path.weekCount!==(siteContext.audience==='ms3'?6:4)||!array(weeks.value,path.weekCount)||!byRef.value||typeof byRef.value!=='object')return null;
      site={audience:siteContext.audience,pathId:siteContext.pathId,coreRevision:siteContext.coreRevision,localCatalogRevision:siteContext.localCatalogRevision,rotationEditionV2:siteContext.rotationEditionV2,weeks:weeks.value,byRef:byRef.value};
      return site;
    }catch(ignore){return null;}
  }
  function clone(value){return JSON.parse(canonical(value));}
  function newDraft(site,pathItems){
    return {schemaVersion:2,step:1,site:{audience:site.audience,pathId:site.pathId,coreRevision:site.coreRevision,localCatalogRevision:site.localCatalogRevision,rotationEditionV2:site.rotationEditionV2,rendererRevision:'rotation-edition-v2-r1'},config:{context:{trainingLocationKey:'',curatorProfileKey:'',rotationStart:'',rotationEnd:'',editionCheckedOn:''},phraseSetKey:'',pathItems:pathItems,localPlan:{},changeSummary:{kindCodes:['initial'],changedItemCount:0}},publication:{baseEnvelope:null,baseSemanticConfig:'',lastGenerated:null},previewReceipts:{desktop:null,mobile:null},affirmations:{publicSafe:false,officialLinks:false,previewsReviewed:false,forwardable:false}};
  }

  fdEditionV1ValidateForSalvage=function(text,index,siteContext,subtle){
    var bytes,value,site,preimage,audienceDescriptor,pathDescriptor;
    if(typeof text!=='string')return Promise.resolve(failure('V1_SALVAGE_FORMAT'));
    try{bytes=new TextEncoder().encode(text).length;}catch(ignoreEncoding){return Promise.resolve(failure('V1_SALVAGE_FORMAT'));}
    if(bytes>MAX_BYTES)return Promise.resolve(failure('V1_SALVAGE_SIZE'));
    try{value=JSON.parse(text);}catch(ignoreParse){return Promise.resolve(failure('V1_SALVAGE_FORMAT'));}
    site=siteValue(index,siteContext);if(!site)return Promise.resolve(failure('V1_SALVAGE_FORMAT'));
    if(!exact(value,['format','schemaVersion','config','digest'])||value.format!=='cw-rotation-edition'||value.schemaVersion!==1||typeof value.digest!=='string'||!/^sha256-[A-Za-z0-9_-]{43}$/.test(value.digest))return Promise.resolve(failure('V1_SALVAGE_FORMAT'));
    try{audienceDescriptor=Object.getOwnPropertyDescriptor(value.config,'audience');pathDescriptor=Object.getOwnPropertyDescriptor(value.config,'pathId');}catch(ignoreIdentity){return Promise.resolve(failure('V1_SALVAGE_FORMAT'));}
    if(audienceDescriptor&&own.call(audienceDescriptor,'value')&&pathDescriptor&&own.call(pathDescriptor,'value')&&
       (audienceDescriptor.value!==site.audience||pathDescriptor.value!==site.pathId))return Promise.resolve(failure('V1_SALVAGE_AUDIENCE'));
    if(!validConfig(value.config,site))return Promise.resolve(failure('V1_SALVAGE_FORMAT'));
    preimage={format:value.format,schemaVersion:value.schemaVersion,config:value.config};
    return digest(preimage,subtle).then(function(actual){
      var result;if(actual!==value.digest)return failure('V1_SALVAGE_DIGEST');
      result={ok:true,code:'V1_SALVAGE_OK'};trusted.set(result,{config:clone(value.config)});return result;
    },function(){return failure('V1_SALVAGE_DIGEST');});
  };

  fdEditionV1Salvage=function(validatedV1,index,siteContext,generationDate){
    var stored=trusted.get(validatedV1),site=siteValue(index,siteContext),source,known=[],dropped=0,occurrences=Object.create(null),orders=Object.create(null),i,item,descriptor;
    if(!stored||!site||typeof generationDate!=='string'||(generationDate&&!date(generationDate)))return salvageFailure();
    source=stored.config.pathItems.slice().sort(function(a,b){return a.week-b.week||a.order-b.order;});
    for(i=0;i<source.length;i++){
      item=source[i];
      try{descriptor=Object.getOwnPropertyDescriptor(site.byRef,item.ref);}catch(ignoreRef){descriptor=null;}
      if(!descriptor||!own.call(descriptor,'value')){dropped+=1;continue;}
      occurrences[item.ref]=(occurrences[item.ref]||0)+1;orders[item.week]=(orders[item.week]||0)+1;
      known.push({instanceId:'core:'+item.ref+':'+occurrences[item.ref],ref:item.ref,week:item.week,order:orders[item.week],priority:item.priority});
    }
    if(!known.length||known.length>96)return salvageFailure();
    var draft=newDraft(site,known),card=stored.config.card;
    draft.config.context.rotationStart=card.rotationStart;draft.config.context.rotationEnd=card.rotationEnd;
    if(generationDate&&card.lastVerified<=generationDate)draft.config.context.editionCheckedOn=card.lastVerified;
    return {ok:true,code:'V1_SALVAGE_OK',draft:draft,droppedReferenceCount:dropped};
  };
}());
