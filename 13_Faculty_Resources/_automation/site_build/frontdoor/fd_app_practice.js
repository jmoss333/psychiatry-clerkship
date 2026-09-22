/* Development-only staged practice engine. This file is deliberately not registered with a
   learner build. It accepts caller-owned data and returns caller-owned state or markup. */

var FD_APP_PRACTICE_FORBIDDEN={
  score:true,threshold:true,pass:true,fail:true,passing:true,correct:true,answerkey:true,
  dose:true,dosage:true,freetext:true,textinput:true,proprietaryitem:true,itemtext:true,
  patientname:true,mrn:true,dateofbirth:true,dob:true
};

function fdAppPracticeOwn(value,key){
  return !!value&&Object.prototype.hasOwnProperty.call(value,key);
}

function fdAppPracticeObject(value){
  return !!value&&typeof value==='object'&&!Array.isArray(value);
}

function fdAppPracticeStrings(value,field,allowEmpty){
  if(!Array.isArray(value)||(!allowEmpty&&value.length===0)){
    throw new Error(field+' must be '+(allowEmpty?'an array':'a non-empty array'));
  }
  for(var i=0;i<value.length;i++){
    if(typeof value[i]!=='string'||!value[i]) throw new Error(field+' must contain strings');
  }
}

function fdAppPracticeRejectFields(value,path){
  if(!value||typeof value!=='object') return;
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i++) fdAppPracticeRejectFields(value[i],path+'['+i+']');
    return;
  }
  for(var key in value){
    if(!fdAppPracticeOwn(value,key)) continue;
    var normalized=String(key).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(FD_APP_PRACTICE_FORBIDDEN[normalized]){
      throw new Error('Forbidden field '+key+' at '+path);
    }
    fdAppPracticeRejectFields(value[key],path+'.'+key);
  }
}

function fdAppPracticeValidate(pack){
  if(!fdAppPracticeObject(pack)) throw new Error('Practice pack must be an object');
  fdAppPracticeRejectFields(pack,'pack');
  if(!Array.isArray(pack.stages)||pack.stages.length===0){
    throw new Error('Practice pack needs at least one stage');
  }
  if(typeof pack.id!=='string'||!pack.id) throw new Error('Practice pack id is required');
  if(typeof pack.title!=='string'||!pack.title) throw new Error('Practice pack title is required');
  fdAppPracticeStrings(pack.evidenceRefs,'evidenceRefs',false);
  fdAppPracticeStrings(pack.policyDependencies,'policyDependencies',true);
  if(!fdAppPracticeObject(pack.feedback)) throw new Error('Practice feedback map is required');

  var stageIds={}, choiceIds={};
  for(var i=0;i<pack.stages.length;i++){
    var stage=pack.stages[i];
    if(!fdAppPracticeObject(stage)) throw new Error('Stage '+i+' must be an object');
    if(typeof stage.id!=='string'||!stage.id) throw new Error('Stage '+i+' id is required');
    if(stageIds[stage.id]) throw new Error('Duplicate stage '+stage.id);
    stageIds[stage.id]=true;
    if(typeof stage.detail!=='string'||!stage.detail) throw new Error('Stage '+stage.id+' detail is required');
    if(typeof stage.prompt!=='string'||!stage.prompt) throw new Error('Stage '+stage.id+' prompt is required');
    fdAppPracticeStrings(stage.policyDependencies,'Stage '+stage.id+' policyDependencies',true);
    if(!Array.isArray(stage.choices)||stage.choices.length<2){
      throw new Error('Stage '+stage.id+' needs at least two choices');
    }
    for(var c=0;c<stage.choices.length;c++){
      var choice=stage.choices[c];
      if(!fdAppPracticeObject(choice)) throw new Error('Choice in stage '+stage.id+' must be an object');
      if(typeof choice.id!=='string'||!choice.id) throw new Error('Choice id is required in stage '+stage.id);
      if(choiceIds[choice.id]) throw new Error('Duplicate choice '+choice.id);
      choiceIds[choice.id]=true;
      if(typeof choice.label!=='string'||!choice.label) throw new Error('Choice '+choice.id+' label is required');
      if(typeof choice.feedbackRef!=='string'||!choice.feedbackRef){
        throw new Error('Choice '+choice.id+' feedbackRef is required');
      }
      var feedback=pack.feedback[choice.feedbackRef];
      if(!fdAppPracticeObject(feedback)){
        throw new Error(choice.feedbackRef+' feedback is missing');
      }
      if(typeof feedback.summary!=='string'||!feedback.summary){
        throw new Error(choice.feedbackRef+' feedback summary is required');
      }
      fdAppPracticeStrings(feedback.evidenceRefs,choice.feedbackRef+' evidenceRefs',false);
    }
  }
  return true;
}

function fdAppPracticeStart(pack){
  fdAppPracticeValidate(pack);
  return {
    pack:pack,
    stageIndex:0,
    selections:[],
    lastFeedback:null,
    complete:false
  };
}

function fdAppPracticeAdvance(session,choiceId){
  if(!fdAppPracticeObject(session)||!session.pack) throw new Error('Practice session is required');
  fdAppPracticeValidate(session.pack);
  if(session.complete) throw new Error('Practice sequence is already complete');
  var stage=session.pack.stages[session.stageIndex], selected=null;
  if(!stage) throw new Error('Practice stage is unavailable');
  for(var i=0;i<stage.choices.length;i++){
    if(stage.choices[i].id===choiceId) selected=stage.choices[i];
  }
  if(!selected) throw new Error('Unknown choice '+String(choiceId||''));
  var selections=(session.selections||[]).slice();
  selections.push({stageId:stage.id,choiceId:selected.id});
  var isLast=session.stageIndex===session.pack.stages.length-1;
  return {
    pack:session.pack,
    stageIndex:isLast?session.stageIndex:session.stageIndex+1,
    selections:selections,
    lastFeedback:session.pack.feedback[selected.feedbackRef],
    complete:isLast
  };
}

function fdAppPracticeReset(session){
  if(!session||!session.pack) return null;
  return fdAppPracticeStart(session.pack);
}

function fdAppPracticeEsc(value){
  return String(value===undefined||value===null?'':value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fdAppPracticeRender(session){
  if(!fdAppPracticeObject(session)||!session.pack) return '';
  fdAppPracticeValidate(session.pack);
  var stage=session.pack.stages[session.stageIndex], out='';
  out+='<section class="fd-app-practice" aria-labelledby="fd-app-practice-title">'+
    '<h2 id="fd-app-practice-title">'+fdAppPracticeEsc(session.pack.title)+'</h2>';
  if(session.lastFeedback){
    out+='<div class="fd-app-practice__feedback" role="status">'+
      fdAppPracticeEsc(session.lastFeedback.summary)+'</div>';
  }
  out+='<p class="fd-app-practice__detail">'+fdAppPracticeEsc(stage.detail)+'</p>'+
    '<h3>'+fdAppPracticeEsc(stage.prompt)+'</h3>'+
    '<div class="fd-app-practice__choices">';
  if(!session.complete){
    for(var i=0;i<stage.choices.length;i++){
      out+='<button type="button" data-app-practice-choice="'+fdAppPracticeEsc(stage.choices[i].id)+'">'+
        fdAppPracticeEsc(stage.choices[i].label)+'</button>';
    }
  } else {
    out+='<p>Sequence finished. Choose what to revisit in supervised practice.</p>';
  }
  return out+'</div></section>';
}
