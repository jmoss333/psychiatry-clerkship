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
  if(!normalized.ok||!fdCuratorPathStateValid(normalized.value.pathItems,current)) return {ok:false,draft:null};
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
  inspected=fdCuratorIndexSnapshot(index,siteContext);
  if(!inspected.ok) return next;
  weekCount=inspected.weekCount;
  allowed=inspected.allowed;
  items=next.config.pathItems;
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

function fdCuratorValidateStep(draft,step,index,siteContext){
  var shaped=fdCuratorValidateDraft(draft,index,siteContext),errors=[],card,labels,i,key,value,fieldId;
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
      var shaped=fdCuratorValidateDraft(draft,index,siteContext);
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
    '<details class="preview-library"><summary>Full Library remains available</summary>'+library+'</details>';
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
  var audience,path,editorTitle,status,generate,buttons,selected,i,input,mount;
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
  input=root.querySelector('#curatorFutureStep'); if(input) input.hidden=state.step<4;
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
  fdCuratorRenderErrors(root,errors||[]);
  if(generate){ generate.disabled=true; generate.setAttribute('aria-disabled','true'); }
}

function fdCuratorMount(root,index,siteContext){
  var state=fdCuratorNewDraft(index,siteContext),errors=[],touched=false;
  var adapter=fdCuratorDraftStorage(typeof localStorage==='undefined'?null:localStorage);
  var importTransactions=fdCuratorImportTransactions();
  var subtle=typeof crypto!=='undefined'&&crypto?crypto.subtle:null;
  var buttons,i,save,continueButton,importInput,previewSequence=0;
  function refreshPreview(){
    var preview=root.querySelector('#curatorPreviewBody'),sequence;
    if(!preview) return;
    if(state.step!==2&&state.step!==3){
      preview.innerHTML='<p class="panel-note">Preview is read-only and updates from the validated curriculum and schedule.</p>';
      return;
    }
    sequence=++previewSequence;
    preview.innerHTML='<p class="panel-note">Updating the validated student preview…</p>';
    fdCuratorProjectDraft(state,index,siteContext,subtle).then(function(result){
      if(sequence!==previewSequence) return;
      preview.innerHTML=fdCuratorPreviewMarkup(result);
    });
  }
  function render(){ fdCuratorRender(state,root,index,errors); refreshPreview(); }
  function dispatch(action,skipRender){
    var applied=fdCuratorApplyAction(state,action,index,siteContext);
    state=applied.state; errors=[];
    if(applied.changed){ touched=true; importTransactions.touch(); }
    if(skipRender) refreshPreview(); else render();
    return state;
  }
  function status(message){ var node=root.querySelector('#curatorSaveStatus'); if(node) node.textContent=message; }
  if(!root) return null;
  buttons=root.querySelectorAll('[data-curator-step]');
  for(i=0;i<buttons.length;i++) buttons[i].addEventListener('click',function(event){
    dispatch({type:'GO_TO_STEP',step:Number(event.currentTarget.getAttribute('data-curator-step'))});
  });
  root.addEventListener('input',function(event){
    var field=event.target.getAttribute&&event.target.getAttribute('data-curator-card'),instance,current,count,counters,c;
    if(field) dispatch({type:'SET_CARD_FIELD',field:field,value:event.target.value});
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
    var target=event.target,ref,instance;
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
    if(instance!==null) dispatch({type:'PATH_MOVE_DOWN',instanceId:instance});
  });
  root.addEventListener('change',function(event){
    var target=event.target,instance;
    if(!target||typeof target.getAttribute!=='function') return;
    instance=target.getAttribute('data-curator-path-priority');
    if(instance!==null){ dispatch({type:'PATH_SET_PRIORITY',instanceId:instance,priority:target.value}); return; }
    instance=target.getAttribute('data-curator-path-week');
    if(instance!==null) dispatch({type:'PATH_MOVE_WEEK',instanceId:instance,week:Number(target.value)});
  });
  input=root.querySelector('#curatorLibrarySearch');
  if(input) input.addEventListener('input',function(){
    var mount=root.querySelector('#curatorCurriculumGroups');
    if(mount) mount.innerHTML=fdCuratorCurriculumMarkup(state,index,input.value);
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
      if(result.ok){ touched=true; state=result.draft; errors=[]; render(); status('Backup imported. Save the draft to keep it on this device.'); }
      else status(result.code==='CURATOR_IMPORT_SIZE'?'Backup must be 64 KiB or smaller.':'Backup could not be validated for this audience.');
      event.target.value='';
    });
  });
  render();
  adapter.load(index,siteContext,subtle).then(function(result){
    if(!touched&&result.ok&&result.draft){ state=result.draft; render(); status('Saved on this device'); }
  });
  return {dispatch:dispatch,getState:function(){ return state; }};
}
