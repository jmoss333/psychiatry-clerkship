/* Pure learner edition startup, explicit storage commits, and safe status markup. */
var FD_EDITION_STUDENT_KEYS={edition:'cw_rotation_edition_v1',local:'cw_rotation_local_progress_v1'};
var FD_EDITION_STUDENT_FINGERPRINT=/^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/;
var FD_EDITION_STUDENT_ID=/^[\x21-\x7e]{1,160}$/;
var FD_EDITION_STUDENT_DANGEROUS={__proto__:true,constructor:true,prototype:true};
var FD_EDITION_STUDENT_CODES={
  EDITION_SCHEMA:true,EDITION_DIGEST:true,EDITION_AUDIENCE:true,EDITION_REF:true,
  EDITION_WEEK:true,EDITION_SIZE:true,EDITION_URL:true,EDITION_TEXT_RISK:true,
  EDITION_CRYPTO:true,EDITION_PROJECT:true,EDITION_RUNTIME:true,EDITION_DISABLED:true
};

function fdEditionPublicationEnabled(siteContext){
  var gate=fdEditionStudentData(siteContext,'rotationEditionV2');
  return gate.ok&&gate.value==='enabled';
}

function fdEditionStudentObject(value){
  var prototype,isArray;
  if(value===null||typeof value!=='object') return false;
  try{ prototype=Object.getPrototypeOf(value); isArray=Array.isArray(value); }
  catch(ignoreShape){ return false; }
  return !isArray&&(prototype===Object.prototype||prototype===null);
}

function fdEditionStudentData(value,key){
  var descriptor;
  if(!fdEditionStudentObject(value)) return {ok:false,value:null};
  try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
  catch(ignoreDescriptor){ descriptor=null; }
  if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return {ok:false,value:null};
  return {ok:true,value:descriptor.value};
}

function fdEditionStudentFingerprint(value){
  return typeof value==='string'&&FD_EDITION_STUDENT_FINGERPRINT.test(value)?value:'';
}

function fdEditionStudentId(value){
  return typeof value==='string'&&FD_EDITION_STUDENT_ID.test(value)?value:'';
}

function fdEditionStudentCode(value){
  return typeof value==='string'&&FD_EDITION_STUDENT_CODES[value]?value:'';
}

function fdEditionStudentExactObject(value,fields){
  var keys,allowed=Object.create(null),seen=Object.create(null),i,key,descriptor;
  if(!fdEditionStudentObject(value)) return false;
  for(i=0;i<fields.length;i++) allowed[fields[i]]=true;
  try{ keys=Reflect.ownKeys(value); }catch(ignoreKeys){ return false; }
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(typeof key!=='string'||FD_EDITION_STUDENT_DANGEROUS[key]||!allowed[key]) return false;
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }catch(ignoreDescriptor){ return false; }
    if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return false;
    seen[key]=true;
  }
  for(i=0;i<fields.length;i++) if(!seen[fields[i]]) return false;
  return true;
}

function fdEditionStudentSafeReceipt(result,siteContext,code){
  var receipt,codeData,versionData,fingerprintData,revisionData;
  if(fdEditionStudentObject(result)){
    codeData=fdEditionStudentData(result,'code'); versionData=fdEditionStudentData(result,'schemaVersion');
    fingerprintData=fdEditionStudentData(result,'fingerprint'); revisionData=fdEditionStudentData(result,'currentCoreRevision');
    if(codeData.ok&&fdEditionStudentCode(codeData.value)){
      return {
        code:fdEditionStudentCode(code)||codeData.value,
        schemaVersion:versionData.ok&&typeof versionData.value==='number'&&isFinite(versionData.value)&&Math.floor(versionData.value)===versionData.value&&versionData.value>0?versionData.value:null,
        fingerprint:fingerprintData.ok?fdEditionStudentFingerprint(fingerprintData.value):'',
        currentCoreRevision:revisionData.ok&&typeof revisionData.value==='string'&&/^[0-9a-f]{40}$/.test(revisionData.value)?revisionData.value:''
      };
    }
  }
  try{ receipt=fdEditionDiagnostic(result,siteContext); }
  catch(ignoreDiagnostic){ receipt=null; }
  codeData=fdEditionStudentData(receipt,'code'); versionData=fdEditionStudentData(receipt,'schemaVersion');
  fingerprintData=fdEditionStudentData(receipt,'fingerprint'); revisionData=fdEditionStudentData(receipt,'currentCoreRevision');
  return {
    code:fdEditionStudentCode(code)||(codeData.ok&&fdEditionStudentCode(codeData.value) ? codeData.value : 'EDITION_RUNTIME'),
    schemaVersion:versionData.ok&&typeof versionData.value==='number'&&isFinite(versionData.value)&&Math.floor(versionData.value)===versionData.value&&versionData.value>0?versionData.value:null,
    fingerprint:fingerprintData.ok?fdEditionStudentFingerprint(fingerprintData.value):'',
    currentCoreRevision:revisionData.ok&&typeof revisionData.value==='string'&&/^[0-9a-f]{40}$/.test(revisionData.value)?revisionData.value:''
  };
}

function fdEditionStudentParseStored(text,canonicalIndex,siteContext,subtle){
  var envelope;
  if(text===null||text===undefined||text==='') return Promise.resolve({present:false,result:null});
  if(typeof text!=='string'||text.length>FD_EDITION_RULES.maxUrlChars)
    return Promise.resolve({present:true,result:{ok:false,errors:[]},code:'EDITION_SCHEMA'});
  try{ envelope=JSON.parse(text); }
  catch(ignoreStored){ return Promise.resolve({present:true,result:{ok:false,errors:[]},code:'EDITION_SCHEMA'}); }
  try{
    return fdEditionValidateEnvelope(envelope,canonicalIndex,siteContext,subtle).then(function(result){
      return {present:true,result:result,code:null};
    },function(){ return {present:true,result:{ok:false,errors:[]},code:'EDITION_CRYPTO'}; });
  }catch(ignoreValidation){ return Promise.resolve({present:true,result:{ok:false,errors:[]},code:'EDITION_RUNTIME'}); }
}

function fdEditionStudentIncoming(hash,pageUrl,canonicalIndex,siteContext,subtle){
  var payload,base,totalLength;
  if(hash===null||hash===undefined||hash==='') return Promise.resolve({present:false,result:null});
  if(typeof hash!=='string'||hash.slice(0,9)!=='#edition=')
    return Promise.resolve({present:true,result:{ok:false,errors:[]},code:'EDITION_URL'});
  payload=hash.slice(9);
  if(typeof pageUrl!=='string') return Promise.resolve({present:true,result:{ok:false,errors:[]},code:'EDITION_URL'});
  base=pageUrl.indexOf('#')===-1?pageUrl:pageUrl.slice(0,pageUrl.indexOf('#'));
  totalLength=base.length+hash.length;
  try{
    return fdEditionDecodePayload(payload,canonicalIndex,siteContext,subtle,totalLength).then(function(result){
      return {present:true,result:result,code:null};
    },function(){ return {present:true,result:{ok:false,errors:[]},code:'EDITION_CRYPTO'}; });
  }catch(ignoreDecode){ return Promise.resolve({present:true,result:{ok:false,errors:[]},code:'EDITION_RUNTIME'}); }
}

function fdEditionStudentProject(canonicalIndex,validatedEdition,siteContext){
  var projected;
  try{ projected=fdProjectEdition(canonicalIndex,validatedEdition); }
  catch(ignoreProject){ return {ok:false,index:canonicalIndex,receipt:fdEditionStudentSafeReceipt(null,siteContext,'EDITION_PROJECT')}; }
  if(!projected||projected.ok!==true||!projected.index)
    return {ok:false,index:canonicalIndex,receipt:fdEditionStudentSafeReceipt(projected,siteContext,'EDITION_PROJECT')};
  return {ok:true,index:projected.index,receipt:null};
}

function fdEditionResolveStartup(canonicalIndex,siteContext,pageUrl,incomingHash,storedText,subtle){
  if(!fdEditionPublicationEnabled(siteContext)){
    if(typeof incomingHash==='string'&&incomingHash.indexOf('#edition=')===0)
      return Promise.resolve({mode:'rejected',needsCommit:false,active:null,candidate:null,index:canonicalIndex,
        receipt:fdEditionStudentSafeReceipt(null,siteContext,'EDITION_DISABLED')});
    return Promise.resolve({mode:'core',needsCommit:false,active:null,candidate:null,index:canonicalIndex,receipt:null});
  }
  return Promise.all([
    fdEditionStudentParseStored(storedText,canonicalIndex,siteContext,subtle),
    fdEditionStudentIncoming(incomingHash,pageUrl,canonicalIndex,siteContext,subtle)
  ]).then(function(parts){
    var stored=parts[0],incoming=parts[1],storedValid=stored.result&&stored.result.ok===true,
      incomingValid=incoming.result&&incoming.result.ok===true,active=null,candidate=null,projected;
    if(stored.present&&!storedValid){
      if(!incomingValid) return {mode:'rejected',needsCommit:false,active:null,candidate:null,index:canonicalIndex,
        receipt:fdEditionStudentSafeReceipt(stored.result,siteContext,stored.code)};
    }
    if(incoming.present&&!incomingValid){
      if(storedValid){
        projected=fdEditionStudentProject(canonicalIndex,stored.result,siteContext);
        return {mode:'rejected',needsCommit:false,active:projected.ok?stored.result:null,candidate:null,index:projected.index,
          receipt:fdEditionStudentSafeReceipt(incoming.result,siteContext,incoming.code)};
      }
      return {mode:'rejected',needsCommit:false,active:null,candidate:null,index:canonicalIndex,
        receipt:fdEditionStudentSafeReceipt(incoming.result,siteContext,incoming.code)};
    }
    if(storedValid){
      projected=fdEditionStudentProject(canonicalIndex,stored.result,siteContext);
      if(!projected.ok) return {mode:'rejected',needsCommit:false,active:null,candidate:null,index:canonicalIndex,receipt:projected.receipt};
      active=stored.result;
      if(incomingValid&&incoming.result.fingerprint!==stored.result.fingerprint){
        return {mode:'switch-required',needsCommit:false,active:active,candidate:incoming.result,index:projected.index,receipt:null};
      }
      return {mode:'active',needsCommit:false,active:active,candidate:null,index:projected.index,receipt:null};
    }
    if(incomingValid){
      projected=fdEditionStudentProject(canonicalIndex,incoming.result,siteContext);
      if(!projected.ok) return {mode:'rejected',needsCommit:false,active:null,candidate:null,index:canonicalIndex,receipt:projected.receipt};
      candidate=incoming.result;
      return {mode:'active',needsCommit:true,active:candidate,candidate:null,index:projected.index,receipt:null};
    }
    return {mode:'core',needsCommit:false,active:null,candidate:null,index:canonicalIndex,receipt:null};
  },function(){
    return {mode:'rejected',needsCommit:false,active:null,candidate:null,index:canonicalIndex,
      receipt:fdEditionStudentSafeReceipt(null,siteContext,'EDITION_RUNTIME')};
  });
}

function fdEditionStudentValidEdition(value){
  var snapshot,envelope,config,fingerprint,canonical;
  try{ snapshot=fdEditionTrustedSnapshot(value); }catch(ignoreProvenance){ return null; }
  if(!fdEditionStudentObject(snapshot)) return null;
  envelope=fdEditionStudentData(snapshot,'envelope'); config=fdEditionStudentData(snapshot,'config');
  fingerprint=fdEditionStudentData(snapshot,'fingerprint'); canonical=fdEditionStudentData(snapshot,'canonicalEnvelope');
  if(!envelope.ok||!fdEditionStudentObject(envelope.value)||!config.ok||!fdEditionStudentObject(config.value)||
     !fingerprint.ok||!fdEditionStudentFingerprint(fingerprint.value)||!canonical.ok||typeof canonical.value!=='string') return null;
  return {envelope:envelope.value,fingerprint:fingerprint.value,text:canonical.value};
}

function fdEditionStudentMethod(storage,name){
  var cursor=storage,descriptor,depth=0;
  if(storage===null||(typeof storage!=='object'&&typeof storage!=='function')) return null;
  while(cursor!==null&&depth<8){
    try{ descriptor=Object.getOwnPropertyDescriptor(cursor,name); }catch(ignoreDescriptor){ return null; }
    if(descriptor){
      if(!Object.prototype.hasOwnProperty.call(descriptor,'value')||typeof descriptor.value!=='function') return null;
      return descriptor.value;
    }
    try{ cursor=Object.getPrototypeOf(cursor); }catch(ignorePrototype){ return null; }
    depth+=1;
  }
  return null;
}

function fdEditionStudentRead(storage,key){
  var method=fdEditionStudentMethod(storage,'getItem');
  if(!method) return {ok:false,value:null};
  try{ return {ok:true,value:Function.prototype.call.call(method,storage,key)}; }
  catch(ignoreRead){ return {ok:false,value:null}; }
}

function fdEditionStudentNewDocument(){ return {schemaVersion:1,byFingerprint:Object.create(null)}; }

function fdEditionStudentLocalDocument(text){
  var parsed,root,buckets,keys,i,key,bucket,checklist,resources,checkedChecklist,checkedResources,out=fdEditionStudentNewDocument();
  if(text===null) return {ok:true,document:out};
  if(typeof text!=='string'||text.length===0||text.length>FD_EDITION_RULES.maxUrlChars) return {ok:false,document:null};
  try{ parsed=JSON.parse(text); }catch(ignoreParse){ return {ok:false,document:null}; }
  if(!fdEditionStudentExactObject(parsed,['schemaVersion','byFingerprint'])) return {ok:false,document:null};
  root=fdEditionStudentData(parsed,'schemaVersion'); buckets=fdEditionStudentData(parsed,'byFingerprint');
  if(!root.ok||root.value!==1||!buckets.ok||!fdEditionStudentObject(buckets.value)) return {ok:false,document:null};
  try{ keys=Reflect.ownKeys(buckets.value); }catch(ignoreKeys){ return {ok:false,document:null}; }
  for(i=0;i<keys.length;i++){
    key=keys[i]; if(typeof key!=='string'||!fdEditionStudentFingerprint(key)) return {ok:false,document:null};
    bucket=fdEditionStudentData(buckets.value,key); if(!bucket.ok||!fdEditionStudentExactObject(bucket.value,['checklist','resources'])) return {ok:false,document:null};
    checklist=fdEditionStudentData(bucket.value,'checklist'); resources=fdEditionStudentData(bucket.value,'resources');
    if(!checklist.ok||!resources.ok) return {ok:false,document:null};
    checkedChecklist=fdEditionStudentCompletion(checklist.value); checkedResources=fdEditionStudentCompletion(resources.value);
    if(!checkedChecklist.ok||!checkedResources.ok) return {ok:false,document:null};
    out.byFingerprint[key]={checklist:checkedChecklist.value,resources:checkedResources.value};
  }
  return {ok:true,document:out};
}

function fdEditionStudentCompletion(value){
  var keys,i,key,descriptor,out=Object.create(null);
  if(!fdEditionStudentObject(value)) return {ok:false,value:null};
  try{ keys=Reflect.ownKeys(value); }catch(ignoreKeys){ return {ok:false,value:null}; }
  for(i=0;i<keys.length;i++){
    key=keys[i]; if(typeof key!=='string'||!fdEditionStudentId(key)) return {ok:false,value:null};
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }catch(ignoreDescriptor){ return {ok:false,value:null}; }
    if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')||descriptor.value!==true) return {ok:false,value:null};
    out[key]=true;
  }
  return {ok:true,value:out};
}

function fdEditionStudentWrite(storage,key,value){
  var method=fdEditionStudentMethod(storage,'setItem');
  if(!method) return false;
  try{ Function.prototype.call.call(method,storage,key,value); return true; }
  catch(ignoreWrite){ return false; }
}

function fdEditionStartupJournal(storage,allowedKeys){
  var get=fdEditionStudentMethod(storage,'getItem');
  var set=fdEditionStudentMethod(storage,'setItem');
  var remove=fdEditionStudentMethod(storage,'removeItem');
  var allowed=Object.create(null),i,key;
  if(!get||!set||!remove||!Array.isArray(allowedKeys)) return null;
  for(i=0;i<allowedKeys.length;i++){
    key=allowedKeys[i];
    if(typeof key!=='string'||!key||Object.prototype.hasOwnProperty.call(allowed,key)) return null;
    allowed[key]=true;
  }
  return {
    storage:storage,get:get,set:set,remove:remove,allowed:allowed,
    records:Object.create(null),order:[],blocked:Object.create(null),failed:false
  };
}

function fdEditionStartupJournalValue(journal,key){
  if(!journal||!Object.prototype.hasOwnProperty.call(journal.allowed,key)) return {ok:false,value:null};
  try{return {ok:true,value:Function.prototype.call.call(journal.get,journal.storage,key)};}
  catch(ignoreRead){return {ok:false,value:null};}
}

function fdEditionStartupJournalRun(journal,keys,operation){
  var before=[],after=[],seen=Object.create(null),i,key,value,record,threw=false,
    preflightFailed=false,readFailed=false,result=null;
  if(!journal||!Array.isArray(keys)||typeof operation!=='function') return {ok:false,value:null};
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(typeof key!=='string'||Object.prototype.hasOwnProperty.call(seen,key)||
       !Object.prototype.hasOwnProperty.call(journal.allowed,key)) return {ok:false,value:null};
    seen[key]=true;value=fdEditionStartupJournalValue(journal,key);
    if(!value.ok){journal.blocked[key]=true;journal.failed=true;return {ok:false,value:null};}
    before.push(value.value);
    record=journal.records[key];
    if(journal.blocked[key])preflightFailed=true;
    else if(record&&record.expected!==value.value){
      journal.blocked[key]=true;journal.failed=true;preflightFailed=true;
    }
  }
  if(preflightFailed)return {ok:false,value:null};
  try{result=operation();}catch(ignoreOperation){threw=true;journal.failed=true;}
  for(i=0;i<keys.length;i++){
    value=fdEditionStartupJournalValue(journal,keys[i]);
    if(!value.ok){journal.blocked[keys[i]]=true;journal.failed=true;readFailed=true;after.push(null);continue;}
    after.push(value.value);
  }
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(journal.blocked[key]||before[i]===after[i])continue;
    record=journal.records[key];
    if(record)record.expected=after[i];
    else{
      journal.records[key]={key:key,original:before[i],expected:after[i]};
      journal.order.push(key);
    }
  }
  return {ok:!threw&&!readFailed,value:threw||readFailed?null:result};
}

function fdEditionStartupJournalRollback(journal){
  var record,current,key,ok;
  if(!journal||!Array.isArray(journal.order)||!journal.records||!journal.blocked)return false;
  ok=!journal.failed;
  for(var i=journal.order.length-1;i>=0;i--){
    key=journal.order[i];
    if(journal.blocked[key])continue;
    record=journal.records[key];current=fdEditionStartupJournalValue(journal,key);
    if(!current.ok){journal.blocked[key]=true;ok=false;continue;}
    if(current.value!==record.expected){journal.blocked[key]=true;continue;}
    try{
      if(record.original===null)
        Function.prototype.call.call(journal.remove,journal.storage,key);
      else Function.prototype.call.call(journal.set,journal.storage,key,record.original);
    }catch(ignoreRestore){journal.blocked[key]=true;ok=false;}
  }
  journal.records=Object.create(null);journal.order=[];
  return ok;
}

function fdEditionStudentAccept(storage,validatedEdition){
  var edition=fdEditionStudentValidEdition(validatedEdition),stored,local;
  if(!edition) return false;
  stored=fdEditionStudentRead(storage,FD_EDITION_STUDENT_KEYS.local);
  if(!stored.ok) return false;
  local=fdEditionStudentLocalDocument(stored.value);
  if(!local.ok) return false;
  if(!local.document.byFingerprint[edition.fingerprint]) local.document.byFingerprint[edition.fingerprint]={checklist:Object.create(null),resources:Object.create(null)};
  try{ local=JSON.stringify(local.document); }catch(ignoreLocalSerialize){ return false; }
  return fdEditionStudentWrite(storage,FD_EDITION_STUDENT_KEYS.local,local)&&
    fdEditionStudentWrite(storage,FD_EDITION_STUDENT_KEYS.edition,edition.text);
}

function fdEditionAcceptFirst(storage,validatedEdition){ return fdEditionStudentAccept(storage,validatedEdition); }
function fdEditionAcceptSwitch(storage,validatedEdition){ return fdEditionStudentAccept(storage,validatedEdition); }

function fdEditionReadLocalProgress(storage,fingerprint){
  var valid=fdEditionStudentFingerprint(fingerprint),stored,document,bucket;
  if(!valid) return {checklist:Object.create(null),resources:Object.create(null)};
  stored=fdEditionStudentRead(storage,FD_EDITION_STUDENT_KEYS.local);
  if(!stored.ok) return {checklist:Object.create(null),resources:Object.create(null)};
  document=fdEditionStudentLocalDocument(stored.value);
  if(!document.ok) return {checklist:Object.create(null),resources:Object.create(null)};
  bucket=document.document.byFingerprint[valid];
  return bucket?{checklist:bucket.checklist,resources:bucket.resources}:{checklist:Object.create(null),resources:Object.create(null)};
}

function fdEditionToggleLocalProgress(storage,fingerprint,kind,id){
  var valid=fdEditionStudentFingerprint(fingerprint),stored,document,bucket;
  if(!valid||(kind!=='checklist'&&kind!=='resources')||!fdEditionStudentId(id)) return false;
  stored=fdEditionStudentRead(storage,FD_EDITION_STUDENT_KEYS.local);
  if(!stored.ok) return false;
  document=fdEditionStudentLocalDocument(stored.value);
  if(!document.ok) return false;
  bucket=document.document.byFingerprint[valid]||(document.document.byFingerprint[valid]={checklist:Object.create(null),resources:Object.create(null)});
  if(bucket[kind][id]) delete bucket[kind][id]; else bucket[kind][id]=true;
  try{ return fdEditionStudentWrite(storage,FD_EDITION_STUDENT_KEYS.local,JSON.stringify(document.document)); }
  catch(ignoreSerialize){ return false; }
}

function fdEditionStudentEscape(value){
  try{
    return String(value).replace(/[&<>"']/g,function(character){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }catch(ignoreEscape){ return ''; }
}

function fdEditionRenderString(object,key){
  var data=fdEditionStudentData(object,key);
  return data.ok&&typeof data.value==='string'?data.value:'';
}

function fdEditionRenderObject(object,key){
  var data=fdEditionStudentData(object,key);
  return data.ok&&fdEditionStudentObject(data.value)?data.value:null;
}

function fdEditionRenderArray(object,key){
  var data=fdEditionStudentData(object,key);
  try{ return data.ok&&Array.isArray(data.value)?data.value:null; }
  catch(ignoreArray){ return null; }
}

function fdEditionRenderArrayValue(array,index){
  var descriptor;
  try{
    if(!Array.isArray(array)||index<0||index>=array.length) return null;
    descriptor=Object.getOwnPropertyDescriptor(array,String(index));
  }catch(ignoreEntry){ return null; }
  return descriptor&&descriptor.enumerable&&Object.prototype.hasOwnProperty.call(descriptor,'value')
    ?descriptor.value:null;
}

function fdEditionRenderPriority(value){
  if(value==='required') return 'Required';
  if(value==='recommended') return 'Recommended';
  if(value==='optional') return 'Optional';
  return '';
}

function fdEditionRenderCompletion(progress,kind,id){
  var bucket=fdEditionRenderObject(progress,kind),entry;
  if(!bucket||!fdEditionStudentId(id)) return false;
  entry=fdEditionStudentData(bucket,id);
  return entry.ok&&entry.value===true;
}

function fdEditionExternalUrl(url){
  var parsed;
  if(typeof url!=='string'||!url) return '';
  try{ parsed=new URL(url); }
  catch(ignoreUrl){ return ''; }
  if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password) return '';
  return parsed.href;
}

function fdEditionExternalDomain(url){
  var safe=fdEditionExternalUrl(url),parsed;
  if(!safe) return '';
  try{ parsed=new URL(safe); return String(parsed.hostname||'').toLowerCase(); }
  catch(ignoreDomain){ return ''; }
}

function fdEditionCardMarkup(edition,currentCoreRevision){
  var card,envelope,config,fingerprint,numberData,number,audience,pathId,audienceLabel='',duration='',
    location,title,curator,role,start,end,verified,original,change,rows='',titleMarkup='',changeMarkup='';
  try{
    if(!fdEditionStudentObject(edition)) return '';
    card=fdEditionRenderObject(edition,'card'); envelope=fdEditionRenderObject(edition,'envelope');
    config=fdEditionRenderObject(envelope,'config');
    fingerprint=fdEditionStudentFingerprint(fdEditionRenderString(edition,'fingerprint'));
    numberData=fdEditionStudentData(edition,'editionNumber'); number=numberData.ok?numberData.value:null;
    if(!card||!config||!fingerprint||typeof number!=='number'||!isFinite(number)||
       Math.floor(number)!==number||number<1) return '';
    location=fdEditionRenderString(card,'locationName'); title=fdEditionRenderString(card,'title');
    curator=fdEditionRenderString(card,'curatorName'); role=fdEditionRenderString(card,'curatorRole');
    start=fdEditionRenderString(card,'rotationStart'); end=fdEditionRenderString(card,'rotationEnd');
    verified=fdEditionRenderString(card,'lastVerified');
    original=fdEditionRenderString(edition,'createdAgainstCoreRevision');
    change=fdEditionRenderString(edition,'changeNote');
    audience=fdEditionRenderString(config,'audience'); pathId=fdEditionRenderString(config,'pathId');
    audienceLabel=audience==='ms3'?'MS3':(audience==='resident'?'Resident':'');
    duration=pathId==='ms3-six-week'?'6 weeks':(pathId==='resident-four-week'?'4 weeks':'');
    if(!location||!audienceLabel||!duration) return '';
    if(typeof currentCoreRevision!=='string'||!/^[0-9a-f]{40}$/.test(currentCoreRevision)) currentCoreRevision='';
    if(!/^[0-9a-f]{40}$/.test(original)) original='';
    if(title) titleMarkup='<h3 class="fd-edition-card__title">'+fdEditionStudentEscape(title)+'</h3>';
    if(curator||role) rows+='<div class="fd-edition-card__row"><dt>Curator</dt><dd>'+fdEditionStudentEscape(curator)+
      (curator&&role?' · ':'')+fdEditionStudentEscape(role)+'</dd></div>';
    rows+='<div class="fd-edition-card__row"><dt>Audience and duration</dt><dd>'+audienceLabel+' · '+duration+'</dd></div>';
    if(start||end) rows+='<div class="fd-edition-card__row"><dt>Rotation dates</dt><dd>'+fdEditionStudentEscape(start)+
      (start&&end?' to ':'')+fdEditionStudentEscape(end)+'</dd></div>';
    if(verified) rows+='<div class="fd-edition-card__row"><dt>Last verified</dt><dd>'+fdEditionStudentEscape(verified)+'</dd></div>';
    if(currentCoreRevision) rows+='<div class="fd-edition-card__row"><dt>Current core revision</dt><dd><code>'+fdEditionStudentEscape(currentCoreRevision)+'</code></dd></div>';
    if(original) rows+='<div class="fd-edition-card__row"><dt>Original core revision</dt><dd><code>'+fdEditionStudentEscape(original)+'</code></dd></div>';
    if(change) changeMarkup='<div class="fd-edition-card__change"><strong>What changed</strong><p>'+fdEditionStudentEscape(change)+'</p></div>';
    return '<details class="fd-edition-card"><summary class="fd-edition-card__summary">'+
      '<span class="fd-edition-card__location">'+fdEditionStudentEscape(location)+'</span>'+
      '<span class="fd-edition-card__edition">Edition '+fdEditionStudentEscape(number)+'</span>'+
      '<code class="fd-edition-card__fingerprint">'+fdEditionStudentEscape(fingerprint)+'</code>'+
      '<span class="fd-edition-card__local">Locally curated</span></summary>'+
      '<div class="fd-edition-card__body">'+titleMarkup+'<dl class="fd-edition-card__meta">'+rows+'</dl>'+changeMarkup+
      '<p class="fd-edition-card__warning"><strong>Identity not digitally verified.</strong> Local guidance is attending-provided and separate from centrally reviewed core content.</p>'+
      '<p class="fd-edition-card__explain">The fingerprint confirms configuration equality only; it does not verify authorship.</p>'+
      '</div></details>';
  }catch(ignoreCard){ return ''; }
}

function fdEditionCoreMetaMarkup(item){
  var priority,rationale,out;
  try{
    if(!fdEditionStudentObject(item)) return '';
    priority=fdEditionRenderPriority(fdEditionRenderString(item,'editionPriority'));
    rationale=fdEditionRenderString(item,'editionRationale');
    if(!priority) return '';
    out='<span class="fd-edition-coremeta"><span class="fd-edition-priority">Local priority: '+priority+'</span>';
    if(rationale) out+='<span class="fd-edition-rationale">Attending rationale: '+fdEditionStudentEscape(rationale)+'</span>';
    return out+'</span>';
  }catch(ignoreCoreMeta){ return ''; }
}

function fdEditionLocalToggleMarkup(kind,id,label,priority,on){
  var cls=on?'fd-localcheck is-done':'fd-localcheck';
  return '<button type="button" class="'+cls+'" data-fd-local-toggle="'+kind+'" data-local-id="'+
    fdEditionStudentEscape(id)+'" aria-pressed="'+(on?'true':'false')+'" aria-label="Mark local item complete: '+
    fdEditionStudentEscape(label)+'"><span aria-hidden="true">✓</span></button>'+
    '<span class="fd-localitem__body"><span class="fd-localitem__title">'+fdEditionStudentEscape(label)+'</span>'+
    '<span class="fd-localitem__priority">Local priority: '+priority+'</span></span>';
}

function fdEditionLocalOrientationMarkup(edition,localProgress){
  var local,fields,content='',checklistMarkup='',contacts,checklist,i,item,label,value,role,url,domain,id,priority,on;
  try{
    if(!fdEditionStudentObject(edition)) return '';
    local=fdEditionRenderObject(edition,'localOrientation'); if(!local) return '';
    fields=[
      ['firstDayArrival','First-day arrival'],['dailySchedule','Typical daily schedule'],
      ['roundsWorkflow','Rounds workflow'],['presentationExpectations','Presentation expectations'],
      ['documentationExpectations','Documentation expectations'],['attendanceExpectations','Attendance expectations'],
      ['feedbackProcess','Feedback process'],['accessPreparation','Access preparation']
    ];
    for(i=0;i<fields.length;i++){
      value=fdEditionRenderString(local,fields[i][0]);
      if(value) content+='<div class="fd-localorientation__item"><dt>'+fields[i][1]+'</dt><dd>'+fdEditionStudentEscape(value)+'</dd></div>';
    }
    contacts=fdEditionRenderArray(local,'contacts');
    if(contacts){
      for(i=0;i<contacts.length;i++){
        item=fdEditionRenderArrayValue(contacts,i); if(!fdEditionStudentObject(item)) continue;
        role=fdEditionRenderString(item,'role'); url=fdEditionExternalUrl(fdEditionRenderString(item,'directoryUrl'));
        domain=fdEditionExternalDomain(url); if(!role||!url||!domain) continue;
        content+='<div class="fd-localorientation__item"><dt>Local directory</dt><dd><a href="'+fdEditionStudentEscape(url)+
          '" target="_blank" rel="noopener noreferrer">'+fdEditionStudentEscape(role)+'</a><span class="fd-external-domain">'+
          fdEditionStudentEscape(domain)+'</span></dd></div>';
      }
    }
    checklist=fdEditionRenderArray(local,'checklist');
    if(checklist&&checklist.length){
      var checklistRows='';
      for(i=0;i<checklist.length;i++){
        item=fdEditionRenderArrayValue(checklist,i); if(!fdEditionStudentObject(item)) continue;
        id=fdEditionStudentId(fdEditionRenderString(item,'id')); label=fdEditionRenderString(item,'label');
        priority=fdEditionRenderPriority(fdEditionRenderString(item,'priority')); if(!id||!label||!priority) continue;
        on=fdEditionRenderCompletion(localProgress,'checklist',id);
        checklistRows+='<li class="fd-localitem">'+fdEditionLocalToggleMarkup('checklist',id,label,priority,on)+'</li>';
      }
      if(checklistRows) checklistMarkup='<div class="fd-localchecklist"><h3>Attending-provided first-day checklist</h3><ul>'+checklistRows+'</ul></div>';
    }
    if(!content&&!checklistMarkup) return '';
    return '<section class="fd-localorientation" data-edition-orientation><div class="fd-localorientation__head">'+
      '<h2>Attending-provided local orientation</h2><span>Local guidance · separate from reviewed core</span></div>'+
      '<dl>'+content+'</dl>'+checklistMarkup+'</section>';
  }catch(ignoreOrientation){ return ''; }
}

function fdEditionWeekResourcesMarkup(edition,week,localProgress){
  var local,resources,rows='',i,item,id,title,url,domain,priority,rationale,weekData,on;
  try{
    if(!fdEditionStudentObject(edition)||typeof week!=='number'||!isFinite(week)||Math.floor(week)!==week) return '';
    local=fdEditionRenderObject(edition,'localOrientation'); if(!local) return '';
    resources=fdEditionRenderArray(local,'resources'); if(!resources) return '';
    for(i=0;i<resources.length;i++){
      item=fdEditionRenderArrayValue(resources,i); if(!fdEditionStudentObject(item)) continue;
      weekData=fdEditionStudentData(item,'week'); if(!weekData.ok||weekData.value!==week) continue;
      id=fdEditionStudentId(fdEditionRenderString(item,'id')); title=fdEditionRenderString(item,'title');
      url=fdEditionExternalUrl(fdEditionRenderString(item,'url')); domain=fdEditionExternalDomain(url);
      priority=fdEditionRenderPriority(fdEditionRenderString(item,'priority'));
      rationale=fdEditionRenderString(item,'rationale'); if(!id||!title||!url||!domain||!priority) continue;
      on=fdEditionRenderCompletion(localProgress,'resources',id);
      rows+='<li class="fd-localresource"><div class="fd-localresource__main">'+
        fdEditionLocalToggleMarkup('resources',id,title,priority,on)+'</div>'+
        '<span class="fd-localresource__label">Attending-provided local resource</span>'+
        '<span class="fd-external-domain">'+fdEditionStudentEscape(domain)+'</span>'+
        '<a class="fd-localresource__link" href="'+fdEditionStudentEscape(url)+'" target="_blank" rel="noopener noreferrer">Open resource ↗</a>'+
        (rationale?'<p class="fd-localresource__rationale">Attending rationale: '+fdEditionStudentEscape(rationale)+'</p>':'')+
        '</li>';
    }
    return rows?'<section class="fd-localresources" data-edition-week-resources><h3>Attending-provided local resources</h3><ul>'+rows+'</ul></section>':'';
  }catch(ignoreResources){ return ''; }
}

function fdEditionLocalToggleAllowed(active,kind,id){
  var selected,envelope,config,local,list,i,item;
  try{
    selected=fdEditionStudentValidEdition(active);
    if(!selected||(kind!=='checklist'&&kind!=='resources')||!fdEditionStudentId(id)) return false;
    envelope=selected.envelope; config=fdEditionRenderObject(envelope,'config');
    local=fdEditionRenderObject(config,'localOrientation'); list=fdEditionRenderArray(local,kind);
    if(!list) return false;
    for(i=0;i<list.length;i++){
      item=fdEditionRenderArrayValue(list,i);
      if(fdEditionStudentObject(item)&&fdEditionRenderString(item,'id')===id) return true;
    }
    return false;
  }catch(ignoreAllowed){ return false; }
}

function fdEditionActiveIdentity(active,index){
  var selected,indexEdition,indexFingerprint;
  try{
    selected=fdEditionStudentValidEdition(active); if(!selected) return null;
    indexEdition=fdEditionRenderObject(index,'edition'); if(!indexEdition) return null;
    indexFingerprint=fdEditionStudentFingerprint(fdEditionRenderString(indexEdition,'fingerprint'));
    if(!indexFingerprint||indexFingerprint!==selected.fingerprint) return null;
    return {snapshot:active,fingerprint:selected.fingerprint};
  }catch(ignoreIdentity){return null;}
}

function fdEditionSwitchMarkup(active,candidate){
  var selected=fdEditionStudentValidEdition(active),replacement=fdEditionStudentValidEdition(candidate);
  if(!selected||!replacement) return '';
  try{
    return '<dialog class="fd-edition-switch" aria-labelledby="fd-edition-switch-title"><h2 id="fd-edition-switch-title">Switch rotation edition?</h2>'+
      '<p>Your current edition: <code>'+fdEditionStudentEscape(selected.fingerprint)+'</code></p>'+
      '<p>Edition from this link: <code>'+fdEditionStudentEscape(replacement.fingerprint)+'</code></p>'+
      '<form method="dialog"><button type="button" value="decline">Keep current edition</button><button type="button" value="accept">Switch edition</button></form></dialog>';
  }catch(ignoreMarkup){ return ''; }
}

function fdEditionErrorMarkup(receipt){
  var safe=fdEditionStudentSafeReceipt(receipt,null,null),parts=[];
  parts.push('<section class="fd-edition-error" role="alert"><h2>Rotation edition unavailable</h2>');
  parts.push('<p>Diagnostic code: <code>'+fdEditionStudentEscape(safe.code)+'</code></p>');
  if(safe.schemaVersion!==null) parts.push('<p>Schema version: <code>'+fdEditionStudentEscape(safe.schemaVersion)+'</code></p>');
  if(safe.fingerprint) parts.push('<p>Edition fingerprint: <code>'+fdEditionStudentEscape(safe.fingerprint)+'</code></p>');
  if(safe.currentCoreRevision) parts.push('<p>Current core revision: <code>'+fdEditionStudentEscape(safe.currentCoreRevision)+'</code></p>');
  parts.push('</section>'); return parts.join('');
}

function fdEditionRuntimeReceipt(siteContext,code){
  var revision='';
  try{
    if(siteContext&&typeof siteContext.coreRevision==='string'&&/^[0-9a-f]{40}$/.test(siteContext.coreRevision))
      revision=siteContext.coreRevision;
  }catch(ignoreContext){ }
  return {code:code==='EDITION_CRYPTO'?'EDITION_CRYPTO':'EDITION_RUNTIME',schemaVersion:1,
    fingerprint:'',currentCoreRevision:revision};
}

function fdEditionRuntimeElement(documentValue,id){
  var method=fdEditionStudentMethod(documentValue,'getElementById');
  if(!method) return null;
  try{ return Function.prototype.call.call(method,documentValue,id); }
  catch(ignoreElement){ return null; }
}

function fdEditionRuntimeWritable(object,name){
  var cursor=object,descriptor,depth=0;
  if(object===null||(typeof object!=='object'&&typeof object!=='function')) return false;
  while(cursor!==null&&depth<8){
    try{ descriptor=Object.getOwnPropertyDescriptor(cursor,name); }catch(ignoreDescriptor){ return false; }
    if(descriptor){
      if(Object.prototype.hasOwnProperty.call(descriptor,'value')) return descriptor.writable===true;
      return typeof descriptor.set==='function';
    }
    try{ cursor=Object.getPrototypeOf(cursor); }catch(ignorePrototype){ return false; }
    depth+=1;
  }
  return false;
}

function fdEditionRuntimeDomReady(documentValue,app,mount){
  var create=fdEditionStudentMethod(documentValue,'createElement'),dialog,button;
  if(!documentValue||!app||!mount||!create||
     !fdEditionStudentMethod(app,'removeAttribute')||!fdEditionStudentMethod(app,'addEventListener')||
     !fdEditionStudentMethod(app,'removeEventListener')||!fdEditionStudentMethod(app,'querySelector')||
     !fdEditionRuntimeWritable(mount,'innerHTML')||!fdEditionStudentMethod(mount,'querySelector')) return false;
  try{ dialog=Function.prototype.call.call(create,documentValue,'dialog'); button=Function.prototype.call.call(create,documentValue,'button'); }
  catch(ignoreCreate){ return false; }
  return !!(dialog&&button&&fdEditionStudentMethod(dialog,'addEventListener')&&
    fdEditionStudentMethod(dialog,'querySelector')&&fdEditionStudentMethod(dialog,'showModal')&&
    fdEditionStudentMethod(dialog,'close')&&fdEditionStudentMethod(button,'addEventListener')&&
    fdEditionStudentMethod(button,'focus'));
}

function fdEditionRuntimeShellReady(app){
  var query=fdEditionStudentMethod(app,'querySelector'),content=null;
  if(!query) return false;
  try{ content=Function.prototype.call.call(query,app,'#content'); }
  catch(ignoreQuery){ return false; }
  return !!content;
}

function fdEditionRuntimeListen(target,type,handler,capture){
  var add=fdEditionStudentMethod(target,'addEventListener');
  var remove=fdEditionStudentMethod(target,'removeEventListener');
  if(!add||!remove||typeof type!=='string'||typeof handler!=='function') return {ok:false};
  try{ Function.prototype.call.call(add,target,type,handler,capture===true); }
  catch(ignoreListener){
    try{ Function.prototype.call.call(remove,target,type,handler,capture===true); }
    catch(ignoreFailedRemove){ }
    return {ok:false};
  }
  return {ok:true,target:target,type:type,handler:handler,capture:capture===true,
    removeMethod:remove,active:true};
}

function fdEditionRuntimeUnlisten(registration){
  if(!registration||registration.active!==true) return true;
  registration.active=false;
  try{
    Function.prototype.call.call(registration.removeMethod,registration.target,
      registration.type,registration.handler,registration.capture);
    return true;
  }catch(ignoreRemove){ return false; }
}

function fdEditionRuntimeRemoveBusy(app){
  var remove=fdEditionStudentMethod(app,'removeAttribute');
  if(!remove) return false;
  try{ Function.prototype.call.call(remove,app,'aria-busy'); return true; }
  catch(ignoreBusy){ return false; }
}

function fdEditionRuntimeReleaseGate(app){
  var remove=fdEditionStudentMethod(app,'removeAttribute');
  var set=fdEditionStudentMethod(app,'setAttribute');
  var has=fdEditionStudentMethod(app,'hasAttribute');
  var hadBusy=true,hadInert=true;
  if(!remove||!set) return false;
  try{
    if(has){
      hadBusy=Function.prototype.call.call(has,app,'aria-busy');
      hadInert=Function.prototype.call.call(has,app,'inert');
    }
    Function.prototype.call.call(remove,app,'inert');
    Function.prototype.call.call(remove,app,'aria-busy');
    return true;
  }catch(ignoreRelease){
    try{
      if(hadInert) Function.prototype.call.call(set,app,'inert','');
      if(hadBusy) Function.prototype.call.call(set,app,'aria-busy','true');
    }catch(ignoreRestore){ }
    return false;
  }
}

function fdEditionRuntimeInputs(windowValue,documentValue,app,mount,siteContext){
  var locationValue=null,historyValue=null,storage=null,cryptoValue=null,subtle=null,pageUrl='',hash='',stored,hashCleared=false;
  if(!fdEditionRuntimeDomReady(documentValue,app,mount))
    return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  try{ locationValue=windowValue&&windowValue.location; }
  catch(ignoreLocation){ locationValue=null; }
  if(!locationValue) return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  try{ pageUrl=locationValue.href; hash=locationValue.hash; }
  catch(ignoreLocationFields){ return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')}; }
  if(typeof pageUrl!=='string'||typeof hash!=='string')
    return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  if(!fdEditionPublicationEnabled(siteContext)){
    if(hash){
      try{ historyValue=windowValue&&windowValue.history; }catch(ignoreDisabledHistory){ historyValue=null; }
      if(!fdEditionRuntimeClearHash(locationValue,historyValue))
        return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
    }
    return {ok:true,location:locationValue,history:historyValue,storage:null,pageUrl:pageUrl,hash:hash,
      hashCleared:hash?true:true,storedText:null,subtle:null};
  }
  try{ storage=windowValue&&windowValue.localStorage; }
  catch(ignoreStorage){ storage=null; }
  if(!fdEditionStudentMethod(storage,'setItem'))
    return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  stored=fdEditionStudentRead(storage,FD_EDITION_STUDENT_KEYS.edition);
  if(!stored.ok) return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  if(hash){
    try{ historyValue=windowValue&&windowValue.history; }
    catch(ignoreHistory){ historyValue=null; }
    if(!fdEditionRuntimeClearHash(locationValue,historyValue))
      return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
    try{ hashCleared=locationValue.hash===''; }
    catch(ignoreClearedHash){ hashCleared=false; }
    if(!hashCleared) return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  }
  try{ cryptoValue=windowValue&&windowValue.crypto; }
  catch(ignoreCrypto){ cryptoValue=null; }
  if(!cryptoValue) return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_CRYPTO')};
  try{ subtle=cryptoValue.subtle; }
  catch(ignoreSubtle){ subtle=null; }
  if(!subtle||!fdEditionStudentMethod(subtle,'digest'))
    return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_CRYPTO')};
  return {ok:true,location:locationValue,history:historyValue,storage:storage,pageUrl:pageUrl,hash:hash,
    hashCleared:hash?hashCleared:true,storedText:stored.value,subtle:subtle};
}

function fdEditionRuntimeClearHash(locationValue,historyValue){
  var path='',search='',method=fdEditionStudentMethod(historyValue,'replaceState');
  if(!method) return false;
  try{ path=locationValue.pathname; search=locationValue.search; }
  catch(ignoreLocation){ return false; }
  if(typeof path!=='string'||typeof search!=='string') return false;
  try{ Function.prototype.call.call(method,historyValue,null,'',path+search); return true; }
  catch(ignoreHistory){ return false; }
}

function fdEditionRuntimeReload(locationValue){
  var method=fdEditionStudentMethod(locationValue,'reload'),result;
  if(!method) return false;
  try{ result=Function.prototype.call.call(method,locationValue); return result!==false; }
  catch(ignoreReload){ return false; }
}

function fdEditionRuntimeSwitchReady(locationValue,hashCleared){
  return hashCleared===true&&!!fdEditionStudentMethod(locationValue,'reload');
}

function fdEditionRuntimeMountError(mount,receipt){
  if(!mount) return false;
  try{ mount.innerHTML=fdEditionErrorMarkup(receipt); return true; }
  catch(ignoreMount){ return false; }
}

function fdEditionRuntimeRestoreActive(storage,validatedEdition){
  var edition=fdEditionStudentValidEdition(validatedEdition);
  return !!edition&&fdEditionStudentWrite(storage,FD_EDITION_STUDENT_KEYS.edition,edition.text);
}

function fdEditionRuntimeRecover(canonicalIndex,validatedEdition,siteContext,state,render){
  var selected=fdEditionStudentValidEdition(validatedEdition);
  var projected=selected?fdEditionStudentProject(canonicalIndex,validatedEdition,siteContext):null;
  if(!projected||!projected.ok||!projected.index||
     !fdEditionActiveIdentity(validatedEdition,projected.index)||typeof render!=='function') return false;
  try{ return render(projected.index,state,validatedEdition)===true; }
  catch(ignoreRender){ return false; }
}

function fdEditionRuntimeMountSwitch(mount,result,storage,locationValue,hashCleared,recover){
  var markup=fdEditionSwitchMarkup(result&&result.active,result&&result.candidate),dialog,keep,accept,
    dialogListener,keepListener,acceptListener,show,close,focus,state='pending';
  if(!mount||!markup||!fdEditionRuntimeSwitchReady(locationValue,hashCleared)||typeof recover!=='function') return false;
  try{ mount.innerHTML=markup; dialog=mount.querySelector('dialog.fd-edition-switch'); }
  catch(ignoreMount){ return false; }
  if(!dialog) return false;
  dialogListener=fdEditionStudentMethod(dialog,'addEventListener');
  show=fdEditionStudentMethod(dialog,'showModal');
  close=fdEditionStudentMethod(dialog,'close');
  try{ keep=dialog.querySelector('button[value="decline"]'); accept=dialog.querySelector('button[value="accept"]'); }
  catch(ignoreButtons){ return false; }
  keepListener=fdEditionStudentMethod(keep,'addEventListener');
  acceptListener=fdEditionStudentMethod(accept,'addEventListener');
  focus=fdEditionStudentMethod(keep,'focus');
  if(!dialogListener||!show||!close||!keep||!accept||!keepListener||!acceptListener||!focus) return false;
  function prevent(event){
    var method=fdEditionStudentMethod(event,'preventDefault');
    if(method) try{ Function.prototype.call.call(method,event); }catch(ignorePrevent){ }
  }
  function lock(){
    try{ keep.disabled=true; }catch(ignoreKeepLock){ }
    try{ accept.disabled=true; }catch(ignoreAcceptLock){ }
  }
  function fail(){
    fdEditionRuntimeMountError(mount,fdEditionRuntimeReceipt(null,'EDITION_RUNTIME'));
  }
  function decide(accepted,event){
    var restored=false,recovered=false;
    prevent(event);
    if(state!=='pending') return;
    state='working'; lock();
    if(!accepted){
      try{ Function.prototype.call.call(close,dialog); mount.innerHTML=''; state='done'; }
      catch(ignoreDeclineClose){ state='failed'; fail(); }
      return;
    }
    if(!fdEditionAcceptSwitch(storage,result.candidate)){ state='failed'; fail(); return; }
    if(fdEditionRuntimeReload(locationValue)){ state='done'; return; }
    restored=fdEditionRuntimeRestoreActive(storage,result.active);
    if(!restored){
      try{ recovered=recover(result.candidate)===true; }catch(ignoreRecovery){ recovered=false; }
    }
    state=recovered||restored?'recovered':'failed';
    fail();
  }
  try{
    Function.prototype.call.call(acceptListener,accept,'click',function(event){ decide(true,event); });
    Function.prototype.call.call(keepListener,keep,'click',function(event){ decide(false,event); });
    Function.prototype.call.call(dialogListener,dialog,'cancel',function(event){ decide(false,event); });
    Function.prototype.call.call(show,dialog);
    Function.prototype.call.call(focus,keep);
    return true;
  }catch(ignoreDialog){ return false; }
}
