/* Pure learner edition startup, explicit storage commits, and safe status markup. */
var FD_EDITION_STUDENT_KEYS={edition:'cw_rotation_edition_v1',local:'cw_rotation_local_progress_v1'};
var FD_EDITION_STUDENT_FINGERPRINT=/^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/;
var FD_EDITION_STUDENT_ID=/^[\x21-\x7e]{1,160}$/;
var FD_EDITION_STUDENT_DANGEROUS={__proto__:true,constructor:true,prototype:true};
var FD_EDITION_STUDENT_CODES={
  EDITION_SCHEMA:true,EDITION_DIGEST:true,EDITION_AUDIENCE:true,EDITION_REF:true,
  EDITION_WEEK:true,EDITION_SIZE:true,EDITION_URL:true,EDITION_TEXT_RISK:true,
  EDITION_CRYPTO:true,EDITION_PROJECT:true,EDITION_RUNTIME:true
};

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
  catch(ignoreListener){ return {ok:false}; }
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
  var projected=fdEditionStudentProject(canonicalIndex,validatedEdition,siteContext);
  if(!projected.ok||!projected.index||typeof render!=='function') return false;
  try{ return render(projected.index,state)===true; }
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
