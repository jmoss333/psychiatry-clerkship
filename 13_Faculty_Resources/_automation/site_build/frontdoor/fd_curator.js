/* Faculty rotation-edition curator state and Step 1 lifecycle.
   Drafts and imports are untrusted until rebuilt through explicit allowlists and,
   when an envelope is present, the shared cryptographic validator. Publication
   intentionally remains unavailable until the later health-gate task. */
var FD_CURATOR_DRAFT_KEY='cw_curator_draft_v1';
var FD_CURATOR_IMPORT_MAX_BYTES=65536;
/* Match the adjacent shared edition contract's conservative collection bound. */
var FD_CURATOR_MAX_ARRAY_ITEMS=12288;
var FD_CURATOR_CARD_FIELDS=['title','locationName','locationCode','curatorName','curatorRole','rotationStart','rotationEnd','lastVerified'];
var FD_CURATOR_AFFIRMATION_FIELDS=['publicSafe','officialLinks','previewsReviewed','forwardable'];
var FD_CURATOR_ORIENTATION_FIELDS=['firstDayArrival','dailySchedule','roundsWorkflow','presentationExpectations','documentationExpectations','attendanceExpectations','feedbackProcess','accessPreparation'];
var FD_CURATOR_LOCAL_LABELS={
  firstDayArrival:'First-day arrival',dailySchedule:'Typical daily schedule',roundsWorkflow:'Rounds workflow',
  presentationExpectations:'Presentation expectations',documentationExpectations:'Documentation expectations',
  attendanceExpectations:'Attendance expectations',feedbackProcess:'Feedback process',accessPreparation:'Access preparation'
};

function fdCuratorInitialState(index,siteContext){
  var indexData=fdCuratorReadOwnDataFields(index,['path']);
  var context=fdCuratorReadOwnDataFields(siteContext,['audience','coreRevision']);
  var path=indexData?fdCuratorReadOwnDataFields(indexData.path,['id','weekCount']):null;
  return {
    step:1,
    site:{
      audience:context&&typeof context.audience==='string'?context.audience:'',
      pathId:path&&typeof path.id==='string'?path.id:'',
      weekCount:path&&typeof path.weekCount==='number'?path.weekCount:0,
      coreRevision:context&&typeof context.coreRevision==='string'?context.coreRevision:''
    },
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

function fdCuratorWeekCount(index,siteContext){
  var inspected=fdCuratorIndexSnapshot(index,siteContext);
  return inspected.ok?inspected.weekCount:0;
}

function fdCuratorLibraryGroups(index){
  var inspected=fdCuratorLibrarySnapshot(index);
  return inspected.ok?inspected.groups:[];
}

function fdCuratorLibraryRefMap(index){
  var groups=fdCuratorLibraryGroups(index),map=Object.create(null),i,j;
  for(i=0;i<groups.length;i++) for(j=0;j<groups[i].items.length;j++) map[groups[i].items[j].ref]=true;
  return map;
}

function fdCuratorCanonicalPathItems(index,siteContext){
  var inspected=fdCuratorIndexSnapshot(index,siteContext);
  var occurrences=Object.create(null),out=[],week,ref,i,j;
  if(!inspected.ok) return out;
  for(i=0;i<inspected.weekCount;i++){
    week=inspected.weeks[i];
    for(j=0;j<week.refs.length;j++){
      ref=week.refs[j];
      if(!inspected.allowed[ref]) return [];
      occurrences[ref]=(occurrences[ref]||0)+1;
      out.push({
        instanceId:'core:'+ref+':'+occurrences[ref],ref:ref,week:week.n,order:j+1,
        priority:'recommended',rationale:''
      });
    }
  }
  return out;
}

function fdCuratorNewDraft(index,siteContext){
  var inspected=fdCuratorIndexSnapshot(index,siteContext);
  var context=fdCuratorReadOwnDataFields(siteContext,['audience','pathId','coreRevision'])||{};
  return {
    schemaVersion:1,step:1,
    site:{
      audience:typeof context.audience==='string'?context.audience:'',
      pathId:inspected.ok?inspected.pathId:(typeof context.pathId==='string'?context.pathId:''),
      coreRevision:typeof context.coreRevision==='string'?context.coreRevision:''
    },
    config:{card:fdCuratorBlankCard(),pathItems:fdCuratorCanonicalPathItems(index,siteContext),localOrientation:fdCuratorBlankOrientation(),changeNote:''},
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

function fdCuratorReadOwnDataFields(value,fields){
  var out={},i,key,descriptor;
  if(!value||typeof value!=='object') return null;
  try{ if(Array.isArray(value)) return null; }
  catch(ignoreArray){ return null; }
  for(i=0;i<fields.length;i++){
    key=fields[i];
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
    catch(ignoreDescriptor){ return null; }
    if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return null;
    out[key]=descriptor.value;
  }
  return out;
}

function fdCuratorReadDataArray(value){
  var keys,lengthDescriptor,length,out=[],seen=Object.create(null),i,key,descriptor;
  try{
    if(!Array.isArray(value)) return null;
    lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length');
    if(!lengthDescriptor||!Object.prototype.hasOwnProperty.call(lengthDescriptor,'value')) return null;
    length=lengthDescriptor.value;
    if(typeof length!=='number'||!isFinite(length)||Math.floor(length)!==length||length<0) return null;
    if(length>FD_CURATOR_MAX_ARRAY_ITEMS) return null;
    keys=Reflect.ownKeys(value);
  }catch(ignoreArray){ return null; }
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(key==='length') continue;
    if(typeof key!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(key)||Number(key)>=length) return null;
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
    catch(ignoreDescriptor){ return null; }
    if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return null;
    seen[key]=true; out[Number(key)]=descriptor.value;
  }
  for(i=0;i<length;i++) if(!seen[String(i)]) return null;
  return out;
}

function fdCuratorLibrarySnapshot(index){
  var top=fdCuratorReadOwnDataFields(index,['columns','byRef']),columns,groups=[],allowed=Object.create(null);
  var seen=Object.create(null),c,i,columnData,columnItems,itemData,ref,descriptor,canonicalData,items;
  if(!top||!top.byRef||typeof top.byRef!=='object') return {ok:false,groups:[],allowed:allowed};
  try{ if(Array.isArray(top.byRef)) return {ok:false,groups:[],allowed:allowed}; }
  catch(ignoreReferenceMap){ return {ok:false,groups:[],allowed:allowed}; }
  columns=fdCuratorReadDataArray(top.columns);
  if(!columns) return {ok:false,groups:[],allowed:allowed};
  for(c=0;c<columns.length;c++){
    columnData=fdCuratorReadOwnDataFields(columns[c],['name','accent','items']); items=[];
    if(!columnData||typeof columnData.name!=='string'||typeof columnData.accent!=='string')
      return {ok:false,groups:[],allowed:Object.create(null)};
    columnItems=fdCuratorReadDataArray(columnData.items);
    if(!columnItems) return {ok:false,groups:[],allowed:Object.create(null)};
    for(i=0;i<columnItems.length;i++){
      itemData=fdCuratorReadOwnDataFields(columnItems[i],['ref']);
      if(!itemData||typeof itemData.ref!=='string') return {ok:false,groups:[],allowed:Object.create(null)};
      ref=itemData.ref;
      if(!ref||ref==='rotation-curator.html'||ref.indexOf('local:')===0||seen[ref]) continue;
      try{ descriptor=Object.getOwnPropertyDescriptor(top.byRef,ref); }
      catch(ignoreReference){ return {ok:false,groups:[],allowed:Object.create(null)}; }
      if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))
        return {ok:false,groups:[],allowed:Object.create(null)};
      canonicalData=fdCuratorReadOwnDataFields(descriptor.value,['ref','title']);
      if(!canonicalData||canonicalData.ref!==ref||typeof canonicalData.title!=='string')
        return {ok:false,groups:[],allowed:Object.create(null)};
      seen[ref]=true; allowed[ref]=true;
      items.push({ref:ref,title:canonicalData.title});
    }
    if(items.length) groups.push({name:columnData.name,accent:columnData.accent,items:items});
  }
  return {ok:true,groups:groups,allowed:allowed};
}

function fdCuratorIndexSnapshot(index,siteContext){
  var top=fdCuratorReadOwnDataFields(index,['path','weeks']),path,context,library,weeks,rule,out=[],i,j,weekData,items,itemData,refs,titleDescriptor,title;
  context=fdCuratorReadOwnDataFields(siteContext,['audience','pathId','coreRevision']);
  path=top?fdCuratorReadOwnDataFields(top.path,['id','weekCount']):null;
  library=fdCuratorLibrarySnapshot(index);
  if(!top||!context||!path||!library.ok||typeof context.audience!=='string'||
     typeof context.pathId!=='string'||typeof context.coreRevision!=='string'||
     typeof path.id!=='string'||path.id!==context.pathId||
     typeof path.weekCount!=='number'||!isFinite(path.weekCount)||Math.floor(path.weekCount)!==path.weekCount||path.weekCount<1)
    return {ok:false};
  try{ rule=FD_EDITION_RULES.paths[context.audience]; }
  catch(ignoreRules){ rule=null; }
  if(!rule||rule.id!==path.id||rule.weeks!==path.weekCount) return {ok:false};
  weeks=fdCuratorReadDataArray(top.weeks);
  if(!weeks||weeks.length!==path.weekCount) return {ok:false};
  for(i=0;i<weeks.length;i++){
    weekData=fdCuratorReadOwnDataFields(weeks[i],['n','items']);
    if(!weekData||weekData.n!==i+1) return {ok:false};
    try{ titleDescriptor=Object.getOwnPropertyDescriptor(weeks[i],'title'); }
    catch(ignoreWeekTitle){ return {ok:false}; }
    title='';
    if(titleDescriptor){
      if(!Object.prototype.hasOwnProperty.call(titleDescriptor,'value')||typeof titleDescriptor.value!=='string') return {ok:false};
      title=titleDescriptor.value;
    }
    items=fdCuratorReadDataArray(weekData.items); refs=[];
    if(!items) return {ok:false};
    for(j=0;j<items.length;j++){
      itemData=fdCuratorReadOwnDataFields(items[j],['ref']);
      if(!itemData||typeof itemData.ref!=='string') return {ok:false};
      refs.push(itemData.ref);
    }
    out.push({n:i+1,title:title,refs:refs});
  }
  return {
    ok:true,audience:context.audience,pathId:path.id,weekCount:path.weekCount,weeks:out,
    groups:library.groups,allowed:library.allowed,coreRevision:context.coreRevision
  };
}

function fdCuratorActionShape(action){
  var typeData=fdCuratorReadOwnDataFields(action,['type']),type,fields;
  if(!typeData||typeof typeData.type!=='string') return null;
  type=typeData.type;
  if(type==='GO_TO_STEP') fields=['type','step'];
  else if(type==='SET_CARD_FIELD') fields=['type','field','value'];
  else if(type==='SET_CHANGE_NOTE') fields=['type','value'];
  else if(type==='SET_PREVIEW_REVIEWED') fields=['type','viewport','value'];
  else if(type==='SET_AFFIRMATION') fields=['type','name','value'];
  else if(type==='PATH_TOGGLE'||type==='PATH_ADD_INSTANCE'){
    fields=fdCuratorReadOwnDataFields(action,['week'])?['type','ref','week']:['type','ref'];
  }else if(type==='PATH_REMOVE_INSTANCE'||type==='PATH_MOVE_UP'||type==='PATH_MOVE_DOWN') fields=['type','instanceId'];
  else if(type==='PATH_SET_PRIORITY') fields=['type','instanceId','priority'];
  else if(type==='PATH_SET_RATIONALE') fields=['type','instanceId','value'];
  else if(type==='PATH_MOVE_WEEK') fields=['type','instanceId','week'];
  else if(type==='LOCAL_SET_ORIENTATION') fields=['type','field','value'];
  else if(type==='LOCAL_CONTACT_ADD') fields=['type','role','directoryUrl'];
  else if(type==='LOCAL_CONTACT_REMOVE') fields=['type','index'];
  else if(type==='LOCAL_CONTACT_UPDATE') fields=['type','index','field','value'];
  else if(type==='LOCAL_CHECKLIST_ADD') fields=['type','label','priority'];
  else if(type==='LOCAL_CHECKLIST_REMOVE') fields=['type','id'];
  else if(type==='LOCAL_CHECKLIST_UPDATE') fields=['type','id','field','value'];
  else if(type==='LOCAL_RESOURCE_ADD') fields=['type','title','url','priority','week','rationale'];
  else if(type==='LOCAL_RESOURCE_REMOVE') fields=['type','id'];
  else if(type==='LOCAL_RESOURCE_UPDATE') fields=['type','id','field','value'];
  else if(type==='GENERATION_SUCCEEDED') fields=['type','result'];
  else fields=['type'];
  return fdCuratorReadDataObject(action,fields);
}

function fdCuratorClone(value){
  return JSON.parse(fdEditionCanonicalJson(value));
}

function fdCuratorUnchangedResult(value,index,siteContext){
  try{ return fdCuratorClone(value); }
  catch(ignoreClone){ return fdCuratorNewDraft(index,siteContext); }
}

function fdCuratorFullConfig(draftConfig,site,editionNumber,revision){
  return {
    audience:site.audience,pathId:site.pathId,editionNumber:editionNumber,
    createdAgainstCoreRevision:revision||site.coreRevision,
    card:draftConfig.card,pathItems:draftConfig.pathItems,
    localOrientation:draftConfig.localOrientation,changeNote:draftConfig.changeNote
  };
}

function fdCuratorPlainTextValid(value,max,allowEmpty){
  if(typeof value!=='string'||(!allowEmpty&&value.trim()==='')||fdEditionTextLength(value)>max) return false;
  try{ value.normalize('NFC'); }
  catch(ignoreUnicode){ return false; }
  return !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(value);
}

function fdCuratorHttpsUrlValid(value){
  var errors=[],warnings=[];
  if(typeof value!=='string') return false;
  fdEditionCheckUrl(value,'/config/localOrientation/url',errors,warnings);
  return errors.length===0;
}

function fdCuratorLocalIdentifierValid(value){
  var errors=[],warnings=[];
  if(typeof value!=='string'||!value||value.length>160||!/^[\x21-\x7e]+$/.test(value)) return false;
  fdEditionScreenText(value,'/config/localOrientation/id',errors,warnings);
  return errors.length===0;
}

function fdCuratorLocalIdNumber(id,prefix){
  var suffix;
  if(typeof id!=='string'||id.indexOf(prefix)!==0) return 0;
  suffix=id.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(suffix)?Number(suffix):0;
}

function fdCuratorNextLocalId(draft,prefix){
  var used=Object.create(null),groups=[draft.config.pathItems,draft.config.localOrientation.checklist,draft.config.localOrientation.resources];
  var i,j,n=1,value,id;
  for(i=0;i<groups.length;i++) for(j=0;j<groups[i].length;j++){
    id=i===0?groups[i][j].instanceId:groups[i][j].id;
    value=fdCuratorLocalIdNumber(id,prefix);
    if(value) used[value]=true;
  }
  while(used[n]) n++;
  return prefix+n;
}

function fdCuratorFindLocalItem(items,id){
  var i;
  if(typeof id!=='string') return -1;
  for(i=0;i<items.length;i++) if(items[i].id===id) return i;
  return -1;
}

function fdCuratorLocalStateValid(orientation,inspected,pathItems){
  var seen=Object.create(null),i,item;
  if(!orientation||!inspected||!inspected.ok) return false;
  for(i=0;i<FD_CURATOR_ORIENTATION_FIELDS.length;i++)
    if(!fdCuratorPlainTextValid(orientation[FD_CURATOR_ORIENTATION_FIELDS[i]],FD_EDITION_RULES.maxOrientation,true)) return false;
  if(!Array.isArray(orientation.contacts)||!Array.isArray(orientation.checklist)||!Array.isArray(orientation.resources)||
     orientation.contacts.length>FD_CURATOR_MAX_ARRAY_ITEMS||orientation.checklist.length>FD_EDITION_RULES.maxChecklist||
     orientation.resources.length>FD_EDITION_RULES.maxResources) return false;
  for(i=0;i<pathItems.length;i++) seen[pathItems[i].instanceId]=true;
  for(i=0;i<orientation.contacts.length;i++){
    item=orientation.contacts[i];
    if(!item||!fdCuratorPlainTextValid(item.role,FD_EDITION_RULES.maxTitle,false)||!fdCuratorHttpsUrlValid(item.directoryUrl)) return false;
  }
  for(i=0;i<orientation.checklist.length;i++){
    item=orientation.checklist[i];
    if(!item||!fdCuratorLocalIdentifierValid(item.id)||seen[item.id]||!fdCuratorPlainTextValid(item.label,FD_EDITION_RULES.maxTitle,false)||
       FD_EDITION_RULES.priorities.indexOf(item.priority)===-1) return false;
    seen[item.id]=true;
  }
  for(i=0;i<orientation.resources.length;i++){
    item=orientation.resources[i];
    if(!item||!fdCuratorLocalIdentifierValid(item.id)||seen[item.id]||!fdCuratorPlainTextValid(item.title,FD_EDITION_RULES.maxTitle,false)||
       !fdCuratorHttpsUrlValid(item.url)||FD_EDITION_RULES.priorities.indexOf(item.priority)===-1||
       typeof item.week!=='number'||Math.floor(item.week)!==item.week||item.week<1||item.week>inspected.weekCount||
       !fdCuratorPlainTextValid(item.rationale,FD_EDITION_RULES.maxRationale,true)) return false;
    seen[item.id]=true;
  }
  return true;
}

function fdCuratorValidateDraft(value,index,siteContext){
  var top=fdCuratorReadDataObject(value,['schemaVersion','step','site','config','publication','preview','affirmations']);
  var site,config,publication,preview,affirmations,normalized,lastGenerated=null,current=fdCuratorIndexSnapshot(index,siteContext);
  var affirmationIndex;
  if(!current.ok||!top||top.schemaVersion!==1||typeof top.step!=='number'||!isFinite(top.step)||Math.floor(top.step)!==top.step||top.step<1||top.step>5) return {ok:false,draft:null};
  site=fdCuratorReadDataObject(top.site,['audience','pathId','coreRevision']);
  config=fdCuratorReadDataObject(top.config,['card','pathItems','localOrientation','changeNote']);
  publication=fdCuratorReadDataObject(top.publication,['baseEnvelope','baseCanonicalConfig','lastGenerated']);
  preview=fdCuratorReadDataObject(top.preview,['desktopReviewed','mobileReviewed']);
  affirmations=fdCuratorReadDataObject(top.affirmations,FD_CURATOR_AFFIRMATION_FIELDS);
  if(!site||!config||!publication||!preview||!affirmations) return {ok:false,draft:null};
  if(typeof site.audience!=='string'||typeof site.pathId!=='string'||typeof site.coreRevision!=='string'||
     site.audience!==current.audience||site.pathId!==current.pathId||
     !/^[0-9a-f]{40}$/.test(site.coreRevision)||!current.coreRevision||!/^[0-9a-f]{40}$/.test(current.coreRevision)) return {ok:false,draft:null};
  if(typeof publication.baseCanonicalConfig!=='string'||
     (publication.baseEnvelope!==null&&(!publication.baseEnvelope||typeof publication.baseEnvelope!=='object'))) return {ok:false,draft:null};
  if(typeof preview.desktopReviewed!=='boolean'||typeof preview.mobileReviewed!=='boolean') return {ok:false,draft:null};
  for(affirmationIndex=0;affirmationIndex<FD_CURATOR_AFFIRMATION_FIELDS.length;affirmationIndex++)
    if(typeof affirmations[FD_CURATOR_AFFIRMATION_FIELDS[affirmationIndex]]!=='boolean') return {ok:false,draft:null};
  normalized=fdEditionNormalizeConfig(fdCuratorFullConfig(config,site,1,site.coreRevision));
  if(!normalized.ok||!fdCuratorPathStateValid(normalized.value.pathItems,current)||
     !fdCuratorLocalStateValid(normalized.value.localOrientation,current,normalized.value.pathItems)) return {ok:false,draft:null};
  if(publication.lastGenerated!==null){
    lastGenerated=fdCuratorReadDataObject(publication.lastGenerated,['digest','fingerprint']);
    if(!lastGenerated||typeof lastGenerated.digest!=='string'||typeof lastGenerated.fingerprint!=='string') return {ok:false,draft:null};
  }
  try{
    return {ok:true,draft:{
      schemaVersion:1,step:top.step,
      site:{audience:current.audience,pathId:current.pathId,coreRevision:current.coreRevision},
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

function fdCuratorNormalizePathItems(items,weekCount){
  var ranked=[],perWeek=Object.create(null),out=[],i,item,week;
  if(!Array.isArray(items)||!weekCount) return null;
  for(i=0;i<items.length;i++){
    item=items[i];
    if(!item||typeof item.week!=='number'||Math.floor(item.week)!==item.week||item.week<1||item.week>weekCount) return null;
    ranked.push({item:item,position:i});
  }
  ranked.sort(function(a,b){
    if(a.item.week!==b.item.week) return a.item.week-b.item.week;
    if(a.item.order!==b.item.order) return a.item.order-b.item.order;
    return a.position-b.position;
  });
  for(i=0;i<ranked.length;i++){
    item=ranked[i].item; week=String(item.week); perWeek[week]=(perWeek[week]||0)+1;
    item.order=perWeek[week]; out.push(item);
  }
  return out;
}

function fdCuratorFindPathItem(items,instanceId){
  var i;
  if(typeof instanceId!=='string') return -1;
  for(i=0;i<items.length;i++) if(items[i].instanceId===instanceId) return i;
  return -1;
}

function fdCuratorDefaultWeek(draft,inspected,ref){
  var items=draft.config.pathItems,i,j;
  for(i=0;i<items.length;i++) if(items[i].ref===ref) return items[i].week;
  for(i=0;i<inspected.weeks.length;i++) for(j=0;j<inspected.weeks[i].refs.length;j++)
    if(inspected.weeks[i].refs[j]===ref) return inspected.weeks[i].n;
  return 1;
}

function fdCuratorNextInstanceId(items,ref){
  var used=Object.create(null),prefix='core:'+ref+':',i,suffix,occurrence=1;
  for(i=0;i<items.length;i++){
    if(items[i].instanceId.indexOf(prefix)!==0) continue;
    suffix=items[i].instanceId.slice(prefix.length);
    if(/^[1-9][0-9]*$/.test(suffix)) used[Number(suffix)]=true;
  }
  while(used[occurrence]) occurrence++;
  return prefix+occurrence;
}

function fdCuratorInstanceOccurrence(item){
  var prefix,suffix;
  if(!item||typeof item.ref!=='string'||typeof item.instanceId!=='string') return '';
  prefix='core:'+item.ref+':';
  if(item.instanceId.indexOf(prefix)!==0) return '';
  suffix=item.instanceId.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(suffix)?suffix:'';
}

function fdCuratorRationaleValid(value){
  var errors=[],warnings=[];
  if(typeof value!=='string'||fdEditionTextLength(value)>FD_EDITION_RULES.maxRationale) return false;
  try{ value.normalize('NFC'); }
  catch(ignoreUnicode){ return false; }
  fdEditionScreenText(value,'/config/pathItems/rationale',errors,warnings);
  return errors.length===0;
}

function fdCuratorPathStateValid(items,inspected){
  var seenIds=Object.create(null),seenOrders=Object.create(null),seenOccurrences=Object.create(null),counts=Object.create(null);
  var i,item,weekKey,orderKey,prefix,suffix,occurrenceKey;
  if(!Array.isArray(items)||!inspected||!inspected.ok||!inspected.weekCount) return false;
  for(i=0;i<items.length;i++){
    item=items[i];
    if(!item||typeof item.instanceId!=='string'||!item.instanceId||seenIds[item.instanceId]||
       typeof item.ref!=='string'||!inspected.allowed[item.ref]||
       typeof item.week!=='number'||Math.floor(item.week)!==item.week||item.week<1||item.week>inspected.weekCount||
       typeof item.order!=='number'||Math.floor(item.order)!==item.order||item.order<1||
       FD_EDITION_RULES.priorities.indexOf(item.priority)===-1||!fdCuratorRationaleValid(item.rationale)) return false;
    prefix='core:'+item.ref+':';
    if(item.instanceId.indexOf(prefix)!==0) return false;
    suffix=item.instanceId.slice(prefix.length);
    if(!/^[1-9][0-9]*$/.test(suffix)) return false;
    occurrenceKey=item.ref+'\u0000'+suffix;
    if(seenOccurrences[occurrenceKey]) return false;
    weekKey=String(item.week); orderKey=weekKey+':'+String(item.order);
    if(seenOrders[orderKey]) return false;
    seenIds[item.instanceId]=true; seenOccurrences[occurrenceKey]=true;
    seenOrders[orderKey]=true; counts[weekKey]=(counts[weekKey]||0)+1;
  }
  for(weekKey in counts) if(Object.prototype.hasOwnProperty.call(counts,weekKey))
    for(i=1;i<=counts[weekKey];i++) if(!seenOrders[weekKey+':'+String(i)]) return false;
  return true;
}

function fdCuratorPathChanged(next,weekCount){
  var normalized=fdCuratorNormalizePathItems(next.config.pathItems,weekCount);
  if(!normalized) return next;
  next.config.pathItems=normalized;
  return fdCuratorResetReviews(next);
}

function fdCuratorLocalChanged(next){
  return fdCuratorResetReviews(next);
}

function fdCuratorCommitLocalMutation(next,current,index,siteContext){
  var validated,policy;
  fdCuratorLocalChanged(next);
  validated=fdCuratorValidateDraft(next,index,siteContext);
  if(!validated.ok) return current;
  policy=fdCuratorLocalPolicy(validated.draft,index,siteContext);
  return policy.ok?validated.draft:current;
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
  var shaped=fdCuratorValidateDraft(draft,index,siteContext),base,revision,candidate,number;
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
  var shaped,current,next,snapshot,candidateCanonical,expected,weekCount,allowed,items,itemIndex,item,inspected,parsedAction,schema;
  var targetWeek,weekItems,position,otherIndex,i,changed=false;
  schema=fdCuratorReadOwnDataFields(draft,['schemaVersion']);
  parsedAction=fdCuratorActionShape(action);
  if(!schema||schema.schemaVersion!==1){
    current=fdCuratorReadDataObject(draft,['step','site','generateEnabled'])||{step:1,site:{},generateEnabled:false};
    return {
      step:parsedAction&&parsedAction.type==='GO_TO_STEP'&&typeof parsedAction.step==='number'&&isFinite(parsedAction.step)&&
        Math.floor(parsedAction.step)===parsedAction.step&&parsedAction.step>=1&&parsedAction.step<=5?parsedAction.step:current.step,
      site:current.site,generateEnabled:false
    };
  }
  shaped=fdCuratorValidateDraft(draft,index,siteContext);
  if(!shaped.ok) return fdCuratorUnchangedResult(draft,index,siteContext);
  current=shaped.draft;
  next=fdCuratorClone(current);
  if(!parsedAction) return next;
  action=parsedAction;
  if(action.type==='GO_TO_STEP'&&typeof action.step==='number'&&isFinite(action.step)&&
     Math.floor(action.step)===action.step&&action.step>=1&&action.step<=5){ next.step=action.step; return next; }
  if(action.type==='SET_CARD_FIELD'&&typeof action.field==='string'&&
     FD_CURATOR_CARD_FIELDS.indexOf(action.field)!==-1&&typeof action.value==='string'){
    if(next.config.card[action.field]===action.value) return next;
    next.config.card[action.field]=action.value; return fdCuratorResetReviews(next);
  }
  if(action.type==='SET_CHANGE_NOTE'&&typeof action.value==='string'){
    if(next.config.changeNote===action.value) return next;
    next.config.changeNote=action.value; return fdCuratorResetReviews(next);
  }
  if(action.type==='SET_PREVIEW_REVIEWED'&&(action.viewport==='desktop'||action.viewport==='mobile')&&typeof action.value==='boolean'){
    next.preview[action.viewport+'Reviewed']=action.value; return next;
  }
  if(action.type==='SET_AFFIRMATION'&&FD_CURATOR_AFFIRMATION_FIELDS.indexOf(action.name)!==-1&&typeof action.value==='boolean'){
    next.affirmations[action.name]=action.value; return next;
  }
  inspected=fdCuratorIndexSnapshot(index,siteContext);
  if(!inspected.ok) return next;
  weekCount=inspected.weekCount;
  allowed=inspected.allowed;
  items=next.config.pathItems;
  if(action.type==='LOCAL_SET_ORIENTATION'){
    if(FD_CURATOR_ORIENTATION_FIELDS.indexOf(action.field)===-1||
       !fdCuratorPlainTextValid(action.value,FD_EDITION_RULES.maxOrientation,true)||
       next.config.localOrientation[action.field]===action.value) return next;
    next.config.localOrientation[action.field]=action.value; return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_CONTACT_ADD'){
    if(next.config.localOrientation.contacts.length>=FD_CURATOR_MAX_ARRAY_ITEMS||
       !fdCuratorPlainTextValid(action.role,FD_EDITION_RULES.maxTitle,false)||!fdCuratorHttpsUrlValid(action.directoryUrl)) return next;
    next.config.localOrientation.contacts.push({role:action.role,directoryUrl:action.directoryUrl});
    return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_CONTACT_REMOVE'){
    if(typeof action.index!=='number'||Math.floor(action.index)!==action.index||action.index<0||
       action.index>=next.config.localOrientation.contacts.length) return next;
    next.config.localOrientation.contacts.splice(action.index,1); return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_CONTACT_UPDATE'){
    if(typeof action.index!=='number'||Math.floor(action.index)!==action.index||action.index<0||
       action.index>=next.config.localOrientation.contacts.length||
       (action.field!=='role'&&action.field!=='directoryUrl')) return next;
    if(action.field==='role'&&!fdCuratorPlainTextValid(action.value,FD_EDITION_RULES.maxTitle,false)) return next;
    if(action.field==='directoryUrl'&&!fdCuratorHttpsUrlValid(action.value)) return next;
    if(next.config.localOrientation.contacts[action.index][action.field]===action.value) return next;
    next.config.localOrientation.contacts[action.index][action.field]=action.value; return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_CHECKLIST_ADD'){
    if(next.config.localOrientation.checklist.length>=FD_EDITION_RULES.maxChecklist||
       !fdCuratorPlainTextValid(action.label,FD_EDITION_RULES.maxTitle,false)||
       FD_EDITION_RULES.priorities.indexOf(action.priority)===-1) return next;
    next.config.localOrientation.checklist.push({
      id:fdCuratorNextLocalId(next,'local:first-day:'),
      label:action.label,priority:action.priority
    });
    return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_CHECKLIST_REMOVE'){
    itemIndex=fdCuratorFindLocalItem(next.config.localOrientation.checklist,action.id);
    if(itemIndex<0) return next;
    next.config.localOrientation.checklist.splice(itemIndex,1); return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_CHECKLIST_UPDATE'){
    itemIndex=fdCuratorFindLocalItem(next.config.localOrientation.checklist,action.id);
    if(itemIndex<0||(action.field!=='label'&&action.field!=='priority')) return next;
    if(action.field==='label'&&!fdCuratorPlainTextValid(action.value,FD_EDITION_RULES.maxTitle,false)) return next;
    if(action.field==='priority'&&FD_EDITION_RULES.priorities.indexOf(action.value)===-1) return next;
    if(next.config.localOrientation.checklist[itemIndex][action.field]===action.value) return next;
    next.config.localOrientation.checklist[itemIndex][action.field]=action.value; return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_RESOURCE_ADD'){
    if(next.config.localOrientation.resources.length>=FD_EDITION_RULES.maxResources||
       !fdCuratorPlainTextValid(action.title,FD_EDITION_RULES.maxTitle,false)||!fdCuratorHttpsUrlValid(action.url)||
       FD_EDITION_RULES.priorities.indexOf(action.priority)===-1||typeof action.week!=='number'||
       Math.floor(action.week)!==action.week||action.week<1||action.week>weekCount||
       !fdCuratorPlainTextValid(action.rationale,FD_EDITION_RULES.maxRationale,true)) return next;
    next.config.localOrientation.resources.push({
      id:fdCuratorNextLocalId(next,'local:resource:'),
      title:action.title,url:action.url,priority:action.priority,week:action.week,rationale:action.rationale
    });
    return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_RESOURCE_REMOVE'){
    itemIndex=fdCuratorFindLocalItem(next.config.localOrientation.resources,action.id);
    if(itemIndex<0) return next;
    next.config.localOrientation.resources.splice(itemIndex,1); return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='LOCAL_RESOURCE_UPDATE'){
    itemIndex=fdCuratorFindLocalItem(next.config.localOrientation.resources,action.id);
    if(itemIndex<0||['title','url','priority','week','rationale'].indexOf(action.field)===-1) return next;
    if(action.field==='title'&&!fdCuratorPlainTextValid(action.value,FD_EDITION_RULES.maxTitle,false)) return next;
    if(action.field==='url'&&!fdCuratorHttpsUrlValid(action.value)) return next;
    if(action.field==='priority'&&FD_EDITION_RULES.priorities.indexOf(action.value)===-1) return next;
    if(action.field==='week'&&(typeof action.value!=='number'||Math.floor(action.value)!==action.value||action.value<1||action.value>weekCount)) return next;
    if(action.field==='rationale'&&!fdCuratorPlainTextValid(action.value,FD_EDITION_RULES.maxRationale,true)) return next;
    if(next.config.localOrientation.resources[itemIndex][action.field]===action.value) return next;
    next.config.localOrientation.resources[itemIndex][action.field]=action.value; return fdCuratorCommitLocalMutation(next,current,index,siteContext);
  }
  if(action.type==='PATH_TOGGLE'){
    if(typeof action.ref!=='string'||!allowed[action.ref]) return next;
    for(i=items.length-1;i>=0;i--) if(items[i].ref===action.ref){ items.splice(i,1); changed=true; }
    if(!changed){
      targetWeek=action.week===undefined?fdCuratorDefaultWeek(next,inspected,action.ref):action.week;
      if(typeof targetWeek!=='number'||Math.floor(targetWeek)!==targetWeek||targetWeek<1||targetWeek>weekCount) return next;
      weekItems=items.filter(function(candidate){return candidate.week===targetWeek;});
      items.push({instanceId:fdCuratorNextInstanceId(items,action.ref),ref:action.ref,week:targetWeek,
        order:weekItems.length+1,priority:'recommended',rationale:''});
    }
    return fdCuratorPathChanged(next,weekCount);
  }
  if(action.type==='PATH_ADD_INSTANCE'){
    if(typeof action.ref!=='string'||!allowed[action.ref]) return next;
    targetWeek=action.week===undefined?fdCuratorDefaultWeek(next,inspected,action.ref):action.week;
    if(typeof targetWeek!=='number'||Math.floor(targetWeek)!==targetWeek||targetWeek<1||targetWeek>weekCount) return next;
    weekItems=items.filter(function(candidate){return candidate.week===targetWeek;});
    items.push({instanceId:fdCuratorNextInstanceId(items,action.ref),ref:action.ref,week:targetWeek,
      order:weekItems.length+1,priority:'recommended',rationale:''});
    return fdCuratorPathChanged(next,weekCount);
  }
  itemIndex=fdCuratorFindPathItem(items,action.instanceId);
  if(action.type==='PATH_REMOVE_INSTANCE'){
    if(itemIndex<0) return next;
    items.splice(itemIndex,1); return fdCuratorPathChanged(next,weekCount);
  }
  if(action.type==='PATH_SET_PRIORITY'){
    if(itemIndex<0||FD_EDITION_RULES.priorities.indexOf(action.priority)===-1||items[itemIndex].priority===action.priority) return next;
    items[itemIndex].priority=action.priority; return fdCuratorPathChanged(next,weekCount);
  }
  if(action.type==='PATH_SET_RATIONALE'){
    if(itemIndex<0||!fdCuratorRationaleValid(action.value)||items[itemIndex].rationale===action.value) return next;
    items[itemIndex].rationale=action.value; return fdCuratorPathChanged(next,weekCount);
  }
  if(action.type==='PATH_MOVE_WEEK'){
    if(itemIndex<0||typeof action.week!=='number'||Math.floor(action.week)!==action.week||
       action.week<1||action.week>weekCount||items[itemIndex].week===action.week) return next;
    targetWeek=action.week; weekItems=items.filter(function(candidate){return candidate.week===targetWeek;});
    items[itemIndex].week=targetWeek; items[itemIndex].order=weekItems.length+1;
    return fdCuratorPathChanged(next,weekCount);
  }
  if(action.type==='PATH_MOVE_UP'||action.type==='PATH_MOVE_DOWN'){
    if(itemIndex<0) return next;
    item=items[itemIndex];
    weekItems=items.filter(function(candidate){return candidate.week===item.week;})
      .sort(function(a,b){return a.order-b.order;});
    position=weekItems.indexOf(item);
    if(action.type==='PATH_MOVE_UP'&&position>0) otherIndex=fdCuratorFindPathItem(items,weekItems[position-1].instanceId);
    else if(action.type==='PATH_MOVE_DOWN'&&position>=0&&position<weekItems.length-1) otherIndex=fdCuratorFindPathItem(items,weekItems[position+1].instanceId);
    else return next;
    i=items[itemIndex].order; items[itemIndex].order=items[otherIndex].order; items[otherIndex].order=i;
    return fdCuratorPathChanged(next,weekCount);
  }
  if(action.type==='GENERATION_SUCCEEDED'){
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

function fdCuratorSemanticDraftJson(draft,index,siteContext){
  var shaped,value;
  try{
    shaped=fdCuratorValidateDraft(draft,index,siteContext);
    if(!shaped.ok) return null;
    value=shaped.draft;
    return fdEditionCanonicalJson({
      schemaVersion:value.schemaVersion,site:value.site,config:value.config,
      preview:value.preview,affirmations:value.affirmations,publication:value.publication
    });
  }catch(ignoreSemanticDraft){ return null; }
}

function fdCuratorApplyAction(draft,action,index,siteContext){
  var before=fdCuratorSemanticDraftJson(draft,index,siteContext),state,after;
  try{ state=fdCuratorReduce(draft,action,index,siteContext); }
  catch(ignoreReduction){ state=fdCuratorUnchangedResult(draft,index,siteContext); }
  after=fdCuratorSemanticDraftJson(state,index,siteContext);
  return {state:state,changed:before!==null&&after!==null&&before!==after};
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

function fdCuratorLocalFindingLocation(path){
  var match,field,index;
  match=/^\/config\/localOrientation\/([A-Za-z]+)$/.exec(path);
  if(match&&FD_CURATOR_ORIENTATION_FIELDS.indexOf(match[1])!==-1){
    field=match[1];
    return {fieldId:'curator'+field.charAt(0).toUpperCase()+field.slice(1),category:'Orientation',field:FD_CURATOR_LOCAL_LABELS[field]};
  }
  match=/^\/config\/localOrientation\/(contacts|checklist|resources)\/(\d+)\/(role|directoryUrl|label|priority|title|url|week|rationale|id)$/.exec(path);
  if(match){
    index=Number(match[2]); field=match[3];
    if(match[1]==='contacts') return {
      fieldId:'curatorContact'+index+(field==='directoryUrl'?'DirectoryUrl':'Role'),category:'Directory contact',
      field:field==='directoryUrl'?'Directory URL':'Role label'
    };
    if(match[1]==='checklist') return {
      fieldId:'curatorChecklist'+index+(field==='priority'?'Priority':'Label'),category:'First-day checklist',
      field:field==='priority'?'Priority':'Label'
    };
    return {
      fieldId:'curatorResource'+index+({title:'Title',url:'Url',priority:'Priority',week:'Week',rationale:'Rationale',id:'Title'}[field]||'Title'),
      category:'Local resource',field:{title:'Title',url:'URL',priority:'Priority',week:'Week',rationale:'Selection rationale',id:'Identifier'}[field]
    };
  }
  if(path==='/config/localOrientation/contacts') return {fieldId:'curatorNewContactRole',category:'Directory contacts',field:'Contact list'};
  if(path==='/config/localOrientation/checklist') return {fieldId:'curatorNewChecklistLabel',category:'First-day checklist',field:'Checklist items'};
  if(path==='/config/localOrientation/resources') return {fieldId:'curatorNewResourceTitle',category:'Local resources',field:'Resource list'};
  if(path==='/config') return {fieldId:'curatorEditorTitle',category:'Local details',field:'Total edition size'};
  return null;
}

function fdCuratorLocalFindings(result,draft){
  var out={errors:[],warnings:[]},groups=['errors','warnings'],g,i,source,location,finding,target;
  result=result||{};
  for(g=0;g<groups.length;g++){
    source=Array.isArray(result[groups[g]])?result[groups[g]]:[];
    for(i=0;i<source.length;i++){
      finding=source[i]; location=finding&&typeof finding.path==='string'?fdCuratorLocalFindingLocation(finding.path):null;
      if(!location) continue;
      target={
        code:finding.code,fieldId:location.fieldId,href:'#'+location.fieldId,
        message:location.category+' — '+location.field+': '+finding.message,
        blocking:finding.blocking!==false
      };
      out[groups[g]].push(target);
    }
  }
  return out;
}

function fdCuratorLocalPolicy(draft,index,siteContext){
  var shaped=fdCuratorValidateDraft(draft,index,siteContext),candidate,result;
  if(!shaped.ok) return {ok:false,errors:[fdCuratorStepError('curatorEditorTitle','The draft structure is invalid.')],warnings:[]};
  candidate=fdCuratorFullConfig(shaped.draft.config,shaped.draft.site,1,shaped.draft.site.coreRevision);
  result=fdEditionValidateConfig(candidate,index,siteContext);
  result=fdCuratorLocalFindings(result,shaped.draft);
  return {ok:result.errors.length===0,errors:result.errors,warnings:result.warnings};
}

function fdCuratorPendingFinding(fieldId,category,field,message,blocking){
  return {code:'CURATOR_PENDING',fieldId:fieldId,href:'#'+fieldId,
    message:category+' — '+field+': '+message,blocking:blocking!==false};
}

function fdCuratorPendingSharedFindings(result,type,itemIndex){
  var out={errors:[],warnings:[]},groups=['errors','warnings'],prefix,fields,g,i,finding,suffix,fieldId,label;
  if(type==='contact'){
    prefix='/config/localOrientation/contacts/'+itemIndex+'/';
    fields={role:['curatorNewContactRole','Role label'],directoryUrl:['curatorNewContactDirectoryUrl','Directory URL']};
    label='Directory contact';
  }else if(type==='checklist'){
    prefix='/config/localOrientation/checklist/'+itemIndex+'/';
    fields={label:['curatorNewChecklistLabel','Label'],priority:['curatorNewChecklistPriority','Priority']};
    label='First-day checklist';
  }else{
    prefix='/config/localOrientation/resources/'+itemIndex+'/';
    fields={title:['curatorNewResourceTitle','Title'],url:['curatorNewResourceUrl','URL'],priority:['curatorNewResourcePriority','Priority'],week:['curatorNewResourceWeek','Week'],rationale:['curatorNewResourceRationale','Selection rationale']};
    label='Local resource';
  }
  for(g=0;g<groups.length;g++) for(i=0;i<(result[groups[g]]||[]).length;i++){
    finding=result[groups[g]][i];
    if(!finding||typeof finding.path!=='string'||finding.path.indexOf(prefix)!==0) continue;
    suffix=finding.path.slice(prefix.length); if(!fields[suffix]) continue;
    fieldId=fields[suffix][0];
    out[groups[g]].push({code:finding.code,fieldId:fieldId,href:'#'+fieldId,
      message:label+' — '+fields[suffix][1]+': '+finding.message,blocking:finding.blocking!==false});
  }
  return out;
}

function fdCuratorReadPendingObject(value,fields){
  var keys,prototype,allowed=Object.create(null),out={},i,key,descriptor;
  if(!value||typeof value!=='object') return null;
  try{
    if(Array.isArray(value)) return null;
    prototype=Object.getPrototypeOf(value);
    if(prototype!==Object.prototype) return null;
    keys=Reflect.ownKeys(value);
  }catch(ignorePendingShape){ return null; }
  if(keys.length!==fields.length) return null;
  for(i=0;i<fields.length;i++) allowed[fields[i]]=true;
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(typeof key!=='string'||!allowed[key]) return null;
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
    catch(ignorePendingDescriptor){ return null; }
    if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')) return null;
    out[key]=descriptor.value;
  }
  return out;
}

function fdCuratorValidatePendingLocal(pending,draft,index,siteContext,scope,mode){
  var pendingTop=fdCuratorReadPendingObject(pending,['contact','checklist','resource']);
  var pendingContact=pendingTop&&fdCuratorReadPendingObject(pendingTop.contact,['role','directoryUrl']);
  var pendingChecklist=pendingTop&&fdCuratorReadPendingObject(pendingTop.checklist,['label','priority']);
  var pendingResource=pendingTop&&fdCuratorReadPendingObject(pendingTop.resource,['title','url','priority','week','rationale']);
  var shaped=fdCuratorValidateDraft(draft,index,siteContext),types=scope==='all'?['contact','checklist','resource']:[scope];
  var out={ok:true,empty:true,errors:[],warnings:[],action:null},i,type,value,has,action,next,checked,mapped,itemIndex,fieldId;
  var candidate,errorCount,expectedLength,actualLength;
  if(!pendingTop||!pendingContact||!pendingChecklist||!pendingResource||!shaped.ok||types.some(function(name){return ['contact','checklist','resource'].indexOf(name)===-1;})){
    out.ok=false; out.errors.push(fdCuratorPendingFinding('curatorEditorTitle','Local details','Pending item','The pending fields could not be validated.')); return out;
  }
  pending={contact:pendingContact,checklist:pendingChecklist,resource:pendingResource}; draft=shaped.draft;
  for(i=0;i<types.length;i++){
    type=types[i]; value=pending[type]||{};
    has=type==='contact'?((typeof value.role==='string'&&value.role.length>0)||(typeof value.directoryUrl==='string'&&value.directoryUrl.length>0)):
      type==='checklist'?(typeof value.label==='string'&&value.label.length>0):
      ((typeof value.title==='string'&&value.title.length>0)||(typeof value.url==='string'&&value.url.length>0)||(typeof value.rationale==='string'&&value.rationale.length>0));
    if(!has&&scope==='all') continue;
    out.empty=false;
    errorCount=out.errors.length;
    if(type==='contact'){
      if(!fdCuratorPlainTextValid(value.role,FD_EDITION_RULES.maxTitle,false)) out.errors.push(fdCuratorPendingFinding('curatorNewContactRole','Directory contact','Role label','Enter a public role label of at most 100 characters.'));
      if(!fdCuratorHttpsUrlValid(value.directoryUrl)) out.errors.push(fdCuratorPendingFinding('curatorNewContactDirectoryUrl','Directory contact','Directory URL','Enter an absolute HTTPS institutional directory URL without embedded credentials.'));
      if(draft.config.localOrientation.contacts.length>=FD_CURATOR_MAX_ARRAY_ITEMS) out.errors.push(fdCuratorPendingFinding('curatorNewContactRole','Directory contacts','Contact list','The safe structural contact limit has been reached.'));
      action={type:'LOCAL_CONTACT_ADD',role:value.role,directoryUrl:value.directoryUrl};
      itemIndex=draft.config.localOrientation.contacts.length;
    }else if(type==='checklist'){
      if(!fdCuratorPlainTextValid(value.label,FD_EDITION_RULES.maxTitle,false)) out.errors.push(fdCuratorPendingFinding('curatorNewChecklistLabel','First-day checklist','Label','Enter a checklist label of at most 100 characters.'));
      if(FD_EDITION_RULES.priorities.indexOf(value.priority)===-1) out.errors.push(fdCuratorPendingFinding('curatorNewChecklistPriority','First-day checklist','Priority','Choose required, recommended, or optional.'));
      if(draft.config.localOrientation.checklist.length>=FD_EDITION_RULES.maxChecklist) out.errors.push(fdCuratorPendingFinding('curatorNewChecklistLabel','First-day checklist','Checklist items','At most 24 checklist items are allowed.'));
      action={type:'LOCAL_CHECKLIST_ADD',label:value.label,priority:value.priority};
      itemIndex=draft.config.localOrientation.checklist.length;
    }else{
      if(!fdCuratorPlainTextValid(value.title,FD_EDITION_RULES.maxTitle,false)) out.errors.push(fdCuratorPendingFinding('curatorNewResourceTitle','Local resource','Title','Enter a resource title of at most 100 characters.'));
      if(!fdCuratorHttpsUrlValid(value.url)) out.errors.push(fdCuratorPendingFinding('curatorNewResourceUrl','Local resource','URL','Enter an absolute HTTPS institutional URL without embedded credentials.'));
      if(FD_EDITION_RULES.priorities.indexOf(value.priority)===-1) out.errors.push(fdCuratorPendingFinding('curatorNewResourcePriority','Local resource','Priority','Choose required, recommended, or optional.'));
      if(typeof value.week!=='number'||Math.floor(value.week)!==value.week||value.week<1||value.week>fdCuratorWeekCount(index,siteContext)) out.errors.push(fdCuratorPendingFinding('curatorNewResourceWeek','Local resource','Week','Choose a week within this audience path.'));
      if(!fdCuratorPlainTextValid(value.rationale,FD_EDITION_RULES.maxRationale,true)) out.errors.push(fdCuratorPendingFinding('curatorNewResourceRationale','Local resource','Selection rationale','Enter at most 280 plain-text characters.'));
      if(draft.config.localOrientation.resources.length>=FD_EDITION_RULES.maxResources) out.errors.push(fdCuratorPendingFinding('curatorNewResourceTitle','Local resources','Resource list','At most 12 local resources are allowed.'));
      action={type:'LOCAL_RESOURCE_ADD',title:value.title,url:value.url,priority:value.priority,week:value.week,rationale:value.rationale};
      itemIndex=draft.config.localOrientation.resources.length;
    }
    if(out.errors.length!==errorCount) continue;
    candidate=fdCuratorClone(draft);
    if(type==='contact') candidate.config.localOrientation.contacts.push({role:action.role,directoryUrl:action.directoryUrl});
    else if(type==='checklist') candidate.config.localOrientation.checklist.push({
      id:fdCuratorNextLocalId(candidate,'local:first-day:'),label:action.label,priority:action.priority
    });
    else candidate.config.localOrientation.resources.push({
      id:fdCuratorNextLocalId(candidate,'local:resource:'),title:action.title,url:action.url,
      priority:action.priority,week:action.week,rationale:action.rationale
    });
    checked=fdEditionValidateConfig(fdCuratorFullConfig(candidate.config,candidate.site,1,candidate.site.coreRevision),index,siteContext);
    mapped=fdCuratorPendingSharedFindings(checked,type,itemIndex);
    out.errors=out.errors.concat(mapped.errors); out.warnings=out.warnings.concat(mapped.warnings);
    if(checked.errors.length&&!mapped.errors.length){
      fieldId=type==='contact'?'curatorNewContactRole':type==='checklist'?'curatorNewChecklistLabel':'curatorNewResourceTitle';
      out.errors.push(fdCuratorPendingFinding(fieldId,type==='contact'?'Directory contact':type==='checklist'?'First-day checklist':'Local resource','Pending item','The item could not be added safely.'));
    }
    if(mapped.errors.length||checked.errors.length) continue;
    next=fdCuratorReduce(draft,action,index,siteContext);
    expectedLength=type==='contact'?draft.config.localOrientation.contacts.length+1:type==='checklist'?draft.config.localOrientation.checklist.length+1:draft.config.localOrientation.resources.length+1;
    actualLength=type==='contact'?next.config.localOrientation.contacts.length:type==='checklist'?next.config.localOrientation.checklist.length:next.config.localOrientation.resources.length;
    if(actualLength!==expectedLength){
      fieldId=type==='contact'?'curatorNewContactRole':type==='checklist'?'curatorNewChecklistLabel':'curatorNewResourceTitle';
      out.errors.push(fdCuratorPendingFinding(fieldId,type==='contact'?'Directory contact':type==='checklist'?'First-day checklist':'Local resource','Pending item','The item could not be added safely.'));
      continue;
    }
    if(!mapped.errors.length&&mode==='leave'){
      fieldId=type==='contact'?'curatorNewContactRole':type==='checklist'?'curatorNewChecklistLabel':'curatorNewResourceTitle';
      out.errors.push(fdCuratorPendingFinding(fieldId,type==='contact'?'Directory contact':type==='checklist'?'First-day checklist':'Local resource','Pending item','Add this item or clear its fields before continuing.'));
    }
    if(scope!=='all'&&!mapped.errors.length) out.action=action;
  }
  out.ok=out.errors.length===0;
  return out;
}

function fdCuratorValidateStep(draft,step,index,siteContext){
  var shaped=fdCuratorValidateDraft(draft,index,siteContext),errors=[],card,labels,i,key,value,fieldId;
  if(!shaped.ok) return {ok:false,errors:[fdCuratorStepError('curatorEditorTitle','The draft structure is invalid.')]};
  if(step===4) return fdCuratorLocalPolicy(shaped.draft,index,siteContext);
  if(step!==1) return {ok:true,errors:[],warnings:[]};
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
  return {ok:errors.length===0,errors:errors,warnings:[]};
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
    var snapshot,draft,validated;
    if(!result||result.ok!==true) return {ok:false,code:'CURATOR_IMPORT_INVALID',draft:null,errors:result&&result.errors?result.errors:[]};
    snapshot=fdCuratorValidatedSnapshot(result);
    if(!snapshot) return {ok:false,code:'CURATOR_IMPORT_INVALID',draft:null};
    draft=fdCuratorNewDraft(index,siteContext);
    draft.config={
      card:fdCuratorClone(snapshot.config.card),pathItems:fdCuratorClone(snapshot.config.pathItems),
      localOrientation:fdCuratorClone(snapshot.config.localOrientation),changeNote:snapshot.config.changeNote
    };
    draft.publication={baseEnvelope:fdCuratorClone(snapshot.envelope),baseCanonicalConfig:fdCuratorCanonicalWithoutEdition(snapshot.config),lastGenerated:null};
    validated=fdCuratorValidateDraft(draft,index,siteContext);
    if(!validated.ok) return {ok:false,code:'CURATOR_IMPORT_INVALID',draft:null};
    return {ok:true,code:'CURATOR_IMPORT_OK',draft:validated.draft,fingerprint:snapshot.fingerprint};
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
      var shaped=fdCuratorValidateDraft(draft,index,siteContext),localPolicy;
      if(!shaped.ok||!storage||typeof storage.setItem!=='function') return false;
      localPolicy=fdCuratorLocalPolicy(shaped.draft,index,siteContext);
      if(!localPolicy.ok) return false;
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
      shaped=fdCuratorValidateDraft(parsed,index,siteContext);
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

function fdCuratorPathInstances(draft,ref){
  var out=[],items=draft&&draft.config&&Array.isArray(draft.config.pathItems)?draft.config.pathItems:[],i;
  for(i=0;i<items.length;i++) if(items[i].ref===ref) out.push(items[i]);
  out.sort(function(a,b){return a.week!==b.week?a.week-b.week:a.order-b.order;});
  return out;
}

function fdCuratorWeekPlacement(draft,instance){
  var items=draft&&draft.config&&Array.isArray(draft.config.pathItems)?draft.config.pathItems:[],count=0,i;
  for(i=0;i<items.length;i++) if(items[i].week===instance.week) count++;
  return {position:instance.order,count:count};
}

function fdCuratorPriorityOptions(selected){
  var values=FD_EDITION_RULES.priorities,out='',i;
  for(i=0;i<values.length;i++) out+='<option value="'+values[i]+'"'+(values[i]===selected?' selected':'')+'>'+values[i]+'</option>';
  return out;
}

function fdCuratorCurriculumMarkup(draft,index,query){
  var groups=fdCuratorLibraryGroups(index),needle=typeof query==='string'?query.trim().toLowerCase():'',out='';
  var i,j,k,group,item,instances,title,searchText,groupId,placementId,rationaleId,instance,occurrence,controlLabel,placement;
  for(i=0;i<groups.length;i++){
    group=groups[i]; groupId='curatorGroup'+i; var rows='';
    for(j=0;j<group.items.length;j++){
      item=group.items[j]; title=item.title||item.ref;
      searchText=(group.name+' '+title+' '+item.ref).toLowerCase();
      if(needle&&searchText.indexOf(needle)===-1) continue;
      instances=fdCuratorPathInstances(draft,item.ref);
      rows+='<li class="curator-resource" data-curator-ref="'+fdEsc(item.ref)+'">'+
        '<div class="curator-resource-head"><div><strong>'+fdEsc(title)+'</strong><span class="resource-ref">'+fdEsc(item.ref)+'</span></div>'+
        '<span class="placement-count">'+instances.length+' placement'+(instances.length===1?'':'s')+'</span></div>'+
        '<div class="resource-actions"><button type="button" class="secondary-action" data-curator-path-toggle="'+fdEsc(item.ref)+'">'+
        (instances.length?'Omit from curated Path':'Include in curated Path')+'</button>'+
        '<button type="button" class="secondary-action" data-curator-path-add="'+fdEsc(item.ref)+'">Add another placement</button></div>';
      if(instances.length){
        rows+='<ul class="placement-list" aria-label="Placements for '+fdEsc(title)+'">';
        for(k=0;k<instances.length;k++){
          instance=instances[k]; occurrence=fdCuratorInstanceOccurrence(instance);
          placementId='curatorPlacement'+i+'_'+j+'_'+k; rationaleId=placementId+'Rationale';
          placement=fdCuratorWeekPlacement(draft,instance);
          controlLabel=title+' placement '+occurrence+', position '+placement.position+' of '+placement.count+' in Week '+instance.week;
          rows+='<li><p><strong>Placement '+occurrence+'</strong> · Position '+placement.position+' of '+placement.count+' in Week '+instance.week+'</p>'+
            '<div class="placement-fields"><div><label for="'+placementId+'Priority">Local priority</label>'+
            '<select id="'+placementId+'Priority" data-curator-path-priority="'+fdEsc(instance.instanceId)+'" aria-label="Local priority for '+fdEsc(controlLabel)+'">'+fdCuratorPriorityOptions(instance.priority)+'</select></div>'+
            '<div class="rationale-field"><label for="'+rationaleId+'">Why I selected this</label>'+
            '<textarea id="'+rationaleId+'" maxlength="280" rows="2" data-curator-path-rationale="'+fdEsc(instance.instanceId)+'" aria-label="Why I selected '+fdEsc(controlLabel)+'" aria-describedby="'+rationaleId+'Count">'+fdEsc(instance.rationale)+'</textarea>'+
            '<p id="'+rationaleId+'Count" class="character-count" data-curator-rationale-count="'+fdEsc(instance.instanceId)+'">'+
            fdEditionTextLength(instance.rationale)+' of 280 characters</p></div></div></li>';
        }
        rows+='</ul>';
      }else rows+='<p class="field-description">Available in the full Library; not currently placed in the curated Path.</p>';
      rows+='</li>';
    }
    if(rows) out+='<section class="curator-resource-group" aria-labelledby="'+groupId+'"><h3 id="'+groupId+'">'+fdEsc(group.name)+'</h3><ul>'+rows+'</ul></section>';
  }
  return out||'<p class="empty-state">No Library resources match this search.</p>';
}

function fdCuratorScheduleMarkup(draft,index){
  var inspected=fdCuratorIndexSnapshot(index,draft&&draft.site),weekCount=inspected.ok?inspected.weekCount:0;
  var out='',week,items,i,j,k,item,title,id,options,occurrence,placementLabel,titleByRef=Object.create(null);
  if(!inspected.ok||!draft||!draft.config||!Array.isArray(draft.config.pathItems)) return out;
  for(i=0;i<inspected.groups.length;i++) for(j=0;j<inspected.groups[i].items.length;j++)
    titleByRef[inspected.groups[i].items[j].ref]=inspected.groups[i].items[j].title;
  for(i=1;i<=weekCount;i++){
    week=inspected.weeks[i-1]; items=[];
    for(j=0;j<draft.config.pathItems.length;j++) if(draft.config.pathItems[j].week===i) items.push(draft.config.pathItems[j]);
    items.sort(function(a,b){return a.order-b.order;});
    out+='<section class="curator-week" data-curator-week="'+i+'" aria-labelledby="curatorWeek'+i+'Title">'+
      '<div class="curator-week-heading"><h3 id="curatorWeek'+i+'Title">Week '+i+(week.title?' · '+fdEsc(week.title):'')+'</h3><span>'+items.length+' item'+(items.length===1?'':'s')+'</span></div>'+
      '<ol class="curator-week-list">';
    if(!items.length) out+='<li class="empty-state">No resources scheduled for Week '+i+'.</li>';
    for(j=0;j<items.length;j++){
      item=items[j]; title=titleByRef[item.ref]||item.ref; id='curatorSchedule'+i+'_'+j; options='';
      occurrence=fdCuratorInstanceOccurrence(item);
      placementLabel=title+' placement '+occurrence+', position '+(j+1)+' of '+items.length+' in Week '+i;
      for(k=1;k<=weekCount;k++) options+='<option value="'+k+'"'+(k===i?' selected':'')+'>Week '+k+'</option>';
      out+='<li class="schedule-item" data-curator-instance="'+fdEsc(item.instanceId)+'"><div><strong>'+fdEsc(title)+'</strong>'+
        '<span class="schedule-meta">'+fdEsc(item.priority)+' · placement '+occurrence+' · position '+(j+1)+' of '+items.length+'</span></div><div class="schedule-actions">'+
        '<button type="button" class="secondary-action" data-curator-path-up="'+fdEsc(item.instanceId)+'" aria-label="Move '+fdEsc(placementLabel)+' up"'+(j===0?' disabled':'')+'>Move up</button>'+
        '<button type="button" class="secondary-action" data-curator-path-down="'+fdEsc(item.instanceId)+'" aria-label="Move '+fdEsc(placementLabel)+' down"'+(j===items.length-1?' disabled':'')+'>Move down</button>'+
        '<label class="visually-hidden" for="'+id+'Week">Move '+fdEsc(placementLabel)+' to another week</label>'+
        '<select id="'+id+'Week" data-curator-path-week="'+fdEsc(item.instanceId)+'" aria-label="Move '+fdEsc(placementLabel)+' to another week">'+options+'</select>'+
        '<button type="button" class="secondary-action remove-action" data-curator-path-remove="'+fdEsc(item.instanceId)+'" aria-label="Remove '+fdEsc(placementLabel)+' from the curated Path">Remove</button>'+
        '</div></li>';
    }
    out+='</ol></section>';
  }
  return out;
}

function fdCuratorProjectDraft(draft,index,siteContext,subtle){
  var built=fdCuratorBuildConfig(draft,index,siteContext);
  if(!built.ok) return Promise.resolve({ok:false,errors:built.errors||[],warnings:built.warnings||[]});
  return fdEditionCreateEnvelope(built.value,index,siteContext,subtle).then(function(created){
    if(!created||created.ok!==true) return created||{ok:false,errors:[]};
    return fdProjectEdition(index,created);
  },function(){ return {ok:false,errors:[{code:'CURATOR_PREVIEW',path:'/preview',message:'The preview could not be generated.',blocking:true}]}; });
}

function fdCuratorExternalDomain(value){
  var parsed;
  if(typeof value!=='string') return '';
  try{ parsed=new URL(value); }
  catch(ignoreUrl){ return ''; }
  if(parsed.protocol!=='https:'||parsed.username!==''||parsed.password!==''||!fdEditionHostnameValid(parsed.hostname)) return '';
  return parsed.hostname;
}

function fdCuratorLocalPreviewMarkup(projected){
  var edition=projected&&projected.ok===true&&projected.index?projected.index.edition:null;
  var local=edition&&edition.localOrientation,out='',i,item,domain,field,value;
  if(!local) return '<p class="panel-note">Complete the local fields, then choose a deliberate preview review.</p>';
  out='<section class="local-preview" aria-label="Attending-provided local orientation"><p class="preview-label">Attending-provided local orientation</p>';
  for(i=0;i<FD_CURATOR_ORIENTATION_FIELDS.length;i++){
    field=FD_CURATOR_ORIENTATION_FIELDS[i]; value=local[field];
    if(value) out+='<section><h3>'+fdEsc(FD_CURATOR_LOCAL_LABELS[field])+'</h3><p>'+fdEsc(value)+'</p></section>';
  }
  if(local.contacts.length){
    out+='<section><h3>Role-based directory contacts</h3><ul>';
    for(i=0;i<local.contacts.length;i++){
      item=local.contacts[i]; domain=fdCuratorExternalDomain(item.directoryUrl);
      out+='<li><strong>'+fdEsc(item.role)+'</strong><span>Official directory · '+fdEsc(domain||'Invalid domain')+'</span></li>';
    }
    out+='</ul></section>';
  }
  if(local.checklist.length){
    out+='<section><h3>First-day checklist</h3><ol>';
    for(i=0;i<local.checklist.length;i++){
      item=local.checklist[i]; out+='<li><strong>'+fdEsc(item.label)+'</strong><span>'+fdEsc(item.priority)+'</span></li>';
    }
    out+='</ol></section>';
  }
  if(local.resources.length){
    out+='<section><h3>Local resources</h3><ul>';
    for(i=0;i<local.resources.length;i++){
      item=local.resources[i]; domain=fdCuratorExternalDomain(item.url);
      out+='<li><p class="preview-local-label">Attending-provided local resource</p><strong>'+fdEsc(item.title)+'</strong>'+
        '<span>'+fdEsc(item.priority)+' · Week '+item.week+' · '+fdEsc(domain||'Invalid domain')+'</span>'+
        (item.rationale?'<p>'+fdEsc(item.rationale)+'</p>':'')+'</li>';
    }
    out+='</ul></section>';
  }
  return out+'</section>';
}

function fdCuratorContactsMarkup(draft){
  var items=draft.config.localOrientation.contacts,out='',i,item;
  for(i=0;i<items.length;i++){
    item=items[i]; out+='<li class="local-item"><div class="field-grid"><div class="field"><label for="curatorContact'+i+'Role">Role label</label>'+
      '<input id="curatorContact'+i+'Role" maxlength="200" data-curator-max-codepoints="100" value="'+fdEsc(item.role)+'" data-curator-contact-index="'+i+'" data-curator-contact-field="role" aria-describedby="curatorContact'+i+'RoleCount"><p id="curatorContact'+i+'RoleCount" class="character-count">'+fdEditionTextLength(item.role)+' of 100 characters</p></div>'+
      '<div class="field"><label for="curatorContact'+i+'DirectoryUrl">Official HTTPS directory URL</label>'+
      '<input id="curatorContact'+i+'DirectoryUrl" maxlength="4096" data-curator-max-codepoints="2048" type="url" value="'+fdEsc(item.directoryUrl)+'" data-curator-contact-index="'+i+'" data-curator-contact-field="directoryUrl" aria-describedby="curatorContact'+i+'DirectoryUrlCount"><p id="curatorContact'+i+'DirectoryUrlCount" class="character-count">'+fdEditionTextLength(item.directoryUrl)+' of 2048 characters</p>'+
      '<p class="field-description">Visible domain: '+fdEsc(fdCuratorExternalDomain(item.directoryUrl))+'</p></div></div>'+
      '<button type="button" class="secondary-action remove-action" data-curator-contact-remove="'+i+'">Remove contact</button></li>';
  }
  return out||'<li class="empty-state">No role-based directory contacts added.</li>';
}

function fdCuratorChecklistMarkup(draft){
  var items=draft.config.localOrientation.checklist,out='',i,item;
  for(i=0;i<items.length;i++){
    item=items[i]; out+='<li class="local-item"><div class="field-grid"><div class="field"><label for="curatorChecklist'+i+'Label">Checklist label</label>'+
      '<input id="curatorChecklist'+i+'Label" maxlength="200" data-curator-max-codepoints="100" value="'+fdEsc(item.label)+'" data-curator-checklist-id="'+fdEsc(item.id)+'" data-curator-checklist-field="label" aria-describedby="curatorChecklist'+i+'LabelCount">'+
      '<p id="curatorChecklist'+i+'LabelCount" class="character-count">'+fdEditionTextLength(item.label)+' of 100 characters</p></div>'+
      '<div class="field"><label for="curatorChecklist'+i+'Priority">Local priority</label><select id="curatorChecklist'+i+'Priority" data-curator-checklist-id="'+fdEsc(item.id)+'" data-curator-checklist-field="priority">'+fdCuratorPriorityOptions(item.priority)+'</select></div></div>'+
      '<button type="button" class="secondary-action remove-action" data-curator-checklist-remove="'+fdEsc(item.id)+'">Remove checklist item</button></li>';
  }
  return out||'<li class="empty-state">No first-day checklist items added.</li>';
}

function fdCuratorResourceWeekOptions(selected,weekCount){
  var out='',i;
  for(i=1;i<=weekCount;i++) out+='<option value="'+i+'"'+(i===selected?' selected':'')+'>Week '+i+'</option>';
  return out;
}

function fdCuratorResourcesMarkup(draft,index){
  var items=draft.config.localOrientation.resources,out='',i,item,weekCount=fdCuratorWeekCount(index,draft.site);
  for(i=0;i<items.length;i++){
    item=items[i]; out+='<li class="local-item"><div class="field-grid">'+
      '<div class="field"><label for="curatorResource'+i+'Title">Resource title</label><input id="curatorResource'+i+'Title" maxlength="200" data-curator-max-codepoints="100" value="'+fdEsc(item.title)+'" data-curator-resource-id="'+fdEsc(item.id)+'" data-curator-resource-field="title" aria-describedby="curatorResource'+i+'TitleCount"><p id="curatorResource'+i+'TitleCount" class="character-count">'+fdEditionTextLength(item.title)+' of 100 characters</p></div>'+
      '<div class="field"><label for="curatorResource'+i+'Url">Official HTTPS URL</label><input id="curatorResource'+i+'Url" type="url" maxlength="4096" data-curator-max-codepoints="2048" value="'+fdEsc(item.url)+'" data-curator-resource-id="'+fdEsc(item.id)+'" data-curator-resource-field="url" aria-describedby="curatorResource'+i+'UrlCount"><p id="curatorResource'+i+'UrlCount" class="character-count">'+fdEditionTextLength(item.url)+' of 2048 characters</p><p class="field-description">Visible domain: '+fdEsc(fdCuratorExternalDomain(item.url))+'</p></div>'+
      '<div class="field"><label for="curatorResource'+i+'Priority">Local priority</label><select id="curatorResource'+i+'Priority" data-curator-resource-id="'+fdEsc(item.id)+'" data-curator-resource-field="priority">'+fdCuratorPriorityOptions(item.priority)+'</select></div>'+
      '<div class="field"><label for="curatorResource'+i+'Week">Week</label><select id="curatorResource'+i+'Week" data-curator-resource-id="'+fdEsc(item.id)+'" data-curator-resource-field="week">'+fdCuratorResourceWeekOptions(item.week,weekCount)+'</select></div>'+
      '<div class="field field-wide"><label for="curatorResource'+i+'Rationale">Why I selected this</label><textarea id="curatorResource'+i+'Rationale" maxlength="560" data-curator-max-codepoints="280" data-curator-resource-id="'+fdEsc(item.id)+'" data-curator-resource-field="rationale" aria-describedby="curatorResource'+i+'RationaleCount">'+fdEsc(item.rationale)+'</textarea><p id="curatorResource'+i+'RationaleCount" class="character-count">'+fdEditionTextLength(item.rationale)+' of 280 characters</p></div></div>'+
      '<button type="button" class="secondary-action remove-action" data-curator-resource-remove="'+fdEsc(item.id)+'">Remove local resource</button></li>';
  }
  return out||'<li class="empty-state">No local external resources added.</li>';
}

function fdCuratorPreviewMarkup(projected){
  var index=projected&&projected.index,selected='',library='',i,j,week,column,item;
  if(!projected||projected.ok!==true||!index) return '<p class="panel-note">Complete the current fields to update this read-only preview.</p>';
  for(i=0;i<index.weeks.length;i++){
    week=index.weeks[i]; selected+='<section><h3>Week '+week.n+'</h3><ol>';
    if(!week.items.length) selected+='<li>No selected resources.</li>';
    for(j=0;j<week.items.length;j++) selected+='<li><strong>'+fdEsc(week.items[j].title)+'</strong><span>'+fdEsc(week.items[j].editionPriority)+'</span></li>';
    selected+='</ol></section>';
  }
  for(i=0;i<index.columns.length;i++){
    column=index.columns[i]; library+='<section><h3>'+fdEsc(column.name)+'</h3><ul>';
    for(j=0;j<column.items.length;j++){
      item=column.items[j]; library+='<li>'+fdEsc(item.title)+'</li>';
    }
    library+='</ul></section>';
  }
  return '<p class="preview-label">Projected student Path</p><div class="preview-weeks">'+selected+'</div>'+
    '<details class="preview-library"><summary>Full Library remains available</summary>'+library+'</details>'+fdCuratorLocalPreviewMarkup(projected);
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

function fdCuratorRenderWarnings(root,warnings){
  var node=root.querySelector('#curatorAdvisorySummary'),out='',i;
  if(!node) return;
  if(!warnings||!warnings.length){ node.hidden=true; node.innerHTML=''; return; }
  out='<h3>Advisory review</h3><ul>';
  for(i=0;i<warnings.length;i++) out+='<li><a href="'+fdEsc(warnings[i].href)+'">'+fdEsc(warnings[i].message)+'</a></li>';
  node.innerHTML=out+'</ul>'; node.hidden=false;
}

function fdCuratorRenderReviewStatus(root,state){
  var node=root.querySelector('#curatorPreviewReviewStatus'),next;
  if(!node) return;
  next=(state.preview.desktopReviewed?'Desktop preview reviewed':'Desktop preview not yet reviewed')+' · '+
    (state.preview.mobileReviewed?'Mobile preview reviewed':'Mobile preview not yet reviewed');
  if(node.textContent!==next) node.textContent=next;
}

function fdCuratorRender(state,root,index,errors,warnings){
  var audience,path,editorTitle,status,generate,buttons,selected,i,input,mount,field,count;
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
  input=root.querySelector('#curatorStepTwo'); if(input) input.hidden=state.step!==2;
  input=root.querySelector('#curatorStepThree'); if(input) input.hidden=state.step!==3;
  input=root.querySelector('#curatorStepFour'); if(input) input.hidden=state.step!==4;
  input=root.querySelector('#curatorFutureStep'); if(input) input.hidden=state.step!==5;
  input=root.querySelector('#curatorLocalViewToggle'); if(input) input.hidden=state.step!==4;
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
  mount=root.querySelector('#curatorCurriculumGroups');
  input=root.querySelector('#curatorLibrarySearch');
  if(mount) mount.innerHTML=fdCuratorCurriculumMarkup(state,index,input?input.value:'');
  mount=root.querySelector('#curatorScheduleWeeks');
  if(mount) mount.innerHTML=fdCuratorScheduleMarkup(state,index);
  for(i=0;i<FD_CURATOR_ORIENTATION_FIELDS.length;i++){
    field=FD_CURATOR_ORIENTATION_FIELDS[i]; input=root.querySelector('[data-curator-orientation="'+field+'"]');
    if(input&&input.value!==state.config.localOrientation[field]) input.value=state.config.localOrientation[field];
    count=root.querySelector('#curator'+field.charAt(0).toUpperCase()+field.slice(1)+'Count');
    if(count) count.textContent=fdEditionTextLength(state.config.localOrientation[field])+' of 600 characters';
  }
  mount=root.querySelector('#curatorContactsList'); if(mount) mount.innerHTML=fdCuratorContactsMarkup(state);
  mount=root.querySelector('#curatorChecklistList'); if(mount) mount.innerHTML=fdCuratorChecklistMarkup(state);
  mount=root.querySelector('#curatorResourcesList'); if(mount) mount.innerHTML=fdCuratorResourcesMarkup(state,index);
  input=root.querySelector('#curatorNewResourceWeek');
  if(input&&(!input.options||!input.options.length)) input.innerHTML=fdCuratorResourceWeekOptions(1,fdCuratorWeekCount(index,state.site));
  count=root.querySelector('#curatorChecklistCap'); if(count) count.textContent=state.config.localOrientation.checklist.length+' of 24 items';
  count=root.querySelector('#curatorResourcesCap'); if(count) count.textContent=state.config.localOrientation.resources.length+' of 12 items';
  fdCuratorRenderReviewStatus(root,state);
  fdCuratorRenderErrors(root,errors||[]);
  fdCuratorRenderWarnings(root,warnings||[]);
  if(generate){ generate.disabled=true; generate.setAttribute('aria-disabled','true'); }
}

function fdCuratorMount(root,index,siteContext){
  var state=fdCuratorNewDraft(index,siteContext),errors=[],warnings=[],touched=false;
  var adapter=fdCuratorDraftStorage(typeof localStorage==='undefined'?null:localStorage);
  var importTransactions=fdCuratorImportTransactions();
  var subtle=typeof crypto!=='undefined'&&crypto?crypto.subtle:null;
  var buttons,i,save,continueButton,importInput,previewSequence=0;
  var reviewSequences={desktop:0,mobile:0},reviewCache=null,reviewLoading=null,layoutRevision=0;
  var orientationIssues=Object.create(null);
  var reviewWindow=root&&root.ownerDocument?root.ownerDocument.defaultView:null;
  var reviewPlaceholder='<p class="panel-note">Choose Review desktop preview or Review mobile preview to validate and update this preview.</p>';
  function visibleVersion(){
    var shaped=fdCuratorValidateDraft(state,index,siteContext);
    if(!shaped.ok) return '';
    return fdEditionCanonicalJson({
      site:shaped.draft.site,config:shaped.draft.config,
      baseCanonicalConfig:shaped.draft.publication.baseCanonicalConfig
    });
  }
  function refreshPreview(){
    var sequence=++previewSequence;
    var preview=root.querySelector('#curatorPreviewBody');
    if(!preview) return;
    if(state.step===4){
      if(reviewCache&&reviewCache.version===visibleVersion()&&root.getAttribute('data-review-viewport')===reviewCache.viewport) preview.innerHTML=reviewCache.markup;
      else preview.innerHTML=reviewPlaceholder;
      return;
    }
    if(state.step!==2&&state.step!==3){
      preview.innerHTML='<p class="panel-note">Preview is read-only and updates from the validated curriculum and schedule.</p>';
      return;
    }
    preview.innerHTML='<p class="panel-note">Updating the validated student preview…</p>';
    fdCuratorProjectDraft(state,index,siteContext,subtle).then(function(result){
      if(sequence!==previewSequence) return;
      preview.innerHTML=fdCuratorPreviewMarkup(result);
    });
  }
  function orientationIssueLists(){
    var out={errors:[],warnings:[]},key,issue;
    for(key in orientationIssues) if(Object.prototype.hasOwnProperty.call(orientationIssues,key)){
      issue=orientationIssues[key]; out.errors=out.errors.concat(issue.errors||[]); out.warnings=out.warnings.concat(issue.warnings||[]);
    }
    return out;
  }
  function restoreOrientationIssues(){
    var key,issue,node,count;
    for(key in orientationIssues) if(Object.prototype.hasOwnProperty.call(orientationIssues,key)){
      issue=orientationIssues[key]; node=root.querySelector('[data-curator-orientation="'+key+'"]');
      if(node) node.value=issue.value;
      count=root.querySelector('#curator'+key.charAt(0).toUpperCase()+key.slice(1)+'Count');
      if(count) count.textContent=fdEditionTextLength(issue.value)+' of 600 characters';
    }
  }
  function render(){ fdCuratorRender(state,root,index,errors,warnings); restoreOrientationIssues(); refreshPreview(); }
  function validateOrientationInput(field,value){
    var candidate=fdCuratorClone(state),result,mapped,fieldId='curator'+field.charAt(0).toUpperCase()+field.slice(1);
    candidate.config.localOrientation[field]=value;
    result=fdEditionValidateConfig(fdCuratorFullConfig(candidate.config,candidate.site,1,candidate.site.coreRevision),index,siteContext);
    mapped=fdCuratorLocalFindings(result,candidate);
    return {
      errors:mapped.errors.filter(function(item){return item.fieldId===fieldId;}),
      warnings:mapped.warnings.filter(function(item){return item.fieldId===fieldId;})
    };
  }
  function pendingValues(){
    function value(id){ var node=root.querySelector('#'+id); return node&&typeof node.value==='string'?node.value:''; }
    return {
      contact:{role:value('curatorNewContactRole'),directoryUrl:value('curatorNewContactDirectoryUrl')},
      checklist:{label:value('curatorNewChecklistLabel'),priority:value('curatorNewChecklistPriority')},
      resource:{title:value('curatorNewResourceTitle'),url:value('curatorNewResourceUrl'),priority:value('curatorNewResourcePriority'),
        week:Number(value('curatorNewResourceWeek')),rationale:value('curatorNewResourceRationale')}
    };
  }
  function clearPending(type){
    var ids=type==='contact'?['curatorNewContactRole','curatorNewContactDirectoryUrl']:
      type==='checklist'?['curatorNewChecklistLabel']:['curatorNewResourceTitle','curatorNewResourceUrl','curatorNewResourceRationale'];
    var j,node,count;
    for(j=0;j<ids.length;j++){
      node=root.querySelector('#'+ids[j]); if(node) node.value='';
      count=root.querySelector('#'+ids[j]+'Count');
      if(count&&node) count.textContent='0 of '+(Number(node.getAttribute&&node.getAttribute('data-curator-max-codepoints'))||node.maxLength)+' characters';
    }
    node=type==='checklist'?root.querySelector('#curatorNewChecklistPriority'):
      type==='resource'?root.querySelector('#curatorNewResourcePriority'):null;
    if(node) node.value='recommended';
    if(type==='resource'){ node=root.querySelector('#curatorNewResourceWeek'); if(node) node.value='1'; }
  }
  function tryAddPending(type){
    var checked=fdCuratorValidatePendingLocal(pendingValues(),state,index,siteContext,type,'add'),before,after;
    errors=checked.errors||[]; warnings=checked.warnings||[];
    if(!checked.ok||!checked.action){ fdCuratorRenderErrors(root,errors); fdCuratorRenderWarnings(root,warnings); return false; }
    before=type==='contact'?state.config.localOrientation.contacts.length:type==='checklist'?state.config.localOrientation.checklist.length:state.config.localOrientation.resources.length;
    dispatch(checked.action);
    after=type==='contact'?state.config.localOrientation.contacts.length:type==='checklist'?state.config.localOrientation.checklist.length:state.config.localOrientation.resources.length;
    if(after!==before+1){ errors=[fdCuratorPendingFinding(type==='contact'?'curatorNewContactRole':type==='checklist'?'curatorNewChecklistLabel':'curatorNewResourceTitle','Local details','Pending item','The item could not be added safely.')]; fdCuratorRenderErrors(root,errors); return false; }
    clearPending(type); warnings=checked.warnings||[]; fdCuratorRenderWarnings(root,warnings); return true;
  }
  function invalidateReviewWork(clearCache){
    reviewSequences.desktop++; reviewSequences.mobile++;
    if(clearCache) reviewCache=null;
    clearReviewLoading(reviewLoading);
  }
  function setLocalView(value,reviewViewport){
    var toggles,j,label=root.querySelector('#curatorPreviewViewport');
    root.setAttribute('data-local-view',value);
    if(reviewViewport) root.setAttribute('data-review-viewport',reviewViewport);
    else root.removeAttribute('data-review-viewport');
    toggles=root.querySelectorAll('[data-curator-local-view]');
    for(j=0;j<toggles.length;j++) toggles[j].setAttribute('aria-pressed',toggles[j].getAttribute('data-curator-local-view')===value?'true':'false');
    if(label) label.textContent=reviewViewport==='mobile'?'Mobile-width student preview · 390 px maximum':
      reviewViewport==='desktop'?'Desktop student preview':'Choose a deliberate desktop or mobile review to select a preview presentation.';
  }
  function reviewLayoutSnapshot(viewport,preview){
    var panel=root.querySelector('#curatorPreviewMount'),rect=null,rects=null,width=null,height=null;
    var geometry='unavailable',windowClass='unavailable';
    try{
      if(reviewWindow&&typeof reviewWindow.innerWidth==='number'&&isFinite(reviewWindow.innerWidth)){
        width=reviewWindow.innerWidth;
        height=typeof reviewWindow.innerHeight==='number'&&isFinite(reviewWindow.innerHeight)?reviewWindow.innerHeight:null;
        windowClass=width<=760?'mobile':'desktop';
      }
      if(panel&&typeof panel.getClientRects==='function') rects=panel.getClientRects();
      if(panel&&typeof panel.getBoundingClientRect==='function'){
        rect=panel.getBoundingClientRect();
        geometry=[Math.round(rect.left*100)/100,Math.round(rect.top*100)/100,
          Math.round(rect.width*100)/100,Math.round(rect.height*100)/100].join(':');
      }
    }catch(ignoreReviewGeometry){ return {ok:false,panel:panel,windowClass:'invalid',width:width,height:height,geometry:'invalid'}; }
    if(state.step!==4||root.getAttribute('data-local-view')!=='preview'||root.getAttribute('data-review-viewport')!==viewport||
       !preview||preview.isConnected===false||!panel||panel.isConnected===false||panel.hidden)
      return {ok:false,panel:panel,windowClass:windowClass,width:width,height:height,geometry:geometry};
    if(rects&&rects.length===0)
      return {ok:false,panel:panel,windowClass:windowClass,width:width,height:height,geometry:geometry};
    if(rect&&(rect.width<=0||rect.height<=0))
      return {ok:false,panel:panel,windowClass:windowClass,width:width,height:height,geometry:geometry};
    if(viewport==='mobile'&&rect&&rect.width>390.5)
      return {ok:false,panel:panel,windowClass:windowClass,width:width,height:height,geometry:geometry};
    return {ok:root.querySelector('#curatorPreviewBody')===preview,panel:panel,windowClass:windowClass,width:width,height:height,geometry:geometry};
  }
  function reviewReceipt(viewport,preview){
    var layout=reviewLayoutSnapshot(viewport,preview);
    return {
      version:visibleVersion(),step:state.step,viewport:viewport,viewMode:root.getAttribute('data-local-view'),
      previewNode:preview,panelNode:layout.panel,layoutRevision:layoutRevision,windowClass:layout.windowClass,
      windowWidth:layout.width,windowHeight:layout.height,geometry:layout.geometry,layoutOk:layout.ok
    };
  }
  function reviewReceiptMatches(receipt){
    var layout;
    if(!receipt||receipt.step!==4||state.step!==4||receipt.version!==visibleVersion()||receipt.layoutRevision!==layoutRevision||
       receipt.viewMode!=='preview'||root.getAttribute('data-local-view')!=='preview'||root.getAttribute('data-review-viewport')!==receipt.viewport||
       root.querySelector('#curatorPreviewBody')!==receipt.previewNode||receipt.previewNode.isConnected===false) return false;
    layout=reviewLayoutSnapshot(receipt.viewport,receipt.previewNode);
    return !!(receipt.layoutOk&&layout.ok&&layout.panel===receipt.panelNode&&layout.windowClass===receipt.windowClass&&
      layout.width===receipt.windowWidth&&layout.height===receipt.windowHeight&&layout.geometry===receipt.geometry);
  }
  function clearReviewLoading(receipt){
    if(reviewLoading!==receipt) return;
    reviewLoading=null;
    if(receipt&&receipt.previewNode&&receipt.previewNode.isConnected!==false&&root.querySelector('#curatorPreviewBody')===receipt.previewNode)
      receipt.previewNode.innerHTML=reviewPlaceholder;
  }
  function dispatch(action,skipRender){
    var priorStep=state.step,applied=fdCuratorApplyAction(state,action,index,siteContext);
    state=applied.state; errors=[]; warnings=[];
    if(applied.changed){
      touched=true; importTransactions.touch();
      if(action&&action.type!=='SET_PREVIEW_REVIEWED'){
        invalidateReviewWork(true);
      }
    }
    if(action&&action.type==='GO_TO_STEP'&&state.step!==priorStep) invalidateReviewWork(false);
    if(skipRender){
      fdCuratorRenderReviewStatus(root,state); fdCuratorRenderErrors(root,errors); fdCuratorRenderWarnings(root,warnings);
      refreshPreview();
    }else render();
    return state;
  }
  function focusSummary(){ var summary=root.querySelector('#curatorErrorSummary'); if(summary&&typeof summary.focus==='function') summary.focus(); }
  function reviewPreview(viewport){
    var sequence,checked,pendingChecked,preview,listed,receipt,projected;
    if(viewport!=='desktop'&&viewport!=='mobile') return Promise.resolve({ok:false,code:'CURATOR_PREVIEW_VIEW'});
    checked=fdCuratorValidateStep(state,4,index,siteContext);
    pendingChecked=fdCuratorValidatePendingLocal(pendingValues(),state,index,siteContext,'all','leave');
    listed=orientationIssueLists();
    errors=listed.errors.concat(checked.errors||[],pendingChecked.errors||[]); warnings=listed.warnings.concat(checked.warnings||[],pendingChecked.warnings||[]);
    if(listed.errors.length||!checked.ok||!pendingChecked.ok){ render(); focusSummary(); return Promise.resolve({ok:false,code:'CURATOR_PREVIEW_INVALID'}); }
    invalidateReviewWork(true); sequence=reviewSequences[viewport]; setLocalView('preview',viewport);
    preview=root.querySelector('#curatorPreviewBody'); receipt=reviewReceipt(viewport,preview);
    if(!receipt.layoutOk) return Promise.resolve({ok:false,code:'CURATOR_PREVIEW_HIDDEN'});
    if(preview) preview.innerHTML='<p class="panel-note">Validating the '+viewport+' student preview…</p>';
    receipt=reviewReceipt(viewport,preview);
    if(!receipt.layoutOk){ if(preview) preview.innerHTML=reviewPlaceholder; return Promise.resolve({ok:false,code:'CURATOR_PREVIEW_HIDDEN'}); }
    reviewLoading=receipt;
    try{ projected=fdCuratorProjectDraft(state,index,siteContext,subtle); }
    catch(ignorePreviewStart){ projected=Promise.reject(new Error('preview unavailable')); }
    return Promise.resolve(projected).then(function(result){
      var mapped,applied,markup;
      if(sequence!==reviewSequences[viewport]||!reviewReceiptMatches(receipt)){
        clearReviewLoading(receipt); return {ok:false,code:'CURATOR_PREVIEW_STALE'};
      }
      if(!result||result.ok!==true){
        clearReviewLoading(receipt);
        mapped=fdCuratorLocalFindings(result||{},state); errors=mapped.errors.length?mapped.errors:[fdCuratorStepError('curatorEditorTitle','The student preview could not be generated.')];
        warnings=mapped.warnings; fdCuratorRender(state,root,index,errors,warnings); focusSummary();
        return {ok:false,code:'CURATOR_PREVIEW_INVALID'};
      }
      markup=fdCuratorPreviewMarkup(result);
      applied=fdCuratorApplyAction(state,{type:'SET_PREVIEW_REVIEWED',viewport:viewport,value:true},index,siteContext);
      if(!reviewReceiptMatches(receipt)){ clearReviewLoading(receipt); return {ok:false,code:'CURATOR_PREVIEW_STALE'}; }
      reviewLoading=null;
      state=applied.state; if(applied.changed) touched=true;
      reviewCache={version:receipt.version,viewport:viewport,markup:markup}; errors=[]; render();
      return {ok:true,viewport:viewport,projected:result,state:state};
    },function(){
      if(sequence!==reviewSequences[viewport]||!reviewReceiptMatches(receipt)){
        clearReviewLoading(receipt); return {ok:false,code:'CURATOR_PREVIEW_STALE'};
      }
      clearReviewLoading(receipt);
      errors=[fdCuratorStepError('curatorEditorTitle','The student preview could not be generated.')]; warnings=[];
      fdCuratorRender(state,root,index,errors,warnings); focusSummary(); return {ok:false,code:'CURATOR_PREVIEW_INVALID'};
    });
  }
  function status(message){ var node=root.querySelector('#curatorSaveStatus'); if(node) node.textContent=message; }
  if(!root) return null;
  if(reviewWindow&&typeof reviewWindow.addEventListener==='function'){
    try{ reviewWindow.addEventListener('resize',function(){ layoutRevision++; invalidateReviewWork(false); }); }
    catch(ignoreResizeRegistration){}
  }
  buttons=root.querySelectorAll('[data-curator-step]');
  for(i=0;i<buttons.length;i++) buttons[i].addEventListener('click',function(event){
    dispatch({type:'GO_TO_STEP',step:Number(event.currentTarget.getAttribute('data-curator-step'))});
  });
  root.addEventListener('input',function(event){
    var field=event.target.getAttribute&&event.target.getAttribute('data-curator-card'),instance,current,count,counters,c,id,indexValue,logicalMax,checked,listed;
    logicalMax=event.target.getAttribute&&Number(event.target.getAttribute('data-curator-max-codepoints'));
    if(logicalMax>0&&typeof event.target.value==='string'&&fdEditionTextLength(event.target.value)>logicalMax)
      event.target.value=Array.from(event.target.value).slice(0,logicalMax).join('');
    if(event.target.id&&typeof event.target.value==='string'&&event.target.maxLength>0){
      count=root.querySelector('#'+event.target.id+'Count');
      if(count) count.textContent=fdEditionTextLength(event.target.value)+' of '+(logicalMax||event.target.maxLength)+' characters';
    }
    if(field) dispatch({type:'SET_CARD_FIELD',field:field,value:event.target.value});
    field=event.target.getAttribute&&event.target.getAttribute('data-curator-orientation');
    if(field){
      checked=validateOrientationInput(field,event.target.value);
      if(checked.errors.length){
        orientationIssues[field]={value:event.target.value,errors:checked.errors,warnings:checked.warnings};
        state=fdCuratorResetReviews(fdCuratorClone(state)); touched=true; importTransactions.touch(); invalidateReviewWork(true);
        listed=orientationIssueLists(); errors=listed.errors; warnings=listed.warnings;
        fdCuratorRenderReviewStatus(root,state); fdCuratorRenderErrors(root,errors); fdCuratorRenderWarnings(root,warnings); refreshPreview(); return;
      }
      delete orientationIssues[field]; dispatch({type:'LOCAL_SET_ORIENTATION',field:field,value:event.target.value},true);
      listed=orientationIssueLists(); errors=listed.errors; warnings=listed.warnings.concat(checked.warnings||[]);
      fdCuratorRenderErrors(root,errors); fdCuratorRenderWarnings(root,warnings);
      count=root.querySelector('#curator'+field.charAt(0).toUpperCase()+field.slice(1)+'Count'); if(count) count.textContent=fdEditionTextLength(event.target.value)+' of 600 characters'; return;
    }
    indexValue=event.target.getAttribute&&event.target.getAttribute('data-curator-contact-index');
    field=event.target.getAttribute&&event.target.getAttribute('data-curator-contact-field');
    if(indexValue!==null&&field){ dispatch({type:'LOCAL_CONTACT_UPDATE',index:Number(indexValue),field:field,value:event.target.value},true); return; }
    id=event.target.getAttribute&&event.target.getAttribute('data-curator-checklist-id');
    field=event.target.getAttribute&&event.target.getAttribute('data-curator-checklist-field');
    if(id!==null&&field==='label'){ dispatch({type:'LOCAL_CHECKLIST_UPDATE',id:id,field:field,value:event.target.value},true); return; }
    id=event.target.getAttribute&&event.target.getAttribute('data-curator-resource-id');
    field=event.target.getAttribute&&event.target.getAttribute('data-curator-resource-field');
    if(id!==null&&(field==='title'||field==='url'||field==='rationale')){ dispatch({type:'LOCAL_RESOURCE_UPDATE',id:id,field:field,value:event.target.value},true); return; }
    instance=event.target.getAttribute&&event.target.getAttribute('data-curator-path-rationale');
    if(instance){
      dispatch({type:'PATH_SET_RATIONALE',instanceId:instance,value:event.target.value},true);
      current=fdCuratorFindPathItem(state.config.pathItems,instance);
      if(current>=0&&event.target.value!==state.config.pathItems[current].rationale) event.target.value=state.config.pathItems[current].rationale;
      counters=root.querySelectorAll('[data-curator-rationale-count]'); count=null;
      for(c=0;c<counters.length;c++) if(counters[c].getAttribute('data-curator-rationale-count')===instance){ count=counters[c]; break; }
      if(count) count.textContent=fdEditionTextLength(event.target.value)+' of 280 characters';
    }
  });
  root.addEventListener('click',function(event){
    var target=event.target,ref,instance,value,id;
    if(!target||typeof target.getAttribute!=='function') return;
    ref=target.getAttribute('data-curator-path-toggle');
    if(ref!==null){ dispatch({type:'PATH_TOGGLE',ref:ref}); return; }
    ref=target.getAttribute('data-curator-path-add');
    if(ref!==null){ dispatch({type:'PATH_ADD_INSTANCE',ref:ref}); return; }
    instance=target.getAttribute('data-curator-path-remove');
    if(instance!==null){ dispatch({type:'PATH_REMOVE_INSTANCE',instanceId:instance}); return; }
    instance=target.getAttribute('data-curator-path-up');
    if(instance!==null){ dispatch({type:'PATH_MOVE_UP',instanceId:instance}); return; }
    instance=target.getAttribute('data-curator-path-down');
    if(instance!==null){ dispatch({type:'PATH_MOVE_DOWN',instanceId:instance}); return; }
    value=target.getAttribute('data-curator-contact-remove');
    if(value!==null){ dispatch({type:'LOCAL_CONTACT_REMOVE',index:Number(value)}); return; }
    id=target.getAttribute('data-curator-checklist-remove');
    if(id!==null){ dispatch({type:'LOCAL_CHECKLIST_REMOVE',id:id}); return; }
    id=target.getAttribute('data-curator-resource-remove');
    if(id!==null){ dispatch({type:'LOCAL_RESOURCE_REMOVE',id:id}); return; }
    if(target.id==='curatorAddContact'){
      tryAddPending('contact'); return;
    }
    if(target.id==='curatorAddChecklist'){
      tryAddPending('checklist'); return;
    }
    if(target.id==='curatorAddResource'){
      tryAddPending('resource'); return;
    }
    if(target.id==='curatorReviewDesktop'){ reviewPreview('desktop'); return; }
    if(target.id==='curatorReviewMobile'){ reviewPreview('mobile'); return; }
    value=target.getAttribute('data-curator-local-view');
    if(value==='edit'||value==='preview'){
      invalidateReviewWork(false); setLocalView(value,null);
      return;
    }
  });
  root.addEventListener('change',function(event){
    var target=event.target,instance,id,field,value;
    if(!target||typeof target.getAttribute!=='function') return;
    instance=target.getAttribute('data-curator-path-priority');
    if(instance!==null){ dispatch({type:'PATH_SET_PRIORITY',instanceId:instance,priority:target.value}); return; }
    instance=target.getAttribute('data-curator-path-week');
    if(instance!==null){ dispatch({type:'PATH_MOVE_WEEK',instanceId:instance,week:Number(target.value)}); return; }
    id=target.getAttribute('data-curator-checklist-id'); field=target.getAttribute('data-curator-checklist-field');
    if(id!==null&&field==='priority'){ dispatch({type:'LOCAL_CHECKLIST_UPDATE',id:id,field:field,value:target.value}); return; }
    id=target.getAttribute('data-curator-resource-id'); field=target.getAttribute('data-curator-resource-field');
    if(id!==null&&(field==='priority'||field==='week')){
      value=field==='week'?Number(target.value):target.value;
      dispatch({type:'LOCAL_RESOURCE_UPDATE',id:id,field:field,value:value});
    }
  });
  input=root.querySelector('#curatorLibrarySearch');
  if(input) input.addEventListener('input',function(){
    var mount=root.querySelector('#curatorCurriculumGroups');
    if(mount) mount.innerHTML=fdCuratorCurriculumMarkup(state,index,input.value);
  });
  save=root.querySelector('#curatorSaveDraft');
  if(save) save.addEventListener('click',function(){
    var listed=orientationIssueLists();
    if(listed.errors.length){ errors=listed.errors; warnings=listed.warnings; fdCuratorRenderErrors(root,errors); fdCuratorRenderWarnings(root,warnings); status('Draft could not be saved on this device.'); }
    else if(adapter.save(state,index,siteContext)) status('Saved on this device');
    else status('Draft could not be saved on this device.');
  });
  continueButton=root.querySelector('#curatorContinue');
  if(continueButton) continueButton.addEventListener('click',function(){
    var checked=fdCuratorValidateStep(state,1,index,siteContext),summary;
    if(!checked.ok){ errors=checked.errors; fdCuratorRender(state,root,index,errors); summary=root.querySelector('#curatorErrorSummary'); if(summary) summary.focus(); return; }
    dispatch({type:'GO_TO_STEP',step:2});
  });
  continueButton=root.querySelector('#curatorLocalContinue');
  if(continueButton) continueButton.addEventListener('click',function(){
    var checked=fdCuratorValidateStep(state,4,index,siteContext),pendingChecked=fdCuratorValidatePendingLocal(pendingValues(),state,index,siteContext,'all','leave'),listed=orientationIssueLists();
    errors=listed.errors.concat(checked.errors||[],pendingChecked.errors||[]); warnings=listed.warnings.concat(checked.warnings||[],pendingChecked.warnings||[]);
    if(listed.errors.length||!checked.ok||!pendingChecked.ok){ render(); focusSummary(); return; }
    dispatch({type:'GO_TO_STEP',step:5});
  });
  importInput=root.querySelector('#curatorImportFile');
  if(importInput) importInput.addEventListener('change',function(event){
    var file=event.target.files&&event.target.files[0],transaction;
    if(!file) return;
    touched=true;
    invalidateReviewWork(false);
    transaction=importTransactions.begin();
    fdCuratorReadImportFile(file,index,siteContext,subtle).then(function(result){
      if(!importTransactions.commit(transaction)) return;
      invalidateReviewWork(true);
      if(result.ok){
        touched=true; state=result.draft; orientationIssues=Object.create(null); errors=[]; warnings=[];
        clearPending('contact'); clearPending('checklist'); clearPending('resource');
        setLocalView('edit',null); render(); status('Backup imported. Save the draft to keep it on this device.');
      }
      else status(result.code==='CURATOR_IMPORT_SIZE'?'Backup must be 64 KiB or smaller.':'Backup could not be validated for this audience.');
      event.target.value='';
    });
  });
  render();
  adapter.load(index,siteContext,subtle).then(function(result){
    if(!touched&&result.ok&&result.draft){ invalidateReviewWork(true); state=result.draft; render(); status('Saved on this device'); }
  });
  return {dispatch:dispatch,getState:function(){ return state; },reviewPreview:reviewPreview};
}
