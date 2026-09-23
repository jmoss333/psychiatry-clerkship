/* APP On shift renderer. Pure ES5: canonical pathway structure and the joined resource index in,
   markup out. It owns no storage, routing, clock, analytics, or learner evaluation. */

var FD_APP_BRIDGE_IDS=['pa','pmhnp'];
var FD_APP_REFLECTION_LABELS={
  revisit:'Revisit',
  supervisor:'Discuss with my supervisor',
  another:'Try another case'
};

function fdAppValidBridge(value){
  return value==='pmhnp'?'pmhnp':'pa';
}

function fdAppResolveRefs(index, refs, missing){
  var idx=index||{}, byRef=idx.byRef||{}, list=refs||[], out=[];
  for(var i=0;i<list.length;i++){
    if(byRef[list[i]]) out.push(byRef[list[i]]);
    else {
      var ref=String(list[i]||''), known=false;
      for(var m=0;m<missing.length;m++) if(missing[m]===ref) known=true;
      if(!known) missing.push(ref);
    }
  }
  return out;
}

function fdAppModel(index, pathway, state){
  var p=pathway||{}, bridges=p.bridges||{}, st=state||{}, missing=[];
  var packs=p.practicePacks||[], practicesById={};
  for(var pIndex=0;pIndex<packs.length;pIndex++){
    if(packs[pIndex]&&packs[pIndex].id) practicesById[packs[pIndex].id]=packs[pIndex];
  }
  var bridgeId=fdAppValidBridge(st.appBridge);
  var bridge=bridges[bridgeId]||null;
  if(!bridge){
    return {valid:false,bridgeId:bridgeId,bridge:null,resources:[],activities:[],
      missing:[],message:'The APP pathway could not load. Try reloading.'};
  }
  var activities=[], source=p.activities||[];
  for(var i=0;i<source.length;i++){
    var activity=source[i]||{}, practice=null, practiceError=false;
    try{
      practice=practicesById[activity.practiceId]||null;
      if(!practice) throw new Error('Practice pack unavailable');
      fdAppPracticeValidate(practice);
    }catch(ignorePractice){
      practice=null;
      practiceError=true;
    }
    activities.push({
      id:activity.id||'',
      name:activity.name||'',
      purpose:activity.purpose||'',
      actions:(activity.actions||[]).slice(),
      resources:fdAppResolveRefs(index,activity.refs||[],missing),
      practice:practice,
      practiceError:practiceError
    });
  }
  return {
    valid:true,
    intro:p.intro||'',
    bridgeId:bridgeId,
    bridge:bridge,
    resources:fdAppResolveRefs(index,bridge.refs||[],missing),
    activities:activities,
    missing:missing,
    reflection:st.appReflection||'',
    activityId:st.appActivity||'',
    practiceSession:st.appPractice||null
  };
}

function fdAppResource(item, compact, primary){
  var meta=item.kind==='tool'?'Interactive tool':(item.minutes?fdEsc(item.minutes)+' min read':'Reading');
  return '<button type="button" class="'+(compact?'fd-app__step-link':'fd-app__resource')+'" '+
    'data-fd-app-start="'+fdEsc(item.ref)+'"'+
    (primary?' data-fd-dock-source="primary-app" data-fd-dock-label="'+fdEsc(item.title)+'"':'')+'>'+
    '<span class="fd-app__resource-title">'+fdEsc(item.title)+'</span>'+
    governanceBadge(item.governance,{compact:compact===true})+
    '<span class="fd-app__resource-meta">'+meta+'</span>'+
    '<span class="fd-app__resource-arrow" aria-hidden="true">→</span>'+
    '</button>';
}

function fdAppBridgePicker(pathway, selected){
  var bridges=(pathway&&pathway.bridges)||{}, out='';
  out+='<div class="fd-app__bridge-picker" role="group" aria-label="Starting route">';
  for(var i=0;i<FD_APP_BRIDGE_IDS.length;i++){
    var id=FD_APP_BRIDGE_IDS[i], bridge=bridges[id]||{}, active=id===selected;
    out+='<button type="button" class="fd-app__bridge-choice'+(active?' is-active':'')+'" '+
      'data-fd-app-bridge="'+id+'" aria-pressed="'+(active?'true':'false')+'">'+
      '<span class="fd-app__bridge-name">'+fdEsc(bridge.name||id)+'</span>'+
      '<span class="fd-app__bridge-summary">'+fdEsc(bridge.summary||'')+'</span>'+
      '</button>';
  }
  return out+'</div>';
}

function fdAppReflection(bridge, selected){
  var check=(bridge&&bridge.selfCheck)||{}, actions=check.actions||[], out='';
  out+='<section class="fd-app__reflection" aria-labelledby="fd-app-reflection-title">'+
    '<div><span class="fd-app__kicker">Private reflection</span>'+
    '<h3 id="fd-app-reflection-title">Choose your next step</h3>'+
    '<p>'+fdEsc(check.prompt||'Choose what would help before supervised practice.')+'</p></div>'+
    '<div class="fd-app__reflection-actions" role="group" aria-label="Private next step">';
  for(var i=0;i<actions.length;i++){
    var action=actions[i], active=action===selected;
    out+='<button type="button" class="fd-app__reflection-choice'+(active?' is-active':'')+'" '+
      'data-fd-app-reflect="'+fdEsc(action)+'" aria-pressed="'+(active?'true':'false')+'">'+
      fdEsc(FD_APP_REFLECTION_LABELS[action]||action)+'</button>';
  }
  out+='</div>';
  if(selected){
    out+='<p class="fd-app__private-note" role="status">Saved only for this visit on this device. Nothing is sent or shared.</p>'+
      '<button type="button" class="fd-app__reset" data-fd-app-reset>Reset private reflection</button>';
  } else {
    out+='<p class="fd-app__private-note">Your choice stays in this visit and is not a score.</p>';
  }
  return out+'</section>';
}

function fdAppActivity(activity, selected){
  var resources=activity.resources||[], active=activity.id===selected, out='';
  var rehearsal=null;
  for(var r=0;r<resources.length;r++) if(!rehearsal&&resources[r].kind==='tool') rehearsal=resources[r];
  if(!rehearsal&&resources.length) rehearsal=resources[0];
  out+='<article class="fd-app__task'+(active?' is-active':'')+'">'+
    '<button type="button" class="fd-app__task-head" data-fd-app-shift="'+fdEsc(activity.id)+'" '+
    'aria-pressed="'+(active?'true':'false')+'">'+
    '<span class="fd-app__task-name">'+fdEsc(activity.name)+'</span>'+
    '<span class="fd-app__task-purpose">'+fdEsc(activity.purpose)+'</span>'+
    '<span class="fd-app__task-mark" aria-hidden="true">'+(active?'●':'○')+'</span>'+
    '</button><div class="fd-app__stages">';
  out+='<section class="fd-app__stage"><span class="fd-app__stage-n">1</span>'+
    '<h3>Prepare independently</h3><p>Open a useful canonical resource before the work.</p>'+
    '<div class="fd-app__step-links">';
  for(var i=0;i<resources.length;i++) out+=fdAppResource(resources[i],true,active&&i===0);
  out+='</div></section>';
  out+='<section class="fd-app__stage"><span class="fd-app__stage-n">2</span>'+
    '<h3>Rehearse here</h3><p>Use synthetic practice to prepare a question for supervision.</p>'+
    (rehearsal?fdAppResource(rehearsal,true):'<p class="fd-app__stage-note">No rehearsal resource is available.</p>')+
    (activity.practice?'<button type="button" class="fd-app__practice-open" data-fd-app-practice-open="'+
      fdEsc(activity.practice.id)+'">Practice one change</button>':
      (activity.practiceError?'<p class="fd-app__practice-error" role="alert">Practice unavailable. '+
        'Your preparation resources are still available.</p>':''))+
    '</section>';
  out+='<section class="fd-app__stage"><span class="fd-app__stage-n">3</span>'+
    '<h3>Arrange observation</h3><p>Use your institution\'s approved process to arrange supervised practice and feedback.</p>'+
    '<p class="fd-app__stage-note">This site does not record supervisor observation.</p></section>';
  return out+'</div></article>';
}

/* Keep this name distinct from the fdApp DOM-root variable in spa_index.html. The shell renders
   inside an IIFE where that local binding intentionally shadows globals. */
function fdAppWorkspace(index, pathway, state, captureHtml, offlineHtml){
  var model=fdAppModel(index,pathway,state), out='';
  if(!model.valid){
    return '<div class="fd-fallback" data-fd-fallback="app" role="alert">'+fdEsc(model.message)+'</div>';
  }
  out+='<section class="fd-app" aria-labelledby="fd-app-title">'+
    '<header class="fd-app__intro"><div><span class="fd-app__eyebrow">APP fellowship preview</span>'+
    '<h1 id="fd-app-title">On shift</h1><p>'+fdEsc(model.intro)+'</p></div>'+
    '<p class="fd-app__boundary"><strong>Preparation, not evaluation.</strong> Clinical scope and supervision stay with your institution.</p></header>';
  if(captureHtml)out+=captureHtml;
  out+='<button type="button" class="fd-care-entry" data-fd-tab="care">Patient care resources<span aria-hidden="true">→</span></button>';
  out+=fdAppBridgePicker(pathway,model.bridgeId);
  out+='<section class="fd-app__bridge" aria-labelledby="fd-app-bridge-title">'+
    '<div class="fd-app__bridge-head"><div><span class="fd-app__kicker">Starting route</span>'+
    '<h2 id="fd-app-bridge-title">'+fdEsc(model.bridge.name)+'</h2></div>'+
    '<span class="fd-app__count">8 canonical resources</span></div>'+
    '<p class="fd-app__bridge-copy">'+fdEsc(model.bridge.summary)+'</p>'+
    '<div class="fd-app__resources">';
  var selectedHasResource=false;
  for(var a=0;a<model.activities.length;a++){
    if(model.activities[a].id===model.activityId&&model.activities[a].resources.length) selectedHasResource=true;
  }
  for(var i=0;i<model.resources.length;i++) out+=fdAppResource(model.resources[i],false,!selectedHasResource&&i===0);
  out+='</div>';
  if(offlineHtml&&!selectedHasResource)out+=offlineHtml;
  for(var m=0;m<model.missing.length;m++){
    out+='<p class="fd-app__error" role="alert">Configured resource unavailable: '+fdEsc(model.missing[m])+'</p>';
  }
  out+=fdAppReflection(model.bridge,model.reflection)+'</section>';
  out+='<section class="fd-app__work" aria-labelledby="fd-app-work-title">'+
    '<div class="fd-app__work-head"><span class="fd-app__kicker">Shared practice</span>'+
    '<h2 id="fd-app-work-title">Choose a workplace task</h2>'+
    '<p>Prepare, rehearse, then arrange observation through your local process.</p></div>'+
    '<div class="fd-app__tasks">';
  for(var a=0;a<model.activities.length;a++) out+=fdAppActivity(model.activities[a],model.activityId);
  out+='</div>';
  if(offlineHtml&&selectedHasResource)out+=offlineHtml;
  if(model.practiceSession){
    try{
      out+='<div class="fd-app__practice-host">'+fdAppPracticeRender(model.practiceSession)+'</div>';
    }catch(ignorePractice){
      out+='<p class="fd-app__practice-error" role="alert">Practice unavailable. '+
        'Your preparation resources are still available.</p>';
    }
  }
  return out+'</section></section>';
}
