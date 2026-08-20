/* V2 faculty curator state and structured Steps 1 through 3. */
var FD_CURATOR_IMPORT_MAX_BYTES=65536;
var FD_CURATOR_MAX_PATH_ITEMS=96;
var FD_CURATOR_RENDERER_REVISION='rotation-edition-v2-r1';
var FD_CURATOR_PRIORITIES=['required','recommended','optional'];
var FD_CURATOR_AFFIRMATIONS=['publicSafe','officialLinks','previewsReviewed','forwardable'];
var FD_CURATOR_IMPORT_CODES=['CURATOR_IMPORT_SIZE','CURATOR_IMPORT_FORMAT','CURATOR_IMPORT_INVALID','CURATOR_IMPORT_RESELECTION_REQUIRED'];
var FD_CURATOR_IMPORT_RESULTS=new WeakMap();
var FD_CURATOR_CANDIDATE_RESULTS=new WeakMap();
var FD_CURATOR_PREVIEW_RESULTS=new WeakMap();
var FD_CURATOR_PREVIEW_COMPLETIONS=new WeakMap();
var FD_CURATOR_GENERATION_RESULTS=new WeakMap();
var FD_CURATOR_DISPLAY_RESULTS=new WeakMap();
var FD_CURATOR_TRUSTED_BASES=new WeakMap();
var FD_CURATOR_OWN=Object.prototype.hasOwnProperty;
var FD_CURATOR_LOCAL_CATEGORIES=['arrival','schedule','rounds','presentation','documentation','attendance','feedback','accessItems','contacts','checklistItems','resources'];
var FD_CURATOR_LOCAL_LIMITS={schedule:24,accessItems:12,contacts:8,checklistItems:24,resources:12};

function fdCuratorObject(value){
  var prototype;
  try{if(value===null||typeof value!=='object'||Array.isArray(value))return false;prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;}
  catch(ignore){return false;}
}

function fdCuratorExactData(value,required,optional){
  var keys,allowed=Object.create(null),i,key,descriptor;
  if(!fdCuratorObject(value))return null;
  for(i=0;i<required.length;i++)allowed[required[i]]=true;
  for(i=0;i<optional.length;i++)allowed[optional[i]]=true;
  try{keys=Reflect.ownKeys(value);}catch(ignoreKeys){return null;}
  for(i=0;i<keys.length;i++){
    key=keys[i];if(typeof key!=='string'||!allowed[key])return null;
    try{descriptor=Object.getOwnPropertyDescriptor(value,key);}catch(ignoreDescriptor){return null;}
    if(!descriptor||!descriptor.enumerable||!FD_CURATOR_OWN.call(descriptor,'value'))return null;
  }
  for(i=0;i<required.length;i++)if(keys.indexOf(required[i])<0)return null;
  return value;
}

function fdCuratorPublicationSnapshot(untrustedPublication){
  var keys,allowed=Object.create(null),captured=Object.create(null),i,key,descriptor;
  allowed.baseEnvelope=true;allowed.baseSemanticConfig=true;allowed.lastGenerated=true;
  if(!fdCuratorObject(untrustedPublication))return null;
  try{keys=Reflect.ownKeys(untrustedPublication);}catch(ignoreKeys){return null;}
  if(keys.length!==3)return null;
  for(i=0;i<keys.length;i++){
    key=keys[i];if(typeof key!=='string'||!allowed[key]||FD_CURATOR_OWN.call(captured,key))return null;
    try{descriptor=Object.getOwnPropertyDescriptor(untrustedPublication,key);}catch(ignoreDescriptor){return null;}
    if(!descriptor||!descriptor.enumerable||!FD_CURATOR_OWN.call(descriptor,'value'))return null;
    captured[key]=descriptor.value;
  }
  if(!FD_CURATOR_OWN.call(captured,'baseEnvelope')||!FD_CURATOR_OWN.call(captured,'baseSemanticConfig')||!FD_CURATOR_OWN.call(captured,'lastGenerated'))return null;
  return {object:untrustedPublication,baseEnvelope:captured.baseEnvelope,baseSemanticConfig:captured.baseSemanticConfig,lastGenerated:captured.lastGenerated};
}

function fdCuratorOwnValue(value,key){
  var descriptor;
  try{descriptor=Object.getOwnPropertyDescriptor(value,key);}
  catch(ignore){return {ok:false,value:null};}
  return descriptor&&descriptor.enumerable&&FD_CURATOR_OWN.call(descriptor,'value')?
    {ok:true,value:descriptor.value}:{ok:false,value:null};
}

function fdCuratorArray(value,max){
  var length,keys,i,key,descriptor;
  if(!Array.isArray(value))return null;
  try{length=Object.getOwnPropertyDescriptor(value,'length');}
  catch(ignoreLength){return null;}
  if(!length||!FD_CURATOR_OWN.call(length,'value')||!Number.isInteger(length.value)||length.value<0||length.value>max)return null;
  try{keys=Reflect.ownKeys(value);}catch(ignoreKeys){return null;}
  if(keys.length!==length.value+1)return null;
  for(i=0;i<length.value;i++){
    key=String(i);if(keys.indexOf(key)<0)return null;
    try{descriptor=Object.getOwnPropertyDescriptor(value,key);}catch(ignoreDescriptor){return null;}
    if(!descriptor||!descriptor.enumerable||!FD_CURATOR_OWN.call(descriptor,'value'))return null;
  }
  return value;
}

function fdCuratorClone(value){return JSON.parse(fdEditionCanonicalJson(value));}
function fdCuratorTryClone(value){try{return {ok:true,value:fdCuratorClone(value)};}catch(ignore){return {ok:false,value:null};}}
function fdCuratorStatePublicationSnapshot(state){var publication=fdCuratorOwnValue(state,'publication');return publication.ok?fdCuratorPublicationSnapshot(publication.value):null;}
function fdCuratorTrustedBaseRecord(state,publication){
  var trusted=FD_CURATOR_TRUSTED_BASES.get(state),trustedData;
  if(!trusted||!publication)return null;
  try{
    trustedData=fdCuratorExactData(trusted,['envelopeCanonical','semantic','config','envelope','publicationObject','baseObject'],[]);
    if(!trustedData||typeof trusted.semantic!=='string'||publication.object!==trusted.publicationObject||publication.baseEnvelope!==trusted.baseObject||publication.baseSemanticConfig!==trusted.semantic||trusted.semantic!==fdEditionSemanticConfig(trusted.config)||fdEditionCanonicalJson(publication.baseEnvelope)!==trusted.envelopeCanonical||fdEditionCanonicalJson(trusted.envelope)!==trusted.envelopeCanonical||fdEditionCanonicalJson(trusted.envelope.config)!==fdEditionCanonicalJson(trusted.config))return null;
  }catch(ignore){return null;}
  return trusted;
}
function fdCuratorTransferBaseTrust(source,target,sourcePublication){
  var publication=arguments.length>=3?sourcePublication:fdCuratorStatePublicationSnapshot(source),trusted=fdCuratorTrustedBaseRecord(source,publication),targetPublication;
  if(!trusted)return target;
  try{
    targetPublication=fdCuratorStatePublicationSnapshot(target);
    if(targetPublication&&targetPublication.baseSemanticConfig===trusted.semantic&&fdEditionCanonicalJson(targetPublication.baseEnvelope)===trusted.envelopeCanonical)FD_CURATOR_TRUSTED_BASES.set(target,{envelopeCanonical:trusted.envelopeCanonical,semantic:trusted.semantic,config:trusted.config,envelope:trusted.envelope,publicationObject:targetPublication.object,baseObject:targetPublication.baseEnvelope});
  }catch(ignore){}
  return target;
}
function fdCuratorTryCloneState(value,sourcePublication){
  var publication=arguments.length>=2?sourcePublication:fdCuratorStatePublicationSnapshot(value),keys=['schemaVersion','step','site','config','previewReceipts','affirmations'],copy={},i,field,cloned;
  if(!publication)return {ok:false,value:null};
  for(i=0;i<keys.length;i++){field=fdCuratorOwnValue(value,keys[i]);if(!field.ok)return {ok:false,value:null};copy[keys[i]]=field.value;}
  copy.publication={baseEnvelope:publication.baseEnvelope,baseSemanticConfig:publication.baseSemanticConfig,lastGenerated:publication.lastGenerated};
  cloned=fdCuratorTryClone(copy);if(cloned.ok)fdCuratorTransferBaseTrust(value,cloned.value,publication);return cloned;
}

function fdCuratorRealDate(value){
  var part,stamp;
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return false;
  part=value.split('-').map(Number);stamp=new Date(Date.UTC(part[0],part[1]-1,part[2]));
  return stamp.getUTCFullYear()===part[0]&&stamp.getUTCMonth()===part[1]-1&&stamp.getUTCDate()===part[2];
}

function fdCuratorSiteValue(siteContext){
  var value=fdCuratorExactData(siteContext,
    ['audience','pathId','coreRevision','localCatalogRevision','rotationEditionV2'],[]),weeks;
  if(!value||['ms3','resident'].indexOf(value.audience)<0)return null;
  weeks=value.audience==='ms3'?6:4;
  if(value.pathId!==(value.audience==='ms3'?'ms3-six-week':'resident-four-week')||
     !/^[0-9a-f]{40}$/.test(value.coreRevision)||
     !/^sha256-[A-Za-z0-9_-]{43}$/.test(value.localCatalogRevision)||
     ['enabled','disabled'].indexOf(value.rotationEditionV2)<0)return null;
  return {audience:value.audience,pathId:value.pathId,coreRevision:value.coreRevision,
    localCatalogRevision:value.localCatalogRevision,rotationEditionV2:value.rotationEditionV2,weekCount:weeks};
}

function fdCuratorIndexSnapshot(index,siteContext){
  var site=fdCuratorSiteValue(siteContext),pathData,weeksData,byRefData,columnsData,path,weeks,byRef,columns;
  var canonical=[],allowed=Object.create(null),library=[],occurrence=Object.create(null),i,j,row,ref,titleData,columnItems,seenLibrary=Object.create(null);
  if(!site||!fdCuratorObject(index))return {ok:false};
  pathData=fdCuratorOwnValue(index,'path');weeksData=fdCuratorOwnValue(index,'weeks');
  byRefData=fdCuratorOwnValue(index,'byRef');columnsData=fdCuratorOwnValue(index,'columns');
  if(!pathData.ok||!weeksData.ok||!byRefData.ok||!columnsData.ok)return {ok:false};
  path=pathData.value;weeks=fdCuratorArray(weeksData.value,6);byRef=byRefData.value;columns=fdCuratorArray(columnsData.value,256);
  if(!fdCuratorObject(path)||path.id!==site.pathId||path.weekCount!==site.weekCount||!weeks||weeks.length!==site.weekCount||!fdCuratorObject(byRef)||!columns)return {ok:false};
  for(i=0;i<columns.length;i++){
    if(!fdCuratorObject(columns[i]))return {ok:false};
    columnItems=fdCuratorArray(fdCuratorOwnValue(columns[i],'items').value,4096);if(!columnItems)return {ok:false};
    for(j=0;j<columnItems.length;j++){
      row=columnItems[j];ref=fdCuratorOwnValue(row,'ref');if(!ref.ok||typeof ref.value!=='string')return {ok:false};ref=ref.value;
      if(!ref||ref.indexOf('local:')===0||ref==='rotation-curator.html'||seenLibrary[ref])continue;
      titleData=fdCuratorOwnValue(byRef,ref);if(!titleData.ok||!fdCuratorObject(titleData.value)||titleData.value.ref!==ref||typeof titleData.value.title!=='string')return {ok:false};
      seenLibrary[ref]=true;allowed[ref]=true;library.push({ref:ref,title:titleData.value.title});
    }
  }
  for(i=0;i<weeks.length;i++){
    row=weeks[i];if(!fdCuratorObject(row)||fdCuratorOwnValue(row,'n').value!==i+1)return {ok:false};
    columnItems=fdCuratorArray(fdCuratorOwnValue(row,'items').value,FD_CURATOR_MAX_PATH_ITEMS);if(!columnItems)return {ok:false};
    for(j=0;j<columnItems.length;j++){
      ref=fdCuratorOwnValue(columnItems[j],'ref');if(!ref.ok||typeof ref.value!=='string'||!ref.value)return {ok:false};ref=ref.value;
      titleData=fdCuratorOwnValue(byRef,ref);if(!titleData.ok||!fdCuratorObject(titleData.value)||titleData.value.ref!==ref||typeof titleData.value.title!=='string')return {ok:false};
      allowed[ref]=true;if(!seenLibrary[ref]){seenLibrary[ref]=true;library.push({ref:ref,title:titleData.value.title});}
      occurrence[ref]=(occurrence[ref]||0)+1;
      canonical.push({instanceId:'core:'+ref+':'+occurrence[ref],ref:ref,week:i+1,order:j+1,priority:'recommended'});
    }
  }
  if(!canonical.length||canonical.length>FD_CURATOR_MAX_PATH_ITEMS)return {ok:false};
  return {ok:true,site:site,weeks:weeks,byRef:byRef,allowed:allowed,library:library,canonical:canonical};
}

function fdCuratorCanonicalPathItems(index,siteContext){
  var inspected=fdCuratorIndexSnapshot(index,siteContext);
  return inspected.ok?fdCuratorClone(inspected.canonical):[];
}

function fdCuratorNewDraft(index,siteContext){
  var inspected=fdCuratorIndexSnapshot(index,siteContext),site=inspected.ok?inspected.site:fdCuratorSiteValue(siteContext)||{audience:'',pathId:'',coreRevision:'',localCatalogRevision:'',rotationEditionV2:'disabled'};
  return {schemaVersion:2,step:1,site:{audience:site.audience,pathId:site.pathId,coreRevision:site.coreRevision,
    localCatalogRevision:site.localCatalogRevision,rotationEditionV2:site.rotationEditionV2,
    rendererRevision:FD_CURATOR_RENDERER_REVISION},config:{context:{trainingLocationKey:'',curatorProfileKey:'',
    rotationStart:'',rotationEnd:'',editionCheckedOn:''},phraseSetKey:'',pathItems:inspected.ok?fdCuratorClone(inspected.canonical):[],
    localPlan:{},changeSummary:{kindCodes:['initial'],changedItemCount:0}},publication:{baseEnvelope:null,
    baseSemanticConfig:'',lastGenerated:null},previewReceipts:{desktop:null,mobile:null},affirmations:{publicSafe:false,
    officialLinks:false,previewsReviewed:false,forwardable:false}};
}

function fdCuratorStateValid(state,index,siteContext,publicationSnapshot){
  var inspected=fdCuratorIndexSnapshot(index,siteContext),top,site,config,context,publication,receipts,affirmations,i;
  if(!inspected.ok)return false;
  top=fdCuratorExactData(state,['schemaVersion','step','site','config','publication','previewReceipts','affirmations'],[]);
  if(!top||top.schemaVersion!==2||!Number.isInteger(top.step)||top.step<1||top.step>5)return false;
  site=fdCuratorExactData(top.site,['audience','pathId','coreRevision','localCatalogRevision','rotationEditionV2','rendererRevision'],[]);
  if(!site||site.audience!==inspected.site.audience||site.pathId!==inspected.site.pathId||site.coreRevision!==inspected.site.coreRevision||site.localCatalogRevision!==inspected.site.localCatalogRevision||site.rotationEditionV2!==inspected.site.rotationEditionV2||site.rendererRevision!==FD_CURATOR_RENDERER_REVISION)return false;
  config=fdCuratorExactData(top.config,['context','phraseSetKey','pathItems','localPlan','changeSummary'],[]);
  context=config&&fdCuratorExactData(config.context,['trainingLocationKey','curatorProfileKey','rotationStart','rotationEnd','editionCheckedOn'],[]);
  if(!config||!context||typeof context.trainingLocationKey!=='string'||typeof context.curatorProfileKey!=='string'||typeof config.phraseSetKey!=='string'||!fdCuratorLocalPlanStateValid(config.localPlan,inspected.site.weekCount)||!fdCuratorPathStateValid(config.pathItems,inspected))return false;
  for(i=0;i<3;i++){var dateValue=[context.rotationStart,context.rotationEnd,context.editionCheckedOn][i];if(dateValue!==''&&!fdCuratorRealDate(dateValue))return false;}
  if(context.rotationStart&&context.rotationEnd&&context.rotationEnd<context.rotationStart)return false;
  if(!fdCuratorExactData(config.changeSummary,['kindCodes','changedItemCount'],[])||!Array.isArray(config.changeSummary.kindCodes)||!Number.isInteger(config.changeSummary.changedItemCount))return false;
  publication=arguments.length>=4?publicationSnapshot:fdCuratorStatePublicationSnapshot(top);
  receipts=fdCuratorExactData(top.previewReceipts,['desktop','mobile'],[]);
  affirmations=fdCuratorExactData(top.affirmations,FD_CURATOR_AFFIRMATIONS,[]);
  if(!publication||typeof publication.baseSemanticConfig!=='string'||!receipts||!affirmations)return false;
  for(i=0;i<FD_CURATOR_AFFIRMATIONS.length;i++)if(typeof affirmations[FD_CURATOR_AFFIRMATIONS[i]]!=='boolean')return false;
  return true;
}

function fdCuratorKey(value){return typeof value==='string'&&/^[a-z0-9][a-z0-9._:-]{0,126}@v[1-9][0-9]{0,5}$/.test(value);}
function fdCuratorTime(value){return typeof value==='string'&&/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);}
function fdCuratorLocalPlanStateValid(plan,maxWeek){
  var keys,i,j,row,value,ids=Object.create(null),events=Object.create(null),seen=Object.create(null),count;
  function exact(item,required,optional){return fdCuratorExactData(item,required,optional);}
  function list(item,max){return fdCuratorArray(item,max);}
  function id(value){if(typeof value!=='string'||!value||value.length>160||ids[value])return false;ids[value]=true;return true;}
  function priority(value){return FD_CURATOR_PRIORITIES.indexOf(value)>=0;}
  if(!fdCuratorObject(plan))return false;try{keys=Reflect.ownKeys(plan);}catch(ignore){return false;}
  for(i=0;i<keys.length;i++)if(typeof keys[i]!=='string'||FD_CURATOR_LOCAL_CATEGORIES.indexOf(keys[i])<0)return false;
  if(FD_CURATOR_OWN.call(plan,'arrival')){value=exact(plan.arrival,['timingCode','time','placeKey','checkInRoleKey'],['linkKey']);if(!value||['at','by'].indexOf(value.timingCode)<0||!fdCuratorTime(value.time)||!fdCuratorKey(value.placeKey)||!fdCuratorKey(value.checkInRoleKey)||(FD_CURATOR_OWN.call(value,'linkKey')&&!fdCuratorKey(value.linkKey)))return false;}
  if(FD_CURATOR_OWN.call(plan,'schedule')){
    value=exact(plan.schedule,['dayStart','dayEnd','endQualifierCode','events'],[]);if(!value||!fdCuratorTime(value.dayStart)||!fdCuratorTime(value.dayEnd)||value.dayStart>=value.dayEnd||['at','about','no-later-than'].indexOf(value.endQualifierCode)<0||!list(value.events,24))return false;
    for(i=0;i<value.events.length;i++){row=exact(value.events[i],['instanceId','daySetKey','startTime','activityKey','priority'],['endTime','placeKey']);if(!row||!id(row.instanceId)||!fdCuratorKey(row.daySetKey)||!fdCuratorTime(row.startTime)||!fdCuratorKey(row.activityKey)||!priority(row.priority)||(FD_CURATOR_OWN.call(row,'endTime')&&(!fdCuratorTime(row.endTime)||row.endTime<=row.startTime))||(FD_CURATOR_OWN.call(row,'placeKey')&&!fdCuratorKey(row.placeKey)))return false;events[row.instanceId]=true;}
  }
  if(FD_CURATOR_OWN.call(plan,'rounds')){value=exact(plan.rounds,['preparationKey','participationKey','followUpKey'],[]);if(!value||!fdCuratorKey(value.preparationKey)||!fdCuratorKey(value.participationKey)||!fdCuratorKey(value.followUpKey))return false;}
  if(FD_CURATOR_OWN.call(plan,'presentation')){value=exact(plan.presentation,['formatKey','timingKey','elementKeys'],[]);if(!value||!fdCuratorKey(value.formatKey)||!fdCuratorKey(value.timingKey)||!list(value.elementKeys,8)||!value.elementKeys.length)return false;seen=Object.create(null);for(i=0;i<value.elementKeys.length;i++){if(!fdCuratorKey(value.elementKeys[i])||seen[value.elementKeys[i]])return false;seen[value.elementKeys[i]]=true;}}
  if(FD_CURATOR_OWN.call(plan,'documentation')){value=exact(plan.documentation,['workflowKey','timingKey'],['policyLinkKey']);if(!value||!fdCuratorKey(value.workflowKey)||!fdCuratorKey(value.timingKey)||(FD_CURATOR_OWN.call(value,'policyLinkKey')&&!fdCuratorKey(value.policyLinkKey)))return false;}
  if(FD_CURATOR_OWN.call(plan,'attendance')){value=exact(plan.attendance,['eventInstanceIds','absenceRoleKey'],['policyLinkKey']);if(!value||!(value.eventInstanceIds=list(value.eventInstanceIds,24))||!value.eventInstanceIds.length||!fdCuratorKey(value.absenceRoleKey)||(FD_CURATOR_OWN.call(value,'policyLinkKey')&&!fdCuratorKey(value.policyLinkKey)))return false;seen=Object.create(null);for(i=0;i<value.eventInstanceIds.length;i++)if(typeof value.eventInstanceIds[i]!=='string'||!events[value.eventInstanceIds[i]]||seen[value.eventInstanceIds[i]])return false;else seen[value.eventInstanceIds[i]]=true;}
  if(FD_CURATOR_OWN.call(plan,'feedback')){value=exact(plan.feedback,['cadenceKey','initiatorKey','settingKey'],[]);if(!value||!fdCuratorKey(value.cadenceKey)||!fdCuratorKey(value.initiatorKey)||!fdCuratorKey(value.settingKey))return false;}
  function rows(category,max,required,optional,check){var listValue=list(plan[category],max);if(!listValue||!listValue.length)return false;for(j=0;j<listValue.length;j++){row=exact(listValue[j],required,optional);if(!row||!id(row.instanceId)||!check(row))return false;}return true;}
  if(FD_CURATOR_OWN.call(plan,'accessItems')&&!rows('accessItems',12,['instanceId','itemKey','dueKey'],['linkKey'],function(item){return fdCuratorKey(item.itemKey)&&fdCuratorKey(item.dueKey)&&(!FD_CURATOR_OWN.call(item,'linkKey')||fdCuratorKey(item.linkKey));}))return false;
  if(FD_CURATOR_OWN.call(plan,'contacts')&&!rows('contacts',8,['instanceId','roleKey'],['linkKey'],function(item){return fdCuratorKey(item.roleKey)&&(!FD_CURATOR_OWN.call(item,'linkKey')||fdCuratorKey(item.linkKey));}))return false;
  if(FD_CURATOR_OWN.call(plan,'checklistItems')&&!rows('checklistItems',24,['instanceId','itemKey','priority'],[],function(item){return fdCuratorKey(item.itemKey)&&priority(item.priority);}))return false;
  if(FD_CURATOR_OWN.call(plan,'resources')&&!rows('resources',12,['instanceId','linkKey','priority','week'],['reasonKey'],function(item){return fdCuratorKey(item.linkKey)&&priority(item.priority)&&Number.isInteger(item.week)&&item.week>=1&&item.week<=maxWeek&&(!FD_CURATOR_OWN.call(item,'reasonKey')||fdCuratorKey(item.reasonKey));}))return false;
  count=(plan.arrival?1:0)+(plan.accessItems?plan.accessItems.length:0)+(plan.checklistItems?plan.checklistItems.length:0);return count<=24;
}

function fdCuratorPathStateValid(items,inspected){
  var list=fdCuratorArray(items,FD_CURATOR_MAX_PATH_ITEMS),ids=Object.create(null),orders=Object.create(null),counts=Object.create(null),i,row,keys,j;
  if(!list||!list.length)return false;
  for(i=0;i<list.length;i++){
    row=fdCuratorExactData(list[i],['instanceId','ref','week','order','priority'],['reasonKey']);
    if(!row||typeof row.instanceId!=='string'||!row.instanceId||typeof row.ref!=='string'||!inspected.allowed[row.ref]||ids[row.instanceId]||!Number.isInteger(row.week)||row.week<1||row.week>inspected.site.weekCount||!Number.isInteger(row.order)||row.order<1||FD_CURATOR_PRIORITIES.indexOf(row.priority)<0||(FD_CURATOR_OWN.call(row,'reasonKey')&&(typeof row.reasonKey!=='string'||!row.reasonKey)))return false;
    ids[row.instanceId]=true;if(!orders[row.week])orders[row.week]=Object.create(null);if(orders[row.week][row.order])return false;orders[row.week][row.order]=true;counts[row.week]=(counts[row.week]||0)+1;
  }
  keys=Object.keys(counts);for(i=0;i<keys.length;i++)for(j=1;j<=counts[keys[i]];j++)if(!orders[keys[i]][j])return false;
  return true;
}

function fdCuratorActionData(action){
  var typeData=fdCuratorOwnValue(action,'type'),fields=[],optional=[],type;
  if(!typeData.ok||typeof typeData.value!=='string')return null;type=typeData.value;
  if(type==='SET_TRAINING_LOCATION')fields=['type','trainingLocationKey'];
  else if(type==='SET_CURATOR_PROFILE')fields=['type','curatorProfileKey'];
  else if(type==='SET_ROTATION_START'||type==='SET_ROTATION_END'||type==='SET_EDITION_CHECKED_ON')fields=['type','value'];
  else if(type==='SET_PHRASE_SET')fields=['type','phraseSetKey'];
  else if(type==='PATH_INCLUDE'||type==='PATH_REPEAT')fields=['type','ref','week'];
  else if(type==='PATH_REMOVE')fields=['type','instanceId'];
  else if(type==='PATH_MOVE_WEEK')fields=['type','instanceId','week'];
  else if(type==='PATH_MOVE_ORDER')fields=['type','instanceId','direction'];
  else if(type==='PATH_SET_PRIORITY')fields=['type','instanceId','priority'];
  else if(type==='PATH_SET_REASON')fields=['type','instanceId','reasonKey'];
  else if(type==='SET_STEP')fields=['type','step'];
  else if(type==='IMPORT_SUCCEEDED')fields=['type','result','sequence'];
  else if(type==='IMPORT_REJECTED')fields=['type','code','sequence'];
  else if(type==='LOCAL_APPLY_PRESET')fields=['type','presetKey'];
  else if(type==='ARRIVAL_SET')fields=['type','value'];
  else if(type==='ARRIVAL_CLEAR')fields=['type'];
  else if(type==='SCHEDULE_SET_BOUNDS')fields=['type','dayStart','dayEnd','endQualifierCode'];
  else if(type==='SCHEDULE_EVENT_ADD'){fields=['type','daySetKey','startTime','activityKey','priority'];optional=['endTime','placeKey'];}
  else if(type==='SCHEDULE_EVENT_UPDATE')fields=['type','instanceId','field','value'];
  else if(type==='SCHEDULE_EVENT_REMOVE')fields=['type','instanceId'];
  else if(type==='ROUNDS_SET'||type==='PRESENTATION_SET'||type==='DOCUMENTATION_SET'||type==='ATTENDANCE_SET'||type==='FEEDBACK_SET')fields=['type','value'];
  else if(type==='ACCESS_ADD'){fields=['type','itemKey','dueKey'];optional=['linkKey'];}
  else if(type==='ACCESS_UPDATE'||type==='CONTACT_UPDATE'||type==='CHECKLIST_UPDATE'||type==='RESOURCE_UPDATE')fields=['type','instanceId','field','value'];
  else if(type==='ACCESS_REMOVE'||type==='CONTACT_REMOVE'||type==='CHECKLIST_REMOVE'||type==='RESOURCE_REMOVE')fields=['type','instanceId'];
  else if(type==='CONTACT_ADD'){fields=['type','roleKey'];optional=['linkKey'];}
  else if(type==='CHECKLIST_ADD')fields=['type','itemKey','priority'];
  else if(type==='RESOURCE_ADD'){fields=['type','linkKey','priority','week'];optional=['reasonKey'];}
  else if(type==='LOCAL_CATEGORY_CLEAR')fields=['type','category'];
  else if(type==='PREVIEW_REVIEW_SUCCEEDED')fields=['type','preset','result','sequence'];
  else if(type==='SET_AFFIRMATION')fields=['type','name','value'];
  else if(type==='GENERATION_SUCCEEDED')fields=['type','result','sequence'];
  else return null;
  return fdCuratorExactData(action,fields,optional);
}

function fdCuratorCatalogOptions(snapshot,kind,locationKey,audience){
  var records,rows=[],i,record,key,resolved,label,recordKind,choiceKind='',purposeCodes=null;
  try{if(typeof fdEditionCatalogTrusted!=='function'||!fdEditionCatalogTrusted(snapshot)||snapshot.audience!==audience)return [];
    records=fdCuratorArray(snapshot.resolutionRecords,4096);if(!records)return [];
    if(kind==='trainingLocation')recordKind='trainingLocation';
    else if(kind==='curatorProfile')recordKind='curatorProfile';
    else if(kind==='phraseSet')recordKind='phraseSet';
    else if(kind==='reason'){recordKind='choice';choiceKind='reason';}
    else if(kind==='place')recordKind='place';
    else if(kind==='localPreset')recordKind='localPreset';
    else if(kind.indexOf('choice:')===0){recordKind='choice';choiceKind=kind.slice(7);}
    else if(kind==='link:any')recordKind='officialLink';
    else if(kind==='link:access'){recordKind='officialLink';purposeCodes=['access-training','parking-transit','reviewed-operational'];}
    else if(kind.indexOf('link:')===0){recordKind='officialLink';purposeCodes=[kind.slice(5)];}
    else return [];
    for(i=0;i<records.length;i++){
      record=records[i];key=fdCuratorOwnValue(record,'key');if(!key.ok||typeof key.value!=='string')return [];
      if(recordKind==='trainingLocation')resolved=fdEditionCatalogRecord(snapshot,key.value,'builder',recordKind,key.value);
      else{if(typeof locationKey!=='string'||!locationKey)continue;resolved=fdEditionCatalogRecord(snapshot,key.value,'builder',recordKind,locationKey);}
      if(!resolved||resolved.ok!==true||!resolved.record)continue;
      record=resolved.record;if(choiceKind&&record.choiceKind!==choiceKind)continue;if(purposeCodes&&purposeCodes.indexOf(record.purposeCode)<0)continue;
      label=record.displayName||record.label||record.title;if(typeof label!=='string'||!label)continue;
      rows.push({key:key.value,label:label});
    }
  }catch(ignore){return [];}
  rows.sort(function(a,b){return a.label.localeCompare(b.label)||a.key.localeCompare(b.key);});return rows;
}

function fdCuratorOptionEligible(snapshot,kind,key,location,audience){
  var list=fdCuratorCatalogOptions(snapshot,kind,location,audience),i;
  for(i=0;i<list.length;i++)if(list[i].key===key)return true;return false;
}

function fdCuratorImportTransactions(){
  var sequence=0,importSequence=0,previewSequence=0,generationSequence=0;
  function next(){sequence+=1;return sequence;}
  return {begin:function(){importSequence=next();return importSequence;},current:function(){return importSequence;},
    cancel:function(){importSequence=next();return importSequence;},beginPreview:function(){previewSequence=next();return previewSequence;},
    currentPreview:function(){return previewSequence;},cancelPreview:function(){previewSequence=next();return previewSequence;},
    beginGeneration:function(){generationSequence=next();return generationSequence;},currentGeneration:function(){return generationSequence;},
    cancelGeneration:function(){generationSequence=next();return generationSequence;}};
}

function fdCuratorFindItem(items,instanceId){var i;for(i=0;i<items.length;i++)if(items[i].instanceId===instanceId)return i;return -1;}
function fdCuratorNormalizeOrders(items){
  items.sort(function(a,b){return a.week-b.week||a.order-b.order||a.instanceId.localeCompare(b.instanceId);});
  var week=0,order=0,i;for(i=0;i<items.length;i++){if(items[i].week!==week){week=items[i].week;order=0;}items[i].order=++order;}return items;
}
function fdCuratorNextOccurrence(items,ref){
  var used=Object.create(null),prefix='core:'+ref+':',i,suffix,next=1;
  for(i=0;i<items.length;i++)if(items[i].ref===ref&&items[i].instanceId.indexOf(prefix)===0){suffix=items[i].instanceId.slice(prefix.length);if(/^[1-9][0-9]*$/.test(suffix))used[Number(suffix)]=true;}
  while(used[next])next+=1;return next;
}
function fdCuratorInvalidate(next){
  next.previewReceipts={desktop:null,mobile:null};next.affirmations={publicSafe:false,officialLinks:false,previewsReviewed:false,forwardable:false};next.publication.lastGenerated=null;return next;
}

function fdCuratorEligible(snapshot,kind,key,location,audience){return typeof key==='string'&&fdCuratorOptionEligible(snapshot,kind,key,location,audience);}
function fdCuratorLocalIds(state){
  var ids=Object.create(null),plan=state.config.localPlan,i,j,rows;
  for(i=0;i<state.config.pathItems.length;i++)ids[state.config.pathItems[i].instanceId]=true;
  rows=plan.schedule&&plan.schedule.events||[];for(i=0;i<rows.length;i++)ids[rows[i].instanceId]=true;
  for(i=0;i<4;i++){rows=plan[['accessItems','contacts','checklistItems','resources'][i]]||[];for(j=0;j<rows.length;j++)ids[rows[j].instanceId]=true;}
  return ids;
}
function fdCuratorNextLocalId(state,kind){var ids=fdCuratorLocalIds(state),number=1,prefix='local:'+kind+':';while(ids[prefix+number])number+=1;return prefix+number;}
function fdCuratorLocalArray(next,category){if(!FD_CURATOR_OWN.call(next.config.localPlan,category))next.config.localPlan[category]=[];return next.config.localPlan[category];}
function fdCuratorOmitEmpty(next,category){if(Array.isArray(next.config.localPlan[category])&&!next.config.localPlan[category].length)delete next.config.localPlan[category];}
function fdCuratorScheduleTuple(row){return [row.daySetKey,row.startTime,row.endTime||'',row.activityKey,row.placeKey||''].join('\u0000');}
function fdCuratorChoice(snapshot,kind,key,state){return fdCuratorEligible(snapshot,'choice:'+kind,key,state.config.context.trainingLocationKey,state.site.audience);}
function fdCuratorLink(snapshot,purpose,key,state){return fdCuratorEligible(snapshot,'link:'+purpose,key,state.config.context.trainingLocationKey,state.site.audience);}
function fdCuratorOptionalLink(snapshot,purpose,value,state){return value===''||fdCuratorLink(snapshot,purpose,value,state);}
function fdCuratorNested(value,required,optional){var exact=fdCuratorExactData(value,required,optional||[]),copy;if(!exact)return null;copy=fdCuratorTryClone(exact);return copy.ok?copy.value:null;}
function fdCuratorLocalCombinedAllowed(plan){return (plan.arrival?1:0)+(plan.accessItems?plan.accessItems.length:0)+(plan.checklistItems?plan.checklistItems.length:0)<=24;}
function fdCuratorFindLocal(plan,category,instanceId){var rows=category==='schedule'?(plan.schedule&&plan.schedule.events||[]):(plan[category]||[]),i;for(i=0;i<rows.length;i++)if(rows[i].instanceId===instanceId)return i;return -1;}

function fdCuratorApplyLocalMutation(next,data,snapshot){
  var state=next,plan=state.config.localPlan,type=data.type,location=state.config.context.trainingLocationKey,audience=state.site.audience;
  var value,rows,row,position,field,allowed,i,record,resolved,tuple,seen;
  function choice(kind,key){return fdCuratorChoice(snapshot,kind,key,state);}
  function link(purpose,key){return fdCuratorLink(snapshot,purpose,key,state);}
  function optional(object,key,purpose){return !FD_CURATOR_OWN.call(object,key)||link(purpose,object[key]);}
  function time(value){return fdCuratorTime(value);}
  function priority(value){return FD_CURATOR_PRIORITIES.indexOf(value)>=0;}
  function setSingle(category,copied){plan[category]=copied;return true;}
  if(type==='LOCAL_APPLY_PRESET'){
    if(typeof data.presetKey!=='string'||!fdCuratorEligible(snapshot,'localPreset',data.presetKey,location,audience))return false;
    try{resolved=fdEditionCatalogRecord(snapshot,data.presetKey,'builder','localPreset',location);record=resolved&&resolved.ok===true&&resolved.record;if(!record||record.phraseSetKey!==state.config.phraseSetKey||!fdCuratorLocalPlanStateValid(record.localPlan,state.site.audience==='ms3'?6:4))return false;value=fdCuratorClone(record.localPlan);}catch(ignorePreset){return false;}
    if(fdEditionCanonicalJson(value)===fdEditionCanonicalJson(plan))return false;state.config.localPlan=value;return true;
  }
  if(type==='ARRIVAL_CLEAR'){if(!plan.arrival)return false;delete plan.arrival;return true;}
  if(type==='ARRIVAL_SET'){
    value=fdCuratorNested(data.value,['timingCode','time','placeKey','checkInRoleKey'],['linkKey']);
    if(!value||['at','by'].indexOf(value.timingCode)<0||!time(value.time)||!fdCuratorEligible(snapshot,'place',value.placeKey,location,audience)||!choice('role',value.checkInRoleKey)||!optional(value,'linkKey','arrival-map'))return false;
    return setSingle('arrival',value);
  }
  if(type==='SCHEDULE_SET_BOUNDS'){
    if(!time(data.dayStart)||!time(data.dayEnd)||data.dayStart>=data.dayEnd||['at','about','no-later-than'].indexOf(data.endQualifierCode)<0)return false;
    rows=plan.schedule&&plan.schedule.events||[];plan.schedule={dayStart:data.dayStart,dayEnd:data.dayEnd,endQualifierCode:data.endQualifierCode,events:fdCuratorClone(rows)};return true;
  }
  if(type==='SCHEDULE_EVENT_ADD'){
    if(!plan.schedule||plan.schedule.events.length>=24||!choice('daySet',data.daySetKey)||!time(data.startTime)||!choice('activity',data.activityKey)||!priority(data.priority))return false;
    if(FD_CURATOR_OWN.call(data,'endTime')&&(!time(data.endTime)||data.endTime<=data.startTime))return false;
    if(FD_CURATOR_OWN.call(data,'placeKey')&&!fdCuratorEligible(snapshot,'place',data.placeKey,location,audience))return false;
    row={instanceId:fdCuratorNextLocalId(state,'schedule'),daySetKey:data.daySetKey,startTime:data.startTime};if(FD_CURATOR_OWN.call(data,'endTime'))row.endTime=data.endTime;row.activityKey=data.activityKey;if(FD_CURATOR_OWN.call(data,'placeKey'))row.placeKey=data.placeKey;row.priority=data.priority;
    tuple=fdCuratorScheduleTuple(row);for(i=0;i<plan.schedule.events.length;i++)if(fdCuratorScheduleTuple(plan.schedule.events[i])===tuple)return false;plan.schedule.events.push(row);return true;
  }
  if(type==='SCHEDULE_EVENT_UPDATE'){
    allowed=['daySetKey','startTime','endTime','activityKey','placeKey','priority'];if(allowed.indexOf(data.field)<0||typeof data.value!=='string')return false;position=fdCuratorFindLocal(plan,'schedule',data.instanceId);if(position<0)return false;row=fdCuratorClone(plan.schedule.events[position]);field=data.field;
    if((field==='endTime'||field==='placeKey')&&data.value==='')delete row[field];else row[field]=data.value;
    if(!choice('daySet',row.daySetKey)||!time(row.startTime)||!choice('activity',row.activityKey)||!priority(row.priority)||(row.endTime&&(!time(row.endTime)||row.endTime<=row.startTime))||(row.placeKey&&!fdCuratorEligible(snapshot,'place',row.placeKey,location,audience)))return false;
    tuple=fdCuratorScheduleTuple(row);for(i=0;i<plan.schedule.events.length;i++)if(i!==position&&fdCuratorScheduleTuple(plan.schedule.events[i])===tuple)return false;plan.schedule.events[position]=row;return true;
  }
  if(type==='SCHEDULE_EVENT_REMOVE'){
    position=fdCuratorFindLocal(plan,'schedule',data.instanceId);if(position<0||(plan.attendance&&plan.attendance.eventInstanceIds.indexOf(data.instanceId)>=0))return false;plan.schedule.events.splice(position,1);if(!plan.schedule.events.length)delete plan.schedule;return true;
  }
  if(type==='ROUNDS_SET'){value=fdCuratorNested(data.value,['preparationKey','participationKey','followUpKey'],[]);if(!value||!choice('roundsPreparation',value.preparationKey)||!choice('roundsParticipation',value.participationKey)||!choice('roundsFollowUp',value.followUpKey))return false;return setSingle('rounds',value);}
  if(type==='PRESENTATION_SET'){
    value=fdCuratorNested(data.value,['formatKey','timingKey','elementKeys'],[]);if(!value||!choice('presentationFormat',value.formatKey)||!choice('presentationTiming',value.timingKey)||(rows=fdCuratorArray(value.elementKeys,8))===null||!rows.length)return false;seen=Object.create(null);for(i=0;i<rows.length;i++)if(seen[rows[i]]||!choice('presentationElement',rows[i]))return false;else seen[rows[i]]=true;return setSingle('presentation',value);
  }
  if(type==='DOCUMENTATION_SET'){value=fdCuratorNested(data.value,['workflowKey','timingKey'],['policyLinkKey']);if(!value||!choice('documentationWorkflow',value.workflowKey)||!choice('documentationTiming',value.timingKey)||!optional(value,'policyLinkKey','documentation-policy'))return false;return setSingle('documentation',value);}
  if(type==='ATTENDANCE_SET'){
    value=fdCuratorNested(data.value,['eventInstanceIds','absenceRoleKey'],['policyLinkKey']);rows=value&&fdCuratorArray(value.eventInstanceIds,24);if(!value||!rows||!rows.length||!choice('role',value.absenceRoleKey)||!optional(value,'policyLinkKey','attendance-policy')||!plan.schedule)return false;seen=Object.create(null);for(i=0;i<rows.length;i++)if(typeof rows[i]!=='string'||seen[rows[i]]||fdCuratorFindLocal(plan,'schedule',rows[i])<0)return false;else seen[rows[i]]=true;return setSingle('attendance',value);
  }
  if(type==='FEEDBACK_SET'){value=fdCuratorNested(data.value,['cadenceKey','initiatorKey','settingKey'],[]);if(!value||!choice('feedbackCadence',value.cadenceKey)||!choice('feedbackInitiator',value.initiatorKey)||!choice('feedbackSetting',value.settingKey))return false;return setSingle('feedback',value);}
  if(type==='LOCAL_CATEGORY_CLEAR'){
    if(FD_CURATOR_LOCAL_CATEGORIES.indexOf(data.category)<0||!FD_CURATOR_OWN.call(plan,data.category)||(data.category==='schedule'&&plan.attendance))return false;delete plan[data.category];return true;
  }
  var table={ACCESS_ADD:['accessItems',12,'access',['itemKey','dueKey'],['linkKey']],CONTACT_ADD:['contacts',8,'contact',['roleKey'],['linkKey']],CHECKLIST_ADD:['checklistItems',24,'checklist',['itemKey','priority'],[]],RESOURCE_ADD:['resources',12,'resource',['linkKey','priority','week'],['reasonKey']]};
  if(table[type]){
    value=table[type];rows=fdCuratorLocalArray(state,value[0]);if(rows.length>=value[1]){fdCuratorOmitEmpty(state,value[0]);return false;}row={instanceId:fdCuratorNextLocalId(state,value[2])};
    for(i=0;i<value[3].length;i++)row[value[3][i]]=data[value[3][i]];for(i=0;i<value[4].length;i++)if(FD_CURATOR_OWN.call(data,value[4][i]))row[value[4][i]]=data[value[4][i]];
    if(type==='ACCESS_ADD'&&(!choice('accessItem',row.itemKey)||!choice('duePoint',row.dueKey)||!optional(row,'linkKey','access')))return false;
    if(type==='CONTACT_ADD'&&(!choice('role',row.roleKey)||!optional(row,'linkKey','directory')))return false;
    if(type==='CHECKLIST_ADD'&&(!choice('checklist',row.itemKey)||!priority(row.priority)))return false;
    if(type==='RESOURCE_ADD'&&(!link('any',row.linkKey)||!priority(row.priority)||!Number.isInteger(row.week)||row.week<1||row.week>(audience==='ms3'?6:4)||(row.reasonKey&&!choice('reason',row.reasonKey))))return false;
    rows.push(row);if(!fdCuratorLocalCombinedAllowed(plan)){rows.pop();fdCuratorOmitEmpty(state,value[0]);return false;}return true;
  }
  var variants={ACCESS_UPDATE:['accessItems',['itemKey','dueKey','linkKey']],CONTACT_UPDATE:['contacts',['roleKey','linkKey']],CHECKLIST_UPDATE:['checklistItems',['itemKey','priority']],RESOURCE_UPDATE:['resources',['linkKey','priority','week','reasonKey']]};
  if(variants[type]){
    value=variants[type];position=fdCuratorFindLocal(plan,value[0],data.instanceId);if(position<0||value[1].indexOf(data.field)<0)return false;row=fdCuratorClone(plan[value[0]][position]);field=data.field;
    if((field==='linkKey'||field==='reasonKey')&&data.value==='')delete row[field];else row[field]=data.value;
    if(type==='ACCESS_UPDATE'&&(!choice('accessItem',row.itemKey)||!choice('duePoint',row.dueKey)||!optional(row,'linkKey','access')))return false;
    if(type==='CONTACT_UPDATE'&&(!choice('role',row.roleKey)||!optional(row,'linkKey','directory')))return false;
    if(type==='CHECKLIST_UPDATE'&&(!choice('checklist',row.itemKey)||!priority(row.priority)))return false;
    if(type==='RESOURCE_UPDATE'&&(!link('any',row.linkKey)||!priority(row.priority)||!Number.isInteger(row.week)||row.week<1||row.week>(audience==='ms3'?6:4)||(row.reasonKey&&!choice('reason',row.reasonKey))))return false;
    plan[value[0]][position]=row;return true;
  }
  var removals={ACCESS_REMOVE:'accessItems',CONTACT_REMOVE:'contacts',CHECKLIST_REMOVE:'checklistItems',RESOURCE_REMOVE:'resources'};
  if(removals[type]){position=fdCuratorFindLocal(plan,removals[type],data.instanceId);if(position<0)return false;plan[removals[type]].splice(position,1);fdCuratorOmitEmpty(state,removals[type]);return true;}
  return false;
}

function fdCuratorReduce(state,action,index,siteContext,catalogSnapshot,generationDate,transactions){
  return fdCuratorReduceWithPublication(state,action,index,siteContext,catalogSnapshot,generationDate,transactions,fdCuratorStatePublicationSnapshot(state));
}
function fdCuratorReduceWithPublication(state,action,index,siteContext,catalogSnapshot,generationDate,transactions,statePublication){
  var inspected=fdCuratorIndexSnapshot(index,siteContext),data,type,next,cloned,position,item,weekRows,swap,eligible,privateImport,privateImportPublication,privateResult,receipt,other;
  if(!statePublication||!inspected.ok||!fdCuratorStateValid(state,index,siteContext,statePublication))return state;
  data=fdCuratorActionData(action);if(!data)return state;type=data.type;
  if(type==='SET_STEP'){
    if(!Number.isInteger(data.step)||data.step<1||data.step>5||data.step===state.step)return state;
    cloned=fdCuratorTryCloneState(state,statePublication);if(!cloned.ok)return state;next=cloned.value;next.step=data.step;return next;
  }
  if(type==='IMPORT_REJECTED'){
    if(!Number.isInteger(data.sequence)||!transactions||typeof transactions.current!=='function'||data.sequence!==transactions.current()||FD_CURATOR_IMPORT_CODES.indexOf(data.code)<0)return state;
    return state;
  }
  if(type==='IMPORT_SUCCEEDED'){
    if(!Number.isInteger(data.sequence)||!transactions||typeof transactions.current!=='function'||data.sequence!==transactions.current()||!FD_CURATOR_IMPORT_RESULTS.has(data.result))return state;
    privateImport=FD_CURATOR_IMPORT_RESULTS.get(data.result);privateImportPublication=privateImport&&fdCuratorStatePublicationSnapshot(privateImport);if(!privateImport||!fdCuratorStateValid(privateImport,index,siteContext,privateImportPublication))return state;
    if((statePublication.baseEnvelope!==null||FD_CURATOR_TRUSTED_BASES.has(state))&&!fdCuratorTrustedBaseRecord(state,statePublication)&&privateImportPublication.baseEnvelope!==null){
      cloned=fdCuratorTryCloneState(state,statePublication);if(!cloned.ok)return state;next=cloned.value;
      next.publication.baseEnvelope=fdCuratorClone(privateImportPublication.baseEnvelope);next.publication.baseSemanticConfig=privateImportPublication.baseSemanticConfig;
      fdCuratorInvalidate(next);fdCuratorTransferBaseTrust(privateImport,next,privateImportPublication);return next;
    }
    if(fdEditionCanonicalJson(privateImport)===fdEditionCanonicalJson(state))return state;
    cloned=fdCuratorTryCloneState(privateImport,privateImportPublication);return cloned.ok?cloned.value:state;
  }
  if(type==='PREVIEW_REVIEW_SUCCEEDED'){
    if(['desktop','mobile-390'].indexOf(data.preset)<0||!Number.isInteger(data.sequence)||!transactions||typeof transactions.currentPreview!=='function'||data.sequence!==transactions.currentPreview()||!FD_CURATOR_PREVIEW_COMPLETIONS.has(data.result))return state;
    privateResult=FD_CURATOR_PREVIEW_COMPLETIONS.get(data.result);if(!privateResult||privateResult.sequence!==data.sequence||privateResult.preset!==data.preset||privateResult.publicationObject!==statePublication.object||privateResult.baseObject!==statePublication.baseEnvelope||privateResult.draftSignature!==fdCuratorCandidateDraftSignature(state,statePublication))return state;
    receipt={contentDigest:privateResult.receipt.contentDigest,referenceSetDigest:privateResult.receipt.referenceSetDigest,currentCoreRevision:privateResult.receipt.currentCoreRevision,currentCatalogRevision:privateResult.receipt.currentCatalogRevision,rendererRevision:privateResult.receipt.rendererRevision,previewPreset:privateResult.receipt.previewPreset};
    if(fdCuratorReceiptMatches(data.preset==='desktop'?state.previewReceipts.desktop:state.previewReceipts.mobile,privateResult.expected,data.preset)){
      other=data.preset==='desktop'?state.previewReceipts.mobile:state.previewReceipts.desktop;
      if(state.affirmations.previewsReviewed===(fdCuratorReceiptMatches(data.preset==='desktop'?receipt:other,privateResult.expected,'desktop')&&fdCuratorReceiptMatches(data.preset==='desktop'?other:receipt,privateResult.expected,'mobile-390')))return state;
    }
    cloned=fdCuratorTryCloneState(state,statePublication);if(!cloned.ok)return state;next=cloned.value;
    if(data.preset==='desktop')next.previewReceipts.desktop=receipt;else next.previewReceipts.mobile=receipt;
    other=data.preset==='desktop'?next.previewReceipts.mobile:next.previewReceipts.desktop;
    next.affirmations.previewsReviewed=fdCuratorReceiptMatches(next.previewReceipts.desktop,privateResult.expected,'desktop')&&fdCuratorReceiptMatches(next.previewReceipts.mobile,privateResult.expected,'mobile-390');return next;
  }
  if(type==='SET_AFFIRMATION'){
    if(['publicSafe','officialLinks','forwardable'].indexOf(data.name)<0||typeof data.value!=='boolean'||state.affirmations[data.name]===data.value)return state;
    cloned=fdCuratorTryCloneState(state,statePublication);if(!cloned.ok)return state;cloned.value.affirmations[data.name]=data.value;return cloned.value;
  }
  if(type==='GENERATION_SUCCEEDED'){
    if(!Number.isInteger(data.sequence)||!transactions||typeof transactions.currentGeneration!=='function'||data.sequence!==transactions.currentGeneration()||!FD_CURATOR_GENERATION_RESULTS.has(data.result))return state;
    privateResult=FD_CURATOR_GENERATION_RESULTS.get(data.result);if(!privateResult||privateResult.sequence!==data.sequence||privateResult.publicationObject!==statePublication.object||privateResult.baseObject!==statePublication.baseEnvelope||privateResult.draftSignature!==fdCuratorCandidateDraftSignature(state,statePublication))return state;
    if(statePublication.lastGenerated&&fdEditionCanonicalJson(statePublication.lastGenerated)===fdEditionCanonicalJson(privateResult.lastGenerated))return state;
    cloned=fdCuratorTryCloneState(state,statePublication);if(!cloned.ok)return state;cloned.value.publication.lastGenerated=fdCuratorClone(privateResult.lastGenerated);return cloned.value;
  }
  cloned=fdCuratorTryCloneState(state,statePublication);if(!cloned.ok)return state;next=cloned.value;
  if(type==='SET_TRAINING_LOCATION'){
    if(typeof data.trainingLocationKey!=='string'||data.trainingLocationKey===state.config.context.trainingLocationKey)return state;
    if(data.trainingLocationKey&&!fdCuratorOptionEligible(catalogSnapshot,'trainingLocation',data.trainingLocationKey,'',inspected.site.audience))return state;
    next.config.context.trainingLocationKey=data.trainingLocationKey;
    if(!data.trainingLocationKey||!fdCuratorOptionEligible(catalogSnapshot,'curatorProfile',next.config.context.curatorProfileKey,data.trainingLocationKey,inspected.site.audience))next.config.context.curatorProfileKey='';
    if(!data.trainingLocationKey||!fdCuratorOptionEligible(catalogSnapshot,'phraseSet',next.config.phraseSetKey,data.trainingLocationKey,inspected.site.audience))next.config.phraseSetKey='';
  }else if(type==='SET_CURATOR_PROFILE'){
    if(typeof data.curatorProfileKey!=='string'||data.curatorProfileKey===state.config.context.curatorProfileKey)return state;
    if(data.curatorProfileKey&&!fdCuratorOptionEligible(catalogSnapshot,'curatorProfile',data.curatorProfileKey,state.config.context.trainingLocationKey,inspected.site.audience))return state;
    next.config.context.curatorProfileKey=data.curatorProfileKey;
  }else if(type==='SET_PHRASE_SET'){
    if(typeof data.phraseSetKey!=='string'||data.phraseSetKey===state.config.phraseSetKey)return state;
    if(data.phraseSetKey&&!fdCuratorOptionEligible(catalogSnapshot,'phraseSet',data.phraseSetKey,state.config.context.trainingLocationKey,inspected.site.audience))return state;
    next.config.phraseSetKey=data.phraseSetKey;
  }else if(type==='SET_ROTATION_START'||type==='SET_ROTATION_END'||type==='SET_EDITION_CHECKED_ON'){
    if(typeof data.value!=='string'||(data.value&&!fdCuratorRealDate(data.value)))return state;
    var field=type==='SET_ROTATION_START'?'rotationStart':type==='SET_ROTATION_END'?'rotationEnd':'editionCheckedOn';
    if(data.value===state.config.context[field])return state;
    if(field==='rotationStart'&&data.value&&state.config.context.rotationEnd&&state.config.context.rotationEnd<data.value)return state;
    if(field==='rotationEnd'&&data.value&&state.config.context.rotationStart&&data.value<state.config.context.rotationStart)return state;
    if(field==='editionCheckedOn'&&data.value&&(!fdCuratorRealDate(generationDate)||data.value>generationDate))return state;
    next.config.context[field]=data.value;
  }else if(type==='PATH_INCLUDE'||type==='PATH_REPEAT'){
    if(typeof data.ref!=='string'||!inspected.allowed[data.ref]||!Number.isInteger(data.week)||data.week<1||data.week>inspected.site.weekCount||next.config.pathItems.length>=FD_CURATOR_MAX_PATH_ITEMS)return state;
    if(type==='PATH_INCLUDE'&&fdCuratorFindRef(next.config.pathItems,data.ref))return state;
    weekRows=next.config.pathItems.filter(function(row){return row.week===data.week;});
    next.config.pathItems.push({instanceId:'core:'+data.ref+':'+fdCuratorNextOccurrence(next.config.pathItems,data.ref),ref:data.ref,week:data.week,order:weekRows.length+1,priority:'recommended'});
    fdCuratorNormalizeOrders(next.config.pathItems);
  }else if(type==='PATH_REMOVE'){
    if(typeof data.instanceId!=='string'||next.config.pathItems.length===1||(position=fdCuratorFindItem(next.config.pathItems,data.instanceId))<0)return state;
    next.config.pathItems.splice(position,1);fdCuratorNormalizeOrders(next.config.pathItems);
  }else if(type==='PATH_MOVE_WEEK'){
    position=fdCuratorFindItem(next.config.pathItems,data.instanceId);
    if(position<0||!Number.isInteger(data.week)||data.week<1||data.week>inspected.site.weekCount||next.config.pathItems[position].week===data.week)return state;
    next.config.pathItems[position].week=data.week;next.config.pathItems[position].order=next.config.pathItems.filter(function(row,i){return i!==position&&row.week===data.week;}).length+1;fdCuratorNormalizeOrders(next.config.pathItems);
  }else if(type==='PATH_MOVE_ORDER'){
    position=fdCuratorFindItem(next.config.pathItems,data.instanceId);if(position<0||['up','down'].indexOf(data.direction)<0)return state;
    item=next.config.pathItems[position];weekRows=next.config.pathItems.filter(function(row){return row.week===item.week;}).sort(function(a,b){return a.order-b.order;});
    var within=fdCuratorFindItem(weekRows,item.instanceId),target=data.direction==='up'?within-1:within+1;
    if(target<0||target>=weekRows.length)return state;swap=weekRows[target].order;weekRows[target].order=item.order;item.order=swap;fdCuratorNormalizeOrders(next.config.pathItems);
  }else if(type==='PATH_SET_PRIORITY'){
    position=fdCuratorFindItem(next.config.pathItems,data.instanceId);if(position<0||FD_CURATOR_PRIORITIES.indexOf(data.priority)<0||next.config.pathItems[position].priority===data.priority)return state;
    next.config.pathItems[position].priority=data.priority;
  }else if(type==='PATH_SET_REASON'){
    position=fdCuratorFindItem(next.config.pathItems,data.instanceId);if(position<0||typeof data.reasonKey!=='string')return state;
    item=next.config.pathItems[position];if((item.reasonKey||'')===data.reasonKey)return state;
    eligible=!data.reasonKey||fdCuratorOptionEligible(catalogSnapshot,'reason',data.reasonKey,state.config.context.trainingLocationKey,inspected.site.audience);if(!eligible)return state;
    if(data.reasonKey)item.reasonKey=data.reasonKey;else delete item.reasonKey;
  }else if(FD_CURATOR_LOCAL_CATEGORIES.indexOf(type)<0&&/^(?:LOCAL_|ARRIVAL_|SCHEDULE_|ROUNDS_|PRESENTATION_|DOCUMENTATION_|ATTENDANCE_|FEEDBACK_|ACCESS_|CONTACT_|CHECKLIST_|RESOURCE_)/.test(type)){
    var beforeLocal=fdEditionCanonicalJson(next.config.localPlan);if(!fdCuratorApplyLocalMutation(next,data,catalogSnapshot)||fdEditionCanonicalJson(next.config.localPlan)===beforeLocal)return state;
  }else return state;
  return fdCuratorInvalidate(next);
}

function fdCuratorFindRef(items,ref){var i;for(i=0;i<items.length;i++)if(items[i].ref===ref)return true;return false;}

function fdCuratorActionSemanticSnapshot(state,publicationSnapshot){
  var publication=arguments.length>=2?publicationSnapshot:fdCuratorStatePublicationSnapshot(state);
  if(!publication)return null;
  try{return fdEditionCanonicalJson({site:state.site,config:state.config,baseEnvelope:publication.baseEnvelope});}
  catch(ignore){return null;}
}
function fdCuratorApplyAction(state,action,index,siteContext,catalogSnapshot,generationDate,transactions){
  var publication=fdCuratorStatePublicationSnapshot(state),before,next,after,semantic=false;
  if(!publication)return {state:state,changed:false,semanticChanged:false};
  before=fdCuratorActionSemanticSnapshot(state,publication);next=fdCuratorReduceWithPublication(state,action,index,siteContext,catalogSnapshot,generationDate,transactions,publication);
  if(next!==state){after=fdCuratorActionSemanticSnapshot(next);semantic=before!==null&&after!==null&&before!==after;if(semantic&&transactions&&typeof transactions.cancel==='function')transactions.cancel();if(semantic&&transactions&&typeof transactions.cancelPreview==='function')transactions.cancelPreview();if(semantic&&transactions&&typeof transactions.cancelGeneration==='function')transactions.cancelGeneration();}
  return {state:next,changed:next!==state,semanticChanged:semantic};
}

function fdCuratorImportFailure(code){return {ok:false,code:code};}
function fdCuratorContractSiteContext(siteContext){
  var site=fdCuratorSiteValue(siteContext);
  return site?{audience:site.audience,localCatalogRevision:site.localCatalogRevision,
    rotationEditionV2:site.rotationEditionV2,coreRevision:site.coreRevision}:null;
}
function fdCuratorImportCode(result){
  var errors=result&&Array.isArray(result.errors)?result.errors:[],i,code='';
  for(i=0;i<errors.length;i++){code=errors[i]&&errors[i].code||'';if(/CATALOG|RECORD|BLOCKED|DEPRECATED|MISSING|RESELECTION/.test(code))return 'CURATOR_IMPORT_RESELECTION_REQUIRED';}
  return 'CURATOR_IMPORT_INVALID';
}

function fdCuratorImportBackup(text,index,siteContext,catalogSnapshot,validationContext,subtle){
  var bytes,envelope,contextData;
  if(typeof text!=='string')return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_FORMAT'));
  try{bytes=new TextEncoder().encode(text).length;}catch(ignoreEncoding){return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_FORMAT'));}
  if(bytes>FD_CURATOR_IMPORT_MAX_BYTES)return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_SIZE'));
  try{envelope=JSON.parse(text);}catch(ignoreParse){return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_FORMAT'));}
  contextData=fdCuratorExactData(validationContext,['mode','generationDate'],[]);
  if(!contextData||contextData.mode!=='builder'||typeof contextData.generationDate!=='string')return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_INVALID'));
  var contractSite=fdCuratorContractSiteContext(siteContext);
  if(!contractSite)return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_INVALID'));
  return fdEditionValidateEnvelope(envelope,index,catalogSnapshot,contractSite,contextData,subtle).then(function(result){
    var snapshot,draft,successful,baseEnvelope,semantic,publication;
    if(!result||result.ok!==true)return fdCuratorImportFailure(fdCuratorImportCode(result));
    snapshot=fdEditionTrustedSnapshot(result);if(!snapshot)return fdCuratorImportFailure('CURATOR_IMPORT_INVALID');
    draft=fdCuratorNewDraft(index,siteContext);draft.config={context:fdCuratorClone(snapshot.config.context),phraseSetKey:snapshot.config.phraseSetKey,
      pathItems:fdCuratorClone(snapshot.config.pathItems),localPlan:fdCuratorClone(snapshot.config.localPlan),changeSummary:fdCuratorClone(snapshot.config.changeSummary)};
    baseEnvelope=fdCuratorClone(snapshot.envelope);semantic=fdEditionSemanticConfig(snapshot.config);
    draft.publication={baseEnvelope:baseEnvelope,baseSemanticConfig:semantic,lastGenerated:null};publication=fdCuratorStatePublicationSnapshot(draft);
    if(!publication||!fdCuratorStateValid(draft,index,siteContext,publication))return fdCuratorImportFailure('CURATOR_IMPORT_INVALID');
    FD_CURATOR_TRUSTED_BASES.set(draft,{envelopeCanonical:fdEditionCanonicalJson(snapshot.envelope),semantic:semantic,config:fdCuratorClone(snapshot.config),envelope:fdCuratorClone(snapshot.envelope),publicationObject:publication.object,baseObject:publication.baseEnvelope});
    successful={ok:true,code:'CURATOR_IMPORT_OK'};FD_CURATOR_IMPORT_RESULTS.set(successful,draft);return successful;
  },function(){return fdCuratorImportFailure('CURATOR_IMPORT_INVALID');});
}

function fdCuratorReadImportFile(file,index,siteContext,catalogSnapshot,validationContext,subtle){
  return fdCuratorReadBackupFile(file).then(function(read){
    return read.ok?fdCuratorImportBackup(read.text,index,siteContext,catalogSnapshot,validationContext,subtle):fdCuratorImportFailure(read.code);
  });
}

function fdCuratorReadBackupFile(file){
  var sizeData,textData,blobSize=null,blobText=null;
  if(!file||typeof file!=='object')return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_FORMAT'));
  sizeData=fdCuratorOwnValue(file,'size');textData=fdCuratorOwnValue(file,'text');
  if(sizeData.ok)blobSize=sizeData.value;
  else try{if(typeof Blob==='function'&&file instanceof Blob){blobSize=Object.getOwnPropertyDescriptor(Blob.prototype,'size').get.call(file);blobText=Blob.prototype.text;}}catch(ignoreBlob){blobSize=null;}
  if(typeof blobSize!=='number'||!isFinite(blobSize)||blobSize<0||blobSize>FD_CURATOR_IMPORT_MAX_BYTES)return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_SIZE'));
  if(!blobText&&textData.ok&&typeof textData.value==='function')blobText=textData.value;
  if(typeof blobText!=='function')return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_FORMAT'));
  try{return Promise.resolve(blobText.call(file)).then(function(text){
    var bytes;if(typeof text!=='string')return fdCuratorImportFailure('CURATOR_IMPORT_FORMAT');
    try{bytes=new TextEncoder().encode(text).length;}catch(ignoreEncoding){return fdCuratorImportFailure('CURATOR_IMPORT_FORMAT');}
    return bytes>FD_CURATOR_IMPORT_MAX_BYTES?fdCuratorImportFailure('CURATOR_IMPORT_SIZE'):{ok:true,code:'CURATOR_IMPORT_FILE_OK',text:text};
  },function(){return fdCuratorImportFailure('CURATOR_IMPORT_FORMAT');});}
  catch(ignoreRead){return Promise.resolve(fdCuratorImportFailure('CURATOR_IMPORT_FORMAT'));}
}

function fdCuratorImportText(text,index,siteContext,catalogSnapshot,validationContext,subtle){
  return fdCuratorImportBackup(text,index,siteContext,catalogSnapshot,validationContext,subtle).then(function(v2){
    if(v2.ok||v2.code==='CURATOR_IMPORT_SIZE'||typeof fdEditionV1ValidateForSalvage!=='function'||typeof fdEditionV1Salvage!=='function')return v2;
    return fdEditionV1ValidateForSalvage(text,index,siteContext,subtle).then(function(validated){
      var salvaged,successful;
      if(!validated||validated.ok!==true)return v2;
      salvaged=fdEditionV1Salvage(validated,index,siteContext,validationContext.generationDate);
      if(!salvaged||salvaged.ok!==true||!fdCuratorStateValid(salvaged.draft,index,siteContext))return fdCuratorImportFailure('CURATOR_IMPORT_INVALID');
      successful={ok:true,code:'CURATOR_IMPORT_SALVAGED',droppedReferenceCount:salvaged.droppedReferenceCount};
      FD_CURATOR_IMPORT_RESULTS.set(successful,salvaged.draft);return successful;
    },function(){return v2;});
  });
}

function fdCuratorLocalGenerationDate(calendar){
  var year,month,day,stamp;
  try{
    if(!calendar||typeof calendar.getFullYear!=='function'||typeof calendar.getMonth!=='function'||typeof calendar.getDate!=='function')return '';
    year=calendar.getFullYear();month=calendar.getMonth()+1;day=calendar.getDate();
    if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||year<1||year>9999||month<1||month>12||day<1||day>31)return '';
    stamp=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');return fdCuratorRealDate(stamp)?stamp:'';
  }catch(ignore){return '';}
}

function fdCuratorEscape(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fdCuratorOptionsMarkup(rows,selected,allowEmpty,emptyLabel){
  var out=allowEmpty?'<option value="">'+fdCuratorEscape(emptyLabel)+'</option>':'',i;
  for(i=0;i<rows.length;i++)out+='<option value="'+fdCuratorEscape(rows[i].key)+'"'+((Array.isArray(selected)?selected.indexOf(rows[i].key)>=0:rows[i].key===selected)?' selected':'')+'>'+fdCuratorEscape(rows[i].label)+'</option>';return out;
}

function fdCuratorLocalCoverage(localPlan){
  var plan=localPlan&&typeof localPlan==='object'?localPlan:{};
  return {where:Boolean(plan.arrival&&plan.arrival.placeKey),when:Boolean(plan.arrival&&plan.arrival.timingCode&&plan.arrival.time),prepare:Boolean(plan.accessItems&&plan.accessItems.length),help:Boolean((plan.contacts&&plan.contacts.length)||(plan.arrival&&plan.arrival.checkInRoleKey)),first:Boolean((plan.checklistItems&&plan.checklistItems.length)||(plan.schedule&&plan.schedule.events.length))};
}
function fdCuratorTrustedDisplay(model){var canonical;try{canonical=FD_CURATOR_DISPLAY_RESULTS.get(model);return canonical&&canonical===fdEditionCanonicalJson(model)?model:null;}catch(ignore){return null;}}
function fdCuratorStudentSentences(model,category){
  var rows=[],i,value;
  if(!model)return rows;
  if(category==='arrival'&&model.firstDay.arrival)rows.push(model.firstDay.arrival.text);
  else if(category==='accessItems')for(i=0;i<model.firstDay.accessItems.length;i++)rows.push(model.firstDay.accessItems[i].text);
  else if(category==='contacts')for(i=0;i<model.firstDay.contacts.length;i++)rows.push(model.firstDay.contacts[i].text);
  else if(category==='checklistItems')for(i=0;i<model.firstDay.checklistItems.length;i++)rows.push(model.firstDay.checklistItems[i].text);
  else if(category==='schedule'&&model.typicalDay){if(model.typicalDay.summaryText)rows.push(model.typicalDay.summaryText);for(i=0;i<model.typicalDay.eventItems.length;i++)rows.push(model.typicalDay.eventItems[i].text);}
  else if(['rounds','presentation','documentation'].indexOf(category)>=0&&(value=model.workflow[category]))rows.push(value.text);
  else if(category==='attendance'&&model.attendanceFeedback.attendance)rows.push(model.attendanceFeedback.attendance.text);
  else if(category==='feedback'&&model.attendanceFeedback.feedback)rows.push(model.attendanceFeedback.feedback.text);
  else if(category==='resources')for(i=0;i<model.resources.length;i++)rows.push(model.resources[i].text);
  return rows;
}
function fdCuratorStudentsSee(model,category){var rows=fdCuratorStudentSentences(model,category),html='<div class="fd-curator-learners-see"><strong>Students will see</strong>';if(!rows.length)return html+'<p>Nothing from this category until reviewed selections are included.</p></div>';for(var i=0;i<rows.length;i++)html+='<p>'+fdCuratorEscape(rows[i])+'</p>';return html+'</div>';}
function fdCuratorLocalSelect(snapshot,kind,location,audience,field,label,selected,allowEmpty,emptyLabel,multiple){
  var rows=kind==='priority'?FD_CURATOR_PRIORITIES.map(function(value){return {key:value,label:value};}):fdCuratorCatalogOptions(snapshot,kind,location,audience),html='<label>'+label+' <select data-curator-field="'+field+'"'+(multiple?' multiple':'')+'>'+fdCuratorOptionsMarkup(rows,selected||'',allowEmpty,emptyLabel||'Choose reviewed option')+'</select></label>';return html;
}
function fdCuratorLocalControls(state,snapshot,category){
  var plan=state.config.localPlan,location=state.config.context.trainingLocationKey,audience=state.site.audience,value=plan[category],html='<div class="fd-curator-structured-controls">',i,rows;
  function select(kind,field,label,selected,allowEmpty,emptyLabel,multiple){return fdCuratorLocalSelect(snapshot,kind,location,audience,field,label,selected,allowEmpty,emptyLabel,multiple);}
  function time(field,label,current){return '<label>'+label+' <input type="time" data-curator-field="'+field+'" value="'+fdCuratorEscape(current||'')+'"></label>';}
  function rowSelect(action,row,kind,field,label,current,allowEmpty,emptyLabel){
    var options=kind==='priority'?FD_CURATOR_PRIORITIES.map(function(item){return {key:item,label:item};}):fdCuratorCatalogOptions(snapshot,kind,location,audience);
    return '<label>'+fdCuratorEscape(label)+' <select data-curator-row-update="'+action+'" data-instance-id="'+fdCuratorEscape(row.instanceId)+'" data-curator-update-field="'+field+'" aria-label="'+fdCuratorEscape(label)+'">'+fdCuratorOptionsMarkup(options,current||'',allowEmpty,emptyLabel||'Choose reviewed option')+'</select></label>';
  }
  function rowInput(action,row,type,field,label,current,attributes){return '<label>'+fdCuratorEscape(label)+' <input type="'+type+'" data-curator-row-update="'+action+'" data-instance-id="'+fdCuratorEscape(row.instanceId)+'" data-curator-update-field="'+field+'" aria-label="'+fdCuratorEscape(label)+'" value="'+fdCuratorEscape(current===undefined?'':current)+'"'+(attributes||'')+'></label>';}
  function rowLabel(prefix,number,row,field){return prefix+' row '+number+', '+row.instanceId+', '+field;}
  if(category==='arrival')html+=select('choice:role','checkInRoleKey','Check-in role',value&&value.checkInRoleKey,false,'')+select('place','placeKey','Place',value&&value.placeKey,false,'')+select('link:arrival-map','linkKey','Optional arrival map',value&&value.linkKey,true,'No link')+'<label>Timing <select data-curator-field="timingCode"><option value="at"'+(value&&value.timingCode==='at'?' selected':'')+'>At</option><option value="by"'+(!value||value.timingCode==='by'?' selected':'')+'>By</option></select></label>'+time('time','Arrival time',value&&value.time)+'<button type="button" data-curator-local-action="arrival">Apply arrival</button>';
  else if(category==='accessItems')html+=select('choice:accessItem','itemKey','Access item','',false,'')+select('choice:duePoint','dueKey','Due point','',false,'')+select('link:access','linkKey','Optional official link','',true,'No link')+'<button type="button" data-curator-local-action="access">Add access item</button>';
  else if(category==='contacts')html+=select('choice:role','roleKey','Public role','',false,'')+select('link:directory','linkKey','Optional directory','',true,'No link')+'<button type="button" data-curator-local-action="contact">Add contact</button>';
  else if(category==='checklistItems')html+=select('choice:checklist','itemKey','Checklist action','',false,'')+select('priority','priority','Priority','recommended',false,'')+'<button type="button" data-curator-local-action="checklist">Add checklist action</button>';
  else if(category==='schedule'){
    html+=time('dayStart','Day starts',value&&value.dayStart)+time('dayEnd','Day ends',value&&value.dayEnd)+'<label>End qualifier <select data-curator-field="endQualifierCode"><option value="at"'+(value&&value.endQualifierCode==='at'?' selected':'')+'>At</option><option value="about"'+(value&&value.endQualifierCode==='about'?' selected':'')+'>About</option><option value="no-later-than"'+(value&&value.endQualifierCode==='no-later-than'?' selected':'')+'>No later than</option></select></label><button type="button" data-curator-local-action="schedule-bounds">Apply day bounds</button>';
    html+=select('choice:daySet','daySetKey','Days','',false,'')+time('startTime','Event starts','')+time('endTime','Optional end','')+select('choice:activity','activityKey','Activity','',false,'')+select('place','placeKey','Optional place','',true,'No place')+select('priority','priority','Priority','recommended',false,'')+'<button type="button" data-curator-local-action="schedule-event">Add schedule event</button>';
  }else if(category==='rounds')html+=select('choice:roundsPreparation','preparationKey','Preparation',value&&value.preparationKey,false,'')+select('choice:roundsParticipation','participationKey','Participation',value&&value.participationKey,false,'')+select('choice:roundsFollowUp','followUpKey','Follow-up',value&&value.followUpKey,false,'')+'<button type="button" data-curator-local-action="rounds">Apply rounds</button>';
  else if(category==='presentation')html+=select('choice:presentationFormat','formatKey','Format',value&&value.formatKey,false,'')+select('choice:presentationTiming','timingKey','Timing',value&&value.timingKey,false,'')+select('choice:presentationElement','elementKeys','Elements',value&&value.elementKeys||[],false,'',true)+'<button type="button" data-curator-local-action="presentation">Apply presentation</button>';
  else if(category==='documentation')html+=select('choice:documentationWorkflow','workflowKey','Workflow',value&&value.workflowKey,false,'')+select('choice:documentationTiming','timingKey','Timing',value&&value.timingKey,false,'')+select('link:documentation-policy','policyLinkKey','Optional policy',value&&value.policyLinkKey,true,'No policy')+'<button type="button" data-curator-local-action="documentation">Apply documentation</button>';
  else if(category==='attendance'){
    rows=plan.schedule&&plan.schedule.events||[];html+='<label>Schedule events <select data-curator-field="eventInstanceIds" multiple>';for(i=0;i<rows.length;i++)html+='<option value="'+fdCuratorEscape(rows[i].instanceId)+'"'+(value&&value.eventInstanceIds.indexOf(rows[i].instanceId)>=0?' selected':'')+'>'+fdCuratorEscape(rows[i].instanceId)+'</option>';html+='</select></label>'+select('choice:role','absenceRoleKey','Absence role',value&&value.absenceRoleKey,false,'')+select('link:attendance-policy','policyLinkKey','Optional attendance policy',value&&value.policyLinkKey,true,'No policy')+'<button type="button" data-curator-local-action="attendance">Apply attendance</button>';
  }else if(category==='feedback')html+=select('choice:feedbackCadence','cadenceKey','Cadence',value&&value.cadenceKey,false,'')+select('choice:feedbackInitiator','initiatorKey','Initiator',value&&value.initiatorKey,false,'')+select('choice:feedbackSetting','settingKey','Setting',value&&value.settingKey,false,'')+'<button type="button" data-curator-local-action="feedback">Apply feedback</button>';
  else if(category==='resources')html+=select('link:any','linkKey','Official resource','',false,'')+select('priority','priority','Priority','recommended',false,'')+'<label>Week <input type="number" min="1" max="'+(audience==='ms3'?6:4)+'" value="1" data-curator-field="week"></label>'+select('choice:reason','reasonKey','Optional reason','',true,'No reason')+'<button type="button" data-curator-local-action="resource">Add resource</button>';
  if(value)html+='<button type="button" data-curator-local-clear="'+category+'">Clear '+category+'</button>';
  rows=Array.isArray(value)?value:value&&value.events||[];
  for(i=0;i<rows.length;i++){
    var row=rows[i],number=i+1,action,prefix;
    if(category==='schedule'){
      action='SCHEDULE_EVENT_UPDATE';prefix='Schedule event';html+='<fieldset data-curator-row-editor="schedule" data-instance-id="'+fdCuratorEscape(row.instanceId)+'"><legend>'+fdCuratorEscape(prefix+' row '+number+', '+row.instanceId)+'</legend>';
      html+=rowSelect(action,row,'choice:daySet','daySetKey',rowLabel(prefix,number,row,'day set'),row.daySetKey,false,'')+rowInput(action,row,'time','startTime',rowLabel(prefix,number,row,'start time'),row.startTime)+rowInput(action,row,'time','endTime',rowLabel(prefix,number,row,'end time'),row.endTime||'')+rowSelect(action,row,'choice:activity','activityKey',rowLabel(prefix,number,row,'activity'),row.activityKey,false,'')+rowSelect(action,row,'place','placeKey',rowLabel(prefix,number,row,'place'),row.placeKey||'',true,'No place')+rowSelect(action,row,'priority','priority',rowLabel(prefix,number,row,'priority'),row.priority,false,'');
    }else if(category==='accessItems'){
      action='ACCESS_UPDATE';prefix='Access item';html+='<fieldset data-curator-row-editor="accessItems" data-instance-id="'+fdCuratorEscape(row.instanceId)+'"><legend>'+fdCuratorEscape(prefix+' row '+number+', '+row.instanceId)+'</legend>';
      html+=rowSelect(action,row,'choice:accessItem','itemKey',rowLabel(prefix,number,row,'access item'),row.itemKey,false,'')+rowSelect(action,row,'choice:duePoint','dueKey',rowLabel(prefix,number,row,'due point'),row.dueKey,false,'')+rowSelect(action,row,'link:access','linkKey',rowLabel(prefix,number,row,'official link'),row.linkKey||'',true,'No link');
    }else if(category==='contacts'){
      action='CONTACT_UPDATE';prefix='Contact';html+='<fieldset data-curator-row-editor="contacts" data-instance-id="'+fdCuratorEscape(row.instanceId)+'"><legend>'+fdCuratorEscape(prefix+' row '+number+', '+row.instanceId)+'</legend>';
      html+=rowSelect(action,row,'choice:role','roleKey',rowLabel(prefix,number,row,'public role'),row.roleKey,false,'')+rowSelect(action,row,'link:directory','linkKey',rowLabel(prefix,number,row,'directory'),row.linkKey||'',true,'No directory');
    }else if(category==='checklistItems'){
      action='CHECKLIST_UPDATE';prefix='Checklist action';html+='<fieldset data-curator-row-editor="checklistItems" data-instance-id="'+fdCuratorEscape(row.instanceId)+'"><legend>'+fdCuratorEscape(prefix+' row '+number+', '+row.instanceId)+'</legend>';
      html+=rowSelect(action,row,'choice:checklist','itemKey',rowLabel(prefix,number,row,'action'),row.itemKey,false,'')+rowSelect(action,row,'priority','priority',rowLabel(prefix,number,row,'priority'),row.priority,false,'');
    }else if(category==='resources'){
      action='RESOURCE_UPDATE';prefix='Resource';html+='<fieldset data-curator-row-editor="resources" data-instance-id="'+fdCuratorEscape(row.instanceId)+'"><legend>'+fdCuratorEscape(prefix+' row '+number+', '+row.instanceId)+'</legend>';
      html+=rowSelect(action,row,'link:any','linkKey',rowLabel(prefix,number,row,'official resource'),row.linkKey,false,'')+rowSelect(action,row,'priority','priority',rowLabel(prefix,number,row,'priority'),row.priority,false,'')+rowInput(action,row,'number','week',rowLabel(prefix,number,row,'week'),row.week,' min="1" max="'+(audience==='ms3'?6:4)+'"')+rowSelect(action,row,'choice:reason','reasonKey',rowLabel(prefix,number,row,'reason'),row.reasonKey||'',true,'No reason');
    }else continue;
    html+='<button type="button" data-curator-local-remove="'+category+'" data-instance-id="'+fdCuratorEscape(row.instanceId)+'" aria-label="Remove '+fdCuratorEscape(prefix.toLowerCase()+' row '+number+', '+row.instanceId)+'">Remove</button></fieldset>';
  }
  return html+'</div>';
}
function fdCuratorPreviewBody(model){
  var sections=[['First day at the location',fdCuratorStudentSentences(model,'arrival')],['Before you arrive',fdCuratorStudentSentences(model,'accessItems')],['Who to contact',fdCuratorStudentSentences(model,'contacts')],["Today's checklist",fdCuratorStudentSentences(model,'checklistItems')],['Typical day',fdCuratorStudentSentences(model,'schedule')],['Team workflow',fdCuratorStudentSentences(model,'rounds').concat(fdCuratorStudentSentences(model,'presentation'),fdCuratorStudentSentences(model,'documentation'))],['Attendance and feedback',fdCuratorStudentSentences(model,'attendance').concat(fdCuratorStudentSentences(model,'feedback'))],['Official resources',fdCuratorStudentSentences(model,'resources')]],i,j,rows,html='<h3>'+fdCuratorEscape(model.card.title)+'</h3>';
  for(i=0;i<sections.length;i++){html+='<section><h4>'+sections[i][0]+'</h4>';rows=sections[i][1];if(!rows.length)html+='<p>None selected.</p>';else for(j=0;j<rows.length;j++)html+='<p>'+fdCuratorEscape(rows[j])+'</p>';html+='</section>';}
  return html;
}
function fdCuratorPreviewMarkup(prepared,preset){
  var privatePreview=FD_CURATOR_PREVIEW_RESULTS.get(prepared),expected,mobile,body;
  if(!privatePreview||privatePreview.preset!==preset)return '<div class="fd-curator-preview-empty">Complete the required reviewed selections to render this preview.</div>';
  expected=privatePreview.expected;mobile=preset==='mobile-390';
  try{body=fdCuratorPreviewBody(privatePreview.displayModel);privatePreview.body=body;}
  catch(ignore){return '<div class="fd-curator-preview-empty">Complete the required reviewed selections to render this preview.</div>';}
  return '<div class="fd-curator-preview '+(mobile?'fd-curator-preview--mobile':'fd-curator-preview--desktop')+'" tabindex="-1" data-curator-preview-layout="'+preset+'" data-curator-content-digest="'+fdCuratorEscape(expected.contentDigest)+'" data-curator-reference-digest="'+fdCuratorEscape(expected.referenceSetDigest)+'" data-curator-fingerprint="'+fdCuratorEscape(privatePreview.fingerprint)+'" data-curator-core-revision="'+fdCuratorEscape(expected.currentCoreRevision)+'" data-curator-catalog-revision="'+fdCuratorEscape(expected.currentCatalogRevision)+'" data-curator-renderer-revision="'+fdCuratorEscape(expected.rendererRevision)+'" data-curator-render-status="complete">'+body+'</div>';
}
function fdCuratorLocalMarkup(state,catalogSnapshot,displayModel,previewEvidence){
  var model=fdCuratorTrustedDisplay(displayModel),plan=state.config.localPlan,coverage=fdCuratorLocalCoverage(plan),location=state.config.context.trainingLocationKey,audience=state.site.audience;
  var presets=fdCuratorCatalogOptions(catalogSnapshot,'localPreset',location,audience),categories=[['arrival','Arrival'],['accessItems','Access preparation'],['contacts','Who to contact'],['checklistItems','Checklist'],['schedule','Typical schedule'],['rounds','Rounds'],['presentation','Presentation'],['documentation','Documentation'],['attendance','Attendance'],['feedback','Feedback'],['resources','Official resources']];
  var questions=[['where','Where do I go?','arrival'],['when','When should I arrive?','arrival'],['prepare','What should I prepare?','accessItems'],['help','Who can help?','contacts'],['first','What do I do first?','checklistItems']],html='<section data-curator-step-panel="4" aria-labelledby="fd-curator-local-title"><h2 id="fd-curator-local-title">Structured local details</h2><p data-curator-local-status role="status" aria-live="polite" tabindex="-1"></p>';
  html+='<div class="fd-curator-coverage" role="status" aria-live="polite"><h3>First-day coverage</h3><ul>';for(var i=0;i<questions.length;i++)html+='<li class="'+(coverage[questions[i][0]]?'is-covered':'is-missing')+'"><span aria-hidden="true">'+(coverage[questions[i][0]]?'✓':'!')+'</span> <a href="#fd-curator-'+questions[i][2]+'" data-curator-focus="'+questions[i][2]+'">'+questions[i][1]+'</a> — '+(coverage[questions[i][0]]?'covered':'not yet covered')+'</li>';html+='</ul><p>Coverage is advisory and does not by itself block a valid edition.</p></div>';
  html+='<label>Apply a reviewed local preset <select data-curator-local-preset>'+fdCuratorOptionsMarkup(presets,'',true,'Choose a reviewed preset')+'</select></label>';
  html+='<section class="fd-curator-local-group"><h2>First-day essentials</h2>';for(i=0;i<4;i++)html+='<article id="fd-curator-'+categories[i][0]+'" class="fd-curator-local-card" tabindex="-1"><h3>'+categories[i][1]+'</h3>'+fdCuratorLocalControls(state,catalogSnapshot,categories[i][0])+fdCuratorStudentsSee(model,categories[i][0])+'<p class="fd-curator-reviewed-only">Choose only from repository-reviewed options.</p></article>';html+='</section>';
  html+='<section class="fd-curator-local-group"><h2>How this rotation works</h2>';for(i=4;i<categories.length;i++)html+='<article id="fd-curator-'+categories[i][0]+'" class="fd-curator-local-card" tabindex="-1"><h3>'+categories[i][1]+'</h3>'+fdCuratorLocalControls(state,catalogSnapshot,categories[i][0])+fdCuratorStudentsSee(model,categories[i][0])+'<p class="fd-curator-reviewed-only">Choose only from repository-reviewed options.</p></article>';html+='</section>';
  html+='<section class="fd-curator-review-evidence" data-curator-review-evidence><h2>Canonical previews</h2><p>Fingerprint: <code>'+(model?fdCuratorEscape(model.card.fingerprint):'pending')+'</code></p><p>Candidate digest: <code>'+(state.previewReceipts.desktop?fdCuratorEscape(state.previewReceipts.desktop.contentDigest):state.previewReceipts.mobile?fdCuratorEscape(state.previewReceipts.mobile.contentDigest):'pending')+'</code></p><div class="fd-curator-preview-actions"><button type="button" data-curator-review-preview="desktop">Review desktop preview</button><span data-curator-preview-status="desktop" role="status" aria-live="polite">'+(state.previewReceipts.desktop?'Reviewed':'Not reviewed')+'</span><button type="button" data-curator-review-preview="mobile-390">Review 390 px mobile preview</button><span data-curator-preview-status="mobile" role="status" aria-live="polite">'+(state.previewReceipts.mobile?'Reviewed':'Not reviewed')+'</span></div>'+fdCuratorPreviewMarkup(previewEvidence&&previewEvidence.desktop,'desktop')+fdCuratorPreviewMarkup(previewEvidence&&previewEvidence.mobile,'mobile-390')+'</section>';
  return html+'</section>';
}

function fdCuratorStepOneMarkup(state,catalogSnapshot,generationDate){
  var location=state.config.context.trainingLocationKey,locations=fdCuratorCatalogOptions(catalogSnapshot,'trainingLocation','',state.site.audience);
  var profiles=location?fdCuratorCatalogOptions(catalogSnapshot,'curatorProfile',location,state.site.audience):[];
  var phrases=location?fdCuratorCatalogOptions(catalogSnapshot,'phraseSet',location,state.site.audience):[];
  var html='<section class="fd-curator-v2" data-curator-step-panel="1"><h2>Step 1 — Reviewed edition context</h2>';
  if(!locations.length)html+='<div class="fd-curator-onboarding" role="status"><strong>No reviewed catalog records are available.</strong> You can inspect this empty draft while publication remains disabled.</div>';
  html+='<label for="curatorTrainingLocation">Training location</label><select id="curatorTrainingLocation" data-curator-location>'+fdCuratorOptionsMarkup(locations,location,true,'Choose a reviewed location')+'</select>';
  if(location&&!profiles.length)html+='<div class="fd-curator-onboarding" role="status"><strong>No reviewed curator profile is available.</strong> A reviewed catalog proposal is required before this edition can be completed.</div>';
  else html+='<label for="curatorProfile">Curator profile</label><select id="curatorProfile" data-curator-profile>'+fdCuratorOptionsMarkup(profiles,state.config.context.curatorProfileKey,true,'Choose a reviewed profile')+'</select>';
  html+='<label for="curatorPhraseSet">Reviewed wording</label><select id="curatorPhraseSet" data-curator-phrases>'+fdCuratorOptionsMarkup(phrases,state.config.phraseSetKey,true,'Choose reviewed wording')+'</select>';
  html+='<label for="curatorRotationStart">Rotation start</label><input id="curatorRotationStart" type="date" data-curator-date="SET_ROTATION_START" value="'+fdCuratorEscape(state.config.context.rotationStart)+'">';
  html+='<label for="curatorRotationEnd">Rotation end</label><input id="curatorRotationEnd" type="date" data-curator-date="SET_ROTATION_END" value="'+fdCuratorEscape(state.config.context.rotationEnd)+'">';
  html+='<label for="curatorEditionCheckedOn">Edition checked on</label><input id="curatorEditionCheckedOn" type="date" data-curator-date="SET_EDITION_CHECKED_ON" max="'+fdCuratorEscape(generationDate||'')+'" value="'+fdCuratorEscape(state.config.context.editionCheckedOn)+'">';
  html+='<section class="import-panel" aria-labelledby="curatorImportTitle"><strong id="curatorImportTitle">Continue from a JSON backup</strong><p>Validated v2 backups are restored exactly. A v1 backup may be safely salvaged after its discarded local prose is removed.</p><label class="file-label" for="curatorImportFile">Choose JSON backup</label><input id="curatorImportFile" type="file" accept="application/json,.json" class="visually-hidden" data-curator-import><p data-curator-import-status role="status" aria-live="polite"></p></section>';
  html+='<div class="draft-actions"><button type="button" id="curatorSaveDraft" class="secondary-action" data-curator-save>Save draft on this device</button><p data-curator-save-status role="status" aria-live="polite">Not yet saved on this device.</p></div></section>';return html;
}

function fdCuratorStateSiteContext(state){
  var site=state&&state.site;
  return site?{audience:site.audience,pathId:site.pathId,coreRevision:site.coreRevision,
    localCatalogRevision:site.localCatalogRevision,rotationEditionV2:site.rotationEditionV2}:null;
}

function fdCuratorPlacementMeta(state,index){
  var inspected=fdCuratorIndexSnapshot(index,fdCuratorStateSiteContext(state)),positions=Object.create(null),occurrence=Object.create(null),totals=Object.create(null),items=state.config.pathItems.slice().sort(function(a,b){return a.week-b.week||a.order-b.order;}),i,row,title;
  for(i=0;i<items.length;i++)totals[items[i].week]=(totals[items[i].week]||0)+1;
  for(i=0;i<items.length;i++){
    row=items[i];occurrence[row.ref]=(occurrence[row.ref]||0)+1;title=inspected.ok&&inspected.byRef[row.ref]?inspected.byRef[row.ref].title:row.ref;
    positions[row.instanceId]={title:title,occurrence:occurrence[row.ref],position:row.order,total:totals[row.week],week:row.week};
  }
  return positions;
}
function fdCuratorPlacementName(meta,action){return action+' '+meta.title+', occurrence '+meta.occurrence+', position '+meta.position+' of '+meta.total+' in Week '+meta.week;}

function fdCuratorCurriculumMarkup(state,index,catalogSnapshot,query){
  var inspected=fdCuratorIndexSnapshot(index,fdCuratorStateSiteContext(state)),meta=fdCuratorPlacementMeta(state,index),reasons=fdCuratorCatalogOptions(catalogSnapshot,'reason',state.config.context.trainingLocationKey,state.site.audience),html='<section class="fd-curator-v2" data-curator-step-panel="2"><h2>Step 2 — Curriculum</h2>',i,j,row,match;
  if(!inspected.ok)return '<p>Curriculum unavailable.</p>';query=String(query||'').toLowerCase();
  html+='<label for="curatorLibrarySearch">Search this audience curriculum</label><input id="curatorLibrarySearch" type="search" data-curator-search value="'+fdCuratorEscape(query)+'" autocomplete="off">';
  for(i=0;i<inspected.library.length;i++){
    row=inspected.library[i];if(query&&row.title.toLowerCase().indexOf(query)<0&&row.ref.toLowerCase().indexOf(query)<0)continue;
    match=state.config.pathItems.filter(function(item){return item.ref===row.ref;});
    html+='<article class="fd-curator-library-item"><h3>'+fdCuratorEscape(row.title)+'</h3><code>'+fdCuratorEscape(row.ref)+'</code>';
    html+='<label>Placement week <select data-curator-library-week aria-label="Choose week for '+fdCuratorEscape(row.title)+', occurrence '+(match.length+1)+', position 1 of 1 in Week 1">';
    for(var week=1;week<=inspected.site.weekCount;week++)html+='<option value="'+week+'">Week '+week+'</option>';html+='</select></label>';
    if(!match.length)html+='<button type="button" data-curator-path-include="'+fdCuratorEscape(row.ref)+'" aria-label="Include '+fdCuratorEscape(row.title)+', occurrence 1, position 1 of 1 in Week 1">Include</button>';
    html+='<button type="button" data-curator-path-repeat="'+fdCuratorEscape(row.ref)+'" aria-label="Repeat '+fdCuratorEscape(row.title)+', occurrence '+(match.length+1)+', position 1 of 1 in Week 1">Repeat</button>';
    for(j=0;j<match.length;j++){
      var placed=match[j],label=meta[placed.instanceId],prefix=fdCuratorEscape(placed.instanceId);
      html+='<div class="fd-curator-placement"><label>Priority <select data-curator-path-priority="'+prefix+'" aria-label="'+fdCuratorEscape(fdCuratorPlacementName(label,'Set priority for'))+'">'+fdCuratorOptionsMarkup(FD_CURATOR_PRIORITIES.map(function(value){return {key:value,label:value};}),placed.priority,false,'')+'</select></label>';
      html+='<label>Reviewed reason <select data-curator-path-reason="'+prefix+'" aria-label="'+fdCuratorEscape(fdCuratorPlacementName(label,placed.reasonKey?'Clear or set reason for':'Choose reason for'))+'">'+fdCuratorOptionsMarkup(reasons,placed.reasonKey||'',true,'No reviewed reason')+'</select></label>';
      html+='<button type="button" data-curator-path-remove="'+prefix+'" aria-label="'+fdCuratorEscape(fdCuratorPlacementName(label,'Remove from curriculum'))+'">Omit</button></div>';
    }
    html+='</article>';
  }
  return html+'</section>';
}

function fdCuratorScheduleMarkup(state,index){
  var inspected=fdCuratorIndexSnapshot(index,fdCuratorStateSiteContext(state)),meta=fdCuratorPlacementMeta(state,index),html='<section class="fd-curator-v2" data-curator-step-panel="3"><h2>Step 3 — Schedule</h2>',week,i,j,rows,row,label,prefix;
  if(!inspected.ok)return '<p>Schedule unavailable.</p>';
  for(week=1;week<=inspected.site.weekCount;week++){
    rows=state.config.pathItems.filter(function(item){return item.week===week;}).sort(function(a,b){return a.order-b.order;});html+='<section class="fd-curator-week"><h3>Week '+week+'</h3>';
    for(i=0;i<rows.length;i++){
      row=rows[i];label=meta[row.instanceId];prefix=fdCuratorEscape(row.instanceId);html+='<div class="fd-curator-schedule-row"><span>'+fdCuratorEscape(label.title)+'</span>';
      html+='<button type="button" data-curator-path-move-order="'+prefix+'" data-direction="up" aria-label="'+fdCuratorEscape(fdCuratorPlacementName(label,'Move up'))+'"'+(i===0?' disabled':'')+'>↑</button>';
      html+='<button type="button" data-curator-path-move-order="'+prefix+'" data-direction="down" aria-label="'+fdCuratorEscape(fdCuratorPlacementName(label,'Move down'))+'"'+(i===rows.length-1?' disabled':'')+'>↓</button>';
      html+='<label><span class="visually-hidden">'+fdCuratorEscape(fdCuratorPlacementName(label,'Move to week'))+'</span><select data-curator-path-move-week="'+prefix+'" aria-label="'+fdCuratorEscape(fdCuratorPlacementName(label,'Move to week'))+'">';
      for(j=1;j<=inspected.site.weekCount;j++)html+='<option value="'+j+'"'+(j===week?' selected':'')+'>Week '+j+'</option>';html+='</select></label>';
      html+='<button type="button" data-curator-path-remove="'+prefix+'" aria-label="'+fdCuratorEscape(fdCuratorPlacementName(label,'Remove from schedule'))+'">Remove</button></div>';
    }
    html+='</section>';
  }
  return html+'</section>';
}

function fdCuratorCandidateFailure(code){return {ok:false,config:null,envelopePreimage:null,contentDigest:'',referenceSetDigest:'',fingerprint:'',displayModel:null,errors:[{code:code||'CURATOR_INVALID',path:'/',message:'The structured rotation edition is incomplete or invalid.'}]};}
function fdCuratorCandidateDraftSignature(state,publicationSnapshot){
  var publication=arguments.length>=2?publicationSnapshot:fdCuratorStatePublicationSnapshot(state);
  if(!publication)return '';
  try{return fdEditionCanonicalJson({site:state.site,config:state.config,baseEnvelope:publication.baseEnvelope});}catch(ignore){return '';}
}
function fdCuratorAuthenticateBase(state,index,catalogSnapshot,siteContext,validationContext,subtle,publicationSnapshot){
  var publication=arguments.length>=7?publicationSnapshot:fdCuratorStatePublicationSnapshot(state),contractSite=fdCuratorContractSiteContext(siteContext),trustedClaim=state&&FD_CURATOR_TRUSTED_BASES.get(state),trusted;
  if(!publication||typeof publication.baseSemanticConfig!=='string'||!contractSite)return Promise.resolve({ok:false,code:trustedClaim?'CURATOR_BASE_REIMPORT_REQUIRED':undefined});
  trusted=fdCuratorTrustedBaseRecord(state,publication);
  if(trustedClaim&&!trusted)return Promise.resolve({ok:false,code:'CURATOR_BASE_REIMPORT_REQUIRED'});
  if(publication.baseEnvelope===null)return Promise.resolve(publication.baseSemanticConfig===''?{ok:true,config:null,envelope:null}:{ok:false});
  if(!trusted)return Promise.resolve({ok:false,code:'CURATOR_BASE_REIMPORT_REQUIRED'});
  try{return Promise.resolve({ok:true,config:fdCuratorClone(trusted.config),envelope:fdCuratorClone(trusted.envelope)});}
  catch(ignoreTrusted){return Promise.resolve({ok:false,code:'CURATOR_BASE_REIMPORT_REQUIRED'});}
}
function fdCuratorCandidateConfig(state,index,catalogSnapshot,siteContext,validationContext,subtle){
  var contractSite=fdCuratorContractSiteContext(siteContext),publication=fdCuratorStatePublicationSnapshot(state),validation=fdCuratorExactData(validationContext,['mode','generationDate'],[]);
  if(!contractSite||!validation||validation.mode!=='builder'||!fdCuratorRealDate(validation.generationDate))return Promise.resolve(fdCuratorCandidateFailure('CURATOR_INCOMPLETE'));
  if(!publication)return Promise.resolve(fdCuratorCandidateFailure(state&&FD_CURATOR_TRUSTED_BASES.get(state)?'CURATOR_BASE_REIMPORT_REQUIRED':'CURATOR_INCOMPLETE'));
  return fdCuratorAuthenticateBase(state,index,catalogSnapshot,siteContext,validationContext,subtle,publication).then(function(authenticated){
    var context=state&&state.config&&state.config.context,tentative,baseConfig=authenticated&&authenticated.ok?authenticated.config:null,config,summary,edition;
    if(!authenticated||!authenticated.ok)return fdCuratorCandidateFailure(authenticated&&authenticated.code||'CURATOR_BASE_INVALID');
    if(!fdCuratorStateValid(state,index,siteContext,publication)||!context.trainingLocationKey||!context.curatorProfileKey||!state.config.phraseSetKey||!fdCuratorRealDate(context.rotationStart)||!fdCuratorRealDate(context.rotationEnd)||!fdCuratorRealDate(context.editionCheckedOn)||context.editionCheckedOn>validationContext.generationDate)return fdCuratorCandidateFailure('CURATOR_INCOMPLETE');
    tentative={audience:state.site.audience,pathId:state.site.pathId,editionNumber:1,createdAgainstCoreRevision:contractSite.coreRevision,createdAgainstLocalCatalogRevision:contractSite.localCatalogRevision,context:fdCuratorClone(context),phraseSetKey:state.config.phraseSetKey,pathItems:fdCuratorClone(state.config.pathItems),localPlan:fdCuratorClone(state.config.localPlan),changeSummary:{kindCodes:['initial'],changedItemCount:0}};
    if(baseConfig&&fdEditionSemanticConfig(baseConfig)===fdEditionSemanticConfig(tentative))config=baseConfig;
    else if(baseConfig){edition=baseConfig.editionNumber;if(!Number.isInteger(edition)||edition<1||edition>=2147483647)return fdCuratorCandidateFailure('CURATOR_EDITION_LIMIT');summary=fdEditionGenerateChangeSummary(baseConfig,tentative);if(!summary||!summary.kindCodes.length)return fdCuratorCandidateFailure('CURATOR_INVALID');tentative.editionNumber=edition+1;tentative.changeSummary=summary;config=tentative;}
    else config=tentative;
    return fdEditionCreateEnvelope(config,index,catalogSnapshot,contractSite,validationContext,subtle).then(function(made){
      var trusted,pre,display,result;if(!made||made.ok!==true||(trusted=fdEditionTrustedSnapshot(made))===null)return fdCuratorCandidateFailure('CURATOR_INVALID');
      try{pre={format:'cw-rotation-edition',schemaVersion:2,config:fdCuratorClone(trusted.config)};display=fdCuratorClone(trusted.displayModel);result={ok:true,config:fdCuratorClone(trusted.config),envelopePreimage:pre,contentDigest:made.contentDigest,referenceSetDigest:trusted.referenceSetDigest,fingerprint:trusted.fingerprint,displayModel:display,errors:[]};FD_CURATOR_CANDIDATE_RESULTS.set(result,{trusted:made,draftSignature:fdCuratorCandidateDraftSignature(state,publication),publicationObject:publication.object,baseObject:publication.baseEnvelope,site:{coreRevision:contractSite.coreRevision,catalogRevision:contractSite.localCatalogRevision}});FD_CURATOR_DISPLAY_RESULTS.set(display,fdEditionCanonicalJson(display));return result;}
      catch(ignoreResult){return fdCuratorCandidateFailure('CURATOR_INVALID');}
    },function(){return fdCuratorCandidateFailure('CURATOR_INVALID');});
  });
}

function fdCuratorReceiptExpected(privateCandidate){
  var trusted=fdEditionTrustedSnapshot(privateCandidate.trusted);if(!trusted)return null;
  return {contentDigest:privateCandidate.trusted.contentDigest,referenceSetDigest:trusted.referenceSetDigest,currentCoreRevision:privateCandidate.site.coreRevision,currentCatalogRevision:privateCandidate.site.catalogRevision,rendererRevision:FD_CURATOR_RENDERER_REVISION};
}
function fdCuratorReceiptMatches(receipt,expected,preset){
  var value=fdCuratorExactData(receipt,['contentDigest','referenceSetDigest','currentCoreRevision','currentCatalogRevision','rendererRevision','previewPreset'],[]);
  return Boolean(value&&expected&&value.contentDigest===expected.contentDigest&&value.referenceSetDigest===expected.referenceSetDigest&&value.currentCoreRevision===expected.currentCoreRevision&&value.currentCatalogRevision===expected.currentCatalogRevision&&value.rendererRevision===expected.rendererRevision&&value.previewPreset===preset);
}
function fdCuratorPreparePreview(state,index,catalogSnapshot,siteContext,validationContext,subtle,preset,sequence){
  if(['desktop','mobile-390'].indexOf(preset)<0||!Number.isInteger(sequence))return Promise.resolve({ok:false,code:'CURATOR_PREVIEW_INVALID'});
  return fdCuratorCandidateConfig(state,index,catalogSnapshot,siteContext,validationContext,subtle).then(function(candidate){
    var privateCandidate,projected,expected,receipt,result,display,privateDisplay;if(!candidate.ok)return {ok:false,code:candidate.errors&&candidate.errors[0]&&candidate.errors[0].code==='CURATOR_BASE_REIMPORT_REQUIRED'?'CURATOR_BASE_REIMPORT_REQUIRED':'CURATOR_PREVIEW_INVALID'};
    if((privateCandidate=FD_CURATOR_CANDIDATE_RESULTS.get(candidate))===undefined)return {ok:false,code:'CURATOR_PREVIEW_INVALID'};
    projected=fdProjectEdition(index,privateCandidate.trusted);if(!projected||projected.ok!==true)return {ok:false,code:'CURATOR_PREVIEW_INVALID'};
    expected=fdCuratorReceiptExpected(privateCandidate);if(!expected)return {ok:false,code:'CURATOR_PREVIEW_INVALID'};receipt={contentDigest:expected.contentDigest,referenceSetDigest:expected.referenceSetDigest,currentCoreRevision:expected.currentCoreRevision,currentCatalogRevision:expected.currentCatalogRevision,rendererRevision:expected.rendererRevision,previewPreset:preset};
    display=fdCuratorClone(candidate.displayModel);privateDisplay=fdCuratorClone(candidate.displayModel);result={ok:true,code:'CURATOR_PREVIEW_OK',preset:preset,displayModel:display,contentDigest:candidate.contentDigest,fingerprint:candidate.fingerprint};FD_CURATOR_DISPLAY_RESULTS.set(display,fdEditionCanonicalJson(display));FD_CURATOR_PREVIEW_RESULTS.set(result,{sequence:sequence,preset:preset,receipt:receipt,expected:expected,draftSignature:privateCandidate.draftSignature,publicationObject:privateCandidate.publicationObject,baseObject:privateCandidate.baseObject,displayModel:privateDisplay,fingerprint:candidate.fingerprint,body:null});return result;
  });
}
function fdCuratorCompletePreview(prepared,root,preset,sequence,transactions){
  var privatePreview=FD_CURATOR_PREVIEW_RESULTS.get(prepared),expected,node,again,nodes,headings,i,result;
  var order=['First day at the location','Before you arrive','Who to contact',"Today's checklist",'Typical day','Team workflow','Attendance and feedback','Official resources'];
  function failure(){return {ok:false,code:'CURATOR_PREVIEW_RENDER_INVALID'};}
  if(!privatePreview||privatePreview.preset!==preset||privatePreview.sequence!==sequence||!transactions||typeof transactions.currentPreview!=='function'||transactions.currentPreview()!==sequence||!root)return failure();
  expected=privatePreview.expected;if(!expected||typeof privatePreview.body!=='string')return failure();
  try{
    if(typeof root.querySelector!=='function'||typeof root.querySelectorAll!=='function'||typeof root.contains!=='function')return failure();
    nodes=root.querySelectorAll('[data-curator-preview-layout="'+preset+'"]');if(!nodes||nodes.length!==1)return failure();node=nodes[0];
    if(root.querySelector('[data-curator-preview-layout="'+preset+'"]')!==node)return failure();
    if(!node||node.isConnected!==true||root.contains(node)!==true||typeof node.getAttribute!=='function'||typeof node.querySelectorAll!=='function')return failure();
    if(node.getAttribute('data-curator-preview-layout')!==preset||node.getAttribute('data-curator-content-digest')!==expected.contentDigest||node.getAttribute('data-curator-reference-digest')!==expected.referenceSetDigest||node.getAttribute('data-curator-fingerprint')!==privatePreview.fingerprint||node.getAttribute('data-curator-core-revision')!==expected.currentCoreRevision||node.getAttribute('data-curator-catalog-revision')!==expected.currentCatalogRevision||node.getAttribute('data-curator-renderer-revision')!==expected.rendererRevision||node.getAttribute('data-curator-render-status')!=='complete'||node.innerHTML!==privatePreview.body)return failure();
    headings=node.querySelectorAll('h4');if(!headings||headings.length!==order.length)return failure();
    for(i=0;i<order.length;i++)if(headings[i].textContent!==order[i])return failure();
    again=root.querySelector('[data-curator-preview-layout="'+preset+'"]');nodes=root.querySelectorAll('[data-curator-preview-layout="'+preset+'"]');if(again!==node||!nodes||nodes.length!==1||nodes[0]!==node||node.isConnected!==true||root.contains(node)!==true||transactions.currentPreview()!==sequence)return failure();
  }catch(ignoreRender){return failure();}
  result={ok:true,code:'CURATOR_PREVIEW_RENDER_OK'};FD_CURATOR_PREVIEW_COMPLETIONS.set(result,{sequence:sequence,preset:preset,receipt:privatePreview.receipt,expected:expected,draftSignature:privatePreview.draftSignature,publicationObject:privatePreview.publicationObject,baseObject:privatePreview.baseObject});return result;
}
function fdCuratorPrepareGenerationResult(candidate,sequence){
  var privateCandidate=FD_CURATOR_CANDIDATE_RESULTS.get(candidate),result;if(!privateCandidate||!Number.isInteger(sequence))return {ok:false,code:'CURATOR_GENERATION_INVALID'};
  result={ok:true,code:'CURATOR_GENERATION_READY'};FD_CURATOR_GENERATION_RESULTS.set(result,{sequence:sequence,draftSignature:privateCandidate.draftSignature,publicationObject:privateCandidate.publicationObject,baseObject:privateCandidate.baseObject,lastGenerated:{contentDigest:candidate.contentDigest,referenceSetDigest:candidate.referenceSetDigest,fingerprint:candidate.fingerprint}});return result;
}
function fdCuratorProjectDraft(state,index,catalogSnapshot,siteContext,validationContext,subtle){
  return fdCuratorCandidateConfig(state,index,catalogSnapshot,siteContext,validationContext,subtle).then(function(candidate){var privateCandidate,projected;if(!candidate.ok||(privateCandidate=FD_CURATOR_CANDIDATE_RESULTS.get(candidate))===undefined)return {ok:false,code:candidate.errors[0].code};projected=fdProjectEdition(index,privateCandidate.trusted);return projected&&projected.ok?{ok:true,code:'CURATOR_PREVIEW_OK',index:projected.index}:{ok:false,code:'CURATOR_INVALID'};});
}

function fdCuratorObserveCurrentSite(state,index,siteContext){
  var current=fdCuratorSiteValue(siteContext),publication=fdCuratorStatePublicationSnapshot(state),storedContext,cloned,copy;if(!current||!state||!publication||!fdCuratorObject(state.site))return null;
  storedContext={audience:state.site.audience,pathId:state.site.pathId,coreRevision:state.site.coreRevision,localCatalogRevision:state.site.localCatalogRevision,rotationEditionV2:state.site.rotationEditionV2};
  if(!fdCuratorStateValid(state,index,storedContext,publication))return null;
  if(state.site.audience!==current.audience||state.site.pathId!==current.pathId||state.site.rotationEditionV2!==current.rotationEditionV2)return null;
  if(state.site.coreRevision===current.coreRevision&&state.site.localCatalogRevision===current.localCatalogRevision&&state.site.rendererRevision===FD_CURATOR_RENDERER_REVISION)return state;
  cloned=fdCuratorTryCloneState(state,publication);if(!cloned.ok)return null;copy=cloned.value;copy.site.coreRevision=current.coreRevision;copy.site.localCatalogRevision=current.localCatalogRevision;copy.site.rendererRevision=FD_CURATOR_RENDERER_REVISION;copy.previewReceipts={desktop:null,mobile:null};copy.affirmations.previewsReviewed=false;copy.publication.lastGenerated=null;return copy;
}

function fdCuratorRestoreDraft(text,index,siteContext,catalogSnapshot,validationContext,subtle){
  var bytes,value,observed,publication;
  function failure(){return {ok:false,code:'CURATOR_DRAFT_INVALID'};}
  if(typeof text!=='string')return Promise.resolve(failure());
  try{bytes=new TextEncoder().encode(text).length;if(bytes>FD_CURATOR_IMPORT_MAX_BYTES)return Promise.resolve(failure());value=JSON.parse(text);observed=fdCuratorObserveCurrentSite(value,index,siteContext);if(!observed)return Promise.resolve(failure());observed=fdCuratorClone(observed);publication=fdCuratorStatePublicationSnapshot(observed);if(!publication)return Promise.resolve(failure());}
  catch(ignoreStored){return Promise.resolve(failure());}
  if(publication.baseEnvelope!==null){
    observed.publication.lastGenerated=null;observed.previewReceipts={desktop:null,mobile:null};observed.affirmations.previewsReviewed=false;
    return Promise.resolve({ok:true,code:'CURATOR_BASE_REIMPORT_REQUIRED',state:observed});
  }
  return fdCuratorAuthenticateBase(observed,index,catalogSnapshot,siteContext,validationContext,subtle,publication).then(function(authenticated){
    if(!authenticated||!authenticated.ok)return failure();
    if(authenticated.config){observed.publication.baseEnvelope=authenticated.envelope;observed.publication.baseSemanticConfig=fdEditionSemanticConfig(authenticated.config);}
    else{observed.publication.baseEnvelope=null;observed.publication.baseSemanticConfig='';}
    observed.publication.lastGenerated=null;
    return fdCuratorCandidateConfig(observed,index,catalogSnapshot,siteContext,validationContext,subtle).then(function(candidate){
      var privateCandidate=FD_CURATOR_CANDIDATE_RESULTS.get(candidate),expected=privateCandidate&&fdCuratorReceiptExpected(privateCandidate),desktop=null,mobile=null;
      if(candidate&&candidate.ok&&expected){
        if(fdCuratorReceiptMatches(observed.previewReceipts.desktop,expected,'desktop'))desktop=fdCuratorClone(observed.previewReceipts.desktop);
        if(fdCuratorReceiptMatches(observed.previewReceipts.mobile,expected,'mobile-390'))mobile=fdCuratorClone(observed.previewReceipts.mobile);
      }
      observed.previewReceipts={desktop:desktop,mobile:mobile};observed.affirmations.previewsReviewed=Boolean(desktop&&mobile);
      return {ok:true,code:'CURATOR_DRAFT_READY',state:observed};
    });
  },function(){return failure();});
}

function fdCuratorCatalogUnavailable(root){
  try{root.innerHTML='<section class="fd-curator-unavailable" role="alert"><h2>Rotation edition catalog unavailable</h2><p>The reviewed catalog could not be prepared. No draft was read or changed.</p></section>';return {ok:false,code:'CURATOR_CATALOG_UNAVAILABLE'};}
  catch(ignore){return {ok:false,code:'CURATOR_CATALOG_UNAVAILABLE'};}
}

function fdCuratorDraftStorage(storage,key){
  function method(name){var cursor=storage,descriptor,depth=0;while(cursor&&depth<8){try{descriptor=Object.getOwnPropertyDescriptor(cursor,name);}catch(ignore){return null;}if(descriptor)return FD_CURATOR_OWN.call(descriptor,'value')&&typeof descriptor.value==='function'?descriptor.value:null;try{cursor=Object.getPrototypeOf(cursor);}catch(ignorePrototype){return null;}depth+=1;}return null;}
  var get=method('getItem'),set=method('setItem');
  return {load:function(index,siteContext,catalogSnapshot,validationContext,subtle){var text;if(!get)return Promise.resolve({ok:true,code:'CURATOR_DRAFT_EMPTY',state:null});try{text=get.call(storage,key);if(text===null)return Promise.resolve({ok:true,code:'CURATOR_DRAFT_EMPTY',state:null});return fdCuratorRestoreDraft(text,index,siteContext,catalogSnapshot,validationContext,subtle);}catch(ignore){return Promise.resolve({ok:false,code:'CURATOR_DRAFT_INVALID'});}},save:function(state,index,siteContext){if(!set||!fdCuratorStateValid(state,index,siteContext))return false;try{set.call(storage,key,fdEditionCanonicalJson(state));return true;}catch(ignore){return false;}}};
}

function fdCuratorMount(root,canonicalIndex,siteContext,catalogSnapshot,generationDate,dependencies){
  var keys,storage,adapter,state,site,transactions=fdCuratorImportTransactions(),deps=dependencies||{},editor,searchQuery='',displayModel=null,previewEvidence={desktop:null,mobile:null},renderSequence=0;
  if(!root||typeof fdEditionCatalogSiteSnapshot!=='function'||(site=fdEditionCatalogSiteSnapshot(catalogSnapshot,siteContext))===null)return Promise.resolve(fdCuratorCatalogUnavailable(root));
  siteContext=site;
  keys=fdEditionStorageKeys(site.audience);if(!keys)return Promise.resolve(fdCuratorCatalogUnavailable(root));
  try{storage=deps.storage||localStorage;}catch(ignoreStorage){storage=null;}
  adapter=fdCuratorDraftStorage(storage,keys.curator);
  return adapter.load(canonicalIndex,siteContext,catalogSnapshot,{mode:'builder',generationDate:generationDate},(function(){try{return deps.subtle||crypto.subtle;}catch(ignore){return deps.subtle||null;}}())).then(function(loaded){
  var loadInvalid=loaded&&loaded.ok===false,loadReimport=loaded&&loaded.code==='CURATOR_BASE_REIMPORT_REQUIRED';state=loaded&&loaded.ok&&loaded.state?loaded.state:fdCuratorNewDraft(canonicalIndex,siteContext);
  function mountNode(){try{return typeof root.querySelector==='function'&&root.querySelector('#curatorEditorMount')||root;}catch(ignore){return root;}}
  function subtleValue(){try{return deps.subtle||crypto.subtle;}catch(ignore){return deps.subtle||null;}}
  function refreshModel(){
    var sequence=++renderSequence,signature=fdCuratorCandidateDraftSignature(state),validation={mode:'builder',generationDate:generationDate};
    fdCuratorCandidateConfig(state,canonicalIndex,catalogSnapshot,siteContext,validation,subtleValue()).then(function(candidate){if(sequence!==renderSequence||signature!==fdCuratorCandidateDraftSignature(state))return;displayModel=candidate.ok?candidate.displayModel:null;if(state.step===4)render(true);});
  }
  function render(skipRefresh){
    var buttons,i;editor=mountNode();if(!editor)return false;
    if(state.step===1)editor.innerHTML=fdCuratorStepOneMarkup(state,catalogSnapshot,generationDate);
    else if(state.step===2)editor.innerHTML=fdCuratorCurriculumMarkup(state,canonicalIndex,catalogSnapshot,searchQuery);
    else if(state.step===3)editor.innerHTML=fdCuratorScheduleMarkup(state,canonicalIndex);
    else if(state.step===4)editor.innerHTML=fdCuratorLocalMarkup(state,catalogSnapshot,displayModel,previewEvidence);
    else editor.innerHTML='<section class="fd-curator-placeholder"><h2>Step '+state.step+'</h2><p>This structured step is completed in the next atomic checkpoint.</p></section>';
    try{
      buttons=root.querySelectorAll('[data-curator-step]');
      for(i=0;i<buttons.length;i++)if(Number(buttons[i].getAttribute('data-curator-step'))===state.step)buttons[i].setAttribute('aria-current','step');else buttons[i].removeAttribute('aria-current');
      var status=root.querySelector('#curatorStepStatus');if(status)status.textContent='Step '+state.step+' of 5';
    }catch(ignoreNavigation){}
    if(state.step===4&&!skipRefresh)refreshModel();return true;
  }
  function dispatch(action){
    var data=fdCuratorActionData(action),result;
    if(data&&(data.type==='SET_STEP'||data.type==='IMPORT_SUCCEEDED'||data.type==='IMPORT_REJECTED'))transactions.cancelPreview();
    result=fdCuratorApplyAction(state,action,canonicalIndex,siteContext,catalogSnapshot,generationDate,transactions);state=result.state;if(result.changed){if(data&&data.type!=='SET_STEP'&&data.type!=='PREVIEW_REVIEW_SUCCEEDED')previewEvidence={desktop:null,mobile:null};render();}return result;
  }
  render();
  function targetAttribute(target,name){try{return target&&typeof target.getAttribute==='function'?target.getAttribute(name):null;}catch(ignore){return null;}}
  function actionTarget(target,selector){try{return target&&typeof target.closest==='function'?target.closest(selector):target;}catch(ignore){return target;}}
  function targetWeek(target){
    var article,select,value;
    try{article=target.closest('.fd-curator-library-item');select=article&&article.querySelector('[data-curator-library-week]');value=select&&Number(select.value);}
    catch(ignore){value=0;}return Number.isInteger(value)?value:0;
  }
  function setStatus(selector,message){var node;try{node=root.querySelector(selector);if(node)node.textContent=message;}catch(ignore){}}
  function click(event){
    var target=event&&event.target,step=targetAttribute(target,'data-curator-step'),ref,instanceId,direction,preset,sequence,focus;
    target=actionTarget(target,'[data-curator-step],[data-curator-path-include],[data-curator-path-repeat],[data-curator-path-remove],[data-curator-path-move-order],[data-curator-save],[data-curator-review-preview],[data-curator-focus],[data-curator-local-action],[data-curator-local-remove],[data-curator-local-clear]');
    step=targetAttribute(target,'data-curator-step');
    if(step!==null){dispatch({type:'SET_STEP',step:Number(step)});return;}
    ref=targetAttribute(target,'data-curator-path-include');if(ref!==null){dispatch({type:'PATH_INCLUDE',ref:ref,week:targetWeek(target)});return;}
    ref=targetAttribute(target,'data-curator-path-repeat');if(ref!==null){dispatch({type:'PATH_REPEAT',ref:ref,week:targetWeek(target)});return;}
    instanceId=targetAttribute(target,'data-curator-path-remove');if(instanceId!==null){dispatch({type:'PATH_REMOVE',instanceId:instanceId});return;}
    instanceId=targetAttribute(target,'data-curator-path-move-order');if(instanceId!==null){direction=targetAttribute(target,'data-direction');dispatch({type:'PATH_MOVE_ORDER',instanceId:instanceId,direction:direction});return;}
    focus=targetAttribute(target,'data-curator-focus');if(focus!==null){try{var focusNode=root.querySelector('#fd-curator-'+focus);if(focusNode)focusNode.focus();}catch(ignoreFocus){}return;}
    preset=targetAttribute(target,'data-curator-review-preview');if(preset!==null){sequence=transactions.beginPreview();setStatus('[data-curator-preview-status="'+(preset==='desktop'?'desktop':'mobile')+'"]','Rendering exact preview…');fdCuratorPreparePreview(state,canonicalIndex,catalogSnapshot,siteContext,{mode:'builder',generationDate:generationDate},subtleValue(),preset,sequence).then(function(result){var applied,completion,evidenceKey=preset==='desktop'?'desktop':'mobile';if(sequence!==transactions.currentPreview())return;if(!result||!result.ok){setStatus('[data-curator-preview-status="'+evidenceKey+'"]','Preview could not be validated.');return;}try{displayModel=result.displayModel;previewEvidence[evidenceKey]=result;if(!render(true)){previewEvidence[evidenceKey]=null;setStatus('[data-curator-preview-status="'+evidenceKey+'"]','Preview could not be validated.');return;}completion=fdCuratorCompletePreview(result,root,preset,sequence,transactions);if(!completion.ok){previewEvidence[evidenceKey]=null;setStatus('[data-curator-preview-status="'+evidenceKey+'"]','Preview could not be validated.');return;}applied=dispatch({type:'PREVIEW_REVIEW_SUCCEEDED',preset:preset,result:completion,sequence:sequence});if(applied.changed){try{var preview=root.querySelector('[data-curator-preview-layout="'+preset+'"]');if(preview)preview.focus();}catch(ignorePreviewFocus){}}}catch(ignorePreviewRender){previewEvidence[evidenceKey]=null;setStatus('[data-curator-preview-status="'+evidenceKey+'"]','Preview could not be validated.');}});return;}
    var category=targetAttribute(target,'data-curator-local-clear');if(category!==null){var cleared=dispatch({type:'LOCAL_CATEGORY_CLEAR',category:category});if(!cleared.changed&&category==='schedule'){setStatus('[data-curator-local-status]','Remove attendance references before clearing the schedule.');try{root.querySelector('[data-curator-local-status]').focus();}catch(ignoreBlockedFocus){}}return;}
    category=targetAttribute(target,'data-curator-local-remove');if(category!==null){instanceId=targetAttribute(target,'data-instance-id');var removalType={schedule:'SCHEDULE_EVENT_REMOVE',accessItems:'ACCESS_REMOVE',contacts:'CONTACT_REMOVE',checklistItems:'CHECKLIST_REMOVE',resources:'RESOURCE_REMOVE'}[category];var removed=removalType&&dispatch({type:removalType,instanceId:instanceId});if(!removed||!removed.changed){setStatus('[data-curator-local-status]','This schedule event is used by attendance. Remove that attendance reference first.');try{root.querySelector('[data-curator-local-status]').focus();}catch(ignoreRemovalFocus){}}return;}
    var localAction=targetAttribute(target,'data-curator-local-action');if(localAction!==null){
      var card,fields={},controls,controlName,selectedValues,actionValue,actionResult;
      try{card=target.closest('.fd-curator-local-card');controls=card.querySelectorAll('[data-curator-field]');for(var controlIndex=0;controlIndex<controls.length;controlIndex++){controlName=controls[controlIndex].getAttribute('data-curator-field');if(controls[controlIndex].multiple){selectedValues=[];for(var optionIndex=0;optionIndex<controls[controlIndex].options.length;optionIndex++)if(controls[controlIndex].options[optionIndex].selected&&controls[controlIndex].options[optionIndex].value)selectedValues.push(controls[controlIndex].options[optionIndex].value);fields[controlName]=selectedValues;}else fields[controlName]=String(controls[controlIndex].value||'');}}
      catch(ignoreFields){fields={};}
      if(localAction==='arrival'){actionValue={timingCode:fields.timingCode,time:fields.time,placeKey:fields.placeKey,checkInRoleKey:fields.checkInRoleKey};if(fields.linkKey)actionValue.linkKey=fields.linkKey;actionResult=dispatch({type:'ARRIVAL_SET',value:actionValue});}
      else if(localAction==='schedule-bounds')actionResult=dispatch({type:'SCHEDULE_SET_BOUNDS',dayStart:fields.dayStart,dayEnd:fields.dayEnd,endQualifierCode:fields.endQualifierCode});
      else if(localAction==='schedule-event'){actionValue={type:'SCHEDULE_EVENT_ADD',daySetKey:fields.daySetKey,startTime:fields.startTime,activityKey:fields.activityKey,priority:fields.priority};if(fields.endTime)actionValue.endTime=fields.endTime;if(fields.placeKey)actionValue.placeKey=fields.placeKey;actionResult=dispatch(actionValue);}
      else if(localAction==='rounds')actionResult=dispatch({type:'ROUNDS_SET',value:{preparationKey:fields.preparationKey,participationKey:fields.participationKey,followUpKey:fields.followUpKey}});
      else if(localAction==='presentation')actionResult=dispatch({type:'PRESENTATION_SET',value:{formatKey:fields.formatKey,timingKey:fields.timingKey,elementKeys:fields.elementKeys||[]}});
      else if(localAction==='documentation'){actionValue={workflowKey:fields.workflowKey,timingKey:fields.timingKey};if(fields.policyLinkKey)actionValue.policyLinkKey=fields.policyLinkKey;actionResult=dispatch({type:'DOCUMENTATION_SET',value:actionValue});}
      else if(localAction==='attendance'){actionValue={eventInstanceIds:fields.eventInstanceIds||[],absenceRoleKey:fields.absenceRoleKey};if(fields.policyLinkKey)actionValue.policyLinkKey=fields.policyLinkKey;actionResult=dispatch({type:'ATTENDANCE_SET',value:actionValue});}
      else if(localAction==='feedback')actionResult=dispatch({type:'FEEDBACK_SET',value:{cadenceKey:fields.cadenceKey,initiatorKey:fields.initiatorKey,settingKey:fields.settingKey}});
      else if(localAction==='access'){actionValue={type:'ACCESS_ADD',itemKey:fields.itemKey,dueKey:fields.dueKey};if(fields.linkKey)actionValue.linkKey=fields.linkKey;actionResult=dispatch(actionValue);}
      else if(localAction==='contact'){actionValue={type:'CONTACT_ADD',roleKey:fields.roleKey};if(fields.linkKey)actionValue.linkKey=fields.linkKey;actionResult=dispatch(actionValue);}
      else if(localAction==='checklist')actionResult=dispatch({type:'CHECKLIST_ADD',itemKey:fields.itemKey,priority:fields.priority});
      else if(localAction==='resource'){actionValue={type:'RESOURCE_ADD',linkKey:fields.linkKey,priority:fields.priority,week:Number(fields.week)};if(fields.reasonKey)actionValue.reasonKey=fields.reasonKey;actionResult=dispatch(actionValue);}
      if(!actionResult||!actionResult.changed)setStatus('[data-curator-local-status]','Choose a complete eligible set of reviewed options.');return;
    }
    if(targetAttribute(target,'data-curator-save')!==null)setStatus('[data-curator-save-status]',adapter.save(state,canonicalIndex,siteContext)?'Saved on this device.':'Draft could not be saved on this device.');
  }
  function change(event){
    var target=event&&event.target,instanceId,type,file,sequence,field,value,allowed;
    type=targetAttribute(target,'data-curator-row-update');
    if(type!==null){
      instanceId=targetAttribute(target,'data-instance-id');field=targetAttribute(target,'data-curator-update-field');
      allowed={SCHEDULE_EVENT_UPDATE:['daySetKey','startTime','endTime','activityKey','placeKey','priority'],ACCESS_UPDATE:['itemKey','dueKey','linkKey'],CONTACT_UPDATE:['roleKey','linkKey'],CHECKLIST_UPDATE:['itemKey','priority'],RESOURCE_UPDATE:['linkKey','priority','week','reasonKey']};
      if(!allowed[type]||allowed[type].indexOf(field)<0)return;
      try{value=type==='RESOURCE_UPDATE'&&field==='week'?Number(target.value):String(target.value||'');}catch(ignoreRowValue){return;}
      var rowUpdate=dispatch({type:type,instanceId:instanceId,field:field,value:value});if(!rowUpdate.changed)render(true);return;
    }
    if(targetAttribute(target,'data-curator-location')!==null){dispatch({type:'SET_TRAINING_LOCATION',trainingLocationKey:String(target.value||'')});return;}
    if(targetAttribute(target,'data-curator-profile')!==null){dispatch({type:'SET_CURATOR_PROFILE',curatorProfileKey:String(target.value||'')});return;}
    if(targetAttribute(target,'data-curator-phrases')!==null){dispatch({type:'SET_PHRASE_SET',phraseSetKey:String(target.value||'')});return;}
    if(targetAttribute(target,'data-curator-local-preset')!==null){dispatch({type:'LOCAL_APPLY_PRESET',presetKey:String(target.value||'')});return;}
    type=targetAttribute(target,'data-curator-date');if(type!==null){dispatch({type:type,value:String(target.value||'')});return;}
    instanceId=targetAttribute(target,'data-curator-path-priority');if(instanceId!==null){var priorityResult=dispatch({type:'PATH_SET_PRIORITY',instanceId:instanceId,priority:String(target.value||'')});if(!priorityResult.changed)render(true);return;}
    instanceId=targetAttribute(target,'data-curator-path-reason');if(instanceId!==null){var reasonResult=dispatch({type:'PATH_SET_REASON',instanceId:instanceId,reasonKey:String(target.value||'')});if(!reasonResult.changed)render(true);return;}
    instanceId=targetAttribute(target,'data-curator-path-move-week');if(instanceId!==null){dispatch({type:'PATH_MOVE_WEEK',instanceId:instanceId,week:Number(target.value)});return;}
    if(targetAttribute(target,'data-curator-import')!==null){
      try{file=target.files&&target.files[0];}catch(ignoreFiles){file=null;}sequence=transactions.begin();transactions.cancelPreview();
      fdCuratorReadBackupFile(file).then(function(read){
        if(!read.ok)return read;
        return fdCuratorImportText(read.text,canonicalIndex,siteContext,catalogSnapshot,{mode:'builder',generationDate:generationDate},deps.subtle);
      }).then(function(result){
        var applied;if(sequence!==transactions.current())return;
        if(result&&result.ok===true){applied=dispatch({type:'IMPORT_SUCCEEDED',result:result,sequence:sequence});if(applied.changed)setStatus('[data-curator-import-status]',result.code==='CURATOR_IMPORT_SALVAGED'?'Legacy backup safely salvaged; '+result.droppedReferenceCount+' unavailable references were dropped.':'Validated v2 backup imported.');return;}
        dispatch({type:'IMPORT_REJECTED',code:result&&FD_CURATOR_IMPORT_CODES.indexOf(result.code)>=0?result.code:'CURATOR_IMPORT_INVALID',sequence:sequence});
        setStatus('[data-curator-import-status]',result&&result.code==='CURATOR_IMPORT_SIZE'?'Backup must be 64 KiB or smaller.':result&&result.code==='CURATOR_IMPORT_RESELECTION_REQUIRED'?'Backup uses catalog choices that must be reselected.':'Backup could not be validated for this audience.');
      },function(){if(sequence===transactions.current())setStatus('[data-curator-import-status]','Backup could not be validated for this audience.');});
    }
  }
  function input(event){var target=event&&event.target;if(targetAttribute(target,'data-curator-search')!==null){searchQuery=String(target.value||'');render();}}
  if(typeof root.addEventListener==='function'){
    root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('input',input);
  }
  if(loadInvalid)setStatus('[data-curator-import-status]','Saved draft could not be authenticated. A new local draft was opened.');
  else if(loadReimport)setStatus('[data-curator-import-status]','CURATOR_BASE_REIMPORT_REQUIRED');
  return {ok:true,code:'CURATOR_READY',dispatch:dispatch,getState:function(){return fdCuratorClone(state);},
    save:function(){return adapter.save(state,canonicalIndex,siteContext);},transactions:transactions};
  });
}
