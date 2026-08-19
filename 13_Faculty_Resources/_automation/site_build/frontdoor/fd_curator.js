/* Faculty rotation-edition curator state and Step 1 lifecycle.
   Drafts and imports are untrusted until rebuilt through explicit allowlists and,
   when an envelope is present, the shared cryptographic validator. Publication
   intentionally remains unavailable until the later health-gate task. */
var FD_CURATOR_DRAFT_KEY='cw_curator_draft_v1';
var FD_CURATOR_IMPORT_MAX_BYTES=65536;
var FD_CURATOR_CARD_FIELDS=['title','locationName','locationCode','curatorName','curatorRole','rotationStart','rotationEnd','lastVerified'];
var FD_CURATOR_AFFIRMATION_FIELDS=['publicSafe','officialLinks','previewsReviewed','forwardable'];

function fdCuratorInitialState(index,siteContext){
  var path=index&&index.path?index.path:{};
  var context=siteContext||{};
  return {
    step:1,
    site:{audience:context.audience||'',pathId:path.id||'',weekCount:path.weekCount||0,coreRevision:context.coreRevision||''},
    generateEnabled:false
  };
}

function fdCuratorBlankCard(){
  return {title:'',locationName:'',locationCode:'',curatorName:'',curatorRole:'',rotationStart:'',rotationEnd:'',lastVerified:''};
}

function fdCuratorBlankOrientation(){
  return {
    firstDayArrival:'',dailySchedule:'',roundsWorkflow:'',presentationExpectations:'',
    documentationExpectations:'',attendanceExpectations:'',feedbackProcess:'',accessPreparation:'',
    contacts:[],checklist:[],resources:[]
  };
}

function fdCuratorNewDraft(index,siteContext){
  var path=index&&index.path?index.path:{};
  var context=siteContext||{};
  return {
    schemaVersion:1,step:1,
    site:{audience:context.audience||'',pathId:path.id||context.pathId||'',coreRevision:context.coreRevision||''},
    config:{card:fdCuratorBlankCard(),pathItems:[],localOrientation:fdCuratorBlankOrientation(),changeNote:''},
    publication:{baseEnvelope:null,baseCanonicalConfig:'',lastGenerated:null},
    preview:{desktopReviewed:false,mobileReviewed:false},
    affirmations:{publicSafe:false,officialLinks:false,previewsReviewed:false,forwardable:false}
  };
}

function fdCuratorReadDataObject(value,fields){
  var keys,allowed=Object.create(null),out={},i,key,descriptor;
  if(!value||typeof value!=='object') return null;
  try{ if(Array.isArray(value)) return null; keys=Reflect.ownKeys(value); }
  catch(ignoreKeys){ return null; }
  for(i=0;i<fields.length;i++) allowed[fields[i]]=true;
  if(keys.length!==fields.length) return null;
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(typeof key!=='string'||key==='__proto__'||key==='constructor'||key==='prototype'||!allowed[key]) return null;
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
    catch(ignoreDescriptor){ return null; }
    if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return null;
    out[key]=descriptor.value;
  }
  for(i=0;i<fields.length;i++) if(!Object.prototype.hasOwnProperty.call(out,fields[i])) return null;
  return out;
}

function fdCuratorClone(value){
  return JSON.parse(fdEditionCanonicalJson(value));
}

function fdCuratorFullConfig(draftConfig,site,editionNumber,revision){
  return {
    audience:site.audience,pathId:site.pathId,editionNumber:editionNumber,
    createdAgainstCoreRevision:revision||site.coreRevision,
    card:draftConfig.card,pathItems:draftConfig.pathItems,
    localOrientation:draftConfig.localOrientation,changeNote:draftConfig.changeNote
  };
}

function fdCuratorDraftShape(value,index,siteContext){
  var top=fdCuratorReadDataObject(value,['schemaVersion','step','site','config','publication','preview','affirmations']);
  var site,config,publication,preview,affirmations,normalized,lastGenerated=null,current=siteContext||{},path=index&&index.path?index.path:{};
  var affirmationIndex;
  if(!top||top.schemaVersion!==1||typeof top.step!=='number'||!isFinite(top.step)||Math.floor(top.step)!==top.step||top.step<1||top.step>5) return {ok:false,draft:null};
  site=fdCuratorReadDataObject(top.site,['audience','pathId','coreRevision']);
  config=fdCuratorReadDataObject(top.config,['card','pathItems','localOrientation','changeNote']);
  publication=fdCuratorReadDataObject(top.publication,['baseEnvelope','baseCanonicalConfig','lastGenerated']);
  preview=fdCuratorReadDataObject(top.preview,['desktopReviewed','mobileReviewed']);
  affirmations=fdCuratorReadDataObject(top.affirmations,FD_CURATOR_AFFIRMATION_FIELDS);
  if(!site||!config||!publication||!preview||!affirmations) return {ok:false,draft:null};
  if(typeof site.audience!=='string'||typeof site.pathId!=='string'||typeof site.coreRevision!=='string'||
     site.audience!==current.audience||site.pathId!==(path.id||current.pathId)||
     !/^[0-9a-f]{40}$/.test(site.coreRevision)||!current.coreRevision||!/^[0-9a-f]{40}$/.test(current.coreRevision)) return {ok:false,draft:null};
  if(typeof publication.baseCanonicalConfig!=='string'||
     (publication.baseEnvelope!==null&&(!publication.baseEnvelope||typeof publication.baseEnvelope!=='object'))) return {ok:false,draft:null};
  if(typeof preview.desktopReviewed!=='boolean'||typeof preview.mobileReviewed!=='boolean') return {ok:false,draft:null};
  for(affirmationIndex=0;affirmationIndex<FD_CURATOR_AFFIRMATION_FIELDS.length;affirmationIndex++)
    if(typeof affirmations[FD_CURATOR_AFFIRMATION_FIELDS[affirmationIndex]]!=='boolean') return {ok:false,draft:null};
  normalized=fdEditionNormalizeConfig(fdCuratorFullConfig(config,site,1,site.coreRevision));
  if(!normalized.ok) return {ok:false,draft:null};
  if(publication.lastGenerated!==null){
    lastGenerated=fdCuratorReadDataObject(publication.lastGenerated,['digest','fingerprint']);
    if(!lastGenerated||typeof lastGenerated.digest!=='string'||typeof lastGenerated.fingerprint!=='string') return {ok:false,draft:null};
  }
  try{
    return {ok:true,draft:{
      schemaVersion:1,step:top.step,
      site:{audience:current.audience,pathId:path.id||current.pathId,coreRevision:current.coreRevision},
      config:{card:normalized.value.card,pathItems:normalized.value.pathItems,localOrientation:normalized.value.localOrientation,changeNote:normalized.value.changeNote},
      publication:{
        baseEnvelope:publication.baseEnvelope===null?null:fdCuratorClone(publication.baseEnvelope),
        baseCanonicalConfig:publication.baseCanonicalConfig,
        lastGenerated:lastGenerated===null?null:{digest:lastGenerated.digest,fingerprint:lastGenerated.fingerprint}
      },
      preview:{desktopReviewed:preview.desktopReviewed,mobileReviewed:preview.mobileReviewed},
      affirmations:{
        publicSafe:affirmations.publicSafe,officialLinks:affirmations.officialLinks,
        previewsReviewed:affirmations.previewsReviewed,forwardable:affirmations.forwardable
      }
    }};
  }catch(ignoreClone){ return {ok:false,draft:null}; }
}

function fdCuratorResetReviews(draft){
  draft.preview={desktopReviewed:false,mobileReviewed:false};
  draft.affirmations={publicSafe:false,officialLinks:false,previewsReviewed:false,forwardable:false};
  return draft;
}

function fdCuratorCanonicalWithoutEdition(config){
  var complete,normalized,value;
  if(!config||typeof config!=='object') return '';
  complete={
    audience:config.audience,pathId:config.pathId,
    editionNumber:typeof config.editionNumber==='number'?config.editionNumber:1,
    createdAgainstCoreRevision:config.createdAgainstCoreRevision,
    card:config.card,pathItems:config.pathItems,localOrientation:config.localOrientation,changeNote:config.changeNote
  };
  normalized=fdEditionNormalizeConfig(complete);
  if(!normalized.ok) return '';
  value=normalized.value;
  return fdEditionCanonicalJson({
    audience:value.audience,pathId:value.pathId,createdAgainstCoreRevision:value.createdAgainstCoreRevision,
    card:value.card,pathItems:value.pathItems,localOrientation:value.localOrientation,changeNote:value.changeNote
  });
}

function fdCuratorNextEditionNumber(draft,candidateWithoutEditionNumber){
  var base=draft&&draft.publication?draft.publication.baseEnvelope:null;
  var baseNumber=base&&base.config?base.config.editionNumber:0;
  var candidateCanonical='';
  if(!base||typeof baseNumber!=='number'||!isFinite(baseNumber)||Math.floor(baseNumber)!==baseNumber||baseNumber<1) return 1;
  try{ candidateCanonical=fdCuratorCanonicalWithoutEdition(candidateWithoutEditionNumber); }
  catch(ignoreCanonical){ candidateCanonical=''; }
  return candidateCanonical&&candidateCanonical===draft.publication.baseCanonicalConfig?baseNumber:baseNumber+1;
}

function fdCuratorBuildConfig(draft,index,siteContext){
  var shaped=fdCuratorDraftShape(draft,index,siteContext),base,revision,candidate,number;
  if(!shaped.ok) return {ok:false,value:null,errors:[{code:'CURATOR_DRAFT',path:'/draft',message:'The draft structure is invalid.',blocking:true}],warnings:[],canonicalBytes:0};
  draft=shaped.draft;
  base=draft.publication.baseEnvelope;
  revision=base&&base.config?base.config.createdAgainstCoreRevision:draft.site.coreRevision;
  candidate=fdCuratorFullConfig(draft.config,draft.site,1,revision);
  number=fdCuratorNextEditionNumber(draft,candidate);
  if(base&&base.config&&number!==base.config.editionNumber) candidate.createdAgainstCoreRevision=draft.site.coreRevision;
  candidate.editionNumber=number;
  return fdEditionValidateConfig(candidate,index,siteContext);
}

function fdCuratorReduce(draft,action,index,siteContext){
  var shaped,current,next,snapshot,candidateCanonical,expected;
  if(!draft||draft.schemaVersion!==1){
    current=draft||{step:1,site:{},generateEnabled:false};
    return {
      step:action&&action.type==='GO_TO_STEP'&&typeof action.step==='number'&&isFinite(action.step)&&
        Math.floor(action.step)===action.step&&action.step>=1&&action.step<=5?action.step:current.step,
      site:current.site,generateEnabled:false
    };
  }
  shaped=fdCuratorDraftShape(draft,index,siteContext);
  current=shaped.ok?shaped.draft:fdCuratorNewDraft(index,siteContext);
  next=fdCuratorClone(current);
  if(!action||typeof action.type!=='string') return next;
  if(action.type==='GO_TO_STEP'&&typeof action.step==='number'&&isFinite(action.step)&&
     Math.floor(action.step)===action.step&&action.step>=1&&action.step<=5){ next.step=action.step; return next; }
  if(action.type==='SET_CARD_FIELD'&&typeof action.field==='string'&&
     FD_CURATOR_CARD_FIELDS.indexOf(action.field)!==-1&&typeof action.value==='string'){
    next.config.card[action.field]=action.value; return fdCuratorResetReviews(next);
  }
  if(action.type==='SET_CHANGE_NOTE'&&typeof action.value==='string'){
    next.config.changeNote=action.value; return fdCuratorResetReviews(next);
  }
  if(action.type==='SET_PREVIEW_REVIEWED'&&(action.viewport==='desktop'||action.viewport==='mobile')&&typeof action.value==='boolean'){
    next.preview[action.viewport+'Reviewed']=action.value; return next;
  }
  if(action.type==='SET_AFFIRMATION'&&FD_CURATOR_AFFIRMATION_FIELDS.indexOf(action.name)!==-1&&typeof action.value==='boolean'){
    next.affirmations[action.name]=action.value; return next;
  }
  if(action.type==='GENERATION_SUCCEEDED'&&action.result&&action.result.ok===true){
    snapshot=typeof fdEditionTrustedSnapshot==='function'?fdEditionTrustedSnapshot(action.result):null;
    if(!snapshot||!snapshot.envelope||!snapshot.config||!snapshot.fingerprint) return next;
    expected=fdCuratorBuildConfig(next,index,siteContext);
    if(!expected.ok||fdEditionCanonicalJson(snapshot.config)!==fdEditionCanonicalJson(expected.value)) return next;
    candidateCanonical=fdCuratorCanonicalWithoutEdition(snapshot.config);
    next.publication={
      baseEnvelope:fdCuratorClone(snapshot.envelope),baseCanonicalConfig:candidateCanonical,
      lastGenerated:{digest:snapshot.envelope.digest,fingerprint:snapshot.fingerprint}
    };
    return next;
  }
  return next;
}

function fdCuratorValidDate(value){
  var parts,date;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  parts=value.split('-');
  date=new Date(Date.UTC(Number(parts[0]),Number(parts[1])-1,Number(parts[2])));
  return date.getUTCFullYear()===Number(parts[0])&&date.getUTCMonth()===Number(parts[1])-1&&date.getUTCDate()===Number(parts[2]);
}

function fdCuratorStepError(fieldId,message){
  return {code:'CURATOR_FIELD',fieldId:fieldId,href:'#'+fieldId,message:message,blocking:true};
}

function fdCuratorValidateStep(draft,step,index,siteContext){
  var shaped=fdCuratorDraftShape(draft,index,siteContext),errors=[],card,labels,i,key,value,fieldId;
  if(!shaped.ok) return {ok:false,errors:[fdCuratorStepError('curatorEditorTitle','The draft structure is invalid.')]};
  if(step!==1) return {ok:true,errors:[]};
  card=shaped.draft.config.card;
  labels={title:'Edition title',locationName:'Training-location display name',locationCode:'Short location code',curatorName:'Curator display name',curatorRole:'Curator professional role'};
  for(i=0;i<5;i++){
    key=FD_CURATOR_CARD_FIELDS[i]; value=card[key]; fieldId='curator'+key.charAt(0).toUpperCase()+key.slice(1);
    if(value.trim()==='') errors.push(fdCuratorStepError(fieldId,labels[key]+' is required.'));
    else if(fdEditionTextLength(value)>FD_EDITION_RULES.maxTitle) errors.push(fdCuratorStepError(fieldId,labels[key]+' must contain at most 100 characters.'));
  }
  if(card.locationCode&&!(new RegExp(FD_EDITION_RULES.patterns.locationCode)).test(card.locationCode.trim().toUpperCase()))
    errors.push(fdCuratorStepError('curatorLocationCode','Short location code must contain 2 to 8 letters or digits.'));
  if(!fdCuratorValidDate(card.rotationStart)) errors.push(fdCuratorStepError('curatorRotationStart','Enter a real rotation start date.'));
  if(!fdCuratorValidDate(card.rotationEnd)) errors.push(fdCuratorStepError('curatorRotationEnd','Enter a real rotation end date.'));
  if(!fdCuratorValidDate(card.lastVerified)) errors.push(fdCuratorStepError('curatorLastVerified','Enter a real informational last-verified date.'));
  if(fdCuratorValidDate(card.rotationStart)&&fdCuratorValidDate(card.rotationEnd)&&card.rotationEnd<card.rotationStart)
    errors.push(fdCuratorStepError('curatorRotationEnd','Rotation end must not be before rotation start.'));
  return {ok:errors.length===0,errors:errors};
}

function fdCuratorValidatedSnapshot(result){
  return typeof fdEditionTrustedSnapshot==='function'?fdEditionTrustedSnapshot(result):null;
}

function fdCuratorImportEnvelope(text,index,siteContext,subtle){
  var bytes,envelope;
  if(typeof text!=='string') return Promise.resolve({ok:false,code:'CURATOR_IMPORT_FORMAT',draft:null});
  try{ bytes=new TextEncoder().encode(text).length; }
  catch(ignoreEncoding){ return Promise.resolve({ok:false,code:'CURATOR_IMPORT_FORMAT',draft:null}); }
  if(bytes>FD_CURATOR_IMPORT_MAX_BYTES) return Promise.resolve({ok:false,code:'CURATOR_IMPORT_SIZE',draft:null});
  try{ envelope=JSON.parse(text); }
  catch(ignoreParse){ return Promise.resolve({ok:false,code:'CURATOR_IMPORT_FORMAT',draft:null}); }
  return fdEditionValidateEnvelope(envelope,index,siteContext,subtle).then(function(result){
    var snapshot,draft;
    if(!result||result.ok!==true) return {ok:false,code:'CURATOR_IMPORT_INVALID',draft:null,errors:result&&result.errors?result.errors:[]};
    snapshot=fdCuratorValidatedSnapshot(result);
    if(!snapshot) return {ok:false,code:'CURATOR_IMPORT_INVALID',draft:null};
    draft=fdCuratorNewDraft(index,siteContext);
    draft.config={
      card:fdCuratorClone(snapshot.config.card),pathItems:fdCuratorClone(snapshot.config.pathItems),
      localOrientation:fdCuratorClone(snapshot.config.localOrientation),changeNote:snapshot.config.changeNote
    };
    draft.publication={baseEnvelope:fdCuratorClone(snapshot.envelope),baseCanonicalConfig:fdCuratorCanonicalWithoutEdition(snapshot.config),lastGenerated:null};
    return {ok:true,code:'CURATOR_IMPORT_OK',draft:draft,fingerprint:snapshot.fingerprint};
  },function(){ return {ok:false,code:'CURATOR_IMPORT_INVALID',draft:null}; });
}

function fdCuratorReadImportFile(file,index,siteContext,subtle){
  if(!file||typeof file.size!=='number'||!isFinite(file.size)||file.size<0||file.size>FD_CURATOR_IMPORT_MAX_BYTES)
    return Promise.resolve({ok:false,code:'CURATOR_IMPORT_SIZE',draft:null});
  if(typeof file.text!=='function') return Promise.resolve({ok:false,code:'CURATOR_IMPORT_FORMAT',draft:null});
  return file.text().then(function(text){ return fdCuratorImportEnvelope(text,index,siteContext,subtle); },
    function(){ return {ok:false,code:'CURATOR_IMPORT_READ',draft:null}; });
}

function fdCuratorImportTransactions(){
  var sequence=0,revision=0,lastCommitted=0;
  return {
    begin:function(){ return {sequence:++sequence,revision:revision}; },
    touch:function(){ revision++; },
    commit:function(token){
      if(!token||token.sequence!==sequence||token.revision!==revision||token.sequence===lastCommitted) return false;
      lastCommitted=token.sequence;
      revision++;
      return true;
    }
  };
}

function fdCuratorDraftStorage(storage){
  return {
    key:FD_CURATOR_DRAFT_KEY,
    save:function(draft,index,siteContext){
      var shaped=fdCuratorDraftShape(draft,index,siteContext);
      if(!shaped.ok||!storage||typeof storage.setItem!=='function') return false;
      try{ storage.setItem(FD_CURATOR_DRAFT_KEY,fdEditionCanonicalJson(shaped.draft)); return true; }
      catch(ignoreSave){ return false; }
    },
    load:function(index,siteContext,subtle){
      var raw,parsed,shaped;
      if(!storage||typeof storage.getItem!=='function') return Promise.resolve({ok:false,code:'CURATOR_DRAFT_STORAGE',draft:null});
      try{ raw=storage.getItem(FD_CURATOR_DRAFT_KEY); }
      catch(ignoreRead){ return Promise.resolve({ok:false,code:'CURATOR_DRAFT_STORAGE',draft:null}); }
      if(raw===null) return Promise.resolve({ok:true,code:'CURATOR_DRAFT_EMPTY',draft:null});
      try{ parsed=JSON.parse(raw); }
      catch(ignoreParse){ return Promise.resolve({ok:false,code:'CURATOR_DRAFT_INVALID',draft:null}); }
      shaped=fdCuratorDraftShape(parsed,index,siteContext);
      if(!shaped.ok) return Promise.resolve({ok:false,code:'CURATOR_DRAFT_INVALID',draft:null});
      if(shaped.draft.publication.baseEnvelope===null){
        if(shaped.draft.publication.baseCanonicalConfig!==''||shaped.draft.publication.lastGenerated!==null)
          return Promise.resolve({ok:false,code:'CURATOR_DRAFT_INVALID',draft:null});
        return Promise.resolve({ok:true,code:'CURATOR_DRAFT_OK',draft:shaped.draft});
      }
      return fdEditionValidateEnvelope(shaped.draft.publication.baseEnvelope,index,siteContext,subtle).then(function(result){
        var snapshot=fdCuratorValidatedSnapshot(result),last=shaped.draft.publication.lastGenerated;
        if(!snapshot||fdCuratorCanonicalWithoutEdition(snapshot.config)!==shaped.draft.publication.baseCanonicalConfig)
          return {ok:false,code:'CURATOR_DRAFT_INVALID',draft:null};
        if(last&&(last.digest!==snapshot.envelope.digest||last.fingerprint!==snapshot.fingerprint))
          return {ok:false,code:'CURATOR_DRAFT_INVALID',draft:null};
        shaped.draft.publication.baseEnvelope=fdCuratorClone(snapshot.envelope);
        return {ok:true,code:'CURATOR_DRAFT_OK',draft:shaped.draft};
      },function(){ return {ok:false,code:'CURATOR_DRAFT_INVALID',draft:null}; });
    }
  };
}

function fdCuratorRenderErrors(root,errors){
  var summary=root.querySelector('#curatorErrorSummary'),list=root.querySelector('#curatorErrorList'),i,item,link;
  if(!summary||!list) return;
  while(list.firstChild) list.removeChild(list.firstChild);
  if(!errors||!errors.length){ summary.hidden=true; return; }
  for(i=0;i<errors.length;i++){
    item=document.createElement('li'); link=document.createElement('a');
    link.href=errors[i].href; link.textContent=errors[i].message;
    item.appendChild(link); list.appendChild(item);
  }
  summary.hidden=false;
}

function fdCuratorRender(state,root,index,errors){
  var audience,path,editorTitle,status,generate,buttons,selected,i,input;
  var labels=['Edition','Curriculum','Schedule','Local details','Preview and share'];
  var audienceLabel=state.site.audience==='resident'?'Resident':'MS3';
  if(!root||!state) return;
  audience=root.querySelector('#curatorAudienceLock'); path=root.querySelector('#curatorPathLock');
  editorTitle=root.querySelector('#curatorEditorTitle'); status=root.querySelector('#curatorStepStatus'); generate=root.querySelector('#curatorGenerate');
  if(audience) audience.textContent=audienceLabel+' audience locked';
  if(path) path.textContent=state.site.pathId+' · '+(index&&index.path?index.path.weekCount:state.site.weekCount||0)+' weeks locked';
  if(editorTitle) editorTitle.textContent=state.step+'. '+labels[state.step-1];
  if(status) status.textContent='Step '+state.step+' of 5: '+labels[state.step-1];
  buttons=root.querySelectorAll('[data-curator-step]');
  for(i=0;i<buttons.length;i++){
    selected=Number(buttons[i].getAttribute('data-curator-step'))===state.step;
    if(selected) buttons[i].setAttribute('aria-current','step'); else buttons[i].removeAttribute('aria-current');
  }
  input=root.querySelector('#curatorStepOne'); if(input) input.hidden=state.step!==1;
  input=root.querySelector('#curatorFutureStep'); if(input) input.hidden=state.step===1;
  if(state.config&&state.config.card){
    for(i=0;i<FD_CURATOR_CARD_FIELDS.length;i++){
      input=root.querySelector('[data-curator-card="'+FD_CURATOR_CARD_FIELDS[i]+'"]');
      if(input&&input.value!==state.config.card[FD_CURATOR_CARD_FIELDS[i]]) input.value=state.config.card[FD_CURATOR_CARD_FIELDS[i]];
    }
    input=root.querySelector('#curatorEditionNumber');
    if(input) input.textContent='Edition '+fdCuratorNextEditionNumber(state,fdCuratorFullConfig(
      state.config,state.site,1,state.publication.baseEnvelope&&state.publication.baseEnvelope.config?
        state.publication.baseEnvelope.config.createdAgainstCoreRevision:state.site.coreRevision
    ));
  }
  fdCuratorRenderErrors(root,errors||[]);
  if(generate){ generate.disabled=true; generate.setAttribute('aria-disabled','true'); }
}

function fdCuratorMount(root,index,siteContext){
  var state=fdCuratorNewDraft(index,siteContext),errors=[],touched=false;
  var adapter=fdCuratorDraftStorage(typeof localStorage==='undefined'?null:localStorage);
  var importTransactions=fdCuratorImportTransactions();
  var subtle=typeof crypto!=='undefined'&&crypto?crypto.subtle:null;
  var buttons,i,save,continueButton,importInput;
  function dispatch(action){ touched=true; importTransactions.touch(); state=fdCuratorReduce(state,action,index,siteContext); errors=[]; fdCuratorRender(state,root,index,errors); return state; }
  function status(message){ var node=root.querySelector('#curatorSaveStatus'); if(node) node.textContent=message; }
  if(!root) return null;
  buttons=root.querySelectorAll('[data-curator-step]');
  for(i=0;i<buttons.length;i++) buttons[i].addEventListener('click',function(event){
    dispatch({type:'GO_TO_STEP',step:Number(event.currentTarget.getAttribute('data-curator-step'))});
  });
  root.addEventListener('input',function(event){
    var field=event.target.getAttribute&&event.target.getAttribute('data-curator-card');
    if(field) dispatch({type:'SET_CARD_FIELD',field:field,value:event.target.value});
  });
  save=root.querySelector('#curatorSaveDraft');
  if(save) save.addEventListener('click',function(){
    if(adapter.save(state,index,siteContext)) status('Saved on this device');
    else status('Draft could not be saved on this device.');
  });
  continueButton=root.querySelector('#curatorContinue');
  if(continueButton) continueButton.addEventListener('click',function(){
    var checked=fdCuratorValidateStep(state,1,index,siteContext),summary;
    if(!checked.ok){ errors=checked.errors; fdCuratorRender(state,root,index,errors); summary=root.querySelector('#curatorErrorSummary'); if(summary) summary.focus(); return; }
    dispatch({type:'GO_TO_STEP',step:2});
  });
  importInput=root.querySelector('#curatorImportFile');
  if(importInput) importInput.addEventListener('change',function(event){
    var file=event.target.files&&event.target.files[0],transaction;
    if(!file) return;
    touched=true;
    transaction=importTransactions.begin();
    fdCuratorReadImportFile(file,index,siteContext,subtle).then(function(result){
      if(!importTransactions.commit(transaction)) return;
      if(result.ok){ touched=true; state=result.draft; errors=[]; fdCuratorRender(state,root,index,errors); status('Backup imported. Save the draft to keep it on this device.'); }
      else status(result.code==='CURATOR_IMPORT_SIZE'?'Backup must be 64 KiB or smaller.':'Backup could not be validated for this audience.');
      event.target.value='';
    });
  });
  fdCuratorRender(state,root,index,errors);
  adapter.load(index,siteContext,subtle).then(function(result){
    if(!touched&&result.ok&&result.draft){ state=result.draft; fdCuratorRender(state,root,index,errors); status('Saved on this device'); }
  });
  return {dispatch:dispatch,getState:function(){ return state; }};
}
