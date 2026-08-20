/* V2-only learner edition startup, bounded local state, and trusted-model rendering. */
var FD_EDITION_STUDENT_FINGERPRINT=/^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/;
var FD_EDITION_STUDENT_ID=/^[\x21-\x7e]{1,160}$/;
var FD_EDITION_STUDENT_OWN=Object.prototype.hasOwnProperty;
var FD_EDITION_STUDENT_AUTHORITY={
  coreLabel:'Reviewed clerkship Library',
  localLabel:'Local rotation guidance',
  requiredLabel:'Required by this local rotation',
  recommendedLabel:'Recommended by this local rotation',
  optionalLabel:'Optional for this local rotation',
  resourceLabel:'Locally curated official resource',
  localBoundary:'Local rotation guidance does not replace current institutional policy or supervision.',
  documentationGuardrail:'Use only the approved institutional record. Do not place patient information in this site. Complete documentation only with supervisor guidance and review.'
};
var FD_EDITION_STUDENT_LINEAGE='Locally supplied edition summary; change lineage is not authenticated.';

function fdEditionStudentObject(value){
  var prototype;
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  try{prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;}
  catch(ignore){return false;}
}

function fdEditionStudentMethod(object,name){
  var cursor=object,descriptor,depth=0;
  if(object===null||(typeof object!=='object'&&typeof object!=='function'))return null;
  while(cursor!==null&&depth<8){
    try{descriptor=Object.getOwnPropertyDescriptor(cursor,name);}catch(ignoreDescriptor){return null;}
    if(descriptor){
      if(!FD_EDITION_STUDENT_OWN.call(descriptor,'value')||typeof descriptor.value!=='function')return null;
      return descriptor.value;
    }
    try{cursor=Object.getPrototypeOf(cursor);}catch(ignorePrototype){return null;}
    depth+=1;
  }
  return null;
}

function fdEditionStudentExact(value,required,optional){
  var keys,i,key,allowed=Object.create(null);
  if(!fdEditionStudentObject(value))return false;
  for(i=0;i<required.length;i++){key=required[i];allowed[key]=true;if(!FD_EDITION_STUDENT_OWN.call(value,key))return false;}
  for(i=0;i<optional.length;i++)allowed[optional[i]]=true;
  try{keys=Object.keys(value);}catch(ignoreKeys){return false;}
  for(i=0;i<keys.length;i++)if(!allowed[keys[i]])return false;
  return true;
}

function fdEditionStudentRead(storage,key){
  var method=fdEditionStudentMethod(storage,'getItem');
  if(!method)return {ok:false,value:null};
  try{return {ok:true,value:Function.prototype.call.call(method,storage,key)};}catch(ignoreRead){return {ok:false,value:null};}
}

function fdEditionStudentWrite(storage,key,value){
  var method=fdEditionStudentMethod(storage,'setItem');
  if(!method)return false;
  try{Function.prototype.call.call(method,storage,key,value);return true;}catch(ignoreWrite){return false;}
}

function fdEditionStudentReceipt(siteContext,code,fingerprint){
  var revision='';
  try{if(siteContext&&typeof siteContext.coreRevision==='string'&&/^[0-9a-f]{40}$/.test(siteContext.coreRevision))revision=siteContext.coreRevision;}catch(ignore){}
  return {code:code,schemaVersion:2,fingerprint:FD_EDITION_STUDENT_FINGERPRINT.test(fingerprint||'')?fingerprint:'',currentCoreRevision:revision};
}

function fdEditionStudentCore(index,siteContext,code){
  return {mode:code?'rejected':'core',index:index,active:null,candidate:null,needsCommit:false,receipt:code?fdEditionStudentReceipt(siteContext,code,''):null};
}

function fdEditionStudentEnvelopeVersion(text,isPayload){
  var raw=text,value;
  try{
    if(typeof raw!=='string'||!raw||raw.length>16000)return null;
    if(isPayload){raw=raw.replace(/-/g,'+').replace(/_/g,'/');while(raw.length%4)raw+='=';raw=decodeURIComponent(Array.prototype.map.call(atob(raw),function(c){return '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2);}).join(''));}
    value=JSON.parse(raw);
    return fdEditionStudentObject(value)&&value.format==='cw-rotation-edition'&&Number.isInteger(value.schemaVersion)?value.schemaVersion:null;
  }catch(ignore){return null;}
}

function fdEditionStudentFailureCode(result){
  var code='';
  try{if(result&&Array.isArray(result.errors)&&result.errors.length&&typeof result.errors[0].code==='string')code=result.errors[0].code;}catch(ignore){}
  return /CATALOG|RECORD|BLOCKED|DEPRECATED|MISSING/.test(code)?'EDITION_RESELECTION_REQUIRED':'EDITION_INVALID';
}

function fdEditionStudentValidateStored(text,canonicalIndex,catalogSnapshot,siteContext,subtle){
  var value;
  if(text===null||text==='')return Promise.resolve({kind:'empty',value:null});
  if(fdEditionStudentEnvelopeVersion(text,false)===1)return Promise.resolve({kind:'v1',value:null});
  try{value=JSON.parse(text);}catch(ignoreParse){return Promise.resolve({kind:'invalid',value:null});}
  return fdEditionValidateEnvelope(value,canonicalIndex,catalogSnapshot,siteContext,{mode:'learner',generationDate:''},subtle).then(function(result){
    return result&&result.ok&&fdEditionTrustedSnapshot(result)?{kind:'valid',value:result}:{kind:fdEditionStudentFailureCode(result)==='EDITION_RESELECTION_REQUIRED'?'reselection':'invalid',value:null};
  },function(){return {kind:'invalid',value:null};});
}

function fdEditionStudentCompleteUrlLength(pageUrl,hash){
  var fragmentAt;
  if(typeof pageUrl!=='string'||typeof hash!=='string')return -1;
  fragmentAt=pageUrl.indexOf('#');
  if(fragmentAt<0)return pageUrl.length+hash.length;
  return pageUrl.slice(fragmentAt)===hash?pageUrl.length:-1;
}

function fdEditionStudentValidateIncoming(hash,pageUrl,canonicalIndex,catalogSnapshot,siteContext,subtle){
  var payload='',completeUrlLength=fdEditionStudentCompleteUrlLength(pageUrl,hash);
  if(!hash)return Promise.resolve({kind:'empty',value:null});
  try{if(typeof hash!=='string'||hash.indexOf('#edition=')!==0||hash.indexOf('&')>=0||completeUrlLength<0||completeUrlLength>16000)return Promise.resolve({kind:'invalid',value:null});payload=hash.slice(9);}catch(ignoreHash){return Promise.resolve({kind:'invalid',value:null});}
  if(fdEditionStudentEnvelopeVersion(payload,true)===1)return Promise.resolve({kind:'v1',value:null});
  return fdEditionDecodePayload(payload,canonicalIndex,catalogSnapshot,siteContext,{mode:'learner',generationDate:''},subtle,completeUrlLength).then(function(result){
    return result&&result.ok&&fdEditionTrustedSnapshot(result)?{kind:'valid',value:result}:{kind:fdEditionStudentFailureCode(result)==='EDITION_RESELECTION_REQUIRED'?'reselection':'invalid',value:null};
  },function(){return {kind:'invalid',value:null};});
}

function fdEditionStudentProject(canonicalIndex,validated){
  var projected;
  try{projected=fdProjectEdition(canonicalIndex,validated);return projected&&projected.ok&&projected.index?projected:null;}catch(ignore){return null;}
}

function fdEditionResolveStartup(canonicalIndex,catalogSnapshot,siteContext,pageUrl,incomingHash,storedText,subtle){
  var enabled=false;
  try{
    if(siteContext&&siteContext.rotationEditionV2==='disabled')return Promise.resolve(fdEditionStudentCore(canonicalIndex,siteContext,incomingHash?'EDITION_DISABLED':''));
    enabled=typeof fdEditionPublicationEnabled==='function'&&fdEditionPublicationEnabled(catalogSnapshot)===true;
  }catch(ignoreGate){enabled=false;}
  if(!enabled)return Promise.resolve(fdEditionStudentCore(canonicalIndex,siteContext,incomingHash?'EDITION_CATALOG_UNAVAILABLE':''));
  return Promise.all([
    fdEditionStudentValidateStored(storedText,canonicalIndex,catalogSnapshot,siteContext,subtle),
    fdEditionStudentValidateIncoming(incomingHash,pageUrl,canonicalIndex,catalogSnapshot,siteContext,subtle)
  ]).then(function(values){
    var stored=values[0],incoming=values[1],active=null,candidate=null,projected,code='';
    if(stored.kind==='v1'||incoming.kind==='v1')code='EDITION_PRERELEASE_UNSUPPORTED';
    else if(stored.kind==='reselection'||incoming.kind==='reselection')code='EDITION_RESELECTION_REQUIRED';
    else if(stored.kind==='invalid'||incoming.kind==='invalid')code='EDITION_INVALID';
    if(code)return fdEditionStudentCore(canonicalIndex,siteContext,code);
    if(stored.kind==='valid')active=stored.value;
    if(incoming.kind==='valid'){
      if(active&&active.fingerprint!==incoming.value.fingerprint)candidate=incoming.value;
      else active=incoming.value;
    }
    if(!active)return fdEditionStudentCore(canonicalIndex,siteContext,'');
    projected=fdEditionStudentProject(canonicalIndex,active);
    if(!projected)return fdEditionStudentCore(canonicalIndex,siteContext,'EDITION_INVALID');
    if(candidate)return {mode:'switch-required',index:projected.index,active:active,candidate:candidate,needsCommit:false,receipt:null};
    return {mode:'active',index:projected.index,active:active,candidate:null,needsCommit:stored.kind!=='valid',receipt:null};
  },function(){return fdEditionStudentCore(canonicalIndex,siteContext,'EDITION_INVALID');});
}

/* Exact-write journal: rollback touches only bytes this startup can still prove it owns. */
function fdEditionStartupJournal(storage,allowedKeys){
  var get=fdEditionStudentMethod(storage,'getItem'),set=fdEditionStudentMethod(storage,'setItem'),remove=fdEditionStudentMethod(storage,'removeItem');
  var allowed=Object.create(null),i,key;
  if(!get||!set||!remove||!Array.isArray(allowedKeys))return null;
  for(i=0;i<allowedKeys.length;i++){key=allowedKeys[i];if(typeof key!=='string'||!key||FD_EDITION_STUDENT_OWN.call(allowed,key))return null;allowed[key]=true;}
  return {storage:storage,get:get,set:set,remove:remove,allowed:allowed,records:Object.create(null),order:[],blocked:Object.create(null),failed:false};
}

function fdEditionStartupJournalValue(journal,key){
  if(!journal||!FD_EDITION_STUDENT_OWN.call(journal.allowed,key))return {ok:false,value:null};
  try{return {ok:true,value:Function.prototype.call.call(journal.get,journal.storage,key)};}catch(ignore){return {ok:false,value:null};}
}

function fdEditionStartupJournalRun(journal,keys,operation){
  var before=[],after=[],seen=Object.create(null),i,key,value,record,threw=false,readFailed=false,result=null;
  if(!journal||!Array.isArray(keys)||typeof operation!=='function')return {ok:false,value:null};
  for(i=0;i<keys.length;i++){
    key=keys[i];if(typeof key!=='string'||FD_EDITION_STUDENT_OWN.call(seen,key)||!FD_EDITION_STUDENT_OWN.call(journal.allowed,key))return {ok:false,value:null};seen[key]=true;
    value=fdEditionStartupJournalValue(journal,key);if(!value.ok){journal.blocked[key]=true;journal.failed=true;return {ok:false,value:null};}
    record=journal.records[key];if(journal.blocked[key]||(record&&record.expected!==value.value)){journal.blocked[key]=true;journal.failed=true;return {ok:false,value:null};}before.push(value.value);
  }
  try{result=operation();}catch(ignoreOperation){threw=true;}
  for(i=0;i<keys.length;i++){value=fdEditionStartupJournalValue(journal,keys[i]);if(!value.ok){journal.blocked[keys[i]]=true;journal.failed=true;readFailed=true;after.push(null);}else after.push(value.value);}
  for(i=0;i<keys.length;i++){key=keys[i];if(journal.blocked[key]||before[i]===after[i])continue;record=journal.records[key];if(record)record.expected=after[i];else{journal.records[key]={key:key,original:before[i],expected:after[i]};journal.order.push(key);}}
  return {ok:!threw&&!readFailed,value:threw||readFailed?null:result};
}

function fdEditionStartupJournalRollback(journal){
  var record,current,key,ok;
  if(!journal||!Array.isArray(journal.order)||!journal.records||!journal.blocked)return false;
  ok=!journal.failed;
  for(var i=journal.order.length-1;i>=0;i--){
    key=journal.order[i];if(journal.blocked[key])continue;record=journal.records[key];current=fdEditionStartupJournalValue(journal,key);
    if(!current.ok){journal.blocked[key]=true;ok=false;continue;}if(current.value!==record.expected){journal.blocked[key]=true;ok=false;continue;}
    try{if(record.original===null)Function.prototype.call.call(journal.remove,journal.storage,key);else Function.prototype.call.call(journal.set,journal.storage,key,record.original);}catch(ignoreRestore){journal.blocked[key]=true;ok=false;}
  }
  journal.records=Object.create(null);journal.order=[];return ok;
}

function fdEditionStudentFingerprint(value){return typeof value==='string'&&FD_EDITION_STUDENT_FINGERPRINT.test(value)?value:'';}
function fdEditionStudentId(value){return typeof value==='string'&&FD_EDITION_STUDENT_ID.test(value)&&value!=='__proto__'&&value!=='constructor'&&value!=='prototype'?value:'';}
function fdEditionStudentEmptyBucket(){return {checklist:Object.create(null),resources:Object.create(null)};}
function fdEditionStudentEmptyLocal(){return {schemaVersion:2,byFingerprint:Object.create(null)};}

function fdEditionStudentBucket(value){
  var kinds=['checklist','resources'],limits=[24,12],out=fdEditionStudentEmptyBucket(),i,j,keys;
  if(!fdEditionStudentExact(value,kinds,[]))return null;
  for(i=0;i<kinds.length;i++){
    if(!fdEditionStudentObject(value[kinds[i]]))return null;keys=Object.keys(value[kinds[i]]);if(keys.length>limits[i])return null;
    for(j=0;j<keys.length;j++){if(!fdEditionStudentId(keys[j])||value[kinds[i]][keys[j]]!==true)return null;out[kinds[i]][keys[j]]=true;}
  }
  return out;
}

function fdEditionStudentLocalDocument(value){
  var parsed=value,keys,i,bucket,out=fdEditionStudentEmptyLocal();
  try{if(value===null||typeof value==='undefined'||value==='')return {ok:true,document:out};if(typeof value==='string')parsed=JSON.parse(value);}catch(ignoreParse){return {ok:false,document:null};}
  if(!fdEditionStudentExact(parsed,['schemaVersion','byFingerprint'],[])||parsed.schemaVersion!==2||!fdEditionStudentObject(parsed.byFingerprint))return {ok:false,document:null};
  try{keys=Object.keys(parsed.byFingerprint);}catch(ignoreKeys){return {ok:false,document:null};}if(keys.length>128)return {ok:false,document:null};
  for(i=0;i<keys.length;i++){if(!fdEditionStudentFingerprint(keys[i]))return {ok:false,document:null};bucket=fdEditionStudentBucket(parsed.byFingerprint[keys[i]]);if(!bucket)return {ok:false,document:null};out.byFingerprint[keys[i]]=bucket;}
  return {ok:true,document:out};
}

function fdEditionStudentAllowed(displayModel){
  var allowed={checklist:Object.create(null),resources:Object.create(null)},list,i,id;
  try{
    if(!fdEditionStudentObject(displayModel)||!fdEditionStudentObject(displayModel.firstDay)||!Array.isArray(displayModel.firstDay.checklistItems)||!Array.isArray(displayModel.resources))return null;
    list=displayModel.firstDay.checklistItems;for(i=0;i<list.length;i++){id=fdEditionStudentId(list[i]&&list[i].id);if(!id)return null;allowed.checklist[id]=true;}
    list=displayModel.resources;for(i=0;i<list.length;i++){id=fdEditionStudentId(list[i]&&list[i].id);if(!id)return null;allowed.resources[id]=true;}
    return allowed;
  }catch(ignore){return null;}
}

function fdEditionReadLocalDocument(storage,keys){
  var stored,parsed;
  if(!keys||typeof keys.local!=='string')return null;stored=fdEditionStudentRead(storage,keys.local);if(!stored.ok)return null;parsed=fdEditionStudentLocalDocument(stored.value);return parsed.ok?parsed.document:null;
}

function fdEditionReadLocal(storage,keys,fingerprint,displayModel){
  var fp=fdEditionStudentFingerprint(fingerprint),document,bucket,allowed,out={checklist:{},resources:{}},kind,ids,i;
  if(!fp||(allowed=fdEditionStudentAllowed(displayModel))===null)return out;document=fdEditionReadLocalDocument(storage,keys);if(!document)return out;bucket=document.byFingerprint[fp];if(!bucket)return out;
  for(kind in out)if(FD_EDITION_STUDENT_OWN.call(out,kind)){ids=Object.keys(bucket[kind]);for(i=0;i<ids.length;i++)if(allowed[kind][ids[i]])out[kind][ids[i]]=true;}
  return out;
}

function fdEditionToggleLocal(storage,keys,fingerprint,kind,id,displayModel){
  var fp=fdEditionStudentFingerprint(fingerprint),allowed,document,bucket,ids,text;
  if(!fp||(kind!=='checklist'&&kind!=='resources')||!fdEditionStudentId(id)||(allowed=fdEditionStudentAllowed(displayModel))===null||!allowed[kind][id])return false;
  document=fdEditionReadLocalDocument(storage,keys);if(!document)return false;bucket=document.byFingerprint[fp];
  if(!bucket){if(Object.keys(document.byFingerprint).length>=128)return false;bucket=fdEditionStudentEmptyBucket();document.byFingerprint[fp]=bucket;}
  if(bucket[kind][id])delete bucket[kind][id];else{ids=Object.keys(bucket[kind]);if(ids.length>=(kind==='checklist'?24:12))return false;bucket[kind][id]=true;}
  try{text=JSON.stringify(document);JSON.parse(text);}catch(ignoreSerialize){return false;}return fdEditionStudentWrite(storage,keys.local,text);
}

/* The shell's long-standing action vocabulary retains this name, but the v2-only
   signature and validation path stay entirely in fdEditionToggleLocal. */
function fdEditionToggleLocalProgress(storage,keys,fingerprint,kind,id,displayModel){
  return fdEditionToggleLocal(storage,keys,fingerprint,kind,id,displayModel);
}

function fdEditionCommitAcceptance(storage,keys,validatedEdition,localDocument,journal){
  var trusted,fp,parsedLocal,bucket,editionText,localText,run,rolled;
  try{
    trusted=fdEditionTrustedSnapshot(validatedEdition);if(!trusted||!trusted.envelope||trusted.envelope.schemaVersion!==2||!fdEditionStudentFingerprint(trusted.fingerprint)||!keys||typeof keys.local!=='string'||typeof keys.edition!=='string')throw new Error('invalid');
    fp=trusted.fingerprint;parsedLocal=fdEditionStudentLocalDocument(localDocument);if(!parsedLocal.ok)throw new Error('invalid');
    if(!parsedLocal.document.byFingerprint[fp]){if(Object.keys(parsedLocal.document.byFingerprint).length>=128)return {ok:false,code:'EDITION_LOCAL_CAPACITY'};parsedLocal.document.byFingerprint[fp]=fdEditionStudentEmptyBucket();}
    localText=JSON.stringify(parsedLocal.document);if(!fdEditionStudentLocalDocument(JSON.parse(localText)).ok)throw new Error('invalid');
    editionText=JSON.stringify(trusted.envelope);if(JSON.parse(editionText).schemaVersion!==2)throw new Error('invalid');
  }catch(ignorePrepare){return {ok:false,code:'EDITION_STORAGE'};}
  run=fdEditionStartupJournalRun(journal,[keys.local,keys.edition],function(){
    var localAfter,editionAfter;
    if(!fdEditionStudentWrite(storage,keys.local,localText))throw new Error('local');
    if(!fdEditionStudentWrite(storage,keys.edition,editionText))throw new Error('edition');
    localAfter=fdEditionStudentRead(storage,keys.local);editionAfter=fdEditionStudentRead(storage,keys.edition);
    if(!localAfter.ok||!editionAfter.ok||localAfter.value!==localText||editionAfter.value!==editionText)return false;
    return true;
  });
  if(run.ok&&run.value===true)return {ok:true,code:'EDITION_ACCEPTED'};
  rolled=fdEditionStartupJournalRollback(journal);
  return rolled?{ok:false,code:'EDITION_STORAGE'}:{ok:false,code:'EDITION_STORAGE',irrecoverable:true};
}

function fdEditionStudentValidEdition(value){
  var trusted;
  try{trusted=fdEditionTrustedSnapshot(value);if(!trusted||!fdEditionStudentFingerprint(trusted.fingerprint)||!trusted.envelope||trusted.envelope.schemaVersion!==2)return null;return {fingerprint:trusted.fingerprint,envelope:trusted.envelope,displayModel:trusted.displayModel};}catch(ignore){return null;}
}

function fdEditionLocalToggleAllowed(active,kind,id){
  var edition=fdEditionStudentValidEdition(active),allowed;if(!edition||(allowed=fdEditionStudentAllowed(edition.displayModel))===null)return false;return !!(allowed[kind]&&allowed[kind][id]);
}

function fdEditionActiveIdentity(active,index){
  var edition=fdEditionStudentValidEdition(active),fingerprint='';
  try{fingerprint=index&&index.edition&&index.edition.card&&fdEditionStudentFingerprint(index.edition.card.fingerprint);}catch(ignore){}
  return edition&&fingerprint===edition.fingerprint?{snapshot:active,fingerprint:fingerprint,displayModel:edition.displayModel}:null;
}

function fdEditionStudentAuthority(model){
  var keys=Object.keys(FD_EDITION_STUDENT_AUTHORITY),i;
  if(!fdEditionStudentObject(model)||!fdEditionStudentExact(model.authority,keys,[]))return false;
  for(i=0;i<keys.length;i++)if(model.authority[keys[i]]!==FD_EDITION_STUDENT_AUTHORITY[keys[i]])return false;
  return !!(model.changeSummary&&model.changeSummary.provenanceLabel===FD_EDITION_STUDENT_LINEAGE);
}

function fdEditionStudentDom(root,documentObject){
  return !!(root&&fdEditionStudentMethod(root,'replaceChildren')&&fdEditionStudentMethod(root,'appendChild')&&documentObject&&fdEditionStudentMethod(documentObject,'createElement'));
}

function fdEditionStudentElement(documentObject,tag,text,className){
  var el=Function.prototype.call.call(fdEditionStudentMethod(documentObject,'createElement'),documentObject,tag);
  if(className)el.setAttribute('class',className);if(typeof text==='string')el.textContent=text;return el;
}

function fdEditionStudentAppend(parent,documentObject,tag,text,className){var el=fdEditionStudentElement(documentObject,tag,text,className);parent.appendChild(el);return el;}
function fdEditionStudentClear(root){try{root.replaceChildren();}catch(ignore){}}
function fdEditionStudentPriority(priority){return priority==='required'?FD_EDITION_STUDENT_AUTHORITY.requiredLabel:priority==='recommended'?FD_EDITION_STUDENT_AUTHORITY.recommendedLabel:priority==='optional'?FD_EDITION_STUDENT_AUTHORITY.optionalLabel:'';}

function fdEditionRenderCard(root,displayModel,documentObject){
  var card,revisions,section,summary,list,i,row,status,focus;
  if(!fdEditionStudentDom(root,documentObject)){fdEditionStudentClear(root);return false;}
  try{
    if(!fdEditionStudentAuthority(displayModel))throw new Error('model');card=displayModel.card;revisions=displayModel.revisions;
    if(!fdEditionStudentObject(card)||!fdEditionStudentObject(revisions)||!fdEditionStudentFingerprint(card.fingerprint)||!Array.isArray(card.provenance))throw new Error('model');
    root.replaceChildren();root.setAttribute('class','fd-edition-card');root.setAttribute('tabindex','-1');
    section=fdEditionStudentElement(documentObject,'section','', 'fd-edition-card__body');
    fdEditionStudentAppend(section,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.localLabel,'fd-edition-authority');
    fdEditionStudentAppend(section,documentObject,'h2',String(card.title));
    summary=fdEditionStudentAppend(section,documentObject,'p',String(card.locationName)+' · Edition '+String(card.editionNumber)+' · '+String(card.fingerprint));
    fdEditionStudentAppend(section,documentObject,'p','Curated by '+String(card.curatorName)+' · '+String(card.curatorRole));
    fdEditionStudentAppend(section,documentObject,'p',String(card.audienceLabel)+' · '+String(card.durationLabel)+' · '+String(card.rotationDates));
    fdEditionStudentAppend(section,documentObject,'h3','Edition checked on — self-attested by the curator');
    fdEditionStudentAppend(section,documentObject,'p',String(card.editionCheckedOn));
    fdEditionStudentAppend(section,documentObject,'h3','Catalog verification — repository-reviewed record dates');
    list=fdEditionStudentElement(documentObject,'ul');
    for(i=0;i<card.provenance.length;i++){row=card.provenance[i];if(!row||typeof row.displayLabel!=='string'||typeof row.verifiedOn!=='string')throw new Error('model');fdEditionStudentAppend(list,documentObject,'li',row.displayLabel+' — '+row.verifiedOn);}
    section.appendChild(list);
    fdEditionStudentAppend(section,documentObject,'p','Created against core revision '+String(revisions.createdAgainstCoreRevision));
    fdEditionStudentAppend(section,documentObject,'p','Current core revision '+String(revisions.currentCoreRevision));
    fdEditionStudentAppend(section,documentObject,'p','Created against catalog revision '+String(revisions.createdAgainstCatalogRevision));
    fdEditionStudentAppend(section,documentObject,'p','Current catalog revision '+String(revisions.currentCatalogRevision));
    fdEditionStudentAppend(section,documentObject,'p',String(displayModel.changeSummary.text));
    fdEditionStudentAppend(section,documentObject,'p',FD_EDITION_STUDENT_LINEAGE,'fd-edition-lineage');
    fdEditionStudentAppend(section,documentObject,'p',String(card.identityNotice));fdEditionStudentAppend(section,documentObject,'p',String(card.fingerprintNotice));
    status=fdEditionStudentAppend(section,documentObject,'p','Rotation edition ready.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    root.appendChild(section);focus=fdEditionStudentMethod(root,'focus');if(focus)Function.prototype.call.call(focus,root);return true;
  }catch(ignoreRender){fdEditionStudentClear(root);return false;}
}

function fdEditionStudentLocalItem(section,documentObject,item,kind,localState){
  var row,label,on=false,button,link,url,linkValue;
  if(!item||typeof item.text!=='string')throw new Error('item');row=fdEditionStudentElement(documentObject,'div','', 'fd-edition-local__item');
  if(item.priority){label=fdEditionStudentPriority(item.priority);if(!label)throw new Error('priority');fdEditionStudentAppend(row,documentObject,'p',label,'fd-edition-authority');}
  fdEditionStudentAppend(row,documentObject,'p',item.text);
  if(kind&&fdEditionStudentId(item.id)){on=!!(localState&&localState[kind]&&localState[kind][item.id]);button=fdEditionStudentAppend(row,documentObject,'button',on?'Completed':'Mark complete');button.setAttribute('type','button');button.setAttribute('data-fd-local-toggle',kind);button.setAttribute('data-local-id',item.id);button.setAttribute('aria-pressed',on?'true':'false');}
  linkValue=item.url?item:item.link;
  if(linkValue){url=new URL(linkValue.url);if(url.protocol!=='https:'||url.username||url.password||url.hostname!==linkValue.visibleHostname)throw new Error('url');link=fdEditionStudentAppend(row,documentObject,'a',linkValue.title+' — '+linkValue.visibleHostname,'fd-edition-resource');link.setAttribute('href',url.href);link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');fdEditionStudentAppend(row,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.resourceLabel,'fd-edition-authority');}
  section.appendChild(row);
}

function fdEditionRenderLocal(root,displayModel,localState,documentObject){
  var wrapper,definitions,section,i,j,items,row,workflow,attendance;
  if(!fdEditionStudentDom(root,documentObject)){fdEditionStudentClear(root);return false;}
  try{
    if(!fdEditionStudentAuthority(displayModel))throw new Error('model');
    root.replaceChildren();root.setAttribute('class','fd-edition-local');wrapper=fdEditionStudentElement(documentObject,'div');
    fdEditionStudentAppend(wrapper,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.coreLabel,'fd-edition-authority');
    fdEditionStudentAppend(wrapper,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.localLabel,'fd-edition-authority');
    fdEditionStudentAppend(wrapper,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.localBoundary,'fd-edition-authority');
    fdEditionStudentAppend(wrapper,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.requiredLabel+' · '+FD_EDITION_STUDENT_AUTHORITY.recommendedLabel+' · '+FD_EDITION_STUDENT_AUTHORITY.optionalLabel,'fd-edition-authority');
    workflow=displayModel.workflow;attendance=displayModel.attendanceFeedback;
    definitions=[
      ['First day at the location',displayModel.firstDay.arrival?[displayModel.firstDay.arrival]:[],''],
      ['Before you arrive',displayModel.firstDay.accessItems,''],
      ['Who to contact',displayModel.firstDay.contacts,''],
      ["Today's checklist",displayModel.firstDay.checklistItems,'checklist'],
      ['Typical day',displayModel.typicalDay?[{text:displayModel.typicalDay.summaryText}].concat(displayModel.typicalDay.eventItems||[]):[],''],
      ['Team workflow',[workflow.rounds,workflow.presentation,workflow.documentation].filter(Boolean),''],
      ['Attendance and feedback',[attendance.attendance,attendance.feedback].filter(Boolean),''],
      ['Official resources',displayModel.resources,'resources']
    ];
    if(displayModel.emptyLocalPlan)fdEditionStudentAppend(wrapper,documentObject,'p','This edition adds no local orientation. Your reviewed Path and full Library remain available.','fd-edition-empty');
    for(i=0;i<definitions.length;i++){
      section=fdEditionStudentElement(documentObject,'section','', 'fd-edition-section');fdEditionStudentAppend(section,documentObject,'h2',definitions[i][0]);items=definitions[i][1]||[];
      for(j=0;j<items.length;j++){row=items[j];fdEditionStudentLocalItem(section,documentObject,row,definitions[i][2],localState||{});if(row===workflow.documentation)fdEditionStudentAppend(section,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.documentationGuardrail,'fd-edition-authority');}
      wrapper.appendChild(section);
    }
    if(!(workflow&&workflow.documentation))fdEditionStudentAppend(wrapper,documentObject,'p',FD_EDITION_STUDENT_AUTHORITY.documentationGuardrail,'fd-edition-authority');
    root.appendChild(wrapper);return true;
  }catch(ignoreRender){fdEditionStudentClear(root);return false;}
}

function fdEditionCoreMetaMarkup(item){
  var priority='',reason='';
  try{priority=fdEditionStudentPriority(item&&item.priority);reason=item&&typeof item.reasonText==='string'?item.reasonText:'';if(!priority)return '';return '<span class="fd-row__edition"><span>'+fdEditionStudentEscape(FD_EDITION_STUDENT_AUTHORITY.coreLabel)+'</span><span>'+fdEditionStudentEscape(priority)+'</span>'+(reason?'<span>Local rotation reason: '+fdEditionStudentEscape(reason)+'</span>':'')+'</span>';}catch(ignore){return '';}
}

function fdEditionStudentEscape(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fdEditionSwitchMarkup(active,candidate){var left=fdEditionStudentValidEdition(active),right=fdEditionStudentValidEdition(candidate);if(!left||!right)return '';return '<dialog class="fd-edition-switch" aria-labelledby="fd-edition-switch-title"><h2 id="fd-edition-switch-title">Switch rotation edition?</h2><p>Your current edition: <code>'+fdEditionStudentEscape(left.fingerprint)+'</code></p><p>Edition from this link: <code>'+fdEditionStudentEscape(right.fingerprint)+'</code></p><form method="dialog"><button type="button" value="decline">Keep current edition</button><button type="button" value="accept">Switch edition</button></form></dialog>';}
function fdEditionErrorMarkup(receipt){var code=receipt&&typeof receipt.code==='string'?receipt.code:'EDITION_RUNTIME';return '<section class="fd-edition-error" role="alert" tabindex="-1"><h2>Rotation edition unavailable</h2><p>Diagnostic code: <code>'+fdEditionStudentEscape(code)+'</code></p></section>';}

function fdEditionRuntimeElement(documentValue,id){var method=fdEditionStudentMethod(documentValue,'getElementById');if(!method)return null;try{return Function.prototype.call.call(method,documentValue,id);}catch(ignore){return null;}}
function fdEditionRuntimeWritable(object,name){var cursor=object,descriptor,depth=0;if(object===null||(typeof object!=='object'&&typeof object!=='function'))return false;while(cursor!==null&&depth<8){try{descriptor=Object.getOwnPropertyDescriptor(cursor,name);}catch(ignore){return false;}if(descriptor){if(FD_EDITION_STUDENT_OWN.call(descriptor,'value'))return descriptor.writable===true;return typeof descriptor.set==='function';}try{cursor=Object.getPrototypeOf(cursor);}catch(ignorePrototype){return false;}depth+=1;}return false;}
function fdEditionRuntimeDomReady(documentValue,app,mount){var create=fdEditionStudentMethod(documentValue,'createElement'),dialog,button;if(!create||!app||!mount||!fdEditionStudentMethod(app,'removeAttribute')||!fdEditionStudentMethod(app,'setAttribute')||!fdEditionStudentMethod(app,'addEventListener')||!fdEditionStudentMethod(app,'removeEventListener')||!fdEditionStudentMethod(app,'querySelector')||!fdEditionRuntimeWritable(mount,'innerHTML')||!fdEditionStudentMethod(mount,'querySelector'))return false;try{dialog=Function.prototype.call.call(create,documentValue,'dialog');button=Function.prototype.call.call(create,documentValue,'button');}catch(ignoreCreate){return false;}return !!(dialog&&button&&fdEditionStudentMethod(dialog,'addEventListener')&&fdEditionStudentMethod(dialog,'querySelector')&&fdEditionStudentMethod(dialog,'showModal')&&fdEditionStudentMethod(dialog,'close')&&fdEditionStudentMethod(button,'addEventListener')&&fdEditionStudentMethod(button,'focus'));}
function fdEditionRuntimeShellReady(app){var query=fdEditionStudentMethod(app,'querySelector'),content=null;if(!query)return false;try{content=Function.prototype.call.call(query,app,'#content');}catch(ignore){return false;}return !!content;}
function fdEditionRuntimeProbeListener(target,type,capture){var add=fdEditionStudentMethod(target,'addEventListener'),remove=fdEditionStudentMethod(target,'removeEventListener'),probe=function(){};if(!add||!remove)return false;try{Function.prototype.call.call(add,target,type,probe,capture===true);Function.prototype.call.call(remove,target,type,probe,capture===true);return true;}catch(ignoreProbe){try{Function.prototype.call.call(remove,target,type,probe,capture===true);}catch(ignoreRemove){}return false;}}
function fdEditionRuntimePreflightWiring(windowValue,documentValue,app){if(!fdEditionRuntimeShellReady(app))return false;return fdEditionRuntimeProbeListener(app,'click',false)&&fdEditionRuntimeProbeListener(app,'input',false)&&fdEditionRuntimeProbeListener(app,'click',false)&&fdEditionRuntimeProbeListener(windowValue,'keydown',true)&&fdEditionRuntimeProbeListener(windowValue,'popstate',false)&&fdEditionRuntimeProbeListener(windowValue,'message',false)&&fdEditionRuntimeProbeListener(windowValue,'resize',false)&&fdEditionRuntimeProbeListener(documentValue,'click',true);}
function fdEditionRuntimeListen(target,type,handler,capture){var add=fdEditionStudentMethod(target,'addEventListener'),remove=fdEditionStudentMethod(target,'removeEventListener');if(!add||!remove||typeof type!=='string'||typeof handler!=='function')return {ok:false};try{Function.prototype.call.call(add,target,type,handler,capture===true);}catch(ignore){try{Function.prototype.call.call(remove,target,type,handler,capture===true);}catch(ignoreRemove){}return {ok:false};}return {ok:true,target:target,type:type,handler:handler,capture:capture===true,removeMethod:remove,active:true};}
function fdEditionRuntimeUnlisten(registration){if(!registration||registration.active!==true)return true;registration.active=false;try{Function.prototype.call.call(registration.removeMethod,registration.target,registration.type,registration.handler,registration.capture);return true;}catch(ignore){return false;}}
function fdEditionRuntimeReleaseGate(app){var remove=fdEditionStudentMethod(app,'removeAttribute'),set=fdEditionStudentMethod(app,'setAttribute');if(!remove||!set)return false;try{Function.prototype.call.call(remove,app,'inert');Function.prototype.call.call(remove,app,'aria-busy');return true;}catch(ignore){try{Function.prototype.call.call(set,app,'inert','');Function.prototype.call.call(set,app,'aria-busy','true');}catch(ignoreRestore){}return false;}}
function fdEditionRuntimeReceipt(siteContext,code){return fdEditionStudentReceipt(siteContext,code==='EDITION_CRYPTO'?'EDITION_CRYPTO':'EDITION_RUNTIME','');}
function fdEditionRuntimeClearHash(locationValue,historyValue){var method=fdEditionStudentMethod(historyValue,'replaceState'),path,search;if(!method)return false;try{path=locationValue.pathname;search=locationValue.search;if(typeof path!=='string'||typeof search!=='string')return false;Function.prototype.call.call(method,historyValue,null,'',path+search);return true;}catch(ignore){return false;}}
function fdEditionRuntimeReload(locationValue){var method=fdEditionStudentMethod(locationValue,'reload');if(!method)return false;try{return Function.prototype.call.call(method,locationValue)!==false;}catch(ignore){return false;}}
function fdEditionRuntimeSwitchReady(locationValue,hashCleared){return hashCleared===true&&!!fdEditionStudentMethod(locationValue,'reload');}
function fdEditionRuntimeMountError(mount,receipt){try{mount.innerHTML=fdEditionErrorMarkup(receipt);return true;}catch(ignore){return false;}}
function fdEditionRuntimeFocusError(mount){var query=fdEditionStudentMethod(mount,'querySelector'),alert,focus;if(!query)return false;try{alert=Function.prototype.call.call(query,mount,'.fd-edition-error[role="alert"]');}catch(ignoreQuery){return false;}focus=fdEditionStudentMethod(alert,'focus');if(!focus)return false;try{Function.prototype.call.call(focus,alert,{preventScroll:true});return true;}catch(ignoreOptions){try{Function.prototype.call.call(focus,alert);return true;}catch(ignoreFocus){return false;}}}

function fdEditionRuntimeInputs(windowValue,documentValue,app,mount,catalogSnapshot,siteContext){
  var locationValue,historyValue,storage,cryptoValue,subtle,pageUrl,hash,keys,stored,local,hashCleared=true;
  try{locationValue=windowValue.location;pageUrl=locationValue.href;hash=locationValue.hash;cryptoValue=windowValue.crypto;subtle=cryptoValue.subtle;}catch(ignore){return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};}
  if(typeof pageUrl!=='string'||typeof hash!=='string'||!fdEditionStudentMethod(subtle,'digest'))return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_CRYPTO')};
  if(!fdEditionRuntimeDomReady(documentValue,app,mount)||!fdEditionStudentMethod(locationValue,'reload'))return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  if(siteContext&&siteContext.rotationEditionV2==='disabled'){
    historyValue=null;if(hash){try{historyValue=windowValue.history;}catch(ignoreDisabledHistory){}hashCleared=fdEditionRuntimeClearHash(locationValue,historyValue);if(!hashCleared)return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};}
    return {ok:true,location:locationValue,history:historyValue,storage:null,keys:null,pageUrl:pageUrl,hash:hash,hashCleared:true,storedText:null,localDocument:null,subtle:subtle};
  }
  if(typeof fdEditionPublicationEnabled!=='function'||!fdEditionPublicationEnabled(catalogSnapshot))return {ok:false,receipt:fdEditionStudentReceipt(siteContext,'EDITION_CATALOG_UNAVAILABLE','')};
  try{storage=windowValue.localStorage;historyValue=windowValue.history;}catch(ignoreBoundary){return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};}
  keys=fdEditionStorageKeys(siteContext.audience);if(!keys||!fdEditionStudentMethod(storage,'setItem')||!fdEditionStudentMethod(storage,'removeItem'))return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  stored=fdEditionStudentRead(storage,keys.edition);local=fdEditionStudentRead(storage,keys.local);if(!stored.ok||!local.ok)return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  if(hash){hashCleared=fdEditionRuntimeClearHash(locationValue,historyValue);try{hashCleared=hashCleared&&locationValue.hash==='';}catch(ignoreHash){hashCleared=false;}if(!hashCleared)return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};}
  local=fdEditionStudentLocalDocument(local.value);if(!local.ok)return {ok:false,receipt:fdEditionRuntimeReceipt(siteContext,'EDITION_RUNTIME')};
  return {ok:true,location:locationValue,history:historyValue,storage:storage,keys:keys,pageUrl:pageUrl,hash:hash,hashCleared:hashCleared,storedText:stored.value,localDocument:local.document,subtle:subtle};
}

function fdEditionRuntimeRecover(canonicalIndex,validatedEdition,state,render){var projected=fdEditionStudentProject(canonicalIndex,validatedEdition);if(!projected||!fdEditionActiveIdentity(validatedEdition,projected.index)||typeof render!=='function')return false;try{return render(projected.index,state,validatedEdition)===true;}catch(ignore){return false;}}

function fdEditionRuntimeMountSwitch(mount,result,storage,keys,localDocument,journal,locationValue,hashCleared,recover){
  var markup=fdEditionSwitchMarkup(result&&result.active,result&&result.candidate),dialog,keep,accept,state='pending';
  if(!mount||!markup||!fdEditionRuntimeSwitchReady(locationValue,hashCleared)||typeof recover!=='function')return false;
  try{mount.innerHTML=markup;dialog=mount.querySelector('dialog.fd-edition-switch');keep=dialog.querySelector('button[value="decline"]');accept=dialog.querySelector('button[value="accept"]');if(!dialog||!keep||!accept)throw new Error('dialog');
    accept.addEventListener('click',function(event){var receipt,rolled=false;if(event&&event.preventDefault)event.preventDefault();if(state!=='pending')return;state='working';receipt=fdEditionCommitAcceptance(storage,keys,result.candidate,localDocument,journal);if(!receipt.ok){state='failed';fdEditionRuntimeMountError(mount,receipt);fdEditionRuntimeFocusError(mount);return;}if(fdEditionRuntimeReload(locationValue)){state='done';return;}rolled=fdEditionStartupJournalRollback(journal);state=rolled?'rolled-back':(recover(result.candidate)===true?'recovered':'failed');fdEditionRuntimeMountError(mount,fdEditionRuntimeReceipt(null,'EDITION_RUNTIME'));fdEditionRuntimeFocusError(mount);});
    keep.addEventListener('click',function(event){if(event&&event.preventDefault)event.preventDefault();if(state!=='pending')return;state='done';dialog.close();mount.innerHTML='';});dialog.addEventListener('cancel',function(event){if(event&&event.preventDefault)event.preventDefault();if(state==='pending'){state='done';dialog.close();mount.innerHTML='';}});dialog.showModal();keep.focus();return true;
  }catch(ignore){return false;}
}
