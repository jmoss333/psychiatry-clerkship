/* Faculty rotation-edition curator shell.
   Task 9 establishes only the audience lock, five-step reducer, and mount boundary.
   Publication intentionally remains unavailable until later tasks add and verify the
   full draft, privacy, preview, and health-gate contracts. */
function fdCuratorInitialState(index,siteContext){
  var path=index&&index.path?index.path:{};
  var context=siteContext||{};
  return {
    step:1,
    site:{
      audience:context.audience||'',
      pathId:path.id||'',
      weekCount:path.weekCount||0,
      coreRevision:context.coreRevision||''
    },
    generateEnabled:false
  };
}

function fdCuratorReduce(state,action){
  var current=state||{step:1,site:{},generateEnabled:false};
  var nextStep=current.step;
  if(action&&action.type==='GO_TO_STEP'&&typeof action.step==='number'&&
     isFinite(action.step)&&Math.floor(action.step)===action.step&&
     action.step>=1&&action.step<=5){
    nextStep=action.step;
  }
  return {step:nextStep,site:current.site,generateEnabled:false};
}

function fdCuratorRender(state,root){
  if(!root||!state) return;
  var audience=root.querySelector('#curatorAudienceLock');
  var path=root.querySelector('#curatorPathLock');
  var editorTitle=root.querySelector('#curatorEditorTitle');
  var status=root.querySelector('#curatorStepStatus');
  var generate=root.querySelector('#curatorGenerate');
  var labels=['Edition','Curriculum','Schedule','Local details','Preview and share'];
  var audienceLabel=state.site.audience==='resident'?'Resident':'MS3';
  if(audience) audience.textContent=audienceLabel+' audience locked';
  if(path) path.textContent=state.site.pathId+' · '+state.site.weekCount+' weeks locked';
  if(editorTitle) editorTitle.textContent=state.step+'. '+labels[state.step-1];
  if(status) status.textContent='Step '+state.step+' of 5: '+labels[state.step-1];
  var buttons=root.querySelectorAll('[data-curator-step]');
  for(var i=0;i<buttons.length;i++){
    var selected=Number(buttons[i].getAttribute('data-curator-step'))===state.step;
    if(selected) buttons[i].setAttribute('aria-current','step');
    else buttons[i].removeAttribute('aria-current');
  }
  if(generate){ generate.disabled=true; generate.setAttribute('aria-disabled','true'); }
}

function fdCuratorMount(root,index,siteContext){
  if(!root) return null;
  var state=fdCuratorInitialState(index,siteContext);
  function dispatch(action){
    state=fdCuratorReduce(state,action);
    fdCuratorRender(state,root);
    return state;
  }
  var buttons=root.querySelectorAll('[data-curator-step]');
  for(var i=0;i<buttons.length;i++){
    buttons[i].addEventListener('click',function(event){
      dispatch({type:'GO_TO_STEP',step:Number(event.currentTarget.getAttribute('data-curator-step'))});
    });
  }
  fdCuratorRender(state,root);
  return {dispatch:dispatch,getState:function(){ return state; }};
}
