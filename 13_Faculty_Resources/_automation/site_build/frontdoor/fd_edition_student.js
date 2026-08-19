/* Pure learner edition startup, explicit storage commits, and safe status markup. */
var FD_EDITION_STUDENT_KEYS={edition:'cw_rotation_edition_v1',local:'cw_rotation_local_progress_v1'};
var FD_EDITION_STUDENT_FINGERPRINT=/^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/;
var FD_EDITION_STUDENT_ID=/^[a-z][a-z0-9:_-]{0,127}$/;
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

function fdEditionStudentSafeReceipt(result,siteContext,code){
  var receipt,codeData,versionData,fingerprintData,revisionData;
  if(fdEditionStudentObject(result)){
    codeData=fdEditionStudentData(result,'code'); versionData=fdEditionStudentData(result,'schemaVersion');
    fingerprintData=fdEditionStudentData(result,'fingerprint'); revisionData=fdEditionStudentData(result,'currentCoreRevision');
    if(codeData.ok&&FD_EDITION_STUDENT_CODES[codeData.value]){
      return {
        code:FD_EDITION_STUDENT_CODES[code] ? code : codeData.value,
        schemaVersion:versionData.ok&&typeof versionData.value==='number'&&isFinite(versionData.value)&&Math.floor(versionData.value)===versionData.value&&versionData.value>0?versionData.value:null,
        fingerprint:fingerprintData.ok?fdEditionStudentFingerprint(fingerprintData.value):'',
        currentCoreRevision:revisionData.ok&&typeof revisionData.value==='string'&&/^[0-9a-f]{40}$/.test(revisionData.value)?revisionData.value:''
      };
    }
  }
  try{ receipt=fdEditionDiagnostic(result,siteContext); }
  catch(ignoreDiagnostic){ receipt=null; }
  if(!fdEditionStudentObject(receipt)) receipt={code:'EDITION_RUNTIME',schemaVersion:null,fingerprint:'',currentCoreRevision:''};
  return {
    code:FD_EDITION_STUDENT_CODES[code] ? code : (FD_EDITION_STUDENT_CODES[receipt.code] ? receipt.code : 'EDITION_RUNTIME'),
    schemaVersion:typeof receipt.schemaVersion==='number'&&isFinite(receipt.schemaVersion)&&Math.floor(receipt.schemaVersion)===receipt.schemaVersion&&receipt.schemaVersion>0?receipt.schemaVersion:null,
    fingerprint:fdEditionStudentFingerprint(receipt.fingerprint),
    currentCoreRevision:typeof receipt.currentCoreRevision==='string'&&/^[0-9a-f]{40}$/.test(receipt.currentCoreRevision)?receipt.currentCoreRevision:''
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
  var accepted,envelope,fingerprint;
  if(!fdEditionStudentObject(value)) return null;
  accepted=fdEditionStudentData(value,'ok');
  if(!accepted.ok||accepted.value!==true) return null;
  envelope=fdEditionStudentData(value,'envelope'); fingerprint=fdEditionStudentData(value,'fingerprint');
  if(!envelope.ok||!fdEditionStudentObject(envelope.value)||!fingerprint.ok||!fdEditionStudentFingerprint(fingerprint.value)) return null;
  try{ return {envelope:envelope.value,fingerprint:fingerprint.value,text:JSON.stringify(envelope.value)}; }
  catch(ignoreSerialize){ return null; }
}

function fdEditionStudentRead(storage,key){
  if(!storage||typeof storage.getItem!=='function') return {ok:false,value:null};
  try{ return {ok:true,value:storage.getItem(key)}; }
  catch(ignoreRead){ return {ok:false,value:null}; }
}

function fdEditionStudentLocalDocument(text){
  var parsed,root,buckets,keys,i,key,bucket,checklist,resources,out={schemaVersion:1,byFingerprint:{}};
  if(typeof text!=='string'||text.length>FD_EDITION_RULES.maxUrlChars) return out;
  try{ parsed=JSON.parse(text); }catch(ignoreParse){ return out; }
  root=fdEditionStudentData(parsed,'schemaVersion'); buckets=fdEditionStudentData(parsed,'byFingerprint');
  if(!root.ok||root.value!==1||!buckets.ok||!fdEditionStudentObject(buckets.value)) return out;
  try{ keys=Object.keys(buckets.value); }catch(ignoreKeys){ return out; }
  for(i=0;i<keys.length;i++){
    key=keys[i]; if(!fdEditionStudentFingerprint(key)) continue;
    bucket=fdEditionStudentData(buckets.value,key); if(!bucket.ok) continue;
    checklist=fdEditionStudentData(bucket.value,'checklist'); resources=fdEditionStudentData(bucket.value,'resources');
    if(!checklist.ok||!resources.ok||!fdEditionStudentObject(checklist.value)||!fdEditionStudentObject(resources.value)) continue;
    out.byFingerprint[key]={checklist:fdEditionStudentCompletion(checklist.value),resources:fdEditionStudentCompletion(resources.value)};
  }
  return out;
}

function fdEditionStudentCompletion(value){
  var keys,i,key,out={};
  try{ keys=Object.keys(value); }catch(ignoreKeys){ return out; }
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(!FD_EDITION_STUDENT_ID.test(key)) continue;
    try{ if(value[key]===true) out[key]=true; }catch(ignoreValue){}
  }
  return out;
}

function fdEditionStudentWrite(storage,key,value){
  if(!storage||typeof storage.setItem!=='function') return false;
  try{ storage.setItem(key,value); return true; }
  catch(ignoreWrite){ return false; }
}

function fdEditionStudentAccept(storage,validatedEdition){
  var edition=fdEditionStudentValidEdition(validatedEdition),stored,local;
  if(!edition) return false;
  stored=fdEditionStudentRead(storage,FD_EDITION_STUDENT_KEYS.local);
  if(!stored.ok) return false;
  local=fdEditionStudentLocalDocument(stored.value);
  if(!local.byFingerprint[edition.fingerprint]) local.byFingerprint[edition.fingerprint]={checklist:{},resources:{}};
  try{ local=JSON.stringify(local); }catch(ignoreLocalSerialize){ return false; }
  return fdEditionStudentWrite(storage,FD_EDITION_STUDENT_KEYS.edition,edition.text)&&
    fdEditionStudentWrite(storage,FD_EDITION_STUDENT_KEYS.local,local);
}

function fdEditionAcceptFirst(storage,validatedEdition){ return fdEditionStudentAccept(storage,validatedEdition); }
function fdEditionAcceptSwitch(storage,validatedEdition){ return fdEditionStudentAccept(storage,validatedEdition); }

function fdEditionReadLocalProgress(storage,fingerprint){
  var valid=fdEditionStudentFingerprint(fingerprint),stored,document,bucket;
  if(!valid) return {checklist:{},resources:{}};
  stored=fdEditionStudentRead(storage,FD_EDITION_STUDENT_KEYS.local);
  if(!stored.ok) return {checklist:{},resources:{}};
  document=fdEditionStudentLocalDocument(stored.value);
  bucket=document.byFingerprint[valid];
  return bucket?{checklist:bucket.checklist,resources:bucket.resources}:{checklist:{},resources:{}};
}

function fdEditionToggleLocalProgress(storage,fingerprint,kind,id){
  var valid=fdEditionStudentFingerprint(fingerprint),stored,document,bucket;
  if(!valid||(kind!=='checklist'&&kind!=='resources')||typeof id!=='string'||!FD_EDITION_STUDENT_ID.test(id)) return false;
  stored=fdEditionStudentRead(storage,FD_EDITION_STUDENT_KEYS.local);
  if(!stored.ok) return false;
  document=fdEditionStudentLocalDocument(stored.value);
  bucket=document.byFingerprint[valid]||(document.byFingerprint[valid]={checklist:{},resources:{}});
  if(bucket[kind][id]) delete bucket[kind][id]; else bucket[kind][id]=true;
  try{ return fdEditionStudentWrite(storage,FD_EDITION_STUDENT_KEYS.local,JSON.stringify(document)); }
  catch(ignoreSerialize){ return false; }
}

function fdEditionStudentEscape(value){
  return String(value).replace(/[&<>"']/g,function(character){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
  });
}

function fdEditionSwitchMarkup(active,candidate){
  var from=fdEditionStudentFingerprint(active&&active.fingerprint),to=fdEditionStudentFingerprint(candidate&&candidate.fingerprint);
  return '<dialog class="fd-edition-switch" aria-labelledby="fd-edition-switch-title"><h2 id="fd-edition-switch-title">Switch rotation edition?</h2>'+
    '<p>Your current edition: <code>'+fdEditionStudentEscape(from||'Unavailable')+'</code></p>'+
    '<p>Edition from this link: <code>'+fdEditionStudentEscape(to||'Unavailable')+'</code></p>'+
    '<form method="dialog"><button value="decline">Keep current edition</button><button value="accept">Switch edition</button></form></dialog>';
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
